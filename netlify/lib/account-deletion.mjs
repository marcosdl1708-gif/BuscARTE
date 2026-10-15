import { backend as serverBackend } from './session.mjs';

const BUCKETS = Object.freeze(['fotos-perfil','fotos-anuncios']);
const PAGE_SIZE = 100;
const strictId = value => (typeof value==='string' || typeof value==='number' && Number.isSafeInteger(value)) && /^[1-9]\d{0,14}$/.test(String(value)) ? String(value) : '';
const uuid = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
export class AccountCleanupError extends Error {
  constructor(code='cleanup_unavailable') { super(code);this.name='AccountCleanupError';this.code=code; }
}

// The current and historical uploaders use flat, owner-prefixed object names.
// No browser URL, bucket, prefix or filename becomes a deletion instruction.
function ownedName(value, owner) {
  return typeof value==='string' && value.startsWith(owner+'-') && value.length>owner.length+1 && value.length<=1024 &&
    !/[\x00-\x1f\x7f/\\%?#]/.test(value) && value!=='.' && value!=='..';
}

/**
 * Internal Storage API cleanup only. The queue adapter must provide two guards:
 * the DB account deletion committed and this worker still owns its valid lease.
 * Never call this helper from a route with a browser-supplied owner or object.
 * Re-list from offset zero after EACH removal, avoiding shifted-page omissions.
 */
export async function cleanupAccountStorage(perfilId, options={}) {
  const owner=strictId(perfilId);
  const transport=options.backend || serverBackend;
  const assertCommitted=options.assertDeletionCommitted,assertLease=options.assertLease;
  if(!owner || typeof assertCommitted!=='function' || typeof assertLease!=='function')throw new AccountCleanupError('cleanup_invalid');
  const now=options.now || Date.now;
  const maxMillis=options.maxMillis ?? 6000,maxBatches=options.maxBatches ?? 2,maxPages=options.maxPages ?? 100;
  if(!Number.isInteger(maxMillis)||maxMillis<1||maxMillis>20000 || !Number.isInteger(maxBatches)||maxBatches<1||maxBatches>20 ||
    !Number.isInteger(maxPages)||maxPages<1||maxPages>100)throw new AccountCleanupError('cleanup_invalid');
  const deadline=now()+maxMillis;
  let deleted=0,batches=0,pages=0;
  const remaining=()=>deadline-now();
  const result=status=>({status,deleted,batches,pages});
  const guard=async()=>{
    if(remaining()<=0)throw new AccountCleanupError('cleanup_budget');
    if(await assertCommitted(owner)!==true)throw new AccountCleanupError('account_not_deleted');
    if(await assertLease()!==true)throw new AccountCleanupError('cleanup_lease_lost');
    if(remaining()<=0)throw new AccountCleanupError('cleanup_budget');
  };
  async function api(path,method,body) {
    if(remaining()<=0)throw new AccountCleanupError('cleanup_budget');
    const response=await transport(path,{method,body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(1,Math.min(3000,remaining())))});
    if(!response.ok)throw new AccountCleanupError();
    const value=await response.json().catch(()=>{throw new AccountCleanupError('cleanup_response');});
    if(!Array.isArray(value))throw new AccountCleanupError('cleanup_response');
    return value;
  }
  async function findOwned(bucket) {
    const seen=new Set();
    // search is a substring search, not an ownership filter. It can return
    // 112-*, 123-*, etc. Strict root-name checks below are the actual boundary.
    for(let offset=0;;offset+=PAGE_SIZE) {
      if(pages>=maxPages || remaining()<=0)return null;
      const rows=await api('/storage/v1/object/list/'+bucket,'POST',{
        prefix:'',search:owner+'-',limit:PAGE_SIZE,offset,sortBy:{column:'name',order:'asc'}
      });
      pages++;
      if(rows.length>PAGE_SIZE || rows.some(row=>!object(row)||typeof row.name!=='string'||row.name.length>1024))throw new AccountCleanupError('cleanup_response');
      const names=[];
      for(const row of rows) {
        if(seen.has(row.name))throw new AccountCleanupError('cleanup_listing_repeated');
        seen.add(row.name);
        if(!row.name.startsWith(owner+'-'))continue;
        // An unexpected folder or unsafe owner-prefixed name must be reviewed,
        // not silently ignored while reporting the account completely erased.
        if(!ownedName(row.name,owner) || typeof row.id!=='string' || !row.id)throw new AccountCleanupError('cleanup_object_unverified');
        names.push(row.name);
      }
      if(names.length)return names;
      if(rows.length<PAGE_SIZE)return [];
    }
  }
  try {
    // Nothing is listed or removed until the transaction/lease are confirmed.
    await guard();
    for(const bucket of BUCKETS) {
      while(true) {
        const names=await findOwned(bucket);
        if(names===null)return result('deferred');
        if(!names.length)break;
        if(batches>=maxBatches)return result('deferred');
        await guard();
        const removed=await api('/storage/v1/object/'+bucket,'DELETE',{prefixes:names});
        if(removed.some(row=>!object(row)||!ownedName(row.name,owner)||!names.includes(row.name)))throw new AccountCleanupError('cleanup_response');
        deleted+=removed.length;batches++;
        // No response count is proof of completion. Even an empty success or a
        // partial removal is verified by another paginated listing from zero.
      }
    }
    await guard();
    return result('complete');
  } catch(error) {
    if(error instanceof AccountCleanupError && error.code==='cleanup_budget')return result('deferred');
    throw error instanceof AccountCleanupError?error:new AccountCleanupError();
  }
}

