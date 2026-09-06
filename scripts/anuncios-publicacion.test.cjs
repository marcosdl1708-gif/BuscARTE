const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'buscARTE_anuncios.html'), 'utf8');
const userId = 'fixture-user-only';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=', 'base64');
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

// Every request is fulfilled or aborted here. There is deliberately no
// route.continue/fallback, real Supabase, tracking, mail, upload or expiry RPC.
async function setup(t, { width = 390, height = 844, role = 'artista', rubro = 'musica', postResponses = [], uploadResponses = [] } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768,
    timezoneId: 'America/Argentina/Buenos_Aires', serviceWorkers: 'block'
  });
  t.after(() => context.close());
  await context.addInitScript(({ userId, role, rubro }) => {
    localStorage.setItem('ba_logged', '1');
    localStorage.setItem('ba_user_id', userId);
    localStorage.setItem('ba_name', 'Persona de prueba');
    localStorage.setItem('ba_tipo_cuenta', role);
    if (rubro) localStorage.setItem('ba_rubro', rubro);
  }, { userId, role, rubro });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const calls = { posts: [], uploads: [], expiry: [], unexpected: [], errors: [], dialogs: [], profileReads: 0 };
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('dialog', async dialog => { calls.dialogs.push(dialog.message()); await dialog.accept(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://buscarte.test' && url.pathname === '/buscARTE_anuncios.html') {
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (url.origin === 'http://buscarte.test' && url.pathname === '/assets/js/meta-pixel.js') {
      return route.fulfill({ contentType: 'application/javascript', body: 'window.__trackingCalls=[];window.MetaAds={trackCustom(...args){window.__trackingCalls.push(args)}};' });
    }
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (request.method() === 'POST' && url.pathname === '/rest/v1/anuncios') {
        const response = postResponses[calls.posts.length] || {};
        calls.posts.push({ body: request.postDataJSON(), headers: request.headers() });
        if (response.gate) await response.gate.promise;
        if (response.abort) return route.abort('failed');
        return route.fulfill({ status: response.status || 201, contentType: 'application/json', body: JSON.stringify(response.body === undefined ? [{ id: 9001 }] : response.body) });
      }
      if (request.method() === 'POST' && url.pathname.startsWith('/storage/v1/object/fotos-anuncios/')) {
        const response = uploadResponses[calls.uploads.length] || {};
        calls.uploads.push({ url: request.url(), bytes: request.postDataBuffer()?.length || 0 });
        if (response.gate) await response.gate.promise;
        if (response.abort) return route.abort('failed');
        return route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response.body || { Key: url.pathname }) });
      }
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/vencer_anuncios_viejos') {
        calls.expiry.push(request.postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: 'null' });
      }
      if (request.method() === 'GET' && url.pathname === '/rest/v1/perfiles') {
        calls.profileReads++;
        return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{ id: userId, nombre: 'Persona de prueba', tipo_cuenta: role, rubro }]) });
      }
      if (request.method() === 'GET' && ['/rest/v1/anuncios', '/rest/v1/mensajes', '/rest/v1/reacciones'].includes(url.pathname)) {
        return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
      }
      if (request.method() === 'GET' && url.pathname.startsWith('/storage/v1/object/public/fotos-anuncios/')) {
        return route.fulfill({ contentType: 'image/png', body: png });
      }
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.origin === 'http://buscarte.test' && ['/manifest.json', '/favicon.ico'].includes(url.pathname)) return route.fulfill({ body: '{}' });
    calls.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  await page.goto('http://buscarte.test/buscARTE_anuncios.html');
  await page.waitForFunction(() => typeof openModal === 'function' && typeof submitAnuncio === 'function');
  await page.waitForFunction(() => !/Cargando anuncios/.test(document.getElementById('anuncios-lista').textContent));
  async function open(tipo) {
    await page.evaluate(tipo => {
      if (document.getElementById('modal').classList.contains('open')) {
        const button = [...document.querySelectorAll('.modal-tipo-btn')].find(el => (el.getAttribute('onclick') || '').includes("'" + tipo + "'"));
        selectTipo(tipo, button);
      } else openModal(tipo);
    }, tipo);
    await page.waitForSelector('#modal.open');
  }
  async function state(value) {
    await page.waitForFunction(value => document.getElementById('publish-status')?.dataset.state === value, value, { timeout: 5000 });
  }
  async function submit() { await page.evaluate(() => submitAnuncio()); }
  async function startSubmit() { await page.evaluate(() => { window.__testPendingSubmit = submitAnuncio(); }); }
  async function uploaded(count) {
    await poll(() => calls.uploads.length >= count, 'Upload request reached isolated handler');
  }
  t.after(() => {
    assert.deepEqual(calls.unexpected, [], 'No request outside the explicit isolated fixture allowlist');
    assert.deepEqual(calls.errors, [], 'No uncaught page errors');
  });
  return { page, calls, open, state, submit, startSubmit, uploaded };
}

