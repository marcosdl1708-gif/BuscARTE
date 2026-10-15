const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../netlify/functions/email-worker.mjs'),'utf8');
function fixture(options={}) {
  const calls=[];let elapsed=0;
  const context=vm.createContext({Response,console:{log(){},warn(){}},
    Date:{now:()=>elapsed},setTimeout:fn=>{fn();return 1;},
    mailService:{dispatch:async()=>{calls.push('mail');elapsed=options.elapsed||0;if(options.mailWait)await options.mailWait;if(options.mailError)throw Error('Synthetic');return{status:'empty'};}},
    accountDeletionService:{processOne:async(id,limits)=>{calls.push({id,limits});if(options.cleanupError)throw Error('Synthetic');return{status:'empty'};}}
  });
  const isolated=source.replace(/^import .*;\r?\n/gm,'').replace('export default async function worker','async function worker').replace('export const config','const config');
  vm.runInContext(isolated+'\nglobalThis.handle=worker;',context);
  return {calls,handle:context.handle};
}
test('existing mail schedule also runs one bounded deletion job without a new cron',async()=>{
  const f=fixture();assert.equal((await f.handle()).status,200);assert.equal(f.calls[0],'mail');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1])),{id:null,limits:{maxMillis:6000,maxBatches:2}});
  assert.match(source,/schedule:'\*\/5 \* \* \* \*'/);
});
test('mail outage cannot skip already-requested file cleanup',async()=>{
  const f=fixture({mailError:true});assert.equal((await f.handle()).status,503);assert.equal(f.calls.length,2);
});
test('cleanup outage does not change mail outcome or invoke any direct transport',async()=>{
  const f=fixture({cleanupError:true});assert.equal((await f.handle()).status,200);assert.equal(f.calls.length,2);
  assert(!/\bfetch\s*\(/.test(source));
});
test('slow mail never starves cleanup or shortens its independent bounded budget',async()=>{
  const late=fixture({elapsed:29000});await late.handle();assert.equal(late.calls.length,2);assert.equal(late.calls[1].limits.maxMillis,6000);
});
test('cleanup begins even while a provider dispatch is still unresolved',async()=>{
  let resume;const mailWait=new Promise(resolve=>{resume=resolve;}),f=fixture({mailWait});
  const pending=f.handle();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.length,2,'both operations started before releasing the synthetic mail provider');
  resume();assert.equal((await pending).status,200);
});
