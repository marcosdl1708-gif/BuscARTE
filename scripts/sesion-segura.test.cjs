/* Security transport contract: in-memory fetch only. No server, credentials or live writes. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root,'assets/js/sesion-segura.js'),'utf8');
const database = 'https://xiaanchoanxmampegoay.supabase.co';
const demoUser = {id:210,nombre:'Persona sintética',email:'qa@example.invalid',tipo_cuenta:'artista',rubro:'danza',referentes:'',generos:''};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const absent = () => json({error:'Ingresá para continuar.',code:'SESSION_REQUIRED'},401);
function fixture({user=demoUser,stored={},pathname='/index.html',fetch,storageDenied=false,draft=false,revision=0,withoutTimeout=false}={}) {
  const values = new Map(Object.entries(stored)), calls=[], elements=new Map(), listeners=new Map();
  const navigation={reload:0,replace:[]};
  function element(tag='div') {
    return {tagName:tag.toUpperCase(),style:{},children:[],classList:{contains:n=>n==='visible'&&draft},setAttribute(){},
      append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=[...nodes];},remove(){elements.delete(this.id);}};
  }
  const body=element('body'); body.prepend=node=>{elements.set(node.id,node);body.children.unshift(node);};
  if(draft) elements.set('save-bar',element());
  const document={body,readyState:'complete',getElementById:id=>elements.get(id)||null,createElement:element,createTextNode:text=>({textContent:text}),addEventListener:(name,fn)=>listeners.set('document:'+name,fn)};
  const location={pathname,search:'',hash:'',href:'http://127.0.0.1:4199'+pathname,origin:'http://127.0.0.1:4199',replace:value=>navigation.replace.push(value),reload:()=>navigation.reload++};
  let endpointUser=user;
  const native=async(input,options={})=>{
    const url=input instanceof Request?input.url:String(input);
    calls.push({url,options});
    if(fetch) return fetch(url,options,calls);
    if(url==='/.netlify/functions/sesion') return endpointUser?json({user:endpointUser}):absent();
    return json([]);
  };
  const storage={getItem:key=>{if(storageDenied)throw Error('disabled');return values.get(key)||null;},setItem:(key,value)=>{if(storageDenied)throw Error('disabled');values.set(key,String(value));},removeItem:key=>{if(storageDenied)throw Error('disabled');values.delete(key);}};
  const context=vm.createContext({document,location,localStorage:storage,fetch:native,URL,URLSearchParams,Request,Response,Headers,Blob,AbortSignal:withoutTimeout?{}:AbortSignal,AbortController,Event,setTimeout,clearTimeout,
    CustomEvent:class extends Event {constructor(name,options){super(name);this.detail=options?.detail;}},profileEditRevision:revision,
    addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event),console});
  context.window=context;
  vm.runInContext(script,context);
  return {context,values,calls,elements,navigation,listeners,location,setUser:value=>{endpointUser=value;}};
}
function cached(user=demoUser) {return {ba_logged:'1',ba_user_id:String(user.id),ba_name:'Nombre viejo',ba_email:'old@example.invalid',ba_tipo_cuenta:user.tipo_cuenta,ba_rubro:user.rubro};}

test('shared security script is synchronous first script on every public HTML; every logout uses server helper',()=>{
  const files=JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'));
  assert.ok(files.includes('assets/js/sesion-segura.js'));
  const pages=files.filter(file=>file.endsWith('.html'));assert.equal(pages.length,19);
  for(const file of pages){const html=fs.readFileSync(path.join(root,file),'utf8');
    const first=/<script\b([^>]*)>/i.exec(html);assert.match(first[1],/src="\/assets\/js\/sesion-segura\.js"/);assert.doesNotMatch(first[1],/\b(?:async|defer)\b/);
    for(const match of html.matchAll(/function (?:logout|mbnLogout)\(\)\s*\{([^}]*)\}/g)) assert.match(match[1],/return window\.BuscARTESesion\.logout\(\);/);
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/\bsrc\s*=|ld\+json/.test(match[1]))new vm.Script(match[2],{filename:file});
  }
  assert.match(fs.readFileSync(path.join(root,'sw.js'),'utf8'),/\/assets\/js\/sesion-segura\.js/);
});
test('verified server identity refreshes presentation cache without changing an already-correct account',async()=>{
  const f=fixture({stored:cached()});await f.context.BuscARTESesion.ready;
  assert.equal(f.context.BuscARTESesion.status,'verified');assert.equal(f.values.get('ba_name'),demoUser.nombre);assert.equal(f.values.get('ba_email'),demoUser.email);assert.equal(f.navigation.reload,0);
  assert.equal(f.calls[0].options.credentials,'same-origin');assert.equal(f.calls[0].options.cache,'no-store');
});
test('mobile browsers without AbortSignal.timeout can verify cookie and log out',async()=>{
  const f=fixture({stored:cached(),withoutTimeout:true});await f.context.BuscARTESesion.ready;assert.equal(f.context.BuscARTESesion.status,'verified');
  assert.equal(await f.context.BuscARTESesion.logout(),true);assert.equal(f.values.has('ba_logged'),false);
});
test('a forged legacy cache without a cookie is cleared; one-time upgrade login explains why',async()=>{
  const f=fixture({user:null,stored:cached(),pathname:'/buscARTE_mensajes.html'});await f.context.BuscARTESesion.require();
  assert.equal(f.values.has('ba_logged'),false);assert.equal(f.values.has('ba_email'),false);
  assert.match(f.navigation.replace[0],/session=upgrade/);assert.match(f.navigation.replace[0],/redirect=buscARTE_mensajes\.html/);
});
test('gateway requests wait for session response and never go directly to production Data API',async()=>{
  let release;const f=fixture({stored:cached(),fetch:(url)=>url==='/.netlify/functions/sesion'?new Promise(resolve=>{release=()=>resolve(json({user:demoUser}));}):json([])});
  const pending=f.context.fetch(database+'/rest/v1/perfiles?select=id,nombre');assert.equal(f.calls.length,1);release();await pending;
  assert.equal(f.calls.length,2);assert.equal(new URL(f.calls[1].url,'http://127.0.0.1').searchParams.get('path'),'/rest/v1/perfiles?select=id,nombre');
  assert.equal(f.calls.some(call=>call.url.startsWith(database)),false);
});
test('gateway preserves query/method/body/signal but strips authorization, API keys and arbitrary headers',async()=>{
  const f=fixture({stored:cached()});await f.context.BuscARTESesion.ready;const controller=new AbortController();
  const body=JSON.stringify({de_user_id:210,para_user_id:211,contenido:'Sólo fixture'});
  await f.context.fetch(database+'/rest/v1/mensajes?select=id',{method:'POST',body,signal:controller.signal,headers:{apikey:'fake-key',Authorization:'Bearer fake',Prefer:'return=representation','Content-Type':'application/json','X-Unsafe':'ignored'}});
  const call=f.calls.at(-1);assert.equal(call.options.method,'POST');assert.equal(call.options.body,body);assert.equal(call.options.signal,controller.signal);assert.equal(call.options.credentials,'same-origin');
  assert.deepEqual([...call.options.headers.keys()],['content-type','prefer']);assert.equal(call.options.headers.get('Prefer'),'return=representation');
});
test('Request object body is retained when routed; overriding method/body takes precedence',async()=>{
  const f=fixture({stored:cached()});await f.context.BuscARTESesion.ready;
  const req=new Request(database+'/rest/v1/anuncios',{method:'POST',body:'{"titulo":"QA"}',headers:{'Content-Type':'application/json',apikey:'fake'}});
  await f.context.fetch(req);assert.equal(await f.calls.at(-1).options.body.text(),'{"titulo":"QA"}');
  await f.context.fetch(req,{method:'PATCH',body:'{"titulo":"Otro"}'});assert.equal(f.calls.at(-1).options.method,'PATCH');assert.equal(f.calls.at(-1).options.body,'{"titulo":"Otro"}');
});
test('binary uploads are same-origin; x-upsert is only forwarded for profile uploads',async()=>{
  const f=fixture({stored:cached()});await f.context.BuscARTESesion.ready;const blob=new Blob(['fixture-only'],{type:'image/webp'});
  for(const bucket of ['fotos-perfil','fotos-anuncios']){
    await f.context.fetch(database+'/storage/v1/object/'+bucket+'/210-123.webp',{method:'POST',body:blob,headers:{'Content-Type':'image/webp','x-upsert':'true',apikey:'fake'}});
    const call=f.calls.at(-1);assert.equal(call.options.body,blob);assert.equal(call.options.headers.get('x-upsert'),bucket==='fotos-perfil'?'true':null);assert.equal(call.options.headers.has('apikey'),false);
  }
});
test('public asset GET and unrelated origins are not mistaken for mutation APIs',async()=>{
  const f=fixture({stored:cached()});await f.context.BuscARTESesion.ready;
  await f.context.fetch(database+'/storage/v1/object/public/fotos-perfil/old.webp');assert.equal(f.calls.at(-1).url,database+'/storage/v1/object/public/fotos-perfil/old.webp');
  await f.context.fetch('https://example.invalid/image.webp');assert.equal(f.calls.at(-1).url,'https://example.invalid/image.webp');
  await f.context.fetch(database+'/storage/v1/object/public/fotos-perfil/old.webp',{method:'POST',body:'fake'});assert.match(f.calls.at(-1).url,/^\/\.netlify\/functions\/datos\?/);
});
test('401 from private API clears identity and redirects private page to renew login',async()=>{
  const f=fixture({stored:cached(),pathname:'/buscARTE_mensajes.html',fetch:url=>url==='/.netlify/functions/sesion'?json({user:demoUser}):absent()});await f.context.BuscARTESesion.ready;
  const response=await f.context.fetch(database+'/rest/v1/mensajes');assert.equal(response.status,401);assert.equal(f.values.has('ba_logged'),false);assert.match(f.navigation.replace[0],/session=expired/);
});
test('expired profile save never reloads/redirects or erases draft; login opens another tab',async()=>{
  const f=fixture({stored:cached(),pathname:'/buscARTE_perfil.html',draft:true,revision:5,fetch:url=>url==='/.netlify/functions/sesion'?json({user:demoUser}):absent()});await f.context.BuscARTESesion.ready;
  await f.context.fetch('/.netlify/functions/guardar-perfil',{method:'POST',body:'{}'});
  assert.equal(f.navigation.replace.length,0);assert.equal(f.navigation.reload,0);assert.equal(f.values.has('ba_logged'),false);
  const notice=f.elements.get('ba-session-notice');assert.ok(notice);assert.equal(notice.children.at(-1).target,'_blank');
});
test('hidden save bar still preserves profile edits when session expires',async()=>{
  const f=fixture({user:null,stored:cached(),pathname:'/buscARTE_perfil.html',draft:false,revision:4});await f.context.BuscARTESesion.require();
  assert.equal(f.navigation.replace.length,0);assert.equal(f.elements.get('ba-session-notice').children.at(-1).target,'_blank');
});
test('Pretty URLs/casing/trailing slash keep draft protection and canonical safe login return',async()=>{
  for(const pathname of ['/buscARTE_perfil','/buscarte_perfil/','/buscarte_perfil.html']){
    const f=fixture({user:null,stored:cached(),pathname,revision:4});await f.context.BuscARTESesion.require();
    assert.equal(f.navigation.replace.length,0);const link=f.elements.get('ba-session-notice').children.at(-1);assert.equal(link.target,'_blank');assert.match(link.href,/redirect=buscARTE_perfil\.html/);
  }
  const f=fixture({user:null,stored:cached(),pathname:'/buscarte_mensajes/'});await f.context.BuscARTESesion.require();assert.match(f.navigation.replace[0],/redirect=buscARTE_mensajes\.html/);
});
test('unavailable verification does not discard cache and blocks all mutations without sending bytes',async()=>{
  const f=fixture({stored:cached(),fetch:()=>{throw Error('offline fixture');}});await f.context.BuscARTESesion.ready;
  assert.equal(f.context.BuscARTESesion.status,'unavailable');assert.equal(f.values.get('ba_logged'),'1');
  const response=await f.context.fetch(database+'/rest/v1/mensajes',{method:'POST',body:'do-not-send'});assert.equal(response.status,503);assert.equal(f.calls.length,1);
});
test('successful login waits for actual cookie verification, caches server user and never saves password',async()=>{
  let signed=false;const f=fixture({user:null,fetch:(url)=>{
    if(url==='/.netlify/functions/sesion')return signed?json({user:demoUser}):absent();signed=true;return json(demoUser);
  }});await f.context.BuscARTESesion.ready;
  const response=await f.context.fetch(database+'/rest/v1/rpc/login_usuario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_email:demoUser.email,p_password:'Synthetic-only-not-stored'})});
  assert.equal(response.status,200);assert.equal(f.context.BuscARTESesion.user.id,210);assert.equal(f.values.get('ba_logged'),'1');assert.equal([...f.values.values()].some(value=>value.includes('Synthetic-only')),false);
});
test('login 401 is a credential error, not a fabricated logout of an existing session',async()=>{
  const f=fixture({stored:cached(),fetch:url=>url==='/.netlify/functions/sesion'?json({user:demoUser}):json({error:'Credenciales incorrectas'},401)});await f.context.BuscARTESesion.ready;
  await f.context.fetch(database+'/rest/v1/rpc/login_usuario',{method:'POST',body:'{}'});assert.equal(f.values.get('ba_logged'),'1');assert.equal(f.navigation.replace.length,0);
});
test('registration preserves created-account result with sign-in recovery when cookie confirmation fails',async()=>{
  const f=fixture({user:null,fetch:url=>url==='/.netlify/functions/sesion'?absent():json({id:210,nombre:'Persona sintética'})});await f.context.BuscARTESesion.ready;
  const response=await f.context.fetch(database+'/rest/v1/rpc/registrar_usuario',{method:'POST',body:'{}'});const result=await response.json();assert.equal(result.id,210);assert.equal(result.session_pending,true);assert.equal(f.values.has('ba_logged'),false);
});
test('logout waits for cookie invalidation; failed logout keeps the real session and offers retry',async()=>{
  let release;const f=fixture({stored:cached(),fetch:(url,options)=>options.method==='POST'?new Promise(resolve=>{release=()=>resolve(json({ok:true}));}):json({user:demoUser})});await f.context.BuscARTESesion.ready;
  const pending=f.context.BuscARTESesion.logout();assert.equal(f.values.get('ba_logged'),'1');assert.match(f.location.href,/127\.0\.0\.1/);release();assert.equal(await pending,true);
  assert.equal(f.values.has('ba_logged'),false);assert.equal(f.values.has('ba_email'),false);assert.equal(f.location.href,'index.html');assert.deepEqual(JSON.parse(f.calls.at(-1).options.body),{action:'logout'});
  const bad=fixture({stored:cached(),fetch:(url,options)=>options.method==='POST'?json({error:'Offline'},503):json({user:demoUser})});await bad.context.BuscARTESesion.ready;
  assert.equal(await bad.context.BuscARTESesion.logout(),false);assert.equal(bad.values.get('ba_logged'),'1');assert.match(bad.location.href,/127\.0\.0\.1/);
});
test('late session GET cannot restore cache after logout',async()=>{
  let release;const f=fixture({stored:cached(),fetch:(url,options)=>options.method==='POST'?json({ok:true}):new Promise(resolve=>{release=()=>resolve(json({user:demoUser}));})});
  await f.context.BuscARTESesion.logout();release();await f.context.BuscARTESesion.ready;assert.equal(f.values.has('ba_logged'),false);assert.equal(f.context.BuscARTESesion.user,null);
});
test('a different verified identity reloads legacy constants once, but renewing an editor draft never reloads',async()=>{
  const other={...demoUser,id:211};const f=fixture({user:other,stored:cached()});await f.context.BuscARTESesion.ready;assert.equal(f.navigation.reload,1);assert.equal(f.values.get('ba_user_id'),'211');
  const draft=fixture({user:other,stored:cached(),pathname:'/buscARTE_perfil.html',revision:3});await draft.context.BuscARTESesion.ready;assert.equal(draft.navigation.reload,0);
});
test('storage disabled cannot turn a verified cookie into an exception or grant cached authority',async()=>{
  const f=fixture({storageDenied:true});await f.context.BuscARTESesion.ready;assert.equal(f.context.BuscARTESesion.status,'verified');assert.equal(f.context.BuscARTESesion.user.id,210);
});
test('signup and editor are cookie-only; only account deletion asks current password',()=>{
  const registration=fs.readFileSync(path.join(root,'buscARTE_registro.html'),'utf8'),editor=fs.readFileSync(path.join(root,'buscARTE_perfil.html'),'utf8');
  assert.equal((registration.match(/captcha_token: captchaResponse/g)||[]).length,3);assert.equal((registration.match(/usuario\.session_pending/g)||[]).length,3);
  assert.doesNotMatch(registration,/functions\/send-email/);assert.match(registration,/const credentials = \{ profileId:id \}/);
  assert.doesNotMatch(editor,/id="profile-reauth-password"/);assert.match(editor,/id="delete-password-input"/);assert.match(editor,/p_password: password/);
  assert.match(editor,/body:JSON\.stringify\(\{ profileId, changes/);
  for(const file of ['buscARTE_mensajes.html','buscARTE_anuncio_detalle.html']) assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/functions\/send-email|select=email,nombre|foto_url,email,rubro/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'buscARTE_anuncios.html'),'utf8'),/rpc\/vencer_anuncios_viejos/);
});