async function poll(check, message) {
  const end = Date.now() + 5000;
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(check(), message);
}

async function fill(f, tipo) {
  await f.open(tipo);
  const page = f.page;
  if (tipo === 'busco') {
    await page.locator('#form-busco input[type=text]').first().fill('Busco artista — prueba aislada');
    await page.locator('#form-busco textarea').fill('Descripción busco que debe conservarse.');
    await page.locator('#busco-zona').fill('Almagro, CABA');
    await page.evaluate(() => seleccionarRubroBusco('danza', document.querySelector('#busco-rubro-chips [onclick*=danza]')));
    await page.locator('#busco-chips-especificos').getByRole('button', { name: 'Tango', exact: true }).click();
  } else if (tipo === 'ofrezco') {
    await page.locator('#ofrezco-titulo').fill('Me ofrezco — prueba aislada');
    await page.locator('#form-ofrezco textarea').fill('Descripción ofrezco que debe conservarse.');
    await page.locator('#ofrezco-zona').fill('Palermo, CABA');
    await page.locator('#ofrezco-chips-especificos').getByRole('button', { name: 'Guitarra', exact: true }).click();
  } else if (tipo === 'jam') {
    await page.locator('#jam-titulo').fill('Evento — prueba aislada');
    await page.locator('#form-jam textarea').fill('Descripción evento que debe conservarse.');
    await page.locator('#jam-fecha').fill('2030-09-06');
    await page.locator('#jam-hora').fill('20:30');
    await page.locator('#jam-lugar').fill('Lugar de prueba, CABA');
    await page.locator('#jam-precio').fill('A la gorra');
    await page.locator('#jam-link').fill('https://example.invalid/evento');
    await page.locator('#jam-contacto').fill('@persona_prueba');
  } else if (tipo === 'vende') {
    await page.locator('#vende-categoria').selectOption({ label: 'Guitarra eléctrica' });
    await page.locator('#form-vende input[placeholder*=Fender]').fill('Marca fixture');
    await page.locator('#form-vende').getByRole('button', { name: 'Usado — excelente', exact: true }).click();
    await page.locator('#vende-precio').fill('450000');
    await page.locator('#form-vende input[placeholder*=Caballito]').fill('Caballito, CABA');
    await page.locator('#form-vende textarea').fill('Descripción venta que debe conservarse.');
  } else if (tipo === 'clases') {
    await page.locator('#clases-titulo').fill('Clases — prueba aislada');
    await page.locator('#clases-desc').fill('Descripción clases que debe conservarse.');
    await page.locator('#clases-precio').fill('5000');
    await page.locator('#clases-zona').fill('Caballito, CABA');
    await page.locator('#clases-disciplina-mfield').getByRole('button', { name: 'Guitarra', exact: true }).click();
    await page.locator('#form-clases').getByRole('button', { name: 'Intermedio', exact: true }).click();
    await page.locator('#form-clases').getByRole('button', { name: 'Online', exact: true }).click();
  }
}

async function choosePhoto(page, tipo, slot = 1, name = 'fixture.png', buffer = png) {
  const selector = tipo === 'jam' ? '#foto-jam-input' : '#foto-venta-input-' + slot;
  await page.locator(selector).setInputFiles({ name, mimeType: 'image/png', buffer });
}

async function syntheticFlyer(page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#24251f'; ctx.fillRect(0, 0, 900, 600);
    ctx.fillStyle = '#d4f53c'; ctx.fillRect(45, 45, 12, 510);
    ctx.font = 'bold 55px sans-serif'; ctx.fillText('EVENTO DE PRUEBA', 85, 180);
    ctx.fillStyle = '#f4f2ea'; ctx.font = '32px sans-serif'; ctx.fillText('Flyer sintético para revisar el formulario', 85, 280);
    ctx.fillStyle = '#aaa99c'; ctx.font = '28px sans-serif'; ctx.fillText('QA AISLADA · NO SE PUBLICA', 85, 430);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(data, 'base64');
}

