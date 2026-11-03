import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Real gateway/session verification, entirely synthetic fail-closed transport.
// No production credentials, messages, email or database calls are used.
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('No network during imports');};
const {default:datos}=await import('../netlify/functions/datos.mjs');
globalThis.fetch=originalFetch;
const web='https://buscarte.com.ar',database='https://xiaanchoanxmampegoay.supabase.co';
const key='sb_secret_synthetic_reading_fixture_not_a_credential';
const token=Buffer.alloc(32,31).toString('base64url'),cookie='__Host-ba_session='+token;
const password='synthetic-reading-password-placeholder';
const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const path=ids=>'/rest/v1/mensajes?id=in.('+ids.join(',')+')&select=id,leido';
function request({route=path(['6101']),body={leido:true},signed=true,headers={}}={}) {
  return new Request(web+'/.netlify/functions/datos?path='+encodeURIComponent(route),{
    method:'PATCH',headers:{origin:web,'sec-fetch-site':'same-origin','content-type':'application/json',
      ...(signed?{cookie}:{}),...headers},body:JSON.stringify(body)
  });
}
async function fixture(options={},run) {
  const beforeFetch=globalThis.fetch,beforeNetlify=globalThis.Netlify;
  const calls=[],unexpected=[];
  const rows=[
    {id:'6101',de_user_id:'702',para_user_id:'701',contenido:'Recibido propio',leido:false},
    {id:'6102',de_user_id:'701',para_user_id:'702',contenido:'Enviado propio',leido:false},
    {id:'6103',de_user_id:'702',para_user_id:'999',contenido:'De otra persona',leido:false},
    {id:'6104',de_user_id:'702',para_user_id:'701',contenido:'Ya leído',leido:true}
  ];
  globalThis.Netlify={env:{get:name=>({SUPABASE_URL:database,SUPABASE_SERVICE_ROLE_KEY:key})[name]||''}};
  globalThis.fetch=async(href,init={})=>{
    const url=new URL(href),method=init.method||'GET',headers=new Headers(init.headers);
    const body=init.body===undefined?undefined:JSON.parse(init.body);
    calls.push({url,method,headers,body});
    if(url.origin!==database){unexpected.push(url.href);throw new Error('Native transport denied');}
    assert.equal(headers.get('apikey'),key);
    assert.equal(headers.get('authorization'),null);
    assert.equal(init.redirect,'error');assert.ok(init.signal);
    if(url.pathname==='/rest/v1/sesiones_web'&&method==='GET'){
      assert.equal(url.searchParams.get('token_hash'),'eq.'+hash(token));
      assert.match(url.searchParams.get('expires_at'),/^gt\./);
      return reply(options.expired?[]:[{perfil_id:'701',password_fingerprint:hash(options.changedPassword?'old-password':password)}]);
    }
    if(url.pathname==='/rest/v1/perfiles'&&method==='GET'&&url.searchParams.get('id')==='eq.701'){
      return reply(options.deleted?[]:[{id:'701',nombre:'Ejemplo',email:'owner@example.invalid',password,
        tipo_cuenta:'artista',rubro:'musica',baneado:!!options.banned,disciplinas:null,perfil_revision:0}]);
    }
    if(url.pathname==='/rest/v1/mensajes'&&method==='PATCH'){
      assert.equal(url.searchParams.get('para_user_id'),'eq.701','Recipient must always come from the verified cookie');
      assert.equal(url.searchParams.get('select'),'id,leido');
      assert.deepEqual([...url.searchParams.keys()].sort(),['id','para_user_id','select']);
      assert.equal(headers.get('prefer'),'return=representation','Caller cannot suppress confirmation or enable upsert');
      assert.deepEqual(body,{leido:true});
      if(options.failUpdate)return reply({code:'XX000',message:'Private synthetic detail'},500);
      if(options.throwUpdate)throw new Error('Synthetic unavailable transport');
      if(Object.hasOwn(options,'updateResult'))return reply(options.updateResult);
      const wanted=url.searchParams.get('id').slice(4,-1).split(',');
      const selected=rows.filter(row=>row.para_user_id==='701'&&wanted.includes(row.id));
      for(const row of selected)row.leido=true;
      return reply(selected.map(row=>({id:row.id,leido:row.leido})));
    }
    unexpected.push({url:url.href,method});throw new Error('No unrecognized operation may reach a real server');
  };
  try{await run({rows,calls,patches:()=>calls.filter(call=>call.method==='PATCH')});assert.deepEqual(unexpected,[]);}
  finally{globalThis.fetch=beforeFetch;if(beforeNetlify===undefined)delete globalThis.Netlify;else globalThis.Netlify=beforeNetlify;}
}

