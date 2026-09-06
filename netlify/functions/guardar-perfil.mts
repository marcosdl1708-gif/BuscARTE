import type { Config } from '@netlify/functions';

declare const Netlify: { env: { get(name: string): string | undefined } };

// Transitional, server-only bridge. Credentials are checked for every operation;
// this does not mint a session or change the database's existing RLS/Auth model.
const ORIGINS = new Set(['https://buscarte.com.ar', 'https://www.buscarte.com.ar']);
const MAX_BODY = 32 * 1024;
const RUBROS = new Set(['musica', 'actuacion', 'audiovisual', 'modelaje', 'diseno', 'tatuaje', 'danza', 'maquillaje', 'circo', 'escritura']);
const TEXT_LIMITS: Record<string, number> = {
  nombre: 200, bio: 300, instrumento: 2000, generos: 2000,
  disponibilidad: 2000, donde_ensaya: 1000, videos: 8000,
  redes: 8000, celular: 80, referentes: 4000,
  provincia: 200, ciudad: 200, barrio: 200
};
const NULLABLE = new Set(['celular', 'provincia', 'ciudad', 'barrio']);
const FIELDS = new Set([...Object.keys(TEXT_LIMITS), 'experiencia', 'edad', 'campos_especificos', 'rubro', 'tipo_cuenta', 'foto_url']);
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit && !value.includes('\0');
const idText = (value: unknown): string => {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) return '';
  const id = String(value);
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id) ? id : '';
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const fail = (status: number) => json(status, { error: ({ 400: 'Datos de guardado inválidos.', 401: 'Email o contraseña incorrectos.', 403: 'No se permite guardar este perfil.', 405: 'Método no permitido.', 502: 'No pudimos confirmar el guardado. Revisá el perfil antes de reintentar.', 503: 'El guardado no está disponible temporalmente.' } as Record<number, string>)[status] });

function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return text(value, 8000);
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => safeJson(item, depth + 1));
  return object(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, item]) =>
    key.length <= 128 && !unsafeKeys.has(key) && !key.includes('\0') && safeJson(item, depth + 1));
}
function jsonObject(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return object(parsed) && safeJson(parsed) ? parsed : null;
  } catch { return null; }
}
const canonical = (value: any): string => JSON.stringify(value, (_key, item) =>
  object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

function serverConfig() {
  try {
    const rawUrl = Netlify.env.get('SUPABASE_URL') || 'https://xiaanchoanxmampegoay.supabase.co';
    const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('SUPABASE_SERVICE_KEY') || Netlify.env.get('SUPABASE_KEY');
    if (!rawUrl || !key) return null;
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const secret = /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key);
    if (!secret) {
      const parts = key.split('.');
      if (parts.length !== 3 || JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role !== 'service_role') return null;
    }
    const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
    // Opaque secret keys are not JWTs and must not be sent as Bearer tokens.
    if (!secret) headers.Authorization = 'Bearer ' + key;
    return { origin: url.origin, headers };
  } catch { return null; }
}

