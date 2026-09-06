const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'buscARTE_registro.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'assets/js/registro-captcha.js'), 'utf8');
const paths = {
  artista: { step: 'perfil', box: 'hcaptcha-box-perfil', create: 'crearPerfil' },
  negocio: { step: 'negocio-contacto', box: 'hcaptcha-box', create: 'crearNegocio' },
  visitante: { step: 'visitante', box: 'hcaptcha-box-visitante', create: 'crearVisitante' }
};
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
});
after(async () => { await browser?.close(); });

// Synthetic provider only. No production hCaptcha, Supabase, email, pixels or
// other external service is contacted, even if the page adds a new request.
function fakeSdk(mode) {
  return `(() => {
    const state = window.__captchaFixture = { widgets: {}, rendered: [], resets: [], removed: [], mode: ${JSON.stringify(mode)} };
    function frame(box) {
      const el = document.createElement('iframe');
      el.title = 'Verificación simulada para pruebas locales';
      el.width = '164'; el.height = '144'; el.style.border = '0';
      el.srcdoc = '<body style="margin:0;background:#222;color:#eee;font:14px sans-serif;padding:16px"><p>☐ Soy humano</p><small>SIMULACIÓN LOCAL<br>No es un captcha real</small></body>';
      box.appendChild(el);
    }
    window.hcaptcha = {
      render(boxId, options) {
        const box = document.getElementById(boxId);
        if (state.mode === 'render-error') {
          state.mode = 'ready';
          box.appendChild(document.createElement('span'));
          throw new Error('Synthetic partial render failure');
        }
        const id = 'widget-' + state.rendered.length;
        state.rendered.push(boxId);
        state.widgets[id] = { boxId, options, response: '' };
        if (state.mode !== 'no-frame') frame(box);
        return id;
      },
      getResponse(id) { return state.widgets[id]?.response || ''; },
      reset(id) {
        state.resets.push(id);
        if (state.mode === 'reset-error') { state.mode = 'ready'; throw new Error('Invalid widget'); }
        state.widgets[id].response = '';
        const box = document.getElementById(state.widgets[id].boxId);
        if (!box.querySelector('iframe')) frame(box);
      },
      remove(id) {
        state.removed.push(id);
        document.getElementById(state.widgets[id].boxId).replaceChildren();
        delete state.widgets[id];
      }
    };
    state.widget = boxId => Object.values(state.widgets).find(widget => widget.boxId === boxId);
    state.solve = boxId => { const widget = state.widget(boxId); widget.response = 'fixture-token'; widget.options.callback(widget.response); };
    state.expire = boxId => { state.widget(boxId).options['expired-callback'](); };
    state.error = boxId => { state.widget(boxId).options['error-callback']('network-error'); };
    state.ready = () => window.buscarteCaptchaLoaded();
    if (state.mode !== 'delayed') state.ready();
  })();`;
}

