/* Estado de presentación del Inicio. No valida permisos, crea sesiones ni escribe datos. */
(function () {
  'use strict';

  function validId(value) {
    const id = value == null ? '' : String(value).trim();
    try { encodeURIComponent(id); } catch (_) { return ''; }
    return id && !/^(null|undefined)$/i.test(id) ? id : '';
  }

  function readLegacy() {
    try {
      if (localStorage.getItem('ba_logged') !== '1') return { mode: 'guest' };
      const uid = validId(localStorage.getItem('ba_user_id'));
      return uid ? { mode: 'member', uid, name: localStorage.getItem('ba_name') || '' } : { mode: 'recover' };
    } catch (_) {
      return { mode: 'guest' };
    }
  }

  // Resolver sólo la variante visual antes de pintar. El runtime Auth local
  // espera su propio estado; nunca debe tomar ba_* como una sesión validada.
  const localRuntime = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  document.documentElement.dataset.homeSession = localRuntime ? 'guest' : readLegacy().mode;

  let initialized = false;
  let current = { mode: 'guest' };
  let refresh = function () {};

  function closeMenu() {
    document.getElementById('nav-avatar-btn')?.classList.remove('open');
    document.getElementById('nav-avatar-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('nav-dropdown')?.classList.remove('open');
  }

  function init(options = {}) {
    if (initialized) return;
    initialized = true;
    let badgeKey = '';

    function render(state) {
      const changed = state.mode !== current.mode || state.uid !== current.uid;
      current = state;
      const name = typeof state.name === 'string' ? state.name.trim() : '';
      const words = name.split(/\s+/).filter(Boolean);
      const firstName = words[0] || 'de nuevo';
      const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
      text('hero-nombre', state.mode === 'member' ? firstName : '');
      text('nav-avatar-name', state.mode === 'member' ? (words[0] || 'Mi cuenta') : 'Mi cuenta');
      text('nav-avatar-circle', state.mode === 'member' ? (words.slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || 'BA') : '?');
      const profileUrl = state.uid ? 'buscARTE_perfil_publico.html?id=' + encodeURIComponent(state.uid) : 'buscARTE_login.html';
      document.querySelectorAll('[data-home-profile]').forEach(link => { link.setAttribute('href', profileUrl); });
      document.querySelectorAll('[data-home-profile], #nav-user').forEach(el => el.removeAttribute('inert'));
      if (changed) closeMenu();
      // Show the member variant only after links/name have been updated.
      document.documentElement.dataset.homeSession = state.mode;
      document.documentElement.dataset.homeReady = 'true';

      let lastSeen = '';
      try { lastSeen = localStorage.getItem('ba_msg_last_seen') || ''; } catch (_) {}
      const nextBadgeKey = state.mode === 'member' ? JSON.stringify([state.uid, lastSeen]) : '';
      if (nextBadgeKey !== badgeKey) {
        badgeKey = nextBadgeKey;
        const badge = document.getElementById('nav-msg-badge');
        if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
        // Auth's local branch did not read the legacy badge. Preserve that boundary.
        if (!options.authRuntimeEnabled) options.onIdentity?.(state.uid || '');
      }
    }

    if (options.authRuntimeEnabled) {
      let authState = null;
      let receivedEvent = false;
      const renderAuth = state => {
        const uid = state?.authenticated && state.profileId ? validId(state.profileId) : '';
        render(uid ? { mode: 'member', uid, name: state.profile?.nombre || '' } : { mode: 'guest' });
      };
      refresh = () => renderAuth(authState);
      window.addEventListener('buscarte:authchange', event => {
        receivedEvent = true;
        authState = event.detail;
        refresh();
      });
      refresh();
      Promise.resolve(options.auth?.ready).then(state => {
        if (!receivedEvent) { authState = state; refresh(); }
      }).catch(() => { if (!receivedEvent) { authState = null; refresh(); } });
    } else {
      refresh = () => render(readLegacy());
      refresh();
      window.addEventListener('storage', event => {
        if (!event.key || ['ba_logged', 'ba_user_id', 'ba_name', 'ba_msg_last_seen'].includes(event.key)) refresh();
      });
    }

    window.addEventListener('pageshow', () => refresh());
    window.addEventListener('focus', () => refresh());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    document.addEventListener('click', event => { if (!event.target.closest('#nav-user')) closeMenu(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('nav-dropdown')?.classList.contains('open')) {
        closeMenu();
        document.getElementById('nav-avatar-btn')?.focus();
      }
    });
    document.getElementById('nav-user')?.addEventListener('focusout', event => {
      if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
    });
  }

  window.BuscARTEInicio = {
    init,
    refresh: () => refresh(),
    toggleMenu() {
      if (current.mode !== 'member') return;
      const button = document.getElementById('nav-avatar-btn');
      const open = button?.getAttribute('aria-expanded') !== 'true';
      button?.setAttribute('aria-expanded', String(open));
      button?.classList.toggle('open', open);
      document.getElementById('nav-dropdown')?.classList.toggle('open', open);
    }
  };
})();
