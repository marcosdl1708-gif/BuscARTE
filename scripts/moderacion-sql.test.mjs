import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Real, in-memory PostgreSQL/WASM. No production credentials, transport or mail.
// Supply an already installed module without adding a runtime dependency:
// BUSCARTE_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js
const modulePath = process.env.BUSCARTE_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(path.join(root, 'supabase/migrations/20261015125839_user_blocks_reports.sql'), 'utf8');
const db = new PGlite();
const q = async (sql, params=[]) => (await db.query(sql, params)).rows;
const rpc = async (name, params) => (await q(`select public.${name}(${params.map((_, i) => '$'+(i+1)).join(',')}) as value`, params))[0].value;
const block = (a=1,b=2,value=true) => rpc('gestionar_bloqueo_web',[a,b,value]);
const state = (a=1,b=2) => rpc('estado_bloqueo_web',[a,b]);
const report = ({a=1,b=2,conversation=null,reason='abuso',detail='',request=randomUUID()}={}) => rpc('reportar_usuario_web',[a,b,conversation,reason,detail,request]);
const sqlError = (code, message) => error => error.code === code && (!message || error.message.includes(message));
const reject = (promise, code, message) => assert.rejects(promise, sqlError(code,message));
const count = async table => (await q(`select count(*)::int as n from public.${table}`))[0].n;

await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.perfiles(id bigint primary key,email text,baneado boolean default false,tipo_cuenta text default 'artista',nombre text,foto_url text,bio text,provincia text,ciudad text,rubro text default 'musica',instrumento text,campos_especificos jsonb,disciplinas jsonb,reset_token text,reset_expires timestamptz);
create table public.conversaciones(id bigint generated always as identity primary key,created_at timestamptz default now(),user1_id bigint references public.perfiles on delete cascade,user2_id bigint references public.perfiles on delete cascade,anuncio_id bigint,ultimo_mensaje text default '',updated_at timestamptz default now());
create table public.mensajes(id bigint generated always as identity primary key,created_at timestamptz default now(),de_user_id bigint references public.perfiles on delete cascade,para_user_id bigint references public.perfiles on delete cascade,anuncio_id bigint,contenido text not null,leido boolean default false);
alter table public.perfiles enable row level security; alter table public.conversaciones enable row level security; alter table public.mensajes enable row level security;
grant select,insert,update,delete on public.perfiles,public.conversaciones,public.mensajes to service_role;
grant usage on sequence public.conversaciones_id_seq,public.mensajes_id_seq to service_role;
create function public.login_usuario(text,text) returns text language sql as $$ select 'legacy-unchanged'::text $$;
revoke all on function public.login_usuario(text,text) from public,anon,authenticated;
grant execute on function public.login_usuario(text,text) to service_role;`);
await db.exec(readFileSync(path.join(root,'supabase/migrations/20261015121825_email_engagement_queue.sql'),'utf8'));
const legacyBefore = await q(`select proname,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace order by oid`);
await db.exec(migration);
after(async()=>{ await db.close(); });

async function reset() {
  await db.exec(`reset role; truncate public.perfiles restart identity cascade;
    insert into public.perfiles(id,email,nombre) select n,'fixture'||n||'@example.invalid','Fixture '||n from generate_series(1,4) as n;
    set role service_role;`);
}
async function conversation(a=1,b=2) {
  return (await q(`insert into public.conversaciones(user1_id,user2_id,ultimo_mensaje,anuncio_id) values($1,$2,'Original',77) returning id`,[a,b]))[0].id;
}
async function message(a=1,b=2) {
  return (await q(`insert into public.mensajes(de_user_id,para_user_id,contenido) values($1,$2,'Original') returning id`,[a,b]))[0].id;
}
async function job(messageId,status='pending',tipo='mensaje') {
  const id=randomUUID(),lease=status==='leased'?randomUUID():null;
  await q(`insert into public.email_outbox(id,event_key,tipo,perfil_id,recipient,data,category,priority,due_at,expires_at,status,lease_token,lease_until)
    values($1,$2,$3,2,'fixture2@example.invalid','{}','transactional',10,now()-interval '1 minute',now()+interval '1 day',$4,$5,case when $5::uuid is null then null else now()+interval '1 minute' end)`,
    [id,'message:'+messageId,tipo,status,lease]);
  return {id,lease};
}

test('new private tables and identity sequence have RLS/grants closed to browser roles',async()=>{
  await reset();
  const tables=await q(`select relname,relrowsecurity from pg_class where oid in ('public.bloqueos_usuarios'::regclass,'public.reportes_usuarios'::regclass)`);
  assert.equal(tables.length,2);assert(tables.every(item=>item.relrowsecurity));
  for(const role of ['anon','authenticated']) for(const table of ['bloqueos_usuarios','reportes_usuarios']) {
    assert.equal((await q(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed`,[role,'public.'+table]))[0].allowed,false);
    await db.exec(`set role ${role}`);await reject(q(`select * from public.${table}`),'42501');await db.exec('reset role');
  }
  assert.equal((await q(`select has_sequence_privilege('anon','public.reportes_usuarios_id_seq','USAGE') as allowed`))[0].allowed,false);
  assert.equal((await q(`select has_sequence_privilege('service_role','public.reportes_usuarios_id_seq','USAGE') as allowed`))[0].allowed,true);
});

