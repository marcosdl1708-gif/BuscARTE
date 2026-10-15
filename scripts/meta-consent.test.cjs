/* Local consent/queue contracts. No provider SDK, browser, network or campaign writes. */
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','assets/js/meta-pixel.js'),'utf8');
const V1='buscarte_meta_consent_v1',V2='buscarte_meta_consent_v2_2026-10-15',SENT='buscarte_meta_sent_v1:';
const plain=value=>JSON.parse(JSON.stringify(value));

function storageHub(initial={}) {
  const values=new Map(Object.entries(initial)),tabs=[],events=[];
  return {values,tabs,events,
    flush(){let count=0;while(events.length){if(++count>200)throw Error('Storage event cycle');const {tab,event}=events.shift();tab.emit('storage',event);}},
    raw(key,value){if(value===null)values.delete(key);else values.set(key,String(value));},
    store(tab,faults){
      const store={getItem(key){if(faults.read)throw Error('Synthetic inaccessible storage');return values.has(key)?values.get(key):null;},
        setItem(key,value){if(faults.write)throw Error('Synthetic quota exceeded');const old=values.has(key)?values.get(key):null;values.set(key,String(value));if(old!==String(value))for(const other of tabs)if(other!==tab)events.push({tab:other,event:{key,oldValue:old,newValue:String(value),storageArea:other.local}});},
        removeItem(key){if(faults.write)throw Error('Synthetic inaccessible storage');const old=values.has(key)?values.get(key):null;if(!values.delete(key))return;for(const other of tabs)if(other!==tab)events.push({tab:other,event:{key,oldValue:old,newValue:null,storageArea:other.local}});},
        clear(){if(faults.write)throw Error('Synthetic inaccessible storage');values.clear();for(const other of tabs)if(other!==tab)events.push({tab:other,event:{key:null,oldValue:null,newValue:null,storageArea:other.local}});}};
      return store;
    }};
}
function fixture(options={}) {
  const hub=options.hub||storageHub(options.stored),faults={localGetter:false,sessionGetter:false,read:false,write:false,...options.faults};
  const elements=new Map(),requests=[],cookieWrites=[],listeners=new Map(),sessionValues=new Map(Object.entries(options.session||{}));
  const cookies=new Map(Object.entries(options.cookies||{_fbp:'old-browser-id',_fbc:'old-click-id',buscarte_session:'keep-auth',site_preference:'keep-preference'}));
  const location=new URL(options.url||'https://buscarte.com.ar/buscARTE_busqueda.html');
  const tab={emit(type,detail={}){for(const item of [...(listeners.get(type)||[])]){item.fn.call(context,{type,...detail});if(item.once)listeners.set(type,listeners.get(type).filter(value=>value!==item));}},local:null};
  const listen=(type,fn,opts)=>{const list=listeners.get(type)||[];list.push({fn,once:opts?.once===true});listeners.set(type,list);};
  function element(tag='div') {
    const node={tagName:tag.toUpperCase(),id:'',attributes:{},style:{},children:[],parentNode:null,textContent:'',html:'',handlers:new Map(),
      setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key]??null;},
      appendChild(child){child.parentNode=this;this.children.push(child);if(child.id)elements.set(child.id,child);if(child.tagName==='SCRIPT')requests.push({src:child.src,attributes:{...child.attributes}});return child;},
      remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);if(elements.get(this.id)===this)elements.delete(this.id);},
      querySelector(selector){return this.subnodes?.get(selector)||null;},
      addEventListener(type,fn){const list=this.handlers.get(type)||[];list.push(fn);this.handlers.set(type,list);},
      click(){for(const fn of this.handlers.get('click')||[])fn({type:'click',target:this});}};
    Object.defineProperty(node,'innerHTML',{get(){return this.html;},set(value){this.html=String(value);this.subnodes=new Map();for(const key of ['[data-deny]','[data-allow]'])if(this.html.includes(key.slice(1,-1))){const button=element('button');this.subnodes.set(key,button);}}});
    return node;
  }
  const statusNode=element('p'),document={head:element('head'),body:options.noBody?null:element('body'),documentElement:element('html'),readyState:options.loading?'loading':'complete',
    getElementById:id=>elements.get(id)||null,createElement:element,addEventListener:(type,fn,opts)=>listen('document:'+type,fn,opts),
    querySelectorAll:selector=>selector==='[data-meta-consent-status]'?[statusNode]:[]};
  Object.defineProperty(document,'cookie',{get(){return [...cookies].map(([key,value])=>key+'='+value).join('; ');},set(value){if(options.cookieThrows)throw Error('Synthetic cookies disabled');cookieWrites.push(String(value));const name=String(value).split('=')[0];if(/Max-Age=0/i.test(value))cookies.delete(name);}});
  tab.local=hub.store(tab,faults);hub.tabs.push(tab);
  const session={getItem:key=>sessionValues.get(key)??null,setItem:(key,value)=>{sessionValues.set(key,String(value));},removeItem:key=>sessionValues.delete(key)};
  const context=vm.createContext({document,location,URL,URLSearchParams,console,
    addEventListener:listen,fetch(){throw Error('No network permitted');}});context.window=context;
  Object.defineProperty(context,'localStorage',{get(){if(faults.localGetter)throw Error('Synthetic SecurityError');return tab.local;}});
  Object.defineProperty(context,'sessionStorage',{get(){if(faults.sessionGetter)throw Error('Synthetic SecurityError');return session;}});
  vm.runInContext(source,context,{filename:'meta-pixel.js'});
  const sdk={commands:[],events:[],loaded:false,permission:true,load(){
    assert.ok(context.fbq,'SDK only exists after consent');assert.equal(this.loaded,false);this.loaded=true;
    const fbq=context.fbq,queued=Array.from(fbq.queue||[],command=>Array.from(command));fbq.queue=[];
    const dispatch=(...args)=>{const command=plain(args);this.commands.push(command);if(command[0]==='consent')this.permission=command[1]==='grant';if(/^track/.test(command[0])&&this.permission)this.events.push(command);};
    fbq.callMethod=dispatch;for(const command of queued)dispatch(...command);
  }};
  return {context,api:context.MetaAds,hub,faults,document,location,local:tab.local,session,sessionValues,requests,cookieWrites,cookies,statusNode,sdk,
    emit:tab.emit,queue:()=>Array.from(context.fbq?.queue||[],command=>plain(Array.from(command))),
    banner:()=>elements.get('ba-meta-consent'),ready(){document.body=element('body');document.readyState='complete';tab.emit('document:DOMContentLoaded');},
    setURL(value){location.href=new URL(value,location.href).href;}};
}

