import test from 'node:test';
import assert from 'node:assert/strict';
import { missingBasics, planEngagement, DEFAULT_ENGAGEMENT_ACTIVATION, PROFILE_HELP_CONSENT_VERSION } from '../netlify/lib/mail-profile.mjs';

const DAY = 86400000;
const activated = Date.parse(DEFAULT_ENGAGEMENT_ACTIVATION);
const at = days => new Date(activated + days * DAY).toISOString();
const profile = changes => ({ id:42, tipo_cuenta:'artista', nombre:'Ana', foto_url:'https://example.com/foto.jpg', bio:'Hola', provincia:'Buenos Aires', ciudad:'La Plata', rubro:'musica', instrumento:'Guitarra', created_at:at(0), ...changes });
const incomplete = changes => profile({ foto_url:null, ...changes });
const fieldSets = {
  actuacion: ['rol', 'chips-rol-act', 'chips-rol-actuacion'], audiovisual:['rol', 'chips-rol-av'],
  modelaje:['tipo_trabajo', 'chips-tipo-modelo'], diseno:['rol', 'chips-rol-dis', 'chips-rol-diseno'],
  tatuaje:['rol', 'chips-rol-tatu'], danza:['disciplina', 'chips-disc-dan', 'chips-disciplina-danza'],
  maquillaje:['rol', 'chips-rol-maq'], circo:['especialidad', 'chips-rol-cir', 'chips-rol-circo'],
  escritura:['rol', 'chips-rol-esc', 'chips-rol-escritura']
};

test('the five basics exactly match saved editor semantics, with no bio length requirement', () => {
  assert.deepEqual(missingBasics(profile()), []);
  assert.deepEqual(missingBasics(profile({ nombre:' ', foto_url:'javascript:x', bio:' ', provincia:'', ciudad:'La Plata', instrumento:'[]' })), ['nombre', 'foto', 'bio', 'ubicacion', 'disciplina']);
  assert.deepEqual(missingBasics(profile({ foto_url:'http://example.com/photo', bio:'x' })), []);
  assert.deepEqual(missingBasics(profile({ ciudad:null })), ['ubicacion']);
  for (const foto_url of [null, '', 'data:image/png;base64,abc', '/relative.jpg', 'not a URL']) {
    assert.deepEqual(missingBasics(profile({ foto_url })), ['foto']);
  }
});

test('all ten disciplines accept canonical detail fields and supported legacy IDs', () => {
  assert.deepEqual(missingBasics(profile()), []);
  for (const [rubro, keys] of Object.entries(fieldSets)) {
    for (const key of keys) {
      for (const value of [['Opción'], 'Opción', '["Opción"]']) {
        const fields = {[key]:value};
        for (const campos_especificos of [fields, JSON.stringify(fields)]) {
          assert.deepEqual(missingBasics(profile({ rubro, instrumento:null, campos_especificos })), [], `${rubro}: ${key}`);
        }
      }
    }
  }
});

test('canonical empty values override stale legacy detail, and invalid options remain incomplete', () => {
  assert.deepEqual(missingBasics(profile({ rubro:'actuacion', campos_especificos:{rol:[], 'chips-rol-act':'Actor'} })), ['disciplina']);
  for (const instrumento of [null, '', ' ', '[]', '{}', 'null', 'undefined', 'false', 'true', '[null]', [''], ['Guitarra', 5], ', ,', '{invalid']) {
    assert.deepEqual(missingBasics(profile({ instrumento })), ['disciplina'], JSON.stringify(instrumento));
  }
  for (const campos_especificos of [null, '[]', '{broken', {constructor:'unsafe'}, 7]) {
    assert.deepEqual(missingBasics(profile({ rubro:'danza', campos_especificos })), ['disciplina']);
  }
  assert.deepEqual(missingBasics(profile({ instrumento:'"Guitarra"' })), []);
});