test('all 9 new routines are invoker, empty search_path, and service-only',async()=>{
  const routines=await q(`select oid,proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and (proname like 'moderacion_%' or proname in ('estado_bloqueo_web','gestionar_bloqueo_web','reportar_usuario_web'))`);
  assert.equal(routines.length,9);
  for(const routine of routines) {
    assert.equal(routine.prosecdef,false);assert(routine.proconfig.includes('search_path=""'));
    for(const role of ['anon','authenticated','service_role']) assert.equal((await q(`select has_function_privilege($1,$2,'EXECUTE') as allowed`,[role,routine.oid]))[0].allowed,role==='service_role');
  }
});

test('new migration preserves all existing mail and legacy routine definitions',async()=>{
  for(const routine of legacyBefore) assert.equal((await q(`select pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and proname=$1`,[routine.proname]))[0].definition,routine.definition);
  assert.match(migration,/pg_advisory_xact_lock/);
});

test('anonymous/authenticated RPC calls cannot forge an actor',async()=>{
  await reset();
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);await reject(block(),'42501');await reject(state(),'42501');await reject(report(),'42501');await db.exec('reset role');
  }
  assert.equal(await count('bloqueos_usuarios'),0);assert.equal(await count('reportes_usuarios'),0);
});

test('clear state, idempotent block and unblock preserve the directional owner',async()=>{
  await reset();assert.deepEqual(await state(),{blocked_by_me:false,restricted:false});
  assert.deepEqual(await block(),{blocked_by_me:true,restricted:true});
  const before=(await q('select created_at from bloqueos_usuarios'))[0].created_at;
  assert.deepEqual(await block(),{blocked_by_me:true,restricted:true});assert.equal(await count('bloqueos_usuarios'),1);
  assert.equal((await q('select created_at from bloqueos_usuarios'))[0].created_at.getTime(),before.getTime());
  assert.deepEqual(await state(2,1),{blocked_by_me:false,restricted:true});
  await block(2,1);assert.deepEqual(await block(1,2,false),{blocked_by_me:false,restricted:true});
  assert.deepEqual(await block(2,1,false),{blocked_by_me:false,restricted:false});
  assert.deepEqual(await block(2,1,false),{blocked_by_me:false,restricted:false});
});

