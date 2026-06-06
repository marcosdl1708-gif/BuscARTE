/**
 * resumen-mensual.js
 * Netlify Scheduled Function — corre el día 1 de cada mes a las 10:00 AM ART
 * Schedule: "0 13 1 * *"
 */

const SUPABASE_URL   = process.env.SUPABASE_URL || 'https://xiaanchoanxmampegoay.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const SEND_EMAIL_URL = process.env.URL
  ? `${process.env.URL}/.netlify/functions/send-email`
  : 'https://buscarte.com.ar/.netlify/functions/send-email';

const DELAY_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function getMesAnterior() {
  const now = new Date();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const desde = new Date(year, month, 1).toISOString();
  const hasta = new Date(year, month + 1, 1).toISOString();
  return { desde, hasta, nombre: MESES[month] };
}

async function getStats(desde, hasta) {
  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const rMusicos = await fetch(
    `${SUPABASE_URL}/rest/v1/perfiles?select=id&created_at=gte.${encodeURIComponent(desde)}&created_at=lt.${encodeURIComponent(hasta)}`,
    { headers: { ...sbHeaders, 'Prefer':'count=exact','Range-Unit':'items','Range':'0-0' } }
  );
  const totalMusicos = parseInt(rMusicos.headers.get('content-range')?.split('/')[1] || '0');
  const rAnuncios = await fetch(
    `${SUPABASE_URL}/rest/v1/anuncios?select=id&tipo=neq.jam&created_at=gte.${encodeURIComponent(desde)}&created_at=lt.${encodeURIComponent(hasta)}`,
    { headers: { ...sbHeaders, 'Prefer':'count=exact','Range-Unit':'items','Range':'0-0' } }
  );
  const totalAnuncios = parseInt(rAnuncios.headers.get('content-range')?.split('/')[1] || '0');
  const ahora = new Date().toISOString();
  const en30dias = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const rEventos = await fetch(
    `${SUPABASE_URL}/rest/v1/anuncios?select=titulo,fecha_evento,lugar&tipo=eq.jam&estado=eq.activo` +
    `&fecha_evento=gte.${encodeURIComponent(ahora)}&fecha_evento=lte.${encodeURIComponent(en30dias)}&order=fecha_evento.asc&limit=3`,
    { headers: sbHeaders }
  );
  const eventos = rEventos.ok ? await rEventos.json() : [];
  const proximosEventos = eventos.map(e => ({
    titulo: e.titulo || 'Jam / Evento',
    fecha: e.fecha_evento ? new Date(e.fecha_evento).toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '',
    lugar: e.lugar || ''
  }));
  return { totalMusicos, totalAnuncios, proximosEventos };
}

async function getAllUsers() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/perfiles?select=id,nombre,email&email=not.is.null&order=created_at.asc&limit=2000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.filter(u => u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email));
}

async function sendResumen(user, stats, mes) {
  const res = await fetch(SEND_EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-buscarte-secret': process.env.INTERNAL_SECRET || '' },
    body: JSON.stringify({
      tipo: 'resumen_mensual',
      destinatario: user.email,
      datos: { nombre: user.nombre || 'artista', mes, nuevosMusicos: stats.totalMusicos, nuevosAnuncios: stats.totalAnuncios, proximosEventos: stats.proximosEventos }
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

exports.handler = async function(event) {
  console.log('[resumen-mensual] Iniciando...');
  if (!SUPABASE_KEY) {
    console.error('[resumen-mensual] Falta SUPABASE_SERVICE_KEY');
    return { statusCode: 500 };
  }
  const { desde, hasta, nombre: mes } = getMesAnterior();
  let stats, users;
  try {
    [stats, users] = await Promise.all([getStats(desde, hasta), getAllUsers()]);
  } catch(e) {
    console.error('[resumen-mensual] Error:', e.message);
    return { statusCode: 500 };
  }
  const tanda = users.slice(0, 90);
  let ok = 0, errores = 0;
  for (let i = 0; i < tanda.length; i++) {
    try {
      await sendResumen(tanda[i], stats, mes);
      console.log(`[resumen-mensual] ✅ ${tanda[i].email}`);
      ok++;
    } catch(e) {
      console.error(`[resumen-mensual] ❌ ${tanda[i].email}: ${e.message}`);
      errores++;
    }
    if (i < tanda.length - 1) await sleep(DELAY_MS);
  }
  console.log(`[resumen-mensual] Fin — ok:${ok} errores:${errores}`);
  return { statusCode: 200 };
};
