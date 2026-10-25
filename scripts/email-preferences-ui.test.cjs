const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'assets/js/email-preferencias.js'),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(preferences,{failGet=false,failPost=false,session='verified'}={}) {
  const calls=[];
  const elements = new Map();
  for (const id of ['mail-preferences','mail-marketing-opt-in','mail-marketing-frequency','mail-onboarding-enabled','mail-preferences-save','mail-preferences-retry','mail-preferences-feedback']) {
    const listeners={};
    elements.set(id,{id,checked:false,value:id==='mail-marketing-frequency'?'monthly':'',disabled:true,hidden:false,textContent:'',dataset:{},
      setAttribute(name,value){this[name]=value;},addEventListener(name,fn){(listeners[name]??=[]).push(fn);},
      async emit(name){for(const fn of listeners[name]||[])await fn();}});
  }
  const context=vm.createContext({document:{readyState:'complete',getElementById:id=>elements.get(id)},
    window:{BuscARTESesion:{ready:Promise.resolve(),status:session}},AbortController,setTimeout,clearTimeout,
    fetch:async(url,options)=>{
      assert.equal(url,'/.netlify/functions/email-preferences');
      assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
      calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
      if ((options.method==='GET'&&failGet)||(options.method==='POST'&&failPost)) return {ok:false,status:503};
      return {ok:true,status:200,json:async()=>plain(preferences)};
    }});
  vm.runInContext(source,context,{timeout:1000});
  return {calls,elements,get:id=>elements.get(id),ready:async()=>{await settle();await settle();}};
}

test('legacy monthly preferences load without a subscription write or automatic frequency upgrade',async()=>{
  const f=fixture({marketing_opt_in:true,onboarding_disabled:false});await f.ready();
  assert.deepEqual(f.calls.map(x=>x.method),['GET']);assert.equal(f.get('mail-marketing-opt-in').checked,true);
  assert.equal(f.get('mail-marketing-frequency').value,'monthly');assert.equal(f.get('mail-marketing-frequency').disabled,false);
  assert.equal(f.get('mail-preferences-save').disabled,false);
});

test('a declined subscription stays unchecked and its frequency control is disabled',async()=>{
  const f=fixture({marketing_opt_in:false,onboarding_disabled:true,marketing_frequency:'monthly'});await f.ready();
  assert.equal(f.get('mail-marketing-opt-in').checked,false);assert.equal(f.get('mail-marketing-frequency').disabled,true);assert.equal(f.get('mail-onboarding-enabled').checked,false);
  f.get('mail-marketing-opt-in').checked=true;await f.get('mail-marketing-opt-in').emit('change');
  assert.equal(f.get('mail-marketing-frequency').disabled,false);assert.equal(f.calls.length,1);
});

test('only saving the explicit frequency choice sends fortnightly preferences',async()=>{
  const f=fixture({marketing_opt_in:true,onboarding_disabled:false,marketing_frequency:'monthly'});await f.ready();
  f.get('mail-marketing-frequency').value='fortnightly';await f.get('mail-marketing-frequency').emit('change');
  assert.equal(f.calls.length,1);await f.get('mail-preferences-save').emit('click');
  assert.deepEqual(f.calls[1].body,{marketing_opt_in:true,marketing_frequency:'fortnightly',onboarding_disabled:false});
  assert.match(f.get('mail-preferences-feedback').textContent,/quedaron guardadas/);
});

test('unknown frequency or unavailable preferences fail closed without overwriting stored choices',async()=>{
  for(const [preferences,options] of [[{marketing_opt_in:true,onboarding_disabled:false,marketing_frequency:'daily'},{}],[{marketing_opt_in:true,onboarding_disabled:false},{failGet:true}],[{marketing_opt_in:true,onboarding_disabled:false},{session:'anonymous'}]]) {
    const f=fixture(preferences,options);await f.ready();
    assert.equal(f.get('mail-preferences-save').disabled,true);assert.equal(f.get('mail-marketing-frequency').disabled,true);assert.equal(f.get('mail-preferences-retry').hidden,false);
    await f.get('mail-preferences-save').emit('click');assert(!f.calls.some(x=>x.method==='POST'));
  }
});

test('failed save preserves the selected frequency and leaves a retryable error',async()=>{
  const f=fixture({marketing_opt_in:true,onboarding_disabled:false,marketing_frequency:'monthly'},{failPost:true});await f.ready();
  f.get('mail-marketing-frequency').value='fortnightly';await f.get('mail-preferences-save').emit('click');
  assert.equal(f.get('mail-marketing-frequency').value,'fortnightly');assert.equal(f.get('mail-preferences-save').disabled,false);
  assert.equal(f.get('mail-preferences-feedback').dataset.state,'error');assert.match(f.get('mail-preferences-feedback').textContent,/Conservamos tu elección/);
});

test('historical help starts unchecked and only an active enabling choice adds proof intent',async()=>{
  const f=fixture({marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly',onboarding_consent_required:true});await f.ready();
  assert.equal(f.get('mail-onboarding-enabled').checked,false);assert.equal(f.calls.length,1);
  await f.get('mail-preferences-save').emit('click');
  assert.deepEqual(f.calls[1].body,{marketing_opt_in:false,marketing_frequency:'monthly',onboarding_disabled:true});
  f.get('mail-onboarding-enabled').checked=true;await f.get('mail-onboarding-enabled').emit('change');await f.get('mail-preferences-save').emit('click');
  assert.deepEqual(f.calls[2].body,{marketing_opt_in:false,marketing_frequency:'monthly',onboarding_disabled:false,onboarding_choice:true});
  await f.get('mail-preferences-save').emit('click');assert.equal(Object.hasOwn(f.calls[3].body,'onboarding_choice'),false,'A subsequent save does not pretend a new enabling action');
});

test('malformed historical-help status fails closed without a preference mutation',async()=>{
  const f=fixture({marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly',onboarding_consent_required:'false'});await f.ready();
  assert.equal(f.get('mail-preferences-save').disabled,true);assert.equal(f.get('mail-preferences-retry').hidden,false);assert(!f.calls.some(call=>call.method==='POST'));
});

test('registration discloses fifteen-day frequency, leaves opt-in unchecked and all three roles send the explicit choice',()=>{
  const html=fs.readFileSync(path.join(root,'buscARTE_registro.html'),'utf8');
  const input=html.match(/<input[^>]*id="reg-email-marketing"[^>]*>/)[0];assert(!/\schecked(?:\s|=|>)/.test(input));
  assert.match(html,/Convocatorias y novedades de BuscARTE por email, cada quince días/);
  assert.equal((html.match(/email_marketing_frequency:'fortnightly'/g)||[]).length,3);
});
