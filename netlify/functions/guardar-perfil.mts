import type { Config } from '@netlify/functions';
import { sessionUser, rate, serverConfig, trustedOrigin } from '../lib/session.mjs';
import { RUBROS, DETAIL_FIELDS, prepareProfileChanges, revision } from '../lib/disciplinas.mjs';

declare const Netlify: { env: { get(name: string): string | undefined } };

// Owner verified from an HttpOnly server session. The credential fallback keeps
// older open editor tabs safe during the coordinated release; never trusts IDs.
const MAX_BODY = 96 * 1024;
const TEXT_LIMITS: Record<string, number> = {
  nombre: 200, bio: 300, instrumento: 2000, generos: 2000,
  disponibilidad: 2000, donde_ensaya: 1000, videos: 8000,
  redes: 8000, celular: 80, referentes: 4000,
  provincia: 200, ciudad: 200, barrio: 200
};
const NULLABLE = new Set(['celular', 'provincia', 'ciudad', 'barrio', ...DETAIL_FIELDS]);
const FIELDS = new Set([...Object.keys(TEXT_LIMITS), 'experiencia', 'edad', 'campos_especificos', 'rubro', 'tipo_cuenta', 'foto_url', 'disciplinas']);
const RETURN_FIELDS = ['id', ...FIELDS, 'perfil_revision'];
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
const conflict = () => json(409, { error: 'El perfil cambió en otra pestaña. Conservamos tus cambios; revisá la versión actual antes de volver a guardar.', code: 'PROFILE_CONFLICT' });

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
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) return false;
    } else if (key === 'edad') {
      if (value !== null && (!Number.isInteger(value) || value < 15 || value > 120)) return false;
    } else if (key === 'campos_especificos') {
      if (value !== null && !jsonObject(value)) return false;
    } else if (key === 'disciplinas') {
      if (!object(value) || !safeJson(value)) return false;
    } else if (!text(value, 40)) return false;
  }
  return true;
}

