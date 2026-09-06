const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'buscARTE_index.html'];
const baselineCommit = '91608ad';
const baselineMode = process.env.BUSCARTE_INICIO_VISUAL_BASELINE === '1';
const origin = 'https://buscarte.test';
const allowedFiles = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const baselineFiles = new Map();
function baselineFile(file) {
  if (!baselineFiles.has(file)) baselineFiles.set(file, execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 }));
  return baselineFiles.get(file);
}
function source(file) { return baselineMode ? baselineFile(file) : fs.readFileSync(path.join(root, file)); }
function storageFor(mode) {
  if (mode === 'guest') return {};
  if (mode === 'recover') return { ba_logged: '1', ba_name: 'Persona Prueba' };
  return { ba_logged: '1', ba_user_id: 'fixture-user', ba_name: 'Persona Prueba', ba_tipo_cuenta: 'artista', ba_rubro: 'musica' };
}
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => { await browser?.close(); });

async function setup(t, file, { mode = 'guest', width = 390, reducedMotion = 'no-preference', syntheticDestinations = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block', reducedMotion });
  const calls = { unexpected: [], errors: [], consoleErrors: [] };
  await context.addInitScript(storage => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  }, storageFor(mode));
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { calls.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const relative = url.pathname.slice(1);
    if (syntheticDestinations && request.method() === 'GET' && url.origin === origin && ['buscARTE_registro.html', 'buscARTE_busqueda.html', 'buscARTE_anuncios.html'].includes(relative)) {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="es"><meta charset="utf-8"><title>Destino sintético</title><body>Destino sintético, sin scripts ni backend.</body></html>' });
    }
    if (request.method() === 'GET' && url.origin === origin && allowedFiles.has(relative)) {
      const contentType = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(relative)] || 'text/plain';
      return route.fulfill({ contentType, body: source(relative) });
    }
    if (request.method() === 'GET' && url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (request.method() === 'GET' && url.hostname === 'xiaanchoanxmampegoay.supabase.co' && ['/rest/v1/perfiles', '/rest/v1/anuncios', '/rest/v1/mensajes'].includes(url.pathname)) {
      return route.fulfill({ contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
    }
    if (request.method() === 'GET' && url.origin === origin && url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    // No continue/fetch/fallback: assets, data, navigation and writes fail closed.
    calls.unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => calls.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') calls.consoleErrors.push(message.text()); });
  await page.goto(origin + '/' + file, { waitUntil: 'load' });
  await page.waitForFunction(mode => document.documentElement.dataset.homeSession === mode && document.documentElement.dataset.homeReady === 'true', mode);
  await page.evaluate(() => document.fonts.ready);
  // Allow the existing introductory animation to settle before geometry checks.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  t.after(async () => {
    try {
      assert.deepEqual(calls.unexpected, [], 'No unforeseen or real network request');
      assert.deepEqual(calls.errors, [], 'No uncaught browser errors');
      assert.deepEqual(calls.consoleErrors, [], 'No console errors');
    } finally { await context.close(); }
  });
  return page;
}

async function capture(page, name) {
  if (!process.env.BUSCARTE_QA_OUTPUT) return;
  const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT);
  const relative = path.relative(root, output);
  assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Synthetic captures must stay outside the repository');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
}

const heroSelector = mode => mode === 'guest' ? '#hero-invitado' : mode === 'member' ? '#hero-logueado' : '#hero-recuperar';
async function assertNoGuestCTA(page, mode) {
  if (mode === 'guest') return;
  const registration = await page.locator('a[href*="registro"]').evaluateAll(links => links.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => el.textContent.trim()));
  assert.deepEqual(registration, [], 'Known accounts never see registration CTAs');
  assert.doesNotMatch(await page.locator('body').innerText(), /probá sin registrarte|crear perfil gratis|sin registro para mirar/i);
}

