/* Cursor QA on immutable release bytes with synthetic cookie/gateway transport.
 * No real user, API, database, email or native-app traffic is permitted. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:4202';
const published=JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'));
const sources=new Map(published.map(file=>[file,fs.readFileSync(path.join(root,file))]));
const pages=published.filter(file=>file.endsWith('.html'));
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','cursor-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert.ok(!output.startsWith(root+path.sep));fs.mkdirSync(output,{recursive:true});
const results=[];
let browser;
// Retain the known richer legacy fixture rows, without prototype MD behavior.
let transport=fs.readFileSync(path.join(root,'scripts/fixtures/legacy-runtime.js'),'utf8');
const demoStart=transport.indexOf('  function demoProfile('),demoEnd=transport.indexOf('  function json(',demoStart);
assert.ok(demoStart>0&&demoEnd>demoStart);
transport=transport.slice(0,demoStart)+'  function demoProfile(row) { return { ...clone(row), foto_url: localPhoto(row.foto_url) }; }\n'+transport.slice(demoEnd);
transport=transport.replace("url.hostname === 'xiaanchoanxmamgoay.supabase.co' || ",'');
transport=transport.replace('  const currentId =', '  for(const row of state.perfiles){row.disciplinas ??= null;row.perfil_revision ??= 0;}\n  const currentId =');
transport=transport.replace('  async function api(request, url) {',`
  let qaSessionId=null,qaSessionReady=false;
  async function api(request,url) {
    if(url.pathname==='/.netlify/functions/datos') {
      const path=url.searchParams.get('path');
      if(!path||!/^\\/(?:rest\\/v1\\/|storage\\/v1\\/object\\/)/.test(path)||path.startsWith('//'))return fail('Unknown fixture gateway path.',403);
      const target=new URL(path,'https://xiaanchoanxmampegoay.supabase.co');
      if(target.origin!=='https://xiaanchoanxmampegoay.supabase.co')return fail('External gateway blocked.',403);
      return safeFetch(new Request(target.href,request));
    }
    if(url.pathname==='/.netlify/functions/sesion') {
      if(!qaSessionReady){qaSessionReady=true;qaSessionId=currentId()||null;}
      const user=state.perfiles.find(row=>sameId(row.id,qaSessionId));
      if(request.method==='GET')return user?json({user:Object.fromEntries(['id','nombre','email','tipo_cuenta','rubro','referentes','generos','baneado','disciplinas','perfil_revision'].map(key=>[key,user[key]]))}):json({error:'Fixture session required.',code:'SESSION_REQUIRED'},401);
      // Cursor interactions do not need login/logout or any data mutations.
      return fail('Cursor QA denies session writes.',405);
    }
`);
transport=transport.replace("Object.keys(input).every(key => key === 'visitas')","Object.keys(input).every(key => key === 'visitas' || key === 'vistas')");
transport+=`\n(function(){delete document.documentElement.dataset.baPreview;delete document.documentElement.dataset.baOption;})();`;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{
  await browser?.close();
  const drift=[...sources].filter(([file,bytes])=>!fs.readFileSync(path.join(root,file)).equals(bytes)).map(([file])=>file);
  if(JSON.stringify(published)!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'))))drift.push('site-files.json');
  fs.writeFileSync(path.join(output,'cursor-report.json'),JSON.stringify({at:new Date().toISOString(),scope:'Actual release HTML/CSS/JS on isolated synthetic session/data transport. Fonts use native fallbacks. Not a live database or physical APK test; screenshots do not capture OS native pointers.',sourceDrift:drift,sourceHashes:Object.fromEntries([...sources].map(([file,bytes])=>[file,createHash('sha256').update(bytes).digest('hex')])),results},null,2));
  console.log('Cursor evidence: '+output);
  if(process.env.BUSCARTE_QA_ALLOW_DRIFT!=='1')assert.deepEqual(drift,[],'Late sources need a new snapshot before certification');
});
function fileFor(url){let file=decodeURIComponent(url.pathname).slice(1)||'index.html';if(!sources.has(file)&&sources.has(file+'.html'))file+='.html';return sources.has(file)?file:null;}
const routeFor=file=>file==='buscARTE_perfil_publico.html'?file+'?id=9002':file==='buscARTE_anuncio_detalle.html'?file+'?id=9104':file==='buscARTE_mensajes.html'?file+'?conversacion=9201':file;
async function setup(t,{file='buscARTE_busqueda.html',width=1440,mode='member',baseline=false,noJS=false,noCSS=false,reducedMotion='no-preference',forcedColors='none',brokenFrame=false,oldEngine=false}={}) {
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<901,hasTouch:width<901,serviceWorkers:'block',javaScriptEnabled:!noJS,reducedMotion,forcedColors});
  const result={test:t.name,file,width,mode,baseline,noJS,noCSS,errors:[],unexpected:[],checks:[]};results.push(result);
  if(brokenFrame)await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  if(oldEngine)await context.addInitScript(()=>{CSS.supports=()=>false;});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{result.unexpected.push('WebSocket '+socket.url());socket.close();});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),file=url.origin===origin&&request.method()==='GET'?fileFor(url):null;
    if(file&&file!=='sw.js'){
      let body=sources.get(file);
      if(file.endsWith('.html')){
        let html=body.toString('utf8');
        if(baseline)html=html.replace(/<link[^>]*href="\/assets\/css\/cursor\.css"[^>]*>\s*/g,'').replace(/<script[^>]*src="\/assets\/js\/cursor\.js"[^>]*><\/script>\s*/g,'');
        if(!noJS)html=html.replace(/<head(?:\s[^>]*)?>/i,match=>match+'\n<script>'+ (transport+'\n'+(mode==='guest'?'window.BuscARTEPreview.logout();':'window.BuscARTEPreview.useAccount(9001);')).replace(/<\/script/gi,'<\\/script')+'</script>');
        body=Buffer.from(html);
      }
      if(noCSS&&file==='assets/css/cursor.css')body=Buffer.from('/* Failed stylesheet simulated locally. */');
      return route.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.xml':'application/xml','.txt':'text/plain'})[path.extname(file)]||'application/octet-stream',body});
    }
    if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.hostname==='js.hcaptcha.com')return route.fulfill({contentType:'application/javascript',body:'// No provider is contacted.'});
    result.unexpected.push(request.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>result.errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(result.errors,[]);assert.deepEqual(result.unexpected,[]);}finally{await context.close();}});
  await page.goto(origin+'/'+routeFor(file),{waitUntil:'load'});
  if(!noJS){await page.waitForFunction(()=>window.BuscARTESesion&&['verified','anonymous'].includes(BuscARTESesion.status));await page.evaluate(()=>document.fonts.ready);}
  if(mode==='member'&&!noJS&&!brokenFrame){
    if(file==='buscARTE_busqueda.html')await page.waitForSelector('.musician-card');
    if(file==='buscARTE_anuncios.html')await page.waitForSelector('.anuncio');
    if(file==='buscARTE_perfil.html')await page.waitForFunction(()=>typeof isLoadingProfile!=='undefined'&&!isLoadingProfile);
    if(file==='buscARTE_perfil_publico.html')await page.waitForFunction(()=>document.body.dataset.profileState==='other');
    if(file==='buscARTE_mensajes.html')await page.waitForSelector('.conv-item');
  }
  return {page,result,context};
}
async function snapshot(page){return page.evaluate(()=>{
  const cursor=document.getElementById('ba-cursor'),hit=document.querySelector('[data-ba-cursor-hit="true"]');
  const style=cursor&&getComputedStyle(cursor),r=cursor?.getBoundingClientRect();
  return {active:document.documentElement.dataset.baCursorActive==='true',visible:!!cursor?.isConnected&&!cursor.hidden&&style.display!=='none'&&style.visibility==='visible'&&+style.opacity>.5&&r.width>=4&&r.height>=4,hit:hit?.tagName||null,hitCursor:hit?getComputedStyle(hit).cursor:null,pointerEvents:style?.pointerEvents||null,legacy:[...document.querySelectorAll('#cursor,#cursor-ring')].map(el=>getComputedStyle(el).display),allMarked:document.querySelectorAll('[data-ba-cursor-hit="true"]').length};
});}
async function hover(page,selector){const locator=(typeof selector==='string'?page.locator(selector):selector).filter({visible:true}).first();await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();assert.ok(box,String(selector));await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(60);return {state:await snapshot(page),cursor:await locator.evaluate(el=>getComputedStyle(el).cursor)};}
async function safeAtMouse(page){const state=await snapshot(page);assert.ok(!state.active||state.visible,JSON.stringify(state));assert.ok(state.hitCursor!=='none'||state.visible,JSON.stringify(state));assert.ok(state.allMarked<=1);if(state.visible)assert.equal(state.pointerEvents,'none');return state;}
async function native(page,selector,expected){const value=await hover(page,selector);assert.equal(value.state.active,false);assert.equal(value.state.visible,false);assert.notEqual(value.cursor,'none');if(expected)assert.equal(value.cursor,expected);return value;}
async function capture(page,name){await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});}

