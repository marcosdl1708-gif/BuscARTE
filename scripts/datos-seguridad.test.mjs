import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Real ESM handlers and their real shared helper, with a fail-closed transport.
// No production credentials, records, email, Storage or native network are used.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network denied during module import'); };
const { default:datos, config:datosConfig } = await import('../netlify/functions/datos.mjs');
const { default:sesion } = await import('../netlify/functions/sesion.mjs');
const { default:guardarPerfil } = await import('../netlify/functions/guardar-perfil.mts');
const { sessionUser, serverConfig } = await import('../netlify/lib/session.mjs');
const { mailService } = await import('../netlify/lib/mail-runtime.mjs');
const { normalizeDisciplines, disciplinesFor, prepareProfileChanges, projectProfile, RUBROS, DETAIL_FIELDS } = await import('../netlify/lib/disciplinas.mjs');
globalThis.fetch = nativeFetch;

const web = 'https://buscarte.com.ar';
const sb = 'https://xiaanchoanxmampegoay.supabase.co';
const serviceKey = 'sb_secret_synthetic_fixture_key_not_a_credential';
const digest = value => createHash('sha256').update(value).digest('hex');
const token = Buffer.alloc(32, 7).toString('base64url');
const oldPasswordHash = 'synthetic-bcrypt-placeholder';
const cookie = '__Host-ba_session=' + token;
const syntheticUser = { id:701, nombre:'Persona propia', email:'owner@example.invalid',
  password:oldPasswordHash, tipo_cuenta:'artista', rubro:'musica',
  referentes:'', generos:'', baneado:false, disciplinas:null,perfil_revision:0,
  instrumento:'Batería',disponibilidad:'Disponible',donde_ensaya:'',experiencia:0,campos_especificos:{},edad:null };
const ordinaryUser = (id, rubro='danza') => ({ id, nombre:'Persona fixture '+id,
  email:'user'+id+'@example.invalid', password:'synthetic-password-'+id,
  tipo_cuenta:'artista', rubro, baneado:false,disciplinas:null,perfil_revision:0 });

