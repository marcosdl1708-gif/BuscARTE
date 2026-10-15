import { backendJson } from '../lib/session.mjs';
import { verifyMailToken, emailHash, mailService } from '../lib/mail-runtime.mjs';

export default async function action(request) {
  if(request.method!=='GET')return new Response(null,{status:405});
  const value=verifyMailToken(new URL(request.url).searchParams.get('t'));
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  if(!value||value.k!=='action')return new Response('Enlace inválido.',{status:400,headers});
  try {
    const rows=await backendJson('/rest/v1/email_outbox?id=eq.'+value.j+'&perfil_id=eq.'+value.p+'&status=eq.sent&select=id,recipient,tipo,clicked_at&limit=1');
    const job=rows?.[0],user=await mailService.profile(value.p);
    if(!job||!user||emailHash(job.recipient)!==value.e||emailHash(user.email)!==value.e)return new Response('Enlace inválido.',{status:400,headers});
    if(!job.clicked_at)await backendJson('/rest/v1/email_outbox?id=eq.'+job.id+'&clicked_at=is.null',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({clicked_at:new Date().toISOString()})});
    const profile=job.tipo==='perfil_incompleto'||(job.tipo==='bienvenida'&&user.tipo_cuenta!=='visitante');
    const destination=profile?'buscARTE_perfil.html%3Fmail%3D'+job.id+'%23completar':['bienvenida','novedades'].includes(job.tipo)?'buscARTE_busqueda.html':'buscARTE_anuncios.html';
    return new Response(null,{status:303,headers:{...headers,Location:'https://buscarte.com.ar/buscARTE_login.html?redirect='+destination}});
  } catch {return new Response('Intentá abrir el enlace nuevamente.',{status:503,headers});}
}
export const config={path:'/.netlify/functions/email-link',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:120}};