if (baselineMode) {
  for (const file of pages) for (const mode of ['guest', 'member']) for (const width of [320, 390, 1280]) {
    test(`baseline ${baselineCommit}: ${file} ${mode} ${width}px (capture only)`, async t => {
      const page = await setup(t, file, { mode, width });
      await capture(page, `antes-${file.replace('.html', '')}-${mode}-${width}.png`);
    });
  }
} else {
  for (const file of pages) {
    test(`${file}: visual work preserves existing IDs, destinations, scripts and distinct explore anchors`, async t => {
      const page = await setup(t, file);
      const contracts = await page.evaluate(({ previous, current }) => {
        const parse = html => new DOMParser().parseFromString(html, 'text/html');
        const extract = html => {
          const doc = parse(html);
          return {
            ids: [...doc.querySelectorAll('[id]')].map(el => el.id).sort(),
            hrefs: [...doc.querySelectorAll('a[href]')].map(el => el.getAttribute('href')).sort(),
            scripts: [...doc.querySelectorAll('script')].map(el => el.outerHTML.replace(/\r\n/g, '\n')),
            fields: [...doc.querySelectorAll('input, select, textarea')].map(el => ({ id: el.id, tag: el.tagName, type: el.getAttribute('type'), value: el.value, options: [...(el.options || [])].map(option => ({ value: option.value, text: option.text, selected: option.defaultSelected, disabled: option.disabled })) })),
            handlers: [...doc.querySelectorAll('[onclick], [onchange], [onkeydown]')].map(el => ['onclick', 'onchange', 'onkeydown'].map(name => el.getAttribute(name))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
            exploreClasses: [...doc.getElementById('explorar').classList],
            exploreLinks: [...doc.querySelectorAll('#explorar a[href]')].map(el => el.getAttribute('href')).sort()
          };
        };
        return { previous: extract(previous), current: extract(current) };
      }, { previous: baselineFile(file).toString('utf8'), current: fs.readFileSync(path.join(root, file), 'utf8') });
      assert.equal(new Set(contracts.current.ids).size, contracts.current.ids.length, 'IDs remain unique');
      for (const id of contracts.previous.ids) assert.ok(contracts.current.ids.includes(id), `Existing ID preserved: ${id}`);
      const remaining = [...contracts.current.hrefs];
      for (const href of contracts.previous.hrefs) {
        const index = remaining.indexOf(href);
        assert.ok(index >= 0, `Existing destination occurrence preserved: ${href}`);
        remaining.splice(index, 1);
      }
      for (const href of remaining) assert.ok(contracts.previous.hrefs.includes(href), `New shortcut only duplicates an existing destination: ${href}`);
      assert.deepEqual(contracts.current.scripts, contracts.previous.scripts, 'Inline logic and script imports unchanged');
      assert.deepEqual(contracts.current.fields, contracts.previous.fields, 'Search fields, defaults and every option keep the existing contract');
      assert.deepEqual(contracts.current.handlers, contracts.previous.handlers, 'Existing event handlers are neither removed nor changed');
      assert.deepEqual(contracts.current.exploreLinks, contracts.previous.exploreLinks, 'Explore retains its original per-page destination contract');
      const expectedClass = file === 'index.html' ? 'rubros-section' : 'profiles-section';
      assert.ok(contracts.previous.exploreClasses.includes(expectedClass));
      assert.ok(contracts.current.exploreClasses.includes(expectedClass));
    });

    test(`${file}: sample profiles are explicitly examples, not real affinity matches`, async t => {
      const page = await setup(t, file);
      const examples = page.locator('.home-examples');
      assert.equal(await examples.count(), 1);
      await examples.scrollIntoViewIfNeeded();
      assert.match(await examples.innerText(), /ejemplo/i);
      const badges = await examples.locator('.match').allTextContents();
      assert.equal(badges.length, 3);
      assert.ok(badges.every(text => /^ejemplo$/i.test(text.trim())), 'Every synthetic profile card is marked as an example');
      assert.doesNotMatch(await examples.innerText(), /\d+\s*%\s*(?:de\s*)?afinidad|afinidad\s*\d+\s*%/i);
    });

    for (const mode of ['guest', 'member', 'recover']) for (const width of [320, 390, 768, 769, 820, 1280]) {
      test(`${file}: clearer ${mode} Home fits physical ${width}px and preserves reachable actions`, async t => {
        const page = await setup(t, file, { mode, width });
        assert.equal(await page.locator('body.home-clarity').count(), 1);
        await assertNoGuestCTA(page, mode);
        assert.equal(await page.locator('nav [data-home-recover]').isVisible(), mode === 'recover', 'Visual CSS cannot expose another session variant');
        assert.equal(await page.locator('#nav-guest').isVisible(), mode === 'guest', 'Guest navigation is exclusive to guests');
        assert.equal(await page.locator('#nav-user').isVisible(), mode === 'member', 'Account navigation is exclusive to a known usable identity');
        assert.equal(await page.locator('#nav-dropdown').isVisible(), false, 'The account dropdown remains closed on initial load');
        const selector = heroSelector(mode);
        assert.equal(await page.locator(selector).isVisible(), true);
        await capture(page, `despues-${file.replace('.html', '')}-${mode}-${width}.png`);
        const metrics = await page.evaluate(selector => {
          const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, text: el.textContent.trim() }; };
          const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          const stats = document.querySelector('.home-community-stats');
          return {
            viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            nav: box(document.querySelector('nav')),
            navItems: [...document.querySelectorAll('nav > a, nav .nav-links a, #nav-guest a, #nav-avatar-btn, nav > .nav-right > a')].filter(visible).map(box),
            actions: [...document.querySelectorAll(selector + ' a')].filter(visible).map(box),
            heading: box([...document.querySelectorAll('.hero h1')].find(visible)),
            kicker: box([...document.querySelectorAll('.hero .home-guest-kicker, .hero .home-eyebrow')].find(visible)),
            stepDecorations: [...document.querySelectorAll('.steps .step')].map(el => ({ number: el.dataset.num, display: getComputedStyle(el, '::before').display })),
            statsCount: document.querySelectorAll('.home-community-stats').length,
            statsAfterExplore: !!(document.getElementById('explorar').compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING),
            statsAfterHow: !!(document.getElementById('como-funciona').compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING),
            heroStats: document.querySelectorAll('.hero .stats-bar, .hero .stat-item, .hero #stat-musicos, .hero #stat-anuncios').length
          };
        }, selector);
        assert.equal(metrics.viewport, width, 'Layout viewport matches physical test width, not auto-shrink');
        assert.ok(metrics.scrollWidth <= width + 1, 'No horizontal overflow');
        assert.ok(metrics.heading.y >= metrics.nav.bottom - 1, 'Navigation never covers the visible hero heading');
        assert.ok(metrics.kicker.y >= metrics.nav.bottom - 1, `Navigation never covers the visible introductory label: ${JSON.stringify({ nav: metrics.nav, kicker: metrics.kicker })}`);
        assert.equal(metrics.actions.length, mode === 'member' ? 4 : mode === 'recover' ? 2 : 3);
        for (const control of [...metrics.actions, ...metrics.navItems]) {
          assert.ok(control.x >= -1 && control.right <= width + 1, `Inside viewport: ${JSON.stringify(control)}`);
          assert.ok(control.height >= 44, `Minimum touch target: ${JSON.stringify(control)}`);
        }
        for (let i = 0; i < metrics.navItems.length; i++) for (let j = i + 1; j < metrics.navItems.length; j++) {
          const a = metrics.navItems[i], b = metrics.navItems[j];
          assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, `Nav items must not overlap: ${a.text} / ${b.text}`);
          if (Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1) {
            const gap = a.x <= b.x ? b.x - a.right : a.x - b.right;
            assert.ok(gap >= 4, `Nav controls on the same row need a visible gap of at least 4px: ${a.text} / ${b.text}, gap=${gap}`);
          }
        }
        assert.equal(metrics.statsCount, 1);
        assert.equal(metrics.statsAfterExplore, true, 'Community numbers follow actual exploration');
        assert.equal(metrics.statsAfterHow, true, 'Community numbers follow explanation of use');
        assert.equal(metrics.heroStats, 0);
        if (file === 'buscARTE_index.html') {
          assert.equal(metrics.stepDecorations.length, 4);
          for (const decoration of metrics.stepDecorations) assert.equal(decoration.display, 'none', `Decorative step number ${decoration.number} cannot obscure the card title at any viewport`);
        }
        if (mode === 'guest' && width === 390) {
          const primary = await page.locator('#hero-invitado .btn-neon').boundingBox();
          assert.ok(primary.y + primary.height <= 844 + 1, 'Primary exploration action is completely available without initial scroll');
          assert.equal(await page.evaluate(() => scrollY), 0);
        }
        for (const action of await page.locator(selector + ' a').all()) {
          await action.scrollIntoViewIfNeeded();
          await action.focus();
          assert.equal(await action.evaluate(el => el === document.activeElement), true, 'Every hero action is focusable after scrolling');
        }
      });
    }

    test(`${file}: mobile explore anchor reaches its original section and community remains scrollable`, async t => {
      const page = await setup(t, file);
      await page.locator('#hero-invitado a[href="#explorar"]').click();
      await page.waitForFunction(() => location.hash === '#explorar' && scrollY > 0);
      await page.waitForFunction(() => { const r = document.getElementById('explorar').getBoundingClientRect(); return r.top >= -1 && r.top <= 150; });
      await page.locator('.home-community-stats').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.home-community-stats').getBoundingClientRect().top < innerHeight);
      assert.equal(await page.locator('#stat-musicos').isVisible(), true);
      assert.equal(await page.locator('#stat-anuncios').isVisible(), true);
      await capture(page, `despues-${file.replace('.html', '')}-comunidad-390.png`);
    });

    test(`${file}: reduced motion keeps key copy and keyboard focus visible`, async t => {
      const page = await setup(t, file, { reducedMotion: 'reduce' });
      const animations = await page.locator('.home-guest-title, .home-guest-kicker, .home-guest-actions, .home-guest-desc').evaluateAll(elements => elements.map(el => ({ animation: getComputedStyle(el).animationName, transition: getComputedStyle(el).transitionDuration, opacity: getComputedStyle(el).opacity })));
      assert.ok(animations.length >= 4, 'The guest composition exposes its shared semantic styling hooks');
      for (const style of animations) {
        assert.equal(style.opacity, '1');
        assert.equal(style.animation, 'none');
      }
      const first = page.locator('#hero-invitado a').first();
      await first.focus();
      const focus = await first.evaluate(el => ({ focused: document.activeElement === el, visible: el.matches(':focus-visible'), style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
      assert.equal(focus.focused, true);
      assert.equal(focus.visible, true);
      assert.notEqual(focus.style, 'none');
      assert.ok(focus.width >= 2, 'Keyboard focus has a visible outline');
      await page.locator('.home-community-stats').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.home-community-stats').evaluate(el => getComputedStyle(el).opacity), '1');
    });
  }

  for (const mode of ['guest', 'member']) for (const key of ['Enter', 'Space']) {
    test(`buscARTE_index.html: ${mode} activates existing action gates with ${key}`, async t => {
      for (const [num, destination] of [['01', 'buscARTE_busqueda.html'], ['02', 'buscARTE_anuncios.html'], ['03', 'buscARTE_anuncios.html?tipo=jam']]) {
        const page = await setup(t, 'buscARTE_index.html', { mode, syntheticDestinations: true });
        const button = page.locator(`button.step[data-num="${num}"]`);
        assert.equal(await button.getAttribute('type'), 'button');
        assert.equal(await button.getAttribute('onclick'), `irA('${destination}')`);
        await button.scrollIntoViewIfNeeded();
        await button.focus();
        assert.equal(await button.evaluate(el => el === document.activeElement), true);
        const expected = origin + '/' + (mode === 'guest' ? 'buscARTE_registro.html' : destination);
        await Promise.all([page.waitForURL(expected), page.keyboard.press(key)]);
        assert.equal(page.url(), expected, 'The existing guest/member gate is unchanged');
        assert.equal(await page.title(), 'Destino sintético');
      }
    });
  }
}
