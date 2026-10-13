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
async function hover(page,selector){
  const el=(typeof selector==='string'?page.locator(selector):selector).filter({visible:true}).first();
  await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();assert.ok(box,String(selector));
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  return el.evaluate(el=>getComputedStyle(el).cursor);
}
function isCircle(value){return /^url\("data:image\/svg\+xml,/.test(value)&&/ 16 16, (auto|pointer|not-allowed|grab|progress)$/.test(value);}
async function validateSvg(page,value){
  assert.ok(isCircle(value),value);const uri=value.match(/^url\("([^"]+)"\)/)[1];
  await page.evaluate(uri=>{window.__qaCursorImage=new Image();window.__qaCursorImage.src=uri;},uri);
  // Disabled page JS also disables onload handlers. Read the browser's native
  // decoder state through explicit evaluations instead of an event callback.
  for(let i=0;i<30;i++){if(await page.evaluate(()=>window.__qaCursorImage.complete))break;await page.waitForTimeout(20);}
  return page.evaluate(uri=>{
    const source=decodeURIComponent(uri.slice('data:image/svg+xml,'.length)),xml=new DOMParser().parseFromString(source,'image/svg+xml');
    const image=window.__qaCursorImage,loaded=image.complete&&image.naturalWidth>0;
    return {loaded,width:image.naturalWidth,height:image.naturalHeight,parserErrors:xml.querySelectorAll('parsererror').length,circles:xml.querySelectorAll('circle').length,unsafe:!!xml.querySelector('script,foreignObject,image,animate'),stroke:[...xml.querySelectorAll('circle')].map(el=>el.getAttribute('stroke'))};
  },uri);
}
async function circle(page,selector){
  const value=await hover(page,selector);assert.ok(isCircle(value),value);assert.notEqual(value,'none');
  assert.equal(await page.locator('#ba-cursor,[data-ba-cursor-hit],[data-ba-cursor-active]').count(),0);
  return value;
}
async function native(page,selector,expected){const value=await hover(page,selector);assert.equal(value,expected);return value;}
async function capture(page,name){await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});}
async function noHiddenPointer(page){
  const bad=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.cursor==='none';}).map(el=>el.tagName+'#'+el.id+'.'+el.className));
  assert.deepEqual(bad,[]);
}
test('all nineteen pages share the browser cursor with fallback keywords; no custom rendering engine',()=>{
  assert.equal(pages.length,19);
  for(const file of pages){const html=sources.get(file).toString();assert.equal((html.match(/href="\/assets\/css\/cursor\.css"/g)||[]).length,1,file);assert.equal((html.match(/src="\/assets\/js\/cursor\.js"/g)||[]).length,1,file);assert.ok(html.indexOf('/assets/css/cursor.css')>html.indexOf('/assets/css/escena.css'),file);}
  const js=sources.get('assets/js/cursor.js').toString(),css=sources.get('assets/css/cursor.css').toString();
  assert.doesNotMatch(js,/fetch\(|localStorage|sessionStorage|requestAnimationFrame|setInterval|data-ba-cursor-active|\.netlify|supabase/i);
  assert.doesNotMatch(css,/cursor\s*:\s*none/i);assert.match(css,/16 16,auto/);assert.match(css,/16 16,pointer/);assert.match(js,/ba-cursor-native-fallback/);
});
for(const file of ['buscARTE_busqueda.html','buscARTE_anuncios.html','buscARTE_mensajes.html'])test('continuous account/menu movement, clicks and scrolling never changes to a native arrow: '+file,async t=>{
  const f=await setup(t,{file});const first=await circle(f.page,'#nav-avatar-btn');const svg=await validateSvg(f.page,first);f.result.checks.push({svg});assert.deepEqual({...svg,stroke:undefined},{loaded:true,width:32,height:32,parserErrors:0,circles:3,unsafe:false,stroke:undefined});
  await f.page.evaluate(()=>{window.__cursorSequence=[];const sample=event=>{const el=document.elementFromPoint(event.clientX||window.__mouseX||0,event.clientY||window.__mouseY||0);if(event.type==='pointermove'){window.__mouseX=event.clientX;window.__mouseY=event.clientY;}window.__cursorSequence.push({phase:event.type,cursor:el&&getComputedStyle(el).cursor});};for(const name of ['pointermove','pointerdown','pointerup','click'])document.addEventListener(name,sample,{passive:true});});
  let box=await f.page.locator('#nav-avatar-btn').boundingBox();await f.page.mouse.move(box.x+8,box.y+box.height/2);await f.page.mouse.move(box.x+box.width-10,box.y+box.height/2,{steps:25});
  await f.page.locator('#nav-avatar-btn').click();await circle(f.page,'#nav-dropdown a');
  await f.page.locator('#nav-avatar-btn').evaluate(el=>{const span=el.querySelector('span');if(span)span.textContent='Nombre dinámico';});
  await circle(f.page,'#nav-avatar-btn');
  const samples=await f.page.evaluate(()=>window.__cursorSequence);f.result.checks.push({samples});assert.ok(samples.length>=25);assert.ok(samples.every(item=>isCircle(item.cursor)),JSON.stringify(samples.filter(item=>!isCircle(item.cursor))));
  await f.page.locator('#nav-avatar-btn').click();await f.page.mouse.move(1200,650);await f.page.mouse.wheel(0,230);await f.page.waitForTimeout(80);
  const afterScroll=await f.page.evaluate(()=>getComputedStyle(document.elementFromPoint(1200,650)).cursor);assert.ok(isCircle(afterScroll),afterScroll);
  await noHiddenPointer(f.page);await capture(f.page,'continuous-'+file);
});
for(const mode of ['guest','member'])for(const file of pages)test('desktop browser cursor is safe on '+mode+' '+file,async t=>{
  const f=await setup(t,{file,mode});
  const controls=f.page.locator('nav a[href],nav button,summary,#gen-lock-actions a[href],#ba-session-notice a[href]').filter({visible:true});
  const reachable=[];for(const item of await controls.all())if(await item.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !el.closest('[inert]')&&!!hit&&(hit===el||el.contains(hit));}))reachable.push(item);
  assert.ok(reachable.length);for(const item of reachable.slice(0,3))f.result.checks.push({cursor:await circle(f.page,item)});
  await noHiddenPointer(f.page);
  if(['index.html','buscARTE_perfil_publico.html'].includes(file))await capture(f.page,'desktop-'+mode+'-'+file);
});
for(const width of [320,390])for(const file of pages)test('touch '+width+' remains native on '+file,async t=>{
  const f=await setup(t,{file,width,mode:/login|registro|reset|recuperar/.test(file)?'guest':'member'});
  await f.page.mouse.move(width/2,45);const control=f.page.locator('nav a[href],nav button,summary').filter({visible:true}).first();
  const value=await control.evaluate(el=>getComputedStyle(el).cursor);assert.ok(!value.startsWith('url('));assert.notEqual(value,'none');assert.equal(await f.page.locator('#ba-cursor').count(),0);
  assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await noHiddenPointer(f.page);
  if(file==='index.html')await capture(f.page,'touch-'+width+'-'+file);
});
for(const file of pages)test('no JavaScript still has a valid browser-rendered circle and native fields: '+file,async t=>{
  const f=await setup(t,{file,noJS:true,mode:'guest'});await noHiddenPointer(f.page);
  const value=await f.page.locator('nav a[href],nav button').filter({visible:true}).first().evaluate(el=>getComputedStyle(el).cursor);
  const image=await validateSvg(f.page,value);assert.equal(image.loaded,true);assert.equal(image.width,32);assert.equal(image.height,32);
  assert.equal(await f.page.locator('#ba-cursor').count(),0);
});
for(const settings of [{reducedMotion:'reduce'},{forcedColors:'active'},{width:900}])test('accessibility/viewport has native fallback '+JSON.stringify(settings),async t=>{const f=await setup(t,settings);await native(f.page,'#nav-avatar-btn','pointer');await noHiddenPointer(f.page);});
test('failed CSS, stalled RAF and unsupported old DOM engine never create an invisible cursor',async t=>{
  const css=await setup(t,{noCSS:true});await native(css.page,'#nav-avatar-btn','pointer');await noHiddenPointer(css.page);
  for(const options of [{brokenFrame:true},{oldEngine:true}]){const f=await setup(t,options);await circle(f.page,'#nav-avatar-btn');await noHiddenPointer(f.page);}
  const f=await setup(t);await f.page.evaluate(()=>document.documentElement.style.setProperty('--ba-circle-cursor','url("data:image/svg+xml,broken")'));
  const value=await hover(f.page,'#nav-avatar-btn');assert.match(value,/16 16, pointer$/);assert.notEqual(value,'none');
  const failed=await validateSvg(f.page,value);assert.equal(failed.loaded,false);f.result.checks.push({failedImageWithVisibleNativeFallbackKeyword:value});
});
test('all ten discipline colors and a runtime context change retain a valid circle',async t=>{
  const f=await setup(t);for(const color of ['#d4f53c','#ff6b5b','#5b9fff','#4de8c4','#ffaa5b','#c45bff','#5bd4ff','#e8a84a','#ffdd5b','#a0d47b']){
    await f.page.evaluate(color=>document.documentElement.style.setProperty('--neon',color),color);await f.page.waitForFunction(color=>decodeURIComponent(document.documentElement.style.getPropertyValue('--ba-circle-cursor')).includes(color),color);
    const value=await circle(f.page,'#nav-avatar-btn'),svg=await validateSvg(f.page,value);assert.equal(svg.loaded,true);assert.ok(svg.stroke.includes(color));f.result.checks.push({color,svg});
  }
});
test('dialogs, chat controls, disabled buttons and fields maintain the intended cursor without toggling',async t=>{
  const profile=await setup(t,{file:'buscARTE_perfil.html'});await native(profile.page,'#bio-text','text');await profile.page.evaluate(()=>abrirEliminarCuenta());
  await circle(profile.page,'.btn-delete-cancel');await circle(profile.page,'#btn-delete-confirm');await native(profile.page,'#delete-password-input','text');await profile.page.locator('.btn-delete-cancel').click();await circle(profile.page,'#nav-avatar-btn');
  const ads=await setup(t,{file:'buscARTE_anuncios.html'});await ads.page.evaluate(()=>openModal());await circle(ads.page,'#modal button');const field=ads.page.locator('#modal input,#modal textarea').filter({visible:true}).first();await native(ads.page,field,'text');
  const chat=await setup(t,{file:'buscARTE_mensajes.html'});await chat.page.locator('.conv-item').first().click();await chat.page.waitForSelector('#chat-input',{state:'visible'});await native(chat.page,'#chat-input','text');await circle(chat.page,'.quick-reply');await chat.page.locator('.quick-reply').first().click();await circle(chat.page,'.quick-reply');await noHiddenPointer(chat.page);
});
