const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const profileFile = 'buscARTE_perfil_publico.html';
const siteFiles = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
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

function member(extra = {}) {
  return { ba_logged: '1', ba_user_id: '210', ba_name: 'Persona Propia', ba_tipo_cuenta: 'artista',
    ba_rubro: 'musica', ba_referentes: 'Referencia sintética', ...extra };
}

function profile(id = 210, extra = {}) {
  return { id, nombre: id === 210 ? 'Persona Propia' : 'Persona Ajena', tipo_cuenta: 'artista', rubro: 'musica',
    instrumento: 'Guitarra', generos: 'Rock', referentes: 'Referencia sintética', bio: 'Perfil de prueba aislado.',
    ciudad: 'Buenos Aires', barrio: 'Almagro', experiencia: 4, disponibilidad: 'Proyectos', ...extra };
}

async function setup(t, { storage = member(), query = '?id=210', rows, profiles, responseStatus = 200, profileGate,
  storageBlocked = false, width = 390, mutationMode = false, existingConversation = false, conversationGate } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
  await context.addInitScript(({ storage, storageBlocked }) => {
    const rawSet = Storage.prototype.setItem;
    const rawRemove = Storage.prototype.removeItem;
    rawSet.call(localStorage, 'buscarte_meta_consent_v1', 'denied');
    for (const [key, value] of Object.entries(storage)) rawSet.call(localStorage, key, value);
    window.__profileStorageWrites = [];
    Storage.prototype.setItem = function(key, value) { window.__profileStorageWrites.push(['set', key]); return rawSet.call(this, key, value); };
    Storage.prototype.removeItem = function(key) { window.__profileStorageWrites.push(['remove', key]); return rawRemove.call(this, key); };
    window.__fixtureStorage = (updates, eventKind = 'storage') => {
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) rawRemove.call(localStorage, key); else rawSet.call(localStorage, key, value);
      }
      if (eventKind === 'storage') window.dispatchEvent(new StorageEvent('storage', { key: 'ba_user_id' }));
      else if (eventKind === 'pageshow') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      else if (eventKind === 'focus') window.dispatchEvent(new Event('focus'));
      else if (eventKind === 'visibility') document.dispatchEvent(new Event('visibilitychange'));
    };
    window.__sharedProfiles = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__sharedProfiles.push(data); } });
    window.alert = message => { (window.__fixtureAlerts ||= []).push(String(message)); };
    if (storageBlocked) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Synthetic disabled storage', 'SecurityError'); } });
  }, { storage, storageBlocked });
  const calls = { reads: [], writes: [], unexpected: [], errors: [], consoleErrors: [], navigations: [] };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const relative = url.pathname.slice(1);
    if (url.origin === origin && request.method() === 'GET' && siteFiles.has(relative)) {
      if (relative.endsWith('.html') && relative !== profileFile) {
        calls.navigations.push(url.pathname + url.search);
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destino simulado</title><p>Destino simulado, sin ejecutar otra página ni servicios.</p>' });
      }
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(relative)] || 'text/plain';
      return route.fulfill({ contentType, body: fs.readFileSync(path.join(root, relative)) });
    }
    if (url.hostname === 'fonts.googleapis.com' && request.method() === 'GET') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co' && request.method() === 'GET') {
      calls.reads.push({ path: url.pathname, query: url.search });
      if (url.pathname === '/rest/v1/perfiles') {
        if (url.searchParams.get('select') === 'referentes,generos') return route.fulfill({ contentType: 'application/json', body: '[]' });
        if (profileGate) await profileGate.promise;
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const body = rows === undefined ? [profiles?.[id] || profile(Number(id))] : rows;
        return route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(body) });
      }
      if (['/rest/v1/mensajes', '/rest/v1/perfiles_guardados'].includes(url.pathname)) return route.fulfill({ contentType: 'application/json', body: '[]' });
      if (url.pathname === '/rest/v1/conversaciones' && (mutationMode || conversationGate)) {
        if (conversationGate) await conversationGate.promise;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(existingConversation ? [{ id: 501 }] : []) });
      }
    }
    if (request.method() !== 'GET') {
      const write = { method: request.method(), path: url.pathname, body: request.postDataJSON() };
      calls.writes.push(write);
      if (mutationMode && url.hostname === 'xiaanchoanxmampegoay.supabase.co' && ['/rest/v1/conversaciones', '/rest/v1/mensajes', '/rest/v1/perfiles_guardados'].includes(url.pathname)) {
        return route.fulfill({ status: request.method() === 'POST' ? 201 : 204, contentType: 'application/json', body: request.method() === 'POST' && url.pathname === '/rest/v1/conversaciones' ? '[{"id":501}]' : '' });
      }
    }
    if (url.origin === origin && url.pathname === '/favicon.ico' && request.method() === 'GET') return route.fulfill({ status: 204, body: '' });
    // No continue/fallback/fetch: all data, uploads, messages, reporting/email,
    // tracking and navigation are explicitly mocked or fail closed.
    calls.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') calls.consoleErrors.push(message.text()); });
  await page.goto(origin + '/' + profileFile + query, { waitUntil: 'load' });
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, [], 'No unmocked network request, write, email or API is permitted');
      assert.deepEqual(calls.errors, [], 'No uncaught public-profile errors');
      if (responseStatus < 400) assert.deepEqual(calls.consoleErrors, [], 'Normal profile scenarios have no unexpected console errors');
      else assert.ok(calls.consoleErrors.every(message => message.includes(String(responseStatus)) && /Failed to load resource|Error cargando perfil/.test(message)), 'Only the intentional profile HTTP failure is allowed');
      if (!mutationMode) assert.deepEqual(calls.writes, [], 'Presentation and invalid/self actions never write to APIs');
      assert.deepEqual(await page.evaluate(() => window.__profileStorageWrites || []), [], 'Profile presentation must not rewrite identity');
    } finally { await context.close(); }
  });
  async function update(updates, kind = 'storage') { await page.evaluate(({ updates, kind }) => window.__fixtureStorage(updates, kind), { updates, kind }); }
  return { page, calls, update };
}

