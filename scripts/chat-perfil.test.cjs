const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const file = 'buscARTE_mensajes.html';
const baseline = process.env.BUSCARTE_CHAT_BASELINE === '1';
const source = baseline ? execFileSync('git', ['show', '8cd3947:' + file], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
const me = 'fixture-me';
const first = 'fixture-first';
const second = 'fixture-second';
const timestamp = '2026-09-05T20:00:00.000Z';
const conversation = (id, user1_id, user2_id, extra = {}) => ({ id, user1_id, user2_id, ultimo_mensaje: 'Mensaje de prueba', updated_at: timestamp, anuncio_id: null, ...extra });
const profile = (id, nombre, extra = {}) => ({ id, nombre, instrumento: 'Sonido', ciudad: 'Córdoba', rubro: 'musica', ...extra });
const message = (sender, content) => ({ id: 'msg-' + sender, de_user_id: sender, para_user_id: me, contenido: content, created_at: timestamp });
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function setup(t, options = {}) {
  const width = options.width || 390;
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width <= 900, hasTouch: width <= 900, serviceWorkers: 'block' });
  await context.addInitScript(({ me }) => {
    localStorage.setItem('ba_logged', '1');
    localStorage.setItem('ba_user_id', me);
    localStorage.setItem('ba_name', 'Persona Prueba');
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    window.__fixtureWrites = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { window.__fixtureWrites.push(key); return set.call(this, key, value); };
  }, { me });
  const conversations = options.conversations || [conversation('conv-one', me, first, { anuncio_id: 'fixture-ad' }), conversation('conv-two', second, me)];
  const profiles = options.profiles || [profile(first, 'Marina de la Comunidad'), profile(second, 'Tomás Escenario')];
  const calls = { api: [], unexpected: [], errors: [], consoleErrors: [], navigations: [] };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === origin && method === 'GET') {
      if (url.pathname === '/' + file) return route.fulfill({ contentType: 'text/html', body: options.demo ? source.replace('const PREVIEW_MODE = false;', 'const PREVIEW_MODE = true;') : source });
      if (url.pathname === '/assets/js/meta-pixel.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'assets/js/meta-pixel.js')) });
      if (url.pathname === '/buscARTE_perfil_publico.html') {
        calls.navigations.push(url.searchParams.get('id'));
        // The destination is a static fixture, not the real profile script.
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Perfil simulado</title><h1>Perfil de prueba</h1>' });
      }
      if (['/favicon.ico', '/manifest.json'].includes(url.pathname)) return route.fulfill({ status: 204, body: '' });
    }
    if (url.hostname === 'fonts.googleapis.com' && method === 'GET') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'fixtures.invalid' && method === 'GET' && url.pathname === '/portrait.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="#355940"/></svg>' });
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      calls.api.push({ method, path: url.pathname, query: url.searchParams.toString(), body: request.postDataJSON() });
      if (method === 'GET') {
        let rows;
        if (url.pathname === '/rest/v1/conversaciones') rows = conversations;
        else if (url.pathname === '/rest/v1/perfiles') rows = profiles;
        else if (url.pathname === '/rest/v1/anuncios') rows = [{ id: 'fixture-ad', titulo: 'Sonido para una fecha', tipo: 'busco' }];
        else if (url.pathname === '/rest/v1/mensajes') {
          if (!url.searchParams.has('or')) rows = [message(first, 'Mensaje recibido')];
          else {
            const other = profiles.find(p => url.searchParams.get('or').includes('para_user_id.eq.' + encodeURIComponent(p.id)))?.id;
            const response = options.responses?.[other];
            if (response?.gate) await response.gate.promise;
            if (response?.status) return route.fulfill({ status: response.status, body: 'Synthetic unavailable' });
            rows = response?.rows || [message(other || first, other === second ? 'Mensaje de Tomás' : 'Mensaje de Marina')];
          }
        }
        if (rows) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
      }
      if (options.allowWrites && ((method === 'POST' && url.pathname === '/rest/v1/mensajes') || (method === 'PATCH' && url.pathname === '/rest/v1/conversaciones'))) return route.fulfill({ status: 201, body: '' });
    }
    if (options.allowWrites && method === 'POST' && url.origin === origin && url.pathname === '/.netlify/functions/send-email') {
      calls.api.push({ method, path: url.pathname, body: request.postDataJSON() });
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    // There is deliberately no continue(), fallback(), or route.fetch().
    // Unknown requests, emails, tracking, uploads and writes fail closed.
    calls.unexpected.push(method + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') calls.consoleErrors.push(msg.text()); });
  await page.goto(origin + '/' + file + (options.query || ''), { waitUntil: 'load' });
  await page.locator('.conv-item').first().waitFor();
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, [], 'All network traffic is synthetic; unspecified requests are rejected');
      assert.deepEqual(calls.errors, [], 'No uncaught chat errors');
      assert.deepEqual(calls.consoleErrors, options.expectedConsoleErrors || [], 'Only explicitly simulated HTTP errors are expected');
      if (!options.allowWrites) assert.deepEqual(calls.api.filter(c => c.method !== 'GET'), [], 'Viewing a conversation or profile cannot send a message/email');
      if (!options.demo && page.url().includes(file)) assert.deepEqual(await page.evaluate(() => __fixtureWrites.filter(key => !['ba_msg_read_by_user', 'ba_msg_last_seen'].includes(key))), [], 'Only existing local read-state keys are touched');
    } finally { await context.close(); }
  });
  return { page, calls, context };
}

