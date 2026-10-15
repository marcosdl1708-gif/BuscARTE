import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Exercise the real ESM endpoint, shared session verification and moderation
// helper. All I/O crosses this single fail-closed, synthetic fetch boundary.
// This suite never reads credentials or calls a live database/user/mail API.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network denied during import'); };
const { default: moderation, config } = await import('../netlify/functions/moderacion.mjs');
const { default: datos } = await import('../netlify/functions/datos.mjs');
const { mailService,createMailService } = await import('../netlify/lib/mail-runtime.mjs');
globalThis.fetch = originalFetch;

const web = 'https://buscarte.com.ar';
const database = 'https://xiaanchoanxmampegoay.supabase.co';
const key = 'sb_secret_synthetic_moderation_fixture_not_a_credential';
const token = Buffer.alloc(32, 19).toString('base64url');
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const password = 'synthetic-moderation-password-placeholder';
const cookie = '__Host-ba_session=' + token;
const ownId = '701';
const otherId = '702';
const requestId = '6cf106b0-c2c0-4846-9494-31e4597d4ef4';
const report = (patch = {}) => ({ action:'report', perfil_id:otherId, reason:'abuso', detail:'Texto de prueba sintético', request_id:requestId, ...patch });
const response = (value, status = 200) => new Response(value === undefined ? null : JSON.stringify(value), {
  status, headers:{ 'content-type':'application/json' }
});

function request(options = {}) {
  const { method = 'GET', query = '?perfil_id=' + otherId } = options;
  const rawBody = Object.hasOwn(options,'rawBody') ? options.rawBody : Object.hasOwn(options,'body') ? JSON.stringify(options.body) : undefined;
  return new Request(web + '/.netlify/functions/moderacion' + query, {
    method,
    headers:{ origin:web, 'sec-fetch-site':'same-origin', 'x-nf-client-connection-ip':'192.0.2.19',
      ...(options.signed === false ? {} : { cookie }), ...(rawBody === undefined ? {} : { 'content-type':'application/json' }),
      ...(options.headers || {}) },
    ...(rawBody === undefined ? {} : { body:rawBody })
  });
}
const post = body => request({ method:'POST', query:'', body });
const dataRequest = (path,options = {}) => new Request(web + '/.netlify/functions/datos?path=' + encodeURIComponent(path),{
  method:options.method || 'GET',
  headers:{ origin:web,'sec-fetch-site':'same-origin','x-nf-client-connection-ip':'192.0.2.19',cookie,
    ...(options.body === undefined ? {} : {'content-type':'application/json'}),...(options.headers || {}) },
  ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)})
});

