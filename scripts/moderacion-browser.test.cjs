/* Public UI with isolated HTTP fixtures. No live backend, mail or accounts. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const {snapshot,root}=require('./mobile-ux-fixture.cjs');
const origin='http://127.0.0.1:4196';
const sources=snapshot();
for(const file of ['assets/js/moderacion.js','assets/css/moderacion.css']) sources.set(file,fs.readFileSync(path.join(root,file)));
const me={id:1,nombre:'Cuenta de prueba',tipo_cuenta:'artista',rubro:'musica',baneado:false};
const profiles=[me,{id:2,nombre:'Artista Dos',tipo_cuenta:'artista',rubro:'musica',instrumento:'Guitarra',generos:'Rock',bio:'Presentación pública sintética',baneado:false},
  {id:3,nombre:'Artista Tres',tipo_cuenta:'artista',rubro:'danza',campos_especificos:{disciplina:['Contemporáneo']},baneado:false}];
const conversations=[{id:10,user1_id:1,user2_id:2,ultimo_mensaje:'Mensaje previo',updated_at:'2026-10-15T10:00:00Z'},
  {id:11,user1_id:1,user2_id:3,ultimo_mensaje:'Otro contacto',updated_at:'2026-10-15T09:00:00Z'}];
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','moderacion-browser-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert.ok(output!==path.join(root,'dist')&&!output.startsWith(path.join(root,'dist')+path.sep));
fs.mkdirSync(output,{recursive:true});
let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{
  await browser?.close();
  for(const file of ['assets/js/moderacion.js','assets/css/moderacion.css','buscARTE_mensajes.html'])assert.deepEqual(fs.readFileSync(path.join(root,file)),sources.get(file),'Sources stayed frozen during QA: '+file);
  console.log('Moderation browser evidence: '+output);
});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function setup(t,options={}) {
  const width=options.width||390,height=options.height||844;
  const context=await browser.newContext({viewport:{width,height},isMobile:width<=900,hasTouch:width<=900,serviceWorkers:'block',reducedMotion:'reduce'});
  const state={user:options.anonymous?null:structuredClone(me),calls:[],unexpected:[],errors:[],statuses:new Map(),messages:[{id:90,de_user_id:2,para_user_id:1,contenido:'Mensaje previo del historial',created_at:'2026-10-15T10:00:00Z'}]};
  await context.addInitScript(({anonymous})=>{
    localStorage.setItem('buscarte_meta_consent_v1','denied');
    if(!anonymous) for(const [key,value] of Object.entries({ba_logged:'1',ba_user_id:'1',ba_name:'Cuenta de prueba',ba_tipo_cuenta:'artista',ba_rubro:'musica'}))localStorage.setItem(key,value);
    window.alert=()=>{};
    window.__storageWrites=[];
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){window.__storageWrites.push({key,value:String(value)});return set.call(this,key,value);};
  },{anonymous:!!options.anonymous});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{state.unexpected.push('WebSocket');socket.close();});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:body===undefined?'':JSON.stringify(body)});
    if(url.origin===origin&&url.pathname==='/.netlify/functions/sesion')return reply(state.user?{user:state.user}:{code:'SESSION_REQUIRED'},state.user?200:401);
    if(url.origin===origin&&url.pathname==='/.netlify/functions/moderacion') {
      const body=method==='POST'?request.postDataJSON():null;
      const call={kind:'moderation',method,body,perfil:url.searchParams.get('perfil_id'),credentials:request.headers()['cookie']};state.calls.push(call);
      if(options.moderation){const answer=await options.moderation({state,call,request});if(answer)return reply(answer.body,answer.status||200);}
      const id=String(body?.perfil_id||call.perfil);
      if(method==='GET')return reply(state.statuses.get(id)||{blocked_by_me:false,restricted:false});
      if(body.action==='report')return reply({ok:true,id:'123'});
      const next={blocked_by_me:body.action==='block',restricted:body.action==='block'};state.statuses.set(id,next);return reply(next);
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/datos') {
      const raw=url.searchParams.get('path');if(!raw||!raw.startsWith('/rest/v1/')){state.unexpected.push('Bad gateway path');return route.abort();}
      const target=new URL(raw,'https://fixture.invalid'),body=request.postData()?request.postDataJSON():null;
      const call={kind:'data',method,path:target.pathname,query:target.search,body};state.calls.push(call);
      if(options.data){const answer=await options.data({state,call,url:target});if(answer)return reply(answer.body,answer.status||200);}
      if(method==='GET'&&target.pathname==='/rest/v1/perfiles') {const id=target.searchParams.get('id');return reply(id?.startsWith('eq.')?profiles.filter(row=>String(row.id)===id.slice(3)):profiles);}
      if(method==='GET'&&target.pathname==='/rest/v1/conversaciones')return reply(conversations);
      if(method==='GET'&&target.pathname==='/rest/v1/mensajes')return reply(state.messages);
      if(method==='GET'&&['/rest/v1/anuncios','/rest/v1/perfiles_guardados'].includes(target.pathname))return reply([]);
      if(method==='POST'&&target.pathname==='/rest/v1/mensajes'){state.messages.push({id:100+state.messages.length,...body,created_at:'2026-10-15T11:00:00Z'});return reply(undefined,201);}
      if(method==='PATCH'&&target.pathname==='/rest/v1/conversaciones')return reply(undefined,204);
      state.unexpected.push(method+' '+target.pathname);return route.abort('blockedbyclient');
    }
    let file=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';if(!sources.has(file)&&sources.has(file+'.html'))file+='.html';
    if(url.origin===origin&&method==='GET'&&sources.has(file)&&file!=='sw.js') {
      const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
      return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:sources.get(file)});
    }
    if(url.hostname==='fonts.googleapis.com'&&method==='GET')return route.fulfill({contentType:'text/css',body:''});
    if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    state.unexpected.push(method+' '+url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(9000);page.on('pageerror',error=>state.errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(state.unexpected,[],'No application traffic leaves fixtures');assert.deepEqual(state.errors,[],'No uncaught browser error');}finally{await context.close();}});
  await page.goto(origin+'/'+(options.profile?'buscARTE_perfil_publico.html?id=2&rubro=musica':'buscARTE_mensajes.html'),{waitUntil:'load'});
  if(options.profile)await page.waitForFunction(()=>document.body.dataset.profileState==='other');
  else {await page.locator('.conv-item').first().waitFor();await page.evaluate(()=>abrirConvPorId(10));await page.locator('.msg-bubble').first().waitFor();}
  return {page,context,state};
}
const mod=page=>page.locator('.ba-mod');
const send=page=>page.locator('#chat-send-btn');
const messagePosts=state=>state.calls.filter(call=>call.kind==='data'&&call.method==='POST'&&call.path==='/rest/v1/mensajes');
const reportPosts=state=>state.calls.filter(call=>call.kind==='moderation'&&call.body?.action==='report');
async function allowed(page){await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='allowed');}
const options=page=>page.locator('#chat-options');
const optionsTrigger=page=>page.locator('#chat-options > summary');
async function openOptions(page){
  if(!await options(page).evaluate(el=>el.open))await optionsTrigger(page).click();
  await page.locator('#chat-options[open] .ba-mod-menu-actions').waitFor();
}
async function openReport(page,profile=false){
  if(!profile)await openOptions(page);
  await page.locator(profile?'#report-link':'.ba-mod-report').click();await page.locator('dialog[open]').waitFor();
}
async function block(page,profile=false){if(!profile)await openOptions(page);await page.locator('.ba-mod-block').click();}
async function waitForOptionsFocus(page){await page.waitForFunction(()=>document.activeElement===document.querySelector('#chat-options > summary'));}
async function assertTouchTarget(locator,label){
  const box=await locator.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44,label+' has a 44px touch target');
}

test('unknown and unavailable moderation fail closed without hiding history; retry enables a single send',async t=>{
  let unavailable=true;
  const {page,state}=await setup(t,{moderation:async({call})=>call.method==='GET'&&unavailable?{status:503,body:{code:'MODERATION_UNAVAILABLE'}}:null});
  await page.locator('#chat-input').fill('Borrador conservado');
  await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='unavailable');
  assert.equal(await send(page).isDisabled(),true);assert.match(await page.locator('#chat-messages').textContent(),/Mensaje previo del historial/);
  assert.equal(await options(page).evaluate(el=>el.open),false);
  assert.equal(await page.locator('.ba-mod-status').isVisible(),true);assert.equal(await page.locator('.ba-mod-retry').isVisible(),true);
  await page.evaluate(()=>sendMessage());assert.equal(messagePosts(state).length,0);
  assert.equal(await page.locator('.ba-mod-status').evaluate(el=>el===document.activeElement),true,'Unavailable explanation remains focusable without opening options');
  assert.equal(await page.locator('#chat-input').inputValue(),'Borrador conservado');
  unavailable=false;await page.locator('.ba-mod-retry').click();await allowed(page);await send(page).click();
  await page.waitForFunction(()=>!enviandoMensaje);assert.equal(messagePosts(state).length,1);
});

test('a pending first check cannot be bypassed with Enter or a direct send call',async t=>{
  const gate=deferred();
  const {page,state}=await setup(t,{moderation:async({call})=>{if(call.method==='GET')await gate.promise;return null;}});
  t.after(()=>gate.resolve());await page.locator('#chat-input').fill('No enviar durante la comprobación');
  assert.equal(await mod(page).getAttribute('data-status'),'checking');
  assert.equal(await page.locator('.ba-mod-status').isVisible(),true);assert.equal(await options(page).evaluate(el=>el.open),false);
  await page.locator('#chat-input').press('Enter');await page.evaluate(()=>sendMessage());
  assert.equal(messagePosts(state).length,0);assert.equal(await send(page).isDisabled(),true);
  assert.equal(await page.locator('.ba-mod-status').evaluate(el=>el===document.activeElement),true,'Pending explanation is not trapped inside closed options');
  gate.resolve();await allowed(page);assert.equal(await page.locator('#chat-input').inputValue(),'No enviar durante la comprobación');
});

test('blocking is confirmed, mutually restricts sending, preserves history and can be undone in chat',async t=>{
  const {page,state}=await setup(t);await allowed(page);await page.locator('#chat-input').fill('Texto que se conserva');
  await block(page);await page.locator('dialog[open] [data-close]').click();
  assert.equal(state.calls.filter(call=>call.body?.action==='block').length,0);
  await block(page);assert.match(await page.locator('dialog').textContent(),/ambos sentidos/);
  await page.locator('.ba-mod-confirm').click();await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='restricted');
  assert.equal(await send(page).isDisabled(),true);assert.equal(await page.locator('#chat-input').getAttribute('readonly'),'');
  assert.equal(await page.locator('#chat-input').inputValue(),'Texto que se conserva');assert.match(await page.locator('#chat-messages').textContent(),/Mensaje previo/);
  assert.equal(state.calls.filter(call=>call.body?.action==='block').length,1);
  assert.equal(await options(page).evaluate(el=>el.open),false);assert.equal(await page.locator('.ba-mod-status').isVisible(),true);
  await page.screenshot({path:path.join(output,'chat-blocked-390.png'),animations:'disabled'});
  await block(page);await allowed(page);assert.equal(await send(page).isDisabled(),false);
  const writes=await page.evaluate(()=>__storageWrites.filter(row=>row.key==='ba_moderacion_revision'));
  assert.equal(writes.length,2);assert.ok(writes.every(row=>/^[a-f0-9-]{36}$/.test(row.value)));
});

test('closing and reopening a pending report receives its single confirmed result',async t=>{
  const gate=deferred();
  const {page,state}=await setup(t,{moderation:async({call})=>{if(call.body?.action==='report')await gate.promise;return null;}});
  t.after(()=>gate.resolve());await allowed(page);await openReport(page);await page.locator('#ba-mod-reason').selectOption('abuso');
  await page.locator('#ba-mod-detail').fill('Un único reporte');await page.locator('.ba-mod-submit').click();await page.keyboard.press('Escape');
  await openReport(page);assert.equal(await page.locator('.ba-mod-submit').isDisabled(),true);
  gate.resolve();await page.locator('.ba-mod-success').waitFor();assert.equal(reportPosts(state).length,1);
});

test('a restriction imposed elsewhere uses neutral wording and can still be reported',async t=>{
  const {page}=await setup(t,{moderation:async({call})=>call.method==='GET'?{body:{blocked_by_me:false,restricted:true}}:null});
  await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='restricted');
  const text=await mod(page).textContent();assert.match(text,/No se pueden enviar/);assert.doesNotMatch(text,/te bloqueó|bloqueó a|Bloqueaste/);
  assert.equal(await page.locator('.ba-mod-status').isVisible(),true);assert.equal(await options(page).evaluate(el=>el.open),false);
  await openReport(page);assert.equal(await page.locator('#ba-mod-reason').isVisible(),true);
});

test('report confirmation requires a durable receipt, keeps draft, retries same UUID and sends no claimed identity or history',async t=>{
  let attempts=0;
  const invalidReceipts=[{ok:true},{ok:true,id:'garbage'},{ok:true,id:['123']}];
  const {page,state}=await setup(t,{moderation:async({call})=>call.body?.action==='report'&&attempts<invalidReceipts.length?{body:invalidReceipts[attempts++]}:null});
  await allowed(page);await openReport(page);await page.locator('#ba-mod-reason').selectOption('seguridad_infantil');
  await page.locator('#ba-mod-detail').fill('Detalle voluntario del reporte.');await page.locator('.ba-mod-submit').click();
  await page.locator('.ba-mod-error:not([hidden])').waitFor();assert.equal(await page.locator('.ba-mod-success').count(),0);
  assert.equal(await page.locator('#ba-mod-detail').inputValue(),'Detalle voluntario del reporte.');
  for(let i=0;i<2;i++){await page.locator('.ba-mod-submit').click();await page.locator('.ba-mod-error:not([hidden])').waitFor();assert.equal(await page.locator('.ba-mod-success').count(),0);}
  await page.locator('.ba-mod-submit').click();await page.locator('.ba-mod-success').waitFor();assert.match(await page.locator('.ba-mod-success').textContent(),/Referencia: 123/);
  const calls=reportPosts(state);assert.equal(calls.length,4);assert.ok(calls.every(call=>call.body.request_id===calls[0].body.request_id));
  assert.deepEqual(Object.keys(calls[1].body).sort(),['action','perfil_id','conversacion_id','reason','detail','request_id'].sort());
  assert.equal(calls[1].body.perfil_id,'2');assert.equal(calls[1].body.conversacion_id,'10');
  assert.doesNotMatch(JSON.stringify(calls[1].body),/Mensaje previo|reporter|de_user_id/);
  assert.ok((await page.evaluate(()=>__storageWrites)).every(row=>!row.value.includes('Detalle voluntario')));
  assert.equal(state.calls.some(call=>call.path?.includes('send-email')),false);
});

test('late state and report responses do not affect a different conversation',async t=>{
  const gate=deferred();let delayed=true;
  const {page,state}=await setup(t,{moderation:async({call})=>{if(call.perfil==='2'&&delayed){await gate.promise;return {body:{blocked_by_me:true,restricted:true}};}return null;}});
  t.after(()=>gate.resolve());await page.evaluate(()=>abrirConvPorId(11));await allowed(page);delayed=false;gate.resolve();
  await page.waitForFunction(()=>chatModeracion.canSend('3'));assert.equal(await mod(page).getAttribute('data-status'),'allowed');
  const reportGate=deferred();let hold=true;
  await page.context().route('**/.netlify/functions/moderacion',async route=>{
    const request=route.request();const body=request.postData()?request.postDataJSON():null;
    if(body?.action==='report'&&hold){state.calls.push({kind:'moderation',method:'POST',body});await reportGate.promise;return route.fulfill({json:{ok:true,id:'old-report'}});}
    return route.fallback();
  });
  t.after(()=>reportGate.resolve());await openReport(page);await page.locator('#ba-mod-reason').selectOption('abuso');await page.locator('#ba-mod-detail').fill('Borrador de otro contacto');
  await page.locator('.ba-mod-submit').click();await page.evaluate(()=>abrirConvPorId(10));await allowed(page);hold=false;reportGate.resolve();
  await openReport(page);assert.equal(await page.locator('#ba-mod-reason').inputValue(),'');assert.equal(await page.locator('#ba-mod-detail').inputValue(),'');
  assert.equal(await page.locator('.ba-mod-success').count(),0);
});