export default async function guardarPerfil(request: Request): Promise<Response> {
  if (request.method !== 'POST') return fail(405);
  if (!trustedOrigin(request)) return fail(403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail(400);
  let payload: Record<string, any>;
  try { payload = await readPayload(request); } catch { return fail(400); }
  if (!object(payload) || !safeJson(payload) || Object.keys(payload).some(key => !['email', 'password', 'profileId', 'changes', 'operation', 'expectedRevision'].includes(key)) ||
      !idText(payload.profileId) || !object(payload.changes) ||
      ![undefined, 'save', 'verify'].includes(payload.operation) ||
      (payload.expectedRevision !== undefined && revision(payload.expectedRevision) === null)) return fail(400);
  const verifyOnly = payload.operation === 'verify';
  if (verifyOnly ? Object.keys(payload.changes).length !== 0 : !validChanges(payload.changes)) return fail(400);
  const backend = serverConfig();
  if (!backend) return fail(503);
  const credentials = payload.email !== undefined || payload.password !== undefined;
  if (credentials && (!text(payload.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()) ||
      !text(payload.password, 4096) || !payload.password.length)) return fail(400);
  const email = credentials ? payload.email.trim().toLowerCase() : '';
  // One shared deadline bounds credential verification plus the PATCH below.
  const signal = AbortSignal.timeout(15000);
  try {
    let user;
    if (credentials) {
      if (!await rate(request, 'login_usuario', 60, 900)) return json(429, { error: 'Esperá unos minutos antes de reintentar.' });
      if (!await rate(request, 'login_usuario-account', 15, 900, email)) return json(429, { error: 'Esperá unos minutos antes de reintentar.' });
      const login = await fetch(backend.origin + '/rest/v1/rpc/login_usuario', {
        method: 'POST', headers: backend.headers, body: JSON.stringify({ p_email: email, p_password: payload.password }), signal, redirect: 'error'
      });
      if (!login.ok) return fail(502);
      const result = await login.json();
      user = Array.isArray(result) && result.length === 1 ? result[0] : result;
    } else user = await sessionUser(request);
    if (!object(user) || user.error || !idText(user.id)) return fail(401);
    const verifiedId = idText(user.id);
    if (user.baneado === true || verifiedId !== idText(payload.profileId)) return fail(403);
    if (typeof user.email !== 'string' || (credentials && user.email.trim().toLowerCase() !== email) ||
        ![undefined, null, false].includes(user.baneado)) return fail(502);
    if (verifyOnly) return json(200, [{ id: user.id }]);
    // Re-read state after authentication. CAS closes the race between this read
    // and UPDATE; stale new editors cannot overwrite another tab's disciplines.
    const currentUrl = new URL(backend.origin + '/rest/v1/perfiles');
    currentUrl.searchParams.set('id', 'eq.' + verifiedId);
    currentUrl.searchParams.set('select', 'id,tipo_cuenta,rubro,baneado,disciplinas,perfil_revision,' + DETAIL_FIELDS.join(','));
    currentUrl.searchParams.set('limit', '1');
    const currentResponse = await fetch(currentUrl, { headers: backend.headers, signal, redirect: 'error' });
    if (!currentResponse.ok) return fail(502);
    const currentRows = await currentResponse.json();
    if (!Array.isArray(currentRows) || currentRows.length !== 1 || idText(currentRows[0].id) !== verifiedId) return fail(502);
    const current = currentRows[0];
    if (current.baneado === true) return fail(403);
    let changes = { ...payload.changes };
    const rubro = Object.hasOwn(changes, 'rubro') ? changes.rubro : current.rubro;
    const tipo = current.tipo_cuenta;
    if (!['artista', 'negocio', 'visitante'].includes(tipo) ||
        (tipo === 'artista' && !RUBROS.has(rubro)) ||
        (tipo !== 'artista' && Object.hasOwn(changes, 'rubro') && changes.rubro !== current.rubro) ||
        (tipo !== 'artista' && Object.hasOwn(changes, 'disciplinas')) ||
        (Object.hasOwn(changes, 'tipo_cuenta') && changes.tipo_cuenta !== tipo)) return fail(403);
    // Only artists use the ten-rubro selector. Businesses retain their existing
    // category and visitors retain their empty rubro; never change either role.
    delete changes.tipo_cuenta;
    if (!Object.keys(changes).length) return fail(400);
    try { changes = prepareProfileChanges(current, changes, payload.expectedRevision); }
    catch (error) { return error instanceof Error && error.message === 'conflict' ? conflict() : fail(400); }
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
    target.searchParams.set('perfil_revision', 'eq.' + current.perfil_revision);
    target.searchParams.set('select', RETURN_FIELDS.join(','));
    const update = await fetch(target, {
      method: 'PATCH', headers: { ...backend.headers, Prefer: 'return=representation' }, body: JSON.stringify(changes), signal, redirect: 'error'
    });
    if (!update.ok) return fail(502);
    const responseText = await update.text();
    if (!responseText) return fail(502); // A 204 cannot confirm a requested representation.
    const rows = JSON.parse(responseText);
    if (Array.isArray(rows) && rows.length === 0) return conflict();
    if (!Array.isArray(rows) || rows.length !== 1 || !object(rows[0]) || idText(rows[0].id) !== verifiedId) return fail(502);
    for (const [key, value] of Object.entries(changes)) {
      const stored = key === 'campos_especificos' && rows[0][key] !== null ? jsonObject(rows[0][key]) : rows[0][key];
      const requested = key === 'campos_especificos' && value !== null ? jsonObject(value) : value;
      if (!Object.hasOwn(rows[0], key) || canonical(stored) !== canonical(requested)) return fail(502);
    }
    // Only explicitly selected profile fields may leave the server.
    return json(200, [Object.fromEntries(RETURN_FIELDS.filter(key => Object.hasOwn(rows[0], key)).map(key => [key, rows[0][key]]))]);
  } catch { return fail(502); }
}

export const config: Config = {
  path: '/.netlify/functions/guardar-perfil',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' }
};
