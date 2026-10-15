import { id, json, trustedOrigin, sessionUser, readJson, rate, notify, environment } from '../lib/session.mjs';
import { REPORT_REASONS, ModerationError, moderationFailure, moderationRpc, readModerationState, validModerationState } from '../lib/moderacion.mjs';

const fail=(status,code,message)=>json(status,{code,error:message});
const invalid=()=>fail(400,'MODERATION_INVALID','Revisá los datos de la solicitud.');
const only=(value,keys)=>Object.keys(value).every(key=>keys.includes(key));
const scalarId=value=>(typeof value==='string' || (typeof value==='number' && Number.isSafeInteger(value)))?id(value):'';
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export default async function moderacion(request,context) {
  if(!['GET','POST'].includes(request.method))return json(405,{code:'METHOD_NOT_ALLOWED',error:'Método no permitido.'},{Allow:'GET, POST'});
  if(request.method==='POST' && !trustedOrigin(request))return fail(403,'MODERATION_FORBIDDEN','No podés realizar esta acción.');
  const params=new URL(request.url).searchParams;
  if(request.method==='GET' && (params.size!==1 || params.getAll('perfil_id').length!==1 || !id(params.get('perfil_id'))))return invalid();
  if(request.method==='POST' && params.size)return invalid();
  try {
    const user=await sessionUser(request);
    if(!user)return fail(401,'SESSION_REQUIRED','Ingresá para continuar.');
    if(request.method==='GET') {
      if(id(user.id)===id(params.get('perfil_id')))return invalid();
      if(!await rate(request,'moderation-read',90,60))return fail(429,'RATE_LIMITED','Esperá un minuto antes de reintentar.');
      return json(200,await readModerationState(user.id,params.get('perfil_id')));
    }
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'MODERATION_INVALID','Formato no admitido.');
    if(Number(request.headers.get('content-length')||0)>8192)return fail(413,'MODERATION_INVALID','La solicitud es demasiado larga.');
    let payload;try {payload=await readJson(request,8192);}catch{return invalid();}
    const target=scalarId(payload.perfil_id);
    if(!target || target===id(user.id) || !['block','unblock','report'].includes(payload.action))return invalid();
    if(payload.action!=='report') {
      if(!only(payload,['action','perfil_id']))return invalid();
      if(!await rate(request,'moderation-block',30,60))return fail(429,'RATE_LIMITED','Esperá un minuto antes de reintentar.');
      const state=await moderationRpc('gestionar_bloqueo_web',{p_actor_id:id(user.id),p_otro_id:target,p_bloquear:payload.action==='block'});
      if(!validModerationState(state) || state.blocked_by_me!==(payload.action==='block'))throw new ModerationError();
      return json(200,{blocked_by_me:state.blocked_by_me,restricted:state.restricted});
    }
    if(!only(payload,['action','perfil_id','conversacion_id','reason','detail','request_id']) ||
      typeof payload.reason!=='string' || !Object.hasOwn(REPORT_REASONS,payload.reason) || typeof payload.detail!=='string' || payload.detail.length>2000 ||
      !uuid(payload.request_id) || (payload.conversacion_id!=null && !scalarId(payload.conversacion_id)))return invalid();
    // Rate limits are actor-bound as well as IP-bound; changing a client actor
    // field cannot bypass the limit or attribute a report to somebody else.
    if(!await rate(request,'moderation-report',5,60) || !await rate(request,'moderation-report-account',10,3600,id(user.id)))
      return fail(429,'RATE_LIMITED','Ya recibimos varios reportes. Esperá antes de enviar otro.');
    const result=await moderationRpc('reportar_usuario_web',{
      p_actor_id:id(user.id),p_otro_id:target,p_conversacion_id:payload.conversacion_id==null?null:id(payload.conversacion_id),
      p_reason:payload.reason,p_detail:payload.detail.trim(),p_request_id:payload.request_id.toLowerCase()
    });
    if(result?.ok!==true || !scalarId(result.id))throw new ModerationError();
    // Persisted report is authoritative; queued delivery is idempotent and an
    // unavailable mail provider never changes a saved report into a failed one.
    const task=notify('reporte',environment('ADMIN_EMAIL')||'BuscARTE.webmail@gmail.com',{
      perfilId:target,perfilNombre:'Perfil '+target,motivo:REPORT_REASONS[payload.reason],
      detalle:'Reporte #'+id(result.id)+(payload.conversacion_id==null?'':' · Conversación '+id(payload.conversacion_id))+'\n'+payload.detail.trim(),
      reporterId:id(user.id),reporterNombre:user.nombre||'Usuario',
      linkPerfil:'https://buscarte.com.ar/buscARTE_perfil_publico.html?id='+target
    },{eventKey:'moderation-report:'+id(result.id)}).catch(()=>{});
    if(context?.waitUntil)context.waitUntil(task);else await task;
    return json(200,{ok:true,id:id(result.id)});
  } catch(error) {
    return moderationFailure(error instanceof ModerationError?error:new ModerationError());
  }
}
export const config={path:'/.netlify/functions/moderacion',rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip','domain'],action:'rate_limit'}};
