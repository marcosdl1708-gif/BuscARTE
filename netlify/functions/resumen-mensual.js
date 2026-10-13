/**
 * resumen-mensual.js
 * Netlify Scheduled Function — corre el día 1 de cada mes a las 10:00 AM ART
 * Schedule: "0 13 1 * *"
 */

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

async function getStats(desde, hasta, backend) {
  const sbHeaders = backend.headers;
  const rMusicos = await fetch(
    `${backend.origin}/rest/v1/perfiles?select=id&created_at=gte.${encodeURIComponent(desde)}&created_at=lt.${encodeURIComponent(hasta)}`,
    { headers: { ...sbHeaders, 'Prefer':'count=exact','Range-Unit':'items','Range':'0-0' }, redirect:'error', signal:AbortSignal.timeout(15000) }
  );
  if (!rMusicos.ok) throw new Error('backend');
  const totalMusicos = parseInt(rMusicos.headers.get('content-range')?.split('/')[1] || '0');
  const rAnuncios = await fetch(
    `${backend.origin}/rest/v1/anuncios?select=id&tipo=neq.jam&created_at=gte.${encodeURIComponent(desde)}&created_at=lt.${encodeURIComponent(hasta)}`,
    { headers: { ...sbHeaders, 'Prefer':'count=exact','Range-Unit':'items','Range':'0-0' }, redirect:'error', signal:AbortSignal.timeout(15000) }
  );
  if (!rAnuncios.ok) throw new Error('backend');
  const totalAnuncios = parseInt(rAnuncios.headers.get('content-range')?.split('/')[1] || '0');
  const ahora = new Date().toISOString();
  const en30dias = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const rEventos = await fetch(
    `${backend.origin}/rest/v1/anuncios?select=titulo,fecha_evento,lugar&tipo=eq.jam&estado=eq.activo` +
    `&fecha_evento=gte.${encodeURIComponent(ahora)}&fecha_evento=lte.${encodeURIComponent(en30dias)}&order=fecha_evento.asc&limit=3`,
    { headers:sbHeaders, redirect:'error', signal:AbortSignal.timeout(15000) }
  );
  const eventos = rEventos.ok ? await rEventos.json() : [];
  const proximosEventos = eventos.map(e => ({
    titulo: e.titulo || 'Jam / Evento',
    fecha: e.fecha_evento ? new Date(e.fecha_evento).toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '',
    lugar: e.lugar || ''
  }));
  return { totalMusicos, totalAnuncios, proximosEventos };
}

async function getAllUsers(backend) {
  const res = await fetch(
    `${backend.origin}/rest/v1/perfiles?select=id,nombre,email&email=not.is.null&order=created_at.asc&limit=2000`,
    { headers:backend.headers, redirect:'error', signal:AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error('backend');
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('backend');
  return data.filter(u => u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email));
}

async function sendResumen(user, stats, mes, secret) {
  if (!secret) throw new Error('configuration');
  const res = await fetch(SEND_EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-buscarte-secret':secret },
    body: JSON.stringify({
      tipo: 'resumen_mensual',
      destinatario: user.email,
      datos: { nombre: user.nombre || 'artista', mes, nuevosMusicos: stats.totalMusicos, nuevosAnuncios: stats.totalAnuncios, proximosEventos: stats.proximosEventos }
    }),
    redirect:'error',
    signal:AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('mail');
}

exports.handler = async function(event) {
  console.log('[resumen-mensual] Iniciando...');
  let backend, secret;
  try {
    const security = await import('../lib/session.mjs');
    backend = security.serverConfig();
    secret = security.internalMailSecret();
  } catch (_) { /* Fallar cerrado si la configuración o el módulo no están disponibles. */ }
  if (!backend || !secret) {
    console.error('[resumen-mensual] Configuración de servidor no disponible');
    return { statusCode: 500 };
  }
  const { desde, hasta, nombre: mes } = getMesAnterior();
  let stats, users;
  try {
    [stats, users] = await Promise.all([getStats(desde, hasta, backend), getAllUsers(backend)]);
  } catch(e) {
    console.error('[resumen-mensual] No se pudo consultar el lote');
    return { statusCode: 500 };
  }
  const tanda = users.slice(0, 90);
  let ok = 0, errores = 0;
  for (let i = 0; i < tanda.length; i++) {
    try {
      await sendResumen(tanda[i], stats, mes, secret);
      ok++;
    } catch(e) {
      errores++;
    }
    if (i < tanda.length - 1) await sleep(DELAY_MS);
  }
  console.log(`[resumen-mensual] Fin — ok:${ok} errores:${errores}`);
  return { statusCode: 200 };
};
