const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function html(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function inline(name) { return [...html(name).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1])).map(m => m[2]).join('\n'); }
function fixture(name, values = {}) {
  const elements = new Map();
  function el(id) {
    if (!elements.has(id)) elements.set(id, { value:values[id] || '', disabled:false, style:{}, textContent:'', classList:{ add(){}, remove(){}, contains(){ return false; } }, setAttribute(){}, removeAttribute(){}, querySelector(){ return null; } });
    return elements.get(id);
  }
  const stored = new Map(), timers = [], calls = [];
  const document = { getElementById:el, querySelectorAll:() => [], querySelector:() => null, addEventListener(){} };
  const location = { origin:'https://buscarte.test', search:'', href:'https://buscarte.test/' };
  const context = vm.createContext({ document, URL, URLSearchParams, navigator:{}, localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},
    window:{ location, addEventListener(){}, matchMedia:()=>({matches:false}) }, console:{error(){}}, setTimeout:fn=>timers.push(fn), clearTimeout(){},
    fetch:async (url, options) => { calls.push({ url, options }); return {ok:true, text:async()=>JSON.stringify({id:210,nombre:'Persona',rubro:'musica',tipo_cuenta:'artista'})}; }
  });
  vm.runInContext(inline(name), context);
  return {context, el, stored, timers, calls, location};
}
test('all public inline scripts compile; local navigation targets and legal anchors exist', () => {
  const published = new Set(JSON.parse(fs.readFileSync(path.join(root,'site-files.json'),'utf8')));
  for (const name of published) if (name.endsWith('.html')) {
    for (const match of html(name).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(match[1]) && !/ld\+json/.test(match[1])) new vm.Script(match[2], {filename:name});
    for (const match of html(name).matchAll(/href=["']([^"']+)["']/gi)) {
      const target = match[1];
      if (/^[^#?]+\.html(?:[?#]|$)/i.test(target) && !/^(?:https?:|javascript:)/.test(target)) assert.ok(published.has(target.split(/[?#]/)[0]), `${name}: ${target}`);
    }
  }
  for (const name of ['buscARTE_privacidad.html','buscARTE_terminos.html','buscARTE_seguridad_infantil.html']) {
    const source = html(name), ids = new Set([...source.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
    for (const match of source.matchAll(/href=["']#([^"']+)["']/g)) assert.ok(ids.has(match[1]), `${name}: missing section ${match[1]}`);
  }
});
test('login preserves cached return target before clearing it and blocks repeated submission', async () => {
  const f=fixture('buscARTE_login.html', {email:'Persona@EXAMPLE.INVALID',password:'Synthetic-password-only'});
  f.stored.set('ba_after_login','buscARTE_perfil.html#completar');
  await vm.runInContext('login()',f.context);
  await vm.runInContext('login()',f.context);
  assert.equal(f.calls.length,1); assert.equal(f.stored.has('ba_after_login'),false);
  f.timers.at(-1)(); assert.equal(f.location.href,'buscARTE_perfil.html#completar');
  assert.equal(JSON.parse(f.calls[0].options.body).p_email,'persona@example.invalid');
});
test('password recovery and Contacto ignore repeated in-flight calls', async () => {
  for (const name of ['buscARTE_recuperar.html','buscARTE_contacto.html']) {
    const f=fixture(name, {'email-input':'persona@example.invalid','c-nombre':'Persona','c-email':'persona@example.invalid','c-asunto':'Feedback general','c-mensaje':'Mensaje sintético'});
    let release; f.context.fetch=(url,options)=>{f.calls.push({url,options}); return new Promise(resolve=>{release=()=>resolve({ok:true,text:async()=>'{"ok":true}'});});};
    const invoke=name.includes('recuperar')?'solicitar()':'enviarContacto(document.getElementById("btn-send"))';
    const pending=vm.runInContext(invoke,f.context); await vm.runInContext(invoke,f.context);
    assert.equal(f.calls.length,1); release(); await pending;
  }
});
test('reset remains disabled and cannot be submitted again while typing during a pending request', async () => {
  const f=fixture('buscARTE_reset.html',{pass1:'Synthetic-only-2026!',pass2:'Synthetic-only-2026!'});
  let release; f.context.fetch=(url,options)=>{f.calls.push({url,options});return new Promise(resolve=>{release=()=>resolve({ok:true,text:async()=>'{"ok":true}'});});};
  const pending=vm.runInContext('cambiarPassword()',f.context);
  vm.runInContext('validar()',f.context);
  assert.equal(f.el('btn-cambiar').disabled, true);
  await vm.runInContext('cambiarPassword()',f.context);
  assert.equal(f.calls.length,1); release(); await pending;
});
test('saved profiles search includes nonmusical specialties, including styles and malformed legacy values', () => {
  const f=fixture('buscARTE_guardados.html',{'search-input':'contemporaneo'});
  vm.runInContext(`perfilesGuardados=[{id:1,nombre:'Persona',rubro:'danza',campos_especificos:'{"rol":["Bailarín/a"],"disciplina":["Contemporáneo"]}'},{id:2,nombre:'Otro',campos_especificos:'malformed'}];`,f.context);
  assert.equal(vm.runInContext('getFilteredPerfiles().length',f.context),1);
  assert.equal(vm.runInContext('getFilteredPerfiles()[0].id',f.context),1);
  const card=vm.runInContext(`buildCard({id:3,instrumento:'R&B',rubro:'musica'})`,f.context);
  assert.match(card, /class="card-bio">R&amp;B<\/div>/); assert.doesNotMatch(card,/R&amp;amp;B/);
});
