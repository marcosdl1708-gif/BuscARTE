const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const editorFile = 'buscARTE_perfil.html';
const publicFile = 'buscARTE_perfil_publico.html';
const searchFile = 'buscARTE_busqueda.html';
const baseline = process.env.BUSCARTE_GUARDADO_BASELINE === '1';
const siteFiles = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const sources = Object.fromEntries([editorFile, publicFile, searchFile].map(file => [file,
  baseline ? execFileSync('git', ['show', '60424d5:' + file], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8')]));
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function member(extra = {}) {
  return { ba_logged: '1', ba_user_id: '210', ba_name: 'Persona Danza', ba_tipo_cuenta: 'artista', ba_rubro: 'danza', ...extra };
}

function profile(extra = {}) {
  return { id: 210, nombre: 'Persona Danza', tipo_cuenta: 'artista', rubro: 'danza', bio: 'Perfil sintético de prueba.',
    campos_especificos: JSON.stringify({ rol: ['Bailarín/a'], disciplina: ['Tango'], nivel: ['Profesional'] }),
    generos: 'Contemporáneo', instrumento: '', experiencia: 4, provincia: 'CABA', ciudad: 'Buenos Aires (CABA)',
    barrio: 'Almagro', disponibilidad: 'Doy clases', baneado: false, created_at: '2026-09-05T10:00:00Z', ...extra };
}

function fields(value) { return typeof value === 'string' ? JSON.parse(value) : value; }

async function setup(t, options = {}) {
  const width = options.width || 390;
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width <= 900, hasTouch: width <= 900, serviceWorkers: 'block' });
  await context.addInitScript(storage => {
    if (!localStorage.getItem('__fixture_initialized')) {
      localStorage.setItem('__fixture_initialized', '1');
      localStorage.setItem('buscarte_meta_consent_v1', 'denied');
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    }
    window.__fixtureAlerts = [];
    window.alert = message => window.__fixtureAlerts.push(String(message));
    window.confirm = () => true;
    window.__fixtureStorage = updates => {
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      }
      window.dispatchEvent(new StorageEvent('storage', { key: 'ba_user_id' }));
    };
  }, options.storage || member());
  const calls = { reads: [], patches: [], unexpected: [], errors: [], consoleErrors: [] };
  const state = { profile: profile(options.profile), readStatus: options.readStatus || 200, readRows: options.readRows,
    patchStatus: options.patchStatus || 200, patchRows: options.patchRows, patchAbort: options.patchAbort || false };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const relative = url.pathname.slice(1);
    if (url.origin === origin && method === 'GET' && siteFiles.has(relative)) {
      if (relative.endsWith('.html') && !sources[relative]) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destino aislado</title><p>Destino simulado</p>' });
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(relative)] || 'text/plain';
      return route.fulfill({ contentType, body: sources[relative] || fs.readFileSync(path.join(root, relative)) });
    }
    if (url.hostname === 'fonts.googleapis.com' && method === 'GET') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'fixtures.invalid' && url.pathname === '/portrait.svg' && method === 'GET') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#264c60"/><circle cx="120" cy="90" r="40" fill="#65ccea"/><path d="M40 230a80 90 0 0 1 160 0" fill="#65ccea"/></svg>' });
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (method === 'GET') {
        calls.reads.push({ path: url.pathname, query: url.search });
        if (url.pathname === '/rest/v1/perfiles') {
          const select = url.searchParams.get('select');
          if (select === 'email') return route.fulfill({ contentType: 'application/json', body: '[{"email":"prueba@example.invalid"}]' });
          if (select === 'referentes,generos') return route.fulfill({ contentType: 'application/json', body: '[]' });
          if (options.readGate) await options.readGate.promise;
          const rows = state.readRows === undefined ? [state.profile] : state.readRows;
          return route.fulfill({ status: state.readStatus, contentType: 'application/json', body: JSON.stringify(rows) });
        }
        if (['/rest/v1/mensajes', '/rest/v1/perfiles_guardados', '/rest/v1/artistas_sugeridos'].includes(url.pathname)) return route.fulfill({ contentType: 'application/json', body: '[]' });
      }
      if (method === 'PATCH' && url.pathname === '/rest/v1/perfiles') {
        const patch = { query: url.search, headers: request.headers(), body: request.postDataJSON() };
        calls.patches.push(patch);
        if (options.patchGate) await options.patchGate.promise;
        if (state.patchAbort) return route.abort('failed');
        if (state.patchStatus < 300 && state.patchRows === undefined) state.profile = { ...state.profile, ...patch.body };
        const rows = state.patchRows === undefined ? [{ id: state.profile.id, campos_especificos: state.profile.campos_especificos }] : state.patchRows;
        return route.fulfill({ status: state.patchStatus, contentType: 'application/json', body: state.patchStatus === 204 ? '' : JSON.stringify(rows) });
      }
    }
    if (url.origin === origin && url.pathname === '/favicon.ico' && method === 'GET') return route.fulfill({ status: 204, body: '' });
    // Fail closed: no continue/fallback/fetch; Auth, RPC, uploads, mail, tracking,
    // writes outside the explicit synthetic PATCH and all unknown traffic are blocked.
    calls.unexpected.push(method + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') calls.consoleErrors.push(message.text()); });
  t.after(async () => {
    options.readGate?.resolve(); options.patchGate?.resolve();
    try {
      assert.deepEqual(calls.unexpected, [], 'No real network, Auth, RPC, email, upload or unspecified write is permitted');
      assert.deepEqual(calls.errors, [], 'No uncaught browser errors');
      if (!options.allowErrors) assert.deepEqual(calls.consoleErrors, [], 'Normal scenarios have no console errors');
    } finally { await context.close(); }
  });
  await page.goto(origin + '/' + (options.file || editorFile) + (options.query || ''), { waitUntil: 'load' });
  return { page, context, calls, state };
}

