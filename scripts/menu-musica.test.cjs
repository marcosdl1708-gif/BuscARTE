const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const files = new Set(JSON.parse(read('site-files.json')));
const origin = 'https://buscarte.test';
const musician = { ba_logged: '1', ba_user_id: '1', ba_name: 'Prueba aislada', ba_tipo_cuenta: 'artista', ba_rubro: 'musica' };
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

test('Music tools require an explicit musician; unavailable or incomplete cache never defaults to music', () => {
  for (const extra of [{}, { ba_logged: '0' }, { ba_user_id: '' }, { ba_user_id: 'null' }, { ba_user_id: '0' }, { ba_user_id: 'invalid' }, { ba_tipo_cuenta: 'negocio' }, { ba_tipo_cuenta: 'visitante' }, { ba_tipo_cuenta: '' }, { ba_rubro: '' }, { ba_rubro: 'danza' }, { ba_rubro: 'modelaje' }, { blocked: true }]) {
    const values = { ...musician, ...extra };
    const document = { documentElement: { dataset: {} }, addEventListener() {} };
    const window = { addEventListener() {}, dispatchEvent() {} };
    const context = { document, window, Event: class {}, localStorage: { getItem(k) { if (extra.blocked) throw Error('blocked'); return values[k] ?? null; } } };
    vm.runInNewContext(read('assets/js/menu-cuenta.js'), context);
    assert.equal(window.BuscARTEMenu.isMusician(), Object.keys(extra).length === 0, JSON.stringify(extra));
    assert.equal(document.documentElement.dataset.musicTools, String(Object.keys(extra).length === 0));
  }
  assert.ok(files.has('assets/js/menu-cuenta.js'));
  for (const f of files) if (f.endsWith('.html') && read(f).includes('href="buscARTE_generador.html"')) {
    assert.ok(read(f).includes('src="/assets/js/menu-cuenta.js"'), f);
    assert.ok(read(f).includes('html:not([data-music-tools="true"])'), f);
  }
});

async function setup(t, storage = musician) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.addInitScript(values => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, storage);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), f = url.pathname.slice(1);
    if (req.method() !== 'GET') return route.abort();
    if (url.origin === origin && files.has(f)) return route.fulfill({ body: fs.readFileSync(path.join(root, f)), contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(f)] || 'application/octet-stream' });
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname.endsWith('.supabase.co')) return route.fulfill({ contentType: 'application/json', body: url.pathname === '/rest/v1/perfiles' ? JSON.stringify([{ id: 1, nombre: 'Prueba aislada', rubro: storage.ba_rubro, tipo_cuenta: storage.ba_tipo_cuenta, campos_especificos: {} }]) : '[]' });
    return route.abort(); // No real network, accounts, writes, analytics or emails.
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  return page;
}

test('Both Home menus complete touch navigation even with a transient null-focus blur', async t => {
  const page = await setup(t);
  for (const file of ['index.html', 'buscARTE_index.html']) {
    await page.goto(origin + '/' + file);
    await page.locator('#nav-avatar-btn').tap();
    await page.evaluate(() => document.getElementById('nav-dropdown').addEventListener('pointerdown', () => document.activeElement.blur(), { capture: true, once: true }));
    await page.locator('#nav-dropdown a[href="buscARTE_mensajes.html"]').tap();
    await page.waitForURL('**/buscARTE_mensajes.html');
    await page.goto(origin + '/' + file);
    await page.locator('#nav-avatar-btn').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#nav-avatar-btn').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#nav-avatar-btn').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#nav-avatar-btn').evaluate(el => el === document.activeElement), true);
    await page.locator('#nav-avatar-btn').tap();
    await page.locator('.hero a[href="buscARTE_busqueda.html"]').first().focus();
    assert.equal(await page.locator('#nav-avatar-btn').getAttribute('aria-expanded'), 'false');
  }
});

test('Mobile account panels include music generator and omit it for other roles, including same-tab changes', async t => {
  const page = await setup(t);
  for (const name of ['busqueda', 'anuncios', 'anuncio_detalle', 'perfil', 'perfil_publico', 'mensajes', 'mis_anuncios', 'guardados']) {
    await page.goto(origin + '/buscARTE_' + name + '.html');
    await page.locator('.mbn-item[data-page="perfil"]').tap();
    const link = page.locator('#mbn-panel a[href="buscARTE_generador.html"]');
    await link.waitFor({ state: 'visible' });
    assert.equal(await link.count(), 1, name);
    await page.locator('#mbn-overlay').tap({ position: { x: 10, y: 10 } });
    await page.evaluate(() => localStorage.setItem('ba_rubro', 'danza'));
    await page.locator('.mbn-item[data-page="perfil"]').tap();
    assert.equal(await link.isVisible(), false, name + ': other rubro');
  }
  await page.goto(origin + '/index.html');
  await page.evaluate(() => localStorage.setItem('ba_tipo_cuenta', 'negocio'));
  await page.locator('#nav-avatar-btn').tap();
  assert.equal(await page.locator('#nav-dropdown a[href="buscARTE_generador.html"]').isVisible(), false);
  const generatorLink = page.locator('#nav-dropdown a[href="buscARTE_generador.html"]');
  await generatorLink.evaluate(link => link.setAttribute('href', '/buscarte_generador'));
  assert.equal(await generatorLink.count(), 0);
  assert.equal(await page.locator('#nav-dropdown a[href="/buscarte_generador"]').isVisible(), false, 'Pretty URLs also hide the link');
});

test('Generator uses the same music-only rule and relocks when account eligibility changes', async t => {
  const page = await setup(t);
  await page.goto(origin + '/buscARTE_generador.html');
  assert.equal(await page.locator('#gen-lock').isVisible(), false);
  await page.locator('#btn-generar').tap();
  assert.equal(await page.locator('main').getAttribute('inert'), null);
  for (const values of [{ ba_rubro: '' }, { ba_rubro: 'musica', ba_tipo_cuenta: 'visitante' }, { ba_logged: '0' }]) {
    await page.evaluate(values => {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    }, values);
    assert.equal(await page.locator('#gen-lock').isVisible(), true);
    assert.notEqual(await page.locator('main').getAttribute('inert'), null);
  }
  assert.equal(await page.locator('#gen-lock-title').textContent(), 'Solo para músicos registrados');
});
