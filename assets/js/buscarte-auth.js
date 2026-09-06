(function bootstrapBuscarteAuth(global) {
  'use strict';

  if (global.BuscARTEAuth) return;

  const VERSION = '1.0.0-shadow';
  const PROFILE_CACHE_SELECT = [
    'id',
    'nombre',
    'tipo_cuenta',
    'rubro',
    'referentes',
    'generos',
    'baneado'
  ].join(',');
  const LEGACY_IDENTITY_KEYS = Object.freeze([
    'ba_logged',
    'ba_user_id',
    'ba_name',
    'ba_email',
    'ba_tipo_cuenta',
    'ba_rubro',
    'ba_referentes',
    'ba_generos'
  ]);

  class BuscarteAuthError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'BuscarteAuthError';
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  function config() {
    if (!global.BuscARTEConfig) {
      throw new BuscarteAuthError(
        'CONFIG_MISSING',
        'BuscARTEConfig must load before BuscARTEAuth.'
      );
    }
    return global.BuscARTEConfig;
  }

  function initialStatus() {
    const mode = global.BuscARTEConfig && global.BuscARTEConfig.mode;
    if (mode === 'legacy') return 'legacy';
    if (mode === 'auth') return 'idle';
    return 'shadow';
  }

  function publicError(error) {
    if (!error) return null;
    return Object.freeze({
      name: String(error.name || 'Error'),
      code: String(error.code || ''),
      message: String(error.message || 'Unknown authentication error.'),
      status: Number.isFinite(Number(error.status)) ? Number(error.status) : null
    });
  }

  function frozenProfile(profile) {
    if (!profile) return null;
    return Object.freeze({
      id: profile.id,
      nombre: profile.nombre || '',
      tipo_cuenta: profile.tipo_cuenta || '',
      rubro: profile.rubro || '',
      referentes: profile.referentes || '',
      generos: profile.generos || '',
      baneado: profile.baneado === true
    });
  }

  let stateRevision = 0;
  let state = Object.freeze({
    status: initialStatus(),
    authenticated: false,
    authUserId: null,
    profileId: null,
    profile: null,
    reason: 'bootstrap',
    error: null,
    revision: stateRevision
  });
  let client = null;
  let started = false;
  let startPromise = null;
  let subscription = null;
  let reconcileGeneration = 0;
  let reconcileTimer = null;
  let activeReconcilePromise = null;
  let pendingReconcileReason = null;

  function emitStateChange() {
    if (!started || typeof global.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') {
      return;
    }
    global.dispatchEvent(new CustomEvent('buscarte:authchange', { detail: state }));
  }

  function setState(next) {
    stateRevision += 1;
    state = Object.freeze({
      status: next.status,
      authenticated: next.authenticated === true,
      authUserId: next.authUserId || null,
      profileId: next.profileId ?? null,
      profile: frozenProfile(next.profile),
      reason: next.reason || '',
      error: publicError(next.error),
      revision: stateRevision
    });
    emitStateChange();
    return state;
  }

  function assertNetworkEnabled() {
    const current = config();
    if (current.mode !== 'auth' || current.networkEnabled !== true) {
      throw new BuscarteAuthError(
        'NETWORK_DISABLED',
        'BuscARTE Auth is passive. Enable auth mode and networking through an approved runtime configuration.'
      );
    }
    return current;
  }

  function getClient() {
    const current = assertNetworkEnabled();
    if (client) return client;

    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      throw new BuscarteAuthError(
        'SDK_MISSING',
        'The vendored Supabase browser client must load before BuscARTEAuth.'
      );
    }

    client = global.supabase.createClient(
      current.supabase.url,
      current.supabase.publishableKey,
      {
        db: { schema: current.supabase.schema },
        auth: {
          storageKey: current.auth.storageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: current.auth.flowType
        },
        global: {
          headers: { 'X-Client-Info': `buscarte-web/${VERSION}` }
        }
      }
    );
    return client;
  }

  function storage() {
    try {
      return global.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function clearLegacyIdentityCache() {
    if (!config().auth.syncLegacyCache) return;
    const target = storage();
    if (!target) return;
    try {
      LEGACY_IDENTITY_KEYS.forEach(key => target.removeItem(key));
    } catch (_) {
      // Storage can be unavailable in hardened/private browsing contexts.
    }
  }

  function writeLegacyIdentityCache(profile) {
    if (!config().auth.syncLegacyCache || !profile) return;
    const target = storage();
    if (!target) return;
    try {
      target.setItem('ba_logged', '1');
      target.setItem('ba_user_id', String(profile.id));
      target.setItem('ba_name', String(profile.nombre || ''));
      target.setItem('ba_tipo_cuenta', String(profile.tipo_cuenta || ''));
      target.setItem('ba_rubro', String(profile.rubro || ''));
      target.setItem('ba_referentes', String(profile.referentes || ''));
      target.setItem('ba_generos', String(profile.generos || ''));
      target.removeItem('ba_email');
    } catch (_) {
      // The real Auth session remains authoritative if the UX cache is unavailable.
    }
  }

  function isMissingSession(error) {
    const name = String(error && error.name || '');
    const message = String(error && error.message || '').toLowerCase();
    return name === 'AuthSessionMissingError' || message.includes('auth session missing');
  }

  async function loadOwnProfile() {
    const current = config();
    const result = await getClient()
      .from(current.api.relations.ownProfile)
      .select(PROFILE_CACHE_SELECT)
      .maybeSingle();

    if (result.error) {
      throw new BuscarteAuthError(
        'PROFILE_LOOKUP_FAILED',
        'The authenticated profile could not be loaded.',
        result.error
      );
    }
    return result.data || null;
  }

  async function performReconcile(reason) {
    const generation = ++reconcileGeneration;
    setState({
      status: 'loading',
      authenticated: false,
      reason: reason || 'reconcile'
    });

    try {
      const result = await getClient().auth.getUser();
      if (generation !== reconcileGeneration) return state;

      if (result.error || !result.data || !result.data.user) {
        clearLegacyIdentityCache();
        if (result.error && !isMissingSession(result.error)) {
          return setState({
            status: 'error',
            authenticated: false,
            reason: reason || 'get-user',
            error: result.error
          });
        }
        return setState({
          status: 'anonymous',
          authenticated: false,
          reason: reason || 'no-session'
        });
      }

      const user = result.data.user;
      const profile = await loadOwnProfile();
      if (generation !== reconcileGeneration) return state;

      if (!profile) {
        clearLegacyIdentityCache();
        return setState({
          status: 'profile_missing',
          authenticated: false,
          authUserId: user.id,
          reason: reason || 'profile-missing'
        });
      }
      if (profile.baneado === true) {
        clearLegacyIdentityCache();
        return setState({
          status: 'blocked',
          authenticated: false,
          authUserId: user.id,
          profileId: profile.id,
          profile,
          reason: reason || 'profile-blocked'
        });
      }

      writeLegacyIdentityCache(profile);
      return setState({
        status: reason === 'PASSWORD_RECOVERY' ? 'recovery' : 'authenticated',
        authenticated: true,
        authUserId: user.id,
        profileId: profile.id,
        profile,
        reason: reason || 'authenticated'
      });
    } catch (error) {
      if (generation !== reconcileGeneration) return state;
      clearLegacyIdentityCache();
      return setState({
        status: 'error',
        authenticated: false,
        reason: reason || 'reconcile-error',
        error
      });
    }
  }

  async function drainReconciles() {
    try {
      while (pendingReconcileReason !== null) {
        const reason = pendingReconcileReason;
        pendingReconcileReason = null;
        await performReconcile(reason);
      }
      return state;
    } finally {
      activeReconcilePromise = null;
    }
  }

  function reconcile(reason) {
    pendingReconcileReason = reason || 'reconcile';
    if (!activeReconcilePromise) {
      // Assign the single-flight promise before dispatching a loading event so
      // a synchronous event listener cannot start a second drain reentrantly.
      activeReconcilePromise = Promise.resolve().then(drainReconciles);
    }
    return activeReconcilePromise;
  }

  function cancelScheduledReconcile() {
    if (reconcileTimer !== null) global.clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }

  function scheduleReconcile(event) {
    cancelScheduledReconcile();
    reconcileTimer = global.setTimeout(() => {
      reconcileTimer = null;
      void reconcile(event);
    }, 0);
  }

  function subscribeToAuthChanges() {
    if (subscription) return;
    const result = getClient().auth.onAuthStateChange((event) => {
      // start() owns the initial validation; processing the SDK's matching event
      // would race ready with a second, redundant profile lookup.
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        cancelScheduledReconcile();
        pendingReconcileReason = null;
        reconcileGeneration += 1;
        clearLegacyIdentityCache();
        setState({ status: 'anonymous', authenticated: false, reason: event });
        return;
      }
      scheduleReconcile(event);
    });
    subscription = result && result.data && result.data.subscription || null;
  }

  function start() {
    const current = config();
    if (current.mode !== 'auth' || current.networkEnabled !== true) {
      return Promise.resolve(state);
    }
    if (startPromise) {
      return activeReconcilePromise || startPromise.then(() => state);
    }

    started = true;
    startPromise = (async () => {
      subscribeToAuthChanges();
      return reconcile('INITIAL_SESSION');
    })().catch(error => setState({
      status: 'error',
      authenticated: false,
      reason: 'start-error',
      error
    }));
    return startPromise;
  }

  async function signInWithPassword(email, password) {
    assertNetworkEnabled();
    await start();
    const result = await getClient().auth.signInWithPassword({ email, password });
    if (result.error) {
      throw new BuscarteAuthError('SIGN_IN_FAILED', 'Could not sign in.', result.error);
    }
    cancelScheduledReconcile();
    return reconcile('SIGNED_IN');
  }

  async function signUp(options) {
    assertNetworkEnabled();
    const input = options || {};
    const authOptions = {};
    if (input.captchaToken) authOptions.captchaToken = input.captchaToken;
    if (input.emailRedirectTo) authOptions.emailRedirectTo = input.emailRedirectTo;
    // Metadata is profile bootstrap data only. It must never authorize database access.
    if (input.profileMetadata) authOptions.data = input.profileMetadata;

    const result = await getClient().auth.signUp({
      email: input.email,
      password: input.password,
      options: authOptions
    });
    if (result.error) {
      throw new BuscarteAuthError('SIGN_UP_FAILED', 'Could not create the Auth user.', result.error);
    }
    return result.data;
  }

  async function requestPasswordReset(email, options) {
    assertNetworkEnabled();
    const input = options || {};
    const redirectTo = input.redirectTo || new URL(
      config().auth.recoveryPath,
      config().auth.siteOrigin
    ).href;
    const resetOptions = { redirectTo };
    if (input.captchaToken) resetOptions.captchaToken = input.captchaToken;

    const result = await getClient().auth.resetPasswordForEmail(email, resetOptions);
    if (result.error) {
      throw new BuscarteAuthError(
        'PASSWORD_RESET_REQUEST_FAILED',
        'Could not request a password reset.',
        result.error
      );
    }
  }

  async function updatePassword(password) {
    assertNetworkEnabled();
    const result = await getClient().auth.updateUser({ password });
    if (result.error) {
      throw new BuscarteAuthError(
        'PASSWORD_UPDATE_FAILED',
        'Could not update the password.',
        result.error
      );
    }
    return result.data.user || null;
  }

  async function refresh() {
    assertNetworkEnabled();
    const result = await getClient().auth.refreshSession();
    if (result.error) {
      throw new BuscarteAuthError('REFRESH_FAILED', 'Could not refresh the session.', result.error);
    }
    cancelScheduledReconcile();
    return reconcile('TOKEN_REFRESHED');
  }

  async function signOut(options) {
    assertNetworkEnabled();
    cancelScheduledReconcile();
    pendingReconcileReason = null;
    const requestedScope = options && options.scope || 'local';
    const scope = ['local', 'global'].includes(requestedScope)
      ? requestedScope
      : 'local';
    const result = await getClient().auth.signOut({ scope });
    if (state.status !== 'anonymous' || state.reason !== 'SIGNED_OUT') {
      reconcileGeneration += 1;
      clearLegacyIdentityCache();
      setState({ status: 'anonymous', authenticated: false, reason: 'SIGNED_OUT' });
    }
    if (result.error) {
      throw new BuscarteAuthError('SIGN_OUT_FAILED', 'Could not revoke the session.', result.error);
    }
    return state;
  }

  async function requireProfile() {
    const current = await start();
    if (current.authenticated && current.profileId !== null) return current;
    throw new BuscarteAuthError(
      'AUTH_REQUIRED',
      `An authenticated profile is required; current status is ${current.status}.`
    );
  }

  function stop() {
    cancelScheduledReconcile();
    pendingReconcileReason = null;
    if (subscription && typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    }
    subscription = null;
    started = false;
    startPromise = null;
    reconcileGeneration += 1;
    return state;
  }

  const api = {
    version: VERSION,
    getState: () => state,
    getClient,
    start,
    stop,
    reconcile: () => {
      assertNetworkEnabled();
      cancelScheduledReconcile();
      return reconcile('MANUAL_RECONCILE');
    },
    requireProfile,
    signInWithPassword,
    signUp,
    signOut,
    refresh,
    requestPasswordReset,
    updatePassword,
    constants: Object.freeze({
      legacyIdentityKeys: LEGACY_IDENTITY_KEYS,
      profileCacheSelect: PROFILE_CACHE_SELECT
    }),
    inspect: () => Object.freeze({
      version: VERSION,
      mode: config().mode,
      networkEnabled: config().networkEnabled,
      started,
      clientCreated: Boolean(client),
      status: state.status
    })
  };
  Object.defineProperty(api, 'ready', {
    enumerable: true,
    get: start
  });

  Object.defineProperty(global, 'BuscARTEAuth', {
    value: Object.freeze(api),
    enumerable: true,
    writable: false,
    configurable: false
  });
})(window);