test('a server-side block racing a send retains the draft and restricts further sending',async t=>{
  const {page,state}=await setup(t,{data:async({call})=>call.method==='POST'&&call.path==='/rest/v1/mensajes'?{status:403,body:{code:'COMMUNICATION_BLOCKED'}}:null});
  await allowed(page);await page.locator('#chat-input').fill('No perder este mensaje');await send(page).click();
  await page.waitForFunction(()=>!enviandoMensaje&&document.querySelector('.ba-mod').dataset.status==='restricted');
  assert.equal(await page.locator('#chat-input').inputValue(),'No perder este mensaje');assert.equal(await send(page).isDisabled(),true);assert.equal(messagePosts(state).length,1);
});

test('profile contact uses the same block/report controls and preserves a failed message',async t=>{
  const {page,state}=await setup(t,{profile:true,data:async({call})=>call.method==='POST'&&call.path==='/rest/v1/mensajes'?{status:503,body:{code:'MODERATION_UNAVAILABLE'}}:null});
  assert.equal(await options(page).count(),0,'Public profile keeps its existing non-disclosure consumer');
  await allowed(page);await page.locator('.contact-form textarea').fill('Borrador del perfil');await page.locator('.contact-form .btn-send').click();
  await page.waitForFunction(()=>!enviandoContacto&&document.querySelector('.ba-mod').dataset.status==='unavailable');
  assert.equal(await page.locator('.contact-form textarea').inputValue(),'Borrador del perfil');
  assert.equal(await page.locator('.contact-form .btn-send').isDisabled(),true);
  assert.equal(await page.locator('.ba-mod-block').isVisible(),true);
  await openReport(page,true);await page.locator('#ba-mod-reason').selectOption('spam');await page.locator('.ba-mod-submit').click();await page.locator('.ba-mod-success').waitFor();
  assert.equal('conversacion_id' in reportPosts(state)[0].body,false);
});