async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  assert.ok(output !== path.join(root, 'dist') && !output.startsWith(path.join(root, 'dist') + path.sep), 'Captures stay outside dist');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

async function state(page, expected) {
  await page.waitForFunction(expected => document.body.dataset.profileState === expected, expected);
}

async function assertOwn(page) {
  await state(page, 'own');
  assert.equal(await page.locator('#profile-owner-note').isVisible(), true);
  assert.equal(await page.locator('#edit-profile-link').isVisible(), true);
  assert.equal(await page.locator('#edit-profile-link').getAttribute('href'), 'buscARTE_perfil.html');
  for (const selector of ['#contact-profile-btn', '#contact-card', '#save-btn', '#report-link']) {
    assert.equal(await page.locator(selector).isVisible(), false, `${selector} must not invite an action against the owner`);
  }
  assert.equal(await page.locator('#share-btn').isVisible(), true);
}

for (const width of [320, 390, 768, 1280]) {
  for (const role of ['artista', 'negocio', 'visitante']) {
    test(`own ${role} at ${width}px: editing replaces self-contact, with usable mobile controls`, async t => {
      const f = await setup(t, { width, rows: [profile(210, { tipo_cuenta: role })], storage: member({ ba_tipo_cuenta: role }) });
      await assertOwn(f.page);
      for (const selector of ['#edit-profile-link', '#share-btn']) {
        const box = await f.page.locator(selector).boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${selector} has a 44px touch target`);
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${selector} stays inside the viewport`);
      }
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (role === 'visitante') {
        assert.equal(await f.page.locator('.profile-stats').isVisible(), false, 'mobile !important CSS must not restore artist stats for visitors');
        assert.equal(await f.page.locator('#perfil-instrumento').innerText(), 'Usuario de buscARTE');
      }
      if (width === 390 && role === 'artista') await capture(f.page, 'perfil-propio-390.png');
    });
  }
}

test('own profile without id uses the signed-in fallback and shares an explicit recipient URL', async t => {
  const f = await setup(t, { query: '' });
  await assertOwn(f.page);
  await f.page.locator('#share-btn').click();
  const shared = await f.page.evaluate(() => window.__sharedProfiles);
  assert.equal(shared.length, 1);
  const url = new URL(shared[0].url);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, '/' + profileFile);
  assert.equal(url.searchParams.get('id'), '210', 'Recipients must see the sender profile, not their own fallback profile');
});