test('null/self/missing/nonpositive actors and null action fail without writes',async()=>{
  await reset();
  for(const args of [[1,1],[null,2],[1,null],[0,2],[-1,2],[1,99]]) {
    await reject(state(...args),'22023','INVALID_MODERATION_PAIR');await reject(block(...args),'22023','INVALID_MODERATION_PAIR');
    await reject(report({a:args[0],b:args[1]}),'22023','INVALID_MODERATION_PAIR');
  }
  await reject(block(1,2,null),'22023','INVALID_BLOCK_ACTION');assert.equal(await count('bloqueos_usuarios'),0);
});

test('pair key handles full 64-bit IDs symmetrically without 32-bit casts',async()=>{
  await reset();
  const a='2147483648',b='9223372036854775806';
  await q(`insert into perfiles(id,email) values($1,'large1@example.invalid'),($2,'large2@example.invalid')`,[a,b]);
  await db.exec('begin');
  try {
    await rpc('moderacion_lock_par',[a,b]);await rpc('moderacion_lock_par',[b,a]);
    const keys=(await q(`select hashtextextended('buscarte:communication:v1:'||least($1::bigint,$2::bigint)::text||':'||greatest($1::bigint,$2::bigint)::text,0)::text as forward,
      hashtextextended('buscarte:communication:v1:'||least($2::bigint,$1::bigint)::text||':'||greatest($2::bigint,$1::bigint)::text,0)::text as reverse`,[a,b]))[0];
    assert.equal(keys.forward,keys.reverse);
    assert.deepEqual(await block(a,b),{blocked_by_me:true,restricted:true});
  } finally { await db.exec('rollback'); }
});

test('older repeatable snapshots fail closed rather than missing a newly committed block',async()=>{
  await reset();await db.exec('begin isolation level repeatable read');
  try { await reject(block(),'40001','MODERATION_REQUIRES_READ_COMMITTED'); } finally {await db.exec('rollback');}
  assert.equal(await count('bloqueos_usuarios'),0);
});

test('message insert is stopped in both directions at the database boundary',async()=>{
  await reset();await block();
  await reject(message(1,2),'42501','COMMUNICATION_BLOCKED');await reject(message(2,1),'42501','COMMUNICATION_BLOCKED');
  assert.equal(await count('mensajes'),0);await message(1,3);assert.equal(await count('mensajes'),1);
});

test('unblock restores inserts while preexisting history and read receipts remain intact',async()=>{
  await reset();const id=await message();const conv=await conversation();await block();
  await q('update mensajes set leido=true where id=$1',[id]);
  assert.deepEqual((await q('select contenido,leido from mensajes where id=$1',[id]))[0],{contenido:'Original',leido:true});
  assert.equal((await q('select ultimo_mensaje from conversaciones where id=$1',[conv]))[0].ultimo_mensaje,'Original');
  await block(1,2,false);await message();assert.equal(await count('mensajes'),2);
});

test('conversation creation cannot bypass a block in either direction',async()=>{
  await reset();await block();await reject(conversation(1,2),'42501','COMMUNICATION_BLOCKED');await reject(conversation(2,1),'42501','COMMUNICATION_BLOCKED');
  await conversation(1,3);assert.equal(await count('conversaciones'),1);
});

test('blocked preview/timestamp changes fail; ad cleanup and identical writes still work',async()=>{
  await reset();const id=await conversation();await block();
  await reject(q('update conversaciones set ultimo_mensaje=$2 where id=$1',[id,'Should not persist']),'42501','COMMUNICATION_BLOCKED');
  await reject(q(`update conversaciones set updated_at=now()+interval '1 second' where id=$1`,[id]),'42501','COMMUNICATION_BLOCKED');
  await q('update conversaciones set ultimo_mensaje=ultimo_mensaje where id=$1',[id]);
  await q('update conversaciones set anuncio_id=null where id=$1',[id]);
  assert.deepEqual((await q('select ultimo_mensaje,anuncio_id from conversaciones where id=$1',[id]))[0],{ultimo_mensaje:'Original',anuncio_id:null});
});