async function fixture(options = {}, run) {
  const beforeFetch = globalThis.fetch, beforeNetlify = globalThis.Netlify;
  const beforeMail = { enqueue:mailService.enqueue,dispatch:mailService.dispatch };
  const env = { SUPABASE_URL:database, SUPABASE_SERVICE_ROLE_KEY:key, ADMIN_EMAIL:'admin@example.invalid', ...options.env };
  const calls = [], unexpected = [], reports = new Map(), notifications = [], dispatches = [], jobs = new Map();
  const blocks = new Set(options.blocks || []);
  const state = () => ({ blocked_by_me:blocks.has(ownId + ':' + otherId),
    restricted:blocks.has(ownId + ':' + otherId) || blocks.has(otherId + ':' + ownId) });
  const apiCalls = (path, method) => calls.filter(call => call.url.pathname === path && (!method || call.method === method));
  const moderationCalls = () => calls.filter(call => /\/rpc\/(estado_bloqueo_web|gestionar_bloqueo_web|reportar_usuario_web)$/.test(call.url.pathname));
  globalThis.Netlify = { env:{ get:name => env[name] || '' } };
  mailService.enqueue = async payload => {
    if (payload.tipo === 'reporte') {
      assert(reports.size > 0,'admin notification must only follow a confirmed durable report');
      assert.equal(payload.destinatario,'admin@example.invalid','the recipient is fixed server-side, not an untrusted client address');
      assert.equal(payload.eventKey,'moderation-report:9201','deduplication is tied to the durable report, not a new send attempt');
    } else {
      assert.equal(payload.tipo,'mensaje');
      assert(apiCalls('/rest/v1/mensajes','POST').length > 0);
      assert.equal(payload.eventKey,'message:6101');
    }
    notifications.push(structuredClone(payload));
    if (options.mailQueueFails) throw new Error('Synthetic private queue failure');
    if (!jobs.has(payload.eventKey)) jobs.set(payload.eventKey,{ id:'synthetic-job-9201' });
    return jobs.get(payload.eventKey);
  };
  mailService.dispatch = async jobId => {
    dispatches.push(jobId);
    if (options.mailDispatchFails) throw new Error('Synthetic private provider failure');
    return { status:'sent',id:'synthetic-provider-id' };
  };
  globalThis.fetch = async (href, init = {}) => {
    const url = new URL(href), method = init.method || 'GET', headers = new Headers(init.headers || {});
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url, method, headers, body });
    if (url.origin !== database) {
      unexpected.push(url.href);
      throw new Error('Unexpected request: no native transport available');
    }
    assert.equal(headers.get('apikey'), key, 'only the configured synthetic server key authorizes backend calls');
    assert.equal(headers.get('authorization'), null, 'a secret key is not a user Bearer token');
    assert.equal(init.redirect, 'error', 'backend redirects cannot leak privileged headers');
    assert(init.signal, 'every backend operation is bounded by an abort signal');
    if (options.failAll) return response({ details:'private synthetic database detail' }, 500);
    if (url.pathname === '/rest/v1/rpc/estado_terminos_web') return response({version:'2026-10-15',accepted:true});
    if (url.pathname === '/rest/v1/sesiones_web' && method === 'GET') {
      assert.equal(url.searchParams.get('select'), 'perfil_id,password_fingerprint');
      assert.match(url.searchParams.get('expires_at'), /^gt\./);
      const valid = url.searchParams.get('token_hash') === 'eq.' + digest(token) && !options.expired;
      return response(valid ? [{ perfil_id:ownId, password_fingerprint:digest(options.changedPassword ? 'old-password' : password) }] : []);
    }
    if (url.pathname === '/rest/v1/perfiles' && method === 'GET' && url.searchParams.get('id') === 'eq.' + ownId) {
      return response(options.deleted ? [] : [{ id:ownId, nombre:'Persona sintética', email:'owner@example.invalid',
        tipo_cuenta:'artista', rubro:'musica', password, baneado:!!options.banned, disciplinas:null, perfil_revision:0 }]);
    }
    if (url.pathname === '/rest/v1/perfiles' && method === 'GET' && url.searchParams.get('id') === 'eq.' + otherId) {
      return response([{id:otherId,nombre:'Otra persona sintética',email:'recipient@example.invalid',baneado:false}]);
    }
    if (['/rest/v1/mensajes','/rest/v1/conversaciones'].includes(url.pathname)) {
      if (method === 'GET') {
        if (url.pathname.endsWith('/conversaciones')) return response([{
          id:'8101',user1_id:options.foreignConversation ? '998' : ownId,user2_id:options.foreignConversation ? '999' : otherId,
          ultimo_mensaje:'Historial sintético conservado'
        }]);
        return response([{id:'6101',de_user_id:ownId,para_user_id:otherId,contenido:'Historial sintético conservado',leido:false}]);
      }
      if (options.triggerDenial) return response({code:'42501',message:'COMMUNICATION_BLOCKED',detail:'private synthetic row'},403);
      assert(['POST','PATCH'].includes(method));
      return response([{...body,id:url.pathname.endsWith('/mensajes') ? '6101' : '8101'}],method === 'POST' ? 201 : 200);
    }
    if (url.pathname === '/rest/v1/rpc/limitar_operacion_web' && method === 'POST') {
      assert.match(body.p_actor_hash,/^[a-f0-9]{64}$/);
      return response(options.denyScope !== body.p_scope && !options.denyRate);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/') && ['estado_bloqueo_web','gestionar_bloqueo_web','reportar_usuario_web'].includes(url.pathname.split('/').at(-1))) {
      assert.equal(method,'POST');
      if (options.rpcStatus) return response({ code:options.rpcCode || 'XX000', message:options.rpcMessage || 'private synthetic moderation detail' }, options.rpcStatus);
      if (Object.hasOwn(options,'rpcResult')) return response(options.rpcResult);
      assert.equal(body.p_actor_id,ownId,'the actor must come from the verified cookie, not a public payload/header');
      assert.equal(body.p_otro_id,options.otherId || otherId);
      if (url.pathname.endsWith('/estado_bloqueo_web')) {
        assert.deepEqual(Object.keys(body).sort(),['p_actor_id','p_otro_id']);
        return response(state());
      }
      if (url.pathname.endsWith('/gestionar_bloqueo_web')) {
        assert.deepEqual(Object.keys(body).sort(),['p_actor_id','p_bloquear','p_otro_id']);
        assert.equal(typeof body.p_bloquear,'boolean');
        if (body.p_bloquear) blocks.add(ownId + ':' + otherId); else blocks.delete(ownId + ':' + otherId);
        return response(state());
      }
      assert.deepEqual(Object.keys(body).sort(),['p_actor_id','p_conversacion_id','p_detail','p_otro_id','p_reason','p_request_id']);
      assert.equal(body.p_request_id,requestId);
      assert(['abuso','spam','suplantacion','contenido','seguridad_infantil','otro'].includes(body.p_reason));
      const known = reports.get(body.p_request_id);
      if (known) return response({ ok:true, id:known.id });
      const row = { ...body, id:'9201' }; reports.set(body.p_request_id,row);
      return response({ ok:true,id:row.id });
    }
    unexpected.push({ url:url.href, method });
    throw new Error('Unexpected backend request: no native transport available');
  };
  try {
    await run({ calls, apiCalls, moderationCalls, blocks, reports,notifications,dispatches,jobs });
    assert.deepEqual(unexpected,[],'no request may silently fall through to real transport');
  } finally {
    globalThis.fetch = beforeFetch;
    Object.assign(mailService,beforeMail);
    if (beforeNetlify === undefined) delete globalThis.Netlify; else globalThis.Netlify = beforeNetlify;
  }
}

