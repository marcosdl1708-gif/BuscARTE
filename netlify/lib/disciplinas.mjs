// One account/ID, one principal, independent artistic detail namespaces.
// This module never trusts a cached browser identity or rewrites legacy rows.
export const RUBROS = new Set(['musica','actuacion','audiovisual','modelaje','diseno','tatuaje','danza','maquillaje','circo','escritura']);
export const DETAIL_LIMITS = { instrumento:2000,generos:2000,referentes:4000,disponibilidad:2000,donde_ensaya:1000 };
export const DETAIL_FIELDS = [...Object.keys(DETAIL_LIMITS),'experiencia','campos_especificos'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const safe = (value,depth=0) => {
  if(depth>8)return false;
  if(value===null || typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value==='string')return value.length<=8000 && !value.includes('\0');
  if(Array.isArray(value))return value.length<=100 && value.every(item=>safe(item,depth+1));
  return plain(value) && Object.keys(value).length<=100 && Object.entries(value).every(([key,item])=>key.length<=128 && !key.includes('\0') && !['__proto__','prototype','constructor'].includes(key) && safe(item,depth+1));
};
const invalid = () => { throw new Error('disciplinas'); };
export const revision = value => Number.isSafeInteger(value) && value>=0 ? value : null;
export const canonical = value => JSON.stringify(value,(_key,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export function detailObject(value) {
  if(value===null || value===undefined)return null;
  let parsed=value;
  if(typeof value==='string') { try { parsed=JSON.parse(value); } catch { return invalid(); } }
  if(!plain(parsed) || !safe(parsed) || Buffer.byteLength(JSON.stringify(parsed))>16000)return invalid();
  return parsed;
}
export function normalizeDetails(value) {
  if(!plain(value) || Object.keys(value).some(key=>!DETAIL_FIELDS.includes(key)))return invalid();
  const result={};
  for(const field of DETAIL_FIELDS) {
    const item=value[field]===undefined?null:value[field];
    if(field==='campos_especificos')result[field]=detailObject(item);
    else if(field==='experiencia') { if(item!==null && (!Number.isInteger(item)||item<0||item>100))return invalid();result[field]=item; }
    else { if(item!==null && (typeof item!=='string'||item.length>DETAIL_LIMITS[field]||item.includes('\0')))return invalid();result[field]=item; }
  }
  return result;
}
export function normalizeDisciplines(value,principal) {
  if(!plain(value) || Object.keys(value).some(key=>!['version','selected','details'].includes(key)) || value.version!==1 ||
    !Array.isArray(value.selected) || !value.selected.length || value.selected.length>10 ||
    value.selected.some(key=>!RUBROS.has(key)) || new Set(value.selected).size!==value.selected.length ||
    !value.selected.includes(principal) || !plain(value.details) ||
    Object.keys(value.details).length!==value.selected.length || Object.keys(value.details).some(key=>!value.selected.includes(key)))return invalid();
  const details=Object.fromEntries(value.selected.map(key=>[key,normalizeDetails(value.details[key])]));
  const result={version:1,selected:[...value.selected],details};
  if(Buffer.byteLength(JSON.stringify(result))>65536)return invalid();
  return result;
}
export function disciplinesFor(profile) {
  if(profile.tipo_cuenta!=='artista')return null;
  if(profile.disciplinas!==null && profile.disciplinas!==undefined)return normalizeDisciplines(profile.disciplinas,profile.rubro);
  if(!RUBROS.has(profile.rubro))return invalid();
  return {version:1,selected:[profile.rubro],details:{[profile.rubro]:normalizeDetails(Object.fromEntries(DETAIL_FIELDS.map(key=>[key,profile[key]??null])))}};
}
export function belongsTo(profile,rubro) {
  return profile.tipo_cuenta==='artista' && RUBROS.has(rubro) && disciplinesFor(profile).selected.includes(rubro);
}
export function projectProfile(profile,context) {
  const result={...profile,rubro_principal:profile.rubro};
  if(profile.tipo_cuenta!=='artista' || !context)return result;
  const disciplines=disciplinesFor(profile);
  if(!disciplines.selected.includes(context))return invalid();
  return {...result,...disciplines.details[context],rubro:context};
}
export function prepareProfileChanges(current,changes,expectedRevision) {
  const currentRevision=revision(current.perfil_revision);
  if(currentRevision===null || currentRevision===Number.MAX_SAFE_INTEGER)throw new Error('revision');
  if(expectedRevision!==undefined && (revision(expectedRevision)===null || expectedRevision!==currentRevision))throw new Error('conflict');
  const result={...changes,perfil_revision:currentRevision+1};
  if(Object.hasOwn(changes,'disciplinas')) {
    if(current.tipo_cuenta!=='artista' || expectedRevision===undefined)throw new Error('disciplinas');
    const principal=changes.rubro??current.rubro;
    const disciplines=normalizeDisciplines(changes.disciplinas,principal);
    const mirrors=disciplines.details[principal];
    for(const key of DETAIL_FIELDS)if(Object.hasOwn(changes,key) && canonical(key==='campos_especificos'?detailObject(changes[key]):changes[key])!==canonical(mirrors[key]))throw new Error('disciplinas');
    return {...result,...mirrors,rubro:principal,disciplinas:disciplines};
  }
  if(current.tipo_cuenta==='artista' && current.disciplinas!=null) {
    if(Object.hasOwn(changes,'rubro') && changes.rubro!==current.rubro)throw new Error('conflict');
    const disciplines=disciplinesFor(current);
    const edited=DETAIL_FIELDS.filter(key=>Object.hasOwn(changes,key));
    if(edited.length) {
      const detail=normalizeDetails({...disciplines.details[current.rubro],...Object.fromEntries(edited.map(key=>[key,changes[key]]))});
      result.disciplinas={...disciplines,details:{...disciplines.details,[current.rubro]:detail}};
      Object.assign(result,detail);
    }
  }
  return result;
}
