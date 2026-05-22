const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'buscARTE <hola@buscarte.com.ar>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'BuscARTE.webmail@gmail.com';
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
        <p style="color:#555;font-size:12px;margin-top:32px">buscARTE · La red gratuita para músicos argentinos y la escena que los rodea</p>
      </div>
    </div>`;
}

function cta(label, href, color = '#d4f53c', textColor = '#000') {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${color};color:${textColor};padding:14px 28px;text-decoration:none;font-weight:700;margin-top:18px;border-radius:2px">${escapeHtml(label)}</a>`;
}

function buildEmail(tipo, rawDatos = {}) {
  const datos = rawDatos || {};

  if (tipo === 'bienvenida') {
    const nombre = clean(datos.nombre, 80) || 'músico/a';
    return {
      subject: `¡Bienvenido/a a buscARTE, ${stripForSubject(nombre, 60)}!`,
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">¡Ya sos parte de la escena!</h2>
        <p>Hola <strong>${escapeHtml(nombre)}</strong>, tu perfil en buscARTE ya está activo.</p>
        <p style="color:#888;margin:22px 0 8px">Ahora podés:</p>
        <ul style="color:#ccc;padding-left:22px;line-height:1.8">
          <li>Completar tu perfil para aparecer mejor en las búsquedas.</li>
          <li>Explorar músicos y conectar con otros artistas.</li>
          <li>Publicar anuncios, jams, clases o compra/venta de equipos.</li>
        </ul>
        ${cta('Explorar músicos →', `${BASE_URL}/buscARTE_busqueda.html`)}
      `)
    };
  }

  if (tipo === 'mensaje') {
    const remitente = clean(datos.remitente, 80) || 'Un músico';
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

  return null;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  if (!RESEND_API_KEY) return json(500, { error: 'RESEND_API_KEY no configurada' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return json(400, { error: 'JSON inválido' });
  }

  const tipo = clean(payload.tipo, 40);
  const datos = payload.datos || {};
  const email = buildEmail(tipo, datos);

  if (!email) return json(400, { error: 'Tipo de email desconocido' });

  // Contacto y reportes siempre van al mail administrativo para evitar uso como relay abierto.
  const destinatario = ['contacto', 'reporte'].includes(tipo)
    ? ADMIN_EMAIL
    : clean(payload.destinatario, 160);

  if (!isEmail(destinatario)) return json(400, { error: 'Destinatario inválido' });

  const resendPayload = {
    from: FROM_EMAIL,
    to: [destinatario],
    subject: email.subject,
    html: email.html
  };
  if (email.replyTo) resendPayload.reply_to = email.replyTo;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resendPayload)
    });

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }

    if (!res.ok) {
      console.error('Resend error:', data);
      return json(502, { error: 'No se pudo enviar el email' });
    }

    return json(200, { ok: true, id: data.id || null });
  } catch (error) {
    console.error('send-email error:', error);
    return json(500, { error: 'Error interno enviando email' });
  }
};
