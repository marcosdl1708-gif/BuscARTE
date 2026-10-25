const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Hermetic server fixtures. Native fetch, real env, credentials, SMTP, API
// clients and sockets are never exposed inside these VMs.
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const production = 'https://buscarte.com.ar';
const backendOrigin = 'https://xiaanchoanxmampegoay.supabase.co';
const token = 'a'.repeat(64);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sessionToken = Buffer.alloc(32, 7).toString('base64url');
const sessionPassword = 'synthetic-bcrypt-placeholder';
const fixtureKey = 'sb_secret_synthetic_fixture_key_not_a_credential';
const fixtureEnv = {
  SUPABASE_URL:backendOrigin, SUPABASE_SERVICE_ROLE_KEY:fixtureKey,
  RESEND_API_KEY:'synthetic_resend_key_not_a_credential',
  URL:production, ADMIN_EMAIL:'admin@example.invalid'
};
const plain = value => JSON.parse(JSON.stringify(value));
function request(payload, options = {}) {
  return new Request(production + '/.netlify/functions/' + (options.function || 'send-email'), {
    method:options.method || 'POST',
    headers:{ 'content-type':'application/json', origin:production,
      'sec-fetch-site':'same-origin', 'x-nf-client-connection-ip':'192.0.2.7',
      ...(options.headers || {}) },
    ...(options.method === 'GET' ? {} : { body:options.raw === undefined ? JSON.stringify(payload) : options.raw })
  });
}
function runtime(file, options = {}) {
  const calls = [], unexpected = [], logs = [], queued = [], dispatched = [], planned = [], env = { ...fixtureEnv, ...options.env };
  const state = { resetUsed:false };
  const response = (status, data, extra = {}) => new Response(JSON.stringify(data), {
    status, headers:{ 'content-type':'application/json', ...extra }
  });
  const transport = async (href, init = {}) => {
    const url = new URL(href), method = init.method || 'GET';
    calls.push({ url:url.href, method, body:init.body, headers:plain(init.headers || {}) });
    if (url.origin === backendOrigin) {
      assert.equal(init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(init.headers.Authorization, undefined, 'opaque service keys must not become Bearer tokens');
      if (options.backendFails) return response(503, { private:'synthetic database detail must never escape' });
      if (url.pathname === '/rest/v1/rpc/limitar_operacion_web' && method === 'POST') {
        return response(200, options.rateAllowed !== false);
      }
      if (url.pathname === '/rest/v1/sesiones_web' && method === 'GET') {
        return response(200, [{ perfil_id:701, password_fingerprint:digest(sessionPassword) }]);
      }
      if (url.pathname === '/rest/v1/perfiles' && method === 'GET') {
        if (url.searchParams.get('email')?.startsWith('eq.')) return response(200, options.exists === false ? [] : [{ id:701, nombre:'Persona fixture', email:'user@example.invalid' }]);
        if (url.searchParams.has('reset_token')) return response(200, options.validToken === false ? [] : [{ id:701, nombre:'Persona fixture', reset_expires:options.expires || new Date(Date.now() + 3600000).toISOString() }]);
        if (url.searchParams.get('select')?.includes('password')) return response(200, [{ id:701, nombre:'Autor real', email:'user@example.invalid', password:sessionPassword, baneado:false }]);
        return response(200, options.users || []);
      }
      if (url.pathname === '/rest/v1/perfiles' && method === 'PATCH') {
        const body = JSON.parse(init.body);
        assert.match(body.reset_token, /^[a-f0-9]{64}$/);
        assert(Number.isFinite(Date.parse(body.reset_expires)));
        state.resetHash = body.reset_token;
        return new Response(null, { status:204 });
      }
      if (url.pathname === '/rest/v1/rpc/consumir_reset_password' && method === 'POST') {
        const body = JSON.parse(init.body);
        assert.deepEqual(Object.keys(body).sort(), ['p_nueva_password', 'p_token_hash']);
        assert.equal(body.p_token_hash, digest(token));
        assert.equal(body.p_nueva_password, options.passwordExpected || 'new-secret-fixture');
        // Atomic fixture mirrors the required database contract: only one
        // UPDATE can consume this valid hash, even during concurrent calls.
        if (options.validToken === false || state.resetUsed) return response(200, false);
        state.resetUsed = true;
        return response(200, true);
      }
      if (url.pathname === '/rest/v1/anuncios' && method === 'GET') {
        return response(200, [], { 'content-range':'0-0/4' });
      }
    }
    unexpected.push(url.href);
    throw new Error('Unexpected fixture request');
  };
  const context = vm.createContext({
    Request, Response, Headers, URL, URLSearchParams, Buffer, TextDecoder, AbortSignal,
    process:{ env }, Netlify:{ env:{ get:name => env[name] || '' } },
    __crypto:crypto, fetch:transport,
    console:{ log:(...args) => logs.push(args), warn:(...args) => logs.push(args), error:(...args) => logs.push(args) },
    setTimeout:callback => { callback(); return 1; }, clearTimeout:() => {}
  });
  context.__mailService={
    enqueue:async value=>{
      queued.push(plain(value));
      if(options.queueFails)throw new Error('Synthetic private queue error');
      return{id:'11111111-2222-4333-8444-555555555555'};
    },
    dispatch:async id=>{
      dispatched.push(id);
      if(options.dispatchThrows)throw new Error('Synthetic private provider error');
      return options.mailFails||options.deferred?{status:'deferred',reason:'provider_unknown'}:{status:'sent',id:'synthetic-resend-message'};
    }
  };
  context.__planner={
    planProfileReminders:async()=>{planned.push('profile');if(!context.__security.serverConfig()||options.plannerFails)throw new Error('configuration');return 120;},
    planFortnightlySummary:async()=>{planned.push('fortnightly');if(!context.__security.serverConfig()||options.plannerFails||options.fortnightlyPlannerFails)throw new Error('configuration');return 2;},
    planMonthlySummary:async()=>{planned.push('monthly');if(!context.__security.serverConfig()||options.plannerFails)throw new Error('configuration');return 332;}
  };
  const disciplines = read('netlify/lib/disciplinas.mjs').replace(/^export /gm, '');
  vm.runInContext('(function(){\n' + disciplines + '\n;globalThis.__normalizeDisciplines = normalizeDisciplines;\n})();', context, { timeout:1000 });
  const helper = read('netlify/lib/session.mjs')
    .replace(/^import \{([^}]+)\} from 'node:crypto';\s*/m, 'const {$1} = __crypto;\n')
    .replace(/^import \{ normalizeDisciplines \} from '\.\/disciplinas\.mjs';\s*/m, 'const normalizeDisciplines = __normalizeDisciplines;\n')
    .replace(/^export /gm, '');
  vm.runInContext('(function(){\n' + helper + '\n;globalThis.__security = { internalMailSecret, rate, readJson, serverConfig, sessionUser, trustedOrigin };\n})();', context, { timeout:1000 });
  let source = read('netlify/functions/' + file);
  if (file.endsWith('.mjs')) {
    source = source.replace(/^import \{([^}]+)\} from 'node:crypto';\s*/m, 'const {$1} = __crypto;\n')
      .replace(/^import \{([^}]+)\} from '\.\.\/lib\/session\.mjs';\s*/m, 'const {$1} = __security;\n')
      .replace(/^import \{ mailService \} from '\.\.\/lib\/mail-runtime\.mjs';\s*/m, 'const mailService=__mailService;\n')
      .replace('export default async function ', 'async function ')
      .replace(/^export /gm, '');
    const handlerName = file === 'send-email.mjs' ? 'sendEmail' : 'resetPassword';
    source += `\n;globalThis.__handler = ${handlerName}; globalThis.__config = config;`;
  } else {
    context.exports = {};
    source = source.replace("await import('../lib/session.mjs')", 'await Promise.resolve(__security)');
    source = source.replace("await import('../lib/mail-planner.mjs')", 'await Promise.resolve(__planner)');
    source += '\n;globalThis.__handler = exports.handler;';
  }
  vm.runInContext('(function(){\n' + source + '\n})();', context, { timeout:1000 });
  return { handle:context.__handler, config:plain(context.__config || {}),
    secret:() => context.__security.internalMailSecret(), calls, queued, dispatched, planned, unexpected, logs, state };
}

