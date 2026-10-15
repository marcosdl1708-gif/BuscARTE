import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Real ESM handlers/session helpers; the sole transport is a fail-closed
// synthetic boundary. No account, image, credential, email or real DB is used.
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network denied during import');};
const {default:condiciones,config}=await import('../netlify/functions/condiciones.mjs');
const {default:datos}=await import('../netlify/functions/datos.mjs');
const {default:guardarPerfil}=await import('../netlify/functions/guardar-perfil.mts');
const {default:moderacion}=await import('../netlify/functions/moderacion.mjs');
const {mailService}=await import('../netlify/lib/mail-runtime.mjs');
globalThis.fetch=originalFetch;
const web='https://buscarte.com.ar',sb='https://xiaanchoanxmampegoay.supabase.co';
const key='sb_secret_terms_synthetic_fixture_not_a_real_credential';
const token=Buffer.alloc(32,27).toString('base64url'),cookie='__Host-ba_session='+token;
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const version='2026-10-15',password='synthetic-password-hash',receipt='6cf106b0-c2c0-4846-9494-31e4597d4ef4';
const actor={id:701,nombre:'Actor sintético',email:'owner@example.invalid',password,tipo_cuenta:'artista',rubro:'musica',
  baneado:false,disciplinas:null,perfil_revision:0,bio:'Original',instrumento:'Guitarra',generos:'',referentes:'',disponibilidad:'',donde_ensaya:'',experiencia:0,campos_especificos:{},edad:null};
