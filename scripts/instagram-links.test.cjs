const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'buscARTE_perfil_publico.html'), 'utf8');
const source = html.slice(html.indexOf('  function safeUrl(raw)'), html.indexOf('  // ─── RUBRO CONFIG'));
const context = { URL };
vm.runInNewContext(source, context);
const { socialUrl, safeUrl } = context;
const platform = '📸 instagram.com/';

test('Instagram accepts stored handles and full or scheme-less Instagram URLs', () => {
  for (const input of ['artista_1', '@artista_1', ' @artista_1 ', 'instagram.com/artista_1/', 'www.instagram.com/artista_1/', 'https://instagram.com/artista_1/', 'http://www.instagram.com/artista_1/', '//www.instagram.com/artista_1/']) {
    assert.equal(socialUrl(platform, input), 'https://www.instagram.com/artista_1/', input);
  }
  assert.equal(socialUrl('Instagram', '@nombre.apellido'), 'https://www.instagram.com/nombre.apellido/');
  const full = 'https://www.instagram.com/reel/ABC123/?igsh=ejemplo#section';
  assert.equal(socialUrl(platform, full), full, 'Do not destroy existing full Instagram links');
});

test('Instagram rejects unsafe URLs and malformed values without affecting other networks', () => {
  for (const value of ['', null, 'nombre apellido', '@@usuario', 'javascript:alert(1)', 'data:text/html,hey', 'ftp://instagram.com/user', 'https://evil.example/user', 'https://instagram.com.evil.example/user', 'https://instagram.com@evil.example/user', 'https://evil.example@instagram.com/user', 'https://www.instagram.com:8443/user', '<img src=x>', '@../user', 'user..name']) {
    assert.equal(socialUrl(platform, value), '', String(value));
  }
  for (const key of ['▶️ youtube.com/@', '🎵 tiktok.com/@', '🌐 Web propia']) {
    for (const value of ['https://example.com/user', 'example.com/user', 'nombre']) assert.equal(socialUrl(key, value), safeUrl(value));
  }
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
});

test('Mobile tap opens corrected Instagram URL using an isolated profile fixture', async t => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  t.after(() => browser.close());
  const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await browserContext.addInitScript(() => localStorage.setItem('buscarte_meta_consent_v1', 'denied'));
  const allowed = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
  const writes = [], errors = [], destinations = [];
  await browserContext.routeWebSocket('**/*', socket => socket.close());
  await browserContext.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), file = url.pathname.slice(1);
    if (req.method() !== 'GET') { writes.push(req.method()); return route.abort(); }
    if (url.origin === 'https://buscarte.test' && allowed.has(file)) return route.fulfill({ body: fs.readFileSync(path.join(root, file)), contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    if (url.hostname.endsWith('.supabase.co')) return route.fulfill({ contentType: 'application/json', body: url.pathname === '/rest/v1/perfiles' ? JSON.stringify([{ id: 9001, nombre: 'Prueba aislada', rubro: 'musica', tipo_cuenta: 'artista', campos_especificos: {}, redes: JSON.stringify({ [platform]: '@artista_1' }) }]) : '[]' });
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'www.instagram.com') { destinations.push(url.href); return route.fulfill({ contentType: 'text/html', body: '<title>Destino simulado</title>' }); }
    return route.abort(); // Never contact users, APIs or Instagram during this test.
  });
  const page = await browserContext.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(5000);
  await page.goto('https://buscarte.test/buscARTE_perfil_publico.html?id=9001');
  const link = page.locator('#perfil-redes a').filter({ hasText: 'instagram.com/' });
  await link.waitFor({ state: 'visible' });
  assert.equal(await link.getAttribute('href'), 'https://www.instagram.com/artista_1/');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  const popupPromise = page.waitForEvent('popup');
  await link.tap();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(), 'https://www.instagram.com/artista_1/');
  assert.deepEqual(destinations, [popup.url()]);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
});
