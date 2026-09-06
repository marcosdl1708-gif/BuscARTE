const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

// No server, browser, credentials or real network. Both versions are evaluated in
// isolated VMs; their only fetch implementation is the synthetic transport below.
// Keep this fixed baseline: it precedes the welcome-only email change.
const root = path.resolve(__dirname, '..');
const baselineCommit = 'e200375';
const origin = 'https://buscarte.test';
const apiOrigin = 'https://backend.example.invalid';
const completeTarget = 'buscARTE_perfil.html#completar';
const expectedLinks = [
  `${origin}/index.html#explorar`,
  `${origin}/buscARTE_login.html?redirect=${encodeURIComponent(completeTarget)}`
];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const baselineCache = new Map();
function baseline(file) {
  if (!baselineCache.has(file)) baselineCache.set(file, execFileSync('git', [
    'show', `${baselineCommit}:${file}`
  ], { cwd:root, encoding:'utf8', maxBuffer:2 * 1024 * 1024, windowsHide:true }));
  return baselineCache.get(file);
}
const normalize = source => source.replace(/\r\n/g, '\n');
const digest = source => createHash('sha256').update(normalize(source)).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const source = read('netlify/functions/send-email.js');
const previousSource = baseline('netlify/functions/send-email.js');
const loginSource = read('buscARTE_login.html');
const profileSource = read('buscARTE_perfil.html');

function sliceBetween(text, start, end) {
  const first = text.indexOf(start);
  const last = text.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, `Missing bounded source markers: ${start} / ${end}`);
  return text.slice(first, last);
}

function withoutWelcome(text) {
  const withoutWelcomeBranch = normalize(text).replace(sliceBetween(normalize(text),
    "  if (tipo === 'bienvenida') {", "  if (tipo === 'mensaje') {"), '<welcome-only>\n');
  // The separately approved reminder block has its own strict 9b75b23 guard in
  // recordatorio-perfil.test.cjs, including exact preservation of welcome.
  return withoutWelcomeBranch.replace(sliceBetween(withoutWelcomeBranch,
    "  if (tipo === 'perfil_incompleto') {", '  return null;'), '<separately-audited-reminder>\n');
}

function response(status, body) {
  return { ok:status >= 200 && status < 300, status,
    json:async () => plain(body), text:async () => JSON.stringify(body) };
}

function emailRuntime(text = source, options = {}) {
  const calls = [], warnings = [], errors = [], unexpected = [];
  const env = {
    URL:origin,
    RESEND_API_KEY:'synthetic-resend-key',
    FROM_EMAIL:'buscARTE fixture <from@example.invalid>',
    ADMIN_EMAIL:'admin@example.invalid',
    SUPABASE_URL:apiOrigin,
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',
    INTERNAL_SECRET:'synthetic-internal-secret',
    ...options.env
  };
  const context = vm.createContext({
    process:{ env }, exports:{}, URL,
    console:{ warn:(...args) => warnings.push(args), error:(...args) => errors.push(args) },
    fetch:async (href, init = {}) => {
      const url = new URL(href);
      const method = init.method || 'GET';
      calls.push({ url:url.href, method, headers:plain(init.headers || {}), body:init.body });
      if (url.origin === apiOrigin && url.pathname === '/rest/v1/perfiles' && method === 'GET') {
        assert.equal(url.searchParams.get('select'), 'id');
        assert.equal(url.searchParams.get('limit'), '1');
        assert.match(url.searchParams.get('email') || '', /^eq\.[^\s]+@example\.invalid$/);
        assert.equal(init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);
        if (options.lookupThrows) throw new Error('Synthetic lookup failure');
        return response(options.lookupStatus || 200,
          options.rows === undefined ? [{ id:701 }] : options.rows);
      }
      if (url.href === 'https://api.resend.com/emails' && method === 'POST') {
        // This hostname is only compared as text: native fetch is never exposed.
        assert.equal(init.headers.Authorization, `Bearer ${env.RESEND_API_KEY}`);
        if (options.resendThrows) throw new Error('Synthetic mail failure');
        return response(options.resendStatus || 200, { id:'synthetic-message-id' });
      }
      unexpected.push({ url:url.href, method });
      throw new Error('Unexpected request in isolated email VM');
    }
  });
  vm.runInContext(text + '\n;globalThis.fixtureBuildEmail = buildEmail;', context,
    { filename:'send-email.in-memory.js', timeout:1000 });
  return {
    build:(type, data) => context.fixtureBuildEmail(type, data),
    handle:event => context.exports.handler(event),
    calls, warnings, errors, unexpected, env
  };
}