const payloadKeys = {
  busco: ['tipo', 'estado', 'user_id', 'rubro', 'titulo', 'descripcion', 'instrumentos', 'generos', 'tags', 'zona', 'rubro_buscado'],
  ofrezco: ['tipo', 'estado', 'user_id', 'rubro', 'titulo', 'descripcion', 'instrumentos', 'generos', 'tags', 'zona'],
  jam: ['tipo', 'estado', 'user_id', 'rubro', 'titulo', 'descripcion', 'generos', 'fecha_evento', 'lugar', 'precio_entrada', 'link_evento', 'contacto_evento', 'foto_url'],
  vende: ['tipo', 'estado', 'user_id', 'rubro', 'categoria_producto', 'marca', 'condicion', 'precio_num', 'precio', 'zona', 'descripcion', 'titulo', 'foto_url', 'foto_url_2', 'foto_url_3'],
  clases: ['tipo', 'estado', 'user_id', 'rubro', 'titulo', 'descripcion', 'precio', 'zona', 'instrumentos', 'nivel', 'modalidad']
};

for (const tipo of Object.keys(payloadKeys)) {
  test(`${tipo}: publication keeps the existing data contract and confirms the returned record`, async t => {
    const f = await setup(t);
    await fill(f, tipo);
    await f.submit();
    await f.state('success');
    assert.equal(f.calls.posts.length, 1);
    const payload = f.calls.posts[0].body;
    assert.deepEqual(Object.keys(payload).sort(), payloadKeys[tipo].sort());
    assert.equal(payload.tipo, tipo);
    assert.equal(payload.user_id, userId);
    assert.equal(payload.estado, 'activo');
    assert.equal(payload.rubro, 'musica');
    assert.equal(f.calls.posts[0].headers.prefer, 'return=representation');
    if (tipo === 'busco') { assert.equal(payload.rubro_buscado, 'danza'); assert.equal(payload.generos, 'Tango'); }
    if (tipo === 'ofrezco') assert.equal(payload.instrumentos, 'Guitarra');
    if (tipo === 'jam') {
      assert.equal(payload.fecha_evento, '2030-09-06T23:30:00.000Z');
      assert.equal(payload.link_evento, 'https://example.invalid/evento');
      assert.equal(payload.foto_url, null);
    }
    if (tipo === 'vende') {
      assert.equal(payload.precio_num, 450000);
      assert.equal(payload.precio, '$450.000');
      assert.equal(payload.categoria_producto, 'Guitarra eléctrica');
      assert.equal(payload.condicion, 'Usado — excelente');
    }
    if (tipo === 'clases') { assert.equal(payload.instrumentos, 'Guitarra'); assert.equal(payload.nivel, 'Intermedio'); assert.equal(payload.modalidad, 'Online'); }
    assert.equal(await f.page.locator('.btn-submit').isDisabled(), true);
    assert.match(await f.page.locator('#publish-view-link').getAttribute('href'), /buscARTE_anuncio_detalle(?:\.html)?\?id=9001/);
    await f.submit();
    assert.equal(f.calls.posts.length, 1, 'Confirmed success must not permit another submission');
  });
}

test('visitor publishing remains restricted to event and marketplace without inventing an artist rubro', async t => {
  const f = await setup(t, { role: 'visitante', rubro: null });
  await f.open('busco');
  assert.equal(await f.page.locator('.modal-form.active').getAttribute('id'), 'form-jam');
  assert.equal(await f.page.locator('.modal-tipo-btn').count(), 2);
  await fill(f, 'vende');
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.posts[0].body.tipo, 'vende');
  assert.equal(f.calls.posts[0].body.rubro, null);
});

