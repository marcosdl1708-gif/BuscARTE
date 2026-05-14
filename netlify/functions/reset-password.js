const RESEND_API_KEY = process.env.RESEND_API_KEY
const SUPABASE_URL = 'https://xiaanchoanxmampegoay.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    const { accion, email, token, nueva_password } = JSON.parse(event.body)
    const hdrs = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }

    // ACCION 1: Solicitar reset — generar token y enviar email
    if (accion === 'solicitar') {
      // Verificar que el email existe
      const res = await fetch(`${SUPABASE_URL}/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}&select=id,nombre`, { headers: hdrs })
      const [usuario] = await res.json()

      // Siempre devolver OK para no revelar si el email existe
      if (!usuario) {
        return { statusCode: 200, body: JSON.stringify({ ok: true }) }
      }

      // Generar token único
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora

      // Guardar token en Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/perfiles?id=eq.${usuario.id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ reset_token: token, reset_expires: expires })
      })

      // Enviar email
      const resetUrl = `https://buscarte.com.ar/buscARTE_reset.html?token=${token}`
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'buscARTE <hola@buscarte.com.ar>',
          to: [email],
          subject: 'Recuperá tu contraseña de buscARTE 🔑',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f2ede4;padding:2rem;border-radius:8px">
              <h1 style="font-size:2rem;text-align:center;margin:0 0 1rem">busc<span style="color:#d4f53c">ARTE</span></h1>
              <h2 style="color:#d4f53c">Recuperar contraseña 🔑</h2>
              <p>Hola ${usuario.nombre?.split(' ')[0] || ''}! Recibimos una solicitud para resetear tu contraseña.</p>
              <div style="text-align:center;margin:2rem 0">
                <a href="${resetUrl}" style="background:#d4f53c;color:#000;padding:1rem 2rem;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block">
                  Crear nueva contraseña →
                </a>
              </div>
              <p style="color:#888;font-size:.8rem;text-align:center">Este link expira en 1 hora. Si no solicitaste esto, ignorá este email.</p>
            </div>`
        })
      })

      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    // ACCION 2: Verificar token
    if (accion === 'verificar') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/perfiles?reset_token=eq.${token}&select=id,nombre,reset_expires`,
        { headers: hdrs }
      )
      const [usuario] = await res.json()

      if (!usuario) {
        return { statusCode: 200, body: JSON.stringify({ valido: false, error: 'Token inválido' }) }
      }
      if (new Date(usuario.reset_expires) < new Date()) {
        return { statusCode: 200, body: JSON.stringify({ valido: false, error: 'El link expiró. Solicitá uno nuevo.' }) }
      }

      return { statusCode: 200, body: JSON.stringify({ valido: true, nombre: usuario.nombre?.split(' ')[0] }) }
    }

    // ACCION 3: Cambiar contraseña
    if (accion === 'cambiar') {
      if (!nueva_password || nueva_password.length < 8) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' }) }
      }

      // Verificar token válido
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/perfiles?reset_token=eq.${token}&select=id,reset_expires`,
        { headers: hdrs }
      )
      const [usuario] = await res.json()

      if (!usuario || new Date(usuario.reset_expires) < new Date()) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Token inválido o expirado' }) }
      }

      // Llamar a función de Supabase para encriptar con bcrypt
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cambiar_password`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ p_user_id: usuario.id, p_nueva_password: nueva_password })
      })

      if (!updateRes.ok) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Error al cambiar la contraseña' }) }
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Acción inválida' }) }

  } catch (e) {
    console.error('Reset password error:', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}
