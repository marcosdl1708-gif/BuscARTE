const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

// Template-only tests. No deployed functions, real environment, database, mail,
// browser or network: fetch and environment exist only as synthetic VM fixtures.
const root = path.resolve(__dirname, '..');
const baselineCommit = '9b75b23';
const origin = 'https://buscarte.test';
const target = 'buscARTE_perfil.html#completar';
const expectedHref = `${origin}/buscARTE_login.html?redirect=${encodeURIComponent(target)}`;
const expectedSubject = 'Dale forma a tu perfil en buscARTE';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const baselineCache = new Map();
function baselineBytes(file) {
  if (!baselineCache.has(file)) baselineCache.set(file, execFileSync('git', [
    'show', `${baselineCommit}:${file}`
  ], { cwd:root, maxBuffer:4 * 1024 * 1024, windowsHide:true }));
  return baselineCache.get(file);
}
const baseline = file => baselineBytes(file).toString('utf8');
const normalize = text => text.replace(/\r\n/g, '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const textDigest = text => digest(normalize(text));
const plain = value => JSON.parse(JSON.stringify(value));
const source = read('netlify/functions/send-email.js');
const oldSource = baseline('netlify/functions/send-email.js');

function sliceBetween(text, start, end) {
  const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, `Missing bounded source markers: ${start} / ${end}`);
  return text.slice(first, last);
}
function withoutReminder(text) {
  const normalized = normalize(text);
  return normalized.replace(sliceBetween(normalized,
    "  if (tipo === 'perfil_incompleto') {", '  return null;'), '<reminder-only>\n');
}
function assertOnlyReminderChanged(text) {
  assert.equal(textDigest(withoutReminder(text)), textDigest(withoutReminder(oldSource)));
}

function runtime(text = source, options = {}) {
  const calls = [], unexpected = [], warnings = [], errors = [];
  const env = { URL:origin, RESEND_API_KEY:'synthetic-resend-key',
    FROM_EMAIL:'buscARTE fixture <from@example.invalid>', ADMIN_EMAIL:'admin@example.invalid',
    SUPABASE_URL:'https://backend.example.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',
    INTERNAL_SECRET:'synthetic-internal-secret', ...options.env };
  const context = vm.createContext({ process:{ env }, exports:{}, URL,
    console:{ warn:(...args) => warnings.push(args), error:(...args) => errors.push(args) },
    fetch:async (href, init = {}) => {
      calls.push({ href:String(href), method:init.method || 'GET',
        headers:plain(init.headers || {}), body:init.body });
      // Resend is a compared string, never an actual request. No native fetch,
      // require, sockets, process APIs or secret values are exposed to this VM.
      if (href !== 'https://api.resend.com/emails' || init.method !== 'POST') {
        unexpected.push(String(href));
        throw new Error('Unexpected request in isolated reminder VM');
      }
      assert.equal(init.headers.Authorization, `Bearer ${env.RESEND_API_KEY}`);
      if (options.fetchThrows) throw new Error('Synthetic transport error');
      const status = options.status || 200;
      return { ok:status >= 200 && status < 300, status,
        text:async () => JSON.stringify({ id:'synthetic-reminder-id' }) };
    }
  });
  vm.runInContext(text + '\n;globalThis.fixtureBuildEmail = buildEmail;', context,
    { filename:'reminder-email.in-memory.js', timeout:1000 });
  return { build:(type, data) => context.fixtureBuildEmail(type, data),
    handle:event => context.exports.handler(event), calls, unexpected, warnings, errors, env };
}
function reminder(data, options = {}) { return runtime(source, options).build('perfil_incompleto', data); }
function linksIn(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => ({ href:match[1].replace(/&amp;/g, '&'), label:match[2].replace(/<[^>]+>/g, '').trim() }));
}
function assertReminderSubject(mail) { assert.equal(mail.subject, expectedSubject); }
function assertReminderLink(mail) {
  assert.deepEqual(linksIn(mail.html), [{ href:expectedHref, label:'Completar mi perfil' }]);
}
function assertGenericGreeting(mail) {
  const firstParagraph = mail.html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  assert(firstParagraph, 'The reminder needs its greeting paragraph');
  assert.equal(firstParagraph[1].replace(/<[^>]+>/g, '').trim(), 'Hola.');
  assert.doesNotMatch(firstParagraph[1], /<strong\b/i);
}
function post(overrides = {}, headers = { 'x-buscarte-secret':'synthetic-internal-secret' }) {
  return { httpMethod:'POST', headers, body:JSON.stringify({ tipo:'perfil_incompleto',
    destinatario:'recipient@example.invalid', datos:{ nombre:'Ana' }, ...overrides }) };
}
async function invoke(options = {}, event = post()) {
  const fixture = runtime(source, options), result = plain(await fixture.handle(event));
  assert.deepEqual(fixture.unexpected, []);
  return { ...fixture, result };
}

