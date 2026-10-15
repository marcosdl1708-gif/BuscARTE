/* Real browser tabs/cookies; actual consent source, synthetic SDK and all network intercepted. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/meta-pixel.js'),'utf8');
const KEY='buscarte_meta_consent_v2_2026-10-15',LEGACY='buscarte_meta_consent_v1';
const sdk=`(() => {
  const pixel=window.fbq; window.__sdkCommands=[]; window.__sdkDelivered=[];
  let allowed=true;
  pixel.callMethod=function(...command){
    window.__sdkCommands.push(command);
    if(command[0]==='consent')allowed=command[1]==='grant';
    if(/^track/.test(command[0])&&allowed)window.__sdkDelivered.push(command);
  };
  const queued=pixel.queue.splice(0); queued.forEach(command=>pixel.callMethod(...command));
  window.__sdkReady=true;
})();`;
let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{await browser?.close();});
async function fixture(t,{host='buscarte.com.ar',values={},delaySdk=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const unexpected=[],errors=[];let sdkRequests=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  await context.addInitScript(({values,host})=>{
    if(location.hostname!==host)return;
    if(!localStorage.getItem('synthetic-consent-seeded')){
      for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);
      localStorage.setItem('synthetic-consent-seeded','1');
    }
  },{values,host});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname===host&&url.pathname==='/assets/js/meta-pixel.js')return route.fulfill({contentType:'application/javascript',body:source});
    if(url.hostname===host&&['/index.html','/buscARTE_privacidad.html'].includes(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated consent test</title><main><h1>Consent test</h1><strong data-meta-consent-status></strong></main><script src="/assets/js/meta-pixel.js"></script>'});
    if(url.href==='https://connect.facebook.net/en_US/fbevents.js'){
      sdkRequests++;if(delaySdk)await gate;
      return route.fulfill({contentType:'application/javascript',body:sdk});
    }
    if(url.hostname===host&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    unexpected.push(url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  t.after(async()=>{release();try{assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);}finally{await context.close();}});
  async function page(){const p=await context.newPage();p.setDefaultTimeout(6000);await p.goto('https://'+host+'/index.html',{waitUntil:'domcontentloaded'});return p;}
  return {context,page,release,sdkRequests:()=>sdkRequests};
}

test('old grant requires a new decision; only Meta cookies are cleared, including parent-domain cookies',async t=>{
  const f=await fixture(t,{host:'www.buscarte.com.ar',values:{[LEGACY]:'granted',ba_logged:'1',ba_user_id:'9001'}});
  await f.context.addCookies([
    {name:'_fbp',value:'synthetic-root',domain:'.buscarte.com.ar',path:'/',secure:true},
    {name:'_fbc',value:'synthetic-host',url:'https://www.buscarte.com.ar/'},
    {name:'ba_session_qa',value:'synthetic-essential',domain:'.buscarte.com.ar',path:'/',secure:true,httpOnly:true}
  ]);
  const p=await f.page();await p.locator('#ba-meta-consent').waitFor();
  assert.equal(await p.evaluate(()=>MetaAds.getConsent()),'unknown');assert.equal(f.sdkRequests(),0);
  const cookies=await f.context.cookies();assert(!cookies.some(c=>['_fbp','_fbc'].includes(c.name)));
  assert(cookies.some(c=>c.name==='ba_session_qa'),'essential login cookie preserved');
  await p.locator('[data-deny]').click();
  assert.deepEqual(await p.evaluate(({KEY,LEGACY})=>[localStorage.getItem(KEY),localStorage.getItem(LEGACY),localStorage.getItem('ba_user_id')],{KEY,LEGACY}),['denied','denied','9001']);
  await p.reload();assert.equal(await p.locator('#ba-meta-consent').count(),0);assert.equal(f.sdkRequests(),0);
});

test('old denial is respected without asking again or loading the SDK',async t=>{
  const f=await fixture(t,{values:{[LEGACY]:'denied'}}),p=await f.page();
  assert.equal(await p.evaluate(()=>MetaAds.getConsent()),'denied');
  assert.equal(await p.locator('#ba-meta-consent').count(),0);assert.equal(f.sdkRequests(),0);
  assert.equal(await p.evaluate(key=>localStorage.getItem(key),KEY),'denied');
});

test('revoking before a delayed SDK arrives removes queued PageView and conversion commands',async t=>{
  const f=await fixture(t,{values:{[LEGACY]:'granted'},delaySdk:true}),p=await f.page();
  await p.locator('[data-allow]').click();
  await p.evaluate(()=>{MetaAds.trackOnce('CompleteRegistration',{rubro:'musica'},'synthetic-registration');MetaAds.setConsent(false);});
  f.release();await p.waitForFunction(()=>window.__sdkReady===true);
  assert.deepEqual(await p.evaluate(()=>window.__sdkDelivered),[]);
  assert.deepEqual(await p.evaluate(()=>window.__sdkCommands[0]),['consent','revoke']);
  assert.equal(await p.evaluate(()=>MetaAds.track('Lead',{source:'synthetic'})),false);
  assert.deepEqual(await p.evaluate(()=>window.__sdkDelivered),[]);
});

test('two actual tabs share the current decision and clear/revocation prevents later events',async t=>{
  const f=await fixture(t,{values:{[KEY]:'granted'}}),a=await f.page(),b=await f.page();
  await Promise.all([a.waitForFunction(()=>window.__sdkReady),b.waitForFunction(()=>window.__sdkReady)]);
  await a.evaluate(()=>MetaAds.setConsent(false));
  await b.waitForFunction(()=>MetaAds.getConsent()==='denied');
  const before=await b.evaluate(()=>window.__sdkDelivered.length);
  assert.equal(await b.evaluate(()=>MetaAds.track('Lead')),false);
  assert.equal(await b.evaluate(()=>window.__sdkDelivered.length),before);
  await b.evaluate(()=>MetaAds.setConsent(true));
  await a.waitForFunction(()=>MetaAds.getConsent()==='granted');
  await b.evaluate(()=>localStorage.clear());
  await a.waitForFunction(()=>MetaAds.getConsent()==='unknown');
  await a.locator('#ba-meta-consent').waitFor();
  const counts=await Promise.all([a.evaluate(()=>window.__sdkDelivered.length),b.evaluate(()=>window.__sdkDelivered.length)]);
  assert.equal(await a.evaluate(()=>MetaAds.track('Lead')),false);
  assert.equal(await b.evaluate(()=>MetaAds.track('Lead')),false);
  assert.deepEqual(await Promise.all([a.evaluate(()=>window.__sdkDelivered.length),b.evaluate(()=>window.__sdkDelivered.length)]),counts);
  assert.equal(await b.evaluate(()=>MetaAds.getConsent()),'unknown');
});
