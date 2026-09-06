const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const allowedFiles = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const userId = '210';
const productImage = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#ded5c5"/><ellipse cx="327" cy="426" rx="151" ry="20" fill="#b8ad9b"/><g transform="translate(310 235) rotate(22)"><rect x="-15" y="-195" width="30" height="210" rx="8" fill="#704321"/><path d="M-13-154h26M-13-128h26M-13-102h26M-13-76h26M-13-50h26" stroke="#ded5c5" stroke-width="3"/><path d="M-43-18C-93-46-118 19-81 66c-52 81-23 123 73 126C99 195 113 144 66 66 104 7 79-42 35-16L21 34H-18Z" fill="#bd602d" stroke="#6a3f2a" stroke-width="8"/><ellipse cy="90" rx="31" ry="35" fill="#332c24"/><path d="M-6-190v343M0-190v343M6-190v343" stroke="#e3c39b" stroke-width="2"/><rect x="-36" y="145" width="72" height="15" rx="4" fill="#493024"/></g><text x="24" y="451" font-family="sans-serif" font-size="18" fill="#5c564c">IMAGEN SINTÉTICA · QA LOCAL</text></svg>';
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

function sale(id, extra = {}) {
  return { id, user_id: 320, tipo: 'vende', titulo: `Equipo de prueba ${id}`, descripcion: 'Publicación sintética: no existe una venta real.',
    rubro: 'musica', categoria_producto: 'Guitarra eléctrica', condicion: 'Usado', precio: '$150.000', precio_num: 150000,
    zona: 'Caballito, CABA', estado: 'activo', oculto: false, created_at: new Date().toISOString(),
    foto_url: origin + '/fixture-equipo.svg', ...extra };
}

function catalog() {
  return [
    sale(101, { titulo: 'Guitarra usada — prueba' }),
    sale(102, { tipo: 'vendo', rubro: null, titulo: 'Bajo nuevo — prueba', categoria_producto: 'Bajo eléctrico', condicion: 'Nuevo', precio: '$200.000', precio_num: 200000 }),
    sale(103, { rubro: 'audiovisual', titulo: 'Cámara usada — prueba', categoria_producto: 'Cámara de fotos', precio: '$250.000', precio_num: 250000, zona: 'Córdoba' }),
    sale(104, { rubro: 'danza', titulo: 'Guitarra nueva — prueba', condicion: 'Nuevo', precio: '$450.000', precio_num: 450000 }),
    sale(105, { rubro: null, titulo: 'Guitarra para reparar — prueba', condicion: 'Para reparar', precio: '$50.000', precio_num: 50000 }),
    sale(106, { rubro: 'tatuaje', titulo: 'Equipo tattoo — prueba', categoria_producto: 'Máquina de tatuar', precio: '$120.000', precio_num: 120000 }),
    sale(107, { rubro: 'maquillaje', titulo: 'Accesorio sin precio — prueba', categoria_producto: 'Otro', precio: null, precio_num: null, condicion: 'Nuevo' }),
    sale(201, { tipo: 'busco', titulo: 'Busco artista — no es producto', rubro_buscado: 'musica' }),
    sale(202, { tipo: 'ofrezco', titulo: 'Artista disponible — no es producto' }),
    sale(203, { tipo: 'clases', titulo: 'Clases — no es producto' }),
    sale(204, { tipo: 'jam', titulo: 'Evento — no es producto' })
  ];
}

