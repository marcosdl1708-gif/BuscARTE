/* Optional presentation prompts and honest cards: synthetic users, local GETs.
 * No production database, email, account, profile or publication writes. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const {root,snapshot,setupFixture}=require('./mobile-ux-fixture.cjs');
const sources=snapshot(),script=sources.get('assets/js/perfil-presentacion.js');
assert.ok(script,'Presentation helper is explicitly allowed in the public manifest');
const output=path.resolve(process.env.BUSCARTE_QA_OUTPUT||path.join(root,'..','BuscARTE-resguardos','perfil-presentacion-'+new Date().toISOString().replace(/[:.]/g,'-')));
assert.ok(!output.startsWith(root+path.sep));fs.mkdirSync(output,{recursive:true});
const findings=[];let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{
  await browser?.close();
  const sourceDrift=[...sources].filter(([file,body])=>!fs.readFileSync(path.join(root,file)).equals(body)).map(([file])=>file);
  assert.deepEqual(sourceDrift,[],'Tested public sources stayed frozen');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({at:new Date().toISOString(),sourceDrift,findings,
    sources:Object.fromEntries([...sources].filter(([file])=>/perfil-presentacion|busqueda|index|mis_anuncios|escena\.css/.test(file)).map(([file,body])=>[file,createHash('sha256').update(body).digest('hex')])),
    scope:'Synthetic data; locally fulfilled GETs only; no production mutation.'},null,2));
  console.log('Presentation evidence: '+output);
});
function artist(rubro='musica',extra={}){
  return {id:9001,nombre:'Artista de ejemplo',tipo_cuenta:'artista',rubro,baneado:false,instrumento:'',generos:'',referentes:'',
    bio:'',foto_url:'',ciudad:'',campos_especificos:{},disciplinas:null,perfil_revision:1,created_at:'2026-10-20T12:00:00Z',...extra};
}
function sandbox(){
  const context=vm.createContext({URL,AbortController,console,setTimeout,clearTimeout,addEventListener(){},
    document:{readyState:'loading',addEventListener(){},querySelectorAll(){return []},querySelector(){return null}}});
  context.window=context;
  vm.runInContext(sources.get('assets/js/disciplinas.js').toString(),context);
  vm.runInContext(script.toString(),context);
  return context.BuscARTEPresentacion;
}
const model=sandbox(),assess=(profile,rubro)=>model.assess(profile,rubro);
const missing=result=>[...(result?.missing||[])].map(item=>item.key);
const vectors=[
  ['musica',{instrumento:'Guitarra'},{}],
  ['actuacion',{campos_especificos:{rol:['Actor/Actriz']}},{'chips-rol-actuacion':['Actor/Actriz']}],
  ['audiovisual',{campos_especificos:{rol:['Fotógrafo']}},{'chips-rol-av':['Fotógrafo']}],
  ['modelaje',{campos_especificos:{tipo_trabajo:['Editorial']}},{'chips-tipo-modelo':['Editorial']}],
  ['diseno',{campos_especificos:{rol:['Ilustrador']}},{'chips-rol-diseno':['Ilustrador']}],
  ['tatuaje',{campos_especificos:{rol:['Tatuador']}},{'chips-rol-tatu':['Tatuador']}],
  ['danza',{campos_especificos:{disciplina:['Tango']}},{'chips-disciplina-danza':['Tango']}],
  ['maquillaje',{campos_especificos:{rol:['Maquillador artístico']}},{'chips-rol-maq':['Maquillador artístico']}],
  ['circo',{campos_especificos:{especialidad:['Malabares']}},{'chips-rol-circo':['Malabares']}],
  ['escritura',{campos_especificos:{rol:['Escritor']}},{'chips-rol-escritura':['Escritor']}]
];
for(const [rubro,detail,legacy] of vectors)test('honest initial state and optional professional detail: '+rubro,()=>{
  const empty=artist(rubro),before=JSON.stringify(empty),first=assess(empty,rubro);
  assert.equal(first.initial,true);assert.equal(first.professional,false);
  assert.deepEqual(missing(first).sort(),['bio','disciplina','foto']);
  const done=assess(artist(rubro,detail),rubro);
  assert.equal(done.professional,true);assert.equal(done.initial,false);assert.ok(!missing(done).includes('disciplina'));
  assert.ok(missing(done).includes('foto'),'A missing photo is only an optional suggestion');
  if(rubro!=='musica')for(const campos of [legacy,JSON.stringify(legacy),JSON.stringify(detail.campos_especificos)]){
    assert.equal(assess(artist(rubro,{campos_especificos:campos}),rubro).professional,true,'Canonical/serialized historical detail counts');
  }
  assert.equal(JSON.stringify(empty),before,'Assessment does not mutate source data');
});
test('bio and valid photo count independently; a photo is not a mandatory public quality gate',()=>{
  const writing=assess(artist('musica',{bio:'Hago canciones y busco proyectos.'}));
  assert.equal(writing.bio,true);assert.equal(writing.initial,false);assert.ok(!missing(writing).includes('bio'));
  const photoOnly=assess(artist('musica',{foto_url:'https://example.test/avatar.jpg'}));
  assert.equal(photoOnly.photo,true);assert.equal(photoOnly.initial,true);assert.ok(!missing(photoOnly).includes('foto'));
  const complete=assess(artist('musica',{instrumento:'Bajo',bio:'Mi presentación.',foto_url:'https://example.test/avatar.jpg'}));
  assert.deepEqual(missing(complete),[]);assert.equal(complete.initial,false);
  assert.notEqual(assess(artist('musica',{foto_url:'javascript:alert(1)'})).photo,true);
});
test('sentinels and demographic-only fields do not invent professional information',()=>{
  for(const value of ['', '  ',null,[],'[]','null','undefined','{}','false']){
    assert.notEqual(assess(artist('musica',{instrumento:value})).professional,true,JSON.stringify(value));
  }
  for(const campos of [{genero:['Mujer']},{'chips-genero-modelo':['Mujer']},{edad:30}]){
    assert.notEqual(assess(artist('modelaje',{campos_especificos:campos})).professional,true);
  }
});
test('unreadable detail is not publicly labelled an empty profile',()=>{
  assert.notEqual(assess(artist('actuacion',{campos_especificos:'{broken'}),'actuacion').initial,true);
  for(const disciplinas of ['{broken',{version:1,selected:['musica','danza'],details:{}}]){
    const result=assess(artist('musica',{disciplinas}));
    assert.notEqual(result?.initial,true);assert.deepEqual(missing(result),[]);
  }
});
test('visitors, businesses and unsupported rubros have no artist-completion classification',()=>{
  for(const profile of [artist('musica',{tipo_cuenta:'visitante'}),artist('musica',{tipo_cuenta:'negocio'}),artist('unknown')]){
    const result=assess(profile);assert.notEqual(result?.initial,true);assert.deepEqual(missing(result),[]);
  }
});
test('multidiscipline uses requested detail, preserves shared presentation and never mutates',()=>{
  const detail=extra=>({instrumento:'',generos:'',referentes:'',disponibilidad:'',donde_ensaya:'',experiencia:null,campos_especificos:{},...extra});
  const profile=artist('musica',{disciplinas:{version:1,selected:['musica','danza'],details:{
    musica:detail({}),danza:detail({campos_especificos:{disciplina:['Tango']}})
  }}});
  const before=JSON.stringify(profile);
  assert.equal(assess(profile,'musica').initial,true);assert.equal(assess(profile,'danza').professional,true);
  assert.equal(assess(profile,'danza').initial,false);assert.equal(JSON.stringify(profile),before);
});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve};}
function ownReads(state,id=9001){
  return state.calls.filter(call=>call.method==='GET'&&call.path==='/rest/v1/perfiles'&&
    new URLSearchParams(call.query).get('id')==='eq.'+id&&new URLSearchParams(call.query).get('select')?.includes('foto_url'));
}
async function settle(page){
  await page.waitForFunction(()=>!!window.BuscARTEPresentacion&&window.BuscARTESesion?.status!=='pending');
  if(await page.evaluate(()=>typeof window.BuscARTEPresentacion.refresh==='function')){
    await page.evaluate(()=>window.BuscARTEPresentacion.refresh());
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function fixture(t,options={}){
  const profile=options.profile||artist();
  const f=await setupFixture({browser,sources,route:options.route||'index.html',width:options.width||390,height:options.width===1440?900:844,
    user:options.user===undefined?profile:options.user,profiles:options.profiles||[profile],api:options.api,init:options.init,storageUnavailable:options.storageUnavailable});
  t.after(async()=>{try {assert.ok(f.state.calls.every(call=>call.method==='GET'),'No presentation POST/PATCH/DELETE/send');}finally {await f.close();}});
  return f;
}
const nudge=page=>page.locator('[data-profile-nudge]');
const action=page=>nudge(page).locator('a[href*="perfil.html#completar"]');
for(const route of ['index.html','buscARTE_index.html','buscARTE_mis_anuncios.html'])for(const width of [320,390,1440]){
  test(route+' at '+width+'px: optional owner prompt is usable and dismissible',async t=>{
    const {page,state}=await fixture(t,{route,width});await settle(page);await nudge(page).waitFor({state:'visible'});
    assert.equal(await action(page).count(),1);assert.match(await nudge(page).innerText(),/Ahora no/);
    assert.doesNotMatch(await nudge(page).innerText(),/obligatorio|debes|debés|bloquead|más visitas|garantiz|penaliz/i);
    const link=action(page),dismiss=nudge(page).getByRole('button',{name:'Ahora no',exact:true});
    for(const locator of [link,dismiss]){const box=await locator.boundingBox();assert.ok(box.height>=44&&box.width>=44,'44px touch target');}
    const box=await nudge(page).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await link.focus();assert.equal(await link.evaluate(el=>el===document.activeElement),true);
    assert.notEqual(await link.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    assert.ok(ownReads(state).length<=1,'One own-profile read per revision');
    if(width===390&&route==='index.html')await nudge(page).screenshot({path:path.join(output,'owner-prompt-390.png'),animations:'disabled'});
    await dismiss.click();assert.equal(await nudge(page).isVisible(),false);
    await settle(page);assert.equal(await nudge(page).isVisible(),false);
    findings.push({route,width,ownerPrompt:true,dismissible:true,noOverflow:true});
  });
}
test('a cached legacy ID cannot trigger an owner prompt or owner read for a guest',async t=>{
  const {page,state}=await fixture(t,{user:null,init:()=>{
    localStorage.setItem('ba_logged','1');localStorage.setItem('ba_user_id','9001');localStorage.setItem('ba_name','Cache ajena');
  }});
  await settle(page);assert.equal(await nudge(page).isVisible(),false);assert.equal(ownReads(state).length,0);
});
for(const type of ['negocio','visitante'])test(type+' receives no artist prompt or extra professional read',async t=>{
  const {page,state}=await fixture(t,{profile:artist('musica',{tipo_cuenta:type})});
  await settle(page);assert.equal(await nudge(page).isVisible(),false);assert.equal(ownReads(state).length,0);
});
test('useful Home actions remain available without reopening registration for verified account types',async t=>{
  for(const tipo_cuenta of ['artista','negocio','visitante']){
    const f=await fixture(t,{profile:artist('musica',{tipo_cuenta})});await settle(f.page);
    for(const href of ['buscARTE_busqueda.html','buscARTE_anuncios.html','buscARTE_mensajes.html']){
      const link=f.page.locator('.home-actions a[href="'+href+'"]');
      await link.waitFor({state:'visible'});await link.focus();
      assert.equal(await link.evaluate(el=>el===document.activeElement),true);
    }
    assert.equal(await f.page.locator('[data-home-guest]:visible').count(),0);
    assert.equal(await f.page.locator('.home-guest-actions:visible').count(),0);
  }
  const f=await fixture(t,{user:null});await settle(f.page);
  await f.page.locator('.home-guest-actions a[href="#explorar"]').waitFor({state:'visible'});
  await f.page.locator('.home-guest-actions a[href="buscARTE_anuncios.html"]').waitFor({state:'visible'});
  assert.equal(await nudge(f.page).isVisible(),false);
});

test('optional prompt leads to the existing editor completion panel without a write',async t=>{
  const f=await fixture(t);await settle(f.page);await action(f.page).waitFor({state:'visible'});
  await action(f.page).click();
  await f.page.waitForURL('**/buscARTE_perfil.html#completar');
  const panel=f.page.locator('#profile-progress');await panel.waitFor({state:'visible'});
  assert.match(await panel.innerText(),/Podés seguir explorando y completar esto cuando quieras/);
  assert.ok(await panel.locator('a[href^="#"]').count()>0,'Completion panel offers specific optional next steps');
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});
test('complete saved data hides the prompt even when the session object is sparse',async t=>{
  const complete=artist('musica',{instrumento:'Batería',bio:'Mi presentación.',foto_url:'https://example.test/avatar.jpg'});
  const {page,state}=await fixture(t,{user:artist(),profiles:[complete]});
  await settle(page);assert.equal(await nudge(page).isVisible(),false);assert.equal(ownReads(state).length,1);
});
test('failed and mismatched own-profile reads fail closed rather than inventing missing data',async t=>{
  for(const mode of ['error','wrong-id']){
    const f=await fixture(t,{api:async({call})=>ownReads({calls:[call]}).length?
      mode==='error'?{status:503,body:{error:'fixture'}}:{body:[artist('musica',{id:9002})]}:undefined});
    await settle(f.page);assert.equal(await nudge(f.page).isVisible(),false);
  }
});
test('corrupt saved multidiscipline does not invent an owner completion prompt',async t=>{
  const f=await fixture(t,{profiles:[artist('musica',{disciplinas:'{broken'})]});
  await settle(f.page);assert.equal(await nudge(f.page).isVisible(),false);
});
test('a late read cannot paint an old account after logout',async t=>{
  const gate=deferred();let held=true;
  const f=await fixture(t,{api:async({call})=>{if(ownReads({calls:[call]}).length&&held){await gate.promise;return {body:[artist()]};}}});
  t.after(()=>gate.resolve());await f.page.waitForFunction(()=>window.BuscARTESesion?.status==='verified');
  f.state.user=null;await f.page.evaluate(()=>window.BuscARTESesion.refresh({reload:false}));
  held=false;gate.resolve();await settle(f.page);assert.equal(await nudge(f.page).isVisible(),false);
});
test('completion at a fresh revision removes stale suggestions',async t=>{
  const f=await fixture(t);await settle(f.page);await nudge(f.page).waitFor({state:'visible'});
  const complete=artist('musica',{instrumento:'Voz / Canto',bio:'Mi presentación.',foto_url:'https://example.test/avatar.jpg',perfil_revision:2});
  f.state.profiles=[complete];f.state.user=complete;
  await f.page.evaluate(()=>window.BuscARTESesion.refresh({reload:false}));await settle(f.page);
  assert.equal(await nudge(f.page).isVisible(),false);assert.equal(ownReads(f.state).length,2);
});
test('dismissal is scoped to the verified account, including unavailable sessionStorage',async t=>{
  for(const storageUnavailable of [false,true]){
    const f=await fixture(t,{storageUnavailable});await settle(f.page);await nudge(f.page).waitFor({state:'visible'});
    await nudge(f.page).getByRole('button',{name:'Ahora no',exact:true}).click();
    await settle(f.page);assert.equal(await nudge(f.page).isVisible(),false);
    const other=artist('musica',{id:9002,nombre:'Otra cuenta de ejemplo'});f.state.user=other;f.state.profiles=[other];
    await f.page.evaluate(()=>window.BuscARTESesion.refresh({reload:false}));await settle(f.page);await nudge(f.page).waitFor({state:'visible'});
  }
});
test('a saved next step is not hidden by dismissing a different missing-data state',async t=>{
  const f=await fixture(t);await settle(f.page);await nudge(f.page).waitFor({state:'visible'});
  await nudge(f.page).getByRole('button',{name:'Ahora no',exact:true}).click();
  const improved=artist('musica',{instrumento:'Bajo',perfil_revision:2});
  f.state.profiles=[improved];f.state.user=improved;
  await f.page.evaluate(()=>window.BuscARTESesion.refresh({reload:false}));await settle(f.page);
  await nudge(f.page).waitFor({state:'visible'});assert.match(await action(f.page).innerText(),/presentación/);
});
for(const width of [320,390,1440])test(width+'px public results explain missing information without hiding/reordering people',async t=>{
  const profiles=[
    artist('musica',{id:9001,nombre:'Perfil inicial de ejemplo',created_at:'2026-10-20T12:00:00Z'}),
    artist('musica',{id:9002,nombre:'Artista sin foto',instrumento:'Guitarra',generos:'Rock',created_at:'2026-10-19T12:00:00Z'}),
    artist('musica',{id:9003,nombre:'Artista con presentación',bio:'Mi proyecto artístico.',instrumento:'Piano',created_at:'2026-10-18T12:00:00Z'})
  ];
  const f=await fixture(t,{route:'buscARTE_busqueda.html?rubro=musica',width,user:null,profiles});
  await f.page.locator('.musician-card').first().waitFor();
  const cards=f.page.locator('.musician-card');
  assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),['9001','9002','9003']);
  const initial=f.page.locator('.musician-card[data-id="9001"]'),withRole=f.page.locator('.musician-card[data-id="9002"]');
  assert.match(await initial.innerText(),/Perfil inicial/);assert.match(await initial.innerText(),/Todavía no agregó su presentación/);
  assert.doesNotMatch(await initial.innerText(),/Músico en buscARTE|sospechos|fals|spam|%/i);
  assert.equal(await initial.locator('.ba-profile-initial').count(),1);
  assert.equal(await withRole.locator('.ba-profile-initial').count(),0,'A missing photo alone is not a public label');
  assert.match(await withRole.innerText(),/Guitarra/);assert.match(await withRole.innerText(),/Rock/i);
  const publicLink=initial.locator('a[href*="perfil_publico"]');assert.equal(await publicLink.count(),1);
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(width===390){
    await initial.evaluate(el=>el.scrollIntoView({block:'center'}));
    await initial.screenshot({path:path.join(output,'initial-card-390.png'),animations:'disabled'});
    await publicLink.focus();await f.page.keyboard.press('Enter');
    await f.page.waitForURL(url=>url.pathname.endsWith('/buscARTE_perfil_publico.html')&&url.searchParams.get('id')==='9001');
  }
  findings.push({route:'search',width,threeCardsPreserved:true,orderUnchanged:true,honestFallback:true});
});
test('public display normalization does not mislabel raw corrupt JSON as an initial profile',async t=>{
  const profiles=[
    artist('musica',{id:9001,nombre:'Campos ilegibles de ejemplo',campos_especificos:'{broken'}),
    artist('musica',{id:9002,nombre:'Disciplinas ilegibles de ejemplo',disciplinas:'{broken'})
  ];
  const f=await fixture(t,{route:'buscARTE_busqueda.html?rubro=musica',width:390,user:null,profiles});
  const cards=f.page.locator('.musician-card');await cards.first().waitFor();
  assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),['9001','9002']);
  assert.equal(await cards.locator('.ba-profile-initial').count(),0,'Unknown raw detail is not evidence of an empty professional profile');
  assert.equal(await cards.locator('a[href*="perfil_publico"]').count(),2,'Both people remain reachable');
  findings.push({route:'search',rawCorruptCamposAndDisciplinas:true,noFalseInitialBadge:true});
});
