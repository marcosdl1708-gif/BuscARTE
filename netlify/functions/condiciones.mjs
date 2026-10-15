import { backendJson, id, json, rate, readJson, sessionUser, trustedOrigin } from '../lib/session.mjs';
import { TERMS_VERSION, TermsError, termsFailure, termsState, validTermsState } from '../lib/condiciones.mjs';

export default async function condiciones(request) {
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Método no permitido.'},{Allow:'GET, POST'});
  if(new URL(request.url).search)return json(400,{error:'Solicitud inválida.'});
  if(request.method==='POST' && !trustedOrigin(request))return json(403,{error:'No podés realizar esta acción.'});
  try {
    const user=await sessionUser(request);
    if(!user)return json(401,{code:'SESSION_REQUIRED',error:'Ingresá para continuar.'});
    if(!await rate(request,'terms-'+request.method.toLowerCase(),request.method==='GET'?90:15,60))return json(429,{error:'Esperá un minuto antes de reintentar.'});
    if(request.method==='GET')return json(200,await termsState(user.id));
    let value;try {value=await readJson(request,2048);}catch{return json(400,{error:'Solicitud inválida.'});}
    if(Object.keys(value).some(key=>!['action','version','accepted'].includes(key)) || value.action!=='accept' || value.accepted!==true || value.version!==TERMS_VERSION)
      return json(400,{error:'Aceptá explícitamente la versión vigente de los Términos de uso.',version:TERMS_VERSION});
    const result=await backendJson('/rest/v1/rpc/aceptar_terminos_web',{method:'POST',body:JSON.stringify({p_actor_id:id(user.id),p_version:TERMS_VERSION})});
    if(!validTermsState(result) || result.accepted!==true)throw new TermsError();
    return json(200,{version:TERMS_VERSION,accepted:true});
  } catch(error) {return termsFailure(error instanceof TermsError?error:new TermsError());}
}
export const config={path:'/.netlify/functions/condiciones',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain'],action:'rate_limit'}};
