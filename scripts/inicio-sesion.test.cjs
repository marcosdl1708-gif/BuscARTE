const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'buscARTE_index.html'];
const sharedFiles = ['assets/js/inicio-sesion.js', 'assets/css/inicio-sesion.css'];
const allowedFiles = new Set([...JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')), ...sharedFiles]);
const origin = 'https://buscarte.test';
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
});
after(async () => { await browser?.close(); });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function member(role = 'artista', extra = {}) {
  return { ba_logged: '1', ba_user_id: 'fixture-user', ba_name: 'Persona Prueba', ba_tipo_cuenta: role,
    ...(role === 'artista' ? { ba_rubro: 'musica' } : role === 'visitante' ? { ba_rubro: 'danza' } : {}), ...extra };
}

async function setup(t, file, { storage = {}, storageBlocked = false, width = 390, messageResponses = [], authFixture = false, authConfig = null, delayedAsset = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
  await context.addInitScript(({ storage, storageBlocked, authFixture, authConfig }) => {
    const rawSet = Storage.prototype.setItem;
    const rawRemove = Storage.prototype.removeItem;
    const rawClear = Storage.prototype.clear;
    rawSet.call(localStorage, 'buscarte_meta_consent_v1', 'denied');
    for (const [key, value] of Object.entries(storage)) rawSet.call(localStorage, key, value);
    window.__homeStorageWrites = [];
    Storage.prototype.setItem = function (key, value) { window.__homeStorageWrites.push(['set', key, new Error().stack]); return rawSet.call(this, key, value); };
    Storage.prototype.removeItem = function (key) { window.__homeStorageWrites.push(['remove', key, new Error().stack]); return rawRemove.call(this, key); };
    Storage.prototype.clear = function () { window.__homeStorageWrites.push(['clear', null, new Error().stack]); return rawClear.call(this); };
    window.__fixtureStorage = (updates, eventKind = 'storage', eventKey = null) => {
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) rawRemove.call(localStorage, key);
        else rawSet.call(localStorage, key, value);
      }
      if (eventKind === 'storage') window.dispatchEvent(new StorageEvent('storage', { key: eventKey }));
      else if (eventKind === 'pageshow') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      else if (eventKind === 'focus') window.dispatchEvent(new Event('focus'));
      else if (eventKind === 'visibility') document.dispatchEvent(new Event('visibilitychange'));
    };
    if (storageBlocked) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Synthetic disabled storage', 'SecurityError'); } });
    if (authFixture) {
      window.BuscARTEConfig = authConfig || { isLocalRuntime: true, mode: 'auth', networkEnabled: true, syncLegacyCache: false };
      let resolveReady, rejectReady;
      const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      window.__authState = { authenticated: false, status: 'loading', profileId: null };
      window.__resolveAuthReady = state => resolveReady(state);
      window.__rejectAuthReady = () => rejectReady(new Error('Synthetic Auth unavailable'));
      window.__emitAuth = state => { window.__authState = state; window.dispatchEvent(new CustomEvent('buscarte:authchange', { detail: state })); };
      window.BuscARTEAuth = { ready, getState: () => window.__authState, signOut: async () => {} };
    }
  }, { storage, storageBlocked, authFixture, authConfig });

  const calls = { files: [], messages: [], unexpected: [], errors: [], consoleErrors: [] };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const relative = url.pathname.slice(1);
    if (url.origin === origin && request.method() === 'GET' && allowedFiles.has(relative)) {
      calls.files.push(relative);
      if (delayedAsset?.file === relative) await delayedAsset.gate.promise;
      const ext = path.extname(relative);
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' }[ext] || 'text/plain';
      return route.fulfill({ contentType, body: fs.readFileSync(path.join(root, relative)) });
    }
    if (url.hostname === 'fonts.googleapis.com' && request.method() === 'GET') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co' && request.method() === 'GET') {
      if (url.pathname === '/rest/v1/mensajes') {
        const response = messageResponses[calls.messages.length] || {};
        calls.messages.push({ url: request.url(), recipient: url.searchParams.get('para_user_id') });
        if (response.gate) await response.gate.promise;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response.rows || []) });
      }
      if (['/rest/v1/perfiles', '/rest/v1/anuncios'].includes(url.pathname)) return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
    }
    if (url.origin === origin && url.pathname === '/favicon.ico' && request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    // No continue/fallback/fetch: even an unforeseen API, mutation, email,
    // storage upload, pixel, navigation or SDK request fails closed.
    calls.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') calls.consoleErrors.push(message.text()); });
  await page.goto(origin + '/' + file, { waitUntil: delayedAsset ? 'commit' : 'load' });
  await page.waitForFunction(() => !!window.BuscARTEInicio && ['guest', 'member', 'recover'].includes(document.documentElement.dataset.homeSession));
  async function state(expected) {
    await page.waitForFunction(expected => document.documentElement.dataset.homeSession === expected, expected);
  }
  async function update(values, kind = 'storage', key = null) {
    await page.evaluate(({ values, kind, key }) => window.__fixtureStorage(values, kind, key), { values, kind, key });
  }
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, [], 'All network is synthetic and no new request is silently allowed');
      assert.deepEqual(calls.errors, [], 'No uncaught Home errors');
      assert.deepEqual(calls.consoleErrors, [], 'No unexpected console errors');
      const writes = await page.evaluate(() => __homeStorageWrites);
      // The pre-existing Supabase vendor tests browser storage once on import,
      // using a temporary lswt-* set/remove pair. It is not the new Home UI.
      const vendorProbe = write => ['set', 'remove'].includes(write[0]) && /^lswt-[0-9.]+$/.test(write[1]) && write[2]?.includes('/assets/vendor/supabase-2.112.3.min.js');
      const probes = writes.filter(vendorProbe);
      assert.ok(probes.length === 0 || (probes.length === 2 && probes[0][0] === 'set' && probes[1][0] === 'remove' && probes[0][1] === probes[1][1]), 'Only the existing paired vendor capability probe is exempt');
      assert.deepEqual(writes.filter(write => !vendorProbe(write)), [], 'Home presentation does not rewrite identity/storage');
      for (const asset of sharedFiles) assert.ok(calls.files.includes(asset), `${file} must use shared ${asset}`);
    } finally { await context.close(); }
  });
  return { page, calls, state, update };
}

