/* Chat link regression: public source, synthetic users/messages, fail-closed HTTP.
 * No listener, external navigation, live account, backend, email or database. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');
const { snapshot, setupFixture, root } = require('./mobile-ux-fixture.cjs');

const sources = snapshot();
const html = sources.get('buscARTE_mensajes.html').toString();
const helpers = html.match(/  function escapeHTML\(value\)\s*\{[\s\S]*?(?=  function normalizeId\()/)?.[0];
assert.ok(helpers && /function formatChatMessage\(/.test(helpers), 'Extract the real message formatter beside escapeHTML');
const sandbox = vm.createContext({ URL });
vm.runInContext(helpers + '\nthis.format = formatChatMessage; this.escape = escapeHTML;', sandbox);
const format = value => sandbox.format(value);
const escape = value => sandbox.escape(value);
const anchors = output => [...output.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
const tester = 'https://play.google.com/apps/testing/ar.com.buscarte.app';
const longLink = 'https://example.test/convocatoria/' + 'proyecto-'.repeat(30) + '?origen=chat&modo=prueba#inscripcion';
const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT || path.join(root, '..', 'BuscARTE-resguardos',
  'chat-links-' + new Date().toISOString().replace(/[:.]/g, '-')));
assert.ok(output !== path.join(root, 'dist') && !output.startsWith(path.join(root, 'dist') + path.sep));
fs.mkdirSync(output, { recursive: true });
let browser;
const findings = [];
before(async () => { browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => {
  await browser?.close();
  const sourceDrift = [...sources.keys()].filter(file => !fs.readFileSync(path.join(root, file)).equals(sources.get(file)));
  assert.deepEqual(sourceDrift, [], 'All public sources stayed frozen throughout the final run');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
    source: 'buscARTE_mensajes.html', sourceSha256: require('node:crypto').createHash('sha256').update(html).digest('hex'),
    findings, sourceDrift, scope: 'Synthetic users and messages only; all HTTP fulfilled locally; no production writes.' }, null, 2));
  console.log('Chat links evidence: ' + output);
});

test('plain values retain escaping and line breaks without interpreting HTML', () => {
  assert.equal(format(null), ''); assert.equal(format(undefined), '');
  assert.equal(format(42), '42'); assert.equal(format('Hola\nSegunda línea'), 'Hola<br>Segunda línea');
  for (const text of ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"\' & < >',
    '&lt;script&gt;alert(1)&lt;/script&gt;', '<a href="https://example.test">texto</a>']) {
    const rendered = format(text);
    assert.doesNotMatch(rendered, /<(?:script|img|iframe|svg|object)\b/i);
    assert.ok(rendered.includes(escape(text).split('https://')[0]), 'Raw HTML is text, not input markup');
  }
});

for (const [name, text, hrefs] of [
  ['tester Android', tester, [tester]],
  ['HTTP is not silently rewritten', 'http://example.test/contacto', ['http://example.test/contacto']],
  ['www defaults to HTTPS', 'Entrá a www.example.test/taller?dia=1&turno=2#reserva', ['https://www.example.test/taller?dia=1&turno=2#reserva']],
  ['multiple destinations', tester + '\nhttps://groups.google.com/g/buscarte-testers', [tester, 'https://groups.google.com/g/buscarte-testers']],
  ['query and hash', 'https://example.test/?a=1&b=dos#seccion', ['https://example.test/?a=1&b=dos#seccion']],
  ['encoded delimiters', 'https://example.test/?x=%22%3E%3Cimg%20src=x%3E', ['https://example.test/?x=%22%3E%3Cimg%20src=x%3E']],
  ['balanced parentheses', 'https://example.test/Obra_(ensayo)', ['https://example.test/Obra_(ensayo)']],
  ['nested parentheses', 'https://example.test/Obra_(ensayo_(lunes))', ['https://example.test/Obra_(ensayo_(lunes))']],
  ['surrounding parentheses', '(https://example.test/taller)', ['https://example.test/taller']],
  ['closing brackets outside destination', '[https://example.test/taller]', ['https://example.test/taller']],
  ['closing braces outside destination', '{https://example.test/taller}', ['https://example.test/taller']],
  ['newline between URLs', 'https://example.test/uno\nhttps://example.test/dos', ['https://example.test/uno', 'https://example.test/dos']],
  ['long URL', longLink, [longLink]],
]) test('formatter: ' + name, () => {
  const result = anchors(format(text));
  assert.deepEqual(result.map(match => match[1]), hrefs.map(escape));
  assert.equal(result.length, hrefs.length);
  for (const [index, match] of result.entries()) {
    assert.match(match[0], /\bclass="msg-link"/);
    assert.match(match[0], /\btarget="_blank"/);
    assert.match(match[0], /\breferrerpolicy="no-referrer"/);
    const rel = match[0].match(/\brel="([^"]+)"/)?.[1].split(/\s+/).sort();
    assert.deepEqual(rel, ['noopener', 'noreferrer', 'nofollow', 'ugc'].sort());
    assert.ok(match[2], 'Link has visible text');
    assert.equal(new URL(hrefs[index]).username, '');
  }
});

for (const punctuation of ['.', ',', '!', '?', ';', ':', ').', '].', '}.'])
  test('terminal prose stays outside URL: ' + punctuation, () => {
    const text = tester + punctuation;
    const result = format(text);
    assert.equal(anchors(result)[0]?.[1], tester);
    assert.ok(result.endsWith('</a>' + escape(punctuation)));
  });

for (const text of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'mailto:hola@example.test',
  'ftp://example.test/archivo', '//example.test/archivo', 'https://', 'www.',
  'https://user:password@example.test/private', 'https://user@example.test/private',
  'https://example.test@evil.test/', 'http://999.999.999.999/path'])
  test('unsafe or unsupported destination stays plain: ' + text, () => {
    assert.equal(format(text), escape(text));
    assert.equal(anchors(format(text)).length, 0);
  });

test('quotes cannot create attributes, and entity spellings are never decoded', () => {
  const rendered = format('https://example.test/" onclick="alert(1) <img src=x onerror=alert(1)> &quot; &amp;');
  assert.doesNotMatch(rendered, /\sonclick="alert/);
  assert.doesNotMatch(rendered, /<img\b/);
  assert.match(rendered, /&quot;/); assert.match(rendered, /&amp;quot;/); assert.match(rendered, /&amp;amp;/);
  assert.equal(anchors(rendered).length, 1);
});

test('www inside an email or word is not mistaken for a separate destination', () => {
  for (const text of ['persona@www.example.test', 'prefixwww.example.test', '_www.example.test']) {
    assert.equal(format(text), escape(text));
    assert.equal(anchors(format(text)).length, 0);
  }
});

const me = { id: 1, nombre: 'Cuenta de ejemplo', tipo_cuenta: 'artista', rubro: 'musica', baneado: false };
const people = [me, { id: 2, nombre: 'Artista de ejemplo', tipo_cuenta: 'artista', rubro: 'musica', instrumento: 'Guitarra', ciudad: 'Buenos Aires', baneado: false }];
const originalMessages = [
  { id: 91, de_user_id: 1, para_user_id: 2, contenido: '¡Gracias por sumarte a la prueba de buscARTE!\nAbrí este enlace para convertirte en tester:\n' + tester, created_at: '2026-10-18T15:00:00Z' },
  { id: 92, de_user_id: 2, para_user_id: 1, contenido: 'Recibido. Mi proyecto: www.example.test/portfolio?obra=1&edicion=2#fotos', created_at: '2026-10-18T15:01:00Z' },
  { id: 93, de_user_id: 2, para_user_id: 1, contenido: 'Un enlace largo para probar el ajuste:\n' + longLink, created_at: '2026-10-18T15:02:00Z' },
  { id: 94, de_user_id: 2, para_user_id: 1, contenido: '<img src=x onerror="window.__xss=1">\njavascript:alert(1)\ndata:text/html,<svg onload=alert(1)>', created_at: '2026-10-18T15:03:00Z' },
];
async function chat(t, width) {
  const messages = structuredClone(originalMessages);
  const fixture = await setupFixture({ browser, sources, route: 'buscARTE_mensajes.html?conv=10', width,
    height: width === 1440 ? 900 : 844, user: me, profiles: people,
    api: async ({ call }) => {
      if (call.method === 'GET' && call.path === '/rest/v1/conversaciones') return { body: [{ id: 10, user1_id: 1, user2_id: 2,
        ultimo_mensaje: tester, updated_at: '2026-10-18T15:03:00Z' }] };
      if (call.method === 'GET' && call.path === '/rest/v1/mensajes') return { body: messages };
      // Sending is explicitly not exercised by this rendering-only regression.
    } });
  const { page, state } = fixture;
  t.after(async () => {
    assert.deepEqual(messages, originalMessages, 'Existing stored message fixtures are not rewritten');
    assert.ok(state.calls.every(call => call.method === 'GET'), 'Viewing and opening links does not post, patch or send');
    await fixture.close();
  });
  await page.locator('.msg.sent .msg-link').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.ba-mod')?.dataset.status === 'allowed');
  return fixture;
}

for (const width of [320, 390, 1440]) test(`${width}px: existing sent/received links are usable, safe and wrap without changing composer`, async t => {
  const { page, context, state } = await chat(t, width);
  const testerLink = page.locator('.msg.sent .msg-link').first();
  const receivedLink = page.locator('.msg.received .msg-link').first();
  assert.equal(await testerLink.getAttribute('href'), tester);
  assert.equal(await testerLink.textContent(), tester);
  assert.equal(await receivedLink.getAttribute('href'), 'https://www.example.test/portfolio?obra=1&edicion=2#fotos');
  assert.equal(await page.locator('.conv-preview a').count(), 0, 'Conversation preview stays non-interactive');
  assert.equal(await page.locator('.msg-bubble img,.msg-bubble script,.msg-bubble svg').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('.msg-link').count(), 3);
  const beforeMessages = await page.locator('#chat-messages').textContent();
  const draft = 'Borrador sin enviar: <texto> https://example.test/no-enviar';
  await page.locator('#chat-input').fill(draft);
  assert.equal(await page.locator('#chat-send-btn').isDisabled(), false);
  for (const locator of [testerLink, receivedLink]) {
    const attrs = await locator.evaluate(el => ({ target: el.target, rel: [...el.relList].sort(), referrer: el.referrerPolicy,
      decoration: getComputedStyle(el).textDecorationLine, overflowWrap: getComputedStyle(el).overflowWrap }));
    assert.equal(attrs.target, '_blank'); assert.equal(attrs.referrer, 'no-referrer');
    assert.deepEqual(attrs.rel, ['nofollow', 'noopener', 'noreferrer', 'ugc'].sort());
    assert.match(attrs.decoration, /underline/, 'Links do not rely on color alone');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const fit = await page.locator('.msg-link').evaluateAll(nodes => nodes.map(el => {
    const box = el.getBoundingClientRect(), parent = el.closest('.msg-bubble').getBoundingClientRect();
    return { left: box.left, right: box.right, parentLeft: parent.left, parentRight: parent.right, viewport: innerWidth };
  }));
  for (const bounds of fit) assert.ok(bounds.left >= bounds.parentLeft - 1 && bounds.right <= bounds.parentRight + 1 && bounds.right <= width + 1,
    'Even a long destination stays inside its message bubble and viewport: ' + JSON.stringify(bounds));

  // The popup is served by this local fixture, never by Google or another destination.
  await context.route(tester, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destino de prueba aislado</title><p>Sin tráfico externo</p>' }));
  await testerLink.scrollIntoViewIfNeeded();
  await testerLink.focus();
  assert.equal(await testerLink.evaluate(el => el === document.activeElement), true);
  const focusStyle = await testerLink.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
  assert.notEqual(focusStyle.style, 'none', 'Keyboard focus stays visible');
  assert.notEqual(focusStyle.width, '0px', 'Keyboard focus has a visible width');
  const popupReady = page.waitForEvent('popup');
  await testerLink.press('Enter');
  const popup = await popupReady; await popup.waitForLoadState('load');
  assert.equal(popup.url(), tester);
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  assert.equal(await popup.evaluate(() => document.referrer), '');
  await popup.close();
  const tappedReady = page.waitForEvent('popup');
  if (width < 901) await testerLink.tap(); else await testerLink.click();
  const tapped = await tappedReady; await tapped.waitForLoadState('load');
  assert.equal(tapped.url(), tester);
  assert.equal(await tapped.evaluate(() => window.opener === null && document.referrer === ''), true);
  await tapped.close();
  assert.equal(await page.locator('#chat-input').inputValue(), draft);
  assert.equal(await page.locator('#chat-send-btn').isDisabled(), false);
  assert.equal(await page.locator('#chat-messages').textContent(), beforeMessages);
  assert.ok(state.calls.every(call => call.method === 'GET'));
  await testerLink.scrollIntoViewIfNeeded();
  await page.locator('#chat-panel').screenshot({ path: path.join(output, `chat-links-${width}.png`), animations: 'disabled' });
  await page.locator('.msg.sent').first().screenshot({ path: path.join(output, `tester-message-${width}.png`), animations: 'disabled' });
  findings.push({ width, links: 3, priorSentAndReceived: true, securePopupKeyboard: true,
    securePopupPointer: width < 901 ? 'touch' : 'click', draftUnchanged: true, noOverflow: true, calls: state.calls.length });
});

test('rerendering existing history adds links without rewriting stored text or draft', async t => {
  const { page } = await chat(t, 390);
  await page.locator('#chat-input').fill('Mi respuesta pendiente');
  const prior = await page.locator('.msg.sent .msg-bubble').textContent();
  await page.evaluate(messages => renderMensajes(messages), originalMessages);
  assert.equal(await page.locator('.msg.sent .msg-bubble').textContent(), prior);
  assert.equal(await page.locator('.msg.sent .msg-link').getAttribute('href'), tester);
  assert.equal(await page.locator('.msg.received .msg-link').count(), 2);
  assert.equal(await page.locator('#chat-input').inputValue(), 'Mi respuesta pendiente');
});