test('read acknowledgment persists only explicit IDs received by the verified actor',async()=>{
  await fixture({},async({rows,patches})=>{
    const response=await datos(request({route:path(['6101','6102','6103','6104'])}));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),[{id:'6101',leido:true},{id:'6104',leido:true}]);
    assert.equal(patches().length,1);
    assert.equal(rows[0].leido,true);assert.equal(rows[1].leido,false);assert.equal(rows[2].leido,false);
    assert.equal(rows[0].contenido,'Recibido propio');
  });
});
test('repeated acknowledgments are idempotent across independently verified requests',async()=>{
  await fixture({},async({rows})=>{
    for(let attempt=0;attempt<2;attempt++){
      const response=await datos(request());assert.equal(response.status,200);
      assert.deepEqual(await response.json(),[{id:'6101',leido:true}]);
    }
    assert.equal(rows[0].leido,true);
  });
});
test('foreign, sent and nonexistent IDs return no acknowledgment and remain unchanged',async()=>{
  await fixture({},async({rows})=>{
    const response=await datos(request({route:path(['6102','6103','9999'])}));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),[]);
    assert.deepEqual(rows.map(row=>row.leido),[false,false,false,true]);
  });
});
test('new messages arriving after the loaded ID set are not marked read',async()=>{
  await fixture({},async({rows})=>{
    rows.push({id:'6105',de_user_id:'702',para_user_id:'701',contenido:'Llegó después',leido:false});
    const response=await datos(request());assert.equal(response.status,200);
    assert.deepEqual(await response.json(),[{id:'6101',leido:true}]);assert.equal(rows.at(-1).leido,false);
  });
});
test('read-only acknowledgment does not require terms acceptance, contact permission, or trigger mail',async()=>{
  // Fixture has no terms, block, rate, notification or mail operations. Any such
  // request would fail closed and would be reported as unexpected.
  await fixture({},async({calls})=>{
    const response=await datos(request());assert.equal(response.status,200);
    assert.deepEqual(calls.map(call=>call.url.pathname),['/rest/v1/sesiones_web','/rest/v1/perfiles','/rest/v1/mensajes']);
  });
});
test('request preferences cannot suppress confirmed representation or change the mutation',async()=>{
  await fixture({},async()=>{
    const response=await datos(request({headers:{prefer:'return=minimal,resolution=merge-duplicates'}}));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),[{id:'6101',leido:true}]);
  });
});
test('the batch is bounded to one through one hundred unique canonical numeric IDs',async()=>{
  const invalid=[[],['0'],['-1'],['1.0'],['1e2'],[' 6101'],['06101'],['1000000000000000'],['6101','6101'],
    Array.from({length:101},(_,i)=>String(i+1))];
  await fixture({},async({patches})=>{
    for(const ids of invalid){const response=await datos(request({route:path(ids)}));assert.equal(response.status,400,JSON.stringify(ids));}
    assert.equal(patches().length,0);
    const response=await datos(request({route:path(Array.from({length:100},(_,i)=>String(i+1)))}));
    assert.equal(response.status,200);assert.equal(patches().length,1);
  });
});
test('broad, duplicate, recipient/sender and arbitrary queries are rejected',async()=>{
  const bad=[
    '/rest/v1/mensajes?select=id,leido','/rest/v1/mensajes?id=eq.6101&select=id,leido',
    '/rest/v1/mensajes?id=gt.0&select=id,leido','/rest/v1/mensajes?id=in.(6101)&select=*',
    '/rest/v1/mensajes?id=in.(6101)&select=id','/rest/v1/mensajes?id=in.(6101)',
    path(['6101'])+'&para_user_id=eq.999',path(['6101'])+'&de_user_id=eq.702',
    path(['6101'])+'&or=(id.gt.0)',path(['6101'])+'&limit=1',path(['6101'])+'&offset=1',
    path(['6101'])+'&unknown=1',path(['6101'])+'&id=in.(6102)',path(['6101'])+'&select=id,leido',
    '/rest/v1/mensajes?id=in.(6101))&select=id,leido'
  ];
  await fixture({},async({patches})=>{
    for(const route of bad){const response=await datos(request({route}));assert.equal(response.status,400,route);}
    assert.equal(patches().length,0);
  });
});
test('only the literal leido true payload is permitted',async()=>{
  const bad=[{}, {leido:false},{leido:null},{leido:'true'},{leido:1},{contenido:'Edited',leido:true},
    {de_user_id:'701',leido:true},{para_user_id:'701',leido:true},{id:'6101',leido:true},
    {created_at:'2020-01-01',leido:true},{anuncio_id:1,leido:true}];
  await fixture({},async({patches})=>{
    for(const body of bad){const response=await datos(request({body}));assert.equal(response.status,400,JSON.stringify(body));}
    assert.equal(patches().length,0);
  });
});
test('anonymous, expired, banned, deleted and stale-password sessions cannot acknowledge',async()=>{
  for(const options of [{anonymous:true},{expired:true},{banned:true},{deleted:true},{changedPassword:true}]){
    await fixture(options,async({patches})=>{
      const response=await datos(request({signed:!options.anonymous}));
      assert.equal(response.status,401,JSON.stringify(options));assert.equal(patches().length,0);
    });
  }
});
test('cross-site, same-site and missing or foreign origins cannot mutate read state',async()=>{
  await fixture({},async({calls})=>{
    for(const headers of [{origin:'https://evil.example'},{origin:''},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]){
      const response=await datos(request({headers}));assert.equal(response.status,403);
    }
    assert.equal(calls.length,0,'CSRF is rejected before any backend call');
  });
});
test('backend failures never claim successful reading or leak private diagnostics',async()=>{
  for(const options of [{failUpdate:true},{throwUpdate:true}])await fixture(options,async()=>{
    const response=await datos(request());assert.ok([502,503].includes(response.status));
    assert.doesNotMatch(await response.text(),/Private|synthetic|XX000|sb_secret/);
  });
});
test('malformed, duplicate, unexpected and unconfirmed backend results fail closed',async()=>{
  const invalid=[null,{},[{id:'9999',leido:true}],[{id:'6101',leido:false}],[{id:'6101'}],
    [{id:'6101',leido:true},{id:'6101',leido:true}]];
  for(const updateResult of invalid)await fixture({updateResult},async()=>{
    const response=await datos(request());assert.equal(response.status,502);
  });
});
test('successful response cannot expose extra backend columns',async()=>{
  await fixture({updateResult:[{id:'6101',leido:true,contenido:'private extra',para_user_id:'701'}]},async()=>{
    const response=await datos(request());assert.equal(response.status,200);
    assert.deepEqual(await response.json(),[{id:'6101',leido:true}]);
  });
});