test('structured multidiscipline uses principal details rather than the first selection or stale mirror', () => {
  const disciplinas = { version:1, selected:['musica', 'danza'], details:{ musica:{instrumento:'Guitarra'}, danza:{campos_especificos:{disciplina:[]}} } };
  assert.deepEqual(missingBasics(profile({ rubro:'danza', instrumento:'Guitarra', campos_especificos:{disciplina:['Tango']}, disciplinas })), ['disciplina']);
  disciplinas.details.danza.campos_especificos.disciplina = ['Tango'];
  assert.deepEqual(missingBasics(profile({ rubro:'danza', campos_especificos:null, disciplinas })), []);
  disciplinas.details.musica.instrumento = null;
  assert.deepEqual(missingBasics(profile({ rubro:'musica', instrumento:'stale', disciplinas })), ['disciplina']);
});

test('invalid structured disciplines do not silently fall back to a stale complete mirror', () => {
  for (const disciplinas of [{}, 'bad', {version:1, selected:['musica'], details:{}}]) {
    assert.deepEqual(missingBasics(profile({ disciplinas })), ['disciplina']);
  }
  assert.deepEqual(missingBasics(profile({ rubro:'unknown' })), ['disciplina']);
});

test('visitors and businesses never receive missing-basics reminders', () => {
  for (const tipo_cuenta of ['visitante', 'negocio', null, undefined]) {
    const user = incomplete({ tipo_cuenta });
    assert.deepEqual(missingBasics(user), []);
    assert.deepEqual(planEngagement(user, {}, at(3)), []);
  }
  for (const invalid of [null, undefined, [], 'not a profile']) assert.deepEqual(missingBasics(invalid), []);
});

test('48h candidate is due inclusively and expires at day six, anchored to creation', () => {
  const user = incomplete({ created_at:at(1) });
  assert.deepEqual(planEngagement(user, {}, at(2.999)), []);
  const [due] = planEngagement(user, {}, at(3));
  assert.deepEqual(due, { tipo:'perfil_incompleto', etapa:'48h', eventKey:'perfil:42:48h:v1', dueAtISO:at(3), expiresAtISO:at(7), priority:30 });
  assert.deepEqual(planEngagement(user, {}, at(6.999)), [due]);
  assert.deepEqual(planEngagement(user, {}, at(7)), []);
  assert.deepEqual(planEngagement(user, {}, at(7.5)), []);
});

test('seven-day reminder has its own stable deduplication key and expires at day fourteen', () => {
  const user = incomplete();
  assert.deepEqual(planEngagement(user, {}, at(6.99)), []);
  const [due] = planEngagement(user, {}, at(7));
  assert.equal(due.etapa, '7d');
  assert.equal(due.eventKey, 'perfil:42:7d:v1');
  assert.equal(due.dueAtISO, at(7));
  assert.equal(due.expiresAtISO, at(14));
  assert.deepEqual(planEngagement(user, {}, new Date(at(9))), [due]);
  assert.deepEqual(planEngagement(user, {}, activated + 13.99 * DAY), [due]);
  assert.deepEqual(planEngagement(user, {}, at(14)), []);
});

test('new profiles may get onboarding with default preferences; completed or opted-out profiles get none', () => {
  const user = incomplete();
  assert.equal(planEngagement(user, {}, at(2)).length, 1);
  assert.equal(planEngagement(user, {marketing_opt_in:false, onboarding_disabled:false}, at(2)).length, 1);
  assert.deepEqual(planEngagement(user, {onboarding_disabled:true, marketing_opt_in:true}, at(2)), []);
  assert.deepEqual(planEngagement(profile(), {}, at(2)), []);
  assert.deepEqual(planEngagement(user, {}, at(15)), []);
});

