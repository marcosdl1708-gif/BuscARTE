/* Regression for the border crossing the first RUBRO caption.
 * Uses immutable public source bytes + synthetic data only. No request is
 * continued to a real server. Geometry measures glyph ranges, not just boxes. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:4217';
const published=JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'));
const sources=new Map(published.map(file=>[file,fs.readFileSync(path.join(root,file))]));
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','filtros-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert.ok(!output.startsWith(root+path.sep));fs.mkdirSync(output,{recursive:true});
const results=[];
const baseline=process.env.BUSCARTE_FILTROS_BASELINE==='1';
const baselineRevision='5f249bf783c2eea9fde934e14dc9c8fc04284e3f';
const baselineCSS=baseline?execFileSync('git',['show',baselineRevision+':assets/css/escena.css'],{cwd:root}):null;
let browser;
let transport=fs.readFileSync(path.join(root,'scripts/fixtures/legacy-runtime.js'),'utf8');
const demoStart=transport.indexOf('  function demoProfile('),demoEnd=transport.indexOf('  function json(',demoStart);
assert.ok(demoStart>0&&demoEnd>demoStart);
transport=transport.slice(0,demoStart)+'  function demoProfile(row) { return { ...clone(row), foto_url: localPhoto(row.foto_url) }; }\n'+transport.slice(demoEnd);
transport=transport.replace("url.hostname === 'xiaanchoanxmamgoay.supabase.co' || ",'');
transport=transport.replace('  const currentId =','  for(const row of state.perfiles){row.disciplinas ??= null;row.perfil_revision ??= 0;}\n  const currentId =');
transport=transport.replace('  async function api(request, url) {',`
  async function api(request,url) {
    if(url.pathname==='/.netlify/functions/datos') {
      const path=url.searchParams.get('path');
      if(!path||!/^\\/(?:rest\\/v1\\/|storage\\/v1\\/object\\/)/.test(path)||path.startsWith('//'))return fail('Unknown fixture gateway path.',403);
      const target=new URL(path,'https://xiaanchoanxmampegoay.supabase.co');
      if(target.origin!=='https://xiaanchoanxmampegoay.supabase.co')return fail('External gateway blocked.',403);
      return safeFetch(new Request(target.href,request));
    }
    if(url.pathname==='/.netlify/functions/sesion')return request.method==='GET'?json({error:'Fixture session required.',code:'SESSION_REQUIRED'},401):fail('Filter QA denies session writes.',405);
`);
transport=transport.replace("Object.keys(input).every(key => key === 'visitas')","Object.keys(input).every(key => key === 'visitas' || key === 'vistas')");
transport+='\nwindow.BuscARTEPreview.logout();delete document.documentElement.dataset.baPreview;delete document.documentElement.dataset.baOption;';
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{
  await browser?.close();
  // These bytes are the relevant frozen styling/markup contract. Another QA
  // worker may legitimately edit cursor assets in parallel; it cannot certify
  // a different sidebar source with this snapshot.
  const watched=['assets/css/escena.css','buscARTE_anuncios.html','buscARTE_busqueda.html'];
  const drift=watched.filter(file=>!fs.readFileSync(path.join(root,file)).equals(sources.get(file)));
  fs.writeFileSync(path.join(output,'filter-report.json'),JSON.stringify({at:new Date().toISOString(),scope:'Hermetic production markup, native fallback fonts, 8px minimum glyph-to-separator gap. Not live persistence or physical APK QA.',baselineRevision:baseline?baselineRevision:null,servedBaselineCSSHash:baseline?createHash('sha256').update(baselineCSS).digest('hex'):null,sourceDrift:drift,sourceHashes:Object.fromEntries(watched.map(file=>[file,createHash('sha256').update(sources.get(file)).digest('hex')])),results},null,2));
  console.log('Filter evidence: '+output);assert.deepEqual(drift,[],'Late sidebar edits require a new snapshot');
});
async function setup(t,file,width){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<901,hasTouch:width<901,serviceWorkers:'block',reducedMotion:'reduce'});
  const result={test:t.name,file,width,unexpected:[],errors:[]};results.push(result);
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{result.unexpected.push('WebSocket '+socket.url());socket.close();});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());let file=decodeURIComponent(url.pathname).slice(1)||'index.html';
    if(!sources.has(file)&&sources.has(file+'.html'))file+='.html';
    if(url.origin===origin&&request.method()==='GET'&&sources.has(file)&&file!=='sw.js'){
      let body=file==='assets/css/escena.css'&&baseline?baselineCSS:sources.get(file);
      if(file.endsWith('.html'))body=Buffer.from(body.toString('utf8').replace(/<head(?:\s[^>]*)?>/i,match=>match+'\n<script>'+transport.replace(/<\/script/gi,'<\\/script')+'</script>'));
      return route.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.xml':'application/xml','.txt':'text/plain'})[path.extname(file)]||'application/octet-stream',body});
    }
    if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    result.unexpected.push(request.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>result.errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(result.errors,[]);assert.deepEqual(result.unexpected,[]);}finally{await context.close();}});
  await page.goto(origin+'/'+file,{waitUntil:'load'});
  await page.waitForFunction(()=>document.body.dataset.a2Page&&window.BuscARTESesion?.status==='anonymous');
  await page.evaluate(()=>document.fonts.ready);
  if(width<901)await page.locator(file.startsWith('buscARTE_anuncios')?'#mobile-filter-btn-an':'#mobile-filter-btn').click();
  return {page,result};
}
async function measure(page){return page.evaluate(()=>{
  const panel=document.querySelector('.filters-panel');panel.scrollTop=0;
  const header=panel.querySelector('.filter-header'),hr=header.getBoundingClientRect();
  const labels=[...panel.querySelectorAll('.filter-group-label,.fg-label')].filter(el=>el.getClientRects().length);
  const glyph=el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect();};
  const first=labels[0],fr=glyph(first),pr=panel.getBoundingClientRect();
  const all=labels.map(el=>{const r=el.getBoundingClientRect(),text=glyph(el);return {text:el.textContent.trim(),left:r.left,right:r.right,textLeft:text.left,textRight:text.right,height:text.height,clipped:el.scrollWidth>el.clientWidth+1};});
  const dividers=[...panel.querySelectorAll('.filter-divider')].filter(el=>el.getClientRects().length).map(el=>{
    const r=el.getBoundingClientRect(),next=labels.find(label=>label.getBoundingClientRect().top>=r.bottom);
    return next?{next:next.textContent.trim(),gap:glyph(next).top-r.bottom}:null;
  }).filter(Boolean);
  return {first:first.textContent.trim(),firstGlyphTop:fr.top,headerBottom:hr.bottom,gap:fr.top-hr.bottom,panel:{left:pr.left,right:pr.right},labels:all,dividers,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};
});}
const rubros=['musica','actuacion','audiovisual','modelaje','diseno','tatuaje','danza','maquillaje','circo','escritura'];
function assertGeometry(g,width){
  assert.ok(g.scrollWidth<=width+1,JSON.stringify(g));
  if(baseline){assert.ok(g.gap<8,'Old geometry must reproduce the defect: '+JSON.stringify(g));}
  else{
    assert.ok(g.gap>=8,'At least 8px from header separator to first glyph: '+JSON.stringify(g));
    assert.ok(g.dividers.every(item=>item.gap>=8),'At least 8px from every section separator to the next glyph: '+JSON.stringify(g.dividers));
  }
  assert.ok(g.labels.length>0&&g.labels.every(label=>label.text&&label.height>0&&!label.clipped&&label.textLeft>=Math.max(g.panel.left,label.left)-1&&label.textRight<=Math.min(g.panel.right,label.right)+1),'Every caption is intact: '+JSON.stringify(g.labels));
}
async function capture(page,name){
  // Capture the current viewport without locator screenshot's auto-scroll,
  // which would change the relative position of a sticky header.
  const r=await page.locator('.filters-panel').boundingBox();
  const y=Math.max(0,r.y),x=Math.max(0,r.x);
  await page.screenshot({path:path.join(output,name+'.png'),clip:{x,y,width:Math.min(page.viewportSize().width-x,r.width),height:Math.min(page.viewportSize().height-y,r.height)},animations:'disabled'});
}
for(const width of [320,390,768,1024,1440])for(const rubro of baseline?['musica']:rubros)for(const kind of baseline?['anuncios']:['anuncios','busqueda']){
  test(`${width}px ${rubro} ${kind}: captions separated from borders and unclipped`,async t=>{
    const {page,result}=await setup(t,`buscARTE_${kind}.html?rubro=${rubro}`,width);
    result.geometry=await measure(page);const g=result.geometry;
    assertGeometry(g,width);
    if(rubro==='musica'&&(width===390||width===1440)){
      await capture(page,`${baseline?'before':'after'}-${kind}-${width}`);
    }
  });
}
if(!baseline)for(const width of [320,390,768,1024,1440])for(const tipo of ['busco','ofrezco','jam','clases','vende']){
  test(`${width}px ${tipo}: all category filters retain caption clearance`,async t=>{
    const {page,result}=await setup(t,`buscARTE_anuncios.html?rubro=musica&tipo=${tipo}`,width);
    await page.waitForFunction(tipo=>{
      if(tipo==='vende')return document.body.dataset.marketplace==='true';
      const expected=tipo==='busco'||tipo==='ofrezco'?'fp-musico':'fp-'+tipo;
      return document.querySelector('.filter-panel.active')?.id===expected;
    },tipo);
    result.geometry=await measure(page);assertGeometry(result.geometry,width);
    if(tipo==='vende'){
      await page.locator('#marketplace-other-boards > summary').click();
      result.expandedGeometry=await measure(page);assertGeometry(result.expandedGeometry,width);
    }
  });
}