test('double submission while POST is pending is locked, as are dismissal and type changes', async t => {
  const gate = deferred();
  const f = await setup(t, { postResponses: [{ gate }] });
  await fill(f, 'busco');
  await f.startSubmit();
  await poll(() => f.calls.posts.length === 1, 'First publication started');
  assert.equal(await f.page.locator('#publish-fields').evaluate(el => el.disabled), true);
  assert.equal(await f.page.locator('#form-busco textarea').isDisabled(), true);
  assert.equal(await f.page.locator('.btn-submit').isDisabled(), true);
  await f.page.evaluate(() => { submitAnuncio(); closeModal(); selectTipo('vende', null); });
  assert.equal(await f.page.locator('#modal.open').count(), 1);
  assert.equal(await f.page.locator('.modal-form.active').getAttribute('id'), 'form-busco');
  assert.equal(f.calls.posts.length, 1);
  gate.resolve();
  await f.state('success');
  assert.equal(f.calls.posts.length, 1);
});

test('double submission during photo upload waits once and sends the selected photo', async t => {
  const gate = deferred();
  const f = await setup(t, { uploadResponses: [{ gate }] });
  await fill(f, 'jam');
  await choosePhoto(f.page, 'jam');
  await f.uploaded(1);
  await f.startSubmit();
  assert.equal(await f.page.locator('.btn-submit').isDisabled(), true);
  assert.equal(await f.page.locator('#publish-fields').evaluate(el => el.disabled), true);
  assert.equal(await f.page.locator('#jam-titulo').isDisabled(), true);
  await f.page.evaluate(() => { submitAnuncio(); });
  assert.equal(f.calls.posts.length, 0);
  gate.resolve();
  await f.state('success');
  assert.equal(f.calls.posts.length, 1);
  assert.equal(f.calls.posts[0].body.foto_url, f.calls.uploads[0].url.replace('/storage/v1/object/', '/storage/v1/object/public/'));
});

test('a stuck upload times out without posting and unlocks the preserved draft', async t => {
  const gate = deferred();
  const f = await setup(t, { uploadResponses: [{ gate }] });
  await fill(f, 'jam');
  await f.page.clock.install();
  await choosePhoto(f.page, 'jam');
  await f.uploaded(1);
  await f.startSubmit();
  await f.page.clock.fastForward(61000);
  await f.state('error');
  assert.equal(f.calls.posts.length, 0);
  assert.equal(await f.page.locator('#publish-fields').evaluate(el => el.disabled), false);
  assert.equal(await f.page.locator('#modal .modal-close').isEnabled(), true);
  assert.equal(await f.page.locator('#jam-titulo').inputValue(), 'Evento — prueba aislada');
  gate.resolve();
});

test('a stuck POST times out as uncertain, with dismissal available but no automatic retry', async t => {
  const gate = deferred();
  const f = await setup(t, { postResponses: [{ gate }] });
  await fill(f, 'busco');
  await f.page.clock.install();
  await f.startSubmit();
  await poll(() => f.calls.posts.length === 1, 'Publication reached the isolated pending handler');
  await f.page.clock.fastForward(61000);
  await f.state('uncertain');
  assert.equal(await f.page.locator('#publish-fields').evaluate(el => el.disabled), false);
  assert.equal(await f.page.locator('#modal .modal-close').isEnabled(), true);
  assert.equal(await f.page.locator('.btn-submit').isDisabled(), true);
  await f.submit();
  assert.equal(f.calls.posts.length, 1);
  await f.page.evaluate(() => closeModal());
  await f.open('busco');
  await f.state('uncertain');
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Descripción busco que debe conservarse.');
  gate.resolve();
});

test('tracking failure after server success cannot turn a published record into an error', async t => {
  const f = await setup(t);
  await fill(f, 'busco');
  await f.page.evaluate(() => { window.MetaAds = { trackCustom() { throw new Error('Synthetic tracking failure'); } }; });
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.posts.length, 1);
  assert.deepEqual(f.calls.dialogs, []);
});

for (const status of [400, 500]) {
  test(`HTTP ${status} preserves the draft and offers a controlled retry`, async t => {
    const f = await setup(t, { postResponses: [{ status, body: { message: 'Synthetic failure' } }] });
    await fill(f, 'busco');
    await f.submit();
    await f.state('error');
    assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Descripción busco que debe conservarse.');
    assert.equal(await f.page.locator('#busco-chips-especificos .mchip.on').textContent(), 'Tango');
    assert.equal(await f.page.locator('.btn-submit').isEnabled(), true);
    assert.equal(await f.page.locator('#publish-fields').evaluate(el => el.disabled), false);
    await f.submit();
    await f.state('success');
    assert.equal(f.calls.posts.length, 2);
    assert.deepEqual(f.calls.posts[0].body, f.calls.posts[1].body);
  });
}

