/* Release QA: production sources, synthetic data, fail-closed network.
 * Nothing from this file, preview/ or the fixture runtime belongs in dist/.
 * This verifies frontend behavior, not live database permissions or native APKs.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.BUSCARTE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4199'; // Virtual origin; no listening server is required.
let releaseBytes;
const read = file => (releaseBytes?.get(file) || fs.readFileSync(path.join(root, file))).toString('utf8');
const allowed = new Set(JSON.parse(read('site-files.json')));
// One immutable candidate for the entire run, even if another worker is editing.
releaseBytes = new Map([...allowed].map(file=>[file,fs.readFileSync(path.join(root,file))]));
const htmlFiles = [...allowed].filter(file => file.endsWith('.html'));
const palette = { musica:'#d4f53c', actuacion:'#ff6b5b', audiovisual:'#5b9fff', modelaje:'#4de8c4', diseno:'#ffaa5b', tatuaje:'#c45bff', danza:'#5bd4ff', maquillaje:'#e8a84a', circo:'#ffdd5b', escritura:'#a0d47b' };
const results = [];
const output = path.resolve(process.env.BUSCARTE_QA_OUTPUT || path.join(root, '..', 'BuscARTE-resguardos', 'escena-release-' + new Date().toISOString().replace(/[:.]/g, '-')));
assert.ok(!output.startsWith(root + path.sep), 'QA artifacts must stay outside the source/public package');
fs.mkdirSync(output, { recursive:true });

// Reuse the isolated transport, not its proposed multidiscipline behavior.
// Every row here retains one real legacy category. No MD UI is loaded.
let transport = read('scripts/fixtures/legacy-runtime.js');
const demoStart = transport.indexOf('  function demoProfile(');
const demoEnd = transport.indexOf('  function json(', demoStart);
assert.ok(demoStart > 0 && demoEnd > demoStart, 'Known synthetic transport boundary');
transport = transport.slice(0, demoStart) + '  function demoProfile(row) { return { ...clone(row), foto_url: localPhoto(row.foto_url) }; }\n' + transport.slice(demoEnd);
transport = transport.replace("url.hostname === 'xiaanchoanxmamgoay.supabase.co' || ", ''); // Never hide a mistyped production project URL.
// Mock the current additive save contract using its pure preparation helper.
// This is a frontend fixture, not a running function/DB/security certification.
const disciplineContractBytes = fs.readFileSync(path.join(root,'netlify/lib/disciplinas.mjs'));
const disciplineContract = disciplineContractBytes.toString('utf8').replace(/\bexport\s+/g,'').replaceAll('Buffer.byteLength(', 'qaByteLength(');
transport = transport.replace('  const currentId =', `
  for (const row of state.perfiles) { row.disciplinas ??= null; row.perfil_revision ??= 0; }
  const qaDisciplineContract = (function(){
    const qaByteLength = value => new TextEncoder().encode(value).length;
    ${disciplineContract}
    return { prepareProfileChanges };
  })();
  const currentId =`);
transport = transport.replace("      if (key in profileLimits)", "      if (key === 'disciplinas') return value && typeof value === 'object' && !Array.isArray(value);\n      if (value === null && ['instrumento','generos','referentes','disponibilidad','donde_ensaya','experiencia','campos_especificos'].includes(key)) return true;\n      if (key in profileLimits)");
// Model the new cookie/proxy contracts inside the isolated fixture closure.
// Synthetic server identity is bootstrapped once, before production verification;
// subsequent cache writes are not a new session. No actual cookie or API is used.
transport = transport.replace('  async function api(request, url) {', `
  let qaSessionId = null, qaSessionReady = false;
  global.__qaExpireSession = () => { qaSessionReady = true; qaSessionId = null; };
  async function api(request, url) {
    if (url.pathname === '/.netlify/functions/datos') {
      const path = url.searchParams.get('path');
      if (!path || !/^\\/(?:rest\\/v1\\/|storage\\/v1\\/object\\/)/.test(path) || path.startsWith('//')) return fail('Fixture: unknown gateway path.', 403);
      const target = new URL(path, 'https://xiaanchoanxmampegoay.supabase.co');
      if (target.origin !== 'https://xiaanchoanxmampegoay.supabase.co') return fail('Fixture: external gateway blocked.', 403);
      return safeFetch(new Request(target.href, request));
    }
    if (url.pathname === '/.netlify/functions/sesion') {
      if (!qaSessionReady) { qaSessionReady = true; qaSessionId = currentId() || null; }
      const user = state.perfiles.find(row => sameId(row.id, qaSessionId));
      if (request.method === 'GET') return user ? json({ user: Object.fromEntries(['id','nombre','email','tipo_cuenta','rubro','referentes','generos','baneado','disciplinas','perfil_revision'].map(key => [key,user[key]])) }) : json({ error:'Fixture session required.', code:'SESSION_REQUIRED' },401);
      if (request.method === 'POST') { const payload = await request.clone().json(); if (payload.action !== 'logout') return fail('Fixture: invalid logout.',400); qaSessionId = null; global.BuscARTEPreview.logout(); return json({ok:true}); }
      return fail('Fixture: session method denied.',405);
    }
`);
const saveStart=transport.indexOf("    if (route === '/.netlify/functions/guardar-perfil') {"),saveEnd=transport.indexOf("    if (route === '/.netlify/functions/send-email')",saveStart);
assert.ok(saveStart>0&&saveEnd>saveStart,'Known synthetic save boundary');
transport=transport.slice(0,saveStart)+`
    if (route === '/.netlify/functions/moderacion') {
      if (method !== 'GET') return fail('Fixture: moderation mutations require their own test.',405);
      return qaSessionId ? json({blocked_by_me:false,restricted:false}) : fail('Fixture session required.',401);
    }
    if (route === '/.netlify/functions/email-preferences') {
      if (method !== 'GET') return fail('Fixture: preference mutations require their own test.',405);
      return qaSessionId ? json({marketing_opt_in:false,onboarding_disabled:false}) : fail('Fixture session required.',401);
    }
    if (route === '/.netlify/functions/guardar-perfil') {
      if (method !== 'POST') return fail('Fixture: save method denied.',405);
      const user=state.perfiles.find(row=>sameId(row.id,qaSessionId));
      if(!user)return fail('Fixture session required.',401);
      if(Object.hasOwn(input,'email')||Object.hasOwn(input,'password'))return fail('Fixture: session save must not send credentials.',400);
      if(!sameId(user.id,input.profileId))return fail('Fixture: owner mismatch.',403);
      if(input.operation==='verify'&&input.changes&&!Object.keys(input.changes).length)return json([{id:user.id}]);
      if(!validProfileChanges(input.changes)||input.changes.tipo_cuenta&&input.changes.tipo_cuenta!==user.tipo_cuenta)return fail('Fixture: invalid profile changes.',400);
      let prepared;
      try{prepared=qaDisciplineContract.prepareProfileChanges(user,input.changes,input.expectedRevision);}
      catch(error){return error.message==='conflict'?json({error:'El perfil cambió en otra pestaña.',code:'PROFILE_CONFLICT'},409):fail('Fixture: invalid discipline contract.',400);}
      Object.assign(user,prepared);persist();
      const fields=['id',...Object.keys(profileLimits),'edad','experiencia','campos_especificos','rubro','tipo_cuenta','foto_url','disciplinas','perfil_revision'];
      return json([Object.fromEntries(fields.filter(key=>Object.hasOwn(user,key)).map(key=>[key,user[key]]))]);
    }
`+transport.slice(saveEnd);
new vm.Script(transport,{filename:'isolated-release-transport.js'});
transport = transport.replace("Object.keys(input).every(key => key === 'visitas')", "Object.keys(input).every(key => key === 'visitas' || key === 'vistas')");
transport += `\n(function(){
  delete document.documentElement.dataset.baPreview;
  delete document.documentElement.dataset.baOption;
  window.__qaTransportCalls=[];
  const fixtureFetch=window.fetch;
  window.fetch=(input,options)=>{
    const request=new Request(input instanceof Request?input:new URL(String(input),location.origin),options);
    const url=new URL(request.url);
    const target=url.pathname==='/.netlify/functions/datos' ? new URL(url.searchParams.get('path'),'https://xiaanchoanxmampegoay.supabase.co') : url;
    if(target.pathname.startsWith('/rest/v1/')||target.pathname.startsWith('/.netlify/functions/')) window.__qaTransportCalls.push({method:request.method,path:target.pathname,query:target.search,proxy:url.pathname==='/.netlify/functions/datos'});
    return fixtureFetch(input,options);
  };
  Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.__qaShared=true;}});
})();`;
let browser;
before(async () => { browser = await chromium.launch({ headless:true, channel:process.platform === 'win32' ? 'msedge' : undefined }); });
after(async () => {
  await browser?.close();
  const sourceDrift=[...releaseBytes].filter(([file,bytes])=>!fs.readFileSync(path.join(root,file)).equals(bytes)).map(([file])=>file);
  if(!fs.readFileSync(path.join(root,'netlify/lib/disciplinas.mjs')).equals(disciplineContractBytes))sourceDrift.push('fixture-contract:netlify/lib/disciplinas.mjs');
  const finalAllowed=JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'));
  if(JSON.stringify(finalAllowed)!==JSON.stringify([...allowed]))sourceDrift.push('site-files.json');
  fs.writeFileSync(path.join(output,'escena-release.json'), JSON.stringify({ at:new Date().toISOString(), output, scope:'Production frontend with synthetic session/gateway transport. All requests fulfilled locally or aborted; fonts use system fallback. Not live DB/RLS/Auth/email/native-app certification.', sourceDrift, fixtureContractHash:createHash('sha256').update(disciplineContractBytes).digest('hex'), sourceHashes:Object.fromEntries([...releaseBytes].map(([file,bytes])=>[file,createHash('sha256').update(bytes).digest('hex')])), results }, null, 2));
  console.log('QA evidence: ' + output);
  assert.deepEqual(sourceDrift,[],'No late source change is certified by an older QA snapshot');
});

function localFile(url) {
  let file = decodeURIComponent(url.pathname).replace(/^\//,'');
  if (!file) file='index.html';
  if (!allowed.has(file) && allowed.has(file+'.html')) file+='.html';
  return allowed.has(file) ? file : null;
}
async function setup(t, route, { width=390, mode='member', user=9001, reducedMotion='reduce' } = {}) {
  const context=await browser.newContext({ viewport:{width,height:844}, isMobile:width<901, hasTouch:width<901, serviceWorkers:'block', reducedMotion });
  const result={test:t.name,route,width,mode,resources:[],unexpected:[],pageErrors:[],consoleErrors:[]};results.push(result);
  // The first script in <head> sees an actual documentElement and still precedes
  // EVERY production inline/external script. addInitScript itself runs too early
  // for this DOM-aware demo transport; all native network is separately blocked.
  const isolatedHead=transport+`\n${mode==='guest'?'window.BuscARTEPreview.logout();':`window.BuscARTEPreview.useAccount(${user});`}`;
  if(typeof context.routeWebSocket==='function') await context.routeWebSocket('**/*',socket=>{result.unexpected.push('WebSocket '+socket.url());socket.close();});
  await context.route('**/*',async routeHandler=>{
    const req=routeHandler.request(), url=new URL(req.url());
    const file=url.origin===origin && req.method()==='GET' ? localFile(url) : null;
    if(file && file!=='sw.js') {
      result.resources.push(file);
      const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.xml':'application/xml','.txt':'text/plain'}[path.extname(file)]||'application/octet-stream';
      let body=releaseBytes.get(file);
      if(file.endsWith('.html'))body=Buffer.from(body.toString('utf8').replace(/<head(?:\s[^>]*)?>/i,match=>match+'\n<script>'+isolatedHead.replace(/<\/script/gi,'<\\/script')+'</script>'));
      return routeHandler.fulfill({contentType:type,body});
    }
    if(req.method()==='GET' && url.origin===origin && url.pathname==='/favicon.ico')return routeHandler.fulfill({status:204,body:''});
    if(req.method()==='GET' && url.hostname==='fonts.googleapis.com')return routeHandler.fulfill({contentType:'text/css',body:''});
    if(req.method()==='GET' && url.hostname==='js.hcaptcha.com')return routeHandler.fulfill({contentType:'application/javascript',body:'// Synthetic transport owns captcha; provider never contacted.'});
    result.unexpected.push(req.method()+' '+url.origin+url.pathname);
    return routeHandler.abort('blockedbyclient'); // Never continue/fetch/fallback.
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);
  page.on('pageerror',error=>result.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push(message.text());});
  page.on('dialog',async dialog=>{result.unexpected.push('Unexpected native dialog: '+dialog.message());await dialog.dismiss();});
  t.after(async()=>{
    try {
      result.transport=await page.evaluate(()=>window.__qaTransportCalls||[]).catch(()=>[]);
      assert.deepEqual(result.unexpected,[],'No unforeseen requests reached the network');
      assert.deepEqual(result.pageErrors,[],'No unhandled browser exceptions');
    }finally{await context.close();}
  });
  await page.goto(origin+'/'+route,{waitUntil:'load'});
  // Anonymous private pages legitimately replace the document during bootstrap.
  // Wait for that expected redirect before consulting its fonts/rendered state.
  if(mode==='guest'&&['buscARTE_perfil.html','buscARTE_mensajes.html','buscARTE_guardados.html','buscARTE_mis_anuncios.html'].includes(route.split('?')[0])){
    await page.waitForURL(/buscARTE_login\.html/);await page.waitForLoadState('load');
  }
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!!document.body.dataset.a2Page);
  return {page,result,context};
}
async function capture(page,name){await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});}
async function metrics(page){
  return page.evaluate(()=>{
    const visible=el=>!!el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && +getComputedStyle(el).opacity!==0 && !el.closest('[aria-hidden="true"]');
    const body=document.body;
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
    const images=[...document.images].filter(visible).filter(el=>el.complete && !el.naturalWidth).map(el=>el.getAttribute('src'));
    const nav=[...document.querySelectorAll('nav a,nav button,#nav-avatar-btn')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};});
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,page:body.dataset.a2Page,world:body.dataset.a2World,duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),brokenImages:images,nav};
  });
}
async function contrast(page){
  return page.evaluate(()=>{
    const parse=value=>{const m=value.match(/^rgba?\(([^)]+)\)$/);if(!m)return null;const p=m[1].split(/[, ]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],p[3]===undefined?1:p[3]];};
    const mix=(fg,bg)=>[0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3]));
    const luminance=color=>color.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
    const visible=el=>!!el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && !el.closest('[aria-hidden="true"]');
    const answer={checked:0,complex:0,failures:[]};
    for(const el of document.querySelectorAll('body *')){
      if(!visible(el)||el.matches('script,style,img,svg,[disabled]'))continue;
      const text=[...el.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent.trim()).join(' ').trim();
      const placeholder=el.matches('input,textarea')&&!el.value?el.getAttribute('placeholder'):'';
      if(!text&&!placeholder)continue;
      const style=getComputedStyle(el),foreground=parse(placeholder?getComputedStyle(el,'::placeholder').color:style.color);if(!foreground)continue;
      const layers=[];let opaque=false,complex=false;
      for(let node=el;node;node=node.parentElement){
        const s=getComputedStyle(node),background=parse(s.backgroundColor);
        if(+s.opacity<.999||s.filter!=='none'||s.backgroundImage!=='none'){complex=true;break;}
        if(background){layers.push(background);if(background[3]>=.999){opaque=true;break;}}
      }
      if(complex||!opaque){answer.complex++;continue;}
      let background=layers.pop().slice(0,3);while(layers.length)background=mix(layers.pop(),background);
      const fg=mix(foreground,background),a=luminance(fg),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&+style.fontWeight>=700),minimum=large?3:4.5;
      answer.checked++;if(ratio+.01<minimum)answer.failures.push({selector:el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className).trim().replace(/\s+/g,'.'),text:(text||placeholder).slice(0,100),ratio:+ratio.toFixed(2),minimum});
    }
    return answer;
  });
}

