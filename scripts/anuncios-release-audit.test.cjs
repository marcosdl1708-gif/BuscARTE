const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const files = ['buscARTE_anuncios.html', 'buscARTE_anuncio_detalle.html', 'buscARTE_mis_anuncios.html'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const output = process.env.BUSCARTE_QA_OUTPUT ? path.resolve(process.env.BUSCARTE_QA_OUTPUT) : null;
if (output) {
  assert.ok(!output.startsWith(root + path.sep), 'Screenshots belong outside the repository');
  fs.mkdirSync(output, { recursive: true });
}
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

test('las tres páginas usan singular/plural y nunca muestran fechas inválidas', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  for (const file of files) {
    const html = read(file);
    const start = html.indexOf('  function timeAgo(');
    const end = html.indexOf('\n  }', start) + 4;
    const timeAgo = vm.runInNewContext('(' + html.slice(start, end) + ')', { Date: FixedDate });
    assert.equal(timeAgo(new Date(now - 86400000).toISOString()), 'Hace 1 día', file);
    assert.equal(timeAgo(new Date(now - 172800000).toISOString()), 'Hace 2 días', file);
    assert.equal(timeAgo('fecha inválida'), '', file);
    assert.equal(timeAgo(null), '', file);
    assert.doesNotMatch(timeAgo(new Date(now + 60000).toISOString()), /Hace -/, file);
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/src\s*=|application\/ld\+json/.test(script[1])) new vm.Script(script[2]);
    }
  }
});

