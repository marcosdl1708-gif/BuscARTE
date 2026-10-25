/* Actual profile HTML and preference script, synthetic account, locally fulfilled
 * requests only. This never creates a real account, preference or email. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const {setupFixture,snapshot,origin,root}=require('./mobile-ux-fixture.cjs');
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','email-preferences-browser-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert(!output.startsWith(root+path.sep),'Browser evidence stays outside the public source tree');
fs.mkdirSync(output,{recursive:true});
const sources=snapshot();
const tested=['buscARTE_perfil.html','assets/js/email-preferencias.js'];
const results=[];
const me={id:9001,nombre:'Cuenta sintética',email:'qa@example.invalid',tipo_cuenta:'artista',rubro:'musica',instrumento:'Guitarra',generos:'Rock',
  bio:'Presentación aislada de prueba.',referentes:'',provincia:'CABA',ciudad:'CABA',barrio:'Almagro',foto_url:null,campos_especificos:null,disciplinas:null,perfil_revision:0,baneado:false,created_at:'2026-10-16T12:00:00Z'};
let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{
  await browser?.close();
  const sourceDrift=tested.filter(file=>!fs.readFileSync(path.join(root,file)).equals(sources.get(file)));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({at:new Date().toISOString(),scope:'Real profile HTML and JS in isolated browser; every request fulfilled locally or blocked. Synthetic preference save only.',
    sourceDrift,hashes:Object.fromEntries(tested.map(file=>[file,createHash('sha256').update(sources.get(file)).digest('hex')])),results},null,2));
  assert.deepEqual(sourceDrift,[],'Do not certify changes made after the source snapshot');
  console.log('Email preferences browser evidence: '+output);
});

async function centered(page,selector,width,height) {
  const locator=page.locator(selector);
  await locator.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'}));
  const rect=await locator.boundingBox();assert(rect,selector+' is rendered');
  assert(rect.height>=44,selector+' has a 44px touch target');
  assert(rect.x>=-1&&rect.x+rect.width<=width+1,selector+' remains horizontally inside the viewport');
  assert(rect.y>=-1&&rect.y+rect.height<=height+1,selector+' remains vertically reachable after scrolling: '+JSON.stringify(rect));
  return rect;
}

for(const [width,height] of [[320,430],[390,844],[1440,900]]) {
  test(`${width}x${height}: real profile preserves monthly opt-out until an explicit fortnightly save`,async t=>{
    const f=await setupFixture({browser,sources,route:'buscARTE_perfil.html#mail-preferences',width,height,user:me,profiles:[me]});
    t.after(f.close);
    const {page,context,state}=f;
    await page.waitForFunction(()=>window.BuscARTESesion?.status==='verified'&&document.getElementById('mail-preferences-save')?.disabled===false);
    await page.waitForFunction(()=>typeof isLoadingProfile!=='undefined'&&!isLoadingProfile);
    const marketing=page.locator('#mail-marketing-opt-in'),frequency=page.locator('#mail-marketing-frequency'),save=page.locator('#mail-preferences-save');
    assert.equal(await marketing.isChecked(),false);assert.equal(await frequency.inputValue(),'monthly');assert.equal(await frequency.isDisabled(),true);
    assert.equal(await page.locator('label[for="mail-marketing-frequency"]').textContent(),'Frecuencia de novedades');
    assert.equal(state.calls.some(call=>call.path==='email-preferences'&&call.method==='POST'),false,'Loading never changes a subscription');
    const current={marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly'};
    const writes=[];
    await context.route(origin+'/.netlify/functions/email-preferences',async handler=>{
      const request=handler.request(),method=request.method();
      if(method==='GET')return handler.fulfill({contentType:'application/json',body:JSON.stringify(current)});
      assert.equal(method,'POST');const body=request.postDataJSON();writes.push(body);state.calls.push({method,path:'email-preferences',body});
      assert.deepEqual(Object.keys(body).sort(),['marketing_frequency','marketing_opt_in','onboarding_disabled']);
      Object.assign(current,body);return handler.fulfill({contentType:'application/json',body:JSON.stringify(current)});
    });
    const row={test:t.name};results.push(row);
    row.initialOverflow=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert(row.initialOverflow.documentWidth<=width+1,'No horizontal overflow on initial real page');
    await centered(page,'#mail-marketing-frequency',width,height);
    await page.screenshot({path:path.join(output,`preferences-initial-${width}-${height}.png`),animations:'disabled'});
    await marketing.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'}));await marketing.check();
    assert.equal(await frequency.isEnabled(),true);assert.equal(writes.length,0,'Checking alone does not save');
    row.frequency=await centered(page,'#mail-marketing-frequency',width,height);await frequency.selectOption('fortnightly');
    assert.equal(writes.length,0,'Choosing frequency alone does not save');
    await page.screenshot({path:path.join(output,`preferences-choice-${width}-${height}.png`),animations:'disabled'});
    row.save=await centered(page,'#mail-preferences-save',width,height);await save.click();
    await page.waitForFunction(()=>document.getElementById('mail-preferences-feedback')?.textContent.includes('quedaron guardadas'));
    assert.deepEqual(writes,[{marketing_opt_in:true,marketing_frequency:'fortnightly',onboarding_disabled:false}]);
    assert.equal(await frequency.inputValue(),'fortnightly');assert.equal(await marketing.isChecked(),true);assert.equal(await save.isEnabled(),true);
    row.savedOverflow=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert(row.savedOverflow.documentWidth<=width+1,'No horizontal overflow after real UI save');
    await page.screenshot({path:path.join(output,`preferences-saved-${width}-${height}.png`),animations:'disabled'});
  });
}

test('390x844: a historical profile actively enables help without subscribing to marketing',async t=>{
  const f=await setupFixture({browser,sources,route:'buscARTE_perfil.html#mail-preferences',width:390,height:844,user:{...me,created_at:'2026-09-01T00:00:00Z'},profiles:[{...me,created_at:'2026-09-01T00:00:00Z'}]});
  t.after(f.close);const {page,context,state}=f;
  const current={marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly',onboarding_consent_required:true};const writes=[];
  await context.route(origin+'/.netlify/functions/email-preferences',async handler=>{
    const request=handler.request(),method=request.method();
    if(method==='GET')return handler.fulfill({contentType:'application/json',body:JSON.stringify(current)});
    assert.equal(method,'POST');const body=request.postDataJSON();writes.push(body);state.calls.push({method,path:'email-preferences',body});
    assert.deepEqual(Object.keys(body).sort(),['marketing_frequency','marketing_opt_in','onboarding_choice','onboarding_disabled']);
    Object.assign(current,body);current.onboarding_consent_required=false;return handler.fulfill({contentType:'application/json',body:JSON.stringify(current)});
  });
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.BuscARTESesion?.status==='verified'&&document.getElementById('mail-preferences-save')?.disabled===false);
  await page.waitForFunction(()=>typeof isLoadingProfile!=='undefined'&&!isLoadingProfile);
  assert.equal(await page.locator('#mail-onboarding-enabled').isChecked(),false);assert.equal(await page.locator('#mail-marketing-opt-in').isChecked(),false);assert.equal(writes.length,0);
  await page.locator('#mail-onboarding-enabled').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));await page.locator('#mail-onboarding-enabled').check();
  await centered(page,'#mail-preferences-save',390,844);await page.locator('#mail-preferences-save').click();
  await page.waitForFunction(()=>document.getElementById('mail-preferences-feedback')?.textContent.includes('quedaron guardadas'));
  assert.deepEqual(writes,[{marketing_opt_in:false,marketing_frequency:'monthly',onboarding_disabled:false,onboarding_choice:true}]);
  assert.equal(await page.locator('#mail-marketing-opt-in').isChecked(),false);
  await page.screenshot({path:path.join(output,'preferences-historical-help-390-844.png'),animations:'disabled'});
  results.push({test:t.name,explicitHelpChoice:true,marketingRemainsDisabled:true});
});
