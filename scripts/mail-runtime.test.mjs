import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createMailService, emailHash, MAIL_LIMITS, resetTokenFor, signMailToken, validateUsage, verifyMailToken } from '../netlify/lib/mail-runtime.mjs';
import { missingBasics } from '../netlify/lib/mail-profile.mjs';

const SECRET = 'test-mail-only-secret-with-more-than-thirty-two-characters';
const digest = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const fixturePerson = changes => ({ id:42, email:'ana@example.com', nombre:'Ana', tipo_cuenta:'artista', rubro:'musica', instrumento:'Guitarra', foto_url:null, bio:'Hola', provincia:'Buenos Aires', ciudad:'La Plata', baneado:false, created_at:'2026-10-15T00:00:00.000Z', ...changes });

// The mock stores queue rows, leases, stable prepared payloads and shared quota counters.
// It models RPC contracts and returns explicit errors for unknown DB/provider operations.
function fixture(options = {}) {
  let clock = new Date('2026-10-18T15:00:00.000Z');
  const person = fixturePerson(options.person);
  const preferences = { marketing_opt_in:false, onboarding_disabled:false, ...options.preferences };
  const jobs = new Map(), messages = new Map(), calls = [], posts = [], providerResults = [...(options.providerResults || [])];
  const budget = { daily:options.daily ?? 0, monthly:options.monthly ?? 0, engagementDaily:options.engagementDaily ?? 0, engagementMonthly:options.engagementMonthly ?? 0 };
  const environment = name => ({RESEND_API_KEY:'test-send-only-key', RESEND_USAGE_API_KEY:options.readKey === false ? '' : 'test-read-only-key', FROM_EMAIL:'buscARTE <hola@buscarte.com.ar>'}[name] || '');
  const usageBody = () => ({emails:{daily:{used:options.providerDaily ?? 0, limit:100, resets_at:new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()+1)).toISOString()},monthly:{used:options.providerMonthly ?? 0, limit:3000, resets_at:new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth()+1, 1)).toISOString()}}});
  function row(id) { const value = jobs.get(id); assert.ok(value, `Unknown job ${id}`); return value; }
  function leased(id, lease) { const value = row(id); return value.status === 'leased' && value.lease_token === lease && Date.parse(value.lease_until) > clock.getTime(); }
  function end(value, status, reason = '') { Object.assign(value, {status, last_error:reason, lease_token:null, lease_until:null}); }
  const db = async (path, request = {}) => {
    const input = request.body ? JSON.parse(request.body) : null;
    calls.push({path, method:request.method || 'GET', input:clone(input)});
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.slice('/rest/v1/rpc/'.length);
      if (name === 'estado_bloqueo_web') {
        assert.equal(input.p_actor_id,'43');assert.equal(input.p_otro_id,String(person.id));
        return {blocked_by_me:false,restricted:false};
      }
      if (name === 'mail_usage_snapshot') {
        if (options.initialized === false) return null;
        const snapshot = usageBody();
        snapshot.emails.daily.used = budget.daily;
        snapshot.emails.monthly.used = budget.monthly;
        return snapshot;
      }
      if (name === 'mail_observe_usage') {
        if (Number.isSafeInteger(input.p_daily_used)) budget.daily = Math.max(budget.daily,input.p_daily_used);
        if (Number.isSafeInteger(input.p_monthly_used)) budget.monthly = Math.max(budget.monthly,input.p_monthly_used);
        return true;
      }
      if (name === 'mail_enqueue') {
        const existing = [...jobs.values()].find(job => job.event_key === input.p_event_key);
        if (existing) return clone(existing);
        const job = {id:input.p_id, event_key:input.p_event_key, tipo:input.p_tipo, perfil_id:input.p_perfil_id, recipient:input.p_recipient, data:input.p_data, category:input.p_category, priority:input.p_priority, due_at:input.p_due_at, expires_at:input.p_expires_at, status:'pending', lease_token:null, lease_until:null, first_attempt_at:null, attempts:0, rendered_payload:null, payload_hash:null, reset_prepared_at:null, created_at:clock.toISOString()};
        jobs.set(job.id, job);
        return clone(job);
      }
      if (name === 'mail_claim') {
        const job = [...jobs.values()].filter(value => (!input.p_id || input.p_id === value.id) && ['pending','retry'].includes(value.status) && Date.parse(value.due_at) <= clock.getTime() && Date.parse(value.expires_at) > clock.getTime()).sort((a,b) => a.priority - b.priority)[0];
        if (!job) return null;
        Object.assign(job, {status:'leased', lease_token:randomUUID(), lease_until:new Date(clock.getTime()+90000).toISOString()});
        return clone(job);
      }
      if (name === 'mail_prepare') {
        const job = row(input.p_id);
        if (!leased(job.id,input.p_lease)) return null;
        if (job.rendered_payload) return clone(job.rendered_payload);
        if (job.tipo !== 'reset') job.rendered_payload = clone(input.p_payload);
        return clone(input.p_payload);
      }
      if (name === 'mail_reserve') {
        const job = row(input.p_id);
        if (options.beforeReserve) options.beforeReserve({person,preferences,job});
        if (!leased(job.id,input.p_lease)) return {allowed:false, reason:'lease_lost'};
        if (job.payload_hash && job.payload_hash !== input.p_payload_hash) {
          end(job,'failed','payload_changed');
          return {allowed:false,reason:'payload_changed'};
        }
        if (job.category === 'engagement') {
          const onboarding = job.tipo === 'perfil_incompleto' && job.data.etapa !== 'reactivacion';
          if (job.tipo === 'perfil_incompleto' && preferences.onboarding_disabled || (!onboarding && !preferences.marketing_opt_in)) {
            end(job,'cancelled','preference');
            return {allowed:false,reason:'preference'};
          }
          if (job.tipo === 'perfil_incompleto' && !missingBasics(person).length) {
            end(job,'cancelled','profile_complete');
            return {allowed:false,reason:'profile_complete'};
          }
        }
        budget.daily = Math.max(budget.daily,input.p_daily_used);
        budget.monthly = Math.max(budget.monthly,input.p_monthly_used);
        const engagement = job.category === 'engagement';
        if (budget.monthly >= MAIL_LIMITS.monthly || engagement && budget.engagementMonthly >= MAIL_LIMITS.engagementMonthly) return {allowed:false, reason:'monthly_budget',retry_at:input.p_monthly_reset};
        if (budget.daily >= MAIL_LIMITS.daily || engagement && budget.engagementDaily >= MAIL_LIMITS.engagementDaily) return {allowed:false,reason:'daily_budget',retry_at:input.p_daily_reset};
        if (job.tipo !== 'reset' && budget.daily >= 70) return {allowed:false,reason:'non_urgent_daily_budget',retry_at:input.p_daily_reset};
        budget.daily++; budget.monthly++;
        if (engagement) { budget.engagementDaily++; budget.engagementMonthly++; }
        job.attempts++;
        job.first_attempt_at ||= clock.toISOString();
        job.payload_hash ||= input.p_payload_hash;
        return {allowed:true};
      }
      if (name === 'mail_set_reset') {
        const job = row(input.p_id);
        if (!leased(job.id,input.p_lease) || job.tipo !== 'reset' || !job.first_attempt_at || !job.payload_hash || clock.getTime() - Date.parse(job.first_attempt_at) >= 45*60000) return false;
        if (options.resetAllowed === false) { end(job,'cancelled','reset_superseded'); return false; }
        if (job.reset_prepared_at) return person.reset_token === input.p_token_hash && person.reset_expires === new Date(Date.parse(job.first_attempt_at)+3600000).toISOString();
        person.reset_token = input.p_token_hash;
        person.reset_expires = new Date(Date.parse(job.first_attempt_at)+3600000).toISOString();
        job.reset_prepared_at = clock.toISOString();
        return true;
      }
      if (name === 'mail_finish') {
        const job = row(input.p_id);
        if (!leased(job.id,input.p_lease)) return false;
        end(job,input.p_status,input.p_error);
        if (input.p_status === 'retry') job.due_at = input.p_due_at;
        if (input.p_resend_id) job.resend_id = input.p_resend_id;
        return true;
      }
      if (name === 'mail_cancel_pending_profile') {
        assert.ok(['engagement','onboarding','marketing'].includes(input.p_scope), 'known cancellation scope');
        let count = 0;
        for (const job of jobs.values()) {
          const scopeMatch = input.p_scope === 'engagement' || (input.p_scope === 'onboarding' ? job.tipo === 'perfil_incompleto' : job.tipo !== 'perfil_incompleto' || job.data.etapa === 'reactivacion');
          if (job.perfil_id === input.p_perfil_id && job.recipient === input.p_email && job.category === 'engagement' && ['pending','retry','leased'].includes(job.status) && scopeMatch) { end(job,'cancelled','unsubscribed'); count++; }
        }
        return count;
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
    if (path.startsWith('/rest/v1/perfiles?')) {
      if (request.method === 'PATCH') { Object.assign(person,input); return null; }
      return options.profileDeleted ? [] : [clone(person)];
    }
    if (path.startsWith('/rest/v1/email_preferences?')) {
      if (request.method === 'POST') { Object.assign(preferences,input); return null; }
      return [clone(preferences)];
    }
    if (path.startsWith('/rest/v1/mensajes?')) {
      const messageId=new URL(path,'https://fixture.invalid').searchParams.get('id')?.replace(/^eq\./,'');
      return messages.has(messageId)?[clone(messages.get(messageId))]:[];
    }
    if (path.startsWith('/rest/v1/email_outbox?')) {
      const jobId=new URL(path,'https://fixture.invalid').searchParams.get('id')?.replace(/^eq\./,'');
      const job=jobs.get(jobId);return job?[{status:job.status,lease_token:job.lease_token}]:[];
    }
    throw new Error(`Unexpected backend path ${path}`);
  };
  const transport = async (url, request = {}) => {
    if (url === 'https://api.resend.com/usage') {
      calls.push({url,method:request.method || 'GET',authorization:request.headers.Authorization});
      assert.equal(request.redirect,'error');
      return new Response(JSON.stringify(options.usageBody || usageBody()), {status:options.usageStatus || 200,headers:{'Content-Type':'application/json'}});
    }
    if (url.startsWith('https://api.resend.com/suppressions/')) {
      calls.push({url,method:request.method || 'GET'});
      assert.equal(request.redirect,'error');
      return new Response('{}',{status:options.suppressionStatus || 404,headers:{'Content-Type':'application/json'}});
    }
    assert.equal(url,'https://api.resend.com/emails');
    assert.equal(request.method,'POST');
    assert.equal(request.redirect,'error');
    posts.push({headers:clone(request.headers),body:request.body});
    const result = providerResults.shift() || {status:200,body:{id:'test-resend-'+posts.length}};
    if (result.throw) throw new Error('synthetic provider timeout');
    return new Response(JSON.stringify(result.body || {}), {status:result.status,headers:{'Content-Type':'application/json',...result.headers}});
  };
  const service = createMailService({backendJson:db,fetch:transport,environment,secret:()=>SECRET,now:()=>new Date(clock)});
  const enqueue = (tipo = 'mensaje', changes = {}) => {
    const messageId=String(messages.size+100);
    const eventKey=changes.eventKey || (tipo==='mensaje'?'message:'+messageId:'test:'+randomUUID());
    if(tipo==='mensaje' && /^message:[1-9]\d*$/.test(eventKey))messages.set(eventKey.slice(8),{id:Number(eventKey.slice(8)),de_user_id:43,para_user_id:person.id});
    return service.enqueue({tipo,destinatario:person.email,perfilId:person.id,datos:tipo === 'perfil_incompleto' ? {etapa:'48h'} : {nombre:person.nombre,remitente:'Pedro',preview:'Hola'},...changes,eventKey});
  };
  return {service,enqueue,jobs,person,preferences,calls,posts,budget,row,advance:ms=>{clock=new Date(clock.getTime()+ms);},setTime:value=>{clock=new Date(value);}};
}