// All requests are fulfilled or aborted. No route.continue/fetch/fallback is used.
// Expiry RPC, detail-view PATCH and any legacy own-ad sync are never real writes.
async function setup(t, { file = files[0], width = 390, logged = true, rubro = 'musica', profileRubro = rubro, own = false, failOwn = false, photo = null, ownResponses = [] } = {}) {
  const allowed = new Set(JSON.parse(read('site-files.json')));
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 901, isMobile: width < 901, serviceWorkers: 'block' });
  await context.addInitScript(({ logged, rubro }) => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    if (!logged || localStorage.getItem('ba_logged') === '1') return;
    Object.entries({ ba_logged: '1', ba_user_id: '11', ba_name: 'Persona QA', ba_tipo_cuenta: 'artista', ba_rubro: rubro }).forEach(([k, v]) => localStorage.setItem(k, v));
  }, { logged, rubro });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const calls = { unexpected: [], errors: [], writes: [], ownReads: 0 };
  const state = { failOwn };
  const ad = { id: 99, user_id: own ? 11 : 22, tipo: photo ? 'vende' : 'jam', rubro: 'danza', titulo: 'Publicación QA', descripcion: 'Sólo fixture local, sin publicar nada.', estado: 'activo', oculto: false, created_at: new Date(Date.now() - 86400000).toISOString(), foto_url: photo };
  page.on('pageerror', error => calls.errors.push(error.message));
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const relative = url.pathname.slice(1);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if(url.origin === origin && url.pathname === '/.netlify/functions/sesion') {
      if(req.method() !== 'GET')return json({error:'Fixture method denied.'},405);
      return logged ? json({user:{id:11,nombre:'Persona QA',email:'persona-qa@example.invalid',tipo_cuenta:'artista',rubro:profileRubro,
        referentes:'',generos:'',baneado:false,disciplinas:null,perfil_revision:0}}) : json({error:'Fixture session required.',code:'SESSION_REQUIRED'},401);
    }
    let apiUrl = url;
    if(url.origin === origin && url.pathname === '/.netlify/functions/datos') {
      const target=url.searchParams.get('path');
      if(!target || !target.startsWith('/rest/v1/') || target.startsWith('//'))return json({error:'Unknown fixture gateway path.'},403);
      apiUrl=new URL(target,'https://xiaanchoanxmampegoay.supabase.co');
      if(apiUrl.origin !== 'https://xiaanchoanxmampegoay.supabase.co')return json({error:'External fixture gateway path.'},403);
    }
    if (url.origin === origin && req.method() === 'GET') {
      if (allowed.has(relative)) return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp' })[path.extname(relative)] || 'application/octet-stream', body: fs.readFileSync(path.join(root, relative)) });
      if (relative === 'favicon.ico') return route.fulfill({ status: 204, body: '' });
      if (relative.startsWith('fixture-photo')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="green"/></svg>' });
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (apiUrl.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (req.method() === 'POST' && apiUrl.pathname === '/rest/v1/rpc/vencer_anuncios_viejos') { calls.writes.push('expiry-fixture'); return json(null); }
      if (req.method() === 'PATCH' && apiUrl.pathname === '/rest/v1/anuncios') { calls.writes.push('view-fixture'); return json(null); }
      if (req.method() === 'GET' && apiUrl.pathname === '/rest/v1/perfiles') return json([{ id: apiUrl.searchParams.get('id') === 'eq.22' ? 22 : 11, nombre: 'Persona QA', rubro: profileRubro, rubro_principal:profileRubro, tipo_cuenta: 'artista',disciplinas:null,perfil_revision:0 }]);
      if (req.method() === 'GET' && apiUrl.pathname === '/rest/v1/anuncios') {
        if (apiUrl.searchParams.get('select') === 'id') return json([]);
        if (apiUrl.searchParams.has('user_id')) {
          const response = ownResponses[calls.ownReads] || {};
          calls.ownReads++;
          if (response.gate) await response.gate;
          if (state.failOwn) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          if (response.rows) return json(response.rows);
        }
        return json([ad]);
      }
      if (req.method() === 'GET' && apiUrl.pathname === '/rest/v1/reacciones') return json(apiUrl.searchParams.get('anuncio_id')?.startsWith('in.') ? [{ anuncio_id: 99, tipo: 'asistire' }, { anuncio_id: 99, tipo: 'like' }] : []);
      if (req.method() === 'GET' && apiUrl.pathname === '/rest/v1/mensajes') return json([]);
    }
    calls.unexpected.push(req.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  t.after(async () => { try { assert.deepEqual(calls.unexpected, [], 'All traffic must be isolated'); assert.deepEqual(calls.errors, [], 'No unhandled page errors'); } finally { await context.close(); } });
  await page.goto(origin + '/' + file, { waitUntil: 'load' });
  return { page, calls, state };
}

for (const width of [320, 390, 1024, 1440]) {
  test(`${width}px: filtros sin solapamientos, contador explícito y CTA sólo para invitados`, async t => {
    const f = await setup(t, { width, file: files[0] + '?rubro=danza' });
    await f.page.waitForSelector('#likes-99.has-likes');
    assert.equal(await f.page.locator('#likes-99').textContent(), '♥ 1 me gusta · 1 asistente');
    assert.equal(await f.page.locator('.anuncio-time').textContent(), 'Hace 1 día');
    assert.equal(await f.page.locator('#anuncios-heading-label').textContent(), 'anuncio');
    assert.ok((await f.page.locator('.anuncio-respond').boundingBox()).height >= 44, 'Response link must retain the approved A2 touch target');
    assert.equal(await f.page.locator('#anuncios-intro-account').isVisible(), false);
    if (width < 901) {
      const toggle = f.page.locator('#mobile-filter-btn-an');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    }
    const rects = await f.page.evaluate(() => {
      const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { label: box('#filter-category-label'), clear: box('.filter-clear'), title: box('.filter-title'), width: innerWidth, scroll: document.documentElement.scrollWidth };
    });
    assert.ok(rects.label.top >= rects.clear.bottom - 1, JSON.stringify(rects));
    assert.ok(rects.title.right <= rects.clear.left + 1, JSON.stringify(rects));
    assert.ok(rects.scroll <= width + 1, JSON.stringify(rects));
    assert.ok((await f.page.locator('#fp-rubro-global .fchip[data-rubro="danza"]').boundingBox()).height >= 44, 'Discipline chip must retain the approved A2 touch target');
    await f.page.waitForFunction(() => getComputedStyle(document.querySelector('#fp-rubro-global .fchip[data-rubro="danza"]')).color === getComputedStyle(document.querySelector('.main-title span')).color);
    if (output) await f.page.screenshot({ path: path.join(output, `anuncios-filtros-${width}.png`) });
  });
}

test('sidebar refresca especialidades si el rubro remoto cambió sin cambiar tipo de cuenta', async t => {
  const f = await setup(t, { width: 1440, profileRubro: 'danza' });
  await f.page.waitForFunction(() => localStorage.getItem('ba_rubro') === 'danza');
  assert.match(await f.page.locator('.publish-types').innerText(), /bailar|coreógraf/i);
  assert.doesNotMatch(await f.page.locator('#publish-sidebar-copy').innerText(), /organizar una jam/);
});

test('invitado conserva el acceso de registro en anuncios artísticos', async t => {
  const f = await setup(t, { logged: false });
  await f.page.waitForSelector('.anuncio');
  assert.equal(await f.page.locator('#anuncios-intro-account').isVisible(), true);
});

test('detalle conserva contexto Danza y sus acciones propias no prometen contactar', async t => {
  const f = await setup(t, { file: files[1] + '?id=99', own: true });
  await f.page.waitForSelector('.detail-hero-card');
  assert.match(await f.page.locator('.hero-action-row .btn-primary-hero').textContent(), /Gestionar anuncio/);
  const href = await f.page.locator('.hero-action-row .btn-share').getAttribute('href');
  const params = new URL(href, origin).searchParams;
  assert.equal(params.get('tipo'), 'jam'); assert.equal(params.get('rubro'), 'danza');
  assert.equal(await f.page.locator('#contact-card textarea').count(), 0);
  await f.page.locator('.mobile-sticky-action .btn-primary-hero').click();
  await f.page.waitForFunction(() => document.activeElement?.textContent.includes('Gestionar anuncio'));
  assert.deepEqual(f.calls.writes, ['view-fixture']);
});

test('ampliar foto no ejecuta texto de una URL y funciona con teclado', async t => {
  const photo = origin + "/fixture-photo');window.__photoAttack=1;//.svg";
  const f = await setup(t, { file: files[1] + '?id=99', photo });
  const button = f.page.getByRole('button', { name: 'Ampliar foto del anuncio' });
  await button.waitFor();
  assert.equal(await button.getAttribute('onclick'), 'openLightbox(this.dataset.photoSrc)');
  await button.focus(); await f.page.keyboard.press('Enter');
  await f.page.waitForSelector('#lightbox.open');
  assert.equal(await f.page.getByRole('button', { name: 'Cerrar imagen ampliada' }).evaluate(el => el === document.activeElement), true);
  await f.page.keyboard.press('Tab');
  assert.equal(await f.page.getByRole('button', { name: 'Cerrar imagen ampliada' }).evaluate(el => el === document.activeElement), true);
  assert.equal(await f.page.evaluate(() => window.__photoAttack), undefined);
  await f.page.keyboard.press('Escape');
  assert.equal(await f.page.locator('#lightbox.open').count(), 0);
  assert.equal(await button.evaluate(el => el === document.activeElement), true);
});

test('una respuesta obsoleta de Mis anuncios no reemplaza el filtro más reciente', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const row = { id: 100, user_id: 11, tipo: 'jam', rubro: 'danza', estado: 'pausado', titulo: 'Última respuesta QA', created_at: new Date().toISOString() };
  const f = await setup(t, { file: files[2], ownResponses: [{ gate, rows: [] }, { rows: [row] }] });
  t.after(() => release());
  await f.page.locator('#quick-filter-tabs').getByRole('button', { name: 'Pausados', exact: true }).click();
  await f.page.waitForSelector('.mi-anuncio[data-id="100"]');
  release();
  await f.page.waitForLoadState('networkidle');
  assert.equal(await f.page.locator('.mi-anuncio[data-id="100"]').count(), 1);
  assert.equal(await f.page.locator('#quick-filter-tabs .filter-tab.active').textContent(), 'Pausados');
});

test('los precios informativos no reciben un signo peso ni una tarifa por hora falsa', () => {
  const html = read(files[1]);
  const start = html.indexOf('  function precioTexto(');
  const end = html.indexOf('\n  }', start) + 4;
  const price = vm.runInNewContext('(' + html.slice(start, end) + ')');
  assert.equal(price('Consultar'), 'Consultar');
  assert.equal(price('Gratis', true), 'Gratis');
  assert.equal(price('5000', true), '$5000 / hora');
  assert.equal(price('$5.000'), '$5.000');
  assert.equal(price('A la gorra', true), 'A la gorra');
});

test('Mis anuncios ofrece reintentar un error y salir de filtros vacíos', async t => {
  const f = await setup(t, { file: files[2], failOwn: true });
  const retry = f.page.getByRole('button', { name: 'Reintentar', exact: true });
  await retry.waitFor();
  f.state.failOwn = false; await retry.click();
  await f.page.waitForSelector('.mi-anuncio');
  assert.equal(await f.page.locator('#anuncios-lista').getAttribute('aria-busy'), 'false');
  await f.page.locator('#quick-filter-tabs').getByRole('button', { name: 'Pausados', exact: true }).click();
  await f.page.getByRole('button', { name: 'Ver todos mis anuncios', exact: true }).click();
  await f.page.waitForSelector('.mi-anuncio');
  assert.equal(await f.page.locator('#quick-filter-tabs .filter-tab.active').textContent(), 'Todos');
  assert.deepEqual(f.calls.writes, []);
});
