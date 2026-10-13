-- Additive preparation: no legacy permissions or existing accounts are changed.
create table public.sesiones_web (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  perfil_id bigint not null references public.perfiles(id) on delete cascade,
  password_fingerprint text not null check (password_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at)
);
create index sesiones_web_perfil_idx on public.sesiones_web(perfil_id);
create index sesiones_web_expiry_idx on public.sesiones_web(expires_at);
alter table public.sesiones_web enable row level security;
revoke all on public.sesiones_web from public, anon, authenticated;
grant select, insert, update, delete on public.sesiones_web to service_role;

create table public.limites_web (
  scope text not null check (length(scope) between 1 and 80),
  actor_hash text not null check (actor_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  primary key (scope, actor_hash, window_start)
);
create index limites_web_cleanup_idx on public.limites_web(window_start);
alter table public.limites_web enable row level security;
revoke all on public.limites_web from public, anon, authenticated;
grant select, insert, update, delete on public.limites_web to service_role;

create function public.limitar_operacion_web(p_scope text, p_actor_hash text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare window_at timestamptz; attempts_count integer;
begin
  if p_scope !~ '^[a-z_-]{1,80}$' or p_actor_hash !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 180 or p_seconds not between 60 and 3600 then
    raise exception 'invalid rate limit';
  end if;
  window_at := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into public.limites_web as limits (scope,actor_hash,window_start,attempts)
  values(p_scope,p_actor_hash,window_at,1)
  on conflict(scope,actor_hash,window_start) do update set attempts=limits.attempts+1
  returning attempts into attempts_count;
  delete from public.limites_web where window_start < now() - interval '2 days';
  delete from public.sesiones_web where expires_at < now();
  return attempts_count <= p_limit;
end;
$$;
revoke all on function public.limitar_operacion_web(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.limitar_operacion_web(text,text,integer,integer) to service_role;

create unique index perfiles_reset_token_unique on public.perfiles(reset_token) where reset_token is not null;
create function public.consumir_reset_password(p_token_hash text,p_nueva_password text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed bigint;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or char_length(p_nueva_password)<8 or octet_length(p_nueva_password)>72 then return false; end if;
  -- One UPDATE consumes the token under the row lock: concurrent replay loses.
  update public.perfiles set password=extensions.crypt(p_nueva_password,extensions.gen_salt('bf')),
    reset_token=null,reset_expires=null
  where reset_token=p_token_hash and reset_expires>now() and coalesce(baneado,false)=false
  returning id into changed;
  if changed is not null then delete from public.sesiones_web where perfil_id=changed; end if;
  return changed is not null;
end;
$$;
revoke all on function public.consumir_reset_password(text,text) from public,anon,authenticated;
grant execute on function public.consumir_reset_password(text,text) to service_role;

create function public.registrar_vista_anuncio(p_anuncio_id bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed bigint;
begin
  update public.anuncios set vistas=coalesce(vistas,0)+1 where id=p_anuncio_id and oculto=false returning id into changed;
  return changed is not null;
end;
$$;
revoke all on function public.registrar_vista_anuncio(bigint) from public,anon,authenticated;
grant execute on function public.registrar_vista_anuncio(bigint) to service_role;