test('legacy grant never loads the SDK or silently accepts the renewed disclosure',()=>{
  const f=fixture({stored:{[V1]:'granted'}});assert.equal(f.api.getConsent(),'unknown');assert.equal(f.requests.length,0);assert.ok(f.banner());
  assert.equal(f.hub.values.has(V2),false);assert.equal(f.cookies.has('_fbp'),false);assert.equal(f.cookies.get('buscarte_session'),'keep-auth');
  assert.equal(f.api.trackOnce('CompleteRegistration',{account_type:'artista'},'registration:1'),false);assert.equal(f.requests.length,0);
});

test('legacy refusal remains denied without another banner and migrates only a refusal',()=>{
  const f=fixture({stored:{[V1]:'denied'}});assert.equal(f.api.getConsent(),'denied');assert.equal(f.hub.values.get(V2),'denied');assert.equal(f.banner(),undefined);assert.equal(f.requests.length,0);
  f.api.showPreferences();assert.ok(f.banner());assert.match(f.banner().innerHTML,/Medición y publicidad opcionales/);
});

for(const [current,legacy,expected]of [['granted','denied','granted'],['denied','granted','denied'],['GRANTED','granted','unknown'],['true','denied','unknown'],['','granted','unknown']])test(`versioned choice ${JSON.stringify(current)} supersedes legacy ${legacy}: ${expected}`,()=>{
  const f=fixture({stored:{[V1]:legacy,[V2]:current}});assert.equal(f.api.getConsent(),expected);assert.equal(f.requests.length,expected==='granted'?1:0);
  assert.equal(!!f.banner(),expected==='unknown');
});

