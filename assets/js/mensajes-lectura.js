/* Lectura confirmada por el servidor. Sin fechas locales ni permisos inferidos. */
(function () {
  'use strict';
  if (window.BuscARTELectura) return;
  const validId = value => /^[1-9]\d{0,14}$/.test(String(value || ''));
  let epoch = 0, pending = null, badgeSequence = 0, badgeOwner = '', knownUser = '', channel = null;
  function uid() {
    const session = window.BuscARTESesion;
    return session?.status === 'verified' && validId(session.user?.id) ? String(session.user.id) : '';
  }
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/.netlify/functions/datos?path=' + encodeURIComponent(path), {
        ...options, credentials:'same-origin', cache:'no-store', redirect:'error', signal:controller.signal
      });
      if (!response.ok) throw new Error('No pudimos confirmar la lectura.');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function invalidate() { epoch++; pending = null; }
  async function unread() {
    const user = uid();
    if (!user) throw new Error('Sesión no verificada.');
    const version = epoch, key = user + ':' + version;
    if (pending?.key === key) return pending.promise;
    const entry = {key};
    entry.promise = (async () => {
      const params = new URLSearchParams({para_user_id:'eq.' + user,
        or:'(leido.eq.false,leido.is.null)', select:'id,de_user_id,para_user_id,created_at,leido',
        order:'created_at.desc,id.desc', limit:'999'});
      const rows = await request('/rest/v1/mensajes?' + params);
      if (uid() !== user) throw new Error('La cuenta cambió.');
      // A read started before a confirmed PATCH cannot resurrect its old badge.
      if (version !== epoch) return unread();
      if (!Array.isArray(rows) || rows.some(row => !row || !validId(row.id) || !validId(row.de_user_id) ||
          String(row.para_user_id) !== user || ![true,false,null].includes(row.leido))) throw new Error('Lecturas no confirmadas.');
      return rows.filter(row => row.leido !== true);
    })().finally(() => { if (pending === entry) pending = null; });
    pending = entry;
    return entry.promise;
  }
  async function mark(values) {
    const user = uid();
    if (!user) throw new Error('Sesión no verificada.');
    if (!Array.isArray(values) || !values.length || values.length > 100 || values.some(value => !validId(value))) throw new Error('Mensajes inválidos.');
    const ids = values.map(String);
    if (new Set(ids).size !== ids.length) throw new Error('Mensajes duplicados.');
    const params = new URLSearchParams({id:'in.(' + ids.join(',') + ')', select:'id,leido'});
    const rows = await request('/rest/v1/mensajes?' + params, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({leido:true})
    });
    if (uid() !== user) return [];
    if (!Array.isArray(rows) || rows.some(row => !row || !ids.includes(String(row.id)) || row.leido !== true) ||
        new Set(rows.map(row => String(row.id))).size !== rows.length) throw new Error('Lectura no confirmada.');
    if (rows.length) invalidate();
    return rows.map(row => String(row.id));
  }
  function clearBadge() {
    const badge = document.getElementById('nav-msg-badge');
    if (badge) { badge.textContent = ''; badge.style.display = 'none'; badge.removeAttribute('title'); }
    badgeOwner = '';
  }
  async function refreshBadge() {
    const sequence = ++badgeSequence, user = uid();
    if (!user) { clearBadge(); return; }
    if (badgeOwner && badgeOwner !== user) clearBadge();
    const badge = document.getElementById('nav-msg-badge');
    if (!badge || document.hidden) return;
    try {
      const rows = await unread();
      if (sequence !== badgeSequence || uid() !== user) return;
      badgeOwner = user;
      badge.textContent = rows.length > 99 ? '99+' : String(rows.length);
      badge.style.display = rows.length ? 'inline-block' : 'none';
      badge.removeAttribute('title');
    } catch (_) {
      if (sequence !== badgeSequence || uid() !== user) return;
      // Keep a previously confirmed pending count on a transient error; never
      // claim that messages became read just because a request failed.
      if (badgeOwner !== user) clearBadge();
      else badge.title = 'No pudimos actualizar los mensajes pendientes.';
    }
  }
  function emit() {
    const user = uid();
    if (!user) return;
    window.dispatchEvent(new CustomEvent('buscarte:lecturachange', {detail:{userId:user}}));
    refreshBadge();
  }
  function changed() {
    invalidate(); emit();
    const user = uid();
    if (user) { try { channel?.postMessage({userId:user}); } catch (_) {} }
  }
  window.BuscARTELectura = Object.freeze({unread,mark,refreshBadge,changed});
  function init() {
    knownUser = uid();
    try {
      channel = new BroadcastChannel('buscarte-lectura-v1');
      channel.addEventListener('message', event => {
        if (uid() && event.data?.userId === uid()) { invalidate(); emit(); }
      });
    } catch (_) {}
    window.addEventListener('buscarte:sessionchange', () => {
      const next = uid();
      if (next !== knownUser) { knownUser = next; invalidate(); clearBadge(); }
      refreshBadge();
    });
    window.addEventListener('pageshow', refreshBadge);
    window.addEventListener('focus', refreshBadge);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadge(); });
    Promise.resolve(window.BuscARTESesion?.ready).then(refreshBadge).catch(clearBadge);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
