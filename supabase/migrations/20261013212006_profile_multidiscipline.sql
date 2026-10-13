-- Additive only. Apply before the coordinated multidiscipline frontend/backend.
-- No backfill, role changes, Auth import, private grants or historical ad changes.
alter table public.perfiles add column if not exists disciplinas jsonb;
alter table public.perfiles add column if not exists perfil_revision bigint not null default 0;

create or replace function public.validar_disciplinas_profile(p_data jsonb,p_principal text,p_tipo text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_selected jsonb; v_details jsonb; v_key text; v_item jsonb; v_field text;
  v_allowed text[] := array['musica','actuacion','audiovisual','modelaje','diseno','tatuaje','danza','maquillaje','circo','escritura'];
  v_fields text[] := array['instrumento','generos','referentes','disponibilidad','donde_ensaya','experiencia','campos_especificos'];
begin
  if p_data is null then return true; end if;
  -- JSONB::text includes extra whitespace; server compact payload is <=64KiB.
  if p_tipo is distinct from 'artista' or pg_catalog.jsonb_typeof(p_data) <> 'object'
    or p_data->'version' is distinct from '1'::jsonb or pg_catalog.octet_length(p_data::text)>98304
    or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_data)) <> 3
    or not (p_data ?& array['version','selected','details']) then return false; end if;
  v_selected := p_data->'selected'; v_details := p_data->'details';
  if pg_catalog.jsonb_typeof(v_selected) <> 'array' or pg_catalog.jsonb_typeof(v_details) <> 'object' then return false; end if;
  if pg_catalog.jsonb_array_length(v_selected) not between 1 and 10
    or not (v_selected @> pg_catalog.jsonb_build_array(p_principal)) then return false; end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_selected) x
    where pg_catalog.jsonb_typeof(x)<>'string' or not ((x#>>'{}')=any(v_allowed))) then return false; end if;
  if (select pg_catalog.count(distinct x) from pg_catalog.jsonb_array_elements(v_selected) x)
      <> pg_catalog.jsonb_array_length(v_selected)
    or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_details)) <> pg_catalog.jsonb_array_length(v_selected) then return false; end if;
  for v_key in select pg_catalog.jsonb_object_keys(v_details) loop
    if not (v_selected @> pg_catalog.jsonb_build_array(v_key)) then return false; end if;
    v_item := v_details->v_key;
    if pg_catalog.jsonb_typeof(v_item)<>'object' or not (v_item ?& v_fields)
      or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_item))<>7 then return false; end if;
    foreach v_field in array array['instrumento','generos','referentes','disponibilidad','donde_ensaya'] loop
      if pg_catalog.jsonb_typeof(v_item->v_field) not in ('string','null') then return false; end if;
      if pg_catalog.char_length(v_item->>v_field)>(case v_field when 'referentes' then 4000 when 'donde_ensaya' then 1000 else 2000 end) then return false; end if;
    end loop;
    if pg_catalog.jsonb_typeof(v_item->'experiencia') not in ('number','null') then return false; end if;
    if pg_catalog.jsonb_typeof(v_item->'experiencia')='number'
      and (v_item->>'experiencia') !~ '^(0|[1-9][0-9]?|100)$' then return false; end if;
    if pg_catalog.jsonb_typeof(v_item->'campos_especificos') not in ('object','null')
      or pg_catalog.octet_length((v_item->'campos_especificos')::text)>24576 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.validar_disciplinas_profile(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.validar_disciplinas_profile(jsonb,text,text) to service_role;

do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.perfiles'::regclass and conname='perfiles_disciplinas_validas') then
    alter table public.perfiles add constraint perfiles_disciplinas_validas check (public.validar_disciplinas_profile(disciplinas,rubro,tipo_cuenta));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.perfiles'::regclass and conname='perfiles_disciplinas_principal_coherente') then
    alter table public.perfiles add constraint perfiles_disciplinas_principal_coherente check (disciplinas is null or
      disciplinas->'details'->rubro = pg_catalog.jsonb_build_object('instrumento',instrumento,'generos',generos,
        'referentes',referentes,'disponibilidad',disponibilidad,'donde_ensaya',donde_ensaya,
        'experiencia',experiencia,'campos_especificos',campos_especificos));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.perfiles'::regclass and conname='perfiles_revision_segura') then
    alter table public.perfiles add constraint perfiles_revision_segura check (perfil_revision between 0 and 9007199254740991);
  end if;
end $$;

-- Matches the gateway's disciplinas->selected.cs.["rubro"] containment.
create index if not exists perfiles_disciplinas_selected_gin on public.perfiles using gin ((disciplinas->'selected') jsonb_path_ops);
create index if not exists perfiles_rubro_legacy_idx on public.perfiles(rubro) where disciplinas is null;
-- Professional fields only: no additional anonymous mutation/private access.
grant select(disciplinas,perfil_revision) on public.perfiles to anon,authenticated;
notify pgrst,'reload schema';