test('release imports, assets and navigation targets are explicit; no prototype code is published',()=>{
  assert.equal(htmlFiles.length,19);
  const banned=/(?:preview\/|fixture-runtime|ba_preview_|BuscARTEPreview|BuscartePreview|PreviewDisciplinas|ba-preview-tools|option-[bc]\.|disciplinas\.html)/i;
  for(const file of allowed){
    assert.ok(!file.startsWith('preview/') && !file.startsWith('docs/') && !file.startsWith('scripts/'),file);
    assert.ok(fs.existsSync(path.join(root,file)),file);
    if(/\.(?:html|js|css)$/.test(file)){
      const source=read(file);assert.doesNotMatch(source,banned,file+' has no preview/prototype dependency');
      if(file.endsWith('.js'))new vm.Script(source,{filename:file});
      if(file.endsWith('.html')){
        assert.match(source,/<html\b[^>]*data-ba-design="a2"/i,file+' opts into the real selected design');
        assert.equal((source.match(/src="\/assets\/js\/escena\.js"/g)||[]).length,1,file);
        assert.equal((source.match(/src="\/assets\/js\/escena-fondos\.js"/g)||[]).length,1,file);
        assert.equal((source.match(/href="\/assets\/css\/escena\.css"/g)||[]).length,1,file);
        for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src\s*=|ld\+json/.test(match[1]))new vm.Script(match[2],{filename:file});
        for(const match of source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)){
          const raw=match[1];if(/^(?:https?:|data:|javascript:|mailto:|tel:|#)/.test(raw)||raw.includes('${'))continue;
          const parsed=new URL(raw,origin+'/'+file),target=localFile(parsed);
          if(/\.(?:html|js|css|webp|png|jpg|json)(?:[?#]|$)/.test(raw))assert.ok(target,file+': '+raw+' is allowlisted');
        }
      }
    }
  }
  for(const key of [...Object.keys(palette),'gestures'])for(const size of [320,640])assert.ok(allowed.has(`assets/art/worlds/${key}-${size}.webp`));
  const scene=read('assets/js/escena.js')+read('assets/js/escena-fondos.js');
  assert.doesNotMatch(scene,/\.netlify\/functions|method\s*:\s*['"](?:POST|PATCH|DELETE)|supabase\.auth|localStorage\.(?:clear|removeItem)/i,'Design layer does not add writes/Auth changes');
});

const routes=htmlFiles.map(file=>file==='buscARTE_perfil_publico.html'?file+'?id=9015':file==='buscARTE_anuncio_detalle.html'?file+'?id=9104':file==='buscARTE_mensajes.html'?file+'?conversacion=9201':file);
routes.push('buscARTE_anuncios.html?tipo=vende');
for(const width of [320,390])for(const route of routes){
  test(`${width}px: ${route} renders production A2 without overflow or missing static images`,async t=>{
    const f=await setup(t,route,{width,mode:/login|registro|recuperar|reset|contacto/.test(route)?'guest':'member'});
    if(route.includes('busqueda'))await f.page.waitForSelector('.musician-card');
    if(route.includes('perfil_publico'))await f.page.waitForFunction(()=>document.body.dataset.profileState==='other');
    if(route.includes('anuncio_detalle'))await f.page.waitForSelector('.detail-hero-card');
    if(route==='buscARTE_perfil.html')await f.page.waitForFunction(()=>typeof isLoadingProfile!=='undefined' && !isLoadingProfile);
    f.result.metrics=await metrics(f.page);
    f.result.contrast=await contrast(f.page);
    assert.equal(f.result.metrics.width,width);
    assert.ok(f.result.metrics.scrollWidth<=width+1,JSON.stringify(f.result.metrics));
    for(const item of f.result.metrics.nav)assert.ok(item.left>=-1 && item.right<=width+1,'Visible nav action is not clipped even if body hides overflow: '+JSON.stringify(item));
    assert.deepEqual(f.result.metrics.duplicateIds,[], 'IDs are unique after enhancement');
    assert.deepEqual(f.result.metrics.brokenImages,[],'Visible images loaded from explicit package');
    assert.equal(await f.page.locator('.ba-preview-tools,.md-callout,.md-profile-tag').count(),0);
    await capture(f.page,`${width}-${route.replace(/[^a-z0-9]/gi,'-')}`);
  });
}

// Security must not turn public discovery into a login wall. Private pages,
// conversely, must route anonymous people to the existing login with a return.
const privateRoutes = new Set(['buscARTE_perfil.html','buscARTE_mensajes.html','buscARTE_guardados.html','buscARTE_mis_anuncios.html','buscARTE_generador.html']);
for(const width of [320,1440])for(const route of routes.filter(route=>!privateRoutes.has(route.split('?')[0]))) {
  test(`${width}px guest: ${route} remains publicly browsable with the secure transport`,async t=>{
    const f=await setup(t,route,{width,mode:'guest'});
    await f.page.waitForFunction(()=>window.BuscARTESesion?.status==='anonymous');
    if(route.includes('busqueda'))await f.page.waitForSelector('.musician-card');
    if(route.includes('perfil_publico'))await f.page.waitForFunction(()=>document.body.dataset.profileState==='other');
    if(route.includes('anuncio_detalle'))await f.page.waitForSelector('.detail-hero-card');
    if(route.includes('anuncios'))await f.page.waitForSelector('.anuncio');
    const target=new URL(route,origin);
    assert.equal(new URL(f.page.url()).pathname,target.pathname,'Public browsing is not redirected to login');
    f.result.metrics=await metrics(f.page);f.result.contrast=await contrast(f.page);
    assert.ok(f.result.metrics.scrollWidth<=width+1,JSON.stringify(f.result.metrics));
    assert.deepEqual(f.result.metrics.duplicateIds,[]);assert.deepEqual(f.result.metrics.brokenImages,[]);
    if(route.includes('perfil_publico'))assert.equal(await f.page.locator('#edit-profile-link').isVisible(),false);
    if(route.endsWith('index.html'))assert.equal(await f.page.locator('#nav-guest').isVisible(),true);
    await capture(f.page,`${width}-guest-${route.replace(/[^a-z0-9]/gi,'-')}`);
  });
}
for(const route of privateRoutes) {
  test(`320px guest: ${route} safely offers login instead of another person's private state`,async t=>{
    const f=await setup(t,route,{width:320,mode:'guest'});
    if(route==='buscARTE_generador.html') {
      // This local Music-only tool keeps its established access overlay;
      // it has no private API data that requires an automatic redirect.
      await f.page.waitForFunction(()=>window.BuscARTESesion?.status==='anonymous');
      assert.equal(await f.page.locator('#gen-lock').isVisible(),true);
      assert.equal(await f.page.locator('main').getAttribute('inert'),'');
      assert.ok(await f.page.locator('#gen-lock-actions a[href="buscARTE_login.html"]').isVisible());
      await capture(f.page,'320-private-gate-generador');
      return;
    }
    await f.page.waitForURL(/buscARTE_login\.html/);
    const url=new URL(f.page.url());
    assert.ok(url.searchParams.get('redirect')?.includes(route),'Return destination is preserved');
    assert.equal(await f.page.locator('.conv-item,.profile-progress,.mi-anuncio,.saved-card').count(),0,'Private UI is not carried into login');
    await capture(f.page,'320-private-login-'+route.replace(/[^a-z0-9]/gi,'-'));
  });
}

for(const [key,color]of Object.entries(palette))test(`320px: ${key} keeps the original color, distinct artwork and filter behavior`,async t=>{
  const f=await setup(t,'buscARTE_busqueda.html?rubro='+key,{width:320});
  await f.page.waitForSelector('.musician-card');
  await f.page.waitForFunction(key=>document.body.dataset.a2World===key,key);
  const data=await f.page.evaluate(()=>({color:document.documentElement.style.getPropertyValue('--neon').trim(),art:document.body.style.getPropertyValue('--a2-world-detail'),world:document.body.dataset.a2World,width:innerWidth,scroll:document.documentElement.scrollWidth}));
  f.result.context=data;assert.equal(data.color,color);assert.equal(data.world,key);assert.match(data.art,new RegExp(key+'-320\\.webp'));assert.ok(data.scroll<=321);
  const chooser=f.page.locator('.ba-rubro-chooser');assert.equal(await chooser.getAttribute('open'),null);await chooser.locator('summary').click();assert.notEqual(await chooser.getAttribute('open'),null);
  assert.ok(await f.page.locator('#section-switcher').isVisible());
});

const fixtureIds={musica:9001,actuacion:9010,audiovisual:9011,modelaje:9012,diseno:9013,tatuaje:9014,danza:9015,maquillaje:9016,circo:9017,escritura:9018};
for(const [key,id] of Object.entries(fixtureIds))for(const kind of ['public','editor'])test(`320px: ${key} ${kind} profile keeps single-category fields and context`,async t=>{
  const route=kind==='public'?'buscARTE_perfil_publico.html?id='+id:'buscARTE_perfil.html';
  const f=await setup(t,route,{width:320,user:kind==='editor'?id:9001});
  if(kind==='public')await f.page.waitForFunction(()=>['own','other'].includes(document.body.dataset.profileState));
  else await f.page.waitForFunction(()=>typeof isLoadingProfile!=='undefined' && !isLoadingProfile);
  await f.page.waitForFunction(key=>document.body.dataset.a2World===key,key);
  f.result.metrics=await metrics(f.page);f.result.contrast=await contrast(f.page);
  assert.equal(f.result.metrics.world,key);assert.ok(f.result.metrics.scrollWidth<=321);
  assert.deepEqual(f.result.contrast.failures,[],'Known solid fields/chips remain readable; complex backgrounds require visual review');
  if(kind==='public'){
    assert.equal(await f.page.locator('#edit-profile-link').isVisible(),id===9001);
    assert.equal(await f.page.locator('#contact-profile-btn').isVisible(),id!==9001);
    const affinity=await f.page.locator('.profile-match-hero').evaluate(el=>({visible:!!el.getClientRects().length && getComputedStyle(el).display!=='none',text:el.innerText.trim()}));
    assert.ok(!affinity.visible || !!affinity.text,'No empty decorative affinity rectangle before profile actions');
  }else{
    assert.equal(await f.page.locator('#musica').isVisible(),key==='musica');
    assert.equal(await f.page.locator('#mi-rubro').isVisible(),key!=='musica');
  }
  assert.equal(await f.page.locator('.md-callout,.md-profile-tag,a[href*="disciplinas.html"]').count(),0);
  await capture(f.page,'320-'+key+'-'+kind);
});

test('profile reads explicitly select presentation fields, never passwords/reset data; only the owner editor keeps email',async t=>{
  for(const kind of ['public','editor']){
    const f=await setup(t,kind==='public'?'buscARTE_perfil_publico.html?id=9015':'buscARTE_perfil.html',{width:390});
    if(kind==='public')await f.page.waitForFunction(()=>document.body.dataset.profileState==='other');
    else await f.page.waitForFunction(()=>typeof isLoadingProfile!=='undefined' && !isLoadingProfile);
    const reads=await f.page.evaluate(()=>window.__qaTransportCalls.filter(call=>call.path==='/rest/v1/perfiles'));
    f.result.profileReads=reads;assert.ok(reads.length>0);
    for(const call of reads){
      assert.equal(call.method,'GET');const selected=new URLSearchParams(call.query).get('select');
      assert.ok(selected && selected!=='*','Every profile fetch has an explicit projection');
      assert.doesNotMatch(selected,/password|reset|token|secret/i,'No credential/recovery field crosses into the frontend');
      if(kind==='public')assert.ok(!selected.split(',').includes('email'),'Public presentation does not request email');
    }
    if(kind==='editor')assert.ok(reads.some(call=>new URLSearchParams(call.query).get('select').split(',').includes('email')),'Owner save can still confirm its email');
  }
});

test('public profile ignores a wrong URL category once its stored category is known',async t=>{
  const f=await setup(t,'buscARTE_perfil_publico.html?id=9015&rubro=tatuaje',{width:390});
  await f.page.waitForFunction(()=>document.body.dataset.profileState==='other');
  await f.page.waitForFunction(()=>document.body.dataset.a2World==='danza');
  const category=await f.page.evaluate(()=>({stored:perfilCargado.rubro,color:document.documentElement.style.getPropertyValue('--neon').trim(),world:document.body.dataset.a2World}));
  f.result.profileCategory=category;assert.equal(category.stored,'danza');assert.equal(category.color,palette.danza);assert.equal(category.world,'danza');
  assert.match(await f.page.locator('#perfil-instrumento').textContent(),/Bailar/i);
  assert.match(await f.page.locator('#stat-genero').textContent(),/Contemporáneo/i);
  await capture(f.page,'390-profile-wrong-query-real-danza');
});

for(const route of ['index.html','buscARTE_busqueda.html?rubro=tatuaje','buscARTE_anuncios.html?rubro=actuacion','buscARTE_anuncios.html?tipo=vende','buscARTE_perfil_publico.html?id=9015','buscARTE_perfil.html','buscARTE_mensajes.html?conversacion=9201','buscARTE_login.html','buscARTE_privacidad.html','buscARTE_generador.html'])test('1440px: '+route+' desktop composition and navigation remain in bounds',async t=>{
  const f=await setup(t,route,{width:1440,mode:route.includes('login')?'guest':'member'});
  if(route.includes('perfil_publico'))await f.page.waitForFunction(()=>document.body.dataset.profileState==='other');
  f.result.metrics=await metrics(f.page);f.result.contrast=await contrast(f.page);assert.ok(f.result.metrics.scrollWidth<=1441,JSON.stringify(f.result.metrics));
  for(const item of f.result.metrics.nav)assert.ok(item.left>=-1 && item.right<=1441,JSON.stringify(item));
  await capture(f.page,'1440-'+route.replace(/[^a-z0-9]/gi,'-'));
});

for(const width of [320,1440])test(`Home motion ${width}px keeps artwork fixed without extra controls; completion remains optional`,async t=>{
  const f=await setup(t,'index.html',{width,reducedMotion:'no-preference'});
  await f.page.waitForFunction(()=>document.documentElement.dataset.homeSession==='member');
  assert.equal(await f.page.locator('#nav-guest').isVisible(),false);
  assert.equal(await f.page.locator('.a2-motion-control').count(),0,'No background-motion button is added');
  assert.equal(await f.page.evaluate(()=>document.documentElement.dataset.a2Motion),'paused');
  assert.equal(await f.page.locator('.a2-art-canvas').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.ok(await f.page.locator('.a2-art-frame img').evaluate(el=>el.complete && el.naturalWidth>0),'Hero artwork remains loaded');
  f.result.metrics=await metrics(f.page);
  assert.ok(f.result.metrics.scrollWidth<=width+1,JSON.stringify(f.result.metrics));
  for(const item of f.result.metrics.nav)assert.ok(item.left>=-1 && item.right<=width+1,JSON.stringify(item));
  await capture(f.page,width+'-home-without-motion-control');
  await f.page.emulateMedia({reducedMotion:'reduce'});await f.page.waitForFunction(()=>document.documentElement.dataset.a2Motion==='paused');
  assert.equal(await f.page.locator('.a2-art-canvas').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await f.page.locator('.a2-motion-control').count(),0);
  await f.page.emulateMedia({reducedMotion:'no-preference'});
  assert.equal(await f.page.evaluate(()=>document.documentElement.dataset.a2Motion),'paused');
  assert.equal(await f.page.locator('.a2-art-canvas').evaluate(el=>getComputedStyle(el).animationName),'none');
  await f.page.locator('#nav-avatar-btn').click();assert.ok(await f.page.locator('#nav-dropdown').isVisible());
  const profiles=f.page.locator('#nav-dropdown a[href*="perfil_publico"]');assert.equal(await profiles.count(),1);assert.match(await profiles.getAttribute('href'),/id=9001/);
  await f.page.locator('#nav-avatar-btn').click();assert.equal(await f.page.locator('#nav-dropdown').isVisible(),false);
  const box=f.page.locator('.ba-next-step');await box.waitFor({state:'visible'});assert.match(await box.innerText(),/foto|imagen|cara/i);
  await box.getByRole('button',{name:'Más adelante'}).click();assert.equal(await box.isVisible(),false);
  assert.ok((await f.page.evaluate(()=>window.__qaTransportCalls)).every(call=>call.method==='GET'),'Home enhancement only reads data');
});

test('320px: editor saves through the verified session without requesting or sending a password',async t=>{
  const f=await setup(t,'buscARTE_perfil.html',{width:320});
  await f.page.waitForFunction(()=>typeof isLoadingProfile!=='undefined' && !isLoadingProfile);
  await f.page.locator('#bio-text').fill('Presentación sintética: nunca se escribe en producción.');
  const save=f.page.locator('#save-bar').getByRole('button',{name:'Guardar cambios'});await save.click();
  await f.page.waitForFunction(()=>typeof isSavingProfile!=='undefined' && !isSavingProfile && window.BuscARTEPreview.getProfile(9001).bio.includes('Presentación sintética'));
  assert.equal(await f.page.locator('#profile-reauth-dialog[open]').count(),0,'Verified saves do not ask for a password');
  assert.match(await f.page.locator('#bio-text').inputValue(),/Presentación sintética/);
  const saved=await f.page.evaluate(()=>window.BuscARTEPreview.getProfile(9001));assert.match(saved.bio,/Presentación sintética/);
  const writes=await f.page.evaluate(()=>window.__qaTransportCalls.filter(call=>call.method!=='GET'));
  assert.equal(writes.length,1);assert.equal(writes[0].path,'/.netlify/functions/guardar-perfil');assert.equal(writes[0].method,'POST');
  await capture(f.page,'320-guardar-con-sesion');
});

test('320px: an expired session preserves the profile draft and sends no unverified save',async t=>{
  const f=await setup(t,'buscARTE_perfil.html',{width:320});
  await f.page.waitForFunction(()=>typeof isLoadingProfile!=='undefined' && !isLoadingProfile);
  await f.page.locator('#bio-text').fill('Borrador conservado si vence la sesión.');
  await f.page.evaluate(async()=>{window.__qaExpireSession();await window.BuscARTESesion.refresh();});
  await f.page.locator('#ba-session-notice').waitFor({state:'visible'});
  assert.match(await f.page.locator('#ba-session-notice').innerText(),/Conservamos|cambios|formulario/);
  assert.equal(await f.page.locator('#ba-session-notice a').getAttribute('target'),'_blank');
  assert.ok(new URL(f.page.url()).pathname.endsWith('buscARTE_perfil.html'),'No forced reload discards the draft');
  await f.page.locator('#save-bar').getByRole('button',{name:'Guardar cambios'}).click();
  assert.equal(await f.page.locator('#bio-text').inputValue(),'Borrador conservado si vence la sesión.');
  assert.ok((await f.page.evaluate(()=>window.__qaTransportCalls)).every(call=>call.method==='GET'),'Expired identity cannot write');
  assert.equal(await f.page.evaluate(()=>window.BuscARTEPreview.getProfile(9001).bio),'','The unverified draft was never persisted');
  await capture(f.page,'320-sesion-vencida-borrador');
});

test('390px: chat reaches another profile without changing messaging, and art never captures taps',async t=>{
  const f=await setup(t,'buscARTE_mensajes.html',{width:390});
  await f.page.locator('.conv-item').first().click();
  const profile=f.page.locator('#chat-ver-perfil');await profile.waitFor({state:'visible'});
  assert.match(await profile.getAttribute('href'),/id=9002/);
  const decoration=await f.page.locator('.a2-page-art').evaluate(el=>getComputedStyle(el).pointerEvents);assert.equal(decoration,'none');
  await capture(f.page,'390-chat-perfil');
  assert.ok((await f.page.evaluate(()=>window.__qaTransportCalls)).every(call=>call.method==='GET'),'Opening chat is read-only in the fixture');
});
