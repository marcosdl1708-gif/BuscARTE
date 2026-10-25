-- Explicit frequency evidence. Existing choices stay monthly; nobody is subscribed by this migration.
alter table public.email_preferences
  add column marketing_frequency text not null default 'monthly' check(marketing_frequency in ('monthly','fortnightly')),
  add column marketing_consent_version text,
  add column marketing_consented_at timestamptz,
  add column marketing_consent_source text,
  add column onboarding_consent_version text,
  add column onboarding_consented_at timestamptz;
alter table public.email_preferences add constraint email_preferences_fortnightly_evidence check (
  not marketing_opt_in or marketing_frequency<>'fortnightly' or
  coalesce((marketing_consent_version='2026-10-25-fortnightly-v1' and marketing_consented_at is not null
   and marketing_consent_source in ('registration','profile')),false)
);
-- RLS and existing private grants remain unchanged. Reserve revalidates
-- cohort/frequency, seven-day spacing, and the shared protected budget.
CREATE OR REPLACE FUNCTION public.mail_reserve(p_id uuid, p_lease uuid, p_payload_hash text, p_daily_used integer, p_daily_reset timestamp with time zone, p_monthly_used integer, p_monthly_reset timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    select jsonb_build_object('id',id,'email',email,'baneado',baneado,'tipo_cuenta',tipo_cuenta,'nombre',nombre,'foto_url',foto_url,'bio',bio,'provincia',provincia,'ciudad',ciudad,'rubro',rubro,'instrumento',instrumento,'campos_especificos',campos_especificos,'disciplinas',disciplinas,'created_at',created_at)
      into profile_data from public.perfiles where id=job.perfil_id;
    if profile_data is null then cancel_reason:='profile_deleted';
    elsif coalesce((profile_data->>'baneado')::boolean,false) then cancel_reason:='profile_banned';
    elsif lower(btrim(profile_data->>'email')) is distinct from job.recipient then cancel_reason:='email_changed'; end if;
  elsif job.category='engagement' or job.tipo in ('bienvenida','mensaje','reset') then cancel_reason:='profile_required'; end if;
  if cancel_reason is null and job.category='engagement' then
    select * into prefs from public.email_preferences where perfil_id=job.perfil_id and email=job.recipient;
    if job.tipo='perfil_incompleto' and coalesce(job.data->>'etapa','48h') not in ('48h','7d','seguimiento','reactivacion') then cancel_reason:='invalid_stage';
    elsif job.tipo in ('perfil_incompleto','reactivacion') and coalesce(prefs.onboarding_disabled,false) then cancel_reason:='onboarding_disabled';
    elsif (job.tipo<>'perfil_incompleto' or job.data->>'etapa'='reactivacion' or
      (coalesce((profile_data->>'created_at')::timestamptz<'2026-10-15T00:00:00Z'::timestamptz,true) and not coalesce(
        (job.data->>'etapa'='seguimiento' and prefs.onboarding_consent_version='2026-10-25-profile-help-v1'
         and prefs.onboarding_consented_at is not null and prefs.onboarding_consented_at<=at_time),false)))
      and not coalesce(prefs.marketing_opt_in,false) then cancel_reason:='marketing_not_opted_in';
    elsif job.tipo='resumen_mensual' and prefs.marketing_frequency is distinct from 'monthly' then cancel_reason:='frequency_changed';
    elsif job.tipo='novedades' and job.data->>'cadencia'='15d' and
      (prefs.marketing_frequency is distinct from 'fortnightly' or prefs.marketing_consent_version is distinct from '2026-10-25-fortnightly-v1'
       or prefs.marketing_consented_at is null or prefs.marketing_consented_at>at_time) then cancel_reason:='frequency_changed';
    elsif job.tipo in ('perfil_incompleto','reactivacion') and (profile_data->>'tipo_cuenta' is distinct from 'artista' or public.mail_profile_complete(profile_data)) then cancel_reason:='profile_complete'; end if;
    if cancel_reason is null then
      if job.tipo='perfil_incompleto' and job.data->>'etapa'='seguimiento' then
        select max((case when previous.status='sent' then previous.updated_at else previous.first_attempt_at end)+interval '14 days')
          into spacing_until from public.email_outbox as previous
          where previous.perfil_id=job.perfil_id and previous.id<>job.id and previous.tipo='perfil_incompleto' and previous.data->>'etapa'='seguimiento'
            and (previous.status='sent' or (previous.first_attempt_at is not null and previous.status in ('leased','retry','uncertain')));
        if spacing_until>at_time then return jsonb_build_object('allowed',false,'retry_at',spacing_until+interval '1 second','reason','followup_spacing'); end if;
      end if;
      if job.tipo in ('resumen_mensual','novedades') then
        select max(case when prefs.marketing_frequency='fortnightly' then
            (case when previous.status='sent' then previous.updated_at else previous.first_attempt_at end)+interval '15 days'
          else (date_trunc('month',(case when previous.status='sent' then previous.updated_at else previous.first_attempt_at end)
            at time zone 'America/Argentina/Buenos_Aires')+interval '1 month') at time zone 'America/Argentina/Buenos_Aires' end)
          into spacing_until from public.email_outbox as previous
          where previous.perfil_id=job.perfil_id and previous.id<>job.id and previous.tipo in ('resumen_mensual','novedades')
            and (previous.status='sent' or (previous.first_attempt_at is not null and previous.status in ('leased','retry','uncertain')));
        if spacing_until>at_time then return jsonb_build_object('allowed',false,'retry_at',spacing_until+interval '1 second','reason','newsletter_spacing'); end if;
      end if;
      select max((case when previous.status='sent' then previous.updated_at else previous.first_attempt_at end)+
        interval '7 days')
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
  if month_budget.used>=2700 or (job.category='engagement' and month_budget.engagement_used>=1200) then
    return jsonb_build_object('allowed',false,'retry_at',p_monthly_reset+interval '2 seconds','reason','monthly_budget'); end if;
  if day_budget.used>=90 or (job.category='engagement' and day_budget.engagement_used>=40) then
    return jsonb_build_object('allowed',false,'retry_at',p_daily_reset+interval '2 seconds','reason','daily_budget'); end if;
  if job.tipo<>'reset' and day_budget.used>=70 then
    return jsonb_build_object('allowed',false,'retry_at',p_daily_reset+interval '2 seconds','reason','non_urgent_daily_budget'); end if;
  select next_allowed_at into next_dispatch from public.email_dispatch_lock where id='resend' for update;
  if next_dispatch>at_time then return jsonb_build_object('allowed',false,'retry_at',next_dispatch,'reason','rate_limit'); end if;
  if next_dispatch is null then raise exception 'mail dispatch configuration missing'; end if;
  update public.email_dispatch_lock set next_allowed_at=at_time+interval '1 second',updated_at=at_time where id='resend';
  update public.email_budget set used=used+1,engagement_used=engagement_used+case when job.category='engagement' then 1 else 0 end,updated_at=at_time
    where (period_kind='day' and period_end=p_daily_reset) or (period_kind='month' and period_end=p_monthly_reset);
  update public.email_outbox set first_attempt_at=coalesce(first_attempt_at,at_time),attempts=attempts+1,payload_hash=coalesce(payload_hash,p_payload_hash),updated_at=at_time where id=p_id;
  return jsonb_build_object('allowed',true,'retry_at',null,'reason','reserved');
end;
$function$;
