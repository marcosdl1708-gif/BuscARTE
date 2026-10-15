import { backend, backendJson, trustedOrigin, sessionUser, startSession, clearCookie, readJson, readBytes, json, id, object, rate, notify } from '../lib/session.mjs';
import { RUBROS, DETAIL_FIELDS, belongsTo, projectProfile, detailObject } from '../lib/disciplinas.mjs';
import { assertCanCommunicate, ModerationError, moderationFailure, moderationBackendError } from '../lib/moderacion.mjs';
import { TERMS_VERSION, TermsError, assertTermsAccepted, termsFailure, termsBackendError } from '../lib/condiciones.mjs';

const PROFILE = 'id,created_at,nombre,instrumento,generos,provincia,ciudad,barrio,bio,referentes,disponibilidad,donde_ensaya,redes,videos,es_premium,foto_url,celular,baneado,experiencia,edad,genero_principal,tipo_cuenta,rubro,campos_especificos,disciplinas,perfil_revision';
const COLUMNS = {
  perfiles: PROFILE,
  anuncios: 'id,created_at,user_id,tipo,titulo,descripcion,instrumentos,generos,zona,estado,vistas,fecha_evento,lugar,precio_entrada,link_evento,contacto_evento,categoria_producto,marca,condicion,precio,foto_url,precio_num,nivel,modalidad,oculto,oculto_at,vencido_at,foto_url_2,foto_url_3,rubro,rubro_buscado,tags,campos_especificos',
  artistas_sugeridos: 'id,nombre,veces',
  conversaciones: 'id,created_at,user1_id,user2_id,anuncio_id,ultimo_mensaje,updated_at',
  mensajes: 'id,created_at,de_user_id,para_user_id,anuncio_id,contenido,leido',
  perfiles_guardados: 'id,user_id,perfil_id,created_at',
  reacciones: 'id,anuncio_id,tipo'
};
const fail = (status, message) => json(status, { error: message || ({400:'Solicitud inválida.',401:'Ingresá para continuar.',403:'No podés realizar esta acción.',405:'Método no permitido.',429:'Esperá unos minutos antes de reintentar.',502:'No pudimos confirmar la operación.',503:'Servicio temporalmente no disponible.'})[status], ...(status === 401 ? { code:'SESSION_REQUIRED' } : {}) });
const only = (payload, keys) => Object.keys(payload).every(key => keys.includes(key));
const str = (value, max = 2000) => typeof value === 'string' && value.length <= max && !value.includes('\0');
const same = (value, user) => id(value) === id(user.id);
function andFilter(params, expression) {
  const existing = params.get('and');
  params.set('and', existing ? '(' + existing.slice(1,-1) + ',' + expression + ')' : '(' + expression + ')');
}
function query(raw, table, additional = []) {
  const source = new URLSearchParams(raw), params = new URLSearchParams();
  const columns = new Set([...COLUMNS[table].split(','), ...additional]);
  for (const [key, value] of source) {
    if (params.has(key) || value.length > 8000 || value.includes('\0')) throw new Error('query');
    if (key === 'select') {
      const projection = value === '*' ? [...columns] : value.split(',');
      if (!projection.length || projection.some(field => !columns.has(field))) throw new Error('query');
      params.set(key, projection.join(','));
    } else if (key === 'order') {
      if (!value.split(',').every(part => { const [field,...directions] = part.split('.'); return columns.has(field) && directions.every(v=>['asc','desc','nullsfirst','nullslast'].includes(v)); })) throw new Error('query');
      params.set(key,value);
    } else if (['limit','offset'].includes(key)) {
      if (!/^\d{1,6}$/.test(value)) throw new Error('query');
      params.set(key,String(Math.min(Number(value),key==='limit'?999:10000)));
    } else if (['or','and'].includes(key)) {
      // Boolean filter syntax only; no relation embeds, arbitrary RPCs or private columns.
      if (!value.startsWith('(') || !value.endsWith(')') || /[;:\\]/.test(value) || /(?:password|email|celular|reset_token|reset_expires)/i.test(value)) throw new Error('query');
      const identifiers = [...value.matchAll(/(?:^|[,(])([a-z_][a-z0-9_]*)\./g)].map(match=>match[1]);
      if (!identifiers.length || identifiers.some(field=>!columns.has(field))) throw new Error('query');
      params.set(key,value);
    } else if (key === 'on_conflict' && table==='reacciones' && value==='user_id,anuncio_id,tipo') params.set(key,value);
    else if (columns.has(key) && /^(?:not\.)?(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike)\./.test(value)) params.set(key,value);
    else throw new Error('query');
  }
  if (!params.has('select')) params.set('select',[...columns].join(','));
  if (!params.has('limit')) params.set('limit','999');
  return params;
}
function prefer(request) {
  return (request.headers.get('prefer') || '').split(',').map(s=>s.trim()).filter(s=>['return=minimal','return=representation','count=exact','resolution=merge-duplicates','resolution=ignore-duplicates'].includes(s)).join(',');
}
async function responseFor(path, request, method=request.method, payload, extra={}) {
  const response = await backend(path, { method, headers:{ Prefer:prefer(request),...extra }, ...(payload===undefined?{}:{body:JSON.stringify(payload)}) });
  if (!response.ok) {
    const terms=await termsBackendError(response);if(terms)return termsFailure(terms);
    const blocked=await moderationBackendError(response);if(blocked)return moderationFailure(blocked);
    return fail(response.status===409?400:502);
  }
  const headers = { 'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff' };
  const range = response.headers.get('content-range'); if (range) headers['Content-Range']=range;
  if (request.method==='HEAD' || response.status===204) return new Response(null,{status:response.status,headers});
  return new Response(await response.text(),{status:response.status,headers});
}
async function profileResponse(params,request) {
  const context=params.get('rubro')?.replace(/^eq\./,'');
  const contextual=params.get('rubro')?.startsWith('eq.') && RUBROS.has(context);
  const requested=params.get('select').split(',');
  if(params.has('rubro_principal') || params.get('order')?.split(',').some(part=>part.split('.')[0]==='rubro_principal'))return fail(400);
  // Virtual principal is never passed as a nonexistent SQL column. Internal
  // fields permit contextual projection; only requested fields leave the API.
  const internal=new Set(requested.filter(key=>key!=='rubro_principal'));
  for(const key of ['rubro','tipo_cuenta','disciplinas',...DETAIL_FIELDS])internal.add(key);
  params.set('select',[...internal].join(','));
  if(contextual) {
    params.delete('rubro');
    andFilter(params,'tipo_cuenta.eq.artista');
    andFilter(params,'or(and(disciplinas.is.null,rubro.eq.'+context+'),disciplinas->selected.cs.["'+context+'"])');
    for(const key of DETAIL_FIELDS)if(params.has(key)) {
      const value=params.get(key);params.delete(key);
      const path='disciplinas->details->'+context+(key==='experiencia'?'->':'->>')+key;
      andFilter(params,'or(and(disciplinas.is.null,'+key+'.'+value+'),and(disciplinas.not.is.null,'+path+'.'+value+'))');
    }
    // Arbitrary nested detail predicates need a fully contextual expression;
    // silently applying them to principal mirrors would create false matches.
    const raw=new URL(request.url).searchParams.get('path'), source=new URL(raw,'https://xiaanchoanxmampegoay.supabase.co');
    if(['or','and'].some(key=>DETAIL_FIELDS.some(field=>new RegExp('(?:^|[,(])'+field+'\\.').test(source.searchParams.get(key)||''))))return fail(400);
  }
  const response=await backend('/rest/v1/perfiles?'+params,{method:request.method,headers:{Prefer:prefer(request)}});
  if(!response.ok)return fail(502);
  const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
  const range=response.headers.get('content-range');if(range)headers['Content-Range']=range;
  if(request.method==='HEAD')return new Response(null,{status:response.status,headers});
  const rows=await response.json();if(!Array.isArray(rows))return fail(502);
  const fields=new Set([...requested,...(requested.includes('rubro')?['rubro_principal']:[])]);
  const projected=rows.map(row=>projectProfile(row,contextual?context:null)).map(row=>Object.fromEntries([...fields].filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
  return new Response(JSON.stringify(projected),{status:response.status,headers});
}
async function profileExists(profileId) {
  const rows = await backendJson('/rest/v1/perfiles?id=eq.' + id(profileId) + '&select=id,baneado&limit=1');
  return Array.isArray(rows) && rows.length===1 && rows[0].baneado!==true;
}
async function adExists(adId) {
  const rows=await backendJson('/rest/v1/anuncios?id=eq.'+id(adId)+'&select=id,user_id,tipo,estado,oculto&limit=1');
  return Array.isArray(rows) && rows.length===1 ? rows[0]:null;
}
async function captcha(token, request) {
  const secret=Netlify.env.get('HCAPTCHA_SECRET');
  if (!secret || !str(token,8000) || !token) return false;
  const form=new URLSearchParams({secret,response:token,sitekey:'d314e4d0-234a-4454-bbd2-2bacefee8694'});
  const remoteip=request.headers.get('x-nf-client-connection-ip'); if(remoteip) form.set('remoteip',remoteip);
  const response=await fetch('https://api.hcaptcha.com/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)return false;
  const value=await response.json();
  return value.success===true && ['buscarte.com.ar','www.buscarte.com.ar'].includes(value.hostname);
}
async function authRpc(name, request, context) {
  if(!await rate(request,name,name==='login_usuario'?60:10,name==='login_usuario'?900:3600))return fail(429);
  const payload=await readJson(request);
  const marketingOptIn=name==='registrar_usuario' && payload.email_marketing_opt_in===true;
  if(name==='registrar_usuario') {
    if(payload.terms_accepted!==true || payload.terms_version!==TERMS_VERSION)return termsFailure(new TermsError(428,'TERMS_REQUIRED'));
    delete payload.terms_accepted; delete payload.terms_version;
    if(payload.email_marketing_opt_in!==undefined && typeof payload.email_marketing_opt_in!=='boolean')return fail(400);
    delete payload.email_marketing_opt_in;
  }
  if(!str(payload.p_email,254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.p_email.trim()) || !str(payload.p_password,name==='registrar_usuario'?72:4096) || payload.p_password.length<(name==='registrar_usuario'?8:1) || (name==='registrar_usuario' && Buffer.byteLength(payload.p_password)>72))return fail(400);
  payload.p_email=payload.p_email.trim().toLowerCase();
  if(!await rate(request,name+'-account',name==='login_usuario'?15:3,900,payload.p_email))return fail(429);
  if(name==='login_usuario') {
    if(!only(payload,['p_email','p_password']))return fail(400);
  } else {
    const keys=['p_email','p_password','p_nombre','p_provincia','p_ciudad','p_barrio','p_instrumento','p_generos','p_disponibilidad','p_referentes','p_bio','p_tipo_cuenta','p_rubro','p_campos_especificos','captcha_token'];
    if(!only(payload,keys) || !str(payload.p_nombre,200) || !payload.p_nombre.trim() || !['artista','negocio','visitante'].includes(payload.p_tipo_cuenta) || !str(payload.p_rubro,200) || (payload.p_tipo_cuenta==='artista' && !RUBROS.has(payload.p_rubro)))return fail(400);
    for(const key of keys.filter(key=>!['p_campos_especificos','captcha_token'].includes(key)))if(payload[key]!==undefined && !str(payload[key],key==='p_bio'?300:4000))return fail(400);
    if(!await captcha(payload.captcha_token,request))return fail(400,'No pudimos verificar el captcha. Completalo nuevamente; conservamos tus datos.');
    delete payload.captcha_token;
  }
  const result=await backendJson('/rest/v1/rpc/'+(name==='registrar_usuario'?'registrar_usuario_con_terminos_web':name),{method:'POST',body:JSON.stringify(name==='registrar_usuario'?{p_registro:payload,p_version:TERMS_VERSION}:payload)});
  const user=Array.isArray(result)?result[0]:result;
  if(!object(user) || user.error || !id(user.id))return json(name==='login_usuario'?401:400,{error:name==='registrar_usuario' && user?.error==='duplicate_email'?'duplicate_email':'Email o contraseña incorrectos.'});
  if(user.baneado===true)return fail(403);
  if(marketingOptIn) {
    try {
      const {mailService}=await import('../lib/mail-runtime.mjs');
      await mailService.savePreferences({id:user.id,email:payload.p_email},{marketing_opt_in:true,onboarding_disabled:false});
    } catch { console.warn('Email preferences unavailable'); }
  }
  let session;
  try { session=await startSession(user.id); }
  catch(error) { if(name==='registrar_usuario')return json(200,{...user,session_pending:true});throw error; }
  if(name==='registrar_usuario') {
    const task=notify('bienvenida',session.user.email,{nombre:session.user.nombre},{perfilId:session.user.id}).catch(()=>{});
    if(context?.waitUntil)context.waitUntil(task);else await task;
  }
  // The legacy response shape remains intact; cookie is the only authority.
  return json(200,{...user,disciplinas:session.user.disciplinas??null,perfil_revision:session.user.perfil_revision},{'Set-Cookie':session.cookie});
}
async function storage(request, route, user) {
  if(request.method!=='POST')return fail(405);
  await assertTermsAccepted(user.id);
  if(!await rate(request,'upload',15,60))return fail(429);
  const match=route.pathname.match(/^\/storage\/v1\/object\/(fotos-perfil|fotos-anuncios)\/([A-Za-z0-9-]+\.(?:jpg|jpeg|png|webp))$/);
  if(!match || route.search)return fail(400);
  const name=match[2];
  if(!name.startsWith(id(user.id)+'-'))return fail(403);
  const mime=request.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png','image/webp'].includes(mime))return fail(400);
  const bytes=await readBytes(request,2*1024*1024);
  const magic= mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!magic || bytes.length<12)return fail(400);
  // Recheck after a slow upload body. Deleted accounts cannot start a new
  // Storage operation with an earlier session result; the delayed deletion
  // queue also sweeps already in-flight uploads after the handler deadline.
  if(!await profileExists(user.id))return fail(401);
  const uploaded=await backend(route.pathname,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});
  if(!uploaded.ok)return fail(502);
  return json(200,await uploaded.json());
}
async function write(table, route, request, user, context) {
  const uid=id(user.id), payload=request.method==='DELETE'?null:await readJson(request);
  const params=query(route.search,table,table==='reacciones'?['user_id']:[]);
  // Writes never accept nested representation/privilege fields from the client.
  if(table==='perfiles')return fail(403);
  if(request.method!=='DELETE' && (['conversaciones','mensajes','anuncios','reacciones'].includes(table) || (table==='artistas_sugeridos' && request.method==='POST')))await assertTermsAccepted(uid);
  if(table==='artistas_sugeridos') {
    // Suggestions are not a privilege-bearing field; a verified user may add a
    // bounded name, never edit the global popularity counter supplied by a browser.
    if(request.method==='PATCH')return json(200,[]);
    if(request.method!=='POST' || !only(payload,['nombre','veces']) || !str(payload.nombre,200) || !payload.nombre.trim())return fail(400);
    return responseFor('/rest/v1/artistas_sugeridos',request,'POST',{nombre:payload.nombre.trim(),veces:1});
  }
  if(table==='perfiles_guardados') {
    params.set('user_id','eq.'+uid);
    if(request.method==='DELETE')return responseFor('/rest/v1/'+table+'?'+params,request);
    if(request.method!=='POST' || !only(payload,['user_id','perfil_id']) || !same(payload.user_id,user) || !id(payload.perfil_id) || !await profileExists(payload.perfil_id))return fail(403);
    return responseFor('/rest/v1/'+table,request,'POST',{user_id:uid,perfil_id:id(payload.perfil_id)});
  }
  if(table==='reacciones') {
    params.set('user_id','eq.'+uid);
    if(request.method==='DELETE')return responseFor('/rest/v1/'+table+'?'+params,request);
    if(request.method!=='POST' || !only(payload,['user_id','anuncio_id','tipo']) || !same(payload.user_id,user) || !id(payload.anuncio_id) || !['like','asistire'].includes(payload.tipo))return fail(400);
    const ad=await adExists(payload.anuncio_id);
    if(!ad || ad.oculto || ad.estado!=='activo' || same(ad.user_id,user) || (payload.tipo==='asistire' && ad.tipo!=='jam'))return fail(403);
    const path='/rest/v1/reacciones'+(route.searchParams.has('on_conflict')?'?on_conflict=user_id,anuncio_id,tipo':'');
    return responseFor(path,request,'POST',{user_id:uid,anuncio_id:id(payload.anuncio_id),tipo:payload.tipo});
  }
  if(table==='conversaciones') {
    if(request.method==='POST') {
      if(!only(payload,['user1_id','user2_id','anuncio_id','ultimo_mensaje','updated_at']) || !id(payload.user1_id) || !id(payload.user2_id) || (!same(payload.user1_id,user)&&!same(payload.user2_id,user)) || id(payload.user1_id)===id(payload.user2_id))return fail(403);
      const other=same(payload.user1_id,user)?id(payload.user2_id):id(payload.user1_id);
      if(!await profileExists(other))return fail(403);
      await assertCanCommunicate(uid,other);
      if(payload.anuncio_id) { const ad=await adExists(payload.anuncio_id);if(!ad || (id(ad.user_id)!==uid && id(ad.user_id)!==other))return fail(403); }
      return responseFor('/rest/v1/conversaciones',request,'POST',{user1_id:id(payload.user1_id),user2_id:id(payload.user2_id),anuncio_id:payload.anuncio_id?id(payload.anuncio_id):null,ultimo_mensaje:'',updated_at:new Date().toISOString()});
    }
    if(request.method==='PATCH') {
      if(!only(payload,['ultimo_mensaje','updated_at','anuncio_id']) || !str(payload.ultimo_mensaje,8000))return fail(400);
      // A preview update is not allowed to bypass a block or rewrite unrelated
      // conversations. Require one exact, session-owned conversation.
      const conversationId=params.get('id')?.replace(/^eq\./,'');
      if(!id(conversationId) || route.searchParams.get('id')!=='eq.'+id(conversationId))return fail(400);
      const conversations=await backendJson('/rest/v1/conversaciones?id=eq.'+id(conversationId)+'&select=user1_id,user2_id&limit=1');
      const current=conversations?.[0];
      if(!current || (!same(current.user1_id,user)&&!same(current.user2_id,user)))return fail(403);
      await assertCanCommunicate(uid,same(current.user1_id,user)?current.user2_id:current.user1_id);
      // Never let a preview update move a conversation to somebody else's ad.
      if(payload.anuncio_id) {
        const conversationId=params.get('id')?.replace(/^eq\./,'');
        if(!id(conversationId))return fail(400);
        const rows=await backendJson('/rest/v1/conversaciones?id=eq.'+id(conversationId)+'&select=user1_id,user2_id&limit=1');
        const conv=rows?.[0], ad=await adExists(payload.anuncio_id);
        if(!conv || (!same(conv.user1_id,user)&&!same(conv.user2_id,user)) || !ad || ![id(conv.user1_id),id(conv.user2_id)].includes(id(ad.user_id)))return fail(403);
      }
      andFilter(params,'or(user1_id.eq.'+uid+',user2_id.eq.'+uid+')');
      return responseFor('/rest/v1/conversaciones?'+params,request,'PATCH',{ultimo_mensaje:payload.ultimo_mensaje,updated_at:new Date().toISOString(),...(payload.anuncio_id?{anuncio_id:id(payload.anuncio_id)}:{})});
    }
    return fail(405);
  }
  if(table==='mensajes') {
    if(request.method!=='POST' || !only(payload,['de_user_id','para_user_id','anuncio_id','contenido']) || !same(payload.de_user_id,user) || !id(payload.para_user_id) || same(payload.para_user_id,user) || !str(payload.contenido,8000) || !payload.contenido.trim() || !await profileExists(payload.para_user_id))return fail(403);
    await assertCanCommunicate(uid,payload.para_user_id);
    if(!await rate(request,'message',30,60))return fail(429);
    if(payload.anuncio_id) { const ad=await adExists(payload.anuncio_id);if(!ad || (id(ad.user_id)!==uid && id(ad.user_id)!==id(payload.para_user_id)))return fail(403); }
    const result=await backend('/rest/v1/mensajes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({de_user_id:uid,para_user_id:id(payload.para_user_id),anuncio_id:payload.anuncio_id?id(payload.anuncio_id):null,contenido:payload.contenido.trim()})});
    if(!result.ok) {
      const terms=await termsBackendError(result);if(terms)return termsFailure(terms);
      const blocked=await moderationBackendError(result);if(blocked)return moderationFailure(blocked);
      return fail(502);
    }
    const saved=await result.json(); if(!Array.isArray(saved)||saved.length!==1||!id(saved[0].id))return fail(502);
    const task=(async()=>{const [recipient]=await backendJson('/rest/v1/perfiles?id=eq.'+id(payload.para_user_id)+'&select=email,nombre&limit=1');if(recipient?.email)await notify('mensaje',recipient.email,{remitente:user.nombre||'Una persona de buscARTE',preview:payload.contenido.slice(0,120)},{perfilId:payload.para_user_id,eventKey:'message:'+saved[0].id});})().catch(()=>{});
    if(context?.waitUntil)context.waitUntil(task);else await task;
    return json(201,saved);
  }
  if(table==='anuncios') {
    if(request.method!=='POST')return fail(403);
    if(!await rate(request,'ad',5,300))return fail(429);
    const allowed=COLUMNS.anuncios.split(',').filter(field=>!['id','created_at','vistas','oculto','oculto_at','vencido_at'].includes(field));
    if(!only(payload,allowed) || !same(payload.user_id,user) || !['busco','ofrezco','clases','jam','vende'].includes(payload.tipo) || !str(payload.titulo,300) || !payload.titulo.trim() || (user.tipo_cuenta==='visitante'&&!['jam','vende'].includes(payload.tipo)))return fail(403);
    if(!['artista','negocio','visitante'].includes(user.tipo_cuenta))return fail(403);
    for(const [key,value] of Object.entries(payload)) {
      if(['user_id','estado'].includes(key))continue;
      if(key==='precio_num') { if(value!==null && (typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12))return fail(400); }
      else if(key==='campos_especificos') { try { detailObject(value); }catch{return fail(400);} }
      else if(value!==null && !str(value,8000))return fail(400);
    }
    if(payload.fecha_evento!==undefined && payload.fecha_evento!==null && payload.fecha_evento!=='' && (!/^\d{4}-\d{2}-\d{2}T/.test(payload.fecha_evento)||!Number.isFinite(Date.parse(payload.fecha_evento))))return fail(400);
    for(const key of ['foto_url','foto_url_2','foto_url_3'])if(payload[key]) {
      try { const photo=new URL(payload[key]);const prefix='/storage/v1/object/public/fotos-anuncios/'+uid+'-';if(photo.origin!=='https://xiaanchoanxmampegoay.supabase.co' || photo.username || photo.password || !photo.pathname.startsWith(prefix) || !/^[A-Za-z0-9-]+\.(?:jpg|jpeg|png|webp)$/.test(photo.pathname.slice(prefix.length)) || photo.search || photo.hash)return fail(403); }catch{return fail(400);}
    }
    if(payload.rubro_buscado && !RUBROS.has(payload.rubro_buscado))return fail(400);
    if(user.tipo_cuenta!=='artista' && payload.tipo!=='vende' && !RUBROS.has(payload.rubro))return fail(400,'Elegí la comunidad a la que se dirige el anuncio.');
    if(user.tipo_cuenta==='artista' && payload.tipo!=='vende' && !belongsTo(user,payload.rubro??user.rubro))return fail(403,'Elegí una disciplina de tu perfil para publicar.');
    payload.user_id=uid;payload.estado='activo';
    payload.rubro=payload.tipo==='vende'?null:(user.tipo_cuenta==='artista'?(payload.rubro??user.rubro):payload.rubro);
    return responseFor('/rest/v1/anuncios',request,'POST',payload);
  }
  return fail(405);
}
export default async function datos(request, context) {
  if(!['GET','HEAD','POST','PATCH','DELETE'].includes(request.method))return fail(405);
  const mutating=!['GET','HEAD'].includes(request.method);
  if(mutating&&!trustedOrigin(request))return fail(403);
  try {
    const raw=new URL(request.url).searchParams.get('path');
    if(!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.length>12000 || /[\\#]/.test(raw))return fail(400);
    const route=new URL(raw,'https://xiaanchoanxmampegoay.supabase.co');
    if(route.origin!=='https://xiaanchoanxmampegoay.supabase.co' || /%2f|%2e/i.test(route.pathname))return fail(400);
    const rpc=route.pathname.match(/^\/rest\/v1\/rpc\/(login_usuario|registrar_usuario|gestionar_anuncio|eliminar_cuenta|vencer_anuncios_viejos)$/);
    if(rpc && ['login_usuario','registrar_usuario'].includes(rpc[1]))return request.method==='POST'&&!route.search?await authRpc(rpc[1],request,context):fail(405);
    let user=null;
    const table=route.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    const adView=table==='anuncios' && request.method==='PATCH';
    if(adView) {
      const payload=await readJson(request);
      const adId=route.searchParams.get('id')?.replace(/^eq\./,'');
      if(!id(adId) || [...route.searchParams.keys()].some(key=>key!=='id') || !only(payload,['vistas']) || !Number.isInteger(payload.vistas))return fail(403);
      if(!await rate(request,'ad-view',30,60))return fail(429);
      const changed=await backendJson('/rest/v1/rpc/registrar_vista_anuncio',{method:'POST',body:JSON.stringify({p_anuncio_id:id(adId)})});
      return json(200,changed===true?[]:[]);
    }
    const emailProjection=route.searchParams.get('select')?.split(',').includes('email') || route.searchParams.has('email');
    if((mutating && rpc?.[1]!=='vencer_anuncios_viejos') || ['mensajes','conversaciones','perfiles_guardados'].includes(table) || (table==='perfiles' && emailProjection)) {
      user=await sessionUser(request);if(!user)return fail(401);
    }
    if(route.pathname.startsWith('/storage/'))return user?await storage(request,route,user):fail(401);
    if(rpc) {
      if(request.method!=='POST'||route.search)return fail(405);
      if(rpc[1]==='vencer_anuncios_viejos')return json(200,0); // Expiry is maintained server-side below; no public arbitrary RPC.
      const payload=await readJson(request);
      if(rpc[1]==='gestionar_anuncio') {
        if(!only(payload,['p_anuncio_id','p_user_id','p_accion']) || !id(payload.p_anuncio_id) || !same(payload.p_user_id,user) || !['pausar','reactivar','republicar','eliminar'].includes(payload.p_accion))return fail(403);
        if(['reactivar','republicar'].includes(payload.p_accion))await assertTermsAccepted(user.id);
        return await responseFor('/rest/v1/rpc/gestionar_anuncio',request,'POST',{...payload,p_user_id:id(user.id)});
      }
      if(!only(payload,['p_user_id','p_password'])||!same(payload.p_user_id,user)||!str(payload.p_password,4096)||!payload.p_password)return fail(403);
      if(!await rate(request,'delete',3,900))return fail(429);
      const identity=await backendJson('/rest/v1/rpc/login_usuario',{method:'POST',body:JSON.stringify({p_email:user.email,p_password:payload.p_password})});
      if(!same(identity?.id,user))return fail(401);
      const result=await backendJson('/rest/v1/rpc/solicitar_eliminacion_web',{method:'POST',body:JSON.stringify({p_actor_id:id(user.id)})});
      if(result?.ok!==true || result.storage_pending!==true || typeof result.job_id!=='string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(result.job_id))return fail(502);
      // The atomic procedure already invalidated all account sessions. A second
      // network DELETE must not turn a committed deletion into a false failure.
      return json(200,{ok:true,storage_pending:true},{'Set-Cookie':clearCookie()});
    }
    if(!table || !Object.hasOwn(COLUMNS,table))return fail(403);
    if(mutating)return await write(table,route,request,user,context);
    const privateColumns=table==='perfiles'?[...(user?['email']:[]),'rubro_principal']:table==='reacciones'?['user_id']:[];
    const params=query(route.search,table,privateColumns);
    if(table==='perfiles') {
      if(user)params.set('id','eq.'+id(user.id));
      andFilter(params,'or(baneado.is.null,baneado.eq.false)');
    }
    if(table==='mensajes')andFilter(params,'or(de_user_id.eq.'+id(user.id)+',para_user_id.eq.'+id(user.id)+')');
    if(table==='conversaciones')andFilter(params,'or(user1_id.eq.'+id(user.id)+',user2_id.eq.'+id(user.id)+')');
    if(table==='perfiles_guardados')params.set('user_id','eq.'+id(user.id));
    if(table==='reacciones') {
      const nestedOwner=[route.searchParams.get('or'),route.searchParams.get('and')].some(value=>value&&/(?:^|[,(])user_id\./.test(value));
      if(nestedOwner)return fail(403);
      if(route.searchParams.has('user_id')) { user=await sessionUser(request);if(!user)return fail(401);params.set('user_id','eq.'+id(user.id)); }
      // Counts stay public; never expose who attended or reacted.
      const fields=params.get('select').split(',').filter(field=>field!=='user_id'&&field!=='id');params.set('select',fields.length?fields.join(','):'anuncio_id,tipo');
    }
    if(table==='anuncios') {
      const own = route.searchParams.has('user_id') ? await sessionUser(request) : null;
      if(!own || route.searchParams.get('user_id')!=='eq.'+id(own.id))andFilter(params,'oculto.eq.false');
      // Bounded expiry maintenance cannot be parameterised by public callers.
      if(!globalThis.__baExpiryAt || Date.now()-globalThis.__baExpiryAt>60000) {
        globalThis.__baExpiryAt=Date.now(); await backend('/rest/v1/rpc/vencer_anuncios_viejos',{method:'POST',body:'{}'});
      }
    }
    if(table==='perfiles')return await profileResponse(params,request);
    return await responseFor('/rest/v1/'+table+'?'+params,request);
  } catch(error) { return error instanceof TermsError?termsFailure(error):error instanceof ModerationError?moderationFailure(error):fail(503); }
}
export const config = { path:'/.netlify/functions/datos',rateLimit:{windowLimit:180,windowSize:60,aggregateBy:['ip','domain'],action:'rate_limit'} };
