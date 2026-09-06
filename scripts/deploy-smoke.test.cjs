const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const candidate = new URL(process.env.BUSCARTE_DEPLOY_URL || 'https://missing-candidate.invalid');
assert.ok(process.env.BUSCARTE_DEPLOY_URL, 'Set BUSCARTE_DEPLOY_URL to the exact preview/production origin to verify');
assert.ok(candidate.protocol === 'https:' || (candidate.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(candidate.hostname)), 'HTTPS is required except for a local fixture server');
assert.ok(!candidate.username && !candidate.password && candidate.pathname === '/' && !candidate.search && !candidate.hash, 'Candidate must be an origin without credentials, path or query');
const listedFiles = JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8'));
const allowedPaths = new Map();
for (const file of listedFiles) {
  if (file === '_redirects') continue; // Platform configuration is not a browser asset.
  allowedPaths.set('/' + file.toLowerCase(), file);
  if (file.endsWith('.html')) allowedPaths.set('/' + file.slice(0, -5).toLowerCase(), file);
}
allowedPaths.set('/', 'index.html');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const allResults = [];
let browser;
function qaOutput() {
  if (!process.env.BUSCARTE_QA_OUTPUT) return null;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  assert.ok(output !== path.join(root, 'dist') && !output.startsWith(path.join(root, 'dist') + path.sep), 'QA artifacts must stay outside dist');
  fs.mkdirSync(output, { recursive: true });
  return output;
}
async function capture(page, name) {
  const output = qaOutput();
  if (output) await page.screenshot({ path: path.join(output, name) });
}
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
});
after(async () => {
  await browser?.close();
  if (process.env.BUSCARTE_QA_OUTPUT) {
    const output = qaOutput();
    fs.writeFileSync(path.join(output, 'deploy-smoke.json'), JSON.stringify({
      candidate: candidate.origin, at: new Date().toISOString(),
      safety: 'Only allowlisted static GETs reach candidate. All backend/captcha/font requests are synthetic; service workers and WebSockets are blocked.',
      tests: allResults
    }, null, 2));
  }
});

function allowedStatic(url) {
  return url.origin === candidate.origin && !url.username && !url.password && allowedPaths.has(url.pathname.toLowerCase());
}

function fakeCaptchaSdk() {
  return `(() => {
    const widgets = new Map();
    let seq = 0;
    window.hcaptcha = {
      render(boxId, options) {
        const id = 'smoke-' + (++seq);
        const frame = document.createElement('iframe');
        frame.title = 'Captcha sintético de smoke test';
        frame.width = '164'; frame.height = '144'; frame.style.border = '0';
        frame.srcdoc = '<body style="background:#222;color:#eee;font:14px sans-serif">Verificación simulada<br>QA SIN ALTAS REALES</body>';
        document.getElementById(boxId).appendChild(frame);
        widgets.set(id, { boxId, options });
        return id;
      },
      getResponse() { return ''; },
      reset() {},
      remove(id) { const w = widgets.get(id); if (w) document.getElementById(w.boxId).replaceChildren(); widgets.delete(id); }
    };
    window.buscarteCaptchaLoaded();
  })();`;
}

