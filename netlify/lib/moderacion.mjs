import { backend, id, json, object } from './session.mjs';

export const REPORT_REASONS = Object.freeze({
  abuso:'Comportamiento abusivo o acoso', spam:'Spam o publicidad no autorizada',
  suplantacion:'Perfil falso o identidad robada', contenido:'Contenido inapropiado u ofensivo',
  seguridad_infantil:'Explotación, abuso o riesgo infantil', otro:'Otro motivo'
});
export class ModerationError extends Error {
  constructor(status=503, code='MODERATION_UNAVAILABLE') {
    super(code); this.name='ModerationError'; this.status=status; this.code=code;
  }
}
export const moderationFailure = error => json(error.status, {
  code:error.code,
  error:error.code==='COMMUNICATION_BLOCKED'?'Esta conversación no admite nuevos mensajes.':
    error.status===400?'Revisá los datos de la solicitud.':
    error.status===403?'No podés realizar esta acción.':'No pudimos verificar la protección de esta conversación. Reintentá.'
});
export async function moderationBackendError(response) {
  if(response.ok)return null;
  const value=await response.clone().json().catch(()=>null);
  if(value?.code==='42501' && value?.message==='COMMUNICATION_BLOCKED')return new ModerationError(403,'COMMUNICATION_BLOCKED');
  return null;
}
export async function moderationRpc(name, payload) {
  const response=await backend('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(payload)});
  if(!response.ok) {
    const blocked=await moderationBackendError(response); if(blocked)throw blocked;
    const value=await response.json().catch(()=>null);
    if(value?.code==='22023')throw new ModerationError(400,'MODERATION_INVALID');
    if(value?.code==='42501' && value?.message==='REPORT_CONTEXT_FORBIDDEN')throw new ModerationError(403,'MODERATION_FORBIDDEN');
    throw new ModerationError();
  }
  return response.json();
}
export function validModerationState(value) {
  return object(value) && typeof value.blocked_by_me==='boolean' && typeof value.restricted==='boolean' &&
    (!value.blocked_by_me || value.restricted);
}
export async function readModerationState(actorId, otherId, call=moderationRpc) {
  if(!id(actorId)||!id(otherId)||id(actorId)===id(otherId))throw new ModerationError(400,'MODERATION_INVALID');
  let value;
  try {value=await call('estado_bloqueo_web',{p_actor_id:id(actorId),p_otro_id:id(otherId)});}
  catch(error) {throw error instanceof ModerationError?error:new ModerationError();}
  if(!validModerationState(value))throw new ModerationError();
  // No identities, counterpart's block row or arbitrary RPC fields leave here.
  return {blocked_by_me:value.blocked_by_me,restricted:value.restricted};
}
export async function assertCanCommunicate(actorId, otherId) {
  if((await readModerationState(actorId,otherId)).restricted)throw new ModerationError(403,'COMMUNICATION_BLOCKED');
}
