/* hCaptcha lifecycle for the three registration paths. No account/API changes. */
(function () {
  'use strict';
  const SITEKEY = 'd314e4d0-234a-4454-bbd2-2bacefee8694';
  const LOAD_TIMEOUT = 15000;
  const widgets = new Map();
  let activeId = null;
  let apiReady = false;
  let apiLoading = false;
  let apiTimer = null;
  let apiAttempt = 0;
  const messages = {
    loading: 'Estamos cargando la verificación…',
    ready: 'Marcá «Soy humano» en el recuadro para continuar. Si no lo ves, reintentá la verificación.',
    verified: 'Verificación lista. Ya podés crear tu cuenta.',
    expired: 'La verificación venció. Volvé a completarla para continuar.',
    error: 'No pudimos cargar la verificación. Revisá tu conexión o si un bloqueador impide cargar hCaptcha y reintentá. Tus datos siguen en este formulario.'
  };

  function recordFor(id) {
    if (widgets.has(id)) return widgets.get(id);
    const box = document.getElementById(id);
    const panel = box && box.closest('.captcha-panel');
    if (!panel) return null;
    const record = { box, panel, id: null, state: 'idle', attempt: 0, timer: null, observer: null, frame: null, frameLoaded: false };
    panel.querySelector('.captcha-retry').addEventListener('click', () => retry(id));
    widgets.set(id, record);
    return record;
  }

  function stopWatching(record) {
    clearTimeout(record.timer);
    record.observer?.disconnect();
    record.timer = null;
    record.observer = null;
  }

  function status(record, state, message = messages[state]) {
    record.state = state;
    record.panel.dataset.state = state;
    record.panel.querySelector('.captcha-status').textContent = message;
    record.panel.querySelector('.captcha-retry').disabled = state === 'loading';
    record.panel.querySelector('.captcha-retry').textContent = state === 'loading'
      ? 'Cargando verificación…' : 'Reintentar verificación';
    record.box.setAttribute('aria-busy', String(state === 'loading'));
  }

  function visible(record) {
    return record && record.box.id === activeId && record.box.closest('.form-step')?.classList.contains('active');
  }

  function failActive() {
    const record = activeId && recordFor(activeId);
    if (visible(record)) status(record, 'error');
  }

  // The SDK's onload callback, not merely window.hcaptcha.render's existence,
  // guarantees setup is finished. Defined before inserting the external script.
  window.buscarteCaptchaLoaded = function () {
    apiReady = !!(window.hcaptcha && typeof window.hcaptcha.render === 'function');
    apiLoading = false;
    clearTimeout(apiTimer);
    if (!apiReady) { failActive(); return; }
    if (activeId) render(recordFor(activeId));
  };

  function loadApi() {
    if (apiReady || apiLoading) return;
    apiLoading = true;
    const attempt = ++apiAttempt;
    document.getElementById('registro-hcaptcha-api')?.remove();
    const script = document.createElement('script');
    script.id = 'registro-hcaptcha-api';
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=buscarteCaptchaLoaded&render=explicit&hl=es';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      if (apiReady || attempt !== apiAttempt) return;
      clearTimeout(apiTimer);
      apiLoading = false;
      failActive();
    };
    apiTimer = setTimeout(() => {
      if (attempt !== apiAttempt) return;
      apiLoading = false;
      if (!apiReady) failActive();
    }, LOAD_TIMEOUT);
    document.head.appendChild(script);
  }

  function watchFrame(record) {
    stopWatching(record);
    const check = () => {
      if (!visible(record)) return;
      const frame = record.box.querySelector('iframe');
      if (frame && frame !== record.frame) {
        record.frame = frame;
        record.frameLoaded = false;
        frame.addEventListener('load', () => {
          if (record.frame !== frame) return;
          record.frameLoaded = true;
          check();
        }, { once: true });
      }
      if (frame && record.frameLoaded && frame.getBoundingClientRect().width > 0 && frame.getBoundingClientRect().height > 0) {
        if (record.state === 'loading') status(record, 'ready');
        stopWatching(record);
      }
    };
    record.observer = new MutationObserver(check);
    record.observer.observe(record.box, { childList: true, subtree: true, attributes: true });
    record.timer = setTimeout(() => {
      stopWatching(record);
      if (visible(record) && record.state === 'loading') status(record, 'error');
    }, LOAD_TIMEOUT);
    check();
  }

  function render(record) {
    if (!visible(record) || !apiReady) return;
    if (record.id !== null) {
      if (record.state === 'loading') watchFrame(record);
      return;
    }
    status(record, 'loading');
    const attempt = ++record.attempt;
    const update = state => {
      if (attempt !== record.attempt) return;
      stopWatching(record);
      status(record, state);
    };
    try {
      record.id = window.hcaptcha.render(record.box.id, {
        sitekey: SITEKEY,
        theme: 'dark',
        hl: 'es',
        // Compact also fits after rotation/resizing, without scaling the challenge.
        size: 'compact',
        callback: token => update(token ? 'verified' : 'ready'),
        'error-callback': () => update('error'),
        'expired-callback': () => update('expired'),
        'chalexpired-callback': () => update('expired')
      });
      if (record.id == null) throw new Error('No widget ID');
      if (record.state === 'loading') watchFrame(record);
    } catch (_) {
      discardWidget(record);
      status(record, 'error');
    }
  }

  function discardWidget(record) {
    stopWatching(record);
    // Ignore callbacks from a widget that has been replaced.
    record.attempt++;
    if (record.id !== null) {
      try { window.hcaptcha.remove(record.id); } catch (_) { /* Invalid/missing widget. */ }
    }
    record.id = null;
    record.frame = null;
    record.frameLoaded = false;
    record.box.replaceChildren();
  }

  function show(id) {
    if (activeId && activeId !== id) stopWatching(recordFor(activeId));
    activeId = id || null;
    if (!activeId) return;
    const record = recordFor(activeId);
    if (!visible(record)) return;
    if (apiReady) render(record);
    else {
      status(record, 'loading');
      loadApi();
    }
  }

  function retry(id) {
    const record = recordFor(id);
    if (!visible(record) || record.state === 'loading') return;
    if (!apiReady || record.id === null) {
      show(id);
      return;
    }
    reset(id);
  }

  function reset(id) {
    const record = recordFor(id);
    if (!record) return;
    stopWatching(record);
    status(record, 'loading');
    if (record.id !== null && apiReady) {
      try {
        window.hcaptcha.reset(record.id);
        if (visible(record)) watchFrame(record);
      } catch (_) {
        discardWidget(record);
        if (visible(record)) render(record);
        else status(record, 'error');
      }
    } else if (visible(record)) show(id);
  }

  function requireResponse(id) {
    const record = recordFor(id);
    if (!visible(record)) return '';
    if (record.state === 'idle') show(id);
    if (apiReady && record.id !== null && ['ready', 'verified'].includes(record.state)) {
      try {
        const token = window.hcaptcha.getResponse(record.id) || '';
        if (token) return token;
        status(record, record.state === 'verified' ? 'expired' : 'ready');
      } catch (_) { status(record, 'error'); }
    }
    // Keep the explanation next to the widget, focusable and readable on mobile.
    record.panel.focus({ preventScroll: true });
    record.panel.scrollIntoView({ block: 'center', behavior: 'auto' });
    return '';
  }

  window.RegistroCaptcha = Object.freeze({ show, requireResponse, reset });
})();
