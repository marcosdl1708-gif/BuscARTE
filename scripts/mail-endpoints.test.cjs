const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Every transport is a backend fixture. Native fetch, sockets, real env and
// provider clients are unavailable inside the VM, including indirect imports.
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const origin = 'https://buscarte.com.ar';
const backend = 'https://xiaanchoanxmampegoay.supabase.co';
const fixtureKey = 'sb_secret_synthetic_fixture_key_not_a_credential';
const sessionToken = Buffer.alloc(32,7).toString('base64url');
const password = 'synthetic-password-fingerprint-source';
const jobId = '11111111-2222-4333-8444-555555555555';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));

function runtime(file, options={}) {
  const calls=[], unexpected=[], logs=[];
  const user={id:701,nombre:'Persona fixture',email:'user@example.invalid',tipo_cuenta:'artista',rubro:'musica',baneado:false,...options.user};
  const state={preferences:options.preferences ?? null,job:{id:jobId,recipient:user.email,tipo:'perfil_incompleto',clicked_at:null,...options.job}};
  const env={SUPABASE_URL:backend,SUPABASE_SERVICE_ROLE_KEY:fixtureKey,URL:origin,...options.env};
  const response=(status,value)=>status===204?new Response(null,{status}):new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const transport=async(href,init={})=>{
    const url=new URL(href),method=init.method||'GET';
    const call={url:url.href,method,body:init.body?JSON.parse(init.body):null,headers:plain(init.headers||{})};calls.push(call);
    assert.equal(url.origin,backend,'No request may escape backend fixture');
    assert.equal(init.headers.apikey,fixtureKey);
    assert.equal(init.headers.Authorization,undefined,'Opaque service key is not a bearer JWT');
    if(options.backendFails)return response(503,{private:'Synthetic database detail'});
    if(url.pathname==='/rest/v1/sesiones_web'&&method==='GET')return response(200,options.sessionValid===false?[]:[{perfil_id:user.id,password_fingerprint:hash(password)}]);
    if(url.pathname==='/rest/v1/perfiles'&&method==='GET')return response(200,options.profileExists===false?[]:[{...user,...(url.searchParams.get('select').includes('password')?{password}: {})}]);
    if(url.pathname==='/rest/v1/email_preferences'&&method==='GET')return response(200,state.preferences?[state.preferences]:[]);
    if(url.pathname==='/rest/v1/email_preferences'&&method==='POST') {state.preferences=call.body;return response(204);}
    if(url.pathname==='/rest/v1/rpc/limitar_operacion_web'&&method==='POST')return response(200,options.rateAllowed!==false);
    if(url.pathname==='/rest/v1/rpc/mail_cancel_pending_profile'&&method==='POST')return response(200,1);
    if(url.pathname==='/rest/v1/email_outbox'&&method==='GET') {
      assert.equal(url.searchParams.get('id'),'eq.'+jobId);assert.equal(url.searchParams.get('perfil_id'),'eq.701');assert.equal(url.searchParams.get('status'),'eq.sent');
      return response(200,options.jobExists===false?[]:[state.job]);
    }
    if(url.pathname==='/rest/v1/email_outbox'&&method==='PATCH') {assert.equal(url.searchParams.get('clicked_at'),'is.null');state.job.clicked_at=call.body.clicked_at;return response(204);}
    unexpected.push(method+' '+url.pathname);throw new Error('Unexpected fixture request');
  };
  const context=vm.createContext({Request,Response,Headers,URL,URLSearchParams,Buffer,TextDecoder,AbortSignal,Date,
    __crypto:crypto,fetch:transport,process:{env},Netlify:{env:{get:name=>env[name]||''}},
    console:{log:(...a)=>logs.push(a),warn:(...a)=>logs.push(a),error:(...a)=>logs.push(a)}});
  function module(source,name,exports) {vm.runInContext('(function(){\n'+source.replace(/^export /gm,'')+'\n;globalThis.'+name+'={'+exports+'};})();',context,{timeout:1000});}
  module(read('netlify/lib/disciplinas.mjs'),'__disciplines','normalizeDisciplines');
  module(read('netlify/lib/session.mjs').replace(/^import \{([^}]+)\} from 'node:crypto';\s*/m,'const {$1}=__crypto;\n').replace(/^import \{([^}]+)\} from '\.\/disciplinas\.mjs';\s*/m,'const {$1}=__disciplines;\n'),
    '__security','json,backendJson,environment,internalMailSecret,sessionUser,trustedOrigin,rate,readJson,readBytes');
  const runtimeSource=read('netlify/lib/mail-runtime.mjs')
    .replace(/^import \{([^}]+)\} from 'node:crypto';\s*/m,'const {$1}=__crypto;\n')
    .replace(/^import \{([^}]+)\} from '\.\/session\.mjs';\s*/m,'const {$1}=__security;\n')
    .replace(/^import \{ buildEmail \} from '\.\/mail-templates\.mjs';\s*/m,'const buildEmail=()=>{throw new Error("Unexpected rendering");};\n')
    .replace(/^import \{ missingBasics \} from '\.\/mail-profile\.mjs';\s*/m,'const missingBasics=()=>[];\n');
  module(runtimeSource,'__mail','mailService,signMailToken,verifyMailToken,emailHash');
  let source=read('netlify/functions/'+file+'.mjs');
  const handlerName=source.match(/export default async function (\w+)/)[1];
  source=source.replace(/^import \{([^}]+)\} from '\.\.\/lib\/session\.mjs';\s*/gm,'const {$1}=__security;\n')
    .replace(/^import \{([^}]+)\} from '\.\.\/lib\/mail-runtime\.mjs';\s*/gm,'const {$1}=__mail;\n')
    .replace('export default async function ','async function ');
  module(source,'__endpoint',handlerName+',config');
  return{handle:context.__endpoint[handlerName],config:plain(context.__endpoint.config),calls,unexpected,logs,state,user,
    token:(kind='unsubscribe',extra={})=>context.__mail.signMailToken({v:1,p:'701',e:context.__mail.emailHash(options.tokenEmail||user.email),k:kind,...(kind==='action'?{j:jobId}:{}),...extra})};
}
function request(file, options={}) {
  const method=options.method||'GET',url=new URL('/.netlify/functions/'+file,origin);
  if(options.token!==undefined)url.searchParams.set('t',options.token);
  if(options.next)url.searchParams.set('redirect',options.next);
  return new Request(url,{method,headers:{...(options.cookie===false?{}:{cookie:'__Host-ba_session='+sessionToken}),'x-nf-client-connection-ip':'192.0.2.9',origin,'sec-fetch-site':'same-origin',
    ...(method==='POST'?{'content-type':'application/json'}:{}),...options.headers},
    ...(['GET','HEAD'].includes(method)?{}:{body:options.raw===undefined?JSON.stringify(options.body??{}):options.raw})});
}
const mutations=run=>run.calls.filter(call=>!['GET','HEAD'].includes(call.method)&&!call.url.includes('/rpc/limitar_operacion_web'));
const tamper=token=>token.replace(/\.[A-Za-z0-9_-]/,value=>'.'+(value[1]==='a'?'b':'a'));

