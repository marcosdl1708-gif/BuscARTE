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
for(const width of [320,390])test(`${width}px: retention policy states Gmail opt-in limits and manual backup review without a blanket purge promise`,async t=>{
  const f=await setup(t,{route:'buscARTE_privacidad.html#conservacion',width,height:844});
  const section=f.page.locator('#conservacion');await section.waitFor({state:'visible'});
  assert.equal(await section.locator('h2').textContent(),'Conservación de correos y respaldos');
  const text=(await section.textContent()).replace(/\s+/g,' ').trim();
  assert.match(text,/Gmail/u,'identify the mailbox provider, not a universal deletion mechanism');
  for(const term of ['a partir de 60 días completos desde el cierre registrado','otros 30 días',
    'revisión manual','No hay una rotación automática general','no se usan para reactivar una cuenta eliminada'])
    assert(text.includes(term),term);
  assert.match(text,/(?:no|sin)[^.!?]*\b90\b|\b90\b[^.!?]*(?:no|sin)[^.!?]*(?:garant|máxim|exact)/iu,
    '90 days must be explicitly qualified, not promised as an absolute maximum');
  const backupSentences=text.split(/[.!?](?:\s|$)/u).filter(sentence=>/respaldo|resguardo|copia de seguridad/iu.test(sentence));
  for(const sentence of backupSentences) {
    const positiveThirtyDayPromise=/\b30\b[^.!?]*(?:máxim|garanti|rotaci)|(?:máxim|garanti|rotaci)[^.!?]*\b30\b/iu.test(sentence);
    assert(!positiveThirtyDayPromise||/\bno\b|sin|pendiente/iu.test(sentence),
      'manual backup review must not silently become a guaranteed 30-day rotation');
  }
  await section.scrollIntoViewIfNeeded();
  const layout=await section.evaluate(node=>({
    viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
    rects:[node,...node.querySelectorAll('h2,p,li,a')].flatMap(element=>Array.from(element.getClientRects(),
      rect=>({left:rect.left,right:rect.right,width:rect.width}))).filter(rect=>rect.width>0)
  }));
  assert(layout.documentWidth<=layout.viewport+1,'retention copy does not create horizontal page overflow');
  assert(layout.rects.every(rect=>rect.left>=-1&&rect.right<=layout.viewport+1),'retention paragraphs and links fit the mobile viewport');
  await f.page.screenshot({path:path.join(output,`conservacion-${width}.png`),animations:'disabled'});
  const contact=section.locator('a').filter({hasText:/Contacto/iu}).first();
  assert.equal(await contact.count(),1,'a public contact route remains reachable from the retention explanation');
  const href=await contact.getAttribute('href');assert.equal(new URL(href,origin).pathname,'/buscARTE_contacto.html');
  await contact.focus();assert.equal(await contact.evaluate(node=>node===document.activeElement),true);
  await contact.click();await f.page.waitForLoadState('load');await f.page.locator('#c-email').waitFor({state:'visible'});
  assert.equal(f.state.calls.some(call=>!['GET','HEAD'].includes(call.method)),false,'reading retention or opening Contacto never deletes or sends anything');
});

test('terms clearly require explicit acceptance and do not subscribe or imply public profile hiding',async t=>{
  const f=await setup(t,{route:'buscARTE_terminos.html',width:390});const text=await f.page.locator('main').textContent();
  for(const term of ['2026-10-15','expresamente','opcional','sin borrar el historial'])assert(text.toLowerCase().includes(term.toLowerCase()),term);
  assert(!text.includes('Al usar buscARTE aceptás estos términos'));
  assert(text.includes('no vuelve privado tu perfil'));
});