// Every request is fulfilled or aborted; never use route.continue/fallback/fetch.
// Mocking the expiry RPC is essential: loading this page otherwise makes a POST.
async function setup(t, { width = 390, role = 'artista', rubro = 'danza', logged = true, rows = catalog(),
  file = 'buscARTE_anuncios.html?tipo=vende', responses = [], authorResponses = [], wait = true, allowPublish = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
  await context.addInitScript(({ logged, role, rubro, userId }) => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    if (!logged) return;
    localStorage.setItem('ba_logged', '1');
    localStorage.setItem('ba_user_id', userId);
    localStorage.setItem('ba_name', 'Persona QA');
    localStorage.setItem('ba_tipo_cuenta', role);
    if (rubro) localStorage.setItem('ba_rubro', rubro);
  }, { logged, role, rubro, userId });
  const calls = { gets: [], authors: [], posts: [], expiry: [], unexpected: [], errors: [], dialogs: [] };
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('dialog', async dialog => { calls.dialogs.push(dialog.message()); await dialog.accept(); });
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const relative = url.pathname.slice(1);
    if (url.origin === origin && request.method() === 'GET') {
      if (['buscARTE_anuncio_detalle.html', 'buscARTE_perfil_publico.html', 'buscARTE_login.html'].includes(relative)) {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destino QA</title><p>Destino sintético de navegación</p>' });
      }
      if (relative === 'fixture-equipo.svg') return route.fulfill({ contentType: 'image/svg+xml', body: productImage });
      if (relative === 'favicon.ico') return route.fulfill({ status: 204, body: '' });
      if (relative === 'assets/js/meta-pixel.js') return route.fulfill({ contentType: 'application/javascript', body: 'window.MetaAds={trackCustom(){}};' });
      if (allowedFiles.has(relative)) {
        const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(relative)] || 'text/plain';
        return route.fulfill({ contentType, body: fs.readFileSync(path.join(root, relative)) });
      }
    }
    if (url.hostname === 'fonts.googleapis.com' && request.method() === 'GET') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (url.pathname === '/rest/v1/rpc/vencer_anuncios_viejos' && request.method() === 'POST') {
        calls.expiry.push(request.postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: 'null' });
      }
      if (url.pathname === '/rest/v1/anuncios' && request.method() === 'POST') {
        calls.posts.push(request.postDataJSON());
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 9001 }]) });
      }
      if (url.pathname === '/rest/v1/anuncios' && request.method() === 'GET') {
        // Home's count query is not a catalog read.
        if (url.searchParams.get('select') === 'id') return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
        const response = responses[calls.gets.length] || {};
        calls.gets.push({ url: request.url(), params: Object.fromEntries(url.searchParams) });
        if (response.gate) await response.gate.promise;
        if (response.abort) return route.abort('failed');
        let result = rows;
        const type = url.searchParams.get('tipo');
        if (type === 'in.(vende,vendo)') result = result.filter(row => ['vende', 'vendo'].includes(row.tipo));
        else if (type?.startsWith('eq.')) result = result.filter(row => row.tipo === type.slice(3));
        if (url.searchParams.get('oculto') === 'not.is.true') result = result.filter(row => row.oculto !== true);
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit') || 1000);
        result = result.slice(offset, offset + limit);
        return route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response.body === undefined ? result : response.body) });
      }
      if (url.pathname === '/rest/v1/perfiles' && request.method() === 'GET') {
        if (url.searchParams.get('id')?.startsWith('in.')) {
          const response = authorResponses[calls.authors.length] || {};
          calls.authors.push(request.url());
          if (response.gate) await response.gate.promise;
          return route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response.body || [{ id: 320, nombre: 'Vendedor QA' }]) });
        }
        return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{ id: userId, nombre: 'Persona QA', tipo_cuenta: role, rubro }]) });
      }
      if (['/rest/v1/mensajes', '/rest/v1/reacciones'].includes(url.pathname) && request.method() === 'GET') {
        return route.fulfill({ contentType: 'application/json', body: '[]' });
      }
    }
    calls.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, [], 'No request may escape the explicit fixture allowlist');
      assert.deepEqual(calls.errors, [], 'No uncaught page errors');
      if (!allowPublish) assert.equal(calls.posts.length, 0, 'Browsing and navigation must never publish a product');
    } finally { await context.close(); }
  });
  await page.goto(origin + '/' + file, { waitUntil: wait ? 'load' : 'commit' });
  if (file.startsWith('buscARTE_anuncios') && wait) await ready(page);
  return { page, calls };
}

