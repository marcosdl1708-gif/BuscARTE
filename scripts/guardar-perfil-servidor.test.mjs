import test from 'node:test';
import assert from 'node:assert/strict';
import guardarPerfil, { config } from '../netlify/functions/guardar-perfil.mts';

const origin = 'https://buscarte.com.ar', backend = 'https://fixture.supabase.co';
const serviceKey = 'sb_secret_fixture_only_not_a_real_credential';
const user = { id: 701, email: 'persona@example.invalid', tipo_cuenta: 'artista', rubro: 'musica', baneado: false };
const base = { email: user.email, password: 'Synthetic-password-only', profileId: '701', changes: { nombre: 'Persona', bio: '', generos: 'Rock', rubro: 'musica', tipo_cuenta: 'artista' } };
async function run(body = base, options = {}) {
  const previousFetch = globalThis.fetch, previousNetlify = globalThis.Netlify, calls = [];
  globalThis.Netlify = { env: { get: name => ({ SUPABASE_URL: backend, SUPABASE_SERVICE_ROLE_KEY: serviceKey, ...options.env })[name] } };
  globalThis.fetch = async (href, init) => {
    const url = new URL(href), data = JSON.parse(init.body);
    calls.push({ url, init, data });
    const expectedBackend = Object.hasOwn(options.env || {}, 'SUPABASE_URL') && !options.env.SUPABASE_URL ? 'https://xiaanchoanxmampegoay.supabase.co' : backend;
    assert.equal(url.origin, expectedBackend, 'Only the in-memory stub handles either configured URL');
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.apikey, options.env?.SUPABASE_SERVICE_ROLE_KEY || options.env?.SUPABASE_SERVICE_KEY || serviceKey);
    if (options.throwFetch) throw new Error('Synthetic failure');
    if (url.pathname === '/rest/v1/rpc/login_usuario') {
      assert.equal(init.method, 'POST'); assert.deepEqual(data, { p_email: base.email, p_password: base.password });
      return Response.json(options.login ?? user, { status: options.loginStatus ?? 200 });
    }
    assert.equal(url.pathname, '/rest/v1/perfiles'); assert.equal(init.method, 'PATCH');
    assert.equal(url.searchParams.get('id'), 'eq.701');
    assert.equal(url.searchParams.get('or'), '(baneado.is.null,baneado.eq.false)');
    assert.equal(url.searchParams.get('select'), 'id,campos_especificos,generos,foto_url,rubro');
    assert.equal(init.headers.Prefer, 'return=representation');
    return Response.json(options.rows ?? [{ id: 701, ...data }], { status: options.patchStatus ?? 200 });
  };
  try {
    const req = new Request(origin + '/.netlify/functions/guardar-perfil', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body) });
    const response = await guardarPerfil(req), result = await response.json();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!JSON.stringify(result).includes(base.password)); assert.ok(!JSON.stringify(result).includes(serviceKey));
    return { status: response.status, result, calls };
  } finally { globalThis.fetch = previousFetch; globalThis.Netlify = previousNetlify; }
}