test('participants cannot be changed to sidestep the conversation guard',async()=>{
  await reset();const id=await conversation();
  await reject(q('update conversaciones set user2_id=3 where id=$1',[id]),'42501','CONVERSATION_PARTICIPANTS_IMMUTABLE');
});

test('direct service block inserts guard subsequent messages in the same transaction',async()=>{
  await reset();await db.exec('begin');
  try {
    await q('insert into bloqueos_usuarios(actor_id,otro_id) values(1,2)');
    assert.deepEqual(await state(),{blocked_by_me:true,restricted:true});
  } finally {await db.exec('commit');}
  await reject(message(),'42501','COMMUNICATION_BLOCKED');
});

test('block cancels pending/retry/leased message notifications only, preserving sent/history',async()=>{
  await reset();const records=[];
  for(const status of ['pending','retry','leased','sent','failed','uncertain']) records.push({status,...await job(await message(),status)});
  const unrelated=await job(await message(1,3));const otherType=await job(await message(),'pending','reporte');
  const messages=await count('mensajes');await block();
  for(const entry of records) {
    const actual=(await q('select status,lease_token,last_error from email_outbox where id=$1',[entry.id]))[0];
    if(['pending','retry','leased'].includes(entry.status)) assert.deepEqual(actual,{status:'cancelled',lease_token:null,last_error:'communication_blocked'});
    else assert.equal(actual.status,entry.status);
  }
  for(const entry of [unrelated,otherType]) assert.equal((await q('select status from email_outbox where id=$1',[entry.id]))[0].status,'pending');
  assert.equal(await count('mensajes'),messages);
});

test('cancelled lease cannot complete or revive an old notification',async()=>{
  await reset();const pending=await job(await message(),'leased');await block();
  assert.equal(await rpc('mail_finish',[pending.id,pending.lease,'sent','fake-provider-id',null,null]),false);
  assert.equal((await q('select status from email_outbox where id=$1',[pending.id]))[0].status,'cancelled');
});

test('dispatcher can revalidate a delayed enqueue against the committed block',async()=>{
  await reset();const id=await message();await block();const delayed=await job(id);
  assert.equal((await q('select status from email_outbox where id=$1',[delayed.id]))[0].status,'pending');
  assert.deepEqual(await state(),{blocked_by_me:true,restricted:true});
  // A pre-existing legacy mail RPC can still enqueue; dispatcher integration is
  // deliberately tested by the runtime suite, not misrepresented as SQL fencing.
});

test('report without context persists once and does not block or enqueue mail itself',async()=>{
  await reset();const result=await report({reason:'seguridad_infantil',detail:'Private fixture evidence'});
  assert.equal(result.ok,true);assert(result.id>0);assert.equal(await count('reportes_usuarios'),1);
  assert.equal(await count('bloqueos_usuarios'),0);assert.equal(await count('email_outbox'),0);
});

test('conversation context accepts only the exact pair in either ordering',async()=>{
  await reset();const id=await conversation(2,1);
  assert.equal((await report({conversation:id})).ok,true);
  assert.equal((await report({a:2,b:1,conversation:id})).ok,true);
  assert.equal(await count('reportes_usuarios'),2);
});

test('report rejects missing, third-party, or wrong-target conversation IDs without IDOR',async()=>{
  await reset();const mine=await conversation(1,3),other=await conversation(3,4);
  for(const conversationId of [mine,other,999]) await reject(report({conversation:conversationId}),'42501','REPORT_CONTEXT_FORBIDDEN');
  assert.equal(await count('reportes_usuarios'),0);
});