async function ready(page) {
  await page.waitForFunction(() => typeof cargarAnuncios === 'function' && !/Cargando anuncios/i.test(document.getElementById('anuncios-lista').textContent) && (typeof anunciosCargando === 'undefined' || !anunciosCargando));
}
async function ids(page) {
  return page.locator('#anuncios-lista .anuncio').evaluateAll(cards => cards.map(card => Number(card.dataset.id)));
}
async function expectIds(page, expected) {
  await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('#anuncios-lista .anuncio')].map(card => Number(card.dataset.id))) === JSON.stringify(expected), expected);
  assert.deepEqual(await ids(page), expected);
}
async function chip(page, name) {
  // Open the existing responsive filter panel using the UI when necessary.
  const button = page.locator('#fp-vende').getByRole('button', { name, exact: true, includeHidden: true });
  if (!await button.isVisible()) {
    const toggle = page.locator('#mobile-filter-btn-an');
    if (await toggle.isVisible()) await toggle.click();
  }
  const details = button.locator('xpath=ancestor::details');
  if (await details.count() && await details.getAttribute('open') === null) await details.locator('summary').click();
  await button.click();
}
async function selectRubro(page, rubro) {
  const button = page.locator(`[data-rubro="${rubro}"]`);
  const details = button.locator('xpath=ancestor::details');
  if (await details.count() && await details.getAttribute('open') === null) await details.locator('summary').click();
  await button.click();
}
async function settle(page) { await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); }
async function poll(check, description) {
  const end = Date.now() + 5000;
  while (!check() && Date.now() < end) await new Promise(done => setTimeout(done, 10));
  assert.ok(check(), description);
}
async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  assert.ok(output !== path.join(root, 'dist') && !output.startsWith(path.join(root, 'dist') + path.sep), 'Captures stay outside dist');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

for (const query of ['tipo=vende', 'tipo=vendo', 'rubro=marketplace']) {
  test(`${query}: direct entry shows products from every discipline and legacy/null-rubro sales`, async t => {
    const f = await setup(t, { file: 'buscARTE_anuncios.html?' + query });
    await expectIds(f.page, [101, 102, 103, 104, 105, 106, 107]);
    assert.equal(await f.page.locator('.filter-panel.active').getAttribute('id'), 'fp-vende');
    assert.match(await f.page.locator('#anuncios-intro-title').innerText(), /marketplace/i);
    assert.equal(f.calls.gets[0].params.tipo, 'in.(vende,vendo)');
    assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_rubro')), 'danza', 'Browsing Marketplace never replaces the author discipline');
  });
}

for (const file of ['index.html', 'buscARTE_index.html']) {
  test(`${file}: the public Marketplace card navigates to the product catalog`, async t => {
    const f = await setup(t, { file, logged: false });
    if (file === 'buscARTE_index.html') {
      await f.page.locator('#home-marketplace').focus();
      await f.page.keyboard.press('Enter');
    } else await f.page.locator('#home-marketplace').click();
    await f.page.waitForURL('**/buscARTE_anuncios.html?tipo=vende');
    await ready(f.page);
    await expectIds(f.page, [101, 102, 103, 104, 105, 106, 107]);
  });
}

test('server-side sale filter finds products behind 220 newer artistic posts', async t => {
  const rows = [...Array.from({ length: 220 }, (_, i) => sale(1000 + i, { tipo: 'ofrezco' })), sale(5000, { rubro: null })];
  const f = await setup(t, { rows });
  await expectIds(f.page, [5000]);
  assert.equal(f.calls.gets[0].params.tipo, 'in.(vende,vendo)');
});

test('hidden, inactive and malformed rows never become products even in fallback', async t => {
  const f = await setup(t, { rows: [sale(1), sale(2, { oculto: true }), sale(3, { estado: 'vencido' }), sale(4, { tipo: null })], responses: [{ status: 400 }] });
  await expectIds(f.page, [1]);
  assert.equal(f.calls.gets.length, 2);
  assert.equal(f.calls.gets[1].params.tipo, 'in.(vende,vendo)');
});

test('category selections are OR within the category group', async t => {
  const f = await setup(t, { width: 1280 });
  await chip(f.page, 'Guitarra eléctrica');
  await expectIds(f.page, [101, 104, 105]);
  await chip(f.page, 'Bajo eléctrico');
  await expectIds(f.page, [101, 102, 104, 105]);
});

test('condition selections are OR within the condition group', async t => {
  const f = await setup(t, { width: 1280 });
  await chip(f.page, 'Nuevo');
  await expectIds(f.page, [102, 104, 107]);
  await chip(f.page, 'Usado');
  await expectIds(f.page, [101, 102, 103, 104, 106, 107]);
});

test('category AND condition does not include all used products or all guitars', async t => {
  const f = await setup(t, { width: 1280 });
  await chip(f.page, 'Guitarra eléctrica');
  await chip(f.page, 'Usado');
  await expectIds(f.page, [101]);
});

test('Usado condition includes both labels emitted by the existing publication form', async t => {
  const f = await setup(t, { width: 1280, rows: [sale(1, { condicion: 'Usado — excelente' }), sale(2, { condicion: 'Usado — bueno' }), sale(3, { condicion: 'Nuevo' })] });
  await chip(f.page, 'Usado');
  await expectIds(f.page, [1, 2]);
});