test('historical profiles require explicit marketing consent and an age greater than fourteen days', () => {
  const user = incomplete({created_at:at(-20)});
  for (const prefs of [{}, {marketing_opt_in:false}, {marketing_opt_in:'true'}, {marketing_opt_in:1}, {marketing_opt_in:true, onboarding_disabled:true}]) {
    assert.deepEqual(planEngagement(user, prefs, at(0)), []);
  }
  const [due] = planEngagement(user, {marketing_opt_in:true}, at(0));
  assert.deepEqual(due, { tipo:'perfil_incompleto', etapa:'reactivacion', eventKey:'perfil:42:reactivacion:v1', dueAtISO:at(0), expiresAtISO:at(90), priority:45 });
  assert.deepEqual(planEngagement(user, {marketing_opt_in:true}, at(20.999)), [due]);
  assert.equal(planEngagement(user, {marketing_opt_in:true}, at(30))[0].etapa, 'seguimiento');
  assert.equal(planEngagement(user, {marketing_opt_in:true}, at(90))[0].etapa, 'seguimiento');
  assert.deepEqual(planEngagement(incomplete({created_at:at(-14)}), {marketing_opt_in:true}, at(0)), []);
  assert.equal(planEngagement(incomplete({created_at:at(-14)}), {marketing_opt_in:true}, at(0.01)).length, 1);
});

test('current accounts get one recurring fortnight from day twenty-one with no month or age cutoff', () => {
  const user = incomplete();
  assert.deepEqual(planEngagement(user, {}, at(20.999)), []);
  const [first] = planEngagement(user, {}, at(21));
  assert.deepEqual(first, { tipo:'perfil_incompleto', etapa:'seguimiento', eventKey:'perfil:42:seguimiento:0:v2', dueAtISO:at(21), expiresAtISO:at(49), priority:40 });
  assert.deepEqual(planEngagement(user, {}, at(34.999)), [first]);
  assert.deepEqual(planEngagement(user, {}, at(35)), [{ ...first, eventKey:'perfil:42:seguimiento:1:v2', dueAtISO:at(35), expiresAtISO:at(63) }]);
  for (const day of [51, 100, 365, 1000]) {
    const plans = planEngagement(user, {}, at(day));
    assert.equal(plans.length, 1, day);
    assert.equal(plans[0].etapa, 'seguimiento');
    assert.equal(plans[0].eventKey, `perfil:42:seguimiento:${Math.floor((day - 21) / 14)}:v2`);
    assert(Date.parse(plans[0].dueAtISO) <= Date.parse(at(day)));
    assert(Date.parse(plans[0].expiresAtISO) > Date.parse(at(day)));
  }
});

test('recurring planning catches up only the current cycle and keeps completion and opt-out stops', () => {
  const user = incomplete({created_at:at(1)});
  const plans = planEngagement(user, {marketing_opt_in:false}, at(300));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].eventKey, 'perfil:42:seguimiento:19:v2');
  assert.equal(plans[0].dueAtISO, at(288));
  assert.equal(plans[0].expiresAtISO, at(316));
  assert.deepEqual(planEngagement(user, {marketing_opt_in:true,onboarding_disabled:true}, at(300)), []);
  assert.deepEqual(planEngagement(profile(), {marketing_opt_in:true}, at(300)), []);
  assert.deepEqual(planEngagement(incomplete({tipo_cuenta:'visitante'}), {marketing_opt_in:true}, at(300)), []);
});

test('historical recurring follow-up keeps permission gate and never plans initial reactivation beside it', () => {
  const historical = incomplete({created_at:at(-200)});
  for (const prefs of [{}, {marketing_opt_in:false}, {marketing_opt_in:'true'}, {marketing_opt_in:1}]) {
    assert.deepEqual(planEngagement(historical, prefs, at(21)), []);
    assert.deepEqual(planEngagement(historical, prefs, at(400)), []);
  }
  assert.equal(planEngagement(historical, {marketing_opt_in:true}, at(20.99))[0].etapa, 'reactivacion');
  const [first] = planEngagement(historical, {marketing_opt_in:true}, at(21));
  assert.equal(first.etapa, 'seguimiento');
  assert.equal(first.eventKey, 'perfil:42:seguimiento:0:v2');
  assert.equal(first.dueAtISO, at(21));
  assert.equal(planEngagement(historical, {marketing_opt_in:true}, at(400)).length, 1);
  assert.deepEqual(planEngagement(historical, {marketing_opt_in:true,onboarding_disabled:true}, at(400)), []);
});