async function setup(t, { logged = false, width = 390, firstPostError = false } = {}) {
  const result = { test: t.name, fetched: [], redirects: [], mocked: [], forbidden: [], pageErrors: [], consoleErrors: [], networkErrors: [], posts: [], sdk: 0 };
  allResults.push(result);
  const context = await browser.newContext({
    viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768,
    timezoneId: 'America/Argentina/Buenos_Aires', serviceWorkers: 'block'
  });
  t.after(() => context.close());
  await context.addInitScript(logged => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    if (logged) {
      localStorage.setItem('ba_logged', '1');
      localStorage.setItem('ba_user_id', 'smoke-fixture-user');
      localStorage.setItem('ba_tipo_cuenta', 'artista');
      localStorage.setItem('ba_rubro', 'musica');
      localStorage.setItem('ba_name', 'Persona de prueba aislada');
    }
  }, logged);
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', socket => { result.forbidden.push('WebSocket ' + socket.url()); socket.close(); });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const location = message.location().url;
    const expectedMockFailure = firstPostError && result.posts.length > 0 && (
      text.startsWith('Error publicando anuncio: 400') ||
      (location.includes('/rest/v1/anuncios') && text.includes('status of 400'))
    );
    if (!expectedMockFailure) result.consoleErrors.push({ text, location });
  });
  page.on('dialog', async dialog => { result.forbidden.push('Unexpected dialog: ' + dialog.message()); await dialog.dismiss(); });

  // Fail-closed: this is the ONLY branch that can contact the network. It is
  // GET-only, same-origin, explicitly mapped to site-files.json, with automatic
  // redirects disabled. Every redirect Location is checked before the browser
  // receives it, and each redirected request passes through this guard again.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const tag = request.method() + ' ' + url.origin + url.pathname;
    if (request.method() === 'GET' && allowedStatic(url)) {
      try {
        let redirects = 0;
        for (let previous = request.redirectedFrom(); previous; previous = previous.redirectedFrom()) redirects++;
        assert.ok(redirects <= 5, 'Static redirect chain exceeded five hops');
        const response = await route.fetch({ method: 'GET', maxRedirects: 0, timeout: 30000 });
        const status = response.status();
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers().location;
          assert.ok(location, 'Static redirect has no Location');
          const destination = new URL(location, url);
          assert.ok(allowedStatic(destination), 'Redirect left the explicit candidate static allowlist: ' + destination.origin + destination.pathname);
          result.redirects.push({ from: url.pathname, to: destination.pathname, status });
          return route.fulfill({ response });
        }
        assert.equal(status, 200, `${url.pathname} must return 200`);
        const body = await response.body();
        const file = allowedPaths.get(url.pathname.toLowerCase());
        const contentType = response.headers()['content-type'] || '';
        if (file.endsWith('.html')) assert.match(contentType, /text\/html/i, 'HTML MIME type');
        if (file.endsWith('.js')) {
          assert.match(contentType, /(?:java|ecma)script/i, 'JavaScript MIME type');
          assert.equal(sha256(body), sha256(fs.readFileSync(path.join(root, file))), `${file}: served JS must match the candidate source`);
        }
        result.fetched.push({ file, status, contentType, bytes: body.length, sha256: sha256(body) });
        return route.fulfill({ response, body });
      } catch (error) {
        result.networkErrors.push(tag + ': ' + error.message);
        return route.abort('blockedbyclient');
      }
    }

    // Explicit synthetic services; no response here is fetched from a provider.
    if (url.hostname === 'fonts.googleapis.com' && request.method() === 'GET') {
      result.mocked.push(tag);
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    if (url.hostname === 'js.hcaptcha.com' && url.pathname === '/1/api.js' && request.method() === 'GET') {
      result.mocked.push(tag);
      result.sdk++;
      return route.fulfill({ contentType: 'application/javascript', body: result.sdk === 1 ? '// Synthetic unavailable provider callback.' : fakeCaptchaSdk() });
    }
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (request.method() === 'GET' && ['/rest/v1/perfiles', '/rest/v1/anuncios', '/rest/v1/mensajes', '/rest/v1/reacciones'].includes(url.pathname)) {
        result.mocked.push(tag);
        const rows = url.pathname === '/rest/v1/perfiles' && url.searchParams.get('id')
          ? [{ id: 'smoke-fixture-user', nombre: 'Persona de prueba aislada', tipo_cuenta: 'artista', rubro: 'musica' }] : [];
        return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '*/0' }, body: JSON.stringify(rows) });
      }
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/vencer_anuncios_viejos') {
        result.mocked.push(tag);
        return route.fulfill({ contentType: 'application/json', body: 'null' });
      }
      if (request.method() === 'POST' && url.pathname === '/rest/v1/anuncios') {
        result.mocked.push(tag);
        result.posts.push(request.postDataJSON());
        const failed = firstPostError && result.posts.length === 1;
        return route.fulfill({ status: failed ? 400 : 201, contentType: 'application/json', body: JSON.stringify(failed ? { message: 'Synthetic QA rejection' } : [{ id: 9001 }]) });
      }
    }
    if (url.origin === candidate.origin && url.pathname === '/favicon.ico' && request.method() === 'GET') {
      result.mocked.push(tag);
      return route.fulfill({ status: 204, body: '' });
    }
    // Includes registration, Storage, email functions, tracking, unknown assets,
    // external navigations and any new API calls. They are blocked AND fail QA.
    result.forbidden.push(tag);
    return route.abort('blockedbyclient');
  });

  async function go(file) {
    await page.goto(new URL(file, candidate).href, { waitUntil: 'load', timeout: 45000 });
    assert.equal(new URL(page.url()).origin, candidate.origin);
  }
  async function state(expected) {
    await page.waitForFunction(expected => document.getElementById('publish-status')?.dataset.state === expected, expected);
  }
  t.after(() => {
    assert.deepEqual(result.networkErrors, [], 'Static files and redirect policy must pass');
    assert.deepEqual(result.forbidden, [], 'No unexpected service, write, redirect or static file');
    assert.deepEqual(result.pageErrors, [], 'No uncaught errors from served scripts');
    assert.deepEqual(result.consoleErrors, [], 'No unexpected browser console errors');
    assert.ok(result.fetched.length > 0, 'Smoke must have fetched actual deployed files');
  });
  return { page, result, go, state };
}