test('profile delivery and a late send cannot clear or leave controls disabled for a different target',async t=>{
  const gate=deferred();
  const {page,state}=await setup(t,{profile:true,data:async({call})=>{if(call.method==='POST'&&call.path==='/rest/v1/mensajes'){await gate.promise;return {status:201};}return null;}});
  t.after(()=>gate.resolve());await allowed(page);await page.locator('.contact-form textarea').fill('Texto del primer perfil');
  const sent=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/.netlify/functions/datos'&&new URL(request.url()).searchParams.get('path')?.startsWith('/rest/v1/mensajes'));
  await page.locator('.contact-form .btn-send').click();await sent;
  await page.evaluate(async()=>{history.replaceState(null,'','buscARTE_perfil_publico.html?id=3');await cargarPerfilPublico();});await allowed(page);
  await page.locator('.contact-form textarea').fill('Borrador del segundo perfil');gate.resolve();await page.waitForFunction(()=>!enviandoContacto);
  assert.equal(await page.locator('.contact-form textarea').inputValue(),'Borrador del segundo perfil');
  assert.equal(await page.locator('.contact-form .btn-send').textContent(),'Enviar →');assert.equal(await page.locator('.contact-form .btn-send').isDisabled(),false);
  assert.equal(messagePosts(state).length,1);
});

