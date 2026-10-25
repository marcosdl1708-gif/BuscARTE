// Pure rendering only. Recipients, permissions, cadence and quota belong to the mail service.
const DEFAULT_BASE = 'https://buscarte.com.ar';
const MARKETING_TYPES = new Set(['novedades', 'resumen_mensual', 'perfil_incompleto']);
const ADMIN_URL = 'https://supabase.com/dashboard/project/xiaanchoanxmampegoay/editor';
const PROFILE_PATH = '/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar';

function clean(value, max = 800) {
  return (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    .replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim().slice(0, max);
}
function subjectText(value, max = 120) {
  return clean(value, max * 2).replace(/[\n\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ').replace(/\s+/g, ' ').slice(0, max);
}
function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function multiline(value) { return esc(value).replace(/\n/g, '<br>'); }
function isEmail(value) {
  return value.length <= 160 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value);
}
function baseOrigin(value) {
  try {
    const url = new URL(value || DEFAULT_BASE);
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : DEFAULT_BASE;
  } catch (_) { return DEFAULT_BASE; }
}
// URLs are accepted only from server options, with same-origin HTTPS even there.
// Raw datos.link/url/actionUrl/unsubscribeUrl can never choose a recipient's destination.
function serverUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\u0000-\u0020\\]/.test(value)) return '';
  try {
    const url = new URL(value, origin);
    return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password ? url.href : '';
  } catch (_) { return ''; }
}
function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
function paragraph(text, small = false) {
  return `<p style="margin:0 0 18px;color:${small ? '#bfc5b7' : '#e0e3d8'};font-size:${small ? 14 : 16}px;line-height:1.65;word-break:break-word;overflow-wrap:anywhere">${multiline(text)}</p>`;
}
function section(title, content) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;border-collapse:collapse"><tr><td style="padding:20px;background:#1b2417;border-left:3px solid #d4f53c"><h3 style="margin:0 0 12px;font-size:18px;line-height:1.35;color:#f1eee6">${esc(title)}</h3>${content}</td></tr></table>`;
}
function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:collapse"><tr><td bgcolor="#d4f53c" style="background:#d4f53c;border:1px solid #d4f53c;border-radius:5px;mso-padding-alt:15px 22px"><a data-primary-cta="true" href="${esc(href)}" style="display:inline-block;padding:15px 22px;color:#0b0d0b;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;text-align:center;border-radius:5px;mso-padding-alt:0">${esc(label)}</a></td></tr></table>`;
}
function textLink(label, href) {
  return `<a href="${esc(href)}" style="color:#d4f53c;text-decoration:underline;word-break:break-word;overflow-wrap:anywhere">${esc(label)}</a>`;
}
function shell({ title, eyebrow = 'La escena empieza con vos', preheader, content, footerReason, unsubscribeUrl }) {
  const footer = footerReason ? paragraph(footerReason, true) : '';
  return `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;width:100%;background:#0b0d0b;color:#f1eee6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:#0b0d0b;font-size:1px;line-height:1px;mso-hide:all">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0d0b" style="border-collapse:collapse;background:#0b0d0b"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141813" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;background:#141813;border:1px solid #33382e">
<tr><td style="padding:28px 24px 24px;border-bottom:1px solid #33382e"><p style="margin:0;font-size:28px;line-height:1.1;font-weight:800;letter-spacing:-1.5px;color:#f1eee6">busc<span style="color:#d4f53c">ARTE</span><span style="font-family:Georgia,'Times New Roman',serif;font-weight:400;color:#d4f53c"> ✳</span></p></td></tr>
<tr><td style="padding:30px 24px 10px;word-break:break-word;overflow-wrap:anywhere"><p style="margin:0 0 12px;color:#c4d3aa;font-size:12px;line-height:1.5;letter-spacing:1px;text-transform:uppercase">${esc(eyebrow)}</p><h1 style="margin:0 0 24px;color:#f1eee6;font-size:32px;line-height:1.12;font-weight:700;letter-spacing:-1px;word-break:break-word">${esc(title)}</h1>${content}</td></tr>
<tr><td style="padding:24px;border-top:1px solid #414e32;color:#bfc5b7">${footer}${unsubscribeUrl ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.65">${textLink('Dejar de recibir novedades y recordatorios', unsubscribeUrl)}</p>` : ''}<p style="margin:0;font-size:14px;line-height:1.65;color:#bfc5b7">buscARTE · La red gratuita para artistas argentinos.</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

