(function () {
  'use strict';

  function init() {
    const section = document.getElementById('mail-preferences');
    if (!section) return;
    const marketing = document.getElementById('mail-marketing-opt-in');
    const frequency = document.getElementById('mail-marketing-frequency');
    const onboarding = document.getElementById('mail-onboarding-enabled');
    const save = document.getElementById('mail-preferences-save');
    const retry = document.getElementById('mail-preferences-retry');
    const feedback = document.getElementById('mail-preferences-feedback');
    if (!marketing || !frequency || !onboarding || !save || !retry || !feedback) return;

    const endpoint = '/.netlify/functions/email-preferences';
    let loaded = false;
    let pending = false;
    let helpTouched = false;

    function message(text, state) {
      feedback.textContent = text;
      feedback.dataset.state = state || '';
    }

    function busy(value) {
      pending = value;
      section.setAttribute('aria-busy', String(value));
      marketing.disabled = value || !loaded;
      frequency.disabled = value || !loaded || !marketing.checked;
      onboarding.disabled = value || !loaded;
      save.disabled = value || !loaded;
      retry.disabled = value;
    }

    async function request(options) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(endpoint, {
          ...options,
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal
        });
        if (!response.ok) {
          const error = new Error('Preferences unavailable');
          error.status = response.status;
          throw error;
        }
        return options.method === 'GET' ? await response.json() : null;
      } finally {
        clearTimeout(timeout);
      }
    }

    async function load() {
      if (pending) return;
      busy(true);
      retry.hidden = true;
      message('Cargando tus preferencias…');
      try {
        const session = window.BuscARTESesion;
        if (session) {
          await session.ready;
          if (session.status !== 'verified') {
            const error = new Error('Session unavailable');
            error.status = session.status === 'anonymous' ? 401 : 503;
            throw error;
          }
        }
        const data = await request({ method: 'GET' });
        if (typeof data?.marketing_opt_in !== 'boolean' || typeof data?.onboarding_disabled !== 'boolean') {
          throw new Error('Invalid preferences');
        }
        if (data.marketing_frequency !== undefined && !['monthly', 'fortnightly'].includes(data.marketing_frequency)) {
          throw new Error('Invalid frequency');
        }
        if (data.onboarding_consent_required !== undefined && typeof data.onboarding_consent_required !== 'boolean') {
          throw new Error('Invalid account help preference');
        }
        marketing.checked = data.marketing_opt_in;
        frequency.value = data.marketing_frequency || 'monthly';
        onboarding.checked = !data.onboarding_disabled && data.onboarding_consent_required !== true;
        helpTouched = false;
        loaded = true;
        message('Podés cambiar estas opciones cuando quieras.');
      } catch (error) {
        loaded = false;
        retry.hidden = false;
        message(error.status === 401
          ? 'Tu sesión venció. Volvé a ingresar para ver tus preferencias.'
          : 'No pudimos cargar tus preferencias. Revisá tu conexión y reintentá.', 'error');
      } finally {
        busy(false);
      }
    }

    save.addEventListener('click', async () => {
      if (pending || !loaded) return;
      const preferences = {
        marketing_opt_in: marketing.checked === true,
        marketing_frequency: frequency.value,
        onboarding_disabled: onboarding.checked !== true,
        ...(helpTouched && onboarding.checked === true ? {onboarding_choice:true} : {})
      };
      busy(true);
      message('Guardando tus preferencias…');
      try {
        await request({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
        helpTouched = false;
        message('Tus preferencias de email quedaron guardadas.');
      } catch (error) {
        message(error.status === 401
          ? 'Tu sesión venció. Volvé a ingresar y guardá tus preferencias otra vez.'
          : 'No pudimos confirmar el guardado. Conservamos tu elección; podés volver a intentarlo.', 'error');
      } finally {
        busy(false);
      }
    });

    retry.addEventListener('click', load);
    marketing.addEventListener('change', () => {
      frequency.disabled = pending || !loaded || !marketing.checked;
    });
    onboarding.addEventListener('change', () => { helpTouched = true; });
    for (const input of [marketing, frequency, onboarding]) {
      input.addEventListener('change', () => message('Tenés cambios de email sin guardar. Tocá «Guardar preferencias».'));
    }
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
