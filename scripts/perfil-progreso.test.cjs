const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'buscARTE_perfil.html'), 'utf8');
const siteFiles = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const origin = 'https://buscarte.test';
const apiHost = 'xiaanchoanxmampegoay.supabase.co';
const portrait = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kZUAAAAASUVORK5CYII=', 'base64');
const unitContext = vm.createContext({ URL });
vm.runInContext(source.slice(source.indexOf('  function parseCamposPerfil('), source.indexOf('  function comparableCampos(')) +
  source.slice(source.indexOf('  const SECTION_KEYS ='), source.indexOf('  function initPerfil(')) +
  source.slice(source.indexOf('  function basicosPerfil('), source.indexOf('  function actualizarCompletitud(')), unitContext);
function basics(p = {}, rubro = 'danza') {
  unitContext.fixture = p; unitContext.fixtureRubro = rubro;
  return JSON.parse(vm.runInContext('JSON.stringify(basicosPerfil(fixture, fixtureRubro))', unitContext));
}
function complete(p, rubro = 'danza') { return basics(p, rubro).filter(item => item.done).map(item => item.key); }
const blankProfile = extra => ({ id:210, nombre:'Persona sintética', tipo_cuenta:'artista', rubro:'danza',
  campos_especificos:'{}', foto_url:null, bio:'', provincia:null, ciudad:null, ...extra });
const member = extra => ({ ba_logged:'1', ba_user_id:'210', ba_name:'Persona sintética', ba_tipo_cuenta:'artista', ba_rubro:'danza', ...extra });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }

test('basic score rejects empty JSON, whitespace, nulls, arrays and opaque metadata', () => {
  for (const campos of [null, '', '{}', {}, [], '[]', '{invalid', { promo:'Texto', future:['Conservar'] }, { disciplina:[] }, { disciplina:[null] }, { disciplina:[' '] }, { disciplina:null }]) {
    assert.deepEqual(complete({ nombre:' ', bio:'\n', foto_url:' ', provincia:' ', ciudad:' ', campos_especificos:campos }), []);
  }
});
test('canonical empty or null values override legacy populated values', () => {
  for (const value of [[], null, '', [' ']]) assert.equal(complete({ campos_especificos:{ disciplina:value, 'chips-disc-dan':['Tango'], 'chips-disciplina-danza':['Ballet'] } }).includes('disciplina'), false);
  for (const campos of [{ disciplina:'Tango' }, { disciplina:['Ballet'] }, { 'chips-disc-dan':['Tango'] }, { 'chips-disciplina-danza':'Tango' }]) {
    assert.deepEqual(complete({ campos_especificos:JSON.stringify(campos) }), ['disciplina']);
  }
});
test('five basics do not require optional portfolio, age, experience, networks or genre', () => {
  assert.deepEqual(complete({ nombre:'Persona', foto_url:'https://fixtures.invalid/portrait.png', bio:'Presentación', provincia:'CABA', ciudad:'Buenos Aires', campos_especificos:{ disciplina:['Ballet'] } }), ['nombre','foto','bio','ubicacion','disciplina']);
  assert.deepEqual(complete({ provincia:'CABA' }), []);
  assert.deepEqual(complete({ foto_url:'data:image/png;base64,anything' }), []);
  assert.deepEqual(complete({ foto_url:'blob:https://buscarte.test/anything' }), []);
});
test('all current rubros use a real primary detail and preserve canonical/legacy mapping', () => {
  for (const [rubro, key] of Object.entries({ actuacion:'rol', audiovisual:'rol', modelaje:'tipo_trabajo', diseno:'rol', tatuaje:'rol', danza:'disciplina', maquillaje:'rol', circo:'especialidad', escritura:'rol' })) {
    assert.deepEqual(complete({ campos_especificos:{ [key]:['Detalle'] } }, rubro), ['disciplina']);
  }
  assert.deepEqual(complete({ instrumento:'Voz' }, 'musica'), ['disciplina']);
  assert.deepEqual(complete({ instrumento:' ', generos:'Rock', referentes:'Referencia' }, 'musica'), []);
  assert.deepEqual(complete({ campos_especificos:{ rol:['Bailarín/a'], nivel:['Profesional'] } }), []);
});
test('serialized empty choices never count as instruments or discipline, real legacy choices do', () => {
  for (const value of ['{}', '[]', 'null', 'undefined', '[""]', '[" "]', '[null]', '"[]"', '""', ' , , ']) {
    assert.deepEqual(complete({ instrumento:value }, 'musica'), [], value);
    assert.deepEqual(complete({ campos_especificos:{ disciplina:value, 'chips-disc-dan':['Tango'] } }), [], value);
  }
  for (const value of ['Piano', 'Piano, Voz', '["Piano"]', '"Piano"', ['Piano']]) assert.deepEqual(complete({ instrumento:value }, 'musica'), ['disciplina']);
  for (const value of ['Ballet, Tango', '["Ballet"]', ['Tango']]) assert.deepEqual(complete({ campos_especificos:{ disciplina:value } }), ['disciplina']);
});

