-- Additive user safety only. Reviewed independently of the historical Auth archive.
-- Execute through the verified server role, never directly from a browser.
create table public.bloqueos_usuarios (
  actor_id bigint not null references public.perfiles(id) on delete cascade,
  otro_id bigint not null references public.perfiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(actor_id,otro_id),
  check(actor_id>0 and otro_id>0 and actor_id<>otro_id)
);
create index bloqueos_usuarios_otro_idx on public.bloqueos_usuarios(otro_id,actor_id);

create table public.reportes_usuarios (
  id bigint generated always as identity primary key,
  actor_id bigint not null references public.perfiles(id) on delete cascade,
  otro_id bigint not null references public.perfiles(id) on delete cascade,
  conversacion_id bigint references public.conversaciones(id) on delete set null,
  -- Immutable request context retains idempotency after the conversation is deleted.
  request_conversacion_id bigint,
  reason text not null check(reason in ('abuso','spam','suplantacion','contenido','seguridad_infantil','otro')),
  detail text not null default '' check(char_length(detail)<=2000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(actor_id,request_id),
  check(actor_id>0 and otro_id>0 and actor_id<>otro_id)
);
create index reportes_usuarios_otro_idx on public.reportes_usuarios(otro_id,created_at desc);
create index reportes_usuarios_conversacion_idx on public.reportes_usuarios(conversacion_id)
  where conversacion_id is not null;

alter table public.bloqueos_usuarios enable row level security;
alter table public.reportes_usuarios enable row level security;
revoke all on public.bloqueos_usuarios,public.reportes_usuarios from public,anon,authenticated;
revoke all on sequence public.reportes_usuarios_id_seq from public,anon,authenticated;
grant select,insert,delete on public.bloqueos_usuarios to service_role;
grant select,insert on public.reportes_usuarios to service_role;
grant usage on sequence public.reportes_usuarios_id_seq to service_role;

create function public.moderacion_validar_par(p_actor_id bigint,p_otro_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_actor_id is null or p_otro_id is null or p_actor_id<=0 or p_otro_id<=0 or p_actor_id=p_otro_id then
    raise exception using errcode='22023',message='INVALID_MODERATION_PAIR';
  end if;
  if not exists(select 1 from public.perfiles where id=p_actor_id)
    or not exists(select 1 from public.perfiles where id=p_otro_id) then
    raise exception using errcode='22023',message='INVALID_MODERATION_PAIR';
  end if;
end;
$$;

create function public.moderacion_lock_par(p_actor_id bigint,p_otro_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
  -- PostgREST defaults to READ COMMITTED. An older repeatable snapshot must not
  -- miss a block committed while this transaction was waiting for the pair lock.
  if pg_catalog.current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception using errcode='40001',message='MODERATION_REQUIRES_READ_COMMITTED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'buscarte:communication:v1:'||least(p_actor_id,p_otro_id)::text||':'||greatest(p_actor_id,p_otro_id)::text,0));
end;
$$;

create function public.estado_bloqueo_web(p_actor_id bigint,p_otro_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare by_me boolean; restricted boolean;
begin
  perform public.moderacion_validar_par(p_actor_id,p_otro_id);
  perform public.moderacion_lock_par(p_actor_id,p_otro_id);
  select coalesce(bool_or(actor_id=p_actor_id),false),count(*)>0 into by_me,restricted
  from public.bloqueos_usuarios
  where (actor_id=p_actor_id and otro_id=p_otro_id) or (actor_id=p_otro_id and otro_id=p_actor_id);
  return jsonb_build_object('blocked_by_me',by_me,'restricted',restricted);
end;
$$;

create function public.moderacion_guardar_bloqueo()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform public.moderacion_lock_par(old.actor_id,old.otro_id);
    return old;
  end if;
  perform public.moderacion_lock_par(new.actor_id,new.otro_id);
  return new;
end;
$$;
create trigger moderacion_bloqueo_lock before insert or delete on public.bloqueos_usuarios
  for each row execute function public.moderacion_guardar_bloqueo();

create function public.moderacion_cancelar_mensajes()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Cancel queued/leased notifications only. Persisted chat history stays intact.
  -- The dispatcher must additionally revalidate before its external send: a job
  -- can be enqueued after this transaction or already be in external flight.
  update public.email_outbox as job set status='cancelled',last_error='communication_blocked',
    lease_token=null,lease_until=null,updated_at=clock_timestamp()
  where job.tipo='mensaje' and job.status in ('pending','retry','leased')
    and exists(select 1 from public.mensajes as message
      where job.event_key='message:'||message.id::text
        and ((message.de_user_id=new.actor_id and message.para_user_id=new.otro_id)
          or (message.de_user_id=new.otro_id and message.para_user_id=new.actor_id)));
  return new;
end;
$$;
create trigger moderacion_bloqueo_cancelar after insert on public.bloqueos_usuarios
  for each row execute function public.moderacion_cancelar_mensajes();

create function public.gestionar_bloqueo_web(p_actor_id bigint,p_otro_id bigint,p_bloquear boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform public.moderacion_validar_par(p_actor_id,p_otro_id);
  if p_bloquear is null then raise exception using errcode='22023',message='INVALID_BLOCK_ACTION'; end if;
  perform public.moderacion_lock_par(p_actor_id,p_otro_id);
  if p_bloquear then
    insert into public.bloqueos_usuarios(actor_id,otro_id) values(p_actor_id,p_otro_id)
      on conflict(actor_id,otro_id) do nothing;
  else
    delete from public.bloqueos_usuarios where actor_id=p_actor_id and otro_id=p_otro_id;
  end if;
  return public.estado_bloqueo_web(p_actor_id,p_otro_id);
end;
$$;

create function public.moderacion_permitir_mensaje()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform public.moderacion_validar_par(new.de_user_id,new.para_user_id);
  perform public.moderacion_lock_par(new.de_user_id,new.para_user_id);
  if exists(select 1 from public.bloqueos_usuarios
    where (actor_id=new.de_user_id and otro_id=new.para_user_id)
      or (actor_id=new.para_user_id and otro_id=new.de_user_id)) then
    raise exception using errcode='42501',message='COMMUNICATION_BLOCKED';
  end if;
  return new;
end;
$$;
create trigger moderacion_mensaje_insert before insert on public.mensajes
  for each row execute function public.moderacion_permitir_mensaje();

create function public.moderacion_permitir_conversacion()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.user1_id is distinct from old.user1_id or new.user2_id is distinct from old.user2_id then
      raise exception using errcode='42501',message='CONVERSATION_PARTICIPANTS_IMMUTABLE';
    end if;
    if new.ultimo_mensaje is not distinct from old.ultimo_mensaje and new.updated_at is not distinct from old.updated_at then
      return new;
    end if;
  end if;
  perform public.moderacion_validar_par(new.user1_id,new.user2_id);
  perform public.moderacion_lock_par(new.user1_id,new.user2_id);
  if exists(select 1 from public.bloqueos_usuarios
    where (actor_id=new.user1_id and otro_id=new.user2_id)
      or (actor_id=new.user2_id and otro_id=new.user1_id)) then
    raise exception using errcode='42501',message='COMMUNICATION_BLOCKED';
  end if;
  return new;
end;
$$;
create trigger moderacion_conversacion_insert before insert on public.conversaciones
  for each row execute function public.moderacion_permitir_conversacion();
create trigger moderacion_conversacion_preview before update of user1_id,user2_id,ultimo_mensaje,updated_at on public.conversaciones
  for each row execute function public.moderacion_permitir_conversacion();

create function public.reportar_usuario_web(p_actor_id bigint,p_otro_id bigint,p_conversacion_id bigint,p_reason text,p_detail text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.reportes_usuarios; clean_detail text:=btrim(coalesce(p_detail,'')); report_id bigint;
begin
  perform public.moderacion_validar_par(p_actor_id,p_otro_id);
  if p_request_id is null or p_reason is null or p_reason not in ('abuso','spam','suplantacion','contenido','seguridad_infantil','otro')
    or char_length(clean_detail)>2000 then
    raise exception using errcode='22023',message='INVALID_REPORT';
  end if;
  -- Serialize concurrent retries with the same actor/request, without blocking
  -- unrelated reports. A changed target/context/content cannot reuse a request.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'buscarte:report:v1:'||p_actor_id::text||':'||p_request_id::text,0));
  select * into previous from public.reportes_usuarios where actor_id=p_actor_id and request_id=p_request_id;
  if previous.id is not null then
    if previous.otro_id<>p_otro_id or previous.request_conversacion_id is distinct from p_conversacion_id
      or previous.reason<>p_reason or previous.detail<>clean_detail then
      raise exception using errcode='22023',message='REPORT_REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'id',previous.id);
  end if;
  if p_conversacion_id is not null then
    -- FK alone proves existence, never ownership. The exact pair is mandatory.
    perform 1 from public.conversaciones where id=p_conversacion_id
      and ((user1_id=p_actor_id and user2_id=p_otro_id) or (user1_id=p_otro_id and user2_id=p_actor_id))
      for key share;
    if not found then raise exception using errcode='42501',message='REPORT_CONTEXT_FORBIDDEN'; end if;
  end if;
  insert into public.reportes_usuarios(actor_id,otro_id,conversacion_id,request_conversacion_id,reason,detail,request_id)
    values(p_actor_id,p_otro_id,p_conversacion_id,p_conversacion_id,p_reason,clean_detail,p_request_id)
    returning id into report_id;
  return jsonb_build_object('ok',true,'id',report_id);
end;
$$;

revoke all on function public.moderacion_validar_par(bigint,bigint),public.moderacion_lock_par(bigint,bigint),
  public.estado_bloqueo_web(bigint,bigint),public.gestionar_bloqueo_web(bigint,bigint,boolean),
  public.reportar_usuario_web(bigint,bigint,bigint,text,text,uuid),public.moderacion_guardar_bloqueo(),
  public.moderacion_cancelar_mensajes(),public.moderacion_permitir_mensaje(),public.moderacion_permitir_conversacion()
  from public,anon,authenticated;
grant execute on function public.moderacion_validar_par(bigint,bigint),public.moderacion_lock_par(bigint,bigint),
  public.estado_bloqueo_web(bigint,bigint),public.gestionar_bloqueo_web(bigint,bigint,boolean),
  public.reportar_usuario_web(bigint,bigint,bigint,text,text,uuid),public.moderacion_guardar_bloqueo(),
  public.moderacion_cancelar_mensajes(),public.moderacion_permitir_mensaje(),public.moderacion_permitir_conversacion()
  to service_role;
