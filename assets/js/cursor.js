/* Progressive, fail-safe painted cursor. No auth, storage, network or data writes. */
(function () {
  'use strict';
  const html = document.documentElement;
  if (document.getElementById('ba-cursor')) return;
  // An independently failed stylesheet must not expose the old cursor:none
  // declarations. This tiny native-only safety net never activates custom UI.
  const native = document.createElement('style');native.id = 'ba-cursor-native-fallback';
  native.textContent = 'html body{cursor:auto!important}html body *{cursor:inherit!important}' +
    'html body :is(a[href],button,summary,label[for],select,[role="button"],[role="link"],[onclick],.nav-avatar-wrap,.conv-item,.anuncio){cursor:pointer!important}' +
    'html body :is(input,textarea,[contenteditable=""],[contenteditable="true"],[role="textbox"]){cursor:text!important}' +
    'html body :is(input[type="button"],input[type="submit"],input[type="reset"],input[type="checkbox"],input[type="radio"],input[type="range"],input[type="color"],input[type="file"],input[type="image"]){cursor:pointer!important}' +
    'html body [draggable="true"]{cursor:grab!important}' +
    'html body :is([disabled],[aria-disabled="true"],fieldset[disabled] input,fieldset[disabled] button,fieldset[disabled] select,fieldset[disabled] textarea){cursor:not-allowed!important}' +
    'html body [aria-busy="true"]{cursor:progress!important}';
  (document.head || html).append(native);
  // CSS :has gates cursor:none on a connected visible node. Older engines keep
  // the fully functional native fallback, without a partly working custom UI.
  if (!window.PointerEvent || !window.matchMedia || !window.CSS?.supports?.('selector(:has(*))')) return;
  const fine = matchMedia('(hover:hover) and (pointer:fine) and (min-width:901px)');
  const reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const forced = matchMedia('(forced-colors:active)');
  let cursor, hit = null, frame = 0, watchdog = 0, point = null;
  let lastPaint = 0;
  const nativeTarget = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"],[disabled],[aria-disabled="true"],[draggable="true"],iframe,dialog,[role="dialog"]';
  const clickable = 'a[href],button,summary,label[for],[role="button"],[role="link"],[onclick],.nav-avatar-wrap,.conv-item,.anuncio';
  function eligible() {
    return fine.matches && !reduce.matches && !forced.matches && document.visibilityState === 'visible';
  }
  function clearHit() {
    if (hit) hit.removeAttribute('data-ba-cursor-hit');
    hit = null; html.removeAttribute('data-ba-cursor-active');
  }
  function stop() {
    // Restore the native pointer before touching the decorative node.
    clearHit(); point = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (watchdog) clearInterval(watchdog);
    watchdog = 0;
    if (cursor) { cursor.hidden = true;cursor.removeAttribute('data-ba-cursor-visible'); }
  }
  function visible(node) {
    if (!node?.isConnected || node.hidden) return false;
    const style = getComputedStyle(node), bounds = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > .5 && bounds.width >= 4 && bounds.height >= 4;
  }
  function modalOpen() {
    return [...document.querySelectorAll('dialog[open],[role="dialog"],.modal-overlay.open,.delete-overlay.open,.delete-modal-overlay.open,.rubro-modal-overlay.open,.report-modal-overlay.open,.lightbox.open,.lightbox-overlay.open')].some(visible);
  }
  function target() {
    if (!point || point.x < 0 || point.y < 0 || point.x >= innerWidth || point.y >= innerHeight) return null;
    const node = document.elementFromPoint(point.x,point.y);
    return node instanceof Element && !node.closest(nativeTarget) && !node.closest('[inert]') ? node : null;
  }
  function draw() {
    frame = 0;
    try {
      if (!eligible() || !cursor?.isConnected || modalOpen()) { stop();return; }
      const node = target();
      if (!node) { stop();return; }
      cursor.style.transform = `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%)`;
      cursor.dataset.baCursorInteractive = node.closest(clickable) ? 'true' : 'false';
      cursor.hidden = false;cursor.dataset.baCursorVisible = 'true';
      // Native cursor stays present unless the replacement really has a rendered
      // box. A disconnected/hidden/blocked stylesheet can never activate hiding.
      if (!visible(cursor)) { stop();return; }
      clearHit();hit = node;hit.setAttribute('data-ba-cursor-hit','true');
      html.dataset.baCursorActive = 'true';lastPaint = performance.now();
      if (!watchdog) watchdog = setInterval(() => {
        try {
          if (!eligible() || !visible(cursor) || !hit?.isConnected || modalOpen() || target() !== hit) stop();
          // A stopped/thrown frame must not leave cursor:none on an old target.
          else if (frame && performance.now() - lastPaint > 250) stop();
        } catch (_) { stop(); }
      },100);
    } catch (_) { stop(); }
  }
  function move(event) {
    // Release native hiding synchronously BEFORE scheduling a new position. If
    // requestAnimationFrame fails/stalls, the mouse remains visible and usable.
    clearHit();
    if (event.pointerType !== 'mouse' || event.buttons || !eligible()) { stop();return; }
    point = { x:event.clientX,y:event.clientY };
    if (!frame) {
      try { frame = requestAnimationFrame(draw); } catch (_) { stop(); }
    }
  }
  function init() {
    if (!document.body || document.getElementById('ba-cursor')) return;
    cursor = document.createElement('div');cursor.id = 'ba-cursor';cursor.hidden = true;
    cursor.setAttribute('aria-hidden','true');
    const dot = document.createElement('span');dot.id = 'ba-cursor-dot';cursor.append(dot);
    document.body.append(cursor);
    new MutationObserver(() => { if (!visible(cursor) && html.hasAttribute('data-ba-cursor-active')) stop(); }).observe(cursor,{attributes:true,attributeFilter:['style','hidden','class','data-ba-cursor-visible']});
    new MutationObserver(() => { if ((!cursor.isConnected || (hit && !hit.isConnected)) && html.hasAttribute('data-ba-cursor-active')) stop(); }).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('pointermove',move,{passive:true});
    document.addEventListener('pointerdown',stop,{passive:true});
    document.addEventListener('pointerout',event=>{if(!event.relatedTarget || event.relatedTarget instanceof HTMLIFrameElement)stop();},{passive:true});
    document.addEventListener('pointerleave',stop,{passive:true});
    document.addEventListener('keydown',stop,{passive:true});
    document.addEventListener('scroll',stop,{passive:true,capture:true});
    document.addEventListener('visibilitychange',stop);
    window.addEventListener('blur',stop);
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',stop);
    window.addEventListener('resize',stop,{passive:true});
    window.addEventListener('error',stop);
    window.addEventListener('unhandledrejection',stop);
    for (const media of [fine,reduce,forced]) {
      if (media.addEventListener) media.addEventListener('change',stop);
      else if (media.addListener) media.addListener(stop);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
