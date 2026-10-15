/* Shared mobile UX fixture: actual public sources, synthetic identities/data,
 * fail-closed network. No listener, preview dependency or real backend call. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4194';
const clone = value => JSON.parse(JSON.stringify(value));
function snapshot() {
  return new Map(JSON.parse(fs.readFileSync(path.join(root, 'site-files.json'), 'utf8'))
    .map(file => [file, fs.readFileSync(path.join(root, file))]));
}
async function setupFixture({ browser, sources = snapshot(), route = 'buscARTE_busqueda.html', width = 390,
  height = 844, user = null, profiles = [], api, init, historyState, storageUnavailable = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 901,
    hasTouch: width < 901, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const state = { user: clone(user), profiles: clone(profiles), calls: [], unexpected: [], errors: [], consoleErrors: [] };
  await context.addInitScript(({ user, historyState, storageUnavailable }) => {
    localStorage.setItem('buscarte_meta_consent_v1', 'denied');
    if (user) {
      for (const [key, value] of Object.entries({ ba_logged: '1', ba_user_id: user.id, ba_name: user.nombre,
        ba_rubro: user.rubro, ba_tipo_cuenta: user.tipo_cuenta })) localStorage.setItem(key, String(value || ''));
    }
    if (historyState) history.replaceState(historyState, '');
    if (storageUnavailable) {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Fixture: disabled.', 'SecurityError'); } });
    }
    window.alert = () => {};
  }, { user, historyState, storageUnavailable });
  if (init) await context.addInitScript(init);
  if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => {
    state.unexpected.push('WebSocket ' + socket.url()); socket.close();
  });
  await context.route('**/*', async routeHandler => {
    const request = routeHandler.request(), url = new URL(request.url()), method = request.method();
    const reply = (body, status = 200) => routeHandler.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === origin && url.pathname === '/.netlify/functions/sesion') {
      state.calls.push({ method, path: 'sesion' });
      if (method === 'GET') return state.user ? reply({ user: state.user }) : reply({ code: 'SESSION_REQUIRED' }, 401);
    }
    if (url.origin === origin && url.pathname === '/.netlify/functions/moderacion' && method === 'GET') {
      state.calls.push({method,path:'moderacion',query:url.search});
      return state.user ? reply({blocked_by_me:false,restricted:false}) : reply({code:'SESSION_REQUIRED'},401);
    }
    if (url.origin === origin && url.pathname === '/.netlify/functions/email-preferences' && method === 'GET') {
      state.calls.push({method,path:'email-preferences'});
      return state.user ? reply({marketing_opt_in:false,onboarding_disabled:false}) : reply({code:'SESSION_REQUIRED'},401);
    }
    if (url.origin === origin && url.pathname === '/.netlify/functions/datos') {
      const raw = url.searchParams.get('path');
      if (!raw || !/^\/rest\/v1\//.test(raw)) { state.unexpected.push('Invalid gateway path'); return routeHandler.abort(); }
      const target = new URL(raw, 'https://fixture.invalid');
      assert.equal(target.origin, 'https://fixture.invalid');
      const call = { method, path: target.pathname, query: target.search,
        ...(request.postData() ? { body: request.postDataJSON() } : {}) };
      state.calls.push(call);
      if (api) {
        const answer = await api({ state, request, url: target, call });
        if (answer !== undefined) return reply(answer.body, answer.status || 200);
      }
      if (method === 'GET' && target.pathname === '/rest/v1/perfiles') {
        let rows = state.profiles;
        const id = target.searchParams.get('id');
        if (id?.startsWith('eq.')) rows = rows.filter(row => String(row.id) === id.slice(3));
        return reply(rows);
      }
      if (method === 'GET' && ['/rest/v1/mensajes', '/rest/v1/conversaciones', '/rest/v1/anuncios',
        '/rest/v1/perfiles_guardados', '/rest/v1/reacciones'].includes(target.pathname)) return reply([]);
      state.unexpected.push(method + ' ' + target.pathname); return routeHandler.abort('blockedbyclient');
    }
    let file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    if (!sources.has(file) && sources.has(file + '.html')) file += '.html';
    if (url.origin === origin && method === 'GET' && sources.has(file) && file !== 'sw.js') {
      const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
        '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
      return routeHandler.fulfill({ contentType: type[path.extname(file)] || 'application/octet-stream', body: sources.get(file) });
    }
    if (url.origin === origin && url.pathname === '/favicon.ico') return routeHandler.fulfill({ status: 204, body: '' });
    if (method === 'GET' && url.hostname === 'fonts.googleapis.com') return routeHandler.fulfill({ contentType: 'text/css', body: '' });
    if (method === 'GET' && url.hostname === 'js.hcaptcha.com') return routeHandler.fulfill({ contentType: 'application/javascript', body: '// Provider never contacted.' });
    state.unexpected.push(method + ' ' + url.origin + url.pathname); return routeHandler.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') state.consoleErrors.push(message.text()); });
  const close = async () => {
    try {
      assert.deepEqual(state.unexpected, [], 'All network fulfilled locally; no unforeseen request');
      assert.deepEqual(state.errors, [], 'No unhandled browser exception');
    } finally { await context.close(); }
  };
  await page.goto(origin + '/' + route, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return { page, context, state, close, sources };
}
module.exports = { setupFixture, snapshot, origin, root, clone };