test('moderation is a native bounded function and private responses are never cacheable', async () => {
  assert.equal(config.path,'/.netlify/functions/moderacion');
  assert.equal(config.rateLimit.action,'rate_limit');
  await fixture({},async () => {
    const result = await moderation(request());
    assert.equal(result.status,200);
    assert.equal(result.headers.get('cache-control'),'no-store');
    assert.equal(result.headers.get('x-content-type-options'),'nosniff');
    assert.deepEqual(await result.json(),{ blocked_by_me:false,restricted:false });
  });
});

test('block/unblock returns confirmed persisted state and cannot remove the other user block', async () => {
  await fixture({ blocks:[otherId + ':' + ownId] },async ({ blocks, moderationCalls }) => {
    assert.deepEqual(await (await moderation(post({ action:'block',perfil_id:otherId }))).json(),{ blocked_by_me:true,restricted:true });
    assert(blocks.has(ownId + ':' + otherId));
    assert.deepEqual(await (await moderation(post({ action:'unblock',perfil_id:otherId }))).json(),{ blocked_by_me:false,restricted:true });
    assert(blocks.has(otherId + ':' + ownId));
    assert(!blocks.has(ownId + ':' + otherId));
    assert.equal(moderationCalls().length,2);
  });
});

test('missing, duplicate, forged, expired and invalidated cookie never authorizes a moderation RPC', async () => {
  const cases = [
    [{}, { signed:false }], [{},{ headers:{ cookie:'__Host-ba_session=701' } }],
    [{},{ headers:{ cookie:cookie + '; ' + cookie } }],
    [{},{ headers:{ cookie:'__Host-ba_session=' + Buffer.alloc(32,20).toString('base64url') } }],
    [{ expired:true },{}], [{ banned:true },{}], [{ deleted:true },{}], [{ changedPassword:true },{}]
  ];
  for (const [setup, options] of cases) await fixture(setup,async ({ moderationCalls }) => {
    for (const value of [request(options), request({ method:'POST', query:'', body:{ action:'block',perfil_id:otherId },...options })]) {
      const result = await moderation(value);
      assert.equal(result.status,401);
      assert.equal((await result.json()).code,'SESSION_REQUIRED');
    }
    assert.equal(moderationCalls().length,0);
  });
});

test('client authorization and actor fields cannot replace server cookie identity', async () => {
  await fixture({},async ({ moderationCalls }) => {
    const result = await moderation(request({ signed:false, headers:{ authorization:'Bearer synthetic-user-999', apikey:key,'x-user-id':'999' } }));
    assert.equal(result.status,401);
    for (const name of ['actor_id','p_actor_id','user_id','de_user_id','reportante_id']) {
      const rejected = await moderation(post({ action:'block',perfil_id:otherId,[name]:'999' }));
      assert.equal(rejected.status,400,name);
    }
    assert.equal(moderationCalls().length,0);
    assert.equal((await moderation(request({ headers:{ authorization:'Bearer synthetic-user-999','x-user-id':'999' } }))).status,200);
    assert.equal(moderationCalls()[0].body.p_actor_id,ownId);
  });
});

test('every mutation rejects absent, cross-origin, sibling-origin and cross-site CSRF before any backend call', async () => {
  const headers = [{ origin:'' },{ origin:'null' },{ origin:'https://evil.example.invalid' },
    { origin:'https://www.buscarte.com.ar' },{ 'sec-fetch-site':'cross-site' },{ 'sec-fetch-site':'same-site' }];
  for (const value of headers) await fixture({},async ({ calls }) => {
    for (const body of [{ action:'block',perfil_id:otherId },{ action:'unblock',perfil_id:otherId },report()]) {
      const result = await moderation(request({ method:'POST',query:'',body,headers:value }));
      assert.equal(result.status,403);
    }
    assert.equal(calls.length,0);
  });
});

