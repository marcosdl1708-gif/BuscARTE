-- Run only after the coordinated v29 web/functions release is verified.
-- Do not infer acceptance or backfill accounts. These guards enforce the same
-- explicit consent already required by the new server API.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('public.estado_terminos_web(bigint)') is null
    or to_regprocedure('public.aceptar_terminos_web(bigint,text)') is null then
    raise exception 'TERMS_PREPARATION_REQUIRED';
  end if;
end;
$$;

alter table public.mensajes enable trigger terminos_mensaje_insert;
alter table public.perfiles enable trigger terminos_perfil_update;
alter table public.anuncios enable trigger terminos_anuncio_write;
