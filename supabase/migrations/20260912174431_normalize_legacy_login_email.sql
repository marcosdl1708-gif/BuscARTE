-- Correct only legacy email normalization; does not activate Supabase Auth.
-- Execute this reviewed patch atomically. Do not db push this folder as a full schema baseline.
DO $email_fix$
DECLARE
  old_rows jsonb;
  old_privileges jsonb;
  changed_count integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '20s', true);
  LOCK TABLE public.perfiles IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT md5(pg_get_functiondef('public.login_usuario(text,text)'::regprocedure))) <> '2ed838d4dd006e53557cca1b6fe88ef5'
     OR (SELECT md5(pg_get_functiondef('public.registrar_usuario(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure))) <> '82c6ec4e0d85099a2641ec063a5305a4' THEN
    RAISE EXCEPTION 'RPC baseline changed; review before applying email fix';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfiles WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Email normalization collision; no changes applied';
  END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO old_rows
    FROM public.perfiles p WHERE email <> lower(btrim(email));
  IF jsonb_array_length(COALESCE(old_rows, '[]'::jsonb)) <> 4 THEN
    RAISE EXCEPTION 'Affected email set changed; review before applying';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl,'owner',proowner,'definer',prosecdef,'config',proconfig) ORDER BY oid)
    INTO old_privileges FROM pg_proc WHERE oid IN ('public.login_usuario(text,text)'::regprocedure,'public.registrar_usuario(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure);

  -- SQL comparison remains index-backed by the existing UNIQUE(email).
  UPDATE public.perfiles SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 4 THEN RAISE EXCEPTION 'Unexpected email update count'; END IF;

  EXECUTE $login_definition$
CREATE OR REPLACE FUNCTION public.login_usuario(p_email text, p_password text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  usuario perfiles%ROWTYPE;
BEGIN
  -- Canonical email matches the existing web login and password recovery.
  p_email := lower(btrim(p_email));
  SELECT * INTO usuario FROM perfiles
  WHERE email = p_email AND password = crypt(p_password, password);

  IF usuario.id IS NULL THEN
    RETURN json_build_object('error', 'Email o contraseña incorrectos');
  END IF;

  RETURN json_build_object(
    'id',          usuario.id,
    'nombre',      usuario.nombre,
    'email',       usuario.email,
    'referentes',  usuario.referentes,
    'generos',     usuario.generos,
    'tipo_cuenta', usuario.tipo_cuenta,
    'rubro',       usuario.rubro,
    'baneado',     usuario.baneado
  );
END;
$function$
$login_definition$;
  EXECUTE $registration_definition$
CREATE OR REPLACE FUNCTION public.registrar_usuario(p_email text, p_password text, p_nombre text, p_provincia text, p_ciudad text, p_barrio text, p_instrumento text, p_generos text, p_disponibilidad text, p_referentes text, p_bio text, p_tipo_cuenta text DEFAULT 'artista'::text, p_rubro text DEFAULT 'musica'::text, p_campos_especificos jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  nuevo_id bigint;
BEGIN
  -- Canonical email matches the existing web login and password recovery.
  p_email := lower(btrim(p_email));
  IF EXISTS (SELECT 1 FROM perfiles WHERE email = p_email) THEN
    RETURN json_build_object('error', 'duplicate_email');
  END IF;

  INSERT INTO perfiles (
    email, password, nombre, provincia, ciudad, barrio,
    instrumento, generos, disponibilidad, referentes, bio,
    tipo_cuenta, rubro, campos_especificos
  )
  VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_nombre, p_provincia, p_ciudad, p_barrio,
    p_instrumento, p_generos, p_disponibilidad, p_referentes, p_bio,
    COALESCE(p_tipo_cuenta, 'artista'),
    COALESCE(p_rubro, 'musica'),
    p_campos_especificos
  )
  RETURNING id INTO nuevo_id;

  RETURN json_build_object('id', nuevo_id, 'nombre', p_nombre, 'email', p_email);
END;
$function$
$registration_definition$;

  -- Compare entire affected rows except email; password hashes/tokens/IDs never leave DB.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(old_rows) old
    LEFT JOIN public.perfiles p ON p.id = (old->>'id')::bigint
    WHERE p.id IS NULL OR (to_jsonb(p) - 'email') IS DISTINCT FROM (old - 'email')
      OR p.email IS DISTINCT FROM lower(btrim(old->>'email'))
  ) THEN RAISE EXCEPTION 'Non-email profile data changed; rolling back'; END IF;
  IF old_privileges IS DISTINCT FROM (
    SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl,'owner',proowner,'definer',prosecdef,'config',proconfig) ORDER BY oid)
    FROM pg_proc WHERE oid IN ('public.login_usuario(text,text)'::regprocedure,'public.registrar_usuario(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure)
  ) THEN RAISE EXCEPTION 'RPC privileges changed; rolling back'; END IF;
END;
$email_fix$;
