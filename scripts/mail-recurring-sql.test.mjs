import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// Isolated PostgreSQL/WASM and synthetic records only. No application transport,
// production credentials, provider request or persisted QA account is available.
const modulePath=process.env.BUSCARTE_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'@electric-sql/pglite');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(path.join(root,'supabase/migrations',name),'utf8');
const migration=read('20261025143023_recurring_engagement_frequency.sql');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const rpc=async(name,args=[])=>(await q(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args))[0].value;
const reject=(promise,code)=>assert.rejects(promise,error=>error.code===code);
const hash='c'.repeat(64);
const version='2026-10-25-fortnightly-v1';
const times=async()=>(await q(`select (date_trunc('day',clock_timestamp() at time zone 'UTC')+interval '1 day') at time zone 'UTC' as day_end,(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC' as month_end`))[0];

await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table public.perfiles(id bigint primary key,created_at timestamptz,email text,baneado boolean default false,tipo_cuenta text default 'artista',nombre text,foto_url text,bio text,provincia text,ciudad text,rubro text default 'musica',instrumento text,campos_especificos jsonb,disciplinas jsonb,reset_token text,reset_expires timestamptz);
create table public.conversaciones(id bigint generated always as identity primary key,user1_id bigint references perfiles on delete cascade,user2_id bigint references perfiles on delete cascade,anuncio_id bigint,ultimo_mensaje text,updated_at timestamptz);
create table public.mensajes(id bigint generated always as identity primary key,created_at timestamptz default now(),de_user_id bigint references perfiles on delete cascade,para_user_id bigint references perfiles on delete cascade,contenido text,leido boolean default false);
alter table public.perfiles enable row level security;alter table public.mensajes enable row level security;
grant select,insert,update,delete on public.perfiles,public.mensajes,public.conversaciones to service_role;
grant usage on all sequences in schema public to service_role;`);
await db.exec(read('20261015121825_email_engagement_queue.sql'));
await db.exec(read('20261015125839_user_blocks_reports.sql'));
await db.exec(read('20261015163645_message_mail_trigger.sql'));
await db.exec(`insert into perfiles(id,created_at,email,nombre) select n,'2026-09-01T00:00:00Z','old'||n||'@example.invalid','Old fixture'||n from generate_series(1,13) as n;
insert into email_preferences(perfil_id,email,marketing_opt_in,onboarding_disabled) select n,'old'||n||'@example.invalid',n<=12,n=13 from generate_series(1,13) as n;`);
const priorPreferences=await q('select * from email_preferences order by perfil_id');
const priorFunctions=await q(`select oid,proname,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace`);
const priorTriggers=await q(`select tgname,tgtype,tgenabled,tgfoid from pg_trigger where not tgisinternal order by tgname`);
await db.exec(migration);
after(async()=>{await db.close();});

async function reset() {
  await db.exec(`reset role;truncate perfiles restart identity cascade;truncate email_budget;
    update email_dispatch_lock set next_allowed_at='epoch',quota_initialized_at=null;
    insert into perfiles(id,created_at,email,nombre) select n,'2026-10-16T00:00:00Z','fixture'||n||'@example.invalid','Fixture'||n from generate_series(1,6) as n;
    set role service_role;`);
  const t=await times();assert.equal(await rpc('mail_initialize_usage',[0,t.day_end,0,t.month_end]),true);
}
async function preference(id=2,{optIn=true,disabled=false,frequency='monthly',consentVersion=null,consentedAt=null,source=null}={}) {
  return q(`insert into email_preferences(perfil_id,email,marketing_opt_in,onboarding_disabled,marketing_frequency,marketing_consent_version,marketing_consented_at,marketing_consent_source)
    values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(perfil_id,email) do update set marketing_opt_in=excluded.marketing_opt_in,onboarding_disabled=excluded.onboarding_disabled,marketing_frequency=excluded.marketing_frequency,marketing_consent_version=excluded.marketing_consent_version,marketing_consented_at=excluded.marketing_consented_at,marketing_consent_source=excluded.marketing_consent_source`,
    [id,`fixture${id}@example.invalid`,optIn,disabled,frequency,consentVersion,consentedAt,source]);
}
const fortnight=(extra={})=>({frequency:'fortnightly',consentVersion:version,consentedAt:new Date(Date.now()-1000).toISOString(),source:'profile',...extra});
async function enqueue({tipo='perfil_incompleto',id=2,data={etapa:'seguimiento'}}={}) {
  const job=randomUUID(),category=['perfil_incompleto','novedades','resumen_mensual'].includes(tipo)?'engagement':'transactional';
  return rpc('mail_enqueue',[job,'fixture:'+job,tipo,id,`fixture${id}@example.invalid`,data,category,tipo==='reset'?0:60,new Date(Date.now()-1000).toISOString(),new Date(Date.now()+31*86400000).toISOString()]);
}
const claim=job=>rpc('mail_claim',[job.id]);
async function reserve(job,{daily=0,monthly=0}={}) {const t=await times();return rpc('mail_reserve',[job.id,job.lease_token,hash,daily,t.day_end,monthly,t.month_end]);}
const finish=job=>rpc('mail_finish',[job.id,job.lease_token,'sent','fixture-provider-id','',null]);
const unpace=()=>q(`update email_dispatch_lock set next_allowed_at='epoch'`);
const state=async job=>(await q('select * from email_outbox where id=$1',[job.id]))[0];
const budgets=()=>q('select period_kind,used,engagement_used from email_budget order by period_kind');

test('migration keeps all twelve existing subscriptions monthly without inventing evidence or changing opt-outs',async()=>{
  const rows=await q('select * from email_preferences order by perfil_id');assert.equal(rows.length,13);
  for(let i=0;i<rows.length;i++) {
    const {marketing_frequency,marketing_consent_version,marketing_consented_at,marketing_consent_source,onboarding_consent_version,onboarding_consented_at,...old}=rows[i];
    assert.deepEqual(old,priorPreferences[i]);assert.equal(marketing_frequency,'monthly');
    assert.equal(marketing_consent_version,null);assert.equal(marketing_consented_at,null);assert.equal(marketing_consent_source,null);
    assert.equal(onboarding_consent_version,null);assert.equal(onboarding_consented_at,null);
  }
  assert.equal(rows.filter(row=>row.marketing_opt_in).length,12);assert.equal(rows[12].onboarding_disabled,true);
  assert.equal((await q('select count(*)::int as n from email_outbox'))[0].n,0);
});

test('only reservation changes; existing queue, moderation and completion triggers retain exact definitions',async()=>{
  for(const fn of priorFunctions) if(fn.proname!=='mail_reserve') assert.equal((await q('select pg_get_functiondef($1::oid) as definition',[fn.oid]))[0].definition,fn.definition);
  assert.deepEqual(await q(`select tgname,tgtype,tgenabled,tgfoid from pg_trigger where not tgisinternal order by tgname`),priorTriggers);
  const reserveFn=(await q(`select oid,prosecdef,proconfig from pg_proc where oid='public.mail_reserve(uuid,uuid,text,integer,timestamptz,integer,timestamptz)'::regprocedure`))[0];
  assert.equal(reserveFn.prosecdef,false);assert(reserveFn.proconfig.includes('search_path=""'));
  for(const role of ['anon','authenticated','service_role'])assert.equal((await q('select has_function_privilege($1,$2,\'EXECUTE\') as ok',[role,reserveFn.oid]))[0].ok,role==='service_role');
});

test('private preference RLS and grants remain closed to anonymous and authenticated clients',async()=>{
  assert.equal((await q(`select relrowsecurity from pg_class where oid='email_preferences'::regclass`))[0].relrowsecurity,true);
  for(const role of ['anon','authenticated'])for(const operation of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await q('select has_table_privilege($1,\'email_preferences\',$2) as ok',[role,operation]))[0].ok,false);
  assert.equal((await q(`select has_table_privilege('service_role','email_preferences','SELECT,INSERT,UPDATE,DELETE') as ok`))[0].ok,true);
});

test('fortnightly subscriptions require non-null matching evidence; declined subscriptions never become enabled',async()=>{
  for(const change of [{},{consentVersion:version},{consentVersion:version,consentedAt:new Date().toISOString()},{consentVersion:version,consentedAt:new Date().toISOString(),source:'client'},{consentVersion:'forged',consentedAt:new Date().toISOString(),source:'profile'}]) {
    await reset();await reject(preference(2,{frequency:'fortnightly',...change}),'23514');assert.equal((await q('select count(*)::int as n from email_preferences'))[0].n,0);
  }
  await reset();await preference(2,fortnight());await preference(3,{optIn:false,frequency:'fortnightly'});
  assert.equal((await q('select marketing_opt_in from email_preferences where perfil_id=3'))[0].marketing_opt_in,false);
  await reject(preference(4,{frequency:'weekly'}),'23514');
});

test('new-cohort follow-up with default account preferences reserves exactly one attempt',async()=>{
  await reset();const job=await claim(await enqueue());const result=await reserve(job);assert.equal(result.allowed,true);
  const after=await state(job);assert.equal(after.attempts,1);assert(after.first_attempt_at);assert.equal(after.status,'leased');
  assert.deepEqual(await budgets(),[{period_kind:'day',used:1,engagement_used:1},{period_kind:'month',used:1,engagement_used:1}]);
});

test('historical accounts cannot bypass marketing permission by relabeling reminder stages',async()=>{
  for(const etapa of ['48h','7d','seguimiento','reactivacion']) {
    await reset();await q(`update perfiles set created_at='2026-09-01' where id=2`);
    const job=await claim(await enqueue({data:{etapa}}));assert.equal((await reserve(job)).reason,'marketing_not_opted_in');assert.equal((await state(job)).status,'cancelled');assert.equal((await state(job)).attempts,0);
  }
  await reset();await q(`update perfiles set created_at='2026-09-01' where id=2`);await preference();
  assert.equal((await reserve(await claim(await enqueue()))).allowed,true);
});

test('historical accounts may explicitly enable profile help without subscribing to marketing',async()=>{
  for(const [helpVersion,helpAt,allowed] of [
    ['2026-10-25-profile-help-v1',new Date(Date.now()-1000).toISOString(),true],
    [null,null,false],['forged-profile-help',new Date(Date.now()-1000).toISOString(),false],
    ['2026-10-25-profile-help-v1',null,false],['2026-10-25-profile-help-v1',new Date(Date.now()+3600000).toISOString(),false]
  ]) {
    await reset();await q(`update perfiles set created_at='2026-09-01' where id=2`);await preference(2,{optIn:false});
    await q(`update email_preferences set onboarding_consent_version=$1,onboarding_consented_at=$2 where perfil_id=2`,[helpVersion,helpAt]);
    const job=await claim(await enqueue());const result=await reserve(job);assert.equal(result.allowed,allowed);
    if(!allowed){assert.equal(result.reason,'marketing_not_opted_in');assert.equal((await state(job)).attempts,0);}
    assert.equal((await q('select marketing_opt_in from email_preferences where perfil_id=2'))[0].marketing_opt_in,false);
  }
  for(const etapa of ['48h','7d','reactivacion']) {
    await reset();await q(`update perfiles set created_at='2026-09-01' where id=2`);await preference(2,{optIn:false});
    await q(`update email_preferences set onboarding_consent_version='2026-10-25-profile-help-v1',onboarding_consented_at=clock_timestamp()-interval '1 second' where perfil_id=2`);
    const job=await claim(await enqueue({data:{etapa}}));assert.equal((await reserve(job)).reason,'marketing_not_opted_in');
  }
});

test('follow-up reminders wait fourteen actual days after the preceding delivered follow-up',async()=>{
  await reset();const previous=await claim(await enqueue());assert.equal((await reserve(previous)).allowed,true);await finish(previous);await unpace();
  await q(`update email_outbox set updated_at=clock_timestamp()-interval '10 days' where id=$1`,[previous.id]);
  const next=await claim(await enqueue());const denied=await reserve(next);
  assert.equal(denied.reason,'followup_spacing');assert(Date.parse(denied.retry_at)>Date.now()+3.99*86400000);assert(Date.parse(denied.retry_at)<Date.now()+4.01*86400000);assert.equal((await state(next)).attempts,0);assert.equal((await budgets())[0].used,1);
  await q(`update email_outbox set updated_at=clock_timestamp()-interval '14 days 1 second' where id=$1`,[previous.id]);assert.equal((await reserve(next)).allowed,true);
});

test('unknown stages, missing cohort dates and new-account reactivation fail closed',async()=>{
  await reset();await preference();let job=await claim(await enqueue({data:{etapa:'made-up-onboarding'}}));assert.equal((await reserve(job)).reason,'invalid_stage');
  await reset();await q('update perfiles set created_at=null where id=2');job=await claim(await enqueue());assert.equal((await reserve(job)).reason,'marketing_not_opted_in');
  await reset();job=await claim(await enqueue({data:{etapa:'reactivacion'}}));assert.equal((await reserve(job)).reason,'marketing_not_opted_in');
});

test('completion, bans, opt-out and changed email stop queued follow-ups before any quota is consumed',async()=>{
  for(const [sql,prefs,reason] of [
    ["update perfiles set nombre='Complete',foto_url='https://example.invalid/photo.jpg',bio='Bio',provincia='Buenos Aires',ciudad='La Plata',instrumento='Guitarra' where id=2",null,'profile_complete'],
    ['update perfiles set baneado=true where id=2',null,'profile_banned'],
    [null,{disabled:true},'onboarding_disabled'],
    ["update perfiles set email='changed@example.invalid' where id=2",null,'email_changed']
  ]) {
    await reset();if(sql)await q(sql);if(prefs)await preference(2,prefs);
    const job=await claim(await enqueue());assert.equal((await reserve(job)).reason,reason);assert.equal((await state(job)).status,'cancelled');assert.equal((await state(job)).attempts,0);
    assert.equal((await budgets())[0].used,0);
  }
});

test('completion while waiting cancels the lease instead of reviving its delivery',async()=>{
  await reset();const job=await claim(await enqueue());
  await q(`update perfiles set nombre='Complete',foto_url='https://example.invalid/photo.jpg',bio='Bio',provincia='Buenos Aires',ciudad='La Plata',instrumento='Guitarra' where id=2`);
  assert.equal((await state(job)).status,'cancelled');assert.equal((await reserve(job)).reason,'lease_lost');assert.equal((await budgets())[0].used,0);
});

test('monthly and fortnightly jobs are revalidated against the current frequency at reservation',async()=>{
  await reset();await preference();let job=await claim(await enqueue({tipo:'resumen_mensual',data:{}}));assert.equal((await reserve(job)).allowed,true);
  await reset();await preference(2,fortnight());job=await claim(await enqueue({tipo:'resumen_mensual',data:{}}));assert.equal((await reserve(job)).reason,'frequency_changed');
  await reset();await preference();job=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));assert.equal((await reserve(job)).reason,'frequency_changed');
  await reset();await preference(2,fortnight());job=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));assert.equal((await reserve(job)).allowed,true);
});

test('future-dated evidence and revoked marketing permission cannot send fortnightly news',async()=>{
  await reset();await preference(2,fortnight({consentedAt:new Date(Date.now()+3600000).toISOString()}));let job=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));assert.equal((await reserve(job)).reason,'frequency_changed');
  await reset();await preference(2,{...fortnight(),optIn:false});job=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));assert.equal((await reserve(job)).reason,'marketing_not_opted_in');
});

test('reservation checks the evidence version even if a legacy row escaped the new table constraint',async()=>{
  await reset();await db.exec('begin');
  try {
    await db.exec('reset role;alter table email_preferences drop constraint email_preferences_fortnightly_evidence;set role service_role;');
    await preference(2,fortnight({consentVersion:'legacy-unproven'}));
    const job=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));assert.equal((await reserve(job)).reason,'frequency_changed');assert.equal((await state(job)).attempts,0);
  } finally {await db.exec('rollback');}
});

test('seven-day spacing applies across all engagement types and consumes no attempt while deferred',async()=>{
  await reset();const previous=await claim(await enqueue());assert.equal((await reserve(previous)).allowed,true);await finish(previous);await unpace();
  await q(`update email_outbox set updated_at=clock_timestamp()-interval '6 days 23 hours' where id=$1`,[previous.id]);
  await preference();const next=await claim(await enqueue({tipo:'resumen_mensual',data:{}}));const denied=await reserve(next);
  assert.equal(denied.reason,'engagement_spacing');assert(Date.parse(denied.retry_at)>Date.now()+59*60000);assert.equal((await state(next)).attempts,0);assert.equal((await budgets())[0].used,1);
  await q(`update email_outbox set updated_at=clock_timestamp()-interval '7 days 1 second' where id=$1`,[previous.id]);assert.equal((await reserve(next)).allowed,true);
});

test('monthly permission blocks another generic newsletter until the next Argentina calendar month',async()=>{
  await reset();await preference();const previous=await claim(await enqueue({tipo:'resumen_mensual',data:{}}));assert.equal((await reserve(previous)).allowed,true);await finish(previous);await unpace();
  const next=await claim(await enqueue({tipo:'novedades',data:{titulo:'Generic internal notice'}}));const denied=await reserve(next);
  const boundary=(await q(`select (date_trunc('month',clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')+interval '1 month') at time zone 'America/Argentina/Buenos_Aires' as next_month`))[0].next_month;
  assert.equal(denied.reason,'newsletter_spacing');assert.equal(Date.parse(denied.retry_at),boundary.getTime()+1000);assert.equal(boundary.getUTCHours(),3);assert.equal((await state(next)).attempts,0);assert.equal((await budgets())[0].used,1);
  await q(`update email_outbox set updated_at=(date_trunc('month',clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')-interval '8 days') at time zone 'America/Argentina/Buenos_Aires' where id=$1`,[previous.id]);
  assert.equal((await reserve(next)).allowed,true);
});

