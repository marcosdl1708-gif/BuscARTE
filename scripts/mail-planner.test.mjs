import test from 'node:test';
import assert from 'node:assert/strict';
import { planMonthlySummary, planProfileReminders } from '../netlify/lib/mail-planner.mjs';
import { emailHash } from '../netlify/lib/mail-runtime.mjs';

const person = (id, changes = {}) => ({id,email:`artist-${id}@example.com`,nombre:`Artista ${id}`,tipo_cuenta:'artista',rubro:'musica',instrumento:'Guitarra',foto_url:'https://example.com/photo.jpg',bio:'Una presentación',provincia:'Buenos Aires',ciudad:'La Plata',baneado:false,created_at:'2026-01-01T00:00:00.000Z',...changes});
const preference = (profile, changes = {}) => ({perfil_id:profile.id,email:profile.email,marketing_opt_in:true,onboarding_disabled:false,...changes});

async function withBackend(options, run) {
  const previousFetch = globalThis.fetch;
  const netlifyDescriptor = Object.getOwnPropertyDescriptor(globalThis,'Netlify');
  const keys = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','EMAIL_ENGAGEMENT_ACTIVATION'];
  const previousEnv = Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const calls = [], batches = [], queued = new Map();
  const profiles = options.profiles || [], preferences = options.preferences || [];
  try {
    delete globalThis.Netlify;
    process.env.SUPABASE_URL = 'https://xiaanchoanxmampegoay.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = ['sb','secret','syntheticfixture_only_123456789'].join('_');
    delete process.env.SUPABASE_SERVICE_KEY;
    process.env.EMAIL_ENGAGEMENT_ACTIVATION = '2026-10-15T00:00:00.000Z';
    globalThis.fetch = async (input, request = {}) => {
      const url = new URL(input);
      assert.equal(url.origin,'https://xiaanchoanxmampegoay.supabase.co','all network requests stay inside the synthetic backend');
      assert.equal(request.redirect,'error');
      assert.equal(request.headers.apikey,process.env.SUPABASE_SERVICE_ROLE_KEY);
      const body = request.body ? JSON.parse(request.body) : null;
      calls.push({url,method:request.method || 'GET',headers:request.headers,body});
      if (url.pathname === '/rest/v1/rpc/mail_enqueue_batch') {
        assert.equal(request.method,'POST');
        assert.ok(Array.isArray(body.p_jobs) && body.p_jobs.length > 0 && body.p_jobs.length <= 50);
        batches.push(body.p_jobs);
        for (const job of body.p_jobs) if (!queued.has(job.event_key)) queued.set(job.event_key,job);
        return new Response('0',{status:200,headers:{'Content-Type':'application/json'}});
      }
      if (request.headers.Prefer === 'count=exact') {
        assert.ok(['/rest/v1/perfiles','/rest/v1/anuncios'].includes(url.pathname));
        const count = url.pathname.endsWith('/perfiles') ? options.artistCount ?? 12 : options.adCount ?? 7;
        return new Response('[]',{status:200,headers:options.invalidCount ? {} : {'Content-Range':`0-0/${count}`,'Content-Type':'application/json'}});
      }
      if (url.pathname === '/rest/v1/perfiles' || url.pathname === '/rest/v1/email_preferences') {
        const data = url.pathname.endsWith('/perfiles') ? profiles : preferences;
        const limit = Number(url.searchParams.get('limit')), offset = Number(url.searchParams.get('offset'));
        assert.equal(limit,500);
        assert.equal(url.searchParams.get('order'),url.pathname.endsWith('/perfiles') ? 'id.asc' : 'perfil_id.asc');
        assert.ok(offset >= 0 && offset % 500 === 0);
        return new Response(JSON.stringify(data.slice(offset,offset+limit)),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if (url.pathname === '/rest/v1/anuncios') {
        assert.equal(url.searchParams.get('tipo'),'eq.jam');
        assert.equal(url.searchParams.get('limit'),'3');
        return new Response(JSON.stringify(options.events || []),{status:200,headers:{'Content-Type':'application/json'}});
      }
      throw new Error('Unexpected synthetic backend path '+url.pathname);
    };
    return await run({calls,batches,queued,profiles,preferences});
  } finally {
    globalThis.fetch = previousFetch;
    if (netlifyDescriptor) Object.defineProperty(globalThis,'Netlify',netlifyDescriptor); else delete globalThis.Netlify;
    for (const key of keys) if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
  }
}

test('monthly planning enqueues every opted-in member beyond the historical first ninety', async () => {
  const profiles = Array.from({length:127},(_,index)=>person(index+1));
  await withBackend({profiles,preferences:profiles.map(profile=>preference(profile))},async f=>{
    assert.equal(await planMonthlySummary(new Date('2026-11-01T13:00:00Z')),127);
    assert.equal(f.queued.size,127);
    assert.deepEqual(f.batches.map(batch=>batch.length),[50,50,27]);
    assert.ok([...f.queued.values()].some(job=>job.perfil_id === 127));
    for (const job of f.queued.values()) {
      assert.equal(job.tipo,'resumen_mensual');
      assert.equal(job.category,'engagement');
      assert.equal(job.data.nuevosArtistas,12);
      assert.equal(job.data.nuevosAnuncios,7);
      assert.equal(job.data.mes,'octubre');
      assert.match(job.event_key,new RegExp(`^monthly:${job.perfil_id}:2026-10:${emailHash(job.recipient)}$`));
    }
  });
});

test('audience pagination reads all pages of profiles and preferences with batches no larger than fifty', async () => {
  const profiles = Array.from({length:1005},(_,index)=>person(index+1));
  await withBackend({profiles,preferences:profiles.map(profile=>preference(profile))},async f=>{
    assert.equal(await planMonthlySummary(new Date('2026-11-01T13:00:00Z')),1005);
    assert.equal(f.queued.size,1005);
    for (const table of ['perfiles','email_preferences']) {
      assert.deepEqual(f.calls.filter(call=>call.url.pathname === '/rest/v1/'+table && call.headers.Prefer !== 'count=exact').map(call=>call.url.searchParams.get('offset')),['0','500','1000']);
    }
    assert.equal(f.batches.length,21);
    assert.ok(f.batches.every(batch=>batch.length <= 50));
    assert.equal(f.batches.at(-1).length,5);
  });
});

test('monthly audience defaults to no consent and keeps marketing separate from onboarding opt-out', async () => {
  const profiles = [person(1),person(2),person(3),person(4),person(5,{baneado:true}),person(6,{email:'invalid-address'})];
  const preferences = [preference(profiles[1],{marketing_opt_in:false}),preference(profiles[2],{onboarding_disabled:true}),preference(profiles[3],{marketing_opt_in:'true'}),preference(profiles[4]),preference(profiles[5])];
  await withBackend({profiles,preferences},async f=>{
    assert.equal(await planMonthlySummary(new Date('2026-11-01T13:00:00Z')),1);
    assert.deepEqual([...f.queued.values()].map(job=>job.perfil_id),[3]);
  });
});

test('new incomplete profiles produce stable 48-hour keys and repeated planners cannot duplicate rows', async () => {
  const profiles = [
    person(1,{created_at:'2026-10-15T13:00:00Z',foto_url:null}),
    person(2,{created_at:'2026-10-16T13:00:00Z',foto_url:null}),
    person(3,{created_at:'2026-10-15T13:00:00Z'}),
    person(4,{created_at:'2026-10-15T13:00:00Z',tipo_cuenta:'visitante',foto_url:null}),
    person(5,{created_at:'2026-01-01T00:00:00Z',foto_url:null}),
    person(6,{created_at:'2026-10-15T13:00:00Z',foto_url:null})
  ];
  await withBackend({profiles,preferences:[preference(profiles[5],{onboarding_disabled:true})]},async f=>{
    const stamp = new Date('2026-10-17T13:00:00Z');
    assert.equal(await planProfileReminders(stamp),1);
    const [job] = [...f.queued.values()];
    assert.equal(job.perfil_id,1);
    assert.equal(job.data.etapa,'48h');
    assert.equal(job.event_key,`perfil:1:48h:v1:${emailHash(profiles[0].email)}`);
    assert.equal(job.due_at,'2026-10-17T13:00:00.000Z');
    assert.equal(job.expires_at,'2026-10-21T13:00:00.000Z');
    assert.equal(await planProfileReminders(stamp),1);
    assert.equal(f.queued.size,1);
    assert.equal(f.batches.length,2);
  });
});

test('monthly date boundaries follow the local Argentina month even around UTC midnight and year changes', async () => {
  for (const [stamp,from,until] of [
    ['2026-11-01T02:30:00Z','2026-09-01T03:00:00.000Z','2026-10-01T03:00:00.000Z'],
    ['2026-11-01T03:00:00Z','2026-10-01T03:00:00.000Z','2026-11-01T03:00:00.000Z'],
    ['2027-01-01T02:30:00Z','2026-11-01T03:00:00.000Z','2026-12-01T03:00:00.000Z']
  ]) await withBackend({},async f=>{
    await planMonthlySummary(new Date(stamp));
    const countCalls = f.calls.filter(call=>call.headers.Prefer === 'count=exact');
    assert.equal(countCalls.length,2);
    for (const call of countCalls) {
      assert.deepEqual(call.url.searchParams.getAll('created_at'),['gte.'+from,'lt.'+until],stamp);
    }
  });
});

test('monthly event snapshots retain canonical IDs and local date labels without leaking raw URL fields', async () => {
  const profile = person(1);
  await withBackend({profiles:[profile],preferences:[preference(profile)],events:[{id:17,titulo:'Encuentro',fecha_evento:'2026-11-07T21:00:00Z',lugar:'La Plata',url:'https://untrusted.example'}, {id:18,titulo:'Invalid date',fecha_evento:'bad'}]},async f=>{
    await planMonthlySummary(new Date('2026-11-01T13:00:00Z'));
    const [job] = [...f.queued.values()];
    assert.equal(job.data.proximosEventos.length,1);
    assert.equal(job.data.proximosEventos[0].id,17);
    assert.equal(job.data.proximosEventos[0].fechaISO,'2026-11-07T21:00:00Z');
    assert.match(job.data.proximosEventos[0].fecha,/18:00|06:00\s*p/i);
    assert.equal(job.data.proximosEventos[0].url,undefined);
  });
});

test('an invalid backend count aborts instead of enqueueing a misleading monthly summary', async () => {
  await withBackend({invalidCount:true},async f=>{
    await assert.rejects(planMonthlySummary(new Date('2026-11-01T13:00:00Z')));
    assert.equal(f.batches.length,0);
    assert.equal(f.queued.size,0);
  });
});