test('own profile: verify credentials, freeze identity fields and confirm represented update', async () => {
  const out = await run(); assert.equal(out.status, 200); assert.deepEqual(out.result, [{ id: 701, generos: 'Rock', rubro: 'musica' }]);
  assert.equal(out.calls.length, 2); assert.equal(out.calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(out.calls[1].data, { nombre: 'Persona', bio: '', generos: 'Rock', rubro: 'musica' });
  assert.deepEqual(config.rateLimit, { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' });
});
test('verify operation never PATCHes and does not return credential/profile extras', async () => {
  const out = await run({ ...base, operation: 'verify', changes: {} });
  assert.equal(out.status, 200); assert.deepEqual(out.result, [{ id: 701 }]); assert.equal(out.calls.length, 1);
  assert.equal((await run({ ...base, operation: 'verify' })).status, 400);
});
test('another owner, banned account and invalid rubro/account role are rejected without PATCH', async () => {
  for (const [body, options] of [[{ ...base, profileId: 999 }, {}], [base, { login: { ...user, baneado: true } }], [{ ...base, changes: { ...base.changes, rubro: 'inventado' } }, {}], [{ ...base, changes: { ...base.changes, tipo_cuenta: 'negocio' } }, {}]]) {
    const out = await run(body, options); assert.equal(out.status, 403); assert.equal(out.calls.length, 1);
  }
});
test('wrong password cannot update, including pre-upload verify', async () => {
  for (const body of [base, { ...base, operation: 'verify', changes: {} }]) {
    const out = await run(body, { login: { error: 'Credenciales incorrectas' } });
    assert.equal(out.status, 401); assert.equal(out.calls.length, 1);
  }
});
test('rejects identity/privilege fields, malformed or oversized data and other origins', async () => {
  for (const changes of [{ id: 999 }, { email: 'other@example.invalid' }, { password: 'x' }, { baneado: false }, { admin: true }, { bio: 'x'.repeat(301) }, { campos_especificos: '{"__proto__":{"x":1}}' }]) {
    const out = await run({ ...base, changes }); assert.equal(out.status, 400); assert.equal(out.calls.length, 0);
  }
  assert.equal((await run({ ...base, password: 'x'.repeat(33000) })).status, 400);
  for (const Origin of ['', 'null', 'https://evil.example.invalid']) {
    const out = await run(base, { headers: { Origin } }); assert.equal(out.status, 403); assert.equal(out.calls.length, 0);
  }
});
test('photo must be the verified owner file in the configured public bucket', async () => {
  const foto_url = backend + '/storage/v1/object/public/fotos-perfil/701-1788710000000.jpg';
  const good = await run({ ...base, changes: { foto_url } }); assert.equal(good.status, 200); assert.equal(good.result[0].foto_url, foto_url);
  for (const bad of ['not-a-url', foto_url.replace('/701-', '/999-'), foto_url.replace(backend, 'https://evil.example.invalid'), foto_url + '?token=x', foto_url.replace('.jpg', '.svg'), foto_url.replace('/701-', '/../701-')]) {
    const out = await run({ ...base, changes: { foto_url: bad } }); assert.equal(out.status, 400); assert.equal(out.calls.length, 1);
  }
});
test('upstream failure or unconfirmed result never reports successful save; legacy JSON preserved', async () => {
  for (const options of [{ throwFetch: true }, { loginStatus: 500 }, { patchStatus: 500 }, { rows: [] }, { rows: [{ id: 999 }] }, { rows: [{ id: 701, generos: 'Anterior' }] }]) {
    assert.equal((await run(base, options)).status, 502);
  }
  const campos = JSON.stringify({ disciplina: ['Ballet'], historical: { value: ['Conservar'] } });
  const out = await run({ ...base, changes: { campos_especificos: campos, rubro: 'danza', tipo_cuenta: 'artista' } }, { login: { ...user, rubro: 'danza' } });
  assert.equal(out.status, 200); assert.equal(out.calls[1].data.campos_especificos, campos);
  const switched = await run({ ...base, changes: { campos_especificos: campos, rubro: 'danza', tipo_cuenta: 'artista' } });
  assert.equal(switched.status, 200); assert.equal(switched.result[0].rubro, 'danza');
});
test('missing or anon server key fails closed; service_role JWT remains compatible', async () => {
  const jwt = role => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'synthetic_signature'].join('.');
  for (const key of ['', 'sb_publishable_synthetic', jwt('anon')]) {
    const out = await run(base, { env: { SUPABASE_SERVICE_ROLE_KEY: key } }); assert.equal(out.status, 503); assert.equal(out.calls.length, 0);
  }
  const key = jwt('service_role'), out = await run(base, { env: { SUPABASE_SERVICE_ROLE_KEY: key } });
  assert.equal(out.status, 200); assert.equal(out.calls[0].init.headers.Authorization, 'Bearer ' + key);
  const fallback = await run({ ...base, operation: 'verify', changes: {} }, { env: { SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_SERVICE_KEY: key } });
  assert.equal(fallback.status, 200); assert.equal(fallback.calls.length, 1);
});