test('strict reminder-only source guard preserves welcome, helpers, handler, env and all other branches', () => {
  assertOnlyReminderChanged(source);
});

test('all scheduled/reset callers and cron configuration remain identical to 9b75b23', () => {
  for (const file of ['netlify.toml', 'netlify/functions/recordatorio-perfil.js',
    'netlify/functions/resumen-mensual.js', 'netlify/functions/reset-password.js']) {
    assert.equal(textDigest(read(file)), textDigest(baseline(file)), `${file} is outside this block`);
  }
});

test('public files outside the separately approved profile-save fix stay unchanged, including login/Auth and callers', () => {
  const files = JSON.parse(baseline('site-files.json'));
  assert.equal(textDigest(read('site-files.json')), textDigest(baseline('site-files.json')));
  assert.equal(files.length, 36);
  for (const file of files) {
    assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'));
    // The incident repair is tested in perfil-guardado-seguro and its server suite.
    // Only that editor and its cache version are outside this email-only baseline.
    if (file === 'buscARTE_perfil.html' || file === 'sw.js') continue;
    const current = fs.readFileSync(path.join(root, file));
    const previous = baselineBytes(file);
    // Historical og-image.jpg is actually SVG text (Git: i/lf w/crlf).
    // Compare image signatures, not extensions, so its checkout EOL is harmless.
    const binary = previous.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      previous.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    assert.equal(binary ? digest(current) : textDigest(current.toString('utf8')),
      binary ? digest(previous) : textDigest(previous.toString('utf8')), `${file} changed`);
  }
});

const otherFixtures = [
  { label:'empty', data:{} }, { label:'null', data:null },
  { label:'populated and escaped', data:{ nombre:'Persona & <fixture>', email:'reply@example.invalid',
    remitente:'Remitente <fixture>', preview:'Mensaje\n& siguiente línea', asunto:'Fixture\r\nsegura',
    mensaje:'Sin personas reales', link:`${origin}/buscARTE_reset.html?token=synthetic`,
    url:`${origin}/index.html`, userAgent:'Synthetic fixture', perfilNombre:'Perfil <fixture>', perfilId:'701',
    motivo:'Prueba local', reporterNombre:'Persona sintética', reporterId:'702', detalle:'Detalle\n& dato',
    nuevosMusicos:8, nuevosAnuncios:3, mes:'Mes de prueba',
    proximosEventos:[{ titulo:'Evento sintético', fecha:'2099-01-01', lugar:'Lugar & fixture' }] } }
];
for (const type of ['bienvenida', 'mensaje', 'contacto', 'reset', 'reporte', 'novedades', 'resumen_mensual']) {
  for (const fixture of otherFixtures) test(`${type}: exact 9b75b23 output (${fixture.label})`, () => {
    const current = runtime(), previous = runtime(oldSource);
    assert.deepEqual(plain(current.build(type, fixture.data)), plain(previous.build(type, fixture.data)));
    assert.equal(current.calls.length + previous.calls.length, 0);
  });
}

test('reminder has the approved subject and human heading', () => {
  const mail = reminder({ nombre:'Ana' });
  assertReminderSubject(mail);
  assert.match(mail.html, /Mostrá qué hacés\./);
  assert.match(mail.html, /Hola\s*<strong[^>]*>Ana<\/strong>/);
});

test('reminder suggests photo/presentation without diagnosing missing data or promising statistics', () => {
  const mail = reminder({ nombre:'Ana' });
  const visibleText = mail.html.replace(/<[^>]+>/g, ' ');
  assert.match(visibleText, /foto/);
  assert.match(visibleText, /presentación|líneas sobre/);
  assert.match(visibleText, /cuando quieras|si querés|podés|a tu ritmo/i);
  assert.doesNotMatch(visibleText, /3 veces|\d+\s*%|aparec(?:er mejor|en primero)|más visitas|más mensajes/i);
  assert.doesNotMatch(visibleText, /te falta|le faltan|no subiste|no tenés|perfil está incompleto|casi listo/i);
  assert.doesNotMatch(visibleText, /\bmúsicos\b|\bjams\b|instrumentos/i);
});

test('reminder has one exact existing login/return action, not a direct unauthenticated profile link', () => {
  assertReminderLink(reminder({ nombre:'Ana' }));
});

