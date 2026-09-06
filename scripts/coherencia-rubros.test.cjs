const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://buscarte.test';
const baseline = process.env.BUSCARTE_COHERENCIA_BASELINE === '1';
const baselineCommit = 'f070ba3';
const siteFiles = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const cache = new Map();
const read = file => {
  if (!baseline) return fs.readFileSync(path.join(root, file));
  if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 }));
  return cache.get(file);
};
const rubros = [
  { key:'musica', name:'Música', section:'chips-inst', field:'instrumento', value:'Guitarra' },
  { key:'actuacion', name:'Actuación & escena', section:'chips-rol-act', field:'rol', value:'Actor/Actriz' },
  { key:'audiovisual', name:'Audiovisual & fotografía', section:'chips-rol-av', field:'rol', value:'Fotógrafo' },
  { key:'modelaje', name:'Modelaje', section:'chips-tipo-modelo', field:'tipo_trabajo', value:'Editorial' },
  { key:'diseno', name:'Diseño & artes visuales', section:'chips-rol-dis', field:'rol', value:'Diseñador gráfico' },
  { key:'tatuaje', name:'Tatuaje & arte corporal', section:'chips-rol-tatu', field:'rol', value:'Tatuador' },
  { key:'danza', name:'Danza', section:'chips-disc-dan', field:'disciplina', value:'Ballet' },
  { key:'maquillaje', name:'Maquillaje, vestuario & FX', section:'chips-rol-maq', field:'rol', value:'Maquillador artístico' },
  { key:'circo', name:'Circo & artes escénicas', section:'chips-rol-cir', field:'especialidad', value:'Acróbata' },
  { key:'escritura', name:'Escritura & guión', section:'chips-rol-esc', field:'rol', value:'Guionista' }
];
const homeHrefs = rubros.map(rubro => 'buscARTE_busqueda.html?rubro=' + rubro.key);
const genericBiography = 'Contá qué hacés, qué experiencia tenés y en qué proyectos te gustaría participar.';
const primaryCopy = {
  musica:['Instrumento o voz','Elegí instrumento o voz'],
  modelaje:['Tipo de trabajo','Elegí tu tipo de trabajo'],
  danza:['Estilos de danza','Elegí tus estilos de danza'],
  circo:['Tu especialidad','Elegí tu especialidad']
};
let browser;
before(async () => { browser = await chromium.launch({ headless:true, channel:process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

async function setup(t, file, { rubro = rubros[0], mode = 'member', width = 390 } = {}) {
  const context = await browser.newContext({ viewport:{ width, height:844 }, isMobile:width < 768, hasTouch:width < 768, serviceWorkers:'block' });
  const storage = { ba_rubro:rubro.key, ba_tipo_cuenta:'artista', ...(mode !== 'guest' ? { ba_logged:'1', ba_name:'Persona sintética ' + rubro.key } : {}), ...(mode === 'member' ? { ba_user_id:'210' } : {}) };
  await context.addInitScript(storage => {
    if (!localStorage.getItem('__fixture_initialized')) {
      localStorage.setItem('__fixture_initialized', '1');
      localStorage.setItem('buscarte_meta_consent_v1', 'denied');
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    }
    window.alert = () => {};
    window.confirm = () => true;
  }, storage);
  const state = { profile:{ id:210, nombre:'Persona sintética ' + rubro.key, tipo_cuenta:'artista', rubro:rubro.key, bio:'Presentación guardada de ' + rubro.key, provincia:'CABA', ciudad:'Buenos Aires', foto_url:null,
    instrumento:rubro.key === 'musica' ? rubro.value : '', campos_especificos:JSON.stringify(rubro.key === 'musica' ? {} : { [rubro.field]:[rubro.value] }) } };
  const calls = { unexpected:[], errors:[], writes:[] };
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), relative = url.pathname.slice(1);
    if (method !== 'GET') calls.writes.push(method + ' ' + url.origin + url.pathname);
    if (method === 'GET' && url.origin === origin && siteFiles.has(relative)) {
      if (relative.endsWith('.html') && relative !== file) return route.fulfill({ contentType:'text/html; charset=utf-8', body:'<!doctype html><meta charset="utf-8"><title>Destino sintético</title>' });
      const contentType = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json' }[path.extname(relative)] || 'text/plain';
      return route.fulfill({ contentType, body:read(relative) });
    }
    if (method === 'GET' && url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType:'text/css', body:'' });
    if (method === 'GET' && url.hostname === 'xiaanchoanxmampegoay.supabase.co') {
      if (url.pathname === '/rest/v1/perfiles' && url.searchParams.get('id') === 'eq.210') {
        if (url.searchParams.get('select') === 'email') return route.fulfill({ contentType:'application/json', body:'[{"email":"fixture@example.invalid"}]' });
        if (url.searchParams.get('select') === '*') return route.fulfill({ contentType:'application/json', body:JSON.stringify([state.profile]) });
      }
      if (['index.html','buscARTE_index.html'].includes(file) && ['/rest/v1/perfiles','/rest/v1/anuncios'].includes(url.pathname)) return route.fulfill({ contentType:'application/json', headers:{ 'content-range':'*/0' }, body:'[]' });
      if (url.pathname === '/rest/v1/mensajes') return route.fulfill({ contentType:'application/json', body:'[]' });
    }
    if (method === 'GET' && url.origin === origin && url.pathname === '/favicon.ico') return route.fulfill({ status:204, body:'' });
    // Fail closed: these read-only navigation tests never permit PATCH, RPC,
    // uploads, real email, analytics, SDK traffic or an unspecified request.
    calls.unexpected.push(method + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => calls.errors.push(error.message));
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, [], 'All network remains fulfilled locally or rejected');
      assert.deepEqual(calls.errors, [], 'No uncaught page errors');
      assert.deepEqual(calls.writes, [], 'Reading and navigating never saves profile data');
    } finally { await context.close(); }
  });
  await page.goto(origin + '/' + file, { waitUntil:'load' });
  if (file === 'buscARTE_perfil.html') await page.waitForFunction(() => !isLoadingProfile && !!perfilCargado);
  else await page.waitForFunction(mode => document.documentElement.dataset.homeSession === mode && document.documentElement.dataset.homeReady === 'true', mode);
  return { page, calls, state };
}

