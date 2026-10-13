/* Focused regression for reported A2 layouts. The entire backend is synthetic;
 * every native request is fulfilled locally or aborted. Never used in dist. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4207';
const allowed = new Set(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8')));
const source = new Map([...allowed].map(file => [file, fs.readFileSync(path.join(root, file))]));
const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT || path.join(root, '..', 'BuscARTE-resguardos', 'a2-reported-layout-' + new Date().toISOString().replace(/[:.]/g, '-')));
assert.ok(!output.startsWith(root + path.sep), 'Evidence belongs outside the source/public package');
fs.mkdirSync(output, { recursive: true });
let transport = fs.readFileSync(path.join(root, 'preview/fixture-runtime.js'), 'utf8');
const start = transport.indexOf('  function demoProfile(');
const end = transport.indexOf('  function json(', start);
assert.ok(start > 0 && end > start);
transport = transport.slice(0, start) + '  function demoProfile(row) { return { ...clone(row), foto_url: localPhoto(row.foto_url) }; }\n' + transport.slice(end);
transport = transport.replace("url.hostname === 'xiaanchoanxmamgoay.supabase.co' || ", '');
transport = transport.replace('  async function api(request, url) {', `
  let qaSessionId = null, qaSessionReady = false;
  async function api(request, url) {
    if (url.pathname === '/.netlify/functions/datos') {
      const path = url.searchParams.get('path');
      if (!path || !/^\\/(?:rest\\/v1\\/|storage\\/v1\\/object\\/)/.test(path) || path.startsWith('//')) return fail('Fixture: unknown gateway path.',403);
      const target = new URL(path,'https://xiaanchoanxmampegoay.supabase.co');
      if (target.origin !== 'https://xiaanchoanxmampegoay.supabase.co') return fail('Fixture: external gateway blocked.',403);
      return safeFetch(new Request(target.href,request));
    }
    if (url.pathname === '/.netlify/functions/sesion') {
      if (!qaSessionReady) { qaSessionReady = true; qaSessionId = currentId() || null; }
      const user = state.perfiles.find(row=>sameId(row.id,qaSessionId));
      if (request.method === 'GET') return user ? json({user:Object.fromEntries(['id','nombre','email','tipo_cuenta','rubro','referentes','generos','baneado'].map(key=>[key,user[key]]))}) : json({error:'Fixture session required.',code:'SESSION_REQUIRED'},401);
      if (request.method === 'POST') { const body = await request.clone().json(); if (body.action !== 'logout') return fail('Fixture: invalid logout.',400); qaSessionId = null; global.BuscARTEPreview.logout(); return json({ok:true}); }
      return fail('Fixture: session method denied.',405);
    }
`);
transport = transport.replace("Object.keys(input).every(key => key === 'visitas')", "Object.keys(input).every(key => key === 'visitas' || key === 'vistas')");
// Long, synthetic names catch flex-content clipping without touching real data.
transport = transport.replaceAll("'Nico Demo'", "'Producción artística y técnica de la comunidad QA'");
transport += '\ndelete document.documentElement.dataset.baPreview; delete document.documentElement.dataset.baOption;';
const results = [];
let browser;
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => {
  await browser?.close();
  const sourceDrift=[...source].filter(([file,bytes])=>!fs.readFileSync(path.join(root,file)).equals(bytes)).map(([file])=>file);
  if(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8')))!==JSON.stringify([...allowed]))sourceDrift.push('site-files.json');
  fs.writeFileSync(path.join(output, 'reported-layout.json'), JSON.stringify({ at: new Date().toISOString(), scope: 'Production source + isolated synthetic session/gateway; no live writes or physical APK certification.', sourceDrift, sourceHashes: Object.fromEntries([...source].map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')])), results }, null, 2));
  console.log('Layout evidence: ' + output);
  assert.deepEqual(sourceDrift,[],'No late source change is certified by an older QA snapshot');
});

async function setup(t, file, width, logged = true) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 901, hasTouch: width < 901, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const result = { test: t.name, width, file, logged, unexpected: [], errors: [] }; results.push(result);
  const isolated = transport + '\n' + (logged ? 'window.BuscARTEPreview.useAccount(9001);' : 'window.BuscARTEPreview.logout();');
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { result.unexpected.push('WebSocket'); socket.close(); });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    let relative = decodeURIComponent(url.pathname).slice(1);
    if (!allowed.has(relative) && allowed.has(relative + '.html')) relative += '.html';
    if (url.origin === origin && req.method() === 'GET' && allowed.has(relative) && relative !== 'sw.js') {
      let bytes = source.get(relative);
      if (relative.endsWith('.html')) bytes = Buffer.from(bytes.toString('utf8').replace(/<head(?:\s[^>]*)?>/i, match => match + '\n<script>' + isolated.replace(/<\/script/gi, '<\\/script') + '</script>'));
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' })[path.extname(relative)] || 'application/octet-stream', body: bytes });
    }
    if (url.origin === origin && url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    result.unexpected.push(req.method() + ' ' + url.origin + url.pathname);
    return route.abort('blockedbyclient'); // Never continue/fetch/fallback.
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => result.errors.push(error.message));
  t.after(async () => {
    try {
      assert.deepEqual(result.unexpected, [], 'No live or unexpected traffic');
      assert.deepEqual(result.errors, [], 'No unhandled page errors');
    } finally { await context.close(); }
  });
  await page.goto(origin + '/' + file, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.body.dataset.a2Page);
  await page.evaluate(() => document.fonts.ready);
  return { page, result };
}

async function noOverflow(page, width) {
  const metric = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(metric.scroll <= width + 1, JSON.stringify(metric));
}
async function assertButton(page, selector, { opaque = true, centred = true } = {}) {
  const metric = await page.locator(selector).first().evaluate(el => {
    const style = getComputedStyle(el), r = el.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    return { text: el.textContent.trim(), display: style.display, align: style.alignItems, justify: style.justifyContent, background: style.backgroundColor, height: r.height, left: r.left, right: r.right, textLeft: text.left, textRight: text.right, centreDifference: Math.abs((r.top + r.bottom) / 2 - (text.top + text.bottom) / 2) };
  });
  assert.ok(metric.height >= 44, JSON.stringify(metric));
  assert.ok(metric.textLeft >= metric.left - 1 && metric.textRight <= metric.right + 1, JSON.stringify(metric));
  if (centred) {
    // Flex/grid items blockify inline-flex in computed style.
    assert.ok(['flex', 'inline-flex'].includes(metric.display), JSON.stringify(metric));
    assert.equal(metric.align, 'center', JSON.stringify(metric));
    assert.ok(metric.centreDifference < 2, JSON.stringify(metric));
  }
  if (opaque) assert.doesNotMatch(metric.background, /rgba\(.+, (?:0|0\.\d+)\)|transparent/, JSON.stringify(metric));
  return metric;
}

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const logged of [false, true]) {
    test(`${width}px ${logged ? 'member' : 'guest'}: anuncios, botones centrados y pie sin recortes`, async t => {
      const { page, result } = await setup(t, 'buscARTE_anuncios.html?rubro=musica', width, logged);
      await page.waitForSelector('.anuncio[data-id="9104"] .anuncio-likes.has-likes');
      result.responseButton = await assertButton(page, '.anuncio[data-id="9104"] .anuncio-respond');
      result.boardButton = await assertButton(page, '#anuncios-board-link');
      assert.equal(await page.locator('#anuncios-intro-account').isVisible(), !logged);
      await noOverflow(page, width);
      const card = page.locator('.anuncio[data-id="9104"]');
      await card.scrollIntoViewIfNeeded();
      result.footer = await card.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return [...el.querySelectorAll('.anuncio-meta > *')].filter(node => node.getClientRects().length).map(node => {
          const r = node.getBoundingClientRect();
          return { text: node.textContent.trim(), inside: r.left >= rect.left && r.right <= rect.right && r.bottom <= rect.bottom, clipped: node.scrollWidth > node.clientWidth + 1 };
        });
      });
      assert.ok(result.footer.every(node => node.inside && !node.clipped), JSON.stringify(result.footer));
      if (width === 390 || width === 1440) {
        await page.locator('.anuncio[data-id="9104"] .anuncio-respond').scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const button = document.querySelector('.anuncio[data-id="9104"] .anuncio-respond');
          const bottomNav = document.querySelector('.mobile-bottom-nav');
          const bottom = bottomNav?.getClientRects().length ? bottomNav.getBoundingClientRect().top - 18 : innerHeight - 18;
          const delta = button.getBoundingClientRect().bottom - bottom;
          if (delta > 0) window.scrollBy(0, delta);
        });
        // Viewport capture preserves the actual sticky nav rather than
        // accidentally masking the button with a locator's auto-scroll.
        await page.screenshot({ path: path.join(output, `event-footer-${width}-${logged ? 'member' : 'guest'}.png`), animations: 'disabled' });
      }
      if (width === 320 || width === 1440) await page.locator('.anuncios-intro').screenshot({ path: path.join(output, `artists-link-${width}-${logged ? 'member' : 'guest'}.png`), animations: 'disabled' });
      if (width < 901) await page.locator('#mobile-filter-btn-an').click();
      result.filter = await page.locator('.filter-header').evaluate(el => {
        const title = el.querySelector('.filter-title').getBoundingClientRect();
        const clear = el.querySelector('.filter-clear').getBoundingClientRect();
        const label = el.querySelector('#filter-category-label').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { width: r.width, labelWidth: label.width, titleRight: title.right, clearLeft: clear.left, clearBottom: clear.bottom, labelTop: label.top };
      });
      assert.ok(result.filter.titleRight <= result.filter.clearLeft, JSON.stringify(result.filter));
      assert.ok(result.filter.labelTop >= result.filter.clearBottom, JSON.stringify(result.filter));
      assert.ok(result.filter.labelWidth < result.filter.width - 44, 'Category is an intrinsic badge, not an arbitrary full-width stripe: ' + JSON.stringify(result.filter));
      if (!logged && (width === 320 || width === 1440)) await page.locator('.filter-header').screenshot({ path: path.join(output, `filter-header-${width}.png`), animations: 'disabled' });
    });
  }
}

for (const width of [320, 390, 1440]) {
  test(`${width}px: Marketplace conserva tarjetas, enlace y texto íntegro`, async t => {
    const { page } = await setup(t, 'buscARTE_anuncios.html?tipo=vende', width);
    await page.waitForSelector('.marketplace-product');
    await assertButton(page, '.marketplace-product .anuncio-respond');
    await noOverflow(page, width);
  });
}

for (const rubro of ['musica', 'actuacion', 'audiovisual', 'modelaje', 'diseno', 'tatuaje', 'danza', 'maquillaje', 'circo', 'escritura']) {
  test(`320px ${rubro}: búsqueda conserva selector y CTA legible`, async t => {
    const { page } = await setup(t, 'buscARTE_busqueda.html?rubro=' + rubro, 320);
    await page.waitForSelector('.musician-card');
    await assertButton(page, '.musician-card .card-cta');
    await noOverflow(page, 320);
  });
}

for (const [id, rubro] of [[9002, 'musica'], [9014, 'tatuaje'], [9015, 'danza']]) {
  for (const width of [320, 390, 1440]) {
    test(`${width}px ${rubro}: acciones del perfil quedan separadas de la pintura`, async t => {
      const { page } = await setup(t, 'buscARTE_perfil_publico.html?id=' + id, width);
      await page.waitForSelector('body[data-profile-state="other"]');
      await assertButton(page, '#save-btn');
      await assertButton(page, '#share-btn');
      await noOverflow(page, width);
      if (width === 390) await page.locator('.profile-hero').screenshot({ path: path.join(output, 'profile-' + rubro + '-390.png'), animations: 'disabled' });
    });
  }
}