test('numeric aliases and trimmed IDs still identify the owner', async t => {
  const f = await setup(t, { query: '?id=00210', storage: member({ ba_user_id: ' 210 ' }), rows: [profile(210)] });
  await assertOwn(f.page);
});

test('self-contact, saving and reporting are also guarded when functions are called directly', async t => {
  const f = await setup(t);
  await assertOwn(f.page);
  await f.page.evaluate(async () => {
    document.querySelector('.contact-form textarea').value = 'Mensaje que no debe existir';
    await sendMessage();
    await toggleSave();
    abrirReporte();
    selectMotivo(null, 'Otro');
    await enviarReporte();
  });
  assert.equal(await f.page.locator('#report-overlay').evaluate(el => el.classList.contains('open')), false);
  assert.deepEqual(f.calls.writes, []);
  assert.equal(f.calls.reads.some(call => call.path === '/rest/v1/conversaciones'), false);
});

test('slow profile response exposes a loading state, never transient contact or owner actions', async t => {
  const gate = deferred();
  const f = await setup(t, { profileGate: gate });
  try {
    await state(f.page, 'loading');
    assert.equal(await f.page.locator('#profile-status').isVisible(), true);
    for (const selector of ['#contact-profile-btn', '#contact-card', '#edit-profile-link', '#save-btn', '#report-link', '#share-btn']) {
      assert.equal(await f.page.locator(selector).isVisible(), false, `${selector} waits for a loaded target`);
    }
  } finally { gate.resolve(); }
  await assertOwn(f.page);
});

for (const fixture of [
  { name: 'missing id and guest', storage: {}, query: '' },
  { name: 'stale ID without logged flag', storage: { ba_user_id: '210', ba_name: 'Cuenta anterior' }, query: '' },
  { name: 'incomplete signed-in cache', storage: { ba_logged: '1', ba_name: 'Cuenta parcial' }, query: '' },
  { name: 'missing row', rows: [] },
  { name: 'HTTP error', responseStatus: 503, rows: { error: 'Synthetic unavailable' } },
  { name: 'suspended profile', rows: [profile(210, { baneado: true })] }
]) {
  test(`${fixture.name}: explicit unavailable feedback and no actionable fake profile`, async t => {
    const { name, ...options } = fixture;
    const f = await setup(t, options);
    await state(f.page, 'unavailable');
    assert.equal(await f.page.locator('#profile-status').isVisible(), true);
    assert.ok((await f.page.locator('#profile-status').innerText()).trim().length > 15);
    for (const selector of ['#contact-profile-btn', '#contact-card', '#edit-profile-link', '#save-btn', '#report-link', '#share-btn']) {
      assert.equal(await f.page.locator(selector).isVisible(), false, `${selector} remains hidden with no valid profile`);
    }
    if (options.query === '') assert.equal(f.calls.reads.some(call => call.path === '/rest/v1/perfiles'), false);
    if (name === 'suspended profile') assert.equal(await f.page.locator('.profile-body').isVisible(), false, 'mobile !important must not expose a suspended profile body');
  });
}

test('an explicit public target works with storage disabled, without treating it as the viewer profile', async t => {
  const f = await setup(t, { query: '?id=320', storageBlocked: true });
  await state(f.page, 'other');
  assert.equal(await f.page.locator('#perfil-nombre').innerText(), 'Persona Ajena');
  assert.equal(await f.page.locator('#contact-profile-btn').isVisible(), true);
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), false);
  assert.equal(await f.page.locator('#save-btn').isVisible(), false);
});

test('a stale cache ID does not claim an explicit profile as owned after logout', async t => {
  const f = await setup(t, { storage: { ba_user_id: '210', ba_name: 'Nombre viejo' } });
  await state(f.page, 'other');
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), false);
  assert.equal(await f.page.locator('#contact-profile-btn').isVisible(), true);
  assert.equal(await f.page.locator('#save-btn').isVisible(), false);
});

