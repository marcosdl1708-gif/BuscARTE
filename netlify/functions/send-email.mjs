import { timingSafeEqual } from 'node:crypto';
import { internalMailSecret, rate, readJson, sessionUser, trustedOrigin } from '../lib/session.mjs';
import { mailService } from '../lib/mail-runtime.mjs';

function environment(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}
const FROM_EMAIL = environment('FROM_EMAIL') || 'buscARTE <hola@buscarte.com.ar>';
const ADMIN_EMAIL = environment('ADMIN_EMAIL') || 'BuscARTE.webmail@gmail.com';
const BASE_URL = environment('URL') || 'https://buscarte.com.ar';

// Públicos pero con destinatario forzado al admin (nunca relay):
const TIPOS_ADMIN = ['contacto', 'reporte'];
// Internos (solo server): requieren secreto por header. Incluye reset por el link sensible.
const TIPOS_INTERNOS = ['novedades', 'resumen_mensual', 'perfil_incompleto', 'reset'];
// La bienvenida y los mensajes sólo se disparan después de persistirlos en el servidor.
const TIPOS_TRANSACCIONALES = ['bienvenida', 'mensaje'];

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), { status:statusCode, headers:JSON_HEADERS });
}

const BODY_LIMIT = 16 * 1024;
function plainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function authorizedInternal(request) {
  const expected = internalMailSecret();
  const supplied = request.headers.get('x-buscarte-secret') || '';
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected), right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isEmail(value = '') { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()); }

export default async function sendEmail(request) {
  if (request.method !== 'POST') return json(405, { error:'Method Not Allowed' });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return json(415, { error:'Formato no admitido' });
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > BODY_LIMIT) return json(413, { error:'El mensaje es demasiado largo' });

  let payload;
  try {
    payload = await readJson(request, BODY_LIMIT);
  } catch (_) { return json(400, { error:'JSON inválido' }); }
  if (!plainObject(payload) || !plainObject(payload.datos || {})) return json(400, { error:'Datos inválidos' });
  const tipo = typeof payload.tipo === 'string' ? payload.tipo.trim() : '';
  if (![...TIPOS_ADMIN, ...TIPOS_INTERNOS, ...TIPOS_TRANSACCIONALES].includes(tipo)) {
    return json(400, { error:'Tipo de email desconocido' });
  }
  let datos = payload.datos || {}, destinatario;
  try {
    if (TIPOS_ADMIN.includes(tipo)) {
      if (!trustedOrigin(request)) return json(403, { error:'No autorizado' });
      if (!await rate(request, 'public-mail', 5, 60)) return json(429, { error:'Esperá un minuto antes de enviar otro mensaje' });
      // Las consultas públicas siempre llegan al administrador, nunca al destinatario del navegador.
      destinatario = ADMIN_EMAIL;
      if (tipo === 'contacto') {
        if (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.length > 100 ||
            typeof datos.email !== 'string' || !isEmail(datos.email) || datos.email.length > 120 ||
            typeof datos.mensaje !== 'string' || !datos.mensaje.trim() || datos.mensaje.length > 3000 ||
            (datos.asunto != null && (typeof datos.asunto !== 'string' || datos.asunto.length > 120))) {
          return json(400, { error:'Revisá tu nombre, email y mensaje' });
        }
      } else {
        const user = await sessionUser(request);
        if (!user) return json(401, { error:'Volvé a ingresar para enviar el reporte' });
        if (!/^[1-9]\d*$/.test(String(datos.perfilId || '')) ||
            typeof datos.motivo !== 'string' || !datos.motivo.trim() || datos.motivo.length > 120 ||
            (datos.detalle != null && (typeof datos.detalle !== 'string' || datos.detalle.length > 2500))) {
          return json(400, { error:'Datos del reporte inválidos' });
        }
        // La identidad del reportante procede exclusivamente de la sesión del servidor.
        datos = { ...datos, reporterId:String(user.id), reporterNombre:user.nombre || 'Usuario' };
      }
    } else {
      // Fallar cerrado: conocer un email o un ID no autoriza una notificación.
      if (!authorizedInternal(request)) return json(403, { error:'No autorizado' });
      destinatario = typeof payload.destinatario === 'string' ? payload.destinatario.trim() : '';
    }
    if (!isEmail(destinatario) || destinatario.length > 160) return json(400, { error:'Destinatario inválido' });
    const key = environment('RESEND_API_KEY');
    if (!key) return json(503, { error:'No se pudo enviar el email' });
    // Persist first. A full quota or provider outage defers this event instead of losing it.
    const job = await mailService.enqueue({tipo,destinatario,datos,
      ...(!TIPOS_ADMIN.includes(tipo)&&typeof payload.evento==='string'&&payload.evento.length<=200?{eventKey:payload.evento}:{}),
      ...(!TIPOS_ADMIN.includes(tipo)&&/^[1-9]\d*$/.test(String(payload.perfil_id||''))?{perfilId:payload.perfil_id}:{})
    });
    const result = await mailService.dispatch(job.id);
    return json(result.status==='sent'?200:202,{ok:true,queued:result.status!=='sent',id:result.id||job.id});
  } catch (_) {
    // Nunca registrar destinatarios, tokens, credenciales ni respuestas crudas de los proveedores.
    return json(503, { error:'No se pudo enviar el email' });
  }
}

export const config = {
  path:'/.netlify/functions/send-email',
  // Debe admitir la cadencia histórica de los lotes internos (400 ms entre correos).
  rateLimit:{ action:'rate_limit', aggregateBy:['ip', 'domain'], windowSize:60, windowLimit:180 }
};
