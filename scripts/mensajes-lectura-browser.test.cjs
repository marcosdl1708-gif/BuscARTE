/* Reading-state regressions: public sources, local stateful gateway only.
 * Synthetic users/messages; no production, provider, email or account writes. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const {root,origin,snapshot,setupFixture}=require('./mobile-ux-fixture.cjs');
const sources=snapshot();
assert.ok(sources.has('assets/js/mensajes-lectura.js'),'Reading helper is explicitly published');
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','mensajes-lectura-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert.ok(!output.startsWith(root+path.sep));fs.mkdirSync(output,{recursive:true});
const findings=[];let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{
  await browser?.close();
  const sourceDrift=[...sources].filter(([file,body])=>!fs.readFileSync(path.join(root,file)).equals(body)).map(([file])=>file);
  assert.deepEqual(sourceDrift,[],'Public sources stay frozen during final QA');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({at:new Date().toISOString(),sourceDrift,findings,
    sources:Object.fromEntries([...sources].filter(([file])=>/mensajes-lectura|mensajes\.html|inicio-sesion/.test(file)).map(([file,body])=>[file,createHash('sha256').update(body).digest('hex')])),
    scope:'Stateful synthetic gateway only; no real network, accounts, messages, emails or database mutations.'},null,2));
  console.log('Reading evidence: '+output);
});
const me={id:1,nombre:'Cuenta de ejemplo',tipo_cuenta:'artista',rubro:'musica',baneado:false,perfil_revision:0};
const people=[me,{id:2,nombre:'Artista Dos',tipo_cuenta:'artista',rubro:'musica',instrumento:'Guitarra',baneado:false},
  {id:3,nombre:'Artista Tres',tipo_cuenta:'artista',rubro:'danza',campos_especificos:{disciplina:['Tango']},baneado:false}];
const conversations=[{id:10,user1_id:1,user2_id:2,ultimo_mensaje:'Un mensaje sintético',updated_at:'2026-11-01T12:00:00Z'},
  {id:11,user1_id:1,user2_id:3,ultimo_mensaje:'Otra conversación sintética',updated_at:'2026-11-01T11:00:00Z'}];
const message=(id=91,extra={})=>({id,de_user_id:2,para_user_id:1,created_at:'2026-11-01T12:00:00Z',contenido:'Mensaje de ejemplo '+id,leido:false,...extra});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function picked(row,select){return select?Object.fromEntries(select.split(',').filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])):{...row};}
async function fixture(t,options={}){
  const server={messages:structuredClone(options.messages||[message()]),patches:[],patchFailure:!!options.patchFailure,historyFailure:!!options.historyFailure,
    afterHistory:options.afterHistory,beforePatch:options.beforePatch,historyGate:options.historyGate,patchGate:options.patchGate,unreadGate:options.unreadGate};
  const fixtureInit={content:`window.__qaFocused=${options.focused!==false};window.__qaVisibility=${JSON.stringify(options.hidden?'hidden':'visible')};
    document.hasFocus=()=>window.__qaFocused;
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__qaVisibility});
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__qaVisibility!=='visible'});
    localStorage.setItem('buscarte_meta_consent_v2_2026-10-15','denied');
    ${options.dialog?"document.addEventListener('DOMContentLoaded',()=>{const dialog=document.createElement('dialog');dialog.id='qa-reading-dialog';dialog.textContent='Diálogo sintético de prueba';document.body.append(dialog);dialog.showModal();},{once:true});":''}
    ${options.legacyRead?"localStorage.setItem('ba_msg_read_by_user',JSON.stringify({'2':'2099-01-01T00:00:00Z'}));localStorage.setItem('ba_msg_last_seen','2099-01-01T00:00:00Z');":''}`};
  const f=await setupFixture({browser,sources,route:options.route||'buscARTE_mensajes.html?conv=10',width:options.width||390,
    height:options.height||(options.width===1440?900:844),user:options.anonymous?null:me,profiles:people,init:fixtureInit,
    api:async({state,call,url})=>{
      if(call.path==='/rest/v1/conversaciones'&&call.method==='GET')return {body:conversations};
      if(call.path!=='/rest/v1/mensajes')return undefined;
      if(call.method==='GET'){
        const params=url.searchParams,unread=params.get('or')?.includes('leido.')||params.has('leido');
        let rows=server.messages;
        if(unread){
          assert.equal(params.get('para_user_id'),'eq.'+state.user.id,'Unread reads are scoped to the verified receiver');
          assert.equal(params.has('created_at'),false,'Read state never uses the local clock');
          rows=rows.filter(row=>String(row.para_user_id)===String(state.user.id)&&row.leido!==true);
        }else{
          if(server.historyFailure)return {status:503,body:{error:'Synthetic history failure'}};
          const pair=params.get('or')?.match(/and\(de_user_id\.eq\.(\d+),para_user_id\.eq\.(\d+)\)/);
          if(pair){const ids=new Set([pair[1],pair[2]]);rows=rows.filter(row=>ids.has(String(row.de_user_id))&&ids.has(String(row.para_user_id)));}
          if(server.historyGate)await server.historyGate.promise;
        }
        if(params.get('order')?.endsWith('.desc'))rows=[...rows].reverse();
        const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||999);
        const body=rows.slice(offset,offset+limit).map(row=>picked(row,params.get('select')));
        if(!unread&&server.afterHistory){const act=server.afterHistory;server.afterHistory=null;await act(server);}
        if(unread&&server.unreadGate&&params.get('para_user_id')==='eq.1')await server.unreadGate.promise;
        return {body};
      }
      if(call.method==='PATCH'){
        assert.deepEqual(call.body,{leido:true},'Only the reading bit may be written');
        assert.deepEqual([...url.searchParams.keys()].sort(),['id','select']);assert.equal(url.searchParams.get('select'),'id,leido');
        const match=url.searchParams.get('id')?.match(/^in\.\(([1-9]\d*(?:,[1-9]\d*)*)\)$/);assert.ok(match,'Explicit bounded message IDs');
        const ids=match[1].split(',');assert.ok(ids.length<=100);assert.equal(new Set(ids).size,ids.length);
        server.patches.push({ids:[...ids],user:String(state.user?.id)});
        if(server.beforePatch){const act=server.beforePatch;server.beforePatch=null;await act(server);}
        if(server.patchGate)await server.patchGate.promise;
        if(server.patchFailure)return {status:503,body:{error:'Synthetic reading failure'}};
        const confirmed=server.messages.filter(row=>ids.includes(String(row.id))&&String(row.para_user_id)===String(state.user?.id));
        for(const row of confirmed)row.leido=true;
        return {body:confirmed.map(row=>({id:row.id,leido:true}))};
      }
      // No unrelated content send/update/delete is silently accepted.
      return undefined;
    }});
  t.after(async()=>{
    try{
      assert.ok(f.state.calls.every(call=>call.method==='GET'||(call.path==='/rest/v1/mensajes'&&call.method==='PATCH'&&call.body?.leido===true)),
        'Only explicit synthetic read acknowledgements may mutate');
      findings.push({name:t.name,patches:server.patches,unexpected:f.state.unexpected});
    }finally{await f.close();}
  });
  return {...f,server};
}
async function ready(page){await page.waitForFunction(()=>window.BuscARTELectura&&window.BuscARTESesion?.status==='verified');}
async function loaded(page){await ready(page);await page.locator('#chat-messages .msg').first().waitFor();}
async function waitRead(f,id=91){await f.page.waitForFunction(id=>document.querySelector('.msg.received')&&true,id);await expectEventually(()=>f.server.messages.find(row=>row.id===id)?.leido===true);}
async function expectEventually(check){const until=Date.now()+5000;while(Date.now()<until){if(await check())return;await new Promise(done=>setTimeout(done,25));}assert.ok(await check(),'Expected state did not settle');}
async function attention(page,{focused=true,visible=true}={}){
  await page.evaluate(({focused,visible})=>{window.__qaFocused=focused;window.__qaVisibility=visible?'visible':'hidden';
    document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event(focused?'focus':'blur'));},{focused,visible});
}
async function settle(page){await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));await new Promise(done=>setTimeout(done,180));}

test('every badge page imports one server-backed reading helper, without legacy date queries',()=>{
  const pages=['index.html','buscARTE_index.html','buscARTE_busqueda.html','buscARTE_anuncios.html','buscARTE_anuncio_detalle.html',
    'buscARTE_guardados.html','buscARTE_mis_anuncios.html','buscARTE_perfil.html','buscARTE_perfil_publico.html','buscARTE_mensajes.html'];
  for(const file of pages){const text=sources.get(file).toString();assert.match(text,/assets\/js\/mensajes-lectura\.js/);assert.doesNotMatch(text,/mensajes\?[^`\r\n]*created_at=gt\./);}
});
for(const width of [320,390,1440])test(width+'px: visible received messages persist, sent/other conversation do not',async t=>{
  const f=await fixture(t,{width,messages:[message(90,{de_user_id:1,para_user_id:2,contenido:'Mi mensaje enviado'}),message(91,{contenido:'Entrá a https://example.test/proyecto'}),message(92,{de_user_id:3,contenido:'De otra conversación'})]});
  await loaded(f.page);await waitRead(f,91);
  assert.equal(f.server.messages.find(row=>row.id===90).leido,false);assert.equal(f.server.messages.find(row=>row.id===92).leido,false);
  assert.ok(f.server.patches.every(call=>call.ids.every(id=>id==='91')));
  assert.equal(await f.page.locator('.msg-link').getAttribute('href'),'https://example.test/proyecto');
  await f.page.locator('#chat-input').fill('Borrador de ejemplo sin enviar');assert.equal(await f.page.locator('#chat-send-btn').isDisabled(),false);
  await f.page.locator('#chat-messages').dispatchEvent('scroll');await settle(f.page);assert.equal(await f.page.locator('#chat-input').inputValue(),'Borrador de ejemplo sin enviar');
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(width===390)await f.page.screenshot({path:path.join(output,'chat-reading-390.png'),animations:'disabled'});
});
test('logout and a fresh login with empty local read cache keep server-confirmed messages read',async t=>{
  const f=await fixture(t);await loaded(f.page);await waitRead(f);
  await f.context.route('**/.netlify/functions/sesion',async route=>{
    const request=route.request();if(request.method()==='POST'){assert.deepEqual(request.postDataJSON(),{action:'logout'});f.state.user=null;return route.fulfill({contentType:'application/json',body:'{"ok":true}'});}
    return route.fulfill({status:f.state.user?200:401,contentType:'application/json',body:JSON.stringify(f.state.user?{user:f.state.user}:{code:'SESSION_REQUIRED'})});
  });
  await f.page.evaluate(()=>window.BuscARTESesion.logout());await f.page.waitForURL('**/index.html');
  await f.page.evaluate(()=>localStorage.clear());f.state.user={...me};
  await f.page.goto(origin+'/buscARTE_mensajes.html');await ready(f.page);await f.page.locator('.conv-item').first().waitFor();await settle(f.page);
  assert.equal(await f.page.locator('.conv-item.unread').count(),0);assert.equal(await f.page.locator('#conv-count').isVisible(),false);
});
test('local timestamps cannot hide a server-unread conversation',async t=>{
  const f=await fixture(t,{route:'buscARTE_mensajes.html',legacyRead:true});await ready(f.page);await f.page.locator('.conv-item.unread').waitFor();
  assert.match(await f.page.locator('#conv-count').innerText(),/1 nuevo/i);assert.equal(f.server.patches.length,0);
});
for(const mode of ['hidden','blurred'])test(mode+' chat cannot acknowledge received messages before attention returns',async t=>{
  const f=await fixture(t,{hidden:mode==='hidden',focused:mode!=='blurred'});await loaded(f.page);await settle(f.page);
  assert.equal(f.server.patches.length,0);assert.equal(f.server.messages[0].leido,false);
  await attention(f.page);await waitRead(f);
});
test('an open native dialog prevents reading messages behind it until closed and attended',async t=>{
  const f=await fixture(t,{dialog:true});await loaded(f.page);await settle(f.page);
  assert.equal(await f.page.locator('#qa-reading-dialog').evaluate(el=>el.open),true);
  assert.equal(f.server.patches.length,0);assert.equal(f.server.messages[0].leido,false);
  await f.page.locator('#qa-reading-dialog').evaluate(el=>el.close());await attention(f.page);await waitRead(f);
});
test('closed mobile chat cannot read a newly polled message',async t=>{
  const f=await fixture(t);await loaded(f.page);await waitRead(f);
  await f.page.evaluate(()=>closeMobileChat());f.server.messages.push(message(92,{created_at:'2026-11-01T12:01:00Z'}));
  await f.page.evaluate(()=>cargarMensajes(false));await settle(f.page);assert.equal(f.server.messages.find(row=>row.id===92).leido,false);
  await f.page.locator('.conv-item[data-conv-id="10"]').click();await waitRead(f,92);
});
test('offscreen loaded messages stay unread until their bubbles are scrolled into view',async t=>{
  const messages=Array.from({length:24},(_,i)=>message(100+i,{created_at:new Date(Date.parse('2026-11-01T12:00:00Z')+i*60000).toISOString(),contenido:('Texto de ejemplo para revisar lectura visible. ').repeat(5)}));
  const f=await fixture(t,{messages});await loaded(f.page);await waitRead(f,123);
  assert.equal(f.server.messages.find(row=>row.id===100).leido,false);
  await f.page.locator('#chat-messages').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});await waitRead(f,100);
});
test('a failed acknowledgement preserves unread state and retries on renewed attention',async t=>{
  const f=await fixture(t,{patchFailure:true});await loaded(f.page);await expectEventually(()=>f.server.patches.length>0);await settle(f.page);
  assert.equal(f.server.messages[0].leido,false);assert.equal(await f.page.locator('.conv-item[data-conv-id="10"]').evaluate(el=>el.classList.contains('unread')),true);
  const before=f.server.patches.length;await settle(f.page);assert.equal(f.server.patches.length,before,'No immediate retry loop');
  f.server.patchFailure=false;await attention(f.page);await waitRead(f);
});
test('failed history load never acknowledges a message just because its conversation was opened',async t=>{
  const f=await fixture(t,{historyFailure:true});await ready(f.page);await f.page.getByText('No se pudieron cargar los mensajes',{exact:true}).waitFor();await settle(f.page);
  assert.equal(f.server.patches.length,0);assert.equal(f.server.messages[0].leido,false);
});
test('a message arriving after the loaded snapshot is not swept into its acknowledgement',async t=>{
  const f=await fixture(t,{afterHistory:server=>server.messages.push(message(92,{created_at:'2026-11-01T12:01:00Z',contenido:'Todavía no cargado'}))});
  await loaded(f.page);await waitRead(f,91);assert.equal(f.server.messages.find(row=>row.id===92).leido,false);
  assert.ok(f.server.patches.every(call=>!call.ids.includes('92')));
});
test('a delayed old conversation cannot acknowledge its messages after switching away',async t=>{
  const gate=deferred(),f=await fixture(t,{route:'buscARTE_mensajes.html',width:1440,historyGate:gate,messages:[message(),message(92,{de_user_id:3})]});
  t.after(()=>gate.resolve());await ready(f.page);await f.page.locator('.conv-item').first().waitFor();
  await f.page.locator('.conv-item[data-conv-id="10"]').click();await expectEventually(()=>f.state.calls.some(call=>call.path==='/rest/v1/mensajes'&&new URLSearchParams(call.query).get('or')?.includes('and(')));
  await f.page.locator('.conv-item[data-conv-id="11"]').click();f.server.historyGate=null;gate.resolve();
  await loaded(f.page);await waitRead(f,92);assert.equal(f.server.messages.find(row=>row.id===91).leido,false);
});
for(const route of ['index.html','buscARTE_index.html','buscARTE_busqueda.html?rubro=musica','buscARTE_guardados.html'])test(route+': badge uses server read state, never local timestamps',async t=>{
  const f=await fixture(t,{route,legacyRead:true,messages:[message(91,{leido:true}),message(92),message(93,{de_user_id:1,para_user_id:2})]});
  await ready(f.page);await f.page.evaluate(()=>window.BuscARTELectura.refreshBadge());
  await f.page.waitForFunction(()=>document.getElementById('nav-msg-badge')?.textContent==='1');
  f.server.messages.find(row=>row.id===92).leido=true;await attention(f.page);await f.page.evaluate(()=>window.BuscARTELectura.refreshBadge());
  await expectEventually(async()=>!await f.page.locator('#nav-msg-badge').isVisible());assert.equal(f.server.patches.length,0);
});
test('a cached ID without a verified server session cannot query or acknowledge reading',async t=>{
  const f=await fixture(t,{route:'index.html',anonymous:true,legacyRead:true});await f.page.waitForFunction(()=>window.BuscARTESesion?.status==='anonymous');
  const result=await f.page.evaluate(async()=>{try{return await window.BuscARTELectura.mark(['91']);}catch(_){return 'denied';}});
  assert.ok(result==='denied'||Array.isArray(result)&&!result.length);assert.equal(f.server.patches.length,0);
  assert.equal(f.state.calls.filter(call=>call.path==='/rest/v1/mensajes').length,0);
});
test('a delayed unread response cannot repaint the previous account badge',async t=>{
  const gate=deferred(),f=await fixture(t,{route:'index.html',unreadGate:gate,messages:[message(91),message(92,{para_user_id:3}),message(93,{para_user_id:3})]});
  t.after(()=>gate.resolve());await ready(f.page);
  await expectEventually(()=>f.state.calls.some(call=>call.path==='/rest/v1/mensajes'&&new URLSearchParams(call.query).get('para_user_id')==='eq.1'));
  f.state.user={...people[2]};await f.page.evaluate(()=>window.BuscARTESesion.refresh({reload:false}));
  await f.page.waitForFunction(()=>document.getElementById('nav-msg-badge')?.textContent==='2');gate.resolve();await settle(f.page);
  assert.equal(await f.page.locator('#nav-msg-badge').textContent(),'2');assert.equal(f.server.patches.length,0);
});