for (const response of [
  { abort: true }, { body: [] }, { body: { message: 'No record identifier' } },
  { status: 502, body: { message: 'Synthetic gateway failure' } },
  { status: 504, body: { message: 'Synthetic gateway timeout' } }
]) {
  const label = response.abort ? 'network interruption' : response.status ? `HTTP ${response.status} gateway failure` : Array.isArray(response.body) ? '2xx with no row' : '2xx with no id';
  test(`${label}: uncertain outcome never retries without explicit acknowledgement`, async t => {
    const f = await setup(t, { postResponses: [response] });
    await fill(f, 'busco');
    await f.submit();
    await f.state('uncertain');
    assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Descripción busco que debe conservarse.');
    assert.equal(await f.page.locator('#publish-retry-confirm').isVisible(), true);
    await f.submit();
    assert.equal(f.calls.posts.length, 1);
    await f.page.locator('#publish-retry-confirm').click();
    await f.submit();
    await f.state('success');
    assert.equal(f.calls.posts.length, 2);
  });
}

test('switching types and closing the backdrop preserves each draft, chips and marketplace category', async t => {
  const f = await setup(t, { width: 1280 });
  await fill(f, 'busco');
  await fill(f, 'clases');
  await fill(f, 'vende');
  await f.open('busco');
  assert.equal(await f.page.locator('#busco-chips-especificos .mchip.on').textContent(), 'Tango');
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Descripción busco que debe conservarse.');
  await f.page.locator('#modal').click({ position: { x: 2, y: 2 } });
  assert.equal(await f.page.locator('#modal.open').count(), 0);
  await f.open('clases');
  assert.equal(await f.page.locator('#clases-disciplina-mfield .mchip.on').textContent(), 'Guitarra');
  assert.equal(await f.page.locator('#form-clases .nivel-chip.on').textContent(), 'Intermedio');
  await f.open('vende');
  assert.equal(await f.page.locator('#vende-categoria').inputValue(), 'Guitarra eléctrica');
  assert.equal(await f.page.locator('#vende-precio').inputValue(), '450000');
});

test('an upload failure prevents silently dropping the chosen image; removal permits publishing', async t => {
  const f = await setup(t, { uploadResponses: [{ status: 500 }] });
  await fill(f, 'jam');
  await choosePhoto(f.page, 'jam');
  await f.submit();
  await f.state('error');
  assert.equal(f.calls.posts.length, 0);
  assert.equal(await f.page.locator('#jam-titulo').inputValue(), 'Evento — prueba aislada');
  await f.page.evaluate(() => quitarFotoAnuncio('jam', 1));
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.posts[0].body.foto_url, null);
});

test('all three marketplace photo slots preserve their own uploaded URL', async t => {
  const f = await setup(t);
  await fill(f, 'vende');
  for (const slot of [1, 2, 3]) {
    await choosePhoto(f.page, 'venta', slot, `slot-${slot}.png`);
    await f.uploaded(slot);
  }
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.uploads.length, 3);
  for (const [index, key] of ['foto_url', 'foto_url_2', 'foto_url_3'].entries()) {
    assert.equal(f.calls.posts[0].body[key], f.calls.uploads[index].url.replace('/storage/v1/object/', '/storage/v1/object/public/'));
  }
});

test('a stale upload cannot replace the newer photo in the same slot', async t => {
  const slowFirst = deferred();
  const f = await setup(t, { uploadResponses: [{ gate: slowFirst }, {}] });
  await fill(f, 'vende');
  await choosePhoto(f.page, 'venta', 1, 'old-photo.png');
  await f.uploaded(1);
  await choosePhoto(f.page, 'venta', 1, 'new-photo.png');
  await f.uploaded(2);
  await f.page.waitForFunction(() => document.getElementById('foto-venta-text-1').textContent.includes('Foto lista'));
  const obsoleteResponse = f.page.waitForResponse(f.calls.uploads[0].url);
  slowFirst.resolve();
  await (await obsoleteResponse).finished();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.posts[0].body.foto_url, f.calls.uploads[1].url.replace('/storage/v1/object/', '/storage/v1/object/public/'));
});

