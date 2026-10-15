const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, 'Retention.gs'), 'utf8');
const executable = source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'appsscript.json'), 'utf8'));
const DAY = 86400000, now = Date.parse('2026-10-15T16:00:00Z');
const labels = ['pending','close','closed','hold'].map((key,i)=>({
  id:'L'+i, type:'user', name:'BuscARTE/Admin/'+['Pendiente','Cerrar','Cerrado','Conservar'][i]
}));
const msg = (id='aa', ids=['L0']) => ({id, internalDate:String(now-DAY),labelIds:ids});
function fixture(options={}) {
  const calls=[], logs=[], store={RETENTION_GMAIL_API_ENABLED:'true',...(options.active?{RETENTION_MODE:'ACTIVE'}:{}),...options.properties};
  let current=now, triggers=options.triggers||[];
  const threads=structuredClone(options.threads||{ab:{id:'ab',messages:[msg()]}});
  class Clock extends Date { constructor(...args){super(...(args.length?args:[current]));} static now(){return current;} }
  const propertyApi={getProperty:key=>store[key]??null,getProperties:()=>({...store}),
    setProperty(key,value){calls.push(['prop.set',key]);store[key]=value;},
    deleteProperty(key){calls.push(['prop.delete',key]);delete store[key];}};
  const context=vm.createContext({Date:Clock,console:{log:value=>logs.push(value)},PropertiesService:{getScriptProperties:()=>propertyApi},
    LockService:{getScriptLock:()=>({tryLock:()=>options.busy!==true,releaseLock(){calls.push(['lock.release']);}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      computeDigest:(algorithm,input,encoding)=>Array.from(crypto.createHash(algorithm).update(input,encoding).digest())},
    Gmail:{Users:{getProfile(_user,params){calls.push(['profile',params]);return {emailAddress:options.account||'buscarte.webmail@gmail.com'};},
      Labels:{list:()=>({labels:options.labels||labels})},
      Threads:{list(_user,params){calls.push(['list',structuredClone(params)]);
          if(Object.hasOwn(options,'listResponse'))return typeof options.listResponse==='function'?options.listResponse(params):options.listResponse;
          const listed=Object.values(threads)
            .filter(t=>t.messages.some(m=>m.labelIds.includes(params.labelIds[0]))&&!t.messages.every(m=>m.labelIds.includes('TRASH')))
            .map(t=>({id:t.id}));
          return {resultSizeEstimate:listed.length,...(listed.length?{threads:listed}:{}),...(options.nextPage?{nextPageToken:'next'}:{})};},
        get(_user,id,params){calls.push(['get',id,params]);options.beforeGet?.(threads,calls);
          if(!threads[id])throw Error('provider secret content should not be logged');return structuredClone(threads[id]);},
        modify(change,_user,id){calls.push(['labels.modify',id,change]);if(options.failLabelChange)throw Error('unavailable');
          threads[id].messages.forEach(m=>{m.labelIds=[...new Set([...m.labelIds.filter(v=>!change.removeLabelIds.includes(v)),...change.addLabelIds])];});}},
      Messages:{get(_user,id,params){calls.push(['message.get',id,params]);
          for(const t of Object.values(threads))for(const m of t.messages)if(m.id===id)return {id:m.id,threadId:t.id,labelIds:[...m.labelIds]};
          throw Error('message unavailable');},
        untrash(_user,id){calls.push(['untrash',id]);if(options.failUntrash?.(id,calls))throw Error('recovery unavailable');
          for(const t of Object.values(threads))for(const m of t.messages)if(m.id===id)m.labelIds=m.labelIds.filter(label=>label!=='TRASH');},
        trash(_user,id){calls.push(['trash',id]);if(options.failTrash)throw Error('unavailable');
        options.beforeTrash?.(threads,calls,id);
        for(const t of Object.values(threads))for(const m of t.messages)if(m.id===id)m.labelIds.push('TRASH');
        if(options.failAfterTrash)throw Error('ambiguous provider response');}}
    }},ScriptApp:{getProjectTriggers:()=>triggers,
      newTrigger(handler){calls.push(['trigger.new',handler]);const builder={
        timeBased(){return builder;},everyDays(n){calls.push(['trigger.days',n]);return builder;},atHour(n){calls.push(['trigger.hour',n]);return builder;},
        inTimezone(zone){calls.push(['trigger.zone',zone]);return builder;},create(){calls.push(['trigger.create']);triggers.push({getHandlerFunction:()=>handler});}};return builder;}}});
  vm.runInContext(source,context);
  const run=()=>context.dailyRetention();
  return {context,store,calls,logs,threads,run,setTime(value){current=value;},
    record(id='ab'){return store['sbr.case.'+id]?JSON.parse(store['sbr.case.'+id]):null;}};
}
function writes(f){return f.calls.filter(c=>/^(prop\.|labels\.|trash$|untrash$|trigger\.)/.test(c[0]));}
function closeFixture(options={}) {
  const f=fixture({...options,active:true,threads:{ab:{id:'ab',messages:[msg('aa',['L0','L1'])]}}});
  assert.equal(f.run().planned.close,1);return f;
}

test('OAuth is modify and scriptapp only, no permanent-delete scope or extra integrations',()=>{
  assert.deepEqual(manifest.oauthScopes,['https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/script.scriptapp']);
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices,[{userSymbol:'Gmail',serviceId:'gmail',version:'v1'}]);
  assert.equal(manifest.exceptionLogging,'NONE');
  assert.doesNotMatch(executable,/\b(?:GmailApp|MailApp|UrlFetchApp)\s*\./);
  assert.doesNotMatch(source,/Gmail\.Users\.(?:Messages|Threads)\.(?:delete|remove|batchDelete|send|insert|import)\s*\(/);
  assert.doesNotMatch(executable,/Logger\.|console\.(?:warn|error)/);
  assert.equal((source.match(/console\.log\(/g)||[]).length,1);
});
test('missing API flag fails before any Gmail read or write',()=>{
  const f=fixture({properties:{RETENTION_GMAIL_API_ENABLED:'false'}});
  assert.throws(()=>f.run(),/NOT_EXPLICITLY_ENABLED/);assert.equal(f.calls.length,0);
});
test('wrong mailbox stops before listing content; no writes',()=>{
  const f=fixture({active:true,account:'other@example.invalid'});
  assert.throws(()=>f.run(),/WRONG_ACCOUNT/);assert.deepEqual(writes(f),[]);assert.equal(f.calls.length,1);
});
test('absent mode is read-only audit, including observed Cerrar',()=>{
  const f=fixture({threads:{ab:{id:'ab',messages:[msg('aa',['L1'])]}}});
  assert.equal(f.run().mode,'AUDIT_ONLY');assert.equal(f.run().planned.close,1);assert.deepEqual(writes(f),[]);
});
test('explicit audit never writes even if ACTIVE configured',()=>{
  const f=fixture({active:true,threads:{ab:{id:'ab',messages:[msg('aa',['L1'])]}}});
  assert.equal(f.context.auditRetention().planned.close,1);assert.deepEqual(writes(f),[]);
});
test('setup in audit does not create labels, metadata or triggers',()=>{
  const f=fixture();assert.equal(f.context.setupRetention().triggerInstalled,false);assert.deepEqual(writes(f),[]);
});
test('setup ACTIVE checks exact profile, existing user labels and installs once',()=>{
  const f=fixture({active:true});assert.equal(f.context.setupRetention().triggerInstalled,true);
  assert.equal(f.context.setupRetention().triggerInstalled,true);
  assert.equal(f.calls.filter(c=>c[0]==='trigger.create').length,1);
  assert.deepEqual(f.calls.find(c=>c[0]==='trigger.days'),['trigger.days',1]);
});
test('missing labels block setup and all processing; no automatic mailbox classification',()=>{
  const f=fixture({active:true,labels:labels.slice(1)});
  assert.equal(f.context.setupRetention().triggerInstalled,false);assert.equal(f.run().missingLabels,1);assert.deepEqual(writes(f),[]);
});
test('duplicate trigger requires manual review; other project triggers are untouched',()=>{
  const f=fixture({active:true,triggers:[{getHandlerFunction:()=>'dailyRetention'},{getHandlerFunction:()=>'dailyRetention'}]});
  assert.throws(()=>f.context.setupRetention(),/DUPLICATE_TRIGGER/);assert.deepEqual(writes(f),[]);
});
test('ordinary unlabeled messages are never queried by age/read/archive or processed',()=>{
  const f=fixture({active:true,threads:{ab:{id:'ab',messages:[msg('aa',['INBOX'])]}}});
  assert.equal(f.run().examined,0);assert.deepEqual(writes(f),[]);
  assert(f.calls.filter(c=>c[0]==='list').every(c=>!c[1].q&&c[1].labelIds.length===1));
});
test('explicit zero estimate without threads is valid empty; no cases or side effects',()=>{
  const f=fixture({active:true,listResponse:{resultSizeEstimate:0}});
  const report=f.context.auditRetention();
  assert.equal(report.mode,'AUDIT_ONLY');assert.equal(report.examined,0);assert.equal(report.errors,0);
  assert.equal(report.limitExceeded,false);assert.equal(report.manualReviewRequired,false);
  assert.deepEqual(JSON.parse(JSON.stringify(report.planned)),{});assert.deepEqual(writes(f),[]);
  assert(f.calls.filter(c=>c[0]==='list').every(c=>c[1].fields.includes('resultSizeEstimate')));
});
test('null, undefined, primitives, arrays and structurally uncertain list responses fail closed',()=>{
  const responses=[null,undefined,'string',false,0,[],{},
    {resultSizeEstimate:1},{resultSizeEstimate:-1},{resultSizeEstimate:'0'},
    {resultSizeEstimate:NaN},{resultSizeEstimate:Infinity},{resultSizeEstimate:0.5},{resultSizeEstimate:null},
    {threads:null,resultSizeEstimate:0},{threads:{},resultSizeEstimate:0},{threads:'invalid',resultSizeEstimate:0},
    {threads:[],resultSizeEstimate:-1},{threads:[],resultSizeEstimate:'0'},
    {threads:[],resultSizeEstimate:0,nextPageToken:123}];
  for(const response of responses) {
    const f=fixture({active:true,listResponse:response});
    const before=JSON.stringify(f.store), report=f.run();
    assert.equal(report.limitExceeded,true,`must fail closed: ${String(response)}`);
    assert.equal(report.listResponseInvalid,true);assert.equal(report.manualReviewRequired,true);
    assert.equal(report.examined,0);assert.equal(report.errors,0);assert.equal(report.movedToTrash,0);assert.equal(report.restoredFromTrash,0);
    assert.equal(JSON.stringify(f.store),before);assert.deepEqual(writes(f),[]);
    assert.equal(f.calls.filter(c=>c[0]==='get').length,0);
  }
});
test('estimate is never trusted as an exact total: huge valid estimate alone does not bypass or trigger the ID limit',()=>{
  const f=fixture({listResponse:{threads:[{id:'ab'}],resultSizeEstimate:1000000}});
  const report=f.context.auditRetention();assert.equal(report.limitExceeded,false);assert.equal(report.examined,1);assert.deepEqual(writes(f),[]);
});
test('pagination stays blocked even if an estimate says zero; malformed token is not accepted as empty',()=>{
  for(const response of [{resultSizeEstimate:0,nextPageToken:'next'},{threads:[],resultSizeEstimate:0,nextPageToken:'next'}]) {
    const f=fixture({active:true,listResponse:response});const report=f.context.auditRetention();
    assert.equal(report.limitExceeded,true);assert.equal(report.manualReviewRequired,true);assert.equal(report.examined,0);assert.deepEqual(writes(f),[]);
  }
});
test('read-only diagnosis compares legacy null/undefined shape with explicit zero estimate and never scans message content',()=>{
  for(const legacy of [null,undefined]) {
    const f=fixture({active:true,properties:{'sbr.case.ab':'private-case-content-not-for-logs'},
      listResponse:params=>params.fields.includes('resultSizeEstimate')?{resultSizeEstimate:0}:legacy});
    const before=JSON.stringify(f.store), report=f.context.diagnoseRetentionReadOnly();
    assert.equal(report.mode,'AUDIT_ONLY');assert.equal(report.diagnostic,true);assert.equal(report.accountVerified,true);
    assert.equal(report.trackedRecordsCount,1);assert.equal(report.errors,0);assert.equal(report.labels.length,4);
    assert.deepEqual(Array.from(report.labels,item=>item.label),labels.map(label=>label.name));
    for(const item of report.labels) {
      assert.equal(item.legacy.responseType,legacy===null?'null':'undefined');
      assert.equal(item.legacy.threadsPresent,false);assert.equal(item.legacy.threadCount,null);
      assert.equal(item.legacy.hasNextPageToken,false);assert.equal(item.legacy.resultSizeEstimate,null);
      assert.equal(item.withEstimate.responseType,'object');assert.equal(item.withEstimate.threadsPresent,false);
      assert.equal(item.withEstimate.threadCount,null);assert.equal(item.withEstimate.hasNextPageToken,false);
      assert.equal(item.withEstimate.resultSizeEstimate,0);
    }
    const lists=f.calls.filter(call=>call[0]==='list');assert.equal(lists.length,8);
    assert.equal(lists.filter(call=>call[1].fields==='threads(id),nextPageToken').length,4);
    assert.equal(lists.filter(call=>call[1].fields==='threads(id),nextPageToken,resultSizeEstimate').length,4);
    assert.equal(f.calls.filter(call=>call[0]==='get'||call[0]==='message.get').length,0);
    assert.equal(JSON.stringify(f.store),before);assert.deepEqual(writes(f),[]);
    for(const raw of f.logs) assert.doesNotMatch(raw,/buscarte\.webmail@gmail\.com|sbr\.case\.|private-case-content|"ab"|"aa"|subject|snippet|recipient|internalDate/i);
  }
});
test('diagnosis reports only shapes/counts, not raw API data, and contains provider failures without writes',()=>{
  const populated=fixture({active:true,listResponse:{threads:[{id:'ab',snippet:'private-not-for-log'}],resultSizeEstimate:1}});
  const report=populated.context.diagnoseRetentionReadOnly();
  assert.equal(report.labels.length,4);assert(report.labels.every(item=>item.legacy.threadCount===1&&item.withEstimate.threadCount===1));
  assert.deepEqual(writes(populated),[]);assert.doesNotMatch(JSON.stringify(report),/"ab"|snippet|private-not-for-log/i);
  const failed=fixture({active:true,listResponse(){throw Error('private provider body email@example.invalid');}});
  const failedReport=failed.context.diagnoseRetentionReadOnly();assert.equal(failedReport.errors,4);assert.equal(failedReport.mode,'AUDIT_ONLY');
  assert.deepEqual(writes(failed),[]);assert.doesNotMatch(failed.logs.join(''),/private provider body|email@example\.invalid/);
});
test('closure records observation time, not old message date; normalises labels',()=>{
  const f=closeFixture();const record=f.record();
  assert.equal(record.closedAt,now);assert.equal(record.phase,'closed');assert.equal(record.messageCount,1);
  assert.deepEqual(f.threads.ab.messages[0].labelIds,['L2']);
  assert(!JSON.stringify(record).match(/subject|email|recipient|body|snippet|header/i));
  const get=f.calls.find(c=>c[0]==='get');assert.equal(get[2].fields,'id,messages(id,internalDate,labelIds)');
});
test('59 days waits, exactly 60 days moves only unchanged message IDs to Trash',()=>{
  const f=closeFixture();f.setTime(now+59*DAY);assert.equal(f.run().planned.wait,1);assert.equal(f.calls.filter(c=>c[0]==='trash').length,0);
  f.setTime(now+60*DAY);assert.equal(f.run().movedToTrash,1);assert.equal(f.record().phase,'trashed');
  assert.deepEqual(f.calls.filter(c=>c[0]==='trash'),[['trash','aa']]);
});
test('Cerrado label without script-observed closure never backdates or deletes',()=>{
  const f=fixture({active:true,threads:{ab:{id:'ab',messages:[msg('aa',['L2'])]}}});
  assert.equal(f.run().planned.skip,1);assert.deepEqual(writes(f),[]);
});
test('new message cancels closure, reopens and preserves first pending-after-close observation',()=>{
  const f=closeFixture();f.setTime(now+61*DAY);f.threads.ab.messages.push(msg('bb',['INBOX']));
  assert.equal(f.run().planned.reopen,1);assert.equal(f.record().closedAt,null);assert.equal(f.record().pendingAfterCloseSeen,true);
  assert(f.threads.ab.messages.every(m=>m.labelIds.includes('L0')&&!m.labelIds.includes('L2')));
  assert.equal(f.calls.filter(c=>c[0]==='trash').length,0);
});
test('explicit Pending after closure reopens even if message fingerprint is unchanged',()=>{
  const f=closeFixture();f.threads.ab.messages[0].labelIds.push('L0');
  assert.equal(f.run().planned.reopen,1);assert.equal(f.record().pendingAfterCloseSeen,true);
});
test('reopen label API failure leaves a repair state, never an expiring close time',()=>{
  const f=closeFixture({failLabelChange:true});
  // Initial close label mutation failed; the authoritative label is absent.
  assert.equal(f.record().phase,'closed');assert.equal(f.run().errors,1);
  assert.equal(f.record().phase,'reopening');assert.equal(f.run().planned.reopen,1);
  assert.equal(f.calls.filter(c=>c[0]==='trash').length,0);
});
test('Conservar has no expiry and removal requires a NEW explicit close',()=>{
  const f=closeFixture();f.threads.ab.messages[0].labelIds.push('L3');f.setTime(now+300*DAY);
  assert.equal(f.run().planned.hold,1);assert.equal(f.record().phase,'held');assert.equal(f.record().closedAt,null);
  f.threads.ab.messages[0].labelIds=['L2'];assert.equal(f.run().planned.skip,1);
  assert.equal(f.calls.filter(c=>c[0]==='trash').length,0);
  f.threads.ab.messages[0].labelIds.push('L1');assert.equal(f.run().planned.close,1);assert.equal(f.record().closedAt,now+300*DAY);
});
test('unknown administrative labels, draft and Spam all fail closed',()=>{
  for(const extra of ['UNKNOWN_ADMIN','DRAFT','SPAM']) {
    const f=fixture({active:true,labels:[...labels,{id:'UNKNOWN_ADMIN',type:'user',name:'BuscARTE/Admin/Legal'}],
      threads:{ab:{id:'ab',messages:[msg('aa',['L1',extra])]}}});
    assert.equal(f.run().planned.skip,1);assert.deepEqual(writes(f),[]);
  }
});
test('pagination or too many candidate threads returns without any mutation',()=>{
  const f=fixture({active:true,nextPage:true,threads:{ab:{id:'ab',messages:[msg('aa',['L1'])]}}});
  assert.equal(f.run().limitExceeded,true);assert.deepEqual(writes(f),[]);
  const threads=Object.fromEntries(Array.from({length:41},(_,i)=>[i.toString(16),{id:i.toString(16),messages:[msg('aa',['L1'])]}]));
  const many=fixture({active:true,threads});assert.equal(many.run().limitExceeded,true);assert.deepEqual(writes(many),[]);
});
test('corrupt metadata is skipped, no destructive recovery defaults',()=>{
  const f=fixture({active:true,properties:{'sbr.case.ab':'{not JSON'},threads:{ab:{id:'ab',messages:[msg('aa',['L1'])]}}});
  assert.equal(f.run().planned.skip,1);assert.deepEqual(writes(f),[]);
});
test('hold or reply appearing immediately before Trash prevents all Trash calls',()=>{
  for(const kind of ['hold','reply']) {
    let change=false, reads=0;
    const f=closeFixture({beforeGet(threads){if(change&&++reads===2){
      if(kind==='hold')threads.ab.messages[0].labelIds.push('L3');else threads.ab.messages.push(msg('bb',['INBOX']));
    }}});
    change=true;f.setTime(now+61*DAY);assert.equal(f.run().errors,1);assert.equal(f.calls.filter(c=>c[0]==='trash').length,0);
  }
});
test('partial Trash failure is recovered and requires a new explicit close, never a Trash retry',()=>{
  const f=closeFixture({failTrash:true});f.setTime(now+61*DAY);assert.equal(f.run().errors,1);
  assert.equal(f.record().phase,'open');assert.equal(f.record().requiresNewClose,true);assert.equal(f.run().planned.skip,1);
  assert.equal(f.calls.filter(c=>c[0]==='trash').length,1);
});
test('a reply arriving BETWEEN the last recheck and Trash never joins the captured message IDs',()=>{
  const f=closeFixture({beforeTrash(threads){threads.ab.messages.push(msg('bb',['INBOX']));}});
  f.setTime(now+61*DAY);const result=f.run();assert.equal(result.movedToTrash,1);assert.equal(result.restoredFromTrash,1);
  assert(!f.threads.ab.messages.find(m=>m.id==='aa').labelIds.includes('TRASH'));
  assert(!f.threads.ab.messages.find(m=>m.id==='bb').labelIds.includes('TRASH'));
  assert.deepEqual(f.calls.filter(c=>c[0]==='trash'),[['trash','aa']]);
});
test('new reply DURING a multi-message batch stops remaining old IDs and recovers the partial action',()=>{
  const f=fixture({active:true,threads:{ab:{id:'ab',messages:[msg('aa',['L1']),msg('ac',['L1'])]}},
    beforeTrash(threads){if(!threads.ab.messages.some(m=>m.id==='bb'))threads.ab.messages.push(msg('bb',['INBOX']));}});
  assert.equal(f.run().planned.close,1);f.setTime(now+61*DAY);
  const result=f.run();assert.equal(result.movedToTrash,1);assert.equal(result.errors,1);
  assert.equal(f.record().phase,'open');assert.equal(result.restoredFromTrash,1);assert.deepEqual(f.calls.filter(c=>c[0]==='trash'),[['trash','aa']]);
  assert(!f.threads.ab.messages.find(m=>m.id==='bb').labelIds.includes('TRASH'));
  assert(!f.threads.ab.messages.find(m=>m.id==='ac').labelIds.includes('TRASH'));
});
test('Conservar, Pending or a reply AFTER successful Trash restores exact managed IDs, then requires a fresh close',()=>{
  for(const action of ['hold','pending','reply']) {
    const f=closeFixture();f.setTime(now+61*DAY);assert.equal(f.run().movedToTrash,1);
    const priorTrashes=f.calls.filter(c=>c[0]==='trash').length;
    f.setTime(now+62*DAY);
    if(action==='reply')f.threads.ab.messages.push(msg('bb',['INBOX']));
    else f.threads.ab.messages[0].labelIds.push(action==='hold'?'L3':'L0');
    const report=f.run();assert.equal(report.planned.recover,1);assert.equal(report.restoredFromTrash,1);
    assert.equal(f.record().phase,action==='hold'?'held':'open');assert.equal(f.record().closedAt,null);
    assert.equal(f.record().requiresNewClose,true);assert(!f.threads.ab.messages[0].labelIds.includes('TRASH'));
    f.setTime(now+200*DAY);f.run();assert.equal(f.calls.filter(c=>c[0]==='trash').length,priorTrashes);
  }
});
test('managed IDs and attempted ID are durably recorded BEFORE a potentially ambiguous Trash call',()=>{
  let f;
  f=closeFixture({failAfterTrash:true,beforeTrash(_threads,_calls,id){
    const record=f.record();assert.equal(record.phase,'trashing');
    assert.deepEqual(record.managedMessageIds,['aa']);assert.deepEqual(record.attemptedMessageIds,[id]);
  }});
  f.setTime(now+61*DAY);const report=f.run();assert.equal(report.errors,1);assert.equal(report.restoredFromTrash,1);
  assert.equal(f.record().phase,'open');assert(!f.threads.ab.messages[0].labelIds.includes('TRASH'));
  assert.deepEqual(f.calls.filter(c=>c[0]==='untrash'),[['untrash','aa']]);
});
test('failed partial recovery is persisted and retried idempotently, without any further Trash',()=>{
  let fail=true;
  const f=fixture({active:true,threads:{ab:{id:'ab',messages:[msg('aa',['L1']),msg('ac',['L1'])]}},
    failUntrash:id=>fail&&id==='ac'});
  f.run();f.setTime(now+61*DAY);assert.equal(f.run().movedToTrash,2);
  f.threads.ab.messages[0].labelIds.push('L3');f.setTime(now+62*DAY);
  assert.equal(f.run().errors,1);assert.equal(f.record().phase,'recovering');
  assert(!f.threads.ab.messages.find(m=>m.id==='aa').labelIds.includes('TRASH'));
  assert(f.threads.ab.messages.find(m=>m.id==='ac').labelIds.includes('TRASH'));
  fail=false;assert.equal(f.run().restoredFromTrash,1);assert.equal(f.record().phase,'held');
  assert.equal(f.calls.filter(c=>c[0]==='untrash'&&c[1]==='aa').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='trash').length,2);
});
test('recovery never restores a different message manually in Trash, even in the same conversation',()=>{
  const f=closeFixture();f.setTime(now+61*DAY);f.run();
  f.threads.ab.messages.push(msg('bb',['TRASH']));f.threads.ab.messages[0].labelIds.push('L3');
  assert.equal(f.run().restoredFromTrash,1);
  assert(f.threads.ab.messages.find(m=>m.id==='bb').labelIds.includes('TRASH'));
  assert.deepEqual(f.calls.filter(c=>c[0]==='untrash'),[['untrash','aa']]);
});
test('a thread with manual Trash before enrolment is not closed, trashed or recovered',()=>{
  const f=fixture({active:true,threads:{ab:{id:'ab',messages:[msg('aa',['L1']),msg('bb',['TRASH'])]}}});
  assert.equal(f.run().planned.skip,1);assert.deepEqual(writes(f),[]);
});
test('audit of a held trashed case plans recovery without untrash, label or metadata writes',()=>{
  const f=closeFixture();f.setTime(now+61*DAY);f.run();f.threads.ab.messages[0].labelIds.push('L3');
  const before=writes(f).length;assert.equal(f.context.auditRetention().planned.recover,1);
  assert.equal(writes(f).length,before);assert(f.threads.ab.messages[0].labelIds.includes('TRASH'));
});
test('old trashed metadata lacking an exact managed-ID journal requires manual review, never broad untrash',()=>{
  const f=closeFixture();f.setTime(now+61*DAY);f.run();
  const record=f.record();delete record.managedMessageIds;delete record.attemptedMessageIds;
  f.store['sbr.case.ab']=JSON.stringify(record);f.threads.ab.messages[0].labelIds.push('L3');
  const result=f.run();assert.equal(result.manualReviewRequired,true);assert.equal(result.planned.skip,1);
  assert.equal(f.calls.filter(c=>c[0]==='untrash').length,0);
});
test('future timestamps/invalid message IDs/oversized thread preserve all messages',()=>{
  for(const messages of [[{...msg(),internalDate:String(now+DAY)}],[msg('bad/notid',['L1'])],Array.from({length:21},(_,i)=>msg(i.toString(16),['L1']))]) {
    const f=fixture({active:true,threads:{ab:{id:'ab',messages}}});f.run();assert.deepEqual(writes(f),[]);
  }
});
test('busy lock prevents all processing; arbitrary trigger failures contain no content log',()=>{
  const f=fixture({active:true,busy:true});assert.equal(f.run().busy,true);assert.deepEqual(writes(f),[]);
});
test('logs contain only report aggregates; no message/thread IDs, bodies, headers or exceptions',()=>{
  const f=closeFixture();f.setTime(now+61*DAY);f.run();
  for(const raw of f.logs) {
    const report=JSON.parse(raw);assert.equal(report.accountVerified,true);
    assert.doesNotMatch(raw,/threadId|fingerprint|subject|recipient|email|snippet|header|internalDate|provider secret|"aa"|"ab"/i);
  }
});
