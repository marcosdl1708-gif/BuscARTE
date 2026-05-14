const RESEND_API_KEY = process.env.RESEND_API_KEY

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    const { tipo, destinatario, datos } = JSON.parse(event.body)
    let subject, html

    if (tipo === 'bienvenida') {
      subject = `¡Bienvenido/a a buscARTE, ${datos.nombre}! 🎸`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
        <h1 style="font-size:2rem;text-align:center">busc<span style="color:#d4f53c">ARTE</span></h1>
        <h2 style="color:#d4f53c">¡Hola ${datos.nombre}! 🎸</h2>
        <p>Tu perfil en buscARTE está listo. Ya podés buscar músicos, publicar anuncios, organizar jams y mucho más.</p>
        <div style="text-align:center;margin:2rem 0">
          <a href="https://buscarte.com.ar/buscARTE_busqueda.html" style="background:#d4f53c;color:#000;padding:1rem 2rem;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block">Explorar músicos →</a>
        </div>
        <p style="color:#888;font-size:.8rem;text-align:center">buscARTE.com.ar — La escena musical argentina</p>
      </div>`

    } else if (tipo === 'mensaje') {
      subject = `${datos.remitente} te envió un mensaje en buscARTE 💬`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
        <h1 style="font-size:2rem;text-align:center">busc<span style="color:#d4f53c">ARTE</span></h1>
        <h2 style="color:#d4f53c">Tenés un nuevo mensaje 💬</h2>
        <p><strong>${datos.remitente}</strong> te escribió:</p>
        <div style="background:#1a1a1a;border-left:3px solid #d4f53c;padding:1rem;margin:1rem 0;border-radius:4px">
          <p style="margin:0;font-style:italic">"${datos.preview}"</p>
        </div>
        <div style="text-align:center;margin:2rem 0">
          <a href="https://buscarte.com.ar/buscARTE_mensajes.html" style="background:#d4f53c;color:#000;padding:1rem 2rem;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block">Ver mensaje →</a>
        </div>
      </div>`

    } else if (tipo === 'contacto') {
      subject = `[buscARTE] ${datos.asunto} — ${datos.nombre}`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
        <h2 style="color:#d4f53c">Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${datos.nombre}</p>
        <p><strong>Email:</strong> ${datos.email}</p>
        <p><strong>Asunto:</strong> ${datos.asunto}</p>
        <div style="background:#1a1a1a;border-left:3px solid #d4f53c;padding:1rem;margin:1rem 0">
          <p style="margin:0">${datos.mensaje}</p>
        </div>
      </div>`

    } else if (tipo === 'recuperar') {
      subject = `Recuperá tu contraseña de buscARTE 🔑`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
        <h2 style="color:#d4f53c">Recuperar contraseña 🔑</h2>
        <p>Recibimos una solicitud para resetear tu contraseña.</p>
        <div style="text-align:center;margin:2rem 0">
          <a href="https://buscarte.com.ar/buscARTE_reset.html?token=${datos.token}" style="background:#d4f53c;color:#000;padding:1rem 2rem;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block">Resetear contraseña →</a>
        </div>
        <p style="color:#888;font-size:.8rem">Este link expira en 1 hora. Si no solicitaste esto, ignorá este email.</p>
      </div>`
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

  } catch (e) {
    console.error('Function error:', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
