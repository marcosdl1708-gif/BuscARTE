import { randomBytes, createHash } from 'node:crypto';
import { rate, readJson, serverConfig, trustedOrigin } from '../lib/session.mjs';

function environment(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}
const FROM_EMAIL = environment('FROM_EMAIL') || 'buscARTE <hola@buscarte.com.ar>';
const BASE_URL = environment('URL') || 'https://buscarte.com.ar';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), { status:statusCode, headers:JSON_HEADERS });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function makeToken() {
  return randomBytes(32).toString('hex');
}

// Guardamos solo el hash del token en la DB. El token crudo viaja en el email.
// Así, si alguien leyera la tabla perfiles, no podría usar los reset_token.
function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

async function supabaseFetch(path, options = {}) {
  const config = serverConfig();
  if (!config) throw new Error('configuration');
  const response = await fetch(`${config.origin}${path}`, {
    ...options,
    headers: {
      ...config.headers,
      ...(options.headers || {})
    },
    redirect:'error',
    signal:AbortSignal.timeout(15000)
  });
  const data = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error('backend');
  }
  return data;
}

function resetEmailHtml(nombre, resetUrl) {
  const firstName = nombre ? String(nombre).split(' ')[0] : '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
      <h1 style="font-size:2rem;text-align:center;margin:0 0 1rem">busc<span style="color:#d4f53c">ARTE</span></h1>
      <h2 style="color:#d4f53c">Recuperar contraseña 🔑</h2>
      <p>Hola ${escapeHtml(firstName)}! Recibimos una solicitud para resetear tu contraseña.</p>
      <div style="text-align:center;margin:2rem 0">
        <a href="${escapeHtml(resetUrl)}" style="background:#d4f53c;color:#000;padding:1rem 2rem;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block">
          Crear nueva contraseña →
        </a>
      </div>
      <p style="color:#888;font-size:.8rem;text-align:center">Este link expira en 1 hora. Si no solicitaste esto, ignorá este email.</p>
    </div>`;
}

async function sendResetEmail(email, nombre, token) {
  const resetUrl = `${BASE_URL}/buscARTE_reset.html?token=${encodeURIComponent(token)}`;
  const key = environment('RESEND_API_KEY');
  if (!key) throw new Error('configuration');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Recuperá tu contraseña de buscARTE 🔑',
      html: resetEmailHtml(nombre, resetUrl)
    }),
    redirect:'error',
    signal:AbortSignal.timeout(15000)
  });

  const data = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error('mail');
  }

  return data;
}

async function solicitar(emailRaw) {
  const email = normalizeEmail(typeof emailRaw === 'string' ? emailRaw : '');

  // No revelar existencia de cuenta. Email inválido también devuelve OK.
  if (!isEmail(email) || email.length > 160) return json(200, { ok: true });

  const usuarios = await supabaseFetch(
    `/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}&select=id,nombre,email&limit=1`
  );
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!usuario || !/^[1-9]\d*$/.test(String(usuario.id || ''))) return json(200, { ok: true });

  const token = makeToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await supabaseFetch(`/rest/v1/perfiles?id=eq.${usuario.id}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ reset_token: hashToken(token), reset_expires: expires })
  });

  await sendResetEmail(email, usuario.nombre, token);

  return json(200, { ok: true });
}

async function verificar(tokenRaw) {
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return json(200, { valido: false, error: 'Token inválido' });

  const usuarios = await supabaseFetch(
    `/rest/v1/perfiles?reset_token=eq.${encodeURIComponent(hashToken(token))}&select=id,nombre,reset_expires&limit=1`
  );
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!usuario) return json(200, { valido: false, error: 'Token inválido' });
  if (!usuario.reset_expires || !Number.isFinite(Date.parse(usuario.reset_expires)) || new Date(usuario.reset_expires) <= new Date()) {
    return json(200, { valido: false, error: 'El link expiró. Solicitá uno nuevo.' });
  }

  return json(200, { valido: true, nombre: usuario.nombre ? String(usuario.nombre).split(' ')[0] : '' });
}

async function cambiar(tokenRaw, nuevaPassword) {
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
  const nueva = typeof nuevaPassword === 'string' ? nuevaPassword : '';

  if (!/^[a-f0-9]{64}$/.test(token)) return json(200, { ok: false, error: 'Token inválido o expirado' });
  if (nueva.length < 8) {
    return json(200, { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (Buffer.byteLength(nueva, 'utf8') > 72 || nueva.includes('\0')) {
    return json(200, { ok:false, error:'La contraseña admite hasta 72 bytes. Probá una más corta.' });
  }

  // La RPC verifica vencimiento y consume el hash en el mismo UPDATE que cambia
  // la contraseña. Dos solicitudes simultáneas no pueden reutilizar el link.
  const changed = await supabaseFetch('/rest/v1/rpc/consumir_reset_password', {
    method: 'POST',
    body: JSON.stringify({ p_token_hash:hashToken(token), p_nueva_password:nueva })
  });
  if (changed !== true) return json(200, { ok:false, error:'Token inválido o expirado' });
  // Las sesiones se invalidan al no coincidir su fingerprint con el nuevo hash.
  return json(200, { ok:true });
}

export default async function resetPassword(request) {
  if (request.method !== 'POST') return json(405, { error:'Method not allowed' });
  if (!trustedOrigin(request)) return json(403, { error:'No autorizado' });
  if (!serverConfig() || !environment('RESEND_API_KEY')) return json(503, { error:'El servicio no está disponible. Intentá más tarde.' });
  let payload;
  try { payload = await readJson(request, 8192); }
  catch (_) { return json(400, { error:'Datos inválidos' }); }
  if (!['solicitar', 'verificar', 'cambiar'].includes(payload.accion)) return json(400, { error:'Acción inválida' });
  try {
    if (!await rate(request, 'reset-password', 20, 60)) return json(429, { error:'Esperá un minuto antes de volver a intentar' });
    if (payload.accion === 'solicitar') return await solicitar(payload.email);
    if (payload.accion === 'verificar') return await verificar(payload.token);
    return await cambiar(payload.token, payload.nueva_password);
  } catch (_) {
    // La solicitud conserva respuesta neutra: no revela qué cuenta existe ni
    // errores privados del proveedor. Verificar/cambiar necesitan mostrar fallo.
    if (payload.accion === 'solicitar') return json(200, { ok:true });
    return json(503, { error:'No pudimos completar la solicitud. Intentá más tarde.' });
  }
}

export const config = {
  path:'/.netlify/functions/reset-password',
  rateLimit:{ action:'rate_limit', aggregateBy:['ip', 'domain'], windowSize:60, windowLimit:20 }
};
