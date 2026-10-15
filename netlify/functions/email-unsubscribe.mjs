import { backendJson, readBytes } from '../lib/session.mjs';
import { mailService, verifyMailToken, emailHash } from '../lib/mail-runtime.mjs';

const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const page=(title,body,status=200)=>new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' · BuscARTE</title><body style="margin:0;padding:28px;background:#10150f;color:#f2eee5;font:17px/1.6 Arial,sans-serif"><main style="max-width:560px;margin:10vh auto"><h1>'+title+'</h1>'+body+'</main></body></html>',{status,headers});
export default async function unsubscribe(request) {
  if(!['GET','POST'].includes(request.method))return page('Método no permitido','',405);
  const token=new URL(request.url).searchParams.get('t');
  const value=verifyMailToken(token);
  if(!value||value.k!=='unsubscribe')return page('Enlace inválido','<p>Podés gestionar tus emails desde tu perfil de BuscARTE.</p>',400);
  // Link scanners may GET. Only an explicit form or RFC 8058 POST changes preferences.
  if(request.method==='GET')return page('Tus emails de BuscARTE','<p>Podés dejar de recibir novedades y recordatorios para completar tu perfil. Los correos de acceso, seguridad y mensajes seguirán funcionando.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button style="font:inherit;font-weight:bold;padding:14px 20px;background:#d4f53c;border:0;border-radius:5px" type="submit">Dejar de recibir estos emails</button></form>');
  try {
    const type=request.headers.get('content-type')?.split(';')[0].trim();
    if(type!=='application/x-www-form-urlencoded')return page('Formato inválido','',415);
    await readBytes(request,2048);
    const user=await mailService.profile(value.p);
    if(user&&emailHash(user.email)===value.e)await mailService.savePreferences(user,{marketing_opt_in:false,onboarding_disabled:true});
    if(request.headers.get('origin'))return page('Preferencias guardadas','<p>Dejaste de recibir novedades y recordatorios de perfil. Podés volver a activarlos desde tu cuenta.</p>');
    return new Response(null,{status:200,headers:{'Cache-Control':'no-store'}});
  } catch {return page('Intentá nuevamente','<p>No pudimos guardar la baja. Volvé a intentarlo en unos minutos.</p>',503);}
}
export const config={path:'/.netlify/functions/email-unsubscribe',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:60}};