test('daily and monthly budget denials defer without any provider POST', async () => {
  for (const options of [{daily:90},{monthly:2700},{engagementDaily:40},{engagementMonthly:1200},{providerDaily:99}]) {
    const f = fixture(options);
    const job = await f.enqueue('perfil_incompleto');
    const result = await f.service.dispatch(job.id);
    assert.equal(result.status,'deferred');
    assert.match(result.reason,/budget/);
    assert.equal(f.posts.length,0);
    assert.equal(f.row(job.id).status,'retry');
    assert.equal(f.row(job.id).attempts,0);
  }
});

test('usage 403 or malformed observations fail closed before reserve or provider POST', async () => {
  for (const options of [{usageStatus:403},{usageBody:{}},{usageBody:{emails:{daily:{used:0,limit:100,resets_at:'2000-01-01'},monthly:{used:0,limit:3000,resets_at:'2000-02-01'}}}}]) {
    const f = fixture(options);
    const job = await f.enqueue();
    assert.deepEqual(await f.service.dispatch(job.id), {status:'deferred',reason:'usage_unavailable'});
    assert.equal(f.posts.length,0);
    assert.equal(f.calls.filter(call=>call.path?.endsWith('/mail_reserve')).length,0);
    assert.equal(f.budget.daily,0);
  }
});