test('preferences GET authenticates cookie and returns only the two preferences',async()=>{
  const denied=runtime('email-preferences');assert.equal((await denied.handle(request('email-preferences',{cookie:false}))).status,401);assert.equal(denied.calls.length,0);
  const invalid=runtime('email-preferences',{sessionValid:false});assert.equal((await invalid.handle(request('email-preferences'))).status,401);assert.equal(mutations(invalid).length,0);
  const run=runtime('email-preferences');const result=await run.handle(request('email-preferences'));
  assert.deepEqual(await result.json(),{marketing_opt_in:false,onboarding_disabled:false});assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('access-control-allow-origin'),null);
  assert.equal(mutations(run).length,0);assert.deepEqual(run.unexpected,[]);
});
test('preferences POST persists current cookie identity and explicit booleans',async()=>{
  const run=runtime('email-preferences');const value={marketing_opt_in:true,onboarding_disabled:false};
  assert.deepEqual(await(await run.handle(request('email-preferences',{method:'POST',body:value}))).json(),value);
  const write=mutations(run)[0];assert.match(write.url,/email_preferences/);assert.equal(write.body.perfil_id,701);assert.equal(write.body.email,'user@example.invalid');
  assert.equal(write.body.marketing_opt_in,true);assert.equal(write.body.onboarding_disabled,false);assert.deepEqual(run.unexpected,[]);
});
test('preferences independently cancel only the requested reminder or marketing scope for the authenticated identity',async()=>{
  for(const [body,scopes] of [[{marketing_opt_in:false,onboarding_disabled:true},['onboarding','marketing']],[{marketing_opt_in:true,onboarding_disabled:true},['onboarding']],[{marketing_opt_in:false,onboarding_disabled:false},['marketing']]]) {
    const run=runtime('email-preferences');await run.handle(request('email-preferences',{method:'POST',body}));
    const cancellations=run.calls.filter(call=>call.url.endsWith('/rpc/mail_cancel_pending_profile'));
    assert.deepEqual(cancellations.map(call=>call.body),scopes.map(p_scope=>({p_perfil_id:701,p_email:'user@example.invalid',p_scope})));
  }
});
test('preferences rejects spoofed/missing origins, cross-site and expired sessions without mutation',async()=>{
  for(const headers of [{origin:'https://evil.example.invalid'},{origin:''},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]) {
    const run=runtime('email-preferences');assert.equal((await run.handle(request('email-preferences',{method:'POST',headers,body:{marketing_opt_in:true,onboarding_disabled:false}}))).status,403);assert.equal(mutations(run).length,0);
  }
  const run=runtime('email-preferences');assert.equal((await run.handle(request('email-preferences',{method:'POST',cookie:false}))).status,401);assert.equal(mutations(run).length,0);
});
test('preferences requires both strict booleans and rejects identity/unknown fields',async()=>{
  for(const body of [{},{marketing_opt_in:true},{marketing_opt_in:'true',onboarding_disabled:false},{marketing_opt_in:0,onboarding_disabled:false},{marketing_opt_in:false,onboarding_disabled:null},{marketing_opt_in:false,onboarding_disabled:false,perfil_id:999},{marketing_opt_in:false,onboarding_disabled:false,email:'other@example.invalid'}]) {
    const run=runtime('email-preferences');assert.equal((await run.handle(request('email-preferences',{method:'POST',body}))).status,400);assert.equal(mutations(run).length,0);
  }
});
test('preferences distributed limiter and malformed/oversized bodies cannot write',async()=>{
  const limited=runtime('email-preferences',{rateAllowed:false});assert.equal((await limited.handle(request('email-preferences',{method:'POST',body:{marketing_opt_in:true,onboarding_disabled:false}}))).status,429);assert.equal(mutations(limited).length,0);
  for(const options of [{raw:'{'},{raw:'x'.repeat(1025)},{body:[]},{raw:'{}',headers:{'content-type':'text/plain'}}]) {
    const run=runtime('email-preferences');assert.equal((await run.handle(request('email-preferences',{method:'POST',...options}))).status,400);assert.equal(mutations(run).length,0);
  }
});
test('preferences method/backend failures disclose neither identity nor backend detail',async()=>{
  const run=runtime('email-preferences');assert.equal((await run.handle(request('email-preferences',{method:'DELETE'}))).status,405);assert.equal(run.calls.length,0);
  const fail=runtime('email-preferences',{backendFails:true});const result=await fail.handle(request('email-preferences'));assert.equal(result.status,503);assert(!JSON.stringify(await result.json()).includes('Synthetic'));assert.deepEqual(fail.logs,[]);
});
test('unsubscribe GET is scanner-safe and never reads or mutates the database',async()=>{
  const run=runtime('email-unsubscribe');const result=await run.handle(request('email-unsubscribe',{token:run.token(),cookie:false}));
  assert.equal(result.status,200);const html=await result.text();assert.match(html,/<form method="post">/);assert(!html.includes(run.user.email));assert.equal(run.calls.length,0);assert.equal(result.headers.get('referrer-policy'),'no-referrer');
});
test('the unsubscribe confirmation form submits a nonempty body accepted by the real POST handler',async()=>{
  const run=runtime('email-unsubscribe'),token=run.token();
  const html=await(await run.handle(request('email-unsubscribe',{token,cookie:false}))).text();
  const form=html.match(/<form\b[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/)?.[1];assert(form);
  // Successful hidden controls are encoded exactly as a browser's URL-encoded
  // form. An empty form previously produced body:null and failed readBytes.
  const body=new URLSearchParams();
  for(const input of form.matchAll(/<input\b[^>]*>/g)) {
    const name=input[0].match(/\bname="([^"]+)"/)?.[1],value=input[0].match(/\bvalue="([^"]*)"/)?.[1];
    if(name)body.append(name,value||'');
  }
  assert.equal(body.toString(),'List-Unsubscribe=One-Click');assert.equal(run.calls.length,0);
  const result=await run.handle(request('email-unsubscribe',{method:'POST',token,cookie:false,headers:{'content-type':'application/x-www-form-urlencoded'},raw:body.toString()}));
  assert.equal(result.status,200);assert.match(await result.text(),/Preferencias guardadas/);
  const write=mutations(run).find(call=>call.url.includes('/email_preferences'));assert.equal(write.body.marketing_opt_in,false);assert.equal(write.body.onboarding_disabled,true);
});
test('one-click unsubscribe POST saves opt-out by signed identity without cookie or origin',async()=>{
  const run=runtime('email-unsubscribe');const result=await run.handle(request('email-unsubscribe',{method:'POST',token:run.token(),cookie:false,headers:{origin:'','content-type':'application/x-www-form-urlencoded'},raw:'List-Unsubscribe=One-Click&perfil_id=999'}));
  assert.equal(result.status,200);assert.equal(await result.text(),'');const write=mutations(run).find(call=>call.url.includes('/email_preferences'));
  assert.equal(write.body.perfil_id,701);assert.equal(write.body.email,'user@example.invalid');assert.equal(write.body.marketing_opt_in,false);assert.equal(write.body.onboarding_disabled,true);assert.deepEqual(run.unexpected,[]);
});
test('unsubscribe rejects forged, wrong-purpose and malformed signed links before database work',async()=>{
  const run=runtime('email-unsubscribe');const valid=run.token();
  for(const token of [tamper(valid),'bad',run.token('action'),run.token('unsubscribe',{p:'999x'}),run.token('unsubscribe',{v:2}),'x'.repeat(1501)]) {
    assert.equal((await run.handle(request('email-unsubscribe',{method:'POST',token,headers:{'content-type':'application/x-www-form-urlencoded'},raw:'List-Unsubscribe=One-Click'}))).status,400);
  }
  assert.equal(run.calls.length,0);
});
test('unsubscribe cannot affect a changed email and refuses oversized/unsupported bodies',async()=>{
  const changed=runtime('email-unsubscribe',{tokenEmail:'old@example.invalid'});assert.equal((await changed.handle(request('email-unsubscribe',{method:'POST',token:changed.token(),headers:{'content-type':'application/x-www-form-urlencoded'},raw:'List-Unsubscribe=One-Click'}))).status,200);assert.equal(mutations(changed).length,0);
  const run=runtime('email-unsubscribe');assert.equal((await run.handle(request('email-unsubscribe',{method:'POST',token:run.token(),body:{}}))).status,415);assert.equal(run.calls.length,0);
  assert.equal((await run.handle(request('email-unsubscribe',{method:'POST',token:run.token(),headers:{'content-type':'application/x-www-form-urlencoded'},raw:'x'.repeat(2049)}))).status,503);assert.equal(run.calls.length,0);
});
test('email-link requires a signed action token and redirects only to the canonical profile destination',async()=>{
  const run=runtime('email-link');const result=await run.handle(request('email-link',{token:run.token('action'),next:'https://evil.example.invalid'}));assert.equal(result.status,303);
  const destination=new URL(result.headers.get('location'));assert.equal(destination.origin,origin);assert.equal(destination.pathname,'/buscARTE_login.html');assert.equal(destination.searchParams.get('redirect'),'buscARTE_perfil.html?mail='+jobId+'#completar');
  const writes=mutations(run);assert.equal(writes.length,1);assert(Number.isFinite(Date.parse(writes[0].body.clicked_at)));assert.equal(result.headers.get('referrer-policy'),'no-referrer');assert.deepEqual(run.unexpected,[]);
});
test('email-link refuses tampering, wrong purpose and methods without database access',async()=>{
  const run=runtime('email-link');const valid=run.token('action');
  for(const token of [tamper(valid),run.token('unsubscribe'),'bad',run.token('action',{j:'not-a-uuid'})])assert.equal((await run.handle(request('email-link',{token}))).status,400);
  assert.equal((await run.handle(request('email-link',{method:'POST',token:valid}))).status,405);assert.equal(run.calls.length,0);
});
test('email-link matches queue and current profile email, and missing jobs never record a click',async()=>{
  for(const options of [{jobExists:false},{job:{recipient:'other@example.invalid'}},{tokenEmail:'previous@example.invalid'},{profileExists:false}]) {
    const run=runtime('email-link',options);assert.equal((await run.handle(request('email-link',{token:run.token('action')}))).status,400);assert.equal(mutations(run).length,0);
  }
});
test('email-link repeated click avoids rewriting attribution; newsletters use canonical announcements',async()=>{
  const run=runtime('email-link',{job:{clicked_at:'2026-10-15T12:00:00Z',tipo:'resumen_mensual'}});const result=await run.handle(request('email-link',{token:run.token('action')}));
  assert.equal(result.status,303);assert.equal(new URL(result.headers.get('location')).searchParams.get('redirect'),'buscARTE_anuncios.html');assert.equal(mutations(run).length,0);
});
test('token endpoint backend failure returns a private error and never a redirect',async()=>{
  for(const endpoint of ['email-link','email-unsubscribe']) {
    const run=runtime(endpoint,{backendFails:true});const result=await run.handle(request(endpoint,{token:run.token(endpoint==='email-link'?'action':'unsubscribe'),...(endpoint==='email-unsubscribe'?{method:'POST',raw:'List-Unsubscribe=One-Click',headers:{'content-type':'application/x-www-form-urlencoded'}}:{})}));
    assert.equal(result.status,503);assert.equal(result.headers.get('location'),null);assert(!(await result.text()).includes('Synthetic'));assert.deepEqual(run.logs,[]);
  }
});