test('mail handlers delegate durable sending and do not bypass quota through direct provider requests', () => {
  for(const file of ['send-email.mjs','reset-password.mjs']) {
    assert(read('netlify/functions/'+file).includes("from '../lib/mail-runtime.mjs'"));
    assert(!read('netlify/functions/'+file).includes('https://api.resend.com/emails'));
  }
  assert(read('netlify/lib/mail-templates.mjs').includes('export function buildEmail'));
});
test('native rate limits retain function endpoint names and no CORS is returned', async () => {
  for (const [file, maximum] of [['send-email.mjs',180], ['reset-password.mjs',20]]) {
    const run = runtime(file);
    assert.equal(run.config.path, production.replace(production, '') + '/.netlify/functions/' + file.replace('.mjs',''));
    assert.equal(run.config.rateLimit.windowLimit, maximum);
    const res = await run.handle(request({}, { method:'GET', function:file.replace('.mjs','') }));
    assert.equal(res.status,405);
    assert.equal(res.headers.get('access-control-allow-origin'),null);
    assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal(run.calls.length,0);
    assert.equal(run.queued.length,0);
  }
});
for (const type of ['bienvenida','mensaje','novedades','resumen_mensual','perfil_incompleto','reset']) {
  test(type + ' rejects browser calls and accepts only the server secret', async () => {
    const run = runtime('send-email.mjs');
    const payload = { tipo:type, destinatario:'user@example.invalid', datos:{ nombre:'Persona', preview:'fixture' } };
    assert.equal((await run.handle(request(payload))).status,403);
    assert.equal(run.calls.length,0);
    assert.equal(run.queued.length,0);
    const result = await run.handle(request(payload, { headers:{ 'x-buscarte-secret':run.secret() } }));
    assert.equal(result.status,200);
    assert.equal(run.queued.length,1);
    assert.equal(run.dispatched.length,1);
    assert.equal(run.queued[0].tipo,type);
    assert.equal(run.queued[0].destinatario,'user@example.invalid');
    assert.equal(run.unexpected.length,0);
  });
}
test('missing internal secret/service key and wrong secret fail closed', async () => {
  const missing = runtime('send-email.mjs', { env:{ SUPABASE_SERVICE_ROLE_KEY:'', INTERNAL_SECRET:'' } });
  const body = { tipo:'bienvenida', destinatario:'user@example.invalid', datos:{} };
  assert.equal((await missing.handle(request(body, { headers:{ 'x-buscarte-secret':'forged' } }))).status,403);
  assert.equal(missing.calls.length,0);
  assert.equal(missing.queued.length,0);
  const configured = runtime('send-email.mjs');
  assert.equal((await configured.handle(request(body, { headers:{ 'x-buscarte-secret':configured.secret().replace(/^./,'x') } }))).status,403);
  assert.equal(configured.calls.length,0);
  assert.equal(configured.queued.length,0);
});
test('derived secret is deterministic; long configured legacy secret remains compatible', () => {
  const derived = runtime('send-email.mjs');
  assert.equal(derived.secret(),crypto.createHmac('sha256',fixtureKey).update('buscarte-internal-mail-v1').digest('hex'));
  const explicit = 'synthetic-explicit-internal-secret-32-plus';
  assert.equal(runtime('send-email.mjs', { env:{ INTERNAL_SECRET:explicit } }).secret(),explicit);
});
const contact = { tipo:'contacto', destinatario:'attacker@example.invalid', datos:{ nombre:'Persona', email:'reply@example.invalid', asunto:'Consulta', mensaje:'Hola fixture' } };
test('public contact requires correct origin and forces admin recipient', async () => {
  const run = runtime('send-email.mjs');
  assert.equal((await run.handle(request(contact, { headers:{ origin:'https://evil.example.invalid' } }))).status,403);
  assert.equal((await run.handle(request(contact, { headers:{ origin:'' } }))).status,403);
  assert.equal(run.calls.length,0);
  assert.equal(run.queued.length,0);
  assert.equal((await run.handle(request(contact))).status,200);
  const sent = run.queued[0];
  assert.equal(sent.destinatario,'admin@example.invalid');
  assert.equal(sent.datos.email,'reply@example.invalid');
  assert.equal(run.unexpected.length,0);
});
test('contact rejects excessive/invalid data and honors distributed limiter', async () => {
  const run = runtime('send-email.mjs');
  assert.equal((await run.handle(request({ ...contact, datos:{ ...contact.datos, mensaje:'x'.repeat(3001) } }))).status,400);
  assert.equal((await run.handle(request(contact, { raw:'x'.repeat(16385) }))).status,400);
  assert.equal((await run.handle(request(contact, { headers:{ 'content-type':'text/plain' } }))).status,415);
  assert.equal(run.queued.length,0);
  const limited = runtime('send-email.mjs', { rateAllowed:false });
  assert.equal((await limited.handle(request(contact))).status,429);
  assert.equal(limited.calls.length,1);
  assert.equal(limited.queued.length,0);
});
test('report sender is validated by real session, not supplied reporter ID', async () => {
  const run = runtime('send-email.mjs');
  const body = { tipo:'reporte', datos:{ perfilId:'702', motivo:'Spam', reporterId:'999', reporterNombre:'Spoofed' } };
  assert.equal((await run.handle(request(body))).status,401);
  assert.equal(run.queued.length,0);
  assert.equal((await run.handle(request(body, { headers:{ cookie:'__Host-ba_session=' + sessionToken } }))).status,200);
  const sent = run.queued[0];
  assert.equal(sent.datos.reporterNombre,'Autor real');
  assert.equal(sent.datos.reporterId,'701');
  assert(!JSON.stringify(sent).includes('Spoofed'));
  assert.equal(run.unexpected.length,0);
});
test('provider deferral acknowledges durable queue while queue failures hide details and private contents', async () => {
  const run = runtime('send-email.mjs', { mailFails:true });
  const res = await run.handle(request(contact));
  assert.equal(res.status,202);
  assert.deepEqual(await res.json(),{ok:true,queued:true,id:'11111111-2222-4333-8444-555555555555'});
  assert.equal(run.queued.length,1);
  assert.equal(run.logs.length,0);
  const failed=runtime('send-email.mjs',{queueFails:true});
  const result=await failed.handle(request(contact));assert.equal(result.status,503);assert(!JSON.stringify(await result.json()).includes('Synthetic'));assert.equal(failed.dispatched.length,0);assert.equal(failed.logs.length,0);
});
test('reset validates origin, body, configuration and rate before protected work', async () => {
  const run = runtime('reset-password.mjs');
  const body = { accion:'solicitar', email:'user@example.invalid' };
  assert.equal((await run.handle(request(body, { headers:{ origin:'https://evil.example.invalid' } }))).status,403);
  assert.equal(run.calls.length,0);
  assert.equal(run.queued.length,0);
  const missing = runtime('reset-password.mjs', { env:{ SUPABASE_SERVICE_ROLE_KEY:'' } });
  assert.equal((await missing.handle(request(body))).status,503);
  assert.equal(missing.calls.length,0);
  assert.equal(missing.queued.length,0);
  const limited = runtime('reset-password.mjs', { rateAllowed:false });
  assert.equal((await limited.handle(request(body))).status,429);
  assert.equal(limited.calls.length,1);
  assert.equal(limited.queued.length,0);
});
test('reset queues metadata without raw token and keeps existing/nonexistent outcomes neutral', async () => {
  const run = runtime('reset-password.mjs');
  const body = { accion:'solicitar', email:'USER@example.invalid' };
  const positive = await run.handle(request(body));
  assert.deepEqual(await positive.json(),{ ok:true });
  assert.equal(run.queued.length,1);
  assert.equal(run.queued[0].tipo,'reset');assert.equal(run.queued[0].perfilId,701);assert.equal(run.queued[0].destinatario,'user@example.invalid');
  assert.deepEqual(run.queued[0].datos,{nombre:'Persona fixture'});assert.match(run.queued[0].eventKey,/^reset:701:\d+$/);
  assert.equal(run.calls.filter(call=>call.method==='PATCH').length,0,'expiry/token hash starts in quota-controlled dispatch, not request handler');
  assert.equal(run.dispatched.length,1);
  const missing = runtime('reset-password.mjs', { exists:false });
  assert.deepEqual(await (await missing.handle(request(body))).json(),{ ok:true });
  assert.equal(missing.queued.length,0);assert.equal(missing.dispatched.length,0);
  assert.equal(run.unexpected.length,0);
});
test('reset request provider errors remain neutral with no private logging', async () => {
  for (const options of [{ backendFails:true }, { mailFails:true }, { queueFails:true }, { dispatchThrows:true }]) {
    const run = runtime('reset-password.mjs',options);
    assert.deepEqual(await (await run.handle(request({ accion:'solicitar', email:'user@example.invalid' }))).json(),{ ok:true });
    assert.equal(run.logs.length,0);
  }
});
test('reset verification distinguishes invalid/expired links without exposing email', async () => {
  for (const options of [{}, { validToken:false }, { expires:'invalid' }, { expires:new Date(Date.now()-1000).toISOString() }]) {
    const run = runtime('reset-password.mjs',options);
    const value = await (await run.handle(request({ accion:'verificar', token }))).json();
    assert.equal(value.valido,Object.keys(options).length === 0);
    assert(!JSON.stringify(value).includes('example.invalid'));
    assert.equal(run.unexpected.length,0);
  }
});
test('reset changes password via one service-only atomic RPC and rejects replay/concurrency', async () => {
  const run = runtime('reset-password.mjs');
  const body = { accion:'cambiar', token, nueva_password:'new-secret-fixture', p_user_id:999 };
  const parallel = await Promise.all([run.handle(request(body)), run.handle(request(body))]);
  const outcomes = await Promise.all(parallel.map(res => res.json()));
  assert.deepEqual(outcomes.map(value => value.ok).sort(),[false,true]);
  assert.equal((await (await run.handle(request(body))).json()).ok,false);
  assert(!run.calls.some(call => call.url.includes('/rpc/cambiar_password') || call.method === 'PATCH'));
  assert.equal(run.unexpected.length,0);
});
test('invalid token/short password cannot call the password mutation RPC', async () => {
  const run = runtime('reset-password.mjs');
  for (const body of [{ accion:'cambiar', token:'bad', nueva_password:'new-secret-fixture' }, { accion:'cambiar', token, nueva_password:'short' }]) {
    assert.equal((await (await run.handle(request(body))).json()).ok,false);
  }
  assert(!run.calls.some(call => call.url.includes('/rpc/consumir_reset_password')));
});
test('new reset password enforces bcrypt 72 UTF8 bytes, not merely character count', async () => {
  for (const password of ['x'.repeat(73), 'é'.repeat(37), 'valid-length\0']) {
    const run = runtime('reset-password.mjs');
    const res = await run.handle(request({ accion:'cambiar', token, nueva_password:password }));
    if (password.includes('\0')) assert.equal(res.status,400);
    else assert.equal((await res.json()).ok,false);
    assert(!run.calls.some(call => call.url.includes('/rpc/consumir_reset_password')));
  }
  const boundary = 'é'.repeat(36), allowed = runtime('reset-password.mjs', { passwordExpected:boundary });
  assert.equal((await (await allowed.handle(request({ accion:'cambiar', token, nueva_password:boundary }))).json()).ok,true);
});
test('scheduled candidate functions fail closed without configuration and never bypass the queue with HTTP sends', async () => {
  for (const file of ['recordatorio-perfil.js','resumen-mensual.js']) {
    const missing = runtime(file, { scheduled:true, env:{ SUPABASE_SERVICE_ROLE_KEY:'', INTERNAL_SECRET:'' } });
    assert.equal((await missing.handle({})).statusCode,503);
    assert.equal(missing.calls.length,0);
    const run = runtime(file, { scheduled:true, users:[{ id:701, email:'user@example.invalid', nombre:'Persona', foto_url:'', bio:'' }] });
    assert.equal((await run.handle({})).statusCode,200);
    assert.deepEqual(run.planned,file==='recordatorio-perfil.js'?['profile','fortnightly']:['monthly']);
    assert.equal(run.calls.length,0);assert.equal(run.queued.length,0);assert.equal(run.dispatched.length,0);
    if(file==='recordatorio-perfil.js')assert.deepEqual(JSON.parse(run.logs[0][1]),{reminders:120,updates:2});
    assert(!JSON.stringify(run.logs).includes('user@example.invalid'));
    assert.equal(run.unexpected.length,0);
  }
  const fortnightlyFailure=runtime('recordatorio-perfil.js',{fortnightlyPlannerFails:true});
  assert.equal((await fortnightlyFailure.handle({})).statusCode,503);
  assert.deepEqual(fortnightlyFailure.planned,['profile','fortnightly']);
  assert.equal(fortnightlyFailure.calls.length,0);assert.equal(fortnightlyFailure.dispatched.length,0);
  assert.equal(fortnightlyFailure.unexpected.length,0);
});
test('daily candidate generation and five-minute worker replace the fixed 90-recipient monthly slice', async () => {
  const config = read('netlify.toml');
  assert(config.includes('schedule = "0 13 * * *"'));
  assert(config.includes('schedule = "0 13 1 * *"'));
  assert(config.includes('schedule = "*/5 * * * *"'));
  for(const file of ['recordatorio-perfil.js','resumen-mensual.js']) {
    assert(!read('netlify/functions/'+file).includes('SEND_EMAIL_URL'));
    const failed=runtime(file,{plannerFails:true});assert.equal((await failed.handle({})).statusCode,503);assert.equal(failed.calls.length,0);
  }
});