test('methods and strict GET query reject duplicate, unexpected, self and malformed identifiers', async () => {
  await fixture({},async ({ moderationCalls }) => {
    for (const method of ['PUT','PATCH','DELETE','OPTIONS','HEAD']) assert.equal((await moderation(request({ method }))).status,405,method);
    for (const query of ['', '?perfil_id=702&perfil_id=999','?perfil_id=702&actor_id=999','?perfil_id=701',
      '?perfil_id=0','?perfil_id=-2','?perfil_id=2.5','?perfil_id=7e2','?perfil_id=%20%20702','?perfil_id=0702',
      '?perfil_id=9999999999999999','?perfil_id=eq.702','?perfil_id=702%00']) {
      assert.equal((await moderation(request({ query }))).status,400,query);
    }
    assert.equal(moderationCalls().length,0);
  });
});

test('strict mutation actions and bodies reject ambiguous, unsafe or overlarge input', async () => {
  const cases = [null,[],{}, { action:'delete',perfil_id:otherId },{ action:'block' },
    { action:'block',perfil_id:ownId },{ action:'block',perfil_id:0 },{ action:'block',perfil_id:[702] },
    { action:'block',perfil_id:{ id:702 } },{ action:'block',perfil_id:otherId,blocked_by_me:false },
    { action:'unblock',perfil_id:otherId,request_id:requestId }];
  await fixture({},async ({ moderationCalls }) => {
    for (const body of cases) assert.equal((await moderation(post(body))).status,400,JSON.stringify(body));
    for (const rawBody of ['{broken', '{"action":"block","perfil_id":"702","__proto__":{"admin":true}}',
      '{"action":"block","perfil_id":"702","constructor":{}}', ' '.repeat(32769) + '{}']) {
      assert.equal((await moderation(request({ method:'POST',query:'',rawBody }))).status,400);
    }
    assert.equal((await moderation(request({ method:'POST',query:'',body:{ action:'block',perfil_id:otherId },headers:{ 'content-type':'text/plain' } }))).status,415);
    assert.equal(moderationCalls().length,0);
  });
});

test('reports persist verified actor/context/idempotency and queue a fixed admin notification only after confirmation', async () => {
  await fixture({},async ({ moderationCalls, reports, calls,notifications,jobs }) => {
    const first = await moderation(post(report({ conversacion_id:'8101' })));
    assert.equal(first.status,200); assert.deepEqual(await first.json(),{ ok:true,id:'9201' });
    assert.deepEqual(await (await moderation(post(report({ conversacion_id:'8101' })))).json(),{ ok:true,id:'9201' });
    assert.equal(reports.size,1);
    assert.equal(jobs.size,1,'a retried report cannot create a distinct administrative mail event');
    assert(notifications.length > 0);
    const [call] = moderationCalls();
    assert.deepEqual(call.body,{ p_actor_id:ownId,p_otro_id:otherId,p_conversacion_id:'8101',p_reason:'abuso',p_detail:'Texto de prueba sintético',p_request_id:requestId });
    assert(!calls.some(value => /email|resend|send|mail|queue/.test(value.url.pathname)));
  });
});

test('mail queue/provider failure never erases or falsely rejects an already durable report', async () => {
  for (const setup of [{ mailQueueFails:true },{ mailDispatchFails:true }]) await fixture(setup,async ({ reports,notifications }) => {
    const result = await moderation(post(report()));
    assert.equal(result.status,200); assert.deepEqual(await result.json(),{ ok:true,id:'9201' });
    assert.equal(reports.size,1); assert.equal(notifications.length,1);
  });
});

test('all six report reasons retain exact private detail without exposing it in the response', async () => {
  for (const reason of ['abuso','spam','suplantacion','contenido','seguridad_infantil','otro']) await fixture({},async ({ moderationCalls }) => {
    const result = await moderation(post(report({ reason,detail:'Contenido <script>no se renderiza</script> \n Privado' })));
    assert.equal(result.status,200);
    const body = await result.json();
    assert.equal(body.ok,true); assert(!JSON.stringify(body).includes('Privado'));
    assert.equal(moderationCalls()[0].body.p_reason,reason);
    assert.equal(moderationCalls()[0].body.p_conversacion_id,null);
  });
});