test('reminder explains re-entry and safely acknowledges already-completed profiles', () => {
  const mail = reminder({ nombre:'Ana' });
  assert.match(mail.html, /ingresá/i);
  assert.match(mail.html, /email y la contraseña/);
  assert.match(mail.html, /Si ya completaste/i);
  assert.match(mail.html, /no necesitás hacer nada/i);
});

for (const [label, data] of [
  ['omitted', undefined], ['null data', null], ['empty object', {}], ['wrong name key', { name:'Ana' }],
  ['null nombre', { nombre:null }], ['number', { nombre:3 }], ['object', { nombre:{ name:'Ana' } }],
  ['array', { nombre:['Ana'] }], ['boolean', { nombre:true }], ['whitespace', { nombre:' \n\t ' }]
]) test(`reminder has a generic safe greeting for ${label}`, () => {
  const mail = reminder(data);
  assertGenericGreeting(mail);
  assertReminderSubject(mail);
  assertReminderLink(mail);
});

test('reminder escapes name markup, attributes, quotes and ampersands', () => {
  const mail = reminder({ nombre:'Ana & <img src=x onerror="bad()"> \'X\'' });
  for (const escaped of ['&amp;', '&lt;img', '&gt;', '&quot;', '&#039;']) assert(mail.html.includes(escaped));
  assert.doesNotMatch(mail.html, /<img|<script|href="bad/i);
  assertReminderLink(mail);
});

test('reminder preserves accents, trims and caps the name to 80 characters', () => {
  assert.match(reminder({ nombre:'  María José  ' }).html, /María José/);
  const html = reminder({ nombre:'A'.repeat(160) }).html;
  assert(html.includes('A'.repeat(80)));
  assert(!html.includes('A'.repeat(81)));
});

test('reminder subject is fixed and cannot interpolate CR/LF from the name', () => {
  const mail = reminder({ nombre:'Ana\r\nBcc: victim@example.invalid' });
  assertReminderSubject(mail);
  assert.doesNotMatch(mail.subject, /[\r\n]|Bcc:|victim/);
});

test('caller-provided links, recipients and missing-data claims cannot change reminder content', () => {
  const base = reminder({ nombre:'Ana' });
  const attempted = reminder({ nombre:'Ana', link:'https://evil.invalid/', url:'https://evil.invalid/',
    redirect:'https://evil.invalid/', faltantes:['foto'], porcentaje:0, destinatario:'other@example.invalid' });
  assert.deepEqual(plain(attempted), plain(base));
});

test('reminder uses configured BASE_URL without changing the relative login/return contract', () => {
  const mail = reminder({}, { env:{ URL:'https://alternate.example.invalid' } });
  assert.deepEqual(linksIn(mail.html), [{
    href:'https://alternate.example.invalid/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar',
    label:'Completar mi perfil'
  }]);
});

test('authorized reminder handler sends once to the original recipient with unchanged transport fields', async () => {
  const fixture = await invoke();
  assert.equal(fixture.result.statusCode, 200);
  assert.deepEqual(JSON.parse(fixture.result.body), { ok:true, id:'synthetic-reminder-id' });
  assert.equal(fixture.calls.length, 1, 'No recipient lookup, extra mail, retry or external query is introduced');
  const payload = JSON.parse(fixture.calls[0].body);
  assert.deepEqual(Object.keys(payload).sort(), ['from', 'html', 'subject', 'to']);
  assert.equal(payload.from, fixture.env.FROM_EMAIL);
  assert.deepEqual(payload.to, ['recipient@example.invalid']);
  assert.equal(payload.subject, expectedSubject);
  assert.equal(payload.html, reminder({ nombre:'Ana' }).html);
  assert.deepEqual(Object.keys(fixture.calls[0].headers).sort(), ['Authorization', 'Content-Type']);
});

test('datos cannot override recipient or make the reminder a broadcast', async () => {
  const fixture = await invoke({}, post({ datos:{ nombre:'Ana', to:['other@example.invalid'],
    destinatario:'other@example.invalid', email:'other@example.invalid' } }));
  assert.deepEqual(JSON.parse(fixture.calls[0].body).to, ['recipient@example.invalid']);
});

for (const [label, event, options, status] of [
  ['preflight', { httpMethod:'OPTIONS' }, {}, 204],
  ['non-POST', { httpMethod:'GET' }, {}, 405],
  ['missing Resend key', post(), { env:{ RESEND_API_KEY:'' } }, 500],
  ['invalid JSON', { httpMethod:'POST', body:'{invalid' }, {}, 400],
  ['unknown type', post({ tipo:'unsupported' }), {}, 400],
  ['invalid recipient', post({ destinatario:'not-an-email' }), {}, 400],
  ['multiple recipients', post({ destinatario:['a@example.invalid', 'b@example.invalid'] }), {}, 400],
  ['missing internal secret header', post({}, {}), {}, 403],
  ['incorrect internal secret', post({}, { 'x-buscarte-secret':'wrong-synthetic-secret' }), {}, 403]
]) test(`reminder handler preserves rejection without sending: ${label}`, async () => {
  const fixture = await invoke(options, event);
  assert.equal(fixture.result.statusCode, status);
  assert.equal(fixture.calls.length, 0);
});

test('existing missing-secret fail-open behavior is documented, not broadened by this template block', async () => {
  const options = { env:{ INTERNAL_SECRET:'' } };
  const current = await invoke(options, post({}, {}));
  const previous = runtime(oldSource, options);
  const oldResult = await previous.handle(post({}, {}));
  assert.equal(current.result.statusCode, oldResult.statusCode);
  assert.equal(current.result.statusCode, 200);
  assert.equal(current.calls.length, 1);
  assert.equal(current.warnings.length, previous.warnings.length);
  assert.deepEqual(previous.unexpected, []);
});

for (const [label, options, status] of [
  ['HTTP error', { status:503 }, 502], ['transport exception', { fetchThrows:true }, 500]
]) test(`reminder send errors preserve response and do not retry: ${label}`, async () => {
  const fixture = await invoke(options);
  assert.equal(fixture.result.statusCode, status);
  assert.equal(fixture.calls.length, 1);
});

function redirectRuntime(search, saved = '') {
  const source = read('buscARTE_login.html');
  const code = sliceBetween(source, '  const SAFE_REDIRECT_PATHS', '  function showGlobal');
  const context = vm.createContext({ URL, URLSearchParams, window:{ location:{ origin, search } },
    localStorage:{ getItem:key => key === 'ba_after_login' ? saved : null } });
  vm.runInContext(code + '\n;globalThis.fixture={safeLocalRedirect,getRedirectUrl};', context,
    { filename:'reminder-login.in-memory.js', timeout:1000 });
  return context.fixture;
}

test('actual reminder CTA preserves encoded hash and reaches the existing login redirect without session', () => {
  const url = new URL(linksIn(reminder({ nombre:'Ana' }).html)[0].href);
  assert.equal(url.pathname, '/buscARTE_login.html');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.get('redirect'), target);
  assert.equal(redirectRuntime(url.search).getRedirectUrl(), target);
  assert.equal(redirectRuntime(url.search, 'buscARTE_anuncios.html').getRedirectUrl(), target);
  assert.match(read('buscARTE_perfil.html'), /profileCompletionEntryPending = location\.hash === '#completar'/);
});

