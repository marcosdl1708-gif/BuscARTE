const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'buscARTE <hola@buscarte.com.ar>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'BuscARTE.webmail@gmail.com';
const BASE_URL = process.env.URL || 'https://buscarte.com.ar';

// Anti-relay: config opcional. Si no se setean, la función se comporta como antes (no rompe),
// pero queda SIN protección y se loguea un warning. Configurar ambas en Netlify para activar.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

// Públicos pero con destinatario forzado al admin (nunca relay):
const TIPOS_ADMIN = ['contacto', 'reporte'];
// Internos (solo server): requieren secreto por header. Incluye reset por el link sensible.
const TIPOS_INTERNOS = ['novedades', 'resumen_mensual', 'perfil_incompleto', 'reset'];
// Transaccionales que dispara el navegador: el destinatario DEBE ser un usuario registrado.
const TIPOS_TRANSACCIONALES = ['bienvenida', 'mensaje'];

// Devuelve true si el email existe en perfiles, false si no, null si no se pudo verificar
// (falta config de Supabase o error). En null, no bloqueamos para no romper el flujo.
async function destinatarioEsUsuario(email) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return null;
  }
}

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
    const nombre = clean(datos.nombre, 80) || 'artista';
    return {
      subject: `¡Bienvenido/a a buscARTE, ${stripForSubject(nombre, 60)}!`,
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">¡Ya sos parte de la escena!</h2>
        <p>Hola <strong>${escapeHtml(nombre)}</strong>, tu perfil en buscARTE ya está activo.</p>
        <p style="color:#888;margin:22px 0 8px">Ahora podés:</p>
        <ul style="color:#ccc;padding-left:22px;line-height:1.8">
          <li>Completar tu perfil para aparecer mejor en las búsquedas.</li>
          <li>Explorar artistas de todos los rubros y conectar con colaboradores.</li>
          <li>Publicar anuncios, jams, clases o compra/venta de equipos.</li>
        </ul>
        ${cta('Explorar artistas →', `${BASE_URL}/buscARTE_busqueda.html`)}
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
    const nombre = clean(datos.nombre, 80) || 'artista';
    return {
      subject: 'Tu perfil en buscARTE está casi listo 👀',
      html: brandShell(`
        <h2 style="color:#d4f53c;margin:0 0 16px">Te falta poco para estar en el mapa</h2>
        <p>Hola <strong>${escapeHtml(nombre)}</strong>, tu perfil en buscARTE está creado pero le faltan algunos datos clave.</p>
        <p style="color:#888;margin:20px 0 8px">Los perfiles completos reciben <strong style="color:#f2ede4">hasta 3 veces más visitas</strong>. En especial:</p>
        <ul style="color:#ccc;padding-left:22px;line-height:2">
          <li>📸 <strong>Foto de perfil</strong> — genera confianza y te hace reconocible</li>
          <li>🎨 <strong>Especialidad y rubro</strong> — para que te encuentren fácil</li>
          <li>📍 <strong>Zona</strong> — para conectar con artistas cercanos</li>
          <li>✍️ <strong>Descripción</strong> — contá quién sos y qué buscás</li>
        </ul>
        ${cta('Completar mi perfil →', `${BASE_URL}/buscARTE_perfil.html`)}
        <p style="color:#555;font-size:12px;margin-top:24px">Si ya completaste tu perfil, ignorá este mail.</p>
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

  // ── Autorización por tipo (anti-relay) ──
  let destinatario;

  if (TIPOS_ADMIN.includes(tipo)) {
    // contacto / reporte: el destinatario se fuerza al admin; nunca se usa el del payload.
    destinatario = ADMIN_EMAIL;
  } else {
    destinatario = clean(payload.destinatario, 160);
    if (!isEmail(destinatario)) return json(400, { error: 'Destinatario inválido' });

    if (TIPOS_TRANSACCIONALES.includes(tipo)) {
      // bienvenida / mensaje (los dispara el navegador): el destinatario debe ser un usuario real.
      const esUsuario = await destinatarioEsUsuario(destinatario);
      if (esUsuario === false) return json(403, { error: 'Destinatario no autorizado' });
      if (esUsuario === null) {
        console.warn(`[send-email] No se pudo verificar el destinatario (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): el tipo "${tipo}" queda SIN protección anti-relay. Configuralos en Netlify.`);
      }
    } else {
      // Internos (TIPOS_INTERNOS: novedades, resumen_mensual, perfil_incompleto, reset) y
      // cualquier tipo futuro no clasificado: solo server, requieren secreto por header.
      if (INTERNAL_SECRET) {
        const headers = event.headers || {};
        const provisto = headers['x-buscarte-secret'] || headers['X-Buscarte-Secret'] || '';
        if (provisto !== INTERNAL_SECRET) return json(403, { error: 'No autorizado' });
      } else {
        console.warn(`[send-email] INTERNAL_SECRET no configurada: el tipo "${tipo}" está SIN protección anti-relay. Configurala en Netlify y mandá el header "x-buscarte-secret" desde las funciones programadas.`);
      }
    }
  }

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
