import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Only synthetic Storage/DB responses are used. No environment credentials,
// images, file bytes or native network transport are accessed by this suite.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Native transport denied');};
const {cleanupAccountStorage,createAccountDeletionService,AccountCleanupError}=await import('../netlify/lib/account-deletion.mjs');
globalThis.fetch=nativeFetch;
const ID='6cf106b0-c2c0-4846-9494-31e4597d4ef4',LEASE='c506ee32-8c33-4c55-b686-f4b9bb04de5a';
const reply=(value,status=200)=>new Response(value===undefined?null:JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const file=(name,id='synthetic-file-id')=>({name,id,metadata:{mimetype:'image/jpeg'}});
const validJob=()=>({id:ID,perfil_id:'12',status:'leased',lease_token:LEASE,lease_until:'2026-10-15T15:03:00.000Z'});

function fixture(options={}) {
  let clock=Date.parse('2026-10-15T15:00:00.000Z');
  const initial={
    'fotos-perfil':['12-1000000000000.jpg','12-1000000000001.jpeg','123-1000000000000.jpg','112-1000000000000.jpg'],
    'fotos-anuncios':['12-1000000000002-vende-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp','13-ad.jpg'],
    ...options.files
  };
  const objects=new Map(Object.entries(initial).map(([bucket,names])=>[bucket,new Map(names.map((name,index)=>[name,file(name,'synthetic-id-'+index)]))]));
  const calls=[],unexpected=[],finishes=[],guards=[];
  let removes=0,claims=0,profileReads=0,leaseReads=0;
  let currentLease=LEASE,currentStatus='leased';
  const now=()=>clock;
  const backend=async(path,init={})=>{
    const method=init.method || 'GET',body=init.body?JSON.parse(init.body):undefined;
    calls.push({path,method,body,signal:init.signal});
    assert(init.signal,'all cleanup calls must be deadline bounded');
    if(options.advancePerCall)clock+=options.advancePerCall;
    if(path==='/rest/v1/rpc/claim_eliminacion_web') {
      claims++;assert.equal(method,'POST');assert.deepEqual(body,{p_job_id:options.requestJobId ?? null});
      return reply(Object.hasOwn(options,'claim')?options.claim:validJob());
    }
    if(path==='/rest/v1/rpc/finalizar_eliminacion_web') {
      assert.equal(method,'POST');assert.equal(body.p_job_id,ID);assert.equal(body.p_lease,LEASE);
      finishes.push(body);
      if(options.finishThrows)throw new Error('Synthetic internal finish unavailable');
      return reply(options.finishLost?false:true);
    }
    if(path.startsWith('/rest/v1/perfiles?')) {
      profileReads++;guards.push('account');
      assert.equal(method,'GET');
      const url=new URL(path,'https://synthetic.invalid');
      assert.equal(url.searchParams.get('id'),'eq.12');assert.equal(url.searchParams.get('select'),'id');
      return reply(options.profileExists || options.reappearingProfile && profileReads>1?[{id:'12'}]:[]);
    }
    if(path.startsWith('/rest/v1/eliminaciones_storage_web?')) {
      leaseReads++;guards.push('lease');
      assert.equal(method,'GET');
      const url=new URL(path,'https://synthetic.invalid');
      assert.equal(url.searchParams.get('id'),'eq.'+ID);
      const value={...validJob(),lease_token:currentLease,status:currentStatus};
      if(options.leaseMissing)return reply([]);
      if(options.leaseExpired)value.lease_until='2026-10-15T14:00:00.000Z';
      if(options.leaseReplaced)value.lease_token='bb98b681-5ab6-4251-a2e9-e06c50dc007f';
      return reply(options.leaseMalformed?{}:[value]);
    }
    const list=/^\/storage\/v1\/object\/list\/(fotos-perfil|fotos-anuncios)$/.exec(path);
    if(list) {
      assert.equal(method,'POST');
      assert.equal(body.prefix,'');assert.equal(body.search,'12-');assert.equal(body.limit,100);
      assert.deepEqual(body.sortBy,{column:'name',order:'asc'});assert(Number.isInteger(body.offset)&&body.offset>=0);
      if(options.listThrows)throw new Error('Synthetic list error');
      if(options.listFails)return reply({message:'Synthetic private Storage detail'},500);
      if(Object.hasOwn(options,'listResult'))return reply(options.listResult);
      if(options.listLostAfterDelete && removes>0)throw new Error('Synthetic confirmation unavailable');
      let rows=[...objects.get(list[1]).values()].filter(row=>row.name.includes('12-')).sort((a,b)=>a.name.localeCompare(b.name));
      if(options.repeatPage)body.offset=0;
      if(options.rows)rows=options.rows;
      return reply(rows.slice(body.offset,body.offset+body.limit));
    }
    const remove=/^\/storage\/v1\/object\/(fotos-perfil|fotos-anuncios)$/.exec(path);
    if(remove) {
      assert.equal(method,'DELETE');
      removes++;
      assert.deepEqual(Object.keys(body),['prefixes']);assert(body.prefixes.length>0&&body.prefixes.length<=100);
      assert(guards.length>=2,'a confirmed account and lease must precede deletion');
      assert.deepEqual(guards.slice(-2),['account','lease']);
      guards.length=0;
      for(const name of body.prefixes)assert(name.startsWith('12-')&&!name.startsWith('123-')&&!name.startsWith('112-'));
      if(options.removeThrows)throw new Error('Synthetic unknown removal outcome');
      if(options.removeFails)return reply({message:'Synthetic private remove error'},403);
      const actual=options.partialRemove?body.prefixes.slice(0,1):options.noRemove?[]:body.prefixes;
      const removed=[];
      for(const name of actual)if(objects.get(remove[1]).has(name)){removed.push(objects.get(remove[1]).get(name));objects.get(remove[1]).delete(name);}
      if(options.loseLeaseAfterDelete)currentLease='2d2b82f7-b3d9-47c7-b29e-7e1031d5dcb0';
      if(options.cancelAfterDelete)currentStatus='retry';
      if(Object.hasOwn(options,'removeResult'))return reply(options.removeResult);
      return reply(removed);
    }
    unexpected.push({path,method});throw new Error('Unexpected fixture operation, real network denied');
  };
  const service=createAccountDeletionService({backend,now});
  return {service,backend,now,objects,calls,unexpected,finishes,
    counts:()=>({removes,claims,profileReads,leaseReads}),advance:ms=>{clock+=ms;}};
}
const expectDeferred=async options=>{
  const f=fixture(options),result=await f.service.processOne();
  assert.equal(result.status,'deferred');assert.equal(f.finishes.at(-1)?.p_done,false);assert.deepEqual(f.unexpected,[]);
  return f;
};

test('confirmed DB deletion removes current and historical owned files only and confirms empty before finish',async()=>{
  const f=fixture(),result=await f.service.processOne();
  assert.equal(result.status,'complete');assert.equal(result.deleted,3);
  assert.deepEqual([...f.objects.get('fotos-perfil').keys()],['123-1000000000000.jpg','112-1000000000000.jpg']);
  assert.deepEqual([...f.objects.get('fotos-anuncios').keys()],['13-ad.jpg']);
  assert.equal(f.finishes.length,1);assert.equal(f.finishes[0].p_done,true);
  const lastDelete=f.calls.findLastIndex(call=>call.method==='DELETE');
  const finalLists=f.calls.slice(lastDelete+1).filter(call=>call.path.startsWith('/storage/v1/object/list/'));
  assert(finalLists.length>0,'an HTTP success from remove alone cannot finish a job');
  assert.deepEqual(f.unexpected,[]);
});

test('cleanup survives empty stores and repeated execution without deleting any unrelated object',async()=>{
  const f=fixture({files:{'fotos-perfil':['123-no.jpg'],'fotos-anuncios':[]}});
  assert.equal((await f.service.processOne()).status,'complete');
  assert.equal((await f.service.processOne()).status,'complete');
  assert.equal(f.counts().removes,0);assert.equal(f.finishes.length,2);assert(f.finishes.every(row=>row.p_done));
});

test('pagination scans past substring matches and restarts after deletion instead of skipping shifted rows',async()=>{
  const foreign=Array.from({length:130},(_,index)=>'112-foreign-'+String(index).padStart(3,'0')+'.jpg');
  const owned=Array.from({length:160},(_,index)=>'12-old-'+String(index).padStart(3,'0')+'.PNG');
  const f=fixture({files:{'fotos-perfil':[...foreign,...owned],'fotos-anuncios':[]}});
  const result=await f.service.processOne(null,{maxBatches:20});
  assert.equal(result.status,'complete');assert.equal(result.deleted,160);
  assert.equal(f.objects.get('fotos-perfil').size,130);
  const lists=f.calls.filter(call=>call.path==='/storage/v1/object/list/fotos-perfil');
  assert(lists.some(call=>call.body.offset>=100));
  const firstDelete=f.calls.findIndex(call=>call.method==='DELETE');
  assert.equal(f.calls.slice(firstDelete+1).find(call=>call.path==='/storage/v1/object/list/fotos-perfil').body.offset,0);
});

test('bounded batches make durable progress and subsequent retries finish larger historical collections',async()=>{
  const files=Array.from({length:245},(_,index)=>'12-'+String(index).padStart(4,'0')+'.jpg');
  const f=fixture({files:{'fotos-perfil':files,'fotos-anuncios':[]}});
  assert.equal((await f.service.processOne(null,{maxBatches:1})).status,'deferred');
  assert.equal(f.objects.get('fotos-perfil').size,145);assert.equal(f.finishes.at(-1).p_done,false);
  assert.equal((await f.service.processOne(null,{maxBatches:1})).status,'deferred');
  assert.equal(f.objects.get('fotos-perfil').size,45);
  assert.equal((await f.service.processOne(null,{maxBatches:1})).status,'complete');
  assert.equal(f.objects.get('fotos-perfil').size,0);
});

test('partial or unconfirmed removal never fabricates success; later retry re-lists actual survivors',async()=>{
  const f=fixture({partialRemove:true});
  assert.equal((await f.service.processOne(null,{maxBatches:1})).status,'deferred');
  assert.equal(f.finishes.at(-1).p_done,false);
  assert.equal((await f.service.processOne(null,{maxBatches:20})).status,'complete');
  const g=await expectDeferred({noRemove:true});assert(g.counts().removes<=2);
  await expectDeferred({listLostAfterDelete:true});
});

test('no Storage reads or deletion occur before an atomically committed missing account and current lease',async()=>{
  for(const options of [{profileExists:true},{leaseMissing:true},{leaseExpired:true},{leaseReplaced:true},{leaseMalformed:true}]) {
    const f=await expectDeferred(options);
    assert(!f.calls.some(call=>call.path.startsWith('/storage/')));
  }
});

test('profile/lease are revalidated before every delete, not only when claiming the job',async()=>{
  const f=await expectDeferred({reappearingProfile:true});assert.equal(f.counts().removes,0);
  for(const options of [{loseLeaseAfterDelete:true},{cancelAfterDelete:true}]) {
    const g=await expectDeferred(options);assert.equal(g.counts().removes,1);
  }
});

test('claim missing is empty; malformed, premature and unexpected jobs cannot become deletion authority',async()=>{
  const f=fixture({claim:null});assert.deepEqual(await f.service.processOne(),{status:'empty'});assert.equal(f.calls.length,1);
  for(const claim of [{},[],true,{...validJob(),status:'pending'},{...validJob(),perfil_id:[12]},
    {...validJob(),perfil_id:'0'},{...validJob(),lease_token:'attacker'},{...validJob(),lease_until:'2026-10-15T14:00:00.000Z'}]) {
    const g=fixture({claim});await assert.rejects(g.service.processOne(),AccountCleanupError);
    assert.equal(g.calls.length,1);assert.equal(g.counts().removes,0);
  }
});

test('caller cannot inject owner, bucket, paths, URLs or query syntax into cleanup',async()=>{
  for(const owner of [undefined,null,0,'0','012','12 OR 1=1',[12],{id:12},'12/../123','https://evil.invalid/12','12?bucket=x']) {
    await assert.rejects(cleanupAccountStorage(owner,{backend:async()=>{throw new Error('Must not call transport');},assertDeletionCommitted:async()=>true,assertLease:async()=>true}),AccountCleanupError);
  }
  const f=fixture();
  await assert.rejects(f.service.processOne('https://evil.invalid/job'),AccountCleanupError);
  await assert.rejects(f.service.processOne('x?perfil_id=123'),AccountCleanupError);
  assert.equal(f.calls.length,0);
});

test('invalid/hostile list data cannot direct an arbitrary deletion or falsely complete cleanup',async()=>{
  for(const listResult of [null,{},true,[{name:'12-../../123.jpg',id:'id'}],[{name:'12-https://evil.invalid',id:'id'}],
    [{name:'12-x%2F123.jpg',id:'id'}],[{name:'12-folder',id:null}],[{name:'12-file.jpg'}],[{name:'12-x\0.jpg',id:'id'}],
    [{name:'12-old.jpg',id:'id'},{name:'12-old.jpg',id:'id'}]]) {
    const f=await expectDeferred({listResult});assert.equal(f.counts().removes,0);
  }
});

test('HTTP/list/remove outages and malformed delete receipts remain durable retries, never expose raw errors',async()=>{
  for(const options of [{listThrows:true},{listFails:true},{removeThrows:true},{removeFails:true},{removeResult:{}},
    {removeResult:[{name:'123-other.jpg',id:'id'}]}]) {
    const f=await expectDeferred(options);
    assert(!JSON.stringify(f.finishes).includes('Synthetic private'));
  }
});

test('lease fencing and uncertain finish never report a completed cleanup to caller',async()=>{
  const f=fixture({finishLost:true});assert.equal((await f.service.processOne()).status,'deferred');
  const g=fixture({finishThrows:true});assert.deepEqual(await g.service.processOne(),{status:'deferred',reason:'cleanup_unconfirmed'});
});

test('absolute budget bounds work and does not turn an unscanned bucket into done',async()=>{
  const f=fixture({advancePerCall:1000});
  const result=await f.service.processOne(null,{maxMillis:6000});assert.equal(result.status,'deferred');
  assert(f.calls.length<=7);assert(!f.finishes.some(row=>row.p_done));
});

test('known server job id is passed only to claim and never substituted with a body owner',async()=>{
  const f=fixture({requestJobId:ID});assert.equal((await f.service.processOne(ID)).status,'complete');
  const g=fixture({requestJobId:ID,claim:{...validJob(),id:'f0e1d2c3-b4a5-4698-8b76-c5d4e3f20198'}});
  await assert.rejects(g.service.processOne(ID),AccountCleanupError);assert.equal(g.calls.length,1);
});

test('source never deletes Storage metadata with SQL, creates a schedule or reads credentials in tests',()=>{
  const source=readFileSync(new URL('../netlify/lib/account-deletion.mjs',import.meta.url),'utf8');
  assert(!/delete\s+from\s+storage\./i.test(source));assert(!source.includes('schedule:'));
  assert(!readFileSync(new URL(import.meta.url),'utf8').includes('process'+'.env'));
});