test('price range and zone combine with category/condition; unknown prices are excluded', async t => {
  const f = await setup(t, { width: 1280 });
  await chip(f.page, 'Guitarra eléctrica');
  await chip(f.page, 'Nuevo');
  await chip(f.page, 'Usado');
  await f.page.locator('#precio-min').fill('100000');
  await f.page.locator('#precio-max').fill('200000');
  await f.page.locator('#zona-vende').fill('caballito');
  await expectIds(f.page, [101]);
});

test('formatted legacy prices participate in price ranges without precio_num', async t => {
  const f = await setup(t, { width: 1280, rows: [sale(1, { precio: '$ 150.000,50', precio_num: null }), sale(2, { precio: 'Consultar', precio_num: null }), sale(3, { precio: '$350.000', precio_num: null })] });
  await f.page.locator('#precio-min').fill('150000');
  await f.page.locator('#precio-max').fill('150001');
  await expectIds(f.page, [1]);
});

test('clearing a no-results filter retains Marketplace and resets price/zone/chips', async t => {
  const f = await setup(t, { width: 1280 });
  await chip(f.page, 'Usado');
  await f.page.locator('#precio-max').fill('1');
  await f.page.getByRole('button', { name: 'Limpiar filtros', exact: true }).last().click();
  await expectIds(f.page, [101, 102, 103, 104, 105, 106, 107]);
  assert.equal(await f.page.locator('#fp-vende').getAttribute('class'), 'filter-panel active');
  assert.equal(await f.page.locator('#fp-vende .fchip.on').count(), 0);
  assert.equal(await f.page.locator('#precio-max').inputValue(), '');
});

for (const role of ['artista', 'visitante']) {
  test(`${role}: Marketplace publish opens sale and keeps the author's discipline contract`, async t => {
    const f = await setup(t, { role, rubro: role === 'visitante' ? null : 'danza', allowPublish: true });
    assert.equal(await f.page.locator('.publish-types .publish-type').count(), 1, 'Marketplace sidebar is focused on sale/rental publication');
    assert.match(await f.page.locator('.publish-types .publish-type').getAttribute('onclick'), /vende/);
    await f.page.locator('.main-header .btn-publish').click();
    assert.equal(await f.page.locator('.modal-form.active').getAttribute('id'), 'form-vende');
    if (role === 'visitante') assert.doesNotMatch(await f.page.locator('.modal-tipo-selector').innerText(), /Me ofrezco|Doy clases/i);
    else assert.match(await f.page.locator('.modal-tipo-selector').innerText(), /Me ofrezco/i, 'The general publication modal keeps the account-appropriate non-sale types');
    await f.page.locator('#form-vende input[type="text"]').first().fill('Guitarra sintética no real');
    await f.page.locator('#form-vende textarea').fill('Únicamente una prueba aislada del contrato existente.');
    await f.page.locator('#vende-categoria').selectOption({ label: 'Guitarra eléctrica' });
    await f.page.locator('#vende-precio').fill('123000');
    await f.page.evaluate(() => submitAnuncio());
    await f.page.waitForFunction(() => document.getElementById('publish-status').dataset.state === 'success');
    assert.equal(f.calls.posts.length, 1);
    assert.equal(f.calls.posts[0].tipo, 'vende');
    assert.equal(f.calls.posts[0].rubro, role === 'visitante' ? null : 'danza');
  });
}

test('guest can browse products but publishing still requires login', async t => {
  const f = await setup(t, { logged: false });
  await expectIds(f.page, [101, 102, 103, 104, 105, 106, 107]);
  await f.page.locator('.main-header .btn-publish').click();
  assert.equal(await f.page.locator('#modal.open').count(), 0);
  assert.equal(f.calls.posts.length, 0);
  assert.ok(f.calls.dialogs.some(message => /registr|sesión|cuenta/i.test(message)) || /login/.test(f.page.url()));
});

test('empty Marketplace CTA starts selling, not an artist search', async t => {
  const f = await setup(t, { rows: [] });
  await f.page.locator('#anuncios-lista .empty-action.primary').click();
  assert.equal(await f.page.locator('.modal-form.active').getAttribute('id'), 'form-vende');
});

