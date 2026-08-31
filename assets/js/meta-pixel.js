(function () {
  'use strict';

  var PIXEL_ID = '1982530688931438';
  var PROJECT = 'buscarte';
  var CONSENT_KEY = 'buscarte_meta_consent_v1';
  var SENT_PREFIX = 'buscarte_meta_sent_v1:';
  var PRIVACY_URL = '/buscARTE_privacidad.html';
  var BLOCKED_PATH = /(?:login|recuperar|reset|mensajes|perfil|mis_anuncios|guardados)/i;
  var SAFE_QUERY_KEYS = /^(?:id|tipo|rubro|page|tab|modo|next|source|ref|utm_source|utm_medium|utm_campaign|utm_content|utm_term|fbclid)$/i;
  var SENSITIVE_KEY = /(?:token|code|email|mail|password|secret|auth|error)/i;
  var BLOCKED_PARAM = /(?:^|_)(?:email|mail|phone|telefono|celular|name|nombre|first_name|last_name|username|user_id|address|direccion|bio|description|message|mensaje|title|titulo)(?:_|$)/i;
  var pending = [];
  var initialized = false;
  var consent = readConsent();

  function storage(scope) {
    try { return scope === 'session' ? window.sessionStorage : window.localStorage; }
    catch (_) { return null; }
  }

  function readConsent() {
    var store = storage('local');
    if (!store) return 'unknown';
    try {
      var value = store.getItem(CONSENT_KEY);
      return value === 'granted' || value === 'denied' ? value : 'unknown';
    } catch (_) { return 'unknown'; }
  }

  function writeConsent(value) {
    var store = storage('local');
    if (!store) return;
    try { store.setItem(CONSENT_KEY, value); } catch (_) {}
  }

  function trackingAllowedHere() {
    try {
      if (BLOCKED_PATH.test(window.location.pathname || '')) return false;
      if (SENSITIVE_KEY.test(window.location.hash || '')) return false;
      var safe = true;
      new URLSearchParams(window.location.search || '').forEach(function (value, key) {
        if (!SAFE_QUERY_KEYS.test(key) || SENSITIVE_KEY.test(key) || SENSITIVE_KEY.test(value)) safe = false;
        if (/@/.test(value) || /\+?\d[\d\s().-]{7,}\d/.test(value)) safe = false;
      });
      return safe;
    } catch (_) { return false; }
  }

  function cleanParams(params) {
    var clean = { project: PROJECT };
    if (!params || typeof params !== 'object') return clean;
    Object.keys(params).forEach(function (key) {
      if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key) || BLOCKED_PARAM.test(key)) return;
      var value = params[key];
      if (typeof value === 'number' && isFinite(value)) clean[key] = value;
      else if (typeof value === 'boolean') clean[key] = value;
      else if (typeof value === 'string') {
        var trimmed = value.trim().slice(0, 64);
        if (!trimmed || /@/.test(trimmed) || /\+?\d[\d\s().-]{7,}\d/.test(trimmed)) return;
        clean[key] = trimmed;
      }
    });
    return clean;
  }

  function sentStore(scope) { return storage(scope === 'session' ? 'session' : 'local'); }

  function wasSent(key, scope) {
    if (!key) return false;
    var store = sentStore(scope);
    try { return !!(store && store.getItem(SENT_PREFIX + key)); }
    catch (_) { return false; }
  }

  function markSent(key, scope) {
    if (!key) return;
    var store = sentStore(scope);
    try { if (store) store.setItem(SENT_PREFIX + key, '1'); } catch (_) {}
  }

  function bootstrapFbq() {
    if (!window.fbq) {
      var fbq = window.fbq = function () {
        fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.setAttribute('data-meta-pixel-loader', PROJECT);
      (document.head || document.documentElement).appendChild(script);
    }
  }

  function dispatch(item) {
    if (!initialized || consent !== 'granted' || wasSent(item.key, item.scope)) return false;
    try {
      window.fbq(item.custom ? 'trackCustom' : 'track', item.name, cleanParams(item.params));
      markSent(item.key, item.scope);
      return true;
    } catch (_) { return false; }
  }

  function flushPending() {
    var queued = pending.splice(0, pending.length);
    queued.forEach(dispatch);
  }

  function initPixel() {
    if (initialized || consent !== 'granted' || !trackingAllowedHere()) return;
    bootstrapFbq();
    window.fbq('init', PIXEL_ID);
    initialized = true;
    window.fbq('track', 'PageView');
    flushPending();
  }

  function queueOrSend(name, params, custom, key, scope) {
    if (!trackingAllowedHere() || consent === 'denied' || !/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(name)) return false;
    var item = { name: name, params: params || {}, custom: !!custom, key: key || '', scope: scope || 'local' };
    if (wasSent(item.key, item.scope)) return false;
    if (consent !== 'granted') {
      var duplicate = pending.some(function (queued) {
        return item.key ? queued.key === item.key : queued.name === item.name && queued.custom === item.custom;
      });
      if (!duplicate) pending.push(item);
      showBanner();
      return false;
    }
    initPixel();
    return dispatch(item);
  }

  function removeMetaCookies() {
    ['_fbp', '_fbc'].forEach(function (name) {
      try {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
        document.cookie = name + '=; Max-Age=0; path=/; domain=.' + window.location.hostname + '; SameSite=Lax';
      } catch (_) {}
    });
  }

  function updateStatus() {
    var text = consent === 'granted' ? 'Medición de Meta permitida.' : consent === 'denied' ? 'Medición de Meta bloqueada.' : 'Todavía no elegiste.';
    document.querySelectorAll('[data-meta-consent-status]').forEach(function (node) { node.textContent = text; });
  }

  function removeBanner() {
    var banner = document.getElementById('ba-meta-consent');
    if (banner) banner.remove();
  }

  function setConsent(allow) {
    var previous = consent;
    consent = allow === true || allow === 'granted' ? 'granted' : 'denied';
    writeConsent(consent);
    removeBanner();
    if (consent === 'granted') {
      if (initialized && previous !== 'granted') {
        window.fbq('consent', 'grant');
        if (trackingAllowedHere()) window.fbq('track', 'PageView');
        flushPending();
      } else {
        initPixel();
      }
    } else {
      pending.length = 0;
      if (initialized && window.fbq) window.fbq('consent', 'revoke');
      removeMetaCookies();
    }
    updateStatus();
  }

  function showBanner(force) {
    if ((!force && consent !== 'unknown') || document.getElementById('ba-meta-consent')) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { showBanner(force); }, { once: true });
      return;
    }
    if (!document.getElementById('ba-meta-consent-style')) {
      var style = document.createElement('style');
      style.id = 'ba-meta-consent-style';
      style.textContent = '#ba-meta-consent{position:fixed;z-index:2147483646;left:16px;right:16px;bottom:16px;max-width:760px;margin:auto;background:#111;color:#f5f5f5;border:1px solid #353535;border-left:4px solid #d4f53c;box-shadow:0 18px 55px rgba(0,0,0,.55);padding:16px;font:14px/1.45 Arial,sans-serif}#ba-meta-consent p{margin:0 0 12px}#ba-meta-consent a{color:#d4f53c}#ba-meta-consent .ba-meta-actions{display:flex;gap:8px;flex-wrap:wrap}#ba-meta-consent button{border:1px solid #666;background:transparent;color:#fff;padding:9px 13px;cursor:pointer;font-weight:700}#ba-meta-consent button[data-allow]{background:#d4f53c;border-color:#d4f53c;color:#080808}@media(max-width:560px){#ba-meta-consent{left:8px;right:8px;bottom:8px}#ba-meta-consent button{flex:1}}';
      document.head.appendChild(style);
    }
    var banner = document.createElement('aside');
    banner.id = 'ba-meta-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferencias de medición');
    banner.innerHTML = '<p><strong>Medición para mejorar buscARTE.</strong> Si aceptás, usamos el píxel de Meta para saber qué visitas terminan en registros, publicaciones o contactos. No enviamos tu email, teléfono, nombre ni el texto de tus publicaciones. <a href="' + PRIVACY_URL + '">Privacidad</a>.</p><div class="ba-meta-actions"><button type="button" data-deny>Solo necesarias</button><button type="button" data-allow>Permitir medición</button></div>';
    banner.querySelector('[data-deny]').addEventListener('click', function () { setConsent(false); });
    banner.querySelector('[data-allow]').addEventListener('click', function () { setConsent(true); });
    document.body.appendChild(banner);
  }

  window.MetaAds = {
    track: function (name, params) { return queueOrSend(name, params, false); },
    trackCustom: function (name, params) { return queueOrSend(name, params, true); },
    trackOnce: function (name, params, key, scope) { return queueOrSend(name, params, false, key, scope); },
    trackCustomOnce: function (name, params, key, scope) { return queueOrSend(name, params, true, key, scope); },
    setConsent: setConsent,
    showPreferences: function () { showBanner(true); },
    getConsent: function () { return consent; }
  };

  if (consent === 'granted') initPixel();
  else if (consent === 'unknown') showBanner();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateStatus, { once: true });
  else updateStatus();
})();