async function visibleSignupLinks(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href*="registro"]')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    .map(el => el.textContent.trim()));
}

async function assertKnownHasNoSignup(page) {
  assert.deepEqual(await visibleSignupLinks(page), []);
  const copy = await page.locator('body').innerText();
  assert.doesNotMatch(copy, /probá sin registrarte|crear perfil gratis|sin registro para mirar|el registro aparece cuando/i);
}

async function poll(check, description) {
  const end = Date.now() + 5000;
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(check(), description);
}

async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  assert.ok(output !== path.join(root, 'dist') && !output.startsWith(path.join(root, 'dist') + path.sep), 'Captures must stay outside dist');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

for (const file of pages) {
  for (const role of ['artista', 'negocio', 'visitante']) {
    test(`${file}: ${role} sees usable member actions, not registration or invented profile status`, async t => {
      const f = await setup(t, file, { storage: member(role) });
      await f.state('member');
      assert.equal(await f.page.locator('#nav-user').isVisible(), true);
      assert.equal(await f.page.locator('#nav-guest').isVisible(), false);
      assert.equal(await f.page.locator('#hero-logueado').isVisible(), true);
      assert.equal(await f.page.locator('#hero-recuperar').isVisible(), false);
      await assertKnownHasNoSignup(f.page);
      const actions = await f.page.locator('#hero-logueado a').evaluateAll(links => links.map(link => ({ text: link.innerText, href: link.getAttribute('href') })));
      assert.equal(actions.length, 4);
      for (const [label, target] of [['Buscar artistas', 'buscARTE_busqueda.html'], ['Ver anuncios', 'buscARTE_anuncios.html'], ['Mis mensajes', 'buscARTE_mensajes.html'], ['Ver mi perfil', 'buscARTE_perfil_publico.html?id=fixture-user']]) {
        assert.ok(actions.some(action => action.text.includes(label) && action.href === target), `${label} uses the existing destination without opening it`);
      }
      assert.doesNotMatch(await f.page.locator('#hero-logueado').innerText(), /perfil artístico|perfil completo|perfil incompleto|\d+\s*%|danza/i);
      assert.equal(await f.page.locator('#hero-nombre').textContent(), 'Persona');
    });
  }

  test(`${file}: guests and stale IDs without the exact logged flag retain public exploration and signup`, async t => {
    for (const storage of [{}, { ba_user_id: 'stale-id', ba_name: 'Nombre Viejo', ba_tipo_cuenta: 'visitante' }, { ba_logged: 'true', ba_user_id: 'stale-id' }, { ba_logged: '0', ba_user_id: 'stale-id' }]) {
      const f = await setup(t, file, { storage });
      await f.state('guest');
      assert.ok((await visibleSignupLinks(f.page)).length > 0);
      assert.equal(await f.page.locator('#nav-user').isVisible(), false);
      assert.equal(await f.page.locator('#hero-logueado').isVisible(), false);
      assert.equal(await f.page.locator('#hero-recuperar').isVisible(), false);
      assert.ok(await f.page.locator('#hero-invitado-wrap').isVisible());
      assert.ok(await f.page.locator('a[href="#explorar"]').count() > 0);
    }
  });

  test(`${file}: a logged flag without a usable ID offers recovery, no registration or private shortcuts`, async t => {
    for (const id of [null, '', '   ', 'null', 'undefined', '\ud800']) {
      const storage = { ba_logged: '1', ba_name: 'Persona Prueba' };
      if (id !== null) storage.ba_user_id = id;
      const f = await setup(t, file, { storage });
      await f.state('recover');
      await assertKnownHasNoSignup(f.page);
      assert.equal(await f.page.locator('#hero-recuperar').isVisible(), true);
      assert.equal(await f.page.locator('#hero-logueado').isVisible(), false);
      assert.equal(await f.page.locator('#nav-user').isVisible(), false);
      const recoveryLinks = await f.page.locator('#hero-recuperar a').evaluateAll(links => links.map(link => ({ text: link.innerText, href: link.getAttribute('href') })));
      assert.ok(recoveryLinks.some(link => /volver a ingresar/i.test(link.text) && link.href === 'buscARTE_login.html'));
      const privateLinks = await f.page.evaluate(() => [...document.querySelectorAll('a[href]')].filter(el => el.getClientRects().length && /(?:perfil_publico|buscARTE_perfil\.html|mensajes|mis_anuncios|guardados)/.test(el.getAttribute('href'))).map(el => el.getAttribute('href')));
      assert.deepEqual(privateLinks, []);
    }
  });

  test(`${file}: disabled localStorage degrades safely to guest instead of breaking the page`, async t => {
    const f = await setup(t, file, { storageBlocked: true });
    await f.state('guest');
    assert.equal(await f.page.locator('#hero-logueado').isVisible(), false);
    assert.ok((await visibleSignupLinks(f.page)).length > 0);
  });

  test(`${file}: displayed names remain text and profile IDs are encoded`, async t => {
    const maliciousName = '<img src=x onerror=window.__nameInjected=1> Prueba';
    const uid = 'fixture?id=1&role=artist#fragment';
    const f = await setup(t, file, { storage: member('artista', { ba_name: maliciousName, ba_user_id: uid }) });
    await f.state('member');
    assert.equal(await f.page.evaluate(() => window.__nameInjected), undefined);
    assert.equal(await f.page.locator('#hero-nombre img').count(), 0);
    assert.equal(await f.page.locator('#hero-nombre').textContent(), '<img');
    assert.equal(await f.page.locator('#hero-mi-perfil').getAttribute('href'), 'buscARTE_perfil_publico.html?id=' + encodeURIComponent(uid));
    await f.update({ ba_name: '     ' }, 'storage', 'ba_name');
    assert.doesNotMatch(await f.page.locator('#hero-logueado').innerText(), /undefined|null/);
  });

  test(`${file}: storage, BFCache pageshow, focus and visibility refresh legacy presentation`, async t => {
    const f = await setup(t, file);
    await f.state('guest');
    await f.update(member(), 'storage', 'ba_logged');
    await f.state('member');
    await assertKnownHasNoSignup(f.page);
    await f.update({ ba_name: 'Nombre Actualizado' }, 'storage', 'ba_name');
    assert.equal(await f.page.locator('#hero-nombre').textContent(), 'Nombre');
    await f.update({ ba_user_id: null }, 'pageshow');
    await f.state('recover');
    await f.update({ ba_user_id: 'new-id' }, 'focus');
    await f.state('member');
    assert.match(await f.page.locator('#hero-mi-perfil').getAttribute('href'), /id=new-id$/);
    await f.update({ ba_logged: null }, 'visibility');
    await f.state('guest');
    await f.update(member(), 'storage', null);
    await f.state('member');
    await f.update({ ba_logged: null, ba_user_id: null, ba_name: null }, 'storage', null);
    await f.state('guest');
  });

  test(`${file}: account menu responds to Enter and Escape with correct focus and aria-expanded`, async t => {
    const f = await setup(t, file, { storage: member() });
    await f.state('member');
    const button = f.page.locator('#nav-avatar-btn');
    await button.focus();
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    await f.page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
    assert.equal(await f.page.locator('#nav-dropdown').isVisible(), true);
    await f.page.keyboard.press('Escape');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.equal(await button.evaluate(el => el === document.activeElement), true);
    assert.equal(await f.page.locator('#nav-dropdown').isVisible(), false);
  });

  test(`${file}: an old user's delayed message badge cannot appear for the new user or after logout`, async t => {
    const first = deferred();
    const second = deferred();
    const f = await setup(t, file, { storage: member(), messageResponses: [{ gate: first, rows: [{ id: 1 }, { id: 2 }] }, { gate: second, rows: [{ id: 3 }] }] });
    await f.state('member');
    await poll(() => f.calls.messages.length >= 1, 'Initial badge request starts');
    await f.update({ ba_user_id: 'second-user' }, 'storage', 'ba_user_id');
    await poll(() => f.calls.messages.length >= 2, 'New identity starts a new badge request');
    const firstResponse = f.page.waitForResponse(f.calls.messages[0].url);
    first.resolve();
    await (await firstResponse).finished();
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await f.page.locator('#nav-msg-badge').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await f.page.locator('#nav-msg-badge').textContent(), '');
    await f.update({ ba_logged: null }, 'storage', 'ba_logged');
    await f.state('guest');
    const secondResponse = f.page.waitForResponse(f.calls.messages[1].url);
    second.resolve();
    await (await secondResponse).finished();
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await f.page.locator('#nav-msg-badge').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await f.page.locator('#nav-msg-badge').textContent(), '');
  });

  test(`${file}: changing the last-seen marker refreshes the message badge for the same identity`, async t => {
    const f = await setup(t, file, { storage: member(), messageResponses: [{ rows: [{ id: 1 }, { id: 2 }] }, { rows: [] }] });
    await f.state('member');
    await f.page.waitForFunction(() => document.getElementById('nav-msg-badge').textContent === '2');
    await f.update({ ba_msg_last_seen: '2030-01-01T00:00:00Z' }, 'storage', 'ba_msg_last_seen');
    await poll(() => f.calls.messages.length === 2, 'Last-seen change starts a fresh badge read');
    assert.equal(new URL(f.calls.messages[1].url).searchParams.get('created_at'), 'gt.2030-01-01T00:00:00Z');
    await f.page.waitForFunction(() => getComputedStyle(document.getElementById('nav-msg-badge')).display === 'none');
  });

  for (const width of [320, 390, 1280]) {
    test(`${file}: member actions fit ${width}px and keep minimum touch targets`, async t => {
      const f = await setup(t, file, { storage: member(), width });
      await f.state('member');
      const metrics = await f.page.evaluate(() => ({
        width: document.documentElement.scrollWidth, viewport: window.innerWidth,
        actions: [...document.querySelectorAll('#hero-logueado a, #nav-avatar-btn')].map(el => {
          const rect = el.getBoundingClientRect();
          return { text: el.textContent.trim(), x: rect.x, right: rect.right, height: rect.height };
        })
      }));
      assert.ok(metrics.width <= metrics.viewport + 1, 'No horizontal overflow');
      for (const action of metrics.actions) {
        assert.ok(action.x >= -1 && action.right <= width + 1, JSON.stringify(action));
        assert.ok(action.height >= 44, JSON.stringify(action));
      }
      await capture(f.page, `despues-${file.replace('.html', '')}-member-${width}.png`);
      if (width === 390) {
        await capture(f.page, `despues-${file.replace('.html', '')}-member.png`);
        await f.page.locator('.cta-section').scrollIntoViewIfNeeded();
        await f.page.waitForFunction(() => document.querySelector('.cta-section').classList.contains('visible'));
        await capture(f.page, `despues-${file.replace('.html', '')}-member-cta.png`);
        await f.page.evaluate(() => window.scrollTo(0, 0));
        await f.update({ ba_user_id: null }, 'storage', 'ba_user_id');
        await f.state('recover');
        await capture(f.page, `despues-${file.replace('.html', '')}-recover.png`);
        await f.update({ ba_logged: null }, 'storage', 'ba_logged');
        await f.state('guest');
        await capture(f.page, `despues-${file.replace('.html', '')}-guest.png`);
      }
    });
  }
}

