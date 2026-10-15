-- Additive mail queue only. No profile/Auth rewrite and no implicit marketing consent.
-- Apply only this reviewed migration; this archive is not a complete baseline.
create table public.email_outbox (
  id uuid primary key,
  event_key text not null unique check (length(event_key) between 1 and 240),
  tipo text not null check (tipo in ('bienvenida','mensaje','contacto','reporte','reset','perfil_incompleto','resumen_mensual','novedades','reactivacion')),
  perfil_id bigint references public.perfiles(id) on delete cascade check (perfil_id is null or perfil_id>0),
  recipient text not null check (recipient=lower(btrim(recipient)) and length(recipient) between 3 and 160 and recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object' and octet_length(data::text)<=24000),
  category text not null check (category in ('transactional','engagement')),
  priority integer not null check (priority between 0 and 100),
  due_at timestamptz not null,
  expires_at timestamptz not null check (expires_at>due_at),
  status text not null default 'pending' check (status in ('pending','leased','retry','sent','failed','cancelled','uncertain')),
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  attempts integer not null default 0 check (attempts>=0),
  resend_id text,
  last_error text,
  payload_hash text check (payload_hash ~ '^[a-f0-9]{64}$'),
  rendered_payload jsonb check (rendered_payload is null or (tipo<>'reset' and jsonb_typeof(rendered_payload)='object' and octet_length(rendered_payload::text)<=120000)),
  reset_prepared_at timestamptz,
  clicked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((category='engagement')=(tipo in ('perfil_incompleto','resumen_mensual','novedades','reactivacion'))),
  check ((status='leased' and lease_token is not null and lease_until is not null) or (status<>'leased' and lease_token is null and lease_until is null)),
  -- Recovery tokens are derived in the server at dispatch, never persisted in the job.
  check (data::text !~* '"(password|reset_token|reset_url|token|authorization|cookie|link)"[[:space:]]*:')
);
create index email_outbox_ready_idx on public.email_outbox(priority,due_at,created_at) where status in ('pending','retry','leased');
create index email_outbox_profile_idx on public.email_outbox(perfil_id,category,status);

create table public.email_preferences (
  perfil_id bigint not null references public.perfiles(id) on delete cascade,
  email text not null check (email=lower(btrim(email)) and length(email) between 3 and 160 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  marketing_opt_in boolean not null default false,
  onboarding_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  primary key(perfil_id,email)
);

create table public.email_budget (
  period_kind text not null check (period_kind in ('day','month')),
  period_end timestamptz not null,
  used integer not null check (used>=0),
  engagement_used integer not null default 0 check (engagement_used>=0 and engagement_used<=used),
  updated_at timestamptz not null default now(),
  primary key(period_kind,period_end)
);
create table public.email_dispatch_lock (
  id text primary key check (id='resend'),
  next_allowed_at timestamptz not null,
  quota_initialized_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.email_dispatch_lock(id,next_allowed_at) values('resend','epoch');

alter table public.email_outbox enable row level security;
alter table public.email_preferences enable row level security;
alter table public.email_budget enable row level security;
alter table public.email_dispatch_lock enable row level security;
revoke all on public.email_outbox,public.email_preferences,public.email_budget,public.email_dispatch_lock from public,anon,authenticated;
grant select,insert,update,delete on public.email_outbox,public.email_preferences,public.email_budget,public.email_dispatch_lock to service_role;

create function public.mail_enqueue(p_id uuid,p_event_key text,p_tipo text,p_perfil_id bigint,p_recipient text,p_data jsonb,p_category text,p_priority integer,p_due_at timestamptz,p_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.email_outbox;
begin
  insert into public.email_outbox(id,event_key,tipo,perfil_id,recipient,data,category,priority,due_at,expires_at)
  values(p_id,p_event_key,p_tipo,p_perfil_id,lower(btrim(p_recipient)),p_data,p_category,p_priority,p_due_at,p_expires_at)
  on conflict(event_key) do nothing returning * into job;
  if job.id is null then select * into job from public.email_outbox where event_key=p_event_key; end if;
  return to_jsonb(job);
end;
$$;

create function public.mail_enqueue_batch(p_jobs jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; queued integer:=0;
begin
  if p_jobs is null or jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>100 or octet_length(p_jobs::text)>2000000 then raise exception 'invalid mail batch'; end if;
  for item in select value from jsonb_array_elements(p_jobs) loop
    if jsonb_typeof(item)<>'object' then raise exception 'invalid mail batch entry'; end if;
    perform public.mail_enqueue((item->>'id')::uuid,item->>'event_key',item->>'tipo',(item->>'perfil_id')::bigint,item->>'recipient',coalesce(item->'data','{}'::jsonb),item->>'category',(item->>'priority')::integer,(item->>'due_at')::timestamptz,(item->>'expires_at')::timestamptz);
    queued:=queued+1;
  end loop;
  return queued;
end;
$$;

create function public.mail_claim(p_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.email_outbox; at_time timestamptz:=clock_timestamp();
begin
  -- Expired ambiguous attempts are quarantined: Resend idempotency lasts only 24h.
  update public.email_outbox set status=case when first_attempt_at is not null then 'uncertain' else 'cancelled' end,
    last_error=case when first_attempt_at is not null then 'retry_window_expired' else 'expired' end,
    lease_token=null,lease_until=null,updated_at=at_time
  where status in ('pending','retry','leased') and (status<>'leased' or lease_until<=at_time)
    and (expires_at<=at_time or first_attempt_at<=at_time-interval '23 hours') and (p_id is null or id=p_id);
  select * into job from public.email_outbox
  where (p_id is null or id=p_id) and due_at<=at_time and expires_at>at_time
    and (first_attempt_at is null or first_attempt_at>at_time-interval '23 hours')
    and (status in ('pending','retry') or (status='leased' and lease_until<=at_time))
  order by priority asc,due_at asc,created_at asc,id asc for update skip locked limit 1;
  if job.id is null then return null; end if;
  update public.email_outbox set status='leased',lease_token=gen_random_uuid(),lease_until=at_time+interval '90 seconds',updated_at=at_time
  where id=job.id returning * into job;
  return to_jsonb(job);
end;
$$;

create function public.mail_prepare(p_id uuid,p_lease uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.email_outbox;
begin
  select * into job from public.email_outbox where id=p_id for update;
  if job.id is null or job.status<>'leased' or job.lease_token is distinct from p_lease or job.lease_until<=clock_timestamp() then return null; end if;
  if job.rendered_payload is not null then return job.rendered_payload; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>120000
    or p_payload->'to' is distinct from jsonb_build_array(job.recipient) or p_payload ?| array['cc','bcc','attachments'] then raise exception 'invalid mail payload'; end if;
  if job.tipo='reset' then return p_payload; end if;
  update public.email_outbox set rendered_payload=p_payload,updated_at=clock_timestamp() where id=p_id;
  return p_payload;
end;
$$;

-- Match the profile editor's option parsing, including old JSON-string arrays.
create function public.mail_has_option(p_value jsonb,p_depth integer default 0)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; text_value text;
begin
  if p_depth>5 or p_value is null then return false; end if;
  if jsonb_typeof(p_value)='array' then
    if exists(select 1 from jsonb_array_elements(p_value) as e(value) where jsonb_typeof(value)<>'string') then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if public.mail_has_option(item,p_depth+1) then return true; end if;
    end loop;
    return false;
  end if;
  if jsonb_typeof(p_value)<>'string' then return false; end if;
  text_value:=regexp_replace(p_value#>>'{}','^[[:space:]]+|[[:space:]]+$','','g');
  if text_value='' or lower(text_value) in ('null','undefined','true','false') then return false; end if;
  if left(text_value,1) in ('[','{','"') then
    begin return public.mail_has_option(text_value::jsonb,p_depth+1); exception when invalid_text_representation then return false; end;
  end if;
  return exists(select 1 from unnest(string_to_array(text_value,',')) as option(value) where value ~ '[^[:space:]]');
end;
$$;

create function public.mail_json_safe(p_value jsonb,p_depth integer default 0)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item record; scalar jsonb;
begin
  if p_depth>8 then return false; end if;
  if p_value is null or jsonb_typeof(p_value) in ('null','boolean','number') then return true; end if;
  if jsonb_typeof(p_value)='string' then return length(p_value#>>'{}')<=8000; end if;
  if jsonb_typeof(p_value)='array' then
    if jsonb_array_length(p_value)>100 then return false; end if;
    for scalar in select value from jsonb_array_elements(p_value) loop if not public.mail_json_safe(scalar,p_depth+1) then return false; end if; end loop;
    return true;
  end if;
  if jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))>100 then return false; end if;
  for item in select key,value from jsonb_each(p_value) loop
    if length(item.key)>128 or item.key in ('__proto__','prototype','constructor') or not public.mail_json_safe(item.value,p_depth+1) then return false; end if;
  end loop;
  return true;
end;
$$;

create function public.mail_valid_details(p_details jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item record; field_limit integer; fields jsonb;
begin
  if jsonb_typeof(p_details) is distinct from 'object' then return false; end if;
  for item in select key,value from jsonb_each(p_details) loop
    if item.key not in ('instrumento','generos','referentes','disponibilidad','donde_ensaya','experiencia','campos_especificos') then return false; end if;
    if jsonb_typeof(item.value)='null' then continue; end if;
    if item.key='experiencia' then
      if jsonb_typeof(item.value)<>'number' then return false; end if;
      if (item.value#>>'{}')::numeric not between 0 and 100 or trunc((item.value#>>'{}')::numeric)<>(item.value#>>'{}')::numeric then return false; end if;
    elsif item.key='campos_especificos' then
      fields:=item.value;
      if jsonb_typeof(fields)='string' then begin fields:=(fields#>>'{}')::jsonb; exception when invalid_text_representation then return false; end; end if;
      if jsonb_typeof(fields) is distinct from 'object' or not public.mail_json_safe(fields) or octet_length(fields::text)>16000 then return false; end if;
    else
      field_limit:=case item.key when 'referentes' then 4000 when 'donde_ensaya' then 1000 else 2000 end;
      if jsonb_typeof(item.value)<>'string' or length(item.value#>>'{}')>field_limit then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

create function public.mail_profile_complete(p_profile jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare rubro text:=p_profile->>'rubro'; details jsonb:=p_profile; campos jsonb; field_key text; aliases text[]; alias text; option_value jsonb;
  disciplines jsonb:=p_profile->'disciplinas'; selected jsonb; selected_count integer; selected_key text; photo text;
begin
  if coalesce(p_profile->>'nombre','') !~ '[^[:space:]]' or coalesce(p_profile->>'bio','') !~ '[^[:space:]]'
    or coalesce(p_profile->>'provincia','') !~ '[^[:space:]]' or coalesce(p_profile->>'ciudad','') !~ '[^[:space:]]' then return false; end if;
  photo:=regexp_replace(coalesce(p_profile->>'foto_url',''),'^[[:space:]]+|[[:space:]]+$','','g');
  if photo !~* '^https?://[^/?#[:space:]]+' or photo ~* '^https?://[^/?#]*@$' then return false; end if;
  if disciplines is not null and jsonb_typeof(disciplines)<>'null' then
    -- Broken structured data must never fall back to an obsolete top-level mirror.
    if jsonb_typeof(disciplines)<>'object' or disciplines->'version' is distinct from '1'::jsonb
      or exists(select 1 from jsonb_object_keys(disciplines) as k(value) where value not in ('version','selected','details'))
      or jsonb_typeof(disciplines->'selected') is distinct from 'array' or jsonb_typeof(disciplines->'details') is distinct from 'object' then return false; end if;
    selected:=disciplines->'selected'; selected_count:=jsonb_array_length(selected);
    if selected_count not between 1 and 10 or not (selected ? rubro) or (select count(distinct value) from jsonb_array_elements(selected))<>selected_count
      or (select count(*) from jsonb_object_keys(disciplines->'details'))<>selected_count
      or exists(select 1 from jsonb_object_keys(disciplines->'details') as k(value) where not (selected ? value)) then return false; end if;
    for selected_key in select value from jsonb_array_elements_text(selected) loop
      if selected_key not in ('musica','actuacion','audiovisual','modelaje','diseno','tatuaje','danza','maquillaje','circo','escritura')
        or not public.mail_valid_details(disciplines->'details'->selected_key) then return false; end if;
    end loop;
    details:=disciplines->'details'->rubro;
  end if;
  if rubro='musica' then return public.mail_has_option(details->'instrumento'); end if;
  campos:=details->'campos_especificos';
  if jsonb_typeof(campos)='string' then
    begin campos:=(campos#>>'{}')::jsonb; exception when invalid_text_representation then return false; end;
  end if;
  if jsonb_typeof(campos) is distinct from 'object' or not public.mail_json_safe(campos) or octet_length(campos::text)>16000 then return false; end if;
  field_key:=case rubro when 'modelaje' then 'tipo_trabajo' when 'danza' then 'disciplina' when 'circo' then 'especialidad' else 'rol' end;
  aliases:=case rubro
    when 'actuacion' then array['chips-rol-act','chips-rol-actuacion']
    when 'audiovisual' then array['chips-rol-av']
    when 'modelaje' then array['chips-tipo-modelo']
    when 'diseno' then array['chips-rol-dis','chips-rol-diseno']
    when 'tatuaje' then array['chips-rol-tatu']
    when 'danza' then array['chips-disc-dan','chips-disciplina-danza']
    when 'maquillaje' then array['chips-rol-maq']
    when 'circo' then array['chips-rol-cir','chips-rol-circo']
    when 'escritura' then array['chips-rol-esc','chips-rol-escritura'] else null end;
  if aliases is null then return false; end if;
  if campos ? field_key then option_value:=campos->field_key;
  else foreach alias in array aliases loop if campos ? alias then option_value:=campos->alias; exit; end if; end loop; end if;
  return public.mail_has_option(option_value);
end;
$$;

-- Seed reviewed provider usage before activating this sender. This is monotonic,
-- including on repeated initialization: no period or engagement counts are reset.
create function public.mail_initialize_usage(p_daily_used integer,p_daily_reset timestamptz,p_monthly_used integer,p_monthly_reset timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare at_time timestamptz; next_day timestamptz; next_month timestamptz;
begin
  perform pg_advisory_xact_lock(731942160,90100);
  at_time:=clock_timestamp();
  next_day:=(date_trunc('day',at_time at time zone 'UTC')+interval '1 day') at time zone 'UTC';
  next_month:=(date_trunc('month',at_time at time zone 'UTC')+interval '1 month') at time zone 'UTC';
  if p_daily_used is null or p_monthly_used is null or p_daily_used not between 0 and 100 or p_monthly_used not between 0 and 3000
    or p_daily_reset is distinct from next_day or p_monthly_reset is distinct from next_month then return false; end if;
  insert into public.email_budget(period_kind,period_end,used) values('day',next_day,p_daily_used),('month',next_month,p_monthly_used)
    on conflict(period_kind,period_end) do update set used=greatest(public.email_budget.used,excluded.used),updated_at=at_time;
  update public.email_dispatch_lock set quota_initialized_at=coalesce(quota_initialized_at,at_time),updated_at=at_time where id='resend';
  if not found then raise exception 'mail dispatch configuration missing'; end if;
  return true;
end;
$$;

create function public.mail_usage_snapshot()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare at_time timestamptz; next_day timestamptz; next_month timestamptz; initialized_at timestamptz; daily_used integer; monthly_used integer;
begin
  perform pg_advisory_xact_lock(731942160,90100);
  at_time:=clock_timestamp();
  select quota_initialized_at into initialized_at from public.email_dispatch_lock where id='resend' for update;
  if initialized_at is null then raise exception 'mail usage unavailable: initialize reviewed usage before activation'; end if;
  next_day:=(date_trunc('day',at_time at time zone 'UTC')+interval '1 day') at time zone 'UTC';
  next_month:=(date_trunc('month',at_time at time zone 'UTC')+interval '1 month') at time zone 'UTC';
  insert into public.email_budget(period_kind,period_end,used) values('day',next_day,0),('month',next_month,0) on conflict(period_kind,period_end) do nothing;
  select used into daily_used from public.email_budget where period_kind='day' and period_end=next_day;
  select used into monthly_used from public.email_budget where period_kind='month' and period_end=next_month;
  return jsonb_build_object('object','usage','source','ledger_headers','emails',jsonb_build_object(
    'daily',jsonb_build_object('used',daily_used,'limit',100,'resets_at',next_day),
    'monthly',jsonb_build_object('used',monthly_used,'limit',3000,'resets_at',next_month)));
end;
$$;

create function public.mail_observe_usage(p_daily_used integer,p_monthly_used integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare at_time timestamptz; next_day timestamptz; next_month timestamptz;
begin
  if p_daily_used is null and p_monthly_used is null then return false; end if;
  if p_daily_used<0 or p_monthly_used<0 then raise exception 'invalid provider usage'; end if;
  perform pg_advisory_xact_lock(731942160,90100);
  at_time:=clock_timestamp();
  next_day:=(date_trunc('day',at_time at time zone 'UTC')+interval '1 day') at time zone 'UTC';
  next_month:=(date_trunc('month',at_time at time zone 'UTC')+interval '1 month') at time zone 'UTC';
  -- Observations can preserve known floors before bootstrap, but cannot initialize.
  if p_daily_used is not null then
    insert into public.email_budget(period_kind,period_end,used) values('day',next_day,p_daily_used)
      on conflict(period_kind,period_end) do update set used=greatest(public.email_budget.used,excluded.used),updated_at=at_time;
  end if;
  if p_monthly_used is not null then
    insert into public.email_budget(period_kind,period_end,used) values('month',next_month,p_monthly_used)
      on conflict(period_kind,period_end) do update set used=greatest(public.email_budget.used,excluded.used),updated_at=at_time;
  end if;
  return true;
end;
$$;

create function public.mail_reserve(p_id uuid,p_lease uuid,p_payload_hash text,p_daily_used integer,p_daily_reset timestamptz,p_monthly_used integer,p_monthly_reset timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.email_outbox; profile_data jsonb; prefs public.email_preferences; day_budget public.email_budget; month_budget public.email_budget;
  at_time timestamptz:=clock_timestamp(); next_day timestamptz; next_dispatch timestamptz; cancel_reason text; spacing_until timestamptz;
begin
  -- One transaction protects counters for all workers, routes and recipients.
  perform pg_advisory_xact_lock(731942160,90100);
  at_time:=clock_timestamp();
  next_day:=(date_trunc('day',at_time at time zone 'UTC')+interval '1 day') at time zone 'UTC';
  if not exists(select 1 from public.email_dispatch_lock where id='resend' and quota_initialized_at is not null) then
    return jsonb_build_object('allowed',false,'retry_at',at_time+interval '5 minutes','reason','usage_uninitialized'); end if;
  select * into job from public.email_outbox where id=p_id for update;
  if job.id is null or job.status<>'leased' or job.lease_token is distinct from p_lease or job.lease_until<=at_time then
    return jsonb_build_object('allowed',false,'retry_at',null,'reason','lease_lost'); end if;
  if job.first_attempt_at<=at_time-interval '23 hours' or job.expires_at<=at_time then
    update public.email_outbox set status=case when first_attempt_at is null then 'cancelled' else 'uncertain' end,last_error='expired',lease_token=null,lease_until=null,updated_at=at_time where id=p_id;
    return jsonb_build_object('allowed',false,'retry_at',null,'reason','expired'); end if;
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid payload hash'; end if;
  if job.payload_hash is not null and job.payload_hash<>p_payload_hash then
    update public.email_outbox set status='failed',last_error='payload_changed',lease_token=null,lease_until=null,updated_at=at_time where id=p_id;
    return jsonb_build_object('allowed',false,'retry_at',null,'reason','payload_changed'); end if;
  if job.perfil_id is not null then
    select jsonb_build_object('id',id,'email',email,'baneado',baneado,'tipo_cuenta',tipo_cuenta,'nombre',nombre,'foto_url',foto_url,'bio',bio,'provincia',provincia,'ciudad',ciudad,'rubro',rubro,'instrumento',instrumento,'campos_especificos',campos_especificos,'disciplinas',disciplinas)
      into profile_data from public.perfiles where id=job.perfil_id;
    if profile_data is null then cancel_reason:='profile_deleted';
    elsif coalesce((profile_data->>'baneado')::boolean,false) then cancel_reason:='profile_banned';
    elsif lower(btrim(profile_data->>'email')) is distinct from job.recipient then cancel_reason:='email_changed'; end if;
  elsif job.category='engagement' or job.tipo in ('bienvenida','mensaje','reset') then cancel_reason:='profile_required'; end if;
  if cancel_reason is null and job.category='engagement' then
    select * into prefs from public.email_preferences where perfil_id=job.perfil_id and email=job.recipient;
    if job.tipo in ('perfil_incompleto','reactivacion') and coalesce(prefs.onboarding_disabled,false) then cancel_reason:='onboarding_disabled';
    elsif (job.tipo<>'perfil_incompleto' or job.data->>'etapa'='reactivacion') and not coalesce(prefs.marketing_opt_in,false) then cancel_reason:='marketing_not_opted_in';
    elsif job.tipo in ('perfil_incompleto','reactivacion') and (profile_data->>'tipo_cuenta' is distinct from 'artista' or public.mail_profile_complete(profile_data)) then cancel_reason:='profile_complete'; end if;
    if cancel_reason is null then
      select max((case when previous.status='sent' then previous.updated_at else previous.first_attempt_at end)+
        case when job.tipo='perfil_incompleto' and job.data->>'etapa' is distinct from 'reactivacion'
          and previous.tipo='perfil_incompleto' and previous.data->>'etapa' is distinct from 'reactivacion' then interval '4 days' else interval '7 days' end)
        into spacing_until from public.email_outbox as previous
        where previous.perfil_id=job.perfil_id and previous.category='engagement' and previous.id<>job.id
          and (previous.status='sent' or (previous.first_attempt_at is not null and previous.status in ('leased','retry','uncertain')));
      if spacing_until>at_time then return jsonb_build_object('allowed',false,'retry_at',spacing_until+interval '1 second','reason','engagement_spacing'); end if;
    end if;
  end if;
  if cancel_reason is not null then
    update public.email_outbox set status='cancelled',last_error=cancel_reason,lease_token=null,lease_until=null,updated_at=at_time where id=p_id;
    return jsonb_build_object('allowed',false,'retry_at',null,'reason',cancel_reason); end if;
  -- A validated snapshot or provider observation is mandatory for every attempt.
  if p_daily_used is null or p_monthly_used is null or p_daily_used<0 or p_monthly_used<0
    or p_daily_reset is null or p_monthly_reset is null or p_daily_reset<>next_day
    or p_monthly_reset<=at_time or p_monthly_reset>at_time+interval '32 days' then
    return jsonb_build_object('allowed',false,'retry_at',at_time+interval '5 minutes','reason','provider_usage_unavailable'); end if;
  if at_time>=next_day-interval '60 seconds' then
    return jsonb_build_object('allowed',false,'retry_at',next_day+interval '2 seconds','reason','utc_boundary'); end if;
  insert into public.email_budget(period_kind,period_end,used) values('day',p_daily_reset,p_daily_used),('month',p_monthly_reset,p_monthly_used)
    on conflict(period_kind,period_end) do update set used=greatest(public.email_budget.used,excluded.used),updated_at=at_time;
  select * into day_budget from public.email_budget where period_kind='day' and period_end=p_daily_reset for update;
  select * into month_budget from public.email_budget where period_kind='month' and period_end=p_monthly_reset for update;
  if month_budget.used>=2700 or (job.category='engagement' and month_budget.engagement_used>=600) then
    return jsonb_build_object('allowed',false,'retry_at',p_monthly_reset+interval '2 seconds','reason','monthly_budget'); end if;
  if day_budget.used>=90 or (job.category='engagement' and day_budget.engagement_used>=20) then
    return jsonb_build_object('allowed',false,'retry_at',p_daily_reset+interval '2 seconds','reason','daily_budget'); end if;
  select next_allowed_at into next_dispatch from public.email_dispatch_lock where id='resend' for update;
  if next_dispatch>at_time then return jsonb_build_object('allowed',false,'retry_at',next_dispatch,'reason','rate_limit'); end if;
  if next_dispatch is null then raise exception 'mail dispatch configuration missing'; end if;
  update public.email_dispatch_lock set next_allowed_at=at_time+interval '1 second',updated_at=at_time where id='resend';
  update public.email_budget set used=used+1,engagement_used=engagement_used+case when job.category='engagement' then 1 else 0 end,updated_at=at_time
    where (period_kind='day' and period_end=p_daily_reset) or (period_kind='month' and period_end=p_monthly_reset);
  update public.email_outbox set first_attempt_at=coalesce(first_attempt_at,at_time),attempts=attempts+1,payload_hash=coalesce(payload_hash,p_payload_hash),updated_at=at_time where id=p_id;
  return jsonb_build_object('allowed',true,'retry_at',null,'reason','reserved');
end;
$$;

create function public.mail_finish(p_id uuid,p_lease uuid,p_status text,p_resend_id text,p_error text,p_due_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed uuid;
begin
  if p_status not in ('sent','retry','failed','cancelled','uncertain') then raise exception 'invalid mail status'; end if;
  if p_status='sent' and coalesce(length(p_resend_id),0)=0 then raise exception 'provider id required'; end if;
  if p_status='retry' and p_due_at is null then raise exception 'retry time required'; end if;
  update public.email_outbox set status=p_status,resend_id=left(p_resend_id,160),last_error=left(p_error,160),
    due_at=case when p_status='retry' then greatest(p_due_at,clock_timestamp()) else due_at end,
    lease_token=null,lease_until=null,updated_at=clock_timestamp()
  where id=p_id and status='leased' and lease_token=p_lease and lease_until>clock_timestamp() returning id into changed;
  return changed is not null;
end;
$$;

create function public.mail_set_reset(p_id uuid,p_lease uuid,p_token_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.email_outbox; profile_email text; profile_banned boolean; existing_hash text; existing_expiry timestamptz; at_time timestamptz:=clock_timestamp();
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid reset hash'; end if;
  select * into job from public.email_outbox where id=p_id for update;
  if job.id is null or job.tipo<>'reset' or job.status<>'leased' or job.lease_token is distinct from p_lease or job.lease_until<=at_time
    or job.first_attempt_at is null or job.first_attempt_at<=at_time-interval '45 minutes' or job.attempts<1 or job.payload_hash is null then return false; end if;
  select email,baneado,reset_token,reset_expires into profile_email,profile_banned,existing_hash,existing_expiry
    from public.perfiles where id=job.perfil_id for update;
  if profile_email is null or lower(btrim(profile_email))<>job.recipient or coalesce(profile_banned,false)
    or exists(select 1 from public.email_outbox where tipo='reset' and perfil_id=job.perfil_id and recipient=job.recipient and (created_at,id)>(job.created_at,job.id)) then
    update public.email_outbox set status='cancelled',last_error='reset_superseded',lease_token=null,lease_until=null,updated_at=at_time where id=p_id;
    return false;
  end if;
  -- A retry must not revive a consumed token or extend its original lifetime.
  if job.reset_prepared_at is not null then
    return existing_hash is not distinct from p_token_hash and existing_expiry=job.first_attempt_at+interval '1 hour' and existing_expiry>at_time;
  end if;
  update public.perfiles set reset_token=p_token_hash,reset_expires=job.first_attempt_at+interval '1 hour' where id=job.perfil_id;
  update public.email_outbox set reset_prepared_at=at_time,updated_at=at_time where id=p_id;
  return true;
end;
$$;

create function public.mail_cancel_pending_profile(p_perfil_id bigint,p_email text,p_scope text)
returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_scope not in ('engagement','onboarding','marketing') then raise exception 'invalid mail scope'; end if;
  update public.email_outbox set status='cancelled',last_error='unsubscribed',lease_token=null,lease_until=null,updated_at=clock_timestamp()
  where perfil_id=p_perfil_id and recipient=lower(btrim(p_email)) and category='engagement' and status in ('pending','retry','leased')
    and (p_scope='engagement' or (p_scope='onboarding' and tipo in ('perfil_incompleto','reactivacion'))
      or (p_scope='marketing' and (tipo in ('novedades','resumen_mensual','reactivacion') or (tipo='perfil_incompleto' and data->>'etapa'='reactivacion'))));
  get diagnostics changed=row_count;
  return changed;
end;
$$;

create function public.mail_track_completion()
returns trigger language plpgsql security invoker set search_path='' as $$
declare current_data jsonb; previous_data jsonb; at_time timestamptz:=clock_timestamp();
begin
  if new.tipo_cuenta is distinct from 'artista' then return new; end if;
  current_data:=jsonb_build_object('nombre',new.nombre,'foto_url',new.foto_url,'bio',new.bio,'provincia',new.provincia,'ciudad',new.ciudad,
    'rubro',new.rubro,'instrumento',new.instrumento,'campos_especificos',new.campos_especificos,'disciplinas',new.disciplinas);
  if not public.mail_profile_complete(current_data) then return new; end if;
  update public.email_outbox set status='cancelled',last_error='profile_complete',lease_token=null,lease_until=null,updated_at=at_time
    where perfil_id=new.id and recipient=lower(btrim(new.email)) and tipo in ('perfil_incompleto','reactivacion') and status in ('pending','retry','leased');
  previous_data:=jsonb_build_object('nombre',old.nombre,'foto_url',old.foto_url,'bio',old.bio,'provincia',old.provincia,'ciudad',old.ciudad,
    'rubro',old.rubro,'instrumento',old.instrumento,'campos_especificos',old.campos_especificos,'disciplinas',old.disciplinas);
  if public.mail_profile_complete(previous_data) then return new; end if;
  -- Seven-day association after a mail click; this does not establish causality.
  update public.email_outbox set completed_at=at_time
    where perfil_id=new.id and recipient=lower(btrim(new.email)) and (category='engagement' or tipo='bienvenida') and status='sent'
      and clicked_at>=at_time-interval '7 days' and clicked_at<=at_time and completed_at is null;
  return new;
end;
$$;
create trigger email_profile_completion after update of nombre,foto_url,bio,provincia,ciudad,instrumento,campos_especificos,rubro,disciplinas
  on public.perfiles for each row execute function public.mail_track_completion();

revoke all on function public.mail_enqueue(uuid,text,text,bigint,text,jsonb,text,integer,timestamptz,timestamptz),public.mail_enqueue_batch(jsonb),public.mail_claim(uuid),public.mail_prepare(uuid,uuid,jsonb),public.mail_has_option(jsonb,integer),public.mail_json_safe(jsonb,integer),public.mail_valid_details(jsonb),public.mail_profile_complete(jsonb),public.mail_initialize_usage(integer,timestamptz,integer,timestamptz),public.mail_usage_snapshot(),public.mail_observe_usage(integer,integer),public.mail_reserve(uuid,uuid,text,integer,timestamptz,integer,timestamptz),public.mail_finish(uuid,uuid,text,text,text,timestamptz),public.mail_cancel_pending_profile(bigint,text,text),public.mail_set_reset(uuid,uuid,text),public.mail_track_completion() from public,anon,authenticated;
grant execute on function public.mail_enqueue(uuid,text,text,bigint,text,jsonb,text,integer,timestamptz,timestamptz),public.mail_enqueue_batch(jsonb),public.mail_claim(uuid),public.mail_prepare(uuid,uuid,jsonb),public.mail_has_option(jsonb,integer),public.mail_json_safe(jsonb,integer),public.mail_valid_details(jsonb),public.mail_profile_complete(jsonb),public.mail_initialize_usage(integer,timestamptz,integer,timestamptz),public.mail_usage_snapshot(),public.mail_observe_usage(integer,integer),public.mail_reserve(uuid,uuid,text,integer,timestamptz,integer,timestamptz),public.mail_finish(uuid,uuid,text,text,text,timestamptz),public.mail_cancel_pending_profile(bigint,text,text),public.mail_set_reset(uuid,uuid,text),public.mail_track_completion() to service_role;