test('expired report session keeps its draft, offers sign-in and closes message sending',async t=>{
  const {page}=await setup(t,{moderation:async({call})=>call.body?.action==='report'?{status:401,body:{code:'SESSION_REQUIRED'}}:null});
  await allowed(page);await openReport(page);await page.locator('#ba-mod-reason').selectOption('otro');await page.locator('#ba-mod-detail').fill('Mantener texto con sesión vencida');
  await page.locator('.ba-mod-submit').click();await page.locator('.ba-mod-error:not([hidden]) a').waitFor();
  assert.equal(await page.locator('#ba-mod-detail').inputValue(),'Mantener texto con sesión vencida');assert.equal(await send(page).isDisabled(),true);
});

test('anonymous profile remains readable and report offers sign-in without a moderation write',async t=>{
  const {page,state}=await setup(t,{profile:true,anonymous:true});
  await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='anonymous');
  assert.equal(await page.locator('.contact-form .btn-send').isDisabled(),true);assert.match(await page.locator('#perfil-nombre').textContent(),/Artista Dos/);
  await openReport(page,true);assert.equal(await page.locator('.ba-mod-login').isVisible(),true);
  assert.equal(state.calls.filter(call=>call.kind==='moderation').length,0);
});

test('cross-tab block changes trigger a fresh check and preserve the other tab draft',async t=>{
  const {page,context,state}=await setup(t);await allowed(page);await page.locator('#chat-input').fill('Borrador en primera pestaña');
  const second=await context.newPage();second.on('pageerror',error=>state.errors.push(error.message));
  await second.goto(origin+'/buscARTE_perfil_publico.html?id=2');await allowed(second);
  await block(second,true);await second.locator('.ba-mod-confirm').click();
  await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='restricted');
  assert.equal(await page.locator('#chat-input').inputValue(),'Borrador en primera pestaña');assert.equal(await send(page).isDisabled(),true);
  await second.close();
});