function request(path, options={}) {
  const method = options.method || 'GET';
  return new Request(web + '/.netlify/functions/datos?path=' + encodeURIComponent(path), {
    method,
    headers:{ origin:web, 'sec-fetch-site':'same-origin',
      'x-nf-client-connection-ip':'192.0.2.7', ...(options.signed === false ? {} : { cookie }),
      ...(options.body === undefined ? {} : { 'content-type':'application/json' }),
      ...(options.headers || {}) },
    ...(options.body === undefined ? {} : { body:typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }),
    ...(options.bytes === undefined ? {} : { body:options.bytes })
  });
}
const sessionRequest = (options={}) => new Request(web+'/.netlify/functions/sesion', {
  method:options.method || 'GET', headers:{ origin:web, 'sec-fetch-site':'same-origin',
    ...(options.signed === false ? {} : { cookie }), ...(options.headers || {}),
    ...(options.body === undefined ? {} : { 'content-type':'application/json' }) },
  ...(options.body === undefined ? {} : { body:JSON.stringify(options.body) })
});
const registration = (role='artista',rubro='musica') => ({
  p_email:'NEW@example.invalid', p_password:'correct-fixture', p_nombre:'Nueva persona',
  p_provincia:'Buenos Aires', p_ciudad:'La Plata', p_barrio:'', p_instrumento:'',
  p_generos:'', p_disponibilidad:'', p_referentes:'', p_bio:'', p_tipo_cuenta:role,
  p_rubro:rubro, p_campos_especificos:{}, captcha_token:'synthetic-verified-captcha'
});
function projection(row, select) {
  if (!row) return null;
  return Object.fromEntries(String(select).split(',').filter(key => Object.hasOwn(row,key)).map(key=>[key,row[key]]));
}
async function withBackend(options, action) {
  const previousFetch=globalThis.fetch, previousNetlify=globalThis.Netlify;
  const previousMail={enqueue:mailService.enqueue,dispatch:mailService.dispatch,savePreferences:mailService.savePreferences};
  const previousExpiry=globalThis.__baExpiryAt;
  const env = { SUPABASE_URL:sb, SUPABASE_SERVICE_ROLE_KEY:serviceKey,
    HCAPTCHA_SECRET:'synthetic-hcaptcha-secret', ...options.env };
  const profiles = new Map([[701,{ ...syntheticUser, ...options.user }], [702,ordinaryUser(702)], [999,ordinaryUser(999,'actuacion')]]);
  if(options.deleted)profiles.delete(701);
  if(options.banned)profiles.get(701).baneado=true;
  if(options.changedPassword)profiles.get(701).password='new-synthetic-password-hash';
  const calls=[], unexpected=[], notifications=[], dispatches=[], preferenceWrites=[];
  const state={ registered:false, messageSaved:false, deleted:false, sessionCreated:false };
  const sessions=new Map([[digest(token),{perfil_id:701,password_fingerprint:options.badFingerprint?'0'.repeat(64):digest(oldPasswordHash)}]]);
  const reply=(status,value,headers={})=>new Response(value===null?null:JSON.stringify(value),{
    status, headers:{ 'content-type':'application/json', ...headers }
  });
  const apiCalls=(name,method)=>calls.filter(c=>c.url.pathname===name&&(!method||c.method===method));
  globalThis.Netlify={ env:{ get:name=>env[name] || '' } };
  globalThis.__baExpiryAt=0;
  // The real ESM gateway and session helper still run. Only the mail-service
  // boundary is replaced, including imports performed dynamically by notify.
  mailService.enqueue=async payload=>{
    if(payload.tipo==='bienvenida')assert(state.registered&&state.sessionCreated,'welcome can only follow persisted account/session');
    if(payload.tipo==='mensaje')assert(state.messageSaved,'message email can only follow confirmed insert');
    notifications.push(structuredClone(payload));
    if(options.queueFails)throw new Error('Synthetic queue failure');
    return{id:'synthetic-job-'+notifications.length};
  };
  mailService.dispatch=async id=>{dispatches.push(id);return{status:options.mailDeferred?'deferred':'sent',id:'synthetic-provider-id'};};
  mailService.savePreferences=async(user,value)=>{
    assert(state.registered,'marketing permission can only follow persisted registration');
    preferenceWrites.push({user:structuredClone(user),value:structuredClone(value)});
    if(options.preferencesFail)throw new Error('Synthetic preferences failure');
    return value;
  };
  globalThis.fetch=async(href,init={})=>{
    const url=new URL(href), method=init.method || 'GET';
    const headers=new Headers(init.headers || {});
    const body=typeof init.body==='string'&&/^[\[{]/.test(init.body)?JSON.parse(init.body):init.body;
    calls.push({ url,method,headers,body });
    if(url.origin===sb) {
      assert.equal(headers.get('apikey'),env.SUPABASE_SERVICE_ROLE_KEY,'service authorization must remain server-side');
      assert.equal(headers.get('authorization'),null,'opaque key must not become Bearer');
      if(options.backendFailure)return reply(500,{private:'synthetic-private-backend-error'});
      if(url.pathname==='/rest/v1/rpc/limitar_operacion_web') {
        assert.equal(method,'POST');
        return reply(200,options.denyScope!==body.p_scope);
      }
      if(url.pathname==='/rest/v1/sesiones_web') {
        if(method==='POST') {
          if(options.sessionStartFail)return reply(500,{private:'synthetic session detail'});
          assert.deepEqual(Object.keys(body).sort(),['expires_at','password_fingerprint','perfil_id','token_hash']);
          assert.match(body.token_hash,/^[a-f0-9]{64}$/);
          assert.notEqual(body.token_hash,token);
          assert.match(body.password_fingerprint,/^[a-f0-9]{64}$/);
          assert(Date.parse(body.expires_at)>Date.now());
          state.sessionCreated=true;
          sessions.set(body.token_hash,{perfil_id:body.perfil_id,password_fingerprint:body.password_fingerprint});
          // Real PostgREST default for an INSERT without return=representation:
          // status 201 and an EMPTY body, not the [] assumed by old fixtures.
          return reply(201,null);
        }
        if(method==='DELETE') { sessions.delete(url.searchParams.get('token_hash')?.replace(/^eq\./,''));return reply(204,null); }
        assert.equal(url.searchParams.get('select'),'perfil_id,password_fingerprint');
        assert.match(url.searchParams.get('expires_at'),/^gt\./);
        const row=sessions.get(url.searchParams.get('token_hash')?.replace(/^eq\./,''));
        return reply(200,!row||options.expired||options.revoked?[]:[row]);
      }
      if(url.pathname==='/rest/v1/perfiles' && method==='GET') {
        const rawId=url.searchParams.get('id');
        if(rawId?.startsWith('eq.')) {
          const profile=profiles.get(Number(rawId.slice(3)));
          return reply(200,profile?[projection(profile,url.searchParams.get('select'))]:[]);
        }
        let rows=[...profiles.values()].filter(p=>!p.baneado);
        const context=url.searchParams.get('and')?.match(/disciplinas->selected\.cs\.\["([a-z]+)"\]/)?.[1];
        if(context)rows=rows.filter(p=>p.tipo_cuenta==='artista'&&(p.disciplinas?p.disciplinas.selected.includes(context):p.rubro===context));
        return reply(200,rows.map(p=>projection(p,url.searchParams.get('select'))));
      }
      if(url.pathname==='/rest/v1/perfiles' && method==='PATCH') {
        assert.equal(url.searchParams.get('id'),'eq.701');
        assert.equal(url.searchParams.get('or'),'(baneado.is.null,baneado.eq.false)');
        const profile=profiles.get(701);
        if(options.profileFailure)return reply(500,{private:'synthetic profile failure'});
        assert.equal(url.searchParams.get('perfil_revision'),'eq.'+(body.perfil_revision-1));
        if(options.conflict || url.searchParams.get('perfil_revision')!=='eq.'+profile.perfil_revision)return reply(200,[]);
        profiles.set(701,{...profile,...body});
        if(options.profileMinimal)return reply(204,null);
        if(options.profilePartial)profiles.get(701).generos='not-confirmed-fixture';
        return reply(200,options.profileUnconfirmed?[]:[projection(profiles.get(701),url.searchParams.get('select'))]);
      }
      if(url.pathname==='/rest/v1/rpc/login_usuario') {
        if(body.p_password!==(options.acceptedPassword || 'correct-fixture') || options.badLogin)return reply(200,{error:'invalid_credentials'});
        assert.equal(body.p_email,'owner@example.invalid');
        return reply(200,projection(profiles.get(701),'id,nombre,email,tipo_cuenta,rubro,referentes,generos,baneado'));
      }
      if(url.pathname==='/rest/v1/rpc/registrar_usuario') {
        assert(!Object.hasOwn(body,'captcha_token'),'captcha must not be forwarded to the legacy RPC');
        assert(!Object.hasOwn(body,'email_marketing_opt_in'),'consent flag must not be forwarded to legacy RPC');
        if(options.duplicate)return reply(200,{error:'duplicate_email'});
        state.registered=true;
        profiles.set(703,{ ...ordinaryUser(703,body.p_rubro), nombre:body.p_nombre,email:body.p_email,tipo_cuenta:body.p_tipo_cuenta });
        return reply(200,{id:703,nombre:body.p_nombre,email:body.p_email});
      }
      if(url.pathname==='/rest/v1/rpc/eliminar_cuenta') {
        assert.equal(method,'POST');
        assert.deepEqual(body,{p_user_id:701});
        if(options.deleteFail)return reply(200,{ok:false,error:'synthetic private deletion detail'});
        state.deleted=true;profiles.delete(701);
        return reply(200,{ok:true});
      }
      if(url.pathname==='/rest/v1/rpc/gestionar_anuncio') {
        assert.equal(body.p_user_id,'701');
        return reply(200,[{id:91,user_id:701,estado:'pausado',oculto:false}]);
      }
      if(url.pathname==='/rest/v1/rpc/vencer_anuncios_viejos')return reply(200,0);
      if(url.pathname==='/rest/v1/rpc/registrar_vista_anuncio')return reply(200,true);
      if(url.pathname==='/rest/v1/anuncios') {
        if(method==='POST')return reply(201,[{...body,id:92}]);
        const adId=url.searchParams.get('id');
        if(adId?.startsWith('eq.'))return reply(200,[{
          id:Number(adId.slice(3)),user_id:702,tipo:options.adType || 'jam',estado:options.adState || 'activo',oculto:!!options.hiddenAd
        }]);
        return reply(200,[]);
      }
      if(url.pathname==='/rest/v1/conversaciones') {
        if(method==='GET'&&url.searchParams.get('select')==='user1_id,user2_id')return reply(200,[{user1_id:701,user2_id:702}]);
        return reply(method==='POST'?201:200,method==='POST'?[{...body,id:81}]:[]);
      }
      if(url.pathname==='/rest/v1/mensajes') {
        if(method==='POST') {
          if(options.messageFail)return reply(500,{private:'synthetic message detail'});
          if(options.messageUnconfirmed)return reply(201,[]);
          state.messageSaved=true;
          return reply(201,[{...body,id:61}]);
        }
        return reply(200,[]);
      }
      if(['/rest/v1/perfiles_guardados','/rest/v1/reacciones','/rest/v1/artistas_sugeridos'].includes(url.pathname))return reply(method==='POST'?201:200,[]);
      if(url.pathname.startsWith('/storage/v1/object/')) {
        assert.equal(headers.get('x-upsert'),'false','uploads must not overwrite an existing object');
        return reply(options.uploadFail?409:200,{Key:url.pathname.replace('/storage/v1/object/','')});
      }
    }
    if(url.href==='https://api.hcaptcha.com/siteverify') {
      const form=new URLSearchParams(init.body);
      assert.equal(form.get('response'),'synthetic-verified-captcha');
      assert.equal(form.get('sitekey'),'d314e4d0-234a-4454-bbd2-2bacefee8694');
      assert.equal(form.get('secret'),'synthetic-hcaptcha-secret');
      return reply(200,{success:options.captchaValid!==false,hostname:options.captchaHostname || 'buscarte.com.ar'});
    }
    unexpected.push({url:url.href,method});
    throw new Error('Unexpected request, real network denied');
  };
  try {
    const result=await action({calls,apiCalls,notifications,dispatches,preferenceWrites,state,profiles});
    assert.deepEqual(unexpected,[],'no request may fall through to a real transport');
    return result;
  } finally {
    globalThis.fetch=previousFetch;globalThis.Netlify=previousNetlify;
    Object.assign(mailService,previousMail);
    if(previousExpiry===undefined)delete globalThis.__baExpiryAt;else globalThis.__baExpiryAt=previousExpiry;
  }
}

test('gateway native route/rate and server helper reject missing/anon config', async()=>{
  assert.equal(datosConfig.path,'/.netlify/functions/datos');
  assert.equal(datosConfig.rateLimit.action,'rate_limit');
  await withBackend({env:{SUPABASE_SERVICE_ROLE_KEY:''}},async({calls})=>{
    assert.equal(serverConfig(),null);
    assert.equal((await datos(request('/rest/v1/perfiles?select=id'))).status,503);
    assert.equal(calls.length,0);
  });
  await withBackend({env:{SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_fixture'}},async()=>assert.equal(serverConfig(),null));
});
test('missing, malformed, duplicate and forged cookies never become identity',async()=>{
  for(const headers of [{cookie:''},{cookie:'__Host-ba_session=701'},
    {cookie:cookie+'; '+cookie},{cookie:'__Host-ba_session='+Buffer.alloc(32,8).toString('base64url')}]) {
    await withBackend({},async({apiCalls})=>{
      assert.equal(await sessionUser(sessionRequest({headers})),null);
      assert.equal((await datos(request('/rest/v1/mensajes?para_user_id=eq.701',{headers}))).status,401);
      assert.equal(apiCalls('/rest/v1/mensajes').length,0);
    });
  }
});
test('session invalidates immediately after reset, ban, deletion, expiry or revocation',async()=>{
  for(const options of [{changedPassword:true},{banned:true},{deleted:true},{expired:true},{revoked:true},{badFingerprint:true}]) {
    await withBackend(options,async({apiCalls})=>{
      const res=await sesion(sessionRequest());
      assert.equal(res.status,401);
      assert.match(res.headers.get('set-cookie'),/Max-Age=0/);
      assert.equal((await datos(request('/rest/v1/conversaciones'))).status,401);
      assert.equal(apiCalls('/rest/v1/conversaciones').length,0);
    });
  }
});
test('valid session exposes safe UX identity without password or raw session token',async()=>{
  await withBackend({},async()=>{
    const res=await sesion(sessionRequest()), payload=await res.json();
    assert.equal(res.status,200);
    assert.equal(payload.user.id,701);
    assert(!Object.hasOwn(payload.user,'password'));
    assert(!JSON.stringify(payload).includes(token));
    assert.equal(res.headers.get('cache-control'),'no-store');
  });
});
test('CSRF blocks every mutation before reading private data or calling RPCs',async()=>{
  const cases=[['/rest/v1/rpc/login_usuario',{p_email:'owner@example.invalid',p_password:'correct-fixture'}],
    ['/rest/v1/rpc/eliminar_cuenta',{p_user_id:701,p_password:'correct-fixture'}],
    ['/rest/v1/mensajes',{de_user_id:701,para_user_id:702,contenido:'fixture'}],
    ['/rest/v1/reacciones',{user_id:701,anuncio_id:91,tipo:'like'}]];
  for(const origin of ['', 'https://evil.example.invalid','https://www.buscarte.com.ar']) {
    await withBackend({},async({calls})=>{
      for(const [path,body] of cases)assert.equal((await datos(request(path,{method:'POST',body,headers:{origin}}))).status,403);
      assert.equal((await sesion(sessionRequest({method:'POST',body:{action:'logout'},headers:{origin}}))).status,403);
      assert.equal(calls.length,0);
    });
  }
});
test('logout invalidates only the random session hash and clears secure cookie',async()=>{
  await withBackend({},async({apiCalls})=>{
    const res=await sesion(sessionRequest({method:'POST',body:{action:'logout'}}));
    assert.equal(res.status,200);
    assert.match(res.headers.get('set-cookie'),/Max-Age=0; Secure; HttpOnly; SameSite=Lax/);
    const [ended]=apiCalls('/rest/v1/sesiones_web','DELETE');
    assert.equal(ended.url.searchParams.get('token_hash'),'eq.'+digest(token));
  });
});
test('private reads retain requested filters but enforce verified owner with AND',async()=>{
  for(const [table,search,required] of [
    ['conversaciones','or=(user1_id.eq.999,user2_id.eq.999)&select=id','or(user1_id.eq.701,user2_id.eq.701)'],
    ['mensajes','or=(and(de_user_id.eq.999,para_user_id.eq.702),and(de_user_id.eq.702,para_user_id.eq.999))&select=id','or(de_user_id.eq.701,para_user_id.eq.701)'],
    ['perfiles_guardados','user_id=eq.999&select=perfil_id','user_id']
  ]) {
    await withBackend({},async({apiCalls})=>{
      assert.equal((await datos(request('/rest/v1/'+table+'?'+search))).status,200);
      const [sent]=apiCalls('/rest/v1/'+table,'GET');
      if(required==='user_id')assert.equal(sent.url.searchParams.get('user_id'),'eq.701');
      else assert(sent.url.searchParams.get('and').includes(required));
    });
  }
});
test('public profile wildcard cannot expose credentials; email projection is owner-only',async()=>{
  await withBackend({},async({apiCalls})=>{
    const publicRes=await datos(request('/rest/v1/perfiles?select=*',{signed:false}));
    assert.equal(publicRes.status,200);
    assert(!JSON.stringify(await publicRes.json()).includes('@example.invalid'));
    for(const call of apiCalls('/rest/v1/perfiles'))assert(!/(password|reset_token|reset_expires|email)/.test(call.url.searchParams.get('select')));
    const own=await datos(request('/rest/v1/perfiles?id=eq.999&select=id,email'));
    assert.deepEqual(await own.json(),[{id:701,email:'owner@example.invalid'}]);
    assert.equal((await datos(request('/rest/v1/perfiles?select=email',{signed:false}))).status,401);
    assert((await datos(request('/rest/v1/perfiles?select=password'))).status>=400);
  });
});
test('reaction owner through boolean filters is rejected; public counts hide identities',async()=>{
  await withBackend({},async({apiCalls})=>{
    for(const boolean of ['or=(user_id.eq.999,tipo.eq.like)','and=(user_id.eq.999)']) {
      assert.equal((await datos(request('/rest/v1/reacciones?'+boolean+'&select=tipo'))).status,403);
    }
    assert.equal(apiCalls('/rest/v1/reacciones').length,0);
    assert.equal((await datos(request('/rest/v1/reacciones?select=id,user_id,anuncio_id,tipo',{signed:false}))).status,200);
    const [sent]=apiCalls('/rest/v1/reacciones');
    assert.equal(sent.url.searchParams.get('select'),'anuncio_id,tipo');
  });
});
test('guardados/reactions DELETE forcibly retain verified user even with forged query',async()=>{
  for(const table of ['perfiles_guardados','reacciones'])await withBackend({},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/'+table+'?user_id=eq.999&perfil_id=eq.702'.replace('&perfil_id=eq.702',table==='reacciones'?'&anuncio_id=eq.91':'&perfil_id=eq.702'),{method:'DELETE'}))).status,200);
    assert.equal(apiCalls('/rest/v1/'+table,'DELETE')[0].url.searchParams.get('user_id'),'eq.701');
  });
});
test('forged sender/participant/saved-owner IDs cannot write for another user',async()=>{
  for(const [table,body] of [
    ['mensajes',{de_user_id:999,para_user_id:702,contenido:'spoof'}],
    ['conversaciones',{user1_id:999,user2_id:702}],
    ['perfiles_guardados',{user_id:999,perfil_id:702}],
    ['reacciones',{user_id:999,anuncio_id:91,tipo:'like'}]
  ])await withBackend({},async({apiCalls})=>{
    assert((await datos(request('/rest/v1/'+table,{method:'POST',body}))).status>=400);
    assert.equal(apiCalls('/rest/v1/'+table,'POST').length,0);
  });
});
test('conversation insert and PATCH preserve participants and owner restriction',async()=>{
  await withBackend({},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/conversaciones',{method:'POST',body:{user1_id:701,user2_id:702,ultimo_mensaje:'forged initial',updated_at:'1900'}}))).status,201);
    const [inserted]=apiCalls('/rest/v1/conversaciones','POST');
    assert.equal(inserted.body.ultimo_mensaje,'');
    assert.equal(inserted.body.user1_id,'701');
    assert.equal(inserted.body.user2_id,'702');
    assert.equal((await datos(request('/rest/v1/conversaciones?id=eq.81',{method:'PATCH',body:{ultimo_mensaje:'preview'}}))).status,200);
    const [updated]=apiCalls('/rest/v1/conversaciones','PATCH');
    assert(updated.url.searchParams.get('and').includes('or(user1_id.eq.701,user2_id.eq.701)'));
    assert((await datos(request('/rest/v1/conversaciones?id=eq.81',{method:'PATCH',body:{user1_id:999,ultimo_mensaje:'bad'}}))).status>=400);
    assert.equal(apiCalls('/rest/v1/conversaciones','PATCH').length,1);
  });
});
test('message email follows confirmed persistence only; recipient comes from server',async()=>{
  const body={de_user_id:701,para_user_id:702,contenido:'Mensaje fixture'};
  for(const options of [{},{messageFail:true},{messageUnconfirmed:true}])await withBackend(options,async({notifications,apiCalls})=>{
    const response=await datos(request('/rest/v1/mensajes',{method:'POST',body}));
    const success=!options.messageFail&&!options.messageUnconfirmed;
    assert.equal(response.status,success?201:502);
    assert.equal(notifications.length,success?1:0);
    if(success)assert.deepEqual(notifications[0],{tipo:'mensaje',destinatario:'user702@example.invalid',datos:{remitente:'Persona propia',preview:'Mensaje fixture'},perfilId:702,eventKey:'message:61'});
    assert.equal(apiCalls('/rest/v1/mensajes','POST').length,1);
  });
});
test('login validates credentials then creates random HttpOnly session without changing profile IDs',async()=>{
  await withBackend({},async({state,apiCalls})=>{
    const res=await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body:{p_email:'OWNER@example.invalid',p_password:'correct-fixture'}}));
    assert.equal(res.status,200);
    assert.equal((await res.json()).id,701);
    assert(state.sessionCreated);
    assert.match(res.headers.get('set-cookie'),/^__Host-ba_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax$/);
    assert.equal(apiCalls('/rest/v1/rpc/login_usuario','POST')[0].body.p_email,'owner@example.invalid');
  });
});
test('realistic 201 empty-body session INSERT still issues cookie; session GET and logout round trip succeed',async()=>{
  await withBackend({},async({apiCalls})=>{
    const login=await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body:{p_email:'owner@example.invalid',p_password:'correct-fixture'}}));
    assert.equal(login.status,200);
    assert.equal((await login.json()).id,701);
    const issuedCookie=login.headers.get('set-cookie')?.split(';')[0];
    assert.match(issuedCookie,/^__Host-ba_session=[A-Za-z0-9_-]{43}$/);
    assert.notEqual(issuedCookie,cookie);
    assert.equal(apiCalls('/rest/v1/sesiones_web','POST').length,1);
    const current=await sesion(sessionRequest({headers:{cookie:issuedCookie}}));
    assert.equal(current.status,200);assert.equal((await current.json()).user.id,701);
    const logout=await sesion(sessionRequest({method:'POST',body:{action:'logout'},headers:{cookie:issuedCookie}}));
    assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await sesion(sessionRequest({headers:{cookie:issuedCookie}}))).status,401);
  });
});
test('login separates NAT-friendly IP limit from normalized-account brute-force limit',async()=>{
  const body={p_email:'OWNER@example.invalid',p_password:'correct-fixture'};
  await withBackend({},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body}))).status,200);
    const rates=apiCalls('/rest/v1/rpc/limitar_operacion_web','POST');
    assert.equal(rates[0].body.p_scope,'login_usuario');assert.equal(rates[0].body.p_limit,60);assert.equal(rates[0].body.p_seconds,900);
    assert.equal(rates[1].body.p_scope,'login_usuario-account');assert.equal(rates[1].body.p_limit,15);assert.equal(rates[1].body.p_seconds,900);
    assert.equal(rates[1].body.p_actor_hash,digest('login_usuario-account:owner@example.invalid'));
    assert(!JSON.stringify(rates.map(call=>call.body)).includes('owner@example.invalid'));
  });
  await withBackend({denyScope:'login_usuario-account'},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body}))).status,429);
    assert.equal(apiCalls('/rest/v1/rpc/login_usuario').length,0);
  });
});
test('bad/blocked login and session persistence failure never issue a success cookie',async()=>{
  for(const options of [{badLogin:true},{banned:true},{sessionStartFail:true}])await withBackend(options,async({notifications,state})=>{
    const res=await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body:{p_email:'owner@example.invalid',p_password:'correct-fixture'}}));
    assert(res.status>=400);
    assert.equal(res.headers.get('set-cookie'),null);
    assert.equal(state.sessionCreated,false);
    assert.equal(notifications.length,0);
  });
});
test('registration requires server captcha and preserves all three account types',async()=>{
  for(const [role,rubro] of [['artista','danza'],['negocio','Sala de ensayo'],['visitante','']])await withBackend({},async({state,apiCalls,notifications})=>{
    const res=await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:registration(role,rubro)}));
    assert.equal(res.status,200);
    assert(state.registered&&state.sessionCreated);
    assert.equal((await res.json()).id,703);
    assert(res.headers.get('set-cookie'));
    const [registered]=apiCalls('/rest/v1/rpc/registrar_usuario');
    assert.equal(registered.body.p_tipo_cuenta,role);
    assert.equal(registered.body.p_rubro,rubro);
    assert.equal(notifications.length,1);
    assert.equal(notifications[0].destinatario,'new@example.invalid');
  });
});