const reply=(value,status=200)=>new Response(value===undefined?null:JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function request(endpoint='condiciones',{method='GET',body,rawBody,query='',signed=true,headers={},bytes}={}) {
  const content=bytes??rawBody??(body===undefined?undefined:JSON.stringify(body));
  return new Request(web+'/.netlify/functions/'+endpoint+query,{method,
    headers:{origin:web,'sec-fetch-site':'same-origin','x-nf-client-connection-ip':'192.0.2.27',...(signed?{cookie}:{}),
      ...(content===undefined?{}:{'content-type':'application/json'}),...headers},...(content===undefined?{}:{body:content})});
}
const accept=patch=>request('condiciones',{method:'POST',body:{action:'accept',version,accepted:true,...patch}});
const data=(path,options={})=>request('datos',{...options,query:'?path='+encodeURIComponent(path)});
const signup=patch=>({p_email:'NEW@example.invalid',p_password:'synthetic-fixture-password',p_nombre:'Persona nueva',p_provincia:'Buenos Aires',
  p_ciudad:'La Plata',p_barrio:'',p_instrumento:'',p_generos:'',p_disponibilidad:'',p_referentes:'',p_bio:'',p_tipo_cuenta:'artista',p_rubro:'musica',
  p_campos_especificos:{},captcha_token:'synthetic-captcha',terms_accepted:true,terms_version:version,...patch});

async function fixture(options={},run) {
  const beforeFetch=globalThis.fetch,beforeNetlify=globalThis.Netlify,beforeMail={enqueue:mailService.enqueue,dispatch:mailService.dispatch,savePreferences:mailService.savePreferences};
  const calls=[],unexpected=[],notifications=[];let accepted=options.accepted??false,deleted=false,registered=false;
  const env={SUPABASE_URL:sb,SUPABASE_SERVICE_ROLE_KEY:key,HCAPTCHA_SECRET:'synthetic-hcaptcha-secret',ADMIN_EMAIL:'admin@example.invalid'};
  const api=(name,method)=>calls.filter(call=>call.path===name&&(!method||call.method===method));
  globalThis.Netlify={env:{get:name=>env[name]||''}};
  mailService.enqueue=async value=>{notifications.push(value);return {id:'synthetic-mail-job'};};
  mailService.dispatch=async()=>({status:'sent',id:'synthetic-provider-id'});
  mailService.savePreferences=async()=>({marketing_opt_in:true,onboarding_disabled:false});
  globalThis.fetch=async(href,init={})=>{
    const url=new URL(href),method=init.method||'GET',headers=new Headers(init.headers||{});
    const body=typeof init.body==='string'&&/^[\[{]/.test(init.body)?JSON.parse(init.body):init.body;
    calls.push({path:url.pathname,url,method,body,headers});
    if(url.href==='https://api.hcaptcha.com/siteverify') {
      assert.equal(method,'POST');assert.equal(new URLSearchParams(init.body).get('response'),'synthetic-captcha');
      return reply({success:options.captchaValid!==false,hostname:'buscarte.com.ar'});
    }
    if(url.origin!==sb){unexpected.push(url.href);throw new Error('Native transport unavailable');}
    assert.equal(headers.get('apikey'),key);assert.equal(headers.get('authorization'),null);assert.equal(init.redirect,'error');
    if(url.pathname==='/rest/v1/sesiones_web') {
      if(method==='POST'){assert(registered||options.loginStarts);return reply(undefined,201);}
      assert.equal(method,'GET');
      return reply(options.invalidSession||url.searchParams.get('token_hash')!=='eq.'+hash(token)?[]:[{perfil_id:701,password_fingerprint:hash(password)}]);
    }
    if(url.pathname==='/rest/v1/perfiles') {
      if(method==='PATCH')return options.triggerTerms?reply({code:'42501',message:'TERMS_REQUIRED',details:'private trigger'},403):reply([{...actor,...body}]);
      const selected=url.searchParams.get('id');
      if(selected==='eq.701')return reply(deleted?[]:[{...actor,baneado:!!options.banned}]);
      if(selected==='eq.702')return reply([{id:702,nombre:'Otra persona',email:'other@example.invalid',baneado:false}]);
      if(selected==='eq.703')return reply([{...actor,id:703,nombre:'Persona nueva',email:'new@example.invalid'}]);
      return reply([]);
    }
    if(url.pathname==='/rest/v1/rpc/limitar_operacion_web')return reply(!options.denyRate);
    if(url.pathname==='/rest/v1/rpc/estado_terminos_web') {
      assert.deepEqual(body,{p_actor_id:'701'});
      if(options.termsFails)return reply({details:'private synthetic terms failure'},500);
      return reply(Object.hasOwn(options,'termsResult')?options.termsResult:{version,accepted});
    }
    if(url.pathname==='/rest/v1/rpc/aceptar_terminos_web') {
      assert.deepEqual(body,{p_actor_id:'701',p_version:version});
      if(options.acceptFails)return reply({details:'private synthetic acceptance failure'},500);
      accepted=true;
      return reply(Object.hasOwn(options,'acceptResult')?options.acceptResult:{version,accepted:true});
    }
    if(url.pathname==='/rest/v1/rpc/login_usuario') {
      assert.deepEqual(body,{p_email:'owner@example.invalid',p_password:'correct-synthetic-password'});
      return reply(options.wrongPassword?{error:'invalid_credentials'}:{id:701,nombre:actor.nombre,email:actor.email});
    }
    if(url.pathname==='/rest/v1/rpc/registrar_usuario_con_terminos_web') {
      assert.equal(body.p_version,version);
      assert.deepEqual(Object.keys(body).sort(),['p_registro','p_version']);
      assert.equal(Object.keys(body.p_registro).length,14);
      assert(!Object.keys(body.p_registro).some(name=>/terms|captcha|marketing|actor|baneado/.test(name)));
      assert.equal(body.p_registro.p_email,'new@example.invalid');
      if(options.signupFails)return reply({details:'private synthetic registration failure'},500);
      registered=true;return reply({id:703,nombre:'Persona nueva',email:'new@example.invalid'});
    }
    if(url.pathname==='/rest/v1/rpc/solicitar_eliminacion_web') {
      assert.deepEqual(body,{p_actor_id:'701'});
      if(options.deleteFails)return reply({details:'private synthetic deletion failure'},500);
      if(Object.hasOwn(options,'deleteResult'))return reply(options.deleteResult);
      deleted=true;return reply({ok:true,job_id:receipt,storage_pending:true});
    }
    if(url.pathname==='/rest/v1/rpc/estado_bloqueo_web'||url.pathname==='/rest/v1/rpc/gestionar_bloqueo_web')return reply({blocked_by_me:url.pathname.endsWith('gestionar_bloqueo_web')&&body.p_bloquear,restricted:url.pathname.endsWith('gestionar_bloqueo_web')&&body.p_bloquear});
    if(url.pathname==='/rest/v1/rpc/reportar_usuario_web')return reply({ok:true,id:9201});
    if(url.pathname==='/rest/v1/rpc/gestionar_anuncio')return reply([{id:91,user_id:701,estado:'pausado'}]);
    if(['/rest/v1/mensajes','/rest/v1/conversaciones','/rest/v1/anuncios','/rest/v1/reacciones','/rest/v1/artistas_sugeridos','/rest/v1/perfiles_guardados'].includes(url.pathname)) {
      if(options.triggerTerms && !['GET','HEAD','DELETE'].includes(method))return reply({code:'42501',message:'TERMS_REQUIRED',details:'private trigger'},403);
      return reply(method==='GET'||method==='DELETE'?[]:[{...body,id:8101}],method==='POST'?201:200);
    }
    if(url.pathname.startsWith('/storage/')){unexpected.push(url.pathname);throw new Error('Storage must not run in these blocked/deletion cases');}
    unexpected.push(url.pathname);throw new Error('Unexpected backend operation, no native fallthrough');
  };
  try {await run({calls,api,notifications,wasDeleted:()=>deleted,wasRegistered:()=>registered});assert.deepEqual(unexpected,[]);}
  finally {globalThis.fetch=beforeFetch;if(beforeNetlify===undefined)delete globalThis.Netlify;else globalThis.Netlify=beforeNetlify;Object.assign(mailService,beforeMail);}
}

test('terms endpoint exposes only verified current-version state with no-store headers',async()=>{
  assert.equal(config.path,'/.netlify/functions/condiciones');assert.equal(config.rateLimit.action,'rate_limit');
  await fixture({},async()=>{
    const result=await condiciones(request());assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
    assert.deepEqual(await result.json(),{version,accepted:false});
  });
});
test('missing, forged, banned and invalidated sessions cannot read or accept terms',async()=>{
  for(const options of [{},{invalidSession:true},{banned:true}])await fixture(options,async({api})=>{
    const headers=Object.keys(options).length?{}:{cookie:'__Host-ba_session=701'};
    for(const value of [request('condiciones',{headers}),request('condiciones',{method:'POST',body:{action:'accept',version,accepted:true},headers})])assert.equal((await condiciones(value)).status,401);
    assert.equal(api('/rest/v1/rpc/aceptar_terminos_web').length,0);assert.equal(api('/rest/v1/rpc/estado_terminos_web').length,0);
  });
});
test('accept requires exact action, current version, literal true and no client actor fields',async()=>{
  await fixture({},async({api})=>{
    for(const patch of [{accepted:false},{accepted:'true'},{accepted:1},{accepted:[true]},{version:'2026-08-28'},{version:[version]},
      {action:'agree'},{actor_id:999},{p_actor_id:999},{user_id:999},{email:'someone@example.invalid'}])assert.equal((await condiciones(accept(patch))).status,400,JSON.stringify(patch));
    assert.equal(api('/rest/v1/rpc/aceptar_terminos_web').length,0);
    const result=await condiciones(accept());assert.equal(result.status,200);assert.deepEqual(await result.json(),{version,accepted:true});
  });
});
test('terms POST rejects CSRF and all endpoint queries/methods before backend access',async()=>{
  await fixture({},async({calls})=>{
    for(const headers of [{origin:''},{origin:'https://evil.example.invalid'},{origin:'https://www.buscarte.com.ar'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':'cross-site'}])assert.equal((await condiciones(request('condiciones',{method:'POST',body:{action:'accept',version,accepted:true},headers}))).status,403);
    for(const method of ['PATCH','PUT','DELETE','OPTIONS','HEAD'])assert.equal((await condiciones(request('condiciones',{method}))).status,405);
    for(const method of ['GET','POST'])assert.equal((await condiciones(request('condiciones',{method,query:'?actor_id=999',...(method==='POST'?{body:{action:'accept',version,accepted:true}}:{})}))).status,400);
    assert.equal(calls.length,0);
  });
});
test('invalid JSON, non-objects and oversized acceptance bodies never become a recorded consent',async()=>{
  await fixture({},async({api})=>{
    for(const rawBody of ['{bad','null','[]','{}','{"action":"accept","version":"2026-10-15","accepted":true,"constructor":{}}',' '.repeat(2049)+'{}'])assert.equal((await condiciones(request('condiciones',{method:'POST',rawBody}))).status,400);
    assert.equal(api('/rest/v1/rpc/aceptar_terminos_web').length,0);
  });
});
test('malformed or unavailable terms state/acceptance never certifies success or leaks raw errors',async()=>{
  for(const termsResult of [null,[],true,{}, {version,accepted:'true'}, {version:'old',accepted:true}])await fixture({termsResult},async()=>{
    const result=await condiciones(request());assert.equal(result.status,503);assert.equal((await result.json()).code,'TERMS_UNAVAILABLE');
  });
  for(const acceptResult of [null,[],{}, {version,accepted:false}, {version:'old',accepted:true}])await fixture({acceptResult},async()=>assert.equal((await condiciones(accept())).status,503));
  for(const options of [{termsFails:true},{acceptFails:true}])await fixture(options,async()=>{
    const result=await condiciones(options.acceptFails?accept():request());assert.equal(result.status,503);assert(!(await result.text()).includes('private synthetic'));
  });
});
test('terms rate denial cannot reach acceptance or state RPC',async()=>{
  await fixture({denyRate:true},async({api})=>{
    assert.equal((await condiciones(request())).status,429);assert.equal((await condiciones(accept())).status,429);
    assert.equal(api('/rest/v1/rpc/aceptar_terminos_web').length,0);assert.equal(api('/rest/v1/rpc/estado_terminos_web').length,0);
  });
});

const ugcRequests=()=>[
  data('/rest/v1/mensajes',{method:'POST',body:{de_user_id:701,para_user_id:702,contenido:'Fixture'}}),
  data('/rest/v1/conversaciones',{method:'POST',body:{user1_id:701,user2_id:702}}),
  data('/rest/v1/anuncios',{method:'POST',body:{user_id:701,tipo:'ofrezco',titulo:'Fixture',descripcion:'Texto',rubro:'musica'}}),
  data('/rest/v1/reacciones',{method:'POST',body:{user_id:701,anuncio_id:91,tipo:'like'}}),
  data('/rest/v1/artistas_sugeridos',{method:'POST',body:{nombre:'Nombre fixture',veces:1}}),
  data('/rest/v1/rpc/gestionar_anuncio',{method:'POST',body:{p_anuncio_id:91,p_user_id:701,p_accion:'reactivar'}}),
  request('guardar-perfil',{method:'POST',body:{profileId:701,changes:{bio:'Nueva bio'},expectedRevision:0}}),
  data('/storage/v1/object/fotos-perfil/701-1000000000000.jpg',{method:'POST',bytes:Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0]),headers:{'content-type':'image/jpeg'}})
];
test('all content creation/upload paths reject unaccepted terms with 428 before any content write',async()=>{
  await fixture({},async({calls})=>{
    for(const [index,value] of ugcRequests().entries()) {
      const result=await (index===6?guardarPerfil(value):datos(value));assert.equal(result.status,428,'UGC #'+index);
      assert.equal((await result.json()).code,'TERMS_REQUIRED');
    }
    assert(!calls.some(call=>['POST','PATCH'].includes(call.method)&&/^\/rest\/v1\/(mensajes|conversaciones|anuncios|reacciones|artistas_sugeridos|perfiles)$/.test(call.path)));
    assert(!calls.some(call=>call.path.startsWith('/storage/')));
  });
});
test('terms outage/malformed state fails closed on UGC writes without discarding drafts server-side',async()=>{
  for(const options of [{termsFails:true},{termsResult:{version,accepted:null}}])await fixture(options,async({api})=>{
    for(const value of [ugcRequests()[0],ugcRequests()[2]]) {
      const result=await datos(value);assert.equal(result.status,503);assert.equal((await result.json()).code,'TERMS_UNAVAILABLE');
    }
    assert.equal(api('/rest/v1/mensajes','POST').length,0);assert.equal(api('/rest/v1/anuncios','POST').length,0);
  });
});
test('accepted terms permit content creation and profile updates without rewriting the consent record',async()=>{
  await fixture({accepted:true},async({api})=>{
    const content=await datos(ugcRequests()[2]);assert.equal(content.status,201);
    const result=await guardarPerfil(ugcRequests()[6]);assert.equal(result.status,200);assert.equal((await result.json())[0].bio,'Nueva bio');
    assert.equal(api('/rest/v1/rpc/aceptar_terminos_web').length,0);
  });
});
test('a DB trigger denial after successful acceptance preflight maps back to explicit 428 across UGC paths',async()=>{
  await fixture({accepted:true,triggerTerms:true},async({notifications})=>{
    for(const index of [0,1,2,4,6]) {
      const value=ugcRequests()[index],result=await(index===6?guardarPerfil(value):datos(value));
      assert.equal(result.status,428,'late rejection #'+index);const body=await result.json();assert.equal(body.code,'TERMS_REQUIRED');assert(!JSON.stringify(body).includes('private trigger'));
    }
    assert.equal(notifications.length,0);
  });
});
test('legacy credential editor fallback cannot bypass terms but verify-only remains harmless',async()=>{
  await fixture({},async({api})=>{
    const credentials={email:'owner@example.invalid',password:'correct-synthetic-password',profileId:701};
    const result=await guardarPerfil(request('guardar-perfil',{method:'POST',body:{...credentials,changes:{bio:'Legacy write'}}}));
    assert.equal(result.status,428);assert.equal(api('/rest/v1/perfiles','PATCH').length,0);
    assert.equal((await guardarPerfil(request('guardar-perfil',{method:'POST',body:{...credentials,changes:{},operation:'verify'}}))).status,200);
  });
});
test('read-only own history/profile verification, private removal and pausing ads do not demand new terms',async()=>{
  await fixture({termsFails:true},async({api})=>{
    for(const path of ['/rest/v1/mensajes?select=id,contenido','/rest/v1/conversaciones?select=id,ultimo_mensaje','/rest/v1/perfiles?select=id,nombre'])assert.equal((await datos(data(path))).status,200);
    assert.equal((await guardarPerfil(request('guardar-perfil',{method:'POST',body:{profileId:701,changes:{},operation:'verify'}}))).status,200);
    for(const p_accion of ['pausar','eliminar'])assert.equal((await datos(data('/rest/v1/rpc/gestionar_anuncio',{method:'POST',body:{p_user_id:701,p_anuncio_id:91,p_accion}}))).status,200);
    assert.equal((await datos(data('/rest/v1/reacciones?anuncio_id=eq.91',{method:'DELETE'}))).status,200);
    assert.equal(api('/rest/v1/rpc/estado_terminos_web').length,0);
  });
});
test('safety reports and blocking remain available even when terms are unaccepted or their store is down',async()=>{
  await fixture({termsFails:true},async({api})=>{
    const block=request('moderacion',{method:'POST',body:{action:'block',perfil_id:702}});
    const report=request('moderacion',{method:'POST',body:{action:'report',perfil_id:702,reason:'seguridad_infantil',detail:'Fixture',request_id:receipt}});
    assert.equal((await moderacion(block)).status,200);assert.equal((await moderacion(report)).status,200);
    assert.equal(api('/rest/v1/rpc/estado_terminos_web').length,0);
  });
});
test('signup rejects missing/old/nonliteral acceptance before captcha or any registration RPC',async()=>{
  await fixture({},async({api,calls,notifications})=>{
    for(const patch of [{terms_accepted:undefined},{terms_accepted:false},{terms_accepted:'true'},{terms_accepted:1},{terms_version:undefined},{terms_version:'old'},{terms_version:[version]}]) {
      const result=await datos(data('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:signup(patch)}));assert.equal(result.status,428);assert.equal((await result.json()).code,'TERMS_REQUIRED');
    }
    assert(!calls.some(call=>call.url.origin==='https://api.hcaptcha.com'));
    assert.equal(api('/rest/v1/rpc/registrar_usuario_con_terminos_web').length,0);assert.equal(api('/rest/v1/rpc/registrar_usuario').length,0);assert.equal(notifications.length,0);
  });
});
test('successful signup uses only atomic terms wrapper with 14 legacy fields after captcha and then issues secure session',async()=>{
  await fixture({},async({calls,api,wasRegistered,notifications})=>{
    const result=await datos(data('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:signup()}));
    assert.equal(result.status,200);assert.equal((await result.json()).id,703);assert(wasRegistered());
    assert.match(result.headers.get('set-cookie'),/__Host-ba_session=.*HttpOnly/);
    assert.equal(api('/rest/v1/rpc/registrar_usuario').length,0);
    assert(calls.findIndex(call=>call.url.origin==='https://api.hcaptcha.com')<calls.findIndex(call=>call.path==='/rest/v1/rpc/registrar_usuario_con_terminos_web'));
    assert.equal(notifications.length,1);
  });
});
test('forged actor/privilege fields and invalid captcha cannot reach atomic registration',async()=>{
  for(const options of [{captchaValid:false},{}])await fixture(options,async({api})=>{
    const result=await datos(data('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:signup(options.captchaValid===false?{}:{p_actor_id:999})}));
    assert(result.status>=400);assert.equal(api('/rest/v1/rpc/registrar_usuario_con_terminos_web').length,0);
  });
});
test('login remains available without accepting new terms or touching acceptance state',async()=>{
  await fixture({termsFails:true,loginStarts:true},async({api})=>{
    const result=await datos(data('/rest/v1/rpc/login_usuario',{method:'POST',signed:false,body:{p_email:'OWNER@example.invalid',p_password:'correct-synthetic-password'}}));
    assert.equal(result.status,200);assert.equal(api('/rest/v1/rpc/estado_terminos_web').length,0);assert.equal(api('/rest/v1/rpc/aceptar_terminos_web').length,0);
  });
});
test('deletion always revalidates password and uses only atomic server actor deletion with durable cleanup receipt',async()=>{
  await fixture({termsFails:true},async({api,calls,wasDeleted})=>{
    const result=await datos(data('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body:{p_user_id:701,p_password:'correct-synthetic-password'}}));
    assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true,storage_pending:true});assert(wasDeleted());
    assert.match(result.headers.get('set-cookie'),/Max-Age=0; Secure; HttpOnly/);
    assert.equal(api('/rest/v1/rpc/eliminar_cuenta').length,0);assert.equal(api('/rest/v1/rpc/solicitar_eliminacion_web').length,1);
    assert.equal(api('/rest/v1/sesiones_web','DELETE').length,0);
    assert.equal(api('/rest/v1/rpc/estado_terminos_web').length,0);
    assert(!calls.some(call=>call.path.startsWith('/storage/')),'account request does not directly remove Storage before DB commit');
    assert(calls.findIndex(call=>call.path==='/rest/v1/rpc/login_usuario')<calls.findIndex(call=>call.path==='/rest/v1/rpc/solicitar_eliminacion_web'));
  });
});
test('wrong password, forged account and CSRF cannot request account deletion',async()=>{
  await fixture({wrongPassword:true},async({api})=>{
    assert.equal((await datos(data('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body:{p_user_id:701,p_password:'correct-synthetic-password'}}))).status,401);
    assert.equal(api('/rest/v1/rpc/solicitar_eliminacion_web').length,0);
  });
  await fixture({},async({api})=>{
    for(const options of [{body:{p_user_id:999,p_password:'correct-synthetic-password'}},{body:{p_user_id:701,p_password:'correct-synthetic-password',p_actor_id:999}},
      {body:{p_user_id:701,p_password:'correct-synthetic-password'},headers:{origin:'https://evil.example.invalid'}}])assert.equal((await datos(data('/rest/v1/rpc/eliminar_cuenta',{method:'POST',...options}))).status,403);
    assert.equal(api('/rest/v1/rpc/solicitar_eliminacion_web').length,0);
  });
});
test('malformed/unconfirmed deletion receipts never claim success or clear the session cookie',async()=>{
  for(const deleteResult of [null,[],{}, {ok:true},{ok:true,storage_pending:false,job_id:receipt},{ok:true,storage_pending:true,job_id:'unsafe'},
    {ok:false,storage_pending:true,job_id:receipt}])await fixture({deleteResult},async()=>{
    const result=await datos(data('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body:{p_user_id:701,p_password:'correct-synthetic-password'}}));
    assert.equal(result.status,502);assert.equal(result.headers.get('set-cookie'),null);
  });
});
test('registration/deletion RPC outages never fall back to old writes or expose private backend errors',async()=>{
  await fixture({signupFails:true},async({api,notifications})=>{
    const result=await datos(data('/rest/v1/rpc/registrar_usuario',{method:'POST',signed:false,body:signup()}));
    assert.equal(result.status,503);assert(!(await result.text()).includes('private synthetic'));
    assert.equal(api('/rest/v1/rpc/registrar_usuario').length,0);assert.equal(api('/rest/v1/sesiones_web','POST').length,0);assert.equal(notifications.length,0);
  });
  await fixture({deleteFails:true},async({api})=>{
    const result=await datos(data('/rest/v1/rpc/eliminar_cuenta',{method:'POST',body:{p_user_id:701,p_password:'correct-synthetic-password'}}));
    assert.equal(result.status,503);assert(!(await result.text()).includes('private synthetic'));assert.equal(result.headers.get('set-cookie'),null);
    assert.equal(api('/rest/v1/rpc/eliminar_cuenta').length,0);
  });
});
test('terms and deletion privileged RPCs are never exposed through arbitrary gateway routes',async()=>{
  await fixture({},async({api})=>{
    for(const name of ['aceptar_terminos_web','estado_terminos_web','registrar_usuario_con_terminos_web','solicitar_eliminacion_web','claim_eliminacion_web','finalizar_eliminacion_web']) {
      assert.equal((await datos(data('/rest/v1/rpc/'+name,{method:'POST',body:{p_actor_id:999}}))).status,403);
      assert.equal(api('/rest/v1/rpc/'+name).length,0);
    }
  });
});
test('new test cannot ingest production credentials or perform native network operations',()=>{
  const source=readFileSync(new URL(import.meta.url),'utf8');assert(!source.includes('process'+'.env'));assert(source.includes('globalThis.fetch=async'));assert(source.includes('@example.invalid'));
});
