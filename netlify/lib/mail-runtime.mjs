import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { backendJson, environment, internalMailSecret } from './session.mjs';
import { buildEmail } from './mail-templates.mjs';
import { missingBasics } from './mail-profile.mjs';
import { readModerationState } from './moderacion.mjs';

export const MAIL_LIMITS = Object.freeze({ daily:90, engagementDaily:20, monthly:2700, engagementMonthly:600 });
const BASE = 'https://buscarte.com.ar';
const ENGAGEMENT = new Set(['perfil_incompleto','resumen_mensual','novedades']);
const TYPES = new Set(['bienvenida','mensaje','contacto','reporte','reset',...ENGAGEMENT]);
export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const emailHash = value => createHash('sha256').update(normalizeEmail(value)).digest('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const validEmail = value => typeof value==='string' && value.length<=160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value));
const profileId = value => /^[1-9]\d{0,14}$/.test(String(value)) ? String(value) : null;
const safeDate = value => Number.isFinite(Date.parse(value));
const fields = 'id,email,nombre,tipo_cuenta,rubro,instrumento,campos_especificos,disciplinas,foto_url,bio,provincia,ciudad,baneado,created_at';

export function signMailToken(value, secret=internalMailSecret()) {
  if (!secret || secret.length<32) throw new Error('configuration');
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update('buscarte-mail-link-v1:'+payload).digest('base64url');
}
export function verifyMailToken(token, secret=internalMailSecret()) {
  if (!secret || typeof token!=='string' || token.length>1500) return null;
  const [payload,signature,...extra]=token.split('.');
  if(extra.length || !/^[A-Za-z0-9_-]+$/.test(payload||'') || !/^[A-Za-z0-9_-]{43}$/.test(signature||''))return null;
  const expected=createHmac('sha256',secret).update('buscarte-mail-link-v1:'+payload).digest();
  const supplied=Buffer.from(signature,'base64url');
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return null;
  try {
    const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(value.v!==1 || !profileId(value.p) || !/^[a-f0-9]{64}$/.test(value.e) || !['unsubscribe','action'].includes(value.k) || (value.k==='action'&&!uuid(value.j)))return null;
    return value;
  } catch { return null; }
}
export function resetTokenFor(job,secret=internalMailSecret()) {
  if (!secret || secret.length<32 || !uuid(job.id))throw new Error('configuration');
  // Reproducible per job for retries; the raw token and reset HTML never enter the queue.
  return createHmac('sha256',secret).update('buscarte-reset-mail-v1:'+job.id+':'+emailHash(job.recipient)).digest('hex');
}
export function validateUsage(value,now=new Date()) {
  const day=value?.emails?.daily, month=value?.emails?.monthly;
  for(const part of [day,month]) {
    if(!part || !Number.isSafeInteger(part.used) || part.used<0 || !safeDate(part.resets_at) || Date.parse(part.resets_at)<=now.getTime())throw new Error('usage');
  }
  if(day.limit!==100 || month.limit!==3000 || Date.parse(day.resets_at)>now.getTime()+26*3600000 || Date.parse(month.resets_at)>now.getTime()+32*86400000)throw new Error('usage');
  return {daily:day,monthly:month};
}

export function createMailService(deps={}) {
  const db=deps.backendJson || backendJson, transport=deps.fetch || fetch;
  const env=deps.environment || environment, secret=deps.secret || internalMailSecret;
  const now=deps.now || (()=>new Date());
  const rpc=(name,value)=>db('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(value)});
  const finish=(job,status,error='',dueAt=null,resendId=null)=>rpc('mail_finish',{
    p_id:job.id,p_lease:job.lease_token,p_status:status,p_resend_id:resendId,p_error:error,p_due_at:dueAt
  });
  async function profile(id) {
    if(!profileId(id))return null;
    const rows=await db('/rest/v1/perfiles?id=eq.'+id+'&select='+fields+'&limit=1');
    return Array.isArray(rows)&&rows.length===1?rows[0]:null;
  }
  async function preferences(id,email) {
    const rows=await db('/rest/v1/email_preferences?perfil_id=eq.'+id+'&email=eq.'+encodeURIComponent(normalizeEmail(email))+'&select=marketing_opt_in,onboarding_disabled&limit=1');
    return Array.isArray(rows)&&rows.length?rows[0]:{marketing_opt_in:false,onboarding_disabled:false};
  }
  async function messageRestriction(job,person,checkLease=false) {
    if(job.tipo!=='mensaje')return null;
    const messageId=/^message:([1-9]\d{0,14})$/.exec(job.event_key||'')?.[1];
    if(!messageId || !person)return 'message_unverified';
    const rows=await db('/rest/v1/mensajes?id=eq.'+messageId+'&select=id,de_user_id,para_user_id&limit=1');
    if(!Array.isArray(rows)||rows.length!==1||String(rows[0].id)!==messageId||
      String(rows[0].para_user_id)!==String(person.id)||!profileId(rows[0].de_user_id)||String(rows[0].de_user_id)===String(person.id))return 'message_unverified';
    const state=await readModerationState(rows[0].de_user_id,person.id,rpc);
    if(state.restricted)return 'communication_blocked';
    if(checkLease) {
      const leases=await db('/rest/v1/email_outbox?id=eq.'+job.id+'&select=status,lease_token&limit=1');
      if(!Array.isArray(leases)||leases.length!==1||leases[0].status!=='leased'||leases[0].lease_token!==job.lease_token)return 'message_cancelled';
    }
    return null;
  }
  async function savePreferences(user,value) {
    if(!profileId(user.id)||!validEmail(normalizeEmail(user.email)))throw new Error('identity');
    await db('/rest/v1/email_preferences?on_conflict=perfil_id,email',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({perfil_id:user.id,email:normalizeEmail(user.email),marketing_opt_in:value.marketing_opt_in===true,onboarding_disabled:value.onboarding_disabled===true,updated_at:now().toISOString()})
    });
    if(value.onboarding_disabled)await rpc('mail_cancel_pending_profile',{p_perfil_id:Number(user.id),p_email:normalizeEmail(user.email),p_scope:'onboarding'});
    if(!value.marketing_opt_in)await rpc('mail_cancel_pending_profile',{p_perfil_id:Number(user.id),p_email:normalizeEmail(user.email),p_scope:'marketing'});
    return {marketing_opt_in:value.marketing_opt_in===true,onboarding_disabled:value.onboarding_disabled===true};
  }
  async function enqueue({tipo,destinatario,perfilId=null,datos={},eventKey,dueAt,expiresAt}) {
    const recipient=normalizeEmail(destinatario);
    if(!TYPES.has(tipo)||!validEmail(recipient)||!datos||typeof datos!=='object'||Array.isArray(datos))throw new Error('mail');
    if(JSON.stringify(datos).length>16000 || ['token','reset_token','password','link'].some(key=>Object.hasOwn(datos,key)))throw new Error('mail');
    let person=null;
    if(perfilId)person=await profile(perfilId);
    else if(!['contacto','reporte'].includes(tipo)) {
      const rows=await db('/rest/v1/perfiles?email=eq.'+encodeURIComponent(recipient)+'&select='+fields+'&limit=1');
      person=Array.isArray(rows)?rows[0]:null;
    }
    if(!['contacto','reporte'].includes(tipo)&&(!person||person.baneado||normalizeEmail(person.email)!==recipient))throw new Error('identity');
    const category=ENGAGEMENT.has(tipo)?'engagement':'transactional';
    const priority={reset:0,mensaje:10,bienvenida:20,reporte:25,contacto:30,perfil_incompleto:60,resumen_mensual:70,novedades:80}[tipo];
    const stamp=now();
    const key=eventKey || (tipo==='bienvenida'?'welcome:'+person.id+':'+emailHash(recipient):'event:'+randomUUID());
    const job=await rpc('mail_enqueue',{
      p_id:randomUUID(),p_event_key:key,p_tipo:tipo,p_perfil_id:person?Number(person.id):null,p_recipient:recipient,
      p_data:datos,p_category:category,p_priority:priority,p_due_at:dueAt||stamp.toISOString(),
      p_expires_at:expiresAt||new Date(stamp.getTime()+(tipo==='reset'?86400000:category==='engagement'?31*86400000:2*86400000)).toISOString()
    });
    return job;
  }
  async function usage() {
    // The existing sending-only key cannot read /usage. Keep its permissions:
    // a deliberately initialized durable ledger plus provider response headers
    // is the default. A separately configured account-usage key is optional.
    const key=env('RESEND_USAGE_API_KEY');
    if(!key)return validateUsage(await rpc('mail_usage_snapshot',{}),now());
    const response=await transport('https://api.resend.com/usage',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('usage');
    return validateUsage(await response.json(),now());
  }
  async function dispatch(jobId=null) {
    const job=await rpc('mail_claim',{p_id:jobId});
    if(!job)return {status:'empty'};
    const postpone=async(reason,when)=>{await finish(job,'retry',reason,when||new Date(now().getTime()+3600000).toISOString());return {status:'deferred',reason};};
    let reserved=false;
    try {
      const key=env('RESEND_API_KEY');
      if(!key||!secret())return await postpone('configuration');
      const person=job.perfil_id?await profile(job.perfil_id):null;
      if(job.perfil_id&&(!person||person.baneado||normalizeEmail(person.email)!==job.recipient)) {
        await finish(job,'cancelled','profile_changed');return {status:'cancelled'};
      }
      const restricted=await messageRestriction(job,person);
      if(restricted) {await finish(job,'cancelled',restricted);return {status:'cancelled'};}
      const prefs=person?await preferences(person.id,person.email):null;
      if(job.category==='engagement') {
        const onboarding=job.tipo==='perfil_incompleto' && job.data?.etapa!=='reactivacion';
        if(!person || (job.tipo==='perfil_incompleto'&&prefs.onboarding_disabled) || (!onboarding&&!prefs.marketing_opt_in)) {
          await finish(job,'cancelled','preference');return {status:'cancelled'};
        }
        // Daytime in Argentina. An urgent transactional job is dispatched at any hour.
        const hour=(now().getUTCHours()+21)%24;
        if(hour<10||hour>=19)return await postpone('quiet_hours',nextEngagementHour(now()));
      }
      let datos={...job.data};
      if(job.tipo==='bienvenida')datos={...datos,tipo_cuenta:person?.tipo_cuenta||'artista'};
      if(job.tipo==='resumen_mensual' && Array.isArray(datos.proximosEventos)) {
        datos.proximosEventos=datos.proximosEventos.filter(event=>safeDate(event.fechaISO)&&Date.parse(event.fechaISO)>now().getTime());
      }
      if(job.tipo==='perfil_incompleto') {
        const missing=missingBasics(person);
        if(!missing.length){await finish(job,'cancelled','profile_complete');return {status:'cancelled'};}
        datos={...datos,nombre:person.nombre,faltantes:missing};
      }
      const tokenData=person?{v:1,p:String(person.id),e:emailHash(person.email)}:null;
      const unsubscribeUrl=tokenData?BASE+'/.netlify/functions/email-unsubscribe?t='+signMailToken({...tokenData,k:'unsubscribe'},secret()):undefined;
      let actionUrl;
      if(person && ['bienvenida','perfil_incompleto','resumen_mensual','novedades'].includes(job.tipo)) {
        actionUrl=BASE+'/.netlify/functions/email-link?t='+signMailToken({...tokenData,k:'action',j:job.id},secret());
      }
      if(job.tipo==='reset')actionUrl=BASE+'/buscARTE_reset.html?token='+resetTokenFor(job,secret());
      const rendered=buildEmail(job.tipo,datos,{baseUrl:BASE,unsubscribeUrl,actionUrl});
      if(!rendered){await finish(job,'cancelled','no_content');return {status:'cancelled'};}
      let payload={from:env('FROM_EMAIL')||'buscARTE <hola@buscarte.com.ar>',to:[job.recipient],subject:rendered.subject,html:rendered.html,text:rendered.text};
      if(rendered.replyTo)payload.reply_to=rendered.replyTo;
      if(job.category==='engagement')payload.headers={'List-Unsubscribe':'<'+unsubscribeUrl+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'};
      payload=await rpc('mail_prepare',{p_id:job.id,p_lease:job.lease_token,p_payload:payload});
      if(!payload)return await postpone('lease');
      let account;
      try { account=await usage(); } catch { return await postpone('usage_unavailable'); }
      // Reputation suppressions are separate from an engagement opt-out: a
      // newsletter opt-out must never block password recovery.
      if(env('RESEND_USAGE_API_KEY')) {
        const suppression=await transport('https://api.resend.com/suppressions/'+encodeURIComponent(job.recipient),{
          headers:{Authorization:'Bearer '+env('RESEND_USAGE_API_KEY')},redirect:'error',signal:AbortSignal.timeout(5000)
        });
        if(suppression.ok){await finish(job,'cancelled','provider_suppressed');return {status:'cancelled'};}
        if(suppression.status!==404)return await postpone('suppression_unavailable');
      }
      const allowance=await rpc('mail_reserve',{
        p_id:job.id,p_lease:job.lease_token,p_payload_hash:digest(JSON.stringify(payload)),
        p_daily_used:account.daily.used,p_daily_reset:account.daily.resets_at,
        p_monthly_used:account.monthly.used,p_monthly_reset:account.monthly.resets_at
      });
      if(!allowance?.allowed)return await postpone(allowance?.reason||'quota',allowance?.retry_at);
      reserved=true;
      if(job.tipo==='reset') {
        const started=job.first_attempt_at?Date.parse(job.first_attempt_at):now().getTime();
        if(now().getTime()-started>45*60000){await finish(job,'failed','reset_expired');return {status:'failed'};}
        const token=resetTokenFor(job,secret());
        if(!await rpc('mail_set_reset',{p_id:job.id,p_lease:job.lease_token,p_token_hash:digest(token)})) {
          await finish(job,'cancelled','reset_superseded');return {status:'cancelled'};
        }
      }
      // A block can occur while rendering or waiting for a quota. Recheck the
      // persisted message pair immediately before the provider boundary. Jobs
      // cancelled by the DB block trigger are never intentionally resurrected.
      const latestRestriction=await messageRestriction(job,person,true);
      if(latestRestriction) {await finish(job,'cancelled',latestRestriction);return {status:'cancelled'};}
      const response=await transport('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'buscarte/'+job.id},
        body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(8000)
      });
      const observed=header=>{const value=response.headers.get(header);return /^\d+$/.test(value||'')?Number(value):null;};
      const dailyUsed=observed('x-resend-daily-quota'),monthlyUsed=observed('x-resend-monthly-quota');
      if(dailyUsed!==null||monthlyUsed!==null)await rpc('mail_observe_usage',{p_daily_used:dailyUsed,p_monthly_used:monthlyUsed});
      const result=await response.json().catch(()=>({}));
      if(response.ok&&typeof result.id==='string') {
        await finish(job,'sent','',null,result.id);return {status:'sent',id:result.id};
      }
      const code=typeof result.name==='string'?result.name:typeof result.error?.name==='string'?result.error.name:'';
      if(response.status===429) {
        if(['daily_quota_exceeded','monthly_quota_exceeded'].includes(code))await rpc('mail_observe_usage',{
          p_daily_used:code==='daily_quota_exceeded'?100:null,p_monthly_used:code==='monthly_quota_exceeded'?3000:null
        });
        const reset=code==='monthly_quota_exceeded'?account.monthly.resets_at:code==='daily_quota_exceeded'?account.daily.resets_at:new Date(now().getTime()+Math.max(60,Math.min(3600,Number(response.headers.get('retry-after'))||60))*1000).toISOString();
        return await postpone('provider_quota',reset);
      }
      if(response.status===409&&code==='concurrent_idempotent_requests')return await postpone('provider_busy',new Date(now().getTime()+120000).toISOString());
      if(response.status>=500 || response.ok)return await postpone('provider_unknown',new Date(now().getTime()+300000).toISOString());
      await finish(job,'failed',response.status===409?'payload_conflict':'provider_rejected');
      return {status:'failed'};
    } catch {
      // No addresses, tokens, payloads or provider response bodies in logs.
      return await postpone(reserved?'provider_unknown':'unavailable',new Date(now().getTime()+300000).toISOString());
    }
  }
  return {enqueue,dispatch,usage,profile,preferences,savePreferences};
}
export function nextEngagementHour(date) {
  const next=new Date(date);next.setUTCMinutes(0,0,0);
  if(date.getUTCHours()<13)next.setUTCHours(13);else {next.setUTCDate(next.getUTCDate()+1);next.setUTCHours(13);}
  return next.toISOString();
}
export const mailService=createMailService();
