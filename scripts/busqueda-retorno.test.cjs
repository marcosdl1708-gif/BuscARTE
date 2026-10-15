/* Native browser Back/Forward through actual production HTML; synthetic GETs only. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');
const { setupFixture, snapshot, origin, root } = require('./mobile-ux-fixture.cjs');
const baseline = process.env.BUSCARTE_RETURN_BASELINE === '1';
const sources = snapshot();
if (baseline) for (const file of ['buscARTE_busqueda.html', 'buscARTE_perfil_publico.html'])
  sources.set(file, cp.execFileSync('git', ['show', '8d460ff:' + file], { cwd: root }));
const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT || path.join(root, '..', 'BuscARTE-resguardos',
  'busqueda-retorno-' + (baseline ? 'baseline-' : '') + new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(output, { recursive: true });
const rows = Array.from({ length: 36 }, (_, i) => ({ id: 1001 + i, nombre: 'Artista ' + String(i + 1).padStart(2, '0'),
  tipo_cuenta: 'artista', rubro: 'musica', instrumento: 'Guitarra', generos: 'Rock', referentes: 'Referencia',
  bio: 'Presentación de artista para una prueba aislada de navegación.', ciudad: 'Buenos Aires (CABA)', barrio: 'Almagro',
  disponibilidad: 'Sesiones', created_at: new Date(Date.UTC(2026, 8, 30 - i)).toISOString(), baneado: false,
  foto_url: null, disciplinas: null, perfil_revision: 0, edad: 30, campos_especificos: null }));
let browser;
const evidence = [];
before(async () => { browser = await chromium.launch({ headless: true,
  channel: process.platform === 'win32' ? 'msedge' : undefined, args: ['--disable-features=BackForwardCache'] }); });
after(async () => {
  await browser?.close();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ baseline, evidence,
    scope: 'Actual public HTML, native browser history with fresh documents, all requests locally fulfilled or blocked. No live backend/native Android certification.',
    hashes: Object.fromEntries(['buscARTE_busqueda.html', 'buscARTE_perfil_publico.html'].map(file => [file, createHash('sha256').update(sources.get(file)).digest('hex')])) }, null, 2));
  console.log('Search return QA: ' + output);
});
async function fixture(t, options = {}) {
  const f = await setupFixture({ browser, sources, profiles: rows, ...options });
  t.after(() => f.close());
  await f.page.waitForFunction(() => document.querySelectorAll('.musician-card').length === 9);
  return f;
}
async function ready(page, count = 9) {
  try { await page.waitForFunction(value => document.querySelectorAll('.musician-card').length === value && !resultsLoading, count); }
  catch (error) {
    console.log('Synthetic list state: ' + JSON.stringify(await page.evaluate(() => ({ count: document.querySelectorAll('.musician-card').length,
      loading: resultsLoading, offset, saved: history.state, navigation: performance.getEntriesByType('navigation')[0]?.type, pendingSearchRestore }))));
    throw error;
  }
}
async function prepareList(page) {
  await page.locator('#main-search').fill('Artista');
  await page.locator('#main-search').press('Enter');
  await page.locator('#sort-select').selectOption('nombre');
  await page.locator('#btn-list').click();
  if (await page.locator('#mobile-filter-btn').isVisible()) await page.locator('#mobile-filter-btn').click();
  await page.locator('#filters-rubro-principal .fchip').filter({ hasText: /^Guitarra$/ }).click();
  await page.locator('#filters-rubro-principal .fchip').filter({ hasText: /^Rock$/ }).click();
  await page.locator('#ciudad-select').selectOption('Buenos Aires (CABA)');
  await page.locator('#barrio-input').fill('Almagro');
  await page.locator('#referente-input').fill('Referencia');
  if (await page.locator('.mobile-show-results').isVisible()) await page.locator('.mobile-show-results').click();
  await page.waitForFunction(() => document.querySelectorAll('.musician-card').length === 9);
  await page.locator('#btn-load-more').click();
  await page.waitForFunction(() => document.querySelectorAll('.musician-card').length === 18);
}
async function openProfile(page, id = '1016') {
  const card = page.locator('.musician-card[data-id="' + id + '"]');
  await card.locator('.card-cta').scrollIntoViewIfNeeded();
  const top = await card.evaluate(el => el.getBoundingClientRect().top);
  await card.locator('.card-cta').click();
  await page.waitForURL(/buscARTE_perfil_publico/);
  await page.waitForFunction(() => document.body.dataset.profileState === 'other');
  return top;
}
test((baseline ? 'baseline reproduces lost list state' : 'mobile Back restores query, filters, sort, view, 18 results and position'), async t => {
  const { page } = await fixture(t);
  await prepareList(page);
  const top = await openProfile(page);
  await page.goBack({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.musician-card').length > 0);
  if (baseline) {
    assert.equal(await page.locator('.musician-card').count(), 9);
    assert.equal(await page.locator('#musicians-grid').evaluate(el => el.classList.contains('list-view')), false);
    assert.equal(await page.locator('.fchip.on').count(), 0);
    evidence.push({ baseline: 'Reproduced: native Back loses loaded page, selected chips and list view; browser may restore some form values itself.' });
    return;
  }
  await page.waitForFunction(() => document.querySelectorAll('.musician-card').length === 18);
  assert.equal(await page.locator('#main-search').inputValue(), 'Artista');
  assert.equal(await page.locator('#sort-select').inputValue(), 'nombre');
  assert.equal(await page.locator('#barrio-input').inputValue(), 'Almagro');
  assert.equal(await page.locator('#referente-input').inputValue(), 'Referencia');
  assert.equal(await page.locator('#ciudad-select').inputValue(), 'Buenos Aires (CABA)');
  assert.equal(await page.locator('.fchip.on').count(), 2);
  assert.equal(await page.locator('#musicians-grid').evaluate(el => el.classList.contains('list-view')), true);
  await page.waitForFunction(expected => Math.abs(document.querySelector('.musician-card[data-id="1016"]').getBoundingClientRect().top - expected) < 3, top);
  evidence.push({ restored: 'Native mobile Back, page 2, filters, text, sort, view and card position.', top });
  await page.screenshot({ path: path.join(output, 'retorno-mobile.png'), animations: 'disabled' });
});

if (!baseline) {
  test('desktop visible back link restores a paginated list and preserves unrelated history state', async t => {
    const { page } = await fixture(t, { width: 1440 });
    await page.evaluate(() => history.replaceState({ unrelated: { keep: true } }, ''));
    await prepareList(page); await openProfile(page);
    await page.locator('.nav-back').click();
    await page.waitForURL(/buscARTE_busqueda/); await ready(page, 18);
    assert.equal(await page.locator('#sort-select').inputValue(), 'nombre');
    assert.deepEqual(await page.evaluate(() => history.state.unrelated), { keep: true });
    const state = await page.evaluate(() => history.state.baSearchReturn);
    assert.deepEqual(Object.keys(state).sort(), ['version', 'url', 'rubro', 'search', 'chips', 'ciudad', 'barrio', 'referente', 'sort', 'view', 'count', 'y', 'anchor', 'anchorTop'].sort());
    assert.equal(JSON.stringify(state).includes('Presentación de artista'), false);
    evidence.push({ restored: 'Desktop visible Back and unrelated history metadata.' });
  });

  test('slow GET restores controls before data and position only after the saved page exists', async t => {
    let listCalls = 0, release;
    const { page } = await fixture(t, { api: async ({ url }) => {
      if (url.pathname === '/rest/v1/perfiles' && !url.searchParams.has('id') && ++listCalls === 2)
        await new Promise(resolve => { release = resolve; });
    } });
    await prepareList(page); const top = await openProfile(page);
    await page.goBack({ waitUntil: 'load' });
    assert.equal(await page.locator('#sort-select').inputValue(), 'nombre');
    assert.equal(await page.locator('.fchip.on').count(), 2);
    assert.equal(await page.locator('.musician-card').count(), 0);
    assert.equal(typeof release, 'function'); release(); await ready(page, 18);
    await page.waitForFunction(expected => Math.abs(document.querySelector('.musician-card[data-id="1016"]').getBoundingClientRect().top - expected) < 3, top);
    evidence.push({ restored: 'Delayed data load; controls first and scroll after 18 cards.' });
  });

  test('reload preserves 27 loaded artists without using sessionStorage', async t => {
    const { page } = await fixture(t, { storageUnavailable: true });
    await prepareList(page); await page.locator('#btn-load-more').click(); await ready(page, 27);
    await page.locator('.musician-card[data-id="1025"]').scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await page.waitForFunction(() => history.state?.baSearchReturn?.count === 27 && Math.abs(history.state.baSearchReturn.y - scrollY) < 3);
    await page.reload(); await ready(page, 27);
    await page.waitForFunction(expected => Math.abs(scrollY - expected) < 3, before);
    assert.equal(await page.locator('.fchip.on').count(), 2);
    assert.equal(await page.locator('#sort-select').inputValue(), 'nombre');
    evidence.push({ restored: 'Reload/session-refresh compatible, 27 artists; sessionStorage throws.' });
  });

  test('two same-URL history entries remain independent through Back and Forward', async t => {
    const { page } = await fixture(t);
    await prepareList(page); await openProfile(page);
    await page.goto(origin + '/buscARTE_busqueda.html'); await ready(page);
    await page.locator('#main-search').fill('Artista 2'); await page.locator('#main-search').press('Enter'); await ready(page);
    await openProfile(page, '1025');
    await page.goBack({ waitUntil: 'load' }); await ready(page);
    assert.equal(await page.locator('#main-search').inputValue(), 'Artista 2');
    assert.equal(await page.locator('#musicians-grid').evaluate(el => el.classList.contains('list-view')), false);
    await page.goBack({ waitUntil: 'load' }); await page.goBack({ waitUntil: 'load' }); await ready(page, 18);
    assert.equal(await page.locator('#main-search').inputValue(), 'Artista');
    assert.equal(await page.locator('.fchip.on').count(), 2);
    await page.goForward({ waitUntil: 'load' }); await page.goForward({ waitUntil: 'load' }); await ready(page);
    assert.equal(await page.locator('#main-search').inputValue(), 'Artista 2');
    evidence.push({ restored: 'Independent states for two identical URL entries through native Back/Forward.' });
  });

  test('fresh navigation does not inherit the previous search, even at the same URL', async t => {
    const { page } = await fixture(t);
    await prepareList(page); await openProfile(page);
    await page.goto(origin + '/buscARTE_busqueda.html'); await ready(page);
    assert.equal(await page.locator('#main-search').inputValue(), '');
    assert.equal(await page.locator('.fchip.on').count(), 0);
    assert.equal(await page.locator('#sort-select').inputValue(), 'afinidad');
    assert.equal(await page.evaluate(() => history.state?.baSearchReturn?.search), '');
  });

  test('a profile moved beyond the saved count remains visible, while a removed one falls back safely', async t => {
    const f = await fixture(t); const { page, state } = f;
    await prepareList(page); const top = await openProfile(page);
    state.profiles.find(row => row.id === 1016).nombre = 'Artista 99';
    await page.goBack({ waitUntil: 'load' }); await ready(page, 36);
    await page.waitForFunction(() => { const r = document.querySelector('.musician-card[data-id="1016"]').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 115; });
    await openProfile(page);
    state.profiles = state.profiles.filter(row => row.id !== 1016);
    await page.goBack({ waitUntil: 'load' }); await ready(page, 35);
    assert.equal(await page.locator('.musician-card[data-id="1016"]').count(), 0);
    assert.equal(await page.evaluate(() => Number.isFinite(scrollY) && scrollY <= document.documentElement.scrollHeight - innerHeight + 1), true);
    evidence.push({ restored: 'Moved anchor is included beyond prior count; removed anchor clamps scroll safely.' });
  });

  test('BFCache pageshow leaves existing cards, filters and view intact without a fetch', async t => {
    const { page, state } = await fixture(t);
    await prepareList(page);
    const calls = state.calls.filter(call => call.path === '/rest/v1/perfiles').length;
    await page.evaluate(() => {
      document.querySelector('.musician-card').dataset.qaIdentity = 'same-dom';
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    assert.equal(await page.locator('.musician-card').first().getAttribute('data-qa-identity'), 'same-dom');
    assert.equal(await page.locator('.musician-card').count(), 18);
    assert.equal(state.calls.filter(call => call.path === '/rest/v1/perfiles').length, calls);
  });

  test('malformed or wrong-category history state is ignored on reload', async t => {
    const bad = { baSearchReturn: { version: 1, url: '/buscARTE_busqueda.html', rubro: 'musica', chips: 'wrong-type' } };
    const { page } = await fixture(t, { historyState: bad });
    await page.reload(); await ready(page);
    assert.equal(await page.locator('.fchip.on').count(), 0);
    assert.equal(await page.locator('#main-search').inputValue(), '');
    await page.evaluate(() => {
      const prior = history.state.baSearchReturn;
      history.replaceState({ baSearchReturn: { ...prior, rubro: 'danza' } }, '');
    });
    await page.reload(); await ready(page);
  });

  test('direct and new-tab profile links retain a safe category fallback and clean share URL', async t => {
    const f = await setupFixture({ browser, sources, profiles: rows,
      route: 'buscARTE_perfil_publico.html?id=1016&rubro=musica', width: 1440 });
    t.after(() => f.close());
    const { page } = f;
    await page.waitForFunction(() => document.body.dataset.profileState === 'other');
    assert.equal(await page.locator('.nav-back').getAttribute('href'), 'buscARTE_busqueda.html?rubro=musica');
    assert.equal(await page.evaluate(() => volverAResultados({ button: 0 })), true);
    await page.locator('.nav-back').click(); await ready(page);
    const popup = await f.context.newPage();
    await popup.goto(origin + '/buscARTE_perfil_publico.html?id=1016&rubro=musica', { referer: origin + '/buscARTE_busqueda.html' });
    await popup.waitForFunction(() => document.body.dataset.profileState === 'other');
    assert.equal(await popup.evaluate(() => volverAResultados({ button: 0 })), true, 'A new tab has no previous list entry');
    const shared = await popup.evaluate(async () => {
      let value;
      Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { value = payload.url; } });
      await compartirPerfil(); return value;
    });
    assert.equal(new URL(shared).search, '?id=1016');
    await popup.close();
  });

  test('a stale load-more response cannot append rows after a filter reset', async t => {
    const { page } = await fixture(t);
    await page.evaluate(async () => {
      const cached = perfilesCache;
      let finish;
      fetchProfiles = () => new Promise(resolve => { finish = () => resolve(cached); });
      loadMore(); loadMore();
      const oldFinish = finish;
      fetchProfiles = async () => cached;
      document.getElementById('main-search').value = 'Artista 01';
      doSearch(); oldFinish();
    });
    await ready(page, 1);
    assert.deepEqual(await page.locator('.musician-card').evaluateAll(cards => cards.map(card => card.dataset.id)), ['1001']);
    assert.equal(await page.locator('#btn-load-more').isVisible(), false);
    evidence.push({ guarded: 'Repeated append blocked and old response ignored after newer filter query.' });
  });

  test('a gesture during a slow fetch cancels the later jump and slow fonts never disable loaded results', async t => {
    let listCalls = 0, release;
    const { page } = await fixture(t, { api: async ({ url }) => {
      if (url.pathname === '/rest/v1/perfiles' && !url.searchParams.has('id') && ++listCalls === 2)
        await new Promise(resolve => { release = resolve; });
    } });
    await prepareList(page); await openProfile(page);
    await page.goBack({ waitUntil: 'load' });
    await page.evaluate(() => {
      Object.defineProperty(document.fonts, 'ready', { configurable: true,
        value: new Promise(resolve => { window.__qaReleaseFonts = resolve; }) });
      window.scrollTo(0, 0);
    });
    await page.mouse.wheel(0, 50);
    await page.waitForFunction(() => searchGesture > 0);
    release(); await ready(page, 18);
    assert.equal(await page.locator('#btn-load-more').isEnabled(), true, 'Data is ready even while fonts remain pending');
    // Wheel scrolling runs on the compositor after its event handler. Let that
    // real gesture finish before measuring a later, unwanted app scroll.
    await page.evaluate(() => new Promise(resolve => {
      let previous = scrollY, stable = 0;
      const tick = () => {
        stable = scrollY === previous ? stable + 1 : 0; previous = scrollY;
        if (stable >= 12) resolve(); else requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    }));
    const chosen = await page.evaluate(() => scrollY);
    await page.evaluate(() => {
      const original = window.scrollTo.bind(window); window.__qaAppScrolls = [];
      window.scrollTo = (...args) => { window.__qaAppScrolls.push(args); return original(...args); };
    });
    await page.evaluate(() => window.__qaReleaseFonts());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    assert.deepEqual(await page.evaluate(() => window.__qaAppScrolls), [], 'Cancelled restore never calls scrollTo');
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - chosen) < 3, 'Respect the user scroll during fetch');
    evidence.push({ guarded: 'Native wheel during delayed GET cancels restore; pending fonts do not block results.' });
  });

  test('native BFCache Back preserves the same list DOM and its loaded results', async t => {
    const nativeBrowser = await chromium.launch({ headless: true,
      channel: process.platform === 'win32' ? 'msedge' : undefined,
      ignoreDefaultArgs: ['--disable-back-forward-cache'] });
    const f = await setupFixture({ browser: nativeBrowser, sources, profiles: rows,
      init: () => { window.__qaPageShows = []; window.addEventListener('pageshow', event => window.__qaPageShows.push(event.persisted)); } });
    t.after(async () => { await f.close(); await nativeBrowser.close(); });
    const { page } = f; await ready(page);
    await prepareList(page);
    await page.evaluate(() => { document.querySelector('.musician-card').dataset.qaIdentity = 'native-bfcache-dom'; });
    await openProfile(page);
    await page.goBack({ waitUntil: 'commit' }); await ready(page, 18);
    const persisted = await page.evaluate(() => window.__qaPageShows.includes(true));
    evidence.push({ nativeBFCache: persisted, pageShows: await page.evaluate(() => window.__qaPageShows),
      notRestoredReasons: await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON?.() || null) });
    assert.equal(persisted, true, 'Native pageshow.persisted must confirm real BFCache, not a synthetic dispatch');
    assert.equal(await page.locator('.musician-card').first().getAttribute('data-qa-identity'), 'native-bfcache-dom');
  });
}
