const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'netlify/functions/send-email.js'), 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const fixtureOrigin = 'https://recordatorio-fixture.invalid';
const genericFooter = 'buscARTE · La red gratuita para artistas argentinos';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT || path.join(root, '../BuscARTE-resguardos/recordatorio-perfil-20260906', 'visual-' + stamp));
const relativeOutput = path.relative(root, output);
assert.ok(relativeOutput.startsWith('..' + path.sep) || path.isAbsolute(relativeOutput), 'Synthetic email artifacts must stay outside the repository');
assert.ok(!fs.existsSync(output), 'Choose a new output directory; never overwrite previous email evidence');
const results = [];
const names = [
  { key: 'normal', datos: { nombre: 'Marina' }, expectedName: 'Marina' },
  { key: 'ausente', datos: {}, expectedName: '' },
  { key: 'largo', datos: { nombre: 'W'.repeat(80) }, expectedName: 'W'.repeat(80) },
  { key: 'html', datos: { nombre: '<img id=qa-pwn src=x onerror=window.__mailInjection=1><b>Nombre</b>&' }, expectedName: '<img id=qa-pwn src=x onerror=window.__mailInjection=1><b>Nombre</b>&' }
];
let browser;

before(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
});
after(async () => {
  await browser?.close();
  fs.writeFileSync(path.join(output, 'recordatorio-perfil-visual.json'), JSON.stringify({
    at: new Date().toISOString(), sourceSha256,
    safety: 'Pure buildEmail in a VM with fictitious environment and throwing fetch. No handler calls. Browser network, WebSockets and service workers blocked. No links activated.',
    limitations: [
      'Edge rendering is not a Gmail, Outlook, Apple Mail or physical-device compatibility test.',
      'The unchanged shared footer uses 12px/#555; its pre-existing contrast debt is recorded separately, not treated as an accessibility pass.',
      'No actual sending, recipient selection, cadence, delivery or login integration is exercised by this visual suite.'
    ],
    results
  }, null, 2), { flag: 'wx' });
});

function reminder(datos) {
  const forbidden = [];
  const sandbox = vm.createContext({
    exports: {},
    process: { env: Object.freeze({ URL: fixtureOrigin, RESEND_API_KEY: 'fixture-not-a-secret', FROM_EMAIL: 'Fixture <sender@example.invalid>', ADMIN_EMAIL: 'admin@example.invalid' }) },
    fetch: (...args) => { forbidden.push(String(args[0])); throw new Error('Any fetch is forbidden in pure template QA'); },
    console: { log() {}, warn() {}, error() {} },
    __fixtureDatos: structuredClone(datos)
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, sandbox, { filename: 'send-email.synthetic-vm.js', timeout: 1000 });
  const email = vm.runInContext('buildEmail("perfil_incompleto", __fixtureDatos)', sandbox, { timeout: 1000 });
  assert.deepEqual(forbidden, [], 'Template construction must not read a database or send mail');
  assert.equal(typeof email?.html, 'string');
  assert.equal(typeof email?.subject, 'string');
  return { subject: email.subject, html: email.html };
}

function emailDocument(html) {
  // Keep the template fragment untouched. The neutral reader supplies only a
  // physical viewport and body-margin reset, never CSS repairs or remote assets.
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0">' + html + '</body></html>';
}

async function layoutMetrics(page) {
  return page.evaluate(genericFooter => {
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const visible = el => {
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0' && !el.closest('[aria-hidden="true"]');
    };
    const rgb = value => {
      const match = value.match(/^rgba?\(([^)]+)\)$/);
      return match ? match[1].split(',').map(Number) : null;
    };
    const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const background = el => {
      for (let node = el; node; node = node.parentElement) {
        const color = rgb(getComputedStyle(node).backgroundColor);
        if (color && (color.length === 3 || color[3] === 1)) return color;
      }
      return [255, 255, 255];
    };
    const text = [...document.querySelectorAll('h2,h3,p,li,a,strong')].filter(visible).filter(el => el.textContent.trim()).map(el => {
      const css = getComputedStyle(el), a = luminance(rgb(css.color)), b = luminance(background(el));
      return { tag: el.tagName, text: el.textContent.trim(), ...rect(el), fontSize: parseFloat(css.fontSize), lineHeight: css.lineHeight,
        contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), sharedFooter: el.textContent.trim() === genericFooter };
    });
    const glyphs = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (!node.textContent.trim() || !parent || !visible(parent) || ['STYLE', 'SCRIPT'].includes(parent.tagName)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width && r.height) glyphs.push({ text: node.textContent.trim(), left: r.left, right: r.right });
    }
    const blocks = [...document.querySelectorAll('h1,h2,h3,p,li,a')].filter(visible), overlaps = [];
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      // Descendant text naturally shares its parent's rectangle; only compare
      // separate content blocks and actions, not nested markup.
      if (blocks[i].contains(blocks[j]) || blocks[j].contains(blocks[i])) continue;
      const a = rect(blocks[i]), b = rect(blocks[j]);
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > .1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .1) {
        overlaps.push({ a: blocks[i].textContent.trim(), b: blocks[j].textContent.trim(), aBounds: a, bBounds: b });
      }
    }
    return {
      width: innerWidth, visualWidth: visualViewport?.width, scrollWidth: document.documentElement.scrollWidth,
      title: document.querySelector('h2') ? rect(document.querySelector('h2')) : null,
      links: [...document.querySelectorAll('a[href]')].filter(visible).map(el => ({ href: el.getAttribute('href'), text: el.textContent.trim(), ...rect(el) })),
      text, glyphs, overlaps
    };
  }, genericFooter);
}

