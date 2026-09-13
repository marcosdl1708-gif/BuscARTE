/* Presentación de herramientas por rubro; no valida sesiones ni permisos del servidor. */
(function () {
  'use strict';

  const keys = ['ba_logged', 'ba_user_id', 'ba_tipo_cuenta', 'ba_rubro'];
  let lastState = '';

  function readState() {
    try {
      return keys.map(key => localStorage.getItem(key) || '');
    } catch (_) {
      return [];
    }
  }

  function isMusician(state = readState()) {
    const [logged, uid = '', type, rubro] = state;
    return logged === '1' && /^[1-9]\d*$/.test(uid.trim()) && type === 'artista' && rubro === 'musica';
  }

  function refresh() {
    const state = readState();
    const signature = JSON.stringify(state);
    const changed = lastState !== signature;
    lastState = signature;
    document.documentElement.dataset.musicTools = String(isMusician(state));
    if (changed) window.dispatchEvent(new Event('buscarte:musictoolschange'));
  }

  window.BuscARTEMenu = Object.freeze({ isMusician, refresh });
  refresh();
  document.addEventListener('DOMContentLoaded', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if (!event.key || keys.includes(event.key)) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // storage no se dispara en esta pestaña: releer antes de abrir cualquier menú.
  document.addEventListener('click', event => {
    if (event.target.closest('#nav-avatar-btn, .mbn-item[data-page="perfil"]')) refresh();
  }, true);
})();