test('explicit historical profile help enables only the current ongoing cycle independently of marketing', () => {
  const historical = incomplete({created_at:at(-200)});
  const prefs = {marketing_opt_in:false,onboarding_disabled:false,onboarding_consent_version:PROFILE_HELP_CONSENT_VERSION,onboarding_consented_at:at(10)};
  const [followup] = planEngagement(historical, prefs, at(10));
  assert.deepEqual(followup, {tipo:'perfil_incompleto',etapa:'seguimiento',eventKey:'perfil:42:seguimiento:13:v2',dueAtISO:at(3),expiresAtISO:at(31),priority:40});
  assert.equal(planEngagement(historical, {...prefs,onboarding_consented_at:at(12)}, at(12))[0].eventKey, followup.eventKey);
  assert.equal(planEngagement(historical, {...prefs,onboarding_consented_at:at(13)}, at(13))[0].eventKey, followup.eventKey);
  assert.equal(planEngagement(historical, prefs, at(400)).length, 1);
  assert.deepEqual(planEngagement(historical, {...prefs,onboarding_disabled:true}, at(400)), []);
});

test('historical profile-help evidence must be valid and cannot replay the initial onboarding stages', () => {
  const historical = incomplete({created_at:at(-1)});
  const base = {marketing_opt_in:false,onboarding_consent_version:PROFILE_HELP_CONSENT_VERSION,onboarding_consented_at:at(1)};
  assert.deepEqual(planEngagement(historical, base, at(2)), []);
  assert.deepEqual(planEngagement(historical, base, at(7)), []);
  assert.deepEqual(planEngagement(historical, base, at(19.999)), []);
  assert.equal(planEngagement(historical, base, at(20))[0].etapa, 'seguimiento');
  for (const prefs of [
    {...base,onboarding_consent_version:'unknown'},
    {...base,onboarding_consent_version:undefined},
    {...base,onboarding_consented_at:undefined},
    {...base,onboarding_consented_at:null},
    {...base,onboarding_consented_at:'invalid'},
    {...base,onboarding_consented_at:at(100)}
  ]) assert.deepEqual(planEngagement(historical, prefs, at(30)), []);
});

test('activation boundary and caller-provided activation avoid replaying historical onboarding', () => {
  const release = {activationDate:at(10)};
  assert.deepEqual(planEngagement(incomplete({created_at:at(9)}), {}, at(12), release), []);
  assert.equal(planEngagement(incomplete({created_at:at(10)}), {}, at(12), release)[0].etapa, '48h');
  assert.deepEqual(planEngagement(incomplete({created_at:at(10)}), {}, at(9), release), []);
  const historical = incomplete({created_at:at(-30)});
  const [due] = planEngagement(historical, {marketing_opt_in:true}, at(11), release);
  assert.equal(due.dueAtISO, at(10));
  assert.equal(due.expiresAtISO, at(100));
});

test('invalid dates, future accounts and unavailable IDs cannot enqueue candidates', () => {
  for (const created_at of [undefined, null, '', 'invalid', at(100)]) assert.deepEqual(planEngagement(incomplete({created_at}), {}, at(3)), []);
  for (const now of [undefined, null, '', 'invalid', new Date('invalid'), Infinity, Number.MAX_VALUE]) assert.deepEqual(planEngagement(incomplete(), {}, now), []);
  for (const id of [null, '', ' ', 'bad\nkey', {}]) assert.deepEqual(planEngagement(incomplete({id}), {}, at(3)), []);
  assert.deepEqual(planEngagement(incomplete(), {}, at(3), {activationDate:'invalid'}), []);
});