test('ASCII reason allowlist, max detail and request ID are validated in SQL',async()=>{
  await reset();
  for(const reason of [null,'','ABUSO','niñez','spam<script>']) await reject(report({reason}),'22023','INVALID_REPORT');
  await reject(report({detail:'x'.repeat(2001)}),'22023','INVALID_REPORT');await reject(report({request:null}),'22023','INVALID_REPORT');
  for(const reason of ['abuso','spam','suplantacion','contenido','seguridad_infantil','otro']) assert.equal((await report({reason,detail:'é'.repeat(2000)})).ok,true);
});

test('exact report retries are idempotent and detail normalization is consistent',async()=>{
  await reset();const request=randomUUID(),first=await report({request,detail:' Text '});
  assert.deepEqual(await report({request,detail:'Text'}),first);assert.equal(await count('reportes_usuarios'),1);
});

test('changed target, context, reason or detail cannot reuse an actor/request ID',async()=>{
  await reset();const request=randomUUID(),conv=await conversation();await report({request,conversation:conv,detail:'original'});
  for(const change of [{b:3},{conversation:null},{reason:'spam'},{detail:'changed'}]) await reject(report({request,conversation:conv,detail:'original',...change}),'22023','REPORT_REQUEST_CONFLICT');
  assert.equal(await count('reportes_usuarios'),1);
});

test('request IDs are scoped per actor while same actor retries stay deduplicated',async()=>{
  await reset();const request=randomUUID();
  const first=await report({request});const second=await report({request,a:2,b:1});assert.notEqual(first.id,second.id);
  const copies=await Promise.all([report({request}),report({request})]);assert(copies.every(item=>item.id===first.id));
  assert.equal(await count('reportes_usuarios'),2);
});

test('conversation SET NULL preserves retry identity via immutable request context',async()=>{
  await reset();const conv=await conversation(),request=randomUUID(),result=await report({request,conversation:conv});
  await q('delete from conversaciones where id=$1',[conv]);
  const row=(await q('select conversacion_id,request_conversacion_id from reportes_usuarios where id=$1',[result.id]))[0];
  assert.deepEqual(row,{conversacion_id:null,request_conversacion_id:conv});
  assert.deepEqual(await report({request,conversation:conv}),result);
  await reject(report({request,conversation:null}),'22023','REPORT_REQUEST_CONFLICT');
});

test('profile deletion cascades safety records without deleting unrelated chat history',async()=>{
  await reset();await report();await block();const unrelated=await message(3,4);await q('delete from perfiles where id=2');
  assert.equal(await count('reportes_usuarios'),0);assert.equal(await count('bloqueos_usuarios'),0);
  assert.equal((await q('select id from mensajes where id=$1',[unrelated])).length,1);
});

test('database constraints also reject direct invalid safety writes',async()=>{
  await reset();
  await reject(q('insert into bloqueos_usuarios(actor_id,otro_id) values(1,1)'),'23514');
  await reject(q(`insert into reportes_usuarios(actor_id,otro_id,reason,detail,request_id) values(1,2,'unsafe','',$1)`,[randomUUID()]),'23514');
  await reject(q(`insert into reportes_usuarios(actor_id,otro_id,reason,detail,request_id) values(1,2,'otro',$1,$2)`,['x'.repeat(2001),randomUUID()]),'23514');
});

test('fixture uses PostgreSQL and unchanged migration bytes with no application network',async()=>{
  assert.match((await q('select version() as version'))[0].version,/PostgreSQL/);
  assert.equal(createHash('sha256').update(readFileSync(path.join(root,'supabase/migrations/20261015125839_user_blocks_reports.sql'))).digest('hex'),createHash('sha256').update(migration).digest('hex'));
});

test('two-session block/send contention needs standalone PostgreSQL, not PGlite single-user',t=>{
  // PGlite 0.3.16 is PostgreSQL single-user mode; advisory calls execute, but
  // pg_locks exposes no advisory locks and a second concurrent backend is absent.
  // Do not mislabel Promise.all on its serialized queue as a concurrency proof.
  t.skip('Requires two independent PostgreSQL sessions; not available in this isolated WASM fixture.');
});