async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT), relative = path.relative(root, output);
  assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Evidence stays outside the repository');
  fs.mkdirSync(output, { recursive:true });
  await page.screenshot({ path:path.join(output, name), animations:'disabled' });
}

if (baseline) {
  test('baseline f070ba3: dance profile retains a guitar-specific biography example', async t => {
    const f = await setup(t, 'buscARTE_perfil.html', { rubro:rubros.find(r => r.key === 'danza') });
    assert.equal(await f.page.locator('#musica').isVisible(), false);
    assert.match(await f.page.locator('#bio-text').getAttribute('placeholder'), /Guitarrista/);
    await f.page.locator('#bio-text').scrollIntoViewIfNeeded();
    await capture(f.page, 'antes-perfil-danza-bio-390.png');
  });
  test('baseline f070ba3: legacy Home has no generic ten-category discovery section', async t => {
    const f = await setup(t, 'buscARTE_index.html', { mode:'guest' });
    assert.equal(await f.page.locator('#home-rubros').count(), 0);
    assert.equal(await f.page.locator('a[href="buscARTE_busqueda.html?rubro=danza"]').count(), 0);
    await capture(f.page, 'antes-home-legacy-390.png');
  });
} else {
  for (const rubro of rubros) for (const width of [320, 1280]) {
    test(`${rubro.key}: profile guidance matches saved category and pending action at ${width}px`, async t => {
      const f = await setup(t, 'buscARTE_perfil.html', { rubro, width }), page = f.page;
      assert.equal(await page.locator('#sidebar-rubro-nombre-display').textContent(), rubro.name);
      for (const selector of ['#musica','#referentes-section','#ensayo']) assert.equal(await page.locator(selector).isVisible(), rubro.key === 'musica');
      assert.equal(await page.locator('#mi-rubro').isVisible(), rubro.key !== 'musica');
      if (rubro.key !== 'musica') assert.equal(await page.locator('#mi-rubro-titulo').textContent(), rubro.name);
      assert.equal(await page.locator('#reg-nombre-perfil').inputValue(), f.state.profile.nombre);
      assert.equal(await page.locator('#bio-text').inputValue(), f.state.profile.bio);
      assert.deepEqual(await page.locator('#' + rubro.section + ' .selected').allTextContents(), [rubro.value]);
      assert.equal(await page.locator('#profile-progress-meter').getAttribute('aria-valuenow'), '4');
      const placeholder = await page.locator('#bio-text').getAttribute('placeholder');
      assert.equal(placeholder, genericBiography, 'The shared biography prompt is suitable for every category');
      if (rubro.key !== 'musica') assert.doesNotMatch(placeholder, /guitarrista|instrumento|banda de rock|universo musical/i);
      const [completeLabel, pendingLabel] = primaryCopy[rubro.key] || ['Tu rol','Elegí tu rol'];
      assert.equal(await page.locator('[data-basic="disciplina"] .progress-done > span').first().textContent(), completeLabel);
      const modalCopy = (await page.locator('#rubro-modal-overlay').textContent()).replace(/\s+/g, ' ');
      assert.ok(modalCopy.includes('Este selector no crea perfiles adicionales. Los perfiles con varios rubros todavía no están disponibles.'));
      assert.doesNotMatch(modalCopy, /cada rubro tiene su propio perfil|perfiles separados|14 de junio|14\/0?6/i);
      await page.locator(rubro.key === 'musica' ? '#musica' : '#mi-rubro').evaluate(el => window.scrollTo({ top:Math.max(0, scrollY + el.getBoundingClientRect().top - document.querySelector('nav').getBoundingClientRect().bottom - 20), behavior:'instant' }));
      await capture(page, `despues-perfil-${rubro.key}-${width}.png`);
      assert.equal(await page.evaluate(() => innerWidth), width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');

      // Exercise only the existing modal presentation. Never activate cambiarRubro,
      // whose persistent behavior is explicitly outside this copy-only block.
      await page.evaluate(() => abrirSelectorRubro());
      assert.equal(await page.locator('#rubro-modal-overlay').isVisible(), true);
      assert.equal(await page.locator('.rubro-modal-sub').textContent(), 'Elegir un rubro cambia el editor. Al guardar, actualizás el rubro de tu perfil actual; no creás otro perfil.');
      assert.deepEqual(await page.locator('#rubro-modal-grid .rubro-modal-btn > span:last-child').allTextContents(), rubros.map(r => r.name));
      if (rubro.key === 'danza') await capture(page, `despues-modal-rubros-${width}.png`);
      const modalMetrics = await page.locator('.rubro-modal').evaluate(el => ({ scrollWidth:el.scrollWidth, width:el.clientWidth, controls:[...el.querySelectorAll('.rubro-modal-btn, .rubro-modal-btn span')].map(control => { const r = control.getBoundingClientRect(); return { left:r.left, right:r.right }; }) }));
      assert.ok(modalMetrics.scrollWidth <= modalMetrics.width + 1, `The modal does not hide horizontal overflow: ${JSON.stringify(modalMetrics)}`);
      for (const box of modalMetrics.controls) assert.ok(box.left >= -1 && box.right <= width + 1, 'Every modal label/control stays in the viewport');
      await page.locator('.rubro-modal-close').click();
      assert.equal(await page.locator('#rubro-modal-overlay').isVisible(), false);
      assert.equal(await page.evaluate(() => rubroActivo), rubro.key);
      assert.equal(await page.evaluate(() => localStorage.getItem('ba_rubro')), rubro.key);

      // Reload an incomplete synthetic record; no saving or remote mutation.
      f.state.profile.instrumento = '';
      f.state.profile.campos_especificos = '{}';
      await page.reload();
      await page.waitForFunction(() => !isLoadingProfile && !!perfilCargado);
      assert.equal(await page.locator('#profile-progress-meter').getAttribute('aria-valuenow'), '3');
      const action = page.locator('[data-basic="disciplina"] a');
      assert.equal(await action.locator('span').first().textContent(), pendingLabel, 'Pending action names the actual field');
      assert.equal(await action.getAttribute('href'), '#' + rubro.section);
      if (rubro.key !== 'musica') assert.doesNotMatch(await page.locator('#profile-progress').innerText(), /instrumento|tu música/i);
      if (width === 320 && ['danza','tatuaje','maquillaje'].includes(rubro.key)) {
        await page.locator('#profile-progress').scrollIntoViewIfNeeded();
        await capture(page, `despues-perfil-${rubro.key}-${width}-checklist.png`);
      }
      await action.click();
      const position = await page.locator('#' + rubro.section).evaluate(el => ({ focused:el === document.activeElement, y:el.getBoundingClientRect().top, nav:document.querySelector('nav').getBoundingClientRect().bottom }));
      assert.equal(position.focused, true);
      assert.ok(position.y >= position.nav - 1, 'Focused category field is not covered by navigation');
      assert.equal(await page.locator('#save-bar').evaluate(el => el.classList.contains('visible')), false, 'Following a completion link does not dirty data');
    });
  }
  for (const file of ['index.html','buscARTE_index.html']) for (const rubro of rubros) {
    test(`${file}: all ten categories remain generic for cached ${rubro.key} across session states`, async t => {
      for (const [mode, width] of [['guest',320],['member',390],['recover',1280]]) {
        const f = await setup(t, file, { rubro, mode, width }), page = f.page;
        const section = page.locator(file === 'index.html' ? '#explorar' : '#home-rubros');
        const links = section.locator(file === 'index.html' ? 'a.rubro-item' : 'a.home-rubro-link');
        assert.deepEqual(await links.evaluateAll(els => els.map(el => el.getAttribute('href'))), homeHrefs, 'Exactly the ten established filters, in their established order');
        if (file === 'buscARTE_index.html') {
          assert.deepEqual(await links.evaluateAll(els => els.map(el => el.dataset.homeRubro)), rubros.map(r => r.key));
          assert.equal(await page.locator('#explorar.home-examples').count(), 1, 'The historical example-profile anchor keeps its meaning');
        }
        assert.equal(await page.locator('#nav-user').isVisible(), mode === 'member');
        assert.equal(await page.locator('#nav-guest').isVisible(), mode === 'guest');
        if (mode !== 'guest') assert.deepEqual(await page.locator('a[href*="registro"]').evaluateAll(els => els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => el.getAttribute('href'))), []);
        await section.scrollIntoViewIfNeeded();
        const metrics = await links.evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, height:r.height }; }));
        assert.equal(await page.evaluate(() => innerWidth), width);
        for (const box of metrics) { assert.ok(box.left >= -1 && box.right <= width + 1); assert.ok(box.height >= 44); }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const chosen = links.nth(rubros.indexOf(rubro));
        await chosen.scrollIntoViewIfNeeded();
        await chosen.focus();
        assert.equal(await chosen.evaluate(el => el === document.activeElement), true);
        if (rubro.key === 'danza') await capture(page, `despues-${file.replace('.html','')}-rubros-${mode}-${width}.png`);
        await Promise.all([page.waitForURL(origin + '/' + homeHrefs[rubros.indexOf(rubro)]), chosen.press('Enter')]);
        assert.equal(await page.title(), 'Destino sintético');
      }
    });
  }
}