test('switching to a discipline and back restores correct panels, cards and sale CTA', async t => {
  const f = await setup(t, { width: 1280 });
  await selectRubro(f.page, 'musica');
  await expectIds(f.page, [201, 202, 203, 204]);
  assert.equal(await f.page.locator('.filter-panel.active').getAttribute('id'), 'fp-musico');
  await selectRubro(f.page, 'marketplace');
  await expectIds(f.page, [101, 102, 103, 104, 105, 106, 107]);
  assert.equal(await f.page.locator('.filter-panel.active').getAttribute('id'), 'fp-vende');
});

test('HTTP failure offers retry without losing Marketplace query scope', async t => {
  const f = await setup(t, { responses: [{ status: 500, body: {} }, { status: 500, body: {} }] });
  await f.page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expectIds(f.page, [101, 102, 103, 104, 105, 106, 107]);
  assert.ok(f.calls.gets.every(call => call.params.tipo === 'in.(vende,vendo)'));
});

test('a delayed obsolete catalog response cannot overwrite newer discipline results', async t => {
  const gate = deferred();
  const f = await setup(t, { width: 1280, responses: [{ gate }], wait: false });
  await poll(() => f.calls.gets.length === 1, 'First product request is held');
  await selectRubro(f.page, 'musica');
  await expectIds(f.page, [201, 202, 203, 204]);
  const obsoleteResponse = f.page.waitForResponse(f.calls.gets[0].url);
  gate.resolve();
  await (await obsoleteResponse).finished();
  await settle(f.page);
  await expectIds(f.page, [201, 202, 203, 204]);
});

test('late author lookup cannot append obsolete product cards into a new catalog', async t => {
  const gate = deferred();
  const f = await setup(t, { width: 1280, authorResponses: [{ gate }], wait: false });
  await poll(() => f.calls.authors.length === 1, 'First author lookup is held');
  await selectRubro(f.page, 'musica');
  await expectIds(f.page, [201, 202, 203, 204]);
  const obsoleteResponse = f.page.waitForResponse(f.calls.authors[0]);
  gate.resolve();
  await (await obsoleteResponse).finished();
  await settle(f.page);
  await expectIds(f.page, [201, 202, 203, 204]);
});

test('rapid filter changes discard an obsolete HTTP error instead of replacing newer results', async t => {
  const gate = deferred();
  const f = await setup(t, { width: 1280, responses: [{}, { gate, status: 500, body: {} }] });
  await chip(f.page, 'Guitarra eléctrica');
  await poll(() => f.calls.gets.length === 2, 'Category request is held');
  await chip(f.page, 'Nuevo');
  await expectIds(f.page, [104]);
  const obsoleteResponse = f.page.waitForResponse(f.calls.gets[1].url);
  gate.resolve();
  await (await obsoleteResponse).finished();
  await settle(f.page);
  await expectIds(f.page, [104]);
  assert.equal(f.calls.gets.length, 3, 'A stale failure must not trigger a new fallback request');
});

test('loading more paginates 200+70 products exactly once and uses actual rendered count', async t => {
  const gate = deferred();
  const f = await setup(t, { rows: Array.from({ length: 270 }, (_, i) => sale(1000 + i)), responses: [{}, { gate }] });
  assert.equal((await ids(f.page)).length, 200);
  await f.page.locator('#btn-load-more').click();
  await poll(() => f.calls.gets.length === 2, 'Next page started');
  await f.page.evaluate(() => loadMoreAnuncios(document.getElementById('btn-load-more')));
  assert.equal(f.calls.gets.length, 2, 'Repeated load-more actions share one pending request');
  gate.resolve();
  await f.page.waitForFunction(() => document.querySelectorAll('#anuncios-lista .anuncio').length === 270);
  const actual = await ids(f.page);
  assert.equal(new Set(actual).size, 270);
  assert.equal(await f.page.locator('#anuncios-count').textContent(), '270');
  assert.equal(f.calls.gets[1].params.offset, '200');
  assert.equal(await f.page.locator('#btn-load-more').isVisible(), false);
});

test('load-more fallback preserves offset and Marketplace filter without repeating first page', async t => {
  const f = await setup(t, { rows: Array.from({ length: 270 }, (_, i) => sale(1000 + i)), responses: [{}, { status: 400 }] });
  await f.page.locator('#btn-load-more').click();
  await f.page.waitForFunction(() => document.querySelectorAll('#anuncios-lista .anuncio').length > 200);
  assert.equal(f.calls.gets[2].params.offset, '200');
  assert.equal(f.calls.gets[2].params.tipo, 'in.(vende,vendo)');
  assert.equal(f.calls.gets[2].params.order, f.calls.gets[1].params.order, 'Fallback keeps the ordering used by the current cursor');
  assert.equal(f.calls.gets[2].params.oculto, f.calls.gets[1].params.oculto, 'Fallback keeps the same hidden-row exclusion');
  const actual = await ids(f.page);
  assert.equal(new Set(actual).size, actual.length);
  assert.ok(actual.includes(1200));
});

