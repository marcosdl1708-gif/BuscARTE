/* Presentación opcional. Sólo lee datos guardados; no autoriza ni modifica nada. */
(function () {
  'use strict';
  if (window.BuscARTEPresentacion) return;
  const roles = {
    musica: [],
    actuacion: ['rol','chips-rol-act','chips-rol-actuacion'],
    audiovisual: ['rol','chips-rol-av'],
    modelaje: ['tipo_trabajo','chips-tipo-modelo'],
    diseno: ['rol','chips-rol-dis','chips-rol-diseno'],
    tatuaje: ['rol','chips-rol-tatu'],
    danza: ['rol','disciplina','chips-rol-dan','chips-rol-danza','chips-disc-dan','chips-disciplina-danza'],
    maquillaje: ['rol','chips-rol-maq'],
    circo: ['especialidad','chips-rol-cir','chips-rol-circo'],
    escritura: ['rol','chips-rol-esc','chips-rol-escritura']
  };
  const specialties = {
    musica: [], actuacion:['tipo_escena','chips-escena','chips-tipo-escena'],
    audiovisual:['especialidad','formato','chips-esp-av','chips-formato-av'],
    modelaje:['tipo_trabajo','chips-tipo-modelo'],
    diseno:['estilo','soporte','chips-estilo-dis','chips-estilo-diseno','chips-soporte-dis'],
    tatuaje:['estilo','chips-estilo-tatu'],
    danza:['disciplina','chips-disc-dan','chips-disciplina-danza'],
    maquillaje:['especialidad','chips-esp-maq'],
    circo:['modalidad','chips-mod-cir','chips-modalidad-circo'],
    escritura:['formato','chips-formato-esc','chips-formato-escritura']
  };
  function hasValue(value, depth = 0) {
    if (depth > 5) return false;
    if (Array.isArray(value)) return value.some(item => hasValue(item,depth+1));
    if (typeof value !== 'string' || !value.trim()) return false;
    const text=value.trim();
    if (/^(null|undefined|true|false)$/i.test(text)) return false;
    if (/^[\[{"]/.test(text)) {
      try { return hasValue(JSON.parse(text),depth+1); } catch (_) { return false; }
    }
    return text.split(',').some(item=>!!item.trim());
  }
  function readCampos(value) {
    try {
      const parsed=typeof value==='string' ? JSON.parse(value || '{}') : value;
      if (parsed==null) return {};
      return typeof parsed==='object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) { return null; }
  }
  function assess(profile, contextRubro) {
    if (!profile || typeof profile!=='object' || (profile.tipo_cuenta && profile.tipo_cuenta!=='artista')) return null;
    const rubro=contextRubro || profile.rubro_principal || profile.rubro;
    if (!Object.prototype.hasOwnProperty.call(roles,rubro)) return null;
    let p=profile;
    if (window.BuscARTEDisciplinas) {
      // A tolerant legacy projection must not turn unreadable new data into
      // a public "initial" label or a suggestion based on invented emptiness.
      if (profile.disciplinas!=null) {
        try { window.BuscARTEDisciplinas.read(profile,true); } catch (_) { return null; }
      }
      p=window.BuscARTEDisciplinas.project(profile,rubro);
      if (!p) return null;
    } else if (profile.disciplinas!=null || rubro!==profile.rubro) return null;
    // Raw corrupt JSON is unknown, not evidence of an empty presentation.
    const rawCampos=profile.disciplinas==null ? readCampos(profile.campos_especificos) : {};
    const campos=readCampos(p.campos_especificos);
    const readable=campos!==null && rawCampos!==null;
    const selected=keys=>readable && keys.some(key=>hasValue(campos[key]));
    const role=rubro==='musica' ? hasValue(p.instrumento) : selected(roles[rubro]);
    const extra=rubro==='musica' ? hasValue(p.generos) || hasValue(p.referentes) : selected(specialties[rubro]);
    const professional=role || extra ? true : readable ? false : null;
    const bio=typeof p.bio==='string' && !!p.bio.trim();
    let photo=false;
    try { photo=typeof p.foto_url==='string' && ['http:','https:'].includes(new URL(p.foto_url).protocol); } catch (_) {}
    const missing=[];
    if (!role && readable) missing.push({key:'disciplina',action:rubro==='musica'?'Elegí instrumento, voz o rol':'Contá qué hacés',target:'completar'});
    if (!bio) missing.push({key:'bio',action:'Sumá tu presentación',target:'completar'});
    if (!photo) missing.push({key:'foto',action:'Agregá una imagen',target:'completar'});
    return {initial:!bio && professional===false,professional,bio,photo,missing};
  }

  let mounts=[], generation=0, loadedKey='', failedKey='', pendingKey='', controller=null, saved=null;
  const dismissed=new Set();
  function actor() {
    const session=window.BuscARTESesion, user=session?.user;
    return session?.status==='verified' && user?.tipo_cuenta==='artista' &&
      /^[1-9]\d{0,14}$/.test(String(user.id || '')) ? user : null;
  }
  function hide() {
    for (const mount of mounts) { mount.hidden=true; mount.replaceChildren(); }
  }
  function laterKey(user, result) { return String(user.id)+':'+result.missing.map(item=>item.key).join(','); }
  function isDismissed(user,result) {
    const key=laterKey(user,result);
    if (dismissed.has(key)) return true;
    try { return sessionStorage.getItem('ba_profile_later:'+user.id)===key; } catch (_) { return false; }
  }
  function paint() {
    hide();
    const user=actor();
    if (!user || !saved || String(saved.id)!==String(user.id) || saved.tipo_cuenta!=='artista') return;
    const result=assess(saved);
    if (!result || !result.missing.length || isDismissed(user,result)) return;
    for (const mount of mounts) {
      const copy=document.createElement('div'); copy.className='ba-profile-nudge-copy';
      const title=document.createElement('h2'); title.textContent='Tu perfil, un poco más vos';
      const text=document.createElement('p');
      text.textContent=result.missing[0].key==='disciplina'
        ? 'Contá qué hacés para que otras personas sepan en qué proyectos pueden contar con vos.'
        : result.missing[0].key==='bio'
          ? 'Unas líneas sobre vos ayudan a presentarte antes de conversar.'
          : 'Si querés, sumá una foto o una imagen que te represente.';
      const optional=document.createElement('small'); optional.textContent='Es opcional. Podés seguir usando buscARTE como siempre.';
      copy.append(title,text,optional);
      const actions=document.createElement('div'); actions.className='ba-profile-nudge-actions';
      const link=document.createElement('a'); link.href='buscARTE_perfil.html#completar'; link.textContent=result.missing[0].action+' →';
      const later=document.createElement('button'); later.type='button'; later.textContent='Ahora no';
      later.addEventListener('click',()=>{
        const current=actor();
        if (!current || String(current.id)!==String(user.id)) { hide(); return; }
        const key=laterKey(user,result); dismissed.add(key);
        try { sessionStorage.setItem('ba_profile_later:'+user.id,key); } catch (_) {}
        hide();
      });
      actions.append(link,later); mount.append(copy,actions); mount.hidden=false;
    }
  }
  async function refresh() {
    if (!mounts.length) return;
    const user=actor();
    if (!user) {
      generation++; controller?.abort(); pendingKey=''; loadedKey=''; failedKey=''; saved=null; hide(); return;
    }
    const key=String(user.id)+':'+String(user.perfil_revision ?? 0)+':'+user.rubro;
    if (key===loadedKey) { paint(); return; }
    if (key===pendingKey || key===failedKey) return;
    generation++; const version=generation, uid=String(user.id);
    controller?.abort(); controller=new AbortController();
    const requestController=controller;
    pendingKey=key; saved=null; hide();
    const timeout=setTimeout(()=>requestController.abort(),8000);
    try {
      const fields='id,tipo_cuenta,rubro,instrumento,generos,referentes,bio,foto_url,campos_especificos,disciplinas,perfil_revision';
      const path='/rest/v1/perfiles?id=eq.'+encodeURIComponent(uid)+'&select='+fields+'&limit=1';
      const response=await fetch('/.netlify/functions/datos?path='+encodeURIComponent(path),{
        method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:requestController.signal
      });
      if (!response.ok) throw new Error('Profile presentation unavailable');
      const rows=await response.json();
      const current=actor();
      if (version!==generation || !current || String(current.id)!==uid) return;
      if (!Array.isArray(rows) || rows.length!==1 || String(rows[0]?.id)!==uid || rows[0].tipo_cuenta!=='artista' ||
          !Object.prototype.hasOwnProperty.call(roles,rows[0].rubro)) throw new Error('Profile presentation not confirmed');
      saved=rows[0]; loadedKey=key; failedKey=''; paint();
    } catch (_) {
      if (version===generation) { failedKey=key; saved=null; hide(); }
    } finally {
      clearTimeout(timeout);
      if (version===generation) pendingKey='';
    }
  }
  window.BuscARTEPresentacion=Object.freeze({assess,refresh});
  function init() {
    mounts=[...document.querySelectorAll('[data-profile-nudge]')];
    if (!mounts.length) return;
    hide();
    window.addEventListener('buscarte:sessionchange',refresh);
    window.addEventListener('pageshow',refresh);
    Promise.resolve(window.BuscARTESesion?.ready).then(refresh).catch(hide);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
