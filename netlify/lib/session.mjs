import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

const ORIGINS = new Set(['https://buscarte.com.ar', 'https://www.buscarte.com.ar']);
const COOKIE = '__Host-ba_session';
const AGE = 30 * 24 * 60 * 60;
export const environment = name => globalThis.Netlify?.env?.get(name) || process.env[name] || '';
export const userFields = 'id,nombre,email,tipo_cuenta,rubro,referentes,generos,baneado';
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const id = value => /^(?:[1-9]\d{0,14})$/.test(String(value)) ? String(value) : '';
export const json = (status, value, extra = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }
});
export function trustedOrigin(request) {
  const origin = request.headers.get('origin');
  return !!origin && ORIGINS.has(origin) && origin === new URL(request.url).origin &&
    !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'));
}
export function serverConfig() {
  try {
    const origin = new URL(environment('SUPABASE_URL') || 'https://xiaanchoanxmampegoay.supabase.co');
    const key = environment('SUPABASE_SERVICE_ROLE_KEY') || environment('SUPABASE_SERVICE_KEY');
    if (!key || origin.origin !== 'https://xiaanchoanxmampegoay.supabase.co' || origin.pathname !== '/' || origin.search || origin.hash) return null;
    const secret = /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key);
    if (!secret && JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url')).role !== 'service_role') return null;
    return { origin: origin.origin, key, headers: { apikey: key, ...(secret ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json' } };
  } catch { return null; }
}
export function internalMailSecret() {
  const explicit = environment('INTERNAL_SECRET');
  if (explicit && explicit.length >= 32) return explicit;
  const config = serverConfig();
  return config ? createHmac('sha256', config.key).update('buscarte-internal-mail-v1').digest('hex') : '';
}
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export async function backend(path, options = {}) {
  const config = serverConfig();
  if (!config) throw new Error('configuration');
  return fetch(config.origin + path, { ...options, headers: { ...config.headers, ...options.headers }, redirect: 'error', signal: options.signal || AbortSignal.timeout(15000) });
}
export async function backendJson(path, options = {}) {
  const response = await backend(path, options);
  if (!response.ok) throw new Error('backend');
  if (response.status === 204) return null;
  // PostgREST also returns an empty 201 for a successful INSERT with its
  // default return=minimal. A persisted session is not a failed login.
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function sessionToken(request) {
  const parts = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(COOKIE + '='));
  if (parts.length !== 1) return '';
  const token = parts[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}
export const clearCookie = () => COOKIE + '=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
export async function sessionUser(request) {
  const token = sessionToken(request);
  if (!token) return null;
  const rows = await backendJson('/rest/v1/sesiones_web?token_hash=eq.' + hash(token) + '&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&select=perfil_id,password_fingerprint&limit=1');
  if (!Array.isArray(rows) || rows.length !== 1 || !id(rows[0].perfil_id)) return null;
  const profiles = await backendJson('/rest/v1/perfiles?id=eq.' + id(rows[0].perfil_id) + '&select=' + userFields + ',password&limit=1');
  const user = Array.isArray(profiles) && profiles.length === 1 ? profiles[0] : null;
  if (!user || user.baneado === true || !user.password || !equalSecret(hash(user.password), rows[0].password_fingerprint)) return null;
  delete user.password;
  return user;
}
export async function startSession(profileId) {
  const rows = await backendJson('/rest/v1/perfiles?id=eq.' + id(profileId) + '&select=' + userFields + ',password&limit=1');
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].baneado === true || !rows[0].password) throw new Error('identity');
  const token = randomBytes(32).toString('base64url');
  await backendJson('/rest/v1/sesiones_web', { method: 'POST', body: JSON.stringify({ token_hash: hash(token), perfil_id: rows[0].id, password_fingerprint: hash(rows[0].password), expires_at: new Date(Date.now() + AGE * 1000).toISOString() }) });
  delete rows[0].password;
  return { user: rows[0], cookie: COOKIE + '=' + token + '; Path=/; Max-Age=' + AGE + '; Secure; HttpOnly; SameSite=Lax' };
}
export async function endSession(request) {
  const token = sessionToken(request);
  if (token) await backend('/rest/v1/sesiones_web?token_hash=eq.' + hash(token), { method: 'DELETE' }).then(response => { if (!response.ok) throw new Error('backend'); });
}
export async function readBytes(request, maximum = 32768) {
  if (!request.body || Number(request.headers.get('content-length') || 0) > maximum) throw new Error('body');
  const reader = request.body.getReader(), chunks = []; let length = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.length;
    if (length > maximum) { await reader.cancel(); throw new Error('body'); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), length);
}
export async function readJson(request, maximum = 32768) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('body');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request, maximum)));
  if (!object(value) || !safeJson(value)) throw new Error('body');
  return value;
}
export function safeJson(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 12000 && !value.includes('\0');
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => safeJson(item, depth + 1));
  return object(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && key.length <= 128 && safeJson(item, depth + 1));
}
export async function rate(request, scope, maximum, seconds, subject = '') {
  // Netlify replaces this header; no client-supplied forwarded IP is trusted.
  const address = request.headers.get('x-nf-client-connection-ip');
  if (!address) throw new Error('ip');
  const allowed = await backendJson('/rest/v1/rpc/limitar_operacion_web', { method: 'POST', body: JSON.stringify({ p_scope: scope, p_actor_hash: hash(scope + ':' + (subject || address)), p_limit: maximum, p_seconds: seconds }) });
  return allowed === true;
}
export async function notify(tipo, destinatario, datos) {
  const secret = internalMailSecret();
  if (!secret) return;
  const response = await fetch('https://buscarte.com.ar/.netlify/functions/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-buscarte-secret': secret }, body: JSON.stringify({ tipo, destinatario, datos }), signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) console.warn('Mail notification unavailable');
}