for (const width of [320, 360, 390, 600, 1280]) for (const name of names) {
  test(`profile reminder ${name.key} renders safely with one clear action at ${width}px`, async t => {
    const email = reminder(name.datos), html = emailDocument(email.html);
    const result = { test: t.name, width, name: name.key, requests: [], errors: [] };
    results.push(result);
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
    if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => { result.requests.push('WebSocket ' + socket.url()); socket.close(); });
    await context.route('**/*', route => { result.requests.push(route.request().method() + ' ' + route.request().url()); return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('dialog', async dialog => { result.errors.push('Unexpected dialog: ' + dialog.message()); await dialog.dismiss(); });
    t.after(async () => {
      await context.close();
      assert.deepEqual(result.requests, [], 'Email must render without any remote resource or navigation');
      assert.deepEqual(result.errors, [], 'No script or HTML injection can run');
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    result.metrics = await layoutMetrics(page);
    const filename = `recordatorio-perfil-${name.key}-${width}`;
    fs.writeFileSync(path.join(output, filename + '.html'), html, { flag: 'wx' });
    await page.screenshot({ path: path.join(output, filename + '.png'), fullPage: true, animations: 'disabled' });

    assert.equal(email.subject, 'Dale forma a tu perfil en buscARTE');
    assert.equal(await page.locator('h1').textContent(), 'buscARTE', 'The shared brand heading stays intact');
    assert.equal(await page.locator('h2').count(), 1);
    assert.equal(await page.locator('h2').innerText(), 'Mostrá qué hacés.');
    assert.equal(await page.locator('#qa-pwn, [onerror], [onload], script, iframe, object, embed, form').count(), 0);
    assert.equal(await page.evaluate(() => window.__mailInjection), undefined);
    const greeting = page.locator('p').first();
    assert.equal(await greeting.textContent(), 'Hola' + (name.expectedName ? ' ' + name.expectedName : '') + '.', 'Inspect the greeting itself, not incidental text elsewhere in the mail');
    assert.equal(await greeting.locator('strong').count(), name.expectedName ? 1 : 0, 'Missing names use a neutral greeting without an empty or invented name');
    const bodyText = await page.locator('body').innerText();
    assert.doesNotMatch(bodyText, /undefined|\bnull\b|aparecer mejor|aparecen primero|3\s*veces más|te falta poco|casi listo/i);
    assert.match(bodyText, /No hace falta completar todo para empezar/);
    assert.deepEqual(await page.locator('li strong').allTextContents(), ['Una foto', 'Una presentación breve']);
    const metrics = result.metrics;
    assert.equal(metrics.width, width, 'Physical viewport must not auto-expand');
    assert.equal(metrics.visualWidth, width);
    assert.ok(metrics.scrollWidth <= width, JSON.stringify({ viewport: width, scrollWidth: metrics.scrollWidth }));
    assert.equal(await page.locator('a[href]').count(), 1, 'No extra hidden destinations or competing actions');
    assert.equal(metrics.links.length, 1, 'One visible completion action');
    const action = metrics.links[0];
    assert.equal(action.href, fixtureOrigin + '/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar');
    assert.equal(action.text, 'Completar mi perfil');
    assert.ok(action.width >= 44 && action.height >= 44, 'The email action has an exact 44px minimum touch target');
    assert.ok(action.left >= 0 && action.right <= width, JSON.stringify(action));
    assert.ok(metrics.title.bottom <= action.top, 'Heading precedes the profile-completion action');
    assert.deepEqual(metrics.overlaps, [], 'Separate text blocks and actions must not overlap');
    for (const glyph of metrics.glyphs) assert.ok(glyph.left >= -1 && glyph.right <= width + 1, 'Text must not clip or grow the viewport: ' + JSON.stringify(glyph));
    for (const item of metrics.text.filter(item => !item.sharedFooter)) {
      assert.ok(item.fontSize >= 14, 'New content must remain readable: ' + JSON.stringify(item));
      assert.ok(item.contrast >= 4.5, 'All new text must meet 4.5:1 contrast: ' + JSON.stringify(item));
    }
  });
}