test('explicit renewed grant keeps campaign ID, event API and historical dedupe prefix unchanged',()=>{
  const f=fixture({stored:{[V1]:'granted'}});f.api.setConsent(true);assert.equal(f.api.getConsent(),'granted');
  assert.equal(f.hub.values.get(V2),'granted');assert.equal(f.hub.values.get(V1),'denied');assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].src,'https://connect.facebook.net/en_US/fbevents.js');assert.equal(f.requests[0].attributes['data-meta-pixel-loader'],'buscarte');
  assert.deepEqual(f.queue().find(command=>command[0]==='init'),['init','1982530688931438']);f.sdk.load();
  assert.equal(f.api.trackOnce('CompleteRegistration',{account_type:'artista'},'registration:1'),true);
  assert.equal(f.api.trackOnce('CompleteRegistration',{account_type:'artista'},'registration:1'),false);
  assert.equal(f.hub.values.get(SENT+'registration:1'),'1');assert.equal(f.sdk.events.filter(command=>command[1]==='CompleteRegistration').length,1);
});

test('local/session storage getters and reads can fail without permission or an exception',()=>{
  for(const faults of [{localGetter:true},{read:true},{localGetter:true,sessionGetter:true}]){
    const f=fixture({stored:{[V1]:'granted',[V2]:'granted'},faults});assert.equal(f.api.getConsent(),'unknown');assert.equal(f.requests.length,0);assert.ok(f.banner());
    assert.doesNotThrow(()=>{f.api.trackOnce('ViewContent',{category:'musica'},'content:1','session');f.api.setConsent(false);f.emit('focus');f.emit('pageshow',{persisted:true});});
    assert.equal(f.api.getConsent(),'denied');assert.equal(f.requests.length,0);
  }
});

test('failed choice write cannot resurrect a previously stored grant after local revocation',()=>{
  const f=fixture({stored:{[V2]:'granted'}});f.sdk.load();f.faults.write=true;f.api.setConsent(false);
  assert.equal(f.hub.values.get(V2),'granted');const before=f.sdk.events.length;
  f.emit('focus');f.emit('pageshow',{persisted:true});f.emit('storage',{key:V2,storageArea:f.local});
  assert.equal(f.api.track('ViewContent',{category:'musica'}),false);assert.equal(f.api.getConsent(),'denied');assert.equal(f.sdk.events.length,before);
  assert.equal(f.sdk.commands.at(-1)[0],'consent');assert.equal(f.sdk.commands.at(-1)[1],'revoke');
  f.faults.write=false;f.api.setConsent(true);assert.equal(f.api.getConsent(),'granted');assert.equal(f.api.track('ViewContent',{category:'musica'}),true);
});

test('missing quota cannot turn a historical refusal into a migrated grant',()=>{
  const f=fixture({stored:{[V1]:'denied'},faults:{write:true}});assert.equal(f.api.getConsent(),'denied');assert.equal(f.requests.length,0);assert.equal(f.banner(),undefined);assert.equal(f.hub.values.has(V2),false);
});

test('revoke while SDK is delayed purges PageView and queued conversion before synthetic load',()=>{
  const f=fixture();f.api.setConsent(true);f.api.trackOnce('CompleteRegistration',{account_type:'artista'},'registration:2');f.api.trackCustom('PublishAd',{category:'musica'});
  assert.ok(f.queue().some(command=>command[0]==='track'));assert.ok(f.queue().some(command=>command[0]==='trackCustom'));
  f.api.setConsent(false);assert.equal(f.queue().some(command=>/^track/.test(command[0])),false);assert.deepEqual(f.queue()[0],['consent','revoke']);
  f.sdk.load();assert.deepEqual(f.sdk.events,[]);assert.equal(f.hub.values.get(SENT+'registration:2'),'1','consent renewal must not reset historical sent markers');
  f.api.setConsent(true);assert.equal(f.sdk.events.filter(command=>command[1]==='PageView').length,1);assert.equal(f.api.trackOnce('CompleteRegistration',{},'registration:2'),false);
});