let browser;
before(async () => { browser = await chromium.launch({ headless:true, channel:process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });
async function setup(t, options = {}) {
  const width = options.width || 390;
  const context = await browser.newContext({ viewport:{ width, height:844 }, isMobile:width < 900, hasTouch:width < 900, serviceWorkers:'block' });
  await context.addInitScript(storage => {
    if (!localStorage.getItem('__fixture_initialized')) {
      localStorage.setItem('__fixture_initialized', '1');
      localStorage.setItem('buscarte_meta_consent_v1', 'denied');
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    }
    window.alert = () => {}; window.confirm = () => true;
  }, options.storage || member());
  const state = { profile:blankProfile(options.profile) };
  const calls = { patches:[], uploads:[], unexpected:[], errors:[] };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), relative = url.pathname.slice(1);
    if (url.origin === origin && method === 'GET' && siteFiles.has(relative)) {
      if (relative.endsWith('.html') && relative !== 'buscARTE_perfil.html') return route.fulfill({ contentType:'text/html', body:'<!doctype html><p>Destino simulado</p>' });
      const contentType = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png' }[path.extname(relative)] || 'text/plain';
      return route.fulfill({ contentType, body:relative === 'buscARTE_perfil.html' ? source : fs.readFileSync(path.join(root, relative)) });
    }
    if (url.hostname === 'fonts.googleapis.com' && method === 'GET') return route.fulfill({ contentType:'text/css', body:'' });
    if (url.hostname === 'fixtures.invalid' && url.pathname === '/portrait.png' && method === 'GET') return route.fulfill({ contentType:'image/png', body:portrait });
    if (url.hostname === apiHost) {
      if (url.pathname === '/rest/v1/perfiles' && method === 'GET' && url.searchParams.get('id') === 'eq.210') {
        if (url.searchParams.get('select') === 'email') return route.fulfill({ contentType:'application/json', body:'[{"email":"fixture@example.invalid"}]' });
        if (url.searchParams.get('select') === '*') {
          if (options.readGate) await options.readGate.promise;
          return route.fulfill({ status:options.readStatus || 200, contentType:'application/json', body:JSON.stringify(options.readRows === undefined ? [state.profile] : options.readRows) });
        }
      }
      if (url.pathname === '/rest/v1/mensajes' && method === 'GET') return route.fulfill({ contentType:'application/json', body:'[]' });
      if (url.pathname === '/rest/v1/perfiles' && method === 'PATCH' && url.searchParams.get('id') === 'eq.210') {
        const patch = { query:url.search, headers:request.headers(), body:request.postDataJSON() };
        calls.patches.push(patch);
        if (options.patchGate) await options.patchGate.promise;
        if (patch.body.foto_url && options.photoPatchGate) await options.photoPatchGate.promise;
        if (!patch.body.foto_url && options.profilePatchGate) await options.profilePatchGate.promise;
        const status = options.patchStatus || 200;
        if (status === 200 && options.patchRows === undefined) state.profile = { ...state.profile, ...patch.body };
        const rows = options.patchRows === undefined ? [{ id:210, foto_url:state.profile.foto_url, campos_especificos:state.profile.campos_especificos }] : options.patchRows;
        return route.fulfill({ status, contentType:'application/json', body:status === 204 ? '' : JSON.stringify(rows) });
      }
      if (url.pathname.startsWith('/storage/v1/object/fotos-perfil/210-') && method === 'POST') {
        calls.uploads.push({ path:url.pathname, headers:request.headers() });
        if (options.uploadGate) await options.uploadGate.promise;
        return route.fulfill({ status:options.uploadStatus || 200, contentType:'application/json', body:'{}' });
      }
      if (url.pathname.startsWith('/storage/v1/object/public/fotos-perfil/210-') && method === 'GET' && state.profile.foto_url === url.href) return route.fulfill({ contentType:'image/png', body:portrait });
    }
    if (url.origin === origin && url.pathname === '/favicon.ico' && method === 'GET') return route.fulfill({ status:204, body:'' });
    // Fail closed: all allowed requests are fulfilled locally. No real reads/writes,
    // Auth, RPC, mail, tracking, storage or unspecified traffic can escape the harness.
    calls.unexpected.push(method + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => calls.errors.push(error.message));
  t.after(async () => {
    options.readGate?.resolve(); options.patchGate?.resolve(); options.uploadGate?.resolve();
    options.photoPatchGate?.resolve(); options.profilePatchGate?.resolve();
    try { assert.deepEqual(calls.unexpected, [], 'No real network or unspecified write'); assert.deepEqual(calls.errors, []); }
    finally { await context.close(); }
  });
  await page.goto(origin + '/buscARTE_perfil.html' + (options.hash || ''), { waitUntil:'load' });
  return { page, state, calls };
}
async function ready(f) { await f.page.waitForFunction(() => !isLoadingProfile); }
async function score(f, n) { await f.page.waitForFunction(expected => document.querySelector('#profile-progress-meter').getAttribute('aria-valuenow') === String(expected), n); }
async function upload(f) { await f.page.locator('#foto-input').setInputFiles({ name:'fixture.png', mimeType:'image/png', buffer:portrait }); }
async function photoDone(f) { await f.page.waitForFunction(() => !isUploadingPhoto && document.querySelector('#upload-icon').textContent !== '📸'); }
async function changeAccount(f, updates) {
  await f.page.evaluate(values => {
    for (const [key, value] of Object.entries(values)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
    dispatchEvent(new StorageEvent('storage', { key:'ba_user_id' }));
  }, updates);
}
async function capture(f, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT), dist = path.join(root, 'dist');
  assert.ok(output !== dist && !output.startsWith(dist + path.sep), 'Captures stay private outside dist');
  fs.mkdirSync(output, { recursive:true });
  await f.page.screenshot({ path:path.join(output, name), animations:'disabled' });
}

for (const width of [320, 390, 1280]) test(`five actionable basics are reachable without overflow at ${width}px`, async t => {
  const f = await setup(t, { width }); await ready(f); await score(f, 1);
  assert.equal(await f.page.locator('#profile-progress').isVisible(), true);
  assert.equal(await f.page.locator('#profile-progress-list li').count(), 5);
  assert.equal(await f.page.locator('#profile-progress-list a').count(), 4);
  assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture(f, `perfil-progreso-${width}.png`);
  for (const [key, target] of [['foto','foto-input'], ['bio','bio-text'], ['ubicacion','perfil-provincia'], ['disciplina','chips-disc-dan']]) {
    const action = f.page.locator(`[data-basic="${key}"] a`);
    const box = await action.boundingBox(); assert.ok(box.height >= 44);
    await action.click();
    const position = await f.page.locator('#' + target).evaluate(el => ({ focused:document.activeElement === el, top:el.getBoundingClientRect().top, navBottom:document.querySelector('nav').getBoundingClientRect().bottom }));
    assert.equal(position.focused, true); assert.ok(position.top >= position.navBottom, target + ' clears fixed nav');
  }
  assert.equal(f.calls.patches.length, 0); assert.equal(f.calls.uploads.length, 0);
});
test('progress stays hidden until an exact profile loads, and missing/failed loads never claim 0%', async t => {
  const gate = deferred(), f = await setup(t, { readGate:gate });
  assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
  assert.equal(await f.page.locator('.preview-complete').isVisible(), false);
  gate.resolve(); await ready(f); assert.equal(await f.page.locator('#profile-progress').isVisible(), true);
  for (const options of [{ readRows:[] }, { readStatus:503, readRows:{ error:'synthetic' } }, { readRows:[blankProfile({ id:999 })] }, { profile:{ campos_especificos:'{bad' } }]) {
    const invalid = await setup(t, options); await ready(invalid);
    assert.equal(await invalid.page.locator('#profile-progress').isVisible(), false);
  }
});
test('welcome #completar focuses the mobile checklist only once after a valid load', async t => {
  const gate = deferred(), f = await setup(t, { width:320, hash:'#completar', readGate:gate });
  assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
  gate.resolve(); await ready(f);
  await f.page.waitForFunction(() => document.activeElement?.id === 'profile-progress');
  const position = await f.page.locator('#profile-progress').evaluate(el => ({ top:el.getBoundingClientRect().top, bottom:document.querySelector('nav').getBoundingClientRect().bottom }));
  assert.ok(position.top >= position.bottom);
  await f.page.locator('[data-basic="bio"] a').click();
  await f.page.evaluate(() => { dispatchEvent(new Event('focus')); dispatchEvent(new Event('pageshow')); });
  assert.equal(await f.page.evaluate(() => document.activeElement?.id), 'bio-text');
  await f.page.locator('#bio-text').fill('Nueva presentación');
  await f.page.evaluate(() => saveProfile()); await score(f, 2);
  assert.equal(await f.page.evaluate(() => document.activeElement?.id), 'bio-text');
});
test('non-artist accounts, unsupported/mismatched rubros and changed accounts receive no artist prompts', async t => {
  for (const role of ['negocio','visitante']) {
    const f = await setup(t, { storage:member({ ba_tipo_cuenta:role }), profile:{ tipo_cuenta:role } }); await ready(f);
    assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
  }
  for (const options of [{ profile:{ tipo_cuenta:'visitante' } }, { profile:{ rubro:'tatuaje' } }, { storage:member({ ba_rubro:'unsupported' }) }]) {
    const f = await setup(t, options); await ready(f); assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
  }
  const f = await setup(t); await ready(f); await changeAccount(f, { ba_user_id:'320' });
  assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
});
test('draft edits do not increase progress, successful save updates it and reload retains it', async t => {
  const f = await setup(t); await ready(f); await score(f, 1);
  await f.page.locator('#bio-text').fill('Una presentación nueva');
  await f.page.locator('#chips-disc-dan').getByRole('button', { name:'Ballet', exact:true }).click();
  await score(f, 1);
  await f.page.locator('#save-bar .btn-neon').click(); await score(f, 3);
  await f.page.reload(); await ready(f); await score(f, 3);
  assert.equal(f.calls.patches.length, 1);
});
test('failed ordinary save retains confirmed progress despite new form values', async t => {
  const f = await setup(t, { patchRows:[] }); await ready(f);
  await f.page.locator('#bio-text').fill('Todavía no guardada'); await f.page.locator('#save-bar .btn-neon').click();
  await f.page.waitForFunction(() => document.querySelector('#profile-status').classList.contains('error'));
  await score(f, 1);
});
test('historical province, city and neighborhood are preserved by an unrelated save', async t => {
  const f = await setup(t, { profile:{ provincia:'Provincia histórica', ciudad:'Ciudad histórica <img>', barrio:'Barrio histórico' } }); await ready(f); await score(f, 2);
  assert.equal(await f.page.locator('#perfil-provincia').inputValue(), 'Provincia histórica');
  assert.equal(await f.page.locator('#perfil-ciudad').inputValue(), 'Ciudad histórica <img>');
  assert.equal(await f.page.locator('#perfil-barrio').inputValue(), 'Barrio histórico');
  assert.equal(await f.page.locator('#perfil-ciudad img').count(), 0);
  await f.page.locator('#bio-text').fill('Actualizada'); await f.page.locator('#save-bar .btn-neon').click(); await score(f, 3);
  assert.equal(f.calls.patches[0].body.provincia, 'Provincia histórica');
  assert.equal(f.calls.patches[0].body.ciudad, 'Ciudad histórica <img>');
  assert.equal(f.calls.patches[0].body.barrio, 'Barrio histórico');
});
test('historical city without province survives editing without pretending the location is complete', async t => {
  const f = await setup(t, { profile:{ ciudad:'Ciudad sin provincia', barrio:'Zona histórica' } }); await ready(f); await score(f, 1);
  assert.equal(await f.page.locator('#perfil-ciudad').inputValue(), 'Ciudad sin provincia');
  assert.equal(await f.page.locator('#perfil-provincia').inputValue(), '');
  await f.page.locator('#bio-text').fill('Actualizada'); await f.page.locator('#save-bar .btn-neon').click(); await score(f, 2);
  assert.equal(f.calls.patches[0].body.ciudad, 'Ciudad sin provincia');
  assert.equal(f.calls.patches[0].body.barrio, 'Zona histórica');
  assert.equal(f.calls.patches[0].body.provincia, null);
});
test('photo progress waits for confirmed matching row and URL, then persists after reload', async t => {
  const gate = deferred(), f = await setup(t, { patchGate:gate }); await ready(f);
  await upload(f); await f.page.waitForFunction(() => isUploadingPhoto);
  await score(f, 1); assert.equal(await f.page.locator('#preview-img').isVisible(), false);
  gate.resolve(); await photoDone(f); await score(f, 2);
  assert.equal(f.calls.uploads.length, 1); assert.equal(f.calls.patches.length, 1);
  assert.match(f.calls.patches[0].query, /select=id,foto_url/);
  assert.match(f.calls.patches[0].headers.prefer, /return=representation/);
  assert.equal(await f.page.locator('#preview-img').isVisible(), true);
  assert.equal(await f.page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), false, 'Photo auto-save does not invent dirty form changes');
  await f.page.reload(); await ready(f); await score(f, 2);
});
for (const scenario of [{ name:'zero rows', patchRows:[] }, { name:'wrong ID', patchRows:[{ id:999, foto_url:'https://fixtures.invalid/portrait.png' }] }, { name:'stale photo URL', patchRows:[{ id:210, foto_url:'https://fixtures.invalid/portrait.png' }] }, { name:'empty 204', patchStatus:204 }, { name:'storage failure', uploadStatus:503 }]) {
  test(`photo ${scenario.name} preserves the old confirmed photo/progress`, async t => {
    const f = await setup(t, { ...scenario, profile:{ foto_url:'https://fixtures.invalid/portrait.png' } }); await ready(f); await score(f, 2);
    await upload(f); await photoDone(f); await score(f, 2);
    assert.equal(await f.page.locator('#preview-img').getAttribute('src'), 'https://fixtures.invalid/portrait.png');
    assert.equal(await f.page.locator('#upload-icon').textContent(), '❌');
    if (scenario.uploadStatus) assert.equal(f.calls.patches.length, 0);
  });
}
test('duplicate photo submission shares one upload and one PATCH', async t => {
  const gate = deferred(), f = await setup(t, { uploadGate:gate }); await ready(f); await upload(f);
  await f.page.evaluate(() => { subirFoto(document.querySelector('#foto-input')); subirFoto(document.querySelector('#foto-input')); });
  assert.equal(f.calls.uploads.length, 1); gate.resolve(); await photoDone(f);
  assert.equal(f.calls.uploads.length, 1); assert.equal(f.calls.patches.length, 1);
});
test('photo upload before profile load is rejected without network mutation', async t => {
  const gate = deferred(), f = await setup(t, { readGate:gate });
  await upload(f); assert.equal(f.calls.uploads.length, 0); assert.equal(f.calls.patches.length, 0);
  gate.resolve(); await ready(f);
});
test('account changed during upload cannot PATCH any profile or display progress', async t => {
  const gate = deferred(), f = await setup(t, { uploadGate:gate }); await ready(f); await upload(f);
  await changeAccount(f, { ba_user_id:'320' }); gate.resolve(); await photoDone(f);
  assert.equal(f.calls.patches.length, 0); assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
});
test('account changed during photo PATCH cannot mark the old photo confirmed in UI', async t => {
  const gate = deferred(), f = await setup(t, { patchGate:gate }); await ready(f);
  const reachedPatch = f.page.waitForRequest(request => request.method() === 'PATCH');
  await upload(f); await reachedPatch;
  await changeAccount(f, { ba_user_id:'320' }); gate.resolve(); await photoDone(f);
  assert.equal(f.calls.patches.length, 1);
  assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
  assert.equal(await f.page.locator('#preview-img').isVisible(), false);
});
test('account changed during image optimization causes no remote write even in the mock harness', async t => {
  const f = await setup(t); await ready(f);
  await f.page.evaluate(() => { optimizeProfileImage = file => new Promise(resolve => { window.__finishOptimization = () => resolve(file); }); });
  await upload(f); await changeAccount(f, { ba_user_id:'320' });
  await f.page.evaluate(() => window.__finishOptimization()); await photoDone(f);
  assert.equal(f.calls.uploads.length, 0); assert.equal(f.calls.patches.length, 0);
  assert.equal(await f.page.locator('#profile-progress').isVisible(), false);
});
for (const photoFirst of [true, false]) test(`simultaneous photo/profile saves preserve both confirmed fields when ${photoFirst ? 'photo' : 'profile'} responds first`, async t => {
  const photoGate = deferred(), profileGate = deferred();
  const f = await setup(t, { photoPatchGate:photoGate, profilePatchGate:profileGate }); await ready(f);
  await f.page.locator('#bio-text').fill('Bio guardada a la vez');
  const profileRequested = f.page.waitForRequest(request => request.method() === 'PATCH' && !request.postDataJSON().foto_url);
  await f.page.evaluate(() => { window.__pendingProfileSave = saveProfile(); }); await profileRequested;
  const photoRequested = f.page.waitForRequest(request => request.method() === 'PATCH' && !!request.postDataJSON().foto_url);
  await upload(f); await photoRequested;
  if (photoFirst) { photoGate.resolve(); await photoDone(f); await score(f, 2); profileGate.resolve(); }
  else { profileGate.resolve(); await f.page.evaluate(() => window.__pendingProfileSave); await score(f, 2); photoGate.resolve(); }
  await photoDone(f); await f.page.evaluate(() => window.__pendingProfileSave); await score(f, 3);
  assert.equal(f.calls.patches.length, 2);
  const confirmed = await f.page.evaluate(() => ({ bio:perfilCargado.bio, foto_url:perfilCargado.foto_url }));
  assert.equal(confirmed.bio, 'Bio guardada a la vez');
  assert.equal(confirmed.foto_url, f.state.profile.foto_url);
  assert.equal(await f.page.locator('#preview-img').getAttribute('src'), f.state.profile.foto_url);
  await f.page.reload(); await ready(f); await score(f, 3);
});
