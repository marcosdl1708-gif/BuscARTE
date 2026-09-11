const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../buscARTE_anuncio_detalle.html'),'utf8');
const slice = (start,end) => html.slice(html.indexOf(start),html.indexOf(end));
const source = slice('  let reaccionesState =','  function autorSidebar(') + slice('  async function sendMsg(', '  // DEMO SWITCHER');
const response = (data,ok=true) => ({ok,json:async()=>data,text:async()=>JSON.stringify(data)});
function fixture({existing=false,message='',fail='',initial=false}={}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{id,textContent:'0',value:'',style:{},disabled:false,hidden:false, classList:{add(){},toggle(){}},setAttribute(){},querySelector:()=>node(id+'-label'),focus(){}});
    return nodes.get(id);
  };
  const ta=node('attendance-message'); ta.value=message;
  const btn=node('btn-confirmar-asistencia'); btn.dataset={paraId:'22',anuncioId:'99'}; btn.previousElementSibling=ta;
  const storage={ba_logged:'1',ba_user_id:'11',ba_name:'Fixture'};
  const calls=[];
  const state={exists:existing,fail};
  const ctx=vm.createContext({document:{getElementById:node,querySelectorAll:()=>[node('status')],querySelector:()=>node('badge')},localStorage:{getItem:k=>storage[k]||null},console:{warn(){},error(){}},window:{location:{},MetaAds:{trackOnce(){throw Error('tracking unavailable')}}},location:{pathname:'/fixture',search:'?id=99'},confirm:()=>true,alert(){},setTimeout:fn=>fn(),URLSearchParams,SUPABASE_URL:'https://fixture.invalid',hdrs:{'Content-Type':'application/json'},dbId:Number,normalizarTipo:v=>v,ACTION_BTNS:{},
    AbortSignal,
    fetch:async(url,opts={})=>{
      const method=opts.method||'GET'; calls.push({url,method,...opts});
      if(url.includes('/reacciones')) {
        if(state.hold) await state.hold;
        if(state.fail==='write' && method!=='GET') return response({},false);
        if(method==='POST') {assert.match(opts.headers.Prefer,/resolution=ignore-duplicates/);assert.match(url,/on_conflict=user_id,anuncio_id,tipo/);state.exists=true;return response(null);}
        if(method==='DELETE') {state.exists=false;return response(null);}
        if(state.fail==='read') return response([],false);
        if(state.fail==='empty') return response([]);
        return response(state.exists?[{tipo:'asistire'}]:[]);
      }
      if(url.includes('/conversaciones')) return response(method==='POST'?[{id:123}]:[]);
      if(url.includes('/mensajes')) return response(null,state.fail!=='message');
      if(url.includes('/perfiles')) return response([]);
      throw Error('Unexpected network: '+url);
    }
  });
  vm.runInContext(source+`\neventoActual={id:'99'}; reaccionesState.asistire=${initial};`,ctx);
  return {ctx,node,btn,ta,state,calls,storage,confirmed:()=>vm.runInContext('reaccionesState.asistire',ctx)};
}

test('vacío/espacios confirma asistencia sin chat, conversación ni email',async()=>{
  for (const message of ['', '  \n ']) {
    const f=fixture({message}); await f.ctx.confirmarAsistencia(f.btn);
    assert.equal(f.confirmed(),true); assert.match(f.node('status').textContent,/Tu asistencia está confirmada/);
    assert.ok(f.calls.every(c=>c.url.includes('/reacciones'))); assert.equal(f.btn.disabled,true);
    assert.equal(f.node('btn-cancelar-asistencia').hidden,false);
  }
});

test('doble clic entre ambos botones, duplicado existente y cancelación explícita',async()=>{
  const f=fixture({existing:true}); let release; f.state.hold=new Promise(r=>release=r);
  const pending=f.ctx.confirmarAsistencia(f.btn); await f.ctx.confirmarAsistencia();
  assert.equal(f.calls.length,1); assert.equal(f.node('btn-asistire').disabled,true);
  release(); await pending; delete f.state.hold;
  await f.ctx.toggleReaccion('asistire');
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
  await f.ctx.cancelarAsistencia(); await new Promise(setImmediate); assert.equal(f.confirmed(),false);
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,1);
  assert.equal(f.node('count-asistire').textContent,0);
});