async function readPayload(request: Request) {
  if (!request.body || Number(request.headers.get('content-length') || 0) > MAX_BODY) throw new Error('body');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error('body'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function validChanges(changes: Record<string, any>): boolean {
  if (!Object.keys(changes).length || Object.keys(changes).some(key => !FIELDS.has(key))) return false;
  if (Object.hasOwn(changes, 'foto_url')) return Object.keys(changes).length === 1 && text(changes.foto_url, 2048);
  for (const [key, value] of Object.entries(changes)) {
    if (Object.hasOwn(TEXT_LIMITS, key)) {
      if (!(value === null && NULLABLE.has(key)) && !text(value, TEXT_LIMITS[key])) return false;
      if (key === 'nombre' && !value.trim()) return false;
      if (key === 'redes' && !jsonObject(value)) return false;
    } else if (key === 'experiencia') {
      if (!Number.isInteger(value) || value < 0 || value > 100) return false;
    } else if (key === 'edad') {
      if (value !== null && (!Number.isInteger(value) || value < 15 || value > 120)) return false;
    } else if (key === 'campos_especificos') {
      if (!jsonObject(value)) return false;
    } else if (!text(value, 40)) return false;
  }
  return true;
}

export default async function guardarPerfil(request: Request): Promise<Response> {
  if (request.method !== 'POST') return fail(405);
  const requestOrigin = request.headers.get('origin') || '';
  if (!ORIGINS.has(requestOrigin) || new URL(request.url).origin !== requestOrigin) return fail(403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail(400);
  let payload: Record<string, any>;
  try { payload = await readPayload(request); } catch { return fail(400); }
  if (!object(payload) || Object.keys(payload).some(key => !['email', 'password', 'profileId', 'changes', 'operation'].includes(key)) ||
      !text(payload.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()) ||
      !text(payload.password, 4096) || !payload.password.length || !idText(payload.profileId) || !object(payload.changes) ||
      ![undefined, 'save', 'verify'].includes(payload.operation)) return fail(400);
  const verifyOnly = payload.operation === 'verify';
  if (verifyOnly ? Object.keys(payload.changes).length !== 0 : !validChanges(payload.changes)) return fail(400);
  const backend = serverConfig();
  if (!backend) return fail(503);
  const email = payload.email.trim().toLowerCase();
  // One shared deadline bounds credential verification plus the PATCH below.
  const signal = AbortSignal.timeout(15000);
  try {
    const login = await fetch(backend.origin + '/rest/v1/rpc/login_usuario', {
      method: 'POST', headers: backend.headers, body: JSON.stringify({ p_email: email, p_password: payload.password }), signal, redirect: 'error'
    });
    if (!login.ok) return fail(502);
    const result = await login.json();
    const user = Array.isArray(result) && result.length === 1 ? result[0] : result;
    if (!object(user) || user.error || !idText(user.id)) return fail(401);
    const verifiedId = idText(user.id);
    if (user.baneado === true || verifiedId !== idText(payload.profileId)) return fail(403);
    if (typeof user.email !== 'string' || user.email.trim().toLowerCase() !== email ||
        ![undefined, null, false].includes(user.baneado)) return fail(502);
    if (verifyOnly) return json(200, [{ id: user.id }]);
    const changes = { ...payload.changes };
    const rubro = Object.hasOwn(changes, 'rubro') ? changes.rubro : (user.rubro || 'musica');
    const tipo = user.tipo_cuenta || 'artista';
    if (!RUBROS.has(rubro) || !['artista', 'negocio', 'visitante'].includes(tipo) ||
        (Object.hasOwn(changes, 'tipo_cuenta') && changes.tipo_cuenta !== tipo)) return fail(403);
    // Preserve the existing single-rubro selector; never change the account role.
    // This does not introduce multiple rubros, additional profiles or new categories.
    delete changes.tipo_cuenta;
    if (!Object.keys(changes).length) return fail(400);
    if (Object.hasOwn(changes, 'foto_url')) {
      let photo: URL;
      try { photo = new URL(changes.foto_url); } catch { return fail(400); }
      const file = '/storage/v1/object/public/fotos-perfil/' + verifiedId + '-';
      if (photo.origin !== backend.origin || photo.username || photo.password || photo.search || photo.hash ||
          photo.href !== changes.foto_url || !photo.pathname.startsWith(file) ||
          !/^\d{10,16}\.(jpg|jpeg|png|webp)$/.test(photo.pathname.slice(file.length))) return fail(400);
    }
    const target = new URL(backend.origin + '/rest/v1/perfiles');
    target.searchParams.set('id', 'eq.' + verifiedId);
    target.searchParams.set('or', '(baneado.is.null,baneado.eq.false)');
    target.searchParams.set('select', 'id,campos_especificos,generos,foto_url,rubro');
    const update = await fetch(target, {
      method: 'PATCH', headers: { ...backend.headers, Prefer: 'return=representation' }, body: JSON.stringify(changes), signal, redirect: 'error'
    });
    if (!update.ok) return fail(502);
    const rows = await update.json();
    if (!Array.isArray(rows) || rows.length !== 1 || !object(rows[0]) || idText(rows[0].id) !== verifiedId) return fail(502);
    if ((Object.hasOwn(changes, 'rubro') && rows[0].rubro !== changes.rubro) ||
        (Object.hasOwn(changes, 'generos') && rows[0].generos !== changes.generos) ||
        (Object.hasOwn(changes, 'foto_url') && rows[0].foto_url !== changes.foto_url)) return fail(502);
    if (Object.hasOwn(changes, 'campos_especificos')) {
      const confirmed = jsonObject(rows[0].campos_especificos);
      if (!confirmed || canonical(confirmed) !== canonical(jsonObject(changes.campos_especificos))) return fail(502);
    }
    // Only explicitly selected profile fields may leave the server.
    return json(200, [Object.fromEntries(['id', 'campos_especificos', 'generos', 'foto_url', 'rubro'].filter(key => Object.hasOwn(rows[0], key)).map(key => [key, rows[0][key]]))]);
  } catch { return fail(502); }
}

export const config: Config = {
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' }
};