test('deployed home loads its real static assets without activating Auth migration or tracking', async t => {
  const f = await setup(t);
  await f.go('/');
  assert.match(await f.page.title(), /buscARTE/i);
  await f.page.waitForFunction(() => !!window.BuscARTEConfig && !!window.BuscARTEAuth && !!window.BuscARTEApi);
  const config = await f.page.evaluate(() => ({ mode: BuscARTEConfig.mode, network: BuscARTEConfig.networkEnabled, consent: MetaAds.getConsent() }));
  assert.deepEqual(config, { mode: 'shadow', network: false, consent: 'denied' });
  for (const file of ['assets/js/buscarte-config.js', 'assets/js/buscarte-auth.js', 'assets/js/buscarte-api.js', 'assets/vendor/supabase-2.112.3.min.js', 'assets/js/inicio-sesion.js', 'assets/css/inicio-sesion.css']) {
    assert.ok(f.result.fetched.some(item => item.file === file), `${file} was fetched and hash-checked`);
  }
  await capture(f.page, 'deploy-home.png');
});

for (const home of ['index.html', 'buscARTE_index.html']) {
  test(`deployed ${home} gives a known account useful actions instead of signup prompts`, async t => {
    const f = await setup(t, { logged: true, width: 320 });
    await f.go('/' + home);
    await f.page.waitForFunction(() => document.documentElement.dataset.homeSession === 'member' && document.getElementById('hero-nombre').textContent === 'Persona');
    assert.equal(await f.page.locator('a[href*="registro" i]:visible').count(), 0);
    assert.doesNotMatch(await f.page.locator('body').innerText(), /probá sin registrarte|crear perfil gratis|sin registro para mirar|el registro aparece cuando/i);
    assert.equal(await f.page.locator('#hero-logueado .home-action:visible').count(), 4);
    assert.match(await f.page.locator('#hero-mi-perfil').getAttribute('href'), /buscARTE_perfil_publico(?:\.html)?\?id=smoke-fixture-user/);
    for (const file of ['assets/js/inicio-sesion.js', 'assets/css/inicio-sesion.css']) {
      assert.ok(f.result.fetched.some(item => item.file === file), `${file} was fetched and hash-checked`);
    }
    await f.page.locator('#nav-avatar-btn').click();
    assert.equal(await f.page.locator('#nav-avatar-btn').getAttribute('aria-expanded'), 'true');
    await f.page.keyboard.press('Escape');
    assert.equal(await f.page.locator('#nav-avatar-btn').getAttribute('aria-expanded'), 'false');
    assert.equal(f.result.posts.length, 0);
    await capture(f.page, `deploy-${home.replace('.html', '')}-member.png`);
  });
}

test('deployed registration serves the captcha controller, exposes loading failure and retries without any signup', async t => {
  const f = await setup(t, { width: 320 });
  await f.go('/buscARTE_registro.html');
  await f.page.waitForFunction(() => !!window.RegistroCaptcha && typeof goStep === 'function');
  await f.page.clock.install();
  await f.page.evaluate(() => {
    document.getElementById('bio-text').value = 'Borrador de smoke test que debe conservarse.';
    tipoCuenta = 'artista'; rubroSeleccionado = 'danza'; goStep('perfil');
  });
  const captcha = f.page.locator('#step-perfil .captcha-panel');
  await f.page.waitForFunction(() => document.querySelector('#step-perfil .captcha-panel').dataset.state === 'loading');
  await f.page.clock.fastForward(16000);
  await f.page.waitForFunction(() => document.querySelector('#step-perfil .captcha-panel').dataset.state === 'error');
  await captcha.locator('.captcha-retry').click();
  await f.page.waitForFunction(() => document.querySelector('#step-perfil .captcha-panel').dataset.state === 'ready');
  assert.equal(await captcha.locator('iframe').count(), 1);
  assert.equal(await f.page.evaluate(() => RegistroCaptcha.requireResponse('hcaptcha-box-perfil')), '');
  assert.equal(await f.page.locator('#bio-text').inputValue(), 'Borrador de smoke test que debe conservarse.');
  const box = await captcha.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 321, 'Captcha panel fits a 320px phone');
  assert.ok(f.result.fetched.some(item => item.file === 'assets/js/registro-captcha.js'), 'Actual deployed captcha controller was hash-checked');
  assert.equal(f.result.posts.length, 0);
  await capture(f.page, 'deploy-captcha-ready-simulado.png');
});

