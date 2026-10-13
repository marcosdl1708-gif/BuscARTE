import { timingSafeEqual } from 'node:crypto';
import { internalMailSecret, rate, readJson, sessionUser, trustedOrigin } from '../lib/session.mjs';

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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripForSubject(value = '', max = 120) {
  return String(value).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function clean(value = '', max = 800) {
  return String(value || '').trim().slice(0, max);
}

function nl2br(value = '') {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function isEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function brandShell(content) {
  return `
    <div style="margin:0;padding:0;background:#0a0a0a;color:#f2ede4;font-family:Arial,sans-serif">
      <div style="max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:32px;border-radius:8px">
        <h1 style="font-size:28px;margin:0 0 18px;letter-spacing:-1px">busc<span style="color:#d4f53c">ARTE</span></h1>
        ${content}
        <p style="color:#555;font-size:12px;margin-top:32px">buscARTE · La red gratuita para artistas argentinos</p>
      </div>
    </div>`;
}

function cta(label, href, color = '#d4f53c', textColor = '#000') {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${color};color:${textColor};padding:14px 28px;text-decoration:none;font-weight:700;margin-top:18px;border-radius:2px">${escapeHtml(label)}</a>`;
}

function buildEmail(tipo, rawDatos = {}) {
  const datos = rawDatos || {};

  if (tipo === 'bienvenida') {
    const nombre = typeof datos.nombre === 'string' ? clean(datos.nombre, 80) : '';
    return {
      subject: 'Ya estás en buscARTE. ¿Por dónde empezamos?',
      html: brandShell(`
        <div style="font-size:16px;line-height:1.6;overflow-wrap:anywhere;word-wrap:break-word">
          <h2 style="color:#f2ede4;font-size:28px;line-height:1.2;margin:0 0 24px">Qué bueno tenerte por acá.</h2>
          <p style="margin:0 0 12px">Hola${nombre ? ` <strong style="word-break:break-word">${escapeHtml(nombre)}</strong>` : ''}.</p>
          <p style="color:#ccc;margin:0 0 16px">Tu cuenta y tu perfil inicial ya están creados. Podés empezar a conocer la comunidad.</p>
          <p style="color:#ccc;margin:0 0 4px">Elegí un rubro y encontrá artistas por especialidad y zona.</p>
          <a href="${escapeHtml(`${BASE_URL}/index.html#explorar`)}" style="display:inline-block;max-width:100%;box-sizing:border-box;background:#d4f53c;color:#0a0a0a;padding:14px 20px;line-height:20px;text-align:center;text-decoration:none;font-weight:700;margin:16px 0 0;border-radius:4px">Explorar artistas</a>
          <div style="border-top:1px solid #444;margin-top:32px;padding-top:24px">
            <h3 style="color:#f2ede4;font-size:18px;line-height:1.4;margin:0 0 12px">Tu perfil, a tu ritmo</h3>
            <p style="color:#ccc;margin:0 0 8px">Cuando quieras, sumá una foto y unas líneas sobre tu trabajo. No hace falta completar todo para empezar.</p>
            <a href="${escapeHtml(`${BASE_URL}/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar`)}" style="display:inline-block;max-width:100%;box-sizing:border-box;color:#d4f53c;padding:12px 0;line-height:20px;text-decoration:underline;font-weight:700">Completar mi perfil</a>
            <p style="color:#aaa;font-size:14px;line-height:1.6;margin:8px 0 0">Para editar tu perfil, ingresá con el email y la contraseña que elegiste al registrarte.</p>
          </div>
        </div>
      `)
    };
  }

  if (tipo === 'mensaje') {
    const remitente = clean(datos.remitente, 80) || 'Un artista';
    const preview = clean(datos.preview, 300);
    return {
      subject: `💬 Nuevo mensaje de ${stripForSubject(remitente, 70)} en buscARTE`,
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">Nuevo mensaje</h2>
        <p><strong>${escapeHtml(remitente)}</strong> te envió un mensaje:</p>
        <div style="background:#1a1a1a;border-left:3px solid #d4f53c;padding:16px;margin:16px 0;color:#ccc;font-style:italic">
          “${nl2br(preview)}”
        </div>
        ${cta('Ver mensaje →', `${BASE_URL}/buscARTE_mensajes.html`)}
        <p style="color:#666;font-size:12px;margin-top:18px">Si este mensaje no corresponde, podés reportarlo desde la plataforma.</p>
      `)
    };
  }

  if (tipo === 'contacto') {
    const nombre = clean(datos.nombre, 100);
    const email = clean(datos.email, 120);
    const asunto = clean(datos.asunto, 120) || 'Contacto';
    const mensaje = clean(datos.mensaje, 3000);
    const url = clean(datos.url, 300);
    const userAgent = clean(datos.userAgent || datos.ua, 300);

    return {
      subject: `[buscARTE] ${stripForSubject(asunto, 80)} — ${stripForSubject(nombre, 60)}`,
      replyTo: isEmail(email) ? email : undefined,
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(nombre || '—')}</p>
        <p><strong>Email:</strong> ${escapeHtml(email || '—')}</p>
        <p><strong>Asunto:</strong> ${escapeHtml(asunto)}</p>
        <div style="background:#1a1a1a;border-left:3px solid #d4f53c;padding:16px;margin:16px 0;color:#ccc">
          ${nl2br(mensaje || '—')}
        </div>
        ${url ? `<p style="color:#888;font-size:12px"><strong>URL:</strong> ${escapeHtml(url)}</p>` : ''}
        ${userAgent ? `<p style="color:#888;font-size:12px"><strong>User agent:</strong> ${escapeHtml(userAgent)}</p>` : ''}
      `)
    };
  }

  if (tipo === 'reset') {
    const nombre = clean(datos.nombre, 80);
    const link = clean(datos.link, 500);
    return {
      subject: '🔑 Recuperar contraseña — buscARTE',
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">Recuperar contraseña</h2>
        <p>Hola${nombre ? ` <strong>${escapeHtml(nombre)}</strong>` : ''}, recibimos una solicitud para recuperar tu contraseña.</p>
        ${cta('Crear nueva contraseña →', link || `${BASE_URL}/buscARTE_recuperar.html`)}
        <p style="color:#888;font-size:13px;margin-top:18px">Este link expira en 1 hora. Si no solicitaste esto, ignorá este email.</p>
      `)
    };
  }

  if (tipo === 'reporte') {
    const perfilNombre = clean(datos.perfilNombre, 120) || 'Perfil sin nombre';
    const perfilId = clean(datos.perfilId, 40) || '—';
    const motivo = clean(datos.motivo, 120) || 'Reporte';
    const reporterNombre = clean(datos.reporterNombre, 120) || 'Usuario';
    const reporterId = clean(datos.reporterId, 40) || '—';
    const detalle = clean(datos.detalle, 2500);

    return {
      subject: `🚨 [REPORTE] ${stripForSubject(motivo, 60)} — perfil ${stripForSubject(perfilNombre, 60)} (ID: ${stripForSubject(perfilId, 20)})`,
      html: brandShell(`
        <h2 style="color:#ff5555;margin:0 0 16px">🚨 Nuevo reporte de perfil</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;color:#f2ede4">
          <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#888;width:40%">Perfil reportado</td><td style="padding:10px 0"><strong>${escapeHtml(perfilNombre)}</strong> (ID: ${escapeHtml(perfilId)})</td></tr>
          <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#888">Motivo</td><td style="padding:10px 0;color:#d4f53c"><strong>${escapeHtml(motivo)}</strong></td></tr>
          <tr style="border-bottom:1px solid #222"><td style="padding:10px 0;color:#888">Reportado por</td><td style="padding:10px 0">${escapeHtml(reporterNombre)} (ID: ${escapeHtml(reporterId)})</td></tr>
          ${detalle ? `<tr><td style="padding:10px 0;color:#888;vertical-align:top">Detalle</td><td style="padding:10px 0;color:#ccc">${nl2br(detalle)}</td></tr>` : ''}
        </table>
        ${cta('Ver en Supabase →', 'https://supabase.com/dashboard/project/xiaanchoanxmampegoay/editor', '#ff5555', '#fff')}
      `)
    };
  }

  if (tipo === 'novedades') {
    const nombre = clean(datos.nombre, 80) || 'artista';
    return {
      subject: '🎨 buscARTE creció — novedades que te van a interesar',
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">Pasaron muchas cosas desde que te sumaste ✦</h2>
        <p>Hola <strong>${escapeHtml(nombre)}</strong>, te contamos las novedades de buscARTE porque seguro hay algo que no viste.</p>

        <div style="margin:24px 0;padding:20px;background:#111;border-left:3px solid #d4f53c">
          <p style="margin:0 0 10px;color:#d4f53c;font-weight:700;font-size:15px">🆕 Lo que hay nuevo</p>
          <ul style="color:#ccc;padding-left:20px;line-height:2;margin:0">
            <li><strong>Artistas nuevos</strong> se sumaron a la comunidad — músicos, diseñadores, fotógrafos y más</li>
            <li><strong>Anuncios de clases</strong> — encontrá o publicá clases de tu rubro</li>
            <li><strong>Compra / venta / alquiler</strong> de instrumentos y equipos</li>
            <li><strong>Jams y eventos</strong> — hay eventos y jams para sumarse</li>
            <li>Mejoras en la creación de perfil, mensajería y filtros de búsqueda</li>
          </ul>
        </div>

        <div style="margin:24px 0;padding:20px;background:#111;border-left:3px solid #555">
          <p style="margin:0 0 10px;color:#f2ede4;font-weight:700;font-size:15px">📋 Tu perfil importa</p>
          <p style="color:#ccc;margin:0">Los artistas con foto y descripción completa aparecen primero en las búsquedas y reciben más mensajes. Si todavía no completaste el tuyo, vale la pena.</p>
          ${cta('Completar mi perfil →', `${BASE_URL}/buscARTE_perfil.html`)}
        </div>

        <div style="margin:24px 0;padding:20px;background:#111;border-left:3px solid #555">
          <p style="margin:0 0 10px;color:#f2ede4;font-weight:700;font-size:15px">💬 Tu opinión nos importa</p>
          <p style="color:#ccc;margin:0">buscARTE se construye con el feedback de la escena. Si algo no te gusta, no funciona, o se te ocurre algo que falta — contanos. Podés escribirnos desde la página o por Instagram.</p>
          <p style="margin:10px 0 0">
            ${cta('Contacto →', `${BASE_URL}/buscARTE_contacto.html`)}
            <a href="https://instagram.com/buscarte.ba" style="display:inline-block;background:#333;color:#f2ede4;padding:14px 28px;text-decoration:none;font-weight:700;margin-top:18px;margin-left:10px;border-radius:2px">Instagram →</a>
          </p>
        </div>

        ${cta('Explorar buscARTE →', `${BASE_URL}/buscARTE_busqueda.html`)}
        <p style="color:#555;font-size:12px;margin-top:24px">Te mandamos este mail porque sos parte de buscARTE. No vamos a spamear — solo te escribimos cuando hay algo que vale la pena.</p>
      `)
    };
  }

  if (tipo === 'resumen_mensual') {
    const nombre = clean(datos.nombre, 80) || 'artista';
    const nuevosMusicos = parseInt(datos.nuevosMusicos) || 0;
    const nuevosAnuncios = parseInt(datos.nuevosAnuncios) || 0;
    const proximosEventos = datos.proximosEventos || [];
    const mes = clean(datos.mes, 40) || 'este mes';

    const eventosHTML = proximosEventos.length
      ? `<div style="margin:24px 0;padding:20px;background:#111;border-left:3px solid #d4f53c">
          <p style="margin:0 0 12px;color:#d4f53c;font-weight:700;font-size:15px">🥁 Próximos jams y eventos</p>
          ${proximosEventos.map(e => `
            <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #222">
              <p style="margin:0;color:#f2ede4;font-weight:500">${escapeHtml(e.titulo)}</p>
              <p style="margin:3px 0 0;color:#888;font-size:13px">${escapeHtml(e.fecha)}${e.lugar ? ' · ' + escapeHtml(e.lugar) : ''}</p>
            </div>
          `).join('')}
         </div>`
      : '';

    return {
      subject: `✨ buscARTE en ${mes} — ${nuevosMusicos} artistas nuevos, ${nuevosAnuncios} anuncios`,
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">Lo que pasó en buscARTE ${escapeHtml(mes)}</h2>
        <p>Hola <strong>${escapeHtml(nombre)}</strong>, acá va el resumen del mes para que no te pierdas nada.</p>

        <div style="display:flex;gap:12px;margin:24px 0">
          <div style="flex:1;background:#111;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:700;color:#d4f53c">${nuevosMusicos}</div>
            <div style="font-size:13px;color:#888;margin-top:4px">artistas nuevos</div>
          </div>
          <div style="flex:1;background:#111;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:700;color:#d4f53c">${nuevosAnuncios}</div>
            <div style="font-size:13px;color:#888;margin-top:4px">anuncios publicados</div>
          </div>
        </div>

        ${eventosHTML}

        <div style="margin:24px 0;padding:20px;background:#111;border-left:3px solid #555">
          <p style="margin:0 0 10px;color:#f2ede4;font-weight:700;font-size:15px">📋 ¿Tenés algo para publicar?</p>
          <p style="color:#ccc;margin:0">Podés publicar anuncios gratis — busco artista, me ofrezco, jams, clases o compra/venta de equipos.</p>
          ${cta('Ver anuncios →', `${BASE_URL}/buscARTE_anuncios.html`)}
        </div>

        <p style="color:#555;font-size:12px;margin-top:24px">Recibís este resumen mensual porque sos parte de buscARTE. Si no querés recibirlo más, respondé este mail.</p>
      `)
    };
  }

  if (tipo === 'perfil_incompleto') {
    const nombre = typeof datos.nombre === 'string' ? clean(datos.nombre, 80) : '';
    return {
      subject: 'Dale forma a tu perfil en buscARTE',
      html: brandShell(`
        <div style="font-size:16px;line-height:1.6;overflow-wrap:anywhere;word-wrap:break-word">
          <h2 style="color:#f2ede4;font-size:28px;line-height:1.2;margin:0 0 24px">Mostrá qué hacés.</h2>
          <p style="margin:0 0 12px">Hola${nombre ? ` <strong style="word-break:break-word">${escapeHtml(nombre)}</strong>` : ''}.</p>
          <p style="color:#ccc;margin:0 0 16px">Tu perfil puede contar un poco más sobre vos y tu trabajo. Cuando quieras, sumá:</p>
          <ul style="color:#ccc;padding-left:22px;margin:0 0 16px">
            <li style="margin:0 0 12px"><strong style="color:#f2ede4">Una foto</strong> para que te reconozcan.</li>
            <li><strong style="color:#f2ede4">Una presentación breve</strong>: qué hacés y qué te gustaría compartir o encontrar en buscARTE.</li>
          </ul>
          <p style="color:#ccc;margin:0 0 4px">No hace falta completar todo para empezar a usar buscARTE.</p>
          <a href="${escapeHtml(`${BASE_URL}/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar`)}" style="display:inline-block;max-width:100%;box-sizing:border-box;background:#d4f53c;color:#0a0a0a;padding:14px 20px;line-height:20px;text-align:center;text-decoration:none;font-weight:700;margin:16px 0 0;border-radius:4px">Completar mi perfil</a>
          <p style="color:#aaa;font-size:14px;line-height:1.6;margin:16px 0 0">Para editar tu perfil, ingresá con el email y la contraseña que elegiste al registrarte.</p>
          <p style="color:#aaa;font-size:14px;line-height:1.6;margin:24px 0 0">Si ya completaste tu perfil, no necesitás hacer nada.</p>
        </div>
      `)
    };
  }

  return null;
}

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
    const email = buildEmail(tipo, datos);
    if (!email) return json(400, { error:'Datos inválidos' });
    const resendPayload = { from:FROM_EMAIL, to:[destinatario], subject:email.subject, html:email.html };
    if (email.replyTo) resendPayload.reply_to = email.replyTo;
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
      body:JSON.stringify(resendPayload),
      signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) return json(502, { error:'No se pudo enviar el email' });
    const result = await response.json().catch(() => ({}));
    return json(200, { ok:true, id:typeof result.id === 'string' ? result.id : null });
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
