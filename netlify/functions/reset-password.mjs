import { createHash } from 'node:crypto';
import { rate, readJson, serverConfig, trustedOrigin } from '../lib/session.mjs';
import { mailService } from '../lib/mail-runtime.mjs';

function environment(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), { status:statusCode, headers:JSON_HEADERS });
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
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

async function solicitar(emailRaw) {
  const email = normalizeEmail(typeof emailRaw === 'string' ? emailRaw : '');

  // No revelar existencia de cuenta. Email inválido también devuelve OK.
  if (!isEmail(email) || email.length > 160) return json(200, { ok: true });

  const usuarios = await supabaseFetch(
    `/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}&select=id,nombre,email&limit=1`
  );
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!usuario || !/^[1-9]\d*$/.test(String(usuario.id || ''))) return json(200, { ok: true });

  // The queue contains no raw token. Dispatch derives a stable secret token,
  // stores only its hash, and starts its one-hour expiry when it can actually send.
  const job = await mailService.enqueue({tipo:'reset',destinatario:email,perfilId:usuario.id,
    datos:{nombre:usuario.nombre},eventKey:'reset:'+usuario.id+':'+Math.floor(Date.now()/300000)});
  await mailService.dispatch(job.id);

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