test('fortnightly newsletters wait fifteen actual days after a delayed previous delivery',async()=>{
  await reset();await preference(2,fortnight());const previous=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));assert.equal((await reserve(previous)).allowed,true);await finish(previous);await unpace();
  await q(`update email_outbox set updated_at=clock_timestamp()-interval '10 days' where id=$1`,[previous.id]);
  const next=await claim(await enqueue({tipo:'novedades',data:{cadencia:'15d'}}));const denied=await reserve(next);
  assert.equal(denied.reason,'newsletter_spacing');assert(Date.parse(denied.retry_at)>Date.now()+4.99*86400000);assert(Date.parse(denied.retry_at)<Date.now()+5.01*86400000);assert.equal((await state(next)).attempts,0);assert.equal((await budgets())[0].used,1);
  await q(`update email_outbox set updated_at=clock_timestamp()-interval '15 days 1 second' where id=$1`,[previous.id]);assert.equal((await reserve(next)).allowed,true);
});

test('engagement daily 39 to 40 reserves once then defers without lowering provider floors',async()=>{
  await reset();await q(`update email_budget set used=39,engagement_used=39 where period_kind='day'`);
  let job=await claim(await enqueue());assert.equal((await reserve(job)).allowed,true);await finish(job);await unpace();
  job=await claim(await enqueue({id:3}));const denied=await reserve(job);assert.equal(denied.reason,'daily_budget');assert.equal((await state(job)).attempts,0);
  assert.deepEqual(await budgets(),[{period_kind:'day',used:40,engagement_used:40},{period_kind:'month',used:1,engagement_used:1}]);
  await rpc('mail_observe_usage',[1,0]);assert.equal((await budgets())[0].used,40);
});

