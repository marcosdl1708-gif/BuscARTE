const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const source = fs.readFileSync(path.join(root, 'buscARTE_registro.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'assets/js/registro-captcha.js'), 'utf8');
const roles = {
  artista: { step: 'perfil', box: 'hcaptcha-box-perfil', create: 'crearPerfil' },
  negocio: { step: 'negocio-contacto', box: 'hcaptcha-box', create: 'crearNegocio' },
  visitante: { step: 'visitante', box: 'hcaptcha-box-visitante', create: 'crearVisitante' }
};
const rpcKeys = ['p_email', 'p_password', 'p_nombre', 'p_provincia', 'p_ciudad', 'p_barrio', 'p_instrumento',
  'p_generos', 'p_disponibilidad', 'p_referentes', 'p_bio', 'p_tipo_cuenta', 'p_rubro', 'p_campos_especificos'].sort();
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

// Every service is synthetic. In particular, the registration RPC, welcome email,
// optional photos and reference suggestions can never reach real accounts.
function fakeCaptcha() {
  return `(() => {
    const state = window.__onboardingCaptcha = { widgets: {}, seq: 0, resets: [] };
    window.hcaptcha = {
      render(boxId, options) {
        const id = 'fixture-' + (++state.seq);
        const frame = document.createElement('iframe');
        frame.title = 'Captcha simulado, sin altas reales'; frame.width = '164'; frame.height = '144'; frame.style.border = '0';
        frame.srcdoc = '<body style="background:#222;color:#fff;font:14px sans-serif">☐ Soy humano<br>SIMULACIÓN LOCAL</body>';
        document.getElementById(boxId).appendChild(frame);
        state.widgets[id] = { boxId, options, response: '' }; return id;
      },
      getResponse(id) { return state.widgets[id]?.response || ''; },
      reset(id) { state.resets.push(id); state.widgets[id].response = ''; },
      remove(id) { document.getElementById(state.widgets[id].boxId).replaceChildren(); delete state.widgets[id]; }
    };
    state.widget = boxId => Object.values(state.widgets).find(w => w.boxId === boxId);
    state.solve = boxId => { const w = state.widget(boxId); w.response = 'onboarding-fixture-token'; w.options.callback(w.response); };
    state.expire = boxId => state.widget(boxId).options['expired-callback']();
    window.buscarteCaptchaLoaded();
  })();`;
}

async function setup(t, options = {}) {
  const width = options.width || 390;
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
  const calls = { rpc: [], emails: [], optional: [], unexpected: [], errors: [], alerts: [] };
  let releaseRpc;
  const rpcGate = new Promise(resolve => { releaseRpc = resolve; });
  if (!options.pending) releaseRpc();
  t.after(async () => {
    releaseRpc();
    await context.close();
    assert.deepEqual(calls.unexpected, [], 'All external requests must remain mocked or blocked');
    assert.deepEqual(calls.errors, [], 'No uncaught JavaScript errors');
  });
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.addInitScript(() => { localStorage.setItem('buscarte_meta_consent_v1', 'denied'); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === origin && method === 'GET') {
      if (url.pathname === '/buscARTE_registro.html') return route.fulfill({ contentType: 'text/html', body: source });
      if (url.pathname === '/assets/js/registro-captcha.js') return route.fulfill({ contentType: 'application/javascript', body: controller });
      if (url.pathname === '/assets/js/meta-pixel.js') return route.fulfill({ contentType: 'application/javascript', body: '// Tracking is disabled in this isolated fixture.' });
      if (['/buscARTE_login.html', '/buscARTE_perfil.html', '/buscARTE_busqueda.html', '/buscARTE_anuncios.html', '/index.html'].includes(url.pathname)) {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destino sintético</title><p>Sin servicios reales</p>' });
      }
      if (['/manifest.json', '/favicon.ico'].includes(url.pathname)) return route.fulfill({ body: '{}' });
    }
    if (url.hostname === 'js.hcaptcha.com' && url.pathname === '/1/api.js' && method === 'GET') {
      return route.fulfill({ contentType: 'application/javascript', body: fakeCaptcha() });
    }
    if (url.hostname === 'fonts.googleapis.com' && method === 'GET') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (url.pathname === '/rest/v1/rpc/registrar_usuario' && method === 'POST') {
        calls.rpc.push(request.postDataJSON());
        await rpcGate;
        if (options.abortRpc) return route.abort('connectionfailed');
        const body = Object.hasOwn(options, 'rpcResult') ? options.rpcResult : { id: 'onboarding-fixture-only' };
        return route.fulfill({ status: options.rpcStatus || 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      if (url.pathname === '/rest/v1/artistas_sugeridos' && ['GET', 'POST', 'PATCH'].includes(method)) {
        calls.optional.push({ path: url.pathname, method, body: method === 'GET' ? null : request.postDataJSON() });
        return route.fulfill({ contentType: 'application/json', body: method === 'GET' ? '[]' : '{}' });
      }
      if ((url.pathname === '/rest/v1/perfiles' && method === 'PATCH') || (url.pathname.startsWith('/storage/v1/object/fotos-perfil/') && method === 'POST')) {
        calls.optional.push({ path: url.pathname, method });
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      }
    }
    if (url.origin === origin && url.pathname === '/.netlify/functions/send-email' && method === 'POST') {
      calls.emails.push(request.postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    calls.unexpected.push(method + ' ' + url.origin + url.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('dialog', async dialog => { calls.alerts.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(origin + '/buscARTE_registro.html');
  const active = async step => { await page.waitForSelector('#step-' + step + '.active'); };
  const next = async step => { await page.locator('#step-' + step + ' .btn-next:not(#registro-detalles-artisticos)').first().click(); };
  const back = async step => { await page.locator('#step-' + step + ' .btn-back').first().click(); };
  async function start(role = 'artista', fields = {}) {
    await page.locator('#tipo-' + role).click();
    await next('tipo');
    await active('cuenta');
    await page.locator('#reg-nombre').fill(fields.name ?? 'Persona sintética');
    await page.locator('#reg-email').fill(fields.email ?? 'persona@example.invalid');
    await page.locator('#reg-password').fill(fields.password ?? 'Fixture-only-123!');
    if (fields.province !== '') await page.locator('#sel-provincia').selectOption(fields.province ?? 'Buenos Aires');
  }
  async function final(role = 'artista', rubro = 'danza') {
    await start(role);
    await next('cuenta');
    if (role === 'artista') {
      await active('rubro');
      await page.locator(`#rubro-grid button[onclick*="seleccionarRubro('${rubro}'"]`).click();
      await next('rubro');
    } else if (role === 'negocio') {
      await active('negocio');
      assert.equal(await page.locator('#neg-nombre').inputValue(), 'Persona sintética', 'Business name is carried forward from account details');
      await page.locator('#neg-tipo').selectOption('Sala de ensayo');
      await next('negocio');
    }
    await active(roles[role].step);
    await captcha('ready', role);
  }
  async function captcha(state, role = 'artista') {
    await page.waitForFunction(({ id, state }) => document.getElementById(id).closest('.captcha-panel').dataset.state === state, { id: roles[role].box, state });
  }
  async function solve(role = 'artista') {
    await page.evaluate(id => __onboardingCaptcha.solve(id), roles[role].box);
    await captcha('verified', role);
  }
  async function submit(role = 'artista') { await next(roles[role].step); }
  async function noSession() {
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_logged')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_user_id')), null);
    assert.equal(calls.emails.length, 0);
  }
  return { page, calls, start, final, active, next, back, captcha, solve, submit, noSession, releaseRpc };
}

for (const rubro of ['musica', 'danza']) {
  test(`${rubro}: four-screen quick signup accepts only account details and chosen category`, async t => {
    const f = await setup(t);
    await f.final('artista', rubro);
    assert.equal(await f.page.locator('#registro-perfil-opcional').getAttribute('open'), null);
    await f.submit();
    assert.equal(f.calls.rpc.length, 0, 'Skipping optional fields cannot bypass captcha');
    await f.solve();
    await f.submit();
    await f.active('exito');
    assert.equal(f.calls.rpc.length, 1);
    const body = f.calls.rpc[0];
    assert.deepEqual(Object.keys(body).sort(), rpcKeys);
    assert.equal(body.p_tipo_cuenta, 'artista');
    assert.equal(body.p_rubro, rubro);
    assert.equal(body.p_nombre, 'Persona sintética');
    assert.equal(body.p_provincia, 'Buenos Aires');
    for (const key of ['p_ciudad', 'p_barrio', 'p_instrumento', 'p_generos', 'p_disponibilidad', 'p_referentes', 'p_bio']) assert.equal(body[key], '', key + ' stays genuinely optional');
    assert.deepEqual(body.p_campos_especificos, {});
    assert.deepEqual(f.calls.optional, []);
    assert.equal(f.calls.emails.length, 1);
    assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_user_id')), 'onboarding-fixture-only');
    assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_rubro')), rubro);
    assert.equal(await f.page.locator('#exito-btn').getAttribute('href'), 'buscARTE_busqueda.html?rubro=' + rubro);
    assert.equal(await f.page.locator('#exito-completar').isVisible(), true);
    assert.equal(await f.page.locator('#exito-completar').getAttribute('href'), 'buscARTE_perfil.html#completar');
    await f.page.locator('#exito-btn').click();
    await f.page.waitForURL(origin + '/buscARTE_busqueda.html?rubro=' + rubro);
  });
}

for (const role of ['negocio', 'visitante']) {
  test(`${role}: existing account type keeps its minimal contract without artist completion prompts`, async t => {
    const f = await setup(t);
    await f.final(role);
    await f.solve(role);
    await f.submit(role);
    await f.active('exito');
    assert.equal(f.calls.rpc.length, 1);
    assert.deepEqual(Object.keys(f.calls.rpc[0]).sort(), rpcKeys);
    assert.equal(f.calls.rpc[0].p_tipo_cuenta, role);
    assert.equal(f.calls.rpc[0].p_rubro, role === 'negocio' ? 'Sala de ensayo' : '');
    assert.equal(f.calls.rpc[0].p_nombre, 'Persona sintética');
    assert.deepEqual(f.calls.rpc[0].p_campos_especificos, {});
    assert.equal(await f.page.locator('#exito-completar').isVisible(), false);
    assert.equal(f.calls.emails.length, 0);
    assert.deepEqual(f.calls.optional, []);
    if (role === 'visitante') assert.equal(await f.page.locator('#exito-btn').getAttribute('href'), 'buscARTE_anuncios.html?tipo=vende');
  });
}

for (const [field, value] of [['name', ''], ['email', 'no-email'], ['password', 'short'], ['province', '']]) {
  test(`minimal signup still rejects missing/invalid ${field}`, async t => {
    const f = await setup(t);
    await f.start('artista', { [field]: value });
    await f.next('cuenta');
    await f.active('cuenta');
    assert.equal(f.calls.rpc.length, 0);
    await f.noSession();
  });
}

test('quick path cannot proceed without a chosen artistic category', async t => {
  const f = await setup(t);
  await f.start(); await f.next('cuenta'); await f.active('rubro');
  await f.next('rubro'); await f.active('rubro');
  assert.equal(f.calls.rpc.length, 0);
});

test('quick path returns to category selection and preserves account fields', async t => {
  const f = await setup(t);
  await f.final(); await f.back('perfil'); await f.active('rubro');
  await f.back('rubro'); await f.active('cuenta');
  assert.equal(await f.page.locator('#reg-nombre').inputValue(), 'Persona sintética');
  assert.equal(await f.page.locator('#reg-email').inputValue(), 'persona@example.invalid');
  assert.equal(await f.page.locator('#reg-password').inputValue(), 'Fixture-only-123!');
  assert.equal(await f.page.locator('#registro-cuenta-opcional').getAttribute('open'), null);
});

test('expired verification on the shortened path requires a new captcha response', async t => {
  const f = await setup(t);
  await f.final(); await f.solve();
  await f.page.evaluate(() => __onboardingCaptcha.expire('hcaptcha-box-perfil'));
  await f.captcha('expired'); await f.submit();
  assert.equal(f.calls.rpc.length, 0);
  await f.page.locator('#step-perfil .captcha-retry').click();
  await f.captcha('ready'); await f.solve(); await f.submit(); await f.active('exito');
  assert.equal(f.calls.rpc.length, 1);
});

for (const role of Object.keys(roles)) {
  test(`${role}: pending registration is single-flight, including repeated handler invocation`, async t => {
    const f = await setup(t, { pending: true });
    await f.final(role); await f.solve(role); await f.submit(role);
    await f.page.waitForFunction(() => document.querySelector('.form-step.active .btn-next').disabled);
    await f.page.evaluate(({ create, step }) => {
      const button = document.querySelector('#step-' + step + ' .btn-next');
      void window[create](button); void window[create](button);
    }, roles[role]);
    assert.equal(f.calls.rpc.length, 1);
    f.releaseRpc(); await f.active('exito');
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(f.calls.emails.length, role === 'artista' ? 1 : 0);
    await f.page.evaluate(({ create, step }) => {
      void window[create](document.querySelector('#step-' + step + ' .btn-next'));
    }, roles[role]);
    assert.equal(f.calls.rpc.length, 1, 'A successful registration cannot be submitted again from a retained handler');
  });
  for (const [label, rpcResult] of [['empty object', {}], ['empty array', []]]) {
    test(`${role}: HTTP 200 with ${label} cannot fabricate successful signup`, async t => {
      const f = await setup(t, { rpcResult });
      await f.final(role); await f.solve(role); await f.submit(role);
      await f.captcha('ready', role);
      await f.active(roles[role].step);
      assert.equal(f.calls.rpc.length, 1);
      await f.noSession();
    });
  }
  test(`${role}: backend error preserves fields and requires renewed verification`, async t => {
    const f = await setup(t, { rpcStatus: 500, rpcResult: { error: 'synthetic backend failure' } });
    await f.final(role); await f.solve(role); await f.submit(role); await f.captcha('ready', role);
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(await f.page.locator('#reg-password').inputValue(), 'Fixture-only-123!');
    await f.submit(role); assert.equal(f.calls.rpc.length, 1);
    await f.noSession();
  });
  test(`${role}: duplicate email leads to login without a second signup`, async t => {
    const f = await setup(t, { rpcStatus: 409, rpcResult: { error: 'duplicate key value violates unique constraint' } });
    await f.final(role); await f.solve(role); await f.submit(role);
    await f.page.waitForURL(origin + '/buscARTE_login.html');
    assert.equal(f.calls.rpc.length, 1);
    await f.noSession();
  });
}

test('network failure on quick signup cannot create a local logged-in state', async t => {
  const f = await setup(t, { abortRpc: true });
  await f.final(); await f.solve(); await f.submit(); await f.captcha('ready');
  assert.equal(f.calls.rpc.length, 1); await f.noSession();
});

test('RPC array response remains compatible with shortened signup', async t => {
  const f = await setup(t, { rpcResult: [{ id: 'array-fixture-only' }] });
  await f.final(); await f.solve(); await f.submit(); await f.active('exito');
  assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_user_id')), 'array-fixture-only');
});

for (const [role, method] of [['artista', 'setItem'], ['negocio', 'setItem'], ['visitante', 'setItem'], ['negocio', 'removeItem'], ['visitante', 'removeItem']]) {
  test(`${role}: storage ${method} failure after confirmed creation offers login without another signup`, async t => {
    const f = await setup(t);
    await f.final(role); await f.solve(role);
    await f.page.evaluate(method => {
      window.__storageFailureCalls = 0;
      const previous = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (String(key).startsWith('ba_')) { window.__storageFailureCalls++; throw new Error('Synthetic storage failure'); }
        return previous.call(this, key, ...args);
      };
    }, method);
    await f.submit(role); await f.active('exito');
    assert.ok(await f.page.evaluate(() => __storageFailureCalls > 0), 'The injected storage failure was actually reached');
    assert.equal(await f.page.locator('#exito-btn').getAttribute('href'), 'buscARTE_login.html');
    assert.equal(await f.page.locator('#exito-completar').isVisible(), false);
    assert.equal(f.calls.rpc.length, 1);
    await f.page.evaluate(({ create, step }) => { void window[create](document.querySelector('#step-' + step + ' .btn-next')); }, roles[role]);
    assert.equal(f.calls.rpc.length, 1, 'A confirmed account must never be recreated because browser storage failed');
  });
}

for (const role of Object.keys(roles)) {
  test(`${role}: optional analytics failure cannot interrupt confirmed signup`, async t => {
    const f = await setup(t);
    await f.final(role); await f.solve(role);
    await f.page.evaluate(() => { window.MetaAds = { trackOnce() { throw new Error('Synthetic analytics failure'); } }; });
    await f.submit(role); await f.active('exito');
    assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_user_id')), 'onboarding-fixture-only');
    assert.equal(f.calls.rpc.length, 1);
    assert.notEqual(await f.page.locator('#exito-btn').getAttribute('href'), 'buscARTE_login.html', 'Successful session stays usable despite optional analytics failing');
  });
}

test('optional dance details survive going back to the same category', async t => {
  const f = await setup(t);
  await f.start(); await f.next('cuenta'); await f.active('rubro');
  await f.page.locator('#rubro-grid button[onclick*="seleccionarRubro(\'danza\'"]').click();
  await f.page.locator('#registro-detalles-artisticos').click(); await f.active('campos');
  await f.page.locator('#chips-disciplina-danza .chip').filter({ hasText: /^Tango$/ }).click();
  await f.back('campos'); await f.active('rubro');
  await f.page.locator('#registro-detalles-artisticos').click(); await f.active('campos');
  assert.equal(await f.page.locator('#chips-disciplina-danza .chip.selected').textContent(), 'Tango');
  await f.next('campos'); await f.active('perfil');
  await f.page.locator('#registro-perfil-opcional > summary').click();
  await f.page.locator('#bio-text').fill('Bio sintética que decidí completar ahora.');
  await f.captcha('ready'); await f.solve(); await f.submit(); await f.active('exito');
  assert.deepEqual(f.calls.rpc[0].p_campos_especificos, { disciplina: ['Tango'] });
  assert.equal(f.calls.rpc[0].p_bio, 'Bio sintética que decidí completar ahora.');
});

test('optional music route preserves instruments, genres and references in the unchanged contract', async t => {
  const f = await setup(t);
  await f.start(); await f.next('cuenta'); await f.active('rubro');
  await f.page.locator('#rubro-grid button[onclick*="seleccionarRubro(\'musica\'"]').click();
  await f.page.locator('#registro-detalles-artisticos').click(); await f.active('musica');
  await f.page.locator('#chips-instrumentos .chip').filter({ hasText: /^Guitarra$/ }).click();
  await f.page.locator('#chips-generos .chip').filter({ hasText: /^Rock$/ }).click();
  await f.next('musica'); await f.active('referentes');
  await f.page.locator('#chips-sugerencias .chip').filter({ hasText: /^Soda Stereo$/ }).click();
  await f.next('referentes'); await f.active('perfil');
  await f.captcha('ready'); await f.solve(); await f.submit(); await f.active('exito');
  assert.equal(f.calls.rpc[0].p_instrumento, 'Guitarra');
  assert.equal(f.calls.rpc[0].p_generos, 'Rock');
  assert.equal(f.calls.rpc[0].p_referentes, 'Soda Stereo');
  assert.deepEqual(f.calls.rpc[0].p_campos_especificos, {});
});

test('switching from music to dance does not write stale musical references', async t => {
  const f = await setup(t);
  await f.start(); await f.next('cuenta'); await f.active('rubro');
  await f.page.locator('#rubro-grid button[onclick*="seleccionarRubro(\'musica\'"]').click();
  await f.page.locator('#registro-detalles-artisticos').click(); await f.active('musica');
  await f.page.locator('#chips-instrumentos .chip').filter({ hasText: /^Guitarra$/ }).click();
  await f.next('musica'); await f.active('referentes');
  await f.page.locator('#chips-sugerencias .chip').filter({ hasText: /^Soda Stereo$/ }).click();
  await f.back('referentes'); await f.active('musica'); await f.back('musica'); await f.active('rubro');
  await f.page.locator('#rubro-grid button[onclick*="seleccionarRubro(\'danza\'"]').click();
  await f.next('rubro'); await f.active('perfil'); await f.captcha('ready');
  await f.solve(); await f.submit(); await f.active('exito');
  assert.equal(f.calls.rpc[0].p_rubro, 'danza');
  assert.equal(f.calls.rpc[0].p_instrumento, '');
  assert.equal(f.calls.rpc[0].p_generos, '');
  assert.equal(f.calls.rpc[0].p_referentes, '');
  assert.deepEqual(f.calls.optional, []);
  assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_referentes') || ''), '', 'Musical cache is empty or removed for non-musical signup');
});

for (const fromRole of ['artista', 'negocio']) {
  test(`${fromRole}: changing account type does not upload the previous role's photo`, async t => {
    const f = await setup(t);
    await f.final(fromRole);
    if (fromRole === 'artista') await f.page.locator('#registro-perfil-opcional > summary').click();
    const input = fromRole === 'artista' ? '#reg-foto-input' : '#neg-foto-input';
    await f.page.locator(input).setInputFiles({
      name: 'synthetic-avatar.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jit0AAAAASUVORK5CYII=', 'base64')
    });
    await f.page.locator(fromRole === 'artista' ? '#reg-foto-preview' : '#neg-foto-preview').waitFor({ state: 'visible' });
    await f.back(roles[fromRole].step);
    await f.active(fromRole === 'artista' ? 'rubro' : 'negocio');
    await f.back(fromRole === 'artista' ? 'rubro' : 'negocio');
    await f.active('cuenta'); await f.back('cuenta'); await f.active('tipo');
    const targetRole = fromRole === 'artista' ? 'negocio' : 'artista';
    await f.final(targetRole);
    await f.solve(targetRole); await f.submit(targetRole); await f.active('exito');
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(f.calls.rpc[0].p_tipo_cuenta, targetRole);
    assert.deepEqual(f.calls.optional, [], 'No upload/PATCH can leak the photo supplied for another account type');
  });
}

for (const width of [320, 390, 1280]) {
  test(`shortened signup keeps visible actions and captcha inside ${width}px`, async t => {
    const f = await setup(t, { width });
    await f.final();
    for (const selector of ['#step-perfil .captcha-panel', '#step-perfil .captcha-retry', '#step-perfil .h-captcha iframe', '#step-perfil .btn-next', '#registro-perfil-opcional']) {
      const box = await f.page.locator(selector).boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1, selector + ' fits viewport');
    }
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await f.page.locator('#step-perfil .btn-next').scrollIntoViewIfNeeded();
    const button = await f.page.locator('#step-perfil .btn-next').boundingBox();
    assert.ok(button.height >= 44, 'Creation action retains its mobile touch target');
    assert.ok(button.y >= -1 && button.y + button.height <= 845, 'Creation action can be scrolled fully into view (1px subpixel tolerance): ' + JSON.stringify(button));
    if (process.env.BUSCARTE_QA_OUTPUT) {
      const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
      assert.ok(output !== path.join(root, 'dist') && !output.startsWith(path.join(root, 'dist') + path.sep));
      fs.mkdirSync(output, { recursive: true });
      await f.page.screenshot({ path: path.join(output, 'onboarding-final-' + width + '.png'), animations: 'disabled' });
      await f.solve(); await f.submit(); await f.active('exito');
      await f.page.screenshot({ path: path.join(output, 'onboarding-success-' + width + '.png'), animations: 'disabled' });
    }
  });
}