const MISSING = {
  foto: ['Una foto', 'Para que puedan reconocerte.'],
  bio: ['Una presentación breve', 'Contá qué hacés y qué te gustaría compartir o encontrar.'],
  ubicacion: ['Tu ubicación', 'Indicá tu ciudad o zona para conectar con gente cerca.'],
  disciplina: ['Tu disciplina', 'Elegí el rubro y la especialidad que mejor cuentan lo que hacés.'],
  nombre: ['Tu nombre artístico', 'Decí cómo querés que te conozcan en la comunidad.']
};
function missingKeys(value) {
  const keys = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value).filter(key => value[key] === true) : [];
  return [...new Set(keys.filter(key => typeof key === 'string' && Object.hasOwn(MISSING, key)))];
}

/**
 * Render a trusted mail type without network or environment access.
 * Marketing requires a server-signed unsubscribe URL; reset requires its server-built action URL.
 * Returns null when a safe, coherent message cannot be rendered.
 */
export function buildEmail(tipo, rawDatos = {}, options = {}) {
  const datos = rawDatos && typeof rawDatos === 'object' && !Array.isArray(rawDatos) ? rawDatos : {};
  const opts = options && typeof options === 'object' ? options : {};
  const base = baseOrigin(opts.baseUrl);
  const unsubscribeUrl = serverUrl(opts.unsubscribeUrl, base);
  if (MARKETING_TYPES.has(tipo) && !unsubscribeUrl) return null;
  const action = defaultPath => serverUrl(opts.actionUrl, base) || `${base}${defaultPath}`;
  const nombre = clean(datos.nombre, 80);
  const greeting = `Hola${nombre ? ` ${nombre}` : ''}.`;
  let subject, title, preheader, content, text, replyTo, footerReason;
  let eyebrow = 'La escena empieza con vos';
  const finish = () => ({
    subject: subjectText(subject, 180),
    html: shell({ title, eyebrow, preheader, content, footerReason, unsubscribeUrl }),
    text: [text, footerReason, unsubscribeUrl ? `Dejar de recibir novedades y recordatorios: ${unsubscribeUrl}` : '', 'buscARTE · La red gratuita para artistas argentinos.'].filter(Boolean).join('\n\n'),
    ...(replyTo ? { replyTo } : {})
  });

  if (tipo === 'bienvenida') {
    if (datos.tipo_cuenta === 'visitante') {
      const href = action('/buscARTE_busqueda.html');
      subject = 'Ya estás en buscARTE. Descubrí la comunidad';
      title = 'Acercate a la escena.';
      preheader = 'Descubrí artistas, guardá perfiles y empezá una conversación.';
      content = paragraph(greeting) + paragraph('Tu cuenta ya está creada. Encontrá artistas por rubro y zona, guardá los perfiles que te interesen y contactate con la comunidad.')
        + button('Explorar artistas', href) + paragraph('Podés volver a tus perfiles guardados cuando quieras seguir descubriendo lo que hacen.', true);
      text = `${greeting}\n\nTu cuenta ya está creada. Encontrá artistas por rubro y zona, guardá los perfiles que te interesen y contactate con la comunidad.\n\nExplorar artistas: ${href}\n\nPodés volver a tus perfiles guardados cuando quieras seguir descubriendo lo que hacen.`;
      footerReason = 'Recibís este correo porque creaste tu cuenta en buscARTE.';
      return finish();
    }
    if (datos.tipo_cuenta === 'negocio') {
      const href = action(PROFILE_PATH);
      subject = 'Ya estás en buscARTE. Presentá tu espacio';
      title = 'Presentá tu espacio.';
      preheader = 'Contá qué ofrece tu espacio o servicio y conectá con la comunidad.';
      content = paragraph(greeting) + paragraph('Tu cuenta ya está creada. Dale forma a tu perfil para que la comunidad conozca tu espacio o servicio.')
        + paragraph('Sumá una presentación clara, una foto y tu ubicación. Ayudá a que quienes te encuentren sepan qué ofrecés y cómo contactarte.')
        + button('Completar mi perfil', href) + paragraph('Podés editarlo y actualizarlo cuando quieras.', true);
      text = `${greeting}\n\nTu cuenta ya está creada. Dale forma a tu perfil para que la comunidad conozca tu espacio o servicio.\n\nSumá una presentación clara, una foto y tu ubicación para contar qué ofrecés y cómo contactarte.\n\nCompletar mi perfil: ${href}\n\nPodés editarlo y actualizarlo cuando quieras.`;
      footerReason = 'Recibís este correo porque creaste tu cuenta en buscARTE.';
      return finish();
    }
    const href = action(PROFILE_PATH);
    subject = 'Ya estás en buscARTE. Dale forma a tu perfil';
    title = 'Tu lugar en la escena.';
    preheader = 'Contá qué hacés y empezá a conectar con otros artistas.';
    content = paragraph(greeting) + paragraph('Tu cuenta ya está creada. Ahora podés hacer que tu perfil cuente quién sos y qué hacés.')
      + paragraph('Una foto y unas líneas sobre tu trabajo ayudan a que otros artistas sepan con quién están conectando.')
      + button('Completar mi perfil', href)
      + paragraph('No hace falta tener todo listo para empezar. Podés volver y editarlo cuando quieras.', true)
      + `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#bfc5b7">También podés ${textLink('explorar artistas por rubro y zona', `${base}/index.html#explorar`)}.</p>`;
    text = `${greeting}\n\nTu cuenta ya está creada. Hacé que tu perfil cuente quién sos y qué hacés. Una foto y unas líneas sobre tu trabajo ayudan a que otros artistas sepan con quién están conectando.\n\nCompletar mi perfil: ${href}\n\nNo hace falta tener todo listo para empezar. Podés volver y editarlo cuando quieras.\n\nExplorar artistas por rubro y zona: ${base}/index.html#explorar`;
    footerReason = 'Recibís este correo porque creaste tu cuenta en buscARTE.';
    return finish();
  }

  if (tipo === 'perfil_incompleto') {
    const faltantes = missingKeys(datos.faltantes);
    if (!faltantes.length) return null;
    const etapa = ['48h', '7d', 'reactivacion', 'seguimiento'].includes(datos.etapa) ? datos.etapa : '48h';
    const href = action(PROFILE_PATH);
    subject = etapa === 'seguimiento' ? 'Tu perfil puede contar un poco más de vos' : etapa === 'reactivacion' ? 'Tu próximo paso en buscARTE' : etapa === '7d' ? 'Tu perfil todavía tiene algo más para contar' : 'Mostrá lo que hacés en buscARTE';
    title = etapa === 'seguimiento' ? 'Sumá algo de lo que hacés hoy.' : etapa === 'reactivacion' ? 'Volvé con lo que hacés hoy.' : etapa === '7d' ? 'Dale una vuelta a tu perfil.' : 'Que tu perfil hable de vos.';
    preheader = `Podés sumar ${faltantes.map(key => MISSING[key][0].toLowerCase()).join(', ')}.`;
    const intro = etapa === 'seguimiento' ? 'Tu perfil todavía tiene algunos datos pendientes. Podés sumar uno por vez para que quienes te encuentren conozcan mejor lo que hacés.'
      : etapa === 'reactivacion' ? 'Hace un tiempo que te sumaste. Si querés volver a conectar con la comunidad, tu perfil puede contar un poco más sobre vos.'
      : etapa === '7d' ? 'Ya pasó una semana desde que te sumaste. Cuando tengas un momento, podés darle un poco más de forma a tu perfil.'
        : 'Ya tenés tu lugar en buscARTE. El próximo paso es contar un poco más sobre lo que hacés.';
    const rows = faltantes.map(key => `<tr><td style="padding:0 0 16px;color:#e0e3d8;font-size:15px;line-height:1.6;word-break:break-word"><strong style="color:#f1eee6">${esc(MISSING[key][0])}</strong><br>${esc(MISSING[key][1])}</td></tr>`).join('');
    content = paragraph(greeting) + paragraph(intro) + section(faltantes.length === 1 ? 'Te queda por sumar' : 'Podés sumar estos datos', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${rows}</table>`)
      + button('Completar mi perfil', href) + paragraph('Compartí lo que te represente, a tu ritmo. Podés seguir usando buscARTE mientras tanto.', true);
    text = `${greeting}\n\n${intro}\n\n${faltantes.map(key => `• ${MISSING[key][0]}: ${MISSING[key][1]}`).join('\n')}\n\nCompletar mi perfil: ${href}\n\nCompartí lo que te represente, a tu ritmo. Podés seguir usando buscARTE mientras tanto.`;
    footerReason = 'Recibís este recordatorio porque tenés una cuenta en buscARTE y tu perfil tiene datos pendientes.';
    return finish();
  }

  if (tipo === 'mensaje') {
    const remitente = clean(datos.remitente, 80) || 'Un artista';
    const preview = clean(datos.preview, 300);
    const href = action('/buscARTE_mensajes.html');
    subject = `Nuevo mensaje de ${subjectText(remitente, 70)} en buscARTE`;
    title = 'Hay una conversación para vos.';
    preheader = `${subjectText(remitente, 70)} te escribió en buscARTE.`;
    eyebrow = 'Conexiones de la comunidad';
    content = paragraph(`${remitente} te envió un mensaje.`) + (preview ? section('Un adelanto', paragraph(`“${preview}”`)) : '')
      + button('Ver mensaje', href) + paragraph('Si el mensaje no corresponde, podés reportarlo desde la plataforma.', true);
    text = `${remitente} te envió un mensaje.${preview ? `\n\n“${preview}”` : ''}\n\nVer mensaje: ${href}\n\nSi el mensaje no corresponde, podés reportarlo desde la plataforma.`;
    footerReason = 'Esta es una notificación de un mensaje que recibiste en buscARTE.';
    return finish();
  }

  if (tipo === 'reset') {
    const href = serverUrl(opts.actionUrl, base);
    if (!href) return null;
    subject = 'Recuperá tu contraseña de buscARTE';
    title = 'Volvé a entrar a tu cuenta.';
    preheader = 'Creá una nueva contraseña. El enlace expira en una hora.';
    eyebrow = 'Tu cuenta, segura';
    content = paragraph(greeting) + paragraph('Recibimos una solicitud para recuperar tu contraseña.')
      + button('Crear nueva contraseña', href) + paragraph('Este enlace expira en 1 hora. Si no lo pediste, podés ignorar este correo: tu contraseña no cambia.', true)
      + paragraph('No compartas este enlace con nadie.', true);
    text = `${greeting}\n\nRecibimos una solicitud para recuperar tu contraseña.\n\nCrear nueva contraseña: ${href}\n\nEl enlace expira en 1 hora. Si no lo pediste, podés ignorar este correo: tu contraseña no cambia. No compartas este enlace con nadie.`;
    footerReason = 'Correo de seguridad de tu cuenta en buscARTE.';
    return finish();
  }

  if (tipo === 'contacto') {
    const senderName = clean(datos.nombre, 100) || '—';
    const email = clean(datos.email, 120);
    const asunto = clean(datos.asunto, 120) || 'Contacto';
    const mensaje = clean(datos.mensaje, 3000) || '—';
    const url = clean(datos.url, 300), userAgent = clean(datos.userAgent || datos.ua, 300);
    subject = `[buscARTE] ${subjectText(asunto, 80)} — ${subjectText(senderName, 60)}`;
    title = 'Nuevo mensaje de contacto.';
    preheader = `Consulta de ${subjectText(senderName, 60)}.`;
    eyebrow = 'Administración';
    if (isEmail(email)) replyTo = email;
    content = paragraph(`Nombre: ${senderName}\nEmail: ${email || '—'}\nAsunto: ${asunto}`) + section('Mensaje', paragraph(mensaje))
      + (url ? paragraph(`URL: ${url}`, true) : '') + (userAgent ? paragraph(`User agent: ${userAgent}`, true) : '');
    text = `Nombre: ${senderName}\nEmail: ${email || '—'}\nAsunto: ${asunto}\n\n${mensaje}${url ? `\n\nURL: ${url}` : ''}${userAgent ? `\n\nUser agent: ${userAgent}` : ''}`;
    return finish();
  }

  if (tipo === 'reporte') {
    const perfilNombre = clean(datos.perfilNombre, 120) || 'Perfil sin nombre';
    const perfilId = clean(datos.perfilId, 40) || '—';
    const motivo = clean(datos.motivo, 120) || 'Reporte';
    const reporterNombre = clean(datos.reporterNombre, 120) || 'Usuario';
    const reporterId = clean(datos.reporterId, 40) || '—';
    const detalle = clean(datos.detalle, 2500);
    const fields = [['Perfil reportado', `${perfilNombre} (ID: ${perfilId})`], ['Motivo', motivo], ['Reportado por', `${reporterNombre} (ID: ${reporterId})`], ...(detalle ? [['Detalle', detalle]] : [])];
    subject = `[REPORTE] ${subjectText(motivo, 60)} — perfil ${subjectText(perfilNombre, 60)} (ID: ${subjectText(perfilId, 20)})`;
    title = 'Un reporte para revisar.';
    preheader = 'Revisá el reporte desde la administración.';
    eyebrow = 'Administración';
    content = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;table-layout:fixed">${fields.map(([label, value]) => `<tr><th scope="row" width="38%" align="left" valign="top" style="padding:12px 8px 12px 0;border-bottom:1px solid #414e32;color:#bfc5b7;font-size:14px;line-height:1.6;font-weight:400;word-break:break-word">${esc(label)}</th><td valign="top" style="padding:12px 0;border-bottom:1px solid #414e32;color:#f1eee6;font-size:15px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere">${multiline(value)}</td></tr>`).join('')}</table>` + button('Revisar en Supabase', ADMIN_URL);
    text = `${fields.map(([label, value]) => `${label}: ${value}`).join('\n\n')}\n\nRevisar en Supabase: ${ADMIN_URL}`;
    return finish();
  }

  if (tipo === 'novedades' && datos.cadencia === '15d') {
    const from = Date.parse(datos.desdeISO), until = Date.parse(datos.hastaISO);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return null;
    const dateLabel = date => new Intl.DateTimeFormat('es-AR', {day:'numeric', month:'long', timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(date));
    const periodo = clean(datos.periodo, 120) || `${dateLabel(from)} al ${dateLabel(until)}`;
    const artists = count(datos.nuevosArtistas), ads = count(datos.nuevosAnuncios);
    const eventos = (Array.isArray(datos.proximosEventos) ? datos.proximosEventos : [])
      .filter(event => event && typeof event === 'object' && !Array.isArray(event) && Number.isFinite(Date.parse(event.fechaISO)) && Date.parse(event.fechaISO) >= until).slice(0, 3);
    const eventData = eventos.map(event => ({ titulo:clean(event.titulo, 180) || 'Encuentro de la comunidad', fecha:clean(event.fecha, 100), lugar:clean(event.lugar, 180), href:/^[1-9]\d{0,15}$/.test(String(event.id || '')) ? `${base}/buscARTE_anuncio_detalle.html?id=${encodeURIComponent(event.id)}` : '' }));
    const href = action('/buscARTE_anuncios.html');
    subject = `buscARTE: ${artists} artistas nuevos y ${ads} anuncios para descubrir`;
    title = 'Lo nuevo en la comunidad.';
    eyebrow = 'Novedades cada 15 días';
    preheader = `${artists} artistas nuevos y ${ads} anuncios. Un motivo para volver a encontrarnos.`;
    const counters = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;margin:6px 0 24px"><tr><td width="50%" valign="top" style="padding:20px 8px;background:#1b2417;border-right:2px solid #141813;text-align:center"><p style="margin:0 0 6px;font-size:32px;line-height:1.1;font-weight:700;color:#d4f53c">${artists}</p><p style="margin:0;font-size:14px;line-height:1.5;color:#e0e3d8">artistas nuevos</p></td><td width="50%" valign="top" style="padding:20px 8px;background:#1b2417;text-align:center"><p style="margin:0 0 6px;font-size:32px;line-height:1.1;font-weight:700;color:#d4f53c">${ads}</p><p style="margin:0;font-size:14px;line-height:1.5;color:#e0e3d8">anuncios publicados</p></td></tr></table>`;
    const eventsHtml = eventData.length ? section('Próximos encuentros', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed">${eventData.map(event => `<tr><td style="padding:0 0 16px;word-break:break-word;overflow-wrap:anywhere"><p style="margin:0 0 4px;font-size:16px;line-height:1.5;font-weight:700;color:#f1eee6">${event.href ? textLink(event.titulo, event.href) : esc(event.titulo)}</p><p style="margin:0;color:#bfc5b7;font-size:14px;line-height:1.6">${esc([event.fecha, event.lugar].filter(Boolean).join(' · '))}</p></td></tr>`).join('')}</table>`) : '';
    content = paragraph(greeting) + paragraph(`Esto pasó en buscARTE del ${periodo}.`) + counters + eventsHtml
      + paragraph('Volvé a descubrir búsquedas, propuestas, clases y encuentros de la comunidad. Si tenés una idea o proyecto, también podés compartir tu anuncio.') + button('Ver anuncios', href);
    text = `${greeting}\n\nEsto pasó en buscARTE del ${periodo}:\n${artists} artistas nuevos\n${ads} anuncios publicados${eventData.length ? '\n\nPróximos encuentros:\n' + eventData.map(event => [event.titulo, event.fecha, event.lugar, event.href].filter(Boolean).join(' · ')).join('\n') : ''}\n\nVolvé a descubrir búsquedas, propuestas, clases y encuentros de la comunidad. También podés compartir tu anuncio.\n\nVer anuncios: ${href}`;
    footerReason = 'Recibís estas novedades porque activaste los avisos de buscARTE cada 15 días.';
    return finish();
  }

  if (tipo === 'novedades') {
    const href = action('/index.html#explorar');
    subject = 'Volvé a conectar con la comunidad de buscARTE';
    title = 'La escena se hace encontrándonos.';
    preheader = 'Artistas, proyectos y oportunidades para compartir lo que hacés.';
    content = paragraph(greeting) + paragraph('Un proyecto puede empezar con una conversación. En buscARTE podés encontrar artistas por rubro y zona, compartir lo que hacés y descubrir anuncios de la comunidad.')
      + section('Una idea para tu próxima visita', paragraph('Buscá gente de tu disciplina o acercate a otro rubro. Tal vez encuentres con quién intercambiar ideas, aprender o empezar algo.'))
      + button('Explorar artistas', href) + paragraph('Tu perfil también puede contar cómo estás trabajando hoy. Mantenelo al día para que quienes te encuentren sepan más de vos.', true);
    text = `${greeting}\n\nUn proyecto puede empezar con una conversación. En buscARTE podés encontrar artistas por rubro y zona, compartir lo que hacés y descubrir anuncios de la comunidad.\n\nBuscá gente de tu disciplina o acercate a otro rubro para intercambiar ideas, aprender o empezar algo.\n\nExplorar artistas: ${href}\n\nMantené tu perfil al día para que quienes te encuentren sepan más de vos.`;
    footerReason = 'Recibís estas novedades porque sos parte de buscARTE.';
    return finish();
  }

  if (tipo === 'resumen_mensual') {
    const artists = count(datos.nuevosArtistas ?? datos.nuevosMusicos), ads = count(datos.nuevosAnuncios);
    const mes = subjectText(datos.mes, 40) || 'el último mes';
    const eventos = (Array.isArray(datos.proximosEventos) ? datos.proximosEventos : Array.isArray(datos.eventos) ? datos.eventos : []).filter(event => event && typeof event === 'object' && !Array.isArray(event)).slice(0, 3);
    const href = action('/buscARTE_anuncios.html');
    subject = `buscARTE en ${mes}: ${artists} artistas nuevos, ${ads} anuncios`;
    title = `La comunidad en ${mes}.`;
    preheader = `${artists} artistas se sumaron y se publicaron ${ads} anuncios.`;
    eyebrow = 'El mes en buscARTE';
    const counters = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;margin:6px 0 24px"><tr><td width="50%" valign="top" style="padding:20px 8px;background:#1b2417;border-right:2px solid #141813;text-align:center"><p style="margin:0 0 6px;font-size:32px;line-height:1.1;font-weight:700;color:#d4f53c">${artists}</p><p style="margin:0;font-size:14px;line-height:1.5;color:#e0e3d8">artistas nuevos</p></td><td width="50%" valign="top" style="padding:20px 8px;background:#1b2417;text-align:center"><p style="margin:0 0 6px;font-size:32px;line-height:1.1;font-weight:700;color:#d4f53c">${ads}</p><p style="margin:0;font-size:14px;line-height:1.5;color:#e0e3d8">anuncios publicados</p></td></tr></table>`;
    const eventData = eventos.map(event => ({ titulo:clean(event.titulo, 180) || 'Encuentro de la comunidad', fecha:clean(event.fecha, 100), lugar:clean(event.lugar, 180), href:/^[1-9]\d{0,15}$/.test(String(event.id || '')) ? `${base}/buscARTE_anuncio_detalle.html?id=${encodeURIComponent(event.id)}` : '' }));
    const eventsHtml = eventData.length ? section('Próximos encuentros', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed">${eventData.map(event => `<tr><td style="padding:0 0 16px;word-break:break-word;overflow-wrap:anywhere"><p style="margin:0 0 4px;font-size:16px;line-height:1.5;font-weight:700;color:#f1eee6">${event.href ? textLink(event.titulo, event.href) : esc(event.titulo)}</p><p style="margin:0;color:#bfc5b7;font-size:14px;line-height:1.6">${esc([event.fecha, event.lugar].filter(Boolean).join(' · '))}</p></td></tr>`).join('')}</table>`) : '';
    content = paragraph(greeting) + paragraph('Cada persona y cada proyecto suman algo a la comunidad. Esto pasó en buscARTE durante el mes.') + counters + eventsHtml
      + paragraph('Encontrá búsquedas, propuestas, clases y encuentros. También podés publicar lo que estás buscando u ofreciendo.') + button('Ver anuncios', href);
    text = `${greeting}\n\nEsto pasó en buscARTE en ${mes}:\n${artists} artistas nuevos\n${ads} anuncios publicados${eventData.length ? '\n\nPróximos encuentros:\n' + eventData.map(event => [event.titulo, event.fecha, event.lugar, event.href].filter(Boolean).join(' · ')).join('\n') : ''}\n\nEncontrá búsquedas, propuestas, clases y encuentros. También podés publicar lo que estás buscando u ofreciendo.\n\nVer anuncios: ${href}`;
    footerReason = 'Recibís el resumen mensual porque sos parte de buscARTE.';
    return finish();
  }

  return null;
}
