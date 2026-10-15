-- Coordinated local preparation: private terms evidence and durable Storage cleanup.
-- No historical acceptance/backfill, Auth import or SQL deletion of Storage objects.
-- Stage before the atomic web release. Keep content guards disabled until v29
-- endpoints/assets have been verified; the deletion queue trigger stays enabled.
create table public.aceptaciones_terminos_web (
  perfil_id bigint not null references public.perfiles(id) on delete cascade,
  version text not null check(version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at timestamptz not null default now(),
  primary key(perfil_id,version)
);
create table public.eliminaciones_storage_web (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NO FK: the task must survive removal of the profile itself.
  perfil_id bigint not null unique check(perfil_id>0),
  status text not null default 'pending' check(status in ('pending','leased','retry')),
  due_at timestamptz not null default (clock_timestamp()+interval '120 seconds'),
  attempts integer not null default 0 check(attempts>=0),
  lease_token uuid,
  lease_until timestamptz,
  last_error text check(char_length(last_error)<=160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((status='leased' and lease_token is not null and lease_until is not null)
    or (status<>'leased' and lease_token is null and lease_until is null))
);
create index eliminaciones_storage_ready_idx on public.eliminaciones_storage_web(due_at,created_at);
alter table public.aceptaciones_terminos_web enable row level security;
alter table public.eliminaciones_storage_web enable row level security;
revoke all on public.aceptaciones_terminos_web,public.eliminaciones_storage_web from public,anon,authenticated;
grant select,insert on public.aceptaciones_terminos_web to service_role;
grant select,insert,update,delete on public.eliminaciones_storage_web to service_role;

create function public.estado_terminos_web(p_actor_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_actor_id is null or p_actor_id<=0 or not exists(select 1 from public.perfiles where id=p_actor_id) then
    raise exception using errcode='22023',message='INVALID_TERMS_ACTOR';
  end if;
  return jsonb_build_object('version','2026-10-15','accepted',exists(
    select 1 from public.aceptaciones_terminos_web where perfil_id=p_actor_id and version='2026-10-15'));
end;
$$;
create function public.aceptar_terminos_web(p_actor_id bigint,p_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_version is distinct from '2026-10-15' then
    raise exception using errcode='22023',message='INVALID_TERMS_VERSION';
  end if;
  perform 1 from public.perfiles where id=p_actor_id and p_actor_id>0 for key share;
  if not found then raise exception using errcode='22023',message='INVALID_TERMS_ACTOR'; end if;
  insert into public.aceptaciones_terminos_web(perfil_id,version) values(p_actor_id,p_version)
    on conflict(perfil_id,version) do nothing;
  return public.estado_terminos_web(p_actor_id);
end;
$$;
create function public.exigir_terminos_web(p_actor_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
  -- Keep a live profile through this SQL transaction; deleting an account cannot
  -- leave a committed new message/ad whose author was checked before deletion.
  perform 1 from public.perfiles where id=p_actor_id for key share;
  if not found or not exists(select 1 from public.aceptaciones_terminos_web
    where perfil_id=p_actor_id and version='2026-10-15') then
    raise exception using errcode='42501',message='TERMS_REQUIRED';
  end if;
end;
$$;
create function public.registrar_usuario_con_terminos_web(p_registro jsonb,p_version text)
returns json language plpgsql security invoker set search_path='' as $$
declare key text; result json; actor_id bigint;
  required_keys text[]:=array['p_email','p_password','p_nombre','p_provincia','p_ciudad','p_barrio','p_instrumento','p_generos','p_disponibilidad','p_referentes','p_bio'];
  allowed_keys text[]:=array['p_email','p_password','p_nombre','p_provincia','p_ciudad','p_barrio','p_instrumento','p_generos','p_disponibilidad','p_referentes','p_bio','p_tipo_cuenta','p_rubro','p_campos_especificos'];
begin
  if p_version is distinct from '2026-10-15' then raise exception using errcode='22023',message='INVALID_TERMS_VERSION'; end if;
  if p_registro is null or jsonb_typeof(p_registro)<>'object' or octet_length(p_registro::text)>32768
    or not(p_registro ?& required_keys) then raise exception using errcode='22023',message='INVALID_REGISTRATION'; end if;
  for key in select jsonb_object_keys(p_registro) loop
    if not(key=any(allowed_keys)) then raise exception using errcode='22023',message='INVALID_REGISTRATION'; end if;
    if key='p_campos_especificos' then
      if jsonb_typeof(p_registro->key) not in ('object','null') then raise exception using errcode='22023',message='INVALID_REGISTRATION'; end if;
    elsif jsonb_typeof(p_registro->key)<>'string' then
      raise exception using errcode='22023',message='INVALID_REGISTRATION';
    end if;
  end loop;
  result:=public.registrar_usuario(p_registro->>'p_email',p_registro->>'p_password',p_registro->>'p_nombre',
    p_registro->>'p_provincia',p_registro->>'p_ciudad',p_registro->>'p_barrio',p_registro->>'p_instrumento',
    p_registro->>'p_generos',p_registro->>'p_disponibilidad',p_registro->>'p_referentes',p_registro->>'p_bio',
    coalesce(p_registro->>'p_tipo_cuenta','artista'),coalesce(p_registro->>'p_rubro','musica'),nullif(p_registro->'p_campos_especificos','null'::jsonb));
  if result->>'error' is not null then return result; end if;
  if result is null or jsonb_typeof(result::jsonb->'id') is null or jsonb_typeof(result::jsonb->'id') not in ('number','string')
    or (result->>'id') !~ '^[1-9][0-9]{0,18}$' then
    raise exception using errcode='22023',message='REGISTRATION_UNCONFIRMED';
  end if;
  actor_id:=(result->>'id')::bigint;
  perform public.aceptar_terminos_web(actor_id,p_version);
  return result;
end;
$$;

create function public.terminos_guardar_mensaje_web()
returns trigger language plpgsql security invoker set search_path='' as $$
begin perform public.exigir_terminos_web(new.de_user_id); return new; end;
$$;
create trigger terminos_mensaje_insert before insert on public.mensajes
  for each row execute function public.terminos_guardar_mensaje_web();

create function public.terminos_guardar_perfil_web()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from jsonb_each(to_jsonb(new)) as field where field.key=any(array[
    'nombre','foto_url','bio','provincia','ciudad','barrio','instrumento','generos','referentes','disponibilidad',
    'donde_ensaya','redes','videos','celular','experiencia','edad','genero_principal','tipo_cuenta','rubro','campos_especificos','disciplinas'])
    and field.value is distinct from to_jsonb(old)->field.key) then perform public.exigir_terminos_web(new.id); end if;
  return new;
end;
$$;
create trigger terminos_perfil_update before update of nombre,foto_url,bio,provincia,ciudad,barrio,instrumento,generos,referentes,disponibilidad,
  donde_ensaya,redes,videos,celular,experiencia,edad,genero_principal,tipo_cuenta,rubro,campos_especificos,disciplinas on public.perfiles
  for each row execute function public.terminos_guardar_perfil_web();

create function public.terminos_guardar_anuncio_web()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then perform public.exigir_terminos_web(new.user_id);
  elsif exists(select 1 from jsonb_each(to_jsonb(new)) as field where not(field.key=any(array[
    'id','created_at','updated_at','estado','vistas','oculto','oculto_at','vencido_at']))
    and field.value is distinct from to_jsonb(old)->field.key) then perform public.exigir_terminos_web(new.user_id); end if;
  return new;
end;
$$;
create trigger terminos_anuncio_write before insert or update on public.anuncios
  for each row execute function public.terminos_guardar_anuncio_web();

create function public.encolar_eliminacion_storage_web()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.eliminaciones_storage_web(perfil_id) values(old.id) on conflict(perfil_id) do nothing;
  return old;
end;
$$;
create trigger almacenamiento_eliminacion_perfil before delete on public.perfiles
  for each row execute function public.encolar_eliminacion_storage_web();

create function public.solicitar_eliminacion_web(p_actor_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result json; job_id uuid;
begin
  if p_actor_id is null or p_actor_id<=0 then raise exception using errcode='22023',message='INVALID_DELETION_ACTOR'; end if;
  perform 1 from public.perfiles where id=p_actor_id for update;
  if not found then
    select id into job_id from public.eliminaciones_storage_web where perfil_id=p_actor_id;
    if job_id is null then raise exception using errcode='22023',message='INVALID_DELETION_ACTOR'; end if;
    return jsonb_build_object('ok',true,'job_id',job_id,'storage_pending',true);
  end if;
  -- Preserve the current integer-signature legacy routine, including its cleanup
  -- of ads, sessions and owned history. Never coerce a larger bigint silently.
  if p_actor_id>2147483647 then raise exception using errcode='22023',message='DELETION_LEGACY_ID_RANGE'; end if;
  result:=public.eliminar_cuenta(p_actor_id::integer);
  if result->>'ok' is distinct from 'true' then raise exception using errcode='P0001',message='DELETION_FAILED'; end if;
  select id into job_id from public.eliminaciones_storage_web where perfil_id=p_actor_id;
  if job_id is null or exists(select 1 from public.perfiles where id=p_actor_id) then
    raise exception using errcode='P0001',message='DELETION_UNCONFIRMED';
  end if;
  return jsonb_build_object('ok',true,'job_id',job_id,'storage_pending',true);
end;
$$;
create function public.claim_eliminacion_web(p_job_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.eliminaciones_storage_web; at_time timestamptz:=clock_timestamp();
begin
  select * into job from public.eliminaciones_storage_web as candidate
    where (p_job_id is null or candidate.id=p_job_id) and candidate.due_at<=at_time
      and (candidate.status in ('pending','retry') or (candidate.status='leased' and candidate.lease_until<=at_time))
      and not exists(select 1 from public.perfiles where id=candidate.perfil_id)
    order by candidate.due_at,candidate.created_at,candidate.id for update skip locked limit 1;
  if job.id is null then return null; end if;
  update public.eliminaciones_storage_web set status='leased',lease_token=gen_random_uuid(),
    lease_until=at_time+interval '90 seconds',attempts=attempts+1,updated_at=at_time
    where id=job.id returning * into job;
  return to_jsonb(job);
end;
$$;
create function public.finalizar_eliminacion_web(p_job_id uuid,p_lease uuid,p_done boolean,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.eliminaciones_storage_web; at_time timestamptz:=clock_timestamp();
begin
  if p_done is null then raise exception using errcode='22023',message='INVALID_DELETION_RESULT'; end if;
  select * into job from public.eliminaciones_storage_web where id=p_job_id for update;
  if job.id is null or job.status<>'leased' or job.lease_token is distinct from p_lease or job.lease_until<=at_time
    or exists(select 1 from public.perfiles where id=job.perfil_id) then return false; end if;
  if p_done then
    delete from public.eliminaciones_storage_web where id=p_job_id;
  else
    update public.eliminaciones_storage_web set status='retry',lease_token=null,lease_until=null,last_error=left(p_error,160),
      due_at=at_time+make_interval(secs=>least(3600,30*power(2,least(job.attempts,7)))::double precision),updated_at=at_time
      where id=p_job_id;
  end if;
  return true;
end;
$$;

revoke all on function public.estado_terminos_web(bigint),public.aceptar_terminos_web(bigint,text),public.exigir_terminos_web(bigint),
  public.registrar_usuario_con_terminos_web(jsonb,text),public.terminos_guardar_mensaje_web(),public.terminos_guardar_perfil_web(),
  public.terminos_guardar_anuncio_web(),public.encolar_eliminacion_storage_web(),public.solicitar_eliminacion_web(bigint),
  public.claim_eliminacion_web(uuid),public.finalizar_eliminacion_web(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.estado_terminos_web(bigint),public.aceptar_terminos_web(bigint,text),public.exigir_terminos_web(bigint),
  public.registrar_usuario_con_terminos_web(jsonb,text),public.terminos_guardar_mensaje_web(),public.terminos_guardar_perfil_web(),
  public.terminos_guardar_anuncio_web(),public.encolar_eliminacion_storage_web(),public.solicitar_eliminacion_web(bigint),
  public.claim_eliminacion_web(uuid),public.finalizar_eliminacion_web(uuid,uuid,boolean,text) to service_role;

alter table public.mensajes disable trigger terminos_mensaje_insert;
alter table public.perfiles disable trigger terminos_perfil_update;
alter table public.anuncios disable trigger terminos_anuncio_write;
