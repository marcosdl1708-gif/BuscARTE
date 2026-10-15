import { randomUUID } from 'node:crypto';
import { backend, backendJson, environment } from './session.mjs';
import { planEngagement, DEFAULT_ENGAGEMENT_ACTIVATION } from './mail-profile.mjs';
import { emailHash, normalizeEmail } from './mail-runtime.mjs';

const DAY=86400000;
const PROFILE='id,email,nombre,created_at,tipo_cuenta,rubro,instrumento,campos_especificos,disciplinas,foto_url,bio,provincia,ciudad,baneado';
async function all(table,select) {
  const rows=[];
  for(let offset=0;offset<10000;offset+=500) {
    const page=await backendJson('/rest/v1/'+table+'?select='+select+'&limit=500&offset='+offset+'&order='+ (table==='perfiles'?'id':'perfil_id')+'.asc');
    if(!Array.isArray(page))throw new Error('backend');
    rows.push(...page);
    if(page.length<500)return rows;
  }
  throw new Error('audience_limit');
}
async function enqueueBatches(jobs) {
  for(let index=0;index<jobs.length;index+=50)await backendJson('/rest/v1/rpc/mail_enqueue_batch',{method:'POST',body:JSON.stringify({p_jobs:jobs.slice(index,index+50)})});
  return jobs.length;
}
async function audience() {
  const [profiles,prefs]=await Promise.all([all('perfiles',PROFILE),all('email_preferences','perfil_id,email,marketing_opt_in,onboarding_disabled')]);
  const map=new Map(prefs.map(p=>[String(p.perfil_id)+':'+normalizeEmail(p.email),p]));
  return profiles.filter(p=>!p.baneado&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(p.email)))
    .map(profile=>({profile,prefs:map.get(String(profile.id)+':'+normalizeEmail(profile.email))||{marketing_opt_in:false,onboarding_disabled:false}}));
}
function jobFor(profile,tipo,data,key,dueAt,expiresAt,priority) {
  return {id:randomUUID(),event_key:key+':'+emailHash(profile.email),tipo,perfil_id:profile.id,recipient:normalizeEmail(profile.email),data,category:'engagement',priority,due_at:dueAt,expires_at:expiresAt};
}
export async function planProfileReminders(stamp=new Date()) {
  const people=await audience(),jobs=[];
  const activationDate=environment('EMAIL_ENGAGEMENT_ACTIVATION')||DEFAULT_ENGAGEMENT_ACTIVATION;
  for(const {profile,prefs} of people)for(const plan of planEngagement(profile,prefs,stamp,{activationDate})) {
    jobs.push(jobFor(profile,'perfil_incompleto',{nombre:profile.nombre,etapa:plan.etapa},plan.eventKey,plan.dueAtISO,plan.expiresAtISO,60));
  }
  return enqueueBatches(jobs);
}
async function count(path) {
  const response=await backend('/rest/v1/'+path,{headers:{Prefer:'count=exact','Range-Unit':'items',Range:'0-0'}});
  if(!response.ok)throw new Error('backend');
  const total=Number(response.headers.get('content-range')?.split('/')[1]);
  if(!Number.isSafeInteger(total)||total<0)throw new Error('backend');
  return total;
}
export async function planMonthlySummary(stamp=new Date()) {
  const local=new Date(stamp.getTime()-3*3600000);
  const year=local.getUTCFullYear(),month=local.getUTCMonth();
  // The previous local calendar month, with Argentina's fixed UTC-3 boundary.
  const until=new Date(Date.UTC(year,month,1,3));
  const from=new Date(Date.UTC(year,month-1,1,3));
  const period=from.toISOString().slice(0,7);
  const interval='&created_at=gte.'+encodeURIComponent(from.toISOString())+'&created_at=lt.'+encodeURIComponent(until.toISOString());
  const [people,newArtists,newAds,events]=await Promise.all([
    audience(),count('perfiles?select=id&tipo_cuenta=eq.artista'+interval),
    count('anuncios?select=id&tipo=neq.jam&oculto=not.is.true'+interval),
    backendJson('/rest/v1/anuncios?select=id,titulo,fecha_evento,lugar&tipo=eq.jam&estado=eq.activo&oculto=not.is.true&fecha_evento=gte.'+encodeURIComponent(stamp.toISOString())+'&fecha_evento=lt.'+encodeURIComponent(new Date(stamp.getTime()+31*DAY).toISOString())+'&order=fecha_evento.asc&limit=3')
  ]);
  const mes=new Intl.DateTimeFormat('es-AR',{month:'long',timeZone:'America/Argentina/Buenos_Aires'}).format(from);
  const data={mes,nuevosArtistas:newArtists,nuevosAnuncios:newAds,proximosEventos:(Array.isArray(events)?events:[]).filter(e=>Number.isFinite(Date.parse(e.fecha_evento))).map(e=>({id:e.id,titulo:e.titulo,lugar:e.lugar,fechaISO:e.fecha_evento,fecha:new Intl.DateTimeFormat('es-AR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(e.fecha_evento))}))};
  const jobs=people.filter(item=>item.prefs.marketing_opt_in===true)
    .map(({profile})=>jobFor(profile,'resumen_mensual',{...data,nombre:profile.nombre},'monthly:'+profile.id+':'+period,stamp.toISOString(),new Date(stamp.getTime()+28*DAY).toISOString(),70));
  return enqueueBatches(jobs);
}
