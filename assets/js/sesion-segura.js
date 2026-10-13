/* La caché ba_* es presentación. La identidad y los permisos se verifican en servidor. */
(function () {
  'use strict';
  if (window.BuscARTESesion) return;
  const nativeFetch = window.fetch.bind(window);
  const databaseOrigin = 'https://xiaanchoanxmampegoay.supabase.co';
  const identityKeys = ['ba_logged', 'ba_user_id', 'ba_name', 'ba_email', 'ba_tipo_cuenta', 'ba_rubro', 'ba_referentes', 'ba_generos'];
  const privatePages = new Set(['buscARTE_perfil.html', 'buscARTE_mensajes.html', 'buscARTE_guardados.html', 'buscARTE_mis_anuncios.html', 'buscARTE_generador.html']);
  const pagePaths = new Map(['index','buscARTE_index','buscARTE_anuncio_detalle','buscARTE_anuncios','buscARTE_busqueda','buscARTE_contacto','buscARTE_generador','buscARTE_guardados','buscARTE_login','buscARTE_mensajes','buscARTE_mis_anuncios','buscARTE_perfil','buscARTE_perfil_publico','buscARTE_privacidad','buscARTE_recuperar','buscARTE_registro','buscARTE_reset','buscARTE_seguridad_infantil','buscARTE_terminos'].map(name => ['/' + name.toLowerCase(), name + '.html']));
  let user = null;
  let status = 'pending';
  let denialReason = 'expired';
  let sequence = 0;
  let logoutPending = false;
  let refreshPending = null;
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function write(key, value) { try { localStorage.setItem(key, String(value ?? '')); } catch (_) {} }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function validUser(value) { return value && /^[1-9]\d*$/.test(String(value.id || '')) && value.baneado !== true; }
  function currentPage() {
    const path = location.pathname.replace(/\/+$/, '').replace(/\.html$/i, '').toLowerCase();
    return path ? pagePaths.get(path) || '' : 'index.html';
  }
  function hasDraft() {
    if (currentPage() !== 'buscARTE_perfil.html') return false;
    try { if (typeof profileEditRevision !== 'undefined' && profileEditRevision > 0) return true; } catch (_) {}
    return !!document.getElementById('save-bar')?.classList.contains('visible');
  }
  function returnUrl() { return (currentPage() || 'index.html') + location.search + location.hash; }
  function signInUrl(reason) {
    return 'buscARTE_login.html?session=' + encodeURIComponent(reason || 'expired') + '&redirect=' + encodeURIComponent(returnUrl());
  }
  function projectNavigation() {
    if (!['verified','anonymous'].includes(status)) return;
    const signedIn = status === 'verified' && !!user;
    const guest = document.getElementById('nav-guest');
    const account = document.getElementById('nav-user');
    if (guest) guest.style.display = signedIn ? 'none' : 'flex';
    if (account) account.style.display = signedIn ? 'flex' : 'none';
    if (signedIn) {
      const name = document.getElementById('nav-avatar-name');
      const initials = document.getElementById('nav-avatar-circle');
      if (name) name.textContent = (user.nombre || 'Mi cuenta').trim().split(/\s+/)[0];
      if (initials) initials.textContent = (user.nombre || 'Mi cuenta').trim().split(/\s+/).map(part => part[0]).join('').toUpperCase().slice(0,2);
    }
    for (const link of document.querySelectorAll?.('#mbnp-perfil, .nav-dropdown-item[href*="perfil_publico"]') || []) {
      link.href = signedIn ? 'buscARTE_perfil_publico.html?id=' + encodeURIComponent(user.id) : signInUrl('expired');
    }
    window.BuscARTEMenu?.refresh();
    window.BuscARTEInicio?.refresh();
  }
  function emit() {
    projectNavigation();
    window.dispatchEvent(new CustomEvent('buscarte:sessionchange', { detail: { status, user } }));
    window.dispatchEvent(new Event('storage'));
  }
  function notice(text, reason, preserveDraft) {
    const draw = () => {
      let element = document.getElementById('ba-session-notice');
      if (!element) {
        element = document.createElement('aside');
        element.id = 'ba-session-notice'; element.setAttribute('role', 'status');
        element.style.cssText = 'position:relative;z-index:1005;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 20px;background:#1c2421;color:#f5f5ed;border-bottom:1px solid #8ea397;font:14px/1.5 sans-serif';
        document.body.prepend(element);
      }
      element.replaceChildren(document.createTextNode(text + ' '));
      const link = document.createElement('a');
      link.href = signInUrl(reason); link.textContent = 'Volver a ingresar';
      link.style.cssText = 'color:#e3fb72;min-height:44px;display:inline-flex;align-items:center;text-decoration:underline';
      if (preserveDraft) { link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Ingresar en otra pestaña y volver'; }
      element.append(link);
    };
    if (document.body) draw(); else document.addEventListener('DOMContentLoaded', draw, { once: true });
  }
  function cacheUser(value) {
    const previous = read('ba_user_id');
    if (previous && previous !== String(value.id)) ['ba_msg_last_seen', 'ba_msg_read_by_user', 'ba_after_login'].forEach(remove);
    write('ba_user_id', value.id); write('ba_name', value.nombre || ''); write('ba_email', value.email || '');
    write('ba_tipo_cuenta', value.tipo_cuenta || ''); write('ba_rubro', value.rubro || '');
    write('ba_referentes', value.referentes || ''); write('ba_generos', value.generos || ''); write('ba_logged', '1');
  }
  function clearIdentity() { identityKeys.forEach(remove); user = null; }
  async function sessionRequest(options = {}) {
    // AbortSignal.timeout no está disponible en todos los navegadores de celular.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await nativeFetch('/.netlify/functions/sesion', { ...options, credentials:'same-origin', cache:'no-store', redirect:'error', signal:controller.signal });
      // Mantener el límite también mientras llega el cuerpo en conexiones móviles.
      const text = await response.text();
      let data = null; try { data = JSON.parse(text); } catch (_) {}
      return { response, data };
    } finally { clearTimeout(timer); }
  }
  function expired(reason, redirect) {
    denialReason = reason || 'expired';
    const previouslyKnown = read('ba_logged') === '1';
    const preserveDraft = hasDraft();
    status = 'anonymous'; clearIdentity(); emit();
    if (preserveDraft) {
      notice('Tu sesión venció. Conservamos los cambios del formulario; ingresá en otra pestaña y después volvé acá.', reason, true);
      return;
    }
    if (previouslyKnown || privatePages.has(currentPage())) {
      notice(reason === 'upgrade' ? 'Actualizamos la seguridad. Ingresá una vez para proteger tu cuenta; no necesitás registrarte otra vez.' : 'Tu sesión venció. Volvé a ingresar para continuar.', reason, false);
    }
    if (redirect && privatePages.has(currentPage())) location.replace(signInUrl(reason));
  }
  async function verify(options = {}) {
    const current = ++sequence;
    const previous = [read('ba_user_id'), read('ba_tipo_cuenta'), read('ba_rubro')].join('|');
    try {
      const { response, data } = await sessionRequest();
      if (current !== sequence) return user;
      if (response.status === 401) { expired(options.reason || 'upgrade', options.redirect === true); return null; }
      if (!response.ok) throw new Error('Session unavailable');
      if (!validUser(data?.user)) { expired(options.reason || 'expired', options.redirect === true); return null; }
      status = 'verified'; user = data.user; cacheUser(user); emit();
      document.getElementById('ba-session-notice')?.remove();
      const next = [String(user.id), user.tipo_cuenta || '', user.rubro || ''].join('|');
      // Las páginas históricas capturan estos valores al iniciar. Recalcular antes de
      // mostrar otra cuenta; nunca perder un formulario en curso por renovar la sesión.
      if (options.reload !== false && previous !== next && !hasDraft()) location.reload();
      return user;
    } catch (_) {
      if (current === sequence) { status = 'unavailable'; notice('No pudimos verificar tu sesión. Revisá la conexión y recargá la página; no enviamos cambios sin verificarla.', 'unavailable', hasDraft()); }
      return null;
    }
  }
  const ready = verify({ reload:true });
  async function requireUser(id) {
    await ready;
    if (status === 'unavailable') return null;
    if (status !== 'verified' || !user) { expired(denialReason, true); return null; }
    if (id != null && String(id) !== String(user.id)) return null;
    return user;
  }
  async function refresh() {
    if (!refreshPending) refreshPending = verify({ reason:'expired' }).finally(() => { refreshPending = null; });
    return refreshPending;
  }
  async function logout(destination = 'index.html') {
    if (logoutPending) return false;
    logoutPending = true;
    try {
      const { response } = await sessionRequest({ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'logout'}) });
      if (!response.ok) throw new Error('Logout unavailable');
      ++sequence; status = 'anonymous'; clearIdentity();
      ['ba_msg_last_seen', 'ba_msg_read_by_user', 'ba_after_login'].forEach(remove); emit();
      location.href = destination; return true;
    } catch (_) {
      notice('No pudimos cerrar la sesión de forma segura. Revisá la conexión y volvé a intentarlo.', 'unavailable', hasDraft());
      return false;
    } finally { logoutPending = false; }
  }
  function gatewayPath(url, method) {
    if (url.origin !== databaseOrigin || url.username || url.password) return '';
    if (url.pathname.startsWith('/rest/v1/')) return url.pathname + url.search;
    if (url.pathname.startsWith('/storage/v1/object/') && !(method === 'GET' && url.pathname.startsWith('/storage/v1/object/public/'))) return url.pathname + url.search;
    return '';
  }
  window.fetch = async function (input, options) {
    const original = input instanceof Request ? input : null;
    const init = options || {};
    const url = new URL(original ? original.url : String(input), location.href);
    const method = String(init.method || original?.method || 'GET').toUpperCase();
    const path = gatewayPath(url, method);
    if (!path) {
      const response = await nativeFetch(input, options);
      if (url.origin === location.origin && url.pathname === '/.netlify/functions/guardar-perfil' && response.status === 401) expired('expired', true);
      return response;
    }
    await ready;
    const authRoute = path.split('?')[0];
    const isAuthRoute = ['/rest/v1/rpc/login_usuario', '/rest/v1/rpc/registrar_usuario'].includes(authRoute);
    if (status === 'unavailable' && !isAuthRoute && !['GET','HEAD'].includes(method)) {
      return new Response(JSON.stringify({error:'No pudimos verificar tu sesión. Recargá antes de enviar cambios.'}), {status:503,headers:{'Content-Type':'application/json'}});
    }
    const headers = new Headers(init.headers || original?.headers);
    const safeHeaders = new Headers();
    for (const key of ['Content-Type', 'Prefer']) if (headers.has(key)) safeHeaders.set(key, headers.get(key));
    if (path.startsWith('/storage/v1/object/fotos-perfil/') && headers.has('x-upsert')) safeHeaders.set('x-upsert', headers.get('x-upsert'));
    let body = init.body;
    if (body === undefined && original && !['GET','HEAD'].includes(method)) body = await original.clone().blob();
    const response = await nativeFetch('/.netlify/functions/datos?path=' + encodeURIComponent(path), {
      method, headers:safeHeaders, ...(body != null ? {body} : {}),
      signal:init.signal || original?.signal, credentials:'same-origin', cache:'no-store', redirect:'error'
    });
    if (isAuthRoute && response.ok) {
      let result; try { result = await response.clone().json(); } catch (_) {}
      const candidate = Array.isArray(result) ? result[0] : result;
      if (validUser(candidate) && !candidate.error) {
        const verified = await verify({reload:false});
        if (!verified || String(verified.id) !== String(candidate.id)) {
          if (authRoute.endsWith('/registrar_usuario')) {
            const pending = { ...candidate, session_pending:true };
            return new Response(JSON.stringify(Array.isArray(result) ? [pending] : pending), {status:response.status,headers:{'Content-Type':'application/json'}});
          }
          return new Response(JSON.stringify({error:'No pudimos confirmar la sesión. Revisá la conexión y volvé a ingresar.'}), {status:503,headers:{'Content-Type':'application/json'}});
        }
      }
    } else if (!isAuthRoute && response.status === 401) expired('expired', true);
    return response;
  };
  window.BuscARTESesion = Object.freeze({ ready, require:requireUser, refresh, logout, get user() { return user; }, get status() { return status; } });
  document.addEventListener('DOMContentLoaded', projectNavigation);
  window.addEventListener('focus', () => { if (status !== 'pending' && !logoutPending) refresh(); });
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
})();
