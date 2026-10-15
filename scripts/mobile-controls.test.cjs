/* Focused regressions for the two reproduced mobile defects. Application data
 * is synthetic, all unexpected traffic fails closed, screenshots stay private. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');
const { setupFixture, snapshot, root } = require('./mobile-ux-fixture.cjs');
const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT || path.join(root, '..', 'BuscARTE-resguardos', 'mobile-controls-' + new Date().toISOString().replace(/[:.]/g, '-')));
assert.ok(!output.startsWith(root + path.sep), 'Evidence stays outside public sources');
fs.mkdirSync(output, { recursive: true });
let browser, sources;
const results = [];
const me = { id: 9001, nombre: 'Persona sintética', email: 'qa@example.invalid', tipo_cuenta: 'artista', rubro: 'musica',
  instrumento: 'Guitarra', generos: 'Rock', bio: 'Presentación sintética.', referentes: '', provincia: 'CABA', ciudad: 'CABA',
  barrio: 'Almagro', foto_url: null, campos_especificos: null, disciplinas: null, perfil_revision: 0, created_at: '2026-10-01T12:00:00Z' };
const other = { ...me, id: 9002, nombre: 'Otra persona sintética', email: undefined };
const conv = { id: 9201, user1_id: 9001, user2_id: 9002, anuncio_id: null, ultimo_mensaje: 'Hola', updated_at: '2026-10-01T12:00:00Z' };
before(async () => {
  sources = snapshot();
  if (process.env.BUSCARTE_MOBILE_BASELINE === '1') {
    for (const file of ['assets/css/escena.css', 'buscARTE_mensajes.html']) sources.set(file,
      execFileSync('git', ['show', '8d460ff:' + file], { cwd: root }));
  }
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
});
after(async () => {
  await browser?.close();
  const files = ['assets/css/escena.css', 'buscARTE_mensajes.html'];
  const baseline = process.env.BUSCARTE_MOBILE_BASELINE === '1';
  const sourceDrift = baseline ? [] : files.filter(file => !fs.readFileSync(path.join(root, file)).equals(sources.get(file)));
  fs.writeFileSync(path.join(output, 'mobile-controls.json'), JSON.stringify({ at: new Date().toISOString(), baseline,
    sourceDrift, sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(sources.get(file)).digest('hex')])), results }, null, 2));
  assert.deepEqual(sourceDrift, [], 'Do not certify source edits made after the tested snapshot');
  console.log('Mobile controls evidence: ' + output);
});
async function setup(t, route, width, height) {
  const f = await setupFixture({ browser, sources, route, width, height, user: me, profiles: [me, other],
    api: ({ call }) => {
      if (call.path === '/rest/v1/conversaciones' && call.method === 'GET') return { body: [conv] };
      if (call.path === '/rest/v1/rpc/expirar_anuncios_vencidos' && call.method === 'POST') return { body: null };
      if (call.path === '/rest/v1/perfiles' && call.method === 'PATCH' && Object.keys(call.body || {}).every(key => ['visitas', 'vistas'].includes(key))) return { body: [] };
    } });
  t.after(f.close);
  await f.page.waitForFunction(() => window.BuscARTESesion?.status === 'verified' && !!document.body.dataset.a2Page);
  if (route === 'buscARTE_perfil.html') await f.page.waitForFunction(() => typeof isLoadingProfile !== 'undefined' && !isLoadingProfile);
  return f;
}
for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
  test(`${width}x${height}: chat exposes replies and choosing one only fills the composer`, async t => {
    const f = await setup(t, 'buscARTE_mensajes.html', width, height);
    await f.page.locator('.conv-item').first().click();
    await f.page.locator('#quick-replies.visible').waitFor();
    const result = { test: t.name };
    results.push(result);
    const first = f.page.locator('.quick-reply').first();
    const panel = f.page.locator('#quick-replies');
    result.initial = await first.evaluate(button => {
      const b = button.getBoundingClientRect(), r = document.getElementById('quick-replies').getBoundingClientRect();
      return { left: b.left, right: b.right, height: b.height, containerLeft: r.left, containerRight: r.right };
    });
    assert.ok(result.initial.left >= result.initial.containerLeft - 1 && result.initial.right <= result.initial.containerRight + 1,
      'A complete quick reply is visible without a hidden horizontal scroll: ' + JSON.stringify(result.initial));
    assert.ok(result.initial.height >= 44);
    assert.equal(await panel.locator('.quick-reply').count(), 4);
    if (width === 390) await f.page.screenshot({ path: path.join(output, 'chat-initial-390.png'), animations: 'disabled' });
    for (const button of await panel.locator('.quick-reply').all()) {
      await button.scrollIntoViewIfNeeded();
      await button.click();
      assert.ok((await f.page.locator('#chat-input').inputValue()).length > 20);
      assert.equal(await f.page.locator('#chat-send-btn').isEnabled(), true);
      assert.equal(f.state.calls.some(call => call.path === '/rest/v1/mensajes' && call.method !== 'GET'), false, 'Quick reply never sends a message');
    }
    await f.page.locator('#chat-input').fill('Borrador sintético sin enviar');
    await f.page.setViewportSize({ width, height: Math.min(height, 430) });
    assert.equal(await f.page.locator('#chat-input').inputValue(), 'Borrador sintético sin enviar');
    const box = await f.page.locator('#chat-input').boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= Math.min(height, 430));
    await f.page.screenshot({ path: path.join(output, `chat-${width}-${height}.png`), animations: 'disabled' });
  });
}
const menuPages = ['buscARTE_busqueda.html', 'buscARTE_anuncios.html', 'buscARTE_anuncio_detalle.html?id=9104',
  'buscARTE_perfil.html', 'buscARTE_perfil_publico.html?id=9002', 'buscARTE_mensajes.html', 'buscARTE_guardados.html', 'buscARTE_mis_anuncios.html'];
for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) for (const route of menuPages) {
  test(`${width}x${height}: Mi cuenta remains reachable in ${route}`, async t => {
    const f = await setup(t, route, width, height);
    const toggle = f.page.locator('.mobile-bottom-nav .mbn-item[data-page="perfil"]');
    await toggle.click();
    const panel = f.page.locator('#mbn-panel.open');
    await panel.waitFor();
    const result = { test: t.name };
    results.push(result);
    result.panel = await panel.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflow: getComputedStyle(el).overflowY };
    });
    assert.ok(result.panel.top >= -1 && result.panel.bottom <= height + 1, JSON.stringify(result.panel));
    if (result.panel.scrollHeight > result.panel.clientHeight) assert.equal(result.panel.overflow, 'auto');
    await panel.evaluate(el => { el.scrollTop = 0; });
    const title = await panel.locator('.mbn-panel-title').boundingBox();
    assert.ok(title.y >= -1, 'Top of menu can be reached');
    await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const last = panel.locator('.mbn-panel-item').last();
    const box = await last.boundingBox();
    const bar = await f.page.locator('.mobile-bottom-nav').boundingBox();
    assert.ok(box.y >= result.panel.top - 1 && box.y + box.height <= bar.y + 1, 'Last menu action is not covered by bottom navigation');
    if (route === 'buscARTE_busqueda.html' && width === 844) {
      await f.page.screenshot({ path: path.join(output, 'menu-844-390-bottom.png'), animations: 'disabled' });
      await panel.evaluate(el => { el.scrollTop = 0; });
      await f.page.screenshot({ path: path.join(output, 'menu-844-390-top.png'), animations: 'disabled' });
    }
    // Some pages intentionally place the menu above bottom navigation. The
    // visible backdrop remains a full-size touch target even in landscape.
    assert.ok(result.panel.top >= 44, 'Backdrop leaves a reachable close area');
    await f.page.locator('#mbn-overlay').click({ position: { x: width / 2, y: 4 } });
    assert.equal(await panel.count(), 0, 'Tapping outside still closes the panel');
  });
}