test('transactional and engagement jobs share one atomic daily allowance under concurrency', async () => {
  const f = fixture({daily:69,monthly:100});
  const transactional = await f.enqueue('mensaje');
  const engagement = await f.enqueue('perfil_incompleto');
  const results = await Promise.all([f.service.dispatch(transactional.id),f.service.dispatch(engagement.id)]);
  assert.equal(results.filter(result=>result.status === 'sent').length,1);
  assert.equal(results.filter(result=>result.status === 'deferred').length,1);
  assert.equal(f.posts.length,1);
  assert.equal(f.budget.daily,70);
  assert.equal(f.budget.monthly,101);
  assert.equal(f.calls.filter(call=>call.path?.endsWith('/mail_reserve')).length,2);
});

test('engagement cap leaves the remaining shared capacity available to transactional mail', async () => {
  const f = fixture({engagementDaily:40,daily:40});
  const engaged = await f.enqueue('perfil_incompleto');
  assert.equal((await f.service.dispatch(engaged.id)).status,'deferred');
  const transaction = await f.enqueue('mensaje');
  assert.equal((await f.service.dispatch(transaction.id)).status,'sent');
  assert.equal(f.budget.daily,41);
  assert.equal(f.budget.engagementDaily,40);
});

test('two workers cannot claim and send the same queue row concurrently', async () => {
  const f = fixture();
  const job = await f.enqueue();
  const results = await Promise.all([f.service.dispatch(job.id),f.service.dispatch(job.id)]);
  assert.deepEqual(results.map(result=>result.status).sort(),['empty','sent']);
  assert.equal(f.posts.length,1);
});

