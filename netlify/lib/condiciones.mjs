import { backendJson, id, json, object } from './session.mjs';

export const TERMS_VERSION = '2026-10-15';
export class TermsError extends Error {
  constructor(status=503, code='TERMS_UNAVAILABLE') { super(code); this.status=status; this.code=code; }
}
export const termsFailure = error => json(error.status, {
  code:error.code, version:TERMS_VERSION,
  error:error.code==='TERMS_REQUIRED'?'Antes de publicar contenido, aceptá los Términos de uso.':
    'No pudimos verificar la aceptación de los términos. Conservá tu borrador y reintentá.'
});
export function validTermsState(value) {
  return object(value) && value.version===TERMS_VERSION && typeof value.accepted==='boolean';
}
export async function termsState(actorId, call=backendJson) {
  if(!id(actorId))throw new TermsError();
  let result;
  try { result=await call('/rest/v1/rpc/estado_terminos_web',{method:'POST',body:JSON.stringify({p_actor_id:id(actorId)})}); }
  catch { throw new TermsError(); }
  if(!validTermsState(result))throw new TermsError();
  return {version:TERMS_VERSION,accepted:result.accepted};
}
export async function assertTermsAccepted(actorId, call=backendJson) {
  if(!(await termsState(actorId,call)).accepted)throw new TermsError(428,'TERMS_REQUIRED');
}
export async function termsBackendError(response) {
  if(response.ok)return null;
  const value=await response.clone().json().catch(()=>null);
  return value?.code==='42501' && value?.message==='TERMS_REQUIRED'?new TermsError(428,'TERMS_REQUIRED'):null;
}