test('engagement monthly 1199 to 1200 stops only engagement before the shared monthly 2700 ceiling',async()=>{
  await reset();await q(`update email_budget set used=1199,engagement_used=1199 where period_kind='month'`);
  let job=await claim(await enqueue());assert.equal((await reserve(job)).allowed,true);await finish(job);await unpace();
  job=await claim(await enqueue({id:3}));assert.equal((await reserve(job)).reason,'monthly_budget');assert.equal((await state(job)).attempts,0);
  assert.equal((await budgets())[1].engagement_used,1200);job=await claim(await enqueue({tipo:'reset',id:4,data:{}}));assert.equal((await reserve(job)).allowed,true);
});

test('non-reset 70 and shared 90 daily limits still reserve room for password recovery',async()=>{
  await reset();let job=await claim(await enqueue({tipo:'bienvenida',data:{}}));assert.equal((await reserve(job,{daily:69})).allowed,true);await finish(job);await unpace();
  job=await claim(await enqueue({tipo:'bienvenida',id:3,data:{}}));assert.equal((await reserve(job,{daily:69})).reason,'non_urgent_daily_budget');assert.equal((await state(job)).attempts,0);
  job=await claim(await enqueue({tipo:'reset',id:4,data:{}}));assert.equal((await reserve(job,{daily:70})).allowed,true);await finish(job);await unpace();
  job=await claim(await enqueue({tipo:'reset',id:5,data:{}}));assert.equal((await reserve(job,{daily:89})).allowed,true);await finish(job);await unpace();
  job=await claim(await enqueue({tipo:'reset',id:6,data:{}}));assert.equal((await reserve(job,{daily:89})).reason,'daily_budget');assert.equal((await budgets())[0].used,90);
});

test('shared monthly 2700 ceiling, pacing and uninitialized-usage guard remain in effect',async()=>{
  await reset();let job=await claim(await enqueue({tipo:'reset',data:{}}));assert.equal((await reserve(job,{monthly:2700})).reason,'monthly_budget');assert.equal((await state(job)).attempts,0);
  await reset();job=await claim(await enqueue({tipo:'reset',data:{}}));assert.equal((await reserve(job)).allowed,true);const next=await claim(await enqueue({tipo:'reset',id:3,data:{}}));assert.equal((await reserve(next)).reason,'rate_limit');
  await reset();await q('update email_dispatch_lock set quota_initialized_at=null');job=await claim(await enqueue());assert.equal((await reserve(job)).reason,'usage_uninitialized');
});
