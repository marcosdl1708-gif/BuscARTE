/* Isolated UI and fetch-wrapper contract tests. No registration or production traffic. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const {snapshot,root}=require('./mobile-ux-fixture.cjs');
const origin='http://127.0.0.1:4197',database='https://xiaanchoanxmampegoay.supabase.co',version='2026-10-15';
const sources=snapshot();for(const file of ['assets/js/condiciones.js','assets/css/condiciones.css'])sources.set(file,fs.readFileSync(path.join(root,file)));
const me={id:1,nombre:'Cuenta aislada',tipo_cuenta:'artista',rubro:'musica',baneado:false};
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','condiciones-browser-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert.ok(output!==path.join(root,'dist')&&!output.startsWith(path.join(root,'dist')+path.sep));fs.mkdirSync(output,{recursive:true});
const shell='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><script src="/assets/js/sesion-segura.js"></script></head><body><label for="draft">Borrador</label><textarea id="draft">Contenido que no debe perderse</textarea><button id="attempt">Guardar o enviar</button><p id="result" role="status"></p><script>window.__statuses=[];document.getElementById("attempt").onclick=async()=>{const response=await fetch("'+database+'/rest/v1/mensajes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({de_user_id:1,para_user_id:2,contenido:document.getElementById("draft").value})});__statuses.push(response.status);document.getElementById("result").textContent=String(response.status);if(response.ok)document.getElementById("draft").value="";};</script></body></html>';
let browser;before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{await browser?.close();console.log('Terms evidence: '+output);});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function setup(t,options={}) {
  const context=await browser.newContext({viewport:{width:options.width||390,height:options.height||844},isMobile:(options.width||390)<=900,hasTouch:(options.width||390)<=900,serviceWorkers:'block',reducedMotion:'reduce'});
  const state={user:options.anonymous||options.registration?null:structuredClone(me),accepted:false,calls:[],unexpected:[],errors:[],writes:0,alerts:[],assets:[]};
  await context.addInitScript(({user})=>{localStorage.setItem('buscarte_meta_consent_v1','denied');if(user)for(const [key,value]of Object.entries({ba_logged:'1',ba_user_id:String(user.id),ba_name:user.nombre,ba_tipo_cuenta:user.tipo_cuenta,ba_rubro:user.rubro}))localStorage.setItem(key,value);window.alert=text=>window.__alerts.push(text);window.__alerts=[];},{user:state.user});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{state.unexpected.push('WebSocket');socket.close();});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:body===undefined?'':JSON.stringify(body)});
    if(url.origin===origin&&url.pathname==='/.netlify/functions/sesion') {state.calls.push({kind:'session',method});return reply(state.user?{user:state.user}:{code:'SESSION_REQUIRED'},state.user?200:401);}
    if(url.origin===origin&&url.pathname==='/.netlify/functions/condiciones') {
      const call={kind:'terms',method,body:request.postData()?request.postDataJSON():null};state.calls.push(call);
      if(options.terms){const result=await options.terms({state,call});if(result)return reply(result.body,result.status||200);}
      if(method==='POST')state.accepted=true;return reply({version,accepted:state.accepted});
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/guardar-perfil') {
      state.calls.push({kind:'save',method,body:request.postDataJSON()});
      if(!state.accepted)return reply({code:'TERMS_REQUIRED',version,error:'Aceptá los Términos de uso.'},428);
      state.writes++;return reply({ok:true});
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/datos') {
      const raw=url.searchParams.get('path');if(!raw?.startsWith('/rest/v1/')){state.unexpected.push('Invalid gateway');return route.abort();}
      const target=new URL(raw,'https://fixture.invalid'),call={kind:'data',method,path:target.pathname,body:request.postData()?request.postDataJSON():null};state.calls.push(call);
      if(options.data){const result=await options.data({state,call});if(result)return reply(result.body,result.status||200);}
      if(target.pathname==='/rest/v1/rpc/registrar_usuario')return reply(options.oldRegistration?{code:'TERMS_REQUIRED',version,error:'Aceptá los Términos.'}:{error:'Fixture: no account creation'},options.oldRegistration?428:400);
      if(method==='GET'||target.pathname==='/rest/v1/perfiles_guardados'||target.pathname==='/rest/v1/rpc/borrar_mi_cuenta')return reply([]);
      if(!state.accepted)return reply({code:'TERMS_REQUIRED',version,error:'Aceptá los Términos de uso.'},428);
      state.writes++;return reply(undefined,201);
    }
    if(url.origin===origin&&['/.netlify/functions/moderacion','/.netlify/functions/email-preferencias','/.netlify/functions/borrar-cuenta'].includes(url.pathname)){state.calls.push({kind:'exempt',method,path:url.pathname});return reply({ok:true});}
    if(url.origin===origin&&url.pathname==='/fixture.html')return route.fulfill({contentType:'text/html',body:shell});
    let file=decodeURIComponent(url.pathname).slice(1);if(!sources.has(file)&&sources.has(file+'.html'))file+='.html';
    if(url.origin===origin&&method==='GET'&&sources.has(file)&&file!=='sw.js'){
      if(['assets/js/condiciones.js','assets/css/condiciones.css'].includes(file))state.assets.push(file);
      if(file==='assets/css/condiciones.css'&&options.cssFailure&&state.assets.filter(value=>value===file).length===1)return route.fulfill({status:503,contentType:'text/plain',body:'Synthetic unavailable CSS'});
      const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
      return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:sources.get(file)});
    }
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.hostname==='js.hcaptcha.com')return route.fulfill({contentType:'application/javascript',body:'// Never connect to captcha service.'});
    if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    state.unexpected.push(method+' '+url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(9000);page.on('pageerror',error=>state.errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(state.unexpected,[],'No network beyond local fixtures');assert.deepEqual(state.errors,[],'No unhandled UI errors');}finally{await context.close();}});
  await page.goto(origin+'/'+(options.registration?'buscARTE_registro.html':'fixture.html'),{waitUntil:'load'});await page.waitForFunction(()=>window.BuscARTESesion.status!=='pending');
  return {page,context,state};
}
async function prompt(page){await page.locator('#attempt').click();await page.locator('#ba-terms-dialog[open]').waitFor();await page.locator('#ba-terms-accepted').waitFor();}
const postTerms=state=>state.calls.filter(call=>call.kind==='terms'&&call.method==='POST');

test('historical user explicitly accepts before UGC; original mutation never replays automatically',async t=>{
  const {page,state}=await setup(t);await prompt(page);
  assert.equal(await page.locator('#ba-terms-accepted').isChecked(),false);assert.equal(await page.locator('.ba-terms-accept').isDisabled(),true);assert.equal(state.writes,0);
  await page.locator('#ba-terms-accepted').check();await page.locator('.ba-terms-accept').click();await page.locator('.ba-terms-success').waitFor();
  assert.deepEqual(postTerms(state)[0].body,{action:'accept',version,accepted:true});assert.equal(state.writes,0);
  assert.equal(await page.locator('#draft').inputValue(),'Contenido que no debe perderse');
  await page.locator('[data-close]').click();await page.locator('#attempt').click();await page.waitForFunction(()=>__statuses.includes(201));assert.equal(state.writes,1);
});

test('Cancel and Escape preserve content and do not accept or send it on a later click',async t=>{
  const {page,state}=await setup(t);await prompt(page);await page.locator('#ba-terms-accepted').check();await page.keyboard.press('Escape');
  assert.equal(postTerms(state).length,0);assert.equal(state.writes,0);assert.equal(await page.locator('#draft').inputValue(),'Contenido que no debe perderse');
  assert.equal(await page.locator('#attempt').evaluate(element=>element===document.activeElement),true);
  await prompt(page);assert.equal(await page.locator('#ba-terms-accepted').isChecked(),false);await page.locator('[data-close]').click();assert.equal(postTerms(state).length,0);
  assert.deepEqual(state.assets.sort(),['assets/css/condiciones.css','assets/js/condiciones.js']);
});

test('partial lazy asset failure stays closed and a later attempt reloads missing CSS',async t=>{
  const {page,state}=await setup(t,{cssFailure:true});await page.locator('#attempt').click();await page.locator('#ba-terms-notice').waitFor();
  assert.equal(state.writes,0);assert.equal(postTerms(state).length,0);assert.equal(await page.locator('dialog[open]').count(),0);
  await prompt(page);assert.equal(state.assets.filter(file=>file==='assets/css/condiciones.css').length,2);
  assert.equal(state.assets.filter(file=>file==='assets/js/condiciones.js').length,1);assert.equal(state.writes,0);
});

test('failed acceptance preserves the explicit choice, retries once and requires a confirmed current version',async t=>{
  let attempt=0;
  const {page,state}=await setup(t,{terms:async({call})=>call.method==='POST'&&++attempt===1?{status:503,body:{code:'TERMS_UNAVAILABLE'}}:null});
  await prompt(page);await page.locator('#ba-terms-accepted').check();await page.locator('.ba-terms-accept').click();await page.locator('.ba-terms-error:not([hidden])').waitFor();
  assert.equal(await page.locator('#ba-terms-accepted').isChecked(),true);assert.equal(state.writes,0);assert.equal(state.accepted,false);
  await page.locator('.ba-terms-accept').click();await page.locator('.ba-terms-success').waitFor();assert.equal(postTerms(state).length,2);assert.equal(state.writes,0);
});

test('malformed GET/receipt never claims acceptance and GET has a retry path',async t=>{
  let fail=true;
  const {page,state}=await setup(t,{terms:async({call})=>call.method==='GET'&&fail?{body:{version:'future-version',accepted:true}}:call.method==='POST'?{body:{version,accepted:false}}:null});
  await page.locator('#attempt').click();await page.locator('.ba-terms-retry').waitFor();assert.equal(await page.locator('#ba-terms-accepted').count(),0);
  fail=false;await page.locator('.ba-terms-retry').click();await page.locator('#ba-terms-accepted').check();await page.locator('.ba-terms-accept').click();
  await page.locator('.ba-terms-error:not([hidden])').waitFor();assert.equal(await page.locator('.ba-terms-success').count(),0);assert.equal(state.writes,0);
});

test('switching accounts while acceptance is pending closes the prompt and cannot replay content',async t=>{
  const gate=deferred();const {page,state}=await setup(t,{terms:async({call})=>{if(call.method==='POST')await gate.promise;return null;}});t.after(()=>gate.resolve());
  await prompt(page);await page.locator('#ba-terms-accepted').check();const request=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/.netlify/functions/condiciones');
  await page.locator('.ba-terms-accept').click();await request;state.user={...me,id:2,nombre:'Otra cuenta'};
  await page.evaluate(()=>BuscARTESesion.refresh({reload:false}));await page.locator('#ba-terms-dialog[open]').waitFor({state:'hidden'});gate.resolve();
  assert.equal(state.writes,0);assert.equal(await page.locator('#draft').inputValue(),'Contenido que no debe perderse');assert.equal(await page.locator('.ba-terms-success').count(),0);
});

test('a delayed 428 for the previous account cannot open consent for a different user',async t=>{
  const gate=deferred();const {page,state}=await setup(t,{data:async({call})=>{if(call.method==='POST'&&call.path==='/rest/v1/mensajes')await gate.promise;return null;}});t.after(()=>gate.resolve());
  const sent=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/.netlify/functions/datos');
  await page.locator('#attempt').click();await sent;state.user={...me,id:2,nombre:'Otra cuenta'};await page.evaluate(()=>BuscARTESesion.refresh({reload:false}));gate.resolve();
  await page.waitForFunction(()=>__statuses.length===1);assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(state.assets.length,0);assert.equal(state.writes,0);
});

test('direct same-origin guardar-perfil is guarded; reads and safety/deletion/preferences/favorites remain available',async t=>{
  const {page,state}=await setup(t);
  await page.evaluate(async()=>{
    await fetch('/.netlify/functions/moderacion',{method:'POST',body:'{}'});await fetch('/.netlify/functions/email-preferencias',{method:'POST',body:'{}'});await fetch('/.netlify/functions/borrar-cuenta',{method:'POST',body:'{}'});
    await fetch('https://xiaanchoanxmampegoay.supabase.co/rest/v1/perfiles_guardados',{method:'POST',body:'{}'});await fetch('https://xiaanchoanxmampegoay.supabase.co/rest/v1/perfiles?select=id');
  });assert.equal(state.calls.filter(call=>call.kind==='terms').length,0);
  await page.evaluate(()=>fetch('/.netlify/functions/guardar-perfil',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"nombre":"Borrador"}'}));
  await page.locator('#ba-terms-accepted').waitFor();assert.equal(state.writes,0);
});

for(const [width,height] of [[320,568],[390,844],[844,390]])test(`${width}x${height}: explicit terms UI has reachable links, 44px actions, Escape/focus and no overflow`,async t=>{
  const {page}=await setup(t,{width,height});await prompt(page);
  for(const link of await page.locator('#ba-terms-dialog a').all()){assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener');}
  const label=await page.locator('.ba-terms-choice').boundingBox();assert.ok(label.height>=44);
  await page.locator('#ba-terms-accepted').check();const button=page.locator('.ba-terms-accept');await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.height>=44&&box.width>=44);
  const modal=await page.locator('#ba-terms-dialog').boundingBox();assert.ok(modal.x>=0&&modal.x+modal.width<=width+1&&modal.y>=0&&modal.y+modal.height<=height+1);
  await page.screenshot({path:path.join(output,`terms-${width}x${height}.png`),animations:'disabled'});await page.keyboard.press('Escape');assert.equal(await page.locator('#draft').inputValue(),'Contenido que no debe perderse');
});

for(const type of ['artista','negocio','visitante'])test(`registration ${type} requires separate unchecked acceptance and sends version independently of marketing`,async t=>{
  const {page,state}=await setup(t,{registration:true,width:type==='artista'?320:390});
  await page.evaluate(type=>{
    tipoCuenta=type;rubroSeleccionado='musica';window.RegistroCaptcha={requireResponse:()=> 'synthetic-captcha',show(){},reset(){}};
    document.getElementById('reg-nombre').value='Cuenta nueva';document.getElementById('reg-email').value='nuevo@example.invalid';document.getElementById('reg-password').value='UnicaClave4567!';document.getElementById('sel-provincia').value='Córdoba';document.getElementById('neg-tipo').selectedIndex=1;goStep('cuenta');
  },type);
  assert.equal(await page.locator('#reg-terms-accepted').isChecked(),false);assert.equal(await page.locator('#reg-email-marketing').isChecked(),false);
  if(type==='artista'){
    await page.locator('.registro-terms-choice').evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));const box=await page.locator('.registro-terms-choice').boundingBox();assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=321&&box.y>=0&&box.y+box.height<=844);
    await page.screenshot({path:path.join(output,'registro-terms-320.png'),animations:'disabled'});
  }
  await page.locator('#reg-email-marketing').check();
  const attempt=()=>page.evaluate(async type=>{const button=document.createElement('button');await ({artista:crearPerfil,negocio:crearNegocio,visitante:crearVisitante})[type](button);},type);
  await attempt();assert.equal(state.calls.filter(call=>call.path==='/rest/v1/rpc/registrar_usuario').length,0);assert.equal(await page.locator('#reg-terms-error').isVisible(),true);
  await page.locator('#reg-email-marketing').uncheck();await page.locator('#reg-terms-accepted').check();await attempt();
  const call=state.calls.find(call=>call.path==='/rest/v1/rpc/registrar_usuario');assert.ok(call);assert.equal(call.body.terms_version,version);assert.equal(call.body.terms_accepted,true);assert.equal(call.body.email_marketing_opt_in,false);
  assert.equal(await page.locator('#reg-password').inputValue(),'UnicaClave4567!');assert.equal(state.writes,0);
});

test('old anonymous registration receiving 428 offers updated registration without an authenticated terms prompt',async t=>{
  const {page,state}=await setup(t,{anonymous:true,oldRegistration:true});
  await page.evaluate(()=>fetch('https://xiaanchoanxmampegoay.supabase.co/rest/v1/rpc/registrar_usuario',{method:'POST',body:'{}'}));
  await page.locator('#ba-terms-notice').waitFor();assert.match(await page.locator('#ba-terms-notice').textContent(),/registro actualizado/);
  assert.equal(await page.locator('#ba-terms-notice a').getAttribute('href'),'buscARTE_registro.html');assert.equal(state.calls.filter(call=>call.kind==='terms').length,0);assert.equal(state.assets.length,0);
});
