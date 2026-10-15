/* Consentimiento explícito. No reenvía la acción que abrió este diálogo. */
(function () {
  'use strict';
  if (window.BuscARTECondiciones) return;
  const version = '2026-10-15';
  const endpoint = '/.netlify/functions/condiciones';
  let dialog, body, title, context = null, operation = 0, previousFocus;
  const identity = () => window.BuscARTESesion?.status === 'verified' ? String(window.BuscARTESesion.user?.id || '') : '';
  function current(snapshot) { return context === snapshot && dialog.open && snapshot.user === identity(); }
  async function api(method, data) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch(endpoint,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
        ...(method === 'POST' ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {})});
      let result; try { result=await response.json(); } catch (_) {}
      if (!response.ok) { const error=new Error('Terms request failed');error.status=response.status;throw error; }
      if (!result || result.version !== version || typeof result.accepted !== 'boolean') throw new Error('Unconfirmed terms state');
      return result;
    } finally {clearTimeout(timer);}
  }
  function close() { operation++; context=null; if (dialog?.open) dialog.close(); }
  function create() {
    if (dialog) return;
    dialog=document.createElement('dialog');dialog.id='ba-terms-dialog';dialog.className='ba-terms-dialog';
    dialog.setAttribute('aria-labelledby','ba-terms-title');dialog.setAttribute('aria-describedby','ba-terms-description');
    dialog.innerHTML='<div class="ba-terms-content"><h2 id="ba-terms-title">Antes de publicar contenido</h2><p id="ba-terms-description">Necesitamos tu aceptación de los Términos de uso. Tu borrador se conserva. Este diálogo no envía ni guarda la acción que estabas realizando.</p><div class="ba-terms-body"></div></div>';
    document.body.append(dialog);body=dialog.querySelector('.ba-terms-body');title=dialog.querySelector('h2');
    dialog.addEventListener('cancel',()=>{operation++;context=null;});
    dialog.addEventListener('close',()=>{if(dialog.open)return;context=null;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});});
  }
  function buttons() {body.querySelectorAll('[data-close]').forEach(button=>{button.onclick=close;});}
  function success(already=false) {
    title.textContent=already?'Tus Términos ya están aceptados':'Términos aceptados';
    body.innerHTML='<p class="ba-terms-success" role="status" tabindex="-1"></p><div class="ba-terms-actions"><button type="button" data-close>Volver al formulario</button></div>';
    body.querySelector('p').textContent='Volvé a pulsar Guardar, Publicar o Enviar para continuar. No reenviamos la acción automáticamente.';
    buttons();body.querySelector('p').focus();
  }
  function error(snapshot,message) {
    if (!current(snapshot)) return;
    body.innerHTML='<p class="ba-terms-error" role="alert"></p><div class="ba-terms-actions"><button type="button" data-close>Cancelar</button><button type="button" class="ba-terms-retry">Reintentar verificación</button></div>';
    body.querySelector('p').textContent=message;body.querySelector('.ba-terms-retry').onclick=()=>load(snapshot);buttons();
    if(!snapshot.user){const link=document.createElement('a');link.href='buscARTE_login.html';link.target='_blank';link.rel='noopener';link.textContent='Ingresar en otra pestaña';body.querySelector('p').append(document.createTextNode(' '),link);}
  }
  function form(snapshot) {
    if (!current(snapshot)) return;
    body.innerHTML='<p>Versión vigente: 15/10/2026.</p><p><a href="buscARTE_terminos.html" target="_blank" rel="noopener">Leer los Términos de uso</a> · <a href="buscARTE_privacidad.html" target="_blank" rel="noopener">Política de privacidad</a></p><form><label class="ba-terms-choice" for="ba-terms-accepted"><input type="checkbox" id="ba-terms-accepted" required><span>Leí y acepto los Términos de uso de BuscARTE, versión 15/10/2026.</span></label><p class="ba-terms-help">Esta aceptación no activa correos de marketing. Después vas a tener que volver a pulsar la acción que querías realizar.</p><p class="ba-terms-error" role="alert" hidden></p><div class="ba-terms-actions"><button type="button" data-close>Cancelar</button><button type="submit" class="ba-terms-accept" disabled>Aceptar los Términos</button></div></form>';
    const checkbox=body.querySelector('input'),button=body.querySelector('[type="submit"]'),feedback=body.querySelector('.ba-terms-error');
    checkbox.onchange=()=>{button.disabled=!checkbox.checked||snapshot.busy;};buttons();
    body.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(!current(snapshot)||snapshot.busy||checkbox.checked!==true)return;
      const token=++operation;snapshot.busy=true;checkbox.disabled=button.disabled=true;button.textContent='Confirmando…';feedback.hidden=true;
      try {
        // Confirmar que sigue siendo la misma cuenta antes de registrar su aceptación.
        await window.BuscARTESesion.refresh({reload:false});
        if(!current(snapshot)||token!==operation)return;
        const result=await api('POST',{action:'accept',version,accepted:true});
        if(!current(snapshot)||token!==operation)return;
        if(result.accepted!==true)throw new Error('Terms not persisted');
        success();
      } catch(error) {
        if(!current(snapshot)||token!==operation)return;
        feedback.textContent=error.status===401?'Tu sesión venció. Ingresá de nuevo antes de continuar.':'No pudimos confirmar la aceptación. Tu borrador se conserva; podés reintentar.';
        feedback.hidden=false;
      } finally {
        snapshot.busy=false;
        if(current(snapshot)&&token===operation&&button.isConnected){checkbox.disabled=false;button.disabled=!checkbox.checked;button.textContent='Reintentar aceptación';}
      }
    };
    checkbox.focus();
  }
  async function load(snapshot) {
    if(!current(snapshot))return;
    const token=++operation;body.innerHTML='<p role="status">Consultando los Términos vigentes…</p><div class="ba-terms-actions"><button type="button" data-close>Cancelar</button></div>';buttons();
    try {
      const result=await api('GET');if(!current(snapshot)||token!==operation)return;
      if(result.accepted)success(true);else form(snapshot);
    } catch(failure) {
      if(current(snapshot)&&token===operation)error(snapshot,failure.status===401?'Ingresá a tu cuenta para aceptar los Términos. Tu borrador se conserva.':'No pudimos verificar los Términos vigentes. Reintentá; no enviamos tu contenido.');
    }
  }
  async function open({version:requiredVersion,actor}={}) {
    if(!document.body)await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    if(actor&&actor!==identity())return;
    create();if(dialog.open)return;
    previousFocus=document.activeElement;context={user:identity(),busy:false};title.textContent='Antes de publicar contenido';dialog.showModal();
    if(!context.user){error(context,'Ingresá a tu cuenta antes de continuar.');return;}
    if(requiredVersion&&requiredVersion!==version){error(context,'Se actualizó la versión de los Términos. Abrí nuevamente esta página para ver las condiciones actuales.');return;}
    load(context);
  }
  window.addEventListener('buscarte:sessionchange',()=>{if(context&&context.user!==identity())close();});
  window.BuscARTECondiciones=Object.freeze({open,version});
})();