/** Consume exactly one durable, service-only deletion job. No new schedule. */
export function createAccountDeletionService(deps={}) {
  const transport=deps.backend || serverBackend,now=deps.now || Date.now;
  async function processOne(jobId=null,options={}) {
    if(jobId!==null && !uuid(jobId))throw new AccountCleanupError('cleanup_invalid');
    const maxMillis=options.maxMillis ?? 6000;
    if(!Number.isInteger(maxMillis)||maxMillis<100||maxMillis>20000)throw new AccountCleanupError('cleanup_invalid');
    const deadline=now()+maxMillis;
    const remaining=()=>deadline-now();
    async function call(path,method='GET',body) {
      if(remaining()<=0)throw new AccountCleanupError('cleanup_budget');
      const response=await transport(path,{method,signal:AbortSignal.timeout(Math.max(1,Math.min(3000,remaining()))),
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok)throw new AccountCleanupError();
      try {return await response.json();}catch{throw new AccountCleanupError('cleanup_response');}
    }
    const rpc=(name,body)=>call('/rest/v1/rpc/'+name,'POST',body);
    const job=await rpc('claim_eliminacion_web',{p_job_id:jobId});
    if(job===null)return {status:'empty'};
    if(!object(job)||!uuid(job.id)||!strictId(job.perfil_id)||job.status!=='leased'||!uuid(job.lease_token)||
      !Number.isFinite(Date.parse(job.lease_until))||Date.parse(job.lease_until)<=now()||jobId!==null&&job.id!==jobId)
      throw new AccountCleanupError('cleanup_job_unverified');
    const owner=strictId(job.perfil_id),jobPath='/rest/v1/eliminaciones_storage_web?id=eq.'+job.id+
      '&select=id,perfil_id,status,lease_token,lease_until&limit=1';
    const assertLease=async()=>{
      if(Date.parse(job.lease_until)<=now())return false;
      const rows=await call(jobPath);
      return Array.isArray(rows)&&rows.length===1&&rows[0]?.id===job.id&&strictId(rows[0].perfil_id)===owner&&rows[0].status==='leased'&&
        rows[0].lease_token===job.lease_token&&Number.isFinite(Date.parse(rows[0].lease_until))&&Date.parse(rows[0].lease_until)>now();
    };
    const assertDeletionCommitted=async()=>{
      const rows=await call('/rest/v1/perfiles?id=eq.'+owner+'&select=id&limit=1');
      return Array.isArray(rows)&&rows.length===0;
    };
    let done=false,errorCode='',cleanup;
    try {
      // Reserve a small part of this invocation for the fenced finish RPC. A
      // timed-out worker may also safely let its lease expire and retry later.
      const cleanupBudget=Math.max(1,remaining()-500);
      cleanup=await cleanupAccountStorage(owner,{backend:transport,assertDeletionCommitted,assertLease,now,maxMillis:cleanupBudget,
        maxBatches:options.maxBatches ?? 2,maxPages:options.maxPages ?? 100});
      done=cleanup.status==='complete';
      if(!done)errorCode='cleanup_budget';
    } catch(error) {errorCode=error instanceof AccountCleanupError?error.code:'cleanup_unavailable';}
    try {
      const saved=await rpc('finalizar_eliminacion_web',{p_job_id:job.id,p_lease:job.lease_token,p_done:done,p_error:errorCode});
      if(saved!==true)return {status:'deferred',reason:'cleanup_lease_lost'};
    } catch {return {status:'deferred',reason:'cleanup_unconfirmed'};}
    return done?{status:'complete',deleted:cleanup.deleted}:{status:'deferred',reason:errorCode};
  }
  return Object.freeze({processOne});
}

export const accountDeletionService=createAccountDeletionService();