test('index.html: Auth ready and events never fall back to legacy identity or overwrite a newer event', async t => {
  const f = await setup(t, 'index.html', { storage: member(), authFixture: true });
  await f.state('guest');
  await f.page.evaluate(() => __emitAuth({ authenticated: true, profileId: 'auth-user', profile: { nombre: 'Nombre Auth' }, status: 'authenticated' }));
  await f.state('member');
  assert.match(await f.page.locator('#hero-mi-perfil').getAttribute('href'), /id=auth-user$/);
  await f.page.evaluate(() => __resolveAuthReady({ authenticated: false, profileId: null, status: 'anonymous' }));
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await f.state('member');
  for (const status of ['anonymous', 'loading', 'blocked', 'profile_missing']) {
    await f.page.evaluate(status => __emitAuth({ authenticated: status === 'profile_missing', profileId: null, status }), status);
    await f.state('guest');
    assert.equal(await f.page.locator('#hero-logueado').isVisible(), false);
  }
  assert.equal(f.calls.messages.length, 0, 'Local Auth branch does not read legacy badges');
});

test('index.html: Auth initial ready can supply a profile and rejection does not resurrect cached identity', async t => {
  const ready = await setup(t, 'index.html', { storage: member(), authFixture: true });
  await ready.page.evaluate(() => __resolveAuthReady({ authenticated: true, profileId: 'ready-user', profile: { nombre: 'Cuenta Validada' } }));
  await ready.state('member');
  assert.equal(await ready.page.locator('#hero-nombre').textContent(), 'Cuenta');
  const failed = await setup(t, 'index.html', { storage: member(), authFixture: true });
  await failed.page.evaluate(() => __rejectAuthReady());
  await failed.state('guest');
  assert.equal(await failed.page.locator('#hero-logueado').isVisible(), false);
});

