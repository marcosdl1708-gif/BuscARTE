exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY no configurada' }) }
  }

  try {
    const { tipo, destinatario, datos } = JSON.parse(event.body)
    let subject = ''
    let html = ''

    if (tipo === 'bienvenida') {
      subject = `¡Bienvenido/a a buscARTE, ${datos.nombre}!`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
          <h1 style="font-size:1.8rem;margin-bottom:.5rem">busc<span style="color:#d4f53c">ARTE</span></h1>
          <h2 style="color:#d4f53c;margin-bottom:1rem">¡Ya sos parte de la escena!</h2>
          <p>Hola <strong>${datos.nombre}</strong>, tu perfil en buscARTE ya está activo.</p>
          <p style="color:#888;margin:1.5rem 0">Ahora podés:</p>
          <ul style="color:#ccc;padding-left:1.5rem;line-height:2">
            <li>Completar tu perfil para aparecer en las búsquedas</li>
            <li>Explorar músicos y conectar con otros artistas</li>
            <li>Publicar anuncios: buscás banda, ofrecés sesiones, vendés equipo</li>
          </ul>
          <a href="https://buscarte.com.ar/buscARTE_busqueda.html"
             style="display:inline-block;background:#d4f53c;color:#000;padding:.9rem 2rem;text-decoration:none;font-weight:700;margin-top:1.5rem;border-radius:2px">
            Explorar músicos →
          </a>
          <p style="color:#555;font-size:.75rem;margin-top:2rem">buscARTE · La red de músicos argentinos</p>
        </div>`

    } else if (tipo === 'mensaje') {
      subject = `💬 Nuevo mensaje de ${datos.remitente} en buscARTE`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
          <h1 style="font-size:1.8rem;margin-bottom:.5rem">busc<span style="color:#d4f53c">ARTE</span></h1>
          <h2 style="color:#d4f53c">Nuevo mensaje</h2>
          <p><strong>${datos.remitente}</strong> te envió un mensaje:</p>
          <div style="background:#1a1a1a;border-left:3px solid #d4f53c;padding:1rem;margin:1rem 0;color:#ccc;font-style:italic">
            "${datos.preview}"
          </div>
          <a href="https://buscarte.com.ar/buscARTE_mensajes.html"
             style="display:inline-block;background:#d4f53c;color:#000;padding:.9rem 2rem;text-decoration:none;font-weight:700;margin-top:1rem;border-radius:2px">
            Ver mensaje →
          </a>
          <p style="color:#555;font-size:.75rem;margin-top:2rem">Si no querés recibir estas notificaciones, podés configurarlo en tu perfil.</p>
        </div>`

    } else if (tipo === 'contacto') {
      subject = `[buscARTE] ${datos.asunto} — ${datos.nombre}`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
          <h2 style="color:#d4f53c">Nuevo mensaje de contacto</h2>
          <p><strong>Nombre:</strong> ${datos.nombre}</p>
          <p><strong>Email:</strong> ${datos.email}</p>
          <p><strong>Asunto:</strong> ${datos.asunto}</p>
          <div style="background:#1a1a1a;border-left:3px solid #d4f53c;padding:1rem;margin:1rem 0">
            <p style="margin:0;color:#ccc">${datos.mensaje}</p>
          </div>
        </div>`

    } else if (tipo === 'reset') {
      subject = `🔑 Recuperar contraseña — buscARTE`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
          <h1 style="font-size:1.8rem;margin-bottom:.5rem">busc<span style="color:#d4f53c">ARTE</span></h1>
          <h2 style="color:#d4f53c">Recuperar contraseña</h2>
          <p>Hola${datos.nombre ? ' <strong>' + datos.nombre + '</strong>' : ''}, recibimos una solicitud para recuperar tu contraseña.</p>
          <a href="${datos.link}"
             style="display:inline-block;background:#d4f53c;color:#000;padding:.9rem 2rem;text-decoration:none;font-weight:700;margin:1.5rem 0;border-radius:2px">
            Crear nueva contraseña →
          </a>
          <p style="color:#888;font-size:.82rem">Este link expira en 1 hora. Si no solicitaste esto, ignorá este email.</p>
        </div>`

    } else if (tipo === 'reporte') {
      subject = `🚨 [REPORTE] ${datos.motivo} — perfil ${datos.perfilNombre} (ID: ${datos.perfilId})`
      html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
          <h2 style="color:#ff5555">🚨 Nuevo reporte de perfil</h2>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0">
            <tr style="border-bottom:1px solid #222">
              <td style="padding:.6rem 0;color:#888;width:40%">Perfil reportado</td>
              <td style="padding:.6rem 0"><strong>${datos.perfilNombre}</strong> (ID: ${datos.perfilId})</td>
            </tr>
            <tr style="border-bottom:1px solid #222">
              <td style="padding:.6rem 0;color:#888">Motivo</td>
              <td style="padding:.6rem 0;color:#d4f53c"><strong>${datos.motivo}</strong></td>
            </tr>
            <tr style="border-bottom:1px solid #222">
              <td style="padding:.6rem 0;color:#888">Reportado por</td>
              <td style="padding:.6rem 0">${datos.reporterNombre} (ID: ${datos.reporterId})</td>
            </tr>
            ${datos.detalle ? `<tr><td style="padding:.6rem 0;color:#888;vertical-align:top">Detalle</td><td style="padding:.6rem 0;color:#ccc">${datos.detalle}</td></tr>` : ''}
          </table>
          <a href="https://supabase.com/dashboard/project/xiaanchoanxmampegoay/editor"
             style="display:inline-block;background:#ff5555;color:#fff;padding:.75rem 1.5rem;text-decoration:none;font-weight:700;margin-top:1rem;border-radius:2px">
            Ver en Supabase →
          </a>
        </div>`

    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Tipo de email desconocido' }) }
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'buscARTE <hola@buscarte.com.ar>',
        to: [destinatario],
        subject,
        html
      })
    })

    const data = await res.json()
    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data }) }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.id }) }

  } catch(e) {
    console.error('send-email error:', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
