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
const fixtureUser = 'smoke-fixture-user';
const fixtureOther = 'smoke-fixture-other';
const fixtureConversation = 'smoke-fixture-conversation';
const fixtureTimestamp = '2026-09-05T20:00:00.000Z';
const fixtureProfiles = [
  { id: fixtureUser, nombre: 'Persona de prueba aislada' },
  { id: fixtureOther, nombre: 'Marina de prueba aislada' }
].map(person => ({
  ...person, tipo_cuenta: 'artista', rubro: 'musica', instrumento: 'Guitarra',
  generos: 'Rock', referentes: 'Referencia sintética', bio: 'Perfil sintético de smoke test.',
  ciudad: 'Buenos Aires', barrio: 'Almagro', experiencia: 4, disponibilidad: 'Proyectos'
}));
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
  if (output) await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
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
        widgets.set(id, { boxId, options, response: '' });
        return id;
      },
      getResponse(id) { return widgets.get(id)?.response || ''; },
      reset(id) { const w = widgets.get(id); if (w) w.response = ''; },
      remove(id) { const w = widgets.get(id); if (w) document.getElementById(w.boxId).replaceChildren(); widgets.delete(id); }
    };
    window.__smokeSolveCaptcha = boxId => {
      const w = [...widgets.values()].find(widget => widget.boxId === boxId);
      if (!w) throw new Error('Synthetic captcha was not rendered');
      w.response = 'smoke-captcha-token-not-real'; w.options.callback(w.response);
    };
    window.buscarteCaptchaLoaded();
  })();`;
}

async function setup(t, { logged = false, width = 390, firstPostError = false, chatFixture = false, marketplaceFixture = false, danceFixture = false, onboardingFixture = false, progressFixture = false, coherenceFixture = '' } = {}) {
  const result = { test: t.name, fetched: [], redirects: [], mocked: [], forbidden: [], pageErrors: [], consoleErrors: [], networkErrors: [], posts: [], patches: [], registrations: [], emails: [], reads: [], writes: [], sdk: 0 };
  // Each smoke owns its mutable synthetic row; nothing is persisted remotely or
  // shared with another case. Return only the PATCH representation the UI asks for.
  const profiles = structuredClone(fixtureProfiles);
  if (danceFixture) Object.assign(profiles[0], {
    rubro: 'danza', instrumento: '', generos: 'Contemporáneo',
    provincia: 'CABA', ciudad: 'Buenos Aires (CABA)',
    campos_especificos: JSON.stringify({ rol: ['Bailarín/a'], disciplina: ['Tango'], nivel: ['Profesional'] })
  });
  if (progressFixture) Object.assign(profiles[0], {
    bio: '', instrumento: '', generos: '', referentes: '', provincia: null, ciudad: null,
    barrio: '', foto_url: null, campos_especificos: '{}'
  });
  if (coherenceFixture) {
    assert.ok(['maquillaje', 'modelaje'].includes(coherenceFixture), 'Only explicit read-only category fixtures are available');
    Object.assign(profiles[0], {
      rubro: coherenceFixture, provincia: 'CABA', ciudad: 'Buenos Aires (CABA)',
      foto_url: null, campos_especificos: '{}'
    });
    // Keep the stale synthetic instrument to prove it cannot complete a
    // non-musician's role. This fixture does not authorize PATCH or signup.
  }
  const products = [
    { id: 9101, titulo: 'Guitarra sintética usada', categoria_producto: 'Guitarra eléctrica', condicion: 'Usado', rubro: 'danza' },
    { id: 9102, titulo: 'Guitarra sintética nueva', categoria_producto: 'Guitarra eléctrica', condicion: 'Nuevo', rubro: null },
    { id: 9103, titulo: 'Bajo sintético usado', categoria_producto: 'Bajo eléctrico', condicion: 'Usado', rubro: 'musica' },
    { id: 9104, titulo: 'Búsqueda artística sintética', tipo: 'busco', rubro: 'musica' }
  ].map(product => ({ tipo: 'vende', user_id: fixtureOther, descripcion: 'Publicación sintética, sin venta real.',
    precio: '$150.000', precio_num: 150000, zona: 'Almagro, CABA', oculto: false, estado: 'activo',
    created_at: fixtureTimestamp, ...product }));
  allResults.push(result);
  const context = await browser.newContext({
    viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768,
    timezoneId: 'America/Argentina/Buenos_Aires', serviceWorkers: 'block'
  });
  t.after(() => context.close());
  await context.addInitScript(({ logged, fixtureRubro }) => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    // Never open a native sharing surface or touch the system clipboard.
    window.__smokeSharedProfiles = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
      window.__smokeSharedProfiles.push(data);
    } });
    if (logged) {
      localStorage.setItem('ba_logged', '1');
      localStorage.setItem('ba_user_id', 'smoke-fixture-user');
      localStorage.setItem('ba_tipo_cuenta', 'artista');
      localStorage.setItem('ba_rubro', fixtureRubro);
      localStorage.setItem('ba_name', 'Persona de prueba aislada');
    }
  }, { logged, fixtureRubro: profiles[0].rubro });
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
  // redirects disabled. Follow each checked Location manually: Playwright routes
  // only the first request in a browser redirect chain. The browser receives the
  // final verified body, never a 3xx that could escape this interception policy.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const tag = request.method() + ' ' + url.origin + url.pathname;
    if (request.method() !== 'GET') result.writes.push(tag);
    if (request.method() === 'GET' && allowedStatic(url)) {
      try {
        let currentUrl = url;
        let response;
        for (let redirects = 0; ; redirects++) {
          assert.ok(redirects <= 5, 'Static redirect chain exceeded five hops');
          assert.ok(allowedStatic(currentUrl), 'Static request left the explicit candidate allowlist');
          response = await route.fetch({ url: currentUrl.href, method: 'GET', maxRedirects: 0, timeout: 30000 });
          const status = response.status();
          if (![301, 302, 303, 307, 308].includes(status)) break;
          const location = response.headers().location;
          assert.ok(location, 'Static redirect has no Location');
          const destination = new URL(location, currentUrl);
          assert.ok(allowedStatic(destination), 'Redirect left the explicit candidate static allowlist: ' + destination.origin + destination.pathname);
          result.redirects.push({ from: currentUrl.pathname, to: destination.pathname, status });
          currentUrl = destination;
        }
        const status = response.status();
        assert.equal(status, 200, `${url.pathname} must return 200`);
        const body = await response.body();
        const file = allowedPaths.get(currentUrl.pathname.toLowerCase());
        const contentType = response.headers()['content-type'] || '';
        if (file.endsWith('.html')) assert.match(contentType, /text\/html/i, 'HTML MIME type');
        if (file.endsWith('.css')) assert.match(contentType, /text\/css/i, 'CSS MIME type');
        if (file.endsWith('.js')) {
          assert.match(contentType, /(?:java|ecma)script/i, 'JavaScript MIME type');
        }
        // Pretty URLs can rewrite HTML anchors/serialization. The separate
        // verify-deploy-files.mjs performs its bounded inert-DOM comparison.
        if (/\.(?:css|js)$/.test(file)) assert.equal(sha256(body), sha256(fs.readFileSync(path.join(root, file))), `${file}: served CSS/JS must match the candidate source`);
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
      return route.fulfill({ contentType: 'application/javascript', body: result.sdk === 1 && !onboardingFixture ? '// Synthetic unavailable provider callback.' : fakeCaptchaSdk() });
    }
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (request.method() === 'GET' && ['/rest/v1/perfiles', '/rest/v1/anuncios', '/rest/v1/mensajes', '/rest/v1/reacciones', '/rest/v1/perfiles_guardados', '/rest/v1/conversaciones'].includes(url.pathname)) {
        result.mocked.push(tag);
        result.reads.push({ path: url.pathname, query: url.search });
        let rows = [];
        if (url.pathname === '/rest/v1/perfiles') {
          const filter = url.searchParams.get('id') || '';
          if (filter.startsWith('eq.')) rows = profiles.filter(p => p.id === filter.slice(3));
          else if (filter.startsWith('in.(') && filter.endsWith(')')) {
            const ids = filter.slice(4, -1).split(',');
            rows = profiles.filter(p => ids.includes(p.id));
          }
        } else if (marketplaceFixture && url.pathname === '/rest/v1/anuncios') {
          rows = products.filter(product => url.searchParams.get('tipo') !== 'in.(vende,vendo)' || ['vende', 'vendo'].includes(product.tipo));
        } else if (chatFixture && url.pathname === '/rest/v1/conversaciones') {
          rows = [{ id: fixtureConversation, user1_id: fixtureUser, user2_id: fixtureOther,
            ultimo_mensaje: 'Mensaje sintético sin envío real', updated_at: fixtureTimestamp, anuncio_id: null }];
        } else if (chatFixture && url.pathname === '/rest/v1/mensajes') {
          rows = [{ id: 'smoke-fixture-message', de_user_id: fixtureOther, para_user_id: fixtureUser,
            contenido: 'Mensaje sintético sin envío real', created_at: fixtureTimestamp }];
        }
        return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '*/0' }, body: JSON.stringify(rows) });
      }
      if (onboardingFixture && request.method() === 'POST' && url.pathname === '/rest/v1/rpc/registrar_usuario') {
        result.mocked.push(tag);
        const body = request.postDataJSON();
        result.registrations.push(body);
        // Only this test accepts a simulated signup; no provider is contacted.
        Object.assign(profiles[0], { nombre: body.p_nombre, tipo_cuenta: body.p_tipo_cuenta,
          rubro: body.p_rubro, bio: body.p_bio, provincia: body.p_provincia, ciudad: body.p_ciudad,
          barrio: body.p_barrio, instrumento: body.p_instrumento, generos: body.p_generos,
          referentes: body.p_referentes, disponibilidad: body.p_disponibilidad,
          campos_especificos: body.p_campos_especificos, foto_url: null });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: fixtureUser }) });
      }
      if ((danceFixture || progressFixture) && request.method() === 'PATCH' && url.pathname === '/rest/v1/perfiles') {
        result.mocked.push(tag);
        const requestHeaders = request.headers();
        const patch = { query: url.search, headers: {
          prefer: requestHeaders.prefer, 'content-type': requestHeaders['content-type']
        }, body: request.postDataJSON() };
        result.patches.push(patch);
        const matchesOwner = url.searchParams.get('id') === 'eq.' + fixtureUser;
        if (matchesOwner) Object.assign(profiles[0], patch.body);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(matchesOwner
          ? [{ id: profiles[0].id, campos_especificos: profiles[0].campos_especificos }] : []) });
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
    if (onboardingFixture && request.method() === 'POST' && url.origin === candidate.origin && url.pathname === '/.netlify/functions/send-email') {
      result.mocked.push(tag);
      result.emails.push(request.postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    if (url.origin === candidate.origin && url.pathname === '/favicon.ico' && request.method() === 'GET') {
      result.mocked.push(tag);
      return route.fulfill({ status: 204, body: '' });
    }
    // Includes registration/email outside their explicit fixture, Storage, tracking, unknown assets,
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

test('deployed own mobile profile replaces self-contact with editing and shares an explicit owner URL', async t => {
  const f = await setup(t, { logged: true, width: 320 });
  // No id tests the existing signed-in fallback and the canonical shared link.
  await f.go('/buscARTE_perfil_publico.html');
  await f.page.waitForFunction(() => document.body.dataset.profileState === 'own');
  assert.equal(await f.page.locator('#perfil-nombre').textContent(), 'Persona de prueba aislada');
  assert.equal(await f.page.locator('#profile-owner-note').isVisible(), true);
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), true);
  const editDestination = new URL(await f.page.locator('#edit-profile-link').getAttribute('href'), f.page.url());
  assert.equal(editDestination.origin, candidate.origin);
  assert.match(editDestination.pathname, /^\/buscARTE_perfil(?:\.html)?$/i);
  for (const selector of ['#contact-profile-btn', '#contact-card', '#save-btn', '#report-link']) {
    assert.equal(await f.page.locator(selector).isVisible(), false, `${selector} cannot invite an action against the owner`);
  }
  // Read settled geometry: the existing fadeUp translation can report
  // 43.99997px for a 44px button midway through the animation.
  await f.page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))
  ));
  for (const selector of ['#edit-profile-link', '#share-btn']) {
    const box = await f.page.locator(selector).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `${selector} has a usable mobile touch target`);
    assert.ok(box.x >= 0 && box.x + box.width <= 321, `${selector} fits a 320px phone`);
  }
  await f.page.locator('#share-btn').click();
  const shared = await f.page.evaluate(() => window.__smokeSharedProfiles);
  assert.equal(shared.length, 1);
  const destination = new URL(shared[0].url);
  assert.equal(destination.origin, candidate.origin);
  assert.match(destination.pathname, /^\/buscARTE_perfil_publico(?:\.html)?$/i);
  assert.equal(destination.searchParams.get('id'), fixtureUser);
  assert.deepEqual(f.result.writes, [], 'Reading/sharing an own profile must not write to a backend');
  await capture(f.page, 'deploy-perfil-propio-320.png');
});

test('deployed mobile chat opens the other profile and Back restores the same conversation without any send', async t => {
  const f = await setup(t, { logged: true, width: 320, chatFixture: true });
  await f.go('/buscARTE_mensajes.html?conv=' + fixtureConversation);
  await f.page.waitForFunction(() => document.getElementById('chat-persona')?.hasAttribute('href'));
  for (const selector of ['#chat-persona', '#chat-ver-perfil']) {
    const link = f.page.locator(selector);
    assert.equal(await link.isVisible(), true, `${selector} stays visible on mobile`);
    const destination = new URL(await link.getAttribute('href'), f.page.url());
    assert.equal(destination.origin, candidate.origin);
    assert.equal(destination.searchParams.get('id'), fixtureOther);
    assert.equal(await link.getAttribute('aria-label'), 'Ver perfil de Marina de prueba aislada');
    const box = await link.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44 && box.x >= 0 && box.x + box.width <= 321, `${selector} fits a 320px touch viewport`);
  }
  for (const selector of ['#chat-header-avatar', '#chat-header-name']) {
    assert.equal(await f.page.locator(selector).evaluate(el => el.closest('a')?.id), 'chat-persona');
  }
  await f.page.waitForFunction(() => document.getElementById('chat-messages').textContent.includes('Mensaje sintético sin envío real'));
  await capture(f.page, 'deploy-chat-perfil-320.png');
  await f.page.locator('#chat-ver-perfil').click();
  await f.page.waitForFunction(() => document.body?.dataset.profileState === 'other');
  assert.equal(new URL(f.page.url()).searchParams.get('id'), fixtureOther);
  assert.equal(await f.page.locator('#perfil-nombre').textContent(), 'Marina de prueba aislada');
  assert.equal(await f.page.locator('#contact-profile-btn').isVisible(), true);
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), false);
  await f.page.goBack({ waitUntil: 'load' });
  await f.page.waitForFunction(() => document.getElementById('chat-persona')?.hasAttribute('href'));
  assert.equal(new URL(f.page.url()).searchParams.get('conv'), fixtureConversation);
  assert.equal(await f.page.locator('#chat-header-name').textContent(), 'Marina de prueba aislada');
  assert.equal(new URL(await f.page.locator('#chat-persona').getAttribute('href'), f.page.url()).searchParams.get('id'), fixtureOther);
  await f.page.waitForFunction(() => document.getElementById('chat-messages').textContent.includes('Mensaje sintético sin envío real'));
  assert.deepEqual(f.result.writes, [], 'Chat/profile navigation cannot send messages, emails or other backend writes');
  assert.ok(f.result.fetched.some(item => item.file === 'buscARTE_mensajes.html'));
  assert.ok(f.result.fetched.some(item => item.file === 'buscARTE_perfil_publico.html'));
});

for (const home of ['index.html', 'buscARTE_index.html']) {
  test(`deployed ${home} opens public Marketplace products with combined filters and a clear sale action`, async t => {
    const f = await setup(t, { width: 320, marketplaceFixture: true });
    await f.go('/' + home);
    await f.page.locator('#home-marketplace').focus();
    await f.page.keyboard.press('Enter');
    await f.page.waitForFunction(() => document.body?.dataset.marketplace === 'true' && document.querySelectorAll('#anuncios-lista .anuncio').length === 3);
    assert.equal(new URL(f.page.url()).searchParams.get('tipo'), 'vende');
    assert.match(new URL(f.page.url()).pathname, /^\/buscARTE_anuncios(?:\.html)?$/i);
    const ids = () => f.page.locator('#anuncios-lista .anuncio:visible').evaluateAll(cards => cards.map(card => Number(card.dataset.id)));
    assert.deepEqual(await ids(), [9101, 9102, 9103], 'Sale items are products, including a dancer and a null-rubro seller');
    assert.doesNotMatch(await f.page.locator('#anuncios-lista').innerText(), /Búsqueda artística sintética/);
    const query = f.result.reads.find(read => read.path === '/rest/v1/anuncios' && new URLSearchParams(read.query).get('select') === '*');
    assert.ok(query, 'Marketplace fetched complete product rows, separately from Home counts');
    assert.equal(new URLSearchParams(query.query).get('tipo'), 'in.(vende,vendo)');
    assert.equal(await f.page.locator('.filter-panel.active').getAttribute('id'), 'fp-vende');
    assert.match(await f.page.locator('#publish-main-btn').innerText(), /Publicar venta \/ alquiler/);
    assert.equal(await f.page.locator('#marketplace-other-boards').getAttribute('open'), null);

    await f.page.locator('#mobile-filter-btn-an').click();
    const category = f.page.locator('#fp-vende').getByRole('button', { name: 'Guitarra eléctrica', exact: true, includeHidden: true });
    await category.locator('xpath=ancestor::details').locator('summary').click();
    await category.click();
    await f.page.locator('#fp-vende').getByRole('button', { name: 'Usado', exact: true }).click();
    const expectProducts = expected => f.page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('#anuncios-lista .anuncio')]
      .filter(card => getComputedStyle(card).display !== 'none').map(card => Number(card.dataset.id))) === JSON.stringify(expected), expected);
    await expectProducts([9101]);
    await f.page.locator('#precio-max').fill('100000');
    await expectProducts([]);
    await f.page.locator('#precio-max').fill('200000');
    await expectProducts([9101]);
    await f.page.locator('#zona-vende').fill('Zona inexistente en fixtures');
    await expectProducts([]);
    await f.page.locator('#zona-vende').fill('almagro');
    await expectProducts([9101]);
    await f.page.locator('.mobile-show-results-an').click();
    await f.page.waitForFunction(() => document.querySelectorAll('#anuncios-lista .anuncio:not([style*="display: none"])').length === 1);
    assert.deepEqual(await ids(), [9101], 'Category, condition, price and area are combined, not OR-ed across groups');
    assert.match(await f.page.locator('#anuncios-lista .anuncio:visible').innerText(), /150\.000/);
    const button = await f.page.locator('#publish-main-btn').boundingBox();
    assert.ok(button && button.height >= 44 && button.x >= 0 && button.x + button.width <= 321, 'Sale action is usable on a 320px phone');
    assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= 320), 'Marketplace has no horizontal overflow');
    assert.equal(f.result.posts.length, 0, 'Public browsing cannot publish a product');
    assert.equal(f.result.patches.length, 0);
    assert.ok(f.result.writes.every(write => write === 'POST https://xiaanchoanxmampegoay.supabase.co/rest/v1/rpc/vencer_anuncios_viejos'), 'Only the existing simulated expiration RPC can be requested');
    await capture(f.page, `deploy-${home.replace('.html', '')}-marketplace-320.png`);
  });
}

test('deployed dance editor confirms a synthetic Tango to Ballet PATCH, reload and matching public hero', async t => {
  const f = await setup(t, { logged: true, danceFixture: true, width: 320 });
  await f.go('/buscARTE_perfil.html');
  const ready = () => f.page.waitForFunction(() => typeof isLoadingProfile !== 'undefined' && !isLoadingProfile && document.getElementById('reg-nombre-perfil')?.value === 'Persona de prueba aislada');
  await ready();
  assert.deepEqual(await f.page.locator('#chips-disc-dan .chip.selected').allTextContents(), ['Tango']);
  await f.page.locator('#chips-disc-dan').getByRole('button', { name: 'Tango', exact: true }).click();
  await f.page.locator('#chips-disc-dan').getByRole('button', { name: 'Ballet', exact: true }).click();
  const save = f.page.locator('#save-bar .btn-neon');
  const button = await save.boundingBox();
  assert.ok(button && button.height >= 44 && button.x >= 0 && button.x + button.width <= 321, 'Save remains in the mobile viewport');
  await save.click();
  await f.page.waitForFunction(() => document.getElementById('profile-status')?.textContent.includes('Perfil guardado correctamente'));
  assert.equal(f.result.patches.length, 1);
  const patch = f.result.patches[0];
  assert.equal(new URLSearchParams(patch.query).get('id'), 'eq.' + fixtureUser);
  assert.equal(new URLSearchParams(patch.query).get('select'), 'id,campos_especificos');
  assert.match(patch.headers.prefer, /return=representation/);
  const fields = typeof patch.body.campos_especificos === 'string' ? JSON.parse(patch.body.campos_especificos) : patch.body.campos_especificos;
  assert.deepEqual(fields.disciplina, ['Ballet']);
  assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= 320), 'Editor has no horizontal overflow');
  await capture(f.page, 'deploy-danza-guardado-simulado-320.png');
  await f.page.reload({ waitUntil: 'load' });
  await ready();
  assert.deepEqual(await f.page.locator('#chips-disc-dan .chip.selected').allTextContents(), ['Ballet']);
  await f.go('/buscARTE_perfil_publico.html?id=' + fixtureUser);
  await f.page.waitForFunction(() => document.body?.dataset.profileState === 'own');
  assert.match(await f.page.locator('#perfil-tags').innerText(), /Ballet/i);
  assert.doesNotMatch(await f.page.locator('#perfil-tags').innerText(), /Tango|Contemporáneo/i);
  assert.match(await f.page.locator('#stat-genero').innerText(), /Ballet/i);
  assert.match(await f.page.locator('#perfil-generos').innerText(), /Ballet/i);
  assert.deepEqual(f.result.writes, ['PATCH https://xiaanchoanxmampegoay.supabase.co/rest/v1/perfiles'], 'Only the explicit synthetic profile update was requested');
  assert.equal(f.result.posts.length, 0);
  await capture(f.page, 'deploy-danza-perfil-publico-320.png');
});

test('deployed clearer Home keeps guest exploration, honest examples and lower statistics on both URLs', async t => {
  const f = await setup(t, { width: 320 });
  for (const home of ['index.html', 'buscARTE_index.html']) {
    await f.go('/' + home);
    await f.page.waitForFunction(() => document.documentElement.dataset.homeSession === 'guest' && document.documentElement.dataset.homeReady === 'true');
    assert.equal(await f.page.locator('body.home-clarity').count(), 1);
    assert.equal(await f.page.locator('nav a[data-home-recover]').isVisible(), false, 'Guest must not receive the recovery-only login link');
    assert.equal(await f.page.locator('#hero-invitado a').count(), 3);
    assert.match(await f.page.locator('.home-examples').innerText(), /ilustrativ[oa]s?/i);
    assert.doesNotMatch(await f.page.locator('.home-examples').innerText(), /\d+%\s*afinidad|Miles de músicos/i);
    const anchor = f.page.locator('#explorar');
    assert.equal(await anchor.evaluate((el, expected) => el.classList.contains(expected), home === 'index.html' ? 'rubros-section' : 'profiles-section'), true);
    const primary = await f.page.locator('#hero-invitado .btn-neon').getAttribute('href');
    if (home === 'index.html') assert.equal(primary, '#explorar');
    else {
      const destination = new URL(primary, f.page.url());
      assert.equal(destination.origin, candidate.origin);
      assert.match(destination.pathname, /^\/buscARTE_busqueda(?:\.html)?$/i);
      assert.equal(destination.search, ''); assert.equal(destination.hash, '');
    }
    for (const width of [320, 820]) {
      await f.page.setViewportSize({ width, height: 844 });
      const layout = await f.page.evaluate(() => {
        const box = el => { const r = el.getBoundingClientRect(); return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, height:r.height }; };
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const stats = document.querySelector('.home-community-stats');
        return {
          width:innerWidth, overflow:document.documentElement.scrollWidth,
          controls:[...document.querySelectorAll('nav > a, .nav-links a, #nav-guest a, #hero-invitado a')].filter(visible).map(box),
          navItems:[...document.querySelectorAll('nav > a, .nav-links a, #nav-guest a')].filter(visible).map(box),
          statsAfterExplore:!!(document.getElementById('explorar').compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING),
          statsAfterActions:!!(document.getElementById('como-funciona').compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING)
        };
      });
      assert.equal(layout.width, width, 'No mobile viewport auto-shrink');
      assert.ok(layout.overflow <= width + 1);
      assert.ok(layout.statsAfterExplore && layout.statsAfterActions);
      for (const rect of layout.controls) assert.ok(rect.x >= -1 && rect.right <= width + 1 && rect.height >= 44, JSON.stringify(rect));
      for (let i=0; i<layout.navItems.length; i++) for (let j=i+1; j<layout.navItems.length; j++) {
        const a=layout.navItems[i], b=layout.navItems[j];
        assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, 'Navigation controls cannot overlap');
      }
      await capture(f.page, `deploy-${home.replace('.html','')}-clarity-guest-${width}.png`);
    }
  }
  assert.deepEqual(f.result.writes, [], 'Home presentation cannot write accounts, messages, profiles or campaigns');
});

test('deployed four-screen artist signup uses the unchanged synthetic RPC and opens progressive profile completion', async t => {
  const f = await setup(t, { width:320, onboardingFixture:true });
  await f.go('/buscARTE_registro.html');
  const active = step => f.page.waitForSelector('#step-' + step + '.active');
  const next = step => f.page.locator('#step-' + step + ' .btn-next:not(#registro-detalles-artisticos)').first().click();
  await active('tipo');
  await f.page.locator('#tipo-artista').click(); await next('tipo'); await active('cuenta');
  await f.page.locator('#reg-nombre').fill('Persona sintética de release');
  await f.page.locator('#reg-email').fill('release-smoke@example.invalid');
  await f.page.locator('#reg-password').fill('Synthetic-only-123!');
  await f.page.locator('#sel-provincia').selectOption('Buenos Aires');
  assert.equal(await f.page.locator('#registro-cuenta-opcional').getAttribute('open'), null);
  await next('cuenta'); await active('rubro');
  await f.page.locator('#rubro-grid button[onclick*="seleccionarRubro(\'musica\'"]').click();
  await next('rubro'); await active('perfil');
  assert.equal(await f.page.locator('#registro-perfil-opcional').getAttribute('open'), null);
  await f.page.waitForFunction(() => document.querySelector('#step-perfil .captcha-panel')?.dataset.state === 'ready');
  await next('perfil');
  assert.equal(f.result.registrations.length, 0, 'The shortened flow cannot skip captcha');
  await f.page.evaluate(() => __smokeSolveCaptcha('hcaptcha-box-perfil'));
  await next('perfil'); await active('exito');
  assert.equal(f.result.registrations.length, 1);
  const payload = f.result.registrations[0];
  assert.deepEqual(Object.keys(payload).sort(), ['p_email','p_password','p_nombre','p_provincia','p_ciudad','p_barrio','p_instrumento','p_generos','p_disponibilidad','p_referentes','p_bio','p_tipo_cuenta','p_rubro','p_campos_especificos'].sort());
  assert.equal(payload.p_email, 'release-smoke@example.invalid');
  assert.equal(payload.p_nombre, 'Persona sintética de release');
  assert.equal(payload.p_provincia, 'Buenos Aires');
  assert.equal(payload.p_tipo_cuenta, 'artista'); assert.equal(payload.p_rubro, 'musica');
  for (const key of ['p_ciudad','p_barrio','p_instrumento','p_generos','p_disponibilidad','p_referentes','p_bio']) assert.equal(payload[key], '', key + ' remains optional');
  assert.deepEqual(payload.p_campos_especificos, {});
  assert.equal(await f.page.locator('#exito-btn').getAttribute('href'), 'buscARTE_busqueda.html?rubro=musica');
  const completion = new URL(await f.page.locator('#exito-completar').getAttribute('href'), f.page.url());
  assert.equal(completion.origin, candidate.origin);
  assert.match(completion.pathname, /^\/buscARTE_perfil(?:\.html)?$/i);
  assert.equal(completion.search, ''); assert.equal(completion.hash, '#completar');
  await f.page.evaluate(() => crearPerfil(document.querySelector('#step-perfil .btn-next')));
  assert.equal(f.result.registrations.length, 1, 'Confirmed signup is not submitted twice');
  await capture(f.page, 'deploy-onboarding-success-simulado-320.png');
  await f.page.locator('#exito-completar').click();
  await f.page.waitForFunction(() => !isLoadingProfile && document.activeElement?.id === 'profile-progress');
  assert.equal(new URL(f.page.url()).hash, '#completar');
  assert.equal(await f.page.locator('#profile-progress-meter').getAttribute('aria-valuenow'), '1');
  assert.equal(await f.page.locator('#profile-progress-list li').count(), 5);
  assert.equal(f.result.emails.length, 1);
  assert.deepEqual(f.result.emails[0], { tipo:'bienvenida', destinatario:'release-smoke@example.invalid', datos:{ nombre:'Persona' } });
  assert.deepEqual(f.result.writes, ['POST https://xiaanchoanxmampegoay.supabase.co/rest/v1/rpc/registrar_usuario', 'POST ' + candidate.origin + '/.netlify/functions/send-email'], 'Only the explicit synthetic RPC and welcome mail are requested; neither reaches a service');
  assert.equal(f.result.patches.length, 0);
  await capture(f.page, 'deploy-onboarding-perfil-progresivo-320.png');
});

test('deployed mobile profile completion counts saved basics, not drafts, and survives confirmed synthetic save', async t => {
  const f = await setup(t, { logged:true, width:320, progressFixture:true });
  await f.go('/buscARTE_perfil.html#completar');
  const ready = () => f.page.waitForFunction(() => !isLoadingProfile && document.getElementById('reg-nombre-perfil')?.value === 'Persona de prueba aislada');
  await ready();
  await f.page.waitForFunction(() => document.activeElement?.id === 'profile-progress');
  const meter = f.page.locator('#profile-progress-meter');
  assert.equal(await meter.getAttribute('aria-valuenow'), '1');
  assert.equal(await f.page.locator('#profile-progress-list li').count(), 5);
  assert.equal(await f.page.locator('#profile-progress-list a').count(), 4);
  await f.page.locator('[data-basic="bio"] a').click();
  assert.equal(await f.page.locator('#bio-text').evaluate(el => el === document.activeElement), true);
  await f.page.locator('#bio-text').fill('Presentación sintética confirmada en el smoke.');
  assert.equal(await meter.getAttribute('aria-valuenow'), '1', 'A draft cannot claim saved completion');
  await f.page.locator('#save-bar .btn-neon').click();
  await f.page.waitForFunction(() => document.getElementById('profile-status')?.textContent.includes('Perfil guardado correctamente'));
  assert.equal(await meter.getAttribute('aria-valuenow'), '2');
  assert.equal(f.result.patches.length, 1);
  assert.equal(new URLSearchParams(f.result.patches[0].query).get('id'), 'eq.' + fixtureUser);
  assert.equal(new URLSearchParams(f.result.patches[0].query).get('select'), 'id,campos_especificos');
  assert.match(f.result.patches[0].headers.prefer, /return=representation/);
  await f.page.reload({ waitUntil:'load' }); await ready();
  assert.equal(await meter.getAttribute('aria-valuenow'), '2');
  assert.equal(await f.page.locator('#bio-text').inputValue(), 'Presentación sintética confirmada en el smoke.');
  assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(f.result.writes, ['PATCH https://xiaanchoanxmampegoay.supabase.co/rest/v1/perfiles'], 'Only the explicit synthetic owner PATCH occurs');
  await capture(f.page, 'deploy-perfil-progreso-guardado-simulado-320.png');
});

test('deployed Home URLs expose the same ten existing category destinations with artist-wide metadata', async t => {
  const f = await setup(t, { width: 320 });
  const categories = [
    ['musica', 'Música'], ['actuacion', 'Actuación & escena'],
    ['audiovisual', 'Audiovisual & fotografía'], ['modelaje', 'Modelaje'],
    ['diseno', 'Diseño & artes visuales'], ['tatuaje', 'Tatuaje & arte corporal'],
    ['danza', 'Danza'], ['maquillaje', 'Maquillaje, vestuario & FX'],
    ['circo', 'Circo & artes escénicas'], ['escritura', 'Escritura & guión']
  ];
  for (const home of ['index.html', 'buscARTE_index.html']) {
    await f.go('/' + home);
    await f.page.waitForFunction(() => document.documentElement.dataset.homeSession === 'guest' && document.documentElement.dataset.homeReady === 'true');
    assert.equal(await f.page.title(), 'buscARTE — La red de artistas argentinos');
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      assert.equal(await f.page.locator(selector).getAttribute('content'), 'buscARTE — La red de artistas argentinos');
    }
    assert.equal(await f.page.locator('meta[name="description"]').getAttribute('content'), 'Encontrá artistas por rubro, especialidad y zona. Compartí tu trabajo, publicá anuncios y conectá con la comunidad artística de Argentina.');
    const section = f.page.locator(home === 'index.html' ? '#explorar' : '#home-rubros');
    const links = section.locator(home === 'index.html' ? 'a.rubro-item' : 'a.home-rubro-link');
    assert.equal(await links.count(), categories.length);
    for (let i = 0; i < categories.length; i++) {
      const [key, label] = categories[i], link = links.nth(i);
      const destination = new URL(await link.getAttribute('href'), f.page.url());
      assert.equal(destination.origin, candidate.origin);
      assert.match(destination.pathname, /^\/buscARTE_busqueda(?:\.html)?$/i, 'Only Netlify pretty-URL case/extension serialization may differ');
      assert.equal(destination.search, '?rubro=' + key, 'Exact category query, without additional filters');
      assert.equal(destination.hash, '');
      assert.equal(destination.username + destination.password, '');
      assert.equal(await (home === 'index.html' ? link.locator('.ri-name') : link).textContent(), label);
      assert.equal(await link.isVisible(), true);
      if (home === 'buscARTE_index.html') assert.equal(await link.getAttribute('data-home-rubro'), key);
    }
    if (home === 'buscARTE_index.html') assert.equal(await f.page.locator('#explorar.home-examples').count(), 1, 'Legacy profile examples retain their historical anchor');
    await section.scrollIntoViewIfNeeded();
    await f.page.evaluate(() => Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))));
    assert.equal(await f.page.evaluate(() => innerWidth), 320, 'The physical mobile viewport must not auto-expand');
    assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= 320));
    const bounds = await links.evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height };
    }));
    for (const box of bounds) assert.ok(box.left >= 0 && box.right <= 320 && box.height >= 44 && box.width >= 44, JSON.stringify(box));
    await capture(f.page, `deploy-${home.replace('.html', '')}-diez-rubros-320.png`);
  }
  assert.deepEqual(f.result.writes, [], 'Category discovery and metadata never mutate a backend');
});

test('deployed non-music profiles use neutral guidance and category-specific completion without saving', async t => {
  for (const category of [
    { key: 'maquillaje', name: 'Maquillaje, vestuario & FX', target: 'chips-rol-maq', action: 'Elegí tu rol' },
    { key: 'modelaje', name: 'Modelaje', target: 'chips-tipo-modelo', action: 'Elegí tu tipo de trabajo' }
  ]) {
    const f = await setup(t, { logged: true, width: 320, coherenceFixture: category.key });
    await f.go('/buscARTE_perfil.html#completar');
    await f.page.waitForFunction(() => !isLoadingProfile && !!perfilCargado && document.activeElement?.id === 'profile-progress');
    assert.equal(await f.page.evaluate(() => rubroActivo), category.key);
    assert.equal(await f.page.locator('#sidebar-rubro-nombre-display').textContent(), category.name);
    assert.equal(await f.page.locator('#mi-rubro-titulo').textContent(), category.name);
    assert.equal(await f.page.locator('#mi-rubro').isVisible(), true);
    for (const selector of ['#musica', '#referentes-section', '#ensayo']) {
      assert.equal(await f.page.locator(selector).isVisible(), false, selector + ' remains hidden for non-musicians');
    }
    assert.equal(await f.page.locator('#reg-nombre-perfil').inputValue(), 'Persona de prueba aislada');
    assert.equal(await f.page.locator('#bio-text').inputValue(), 'Perfil sintético de smoke test.');
    assert.equal(await f.page.locator('#bio-text').getAttribute('placeholder'), 'Contá qué hacés, qué experiencia tenés y en qué proyectos te gustaría participar.');
    assert.equal(await f.page.locator('#profile-progress-meter').getAttribute('aria-valuenow'), '3', 'A stale instrument cannot complete a non-music role');
    assert.doesNotMatch(await f.page.locator('#profile-progress').innerText(), /instrumento|tu música|guitarrista/i);
    const action = f.page.locator('[data-basic="disciplina"] a');
    assert.equal(await action.locator('span').first().textContent(), category.action);
    assert.equal(await action.getAttribute('href'), '#' + category.target);
    await capture(f.page, `deploy-perfil-${category.key}-checklist-320.png`);
    await action.click();
    assert.equal(await f.page.locator('#' + category.target).evaluate(el => el === document.activeElement), true);
    assert.equal(await f.page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), false);
    assert.equal(await f.page.evaluate(() => innerWidth), 320);
    assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= 320));
    assert.deepEqual(f.result.writes, [], 'Reading or following completion guidance cannot save profiles, register accounts or send email');
    assert.equal(f.result.patches.length, 0);
    await capture(f.page, `deploy-perfil-${category.key}-campo-320.png`);
  }
});
