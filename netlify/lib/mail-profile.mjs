import { detailObject, projectProfile, RUBROS } from './disciplinas.mjs';

export const DEFAULT_ENGAGEMENT_ACTIVATION = '2026-10-15T00:00:00.000Z';
export const PROFILE_HELP_CONSENT_VERSION = '2026-10-25-profile-help-v1';
const DAY = 24 * 60 * 60 * 1000;
// Keep these discipline fields aligned with basicosPerfil / SECTION_KEYS in the profile editor.
const DISCIPLINE = {
  actuacion: ['rol', 'chips-rol-act', 'chips-rol-actuacion'],
  audiovisual: ['rol', 'chips-rol-av'],
  modelaje: ['tipo_trabajo', 'chips-tipo-modelo'],
  diseno: ['rol', 'chips-rol-dis', 'chips-rol-diseno'],
  tatuaje: ['rol', 'chips-rol-tatu'],
  danza: ['disciplina', 'chips-disc-dan', 'chips-disciplina-danza'],
  maquillaje: ['rol', 'chips-rol-maq'],
  circo: ['especialidad', 'chips-rol-cir', 'chips-rol-circo'],
  escritura: ['rol', 'chips-rol-esc', 'chips-rol-escritura']
};
const hasText = value => typeof value === 'string' && !!value.trim();
function hasOption(value, depth = 0) {
  if (depth > 5) return false;
  if (Array.isArray(value)) return value.every(item => typeof item === 'string') && value.some(item => hasOption(item, depth + 1));
  if (!hasText(value)) return false;
  const text = value.trim();
  if (/^(null|undefined|true|false)$/i.test(text)) return false;
  if (/^[\[{"]/.test(text)) {
    try { return hasOption(JSON.parse(text), depth + 1); } catch (_) { return false; }
  }
  return text.split(',').some(item => !!item.trim());
}
function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : NaN;
  if (typeof value === 'number') return Number.isFinite(new Date(value).getTime()) ? value : NaN;
  return typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
}

/** The same five saved basics shown by the editor, using the principal discipline. */
export function missingBasics(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || profile.tipo_cuenta !== 'artista') return [];
  let projected = { ...profile };
  try { projected = projectProfile(profile, profile.rubro); }
  catch (_) {
    // Broken structured disciplines cannot be replaced by stale top-level mirrors.
    // Legacy rows still use their original fields, just as the legacy editor does.
    if (profile.disciplinas != null) projected = { ...projected, instrumento:null, campos_especificos:null };
  }
  let fields = {};
  try { fields = detailObject(projected.campos_especificos) || {}; } catch (_) {}
  let discipline = false;
  if (projected.rubro === 'musica') discipline = hasOption(projected.instrumento);
  else if (Object.hasOwn(DISCIPLINE, projected.rubro)) {
    const [canonical, ...aliases] = DISCIPLINE[projected.rubro];
    const key = Object.hasOwn(fields, canonical) ? canonical : aliases.find(alias => Object.hasOwn(fields, alias));
    discipline = key !== undefined && hasOption(fields[key]);
  }
  let photo = false;
  try { photo = hasText(projected.foto_url) && ['http:', 'https:'].includes(new URL(projected.foto_url).protocol); } catch (_) {}
  const checks = [
    ['nombre', hasText(projected.nombre)],
    ['foto', photo],
    ['bio', hasText(projected.bio)],
    ['ubicacion', hasText(projected.provincia) && hasText(projected.ciudad)],
    ['disciplina', RUBROS.has(projected.rubro) && discipline]
  ];
  return checks.filter(([, done]) => !done).map(([key]) => key);
}

/**
 * Return due, unexpired candidates. Persistence deduplicates eventKey across runs.
 * Times are UTC instants; onboarding is anchored to account creation, not cron time.
 * opts.activationDate is frozen to the real release activation date by the caller.
 */
export function planEngagement(profile, prefs = {}, now, opts = {}) {
  if (!profile || typeof profile !== 'object' || !missingBasics(profile).length || prefs?.onboarding_disabled === true) return [];
  const current = timestamp(now);
  const created = timestamp(profile.created_at);
  const activation = timestamp(opts?.activationDate ?? DEFAULT_ENGAGEMENT_ACTIVATION);
  const id = typeof profile.id === 'number' || typeof profile.id === 'string' ? String(profile.id).trim() : '';
  if (!id || id.length > 100 || /[\u0000-\u0020]/.test(id) || ![current, created, activation].every(Number.isFinite) || current < activation || created > current) return [];
  const candidates = [];
  function candidate(etapa, due, expires, priority, eventKey = `perfil:${id}:${etapa}:v1`) {
    if (current < due || current >= expires || !Number.isFinite(new Date(due).getTime()) || !Number.isFinite(new Date(expires).getTime())) return;
    candidates.push({
      tipo:'perfil_incompleto', etapa,
      eventKey,
      dueAtISO:new Date(due).toISOString(),
      expiresAtISO:new Date(expires).toISOString(),
      priority
    });
  }
  const currentAccount = created >= activation;
  const helpConsentedAt = timestamp(prefs?.onboarding_consented_at);
  const explicitHelp = prefs?.onboarding_consent_version === PROFILE_HELP_CONSENT_VERSION
    && Number.isFinite(helpConsentedAt) && helpConsentedAt <= current;
  const mayFollowUp = currentAccount || explicitHelp || prefs?.marketing_opt_in === true;
  // Historical accounts need an explicit applicable choice. For marketing-only
  // permission, activation gives the existing one-off reactivation its initial
  // window; a new stage never silently enrolls older, unknown preferences.
  // A historical account that explicitly requests profile help gets the current
  // cycle immediately once old enough. Its anchor stays the account's age, not
  // the consent timestamp: toggling the choice cannot create duplicate cycles.
  const recurringStart = Math.max(created + 21 * DAY, currentAccount || explicitHelp ? created : activation + 21 * DAY);
  if (currentAccount) {
    candidate('48h', created + 2 * DAY, created + 6 * DAY, 30);
    candidate('7d', created + 7 * DAY, created + 14 * DAY, 35);
  } else if (prefs?.marketing_opt_in === true && current - created > 14 * DAY && current < recurringStart) {
    candidate('reactivacion', activation, activation + 90 * DAY, 45);
  }
  if (mayFollowUp && current >= recurringStart) {
    // Only today's cycle is produced. Delayed workers may finish a queued cycle,
    // but planning after an outage never replays all the skipped fortnights.
    const cycle = Math.floor((current - recurringStart) / (14 * DAY));
    const due = recurringStart + cycle * 14 * DAY;
    candidate('seguimiento', due, due + 28 * DAY, 40, `perfil:${id}:seguimiento:${cycle}:v2`);
  }
  return candidates;
}