test('index.html: every part of the existing Auth gate remains necessary', async t => {
  for (const config of [
    { isLocalRuntime: false, mode: 'auth', networkEnabled: true },
    { isLocalRuntime: true, mode: 'shadow', networkEnabled: true },
    { isLocalRuntime: true, mode: 'auth', networkEnabled: false }
  ]) {
    const f = await setup(t, 'index.html', { storage: member(), authFixture: true, authConfig: config });
    await f.state('member');
    assert.match(await f.page.locator('#hero-mi-perfil').getAttribute('href'), /id=fixture-user$/);
    await f.page.evaluate(() => __emitAuth({ authenticated: false, profileId: null, status: 'anonymous' }));
    await f.state('member');
  }
});

test('index.html: a slow existing vendor cannot expose uninitialized profile or account controls', async t => {
  const gate = deferred();
  const f = await setup(t, 'index.html', { storage: member(), delayedAsset: { file: 'assets/vendor/supabase-2.112.3.min.js', gate } });
  await poll(() => f.calls.files.includes('assets/vendor/supabase-2.112.3.min.js'), 'Browser is paused at the real blocking vendor script');
  await f.page.waitForSelector('#hero-logueado');
  await f.state('member');
  assert.deepEqual(await visibleSignupLinks(f.page), []);
  assert.notEqual(await f.page.evaluate(() => document.documentElement.dataset.homeReady), 'true');
  assert.equal(await f.page.locator('#nav-user').isVisible(), false);
  assert.equal(await f.page.locator('#hero-mi-perfil').evaluate(el => el.inert), true);
  assert.equal(await f.page.locator('#hero-mi-perfil').isVisible(), false);
  assert.equal(await f.page.locator('.home-profile-loading').isVisible(), true);
  const available = await f.page.locator('#hero-logueado a').evaluateAll(links => links.filter(el => !el.inert && el.getClientRects().length).map(el => el.getAttribute('href')));
  assert.deepEqual(available, ['buscARTE_busqueda.html', 'buscARTE_anuncios.html', 'buscARTE_mensajes.html']);
  gate.resolve();
  await f.page.waitForLoadState('load');
  await f.page.waitForFunction(() => document.documentElement.dataset.homeReady === 'true');
  assert.equal(await f.page.locator('.home-profile-loading').isVisible(), false);
  assert.equal(await f.page.locator('#hero-mi-perfil').evaluate(el => el.inert), false);
  assert.equal(await f.page.locator('#hero-mi-perfil').getAttribute('href'), 'buscARTE_perfil_publico.html?id=fixture-user');
  assert.equal(await f.page.locator('#nav-user').isVisible(), true);
  await f.page.locator('#nav-avatar-btn').focus();
  await f.page.keyboard.press('Enter');
  assert.equal(await f.page.locator('#nav-avatar-btn').getAttribute('aria-expanded'), 'true');
});
