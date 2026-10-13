/**
 * recordatorio-perfil.js
 * Netlify Scheduled Function — corre cada lunes a las 10:00 AM ART
 * Schedule: "0 13 * * 1"
 */

const SEND_EMAIL_URL = process.env.URL
  ? `${process.env.URL}/.netlify/functions/send-email`
  : 'https://buscarte.com.ar/.netlify/functions/send-email';

const DELAY_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getUsuariosIncompletos(backend) {
  const hace14dias = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const hace7dias  = new Date(Date.now() -  7 * 24 * 3600 * 1000).toISOString();
  const res = await fetch(
    `${backend.origin}/rest/v1/perfiles?select=id,nombre,email,foto_url,bio` +
    `&created_at=gte.${encodeURIComponent(hace14dias)}` +
    `&created_at=lte.${encodeURIComponent(hace7dias)}` +
    `&email=not.is.null`,
    { headers:backend.headers, redirect:'error', signal:AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error('backend');
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('backend');
  return data.filter(u =>
    u.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) &&
    (!u.foto_url || !u.bio || u.bio.trim().length < 10)
  );
}

async function sendRecordatorio(user, secret) {
  if (!secret) throw new Error('configuration');
  const res = await fetch(SEND_EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-buscarte-secret':secret },
    body: JSON.stringify({
      tipo: 'perfil_incompleto',
      destinatario: user.email,
      datos: { nombre: user.nombre || 'artista' }
    }),
    redirect:'error',
    signal:AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('mail');
}

exports.handler = async function(event) {
  console.log('[recordatorio-perfil] Iniciando...');
  let backend, secret;
  try {
    const security = await import('../lib/session.mjs');
    backend = security.serverConfig();
    secret = security.internalMailSecret();
  } catch (_) { /* Fallar cerrado si la configuración o el módulo no están disponibles. */ }
  if (!backend || !secret) {
    console.error('[recordatorio-perfil] Configuración de servidor no disponible');
    return { statusCode: 500 };
  }
  let usuarios;
  try {
    usuarios = await getUsuariosIncompletos(backend);
  } catch(e) {
    console.error('[recordatorio-perfil] No se pudo consultar el lote');
    return { statusCode: 500 };
  }
  console.log(`[recordatorio-perfil] Usuarios a notificar: ${usuarios.length}`);
  let ok = 0, errores = 0;
  for (let i = 0; i < usuarios.length; i++) {
    try {
      await sendRecordatorio(usuarios[i], secret);
      ok++;
    } catch(e) {
      errores++;
    }
    if (i < usuarios.length - 1) await sleep(DELAY_MS);
  }
  console.log(`[recordatorio-perfil] Fin — ok:${ok} errores:${errores}`);
  return { statusCode: 200 };
};