for(const [width,height] of [[320,720],[390,844],[844,390]])test(`moderation dialog at ${width}x${height}: labels, touch sizes, Escape/focus and scrollable content`,async t=>{
  const {page}=await setup(t,{width,height});await allowed(page);await openOptions(page);
  for(const locator of [optionsTrigger(page),page.locator('.ba-mod-report'),page.locator('.ba-mod-block')])await assertTouchTarget(locator,'Chat option');
  await openReport(page);assert.equal(await options(page).evaluate(el=>el.open),false,'Dialog does not leave the action disclosure open');
  await page.locator('#ba-mod-reason').selectOption('otro');await page.locator('#ba-mod-detail').fill('Borrador del formulario');
  assert.equal(await page.locator('#ba-mod-detail').getAttribute('maxlength'),'2000');
  assert.equal(await page.locator('dialog').getAttribute('aria-labelledby'),'ba-mod-title');
  for(const locator of [page.locator('.ba-mod-submit'),page.locator('dialog [data-close]')])await assertTouchTarget(locator,'Dialog control');
  const box=await page.locator('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);
  await page.locator('.ba-mod-submit').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`report-${width}x${height}.png`),animations:'disabled'});
  await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'});
  await waitForOptionsFocus(page);
  assert.equal(await optionsTrigger(page).evaluate(el=>el===document.activeElement),true,'Return focus goes to the visible disclosure trigger');
  await openReport(page);assert.equal(await page.locator('#ba-mod-detail').inputValue(),'Borrador del formulario');
  await page.keyboard.press('Escape');await block(page);await page.locator('.ba-mod-confirm').click();
  await page.waitForFunction(()=>document.querySelector('.ba-mod').dataset.status==='restricted');
  await page.locator('.ba-mod-status').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`chat-blocked-${width}x${height}.png`),animations:'disabled'});
});