test('all nineteen release pages import cursor last, once, with independent IDs',()=>{
  assert.equal(pages.length,19);assert.ok(published.includes('assets/css/cursor.css'));assert.ok(published.includes('assets/js/cursor.js'));
  for(const file of pages){const html=sources.get(file).toString('utf8');assert.equal((html.match(/href="\/assets\/css\/cursor\.css"/g)||[]).length,1,file);assert.equal((html.match(/src="\/assets\/js\/cursor\.js"/g)||[]).length,1,file);assert.ok(html.indexOf('/assets/css/cursor.css')>html.indexOf('/assets/css/escena.css'),file);}
  const js=sources.get('assets/js/cursor.js').toString('utf8');assert.doesNotMatch(js,/fetch\(|localStorage|sessionStorage|\.netlify|supabase/i);assert.match(js,/clearHit\(\);[\s\S]*requestAnimationFrame/);assert.match(js,/ba-cursor-native-fallback/);
});
for(const file of ['buscARTE_busqueda.html','buscARTE_anuncios.html','buscARTE_mensajes.html'])test('reproduces and repairs vanished account-name pointer: '+file,async t=>{
  const before=await setup(t,{file,baseline:true});const bug=await hover(before.page,'#nav-avatar-btn');assert.equal(bug.cursor,'none');assert.ok(bug.state.legacy.every(display=>display==='none'));before.result.checks.push({confirmedBug:bug});await capture(before.page,'before-'+file);
  const after=await setup(t,{file});const fixed=await hover(after.page,'#nav-avatar-btn');assert.equal(fixed.state.visible,true);assert.equal(fixed.state.active,true);assert.equal(fixed.state.hitCursor,'none');after.result.checks.push({fixed});await capture(after.page,'after-'+file);
  await after.page.locator('#nav-avatar-btn').click();assert.equal((await snapshot(after.page)).active,false);
  for(const item of await after.page.locator('#nav-dropdown a').filter({visible:true}).all()){await item.hover();await after.page.waitForTimeout(50);assert.equal((await safeAtMouse(after.page)).visible,true);}
  await after.page.locator('#nav-avatar-btn').evaluate(el=>{const name=el.querySelector('.nav-avatar-name')||el.querySelector('span');if(name)name.textContent='Nombre dinámico';});
  assert.equal((await hover(after.page,'#nav-avatar-btn')).state.visible,true);
  await after.page.locator('#nav-dropdown a[href="buscARTE_perfil.html"]').click();await after.page.waitForURL(/buscARTE_perfil\.html/);assert.equal((await snapshot(after.page)).active,false);assert.equal((await hover(after.page,'#nav-avatar-btn')).state.visible,true);
});
for(const mode of ['guest','member'])for(const file of pages)test('desktop safe cursor on '+mode+' '+file,async t=>{
  const f=await setup(t,{file,mode});assert.equal((await snapshot(f.page)).active,false);
  const controls=f.page.locator('nav a[href],nav button,summary,#gen-lock-actions a[href],#ba-session-notice a[href]').filter({visible:true});
  const reachable=[];for(const item of await controls.all())if(await item.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !el.closest('[inert]')&&!!hit&&(hit===el||el.contains(hit));}))reachable.push(item);
  assert.ok(reachable.length>0,'Page has reachable navigation, including an access gate when appropriate');
  for(const item of reachable.slice(0,3)){await item.hover();await f.page.waitForTimeout(40);f.result.checks.push(await safeAtMouse(f.page));}
  // The pointer remains native during scroll/re-layout and resumes on movement.
  await f.page.evaluate(()=>document.dispatchEvent(new Event('scroll')));assert.equal((await snapshot(f.page)).active,false);
  const text=f.page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea').filter({visible:true});const editable=[];for(const item of await text.all())if(await item.evaluate(el=>!el.closest('[inert]')))editable.push(item);if(editable.length){const expected=(await editable[0].getAttribute('disabled'))!==null?'not-allowed':/^(file|range|color|button|submit|reset|image)$/.test(await editable[0].getAttribute('type'))?'pointer':'text';f.result.checks.push(await native(f.page,editable[0],expected));}
  if(['index.html','buscARTE_perfil_publico.html','buscARTE_mensajes.html'].includes(file))await capture(f.page,'desktop-'+mode+'-'+file);
});
for(const width of [320,390])for(const file of pages)test('touch '+width+' never paints fake pointer on '+file,async t=>{
  const f=await setup(t,{file,width,mode:/login|registro|reset|recuperar/.test(file)?'guest':'member'});
  await f.page.mouse.move(width/2,45);await f.page.waitForTimeout(40);assert.equal((await snapshot(f.page)).visible,false);assert.equal((await snapshot(f.page)).active,false);
  const control=f.page.locator('nav a[href],nav button,summary').filter({visible:true}).first();assert.notEqual(await control.evaluate(el=>getComputedStyle(el).cursor),'none');
  assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(['index.html','buscARTE_perfil.html'].includes(file))await capture(f.page,'touch-'+width+'-'+file);
});
for(const file of pages)test('no JavaScript leaves native pointer on '+file,async t=>{
  const f=await setup(t,{file,noJS:true,mode:'guest'});assert.equal(await f.page.locator('#ba-cursor').count(),0);
  const bad=await f.page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.cursor==='none';}).map(el=>el.tagName+'#'+el.id+'.'+el.className));assert.deepEqual(bad,[]);
});
test('render failure, hidden node, detached node and stalled frame always restore native cursor',async t=>{
  for(const options of [{noCSS:true},{brokenFrame:true},{oldEngine:true}]){const f=await setup(t,options);const value=await hover(f.page,'#nav-avatar-btn');assert.equal(value.state.active,false);assert.equal(value.state.visible,false);assert.equal(value.cursor,'pointer');f.result.checks.push(value);}
  for(const mutation of ['hide','remove','opacity']){const f=await setup(t);assert.equal((await hover(f.page,'#nav-avatar-btn')).state.visible,true);await f.page.evaluate(mutation=>{const c=document.getElementById('ba-cursor');if(mutation==='hide')c.style.setProperty('display','none','important');if(mutation==='remove')c.remove();if(mutation==='opacity')c.style.opacity='0';},mutation);await f.page.waitForTimeout(30);assert.equal((await snapshot(f.page)).active,false);assert.equal(await f.page.locator('#nav-avatar-btn').evaluate(el=>getComputedStyle(el).cursor),'pointer');}
});
for(const settings of [{reducedMotion:'reduce'},{forcedColors:'active'},{width:900}])test('accessibility/viewport native fallback '+JSON.stringify(settings),async t=>{const f=await setup(t,settings);await native(f.page,'#nav-avatar-btn','pointer');});
test('focus, window exit, iframe, modal, disabled control and text caret fall back safely',async t=>{
  const f=await setup(t,{file:'buscARTE_perfil.html'});
  for(const event of ['blur','pagehide','pageshow']){await hover(f.page,'#nav-avatar-btn');await f.page.evaluate(event=>window.dispatchEvent(new Event(event)),event);assert.equal((await snapshot(f.page)).active,false);}
  await hover(f.page,'#nav-avatar-btn');await f.page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerout',{relatedTarget:null})));assert.equal((await snapshot(f.page)).active,false);
  await native(f.page,'#bio-text','text');
  await f.page.evaluate(()=>abrirEliminarCuenta());await native(f.page,'.btn-delete-cancel','pointer');await native(f.page,'#delete-password-input','text');await native(f.page,'#btn-delete-confirm','not-allowed');await f.page.locator('.btn-delete-cancel').click();
  await f.page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='cursor-qa-frame';frame.src='about:blank';frame.style.cssText='position:fixed;left:100px;top:200px;width:300px;height:200px;z-index:200000;background:white';document.body.append(frame);});
  await hover(f.page,'#nav-avatar-btn');await f.page.mouse.move(180,270);await f.page.waitForTimeout(130);assert.equal((await snapshot(f.page)).active,false);await f.page.locator('#cursor-qa-frame').evaluate(el=>el.remove());
});
test('actual ads creation dialog and chat input preserve native caret and working controls',async t=>{
  const ads=await setup(t,{file:'buscARTE_anuncios.html'});await ads.page.evaluate(()=>openModal());assert.ok(await ads.page.locator('#modal').isVisible());await native(ads.page,'#modal button','pointer');
  const field=ads.page.locator('#modal input,#modal textarea').filter({visible:true}).first();if(await field.count())await native(ads.page,field,'text');
  const chat=await setup(t,{file:'buscARTE_mensajes.html'});await chat.page.locator('.conv-item').first().click();await chat.page.waitForSelector('#chat-input',{state:'visible'});await native(chat.page,'#chat-input','text');await chat.page.locator('#chat-input').fill('Borrador aislado, sin enviar.');await chat.page.locator('.quick-reply').first().hover();await chat.page.waitForTimeout(50);assert.equal((await safeAtMouse(chat.page)).visible,true);await capture(chat.page,'desktop-chat-custom-button');
});
test('artist cards, ad response and public profile actions are not intercepted; report modal stays native',async t=>{
  const search=await setup(t);assert.equal((await hover(search.page,'.musician-card')).state.visible,true);
  const ads=await setup(t,{file:'buscARTE_anuncios.html'});const action=ads.page.locator('.anuncio a[href],.anuncio button').filter({visible:true}).first();const adHover=await hover(ads.page,action);ads.result.checks.push(adHover);assert.equal((await safeAtMouse(ads.page)).visible,true,JSON.stringify(adHover));assert.equal(await action.evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
  const profile=await setup(t,{file:'buscARTE_perfil_publico.html'});for(const control of (await profile.page.locator('.btn-contact,.btn-save,.btn-share,#report-link').filter({visible:true}).all())){await control.hover();await profile.page.waitForTimeout(50);assert.equal((await safeAtMouse(profile.page)).visible,true);}
  await profile.page.evaluate(()=>abrirReporte());await native(profile.page,'.btn-report-cancel','pointer');await profile.page.locator('.report-option').last().click();await native(profile.page,'#report-detail','text');await profile.page.locator('.btn-report-cancel').click();await capture(profile.page,'desktop-profile-custom');
});
test('changing preferences and detaching the exact hovered target restore native state',async t=>{
  const f=await setup(t);assert.equal((await hover(f.page,'#nav-avatar-btn')).state.visible,true);await f.page.emulateMedia({reducedMotion:'reduce'});await f.page.waitForTimeout(30);assert.equal((await snapshot(f.page)).active,false);assert.equal(await f.page.locator('#nav-avatar-btn').evaluate(el=>getComputedStyle(el).cursor),'pointer');
  await f.page.emulateMedia({reducedMotion:'no-preference'});assert.equal((await hover(f.page,'#nav-avatar-btn')).state.visible,true);await f.page.evaluate(()=>document.querySelector('[data-ba-cursor-hit="true"]')?.remove());await f.page.waitForTimeout(30);assert.equal((await snapshot(f.page)).active,false);
});