test('a fully filtered first page keeps a path to the following matching products', async t => {
  const rows = [...Array.from({ length: 200 }, (_, i) => sale(1000 + i, { condicion: 'Nuevo' })), sale(2000, { condicion: 'Usado' })];
  const f = await setup(t, { width: 1280, rows });
  await chip(f.page, 'Usado');
  await f.page.waitForFunction(() => !/Cargando anuncios/i.test(document.getElementById('anuncios-lista').textContent));
  if (!(await ids(f.page)).includes(2000)) await f.page.locator('#btn-load-more').click();
  await expectIds(f.page, [2000]);
  assert.equal(await f.page.locator('#anuncios-count').textContent(), '1');
});

test('product title/detail and author/profile links have distinct existing destinations', async t => {
  const f = await setup(t, { rows: [sale(101)] });
  const title = f.page.locator('.anuncio-titulo a');
  assert.equal(await title.getAttribute('href'), 'buscARTE_anuncio_detalle.html?id=101');
  assert.equal(await f.page.locator('.anuncio-autor').getAttribute('href'), 'buscARTE_perfil_publico.html?id=320');
  await title.click();
  await f.page.waitForURL('**/buscARTE_anuncio_detalle.html?id=101');
  await f.page.goBack();
  await ready(f.page);
  await f.page.locator('.anuncio-autor').click();
  await f.page.waitForURL('**/buscARTE_perfil_publico.html?id=320');
});

test('product and author text is escaped rather than executed as markup', async t => {
  const attack = '<img src=x onerror="window.__marketXss=1">';
  const f = await setup(t, { rows: [sale(101, { titulo: attack, descripcion: attack, categoria_producto: attack })], authorResponses: [{ body: [{ id: 320, nombre: attack }] }] });
  assert.equal(await f.page.locator('.anuncio-titulo').textContent(), attack);
  assert.ok((await f.page.locator('.autor-name').textContent()).endsWith(attack));
  assert.equal(await f.page.evaluate(() => window.__marketXss), undefined);
  assert.equal(await f.page.locator('[onerror]').count(), 0);
});

for (const width of [320, 390, 1280]) {
  test(`${width}px: catalog cards, product photo, price and publish action remain usable`, async t => {
    const f = await setup(t, { width, rows: [sale(101), sale(102, { foto_url: null, precio: null, precio_num: null })] });
    await expectIds(f.page, [101, 102]);
    assert.equal(await f.page.locator('#marketplace-other-boards').getAttribute('open'), null, 'Other artistic boards start collapsed in Marketplace');
    assert.equal(await f.page.locator('.anuncio').first().locator('img').count(), 1);
    assert.match(await f.page.locator('.anuncio').first().innerText(), /150[.,]000/);
    const metrics = await f.page.evaluate(() => {
      const action = document.querySelector('.main-header .btn-publish').getBoundingClientRect();
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, action: { left: action.left, right: action.right, height: action.height },
        cards: [...document.querySelectorAll('.anuncio')].map(card => { const r = card.getBoundingClientRect(); return { left: r.left, right: r.right }; }) };
    });
    assert.ok(metrics.scroll <= metrics.width + 1, JSON.stringify(metrics));
    assert.ok(metrics.cards.every(card => card.left >= -1 && card.right <= width + 1), JSON.stringify(metrics));
    assert.ok(metrics.action.left >= -1 && metrics.action.right <= width + 1, JSON.stringify(metrics));
    assert.ok(metrics.action.height >= 44, 'Primary action meets 44px touch target');
    await capture(f.page, `marketplace-${width}.png`);
    if (process.env.BUSCARTE_QA_OUTPUT) {
      await f.page.locator('.anuncio').last().scrollIntoViewIfNeeded();
      await capture(f.page, `marketplace-no-photo-${width}.png`);
    }
    if (width < 768) {
      await f.page.locator('#mobile-filter-btn-an').click();
      await capture(f.page, `marketplace-filters-${width}.png`);
    }
  });
}
