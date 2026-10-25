import { json, sessionUser, trustedOrigin, rate, readJson } from '../lib/session.mjs';
import { mailService } from '../lib/mail-runtime.mjs';

export default async function preferences(request) {
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Método no permitido.'});
  try {
    const user=await sessionUser(request);
    if(!user)return json(401,{error:'Ingresá para gestionar tus emails.'});
    if(request.method==='GET') {
      const value=await mailService.preferences(user.id,user.email);
      const person=await mailService.profile(user.id);
      const created=Date.parse(person?.created_at),helpAt=Date.parse(value.onboarding_consented_at);
      const helpConsent=value.onboarding_consent_version==='2026-10-25-profile-help-v1' && Number.isFinite(helpAt) && helpAt<=Date.now();
      return json(200,{marketing_opt_in:value.marketing_opt_in,onboarding_disabled:value.onboarding_disabled,marketing_frequency:value.marketing_frequency||'monthly',
        onboarding_consent_required:!(created>=Date.parse('2026-10-15T00:00:00Z'))&&!helpConsent});
    }
    if(!trustedOrigin(request))return json(403,{error:'No autorizado.'});
    if(!await rate(request,'mail-preferences',12,60))return json(429,{error:'Esperá un minuto antes de reintentar.'});
    let payload;
    try {payload=await readJson(request,1024);} catch {return json(400,{error:'Preferencias inválidas.'});}
    if(Object.keys(payload).some(key=>!['marketing_opt_in','onboarding_disabled','marketing_frequency','onboarding_choice'].includes(key)) || typeof payload.marketing_opt_in!=='boolean' || typeof payload.onboarding_disabled!=='boolean'
      || (Object.hasOwn(payload,'marketing_frequency') && !['monthly','fortnightly'].includes(payload.marketing_frequency))
      || (Object.hasOwn(payload,'onboarding_choice') && typeof payload.onboarding_choice!=='boolean')
      || (payload.onboarding_choice===true && payload.onboarding_disabled===true))return json(400,{error:'Preferencias inválidas.'});
    return json(200,await mailService.savePreferences(user,payload,{source:'profile'}));
  } catch {return json(503,{error:'No pudimos guardar tus preferencias. Intentá nuevamente.'});}
}
export const config={path:'/.netlify/functions/email-preferences',rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:60}};