test('two storage-linked tabs propagate current grants and revocations without treating legacy grants as current consent',()=>{
  const hub=storageHub({[V1]:'granted'}),a=fixture({hub}),b=fixture({hub});assert.equal(a.requests.length+b.requests.length,0);
  a.api.setConsent(true);hub.flush();assert.equal(b.api.getConsent(),'granted');assert.equal(b.requests.length,1);a.sdk.load();b.sdk.load();
  const before=b.sdk.events.length;a.api.setConsent(false);hub.flush();assert.equal(b.api.getConsent(),'denied');assert.equal(b.api.track('ViewContent',{}),false);assert.equal(b.sdk.events.length,before);
  assert.equal(hub.values.get(V1),'denied');assert.equal(hub.values.get(V2),'denied');assert.equal(b.banner(),undefined);
});

test('storage clear invalidates current permission in both tabs, including before the writer next emits an event',()=>{
  const hub=storageHub({[V2]:'granted'}),a=fixture({hub}),b=fixture({hub});a.sdk.load();b.sdk.load();const before=a.sdk.events.length;
  a.local.clear();hub.flush();assert.equal(b.api.getConsent(),'unknown');assert.ok(b.banner());
  assert.equal(a.api.track('ViewContent',{}),false);assert.equal(a.api.getConsent(),'unknown');assert.equal(a.sdk.events.length,before);assert.ok(a.banner());
});

test('focus and BFCache pageshow reconcile a missed revocation before allowing more events',()=>{
  for(const type of ['focus','pageshow']){
    const f=fixture({stored:{[V2]:'granted'}});f.sdk.load();const before=f.sdk.events.length;f.hub.raw(V2,'denied');f.emit(type,{persisted:true});
    assert.equal(f.api.getConsent(),'denied');assert.equal(f.api.trackCustom('PublishAd',{}),false);assert.equal(f.sdk.events.length,before);
  }
});

test('a missed storage message still revalidates before the next track call',()=>{
  const f=fixture({stored:{[V2]:'granted'}});f.sdk.load();const before=f.sdk.events.length;f.hub.raw(V2,'denied');
  assert.equal(f.api.trackOnce('Contact',{ad_type:'busco'},'contact:1'),false);assert.equal(f.api.getConsent(),'denied');assert.equal(f.sdk.events.length,before);assert.equal(f.hub.values.has(SENT+'contact:1'),false);
});

test('unrelated storage areas/keys do not refresh a current preference; valid local signal does',()=>{
  const f=fixture({stored:{[V2]:'granted'}});f.hub.raw(V2,'denied');f.emit('storage',{key:'other_setting',storageArea:f.local});assert.equal(f.api.getConsent(),'granted');
  f.emit('storage',{key:V2,storageArea:f.session});assert.equal(f.api.getConsent(),'granted');f.emit('storage',{key:V2,storageArea:f.local});assert.equal(f.api.getConsent(),'denied');
});

for(const route of ['/buscARTE_mensajes.html','/buscARTE_perfil_publico.html?id=123','/buscARTE_busqueda.html?email=qa%40example.invalid','/buscARTE_anuncios.html?utm_source=token-secret','/buscARTE_busqueda.html?fbclid=+541112345678','/index.html#access_token=abc'])test(`sensitive URL stays outside SDK loading and app events: ${route}`,()=>{
  const f=fixture({url:'https://buscarte.com.ar'+route,stored:{[V2]:'granted'}});assert.equal(f.requests.length,0);assert.equal(f.api.track('ViewContent',{category:'musica'}),false);assert.equal(f.requests.length,0);
});

test('safe public URL initializes only once and parameters exclude contact data and free text fields',()=>{
  const f=fixture({url:'https://buscarte.com.ar/buscARTE_anuncio_detalle.html?id=321&rubro=musica&utm_source=facebook&fbclid=AbCdEf',stored:{[V2]:'granted'}});f.sdk.load();
  f.api.trackCustom('PublishAd',{ad_type:'busco',category:'musica',email:'qa@example.invalid',telefono:'1234567890',nombre:'Persona',bio:'Mensaje privado',mensaje:'Texto de chat',user_id:123,
    bogus_contact:'qa@example.invalid',count:4,paid:false,invalid:Infinity,description:'Free text',nested:{secret:'fixture'}});
  assert.deepEqual(f.sdk.events.at(-1),['trackCustom','PublishAd',{project:'buscarte',ad_type:'busco',category:'musica',count:4,paid:false}]);
  assert.equal(f.requests.length,1);assert.equal(f.sdk.events.filter(command=>command[1]==='PageView').length,1);
  assert.equal(f.api.track('bad event name',{}),false);
});