for(const width of [320,390])test(`${width}px compact chat keeps composer visible while tools remain scrollable`,async t=>{
  const {page}=await setup(t,{width,height:844});await allowed(page);
  await page.locator('#chat-input').fill('Borrador sintético sin enviar');await page.setViewportSize({width,height:430});
  const input=await page.locator('#chat-input').boundingBox(),button=await send(page).boundingBox();
  assert.ok(input.y>=0&&input.y+input.height<=430,'Textarea stays inside compact viewport');
  assert.ok(button.y>=0&&button.y+button.height<=430,'Send stays inside compact viewport');
  assert.equal(await page.locator('#chat-input').inputValue(),'Borrador sintético sin enviar');
  await openReport(page);await page.keyboard.press('Escape');
  const reply=page.locator('.quick-reply').last();await reply.scrollIntoViewIfNeeded();assert.equal(await reply.isVisible(),true);
  const finalInput=await page.locator('#chat-input').boundingBox();assert.ok(finalInput.y+finalInput.height<=430);
  await page.screenshot({path:path.join(output,`chat-composer-compact-${width}.png`),animations:'disabled'});
});

for(const width of [320,390,1440])test(`${width}px normal chat keeps safety actions secondary, keyboard-accessible and inside the header`,async t=>{
  const height=width===1440?900:844;
  const {page,state}=await setup(t,{width,height});await allowed(page);
  assert.equal(await options(page).isVisible(),true);assert.equal(await options(page).evaluate(el=>el.open),false);
  assert.equal(await mod(page).isVisible(),false,'Allowed chat has no permanent moderation card beside the composer');
  assert.equal(await page.locator('.ba-mod-block').isVisible(),false);assert.equal(await page.locator('.ba-mod-report').isVisible(),false);
  assert.match(await optionsTrigger(page).getAttribute('aria-label'),/Más opciones/);
  await assertTouchTarget(optionsTrigger(page),'More options');
  const header=await page.locator('#chat-header').boundingBox(),trigger=await optionsTrigger(page).boundingBox();
  assert.ok(header.height<=104,'Normal chat header does not become a large safety panel');
  assert.ok(trigger.x>=0&&trigger.x+trigger.width<=width+1&&trigger.y>=header.y&&trigger.y+trigger.height<=header.y+header.height+1,'Trigger fits inside the header and viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal page overflow');
  await page.screenshot({path:path.join(output,`chat-normal-${width}.png`),animations:'disabled'});
  await page.locator('#chat-header').screenshot({path:path.join(output,`chat-header-${width}.png`),animations:'disabled'});

  await optionsTrigger(page).focus();await optionsTrigger(page).press('Enter');
  await page.locator('#chat-options[open] .ba-mod-report').waitFor();
  for(const locator of [page.locator('.ba-mod-report'),page.locator('.ba-mod-block')])await assertTouchTarget(locator,'Safety action');
  const popup=await page.locator('.ba-mod-menu-actions').boundingBox();
  assert.ok(popup.x>=0&&popup.x+popup.width<=width+1&&popup.y>=0&&popup.y+popup.height<=height+1,'Open options are not clipped outside the viewport');
  await page.screenshot({path:path.join(output,`chat-options-open-${width}.png`),animations:'disabled'});
  await page.keyboard.press('Tab');assert.equal(await page.locator('.ba-mod-block').evaluate(el=>el===document.activeElement),true,'First safety action is keyboard reachable');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#chat-options').open);
  await waitForOptionsFocus(page);
  assert.equal(await optionsTrigger(page).evaluate(el=>el===document.activeElement),true,'Escape returns focus to the visible trigger');
  await optionsTrigger(page).press('Space');await page.locator('#chat-options[open] .ba-mod-report').waitFor();
  await page.locator('#chat-input').click();
  await page.waitForFunction(()=>!document.querySelector('#chat-options').open);
  assert.equal(await page.locator('#chat-input').evaluate(el=>el===document.activeElement),true,'Outside click does not steal focus back to the header');

  await openReport(page);await page.locator('#ba-mod-reason').selectOption('otro');await page.locator('#ba-mod-detail').fill('Borrador situacional sin enviar');
  await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'});
  await waitForOptionsFocus(page);
  assert.equal(await optionsTrigger(page).evaluate(el=>el===document.activeElement),true,'Report closes onto a visible focus target');
  await openReport(page);assert.equal(await page.locator('#ba-mod-detail').inputValue(),'Borrador situacional sin enviar');
  await page.keyboard.press('Escape');
  assert.equal(reportPosts(state).length,0);assert.equal(messagePosts(state).length,0,'Opening/closing safety options creates no content');
});