test('provider timeout and 5xx retry preserve byte-identical payload and idempotency key', async () => {
  for (const failure of [{throw:true},{status:503,body:{name:'application_error'}}]) {
    const f = fixture({providerResults:[failure]});
    const job = await f.enqueue();
    assert.equal((await f.service.dispatch(job.id)).status,'deferred');
    assert.equal(f.posts.length,1);
    f.person.nombre = 'Nombre cambiado después';
    f.row(job.id).data.preview = 'Dato modificado en reintento';
    f.advance(5*60000);
    assert.equal((await f.service.dispatch(job.id)).status,'sent');
    assert.equal(f.posts.length,2);
    assert.equal(f.posts[0].body,f.posts[1].body);
    assert.equal(f.posts[0].headers['Idempotency-Key'],`buscarte/${job.id}`);
    assert.equal(f.posts[0].headers['Idempotency-Key'],f.posts[1].headers['Idempotency-Key']);
    assert.equal(f.row(job.id).attempts,2);
    assert.equal(f.row(job.id).status,'sent');
  }
});

test('provider quotas preserve queued mail and defer to the corresponding reset', async () => {
  for (const name of ['daily_quota_exceeded','monthly_quota_exceeded']) {
    const f = fixture({providerResults:[{status:429,body:{name}}]});
    const job = await f.enqueue();
    assert.deepEqual(await f.service.dispatch(job.id),{status:'deferred',reason:'provider_quota'});
    assert.equal(f.posts.length,1);
    assert.equal(f.row(job.id).status,'retry');
    assert.match(f.row(job.id).due_at,name.startsWith('daily') ? /^2026-10-19T00:00:00/ : /^2026-11-01T00:00:00/);
  }
});

test('unsubscribe, missing consent and completed profiles cancel before usage or send', async () => {
  for (const {tipo,options} of [
    {tipo:'perfil_incompleto',options:{preferences:{onboarding_disabled:true}}},
    {tipo:'resumen_mensual',options:{}},
    {tipo:'perfil_incompleto',options:{person:{foto_url:'https://example.com/photo'}}}
  ]) {
    const f = fixture(options), job = await f.enqueue(tipo);
    assert.equal((await f.service.dispatch(job.id)).status,'cancelled');
    assert.equal(f.posts.length,0);
    assert.equal(f.calls.filter(call=>call.url?.endsWith('/usage')).length,0);
    assert.equal(f.row(job.id).status,'cancelled');
  }
  const f = fixture(), job = await f.enqueue('perfil_incompleto',{datos:{etapa:'reactivacion'}});
  assert.equal((await f.service.dispatch(job.id)).status,'cancelled');
  assert.equal(f.posts.length,0);
});