async function ready(f) {
  await f.page.waitForFunction(() => typeof isLoadingProfile !== 'undefined' && !isLoadingProfile);
  assert.equal(await f.page.locator('#reg-nombre-perfil').inputValue(), f.state.profile.nombre);
}

function chip(page, section, label) { return page.locator('#' + section).getByRole('button', { name: label, exact: true }); }
async function selected(page, section) { return page.locator('#' + section + ' .chip.selected').allTextContents(); }
async function changeDance(f, name = 'Ballet') {
  await chip(f.page, 'chips-disc-dan', 'Tango').click();
  if (name) await chip(f.page, 'chips-disc-dan', name).click();
}
async function save(f) {
  try { await f.page.locator('#save-bar .btn-neon').click(); }
  catch (error) {
    await capture(f.page, `danza-save-interaction-${f.page.viewportSize().width}.png`);
    error.message += '\nSave layout: ' + JSON.stringify(await f.page.locator('#save-bar .btn-neon').evaluate(el => {
      const r = el.getBoundingClientRect(), bar = el.closest('#save-bar'), style = getComputedStyle(bar);
      return { rect: r.toJSON(), viewport: { width: innerWidth, height: innerHeight }, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 220), bar: { zIndex: style.zIndex, bottom: style.bottom, transform: style.transform, width: style.width, pointerEvents: style.pointerEvents }, overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > visualViewport.width + 2 && el.getBoundingClientRect().width > 0).slice(0, 25).map(el => ({ element: el.tagName + '#' + el.id + '.' + el.className, rect: { x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width }, minWidth: getComputedStyle(el).minWidth })) };
    }));
    throw new Error(error.message, { cause: error });
  }
}
async function saved(f) {
  await f.page.waitForFunction(() => document.querySelector('#profile-status')?.textContent.includes('Perfil guardado correctamente'));
}
async function errored(f) {
  await f.page.waitForFunction(() => document.querySelector('#profile-status')?.classList.contains('error'));
  assert.doesNotMatch(await f.page.locator('#profile-status').innerText(), /guardado correctamente/i);
}
async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  const dist = path.join(root, 'dist');
  assert.ok(output !== dist && !output.startsWith(dist + path.sep), 'Private captures stay outside dist');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