test('reports reject forged actors, invalid context/reasons/UUIDs and unsafe or excessive detail', async () => {
  const cases = [{ actor_id:'999' },{ p_actor_id:'999' },{ reportante_id:'999' },{ estado:'resuelto' },
    { reason:'unknown' },{ reason:'' },{ reason:['spam'] },{ detail:[] },{ detail:{ html:'x' } },{ detail:'\0' },
    { detail:'x'.repeat(2001) },{ request_id:'' },{ request_id:'not-a-uuid' },{ request_id:701 },
    { conversacion_id:'0' },{ conversacion_id:'1 OR 1=1' },{ conversacion_id:[8101] },{ perfil_id:ownId }];
  await fixture({},async ({ moderationCalls }) => {
    for (const patch of cases) assert.equal((await moderation(post(report(patch)))).status,400,JSON.stringify(patch));
    assert.equal(moderationCalls().length,0);
  });
});

test('rate denials stop state reads and writes with neutral retry feedback', async () => {
  await fixture({ denyRate:true },async ({ moderationCalls,apiCalls }) => {
    for (const value of [request(),post({ action:'block',perfil_id:otherId }),post({ action:'unblock',perfil_id:otherId }),post(report())]) {
      assert.equal((await moderation(value)).status,429);
    }
    assert.equal(moderationCalls().length,0);
    assert(apiCalls('/rest/v1/rpc/limitar_operacion_web').every(call => Number(call.body.p_limit) > 0 && Number(call.body.p_seconds) > 0));
  });
});

test('reports use an additional hourly actor limit, not only the shared endpoint limit', async () => {
  await fixture({},async ({ apiCalls }) => {
    assert.equal((await moderation(post(report()))).status,200);
    const limits = apiCalls('/rest/v1/rpc/limitar_operacion_web').map(call => call.body);
    assert(limits.some(body => body.p_limit === 5 && body.p_seconds === 60));
    assert(limits.some(body => body.p_limit === 10 && body.p_seconds === 3600));
  });
});

