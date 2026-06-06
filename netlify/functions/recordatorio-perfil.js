/**
 * recordatorio-perfil.js
 * Netlify Scheduled Function — corre cada lunes a las 10:00 AM ART
 * Schedule: "0 13 * * 1"
 */

const SUPABASE_URL   = process.env.SUPABASE_URL || 'https://xiaanchoanxmampegoay.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const SEND_EMAIL_URL = process.env.URL
  ? `${process.env.URL}/.netlify/functions/send-email`
  : 'https://buscarte.com.ar/.netlify/functions/send-email';

const DELAY_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getUsuariosIncompletos() {
  const hace14dias = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const hace7dias  = new Date(Date.now() -  7 * 24 * 3600 * 1000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/perfiles?select=id,nombre,email,foto_url,bio` +
    `&created_at=gte.${encodeURIComponent(hace14dias)}` +
    `&created_at=lte.${encodeURIComponent(hace7dias)}` +
    `&email=not.is.null`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.filter(u =>
    u.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) &&
    (!u.foto_url || !u.bio || u.bio.trim().length < 10)
  );
}

async function sendRecordatorio(user) {
  const res = await fetch(SEND_EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-buscarte-secret': process.env.INTERNAL_SECRET || '' },
    body: JSON.stringify({
      tipo: 'perfil_incompleto',
      destinatario: user.email,
      datos: { nombre: user.nombre || 'artista' }
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

exports.handler = async function(event) {
  console.log('[recordatorio-perfil] Iniciando...');
  if (!SUPABASE_KEY) {
    console.error('[recordatorio-perfil] Falta SUPABASE_SERVICE_KEY');
    return { statusCode: 500 };
  }
  let usuarios;
  try {
    usuarios = await getUsuariosIncompletos();
  } catch(e) {
    console.error('[recordatorio-perfil] Error:', e.message);
    return { statusCode: 500 };
  }
  console.log(`[recordatorio-perfil] Usuarios a notificar: ${usuarios.length}`);
  let ok = 0, errores = 0;
  for (let i = 0; i < usuarios.length; i++) {
    try {
      await sendRecordatorio(usuarios[i]);
      console.log(`[recordatorio-perfil] ✅ ${usuarios[i].email}`);
      ok++;
    } catch(e) {
      console.error(`[recordatorio-perfil] ❌ ${usuarios[i].email}: ${e.message}`);
      errores++;
    }
    if (i < usuarios.length - 1) await sleep(DELAY_MS);
  }
  console.log(`[recordatorio-perfil] Fin — ok:${ok} errores:${errores}`);
  return { statusCode: 200 };
};