async function setup(t, { width = 390, mode = 'ready', rpcFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const calls = { rpc: [], emails: [], unexpected: [], errors: [], dialogs: [], sdk: 0 };
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('dialog', async dialog => { calls.dialogs.push(dialog.message()); await dialog.dismiss(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://buscarte.test' && url.pathname === '/buscARTE_registro.html') {
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (url.origin === 'http://buscarte.test' && url.pathname === '/assets/js/registro-captcha.js') {
      return route.fulfill({ contentType: 'application/javascript', body: controller });
    }
    if (url.hostname === 'js.hcaptcha.com' && url.pathname === '/1/api.js') {
      calls.sdk++;
      if (mode === 'blocked' && calls.sdk === 1) return route.abort('blockedbyclient');
      return route.fulfill({ contentType: 'application/javascript', body: mode === 'timeout' && calls.sdk === 1 ? '' : fakeSdk(mode === 'timeout' ? 'ready' : mode) });
    }
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co' && url.pathname === '/rest/v1/rpc/registrar_usuario') {
      calls.rpc.push({ body: request.postDataJSON(), headers: request.headers() });
      return route.fulfill({ status: rpcFailure ? 500 : 200, contentType: 'application/json', body: JSON.stringify(rpcFailure ? { error: 'synthetic failure' } : { id: 'fixture-user-only' }) });
    }
    if (url.origin === 'http://buscarte.test' && url.pathname === '/.netlify/functions/send-email') {
      calls.emails.push(request.postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.origin === 'http://buscarte.test' && url.pathname === '/assets/js/meta-pixel.js') {
      return route.fulfill({ contentType: 'application/javascript', body: '// Tracking disabled in isolated tests.' });
    }
    if (url.origin === 'http://buscarte.test' && ['/manifest.json', '/favicon.ico'].includes(url.pathname)) return route.fulfill({ body: '{}' });
    calls.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort();
  });
  await page.goto('http://buscarte.test/buscARTE_registro.html');
  await page.evaluate(() => {
    document.getElementById('reg-nombre').value = 'Persona de prueba';
    document.getElementById('reg-email').value = 'persona@example.invalid';
    document.getElementById('reg-password').value = 'Only-fixture-123!';
    document.getElementById('sel-provincia').value = 'Buenos Aires';
    document.getElementById('bio-text').value = 'Texto que no debe perderse';
  });
  async function finalStep(role = 'artista') {
    await page.evaluate(({ role, step }) => {
      tipoCuenta = role;
      rubroSeleccionado = 'danza';
      // This suite jumps directly to the final step: keep prerequisite data
      // valid so it continues testing captcha rather than business validation.
      if (role === 'negocio') document.getElementById('neg-tipo').value = 'Sala de ensayo';
      goStep(step);
    }, { role, step: paths[role].step });
  }
  async function state(expected, role = 'artista') {
    await page.waitForFunction(({ id, expected }) => document.getElementById(id).closest('.captcha-panel').dataset.state === expected, { id: paths[role].box, expected });
  }
  async function submit(role = 'artista') {
    await page.locator(`#step-${paths[role].step} .btn-next`).click();
  }
  async function solve(role = 'artista') {
    await page.evaluate(id => window.__captchaFixture.solve(id), paths[role].box);
  }
  t.after(() => {
    assert.deepEqual(calls.unexpected, [], 'No unexpected request may escape the test allowlist');
    assert.deepEqual(calls.errors, [], 'No uncaught page errors');
  });
  return { page, calls, finalStep, state, submit, solve };
}

for (const role of Object.keys(paths)) {
  test(`${role}: missing response blocks; solved widget preserves registration contract`, async t => {
    const f = await setup(t);
    await f.finalStep(role);
    await f.state('ready', role);
    await f.submit(role);
    assert.equal(f.calls.rpc.length, 0);
    assert.deepEqual(f.calls.dialogs, []);
    assert.equal(await f.page.evaluate(() => document.activeElement.className), 'captcha-panel');
    await f.solve(role);
    await f.state('verified', role);
    await f.submit(role);
    await f.page.waitForSelector('#step-exito.active');
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(f.calls.rpc[0].body.p_tipo_cuenta, role);
    assert.equal(f.calls.rpc[0].body.p_email, 'persona@example.invalid');
    assert.deepEqual(Object.keys(f.calls.rpc[0].body).sort(), [
      'p_email', 'p_password', 'p_nombre', 'p_provincia', 'p_ciudad', 'p_barrio', 'p_instrumento',
      'p_generos', 'p_disponibilidad', 'p_referentes', 'p_bio', 'p_tipo_cuenta', 'p_rubro', 'p_campos_especificos'
    ].sort());
    assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_user_id')), 'fixture-user-only');
    assert.equal(f.calls.emails.length, role === 'artista' ? 1 : 0);
  });
}

test('SDK setup callback is required; switching steps does not render hidden widgets', async t => {
  const f = await setup(t, { mode: 'delayed' });
  await f.finalStep();
  await f.page.waitForFunction(() => !!window.hcaptcha);
  await f.state('loading');
  assert.deepEqual(await f.page.evaluate(() => __captchaFixture.rendered), []);
  await f.page.evaluate(() => goStep('cuenta'));
  await f.page.evaluate(() => __captchaFixture.ready());
  assert.deepEqual(await f.page.evaluate(() => __captchaFixture.rendered), []);
  await f.finalStep('visitante');
  await f.state('ready', 'visitante');
  await f.page.evaluate(() => goStep('cuenta'));
  await f.finalStep('visitante');
  assert.deepEqual(await f.page.evaluate(() => __captchaFixture.rendered), ['hcaptcha-box-visitante']);
});

test('blocked SDK can be retried without losing form data', async t => {
  const f = await setup(t, { mode: 'blocked' });
  await f.finalStep();
  await f.state('error');
  await f.submit();
  assert.equal(f.calls.rpc.length, 0);
  await f.page.locator('#step-perfil .captcha-retry').click();
  await f.state('ready');
  assert.equal(f.calls.sdk, 2);
  assert.equal(await f.page.locator('#bio-text').inputValue(), 'Texto que no debe perderse');
  assert.equal(await f.page.locator('#reg-password').inputValue(), 'Only-fixture-123!');
});

test('SDK timeout is bounded and manual retry recovers', async t => {
  const f = await setup(t, { mode: 'timeout' });
  await f.page.clock.install();
  await f.finalStep();
  await f.state('loading');
  await f.page.clock.fastForward(16000);
  await f.state('error');
  await f.page.locator('#step-perfil .captcha-retry').click();
  await f.state('ready');
});

test('partial render failure is cleaned up and retry renders one widget', async t => {
  const f = await setup(t, { mode: 'render-error' });
  await f.finalStep();
  await f.state('error');
  assert.equal(await f.page.locator('#hcaptcha-box-perfil').evaluate(el => el.children.length), 0);
  await f.page.locator('#step-perfil .captcha-retry').click();
  await f.state('ready');
  assert.equal(await f.page.locator('#hcaptcha-box-perfil iframe').count(), 1);
});

test('missing iframe times out and reset can restore it', async t => {
  const f = await setup(t, { mode: 'no-frame' });
  await f.page.clock.install();
  await f.finalStep();
  await f.page.waitForFunction(() => window.__captchaFixture?.rendered.length === 1);
  await f.page.clock.fastForward(16000);
  await f.state('error');
  await f.page.locator('#step-perfil .captcha-retry').click();
  await f.state('ready');
});

test('expired or error callbacks reject even a stale response; reset restores flow', async t => {
  const f = await setup(t);
  await f.finalStep();
  await f.state('ready');
  for (const event of ['expire', 'error']) {
    await f.solve();
    await f.page.evaluate(event => __captchaFixture[event]('hcaptcha-box-perfil'), event);
    await f.state(event === 'expire' ? 'expired' : 'error');
    await f.submit();
    assert.equal(f.calls.rpc.length, 0);
    await f.page.locator('#step-perfil .captcha-retry').click();
    await f.state('ready');
  }
});

test('invalid widget reset reconstructs it and ignores old callbacks', async t => {
  const f = await setup(t, { mode: 'reset-error' });
  await f.finalStep();
  await f.state('ready');
  await f.page.evaluate(() => { window.oldCaptchaCallback = __captchaFixture.widget('hcaptcha-box-perfil').options.callback; });
  await f.page.locator('#step-perfil .captcha-retry').click();
  await f.state('ready');
  assert.equal(await f.page.evaluate(() => __captchaFixture.rendered.length), 2);
  await f.page.evaluate(() => oldCaptchaCallback('stale-token'));
  await f.state('ready');
  await f.solve();
  await f.state('verified');
});

for (const role of Object.keys(paths)) {
  test(`${role}: registration failure resets only its own captcha`, async t => {
    const f = await setup(t, { rpcFailure: true });
    await f.finalStep(role);
    await f.state('ready', role);
    await f.solve(role);
    await f.submit(role);
    await f.state('ready', role);
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(await f.page.evaluate(() => __captchaFixture.resets.length), 1);
    assert.equal(await f.page.locator(`#step-${paths[role].step} .btn-next`).isEnabled(), true);
    await f.submit(role);
    assert.equal(f.calls.rpc.length, 1, 'Retry without a fresh response must not call registration');
  });
}

for (const width of [320, 360, 390, 1280]) {
  test(`captcha and actions fit ${width}px, including resize`, async t => {
    const f = await setup(t, { width });
    await f.finalStep();
    await f.state('ready');
    for (const nextWidth of [width, 320]) {
      await f.page.setViewportSize({ width: nextWidth, height: 844 });
      for (const selector of ['.captcha-panel', '.captcha-retry', '.h-captcha iframe', '.btn-next']) {
        const box = await f.page.locator('#step-perfil ' + selector).boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= nextWidth + 1, `${selector} fits ${nextWidth}px`);
      }
    }
    if (process.env.BUSCARTE_QA_OUTPUT && width === 390) {
      const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
      fs.mkdirSync(output, { recursive: true });
      await f.page.setViewportSize({ width: 390, height: 844 });
      await f.page.locator('#step-perfil .captcha-panel').scrollIntoViewIfNeeded();
      await f.page.screenshot({ path: path.join(output, 'captcha-mobile-ready.png') });
      await f.page.evaluate(() => __captchaFixture.error('hcaptcha-box-perfil'));
      await f.page.screenshot({ path: path.join(output, 'captcha-mobile-error.png') });
    }
  });
}