test('errores de escritura/readback no confirman; cancelar fallido conserva asistencia',async()=>{
  for(const fail of ['write','read','empty']) {
    const f=fixture({fail}); await f.ctx.confirmarAsistencia(f.btn);
    assert.equal(f.confirmed(),false); assert.equal(f.btn.disabled,false);
    assert.match(f.node('status').textContent,/No pudimos confirmar/);
  }
  const f=fixture({existing:true,initial:true,fail:'write'});
  await f.ctx.cancelarAsistencia(); assert.equal(f.confirmed(),true);
  assert.match(f.node('status').textContent,/No pudimos confirmar/);
});

test('mensaje opcional fallido conserva asistencia y borrador; reintento no repite RSVP',async()=>{
  const f=fixture({message:'Voy con amigos',fail:'message'});
  await f.ctx.confirmarAsistencia(f.btn);
  assert.equal(f.confirmed(),true); assert.equal(f.ta.value,'Voy con amigos');
  assert.match(f.node('status').textContent,/Revisá Mensajes/); assert.equal(f.btn.textContent,'Enviar mensaje →');
  f.state.fail=''; await f.ctx.confirmarAsistencia(f.btn);
  assert.equal(f.ta.value,''); assert.match(f.node('status').textContent,/mensaje enviado/);
  assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.includes('/reacciones')).length,1);
});

test('carga inicial tardía no revierte asistencia; invitado y anuncio no evento no escriben',async()=>{
  const f=fixture(); const normalFetch=f.ctx.fetch; let release;
  f.ctx.fetch=(url,opts)=>!opts?.method && !url.includes('user_id=') && !url.includes('tipo=eq.') ? new Promise(r=>release=()=>r(response([]))) : normalFetch(url,opts);
  const initial=f.ctx.cargarReacciones('99'); await f.ctx.confirmarAsistencia();
  release(); await initial; assert.equal(f.confirmed(),true); assert.equal(f.node('count-asistire').textContent,1);
  const guest=fixture(); delete guest.storage.ba_logged; await guest.ctx.confirmarAsistencia(); assert.equal(guest.calls.length,0);
  const other=fixture(); vm.runInContext('eventoActual=null',other.ctx); await other.ctx.confirmarAsistencia(); assert.equal(other.calls.length,0);
});

test('otros anuncios conservan mensaje obligatorio y envío; scripts válidos y etiqueta opcional',async()=>{
  const f=fixture(); await f.ctx.sendMsg(f.btn); assert.equal(f.calls.length,0);
  f.ta.value='Consulta'; await f.ctx.sendMsg(f.btn);
  assert.equal(f.ta.value,''); assert.equal(f.btn.textContent,'Ver en mensajes →');
  assert.ok(f.calls.every(c=>!c.url.includes('/reacciones')));
  assert.match(html,/Mensaje al organizador \(opcional\)/);
  assert.match(html,/\.btn-reaction\[hidden\] \{ display:none/);
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(!/src\s*=|application\/ld\+json/.test(m[1])) new vm.Script(m[2]);
  }
});

test('contador pendiente no bloquea; una ausencia comprobada corrige estado local obsoleto',async()=>{
  const f=fixture(); const normal=f.ctx.fetch;
  f.ctx.fetch=(url,opts)=>url.includes('tipo=eq.asistire') && !url.includes('user_id=') ? new Promise(()=>{}) : normal(url,opts);
  await f.ctx.confirmarAsistencia(); assert.equal(f.confirmed(),true);
  assert.equal(f.node('btn-cancelar-asistencia').disabled,false);
  assert.match(f.node('status').textContent,/Tu asistencia está confirmada/);
  const stale=fixture({initial:true,existing:false,message:'Hola'});
  await stale.ctx.confirmarAsistencia(stale.btn); assert.equal(stale.confirmed(),false); assert.equal(stale.btn.disabled,false);
  assert.equal(stale.calls.some(c=>c.url.includes('/mensajes')),false);
  await stale.ctx.confirmarAsistencia(stale.btn); assert.equal(stale.confirmed(),true); assert.equal(stale.ta.value,'');
});