test('backend/configuration outage never claims an unconfirmed block or report succeeded', async () => {
  for (const setup of [{ failAll:true },{ rpcStatus:500 },{ rpcStatus:404,rpcCode:'PGRST202' },
    { env:{ SUPABASE_SERVICE_ROLE_KEY:'' } },{ env:{ SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_fixture_not_a_server_key' } }]) {
    await fixture(setup,async () => {
      for (const value of [request(),post({ action:'block',perfil_id:otherId }),post(report())]) {
        const result = await moderation(value);
        assert(result.status >= 500);
        const body = await result.text();
        assert(!body.includes('private synthetic')); assert(!body.includes(key)); assert(!body.includes(token));
      }
    });
  }
});

test('malformed successful RPC bodies fail closed rather than grant unrestricted contact or invent report ids', async () => {
  for (const rpcResult of [null,[],{},true,{ blocked_by_me:false },{ blocked_by_me:'false',restricted:false },{ blocked_by_me:true,restricted:false }]) {
    await fixture({ rpcResult },async () => {
      for (const value of [request(),post({ action:'block',perfil_id:otherId })]) {
        const result = await moderation(value);
        assert(result.status >= 500);
        assert.equal((await result.json()).code,'MODERATION_UNAVAILABLE');
      }
    });
  }
  for (const rpcResult of [null,[],{},false,{ ok:false },{ ok:true },{ ok:true,id:'unsafe-id' }]) await fixture({ rpcResult },async () => {
    assert((await moderation(post(report()))).status >= 400);
  });
});

test('database policy denial maps to neutral 400/403 without leaking internal detail', async () => {
  await fixture({ rpcStatus:400,rpcCode:'22023' },async () => {
    const result = await moderation(post(report({ conversacion_id:'8101' })));
    assert.equal(result.status,400); assert(!(await result.text()).includes('private synthetic'));
  });
  await fixture({ rpcStatus:403,rpcCode:'42501',rpcMessage:'COMMUNICATION_BLOCKED' },async () => {
    const result = await moderation(post({ action:'block',perfil_id:otherId }));
    assert.equal(result.status,403); assert.equal((await result.json()).code,'COMMUNICATION_BLOCKED');
  });
});

const communicationWrites = () => [
  dataRequest('/rest/v1/mensajes',{method:'POST',body:{de_user_id:ownId,para_user_id:otherId,contenido:'Sólo fixture'}}),
  dataRequest('/rest/v1/conversaciones',{method:'POST',body:{user1_id:ownId,user2_id:otherId}}),
  dataRequest('/rest/v1/conversaciones?id=eq.8101',{method:'PATCH',body:{ultimo_mensaje:'Sólo fixture'}})
];

test('either direction of block stops messages, new conversations and preview updates server-side', async () => {
  for (const blocks of [[ownId + ':' + otherId],[otherId + ':' + ownId]]) await fixture({blocks},async ({apiCalls,notifications}) => {
    for (const value of communicationWrites()) {
      const result = await datos(value);
      assert.equal(result.status,403);
      assert.equal((await result.json()).code,'COMMUNICATION_BLOCKED');
    }
    for (const path of ['/rest/v1/mensajes','/rest/v1/conversaciones']) {
      assert.equal(apiCalls(path,'POST').length,0);
      assert.equal(apiCalls(path,'PATCH').length,0);
    }
    assert.equal(notifications.length,0);
  });
});

test('unavailable or malformed block protection also stops all contact writes and notification enqueue', async () => {
  for (const setup of [{rpcStatus:404,rpcCode:'PGRST202'},{rpcStatus:500},{rpcResult:{}},{rpcResult:{blocked_by_me:false,restricted:'false'}}]) {
    await fixture(setup,async ({apiCalls,notifications}) => {
      for (const value of communicationWrites()) {
        const result = await datos(value);
        assert.equal(result.status,503);
        assert.equal((await result.json()).code,'MODERATION_UNAVAILABLE');
      }
      assert.equal(apiCalls('/rest/v1/mensajes','POST').length,0);
      assert.equal(apiCalls('/rest/v1/conversaciones','POST').length,0);
      assert.equal(apiCalls('/rest/v1/conversaciones','PATCH').length,0);
      assert.equal(notifications.length,0);
    });
  }
});

test('database trigger race after an allowed preflight remains an explicit block, not a fake success', async () => {
  await fixture({triggerDenial:true},async ({notifications,apiCalls}) => {
    for (const value of communicationWrites()) {
      const result = await datos(value);
      assert.equal(result.status,403);
      const body = await result.json();
      assert.equal(body.code,'COMMUNICATION_BLOCKED');
      assert(!JSON.stringify(body).includes('private synthetic'));
    }
    assert.equal(apiCalls('/rest/v1/mensajes','POST').length,1);
    assert.equal(apiCalls('/rest/v1/conversaciones','POST').length,1);
    assert.equal(apiCalls('/rest/v1/conversaciones','PATCH').length,1);
    assert.equal(notifications.length,0);
  });
});

test('a block preserves readable own history with authoritative owner constraints and no dependency on state RPC', async () => {
  await fixture({blocks:[ownId + ':' + otherId],rpcStatus:500},async ({apiCalls,moderationCalls}) => {
    for (const path of ['/rest/v1/mensajes?select=id,contenido&de_user_id=eq.999',
      '/rest/v1/conversaciones?select=id,ultimo_mensaje&or=(user1_id.eq.999,user2_id.eq.999)']) {
      const result = await datos(dataRequest(path));
      assert.equal(result.status,200);
      assert.match(JSON.stringify(await result.json()),/Historial sintético conservado/);
    }
    assert.equal(moderationCalls().length,0,'unavailable protection must not destroy read-only access to existing history');
    assert.match(apiCalls('/rest/v1/mensajes','GET')[0].url.searchParams.get('and'),/or\(de_user_id\.eq\.701,para_user_id\.eq\.701\)/);
    assert.match(apiCalls('/rest/v1/conversaciones','GET')[0].url.searchParams.get('and'),/or\(user1_id\.eq\.701,user2_id\.eq\.701\)/);
  });
});

test('preview patch requires one exact owned conversation and cannot bulk edit by client boolean filters', async () => {
  await fixture({},async ({apiCalls}) => {
    for (const suffix of ['', '?id=neq.8101','?id=in.(8101,8102)','?or=(id.eq.8101,id.eq.8102)','?id=eq.8101&id=eq.8102']) {
      assert((await datos(dataRequest('/rest/v1/conversaciones' + suffix,{method:'PATCH',body:{ultimo_mensaje:'No bulk'}}))).status >= 400,suffix);
    }
    assert.equal(apiCalls('/rest/v1/conversaciones','PATCH').length,0);
  });
  await fixture({foreignConversation:true},async ({apiCalls,moderationCalls}) => {
    assert.equal((await datos(dataRequest('/rest/v1/conversaciones?id=eq.8101',{method:'PATCH',body:{ultimo_mensaje:'No foreign'}}))).status,403);
    assert.equal(apiCalls('/rest/v1/conversaciones','PATCH').length,0);
    assert.equal(moderationCalls().length,0,'an unrelated conversation must fail ownership before exposing its counterpart to moderation');
  });
});

test('forged sender and participants are denied before block lookup and can never bypass on behalf of another user', async () => {
  await fixture({},async ({apiCalls,moderationCalls}) => {
    for (const [table,body] of [['mensajes',{de_user_id:'999',para_user_id:otherId,contenido:'spoof'}],
      ['conversaciones',{user1_id:'998',user2_id:'999'}]]) {
      assert.equal((await datos(dataRequest('/rest/v1/' + table,{method:'POST',body}))).status,403);
      assert.equal(apiCalls('/rest/v1/' + table,'POST').length,0);
    }
    assert.equal(moderationCalls().length,0);
  });
});

test('new moderation tables and service-only RPCs are not proxyable through the general data gateway', async () => {
  await fixture({},async ({calls}) => {
    for (const path of ['/rest/v1/bloqueos_web','/rest/v1/reportes_usuarios_web','/rest/v1/rpc/estado_bloqueo_web',
      '/rest/v1/rpc/gestionar_bloqueo_web','/rest/v1/rpc/reportar_usuario_web']) {
      const result = await datos(dataRequest(path,{method:'POST',body:{p_actor_id:'999',p_otro_id:otherId}}));
      assert.equal(result.status,403,path);
      assert(!calls.some(call => call.url.pathname === path),path + ' must not reach the privileged backend');
    }
  });
});

test('unblocked conversations still create, send and update previews without changing confirmed sender', async () => {
  await fixture({},async ({apiCalls,notifications}) => {
    for (const [index,value] of communicationWrites().entries()) {
      const result = await datos(value);
      assert.equal(result.status,index === 2 ? 200 : 201);
    }
    assert.equal(apiCalls('/rest/v1/mensajes','POST')[0].body.de_user_id,ownId);
    assert.equal(apiCalls('/rest/v1/conversaciones','POST')[0].body.ultimo_mensaje,'');
    assert.equal(notifications.length,1);
  });
});

test('moderation status strips arbitrary backend fields and never names who blocked whom', async () => {
  await fixture({rpcResult:{blocked_by_me:false,restricted:true,blocked_by_other:true,other_email:'private@example.invalid'}},async () => {
    const result = await moderation(request());
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{blocked_by_me:false,restricted:true});
  });
});

function mailFixture(options = {}) {
  const stamp = new Date('2026-10-15T15:00:00.000Z');
  const secret = 'synthetic-moderation-mail-secret-over-thirty-two-characters';
  const job = {id:requestId,event_key:'message:6101',tipo:'mensaje',perfil_id:otherId,recipient:'recipient@example.invalid',
    data:{remitente:'Persona sintética',preview:'Contenido sintético'},category:'transactional',priority:10,status:'leased',
    lease_token:'synthetic-lease-9201',first_attempt_at:null,...options.job};
  const person = {id:otherId,email:'recipient@example.invalid',nombre:'Destinatario sintético',baneado:false};
  const calls = [], posts = [], finished = [], unexpected = [];
  let stateReads = 0, reserved = false;
  const db = async (path,init = {}) => {
    const input = init.body ? JSON.parse(init.body) : null;
    calls.push({path,input,method:init.method || 'GET'});
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.split('/').at(-1);
      if (name === 'mail_claim') return structuredClone(job);
      if (name === 'estado_bloqueo_web') {
        assert.deepEqual(input,{p_actor_id:ownId,p_otro_id:otherId});
        stateReads++;
        if (options.stateFails || (options.lateStateFails && stateReads > 1)) throw new Error('Synthetic unavailable moderation state');
        if (Object.hasOwn(options,'stateResult')) return options.stateResult;
        return {blocked_by_me:false,restricted:!!options.blocked || !!options.lateBlock && reserved};
      }
      if (name === 'mail_prepare') return input.p_payload;
      if (name === 'mail_usage_snapshot') return {emails:{daily:{used:0,limit:100,resets_at:'2026-10-16T00:00:00.000Z'},
        monthly:{used:0,limit:3000,resets_at:'2026-11-01T00:00:00.000Z'}}};
      if (name === 'mail_reserve') { reserved = true;return {allowed:true}; }
      if (name === 'mail_finish') {finished.push(input);return true;}
    }
    if (path.startsWith('/rest/v1/perfiles?')) return [person];
    if (path.startsWith('/rest/v1/email_preferences?')) return [{marketing_opt_in:false,onboarding_disabled:false}];
    if (path.startsWith('/rest/v1/mensajes?')) {
      const url = new URL(database + path);
      assert.equal(url.searchParams.get('id'),'eq.6101');
      assert.equal(url.searchParams.get('select'),'id,de_user_id,para_user_id');
      if (Object.hasOwn(options,'messageRows')) return structuredClone(options.messageRows);
      return [{id:'6101',de_user_id:ownId,para_user_id:otherId}];
    }
    if (path.startsWith('/rest/v1/email_outbox?')) {
      const url = new URL(database + path);
      assert.equal(url.searchParams.get('id'),'eq.' + requestId);
      assert.equal(url.searchParams.get('select'),'status,lease_token');
      return [{status:options.cancelledLease ? 'cancelled' : 'leased',lease_token:options.wrongLease ? 'different-lease' : job.lease_token}];
    }
    unexpected.push(path);
    throw new Error('Unrecognized fixture DB operation; native network is unavailable');
  };
  const transport = async (url,init) => {
    assert.equal(url,'https://api.resend.com/emails');
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    assert.equal(init.headers['Idempotency-Key'],'buscarte/' + requestId);
    posts.push({url,init});
    return response({id:'synthetic-provider-id'});
  };
  const service = createMailService({backendJson:db,fetch:transport,
    environment:name => name === 'RESEND_API_KEY' ? 'synthetic-provider-key' : '',secret:() => secret,now:() => stamp});
  return {service,calls,posts,finished,unexpected,stateReads:() => stateReads};
}

test('message mail verifies durable message id, sender, recipient and moderation both before rendering and provider', async () => {
  const f = mailFixture();
  assert.equal((await f.service.dispatch(requestId)).status,'sent');
  assert.equal(f.posts.length,1); assert.equal(f.stateReads(),2);
  assert.equal(f.calls.filter(value => value.path.startsWith('/rest/v1/mensajes?')).length,2);
  const lastDb = f.calls.findLastIndex(value => value.path.startsWith('/rest/v1/email_outbox?'));
  const reserve = f.calls.findIndex(value => value.path.endsWith('/mail_reserve'));
  assert(lastDb > reserve,'lease and state must be rechecked after quota waits/reservation');
  assert.equal(f.finished.at(-1).p_status,'sent');
  assert.deepEqual(f.unexpected,[]);
});

test('already blocked or newly blocked queued message mail cancels without reaching provider', async () => {
  for (const options of [{blocked:true},{lateBlock:true}]) {
    const f = mailFixture(options);
    assert.equal((await f.service.dispatch(requestId)).status,'cancelled');
    assert.equal(f.posts.length,0);
    assert.equal(f.finished.at(-1).p_status,'cancelled');
    assert.equal(f.finished.at(-1).p_error,'communication_blocked');
    assert.deepEqual(f.unexpected,[]);
  }
});

test('unknown state or state outage defers message mail and never treats protection failure as unrestricted', async () => {
  for (const options of [{stateFails:true},{lateStateFails:true},{stateResult:{}},{stateResult:{blocked_by_me:false,restricted:null}}]) {
    const f = mailFixture(options);
    assert.equal((await f.service.dispatch(requestId)).status,'deferred');
    assert.equal(f.posts.length,0);
    assert.equal(f.finished.at(-1).p_status,'retry');
    assert.deepEqual(f.unexpected,[]);
  }
});

test('legacy, fabricated or mismatched message event keys cannot send a user notification', async () => {
  const cases = [{job:{event_key:'event:legacy'}},{job:{event_key:'message:0'}},{job:{event_key:'message:6101:extra'}},
    {messageRows:[]},{messageRows:[{id:'6102',de_user_id:ownId,para_user_id:otherId}]},
    {messageRows:[{id:'6101',de_user_id:ownId,para_user_id:'999'}]},
    {messageRows:[{id:'6101',de_user_id:otherId,para_user_id:otherId}]},
    {messageRows:[{id:'6101',de_user_id:'bad',para_user_id:otherId}]},
    {messageRows:[{id:'6101',de_user_id:ownId,para_user_id:otherId},{id:'6101',de_user_id:ownId,para_user_id:otherId}]}];
  for (const options of cases) {
    const f = mailFixture(options);
    assert.equal((await f.service.dispatch(requestId)).status,'cancelled');
    assert.equal(f.posts.length,0);
    assert.equal(f.finished.at(-1).p_error,'message_unverified');
    assert.deepEqual(f.unexpected,[]);
  }
});

test('cancelled or replaced outbox lease cannot be resurrected after a successful message preflight', async () => {
  for (const options of [{cancelledLease:true},{wrongLease:true}]) {
    const f = mailFixture(options);
    assert.equal((await f.service.dispatch(requestId)).status,'cancelled');
    assert.equal(f.posts.length,0);
    assert.equal(f.finished.at(-1).p_error,'message_cancelled');
    assert.deepEqual(f.unexpected,[]);
  }
});

test('the security fixture cannot use native transport, an environment credential or live user email', () => {
  const source = readFileSync(new URL(import.meta.url),'utf8');
  assert(!source.includes('process' + '.env'));
  assert(source.includes('globalThis.fetch = async'));
  assert(source.includes('@example.invalid'));
});
