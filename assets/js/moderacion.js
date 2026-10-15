/* Moderación de mensajes. El servidor decide identidad, bloqueos y persistencia. */
(function () {
  'use strict';
  if (window.BuscARTEModeracion) return;
  const endpoint = '/.netlify/functions/moderacion';
  const signalKey = 'ba_moderacion_revision';
  const reasons = [['abuso','Abuso o acoso'],['spam','Spam o publicidad no solicitada'],
    ['suplantacion','Suplantación de identidad'],['contenido','Contenido inapropiado'],
    ['seguridad_infantil','Explotación, abuso o riesgo infantil'],['otro','Otro motivo']];
  const validId = value => (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))) && /^[1-9]\d{0,14}$/.test(String(value)) ? String(value) : '';
  const identity = () => window.BuscARTESesion?.status === 'verified' ? validId(window.BuscARTESesion.user?.id) : '';
  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  async function request(method, body) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(endpoint + (method === 'GET' ? '?perfil_id=' + encodeURIComponent(body.perfil_id) : ''), {
        method, credentials:'same-origin', cache:'no-store', redirect:'error', signal:abort.signal,
        ...(method === 'POST' ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})
      });
      let data; try { data = await response.json(); } catch (_) { data = null; }
      if (!response.ok) { const error = new Error('Moderation request failed'); error.code = data?.code || data?.error || ''; error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); }
  }
  function create({mount, onChange = () => {}, showReport = false}) {
    const host = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!host) throw new Error('Moderation UI needs a mount');
    host.classList.add('ba-mod'); host.hidden = true;
    host.innerHTML = '<p class="ba-mod-status" role="status" tabindex="-1"></p><div class="ba-mod-actions"><button type="button" class="ba-mod-retry" hidden>Reintentar verificación</button><button type="button" class="ba-mod-block" disabled>Bloquear mensajes</button>' + (showReport ? '<button type="button" class="ba-mod-report">Reportar usuario</button>' : '') + '</div>';
    const statusNode = host.querySelector('.ba-mod-status');
    const retry = host.querySelector('.ba-mod-retry'), blockButton = host.querySelector('.ba-mod-block');
    const dialog = document.createElement('dialog'); dialog.className = 'ba-mod-dialog';
    dialog.setAttribute('aria-labelledby','ba-mod-title'); dialog.setAttribute('aria-describedby','ba-mod-description');
    dialog.innerHTML = '<div class="ba-mod-dialog-content"><h2 id="ba-mod-title"></h2><p id="ba-mod-description"></p><div class="ba-mod-dialog-body"></div></div>';
    document.body.append(dialog);
    let target = null, revision = 0, check = 0, checkedUser = '', mutation = false, contextUser = identity();
    let state = {status:'idle', blocked_by_me:false, restricted:true};
    let currentDialog = null, dialogToken = 0, returnFocus = null, draftUser = '';
    const drafts = new Map();
    const active = (version, user) => version === revision && user === identity();
    const title = dialog.querySelector('#ba-mod-title'), description = dialog.querySelector('#ba-mod-description');
    const body = dialog.querySelector('.ba-mod-dialog-body');
    function paint() {
      host.hidden = !target;
      statusNode.textContent = ({checking:'Verificando si se pueden enviar mensajes…',
        allowed:'Podés enviar mensajes.',restricted:'No se pueden enviar mensajes en este contacto. El historial sigue disponible.',
        unavailable:'No pudimos verificar los permisos de mensajes. Reintentá para poder enviar.',
        anonymous:'Ingresá a tu cuenta para contactar o reportar.',idle:''})[state.status];
      if (state.status === 'restricted' && state.blocked_by_me) statusNode.textContent = 'Bloqueaste los mensajes de este contacto en ambos sentidos. El historial sigue disponible.';
      host.dataset.status = state.status;
      retry.hidden = state.status !== 'unavailable';
      blockButton.hidden = state.status === 'anonymous' || state.status === 'idle';
      blockButton.disabled = mutation || !['allowed','restricted'].includes(state.status);
      blockButton.textContent = state.blocked_by_me ? 'Desbloquear mensajes' : 'Bloquear mensajes';
      onChange({...state});
    }
    function update(next) { state = {...state,...next}; paint(); }
    function validState(data) {
      return data && typeof data.blocked_by_me === 'boolean' && typeof data.restricted === 'boolean' && (!data.blocked_by_me || data.restricted);
    }
    function apply(data, user) {
      if (!validState(data)) throw new Error('Invalid moderation state');
      checkedUser = user;
      update({blocked_by_me:data.blocked_by_me, restricted:data.restricted, status:data.restricted?'restricted':'allowed'});
    }
    function failure(error) {
      checkedUser = '';
      if (error?.status === 401 || error?.code === 'SESSION_REQUIRED') update({status:'anonymous',restricted:true,blocked_by_me:false});
      else if (error?.code === 'COMMUNICATION_BLOCKED') update({status:'restricted',restricted:true,blocked_by_me:false});
      else update({status:'unavailable',restricted:true,blocked_by_me:false});
    }
    async function refresh() {
      if (!target) return false;
      const version = revision, number = ++check, id = target.perfilId;
      checkedUser = ''; update({status:'checking',restricted:true});
      await window.BuscARTESesion?.ready;
      const user = identity();
      if (version !== revision || number !== check) return false;
      if (!user) { update({status:'anonymous',restricted:true,blocked_by_me:false}); return false; }
      try {
        const data = await request('GET',{perfil_id:id});
        if (!active(version,user) || number !== check) return false;
        apply(data,user); return !data.restricted;
      } catch (error) {
        if (active(version,user) && number === check) failure(error);
        return false;
      }
    }
    function persistDraft() {
      if (currentDialog?.mode !== 'report' || !currentDialog.draft || currentDialog.draft.busy || currentDialog.draft.success) return;
      const draft = currentDialog.draft;
      draft.reason = body.querySelector('[name="reason"]')?.value || draft.reason;
      draft.detail = body.querySelector('[name="detail"]')?.value ?? draft.detail;
    }
    function close() { persistDraft(); if (dialog.open) dialog.close(); }
    dialog.addEventListener('cancel', persistDraft);
    dialog.addEventListener('close', () => { if (dialog.open) return; currentDialog = null; if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true}); });
    function open(mode, trigger) {
      if (!target) return null;
      persistDraft();
      returnFocus = trigger || document.activeElement;
      const context = {mode, target:{...target}, revision, user:identity(), token:++dialogToken};
      currentDialog = context;
      body.replaceChildren();
      title.textContent = mode === 'report' ? 'Reportar a este usuario' : '¿Bloquear los mensajes de este contacto?';
      description.textContent = mode === 'report'
        ? 'Contanos el motivo. El reporte no bloquea mensajes automáticamente y no copia el historial de la conversación.'
        : 'Impide nuevos mensajes en ambos sentidos. Conserva el historial y no oculta los perfiles públicos. Podés desbloquear desde el chat o el perfil.';
      if (!context.user) {
        body.innerHTML = '<p>Ingresá a tu cuenta para continuar.</p><div class="ba-mod-dialog-actions"><button type="button" data-close>Cerrar</button><a class="ba-mod-login">Ingresar</a></div>';
        body.querySelector('a').href = 'buscARTE_login.html?redirect=' + encodeURIComponent(location.pathname + location.search);
      } else if (mode === 'block') {
        body.innerHTML = '<p class="ba-mod-error" role="alert" hidden></p><div class="ba-mod-dialog-actions"><button type="button" data-close>Cancelar</button><button type="button" class="ba-mod-confirm">Bloquear mensajes</button></div>';
        body.querySelector('.ba-mod-confirm').onclick = () => changeBlock('block',context);
      } else {
        if (draftUser !== context.user) { drafts.clear(); draftUser = context.user; }
        const key = context.user + ':' + target.perfilId + ':' + (target.conversacionId || '');
        let draft = drafts.get(key);
        if (!draft) { draft = {reason:'',detail:'',request_id:uuid(),busy:false,success:'',attempt:null,error:''}; drafts.set(key,draft); }
        context.draft = draft;
        drawReport(context);
      }
      body.querySelectorAll('[data-close]').forEach(button => { button.onclick = close; });
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => { if (currentDialog === context && dialog.open) (body.querySelector('select, button, a') || dialog).focus(); });
      return context;
    }
    function drawReport(context) {
      if (currentDialog !== context) return;
      const draft = context.draft;
      if (draft.success) {
        body.innerHTML = '<p class="ba-mod-success" role="status" tabindex="-1"></p><p>Gracias por avisarnos. Podés conservar este número de referencia.</p><div class="ba-mod-dialog-actions"><button type="button" data-close>Cerrar</button></div>';
        body.querySelector('.ba-mod-success').textContent = 'Reporte recibido. Referencia: ' + draft.success;
        body.querySelector('[data-close]').onclick = close;
        body.querySelector('.ba-mod-success').focus(); return;
      }
      body.innerHTML = '<form class="ba-mod-report-form"><label for="ba-mod-reason">Motivo</label><select id="ba-mod-reason" name="reason" required><option value="">Elegí un motivo</option></select><label for="ba-mod-detail">Detalles (opcional)</label><textarea id="ba-mod-detail" name="detail" maxlength="2000" rows="4" aria-describedby="ba-mod-detail-hint"></textarea><p id="ba-mod-detail-hint">Hasta 2000 caracteres. No incluyas contraseñas ni adjuntes material ilegal.</p><p class="ba-mod-error" role="alert" hidden></p><div class="ba-mod-dialog-actions"><button type="button" data-close>Cancelar</button><button type="submit" class="ba-mod-submit">Enviar reporte</button></div></form>';
      const reason = body.querySelector('select'), detail = body.querySelector('textarea'), submit = body.querySelector('[type="submit"]');
      reasons.forEach(([value,label]) => { const option = document.createElement('option'); option.value=value; option.textContent=label; reason.append(option); });
      reason.value = draft.reason; detail.value = draft.detail;
      reason.disabled = detail.disabled = draft.busy;
      submit.disabled = draft.busy || !draft.reason;
      submit.textContent = draft.busy ? 'Enviando…' : draft.error ? 'Reintentar reporte' : 'Enviar reporte';
      const errorNode = body.querySelector('.ba-mod-error'); errorNode.textContent = draft.error; errorNode.hidden = !draft.error;
      if (draft.loginRequired) { const link=document.createElement('a'); link.textContent='Volver a ingresar'; link.href='buscARTE_login.html?redirect='+encodeURIComponent(location.pathname+location.search); errorNode.append(document.createTextNode(' '),link); }
      const edit = () => { draft.reason=reason.value; draft.detail=detail.value; submit.disabled=!reason.value || draft.busy; };
      reason.onchange = detail.oninput = edit;
      body.querySelector('[data-close]').onclick = close;
      body.querySelector('form').onsubmit = event => { event.preventDefault(); edit(); submitReport(context); };
    }
    async function submitReport(context) {
      const draft = context.draft;
      if (draft.busy || draft.success || !reasons.some(([reason]) => reason === draft.reason) || draft.detail.length > 2000 || !active(context.revision,context.user)) return;
      const payload = {action:'report',perfil_id:context.target.perfilId,
        ...(context.target.conversacionId ? {conversacion_id:context.target.conversacionId} : {}),reason:draft.reason,detail:draft.detail.trim()};
      const content = JSON.stringify(payload);
      if (draft.attempt && draft.attempt !== content) draft.request_id = uuid();
      draft.attempt = content; draft.error=''; draft.busy=true; drawReport(context);
      try {
        const data = await request('POST',{...payload,request_id:draft.request_id});
        if (!active(context.revision,context.user)) return;
        if (data?.ok !== true || !validId(data.id)) throw new Error('Report receipt missing');
        draft.success=validId(data.id); draft.detail='';
      } catch (error) {
        if (active(context.revision,context.user)) {
          draft.loginRequired = error.status === 401;
          if (draft.loginRequired) failure(error);
          draft.error = draft.loginRequired
            ? 'La sesión venció. Ingresá de nuevo y reintentá; conservamos el texto mientras esta página siga abierta.'
            : 'No pudimos confirmar el reporte. Conservamos el motivo y el texto; podés reintentar.';
        }
      } finally {
        draft.busy=false;
        if (currentDialog?.mode === 'report' && currentDialog.draft === draft && active(currentDialog.revision,currentDialog.user)) drawReport(currentDialog);
      }
    }
    async function changeBlock(action, context = null) {
      if (!target || mutation || !identity()) return;
      const version = revision, user = identity(), id = target.perfilId;
      if (context && (!active(context.revision,context.user) || currentDialog !== context)) return;
      mutation = true; check++; checkedUser=''; update({status:'checking',restricted:true});
      const confirm = context && body.querySelector('.ba-mod-confirm'); if (confirm) confirm.disabled=true;
      try {
        const data = await request('POST',{action,perfil_id:id});
        if (!active(version,user)) return;
        apply(data,user);
        try { localStorage.setItem(signalKey,uuid()); } catch (_) { /* focus also revalidates */ }
        if (currentDialog === context) close();
      } catch (error) {
        if (!active(version,user)) return;
        failure(error);
        if (context && currentDialog === context) { const message=body.querySelector('.ba-mod-error'); message.textContent='No pudimos confirmar el bloqueo. Reintentá; el historial está disponible.'; message.hidden=false; }
      } finally {
        if (active(version,user)) { mutation=false; if (confirm?.isConnected) confirm.disabled=false; paint(); }
      }
    }
    retry.onclick = refresh;
    blockButton.onclick = () => state.blocked_by_me ? changeBlock('unblock') : open('block',blockButton);
    const reportButton = host.querySelector('.ba-mod-report');
    if (reportButton) reportButton.onclick = () => open('report',reportButton);
    function setTarget(value) {
      const next = value && validId(value.perfilId) ? {...value,perfilId:validId(value.perfilId),conversacionId:validId(value.conversacionId)} : null;
      if (target?.perfilId === next?.perfilId && target?.conversacionId === next?.conversacionId) { target=next; return; }
      close(); target=next; revision++; check++; mutation=false; checkedUser='';
      state={status:next?'checking':'idle',blocked_by_me:false,restricted:true}; paint();
      if (target) refresh();
    }
    function revalidate() {
      if (contextUser !== identity()) { contextUser=identity(); revision++; check++; mutation=false; checkedUser=''; close(); }
      if (draftUser && draftUser !== identity()) { close(); drafts.clear(); draftUser=''; }
      if (target && !mutation) refresh();
    }
    window.addEventListener('focus',revalidate);
    window.addEventListener('pageshow',event => { if (event.persisted) revalidate(); });
    window.addEventListener('storage',event => { if (!event.key || [signalKey,'ba_user_id','ba_logged'].includes(event.key)) revalidate(); });
    window.addEventListener('buscarte:sessionchange',revalidate);
    document.addEventListener('visibilitychange',() => { if (!document.hidden) revalidate(); });
    return Object.freeze({setTarget, refresh, report:trigger => open('report',trigger),
      canSend:id => !!target && target.perfilId === String(id) && state.status === 'allowed' && checkedUser === identity() && !!checkedUser,
      ensureAllowed:async id => { if (!target || target.perfilId !== String(id)) return false; await refresh(); return !!target && target.perfilId === String(id) && state.status === 'allowed' && checkedUser === identity() && !!checkedUser; },
      focusStatus:() => statusNode.focus({preventScroll:true}),
      handleSendFailure:async (response,id) => {
        if (!target || target.perfilId !== String(id)) return;
        const version=revision,user=identity();
        let data; try { data=await response.clone().json(); } catch (_) {}
        if (!active(version,user) || target?.perfilId !== String(id)) return;
        if ([401,403,503].includes(response.status) && (!data?.code || ['SESSION_REQUIRED','COMMUNICATION_BLOCKED','MODERATION_UNAVAILABLE'].includes(data.code))) failure({status:response.status,code:data?.code});
      },get state() { return {...state}; }});
  }
  window.BuscARTEModeracion = Object.freeze({create});
})();
