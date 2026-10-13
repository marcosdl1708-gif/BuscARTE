import { trustedOrigin, sessionUser, endSession, clearCookie, readJson, json } from '../lib/session.mjs';

export default async function session(request) {
  try {
    if (request.method === 'GET') {
      const user = await sessionUser(request);
      return user ? json(200, { user }) : json(401, { error: 'Ingresá para continuar.', code: 'SESSION_REQUIRED' }, { 'Set-Cookie': clearCookie() });
    }
    if (request.method !== 'POST') return json(405, { error: 'Método no permitido.' });
    if (!trustedOrigin(request)) return json(403, { error: 'Origen no permitido.' });
    const payload = await readJson(request);
    if (Object.keys(payload).length !== 1 || payload.action !== 'logout') return json(400, { error: 'Solicitud inválida.' });
    await endSession(request);
    return json(200, { ok: true }, { 'Set-Cookie': clearCookie() });
  } catch { return json(503, { error: 'No pudimos verificar la sesión. Reintentá.' }); }
}
export const config = { path: '/.netlify/functions/sesion', rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'], action: 'rate_limit' } };
