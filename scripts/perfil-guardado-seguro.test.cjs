const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const file = 'buscARTE_perfil.html';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const files = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const password = 'Synthetic-password-only-2026!';
const portrait = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kZUAAAAASUVORK5CYII=', 'base64');
let browser;
before(async () => { browser = await chromium.launch({ headless:true, channel:process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

async function setup(t, { status = 200, width = 1280 } = {}) {
  const context = await browser.newContext({ viewport:{ width, height:844 }, isMobile:width < 768, hasTouch:width < 768, serviceWorkers:'block' });
  await context.addInitScript(() => {
    if (!localStorage.getItem('synthetic-initialized')) {
      for (const [key, value] of Object.entries({ 'synthetic-initialized':'1', buscarte_meta_consent_v1:'denied',
        ba_logged:'1', ba_user_id:'210', ba_rubro:'musica', ba_tipo_cuenta:'artista', ba_name:'Persona Prueba' })) localStorage.setItem(key, value);
    }
    window.alert = () => { throw new Error('No alert allowed in secure save flow'); };
    window.prompt = () => { throw new Error('No prompt allowed in secure save flow'); };
  });
  const state = { profile:{ id:210, email:'prueba@example.invalid', nombre:'Persona Prueba', rubro:'musica', tipo_cuenta:'artista',
    instrumento:'Batería', generos:'Rock, Pop', bio:'Perfil sintético.', provincia:'CABA', ciudad:'Buenos Aires (CABA)',
    barrio:'Almagro', campos_especificos:null, foto_url:null } };
  const calls = { events:[], writes:[], unexpected:[], errors:[] };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const relative = url.pathname.slice(1);
    if (url.origin === origin && method === 'GET' && files.has(relative)) {
      if (relative.endsWith('.html') && relative !== file) return route.fulfill({ contentType:'text/html', body:'<!doctype html><p>Destino simulado</p>' });
      return route.fulfill({ contentType:({ '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png' })[path.extname(relative)] || 'text/plain',
        body:relative === file ? source : fs.readFileSync(path.join(root, relative)) });
    }
    if (url.origin === origin && url.pathname === '/.netlify/functions/guardar-perfil' && method === 'POST') {
      const body = request.postDataJSON();
      calls.writes.push({ method, path:url.pathname, query:url.search, body });
      calls.events.push(body.operation === 'verify' ? 'verify' : 'save');
      assert.equal(body.email, state.profile.email);
      assert.equal(body.password, password);
      assert.equal(String(body.profileId), '210');
      assert.equal(url.search, '', 'Credentials never appear in a URL');
      if (status !== 200) return route.fulfill({ status, contentType:'application/json', body:'{"error":"invalid_credentials"}' });
      if (body.operation === 'verify') {
        assert.deepEqual(body.changes, {});
        return route.fulfill({ contentType:'application/json', body:'[{"id":210}]' });
      }
      state.profile = { ...state.profile, ...body.changes };
      return route.fulfill({ contentType:'application/json', body:JSON.stringify([{ id:210, campos_especificos:state.profile.campos_especificos, generos:state.profile.generos, foto_url:state.profile.foto_url }]) });
    }
    if (url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (method === 'GET' && url.pathname === '/rest/v1/perfiles') return route.fulfill({ contentType:'application/json', body:JSON.stringify(url.searchParams.get('select') === 'email' ? [{ email:state.profile.email }] : [state.profile]) });
      if (method === 'GET' && url.pathname === '/rest/v1/mensajes') return route.fulfill({ contentType:'application/json', body:'[]' });
      if (method === 'POST' && url.pathname.startsWith('/storage/v1/object/fotos-perfil/210-')) {
        assert.equal(calls.events.at(-1), 'verify', 'Authentication precedes uploading any photo bytes');
        calls.events.push('upload');
        return route.fulfill({ contentType:'application/json', body:'{}' });
      }
      if (method === 'GET' && url.href === state.profile.foto_url) return route.fulfill({ contentType:'image/png', body:portrait });
    }
    if (url.hostname === 'fonts.googleapis.com' && method === 'GET') return route.fulfill({ contentType:'text/css', body:'' });
    if (url.origin === origin && url.pathname === '/favicon.ico' && method === 'GET') return route.fulfill({ status:204, body:'' });
    // No fetch/continue/fallback. REST PATCH, Auth, RPC, email, tracking and all
    // unspecified traffic fail closed; only the explicit synthetic writes exist.
    calls.unexpected.push(method + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, []);
      assert.deepEqual(calls.errors, []);
      assert.equal(await page.evaluate(password => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes(password)), password), false, 'Password is never persisted');
    } finally { await context.close(); }
  });
  await page.goto(origin + '/' + file);
  await page.waitForFunction(() => !isLoadingProfile && !!perfilCargado);
  return { page, state, calls };
}