test('removing a photo while uploading prevents its late completion from restoring it', async t => {
  const gate = deferred();
  const f = await setup(t, { uploadResponses: [{ gate }] });
  await fill(f, 'vende');
  await choosePhoto(f.page, 'venta');
  await f.uploaded(1);
  await f.page.evaluate(() => quitarFotoAnuncio('venta', 1));
  const obsoleteResponse = f.page.waitForResponse(f.calls.uploads[0].url);
  gate.resolve();
  await (await obsoleteResponse).finished();
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.posts[0].body.foto_url, null);
});

test('choosing the same image after an upload error really retries it', async t => {
  const f = await setup(t, { uploadResponses: [{ status: 500 }, {}] });
  await fill(f, 'jam');
  await choosePhoto(f.page, 'jam', 1, 'same-photo.png');
  await f.submit();
  await f.state('error');
  assert.equal(f.calls.posts.length, 0);
  await choosePhoto(f.page, 'jam', 1, 'same-photo.png');
  await f.submit();
  await f.state('success');
  assert.equal(f.calls.uploads.length, 2);
  assert.equal(f.calls.posts.length, 1);
  assert.equal(f.calls.posts[0].body.foto_url, f.calls.uploads[1].url.replace('/storage/v1/object/', '/storage/v1/object/public/'));
});

test('closing after success clears the published draft but does not allow its accidental resubmission', async t => {
  const f = await setup(t);
  await fill(f, 'busco');
  await f.submit();
  await f.state('success');
  await f.page.evaluate(() => closeModal());
  await f.open('busco');
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), '');
  assert.equal(await f.page.locator('#form-busco input[type=text]').first().inputValue(), '');
  assert.equal(f.calls.posts.length, 1);
});

test('Tab stays in the dialog; Escape preserves the draft and restores opener focus', async t => {
  const f = await setup(t, { width: 1280 });
  await f.page.locator('.main-header .btn-publish').focus();
  await f.open('busco');
  await f.page.keyboard.press('Tab');
  assert.equal(await f.page.locator('#modal .modal-close').evaluate(el => el === document.activeElement), true);
  await f.page.keyboard.press('Shift+Tab');
  assert.equal(await f.page.locator('#modal .btn-submit').evaluate(el => el === document.activeElement), true);
  await f.page.keyboard.press('Tab');
  assert.equal(await f.page.locator('#modal .modal-close').evaluate(el => el === document.activeElement), true);
  await f.page.locator('#form-busco textarea').fill('Borrador preservado al usar Escape.');
  await f.page.keyboard.press('Escape');
  assert.equal(await f.page.locator('#modal.open').count(), 0);
  assert.equal(await f.page.locator('.main-header .btn-publish').evaluate(el => el === document.activeElement), true);
  await f.open('busco');
  assert.equal(await f.page.locator('#form-busco textarea').inputValue(), 'Borrador preservado al usar Escape.');
});

test('visualViewport keyboard resize and offset keep the footer within the visible area', async t => {
  const f = await setup(t);
  await fill(f, 'jam');
  await f.page.locator('#jam-contacto').focus();
  // This injects the geometry/event a mobile keyboard provides, not a real OS
  // keyboard. It verifies the actual resize/scroll listeners in the page.
  await f.page.evaluate(() => {
    const viewport = window.visualViewport;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 360 },
      offsetTop: { configurable: true, value: 180 },
      scale: { configurable: true, value: 1 }
    });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  });
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await f.page.evaluate(() => {
    const modal = document.getElementById('modal').getBoundingClientRect();
    const button = document.querySelector('.btn-submit').getBoundingClientRect();
    return { top: modal.top, height: modal.height, buttonTop: button.top, buttonBottom: button.bottom };
  });
  assert.ok(Math.abs(metrics.top - 180) < 1, 'Overlay follows visualViewport offset');
  assert.ok(Math.abs(metrics.height - 360) < 1, 'Overlay follows the remaining visualViewport height');
  assert.ok(metrics.buttonTop >= 180 && metrics.buttonBottom <= 541, JSON.stringify(metrics));
  assert.equal(await f.page.locator('#jam-contacto').inputValue(), '@persona_prueba');
});