for(const width of [320,390,1440])test(`${width}px changing chats closes safety options and preserves conversation drafts`,async t=>{
  const {page,state}=await setup(t,{width,height:844});await allowed(page);
  await page.locator('#chat-input').fill('Borrador del contacto Dos');await openOptions(page);
  await page.evaluate(()=>abrirConvPorId(11));await allowed(page);
  assert.equal(await options(page).evaluate(el=>el.open),false,'Options do not remain open for a new target');
  assert.match(await page.locator('#chat-header-name').textContent(),/Artista Tres/);
  assert.equal(await page.locator('#chat-input').inputValue(),'');
  await page.locator('#chat-input').fill('Borrador del contacto Tres');await openOptions(page);
  await page.evaluate(()=>abrirConvPorId(10));await allowed(page);
  assert.equal(await options(page).evaluate(el=>el.open),false);
  assert.equal(await page.locator('#chat-input').inputValue(),'Borrador del contacto Dos');
  await openReport(page);await page.locator('#ba-mod-reason').selectOption('spam');await page.locator('.ba-mod-submit').click();await page.locator('.ba-mod-success').waitFor();
  assert.equal(reportPosts(state).length,1);assert.equal(reportPosts(state)[0].body.perfil_id,'2');assert.equal(reportPosts(state)[0].body.conversacion_id,'10');
  assert.equal(messagePosts(state).length,0);
});

