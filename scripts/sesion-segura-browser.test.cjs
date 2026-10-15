/* Actual release pages with fail-closed synthetic transport. No live service writes. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.BUSCARTE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:4196';
const published=JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8'));
const sources=new Map(published.map(file=>[file,fs.readFileSync(path.join(root,file))]));
const initial={id:210,nombre:'Persona sintética',email:'qa@example.invalid',tipo_cuenta:'artista',rubro:'musica',instrumento:'Batería',generos:'Rock, Pop',referentes:'',bio:'Presentación sintética.',provincia:'CABA',ciudad:'Buenos Aires (CABA)',barrio:'Almagro',campos_especificos:null,foto_url:null,disciplinas:null,perfil_revision:0};
let browser,serverMD;
before(async()=>{serverMD=await import('../netlify/lib/disciplinas.mjs');browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});});
after(async()=>{await browser?.close();});
async function setup(t,{file='buscARTE_perfil.html',width=390,signed=true,cached=true,type='artista',rubro='musica',signupFailure=null,termsAccepted=true}={}) {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:width<768,serviceWorkers:'block'});
  const profile={...initial,tipo_cuenta:type,rubro};
  const state={user:signed?{...profile}:null,profile,failSave:false,termsAccepted,calls:[],unexpected:[],errors:[]};
  await context.addInitScript(({cached,type,rubro})=>{
    if(!sessionStorage.getItem('security-qa-init')){
      sessionStorage.setItem('security-qa-init','1');localStorage.setItem('buscarte_meta_consent_v1','denied');
      if(cached)for(const [key,value]of Object.entries({ba_logged:'1',ba_user_id:'210',ba_tipo_cuenta:type,ba_rubro:rubro,ba_name:'Persona sintética'}))localStorage.setItem(key,value);
    }
    window.__securityQaAlerts=[];window.alert=message=>window.__securityQaAlerts.push(String(message));window.confirm=()=>true;window.prompt=()=>{throw Error('Unexpected password prompt');};
  },{cached,type,rubro});
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>{state.unexpected.push('WebSocket');socket.close();});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.origin===origin&&url.pathname==='/.netlify/functions/sesion'){
      state.calls.push({path:'sesion',method});
      if(method==='POST'){assert.deepEqual(request.postDataJSON(),{action:'logout'});state.user=null;return reply({ok:true});}
      return state.user?reply({user:state.user}):reply({error:'Sesión requerida',code:'SESSION_REQUIRED'},401);
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/email-preferences'&&method==='GET'){
      state.calls.push({path:'email-preferences',method});
      return state.user?reply({marketing_opt_in:false,onboarding_disabled:false}):reply({code:'SESSION_REQUIRED'},401);
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/condiciones'){
      const body=method==='POST'?request.postDataJSON():null;state.calls.push({path:'condiciones',method,body});
      if(method==='POST'){assert.deepEqual(body,{action:'accept',version:'2026-10-15',accepted:true});state.termsAccepted=true;}
      return reply({version:'2026-10-15',accepted:state.termsAccepted});
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/guardar-perfil'){
      const body=request.postDataJSON();state.calls.push({path:'guardar-perfil',method,body});
      assert.equal(body.email,undefined);assert.equal(body.password,undefined);assert.equal(String(body.profileId),'210');
      if(state.failSave||!state.user)return reply({error:'Sesión vencida'},401);
      if(body.operation==='verify')return reply([{id:210}]);
      if(!state.termsAccepted)return reply({code:'TERMS_REQUIRED',version:'2026-10-15',error:'Aceptá los Términos de uso.'},428);
      state.profile={...state.profile,...serverMD.prepareProfileChanges(state.profile,body.changes,body.expectedRevision)};state.user={...state.profile};return reply([state.profile]);
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/reset-password'){
      const body=request.postDataJSON();state.calls.push({path:'reset-password',method,body});
      return reply({ok:true,valido:true,nombre:'Persona sintética'});
    }
    if(url.origin===origin&&url.pathname==='/.netlify/functions/datos'){
      const api=new URL(url.searchParams.get('path'),'https://fixture.invalid');
      assert.equal(request.headers().apikey,undefined);assert.equal(request.headers().authorization,undefined);
      const body=method==='GET'?null:request.postDataJSON();state.calls.push({path:api.pathname,method,query:api.search,body});
      if(api.pathname==='/rest/v1/rpc/login_usuario'&&method==='POST'){state.user={...state.profile};return reply(state.user);}
      if(api.pathname==='/rest/v1/rpc/registrar_usuario'&&method==='POST'){
        if(signupFailure==='abort')return route.abort('connectionfailed');
        return reply({error:'No pudimos confirmar la creación',code:'REGISTRATION_UNCONFIRMED'},503);
      }
      if(api.pathname==='/rest/v1/anuncios'&&method==='POST')return reply([{id:99,...body}]);
      if(method==='GET'&&api.pathname==='/rest/v1/perfiles')return reply([state.profile]);
      if(method==='GET'&&['mensajes','conversaciones','anuncios','reacciones','perfiles_guardados','artistas_sugeridos'].some(table=>api.pathname==='/rest/v1/'+table))return reply([]);
      state.unexpected.push('Unexpected gateway operation '+method+' '+api.pathname);return route.abort();
    }
    let relative=url.pathname.slice(1)||'index.html';
    if(!sources.has(relative)&&sources.has(relative+'.html'))relative+='.html';
    if(url.origin===origin&&method==='GET'&&sources.has(relative))return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json'})[path.extname(relative)]||'text/plain',body:sources.get(relative)});
    if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.hostname==='js.hcaptcha.com')return route.fulfill({contentType:'application/javascript',body:'// Intentionally isolated: no real captcha API or token.'});
    state.unexpected.push(method+' '+url.origin+url.pathname);return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>state.errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(state.unexpected,[]);assert.deepEqual(state.errors,[]);}finally{await context.close();}});
  await page.goto(origin+'/'+file);
  if(file.startsWith('buscARTE_perfil')&&signed)await page.waitForFunction(()=>!isLoadingProfile&&!!perfilCargado);
  return {page,state,context};
}
for(const width of [320,390,1280])test('cookie-only edit saves and reloads genres without password modal at '+width+'px',async t=>{
  const f=await setup(t,{width});
  await f.page.locator('#chips-gen').getByRole('button',{name:'Rock',exact:true}).click();
  await f.page.locator('#chips-gen').getByRole('button',{name:'Jazz',exact:true}).click();
  await f.page.locator('#save-bar .btn-neon').click();await f.page.waitForFunction(()=>!isSavingProfile);
  assert.match(await f.page.locator('#profile-status').innerText(),/guardado correctamente/);
  assert.equal(await f.page.locator('#profile-reauth-dialog').count(),0);
  const writes=f.state.calls.filter(call=>call.path==='guardar-perfil');assert.equal(writes.length,1);assert.equal(writes[0].body.changes.disciplinas.details.musica.generos,'Jazz, Pop');assert.equal(writes[0].body.expectedRevision,0);
  await f.page.reload();await f.page.waitForFunction(()=>!isLoadingProfile&&!!perfilCargado);assert.deepEqual(await f.page.locator('#chips-gen .selected').allTextContents(),['Jazz','Pop']);
  assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
});
test('actual 320px profile editor preserves draft across terms Cancel and acceptance, then only saves on a fresh click',async t=>{
  const f=await setup(t,{width:320,termsAccepted:false}),draft='Borrador real del editor conservado.';
  await f.page.locator('#bio-text').fill(draft);await f.page.locator('#save-bar .btn-neon').click();
  await f.page.locator('#ba-terms-accepted').waitFor();await f.page.locator('#ba-terms-dialog [data-close]').click();
  await f.page.waitForFunction(()=>!isSavingProfile);assert.equal(await f.page.locator('#bio-text').inputValue(),draft);assert.notEqual(f.state.profile.bio,draft);
  await f.page.locator('#save-bar .btn-neon').click();await f.page.locator('#ba-terms-accepted').check();await f.page.locator('.ba-terms-accept').click();
  await f.page.locator('.ba-terms-success').waitFor();assert.notEqual(f.state.profile.bio,draft,'acceptance alone never saves content');
  await f.page.locator('#ba-terms-dialog [data-close]').click();await f.page.waitForFunction(()=>!isSavingProfile);
  assert.equal(await f.page.locator('#bio-text').inputValue(),draft);await f.page.locator('#save-bar .btn-neon').click();await f.page.waitForFunction(()=>!isSavingProfile);
  assert.equal(f.state.profile.bio,draft);assert.match(await f.page.locator('#profile-status').innerText(),/guardado correctamente/);
});

test('expired save retains the actual editor draft and succeeds after renewing cookie in another tab',async t=>{
  const f=await setup(t);await f.page.locator('#bio-text').fill('Un borrador que no debe desaparecer.');
  f.state.user=null;f.state.failSave=true;await f.page.locator('#save-bar .btn-neon').click();await f.page.waitForFunction(()=>!isSavingProfile);
  assert.match(f.page.url(),/buscARTE_perfil\.html$/);assert.equal(await f.page.locator('#bio-text').inputValue(),'Un borrador que no debe desaparecer.');
  assert.equal(await f.page.locator('#ba-session-notice a').getAttribute('target'),'_blank');assert.match(await f.page.locator('#profile-status').innerText(),/sesión venció/);
  f.state.user={...f.state.profile};f.state.failSave=false;await f.page.evaluate(()=>BuscARTESesion.refresh());
  assert.equal(await f.page.locator('#bio-text').inputValue(),'Un borrador que no debe desaparecer.');
  await f.page.locator('#save-bar .btn-neon').click();await f.page.waitForFunction(()=>!isSavingProfile);
  assert.equal(f.state.profile.bio,'Un borrador que no debe desaparecer.');
});
test('production Pretty URL retains editor draft and canonical return when cookie expires',async t=>{
  const f=await setup(t,{file:'buscARTE_perfil'});await f.page.locator('#bio-text').fill('Borrador en URL sin extensión.');
  f.state.user=null;f.state.failSave=true;await f.page.locator('#save-bar .btn-neon').click();await f.page.waitForFunction(()=>!isSavingProfile);
  assert.match(f.page.url(),/buscARTE_perfil$/);assert.equal(await f.page.locator('#bio-text').inputValue(),'Borrador en URL sin extensión.');
  assert.match(await f.page.locator('#ba-session-notice a').getAttribute('href'),/redirect=buscARTE_perfil\.html/);
});
test('private page rejects a forged cached login and explains one-time secure re-entry',async t=>{
  const f=await setup(t,{file:'buscARTE_mensajes.html',signed:false,cached:true});await f.page.waitForURL(/buscARTE_login\.html\?session=upgrade/);
  assert.match(await f.page.locator('#return-note').innerText(),/Actualizamos la seguridad/);
  assert.equal(await f.page.evaluate(()=>localStorage.getItem('ba_logged')),null);
  assert.equal(f.state.calls.some(call=>call.path==='/rest/v1/mensajes'||call.path==='/rest/v1/conversaciones'),false);
});
test('login validates cookie and preserves return to profile completion, without persisting password',async t=>{
  const f=await setup(t,{file:'buscARTE_login.html',signed:false,cached:false});
  await f.page.evaluate(()=>localStorage.setItem('ba_after_login','buscARTE_perfil.html#completar'));
  await f.page.locator('#email').fill('QA@EXAMPLE.INVALID');await f.page.locator('#password').fill('Synthetic-only-password');await f.page.locator('#btn-submit').click();
  await f.page.waitForURL(/buscARTE_perfil\.html#completar/);await f.page.waitForFunction(()=>!isLoadingProfile&&!!perfilCargado);
  const login=f.state.calls.find(call=>call.path==='/rest/v1/rpc/login_usuario');assert.equal(login.body.p_email,'qa@example.invalid');
  assert.equal(await f.page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes('Synthetic-only-password'))),false);
});
test('delete dialog alone requires password, fits 320px, and Cancel removes it without any destructive request',async t=>{
  const f=await setup(t,{width:320});await f.page.evaluate(()=>abrirEliminarCuenta());
  const button=f.page.locator('#btn-delete-confirm');assert.equal(await button.isDisabled(),true);
  await f.page.locator('#delete-email-input').fill('qa@example.invalid');assert.equal(await button.isDisabled(),true);
  await f.page.locator('#delete-password-input').fill('Synthetic-delete-only');assert.equal(await button.isDisabled(),false);
  for(const selector of ['.delete-modal','#delete-email-input','#delete-password-input','#btn-delete-confirm']){
    const box=await f.page.locator(selector).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=321,selector+' fits mobile');
  }
  assert.ok((await button.boundingBox()).height>=44);
  await f.page.locator('.btn-delete-cancel').click();assert.equal(await f.page.locator('#delete-password-input').inputValue(),'');
  assert.equal(f.state.calls.some(call=>call.path==='/rest/v1/rpc/eliminar_cuenta'),false);
});
test('desktop and mobile logout remove backend session before returning to Home',async t=>{
  const f=await setup(t);await f.page.evaluate(()=>mbnLogout());await f.page.waitForURL(origin+'/index.html');
  assert.equal(f.state.user,null);assert.equal(await f.page.evaluate(()=>localStorage.getItem('ba_logged')),null);
  assert.equal(f.state.calls.filter(call=>call.path==='sesion'&&call.method==='POST').length,1);
});
async function registrationFields(page,role='artista',password='Synthetic-only-123!') {
  await page.evaluate(({role,password})=>{
    tipoCuenta=role;rubroSeleccionado='danza';
    document.getElementById('reg-nombre').value='Persona sintética';document.getElementById('reg-email').value='qa@example.invalid';
    document.getElementById('reg-password').value=password;document.getElementById('sel-provincia').value='CABA';
    // Terms rejection is covered separately; these cases exercise the next
    // validation boundary (password/captcha/uncertain registration result).
    document.getElementById('reg-terms-accepted').checked=true;
    document.getElementById('neg-tipo').value='Sala de ensayo';
    window.__qaCaptchaReads=0;
    window.RegistroCaptcha={requireResponse:()=>{window.__qaCaptchaReads++;return 'synthetic-verified-token';},show(){},activate(){},reset(){}};
  },{role,password});
}
test('actual signup validation enforces 72 UTF-8 bytes for all three roles before reading captcha',async t=>{
  const f=await setup(t,{file:'buscARTE_registro.html',signed:false,cached:false});
  for(const [role,fn,step]of [['artista','crearPerfil','perfil'],['negocio','crearNegocio','negocio-contacto'],['visitante','crearVisitante','visitante']]){
    await registrationFields(f.page,role,'😀'.repeat(19));
    await f.page.evaluate(({fn,step})=>window[fn](document.querySelector('#step-'+step+' .btn-next')),{fn,step});
    assert.equal(await f.page.evaluate(()=>__qaCaptchaReads),0);assert.match((await f.page.evaluate(()=>__securityQaAlerts)).at(-1),/máximo 72 bytes/);
  }
  for(const [password,valid]of [['a'.repeat(72),true],['😀'.repeat(18),true],['é'.repeat(36),true],['é'.repeat(37),false],['a'.repeat(73),false],['short',false]]){
    await registrationFields(f.page,'artista',password);assert.equal(await f.page.evaluate(()=>validarDatosCuenta()),valid,'actual UTF-8 rule');
  }
  assert.equal(f.state.calls.some(call=>call.path==='/rest/v1/rpc/registrar_usuario'),false);
});
test('artist bio and business description over 300 are rejected, unchanged, before captcha',async t=>{
  const f=await setup(t,{file:'buscARTE_registro.html',signed:false,cached:false});
  for(const [role,field,fn,step]of [['artista','bio-text','crearPerfil','perfil'],['negocio','neg-descripcion','crearNegocio','negocio-contacto']]){
    await registrationFields(f.page,role);await f.page.evaluate(field=>document.getElementById(field).value='x'.repeat(301),field);
    await f.page.evaluate(({fn,step})=>window[fn](document.querySelector('#step-'+step+' .btn-next')),{fn,step});
    assert.equal(await f.page.evaluate(()=>__qaCaptchaReads),0);assert.equal((await f.page.locator('#'+field).inputValue()).length,301);
    assert.match((await f.page.evaluate(()=>__securityQaAlerts)).at(-1),/hasta 300 caracteres/);
  }
  assert.equal(f.state.calls.some(call=>call.path==='/rest/v1/rpc/registrar_usuario'),false);
});
test('actual reset validator rejects long multibyte passwords even if disabled flag is manually bypassed',async t=>{
  const f=await setup(t,{file:'buscARTE_reset.html?token=synthetic-token-only',signed:false,cached:false});
  await f.page.waitForFunction(()=>document.getElementById('estado-formulario').classList.contains('active'));
  await f.page.evaluate(()=>{document.getElementById('pass1').value='😀'.repeat(19);document.getElementById('pass2').value='😀'.repeat(19);validar();});
  assert.equal(await f.page.locator('#btn-cambiar').isDisabled(),true);assert.match(await f.page.locator('#feedback1').innerText(),/máximo 72 bytes/);
  await f.page.evaluate(()=>{document.getElementById('btn-cambiar').disabled=false;return cambiarPassword();});
  assert.equal(f.state.calls.some(call=>call.path==='reset-password'&&call.body?.accion==='cambiar'),false);
  await f.page.evaluate(()=>{document.getElementById('pass1').value='😀'.repeat(18);document.getElementById('pass2').value='😀'.repeat(18);validar();});
  assert.equal(await f.page.locator('#btn-cambiar').isDisabled(),false);
});
for(const signupFailure of ['503','abort'])test('unknown signup '+signupFailure+' offers login without claiming account exists or resubmitting',async t=>{
  const f=await setup(t,{file:'buscARTE_registro.html',signed:false,cached:false,signupFailure});await registrationFields(f.page,'visitante');
  await f.page.evaluate(()=>crearVisitante(document.querySelector('#step-visitante .btn-next')));
  assert.match(await f.page.locator('#exito-sub').innerText(),/No pudimos confirmar si se creó/);assert.equal(await f.page.locator('#exito-btn').getAttribute('href'),'buscARTE_login.html');
  await f.page.evaluate(()=>crearVisitante(document.querySelector('#step-visitante .btn-next')));
  const writes=f.state.calls.filter(call=>call.path==='/rest/v1/rpc/registrar_usuario');assert.equal(writes.length,1);assert.equal(writes[0].body.captcha_token,'synthetic-verified-token');
});
for(const [type,rubro]of [['negocio','Sala de ensayo'],['visitante',''],['artista','musica']])test(type+': 320px event uses explicit community or artist principal, never business label',async t=>{
  const f=await setup(t,{file:'buscARTE_anuncios.html',width:320,type,rubro});await f.page.evaluate(()=>openModal('jam'));
  const community=f.page.locator('#anuncio-comunidad');
  if(type!=='artista'){
    assert.equal(await community.isVisible(),true);assert.equal(await community.inputValue(),'');
    await f.page.locator('#modal .btn-submit').click();assert.match(await f.page.locator('#publish-status').innerText(),/Elegí a qué comunidad/);
    assert.equal(f.state.calls.some(call=>call.path==='/rest/v1/anuncios'&&call.method==='POST'),false);
    await community.selectOption('danza');
    const box=await community.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=321);
  }else assert.equal(await community.isVisible(),false);
  await f.page.locator('#jam-titulo').fill('Encuentro sintético');await f.page.locator('#form-jam textarea').fill('Descripción sintética, sin publicación real.');
  await f.page.locator('#modal .btn-submit').click();await f.page.waitForFunction(()=>!anuncioEnviando);
  const ad=f.state.calls.find(call=>call.path==='/rest/v1/anuncios'&&call.method==='POST');assert.ok(ad,await f.page.locator('#publish-status').innerText());
  assert.equal(ad.body.rubro,type==='artista'?'musica':'danza');assert.equal(f.state.profile.rubro,rubro);assert.equal(f.state.profile.tipo_cuenta,type);
});
test('nonartist busco requires target selection; Marketplace stays transversal',async t=>{
  const f=await setup(t,{file:'buscARTE_anuncios.html',width:320,type:'negocio',rubro:'Sala de ensayo'});await f.page.evaluate(()=>openModal('busco'));
  assert.equal(await f.page.locator('#busco-rubro-chips .on').count(),0);assert.equal(await f.page.locator('#anuncio-comunidad').isVisible(),false);
  await f.page.locator('#modal .btn-submit').click();assert.match(await f.page.locator('#publish-status').innerText(),/Elegí el rubro/);
  await f.page.locator('#busco-rubro-chips button[onclick*="danza"]').click();
  await f.page.locator('#form-busco input[type=text]').first().fill('Busco colaboración sintética');await f.page.locator('#form-busco textarea').fill('Descripción sintética.');
  await f.page.locator('#modal .btn-submit').click();await f.page.waitForFunction(()=>!anuncioEnviando);
  const busco=f.state.calls.find(call=>call.path==='/rest/v1/anuncios'&&call.method==='POST');assert.equal(busco.body.rubro,'danza');assert.equal(busco.body.rubro_buscado,'danza');
  await f.page.evaluate(()=>{closeModal();openModal('vende');});assert.equal(await f.page.locator('#anuncio-comunidad').isVisible(),false);
  await f.page.locator('#vende-categoria').selectOption('Guitarra eléctrica');await f.page.locator('#form-vende textarea').fill('Venta sintética.');
  await f.page.locator('#modal .btn-submit').click();await f.page.waitForFunction(()=>!anuncioEnviando);
  const ads=f.state.calls.filter(call=>call.path==='/rest/v1/anuncios'&&call.method==='POST');assert.equal(ads.length,2);assert.equal(ads[1].body.rubro,null);
});
test('business offer/classes community is required and selected artistic details fit 320px',async t=>{
  const f=await setup(t,{file:'buscARTE_anuncios.html',width:320,type:'negocio',rubro:'Sala de ensayo'});
  for(const type of ['ofrezco','clases']){
    await f.page.evaluate(type=>openModal(type),type);assert.equal(await f.page.locator('#anuncio-comunidad').isVisible(),true);
    await f.page.locator('#anuncio-comunidad').selectOption('escritura');
    const form=f.page.locator('#form-'+type);assert.equal(await form.isVisible(),true);
    const title=type==='clases'?f.page.locator('#clases-titulo'):form.locator('input[type=text]').first();await title.fill('Anuncio sintético');
    await form.locator('textarea').fill('Propuesta sintética.');await f.page.locator('#modal .btn-submit').click();await f.page.waitForFunction(()=>!anuncioEnviando);
    const ad=f.state.calls.filter(call=>call.path==='/rest/v1/anuncios'&&call.method==='POST').at(-1);assert.equal(ad.body.tipo,type);assert.equal(ad.body.rubro,'escritura');
    await f.page.evaluate(()=>closeModal());
  }
  assert.equal(f.state.profile.rubro,'Sala de ensayo');assert.equal(f.state.profile.tipo_cuenta,'negocio');
});
