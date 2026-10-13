/* Presentación de herramientas por rubro; no valida sesiones ni permisos del servidor. */
(function () {
  'use strict';

  const keys = ['ba_logged', 'ba_user_id', 'ba_tipo_cuenta', 'ba_rubro', 'ba_disciplinas'];
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
    if (logged !== '1' || !/^[1-9]\d*$/.test(uid.trim()) || type !== 'artista') return false;
    const verified = window.BuscARTESesion?.status === 'verified' ? window.BuscARTESesion.user : null;
    if (verified && String(verified.id) === uid) return window.BuscARTEDisciplinas?.has(verified,'musica') === true;
    // La caché sólo decide presentación; vincular membresía al ID impide heredar otra cuenta.
    try {
      const cache = JSON.parse(state[4] || 'null');
      if (cache && cache.id === uid && window.BuscARTEDisciplinas) return window.BuscARTEDisciplinas.has({id:uid,tipo_cuenta:type,rubro,disciplinas:cache.disciplinas},'musica');
    } catch (_) {}
    return rubro === 'musica';
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
  window.addEventListener('buscarte:sessionchange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', event => { if (!event.key || keys.includes(event.key)) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // storage no se dispara en esta pestaña: releer antes de abrir cualquier menú.
  document.addEventListener('click', event => {
    if (event.target.closest('#nav-avatar-btn, .mbn-item[data-page="perfil"]')) refresh();
  }, true);
})();