function linksIn(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => ({ href:match[1].replace(/&amp;/g, '&'),
      label:match[2].replace(/<[^>]+>/g, '').trim() }));
}

function post(overrides = {}, headers = {}) {
  return { httpMethod:'POST', headers, body:JSON.stringify({
    tipo:'bienvenida', destinatario:'recipient@example.invalid', datos:{ nombre:'Ana' }, ...overrides
  }) };
}

async function runHandler(options = {}, event = post()) {
  const runtime = emailRuntime(source, options);
  const result = await runtime.handle(event);
  assert.deepEqual(runtime.unexpected, [], 'Only synthetic allowlisted requests are permitted');
  return { ...runtime, result:plain(result), sends:runtime.calls.filter(call => call.method === 'POST') };
}

test('welcome baseline preserves shared contracts; approved reminder branch is audited separately', () => {
  assert.equal(digest(withoutWelcome(source)), digest(withoutWelcome(previousSource)));
});

test('registration caller and existing login/profile entry contracts remain unchanged', () => {
  for (const file of ['buscARTE_registro.html', 'buscARTE_login.html', 'buscARTE_perfil.html']) {
    assert.equal(digest(read(file)), digest(baseline(file)), `${file} is outside this block`);
  }
  const registration = read('buscARTE_registro.html');
  const caller = sliceBetween(registration, '    // Email bienvenida', '    personalizarExito();');
  assert.equal((registration.match(/tipo:\s*'bienvenida'/g) || []).length, 1);
  assert.match(caller, /tipo:\s*'bienvenida',[\s\S]{0,120}datos:\s*\{\s*nombre:\s*nombreCompleto\.split\(' '\)\[0\]/);
  assert.match(caller, /\}\)\.catch\(e => console\.error\('Error enviando bienvenida:'/);
});

test('scheduled callers and cadence stay unchanged; no additional welcome campaign', () => {
  for (const file of ['netlify.toml', 'netlify/functions/recordatorio-perfil.js', 'netlify/functions/resumen-mensual.js']) {
    assert.equal(digest(read(file)), digest(baseline(file)), `${file} must not change in this block`);
  }
  assert(!read('site-files.json').includes('bienvenida.test.cjs'), 'Tests are not public site assets');
});

const otherFixtures = [
  { label:'empty', data:{} },
  { label:'null', data:null },
  { label:'populated and escaped', data:{ nombre:'Persona & <fixture>', email:'reply@example.invalid',
    remitente:'Remitente <fixture>', preview:'Texto sintético\n& siguiente línea', asunto:'Prueba\r\nsegura',
    mensaje:'Mensaje de fixture\nSin personas reales', link:`${origin}/buscARTE_reset.html?token=synthetic`,
    url:`${origin}/index.html`, userAgent:'Synthetic fixture', perfilNombre:'Perfil <fixture>', perfilId:'701',
    motivo:'Prueba local', reporterNombre:'Otra persona sintética', reporterId:'702', detalle:'Detalle\n& dato',
    nuevosMusicos:8, nuevosAnuncios:3, mes:'Mes de prueba',
    proximosEventos:[{ titulo:'Evento sintético <sin público>', fecha:'2099-01-01', lugar:'Lugar & fixture' }] } }
];
// perfil_incompleto now has dedicated baseline/content tests; do not reset this
// historical welcome baseline or relax checks on any other template.
for (const type of ['mensaje', 'contacto', 'reset', 'reporte', 'novedades', 'resumen_mensual']) {
  for (const fixture of otherFixtures) test(`${type}: exact baseline output (${fixture.label})`, () => {
    const current = emailRuntime(), previous = emailRuntime(previousSource);
    assert.deepEqual(plain(current.build(type, fixture.data)), plain(previous.build(type, fixture.data)));
    assert.equal(current.calls.length + previous.calls.length, 0, 'Rendering must not call services');
  });
}

test('welcome copy accompanies a minimal profile without musical or ranking claims', () => {
  const runtime = emailRuntime();
  const mail = runtime.build('bienvenida', { nombre:'Ana' });
  assert.equal(mail.subject, 'Ya estás en buscARTE. ¿Por dónde empezamos?');
  assert.match(mail.html, /Qué bueno tenerte por acá/);
  assert.match(mail.html, /perfil inicial/);
  assert.match(mail.html, /No hace falta completar todo para empezar/);
  assert.match(mail.html, /foto/);
  assert.match(mail.html, /email y la contraseña/);
  assert.doesNotMatch(mail.html, /aparecer mejor|aparecen primero|[23] veces|\bjams\b|\bmúsicos\b/i);
  assert.equal(runtime.calls.length, 0);
});

test('welcome has exactly the two existing entry links, explore first and profile second', () => {
  const links = linksIn(emailRuntime().build('bienvenida', { nombre:'Ana' }).html);
  assert.deepEqual(links.map(link => link.href), expectedLinks);
  assert.match(links[0].label, /^Explorar artistas/);
  assert.match(links[1].label, /^Completar mi perfil/);
  const home = read('index.html');
  assert.match(home, /id="explorar"/);
  assert.equal((home.match(/class="rubro-item" href="buscARTE_busqueda.html\?rubro=/g) || []).length, 10);
});

for (const [label, data] of [
  ['omitted', undefined], ['null data', null], ['empty object', {}], ['wrong name key', { name:'Ana' }],
  ['null nombre', { nombre:null }], ['number', { nombre:3 }], ['object', { nombre:{ name:'Ana' } }],
  ['array', { nombre:['Ana'] }], ['whitespace', { nombre:' \n\t ' }]
]) test(`welcome handles absent or unsupported nombre: ${label}`, () => {
  const mail = emailRuntime().build('bienvenida', data);
  assert.match(mail.html, /Hola[.! ,<]/);
  assert.doesNotMatch(mail.html, /undefined|\[object Object\]|Hola\s+(?:<strong>)?(?:3|artista|Ana)/);
  assert.equal(mail.subject, 'Ya estás en buscARTE. ¿Por dónde empezamos?');
});

test('welcome escapes user-provided name as text, never markup or links', () => {
  const mail = emailRuntime().build('bienvenida', { nombre:'Ana & <img src=x onerror="bad()"> \'X\'' });
  for (const escaped of ['&amp;', '&lt;img', '&gt;', '&quot;', '&#039;']) assert(mail.html.includes(escaped));
  assert.doesNotMatch(mail.html, /<img|<script|href="bad/i);
  assert.deepEqual(linksIn(mail.html).map(link => link.href), expectedLinks);
});

test('welcome preserves accented names and caps name length at 80 characters', () => {
  const runtime = emailRuntime();
  assert.match(runtime.build('bienvenida', { nombre:'  María José  ' }).html, /María José/);
  const long = runtime.build('bienvenida', { nombre:'A'.repeat(160) }).html;
  assert(long.includes('A'.repeat(80)));
  assert(!long.includes('A'.repeat(81)));
});

test('welcome subject does not interpolate a name or user-controlled line breaks', () => {
  const mail = emailRuntime().build('bienvenida', { nombre:'Ana\r\nBcc: victim@example.invalid' });
  assert.equal(mail.subject, 'Ya estás en buscARTE. ¿Por dónde empezamos?');
  assert.doesNotMatch(mail.subject, /[\r\n]|Bcc:|victim/);
});

test('welcome link destinations cannot come from submitted datos', () => {
  const mail = emailRuntime().build('bienvenida', { nombre:'Ana', link:'https://evil.invalid/',
    url:'https://evil.invalid/', redirect:'https://evil.invalid/', destinatario:'other@example.invalid' });
  assert.deepEqual(linksIn(mail.html).map(link => link.href), expectedLinks);
});

test('configured BASE_URL is preserved instead of hardcoding a different production host', () => {
  const mail = emailRuntime(source, { env:{ URL:'https://alternate.example.invalid' } }).build('bienvenida', {});
  assert.deepEqual(linksIn(mail.html).map(link => new URL(link.href).origin),
    ['https://alternate.example.invalid', 'https://alternate.example.invalid']);
});

test('welcome handler keeps exactly one lookup and one synthetic send to the caller recipient', async () => {
  const runtime = await runHandler();
  assert.equal(runtime.result.statusCode, 200);
  assert.deepEqual(JSON.parse(runtime.result.body), { ok:true, id:'synthetic-message-id' });
  assert.equal(runtime.calls.length, 2);
  assert.equal(runtime.sends.length, 1);
  const body = JSON.parse(runtime.sends[0].body);
  assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'to']);
  assert.equal(body.from, runtime.env.FROM_EMAIL);
  assert.deepEqual(body.to, ['recipient@example.invalid']);
  assert.equal(body.html, runtime.build('bienvenida', { nombre:'Ana' }).html);
  assert.equal(body.subject, runtime.build('bienvenida', { nombre:'Ana' }).subject);
  assert(!('reply_to' in body));
});

test('recipient is not taken from datos or changed into a list/broadcast', async () => {
  const runtime = await runHandler({}, post({ datos:{ nombre:'Ana', destinatario:'other@example.invalid',
    to:['other@example.invalid'], email:'other@example.invalid' } }));
  assert.equal(runtime.result.statusCode, 200);
  assert.deepEqual(JSON.parse(runtime.sends[0].body).to, ['recipient@example.invalid']);
});

for (const [label, event, options, expectedStatus] of [
  ['preflight', { httpMethod:'OPTIONS' }, {}, 204],
  ['non-POST', { httpMethod:'GET' }, {}, 405],
  ['missing mail configuration', post(), { env:{ RESEND_API_KEY:'' } }, 500],
  ['invalid JSON', { httpMethod:'POST', body:'{invalid' }, {}, 400],
  ['unknown type', post({ tipo:'not-supported' }), {}, 400],
  ['invalid recipient', post({ destinatario:'not-an-email' }), {}, 400],
  ['array of recipients', post({ destinatario:['a@example.invalid', 'b@example.invalid'] }), {}, 400],
  ['unregistered recipient', post(), { rows:[] }, 403]
]) test(`handler contract: ${label} does not send`, async () => {
  const runtime = await runHandler(options, event);
  assert.equal(runtime.result.statusCode, expectedStatus);
  assert.equal(runtime.sends.length, 0);
});

for (const [label, options] of [
  ['configuration missing', { env:{ SUPABASE_URL:'', SUPABASE_SERVICE_ROLE_KEY:'' } }],
  ['lookup HTTP failure', { lookupStatus:503 }], ['lookup throws', { lookupThrows:true }]
]) test(`existing fail-open lookup behavior is unchanged, not newly authorized: ${label}`, async () => {
  // This records a pre-existing security debt; it is not a recommendation to keep
  // fail-open behavior in a separately authorized anti-relay/security block.
  const current = await runHandler(options);
  const previous = emailRuntime(previousSource, options);
  const oldResult = await previous.handle(post());
  assert.equal(current.result.statusCode, oldResult.statusCode);
  assert.equal(current.result.statusCode, 200);
  assert.equal(current.sends.length, 1);
  assert.equal(current.warnings.length, previous.warnings.length);
  assert.deepEqual(previous.unexpected, []);
});

for (const [label, options, status] of [
  ['HTTP error', { resendStatus:503 }, 502], ['transport exception', { resendThrows:true }, 500]
]) test(`mail failure stays non-retrying: ${label}`, async () => {
  const runtime = await runHandler(options);
  assert.equal(runtime.result.statusCode, status);
  assert.equal(runtime.sends.length, 1);
});

test('contact keeps forced admin recipient and validated reply-to', async () => {
  const runtime = await runHandler({}, post({ tipo:'contacto', destinatario:'other@example.invalid',
    datos:{ nombre:'Fixture', email:'reply@example.invalid', mensaje:'Fixture only' } }));
  assert.equal(runtime.result.statusCode, 200);
  assert.equal(runtime.calls.length, 1);
  const body = JSON.parse(runtime.sends[0].body);
  assert.deepEqual(body.to, ['admin@example.invalid']);
  assert.equal(body.reply_to, 'reply@example.invalid');
});

test('internal mail still requires the configured secret; valid secret allows one synthetic send', async () => {
  const denied = await runHandler({}, post({ tipo:'perfil_incompleto' }));
  assert.equal(denied.result.statusCode, 403);
  assert.equal(denied.sends.length, 0);
  const allowed = await runHandler({}, post({ tipo:'perfil_incompleto' },
    { 'x-buscarte-secret':'synthetic-internal-secret' }));
  assert.equal(allowed.result.statusCode, 200);
  assert.equal(allowed.sends.length, 1);
});

function loginRuntime(search, { auth = false, storage = {} } = {}) {
  const stored = new Map(Object.entries(storage));
  const timers = [], calls = [], errors = [], authCalls = [];
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { value:id === 'email' ? 'fixture@example.invalid' :
      id === 'password' ? 'synthetic-password' : '', classList:{ add(){}, remove(){} }, style:{},
      querySelector:() => null, setAttribute(){}, getAttribute:() => 'password' });
    return elements.get(id);
  }
  const localStorage = { getItem:key => stored.has(key) ? stored.get(key) : null,
    setItem:(key, value) => stored.set(key, String(value)), removeItem:key => stored.delete(key) };
  const context = vm.createContext({
    URL, URLSearchParams, SUPABASE_URL:apiOrigin, SUPABASE_KEY:'synthetic-public-key', localStorage,
    window:{ location:{ origin, search, href:'' },
      BuscARTEConfig:{ isLocalRuntime:auth, mode:auth ? 'auth' : 'shadow', networkEnabled:auth },
      BuscARTEAuth:{ signInWithPassword:async (...args) => {
        authCalls.push(args); return { authenticated:true, profileId:701 };
      }, signOut:async () => {} } },
    document:{ getElementById:element },
    console:{ error:(...args) => errors.push(args) },
    setTimeout:(callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    fetch:async (href, init) => {
      calls.push({ href, method:init.method, body:JSON.parse(init.body) });
      assert.equal(href, `${apiOrigin}/rest/v1/rpc/login_usuario`);
      assert.equal(init.method, 'POST');
      return response(200, [{ id:701, nombre:'Persona sintética', tipo_cuenta:'artista', rubro:'danza' }]);
    }
  });
  const functions = sliceBetween(loginSource, '  function isValidEmail(', '</script>');
  vm.runInContext(functions + '\n;globalThis.fixture={safeLocalRedirect,getRedirectUrl,login};', context,
    { filename:'login.in-memory.js', timeout:1000 });
  return { context, methods:context.fixture, stored, timers, calls, errors, authCalls };
}

test('email completion link keeps the encoded hash in an existing allowlisted login redirect', () => {
  const completionLink = linksIn(emailRuntime().build('bienvenida', {}).html)[1];
  assert(completionLink, 'Welcome needs its secondary completion link');
  const url = new URL(completionLink.href);
  assert.equal(url.pathname, '/buscARTE_login.html');
  assert.equal(url.hash, '', 'The profile hash belongs inside the redirect query');
  assert.equal(url.searchParams.get('redirect'), completeTarget);
  const login = loginRuntime(url.search);
  assert.equal(login.stored.size, 0, 'No previous browser session is assumed');
  assert.equal(login.methods.getRedirectUrl(), completeTarget);
});

for (const auth of [false, true]) test(`existing ${auth ? 'local Auth' : 'legacy'} login returns to profile completion without previous storage`, async () => {
  const login = loginRuntime(new URL(expectedLinks[1]).search, { auth });
  assert.equal(login.stored.size, 0);
  await login.methods.login();
  assert.deepEqual(login.errors, []);
  assert.equal(login.timers.length, 1);
  assert.equal(login.timers[0].delay, 850);
  login.timers[0].callback();
  assert.equal(login.context.window.location.href, completeTarget);
  assert.equal(login.calls.length, auth ? 0 : 1);
  assert.equal(login.authCalls.length, auth ? 1 : 0);
  if (!auth) {
    assert.equal(login.stored.get('ba_logged'), '1');
    assert.equal(login.stored.get('ba_rubro'), 'danza');
    assert.deepEqual(login.calls[0].body,
      { p_email:'fixture@example.invalid', p_password:'synthetic-password' });
  }
});

for (const bad of ['https://evil.invalid/buscARTE_perfil.html', '//evil.invalid/buscARTE_perfil.html',
  'javascript:alert(1)', 'data:text/html,blocked',
  'https://user:pass@buscarte.test/buscARTE_perfil.html', '/not-allowlisted.html',
  '/.netlify/functions/send-email', '/%2F%2Fevil.invalid']) {
  test(`existing login rejects an unsafe redirect: ${bad}`, () => {
    const login = loginRuntime(`?redirect=${encodeURIComponent(bad)}`);
    assert.equal(login.methods.safeLocalRedirect(bad), '');
    assert.equal(login.methods.getRedirectUrl(), 'buscARTE_busqueda.html');
    assert.equal(login.calls.length + login.authCalls.length, 0);
  });
}

test('query redirect is retained even when stale ba_after_login is cleared', async () => {
  const login = loginRuntime(new URL(expectedLinks[1]).search,
    { storage:{ ba_after_login:'buscARTE_anuncios.html' } });
  await login.methods.login();
  assert(!login.stored.has('ba_after_login'));
  login.timers[0].callback();
  assert.equal(login.context.window.location.href, completeTarget);
});

test('direct profile requires session while #completar is preserved for a signed-in visitor', () => {
  const guard = sliceBetween(profileSource, '  (function() {', '  // VARIABLES GLOBALES');
  for (const logged of [false, true]) {
    const replacements = [];
    const context = vm.createContext({ localStorage:{ getItem:() => logged ? '1' : null },
      window:{ location:{ replace:target => replacements.push(target) } }, location:{ hash:'#completar' } });
    vm.runInContext(guard, context, { timeout:1000 });
    assert.deepEqual(replacements, logged ? [] : ['index.html']);
    assert.equal(vm.runInContext("location.hash === '#completar'", context), true);
  }
  assert.match(profileSource, /profileCompletionEntryPending = location\.hash === '#completar'/);
});
