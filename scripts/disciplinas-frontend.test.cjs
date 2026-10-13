/* Canonical-source MD tests. Synthetic transport; never any live network/data/email. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:4195';
const output=path.resolve(root,'..','BuscARTE-resguardos','disciplinas-frontend-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const sources=new Map(JSON.parse(fs.readFileSync(path.join(root,'site-files.json'))).map(file=>[file,fs.readFileSync(path.join(root,file))]));
const fixture=()=>({id:210,nombre:'Persona de prueba aislada',email:'fixture@example.invalid',tipo_cuenta:'artista',rubro:'musica',perfil_revision:0,disciplinas:null,instrumento:'Batería, Instrumento histórico',generos:'Jazz',referentes:'Referencia histórica',disponibilidad:'Sesiones',donde_ensaya:'Ensayo histórico',experiencia:null,campos_especificos:null,bio:'Presentación compartida.',provincia:'CABA',ciudad:'Buenos Aires (CABA)',barrio:'Almagro',redes:'{}',videos:'',foto_url:null,baneado:false});
const sandbox={window:{}};vm.runInNewContext(sources.get('assets/js/disciplinas.js').toString(),sandbox);const adapter=sandbox.window.BuscARTEDisciplinas;
const clone=value=>JSON.parse(JSON.stringify(value));
test('ten legacy disciplines adapt exactly once, preserving nullable fields, aliases and unknown values',()=>{
  for(const rubro of adapter.keys){const row={...fixture(),rubro,campos_especificos:JSON.stringify({'chips-rol-danza':['Valor histórico'],unknown:{nested:[]},explicitEmpty:'',canonical:[]})};const state=adapter.read(row,true);assert.deepEqual(clone(state.selected),[rubro]);for(const key of adapter.fields)assert.deepEqual(clone(state.details[rubro][key]),key==='campos_especificos'?JSON.parse(row[key]):row[key]);assert.equal(state.details.musica!=null,rubro==='musica');}
  assert.deepEqual(clone(adapter.list({...fixture(),tipo_cuenta:'negocio'})),[]);assert.deepEqual(clone(adapter.list({...fixture(),tipo_cuenta:'visitante'})),[]);assert.deepEqual(clone(adapter.list(null)),[]);
});
test('secondary projection never mixes namespaces, including role/style collisions and explicit empties',()=>{
  const musica=adapter.detail(fixture()),danza={...adapter.empty(),campos_especificos:{rol:['Coreógrafo'],disciplina:[]},experiencia:2};
  const row={...fixture(),disciplinas:{version:1,selected:['musica','danza'],details:{musica,danza}}};
  const p=adapter.project(row,'danza');assert.equal(p.rubro,'danza');assert.equal(p.rubro_principal,'musica');assert.equal(p.generos,'');assert.deepEqual(clone(p.campos_especificos),danza.campos_especificos);assert.equal(adapter.project(row,'tatuaje'),null);assert.equal(adapter.has(row,'musica'),true);
  p.campos_especificos.rol.push('Otro');assert.deepEqual(row.disciplinas.details.danza.campos_especificos.rol,['Coreógrafo']);
});
test('malformed MD is readable as principal-only but cannot be silently overwritten by strict editor',()=>{
  for(const bad of [{version:2,selected:['musica'],details:{}},{version:1,selected:['musica','musica'],details:{}},{version:1,selected:['danza'],details:{danza:{}}},'{invalid']){const row={...fixture(),disciplinas:bad};assert.deepEqual(clone(adapter.list(row)),['musica']);assert.throws(()=>adapter.read(row,true));}
});
let browser,serverMD;
before(async()=>{serverMD=await import('../netlify/lib/disciplinas.mjs');browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{await browser?.close();const drift=[...sources].filter(([file,bytes])=>!fs.readFileSync(path.join(root,file)).equals(bytes)).map(([file])=>file);const hashes=Object.fromEntries([...sources].map(([file,bytes])=>[file,createHash('sha256').update(bytes).digest('hex')]));fs.writeFileSync(path.join(output,'snapshot.json'),JSON.stringify({scope:'Canonical frontend + actual backend MD normalizer. All network fulfilled/aborted; synthetic identities only; no live writes/emails/native-app certification.',sourceDrift:drift,hashes},null,2));console.log('MD QA evidence: '+output);assert.deepEqual(drift,[],'Do not certify a stale snapshot');});
async function setup(t,{file='buscARTE_perfil.html',width=320,row=fixture(),others=[],signed=true}={}){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<768,isMobile:width<768,serviceWorkers:'block'});
  const state={profile:clone(row),user:signed?clone(row):null,calls:[],errors:[],unexpected:[],conflict:false,confirm:true,failFavorite:false,saved:new Set(others.map(p=>p.id))};
  await context.addInitScript(({row,signed})=>{if(!sessionStorage.getItem('md-fixture')){sessionStorage.setItem('md-fixture','1');localStorage.setItem('buscarte_meta_consent_v1','denied');if(signed)for(const [key,value]of Object.entries({ba_logged:'1',ba_user_id:String(row.id),ba_name:row.nombre,ba_tipo_cuenta:row.tipo_cuenta,ba_rubro:row.rubro || ''}))localStorage.setItem(key,value);}window.__mdConfirm=true;window.confirm=()=>window.__mdConfirm;window.alert=()=>{};},{row,signed});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{state.unexpected.push('WebSocket');socket.close();});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.origin===origin&&url.pathname==='/.netlify/functions/sesion'){state.calls.push({path:'sesion',method});if(method==='POST'){state.user=null;return reply({ok:true});}return state.user?reply({user:state.user}):reply({code:'SESSION_REQUIRED'},401);}
    if(url.origin===origin&&url.pathname==='/.netlify/functions/guardar-perfil'){
      const body=request.postDataJSON();state.calls.push({path:'guardar-perfil',method,body});assert.equal(body.password,undefined);assert.equal(body.email,undefined);
      if(!state.user)return reply({code:'SESSION_REQUIRED'},401);
      if(state.conflict || (body.changes.disciplinas && body.expectedRevision!==state.profile.perfil_revision))return reply({code:'PROFILE_CONFLICT'},409);
      const changes=body.changes;
      try {state.profile={...state.profile,...serverMD.prepareProfileChanges(state.profile,changes,body.expectedRevision)};}catch(error){return reply({error:error.message},error.message==='conflict'?409:400);}
      state.user=clone(state.profile);return reply([state.profile]);
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/datos'){
      assert.equal(request.headers().apikey,undefined);assert.equal(request.headers().authorization,undefined);
      const api=new URL(url.searchParams.get('path'),'https://fixture.invalid');state.calls.push({path:api.pathname,method,query:api.search,...(method==='POST'?{body:request.postDataJSON()}: {})});
      if(method==='GET'&&api.pathname==='/rest/v1/perfiles'){
        const target=api.searchParams.get('id'),category=api.searchParams.get('rubro')?.replace(/^eq\./,'');let profiles=[state.profile,...others];
        if(target?.startsWith('eq.'))profiles=profiles.filter(p=>String(p.id)===target.slice(3));
        if(target?.startsWith('in.'))profiles=profiles.filter(p=>target.includes(String(p.id)));
        if(category)profiles=profiles.filter(p=>p.baneado!==true&&p.tipo_cuenta==='artista').map(p=>adapter.project(p,category)).filter(Boolean);
        return reply(profiles.map(p=>({...p,rubro_principal:p.rubro_principal || p.rubro})));
      }
      if(api.pathname==='/rest/v1/perfiles_guardados'){
        if(method==='GET')return reply([...state.saved].map(id=>({perfil_id:id})));
        if(state.failFavorite)return reply({error:'Synthetic failure.'},500);
        if(method==='POST'){state.saved.add(request.postDataJSON().perfil_id);return reply([]);}
        if(method==='DELETE'){state.saved.delete(Number(api.searchParams.get('perfil_id')?.slice(3)));return reply([]);}
      }
      if(method==='GET'&&['mensajes','conversaciones','anuncios','reacciones','artistas_sugeridos'].some(table=>api.pathname==='/rest/v1/'+table))return reply([]);
      if(method==='POST'&&api.pathname==='/rest/v1/rpc/login_usuario'){state.user=clone(state.profile);return reply(state.user);}
      state.unexpected.push(method+' '+api.pathname);return route.abort();
    }
    let file=url.pathname.slice(1)||'index.html';if(!sources.has(file)&&sources.has(file+'.html'))file+='.html';
    if(url.origin===origin&&method==='GET'&&sources.has(file))return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json'})[path.extname(file)]||'text/plain',body:sources.get(file)});
    if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.hostname==='js.hcaptcha.com')return route.fulfill({contentType:'application/javascript',body:'// Isolated fixture.'});
    state.unexpected.push(method+' '+url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>state.errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(state.unexpected,[]);assert.deepEqual(state.errors,[]);}finally{await context.close();}});
  await page.goto(origin+'/'+file);await page.evaluate(()=>document.fonts.ready);
  if(file==='buscARTE_perfil.html'&&signed)await page.waitForFunction(()=>!isLoadingProfile&&!!perfilCargado);
  return {page,state,context};
}
const mdRow=()=>{const row=fixture();return {...row,rubro:'danza',instrumento:'',generos:'',referentes:'',campos_especificos:{rol:['Bailarín/a'],disciplina:['Contemporáneo']},disciplinas:{version:1,selected:['danza','musica'],details:{danza:{...adapter.empty(),campos_especificos:{rol:['Bailarín/a'],disciplina:['Contemporáneo']},disponibilidad:'Doy clases',experiencia:2},musica:adapter.detail(row)}}};};
for(const width of [320,390,1440])test('editor '+width+'px adds/edits namespaces and changes principal only after verified atomic save',async t=>{
  const f=await setup(t,{width});const before=clone(f.state.profile);await f.page.locator('#bio-text').fill('Bio compartida editada.');
  await f.page.locator('#md-add').selectOption('danza');await f.page.getByRole('button',{name:'Agregar disciplina',exact:true}).click();
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('ba_rubro')),'musica');assert.equal(f.state.profile.disciplinas,null);
  await f.page.locator('#chips-rol-dan').getByRole('button',{name:'Coreógrafo',exact:true}).click();await f.page.locator('#chips-disc-dan').getByRole('button',{name:'Contemporáneo',exact:true}).click();
  await f.page.locator('[data-disciplina="danza"]').getByRole('button',{name:'Hacer principal'}).click();
  await f.page.locator('[data-disciplina="musica"]').locator('button[aria-pressed]').click();
  assert.ok(await f.page.locator('#chips-inst .selected').allTextContents().then(values=>values.includes('Instrumento histórico')));assert.deepEqual(await f.page.locator('#chips-gen .selected').allTextContents(),['Jazz']);
  assert.equal(await f.page.locator('#bio-text').inputValue(),'Bio compartida editada.');
  await f.page.locator('[data-disciplina="danza"]').locator('button[aria-pressed]').click();
  assert.deepEqual(await f.page.locator('#chips-disc-dan .selected').allTextContents(),['Contemporáneo']);
  if(width!==390){await f.page.locator('#mis-disciplinas').scrollIntoViewIfNeeded();await f.page.screenshot({path:path.join(output,'editor-'+width+'.png'),animations:'disabled'});}
  await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await f.page.waitForFunction(()=>!isSavingProfile&&perfilCargado.perfil_revision===1);
  assert.equal(f.state.profile.rubro,'danza');assert.equal(f.state.profile.bio,'Bio compartida editada.');assert.deepEqual(f.state.profile.disciplinas.selected,['musica','danza']);assert.equal(f.state.profile.disciplinas.details.musica.instrumento,before.instrumento);assert.equal(f.state.profile.disciplinas.details.musica.donde_ensaya,before.donde_ensaya);assert.equal(f.state.profile.disciplinas.details.musica.experiencia,null);assert.deepEqual(f.state.profile.campos_especificos,{rol:['Coreógrafo'],disciplina:['Contemporáneo']});
  const call=f.state.calls.find(c=>c.path==='guardar-perfil');assert.equal(call.body.expectedRevision,0);assert.equal(call.body.changes.rubro,'danza');assert.equal(call.body.changes.instrumento,undefined);
  await f.page.waitForFunction(()=>BuscARTESesion.user.rubro==='danza');assert.equal(await f.page.evaluate(()=>localStorage.getItem('ba_rubro')),'danza');assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await f.page.reload();await f.page.waitForFunction(()=>!isLoadingProfile&&perfilCargado.perfil_revision===1);assert.equal(await f.page.locator('#md-list .md-row').count(),2);
});
test('remove/cancel/readd is deliberate, never updates cache early and retains shared fields',async t=>{
  const f=await setup(t,{row:mdRow()});await f.page.locator('#bio-text').fill('No perder esta bio.');
  await f.page.evaluate(()=>window.__mdConfirm=false);await f.page.locator('[data-disciplina="musica"]').getByRole('button',{name:'Quitar Música'}).click();assert.equal(await f.page.locator('#md-list .md-row').count(),2);
  await f.page.evaluate(()=>window.__mdConfirm=true);await f.page.locator('[data-disciplina="musica"]').getByRole('button',{name:'Quitar Música'}).click();assert.equal(await f.page.locator('#md-list .md-row').count(),1);assert.equal(f.state.profile.disciplinas.selected.length,2);
  await f.page.getByRole('button',{name:'Deshacer cambios de disciplinas'}).click();assert.equal(await f.page.locator('#md-list .md-row').count(),2);assert.equal(await f.page.locator('#bio-text').inputValue(),'No perder esta bio.');
  await f.page.locator('[data-disciplina="musica"]').getByRole('button',{name:'Quitar Música'}).click();await f.page.locator('#md-add').selectOption('musica');await f.page.getByRole('button',{name:'Agregar disciplina',exact:true}).click();assert.equal(await f.page.locator('#chips-inst .selected').count(),0,'Re-added removed draft is intentionally empty');
});

test('changing principal and removing the old one confirms cleanly when GET has a virtual rubro_principal',async t=>{
  const f=await setup(t,{row:mdRow()});await f.page.locator('[data-disciplina="musica"]').getByRole('button',{name:'Hacer principal'}).click();await f.page.locator('[data-disciplina="danza"]').getByRole('button',{name:'Quitar Danza'}).click();
  await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await f.page.waitForFunction(()=>!isSavingProfile&&perfilCargado.perfil_revision===1);assert.match(await f.page.locator('#profile-status').innerText(),/guardado correctamente/);assert.equal(await f.page.evaluate(()=>perfilCargado.rubro_principal),'musica');assert.deepEqual(f.state.profile.disciplinas.selected,['musica']);assert.equal(f.state.profile.disciplinas.details.danza,undefined);
});
test('409 conflict and expired session preserve MD/common draft and cache while refusing false success',async t=>{
  const f=await setup(t);await f.page.locator('#md-add').selectOption('escritura');await f.page.getByRole('button',{name:'Agregar disciplina',exact:true}).click();await f.page.locator('#chips-rol-esc').getByRole('button',{name:'Poeta',exact:true}).click();await f.page.locator('#bio-text').fill('Borrador con conflicto.');f.state.conflict=true;
  await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await f.page.waitForFunction(()=>!isSavingProfile);assert.match(await f.page.locator('#profile-status').innerText(),/otra pestaña/);assert.equal(await f.page.locator('#md-list .md-row').count(),2);assert.equal(await f.page.locator('#bio-text').inputValue(),'Borrador con conflicto.');assert.equal(f.state.profile.disciplinas,null);
  f.state.user=null;await f.page.evaluate(()=>BuscARTESesion.refresh({reload:false}));await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();assert.equal(await f.page.locator('#bio-text').inputValue(),'Borrador con conflicto.');assert.equal(f.state.calls.filter(c=>c.path==='guardar-perfil').length,1);
});
test('secondary music enables generator and is removed on verified membership change/logout',async t=>{
  const f=await setup(t,{row:mdRow(),file:'buscARTE_generador.html'});await f.page.waitForFunction(()=>BuscARTESesion.status==='verified');assert.equal(await f.page.evaluate(()=>BuscARTEMenu.isMusician()),true);assert.equal(await f.page.locator('main').getAttribute('inert'),null);
  f.state.profile={...f.state.profile,disciplinas:{version:1,selected:['danza'],details:{danza:f.state.profile.disciplinas.details.danza}}};f.state.user=clone(f.state.profile);await f.page.evaluate(()=>BuscARTESesion.refresh({reload:false}));assert.equal(await f.page.evaluate(()=>BuscARTEMenu.isMusician()),false);assert.notEqual(await f.page.locator('main').getAttribute('inert'),null);
  await f.page.evaluate(()=>BuscARTESesion.logout());await f.page.waitForURL(origin+'/index.html');assert.equal(await f.page.evaluate(()=>localStorage.getItem('ba_disciplinas')),null);
});
test('search in secondary projects only its fields, excludes nonmembers/nonartists and deduplicates ID',async t=>{
  const multi={...mdRow(),id:310,nombre:'Danza y Música'};const unrelated={...fixture(),id:311,nombre:'Sólo Música'};const visitor={...multi,id:312,tipo_cuenta:'visitante'};
  const f=await setup(t,{file:'buscARTE_busqueda.html?rubro=danza',others:[multi,multi,unrelated,visitor]});await f.page.waitForFunction(()=>Array.isArray(perfilesCache)&&perfilesCache.length>0);const rows=await f.page.evaluate(()=>perfilesCache);assert.equal(rows.filter(p=>p.id===310).length,1);assert.equal(rows.some(p=>p.id===311||p.id===312),false);assert.deepEqual(rows.find(p=>p.id===310).campos_especificos,{rol:['Bailarín/a'],disciplina:['Contemporáneo']});assert.equal(rows.find(p=>p.id===310).generos,'');assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});
test('public secondary context keeps principal banner and shows honest namespaces at 320px',async t=>{
  const multi={...mdRow(),id:310};const f=await setup(t,{file:'buscARTE_perfil_publico.html?id=310&rubro=musica',others:[multi]});await f.page.waitForFunction(()=>document.body.dataset.profileState==='other');assert.match(await f.page.locator('#perfil-instrumento').innerText(),/Bailar/);assert.match(await f.page.locator('#md-profile-note').innerText(),/Encontraste.*Música.*principal.*Danza/);assert.match(await f.page.locator('#md-public-musica').innerText(),/Instrumento histórico.*Jazz/s);assert.match(await f.page.locator('#md-public-danza').innerText(),/Contemporáneo/);assert.doesNotMatch(await f.page.locator('#md-public-danza').innerText(),/Jazz|Instrumento histórico/);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});

test('every field in all ten real discipline catalogs is selectable, saved and restored independently',async t=>{
  for(const rubro of adapter.keys){
    const row={...fixture(),rubro,instrumento:'',generos:'',referentes:'',disponibilidad:'',donde_ensaya:'',campos_especificos:{untouched:'Histórico'}};
    const f=await setup(t,{row});const expected={untouched:'Histórico'};
    if(rubro==='musica') {await f.page.locator('#chips-inst').getByRole('button',{name:'Guitarra',exact:true}).click();await f.page.locator('#chips-gen').getByRole('button',{name:'Jazz',exact:true}).click();}
    else {
      const fields=await f.page.evaluate(()=>RUBROS_PERFIL_CONFIG[rubroActivo].secciones.map(sec=>({id:sec.id,key:SECTION_KEYS[sec.id],type:sec.type,value:sec.chips?.[0]})));
      for(const field of fields){if(field.type==='textarea'){await f.page.locator('#'+field.id).fill('Texto opcional de prueba.');expected[field.key]='Texto opcional de prueba.';}else {await f.page.locator('#'+field.id).getByRole('button',{name:field.value,exact:true}).click();expected[field.key]=[field.value];}}
    }
    assert.equal(await f.page.locator('#exp-slider').isVisible(),true);await f.page.locator('#exp-slider').fill('3');await f.page.locator('#disponibilidad-grid .disp-card').first().click();
    if(rubro==='tatuaje') {
      const colors=await f.page.evaluate(()=>{const sample=document.createElement('span');document.body.append(sample);sample.style.color='var(--blanco)';const white=getComputedStyle(sample).color;sample.style.color='var(--neon)';const neon=getComputedStyle(sample).color;sample.remove();const button=document.querySelector('.md-row button[aria-pressed="true"]');return {white,neon,button:getComputedStyle(button).color,border:getComputedStyle(button).borderTopColor,experience:getComputedStyle(document.getElementById('exp-val')).color,palette:document.documentElement.style.getPropertyValue('--neon')};});
      assert.equal(colors.button,colors.white);assert.equal(colors.experience,colors.white);assert.equal(colors.border,colors.neon);assert.equal(colors.palette,'#c45bff');
    }
    await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await f.page.waitForFunction(()=>!isSavingProfile&&perfilCargado.perfil_revision===1);
    const saved=f.state.profile.disciplinas.details[rubro];assert.deepEqual(saved.campos_especificos,expected);assert.equal(saved.experiencia,3);assert.notEqual(saved.disponibilidad,'');
    if(rubro==='musica'){assert.equal(saved.instrumento,'Guitarra');assert.equal(saved.generos,'Jazz');}
    await f.page.reload();await f.page.waitForFunction(()=>!isLoadingProfile&&perfilCargado.perfil_revision===1);
    if(rubro==='musica'){assert.deepEqual(await f.page.locator('#chips-inst .selected').allTextContents(),['Guitarra']);assert.deepEqual(await f.page.locator('#chips-gen .selected').allTextContents(),['Jazz']);}
    else {const rendered=await f.page.evaluate(()=>[...document.querySelectorAll('#mi-rubro-contenido .chip.selected')].map(node=>node.textContent.trim()));const selected=Object.entries(expected).filter(([key,value])=>key!=='untouched'&&Array.isArray(value)).flatMap(([,value])=>value);assert.deepEqual(rendered.sort(),selected.sort());}
    await f.context.close();
  }
});
test('saved membership filters preserve one saved ID and use chosen discipline fields',async t=>{
  const multi={...mdRow(),id:310};const f=await setup(t,{file:'buscARTE_guardados.html',others:[multi]});await f.page.waitForFunction(()=>typeof perfilesGuardados!=='undefined'&&perfilesGuardados.length===1);await f.page.evaluate(()=>setRubroFilter('musica'));const rows=await f.page.evaluate(()=>getFilteredPerfiles());assert.equal(rows.length,1);assert.equal(rows[0].id,310);assert.match(rows[0].instrumento,/Instrumento histórico/);await f.page.evaluate(()=>setRubroFilter('danza'));const rows2=await f.page.evaluate(()=>getFilteredPerfiles());assert.equal(rows2.length,1);assert.equal(rows2[0].generos,'');assert.deepEqual(rows2[0].campos_especificos,{rol:['Bailarín/a'],disciplina:['Contemporáneo']});
});

test('all ten real editors roundtrip legacy unknown fields and explicit empties without adding another discipline',async t=>{
  for(const rubro of adapter.keys){
    const legacy={...fixture(),rubro,campos_especificos:JSON.stringify({unknown:{nested:['Valor histórico']},explicitEmpty:'',rol:[],disciplina:[]})};
    const f=await setup(t,{row:legacy});
    assert.equal(await f.page.locator('#md-list .md-row').count(),1);
    await f.page.locator('#bio-text').fill('Presentación mínima guardada en fixture.');await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await f.page.waitForFunction(()=>!isSavingProfile&&perfilCargado.perfil_revision===1);
    assert.deepEqual(f.state.profile.disciplinas.selected,[rubro]);assert.deepEqual(f.state.profile.disciplinas.details[rubro].campos_especificos,JSON.parse(legacy.campos_especificos));assert.equal(f.state.profile.disciplinas.details[rubro].experiencia,null);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  }
});

test('secondary contexts keep experience, availability and explicit role removal independent',async t=>{
  const row=mdRow();row.disciplinas.details.danza.campos_especificos.unknown='No perder';
  const f=await setup(t,{row});await f.page.locator('#chips-rol-dan').getByRole('button',{name:'Bailarín/a',exact:true}).click();
  await f.page.locator('#exp-slider').fill('5');await f.page.locator('#disponibilidad-grid').getByRole('button',{name:/Colaboraciones/}).click();
  await f.page.locator('[data-disciplina="musica"]').locator('button[aria-pressed]').click();assert.equal(await f.page.locator('#exp-slider').inputValue(),'0');
  await f.page.locator('[data-disciplina="danza"]').locator('button[aria-pressed]').click();assert.equal(await f.page.locator('#exp-slider').inputValue(),'5');
  await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await f.page.waitForFunction(()=>!isSavingProfile&&perfilCargado.perfil_revision===1);
  assert.deepEqual(f.state.profile.disciplinas.details.danza.campos_especificos.rol,[]);assert.equal(f.state.profile.disciplinas.details.danza.campos_especificos.unknown,'No perder');assert.equal(f.state.profile.disciplinas.details.danza.experiencia,5);assert.equal(f.state.profile.disciplinas.details.musica.experiencia,null);assert.equal(f.state.profile.disciplinas.details.musica.disponibilidad,'Sesiones');assert.match(f.state.profile.disciplinas.details.danza.disponibilidad,/Doy clases.*Colaboraciones|Colaboraciones.*Doy clases/);
});

test('nonartists see no MD editor or musician tools and retain their own role',async t=>{
  for(const type of ['negocio','visitante']){const row={...fixture(),tipo_cuenta:type,rubro:type==='negocio'?'Sala':null};const f=await setup(t,{row});assert.equal(await f.page.locator('#mis-disciplinas').isVisible(),false);assert.equal(await f.page.locator('#experiencia').isVisible(),false);assert.equal(await f.page.evaluate(()=>BuscARTEMenu.isMusician()),false);await f.page.locator('#bio-text').fill('Presentación de cuenta sin convertirla en artista.');await f.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await f.page.waitForFunction(()=>!isSavingProfile);const save=f.state.calls.find(c=>c.path==='guardar-perfil');assert.equal(save.body.changes.disciplinas,undefined);assert.equal(f.state.profile.tipo_cuenta,type);assert.equal(f.state.profile.rubro,row.rubro);}
});

test('Home reflects confirmed secondary membership without counting or creating extra people',async t=>{
  const f=await setup(t,{file:'index.html',row:mdRow()});await f.page.waitForFunction(()=>document.documentElement.dataset.homeSession==='member');await f.page.locator('#home-disciplinas').waitFor({state:'visible'});assert.match(await f.page.locator('#home-disciplinas').innerText(),/Danza.*Principal.*Música/s);assert.ok(f.state.calls.every(c=>c.method==='GET'));assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});

test('public favorites verify persistence errors and guard duplicate submits for the same person ID',async t=>{
  const multi={...mdRow(),id:310};const f=await setup(t,{file:'buscARTE_perfil_publico.html?id=310&rubro=musica',others:[multi]});await f.page.waitForFunction(()=>document.body.dataset.profileState==='other'&&yaGuardado===true);f.state.failFavorite=true;
  await f.page.locator('#save-btn').click();await f.page.waitForFunction(()=>!guardandoPerfil);assert.equal(await f.page.evaluate(()=>yaGuardado),true);assert.match(await f.page.locator('#save-btn').innerText(),/No se quitó/i);assert.equal(f.state.saved.has(310),true);
  f.state.failFavorite=false;await f.page.locator('#save-btn').click();await f.page.waitForFunction(()=>!guardandoPerfil&&yaGuardado===false);assert.equal(f.state.saved.has(310),false);
  const before=f.state.calls.length;await f.page.evaluate(()=>{toggleSave();toggleSave();});await f.page.waitForFunction(()=>!guardandoPerfil&&yaGuardado===true);assert.equal(f.state.calls.slice(before).filter(c=>c.path==='/rest/v1/perfiles_guardados'&&c.method==='POST').length,1);assert.equal(f.state.saved.size,1);assert.equal(f.state.saved.has(310),true);
});