test('location becoming sensitive prevents deferred app queue flush and later dispatch',()=>{
  const f=fixture();f.api.trackOnce('Contact',{category:'musica'},'contact:old');f.setURL('/buscARTE_perfil_publico.html?id=2');f.api.setConsent(true);
  assert.equal(f.requests.length,0);assert.equal(f.api.track('ViewContent',{}),false);assert.equal(f.hub.values.has(SENT+'contact:old'),false);
  f.setURL('/buscARTE_busqueda.html');assert.equal(f.api.track('ViewContent',{}),true);assert.equal(f.requests.length,1);
});

test('grant after an initialized page moved to sensitive URL never flushes queued events there',()=>{
  const f=fixture({stored:{[V2]:'granted'}});f.sdk.load();f.hub.raw(V2,null);f.emit('focus');f.api.trackOnce('Contact',{},'contact:pending');
  const before=f.sdk.events.length;f.setURL('/buscARTE_busqueda.html?email=private%40example.invalid');f.api.setConsent(true);
  assert.equal(f.sdk.events.length,before);assert.equal(f.hub.values.has(SENT+'contact:pending'),false);
});

test('historical and session dedupe markers survive consent renewal and retain their established scope',()=>{
  const f=fixture({stored:{[V2]:'granted',[SENT+'registration:existing']:'1'},session:{[SENT+'view:existing']:'1'}});f.sdk.load();
  assert.equal(f.api.trackOnce('CompleteRegistration',{},'registration:existing'),false);assert.equal(f.api.trackOnce('ViewContent',{},'view:existing','session'),false);
  assert.equal(f.api.trackCustomOnce('Contact',{},'contact:new','session'),true);assert.equal(f.sessionValues.get(SENT+'contact:new'),'1');assert.equal(f.hub.values.has(SENT+'contact:new'),false);
  f.api.setConsent(false);f.api.setConsent(true);assert.equal(f.api.trackCustomOnce('Contact',{},'contact:new','session'),false);assert.equal(f.hub.values.get(SENT+'registration:existing'),'1');
});

test('only Meta cookies are expired, including owned parent domain on a subdomain',()=>{
  const f=fixture({url:'https://www.buscarte.com.ar/index.html',stored:{[V2]:'denied'}});
  assert.ok(f.cookieWrites.length>=6);assert.ok(f.cookieWrites.every(value=>/^_(fbp|fbc)=; Max-Age=0; path=\//.test(value)));
  for(const domain of ['.www.buscarte.com.ar','.buscarte.com.ar'])assert.ok(f.cookieWrites.some(value=>value.includes('domain='+domain+';')));
  assert.equal(f.cookies.get('buscarte_session'),'keep-auth');assert.equal(f.cookies.get('site_preference'),'keep-preference');assert.equal(f.cookies.has('_fbp'),false);assert.equal(f.cookies.has('_fbc'),false);
  assert.equal(f.cookieWrites.some(value=>/domain=\.(?:com\.ar|netlify\.app);/.test(value)),false);
  const preview=fixture({url:'https://fixture.netlify.app/index.html'});assert.equal(preview.cookieWrites.some(value=>value.includes('domain=.netlify.app;')),false);
});

test('cookie API failure does not grant consent or break the platform',()=>{
  const f=fixture({cookieThrows:true,stored:{[V1]:'granted'}});assert.equal(f.api.getConsent(),'unknown');assert.equal(f.requests.length,0);assert.doesNotThrow(()=>f.api.setConsent(false));assert.equal(f.api.getConsent(),'denied');
});

test('deferred DOM initialization draws only the renewed disclosure, with explicit deny and allow actions',()=>{
  const f=fixture({noBody:true,loading:true,stored:{[V1]:'granted'}});assert.equal(f.banner(),undefined);assert.equal(f.requests.length,0);f.ready();
  assert.ok(f.banner());assert.match(f.banner().innerHTML,/compartimos con Meta/);assert.match(f.statusNode.textContent,/Todavía no elegiste/);
  f.banner().querySelector('[data-deny]').click();assert.equal(f.api.getConsent(),'denied');assert.equal(f.requests.length,0);assert.equal(f.banner(),undefined);
});
