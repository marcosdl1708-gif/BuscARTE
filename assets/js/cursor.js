/* The OS/browser renders the circle. JS only updates its discipline color. */
(function () {
  'use strict';
  const html=document.documentElement;
  // Independent stylesheet failure must not expose legacy hidden pointers.
  const native=document.createElement('style');native.id='ba-cursor-native-fallback';
  native.textContent='html body{cursor:auto!important}html body *{cursor:inherit!important}'+
    'html body :is(a[href],button,summary,label[for],select,[role="button"],[role="link"],[onclick],.nav-avatar-wrap,.conv-item,.anuncio){cursor:pointer!important}'+
    'html body :is(input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]){cursor:text!important}'+
    'html body :is(input[type="button"],input[type="submit"],input[type="reset"],input[type="checkbox"],input[type="radio"],input[type="range"],input[type="color"],input[type="file"],input[type="image"]){cursor:pointer!important}'+
    'html body :is([disabled],[aria-disabled="true"],fieldset[disabled] input,fieldset[disabled] button,fieldset[disabled] select,fieldset[disabled] textarea){cursor:not-allowed!important}'+
    'html body [draggable="true"]{cursor:grab!important}html body [aria-busy="true"]{cursor:progress!important}';
  // Precede the real sheet so its enhancement wins; native remains if it fails.
  const sheet=document.querySelector('link[href="/assets/css/cursor.css"]');
  if(sheet)sheet.before(native);else (document.head||html).append(native);
  let current='';
  function color() {
    const value=getComputedStyle(html).getPropertyValue('--neon').trim();
    const next=/^#[0-9a-f]{6}$/i.test(value)?value:'#d4f53c';
    if(next===current)return;current=next;
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="none" stroke="#0a0f09" stroke-width="3"/><circle cx="16" cy="16" r="14" fill="none" stroke="'+next+'" stroke-width="1.5"/><circle cx="16" cy="16" r="2.2" fill="'+next+'" stroke="#0a0f09" stroke-width="1"/></svg>';
    html.style.setProperty('--ba-circle-cursor','url("data:image/svg+xml,'+encodeURIComponent(svg)+'")');
  }
  color();
  // Only discipline/context style changes; never pointer events or moving DOM.
  new MutationObserver(color).observe(html,{attributes:true,attributeFilter:['style']});
})();
