import { json, sessionUser, trustedOrigin, rate, readJson } from '../lib/session.mjs';
import { mailService } from '../lib/mail-runtime.mjs';

export default async function preferences(request) {
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Método no permitido.'});
  try {
    const user=await sessionUser(request);
    if(!user)return json(401,{error:'Ingresá para gestionar tus emails.'});
    if(request.method==='GET')return json(200,await mailService.preferences(user.id,user.email));
    if(!trustedOrigin(request))return json(403,{error:'No autorizado.'});
    if(!await rate(request,'mail-preferences',12,60))return json(429,{error:'Esperá un minuto antes de reintentar.'});
    let payload;
    try {payload=await readJson(request,1024);} catch {return json(400,{error:'Preferencias inválidas.'});}
    if(Object.keys(payload).some(key=>!['marketing_opt_in','onboarding_disabled'].includes(key)) || typeof payload.marketing_opt_in!=='boolean' || typeof payload.onboarding_disabled!=='boolean')return json(400,{error:'Preferencias inválidas.'});
    return json(200,await mailService.savePreferences(user,payload));
  } catch {return json(503,{error:'No pudimos guardar tus preferencias. Intentá nuevamente.'});}
}
export const config={path:'/.netlify/functions/email-preferences',rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:60}};