test('other profile preserves contact, save and report; Contactar focuses its actual form', async t => {
  const f = await setup(t, { query: '?id=320' });
  await state(f.page, 'other');
  assert.equal(await f.page.locator('#profile-owner-note').isVisible(), false);
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), false);
  for (const selector of ['#contact-profile-btn', '#contact-card', '#save-btn', '#report-link', '#share-btn']) {
    assert.equal(await f.page.locator(selector).isVisible(), true);
  }
  await f.page.locator('#contact-profile-btn').click();
  assert.equal(await f.page.locator('.contact-form textarea').evaluate(el => document.activeElement === el), true);
  await capture(f.page, 'perfil-ajeno-contacto-390.png');
});

for (const existingConversation of [false, true]) {
  test(`other profile keeps the message contract (${existingConversation ? 'existing' : 'new'} conversation), entirely synthetic`, async t => {
    const f = await setup(t, { query: '?id=320', mutationMode: true, existingConversation });
    await state(f.page, 'other');
    await f.page.locator('.contact-form textarea').fill('Hola, quiero conversar sobre un proyecto.');
    await f.page.locator('.btn-send').click();
    await f.page.waitForFunction(() => document.querySelector('.btn-send').textContent.includes('Mensaje enviado'));
    assert.equal(f.calls.writes.length, existingConversation ? 2 : 3);
    const message = f.calls.writes.find(call => call.path === '/rest/v1/mensajes');
    assert.deepEqual(message, { method: 'POST', path: '/rest/v1/mensajes', body: { de_user_id: 210, para_user_id: 320, contenido: 'Hola, quiero conversar sobre un proyecto.' } });
    assert.ok(f.calls.writes.some(call => call.method === 'PATCH' && call.path === '/rest/v1/conversaciones'));
    assert.equal(await f.page.locator('.contact-form textarea').inputValue(), '');
  });
}

test('session changes reclassify a fixed profile and remove an open self-report form', async t => {
  const f = await setup(t, { query: '?id=320' });
  await state(f.page, 'other');
  await f.page.locator('#report-link').click();
  assert.equal(await f.page.locator('#report-overlay').evaluate(el => el.classList.contains('open')), true);
  await f.update({ ba_user_id: '320', ba_name: 'Persona Ajena' });
  await assertOwn(f.page);
  assert.equal(await f.page.locator('#report-overlay').evaluate(el => el.classList.contains('open')), false);
  await f.update({ ba_logged: null, ba_user_id: null }, 'pageshow');
  await state(f.page, 'other');
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), false);
  assert.equal(await f.page.locator('#save-btn').isVisible(), false);
});

test('back-forward restore without an explicit id reloads the current account, not the previous owner', async t => {
  const f = await setup(t, { query: '' });
  await assertOwn(f.page);
  await f.update({ ba_user_id: '320', ba_name: 'Persona Ajena' }, 'pageshow');
  await f.page.waitForFunction(() => document.body.dataset.profileState === 'own' && document.querySelector('#perfil-nombre').textContent === 'Persona Ajena');
  await f.page.locator('#share-btn').click();
  assert.equal(new URL((await f.page.evaluate(() => window.__sharedProfiles))[0].url).searchParams.get('id'), '320');
  await f.update({ ba_logged: null, ba_user_id: null });
  await state(f.page, 'unavailable');
});

test('user-supplied names stay plain text in the updated owner presentation', async t => {
  const name = '<img src=x onerror="window.__nameXss=true"> Persona';
  const f = await setup(t, { rows: [profile(210, { nombre: name })], storage: member({ ba_name: name }) });
  await assertOwn(f.page);
  assert.equal(await f.page.locator('#perfil-nombre').textContent(), name);
  assert.equal(await f.page.locator('#perfil-nombre img').count(), 0);
  assert.equal(await f.page.evaluate(() => !!window.__nameXss), false);
});

test('switching the implicit target from visitor to artist restores the new profile sections', async t => {
  const f = await setup(t, { query: '', profiles: {
    '210': profile(210, { tipo_cuenta: 'visitante', bio: null, redes: null }),
    '320': profile(320, { tipo_cuenta: 'artista', bio: 'Mi nueva presentación.' })
  } });
  await assertOwn(f.page);
  assert.equal(await f.page.locator('.profile-stats').isVisible(), false);
  await f.update({ ba_user_id: '320', ba_name: 'Persona Ajena' }, 'pageshow');
  await f.page.waitForFunction(() => document.body.dataset.profileState === 'own' && document.querySelector('#perfil-nombre').textContent === 'Persona Ajena');
  assert.equal(await f.page.locator('.profile-stats').isVisible(), true);
  assert.equal(await f.page.locator('#perfil-bio-text').isVisible(), true);
  assert.equal(await f.page.locator('#perfil-bio-text').innerText(), 'Mi nueva presentación.');
  assert.equal(await f.page.locator('#perfil-generos').isVisible(), true);
  assert.equal(await f.page.locator('#perfil-tags').isVisible(), true);
});

