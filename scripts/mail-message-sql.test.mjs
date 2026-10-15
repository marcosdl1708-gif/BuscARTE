import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Real PostgreSQL/WASM with synthetic profiles only. No network or provider call.
// Reuse an installed QA module through BUSCARTE_PGLITE_MODULE.
const modulePath=process.env.BUSCARTE_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'@electric-sql/pglite');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(path.join(root,'supabase/migrations',name),'utf8');
const baseline=read('20261015121825_email_engagement_queue.sql');
const migration=read('20261015163645_message_mail_trigger.sql');
const terms=read('20261015133155_terms_storage_deletion.sql');
const db=new PGlite();
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(name,args=[]) => (await q(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args))[0].value;
const reject=(promise,code,message)=>assert.rejects(promise,error=>error.code===code&&(!message||error.message.includes(message)));
const hash='a'.repeat(64);
const count=async table=>(await q(`select count(*)::int as n from public.${table}`))[0].n;
const functionSql=(source,name)=>source.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0];

await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table public.perfiles(id bigint primary key,email text,baneado boolean default false,tipo_cuenta text default 'artista',nombre text,foto_url text,bio text,provincia text,ciudad text,rubro text default 'musica',instrumento text,campos_especificos jsonb,disciplinas jsonb,reset_token text,reset_expires timestamptz);
create table public.conversaciones(id bigint generated always as identity primary key,user1_id bigint references public.perfiles on delete cascade,user2_id bigint references public.perfiles on delete cascade,anuncio_id bigint,ultimo_mensaje text,updated_at timestamptz);
create table public.mensajes(id bigint generated always as identity primary key,created_at timestamptz default now(),de_user_id bigint references public.perfiles on delete cascade,para_user_id bigint references public.perfiles on delete cascade,contenido text,leido boolean default false);
alter table public.perfiles enable row level security;alter table public.mensajes enable row level security;
grant select,insert,update,delete on public.perfiles,public.mensajes,public.conversaciones to service_role;
grant usage on all sequences in schema public to service_role;`);
await db.exec(baseline);
await db.exec(read('20261015125839_user_blocks_reports.sql'));
// Install the unchanged production message terms guard without unrelated Auth or
// Storage fixtures. Its exact source is read from the existing migration.
await db.exec(terms.slice(terms.indexOf('create table public.aceptaciones_terminos_web'),terms.indexOf('create table public.eliminaciones_storage_web')));
await db.exec(`grant select,insert on public.aceptaciones_terminos_web to service_role;`);
await db.exec(functionSql(terms,'exigir_terminos_web'));
await db.exec(functionSql(terms,'terminos_guardar_mensaje_web'));
await db.exec(`create trigger terminos_mensaje_insert before insert on public.mensajes for each row execute function public.terminos_guardar_mensaje_web();
insert into public.perfiles(id,email,nombre) values(1,'one@example.invalid','Sender'),(2,'two@example.invalid','Recipient');
insert into public.aceptaciones_terminos_web(perfil_id,version) values(1,'2026-10-15'),(2,'2026-10-15');
insert into public.mensajes(de_user_id,para_user_id,contenido) values(1,2,'Historical body');`);
const priorFunctions=await q(`select oid,proname,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace`);
const priorTriggers=await q(`select tgname,tgtype,tgenabled,tgfoid from pg_trigger where not tgisinternal order by tgname`);
const priorProfiles=await q(`select * from public.perfiles order by id`);
const priorMessages=await q(`select * from public.mensajes order by id`);
await db.exec(migration);
after(async()=>{await db.close();});

async function reset() {
  await db.exec(`reset role;truncate public.perfiles restart identity cascade;truncate public.email_budget;
  update public.email_dispatch_lock set next_allowed_at='epoch',quota_initialized_at=null;
  insert into public.perfiles(id,email,nombre) select n,'fixture'||n||'@example.invalid','Fixture '||n from generate_series(1,6) as n;
  insert into public.aceptaciones_terminos_web(perfil_id,version) select n,'2026-10-15' from generate_series(1,6) as n;
  set role service_role;`);
  const periods=await times();await rpc('mail_initialize_usage',[0,periods.day_end,0,periods.month_end]);
}
const times=async()=>(await q(`select (date_trunc('day',clock_timestamp() at time zone 'UTC')+interval '1 day') at time zone 'UTC' as day_end,(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC' as month_end`))[0];
const insertMessage=async(a=1,b=2,body='PRIVATE_FIXTURE_BODY')=>(await q(`insert into public.mensajes(de_user_id,para_user_id,contenido) values($1,$2,$3) returning id`,[a,b,body]))[0].id;
const enqueueMessage=id=>rpc('mail_enqueue_message',[id]);
const jobFor=async id=>(await q(`select * from public.email_outbox where event_key=$1`,['message:'+id]))[0];
const claim=id=>rpc('mail_claim',[id??null]);
async function reserve(job,{daily=0,monthly=0,payloadHash=hash}={}) {const p=await times();return rpc('mail_reserve',[job.id,job.lease_token,payloadHash,daily,p.day_end,monthly,p.month_end]);}
const unpace=()=>q(`update public.email_dispatch_lock set next_allowed_at='epoch'`);
const finish=(job,status='sent',due=null)=>rpc('mail_finish',[job.id,job.lease_token,status,status==='sent'?'fixture-provider-id':null,null,due]);
async function enqueue(tipo='reset',perfil=2,data={}) {const id=randomUUID();return rpc('mail_enqueue',[id,'fixture:'+id,tipo,perfil,`fixture${perfil}@example.invalid`,data,['perfil_incompleto','resumen_mensual'].includes(tipo)?'engagement':'transactional',tipo==='reset'?0:20,new Date(Date.now()-1000).toISOString(),new Date(Date.now()+31*86400000).toISOString()]);}

test('migration does not enqueue history, rewrite profiles/messages, or alter existing guards',async()=>{
  assert.equal(await count('email_outbox'),0);assert.deepEqual(await q('select * from perfiles order by id'),priorProfiles);assert.deepEqual(await q('select * from mensajes order by id'),priorMessages);
  for(const trigger of priorTriggers) assert.deepEqual((await q(`select tgname,tgtype,tgenabled,tgfoid from pg_trigger where tgname=$1`,[trigger.tgname]))[0],trigger);
  for(const fn of priorFunctions) if(fn.proname!=='mail_reserve') assert.equal((await q('select pg_get_functiondef($1::oid) as definition',[fn.oid]))[0].definition,fn.definition);
  const original=functionSql(baseline,'mail_reserve');
  const expected=original.replace('create function','create or replace function').replace("  select next_allowed_at into next_dispatch", "  if job.tipo<>'reset' and day_budget.used>=70 then\n    return jsonb_build_object('allowed',false,'retry_at',p_daily_reset+interval '2 seconds','reason','non_urgent_daily_budget'); end if;\n  select next_allowed_at into next_dispatch");
  assert.equal(migration.slice(migration.indexOf('create or replace function')).trim().replaceAll('\r\n','\n'),expected.trim().replaceAll('\r\n','\n'));
});

test('new helper/trigger remain invoker, empty search path, service-only',async()=>{
  for(const name of ['mail_enqueue_message','mail_enqueue_inserted_message']) {
    const fn=(await q(`select oid,prosecdef,proconfig from pg_proc where proname=$1`,[name]))[0];assert.equal(fn.prosecdef,false);assert(fn.proconfig.includes('search_path=""'));
    for(const role of ['anon','authenticated','service_role'])assert.equal((await q(`select has_function_privilege($1,$2,'EXECUTE') as ok`,[role,fn.oid]))[0].ok,role==='service_role');
  }
  await reset();for(const role of ['anon','authenticated']) {await db.exec('set role '+role);await reject(enqueueMessage(1),'42501');await reject(insertMessage(),'42501');await db.exec('reset role');}
});

test('direct DB insert atomically enqueues a generic content-free notice for 31 days',async()=>{
  await reset();await db.exec(`update perfiles set nombre='  Equipo  ' where id=1;update perfiles set email=' FIXTURE2@Example.Invalid ' where id=2`);
  const id=await insertMessage();const job=await jobFor(id);assert(job);assert.equal(job.tipo,'mensaje');assert.equal(job.category,'transactional');assert.equal(job.priority,10);assert.equal(job.recipient,'fixture2@example.invalid');assert.deepEqual(job.data,{remitente:'Equipo'});assert.equal(job.status,'pending');assert.equal(job.attempts,0);assert.equal(job.rendered_payload,null);
  assert.equal(job.expires_at.getTime()-job.due_at.getTime(),31*86400000);assert(!JSON.stringify(job).includes('PRIVATE_FIXTURE_BODY'));
});

test('helper retries and legacy web hook share event key and preserve the first payload',async()=>{
  await reset();const id=await insertMessage();const first=await jobFor(id);assert.equal(await enqueueMessage(id),first.id);
  const web=await rpc('mail_enqueue',[randomUUID(),'message:'+id,'mensaje',2,'fixture2@example.invalid',{remitente:'Changed',preview:'PRIVATE'},'transactional',10,new Date().toISOString(),new Date(Date.now()+86400000).toISOString()]);
  assert.equal(web.id,first.id);assert.equal(await count('email_outbox'),1);assert.deepEqual((await jobFor(id)).data,first.data);assert.equal((await jobFor(id)).expires_at.getTime(),first.expires_at.getTime());
});

test('rollback removes both persisted message and notification',async()=>{
  await reset();await db.exec('begin');const id=await insertMessage();assert(await jobFor(id));await db.exec('rollback');assert.equal(await count('mensajes'),0);assert.equal(await count('email_outbox'),0);
});

test('bulk direct insertion queues each recipient once and no historical blanket backfill',async()=>{
  await reset();await q(`insert into mensajes(de_user_id,para_user_id,contenido) select 1,n,'Bulk fixture' from generate_series(2,6) as n`);assert.equal(await count('email_outbox'),5);
  for(const {id} of await q('select id from mensajes'))assert.equal(await enqueueMessage(id),(await jobFor(id)).id);assert.equal(await count('email_outbox'),5);
});

test('invalid, null, blank, and oversized emails skip benignly while the message persists',async()=>{
  for(const email of [null,'','invalid-address','a @example.invalid','a@example',('a'.repeat(150))+'@example.invalid']) {await reset();await q('update perfiles set email=$1 where id=2',[email]);const id=await insertMessage();assert.equal(await count('mensajes'),1);assert.equal(await jobFor(id),undefined);assert.equal(await enqueueMessage(id),null);}
});

test('missing/deleted message or self-directed historical row never queues',async()=>{
  await reset();assert.equal(await enqueueMessage(null),null);assert.equal(await enqueueMessage(999),null);
  await db.exec(`reset role;alter table mensajes disable trigger moderacion_mensaje_insert;`);const self=await insertMessage(1,1);await db.exec(`alter table mensajes enable trigger moderacion_mensaje_insert;set role service_role;`);
  assert.equal(await enqueueMessage(self),null);assert.equal(await count('email_outbox'),0);
  const normal=await insertMessage();await q('delete from mensajes where id=$1',[normal]);assert.equal(await enqueueMessage(normal),null);
});

test('sender and recipient bans skip without aborting database insertion',async()=>{
  for(const actor of [1,2]) {await reset();await q('update perfiles set baneado=true where id=$1',[actor]);const id=await insertMessage();assert.equal(await count('mensajes'),1);assert.equal(await jobFor(id),undefined);assert.equal(await enqueueMessage(id),null);}
});

test('existing moderation guard rejects blocked writes; historical helper skips blocked pairs',async()=>{
  await reset();const id=await insertMessage();await q('delete from email_outbox');await rpc('gestionar_bloqueo_web',[2,1,true]);assert.equal(await enqueueMessage(id),null);await reject(insertMessage(),'42501','COMMUNICATION_BLOCKED');assert.equal(await count('email_outbox'),0);assert.equal(await count('mensajes'),1);
});

test('existing terms guard continues rejecting new writes without creating notices',async()=>{
  await reset();await db.exec('reset role');await q('delete from aceptaciones_terminos_web where perfil_id=1');await db.exec('set role service_role');await reject(insertMessage(),'42501','TERMS_REQUIRED');assert.equal(await count('mensajes'),0);assert.equal(await count('email_outbox'),0);
});

test('message updates do not send another notice; empty sender name uses safe fallback',async()=>{
  await reset();await q(`update perfiles set nombre='   ' where id=1`);const id=await insertMessage();assert.deepEqual((await jobFor(id)).data,{remitente:'buscARTE'});await q(`update mensajes set contenido='Edited',leido=true where id=$1`,[id]);assert.equal(await count('email_outbox'),1);
});

test('69 to 70 ordinary sends stops further notices until exact next UTC reset',async()=>{
  await reset();const a=await claim((await jobFor(await insertMessage())).id);assert.equal((await reserve(a,{daily:69})).allowed,true);await finish(a);await unpace();
  const b=await claim((await jobFor(await insertMessage(1,3))).id);const p=await times();const denied=await reserve(b,{daily:69});assert.equal(denied.reason,'non_urgent_daily_budget');assert.equal(denied.allowed,false);assert.equal(Date.parse(denied.retry_at),p.day_end.getTime()+2000);assert.equal((await q(`select used from email_budget where period_kind='day'`))[0].used,70);assert.equal((await jobFor(Number(b.event_key.split(':')[1]))).attempts,0);
  await finish(b,'retry',denied.retry_at);const deferred=await jobFor(Number(b.event_key.split(':')[1]));assert.equal(deferred.status,'retry');assert.equal(deferred.first_attempt_at,null);assert(deferred.expires_at>deferred.due_at);
});

test('password recovery retains room at 70 and 89, but never exceeds global 90',async()=>{
  await reset();let job=await claim((await enqueue('reset')).id);assert.equal((await reserve(job,{daily:70})).allowed,true);await finish(job);await unpace();
  job=await claim((await enqueue('reset')).id);assert.equal((await reserve(job,{daily:89})).allowed,true);await finish(job);await unpace();job=await claim((await enqueue('reset')).id);assert.equal((await reserve(job,{daily:89})).reason,'daily_budget');assert.equal((await q(`select used from email_budget where period_kind='day'`))[0].used,90);
});

test('global/monthly/engagement caps, usage validation and pacing remain active',async()=>{
  await reset();let job=await claim((await enqueue('bienvenida')).id);assert.equal((await reserve(job,{daily:null})).reason,'provider_usage_unavailable');assert.equal((await reserve(job,{monthly:2700})).reason,'monthly_budget');
  await reset();await q(`update email_budget set used=20,engagement_used=20 where period_kind='day'`);job=await claim((await enqueue('perfil_incompleto')).id);assert.equal((await reserve(job)).reason,'daily_budget');
  await reset();job=await claim((await enqueue('reset')).id);assert.equal((await reserve(job)).allowed,true);const next=await claim((await enqueue('reset')).id);assert.equal((await reserve(next)).reason,'rate_limit');
});

test('every non-reset kind shares the reserve, and provider observations cannot lower floors',async()=>{
  for(const tipo of ['bienvenida','mensaje','contacto','reporte','perfil_incompleto','resumen_mensual']) {await reset();await q(`insert into email_preferences(perfil_id,email,marketing_opt_in) values(2,'fixture2@example.invalid',true)`);const job=await claim((await enqueue(tipo)).id);assert.equal((await reserve(job,{daily:70})).reason,'non_urgent_daily_budget',tipo);await rpc('mail_observe_usage',[1,0]);assert.equal((await q(`select used from email_budget where period_kind='day'`))[0].used,70);}
});

test('profile deletion cascades queued notices and older budget buckets cannot starve new days',async()=>{
  await reset();const id=await insertMessage();await q('delete from perfiles where id=2');assert.equal(await jobFor(id),undefined);assert.equal(await count('mensajes'),0);
  await q(`insert into email_budget(period_kind,period_end,used) values('day',date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC',90)`);const job=await claim((await enqueue('reset',3)).id);assert.equal((await reserve(job)).allowed,true);assert.equal((await rpc('mail_usage_snapshot')).emails.daily.used,1);
});

test('ambiguous attempts older than 23 hours remain quarantined and payload mutations fail',async()=>{
  await reset();let job=await enqueue('reset');await q(`update email_outbox set first_attempt_at=clock_timestamp()-interval '23 hours 1 second',attempts=1 where id=$1`,[job.id]);assert.equal(await claim(job.id),null);assert.equal((await q('select status from email_outbox where id=$1',[job.id]))[0].status,'uncertain');
  job=await claim((await enqueue('reset')).id);assert.equal((await reserve(job)).allowed,true);await unpace();assert.equal((await reserve(job,{payloadHash:'b'.repeat(64)})).reason,'payload_changed');assert.equal((await q(`select used from email_budget where period_kind='day'`))[0].used,1);
});
