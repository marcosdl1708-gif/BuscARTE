const crypto = require('crypto');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xiaanchoanxmampegoay.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'buscARTE <hola@buscarte.com.ar>';
const BASE_URL = process.env.URL || 'https://buscarte.com.ar';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
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
  return crypto.randomBytes(32).toString('hex');
}

// Guardamos solo el hash del token en la DB. El token crudo viaja en el email.
// Así, si alguien leyera la tabla perfiles, no podría usar los reset_token.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await readJsonSafe(response);
  if (!response.ok) {
    const err = new Error('Supabase request failed');
    err.status = response.status;
    err.data = data;
    throw err;
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

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: 'Recuperá tu contraseña de buscARTE 🔑',
      html: resetEmailHtml(nombre, resetUrl)
    })
  });

  const data = await readJsonSafe(response);
  if (!response.ok) {
    const err = new Error('Resend request failed');
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function solicitar(emailRaw) {
  const email = normalizeEmail(emailRaw);

  // No revelar existencia de cuenta. Email inválido también devuelve OK.
  if (!isEmail(email)) return json(200, { ok: true });

  const usuarios = await supabaseFetch(
    `/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}&select=id,nombre,email&limit=1`
  );
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!usuario) return json(200, { ok: true });

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
  const token = String(tokenRaw || '').trim();
  if (!token) return json(200, { valido: false, error: 'Token inválido' });

  const usuarios = await supabaseFetch(
    `/rest/v1/perfiles?reset_token=eq.${encodeURIComponent(hashToken(token))}&select=id,nombre,reset_expires&limit=1`
  );
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!usuario) return json(200, { valido: false, error: 'Token inválido' });
  if (!usuario.reset_expires || new Date(usuario.reset_expires) < new Date()) {
    return json(200, { valido: false, error: 'El link expiró. Solicitá uno nuevo.' });
  }

  return json(200, { valido: true, nombre: usuario.nombre ? String(usuario.nombre).split(' ')[0] : '' });
}

async function cambiar(tokenRaw, nuevaPassword) {
  const token = String(tokenRaw || '').trim();
  const nueva = String(nuevaPassword || '');

  if (!token) return json(200, { ok: false, error: 'Token inválido' });
  if (nueva.length < 8) {
    return json(200, { ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const usuarios = await supabaseFetch(
    `/rest/v1/perfiles?reset_token=eq.${encodeURIComponent(hashToken(token))}&select=id,reset_expires&limit=1`
  );
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!usuario || !usuario.reset_expires || new Date(usuario.reset_expires) < new Date()) {
    return json(200, { ok: false, error: 'Token inválido o expirado' });
  }

  await supabaseFetch('/rest/v1/rpc/cambiar_password', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: usuario.id, p_nueva_password: nueva })
  });

  // Invalidar el link después de usarlo.
  await supabaseFetch(`/rest/v1/perfiles?id=eq.${usuario.id}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ reset_token: null, reset_expires: null })
  });

  return json(200, { ok: true });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!SUPABASE_KEY) return json(500, { error: 'SUPABASE_KEY no configurada' });
  if (!RESEND_API_KEY) return json(500, { error: 'RESEND_API_KEY no configurada' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return json(400, { error: 'JSON inválido' });
  }

  try {
    if (payload.accion === 'solicitar') return await solicitar(payload.email);
    if (payload.accion === 'verificar') return await verificar(payload.token);
    if (payload.accion === 'cambiar') return await cambiar(payload.token, payload.nueva_password);

    return json(400, { error: 'Acción inválida' });
  } catch (error) {
    console.error('Reset password error:', error.status || '', error.data || error.message);
    return json(500, { error: 'Error interno procesando la solicitud' });
  }
};