test('changing the implicit profile never attributes the previous account videos to the new one', async t => {
  const f = await setup(t, { query: '', profiles: {
    '210': profile(210, { videos: 'https://www.youtube.com/watch?v=fixture-video' }),
    '320': profile(320, { videos: null })
  } });
  await assertOwn(f.page);
  assert.equal(await f.page.locator('#perfil-videos a').count(), 1);
  await f.update({ ba_user_id: '320', ba_name: 'Persona Ajena' }, 'pageshow');
  await f.page.waitForFunction(() => document.body.dataset.profileState === 'own' && document.querySelector('#perfil-nombre').textContent === 'Persona Ajena');
  assert.equal(await f.page.locator('#perfil-videos a').count(), 0);
  assert.match(await f.page.locator('#perfil-videos').innerText(), /sin videos/i);
});

test('an unavailable profile also rejects programmatic message, save and report attempts', async t => {
  const f = await setup(t, { rows: [] });
  await state(f.page, 'unavailable');
  await f.page.evaluate(async () => {
    document.querySelector('.contact-form textarea').value = 'No hay destinatario válido';
    await sendMessage();
    await toggleSave();
    abrirReporte();
    selectMotivo(null, 'Otro');
    await enviarReporte();
    await compartirPerfil();
  });
  assert.deepEqual(f.calls.writes, []);
  assert.deepEqual(await f.page.evaluate(() => window.__sharedProfiles), []);
  assert.equal(await f.page.locator('#report-overlay').evaluate(el => el.classList.contains('open')), false);
});

test('guest contact retains the login destination and cannot write a message using stale cached ID alone', async t => {
  const f = await setup(t, { query: '?id=320', storage: { ba_user_id: '210' } });
  await state(f.page, 'other');
  await f.page.locator('.contact-form textarea').fill('Mensaje de visitante sin sesión');
  await f.page.locator('.btn-send').click();
  await f.page.waitForURL(origin + '/buscARTE_login.html');
  assert.deepEqual(f.calls.writes, []);
  assert.deepEqual(f.calls.navigations, ['/buscARTE_login.html']);
});

test('a response for a different profile ID cannot enable actions for the requested target', async t => {
  const f = await setup(t, { query: '?id=210', rows: [profile(320)] });
  await state(f.page, 'unavailable');
  assert.equal(await f.page.locator('#contact-profile-btn').isVisible(), false);
  assert.equal(await f.page.locator('#edit-profile-link').isVisible(), false);
});

test('a session switch during conversation lookup cancels the old send before any write or stale UI update', async t => {
  const gate = deferred();
  const f = await setup(t, { query: '?id=320', conversationGate: gate });
  await state(f.page, 'other');
  await f.page.evaluate(() => {
    const originalSend = window.sendMessage;
    window.sendMessage = async function(...args) {
      try { return await originalSend(...args); }
      finally { window.__sendAttemptSettled = true; }
    };
  });
  try {
    await f.page.locator('.contact-form textarea').fill('Este intento debe cancelarse antes de guardar');
    await f.page.locator('.btn-send').click();
    assert.ok(f.calls.reads.some(call => call.path === '/rest/v1/conversaciones'), 'Conversation lookup is pending');
    await f.update({ ba_user_id: '320', ba_name: 'Persona Ajena' });
    await assertOwn(f.page);
    assert.equal(await f.page.locator('.contact-form textarea').inputValue(), '');
  } finally { gate.resolve(); }
  await f.page.waitForFunction(() => window.__sendAttemptSettled === true);
  assert.deepEqual(f.calls.writes, [], 'The old sender cannot post under a stale identity after the lookup');
  assert.equal(await f.page.locator('.btn-send').isDisabled(), false);
  assert.doesNotMatch(await f.page.locator('.btn-send').textContent(), /enviando|enviado/i);
});