if (baseline) {
  test('baseline: clearing every dance field omits the JSON column and Tango returns after reload', async t => {
    const f = await setup(t); await ready(f);
    await f.page.locator('#mi-rubro-contenido .chip.selected').evaluateAll(chips => chips.forEach(chip => chip.click()));
    await save(f); await saved(f);
    assert.equal(Object.hasOwn(f.calls.patches[0].body, 'campos_especificos'), false);
    await f.page.reload(); await ready(f);
    assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Tango']);
  });
  test('baseline: a zero-row PATCH is falsely presented as saved', async t => {
    const f = await setup(t, { patchRows: [] }); await ready(f); await changeDance(f); await save(f); await saved(f);
    assert.deepEqual(fields(f.state.profile.campos_especificos).disciplina, ['Tango']);
  });
  test('baseline: dance hero shows stale musical generos instead of canonical discipline', async t => {
    const f = await setup(t, { file: publicFile, query: '?id=210' });
    await f.page.waitForFunction(() => document.body.dataset.profileState === 'own');
    assert.match(await f.page.locator('#perfil-tags').innerText(), /Contemporáneo/i);
    assert.doesNotMatch(await f.page.locator('#perfil-tags').innerText(), /Tango/i);
    await capture(f.page, 'danza-before-390.png');
  });
} else {
  for (const width of [320, 390, 1280]) {
    test(`dance Tango → Ballet persists across editor reload at ${width}px`, async t => {
      const f = await setup(t, { width, profile: { foto_url: 'https://fixtures.invalid/portrait.svg' } }); await ready(f);
      assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Tango']);
      await changeDance(f); await save(f); await saved(f);
      const patch = f.calls.patches[0];
      assert.deepEqual(fields(patch.body.campos_especificos).disciplina, ['Ballet']);
      const query = new URL(origin + patch.query).searchParams;
      assert.equal(query.get('id'), 'eq.210');
      assert.equal(query.get('select'), 'id,campos_especificos');
      assert.match(patch.headers.prefer, /return=representation/);
      const button = await f.page.locator('#save-bar .btn-neon').boundingBox();
      assert.ok(button.width >= 44 && button.height >= 44, 'Save has a mobile-sized target');
      assert.ok(button.x >= 0 && button.x + button.width <= width + 1, 'Save stays inside the viewport');
      assert.ok(await f.page.evaluate(width => document.documentElement.scrollWidth <= width, width), 'No horizontal overflow or expanded mobile layout viewport');
      await capture(f.page, `danza-guardado-${width}.png`);
      await f.page.reload(); await ready(f);
      assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Ballet']);
      assert.equal(f.calls.patches.length, 1);
    });
  }
  test('new discipline reaches real public hero/section and real search card, not stale generos', async t => {
    const f = await setup(t); await ready(f); await changeDance(f); await save(f); await saved(f);
    await f.page.goto(origin + '/' + publicFile + '?id=210');
    await f.page.waitForFunction(() => document.body.dataset.profileState === 'own');
    assert.match(await f.page.locator('#perfil-tags').innerText(), /Ballet/i);
    assert.doesNotMatch(await f.page.locator('#perfil-tags').innerText(), /Contemporáneo|Tango/i);
    assert.match(await f.page.locator('#stat-genero').innerText(), /Ballet/i);
    assert.match(await f.page.locator('#perfil-generos').innerText(), /Ballet/i);
    await capture(f.page, 'danza-publico-390.png');
    await f.page.goto(origin + '/' + searchFile + '?rubro=danza');
    await f.page.locator('.musician-card[data-id="210"]').waitFor();
    assert.match(await f.page.locator('.musician-card[data-id="210"] .card-tags').innerText(), /Ballet/i);
    assert.doesNotMatch(await f.page.locator('.musician-card[data-id="210"]').innerText(), /Tango|Contemporáneo/i);
    await f.page.locator('.musician-card[data-id="210"]').scrollIntoViewIfNeeded();
    await capture(f.page, 'danza-busqueda-390.png');
  });
  test('public/search readers preserve scalar and legacy dance data, canonical empty wins, stale generos never leaks', async t => {
    for (const variant of [
      { disciplina: ['Tango'] }, { disciplina: 'Tango' }, { 'chips-disc-dan': ['Tango'] },
      { 'chips-disciplina-danza': 'Tango' }, { disciplina: [], 'chips-disc-dan': ['Tango'] },
      { disciplina: null, 'chips-disciplina-danza': ['Tango'] }
    ]) {
      const empty = Object.hasOwn(variant, 'disciplina') && (variant.disciplina === null || variant.disciplina.length === 0);
      const f = await setup(t, { file: publicFile, query: '?id=210', profile: { campos_especificos: JSON.stringify({ rol: ['Bailarín/a'], ...variant }) } });
      await f.page.waitForFunction(() => document.body.dataset.profileState === 'own');
      const tags = await f.page.locator('#perfil-tags').innerText();
      if (empty) assert.doesNotMatch(tags, /Tango/i); else assert.match(tags, /Tango/i);
      assert.doesNotMatch(tags, /Contemporáneo/i);
      await f.page.goto(origin + '/' + searchFile + '?rubro=danza');
      await f.page.locator('.musician-card[data-id="210"]').waitFor();
      const card = await f.page.locator('.musician-card[data-id="210"]').innerText();
      if (empty) assert.doesNotMatch(card, /Tango/i); else assert.match(card, /Tango/i);
      assert.doesNotMatch(card, /Contemporáneo/i);
    }
  });
  test('clearing only discipline persists without losing role or experience', async t => {
    const f = await setup(t); await ready(f); await changeDance(f, null); await save(f); await saved(f);
    const data = fields(f.calls.patches[0].body.campos_especificos);
    assert.ok(!data.disciplina || data.disciplina.length === 0);
    assert.deepEqual(data.rol, ['Bailarín/a']); assert.deepEqual(data.nivel, ['Profesional']);
    await f.page.reload(); await ready(f); assert.deepEqual(await selected(f.page, 'chips-disc-dan'), []);
  });
  test('clearing every specific field sends an explicit empty JSON and never resurrects old chips', async t => {
    const f = await setup(t); await ready(f);
    await f.page.locator('#mi-rubro-contenido .chip.selected').evaluateAll(chips => chips.forEach(chip => chip.click()));
    await save(f); await saved(f);
    assert.equal(Object.hasOwn(f.calls.patches[0].body, 'campos_especificos'), true);
    assert.deepEqual(fields(f.calls.patches[0].body.campos_especificos), {});
    await f.page.reload(); await ready(f);
    assert.equal(await f.page.locator('#mi-rubro-contenido .chip.selected').count(), 0);
  });
  for (const asString of [true, false]) {
    test(`canonical data ${asString ? 'JSON text' : 'object'} preserves unknown keys while updating owned fields`, async t => {
      const data = { rol: ['Bailarín/a'], disciplina: ['Tango'], nivel: ['Profesional'], future_setting: { visible: true }, otra_rama: ['Conservar'] };
      const f = await setup(t, { profile: { campos_especificos: asString ? JSON.stringify(data) : data } }); await ready(f);
      await changeDance(f); await save(f); await saved(f);
      const result = fields(f.calls.patches[0].body.campos_especificos);
      assert.deepEqual(result.future_setting, data.future_setting); assert.deepEqual(result.otra_rama, data.otra_rama);
      assert.deepEqual(result.disciplina, ['Ballet']);
    });
  }
  test('legacy section IDs are loaded then canonicalized without leaving a stale dance alias', async t => {
    const f = await setup(t, { profile: { campos_especificos: JSON.stringify({ 'chips-rol-dan': ['Bailarín/a'], 'chips-disc-dan': ['Tango'], 'chips-nivel-dan': ['Profesional'], unrelated: 'conservar' }) } }); await ready(f);
    assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Tango']);
    await changeDance(f); await save(f); await saved(f);
    const result = fields(f.calls.patches[0].body.campos_especificos);
    assert.deepEqual(result.disciplina, ['Ballet']); assert.equal(result.unrelated, 'conservar');
    for (const key of ['chips-rol-dan', 'chips-disc-dan', 'chips-nivel-dan']) assert.equal(Object.hasOwn(result, key), false);
  });
  test('canonical empty discipline wins over a contradictory legacy Tango alias', async t => {
    const f = await setup(t, { profile: { campos_especificos: JSON.stringify({ rol: ['Bailarín/a'], disciplina: [], 'chips-disc-dan': ['Tango'] }) } }); await ready(f);
    assert.deepEqual(await selected(f.page, 'chips-disc-dan'), []);
    await chip(f.page, 'chips-disc-dan', 'Ballet').click(); await save(f); await saved(f);
    assert.equal(Object.hasOwn(fields(f.calls.patches[0].body.campos_especificos), 'chips-disc-dan'), false);
  });
  test('unknown saved dance choices stay visible and removable without executing their text', async t => {
    const unusual = 'Danza experimental <img src=x onerror=alert(1)>';
    const f = await setup(t, { profile: { campos_especificos: JSON.stringify({ disciplina: ['Tango', unusual], future: { keep: true } }) } }); await ready(f);
    assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Tango', unusual]);
    assert.equal(await f.page.locator('#chips-disc-dan img').count(), 0);
    await chip(f.page, 'chips-disc-dan', unusual).click(); await save(f); await saved(f);
    assert.deepEqual(fields(f.calls.patches[0].body.campos_especificos), { disciplina: ['Tango'], future: { keep: true } });
    assert.deepEqual(await f.page.evaluate(() => window.__fixtureAlerts), []);
  });
  for (const scenario of [
    { label: 'HTTP 403', patchStatus: 403, patchRows: { message: 'Synthetic forbidden' } },
    { label: 'zero rows', patchRows: [] },
    { label: 'unexpected ID', patchRows: [{ id: 999, campos_especificos: '{}' }] },
    { label: 'stale returned fields', patchRows: [{ id: 210, campos_especificos: '{"disciplina":["Tango"]}' }] },
    { label: 'empty 204', patchStatus: 204, patchRows: [] },
    { label: 'network failure', patchAbort: true }
  ]) {
    test(`PATCH ${scenario.label} never reports success and preserves the unsaved selection`, async t => {
      const f = await setup(t, { ...scenario, allowErrors: true }); await ready(f); await changeDance(f); await save(f); await errored(f);
      assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Ballet']);
      assert.equal(await f.page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), true);
      assert.equal(await f.page.locator('#save-bar .btn-neon').isDisabled(), false);
      assert.deepEqual(fields(f.state.profile.campos_especificos).disciplina, ['Tango']);
    });
  }
  test('failed PATCH can be retried once without reloading or losing selections', async t => {
    const f = await setup(t, { patchStatus: 503, patchRows: [], allowErrors: true }); await ready(f); await changeDance(f); await save(f); await errored(f);
    f.state.patchStatus = 200; f.state.patchRows = undefined;
    await save(f); await saved(f); assert.equal(f.calls.patches.length, 2);
    assert.deepEqual(fields(f.state.profile.campos_especificos).disciplina, ['Ballet']);
  });
  test('repeated calls while PATCH is pending send exactly one update', async t => {
    const gate = deferred(); const f = await setup(t, { patchGate: gate }); await ready(f); await changeDance(f);
    await f.page.evaluate(() => { window.__saveOne = saveProfile(); window.__saveTwo = saveProfile(); });
    await f.page.waitForFunction(() => document.querySelector('#save-bar .btn-neon').disabled);
    await f.page.waitForTimeout(100); assert.equal(f.calls.patches.length, 1);
    gate.resolve(); await saved(f); assert.equal(f.calls.patches.length, 1);
  });
  test('an edit made during PATCH remains dirty after the earlier response and can be saved separately', async t => {
    const gate = deferred(); const f = await setup(t, { patchGate: gate }); await ready(f); await changeDance(f); await save(f);
    await f.page.waitForFunction(() => document.querySelector('#save-bar .btn-neon').disabled);
    await chip(f.page, 'chips-disc-dan', 'Flamenco').click(); gate.resolve();
    await f.page.waitForTimeout(1600);
    assert.equal(await f.page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), true);
    assert.deepEqual(fields(f.state.profile.campos_especificos).disciplina, ['Ballet']);
    await save(f); await saved(f);
    assert.deepEqual(fields(f.state.profile.campos_especificos).disciplina, ['Ballet', 'Flamenco']);
    assert.equal(f.calls.patches.length, 2);
  });
  test('an edit after a successful response is not hidden by the old success timer', async t => {
    const f = await setup(t); await ready(f); await changeDance(f); await save(f); await saved(f);
    await chip(f.page, 'chips-disc-dan', 'Flamenco').click();
    await f.page.waitForTimeout(1600);
    assert.equal(await f.page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), true);
    assert.equal(await f.page.locator('#save-bar .btn-neon').isDisabled(), false);
  });
  test('save during loading cannot write defaults over the real profile', async t => {
    const gate = deferred(); const f = await setup(t, { readGate: gate });
    await f.page.evaluate(() => saveProfile()); assert.equal(f.calls.patches.length, 0);
    gate.resolve(); await ready(f); assert.deepEqual(await selected(f.page, 'chips-disc-dan'), ['Tango']);
  });
  for (const scenario of [
    { label: 'failed load', readStatus: 503, readRows: { message: 'Synthetic unavailable' } },
    { label: 'missing row', readRows: [] },
    { label: 'malformed specific data', profile: { campos_especificos: '{invalid-json' } }
  ]) {
    test(`${scenario.label} does not allow a destructive save`, async t => {
      const f = await setup(t, { ...scenario, allowErrors: true });
      await f.page.waitForFunction(() => !isLoadingProfile);
      await f.page.evaluate(() => { document.querySelector('#reg-nombre-perfil').value = 'No sobrescribir'; showSaveBar(); return saveProfile(); });
      assert.equal(f.calls.patches.length, 0); await errored(f);
    });
  }
  test('an unknown cached rubro cannot overwrite the real dance profile with fallback music defaults', async t => {
    const f = await setup(t, { storage: member({ ba_rubro: 'rubro-desconocido' }), profile: { rubro: 'danza' } });
    const original = structuredClone(f.state.profile);
    await f.page.waitForFunction(() => !isLoadingProfile);
    await f.page.evaluate(() => {
      document.querySelector('#reg-nombre-perfil').value = 'No sobrescribir';
      showSaveBar();
      return saveProfile();
    });
    assert.equal(f.calls.patches.length, 0);
    assert.deepEqual(f.state.profile, original);
    await errored(f);
  });
  test('changing account after load never PATCHes old fields into the new ID', async t => {
    const f = await setup(t); await ready(f); await changeDance(f);
    await f.page.evaluate(() => window.__fixtureStorage({ ba_user_id: '320', ba_name: 'Otra Persona' }));
    if (f.page.url().includes(editorFile)) await f.page.evaluate(() => saveProfile());
    assert.equal(f.calls.patches.length, 0);
  });
  test('changing account during PATCH cannot overwrite the new account local cache on response', async t => {
    const gate = deferred(); const f = await setup(t, { patchGate: gate }); await ready(f); await changeDance(f); await save(f);
    await f.page.waitForFunction(() => document.querySelector('#save-bar .btn-neon').disabled);
    await f.page.evaluate(() => window.__fixtureStorage({ ba_user_id: '320', ba_name: 'Otra Persona' }));
    gate.resolve(); await f.page.waitForTimeout(250);
    assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_name')), 'Otra Persona');
    assert.equal(f.calls.patches.length, 1); assert.match(f.calls.patches[0].query, /id=eq\.210/);
  });
  test('music retains musical fields, opaque specific data and Rock in the public hero', async t => {
    const opaque = JSON.stringify({ future_music_field: ['Conservar'] });
    const f = await setup(t, { storage: member({ ba_rubro: 'musica' }), profile: { rubro: 'musica', instrumento: 'Guitarra', generos: 'Rock', referentes: 'Referencia', campos_especificos: opaque } }); await ready(f);
    await chip(f.page, 'chips-inst', 'Bajo').click(); await save(f); await saved(f);
    assert.equal(f.calls.patches[0].body.instrumento, 'Guitarra, Bajo'); assert.equal(f.calls.patches[0].body.generos, 'Rock');
    assert.equal(f.state.profile.campos_especificos, opaque);
    await f.page.goto(origin + '/' + publicFile + '?id=210');
    await f.page.waitForFunction(() => document.body.dataset.profileState === 'own');
    assert.match(await f.page.locator('#perfil-tags').innerText(), /Rock/i);
  });
  test('another artistic rubro preserves its canonical mapping and can explicitly clear its textarea', async t => {
    const f = await setup(t, { storage: member({ ba_rubro: 'tatuaje' }), profile: { rubro: 'tatuaje', campos_especificos: JSON.stringify({ rol: ['Tatuador'], estilo: ['Realismo'], color: ['Color'], promo: 'Promo anterior', unknown: 'Conservar' }) } }); await ready(f);
    await chip(f.page, 'chips-estilo-tatu', 'Realismo').click(); await chip(f.page, 'chips-estilo-tatu', 'Blackwork').click();
    await f.page.locator('#promo-field').fill(''); await save(f); await saved(f);
    const result = fields(f.calls.patches[0].body.campos_especificos);
    assert.deepEqual(result.estilo, ['Blackwork']); assert.equal(result.unknown, 'Conservar'); assert.ok(!result.promo);
    await f.page.reload(); await ready(f); assert.deepEqual(await selected(f.page, 'chips-estilo-tatu'), ['Blackwork']);
    assert.equal(await f.page.locator('#promo-field').inputValue(), '');
  });
}