test('a 280px keyboard visualViewport still leaves usable form space in uncertain state', async t => {
  const f = await setup(t, { width: 320, postResponses: [{ abort: true }] });
  await fill(f, 'busco');
  await f.submit();
  await f.state('uncertain');
  await f.page.evaluate(() => {
    const viewport = window.visualViewport;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 280 },
      offsetTop: { configurable: true, value: 80 },
      scale: { configurable: true, value: 1 }
    });
    viewport.dispatchEvent(new Event('resize'));
  });
  await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await f.page.evaluate(() => {
    const modal = document.getElementById('modal').getBoundingClientRect();
    const footer = document.querySelector('#modal .modal-footer').getBoundingClientRect();
    return { top: modal.top, bottom: modal.bottom, height: modal.height,
      footerTop: footer.top, footerBottom: footer.bottom,
      scrollSpace: document.getElementById('publish-scroll').clientHeight };
  });
  assert.ok(Math.abs(metrics.height - 280) < 1, JSON.stringify(metrics));
  assert.ok(metrics.footerTop >= metrics.top && metrics.footerBottom <= metrics.bottom + 1, JSON.stringify(metrics));
  assert.ok(metrics.scrollSpace >= 44, `At least one field touch target remains visible: ${JSON.stringify(metrics)}`);
  assert.equal(await f.page.locator('#publish-retry-confirm').isVisible(), true);
});

for (const width of [320, 390, 1280]) {
  test(`modal actions remain inside ${width}px viewport and above the mobile navigation`, async t => {
    const f = await setup(t, { width });
    for (const tipo of ['busco', 'jam', 'vende', 'clases']) {
      await f.open(tipo);
      for (const height of [844, 420]) {
        await f.page.setViewportSize({ width, height });
        await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await f.page.evaluate(() => {
          const btn = document.querySelector('.btn-submit');
          const rect = btn.getBoundingClientRect();
          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const scroller = document.getElementById('publish-scroll');
          const start = scroller.scrollTop;
          scroller.scrollTop = scroller.scrollHeight;
          return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
            touchHeight: rect.height, reachable: top === btn || btn.contains(top),
            scrollClient: scroller.clientHeight, scrollHeight: scroller.scrollHeight,
            scrollReached: scroller.scrollTop, start,
            viewportWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth };
        });
        assert.ok(metrics.x >= -1 && metrics.right <= width + 1, `${tipo} footer fits width`);
        assert.ok(metrics.y >= 0 && metrics.bottom <= height + 1, `${tipo} footer fits height ${height}: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.reachable, `${tipo} submit is not covered by bottom navigation`);
        assert.ok(metrics.touchHeight >= 44, `${tipo} submit meets 44px touch target`);
        assert.ok(metrics.scrollClient > 0, `${tipo} has visible scrolling space`);
        assert.ok(metrics.scrollHeight <= metrics.scrollClient + 1 || metrics.scrollReached > 0, `${tipo} long form scrolls`);
        assert.ok(metrics.documentWidth <= metrics.viewportWidth + 1, 'No horizontal page overflow');
      }
    }
    if (process.env.BUSCARTE_QA_OUTPUT && width === 390) {
      const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
      fs.mkdirSync(output, { recursive: true });
      await f.page.setViewportSize({ width, height: 844 });
      await fill(f, 'jam');
      await choosePhoto(f.page, 'jam', 1, 'flyer-qa.png', await syntheticFlyer(f.page));
      await f.page.waitForFunction(() => document.getElementById('foto-jam-text').textContent.includes('Flyer listo'));
      await f.page.locator('#publish-scroll').evaluate(el => { el.scrollTop = 0; });
      await f.page.screenshot({ path: path.join(output, 'anuncios-mobile-form.png') });
      await f.page.locator('#publish-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await f.page.screenshot({ path: path.join(output, 'anuncios-mobile-photo.png') });
      await f.submit();
      await f.state('success');
      await f.page.screenshot({ path: path.join(output, 'anuncios-mobile-success.png') });
    }
    if (process.env.BUSCARTE_QA_OUTPUT && width === 320) {
      const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
      fs.mkdirSync(output, { recursive: true });
      await f.page.setViewportSize({ width, height: 420 });
      await fill(f, 'jam');
      await choosePhoto(f.page, 'jam', 1, 'flyer-qa.png', await syntheticFlyer(f.page));
      await f.page.waitForFunction(() => document.getElementById('foto-jam-text').textContent.includes('Flyer listo'));
      await f.page.locator('#publish-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await f.page.screenshot({ path: path.join(output, 'anuncios-mobile-320x420.png') });
    }
  });
}