test('deployed mobile announcement dialog scrolls, traps focus and preserves type drafts', async t => {
  const f = await setup(t, { logged: true, width: 320 });
  await f.go('/buscARTE_anuncios.html');
  await f.page.waitForFunction(() => typeof openModal === 'function');
  await f.page.evaluate(() => openModal('busco'));
  await f.page.waitForSelector('#modal.open');
  await f.page.keyboard.press('Tab');
  assert.equal(await f.page.locator('.modal-close').evaluate(el => el === document.activeElement), true);
  await f.page.keyboard.press('Shift+Tab');
  assert.equal(await f.page.locator('.btn-submit').evaluate(el => el === document.activeElement), true);
  await f.page.locator('#form-busco textarea').fill('Borrador aislado servido desde deploy.');
  await f.page.locator('#busco-chips-especificos').getByRole('button', { name: 'Guitarra', exact: true }).click();
  await f.page.evaluate(() => selectTipo('jam', document.querySelector('.modal-tipo-btn[onclick*=jam]')));
  await f.page.locator('#jam-titulo').fill('Evento fixture sin publicar');
  await f.page.evaluate(() => selectTipo('busco', document.querySelector('.modal-tipo-btn[onclick*=busco]')));
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Borrador aislado servido desde deploy.');
  assert.equal(await f.page.locator('#busco-chips-especificos .mchip.on').textContent(), 'Guitarra');
  for (const height of [844, 420]) {
    await f.page.setViewportSize({ width: 320, height });
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const metrics = await f.page.evaluate(() => {
      const btn = document.querySelector('.btn-submit');
      const rect = btn.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const scroll = document.getElementById('publish-scroll');
      scroll.scrollTop = scroll.scrollHeight;
      return { right: rect.right, bottom: rect.bottom, y: rect.y, visible: top === btn || btn.contains(top), scroll: scroll.scrollTop };
    });
    assert.ok(metrics.right <= 321 && metrics.y >= 0 && metrics.bottom <= height + 1 && metrics.visible, JSON.stringify(metrics));
    assert.ok(metrics.scroll > 0, 'Long served form can scroll');
  }
  await capture(f.page, 'deploy-anuncios-320x420.png');
  await f.page.keyboard.press('Escape');
  await f.page.evaluate(() => openModal('busco'));
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Borrador aislado servido desde deploy.');
  assert.equal(f.result.posts.length, 0);
});

test('deployed publication UI handles synthetic failure and success without a real POST', async t => {
  const f = await setup(t, { logged: true, firstPostError: true });
  await f.go('/buscARTE_anuncios.html');
  await f.page.waitForFunction(() => typeof openModal === 'function');
  await f.page.evaluate(() => openModal('busco'));
  await f.page.locator('#form-busco input[type=text]').first().fill('Anuncio fixture NO PUBLICADO');
  await f.page.locator('#form-busco textarea').fill('Sólo pruebas simuladas. No contacta la base.');
  await f.page.evaluate(() => submitAnuncio());
  await f.state('error');
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Sólo pruebas simuladas. No contacta la base.');
  assert.equal(await f.page.locator('.btn-submit').isEnabled(), true);
  await f.page.evaluate(() => submitAnuncio());
  await f.state('success');
  assert.equal(f.result.posts.length, 2);
  assert.deepEqual(f.result.posts[0], f.result.posts[1]);
  assert.equal(await f.page.locator('.btn-submit').isDisabled(), true);
  assert.match(await f.page.locator('#publish-view-link').getAttribute('href'), /buscARTE_anuncio_detalle(?:\.html)?\?id=9001/);
  await f.page.evaluate(() => submitAnuncio());
  assert.equal(f.result.posts.length, 2, 'Confirmed synthetic success must remain locked');
  await capture(f.page, 'deploy-anuncios-success-simulado.png');
});