for(const width of [320,390])test(`${width}px returning to the mobile conversation list closes safety options without clearing the draft`,async t=>{
  const {page,state}=await setup(t,{width,height:844});await allowed(page);
  await page.locator('#chat-input').fill('Borrador antes de volver');await openOptions(page);
  await page.locator('.mobile-chat-back').click();
  assert.equal(await options(page).evaluate(el=>el.open),false);
  assert.equal(await page.locator('#chat-panel').isVisible(),false);
  await page.evaluate(()=>abrirConvPorId(10));await allowed(page);
  assert.equal(await options(page).evaluate(el=>el.open),false);assert.equal(await page.locator('#chat-input').inputValue(),'Borrador antes de volver');
  assert.equal(messagePosts(state).length,0);assert.equal(reportPosts(state).length,0);
});

test('profile report keeps its original return-focus target and visible safety controls',async t=>{
  const {page}=await setup(t,{profile:true});await allowed(page);
  assert.equal(await options(page).count(),0);assert.equal(await mod(page).isVisible(),true);assert.equal(await page.locator('.ba-mod-block').isVisible(),true);
  await openReport(page,true);await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement===document.querySelector('#report-link'));
  assert.equal(await page.locator('#report-link').evaluate(el=>el===document.activeElement),true);
});
