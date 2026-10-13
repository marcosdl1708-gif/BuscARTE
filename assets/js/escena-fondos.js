/* Painted worlds: presentation only; existing URLs, handlers and data stay untouched. */
(function(){
  'use strict';
  if(document.documentElement.dataset.baDesign!=='a2')return;
  const html=document.documentElement;
  const body=document.body;
  const $=selector=>document.querySelector(selector);
  const palette={musica:'#d4f53c',actuacion:'#ff6b5b',audiovisual:'#5b9fff',modelaje:'#4de8c4',diseno:'#ffaa5b',tatuaje:'#c45bff',danza:'#5bd4ff',maquillaje:'#e8a84a',circo:'#ffdd5b',escritura:'#a0d47b'};
  const route=location.pathname.toLowerCase().replace(/\/$/,'')||'/';
  const aliases={'/':'index.html','/home':'index.html','/inicio':'index.html','/artistas':'buscarte_busqueda.html','/musicos':'buscarte_busqueda.html','/anuncios':'buscarte_anuncios.html'};
  // Preserve historical navigation URLs; normalise only our local decoration lookup.
  const file=aliases[route]||(route.startsWith('/buscarte_')&&!route.endsWith('.html')?route+'.html':route);
  let home=false,page='tools';
  const asset=(key,size)=>`/assets/art/worlds/${key}-${size}.webp`;
  const valid=key=>Object.prototype.hasOwnProperty.call(palette,key);
  const fromColor=()=>{
    const raw=html.style.getPropertyValue('--neon').trim().toLowerCase();
    return Object.keys(palette).find(key=>palette[key]===raw)||null;
  };
  const queryRubro=()=>{const key=new URLSearchParams(location.search).get('rubro');return valid(key)?key:null;};

  function image(key,className,size=640){
    const node=document.createElement('img');
    node.className=className;node.src=asset(key,size);node.alt='';node.setAttribute('aria-hidden','true');
    node.width=size;node.height=size;node.decoding='async';node.loading='lazy';
    if(size===640){node.srcset=`${asset(key,320)} 320w, ${asset(key,640)} 640w`;node.sizes='(max-width:600px) 270px, 380px';}
    return node;
  }
  function flow(section,color){
    if(!section)return;
    section.classList.add('a2-flow-section');
    const trace=document.createElement('span');trace.className='a2-section-flow';trace.setAttribute('aria-hidden','true');
    if(color)trace.style.setProperty('--a2-flow-color',color);
    section.prepend(trace);
  }
  function composeHome(){
    if(!home)return;
    for(const item of document.querySelectorAll('.rubro-item')){
      const key=new URL(item.href,location.origin).searchParams.get('rubro');
      if(!valid(key))continue;
      const emoji=item.querySelector('.ri-emoji');if(emoji)emoji.hidden=true;
      item.prepend(image(key,'a2-rubro-illustration',320));
      item.dataset.a2WorldCard=key;
    }
    for(const card of document.querySelectorAll('.ba-project')){
      const key=new URL(card.href,location.origin).searchParams.get('rubro');
      if(!valid(key))continue;
      const graphic=card.querySelector('.ba-project-graphic');
      graphic.querySelectorAll('strong,svg').forEach(node=>node.remove());
      graphic.append(image(key,'a2-editorial-illustration'));
      card.dataset.a2WorldCard=key;
    }
    flow($('.rubros-section'),'#d2cfaa');flow($('#comunidad'),'#5bd4ff');flow($('.how-section'),'#d4f53c');flow($('.cta-section'),'#d4f53c');
  }

  function context(){
    if(home||page==='chat'||page==='legal'||/login|recuperar|reset|contacto|guardados|mis_anuncios/.test(file))return 'comunidad';
    if(file.includes('generador'))return 'musica';
    if(file.includes('registro')){
      if(!$('#tipo-artista.selected'))return 'comunidad';
      const selected=$('#rubro-grid .rubro-card.selected');
      const match=selected?.getAttribute('onclick')?.match(/seleccionarRubro\('([a-z]+)'/);
      return valid(match?.[1])?match[1]:'comunidad';
    }
    if(file.includes('anuncios.html')){
      if(body.dataset.marketplace==='true')return 'comunidad';
      const key=$('#fp-rubro-global .fchip[data-rubro].on')?.dataset.rubro;
      return valid(key)?key:'comunidad';
    }
    if(page==='profile'){
      if(['loading','unavailable'].includes(body.dataset.profileState))return 'comunidad';
      if($('#perfil-instrumento')?.textContent.trim()==='Usuario de buscARTE')return 'comunidad';
      return fromColor()||'comunidad';
    }
    if(file.includes('anuncio_detalle'))return $('.detail-hero-card')?fromColor()||'comunidad':'comunidad';
    if(page==='search')return fromColor()||queryRubro()||'comunidad';
    if(page==='editor')return fromColor()||'comunidad';
    return 'comunidad';
  }
  function mastheads(){
    const selectors={search:['.search-intro'],ads:file.includes('mis_anuncios')?['.manager-hero']:['.anuncios-intro','.detail-hero-card'],profile:['.profile-hero'],editor:['.page-header'],auth:['.left-panel','.brand-panel'],legal:['.hero-inner'],tools:['.hero-main','.guardados-hero','.hero-inner']};
    for(const selector of selectors[page]||[]){
      const host=$(selector);
      if(!host||host.dataset.a2Masthead)continue;
      if(getComputedStyle(host).position==='static')host.classList.add('a2-masthead-static');
      host.dataset.a2Masthead='true';
      const decoration=document.createElement('span');decoration.className='a2-masthead-art';decoration.setAttribute('aria-hidden','true');host.prepend(decoration);
    }
  }
  let current='';
  function update(){
    const key=context();
    if(key!==current){
      current=key;body.dataset.a2World=key;
      body.style.setProperty('--a2-world-color',palette[key]||'#c4c8bb');
      body.style.setProperty('--a2-world-art',valid(key)?`url('${asset(key,640)}')`:'none');
      body.style.setProperty('--a2-world-detail',valid(key)?`url('${asset(key,320)}')`:'none');
      body.style.setProperty('--a2-gesture-art',`url('${asset('gestures',640)}')`);
    }
    mastheads();
  }
  let pending=false;
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;update();});}
  function init(){
    // Home is composed by escena.js before this callback.
    home=body.classList.contains('ba-home');
    page=home?'home':file.includes('busqueda')?'search':file.includes('anuncio')?'ads':file.includes('perfil_publico')?'profile':file.includes('perfil')?'editor':file.includes('mensajes')?'chat':/privacidad|terminos|seguridad_infantil/.test(file)?'legal':/login|recuperar|reset|registro/.test(file)?'auth':'tools';
    body.dataset.a2Page=page;
    // Retire the old repeated splashes. Keep the original multicolour hero once.
    document.querySelectorAll('.a2-surface-paint').forEach(node=>node.remove());
    document.querySelectorAll('.left-bg,.left-bg-text').forEach(node=>node.setAttribute('aria-hidden','true'));
    composeHome();
    if(home&&['#explorar','#comunidad','#como-funciona'].includes(location.hash)){
      const alignAnchor=()=>{
        if(!['#explorar','#comunidad','#como-funciona'].includes(location.hash))return;
        const target=$(location.hash);if(!target)return;
        const previous=html.style.scrollBehavior;html.style.scrollBehavior='auto';
        target.scrollIntoView({block:'start',behavior:'auto'});html.style.scrollBehavior=previous;
      };
      requestAnimationFrame(alignAnchor);
      window.addEventListener('load',()=>requestAnimationFrame(alignAnchor),{once:true});
    }
    if(!home){
      const environment=document.createElement('div');environment.className='a2-page-art';environment.setAttribute('aria-hidden','true');
      environment.innerHTML='<span class="a2-page-motif"></span><span class="a2-page-gesture"></span><span class="a2-page-thread"></span>';
      body.prepend(environment);
    }
    update();
    new MutationObserver(schedule).observe(html,{attributes:true,attributeFilter:['style']});
    new MutationObserver(schedule).observe(body,{attributes:true,attributeFilter:['data-marketplace','data-profile-state']});
    for(const selector of ['#fp-rubro-global','#rubro-grid','#tipo-artista']){
      const root=$(selector);if(root)new MutationObserver(schedule).observe(root,{attributes:true,subtree:true,attributeFilter:['class']});
    }
    const detail=$('#page-wrap');if(file.includes('anuncio_detalle')&&detail)new MutationObserver(schedule).observe(detail,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