test('the final reservation can cancel a profile completed or unsubscribed during dispatch', async () => {
  for (const beforeReserve of [({person})=>{person.foto_url='https://example.com/photo';},({preferences})=>{preferences.onboarding_disabled=true;}]) {
    const f = fixture({beforeReserve}), job = await f.enqueue('perfil_incompleto');
    await f.service.dispatch(job.id);
    assert.equal(f.posts.length,0);
    assert.equal(f.row(job.id).status,'cancelled');
    assert.equal(f.budget.daily,0);
  }
});

test('changing email, banning or deleting a profile prevents a stale-recipient send', async () => {
  for (const change of [f=>{f.person.email='changed@example.com';},f=>{f.person.baneado=true;}]) {
    const f = fixture(), job = await f.enqueue();
    change(f);
    assert.equal((await f.service.dispatch(job.id)).status,'cancelled');
    assert.equal(f.posts.length,0);
  }
});

test('preference changes cancel pending marketing without suppressing a permitted onboarding reminder', async () => {
  const f = fixture({preferences:{marketing_opt_in:true}});
  const marketing = await f.enqueue('resumen_mensual');
  const onboarding = await f.enqueue('perfil_incompleto');
  const saved = await f.service.savePreferences(f.person,{marketing_opt_in:false,onboarding_disabled:false});
  assert.deepEqual(saved,{marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly'});
  assert.equal(f.row(marketing.id).status,'cancelled');
  assert.equal(f.row(onboarding.id).status,'pending');
  await f.service.savePreferences(f.person,{marketing_opt_in:false,onboarding_disabled:true});
  assert.equal(f.row(onboarding.id).status,'cancelled');
});

test('monthly marketing remains independent of disabling profile reminders', async () => {
  const f = fixture({preferences:{marketing_opt_in:true}});
  const monthly = await f.enqueue('resumen_mensual');
  const onboarding = await f.enqueue('perfil_incompleto');
  const reactivation = await f.enqueue('perfil_incompleto',{datos:{etapa:'reactivacion'}});
  await f.service.savePreferences(f.person,{marketing_opt_in:true,onboarding_disabled:true});
  assert.equal(f.row(onboarding.id).status,'cancelled');
  assert.equal(f.row(reactivation.id).status,'cancelled');
  assert.equal(f.row(monthly.id).status,'pending');
  assert.equal((await f.service.dispatch(monthly.id)).status,'sent');
  assert.equal(f.posts.length,1);
});

test('known provider suppression cancels; lookup failures defer without consuming send allowance', async () => {
  for (const suppressionStatus of [200,403,500]) {
    const f = fixture({suppressionStatus}), job = await f.enqueue();
    const result = await f.service.dispatch(job.id);
    assert.equal(result.status,suppressionStatus === 200 ? 'cancelled' : 'deferred');
    if (suppressionStatus !== 200) assert.equal(result.reason,'suppression_unavailable');
    assert.equal(f.posts.length,0);
    assert.equal(f.calls.filter(call=>call.path?.endsWith('/mail_reserve')).length,0);
    assert.equal(f.budget.daily,0);
  }
});

test('sending-only credentials use initialized durable quota and fail closed before bootstrap', async () => {
  const uninitialized = fixture({readKey:false,initialized:false}), queued = await uninitialized.enqueue();
  assert.deepEqual(await uninitialized.service.dispatch(queued.id),{status:'deferred',reason:'usage_unavailable'});
  assert.equal(uninitialized.posts.length,0);
  assert.equal(uninitialized.calls.filter(call=>call.url).length,0);
  const capped = fixture({readKey:false,daily:90}), cappedJob = await capped.enqueue();
  assert.equal((await capped.service.dispatch(cappedJob.id)).status,'deferred');
  assert.equal(capped.posts.length,0);
  const initialized = fixture({readKey:false,daily:3,monthly:131}), job = await initialized.enqueue();
  assert.equal((await initialized.service.dispatch(job.id)).status,'sent');
  assert.equal(initialized.budget.daily,4);
  assert.equal(initialized.budget.monthly,132);
  assert.equal(initialized.calls.filter(call=>call.url?.endsWith('/usage') || call.url?.includes('/suppressions/')).length,0);
  assert.equal(initialized.calls.filter(call=>call.path?.endsWith('/mail_usage_snapshot')).length,1);
});

test('provider quota response headers raise shared ledger floors; absent or invalid headers do not invent usage', async () => {
  const f = fixture({readKey:false,providerResults:[{status:200,body:{id:'synthetic'},headers:{'x-resend-daily-quota':'57','x-resend-monthly-quota':'709'}}]});
  const job = await f.enqueue();
  assert.equal((await f.service.dispatch(job.id)).status,'sent');
  assert.equal(f.budget.daily,57);
  assert.equal(f.budget.monthly,709);
  assert.deepEqual(f.calls.find(call=>call.path?.endsWith('/mail_observe_usage')).input,{p_daily_used:57,p_monthly_used:709});
  const invalid = fixture({readKey:false,providerResults:[{status:200,body:{id:'synthetic'},headers:{'x-resend-daily-quota':'bad','x-resend-monthly-quota':'-2'}}]});
  const invalidJob = await invalid.enqueue();
  assert.equal((await invalid.service.dispatch(invalidJob.id)).status,'sent');
  assert.equal(invalid.calls.filter(call=>call.path?.endsWith('/mail_observe_usage')).length,0);
  assert.equal(invalid.budget.daily,1);
});

test('explicit provider quota errors close the shared ledger until reset even without usage access', async () => {
  for (const name of ['daily_quota_exceeded','monthly_quota_exceeded']) {
    const f = fixture({readKey:false,providerResults:[{status:429,body:{name}}]});
    const first = await f.enqueue();
    assert.equal((await f.service.dispatch(first.id)).status,'deferred');
    const next = await f.enqueue();
    assert.equal((await f.service.dispatch(next.id)).status,'deferred');
    assert.equal(f.posts.length,1);
    assert.equal(name.startsWith('daily') ? f.budget.daily : f.budget.monthly,name.startsWith('daily') ? 100 : 3000);
  }
});

test('reset derives its token per job, stores only the hash and never persists reset HTML', async () => {
  const f = fixture(), job = await f.enqueue('reset',{datos:{nombre:'Ana'}});
  assert.equal((await f.service.dispatch(job.id)).status,'sent');
  const raw = resetTokenFor(job,SECRET);
  const payload = JSON.parse(f.posts[0].body);
  assert.ok(payload.html.includes(`token=${raw}`));
  assert.ok(payload.text.includes(`token=${raw}`));
  assert.equal(f.person.reset_token,digest(raw));
  assert.equal(f.person.reset_expires,'2026-10-18T16:00:00.000Z');
  assert.equal(f.row(job.id).rendered_payload,null);
  assert.ok(!JSON.stringify([...f.jobs.values()]).includes(raw));
  assert.ok(!JSON.stringify(f.person).includes(raw));
  assert.equal(f.calls.filter(call=>call.method === 'PATCH' && call.path?.startsWith('/rest/v1/perfiles')).length,0,'reset storage must be guarded by mail_set_reset RPC');
  const mutations = f.calls.filter(call=>call.path?.endsWith('/mail_set_reset'));
  assert.equal(mutations.length,1);
  assert.deepEqual(mutations[0].input,{p_id:job.id,p_lease:mutations[0].input.p_lease,p_token_hash:digest(raw)});
});

test('a reset retry cannot revive a consumed token or supersede a newer recovery', async () => {
  const f = fixture({providerResults:[{status:503,body:{name:'server_error'}}]});
  const job = await f.enqueue('reset',{datos:{nombre:'Ana'}});
  assert.equal((await f.service.dispatch(job.id)).status,'deferred');
  f.person.reset_token = null;
  f.person.reset_expires = null;
  f.advance(5*60000);
  await f.service.dispatch(job.id);
  assert.equal(f.posts.length,1,'consumed recovery must not be sent or rewritten');
  assert.equal(f.person.reset_token,null);
  const superseded = fixture({resetAllowed:false}), later = await superseded.enqueue('reset',{datos:{nombre:'Ana'}});
  await superseded.service.dispatch(later.id);
  assert.equal(superseded.posts.length,0);
  assert.equal(superseded.person.reset_token,undefined);
});

test('enqueue rejects raw recovery credentials and deduplicates stable event keys', async () => {
  const f = fixture();
  for (const key of ['token','reset_token','password','link']) {
    await assert.rejects(f.enqueue('reset',{datos:{[key]:'private-do-not-store'}}));
  }
  assert.equal(f.jobs.size,0);
  const first = await f.enqueue('mensaje',{eventKey:'message:shared'});
  const second = await f.enqueue('mensaje',{eventKey:'message:shared'});
  assert.equal(first.id,second.id);
  assert.equal(f.jobs.size,1);
});

test('engagement quiet hours defer while urgent transactional email still sends', async () => {
  const f = fixture(); f.setTime('2026-10-18T23:00:00.000Z');
  const engagement = await f.enqueue('perfil_incompleto');
  assert.deepEqual(await f.service.dispatch(engagement.id),{status:'deferred',reason:'quiet_hours'});
  assert.equal(f.row(engagement.id).due_at,'2026-10-19T13:00:00.000Z');
  const transactional = await f.enqueue('mensaje');
  assert.equal((await f.service.dispatch(transactional.id)).status,'sent');
  assert.equal(f.posts.length,1);
});

test('signed tokens bind purpose, profile and email without including the raw address', () => {
  const value = {v:1,p:'42',e:emailHash(' ANA@EXAMPLE.COM '),k:'action',j:randomUUID()};
  const token = signMailToken(value,SECRET);
  assert.deepEqual(verifyMailToken(token,SECRET),value);
  assert.equal(verifyMailToken(token,SECRET+'other'),null);
  assert.equal(verifyMailToken(token+'.extra',SECRET),null);
  const [payload,signature] = token.split('.');
  assert.equal(verifyMailToken(payload+'.'+(signature.startsWith('A') ? 'B':'A')+signature.slice(1),SECRET),null);
  assert.ok(!Buffer.from(token.split('.')[0],'base64url').toString().includes('ana@example.com'));
});

test('follow-up keeps working months later and a historical profile cannot bypass consent by changing stage', async () => {
  for(const created_at of ['2026-10-15T00:00:00Z','2026-01-01T00:00:00Z']) {
    const f=fixture({person:{created_at}});f.setTime('2027-03-01T15:00:00Z');
    const job=await f.enqueue('perfil_incompleto',{datos:{etapa:'seguimiento'}});
    assert.equal((await f.service.dispatch(job.id)).status,created_at.startsWith('2026-10')?'sent':'cancelled');
    assert.equal(f.posts.length,created_at.startsWith('2026-10')?1:0);
  }
});

test('unknown reminder stages cannot bypass audience restrictions', async () => {
  const f=fixture();const job=await f.enqueue('perfil_incompleto',{datos:{etapa:'forzado'}});
  assert.equal((await f.service.dispatch(job.id)).status,'cancelled');assert.equal(f.posts.length,0);
});

test('historical explicit profile-help choice works independently of newsletters', async () => {
  for(const evidence of [{onboarding_consent_version:'2026-10-25-profile-help-v1',onboarding_consented_at:'2026-10-25T12:00:00Z'},{}, {onboarding_consent_version:'2026-10-25-profile-help-v1',onboarding_consented_at:'2027-01-01T00:00:00Z'}]) {
    const f=fixture({person:{created_at:'2026-01-01T00:00:00Z'},preferences:{marketing_opt_in:false,...evidence}});f.setTime('2026-10-25T15:00:00Z');
    const job=await f.enqueue('perfil_incompleto',{datos:{etapa:'seguimiento'}});const allowed=Object.keys(evidence).length>0&&evidence.onboarding_consented_at.startsWith('2026-10');
    assert.equal((await f.service.dispatch(job.id)).status,allowed?'sent':'cancelled');assert.equal(f.posts.length,allowed?1:0);
  }
});

test('explicit profile-help preference records evidence once without subscribing marketing', async () => {
  const f=fixture();f.setTime('2026-10-25T15:00:00Z');
  await f.service.savePreferences(f.person,{marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly',onboarding_choice:true},{source:'profile'});
  const first=f.calls.filter(c=>c.path.startsWith('/rest/v1/email_preferences?')&&c.method==='POST').at(-1).input;
  assert.equal(first.marketing_opt_in,false);assert.equal(first.onboarding_consent_version,'2026-10-25-profile-help-v1');assert.equal(first.onboarding_consented_at,'2026-10-25T15:00:00.000Z');
  f.advance(86400000);await f.service.savePreferences(f.person,{marketing_opt_in:false,onboarding_disabled:false,marketing_frequency:'monthly',onboarding_choice:true},{source:'profile'});
  const second=f.calls.filter(c=>c.path.startsWith('/rest/v1/email_preferences?')&&c.method==='POST').at(-1).input;
  assert.equal(Object.hasOwn(second,'onboarding_consented_at'),false);
});

test('fortnightly news requires its explicit frequency evidence and rejects future consent', async () => {
  const base={marketing_opt_in:true,marketing_frequency:'fortnightly',marketing_consent_version:'2026-10-25-fortnightly-v1',marketing_consented_at:'2026-10-25T12:00:00Z'};
  for(const changes of [{},{marketing_frequency:'monthly'},{marketing_consent_version:null},{marketing_consented_at:null},{marketing_consented_at:'2027-01-01T00:00:00Z'}]) {
    const f=fixture({preferences:{...base,...changes}});f.setTime('2026-10-25T15:00:00Z');
    const job=await f.enqueue('novedades',{datos:{cadencia:'15d',desdeISO:'2026-10-10T13:00:00Z',hastaISO:'2026-10-25T13:00:00Z',nuevosArtistas:2,nuevosAnuncios:1,proximosEventos:[]}});
    const allowed=Object.keys(changes).length===0;
    assert.equal((await f.service.dispatch(job.id)).status,allowed?'sent':'cancelled');assert.equal(f.posts.length,allowed?1:0);
  }
});

test('switching to fortnightly cancels an old monthly queued job before provider', async () => {
  const f=fixture({preferences:{marketing_opt_in:true,marketing_frequency:'fortnightly'}});
  const job=await f.enqueue('resumen_mensual');assert.equal((await f.service.dispatch(job.id)).status,'cancelled');assert.equal(f.posts.length,0);
});

test('cached monthly clients cannot reactivate fortnightly and new explicit choices record server evidence', async () => {
  const f=fixture({preferences:{marketing_opt_in:false,marketing_frequency:'fortnightly',marketing_consent_version:'2026-10-25-fortnightly-v1'}});f.setTime('2026-10-25T15:00:00Z');
  const old=await f.service.savePreferences(f.person,{marketing_opt_in:true,onboarding_disabled:false});
  assert.equal(old.marketing_frequency,'monthly');
  const first=f.calls.filter(c=>c.path.startsWith('/rest/v1/email_preferences?')&&c.method==='POST').at(-1).input;
  assert.equal(Object.hasOwn(first,'marketing_consented_at'),false);
  const updated=await f.service.savePreferences(f.person,{marketing_opt_in:true,onboarding_disabled:false,marketing_frequency:'fortnightly'},{source:'profile'});
  assert.equal(updated.marketing_frequency,'fortnightly');
  const stored=f.calls.filter(c=>c.path.startsWith('/rest/v1/email_preferences?')&&c.method==='POST').at(-1).input;
  assert.equal(stored.marketing_consent_version,'2026-10-25-fortnightly-v1');assert.equal(stored.marketing_consent_source,'profile');assert.equal(stored.marketing_consented_at,'2026-10-25T15:00:00.000Z');
});

test('password recovery retains the protected allowance after ordinary daily sends stop', async () => {
  const f=fixture({daily:89});
  const ordinary=await f.enqueue('mensaje');assert.equal((await f.service.dispatch(ordinary.id)).reason,'non_urgent_daily_budget');
  const recovery=await f.enqueue('reset');assert.equal((await f.service.dispatch(recovery.id)).status,'sent');assert.equal(f.budget.daily,90);
});

test('usage rejects changed plan limits and invalid reset timestamps', () => {
  const now = new Date('2026-10-18T15:00:00Z');
  const valid = {emails:{daily:{used:0,limit:100,resets_at:'2026-10-19T00:00:00Z'},monthly:{used:100,limit:3000,resets_at:'2026-11-01T00:00:00Z'}}};
  assert.deepEqual(validateUsage(valid,now),{daily:valid.emails.daily,monthly:valid.emails.monthly});
  for (const mutate of [v=>{v.emails.daily.limit=1000;},v=>{v.emails.monthly.limit=50000;},v=>{v.emails.daily.used=-1;},v=>{v.emails.daily.resets_at='2026-10-18T14:00:00Z';}]) {
    const value = clone(valid); mutate(value);
    assert.throws(()=>validateUsage(value,now));
  }
});
