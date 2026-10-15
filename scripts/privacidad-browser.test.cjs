/* Actual policy/contact/pixel code with isolated browser transport, never real users or Meta. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const {setupFixture,snapshot,root,origin}=require('./mobile-ux-fixture.cjs');
const sources=snapshot();
const output=path.join(root,'..','BuscARTE-resguardos','privacidad-ui-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{await browser?.close();console.log('Privacy evidence: '+output);});
async function setup(t,options={}) {
  const f=await setupFixture({browser,sources,...options});
  t.after(async()=>{try{assert.deepEqual(f.state.unexpected,[]);assert.deepEqual(f.state.errors,[]);}finally{await f.context.close();}});
  return f;
}
for(const [width,height] of [[320,430],[390,844],[844,390]])test(`${width}x${height}: optional Meta disclosure is readable and both 44px decisions reachable`,async t=>{
  const f=await setup(t,{route:'index.html',width,height,init:()=>localStorage.removeItem('buscarte_meta_consent_v1')});
  const banner=f.page.locator('#ba-meta-consent');await banner.waitFor();
  const text=await banner.textContent();for(const term of ['opcional','Meta','cookies','IP','URL','Solo necesarias'])assert(text.includes(term));
  assert.equal(await f.page.locator('[data-meta-pixel-loader]').count(),0,'no advertising SDK before explicit consent');
  const box=await banner.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
  for(const choice of ['[data-deny]','[data-allow]']){
    const button=banner.locator(choice);await button.scrollIntoViewIfNeeded();const area=await button.boundingBox();
    assert(area.height>=44&&area.width>=44&&area.y>=0&&area.y+area.height<=height+1);
  }
  await f.page.screenshot({path:path.join(output,`consent-${width}x${height}.png`),animations:'disabled'});
  await banner.locator('[data-deny]').click();assert.equal(await banner.count(),0);assert.equal(await f.page.locator('[data-meta-pixel-loader]').count(),0);
});
test('privacy has consistent disclosures, distinct opt-ins, moderation scope and a public deletion route',async t=>{
  const f=await setup(t,{route:'buscARTE_privacidad.html#derechos',width:320});
  const text=await f.page.locator('main').textContent();
  for(const term of ['versión','Términos','no te suscribe','reintenta','sin tener instalada','diez días corridos','cinco días hábiles'])assert(text.includes(term),term);
  assert(!text.includes('No recopilamos datos de uso detallados ni rastreamos comportamiento con fines publicitarios'));
  const link=f.page.locator('#derechos a').filter({hasText:'Contacto: Eliminar mi cuenta y datos'});
  await link.click();await f.page.waitForLoadState('load');
  await f.page.waitForFunction(()=>document.getElementById('c-asunto')?.value==='Eliminar mi cuenta y datos');
  assert.equal(await f.page.locator('#c-asunto').inputValue(),'Eliminar mi cuenta y datos');
  assert.equal(f.state.calls.some(call=>!['GET','HEAD'].includes(call.method)),false,'opening a deletion request never deletes or sends anything');
  await f.page.screenshot({path:path.join(output,'delete-request-320.png'),animations:'disabled'});
});
test('terms clearly require explicit acceptance and do not subscribe or imply public profile hiding',async t=>{
  const f=await setup(t,{route:'buscARTE_terminos.html',width:390});const text=await f.page.locator('main').textContent();
  for(const term of ['2026-10-15','expresamente','opcional','sin borrar el historial'])assert(text.toLowerCase().includes(term.toLowerCase()),term);
  assert(!text.includes('Al usar buscARTE aceptás estos términos'));
  assert(text.includes('no vuelve privado tu perfil'));
});
