/* A2: presentación únicamente. No crea sesiones ni autoriza escrituras. */
(function () {
  'use strict';
  const html = document.documentElement;
  if (html.dataset.baDesign !== 'a2') return;
  const $ = selector => document.querySelector(selector);
  const names = {musica:'Música',actuacion:'Actuación & escena',audiovisual:'Audiovisual & fotografía',modelaje:'Modelaje',diseno:'Diseño & artes visuales',tatuaje:'Tatuaje & arte corporal',danza:'Danza',maquillaje:'Maquillaje, vestuario & FX',circo:'Circo & artes escénicas',escritura:'Escritura & guión'};
  const store = (name, key, value) => { try { const storage=window[name];if(value === undefined)return storage.getItem(key); storage.setItem(key,value); } catch (_) {} };

  function home() {
    const hero = $('.hero-content');
    if (!hero || !$('#hero-logueado') || $('.ba-hero-grid')) return;
    document.body.classList.add('ba-home');
    const headline = 'Tu idea.<br><span class="ba-serif">Las personas<br>indicadas.</span>';
    document.querySelectorAll('.home-welcome h1,.home-guest-title').forEach(node => { node.innerHTML = headline; });
    document.querySelectorAll('.home-intro,.home-guest-desc').forEach(node => { node.textContent = 'Encontrá con quién darle forma.'; });
    const eyebrow = $('.home-eyebrow'); if(eyebrow)eyebrow.textContent = 'Un lugar para encontrarse';
    const copy = document.createElement('div'); copy.className = 'ba-hero-copy';
    while(hero.firstChild)copy.append(hero.firstChild);
    const grid = document.createElement('div'); grid.className = 'ba-hero-grid'; grid.append(copy); hero.append(grid);
    const frame = document.createElement('div'); frame.className = 'a2-art-frame';
    frame.innerHTML = '<div class="a2-art-canvas" aria-hidden="true"><img src="/assets/art/paint-splash-a2-960.webp" srcset="/assets/art/paint-splash-a2-576.webp 576w, /assets/art/paint-splash-a2-960.webp 960w" sizes="(max-width:600px) 320px, (max-width:900px) 420px, 540px" width="960" height="960" alt="" decoding="async" fetchpriority="high"><span class="a2-color-echo a2-echo-cyan"></span><span class="a2-color-echo a2-echo-violet"></span></div>';
    grid.append(frame);
    const motion = document.createElement('button'); motion.type = 'button'; motion.className = 'a2-motion-control';
    const reduced = matchMedia('(prefers-reduced-motion:reduce)');
    let playing = !reduced.matches && store('sessionStorage','ba_a2_motion') !== 'paused';
    function reflect() {
      html.dataset.a2Motion = playing ? 'playing' : 'paused';
      motion.setAttribute('aria-pressed',String(playing));
      motion.setAttribute('aria-label',playing ? 'Detener el movimiento del fondo' : 'Activar el movimiento del fondo');
      motion.textContent = playing ? 'Ⅱ Fondo en movimiento' : '▷ Fondo quieto';
    }
    reflect();
    motion.addEventListener('click',() => { playing=!playing;store('sessionStorage','ba_a2_motion',playing?'playing':'paused');reflect(); });
    reduced.addEventListener('change',event => { if(event.matches){playing=false;reflect();} });
    hero.append(motion);
    const explore = $('#explorar');
    if (explore && explore.classList.contains('rubros-section')) {
      explore.querySelector('.section-label').textContent = 'Distintas formas de crear';
      explore.querySelector('.section-title').textContent = '¿Con quién conectás?';
      const intro = explore.querySelector('.home-section-copy'); if(intro)intro.textContent = 'Elegí un mundo. Encontrá a tu gente.';
    }
    const section = $('#comunidad');
    if (section) {
      const label = section.querySelector('.section-label'); if(label)label.textContent = 'Cruces que inspiran';
      const title = section.querySelector('h2'); if(title)title.textContent = 'El arte también es encuentro.';
      const sub = section.querySelector('.section-sub'); if(sub)sub.textContent = 'Sonido, cuerpo e imagen. Mundos que se cruzan.';
      const cards = section.querySelector('.profiles-grid');
      if (cards) {
        cards.className = 'ba-editorial-grid';
        cards.innerHTML = '<a class="ba-project" href="/buscARTE_busqueda.html?rubro=musica" style="--project-color:#d4f53c"><div class="ba-project-graphic"><span>01 / SONIDO</span></div><h3>De la primera charla al ensayo</h3></a><a class="ba-project" href="/buscARTE_busqueda.html?rubro=danza" style="--project-color:#5bd4ff"><div class="ba-project-graphic"><span>02 / MOVIMIENTO</span></div><h3>Movimiento con otras miradas</h3></a><a class="ba-project" href="/buscARTE_busqueda.html?rubro=diseno" style="--project-color:#ffaa5b"><div class="ba-project-graphic"><span>03 / IMAGEN</span></div><h3>Una identidad, muchas manos</h3></a>';
      }
    }
    nextStep(hero);
  }

  function nextStep(hero) {
    // Sólo mostrar sugerencias basadas en los campos realmente leídos, nunca un porcentaje inventado.
    const box = document.createElement('section'); box.className = 'ba-next-step'; box.hidden = true;
    box.setAttribute('aria-label','Un próximo paso para tu presentación'); hero.append(box);
    let activeId = '', revision = 0;
    function identity() {
      if(html.dataset.homeSession !== 'member')return '';
      if(window.BuscARTEConfig?.mode === 'auth')return '';
      const id=store('localStorage','ba_user_id');
      return /^\d{1,18}$/.test(id || '') ? id : '';
    }
    async function refresh() {
      const id = identity(); if(id === activeId)return;
      activeId=id; const version=++revision; box.hidden=true;
      if(!id || store('sessionStorage','ba_a2_next_dismissed_'+id)==='1')return;
      const backend=window.BuscARTEConfig?.supabase;
      if(!backend?.url || !backend.publishableKey)return;
      // El entorno local requiere URL local explícita: no abrir red productiva desde una preview.
      if(window.BuscARTEConfig.isLocalRuntime && !['localhost','127.0.0.1','[::1]'].includes(new URL(backend.url).hostname))return;
      try {
        const url=new URL(backend.url+'/rest/v1/perfiles');
        url.searchParams.set('id','eq.'+id); url.searchParams.set('select','id,nombre,foto_url,bio,ciudad,videos,tipo_cuenta');url.searchParams.set('limit','1');
        const res=await fetch(url,{headers:{apikey:backend.publishableKey,Authorization:'Bearer '+backend.publishableKey},signal:AbortSignal.timeout(8000)});
        if(!res.ok)return;
        const rows=await res.json();
        if(version!==revision || identity()!==id || !Array.isArray(rows) || rows.length!==1 || String(rows[0].id)!==id)return;
        const profile=rows[0]; if(profile.tipo_cuenta==='visitante')return;
        const photo=typeof profile.foto_url==='string' && !!profile.foto_url.trim();
        const bio=typeof profile.bio==='string' && !!profile.bio.trim();
        const works=typeof profile.videos==='string' && !!profile.videos.trim();
        if(photo && bio && works)return;
        const title=!photo?'Dale una cara a lo que hacés.':!bio?'Tu presentación, con tu voz.':'Mostrá algo que hiciste.';
        const explanation=!photo?'Una foto o un trabajo tuyo. Sin apuro.':!bio?'Con dos líneas ya podés presentarte.':'Un trabajo o un link. Vos elegís cuándo.';
        const anchor=!photo?'foto':!bio?'bio-text':'videos';
        box.innerHTML='<div class="ba-next-copy"><div class="ba-kicker">Un próximo paso, si te pinta</div><h2></h2><p></p></div><div class="ba-next-actions"><a></a><button type="button">Más adelante</button></div>';
        box.querySelector('h2').textContent=title;box.querySelector('p').textContent=explanation;
        const link=box.querySelector('a');link.href='/buscARTE_perfil.html#'+anchor;link.textContent=(!photo?'Sumar una imagen':!bio?'Escribir mi presentación':'Sumar un trabajo')+' ↗';
        box.querySelector('button').addEventListener('click',()=>{box.hidden=true;store('sessionStorage','ba_a2_next_dismissed_'+id,'1');});
        box.hidden=false;
      } catch (_) { /* La sugerencia es opcional; un fallo no bloquea Inicio. */ }
    }
    new MutationObserver(refresh).observe(html,{attributes:true,attributeFilter:['data-home-session']});
    window.addEventListener('storage',event=>{if(!event.key || event.key==='ba_user_id')refresh();});
    window.addEventListener('pageshow',()=>{activeId='';refresh();});refresh();
  }

  function search() {
    const intro=$('#search-intro'), switcher=$('#section-switcher');
    if(!intro || !switcher)return;
    const kicker=intro.querySelector('.intro-kicker');if(kicker)kicker.textContent='La escena, cerca tuyo';
    const chooser=document.createElement('details');chooser.className='ba-rubro-chooser';
    const wide=matchMedia('(min-width:901px)');chooser.open=wide.matches;
    chooser.innerHTML='<summary><span>Explorar otra disciplina</span><strong></strong></summary>';
    const update=()=>{const key=new URLSearchParams(location.search).get('rubro') || 'musica';chooser.querySelector('strong').textContent=(names[key] || 'Todas las disciplinas')+' ⌄';};
    update();switcher.before(chooser);chooser.append(switcher);
    new MutationObserver(update).observe(html,{attributes:true,attributeFilter:['style']});
    wide.addEventListener('change',event=>{chooser.open=event.matches;});
  }
  function init() {
    home();search();
    const ai=$('.profile-hero .ai-label');if(ai)ai.textContent='Presentación';
    const saved=$('#save-btn');
    if(saved){const reflect=()=>{saved.dataset.a2Saved=/♥/.test(saved.textContent);};reflect();new MutationObserver(reflect).observe(saved,{childList:true,subtree:true,characterData:true});}
    document.querySelectorAll('.hero-bg,.hero-bg-name').forEach(node=>node.setAttribute('aria-hidden','true'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
