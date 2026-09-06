(function bootstrapBuscarteApi(global) {
  'use strict';

  if (global.BuscARTEApi) return;

  const VERSION = '1.0.0-shadow';
  const PUBLIC_PROFILE_FIELDS = Object.freeze([
    'id', 'created_at', 'nombre', 'instrumento', 'generos', 'provincia',
    'ciudad', 'barrio', 'bio', 'referentes', 'disponibilidad',
    'donde_ensaya', 'redes', 'videos', 'es_premium', 'foto_url', 'celular',
    'baneado', 'experiencia', 'edad', 'genero_principal', 'tipo_cuenta',
    'rubro', 'campos_especificos'
  ]);
  const OWN_PROFILE_FIELDS = PUBLIC_PROFILE_FIELDS;
  const PUBLIC_AD_FIELDS = Object.freeze([
    'id', 'created_at', 'user_id', 'tipo', 'titulo', 'descripcion',
    'instrumentos', 'generos', 'zona', 'estado', 'vistas', 'fecha_evento',
    'lugar', 'precio_entrada', 'link_evento', 'contacto_evento',
    'categoria_producto', 'marca', 'condicion', 'precio', 'foto_url',
    'precio_num', 'nivel', 'modalidad', 'oculto', 'foto_url_2',
    'foto_url_3', 'rubro', 'rubro_buscado', 'tags', 'campos_especificos'
  ]);
  const OWN_AD_FIELDS = Object.freeze([
    ...PUBLIC_AD_FIELDS,
    'oculto_at', 'vencido_at'
  ]);
  const PROFILE_ORDER_FIELDS = new Set(['created_at', 'nombre', 'ciudad', 'id']);
  const AD_ORDER_FIELDS = new Set(['created_at', 'fecha_evento', 'precio_num', 'id']);
  const OWN_AD_ACTIONS = new Set(['pausar', 'reactivar', 'republicar', 'eliminar']);

  class BuscarteApiError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'BuscarteApiError';
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  function config() {
    if (!global.BuscARTEConfig) {
      throw new BuscarteApiError('CONFIG_MISSING', 'BuscARTEConfig must load before BuscARTEApi.');
    }
    return global.BuscARTEConfig;
  }

  function auth() {
    if (!global.BuscARTEAuth) {
      throw new BuscarteApiError('AUTH_MISSING', 'BuscARTEAuth must load before BuscARTEApi.');
    }
    return global.BuscARTEAuth;
  }

  function selector(fields) {
    return fields.join(',');
  }

  function positiveInteger(value, fallback, maximum) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return fallback;
    return maximum === undefined ? parsed : Math.min(parsed, maximum);
  }

  function requiredId(value, label) {
    const text = String(value ?? '').trim();
    if (!/^[1-9]\d*$/.test(text)) {
      throw new BuscarteApiError('INVALID_ID', `${label} must be a positive integer.`);
    }
    return text;
  }

  function normalizedIds(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(value => String(value ?? '').trim()))]
      .filter(value => /^[1-9]\d*$/.test(value))
      .slice(0, 200);
  }

  function emptyPage(countRequested) {
    return Object.freeze({
      rows: Object.freeze([]),
      count: countRequested ? 0 : null
    });
  }

  function paging(options) {
    const current = config();
    const input = options || {};
    return {
      limit: Math.max(1, positiveInteger(
        input.limit,
        current.api.defaultPageSize,
        current.api.maximumPageSize
      )),
      offset: positiveInteger(input.offset, 0)
    };
  }

  function checkedOrder(requested, allowed, fallback) {
    return allowed.has(requested) ? requested : fallback;
  }

  function getClient() {
    return auth().getClient();
  }

  function unwrap(result, operation) {
    if (result.error) {
      throw new BuscarteApiError(
        'QUERY_FAILED',
        `${operation} failed.`,
        result.error
      );
    }
    return result;
  }

  async function listPublicProfiles(options) {
    const current = config();
    const input = options || {};
    const page = paging(input);
    const orderBy = checkedOrder(input.orderBy, PROFILE_ORDER_FIELDS, 'created_at');
    const idsWereProvided = Object.prototype.hasOwnProperty.call(input, 'ids');
    const ids = normalizedIds(input.ids);
    if (idsWereProvided && ids.length === 0) return emptyPage(input.count === true);
    let query = getClient()
      .from(current.api.relations.publicProfiles)
      .select(selector(PUBLIC_PROFILE_FIELDS), { count: input.count === true ? 'exact' : undefined })
      .eq('baneado', false)
      .order(orderBy, { ascending: input.ascending === true })
      .range(page.offset, page.offset + page.limit - 1);

    if (input.rubro) query = query.eq('rubro', String(input.rubro));
    if (input.tipoCuenta) query = query.eq('tipo_cuenta', String(input.tipoCuenta));
    if (ids.length) query = query.in('id', ids);

    const result = unwrap(await query, 'Public profile query');
    return Object.freeze({ rows: Object.freeze(result.data || []), count: result.count });
  }

  async function getPublicProfileById(id) {
    const current = config();
    const result = unwrap(await getClient()
      .from(current.api.relations.publicProfiles)
      .select(selector(PUBLIC_PROFILE_FIELDS))
      .eq('id', requiredId(id, 'Profile id'))
      .eq('baneado', false)
      .maybeSingle(), 'Public profile lookup');
    return result.data || null;
  }

  async function listPublicAds(options) {
    const current = config();
    const input = options || {};
    const page = paging(input);
    const orderBy = checkedOrder(input.orderBy, AD_ORDER_FIELDS, 'created_at');
    const idsWereProvided = Object.prototype.hasOwnProperty.call(input, 'ids');
    const ids = normalizedIds(input.ids);
    if (idsWereProvided && ids.length === 0) return emptyPage(input.count === true);
    let query = getClient()
      .from(current.api.relations.publicAds)
      .select(selector(PUBLIC_AD_FIELDS), { count: input.count === true ? 'exact' : undefined })
      .eq('oculto', false)
      .order(orderBy, { ascending: input.ascending === true })
      .range(page.offset, page.offset + page.limit - 1);

    if (input.rubro) query = query.eq('rubro', String(input.rubro));
    if (input.tipo) query = query.eq('tipo', String(input.tipo));
    if (input.estado) query = query.eq('estado', String(input.estado));
    if (ids.length) query = query.in('id', ids);

    const result = unwrap(await query, 'Public ad query');
    return Object.freeze({ rows: Object.freeze(result.data || []), count: result.count });
  }

  async function getPublicAdById(id) {
    const current = config();
    const result = unwrap(await getClient()
      .from(current.api.relations.publicAds)
      .select(selector(PUBLIC_AD_FIELDS))
      .eq('id', requiredId(id, 'Ad id'))
      .eq('oculto', false)
      .maybeSingle(), 'Public ad lookup');
    return result.data || null;
  }

  async function getOwnProfile() {
    const current = config();
    await auth().requireProfile();
    const result = unwrap(await getClient()
      .from(current.api.relations.ownProfile)
      .select(selector(OWN_PROFILE_FIELDS))
      .maybeSingle(), 'Own profile lookup');
    return result.data || null;
  }

  async function listOwnAds(options) {
    const current = config();
    const identity = await auth().requireProfile();
    const input = options || {};
    const page = paging(input);
    const result = unwrap(await getClient()
      .from(current.api.relations.ads)
      .select(selector(OWN_AD_FIELDS), { count: input.count === true ? 'exact' : undefined })
      .eq('user_id', identity.profileId)
      .order('created_at', { ascending: input.ascending === true })
      .range(page.offset, page.offset + page.limit - 1), 'Own ad query');
    return Object.freeze({ rows: Object.freeze(result.data || []), count: result.count });
  }

  async function manageOwnAd(id, action) {
    await auth().requireProfile();
    const adId = requiredId(id, 'Ad id');
    const numericAdId = Number(adId);
    if (!Number.isSafeInteger(numericAdId)) {
      throw new BuscarteApiError('INVALID_ID', 'Ad id exceeds the browser-safe integer range.');
    }
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!OWN_AD_ACTIONS.has(normalizedAction)) {
      throw new BuscarteApiError('INVALID_ACTION', 'Unsupported own-ad action.');
    }

    const result = unwrap(await getClient().rpc('gestionar_anuncio_v2', {
      p_anuncio_id: numericAdId,
      p_accion: normalizedAction
    }), 'Own ad management');
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row || !row.id) {
      throw new BuscarteApiError(
        'EMPTY_MUTATION_RESULT',
        'Own ad management returned no updated row.'
      );
    }
    return Object.freeze(row);
  }

  const fields = Object.freeze({
    publicProfile: PUBLIC_PROFILE_FIELDS,
    ownProfile: OWN_PROFILE_FIELDS,
    publicAd: PUBLIC_AD_FIELDS,
    ownAd: OWN_AD_FIELDS
  });
  const selectors = Object.freeze({
    publicProfile: selector(PUBLIC_PROFILE_FIELDS),
    ownProfile: selector(OWN_PROFILE_FIELDS),
    publicAd: selector(PUBLIC_AD_FIELDS),
    ownAd: selector(OWN_AD_FIELDS)
  });

  const api = Object.freeze({
    version: VERSION,
    fields,
    selectors,
    publicProfiles: Object.freeze({
      list: listPublicProfiles,
      getById: getPublicProfileById
    }),
    publicAds: Object.freeze({
      list: listPublicAds,
      getById: getPublicAdById
    }),
    ownProfile: Object.freeze({ get: getOwnProfile }),
    ownAds: Object.freeze({ list: listOwnAds, manage: manageOwnAd }),
    inspect: () => Object.freeze({
      version: VERSION,
      mode: config().mode,
      networkEnabled: config().networkEnabled,
      relations: config().api.relations,
      selectors
    })
  });

  Object.defineProperty(global, 'BuscARTEApi', {
    value: api,
    enumerable: true,
    writable: false,
    configurable: false
  });
})(window);