async function open(f, id = 'conv-one') {
  await f.page.evaluate(id => abrirConv(decorateConv(conversaciones.find(c => String(c.id) === String(id)))), id);
  await f.page.waitForURL('**?conv=' + id);
}

async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  const dist = path.join(root, 'dist');
  assert.ok(output !== dist && !output.startsWith(dist + path.sep), 'Screenshots stay outside dist');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

if (baseline) {
  test('historical baseline: mobile CSS hides the profile action and name/avatar are not links', async t => {
    const f = await setup(t);
    await open(f);
    assert.equal(await f.page.locator('#chat-ver-perfil').isVisible(), false);
    assert.equal(await f.page.locator('#chat-ver-perfil').getAttribute('href'), 'buscARTE_perfil_publico.html?id=' + first);
    assert.equal(await f.page.locator('#chat-header-avatar').evaluate(el => !!el.closest('a[href]')), false);
    assert.equal(await f.page.locator('#chat-header-name').evaluate(el => !!el.closest('a[href]')), false);
    await capture(f.page, 'chat-before-390.png');
  });
} else {
  for (const width of [320, 390, 900, 901, 1280]) {
    test(`chat at ${width}px: profile action/name/avatar visible, accessible and inside the viewport`, async t => {
      const f = await setup(t, { width });
      await open(f);
      for (const id of ['chat-persona', 'chat-ver-perfil']) {
        const link = f.page.locator('#' + id);
        assert.equal(await link.isVisible(), true);
        assert.equal(await link.getAttribute('href'), 'buscARTE_perfil_publico.html?id=' + first);
        assert.equal(await link.getAttribute('aria-label'), 'Ver perfil de Marina de la Comunidad');
        const box = await link.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 44, 'Touch target >=44px');
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'Profile navigation fits the viewport');
      }
      assert.equal(await f.page.locator('#chat-header-avatar').evaluate(el => el.closest('a').id), 'chat-persona');
      assert.equal(await f.page.locator('#chat-header-name').evaluate(el => el.closest('a').id), 'chat-persona');
      await f.page.locator('#chat-persona').focus();
      assert.equal(await f.page.locator('#chat-persona').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
      await capture(f.page, `chat-after-${width}.png`);
    });
  }

  test('no active conversation exposes no placeholder profile destination', async t => {
    const f = await setup(t);
    assert.equal(await f.page.locator('#chat-ver-perfil').getAttribute('href'), null);
    assert.equal(await f.page.locator('#chat-persona').getAttribute('href'), null);
    assert.equal(await f.page.locator('#chat-ver-perfil').isVisible(), false);
  });

  test('both conversation participant positions point to the other person, never the signed-in owner', async t => {
    const f = await setup(t);
    await open(f);
    assert.equal(await f.page.locator('#chat-persona').getAttribute('href'), 'buscARTE_perfil_publico.html?id=' + first);
    await open(f, 'conv-two');
    assert.equal(await f.page.locator('#chat-persona').getAttribute('href'), 'buscARTE_perfil_publico.html?id=' + second);
    assert.equal(await f.page.locator('#chat-ver-perfil').getAttribute('href'), 'buscARTE_perfil_publico.html?id=' + second);
    assert.match(await f.page.locator('#chat-messages').innerText(), /Mensaje de Tomás/);
  });

  for (const target of ['#chat-ver-perfil', '#chat-header-avatar', '#chat-header-name']) {
    test(`${target} opens a normal same-tab profile link without POST or email`, async t => {
      const f = await setup(t);
      await open(f);
      await f.page.locator(target).click();
      await f.page.waitForURL('**/buscARTE_perfil_publico.html?id=' + first);
      assert.deepEqual(f.calls.navigations, [first]);
      assert.deepEqual(f.calls.api.filter(c => c.method !== 'GET'), []);
    });
  }

  test('keyboard Enter follows the profile link and preserves the conversation URL in history', async t => {
    const f = await setup(t);
    await open(f, 'conv-two');
    await f.page.locator('#chat-persona').focus();
    await f.page.keyboard.press('Enter');
    await f.page.waitForURL('**/buscARTE_perfil_publico.html?id=' + second);
    await f.page.goBack();
    await f.page.waitForURL('**?conv=conv-two');
    await f.page.waitForFunction(second => document.getElementById('chat-persona').getAttribute('href')?.endsWith(second), second);
    assert.equal(await f.page.locator('#chat-header-name').textContent(), 'Tomás Escenario');
  });

  test('URL-selected conversation preserves the announcement context and existing local unread state', async t => {
    const f = await setup(t, { query: '?conv=conv-one' });
    await f.page.waitForFunction(() => document.getElementById('chat-persona').hasAttribute('href'));
    assert.equal(await f.page.locator('#chat-context-link').getAttribute('href'), 'buscARTE_anuncio_detalle.html?id=fixture-ad');
    assert.equal(await f.page.locator('#chat-context-text').textContent(), 'Sonido para una fecha');
    const read = await f.page.evaluate(() => JSON.parse(localStorage.getItem('ba_msg_read_by_user')));
    assert.ok(read[first]);
    await open(f, 'conv-two');
    assert.equal(await f.page.locator('#chat-context-bar').isVisible(), false);
    assert.equal(await f.page.locator('#chat-context-link').isVisible(), false);
  });

  test('opening a profile while messages are still loading retains the selected conversation for Back', async t => {
    const gate = deferred();
    t.after(() => gate.resolve());
    const f = await setup(t, { responses: { [first]: { gate } } });
    await f.page.evaluate(() => { abrirConvPorId('conv-one'); });
    await f.page.waitForURL('**?conv=conv-one');
    await f.page.locator('#chat-ver-perfil').click();
    await f.page.waitForURL('**/buscARTE_perfil_publico.html?id=' + first);
    gate.resolve();
    await f.page.goBack();
    await f.page.waitForURL('**?conv=conv-one');
    await f.page.waitForFunction(first => document.getElementById('chat-persona').getAttribute('href')?.endsWith(first), first);
    assert.equal(await f.page.locator('#chat-header-name').textContent(), 'Marina de la Comunidad');
  });

  test('missing/deleted profile clears previous links and shows a non-interactive explanation', async t => {
    const f = await setup(t, { profiles: [profile(first, 'Marina')] });
    await open(f);
    await open(f, 'conv-two');
    assert.equal(await f.page.locator('#chat-header-name').textContent(), 'Perfil no disponible');
    assert.equal(await f.page.locator('#chat-header-meta').textContent(), 'Conversación existente');
    assert.equal(await f.page.locator('#chat-persona').getAttribute('href'), null);
    assert.equal(await f.page.locator('#chat-persona').getAttribute('aria-disabled'), 'true');
    assert.equal(await f.page.locator('#chat-ver-perfil').getAttribute('href'), null);
    assert.equal(await f.page.locator('#chat-ver-perfil').isVisible(), false);
    await capture(f.page, 'chat-profile-unavailable-390.png');
  });

  test('blank name and absent image retain usable links, initials fallback and nonempty accessible name', async t => {
    const f = await setup(t, { profiles: [profile(first, '')] });
    await open(f);
    assert.equal(await f.page.locator('#chat-header-name').textContent(), 'Usuario');
    assert.equal(await f.page.locator('#chat-header-avatar').textContent(), 'U');
    assert.equal(await f.page.locator('#chat-persona').getAttribute('aria-label'), 'Ver perfil de Usuario');
  });

  test('names are text and profile IDs cannot inject query parameters or fragments', async t => {
    const id = 'fixture?id=other&x=1#fragment';
    const name = '<img src=x onerror=window.__injected=1> Persona';
    const f = await setup(t, { conversations: [conversation('conv-one', me, id)], profiles: [profile(id, name, { foto_url: 'https://fixtures.invalid/portrait.svg' })] });
    await open(f);
    assert.equal(await f.page.locator('#chat-header-name').textContent(), name);
    assert.equal(await f.page.locator('#chat-header-name img').count(), 0);
    assert.equal(await f.page.evaluate(() => window.__injected), undefined);
    const href = await f.page.locator('#chat-persona').getAttribute('href');
    assert.equal(href, 'buscARTE_perfil_publico.html?id=' + encodeURIComponent(id));
    assert.equal(new URL(href, origin).searchParams.get('id'), id);
    assert.equal(new URL(href, origin).hash, '');
  });

  test('self-conversation or missing participant ID never becomes a profile shortcut', async t => {
    for (const id of [me, null, '', 'undefined']) {
      const f = await setup(t, { conversations: [conversation('conv-one', me, id)], profiles: [profile(id, 'Datos incompletos')] });
      await open(f);
      assert.equal(await f.page.locator('#chat-persona').getAttribute('href'), null);
      assert.equal(await f.page.locator('#chat-ver-perfil').isVisible(), false);
    }
  });

  test('demo conversation IDs cannot link to unrelated real profiles', async t => {
    const f = await setup(t, { demo: true });
    await open(f, '1');
    assert.equal(await f.page.locator('#chat-persona').getAttribute('href'), null);
    assert.equal(await f.page.locator('#chat-ver-perfil').isVisible(), false);
    assert.equal(await f.page.locator('#chat-header-meta').textContent(), 'Conversación de demostración');
    assert.deepEqual(f.calls.api, []);
  });

  for (const status of [null, 500]) {
    test(`rapid conversation switch ignores the earlier ${status ? 'failed' : 'successful'} response`, async t => {
      const gate = deferred();
      t.after(() => gate.resolve());
      const f = await setup(t, {
        responses: { [first]: { gate, status, rows: [message(first, 'Respuesta vieja')] } },
        expectedConsoleErrors: status ? ['Failed to load resource: the server responded with a status of 500 (Internal Server Error)'] : []
      });
      await f.page.evaluate(() => { window.__firstOpen = abrirConv(decorateConv(conversaciones.find(c => c.id === 'conv-one'))); });
      await f.page.waitForFunction(() => document.getElementById('chat-header-name').textContent.includes('Marina'));
      await open(f, 'conv-two');
      gate.resolve();
      await f.page.evaluate(() => window.__firstOpen);
      assert.match(f.page.url(), /\?conv=conv-two$/);
      assert.match(await f.page.locator('#chat-persona').getAttribute('href'), new RegExp(second + '$'));
      assert.match(await f.page.locator('#chat-messages').innerText(), /Mensaje de Tomás/);
      assert.doesNotMatch(await f.page.locator('#chat-messages').innerText(), /Respuesta vieja|No se pudieron/);
    });
  }

  test('sending still uses the existing message/conversation/email contracts (all mocked)', async t => {
    const f = await setup(t, { allowWrites: true, profiles: [profile(first, 'Marina', { email: 'fixture@example.invalid' }), profile(second, 'Tomás')] });
    await open(f);
    await f.page.locator('#chat-input').fill('Mensaje sintético de prueba');
    await f.page.locator('#chat-send-btn').click();
    await f.page.waitForFunction(() => !document.getElementById('chat-input').value);
    assert.deepEqual(f.calls.api.find(c => c.method === 'POST' && c.path === '/rest/v1/mensajes')?.body, { de_user_id: me, para_user_id: first, contenido: 'Mensaje sintético de prueba' });
    const patch = f.calls.api.find(c => c.method === 'PATCH');
    assert.match(patch.query, /id=eq.conv-one/);
    assert.equal(patch.body.ultimo_mensaje, 'Mensaje sintético de prueba');
    assert.equal(f.calls.api.filter(c => c.method === 'POST' && c.path === '/rest/v1/mensajes').length, 1);
    const email = f.calls.api.find(c => c.path === '/.netlify/functions/send-email');
    assert.equal(email.body.destinatario, 'fixture@example.invalid');
    assert.equal(email.body.tipo, 'mensaje');
  });
}