for (const value of ['https://evil.invalid/buscARTE_perfil.html', '//evil.invalid/buscARTE_perfil.html',
  'javascript:alert(1)', 'data:text/html,blocked', 'https://user:pass@buscarte.test/buscARTE_perfil.html',
  '/.netlify/functions/send-email', '/not-allowlisted.html']) {
  test(`existing login still rejects unsafe reminder redirect: ${value}`, () => {
    const fixture = redirectRuntime(`?redirect=${encodeURIComponent(value)}`);
    assert.equal(fixture.safeLocalRedirect(value), '');
    assert.equal(fixture.getRedirectUrl(), 'buscARTE_busqueda.html');
  });
}

// Negative controls run the historical template in memory. The assertions below
// must reject it, demonstrating that passing the current suite is meaningful.
for (const [label, data, check] of [
  ['old subject', { nombre:'Ana' }, assertReminderSubject],
  ['old direct-profile link', { nombre:'Ana' }, assertReminderLink],
  ['old undefined-name fallback', undefined, assertGenericGreeting]
]) test(`negative control rejects ${label} from 9b75b23 without editing files`, () => {
  const fixture = runtime(oldSource), mail = fixture.build('perfil_incompleto', data);
  assert.throws(() => check(mail), { code:'ERR_ASSERTION' });
  assert.equal(fixture.calls.length, 0);
});

test('negative control proves the strict source guard rejects an unrelated welcome change', () => {
  const mutated = source.replace('Ya estás en buscARTE. ¿Por dónde empezamos?', 'Unrelated welcome mutation');
  assert.notEqual(mutated, source);
  assert.throws(() => assertOnlyReminderChanged(mutated), { code:'ERR_ASSERTION' });
});