async function editGenres(f) {
  await f.page.locator('#chips-gen').getByRole('button', { name:'Rock', exact:true }).click();
  await f.page.locator('#chips-gen').getByRole('button', { name:'Jazz', exact:true }).click();
  await f.page.locator('#save-bar .btn-neon').click();
  await f.page.locator('#profile-reauth-dialog[open]').waitFor();
}
async function confirm(f) {
  assert.equal(await f.page.locator('#profile-reauth-email').getAttribute('readonly'), '');
  await f.page.locator('#profile-reauth-password').fill(password);
  await f.page.locator('#profile-reauth-form button[type="submit"]').click();
}
async function finished(f) { await f.page.waitForFunction(() => !isSavingProfile && !isUploadingPhoto && !profileReauthPending); }
async function cleared(f) {
  assert.equal(await f.page.locator('#profile-reauth-password').inputValue(), '');
  assert.equal(await f.page.evaluate(() => profileReauthCredentials), null);
}

test('desktop genres save through the authenticated endpoint, reject duplicate submits and persist on reload', async t => {
  const f = await setup(t); await editGenres(f);
  assert.equal(await f.page.evaluate(() => document.activeElement.id), 'profile-reauth-password');
  await f.page.evaluate(() => { saveProfile(); });
  assert.equal(f.calls.writes.length, 0);
  await confirm(f); await finished(f); await cleared(f);
  assert.match(await f.page.locator('#profile-status').innerText(), /guardado correctamente/);
  assert.equal(f.calls.writes.length, 1);
  assert.equal(f.calls.writes[0].body.changes.generos, 'Jazz, Pop');
  await f.page.reload(); await f.page.waitForFunction(() => !isLoadingProfile && !!perfilCargado);
  assert.deepEqual(await f.page.locator('#chips-gen .selected').allTextContents(), ['Jazz', 'Pop']);
});

test('a rejected password preserves the mobile draft and clears credentials', async t => {
  const f = await setup(t, { status:401, width:390 }); await editGenres(f);
  const box = await f.page.locator('#profile-reauth-dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await confirm(f); await finished(f); await cleared(f);
  assert.match(await f.page.locator('#profile-status').innerText(), /contraseña no coincide/);
  assert.deepEqual(await f.page.locator('#chips-gen .selected').allTextContents(), ['Jazz', 'Pop']);
  assert.equal(f.state.profile.generos, 'Rock, Pop');
  assert.equal(await f.page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), true);
});

test('Escape cancels reauthentication without any POST or lost selection', async t => {
  const f = await setup(t); await editGenres(f);
  await f.page.locator('#profile-reauth-password').fill(password);
  await f.page.keyboard.press('Escape'); await finished(f); await cleared(f);
  assert.equal(await f.page.locator('#profile-reauth-dialog').getAttribute('open'), null);
  assert.deepEqual(f.calls.events, []);
  assert.deepEqual(await f.page.locator('#chips-gen .selected').allTextContents(), ['Jazz', 'Pop']);
});

test('account changes cancel the modal, erase its password and block saving the previous draft', async t => {
  const f = await setup(t); await editGenres(f);
  await f.page.locator('#profile-reauth-password').fill(password);
  await f.page.evaluate(() => {
    localStorage.setItem('ba_user_id', '320'); localStorage.setItem('ba_name', 'Otra Persona');
    dispatchEvent(new StorageEvent('storage', { key:'ba_user_id' }));
  });
  await finished(f); await cleared(f);
  await f.page.evaluate(() => saveProfile());
  assert.deepEqual(f.calls.events, []);
  assert.equal(f.state.profile.generos, 'Rock, Pop');
  assert.equal(await f.page.evaluate(() => localStorage.getItem('ba_name')), 'Otra Persona');
});

test('photo verifies credentials before upload and confirms its profile URL through the same endpoint', async t => {
  const f = await setup(t);
  await f.page.locator('#foto-input').setInputFiles({ name:'fixture.png', mimeType:'image/png', buffer:portrait });
  await f.page.locator('#profile-reauth-dialog[open]').waitFor();
  assert.deepEqual(f.calls.events, []);
  await confirm(f); await finished(f); await cleared(f);
  assert.deepEqual(f.calls.events, ['verify', 'upload', 'save']);
  assert.equal(f.calls.writes[0].body.operation, 'verify');
  assert.deepEqual(Object.keys(f.calls.writes[1].body.changes), ['foto_url']);
  assert.match(await f.page.locator('#profile-status').innerText(), /Foto de perfil actualizada/);
  assert.equal(await f.page.locator('#preview-img').getAttribute('src'), f.state.profile.foto_url);
});
