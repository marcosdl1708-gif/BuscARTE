(function bootstrapBuscarteConfig(global) {
  'use strict';

  if (global.BuscARTEConfig) return;

  const VERSION = '1.0.0-shadow';
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

  const DEFAULTS = {
    environment: 'production',
    mode: 'shadow',
    networkEnabled: false,
    supabase: {
      url: 'https://xiaanchoanxmampegoay.supabase.co',
      publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpYWFuY2hvYW54bWFtcGVnb2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTAyMjUsImV4cCI6MjA5NDI2NjIyNX0.teLv3hRbkqZcKq3sLWKIz5yplDAJscxv-DYD1-U9u68',
      schema: 'public'
    },
    auth: {
      storageKey: 'buscarte-auth-v1',
      flowType: 'pkce',
      syncLegacyCache: false,
      loginPath: '/buscARTE_login.html',
      registrationPath: '/buscARTE_registro.html',
      recoveryPath: '/buscARTE_reset.html'
    },
    api: {
      relations: {
        profiles: 'perfiles',
        publicProfiles: 'perfiles_publicos',
        ownProfile: 'mi_perfil',
        ads: 'anuncios',
        publicAds: 'anuncios_publicos'
      },
      defaultPageSize: 60,
      maximumPageSize: 200
    }
  };

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function pageHostname() {
    return String(global.location && global.location.hostname || '').toLowerCase();
  }

  function isLocalHostname(hostname) {
    return LOCAL_HOSTS.has(String(hostname || '').toLowerCase());
  }

  function normalizedUrl(raw, label, localOnly) {
    let parsed;
    try {
      parsed = new URL(String(raw));
    } catch (_) {
      throw new TypeError(`${label} must be an absolute URL.`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new TypeError(`${label} must use http or https.`);
    }
    if (localOnly && !isLocalHostname(parsed.hostname)) {
      throw new TypeError(`${label} must point to localhost in a local override.`);
    }

    return parsed.href.replace(/\/$/, '');
  }

  function decodeJwtRole(key) {
    const parts = String(key || '').split('.');
    if (parts.length !== 3 || typeof global.atob !== 'function') return '';

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const payload = JSON.parse(global.atob(padded));
      return String(payload.role || '');
    } catch (_) {
      return '';
    }
  }

  function assertPublicClientKey(raw, label) {
    const key = String(raw || '').trim();
    if (!key) throw new TypeError(`${label} is required.`);
    if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
      throw new TypeError(`${label} must never contain a secret or service-role key.`);
    }
    return key;
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    const visited = seen || new WeakSet();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.values(value).forEach(child => deepFreeze(child, visited));
    return Object.freeze(value);
  }

  const localPage = isLocalHostname(pageHostname());
  const rawOverride = localPage && isPlainObject(global.__BUSCARTE_RUNTIME_CONFIG__)
    ? global.__BUSCARTE_RUNTIME_CONFIG__
    : {};
  const supabaseOverride = isPlainObject(rawOverride.supabase) ? rawOverride.supabase : {};
  const authOverride = isPlainObject(rawOverride.auth) ? rawOverride.auth : {};

  const allowedModes = new Set(['legacy', 'shadow', 'auth']);
  const requestedMode = String(rawOverride.mode || DEFAULTS.mode);
  const mode = allowedModes.has(requestedMode) ? requestedMode : DEFAULTS.mode;
  const localNetworkEnabled = localPage && rawOverride.networkEnabled === true;

  if (localNetworkEnabled && (!supabaseOverride.url || !supabaseOverride.publishableKey)) {
    throw new TypeError(
      'A network-enabled local runtime must provide an explicit local Supabase URL and public key.'
    );
  }

  const config = deepFreeze({
    version: VERSION,
    environment: localPage ? String(rawOverride.environment || 'local') : DEFAULTS.environment,
    mode: localPage ? mode : DEFAULTS.mode,
    networkEnabled: localPage ? localNetworkEnabled : DEFAULTS.networkEnabled,
    isLocalRuntime: localPage,
    supabase: {
      url: normalizedUrl(
        localPage && supabaseOverride.url ? supabaseOverride.url : DEFAULTS.supabase.url,
        'Supabase URL',
        localPage && Boolean(supabaseOverride.url)
      ),
      publishableKey: assertPublicClientKey(
        localPage && supabaseOverride.publishableKey
          ? supabaseOverride.publishableKey
          : DEFAULTS.supabase.publishableKey,
        'Supabase publishable key'
      ),
      schema: DEFAULTS.supabase.schema
    },
    auth: {
      storageKey: DEFAULTS.auth.storageKey,
      flowType: DEFAULTS.auth.flowType,
      syncLegacyCache: localPage
        ? authOverride.syncLegacyCache === true
        : DEFAULTS.auth.syncLegacyCache,
      siteOrigin: localPage && global.location
        ? global.location.origin
        : 'https://buscarte.com.ar',
      loginPath: DEFAULTS.auth.loginPath,
      registrationPath: DEFAULTS.auth.registrationPath,
      recoveryPath: DEFAULTS.auth.recoveryPath
    },
    api: DEFAULTS.api
  });

  Object.defineProperty(global, 'BuscARTEConfig', {
    value: config,
    enumerable: true,
    writable: false,
    configurable: false
  });
})(window);