test('registration consent is explicit, normalized, bound to created ID and excluded from legacy RPC',async()=>{
  for(const [role,rubro] of [['artista','danza'],['negocio','Sala de ensayo'],['visitante','']])await withBackend({},async({preferenceWrites,apiCalls,notifications})=>{
    const body={...registration(role,rubro),email_marketing_opt_in:true};body.p_email=' NEW@example.invalid ';
    const result=await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body}));
    assert.equal(result.status,200);assert.equal(preferenceWrites.length,1);
    assert.deepEqual(preferenceWrites[0],{user:{id:703,email:'new@example.invalid'},value:{marketing_opt_in:true,onboarding_disabled:false}});
    assert.equal(apiCalls('/rest/v1/rpc/registrar_usuario','POST')[0].body.p_email,'new@example.invalid');
    assert.equal(Object.hasOwn(apiCalls('/rest/v1/rpc/registrar_usuario','POST')[0].body,'email_marketing_opt_in'),false);
    assert.equal(notifications[0].perfilId,703);
  });
});
test('registration absent or false consent never writes a subscription or opt-out for historical defaults',async()=>{
  for(const extra of [{},{email_marketing_opt_in:false}])await withBackend({},async({preferenceWrites,notifications})=>{
    assert.equal((await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:{...registration(),...extra}}))).status,200);
    assert.deepEqual(preferenceWrites,[]);assert.equal(notifications.length,1);
  });
});
test('registration rejects nonboolean consent before legacy registration or preference writes',async()=>{
  for(const value of ['true',1,null,{},[]])await withBackend({},async({preferenceWrites,apiCalls,notifications})=>{
    assert.equal((await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:{...registration(),email_marketing_opt_in:value}}))).status,400);
    assert.equal(apiCalls('/rest/v1/rpc/registrar_usuario','POST').length,0);assert.deepEqual(preferenceWrites,[]);assert.deepEqual(notifications,[]);
  });
});
test('a deferred welcome or failed ancillary queue never turns persisted registration into a second signup',async()=>{
  for(const options of [{mailDeferred:true},{queueFails:true}])await withBackend(options,async({state,notifications})=>{
    const result=await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:registration()}));
    assert.equal(result.status,200);assert.equal((await result.json()).id,703);assert(state.registered&&state.sessionCreated);assert(result.headers.get('set-cookie'));assert.equal(notifications.length,1);
  });
});
test('optional preference failure preserves successful registration and never logs the address',async()=>{
  const previousWarn=console.warn,warnings=[];console.warn=(...args)=>warnings.push(args);
  try {
    await withBackend({preferencesFail:true},async({state,preferenceWrites,notifications})=>{
      const result=await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:{...registration(),email_marketing_opt_in:true}}));
      assert.equal(result.status,200);assert.equal((await result.json()).id,703);assert(state.registered&&state.sessionCreated);assert(result.headers.get('set-cookie'));assert.equal(preferenceWrites.length,1);assert.equal(notifications.length,1);
    });
    assert(!JSON.stringify(warnings).includes('example.invalid'));
  } finally {console.warn=previousWarn;}
});
test('missing/invalid/wrong-host captcha never creates profile or sends welcome',async()=>{
  for(const options of [{env:{HCAPTCHA_SECRET:''}},{captchaValid:false},{captchaHostname:'attacker.example.invalid'}])await withBackend(options,async({apiCalls,notifications})=>{
    assert.equal((await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:registration()}))).status,400);
    assert.equal(apiCalls('/rest/v1/rpc/registrar_usuario').length,0);
    assert.equal(notifications.length,0);
  });
});
test('registration duplicate/partial success never produces misleading authenticated success',async()=>{
  await withBackend({duplicate:true},async({state,notifications})=>{
    const res=await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:registration()}));
    assert.equal(res.status,400);
    assert.equal((await res.json()).error,'duplicate_email');
    assert.equal(state.registered,false);assert.equal(notifications.length,0);
  });
  await withBackend({sessionStartFail:true},async({state,notifications})=>{
    const res=await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:registration()}));
    assert.equal(res.status,200);
    assert.deepEqual(await res.json(),{id:703,nombre:'Nueva persona',email:'new@example.invalid',session_pending:true});
    assert.equal(res.headers.get('set-cookie'),null);
    assert.equal(state.registered,true);assert.equal(notifications.length,0);
  });
});
test('new bcrypt password rejects UTF8 byte overflow but accepts the 72-byte boundary',async()=>{
  await withBackend({},async({apiCalls})=>{
    const invalid=registration();invalid.p_password='é'.repeat(37);
    assert.equal((await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:invalid}))).status,400);
    assert.equal(apiCalls('/rest/v1/rpc/registrar_usuario').length,0);
    const valid=registration();valid.p_password='é'.repeat(36);
    assert.equal((await datos(request('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:valid}))).status,200);
  });
});
test('uploads verify own ID, MIME magic, size and never overwrite Storage',async()=>{
  const jpeg=Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0]);
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const cases=[['/storage/v1/object/fotos-perfil/999-photo.jpg',jpeg,'image/jpeg',403],
    ['/storage/v1/object/fotos-perfil/701-photo.jpg',Buffer.alloc(12),'image/jpeg',400],
    ['/storage/v1/object/fotos-perfil/701-photo.png',jpeg,'image/png',400],
    ['/storage/v1/object/fotos-perfil/701-photo.jpg',jpeg,'image/svg+xml',400],
    ['/storage/v1/object/fotos-perfil/701-photo.jpg',Buffer.alloc(2*1024*1024+1),'image/jpeg',503],
    ['/storage/v1/object/fotos-anuncios/701-photo.jpg',jpeg,'image/jpeg',200],
    ['/storage/v1/object/fotos-perfil/701-photo.png',png,'image/png',200]];
  for(const [path,bytes,mime,status] of cases)await withBackend({},async({calls})=>{
    assert.equal((await datos(request(path,{method:'POST',bytes,headers:{'content-type':mime}}))).status,status);
    assert.equal(calls.filter(c=>c.url.pathname.startsWith('/storage/')).length,status===200?1:0);
  });
});
test('ad writes reject forged owner/privilege fields and derive discipline from server profile',async()=>{
  const ad={user_id:701,tipo:'ofrezco',titulo:'Anuncio fixture',descripcion:'Contenido',rubro:'actuacion',estado:'pausado'};
  await withBackend({},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...ad,user_id:999}}))).status,403);
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...ad,oculto:false}}))).status,403);
    assert.equal(apiCalls('/rest/v1/anuncios','POST').length,0);
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:ad}))).status,403);
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...ad,rubro:'musica'}}))).status,201);
    const [saved]=apiCalls('/rest/v1/anuncios','POST');
    assert.equal(saved.body.user_id,'701');assert.equal(saved.body.rubro,'musica');assert.equal(saved.body.estado,'activo');
  });
});
test('visitor ad restrictions and neutral Marketplace survive secure transport',async()=>{
  await withBackend({user:{tipo_cuenta:'visitante',rubro:''}},async({apiCalls})=>{
    const base={user_id:701,titulo:'Fixture',descripcion:'Fixture',rubro:'musica'};
    for(const tipo of ['busco','ofrezco','clases'])assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,tipo}}))).status,403);
    for(const tipo of ['jam','vende'])assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,tipo}}))).status,201);
    for(const saved of apiCalls('/rest/v1/anuncios','POST'))assert.equal(saved.body.rubro,saved.body.tipo==='vende'?null:'musica');
  });
});
test('business category stays intact while nonartist ads require a valid target community',async()=>{
  await withBackend({user:{tipo_cuenta:'negocio',rubro:'Sala de ensayo'}},async({apiCalls,profiles})=>{
    const base={user_id:701,titulo:'Clases fixture',descripcion:'Fixture',tipo:'clases'};
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,rubro:'Sala de ensayo'}}))).status,400);
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,rubro:'danza'}}))).status,201);
    assert.equal(apiCalls('/rest/v1/anuncios','POST')[0].body.rubro,'danza');
    assert.equal(profiles.get(701).rubro,'Sala de ensayo');
    assert.equal(profiles.get(701).tipo_cuenta,'negocio');
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,tipo:'vende',rubro:'Sala de ensayo'}}))).status,201);
    assert.equal(apiCalls('/rest/v1/anuncios','POST')[1].body.rubro,null);
  });
});
test('public ad IDOR query cannot reveal hidden ads; own list remains compatible',async()=>{
  await withBackend({},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/anuncios?user_id=eq.999&select=id,oculto'))).status,200);
    assert(apiCalls('/rest/v1/anuncios','GET')[0].url.searchParams.get('and').includes('oculto.eq.false'));
    assert.equal((await datos(request('/rest/v1/anuncios?user_id=eq.701&select=id,oculto'))).status,200);
    assert.equal(apiCalls('/rest/v1/anuncios','GET')[1].url.searchParams.get('and'),null);
  });
});
test('account deletion requires fresh password and sends only verified ID to deletion RPC',async()=>{
  for(const body of [{p_user_id:999,p_password:'correct-fixture'},{p_user_id:701,p_password:'wrong'},
    {p_user_id:701},{p_user_id:701,p_password:'correct-fixture',baneado:false}])await withBackend({},async({apiCalls,state})=>{
      assert((await datos(request('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body}))).status>=400);
      assert.equal(apiCalls('/rest/v1/rpc/eliminar_cuenta').length,0);assert.equal(state.deleted,false);
    });
  await withBackend({},async({apiCalls,state})=>{
    const res=await datos(request('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body:{p_user_id:701,p_password:'correct-fixture'}}));
    assert.equal(res.status,200);assert.equal(state.deleted,true);
    assert.deepEqual(apiCalls('/rest/v1/rpc/eliminar_cuenta')[0].body,{p_user_id:701});
    assert.match(res.headers.get('set-cookie'),/Max-Age=0/);
  });
});
test('legacy long credentials remain valid for login and fresh deletion without writing a new password',async()=>{
  const password='x'.repeat(100);
  await withBackend({acceptedPassword:password},async({apiCalls})=>{
    assert.equal((await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body:{p_email:'owner@example.invalid',p_password:password}}))).status,200);
    assert.equal((await datos(request('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body:{p_user_id:701,p_password:password}}))).status,200);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
});
test('profile save with verified cookie never asks legacy RPC credentials and confirms owner-only PATCH',async()=>{
  await withBackend({},async({apiCalls})=>{
    const verify=await guardarPerfil(request('/unused',{method:'POST',body:{profileId:701,operation:'verify',changes:{}}}));
    assert.equal(verify.status,200);assert.deepEqual(await verify.json(),[{id:701}]);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
    const save=await guardarPerfil(request('/unused',{method:'POST',body:{profileId:701,changes:{generos:'Jazz',edad:26}}}));
    assert.equal(save.status,200);
    const [row]=await save.json();assert.equal(row.id,701);assert.equal(row.generos,'Jazz');assert.equal(row.rubro,'musica');assert.equal(row.edad,26);assert.equal(row.perfil_revision,1);
    assert.equal(apiCalls('/rest/v1/rpc/login_usuario').length,0);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH')[0].url.searchParams.get('id'),'eq.701');
  });
});
test('profile save rejects spoofed owner, missing/revoked cookies, without any PATCH',async()=>{
  for(const [options,settings,status] of [[{},{body:{profileId:999,changes:{generos:'Jazz'}}},403],
    [{},{signed:false,body:{profileId:701,changes:{generos:'Jazz'}}},401],
    [{changedPassword:true},{body:{profileId:701,changes:{generos:'Jazz'}}},401]])await withBackend(options,async({apiCalls})=>{
    assert.equal((await guardarPerfil(request('/unused',{method:'POST',...settings}))).status,status);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
});
test('legacy profile save credential fallback is rate limited and never accepts cache/cookie on bad credentials',async()=>{
  const body={profileId:701,email:'OWNER@example.invalid',password:'correct-fixture',changes:{generos:'Jazz'}};
  await withBackend({},async({apiCalls})=>{
    assert.equal((await guardarPerfil(request('/unused',{method:'POST',signed:false,body}))).status,200);
    assert.equal(apiCalls('/rest/v1/rpc/login_usuario').length,1);
    const rates=apiCalls('/rest/v1/rpc/limitar_operacion_web');
    assert.deepEqual(rates.map(call=>[call.body.p_scope,call.body.p_limit]),[['login_usuario',60],['login_usuario-account',15]]);
  });
  for(const [options,headers,status] of [[{badLogin:true},{},401],
    [{denyScope:'login_usuario-account'},{},429],[{}, {'x-nf-client-connection-ip':''},502]])await withBackend(options,async({apiCalls})=>{
    assert.equal((await guardarPerfil(request('/unused',{method:'POST',body,headers}))).status,status);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
});
test('unauthorized RPCs, private projections, relation embeds and external paths fail closed',async()=>{
  await withBackend({},async({calls})=>{
    for(const path of ['https://evil.example.invalid/rest/v1/perfiles','//evil.example.invalid/rest/v1/perfiles',
      '/rest/v1/rpc/cambiar_password','/rest/v1/rpc/consumir_reset_password',
      '/rest/v1/perfiles?select=reset_token','/rest/v1/mensajes?select=perfiles(email)',
      '/rest/v1/perfiles?or=(password.eq.secret,id.eq.701)','/storage/v1/object/fotos-perfil/701-%2fattack.jpg']) {
      assert((await datos(request(path,{method:path.includes('/rpc/')?'POST':'GET',...(path.includes('/rpc/')?{body:{}}:{})}))).status>=400,path);
    }
    assert(!calls.some(c=>['/rest/v1/rpc/cambiar_password','/rest/v1/rpc/consumir_reset_password'].includes(c.url.pathname)));
    assert(!calls.some(c=>c.url.pathname==='/rest/v1/perfiles'&&c.url.searchParams.get('select')==='reset_token'));
  });
});
test('backend errors return neutral failures, never raw private errors',async()=>{
  await withBackend({backendFailure:true},async()=>{
    const res=await datos(request('/rest/v1/mensajes'));
    assert.equal(res.status,503);
    assert(!(await res.text()).includes('synthetic-private'));
  });
});
test('security test source has no real network transport or credential ingestion',()=>{
  const source=readFileSync(new URL(import.meta.url),'utf8');
  assert(!source.includes('process' + '.env'));
  assert(source.includes('globalThis.fetch=async'));
});

const musicDetails = { instrumento:'Batería, instrumento histórico desconocido',generos:'Indie, género histórico',referentes:'Referencia propia',
  disponibilidad:'Sesiones',donde_ensaya:'Lugar musical',experiencia:7,campos_especificos:{rol:['Percusión'],legacy_extra:['opción fuera de catálogo']} };
const danceDetails = { instrumento:'',generos:'',referentes:'',disponibilidad:'Doy clases',donde_ensaya:'Estudio de danza',experiencia:3,
  campos_especificos:{rol:['Bailarín/a'],disciplina:['Contemporáneo'],nivel:['Avanzado'],estilo:['histórico']} };
const multi = (selected=['musica','danza']) => ({version:1,selected,details:Object.fromEntries(selected.map(key=>[key,structuredClone(key==='musica'?musicDetails:key==='danza'?danceDetails:{...danceDetails,campos_especificos:{rol:['histórico-'+key]}})]))});
const multiUser = (principal='musica',selected=['musica','danza']) => ({...multi(selected).details[principal],rubro:principal,disciplinas:multi(selected),perfil_revision:4});
const saveRequest = (changes,extra={}) => request('/unused',{method:'POST',body:{profileId:701,changes,...extra}});

test('all ten legacy rubros adapt exact independent values without dropping unknown choices or backfilling',()=>{
  for(const rubro of RUBROS) {
    const source={tipo_cuenta:'artista',rubro,...musicDetails,disciplinas:null,perfil_revision:0};
    const adapted=disciplinesFor(source);
    assert.deepEqual(adapted,{version:1,selected:[rubro],details:{[rubro]:musicDetails}});
    assert.equal(source.disciplinas,null);
    assert.deepEqual(disciplinesFor({...source,campos_especificos:JSON.stringify(musicDetails.campos_especificos)}).details[rubro].campos_especificos,musicDetails.campos_especificos);
    assert.equal(projectProfile(source,rubro).rubro_principal,rubro);
  }
  assert.equal(disciplinesFor({tipo_cuenta:'negocio',rubro:'Sala de ensayo',disciplinas:null}),null);
  assert.equal(disciplinesFor({tipo_cuenta:'visitante',rubro:'',disciplinas:null}),null);
});
test('legacy nulls and explicit empty options remain distinct; missing detail keys normalize null only',()=>{
  const normalized=normalizeDisciplines({version:1,selected:['danza'],details:{danza:{instrumento:'',generos:null,campos_especificos:{rol:[]}}}},'danza');
  assert.equal(normalized.details.danza.instrumento,'');assert.equal(normalized.details.danza.generos,null);
  assert.deepEqual(normalized.details.danza.campos_especificos,{rol:[]});
  for(const field of ['referentes','disponibilidad','donde_ensaya','experiencia'])assert.equal(normalized.details.danza[field],null);
});
test('malformed membership, wrong namespaces/types and unsafe/excessive nested data fail closed',()=>{
  const invalid=[null,{}, {version:2,selected:['musica'],details:{musica:{}}},
    {version:1,selected:[],details:{}}, {version:1,selected:['musica','musica'],details:{musica:{}}},
    {version:1,selected:['unknown'],details:{unknown:{}}}, {version:1,selected:['musica'],details:{musica:{},danza:{}}},
    {version:1,selected:['musica'],details:{}}, {version:1,selected:['musica'],details:{musica:{email:'private@example.invalid'}}},
    {version:1,selected:['musica'],details:{musica:{instrumento:[]}}}, {version:1,selected:['musica'],details:{musica:{experiencia:1.5}}},
    {version:1,selected:['musica'],details:{musica:{experiencia:-1}}}, {version:1,selected:['musica'],details:{musica:{campos_especificos:[]}}},
    {version:1,selected:['musica'],details:{musica:{generos:'x'.repeat(2001)}}},
    JSON.parse('{"version":1,"selected":["musica"],"details":{"musica":{"campos_especificos":{"constructor":{"x":1}}}}}')];
  for(const value of invalid)assert.throws(()=>normalizeDisciplines(value,'musica'));
  assert.throws(()=>normalizeDisciplines(multi(),'circo'));
  const oversized=multi([...RUBROS]);for(const key of oversized.selected)oversized.details[key]={...musicDetails,referentes:'é'.repeat(4000),instrumento:'é'.repeat(2000)};
  assert.throws(()=>normalizeDisciplines(oversized,'musica'));
});
test('explicit MD save needs revision/principal and rejects contradictory mirrors or privilege/role fields',async()=>{
  const cases=[[{disciplinas:multi()}, {},400], [{disciplinas:multi(),rubro:'circo'},{expectedRevision:0},400],
    [{disciplinas:multi(),rubro:'musica',generos:'Contradictorio'},{expectedRevision:0},400],
    [{disciplinas:multi(),tipo_cuenta:'negocio'},{expectedRevision:0},403],
    [{disciplinas:multi(),baneado:false},{expectedRevision:0},400]];
  for(const [changes,extra,status] of cases)await withBackend({},async({apiCalls})=>{
    assert.equal((await guardarPerfil(saveRequest(changes,extra))).status,status);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
  for(const tipo_cuenta of ['visitante','negocio'])await withBackend({user:{tipo_cuenta}},async({apiCalls})=>{
    assert.equal((await guardarPerfil(saveRequest({disciplinas:multi()},{expectedRevision:0}))).status,403);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
});
test('add second discipline and switch principal atomically mirrors only its own details',async()=>{
  await withBackend({},async({apiCalls,profiles})=>{
    const first=await guardarPerfil(saveRequest({disciplinas:multi(),rubro:'musica',bio:'Compartida'},{expectedRevision:0}));
    assert.equal(first.status,200);const [saved]=await first.json();assert.equal(saved.perfil_revision,1);
    assert.deepEqual(saved.disciplinas.details.musica,musicDetails);assert.deepEqual(saved.disciplinas.details.danza,danceDetails);
    assert.equal(profiles.get(701).bio,'Compartida');
    const second=await guardarPerfil(saveRequest({disciplinas:multi(),rubro:'danza'},{expectedRevision:1}));
    assert.equal(second.status,200);const [changed]=await second.json();assert.equal(changed.perfil_revision,2);
    for(const key of DETAIL_FIELDS)assert.deepEqual(changed[key],danceDetails[key]);
    assert.equal(changed.rubro,'danza');assert.deepEqual(changed.disciplinas.details.musica,musicDetails);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,2);
    assert.equal(apiCalls('/rest/v1/anuncios','PATCH').length,0,'principal changes must never rewrite historical ads');
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH')[1].url.searchParams.get('perfil_revision'),'eq.1');
  });
});
test('all ten principal changes retain every other namespace; full save confirms authoritative revision',async()=>{
  const data=multi([...RUBROS]);
  await withBackend({user:multiUser('musica',[...RUBROS])},async({profiles})=>{
    let expectedRevision=4;
    for(const principal of RUBROS) {
      const res=await guardarPerfil(saveRequest({disciplinas:data,rubro:principal},{expectedRevision}));
      assert.equal(res.status,200,principal);const [saved]=await res.json();
      assert.equal(saved.rubro,principal);assert.equal(saved.perfil_revision,++expectedRevision);
      assert.deepEqual(saved.disciplinas,data);
      for(const key of DETAIL_FIELDS)assert.deepEqual(saved[key],data.details[principal][key]);
    }
    assert.equal(profiles.get(701).id,701);
  });
});
test('remove discipline cannot leave hidden publicly exposed namespaces; re-add is deliberate empty data',async()=>{
  await withBackend({user:multiUser()},async({profiles})=>{
    const removed=await guardarPerfil(saveRequest({disciplinas:multi(['musica']),rubro:'musica'},{expectedRevision:4}));
    assert.equal(removed.status,200);assert(!Object.hasOwn(profiles.get(701).disciplinas.details,'danza'));
    const data={version:1,selected:['musica','danza'],details:{musica:musicDetails,danza:{}}};
    const added=await guardarPerfil(saveRequest({disciplinas:data,rubro:'musica'},{expectedRevision:5}));
    assert.equal(added.status,200);
    for(const field of DETAIL_FIELDS)assert.equal(profiles.get(701).disciplinas.details.danza[field],null);
  });
});
test('cached old writer merges principal details without erasing secondary; silent principal switch is conflict',async()=>{
  await withBackend({user:multiUser()},async({profiles,apiCalls})=>{
    const res=await guardarPerfil(saveRequest({generos:'Nuevo musical',campos_especificos:{rol:['Percusión'],nuevo:['unknown']}}));
    assert.equal(res.status,200);assert.equal(profiles.get(701).disciplinas.details.musica.generos,'Nuevo musical');
    assert.deepEqual(profiles.get(701).disciplinas.details.danza,danceDetails);
    const switched=await guardarPerfil(saveRequest({rubro:'danza',generos:''}));
    assert.equal(switched.status,409);assert.equal((await switched.json()).code,'PROFILE_CONFLICT');
    assert.equal(profiles.get(701).rubro,'musica');assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,1);
  });
  await withBackend({},async({profiles})=>{
    assert.equal((await guardarPerfil(saveRequest({rubro:'danza',generos:'',campos_especificos:{disciplina:['Salsa']}}))).status,200);
    assert.equal(profiles.get(701).disciplinas,null,'a purely legacy editor does not fabricate namespaces');
  });
});
test('two tabs and read-to-write races return explicit409 without silently overwriting state',async()=>{
  await withBackend({user:multiUser()},async({apiCalls,profiles})=>{
    const changes={disciplinas:multi(),rubro:'danza'};
    assert.equal((await guardarPerfil(saveRequest(changes,{expectedRevision:4}))).status,200);
    const stale=await guardarPerfil(saveRequest({disciplinas:multi(['musica']),rubro:'musica'},{expectedRevision:4}));
    assert.equal(stale.status,409);assert.equal((await stale.json()).code,'PROFILE_CONFLICT');
    assert.equal(profiles.get(701).rubro,'danza');assert.equal(profiles.get(701).perfil_revision,5);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,1);
  });
  await withBackend({conflict:true,user:multiUser()},async({profiles})=>{
    const before=structuredClone(profiles.get(701));const res=await guardarPerfil(saveRequest({bio:'Nuevo'},{expectedRevision:4}));
    assert.equal(res.status,409);assert.deepEqual(profiles.get(701),before);
  });
});
test('missing/unsafe revision never becomes a writable profile',async()=>{
  for(const perfil_revision of [undefined,null,-1,1.5,Number.MAX_SAFE_INTEGER+1])await withBackend({user:{perfil_revision}},async({apiCalls})=>{
    assert.equal((await guardarPerfil(saveRequest({generos:'Jazz'}))).status,400);assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
  for(const expectedRevision of [-1,1.5,'0',Number.MAX_SAFE_INTEGER+1])await withBackend({},async({apiCalls})=>{
    assert.equal((await guardarPerfil(saveRequest({generos:'Jazz'},{expectedRevision}))).status,400);assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
});
test('204 minimal, partial representation and failure after update never falsely confirm a save',async()=>{
  for(const options of [{profileMinimal:true},{profilePartial:true},{profileFailure:true}])await withBackend(options,async()=>{
    const res=await guardarPerfil(saveRequest({generos:'Jazz'},{expectedRevision:0}));assert.equal(res.status,502);
    assert(!(await res.text()).includes('synthetic profile failure'));
  });
});
test('public membership queries include secondary artists once, project contextual data and preserve real principal',async()=>{
  await withBackend({user:multiUser()},async({apiCalls})=>{
    const res=await datos(request('/rest/v1/perfiles?select=id,nombre,rubro,rubro_principal,instrumento,generos,campos_especificos,disciplinas&tipo_cuenta=eq.artista&rubro=eq.danza&order=created_at.desc&limit=20',{signed:false}));
    assert.equal(res.status,200);const rows=await res.json();const own=rows.find(row=>row.id===701);
    assert(own);assert.equal(rows.filter(row=>row.id===701).length,1);assert.equal(own.rubro,'danza');assert.equal(own.rubro_principal,'musica');
    assert.equal(own.instrumento,'');assert.equal(own.generos,'');assert.deepEqual(own.campos_especificos,danceDetails.campos_especificos);
    const query=apiCalls('/rest/v1/perfiles','GET')[0].url.searchParams;
    assert.equal(query.get('rubro'),null);assert(query.get('and').includes('and(disciplinas.is.null,rubro.eq.danza)'));
    assert(query.get('and').includes('disciplinas->selected.cs.["danza"]'));assert(!query.get('select').includes('rubro_principal'));
    assert.equal(query.get('limit'),'20');assert.equal(query.get('order'),'created_at.desc');
  });
});
test('contextual queries never apply a secondary filter to principal mirrors or allow fake affinity context',async()=>{
  await withBackend({user:multiUser()},async({apiCalls})=>{
    const res=await datos(request('/rest/v1/perfiles?select=id,rubro,instrumento&rubro=eq.danza&instrumento=eq.Batería',{signed:false}));
    assert.equal(res.status,200);const params=apiCalls('/rest/v1/perfiles','GET')[0].url.searchParams;
    assert.equal(params.get('instrumento'),null);assert(params.get('and').includes('disciplinas->details->danza->>instrumento.eq.Batería'));
    assert(params.get('and').includes('and(disciplinas.is.null,instrumento.eq.Batería)'));
    assert.throws(()=>projectProfile({...syntheticUser,...multiUser()},'circo'));
    const bad=await datos(request('/rest/v1/perfiles?select=id&rubro=eq.danza&or=(generos.ilike.*Indie*,instrumento.ilike.*Batería*)',{signed:false}));
    assert.equal(bad.status,400,'unimplemented nested contextual detail predicates must fail closed');
  });
});
test('principal public reads, private email projection and verified session MD cache stay compatible',async()=>{
  await withBackend({user:multiUser('danza')},async()=>{
    const principal=await datos(request('/rest/v1/perfiles?select=id,rubro,rubro_principal,generos,disciplinas,perfil_revision&id=eq.701',{signed:false}));
    const [row]=await principal.json();assert.equal(row.rubro,'danza');assert.equal(row.rubro_principal,'danza');assert.equal(row.generos,'');
    const session=await sesion(sessionRequest());const {user}=await session.json();assert.deepEqual(user.disciplinas,multi());assert.equal(user.perfil_revision,4);
    assert(!Object.hasOwn(user,'password'));assert(!Object.hasOwn(user,'password_fingerprint'));
    const login=await datos(request('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body:{p_email:'owner@example.invalid',p_password:'correct-fixture'}}));
    const identity=await login.json();assert.deepEqual(identity.disciplinas,multi());assert.equal(identity.perfil_revision,4);
  });
});
test('business and visitor saves retain categories/roles/NULL MD and never become artists',async()=>{
  for(const [tipo_cuenta,rubro] of [['negocio','Sala de ensayo'],['visitante','']])await withBackend({user:{tipo_cuenta,rubro}},async({profiles})=>{
    assert.equal((await guardarPerfil(saveRequest({bio:'Información compartida'},{expectedRevision:0}))).status,200);
    assert.equal(profiles.get(701).tipo_cuenta,tipo_cuenta);assert.equal(profiles.get(701).rubro,rubro);assert.equal(profiles.get(701).disciplinas,null);
    const publicResult=await datos(request('/rest/v1/perfiles?select=id&rubro=eq.musica',{signed:false}));
    assert(!(await publicResult.json()).some(row=>row.id===701));
  });
});
test('artist ads select any own discipline for Ofrezco/Clases/Evento/Busco, foreign is rejected, marketplace transversal',async()=>{
  await withBackend({user:multiUser()},async({apiCalls,profiles})=>{
    const base={user_id:701,titulo:'Fixture MD',descripcion:'Contenido',rubro:'danza'};
    for(const tipo of ['ofrezco','clases','jam','busco'])assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,tipo,...(tipo==='busco'?{rubro_buscado:'circo'}:{})}}))).status,201,tipo);
    assert(apiCalls('/rest/v1/anuncios','POST').every(call=>call.body.rubro==='danza'));
    assert.equal(apiCalls('/rest/v1/anuncios','POST')[3].body.rubro_buscado,'circo');
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,tipo:'ofrezco',rubro:'circo'}}))).status,403);
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,tipo:'vende',rubro:'circo',categoria_producto:'Instrumentos'}}))).status,201);
    assert.equal(apiCalls('/rest/v1/anuncios','POST')[4].body.rubro,null);
    assert.equal(profiles.get(701).rubro,'musica');assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
  });
});
test('ad audit rejects malformed scalars/prices/date/JSON/photos and accepts real uploader paths',async()=>{
  const base={user_id:701,tipo:'jam',titulo:'Fixture',descripcion:'Contenido',rubro:'musica'};
  const invalid=[{descripcion:{}},{generos:[]},{precio_num:-1},{precio_num:'100'},{precio_num:1e13},
    {fecha_evento:'not-a-date'},{fecha_evento:'2026-10-20'},{campos_especificos:[]},
    {foto_url:sb+'/storage/v1/object/public/fotos-anuncios/999-abc.jpg'},
    {foto_url:sb+'/storage/v1/object/public/fotos-anuncios/701-abc.svg'},
    {foto_url:sb+'/storage/v1/object/public/fotos-anuncios/701-abc.jpg?private=1'},
    {foto_url:'https://evil.example.invalid/701-photo.jpg'},{rubro_buscado:'unknown'}, {vistas:999}];
  for(const patch of invalid)await withBackend({},async({apiCalls})=>{
    assert((await datos(request('/rest/v1/anuncios',{method:'POST',body:{...base,...patch}}))).status>=400);
    assert.equal(apiCalls('/rest/v1/anuncios','POST').length,0);
  });
  await withBackend({},async({apiCalls})=>{
    const data={...base,fecha_evento:'2026-10-20T19:00:00.000Z',precio_num:0,campos_especificos:{nuevo:['unknown']},foto_url:sb+'/storage/v1/object/public/fotos-anuncios/701-1791910800000-jam-abc-123.webp'};
    assert.equal((await datos(request('/rest/v1/anuncios',{method:'POST',body:data}))).status,201);
    assert.equal(apiCalls('/rest/v1/anuncios','POST')[0].body.foto_url,data.foto_url);
  });
});
test('every ad management action uses verified owner, rejects spoofs and never edits profile disciplines',async()=>{
  await withBackend({user:multiUser()},async({apiCalls})=>{
    for(const p_accion of ['pausar','reactivar','republicar','eliminar'])assert.equal((await datos(request('/rest/v1/rpc/gestionar_anuncio',{method:'POST',body:{p_anuncio_id:91,p_user_id:701,p_accion}}))).status,200);
    assert.equal((await datos(request('/rest/v1/rpc/gestionar_anuncio',{method:'POST',body:{p_anuncio_id:91,p_user_id:999,p_accion:'eliminar'}}))).status,403);
    assert.equal((await datos(request('/rest/v1/rpc/gestionar_anuncio',{method:'POST',body:{p_anuncio_id:91,p_user_id:701,p_accion:'arbitrary'}}))).status,403);
    assert.equal(apiCalls('/rest/v1/perfiles','PATCH').length,0);
    assert(apiCalls('/rest/v1/rpc/gestionar_anuncio').every(call=>call.body.p_user_id==='701'));
  });
});
