import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// GET-only verification. Never executes HTML, service workers, functions or RPCs.
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = new URL(process.env.BUSCARTE_DEPLOY_URL || '');
assert.equal(origin.protocol, 'https:');
assert.equal(origin.pathname, '/');
assert.equal(origin.search + origin.hash + origin.username + origin.password, '');
const files = JSON.parse(await readFile(path.join(root, 'site-files.json'), 'utf8'));
const redirects = (await readFile(path.join(root, '_redirects'), 'utf8')).split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .map(line => { const [from, to, status] = line.split(/\s+/); return { from, to, status: Number(status) }; });
const allowed = new Set(['/']);
for (const file of files) {
  allowed.add('/' + file);
  if (file.endsWith('.html')) allowed.add('/' + file.slice(0, -5));
}
for (const rule of redirects) { allowed.add(rule.from); allowed.add(rule.to); }
// Netlify Pretty URLs redirects these mixed-case HTML names to lowercase.
for (const file of [...allowed]) allowed.add(file.toLowerCase());
const nonPublic = ['/README.md', '/docs/qa-anuncios-20260905.md', '/package.json', '/scripts/build-site.mjs'];
nonPublic.forEach(file => allowed.add(file));
const sha1 = bytes => createHash('sha1').update(bytes).digest('hex');
let parserPromise;
async function canonicalHtml(body) {
  parserPromise ||= (async () => {
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    return { browser, page };
  })();
  const { page } = await parserPromise;
  return page.evaluate(({ html, files }) => {
    // Inert parser: this document is never attached or executed. Netlify's
    // existing Pretty URLs processing rewrites links and reorders attributes.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const known = new Set(files.map(file => '/' + file.toLowerCase()));
    for (const anchor of doc.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      if (!href || /^(?:[a-z]+:|\/\/|#)/i.test(href)) continue;
      const url = new URL(href, 'https://static-check.invalid/');
      if (known.has(url.pathname.toLowerCase()) && url.pathname.endsWith('.html')) {
        const clean = url.pathname.toLowerCase() === '/index.html' ? '/' : url.pathname.toLowerCase().slice(0, -5);
        anchor.setAttribute('href', clean + url.search + url.hash);
      }
    }
    for (const node of doc.querySelectorAll('*')) {
      const attrs = [...node.attributes].map(attr => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b));
      for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
      for (const [name, value] of attrs) node.setAttribute(name, value);
    }
    return doc.documentElement.outerHTML;
  }, { html: body.toString('utf8'), files });
}

async function get(file) {
  let target = new URL(file, origin);
  const hops = [];
  for (let i = 0; i < 8; i++) {
    assert.equal(target.origin, origin.origin, 'Redirect must stay on the selected deploy');
    assert.ok(allowed.has(target.pathname), 'Only explicitly scoped static paths may be fetched: ' + target.pathname);
    assert.equal(target.search + target.hash, '');
    const response = await fetch(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000) });
    hops.push({ path: target.pathname, status: response.status });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      assert.ok(location, 'Redirect has a Location');
      await response.body?.cancel();
      target = new URL(location, target);
      continue;
    }
    return { status: response.status, type: response.headers.get('content-type'), hops,
      body: Buffer.from(await response.arrayBuffer()) };
  }
  throw new Error('Redirect loop or more than eight hops: ' + file);
}

const report = { origin: origin.origin, checkedAt: new Date().toISOString(), files: [], redirects: [], excluded: [] };
const publicFiles = files.filter(file => file !== '_redirects');
try {
for (let i = 0; i < publicFiles.length; i += 4) {
  await Promise.all(publicFiles.slice(i, i + 4).map(async file => {
    const response = await get('/' + file);
    assert.equal(response.status, 200, file + ' is served');
    const local = await readFile(path.join(root, 'dist', file));
    const expected = sha1(local);
    const actual = sha1(response.body);
    let comparison = 'exact-bytes';
    if (actual !== expected && file.endsWith('.html')) {
      assert.equal(sha1(await canonicalHtml(response.body)), sha1(await canonicalHtml(local)),
        file + ' must match after only known Pretty URLs and inert HTML serialization');
      comparison = 'html-pretty-urls-normalized';
    } else assert.equal(actual, expected, file + ' must match the reviewed build byte for byte');
    report.files.push({ file, bytes: response.body.length, sha1: actual, localSha1: expected, comparison, hops: response.hops });
  }));
}
for (let i = 0; i < redirects.length; i += 4) {
  await Promise.all(redirects.slice(i, i + 4).map(async rule => {
    const response = await get(rule.from);
    assert.equal(response.status, 200, rule.from + ' resolves without a loop');
    const shadowsStatic = publicFiles.some(file => ('/' + file.replace(/\.html$/, '')).toLowerCase() === rule.from.toLowerCase());
    // Existing rules are not forced: a matching Pretty URL can serve its file
    // directly instead of taking a legacy case-correction redirect.
    if (rule.status === 301 && !shadowsStatic) assert.equal(response.hops[0].status, 301, rule.from + ' keeps its redirect');
    report.redirects.push({ from: rule.from, hops: response.hops });
  }));
}
for (const file of nonPublic) {
  const response = await get(file);
  assert.equal(response.status, 404, file + ' must not be published');
  report.excluded.push({ file, status: response.status });
}
report.files.sort((a, b) => a.file.localeCompare(b.file));
report.redirects.sort((a, b) => a.from.localeCompare(b.from));
if (process.env.BUSCARTE_VERIFY_REPORT) {
  const output = path.resolve(process.env.BUSCARTE_VERIFY_REPORT);
  const relative = path.relative(path.join(root, 'dist'), output);
  assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Report must be outside dist');
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ origin: report.origin, files: report.files.length,
  redirects: report.redirects.length, excluded: report.excluded.length, verified: true }));
} finally {
  if (parserPromise) await (await parserPromise).browser.close();
}
