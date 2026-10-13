/* Isolated demo transport. No production requests or credentials are persisted. */
(function (global) {
  'use strict';
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)) throw new Error('Preview is restricted to localhost.');
  document.documentElement.dataset.baPreview = 'true';
  // Variantes sólo locales, por pestaña: se pueden comparar lado a lado.
  const designParam = new URLSearchParams(location.search).get('option');
  const savedDesign = global.sessionStorage.getItem('ba_preview_design');
  const design = ['a','a2','b','c'].includes(designParam) ? designParam : ['a','a2','b','c'].includes(savedDesign) ? savedDesign : 'a';
  document.documentElement.dataset.baOption = design;
  global.sessionStorage.setItem('ba_preview_design',design);
  const origin = location.origin;
  const realFetch = global.fetch.bind(global);
  const realLocal = global.localStorage;
  const realSession = global.sessionStorage;
  const prefix = 'ba_preview_';
  function isolatedStorage(storage) {
    const keyFor = key => String(key).startsWith(prefix) ? String(key) : prefix + String(key);
    const keys = () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(key => key.startsWith(prefix));
    const api = { getItem: key => storage.getItem(keyFor(key)), setItem: (key, value) => storage.setItem(keyFor(key), String(value)), removeItem: key => storage.removeItem(keyFor(key)), clear: () => keys().forEach(key => storage.removeItem(key)), key: i => { const key = keys()[i]; return key ? key.slice(prefix.length) : null; } };
    return new Proxy(api, { get(target, key) { if (key === 'length') return keys().length; if (key === Symbol.toStringTag) return 'Storage'; return key in target ? target[key] : storage.getItem(keyFor(key)); }, set(_target, key, value) { storage.setItem(keyFor(key), String(value)); return true; }, deleteProperty(_target, key) { storage.removeItem(keyFor(key)); return true; } });
  }
  Object.defineProperty(global, 'localStorage', { configurable: true, value: isolatedStorage(realLocal) });
  Object.defineProperty(global, 'sessionStorage', { configurable: true, value: isolatedStorage(realSession) });
  global.__BUSCARTE_RUNTIME_CONFIG__ = { environment: 'preview-demo', mode: 'legacy', networkEnabled: false, supabase: { url: origin, publishableKey: 'sb_publishable_local_preview_only' } };
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const stamp = new Date(Date.now() - 86400000).toISOString();
  const rubros = ['musica', 'actuacion', 'audiovisual', 'modelaje', 'diseno', 'tatuaje', 'danza', 'maquillaje', 'circo', 'escritura'];
  const photo = (initials, color) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#17212c"/><circle cx="345" cy="110" r="190" fill="${color}" opacity=".22"/><path d="M0 425L480 90V480H0Z" fill="${color}" opacity=".24"/><text x="240" y="272" text-anchor="middle" font-size="110" font-family="sans-serif" fill="${color}">${initials}</text><text x="240" y="425" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#e6eaf0">PERFIL DEMO</text></svg>`);
  const common = { tipo_cuenta: 'artista', provincia: 'Ciudad Autónoma de Buenos Aires', ciudad: 'CABA', barrio: 'Palermo', disponibilidad: 'Busco proyecto, Sesiones', donde_ensaya: 'CABA', experiencia: 4, edad: 27, baneado: false, created_at: stamp, celular: '', videos: '', redes: '{}', campos_especificos: {} };
  const specs = [
    [9001, 'Alex Demo', 'musica', 'Guitarra', 'Indie', {}, '#d4f53c', 'Busco conectar con artistas y armar nuevos proyectos. Este perfil es un ejemplo para recorrer la preview.'],
    [9002, 'Mora Demo', 'musica', 'Bajo', 'Jazz, Funk', {}, '#9bb8ff', 'Bajista disponible para sesiones, ensayos y proyectos originales. Datos de demostración.'],
    [9003, 'Nico Demo', 'musica', 'Operador de sonido FOH', 'Rock, Pop', {}, '#ffb46e', 'Sonido en vivo y producción técnica para salas y festivales. Perfil de demostración.'],
    [9004, 'Luz Demo', 'musica', 'Teclado', 'Indie, Pop', {}, '#d99cff', 'Tecladista y compositora. Disponible para proyectos compartidos. Perfil de demostración.'],
    [9010, 'Sol Demo', 'actuacion', '', '', { rol: ['Actor/Actriz'], tipo_escena: ['Drama', 'Comedia'] }, '#ff8f83', 'Actuación en teatro y audiovisual. Me interesan nuevos proyectos y castings. Perfil demo.'],
    [9011, 'Teo Demo', 'audiovisual', '', '', { rol: ['Fotógrafo', 'Videomaker'], especialidad: ['Retrato', 'Videoclip'] }, '#8dbbff', 'Fotografía y video para artistas, retratos y proyectos musicales. Perfil demo.'],
    [9012, 'Emi Demo', 'modelaje', '', '', { tipo_trabajo: ['Editorial', 'Publicidad'], genero: ['No binario'] }, '#70dcc1', 'Modelo para campañas y proyectos editoriales. Información simulada.'],
    [9013, 'Juli Demo', 'diseno', '', '', { rol: ['Ilustrador / Dibujante'], estilo: ['Vectorial', 'Cartoon'], soporte: ['Digital'] }, '#ffb979', 'Ilustración y diseño para proyectos culturales, tapas y afiches. Perfil demo.'],
    [9014, 'Ren Demo', 'tatuaje', '', '', { rol: ['Tatuador'], estilo: ['Fine line', 'Blackwork'], color: ['Blanco y negro'] }, '#d89aff', 'Tatuajes de línea fina y diseños originales. Perfil de ejemplo.'],
    [9015, 'Lola Demo', 'danza', '', '', { rol: ['Bailarín/a', 'Coreógrafo'], disciplina: ['Contemporáneo', 'Urbano / Hip-hop'], nivel: ['Profesional'] }, '#7bcfff', 'Danza contemporánea y creación escénica en equipo. Perfil demo.'],
    [9016, 'Paz Demo', 'maquillaje', '', '', { rol: ['Maquillador artístico'], especialidad: ['Artístico', 'Teatro / Cine'] }, '#edbc6d', 'Maquillaje artístico para teatro, sesiones y videoclips. Perfil demo.'],
    [9017, 'Cris Demo', 'circo', '', '', { especialidad: ['Malabarista', 'Acróbata'], modalidad: ['Festivales', 'Teatro'] }, '#ffdf75', 'Circo y espectáculos para proyectos culturales. Perfil demo.'],
    [9018, 'Fran Demo', 'escritura', '', '', { rol: ['Guionista', 'Letrista'], formato: ['Guion cine / TV', 'Letra de canción'] }, '#b0d788', 'Guiones y letras para colaborar con otros artistas. Perfil demo.']
  ];
  function seed() {
    const perfiles = specs.map(([id, nombre, rubro, instrumento, generos, campos, color, bio]) => ({ ...clone(common), id, nombre, rubro, instrumento, generos, campos_especificos: campos, bio: id === 9001 ? '' : bio, email: id === 9001 ? 'alex@preview.invalid' : `demo${id}@preview.invalid`, referentes: rubro === 'musica' ? 'Soda Stereo, Radiohead' : '', foto_url: id === 9001 ? '' : photo(nombre.split(' ').map(x => x[0]).join(''), color) }));
    const ad = (id, user_id, tipo, titulo, descripcion, extra = {}) => ({ id, user_id, tipo, titulo, descripcion: descripcion + ' · Anuncio de demostración.', rubro: 'musica', rubro_buscado: 'musica', estado: 'activo', oculto: false, ciudad: 'CABA', barrio: 'Palermo', zona: 'Palermo, CABA', created_at: stamp, updated_at: stamp, visitas: 12, instrumentos: 'Guitarra', generos: 'Indie, Rock', foto_url: '', ...extra });
    return { version: 1, nextId: 10000, perfiles, anuncios: [
      ad(9101, 9002, 'busco', 'Buscamos guitarrista para proyecto indie', 'Ensayamos una vez por semana y estamos armando un repertorio propio.'),
      ad(9102, 9001, 'ofrezco', 'Guitarra y voz para nuevos proyectos', 'Me sumo a sesiones, bandas y colaboraciones musicales.'),
      ad(9103, 9004, 'clases', 'Clases de teclado para empezar', 'Clases individuales, repertorio a tu ritmo.', { precio: '12000', nivel: 'Principiante', modalidad: 'Presencial' }),
      ad(9104, 9003, 'jam', 'Jam abierta en Palermo', 'Una tarde para tocar, conocerse y compartir música.', { fecha_evento: new Date(Date.now() + 7 * 86400000).toISOString(), lugar: 'Espacio Demo', precio_entrada: 'Gratis', hora_evento: '19:00' }),
      ad(9105, 9002, 'vende', 'Guitarra eléctrica de estudio', 'Instrumento usado en muy buen estado.', { categoria_producto: 'Guitarra', marca: 'Demo', condicion: 'Usado', precio_num: 180000, precio: '$180.000', foto_url: photo('GT', '#c8f071') }),
      ad(9106, 9003, 'vende', 'Interfaz de audio para grabar', 'Equipo de demostración, con accesorios.', { categoria_producto: 'Equipos de audio', condicion: 'Usado', precio_num: 95000, precio: '$95.000', foto_url: photo('AU', '#80b4fa') }),
      ad(9110, 9010, 'busco', 'Elenco para una obra independiente', 'Buscamos actores y actrices para una obra en desarrollo.', { rubro: 'actuacion', rubro_buscado: 'actuacion', instrumentos: 'Actor/Actriz' }),
      ad(9111, 9011, 'ofrezco', 'Retratos para tu proyecto artístico', 'Fotografía para portfolios y material de difusión.', { rubro: 'audiovisual', instrumentos: 'Fotógrafo' }),
      ad(9112, 9015, 'clases', 'Laboratorio de danza contemporánea', 'Un espacio de exploración corporal y movimiento.', { rubro: 'danza', instrumentos: 'Contemporáneo', precio: '9000', nivel: 'Todos los niveles' })
    ], conversaciones: [{ id: 9201, user1_id: 9001, user2_id: 9002, anuncio_id: 9101, ultimo_mensaje: '¡Hola Alex! ¿Te interesa sumarte al proyecto?', updated_at: now(), created_at: stamp }], mensajes: [{ id: 9301, de_user_id: 9002, para_user_id: 9001, contenido: '¡Hola Alex! ¿Te interesa sumarte al proyecto? Esta conversación es una demo.', created_at: stamp, anuncio_id: 9101 }, { id: 9302, de_user_id: 9001, para_user_id: 9002, contenido: '¡Sí! Me gustaría conocer el proyecto.', created_at: stamp }], perfiles_guardados: [{ id: 9401, user_id: 9001, perfil_id: 9002, created_at: stamp }], reacciones: [{ id: 9501, user_id: 9002, anuncio_id: 9104, tipo: 'asistire', created_at: stamp }], artistas_sugeridos: [{ id: 9601, nombre: 'Soda Stereo', veces: 8 }, { id: 9602, nombre: 'Radiohead', veces: 5 }], mailLog: [], resetRequests: [] };
  }
  let state;
  try { state = JSON.parse(realLocal.getItem(prefix + 'state')); } catch (_) {}
  if (!state || state.version !== 1 || !Array.isArray(state.perfiles)) state = seed();
  function persist() { realLocal.setItem(prefix + 'state', JSON.stringify(state)); }
  function useAccount(id = 9001) {
    const user = state.perfiles.find(row => String(row.id) === String(id));
    if (!user) throw new Error('Cuenta demo inexistente.');
    for (const [key, value] of Object.entries({ ba_logged: '1', ba_user_id: user.id, ba_name: user.nombre, ba_email: user.email, ba_tipo_cuenta: user.tipo_cuenta, ba_rubro: user.rubro, ba_referentes: user.referentes, ba_generos: user.generos })) localStorage.setItem(key, value || '');
    try { const draft = JSON.parse(realLocal.getItem('ba_preview_disciplinas_v1')); if (String(user.id) === '9001' && rubros.includes(draft?.primary)) localStorage.setItem('ba_rubro', draft.primary); } catch (_) {}
    localStorage.setItem('ba_msg_last_seen', stamp);
    global.dispatchEvent(new StorageEvent('storage', { key: 'ba_logged' }));
    global.BuscARTEInicio?.refresh();
  }
  if (!realLocal.getItem(prefix + 'initialized')) { useAccount(); realLocal.setItem(prefix + 'initialized', '1'); }
  function syncPrimary(draft) {
    if (localStorage.getItem('ba_user_id') !== '9001') return;
    if (!draft) { try { draft = JSON.parse(realLocal.getItem('ba_preview_disciplinas_v1')); } catch (_) {} }
    if (rubros.includes(draft?.primary)) localStorage.setItem('ba_rubro', draft.primary);
  }
  syncPrimary();
  global.addEventListener('ba-preview-disciplinas-change', event => syncPrimary(event.detail));
  localStorage.setItem('buscarte_meta_consent_v1', 'denied');
  persist();
  const currentId = () => localStorage.getItem('ba_logged') === '1' ? String(localStorage.getItem('ba_user_id') || '') : '';
  const sameId = (a, b) => String(a) === String(b);
  function localPhoto(value) { try { const url = new URL(value); const key = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/object/'); return state.images?.[key] || value; } catch (_) { return value; } }
  function demoProfile(row, context) {
    row = { ...clone(row), foto_url: localPhoto(row.foto_url) };
    if (!sameId(row.id, 9001)) return row;
    let draft;
    try { draft = JSON.parse(realLocal.getItem('ba_preview_disciplinas_v1')); } catch (_) {}
    if (!draft || !Array.isArray(draft.selected)) draft = { version: 1, primary: row.rubro || 'musica', selected: [...new Set([row.rubro || 'musica', 'musica', 'danza'])], details: { musica: { instrumento: String(row.instrumento || 'Guitarra').split(',').map(value => value.trim()).filter(Boolean), generos: String(row.generos || '').split(',').map(value => value.trim()).filter(Boolean) }, danza: { rol: ['Bailarín/a'], disciplina: ['Contemporáneo'] } } };
    const rubro = context && draft.selected.includes(context) ? context : draft.primary;
    const details = draft.details?.[rubro] || {};
    return { ...clone(row), rubro: rubro || row.rubro, instrumento: rubro === 'musica' ? (details.instrumento || []).join(', ') : '', generos: rubro === 'musica' ? (details.generos || []).join(', ') : '', campos_especificos: rubro === 'musica' ? {} : clone(details), preview_disciplinas: draft.selected, preview_primary: draft.primary };
  }
  function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Buscarte-Demo': 'true', ...headers } }); }
  const fail = (message, status = 400) => json({ error: message, demo: true }, status);
  function splitTerms(text) {
    let depth = 0, start = 0; const terms = [];
    for (let i = 0; i < text.length; i++) { if (text[i] === '(') depth++; if (text[i] === ')') depth--; if (text[i] === ',' && depth === 0) { terms.push(text.slice(start, i)); start = i + 1; } }
    terms.push(text.slice(start)); return terms;
  }
  function testCondition(row, field, raw) {
    let negate = false; if (raw.startsWith('not.')) { negate = true; raw = raw.slice(4); }
    const dot = raw.indexOf('.'), op = raw.slice(0, dot), value = raw.slice(dot + 1), actual = row[field];
    let answer = false;
    if (op === 'eq') answer = String(actual) === value;
    else if (op === 'neq') answer = String(actual) !== value;
    else if (op === 'is') answer = value === 'null' ? actual == null : String(actual) === value;
    else if (op === 'in') answer = splitTerms(value.replace(/^\(|\)$/g, '')).some(part => String(actual) === part.replace(/^"|"$/g, ''));
    else if (op === 'gt') answer = actual > (typeof actual === 'number' ? Number(value) : value);
    else if (op === 'gte') answer = actual >= (typeof actual === 'number' ? Number(value) : value);
    else if (op === 'lt') answer = actual < (typeof actual === 'number' ? Number(value) : value);
    else if (op === 'lte') answer = actual <= (typeof actual === 'number' ? Number(value) : value);
    else if (op === 'ilike' || op === 'like') { const pattern = value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*'); answer = new RegExp('^' + pattern + '$', op === 'ilike' ? 'i' : '').test(String(actual || '')); }
    return negate ? !answer : answer;
  }
  function expression(row, value) {
    if (value.startsWith('and(') || value.startsWith('or(')) { const isAnd = value.startsWith('and('); const children = splitTerms(value.slice(isAnd ? 4 : 3, -1)); return isAnd ? children.every(part => expression(row, part)) : children.some(part => expression(row, part)); }
    const dot = value.indexOf('.'); return testCondition(row, value.slice(0, dot), value.slice(dot + 1));
  }
  function matches(row, params) {
    for (const [key, value] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
      if (key === 'or' || key === 'and') { const terms = splitTerms(value.replace(/^\(|\)$/g, '')); if (!(key === 'or' ? terms.some(term => expression(row, term)) : terms.every(term => expression(row, term)))) return false; }
      else if (!testCondition(row, key, value)) return false;
    }
    return true;
  }
  function selectRows(rows, params, request) {
    let filtered = rows.filter(row => matches(row, params)); const count = filtered.length;
    const orders = (params.get('order') || '').split(',').filter(Boolean);
    filtered.sort((a, b) => { for (const order of orders) { const [field, direction] = order.split('.'); if (a[field] < b[field]) return direction === 'desc' ? 1 : -1; if (a[field] > b[field]) return direction === 'desc' ? -1 : 1; } return 0; });
    const offset = Math.max(0, Number(params.get('offset') || 0));
    filtered = filtered.slice(offset, offset + Math.min(1000, Number(params.get('limit') || 1000)));
    const fields = params.get('select'); if (fields && fields !== '*') filtered = filtered.map(row => Object.fromEntries(fields.split(',').map(field => [field, row[field]])));
    const single = (request.headers.get('Accept') || '').includes('vnd.pgrst.object+json');
    if (single && filtered.length !== 1) return json({ code: 'PGRST116', message: 'Demo: no hay exactamente una fila.' }, 406);
    return json(single ? filtered[0] : filtered, 200, { 'Content-Range': `${offset}-${Math.max(offset, offset + filtered.length - 1)}/${count}` });
  }
  const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
  function safeObject(value, depth = 0) { return depth < 9 && value !== undefined && (value === null || ['string', 'number', 'boolean'].includes(typeof value) || (Array.isArray(value) ? value.length <= 100 && value.every(item => safeObject(item, depth + 1)) : typeof value === 'object' && Object.entries(value).every(([key, item]) => !unsafeKeys.has(key) && safeObject(item, depth + 1)))); }
  const profileLimits = { nombre: 200, bio: 300, instrumento: 2000, generos: 2000, disponibilidad: 2000, donde_ensaya: 1000, videos: 8000, redes: 8000, celular: 80, referentes: 4000, provincia: 200, ciudad: 200, barrio: 200 };
  function validProfileChanges(changes) {
    if (!changes || Array.isArray(changes) || !safeObject(changes) || !Object.keys(changes).length) return false;
    return Object.entries(changes).every(([key, value]) => {
      if (key in profileLimits) return (value === null && ['celular', 'provincia', 'ciudad', 'barrio'].includes(key)) || (typeof value === 'string' && value.length <= profileLimits[key] && (key !== 'nombre' || value.trim()));
      if (key === 'rubro') return rubros.includes(value);
      if (key === 'tipo_cuenta') return ['artista', 'negocio', 'visitante'].includes(value);
      if (key === 'edad') return value === null || Number.isInteger(value) && value >= 15 && value <= 120;
      if (key === 'experiencia') return Number.isInteger(value) && value >= 0 && value <= 100;
      if (key === 'foto_url') return typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('blob:') || value.startsWith(origin + '/') || value.startsWith('https://xiaanchoanxmampegoay.supabase.co/storage/v1/object/public/fotos-perfil/'));
      if (key === 'campos_especificos') { try { return safeObject(typeof value === 'string' ? JSON.parse(value) : value); } catch (_) { return false; } }
      return false;
    });
  }
  async function api(request, url) {
    const method = request.method;
    let input = {};
    if (!['GET', 'HEAD'].includes(method)) { try { input = JSON.parse(await request.clone().text() || '{}'); } catch (_) { return fail('Demo: JSON inválido.'); } if (!safeObject(input)) return fail('Demo: datos inválidos.'); }
    const route = url.pathname;
    if (route === '/.netlify/functions/guardar-perfil') {
      if (method !== 'POST') return fail('Demo: método no permitido.', 405);
      const user = state.perfiles.find(row => row.email.toLowerCase() === String(input.email || '').trim().toLowerCase());
      if (!user || input.password !== 'Demo1234!') return fail('Demo: usá la contraseña Demo1234!.', 401);
      if (!sameId(user.id, input.profileId) || !sameId(user.id, currentId())) return fail('Demo: sólo podés editar la cuenta demo activa.', 403);
      if (input.operation === 'verify' && input.changes && !Object.keys(input.changes).length) return json([{ id: user.id }]);
      if (!validProfileChanges(input.changes) || input.changes.tipo_cuenta && input.changes.tipo_cuenta !== user.tipo_cuenta) return fail('Demo: datos de perfil inválidos.');
      Object.assign(user, input.changes);
      if (sameId(user.id, 9001)) {
        let draft;
        try { draft = JSON.parse(realLocal.getItem('ba_preview_disciplinas_v1')); } catch (_) {}
        // Update only the details actually edited in this form; preserve other disciplines.
        if (draft && Array.isArray(draft.selected)) {
          const active = localStorage.getItem('ba_rubro') || draft.primary;
          draft.details ||= {}; draft.details[active] ||= {};
          if (active === 'musica') {
            for (const key of ['instrumento', 'generos']) if (Object.hasOwn(input.changes, key)) draft.details[active][key] = String(input.changes[key] || '').split(',').map(value => value.trim()).filter(Boolean);
          } else if (Object.hasOwn(input.changes, 'campos_especificos')) {
            const fields = typeof input.changes.campos_especificos === 'string' ? JSON.parse(input.changes.campos_especificos) : input.changes.campos_especificos;
            Object.assign(draft.details[active], fields);
          }
          realLocal.setItem('ba_preview_disciplinas_v1', JSON.stringify(draft));
        }
      }
      persist(); return json([{ id: user.id, campos_especificos: user.campos_especificos, generos: user.generos, foto_url: user.foto_url, rubro: user.rubro }]);
    }
    if (route === '/.netlify/functions/send-email') { state.mailLog.push({ tipo: String(input.tipo || 'contacto'), simulated: true, created_at: now() }); persist(); return json({ demo: true, simulated: true, sent: false, message: 'Simulación local: no se envió ningún correo.' }); }
    if (route === '/.netlify/functions/reset-password') { if (input.accion === 'solicitar') { state.resetRequests.push({ simulated: true, created_at: now() }); persist(); return json({ demo: true, sent: false }); } return fail('La recuperación por correo no está disponible en esta demo. Usá Demo1234!.'); }
    if (route.startsWith('/rest/v1/rpc/')) {
      if (method !== 'POST') return fail('Demo: método no permitido.', 405);
      const rpc = route.split('/').pop();
      if (rpc === 'login_usuario') { const user = state.perfiles.find(row => row.email === String(input.p_email || '').trim().toLowerCase()); return user && input.p_password === 'Demo1234!' ? json([demoProfile(user)]) : json({ error: 'Demo: ingresá alex@preview.invalid y Demo1234!.' }, 401); }
      if (rpc === 'registrar_usuario') {
        if (!String(input.p_nombre || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.p_email || '') || String(input.p_password || '').length < 8 || !['artista', 'negocio', 'visitante'].includes(input.p_tipo_cuenta)) return fail('Demo: revisá los datos del alta.');
        if (input.p_tipo_cuenta === 'artista' && !rubros.includes(input.p_rubro)) return fail('Demo: elegí un rubro válido.');
        const id = state.nextId++;
        // Submitted passwords and real email addresses are never retained.
        const user = { ...clone(common), id, email: `cuenta${id}@preview.invalid`, nombre: String(input.p_nombre).slice(0, 200), rubro: input.p_rubro || '', tipo_cuenta: input.p_tipo_cuenta, foto_url: '' };
        for (const key of ['provincia', 'ciudad', 'barrio', 'instrumento', 'generos', 'disponibilidad', 'referentes', 'bio', 'campos_especificos']) user[key] = input['p_' + key] || (key === 'campos_especificos' ? {} : '');
        state.perfiles.push(user); persist(); return json([user], 201);
      }
      if (rpc === 'vencer_anuncios_viejos') { const expired = state.anuncios.filter(row => row.estado === 'activo' && Date.now() - Date.parse(row.created_at) > 60 * 86400000); expired.forEach(row => { row.estado = 'vencido'; }); persist(); return json({ demo: true, expired: expired.length }); }
      if (rpc === 'gestionar_anuncio' || rpc === 'gestionar_anuncio_v2') { const row = state.anuncios.find(ad => sameId(ad.id, input.p_anuncio_id)); if (!row || !sameId(row.user_id, currentId()) || input.p_user_id && !sameId(input.p_user_id, currentId())) return fail('Demo: anuncio ajeno.', 403); const actions = { pausar: 'pausado', reactivar: 'activo', renovar: 'activo', eliminar: 'eliminado', ocultar: 'eliminado' }; if (!(input.p_accion in actions)) return fail('Demo: acción desconocida.'); row.estado = actions[input.p_accion]; if (row.estado === 'eliminado') row.oculto = true; row.updated_at = now(); persist(); return json([row]); }
      if (rpc === 'eliminar_cuenta') return fail('La eliminación de cuenta está deshabilitada en esta preview. Podés reiniciar los datos demo.', 403);
      return fail('Esta operación no está implementada en la demo local.', 501);
    }
    const tableName = route.match(/^\/rest\/v1\/([A-Za-z_]+)$/)?.[1];
    const tableAliases = { perfiles_publicos: 'perfiles', mi_perfil: 'perfiles', anuncios_publicos: 'anuncios' };
    const table = tableAliases[tableName] || tableName;
    if (!table || !Array.isArray(state[table]) || ['mailLog', 'resetRequests'].includes(table)) return fail('Recurso no disponible en la demo.', 404);
    let rows = state[table];
    if (table === 'anuncios') rows = rows.map(row => ({ ...clone(row), foto_url: localPhoto(row.foto_url), foto_url_2: localPhoto(row.foto_url_2), foto_url_3: localPhoto(row.foto_url_3) }));
    if (table === 'perfiles') { const context = (url.searchParams.get('rubro') || '').replace(/^eq\./, ''); rows = rows.map(row => demoProfile(row, context)); }
    if (tableName === 'mi_perfil') rows = rows.filter(row => sameId(row.id, currentId()));
    if (method === 'GET' || method === 'HEAD') return selectRows(rows, url.searchParams, request);
    if (!currentId() && table !== 'artistas_sugeridos') return fail('Demo: ingresá a la cuenta de ejemplo.', 401);
    if (method === 'POST') {
      const inputs = Array.isArray(input) ? input : [input];
      for (const item of inputs) {
        if (table === 'anuncios' && (!sameId(item.user_id, currentId()) || !['busco', 'ofrezco', 'clases', 'jam', 'vende'].includes(item.tipo) || !String(item.titulo || '').trim())) return fail('Demo: anuncio inválido.', 403);
        if (table === 'mensajes' && (!sameId(item.de_user_id, currentId()) || !state.perfiles.some(row => sameId(row.id, item.para_user_id)) || !String(item.contenido || '').trim())) return fail('Demo: mensaje inválido.', 403);
        if (['perfiles_guardados', 'reacciones'].includes(table) && !sameId(item.user_id, currentId())) return fail('Demo: identidad inválida.', 403);
        if (table === 'conversaciones' && ![item.user1_id, item.user2_id].some(id => sameId(id, currentId()))) return fail('Demo: conversación ajena.', 403);
        if (table === 'perfiles') return fail('Usá el registro demo para crear una cuenta.', 403);
      }
      const created = inputs.map(item => { const conflict = url.searchParams.get('on_conflict'); const existing = conflict && state[table].find(row => conflict.split(',').every(key => sameId(row[key], item[key]))); if (existing) { Object.assign(existing, item); return existing; } const row = { ...item, id: state.nextId++, created_at: now(), ...(table === 'anuncios' ? { estado: 'activo', oculto: false, visitas: 0 } : {}) }; state[table].push(row); return row; });
      persist(); return json(created, 201);
    }
    const targets = state[table].filter(row => matches(table === 'perfiles' ? demoProfile(row) : row, url.searchParams));
    for (const row of targets) {
      if (table === 'perfiles' && (!sameId(row.id, currentId()) || !validProfileChanges(input))) return fail('Demo: perfil ajeno o cambios inválidos.', 403);
      if (table === 'anuncios' && !sameId(row.user_id, currentId())) { if (method === 'PATCH' && Object.keys(input).every(key => key === 'visitas')) continue; return fail('Demo: anuncio ajeno.', 403); }
      if (['perfiles_guardados', 'reacciones'].includes(table) && !sameId(row.user_id, currentId())) return fail('Demo: elemento ajeno.', 403);
      if (table === 'conversaciones' && ![row.user1_id, row.user2_id].some(id => sameId(id, currentId()))) return fail('Demo: conversación ajena.', 403);
      if (table === 'mensajes') return fail('Los mensajes enviados no pueden editarse en la demo.', 403);
    }
    if (method === 'PATCH') targets.forEach(row => Object.assign(row, input));
    else if (method === 'DELETE' && ['reacciones', 'perfiles_guardados'].includes(table)) state[table] = state[table].filter(row => !targets.includes(row));
    else return fail('Método no disponible en la demo.', 405);
    persist(); return json(targets);
  }
  const blocked = [];
  const uploads = new Map();
  async function safeFetch(input, options) {
    const request = new Request(input instanceof Request ? input : new URL(String(input), origin).href, options);
    const url = new URL(request.url);
    if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (url.protocol === 'data:' || url.protocol === 'blob:') return realFetch(request);
    const fixtureHost = url.hostname === 'xiaanchoanxmamgoay.supabase.co' || url.hostname === 'xiaanchoanxmampegoay.supabase.co';
    if ((fixtureHost || url.origin === origin) && (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/.netlify/functions/'))) {
      // La respuesta simulada no debe adelantarse al parseo de scripts inline posteriores.
      // En producción hay latencia de red; acá esperamos sólo a que termine el documento.
      if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      return api(request, url);
    }
    if (fixtureHost && url.pathname.startsWith('/storage/v1/object/')) {
      const storagePath = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/object/');
      if (request.method === 'POST' || request.method === 'PUT') {
        const allowed = storagePath.startsWith('/storage/v1/object/fotos-anuncios/') || storagePath.startsWith('/storage/v1/object/fotos-perfil/' + currentId() + '-');
        if (!currentId() || !allowed) return fail('Demo: foto ajena.', 403);
        const blob = await request.blob(); if (!blob.type.startsWith('image/') || blob.size > 5 * 1024 * 1024) return fail('Demo: imagen inválida.');
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        uploads.set(storagePath, blob); state.images ||= {}; state.images[storagePath] = dataUrl;
        try { persist(); } catch (_) { return fail('La imagen supera el espacio local del navegador. Usá una imagen más pequeña.'); }
        return json({ Key: storagePath, demo: true });
      }
      if (request.method === 'GET' && uploads.has(storagePath)) return new Response(uploads.get(storagePath));
      if (request.method === 'GET' && state.images?.[storagePath]) return realFetch(state.images[storagePath]);
      return fail('Imagen no disponible en los datos demo.', 404);
    }
    if (url.origin === origin && !url.pathname.startsWith('/sw.js')) return realFetch(request);
    blocked.push({ host: url.hostname, path: url.pathname, method: request.method });
    throw new TypeError('Preview bloqueó una solicitud externa; sólo usa datos demo locales.');
  }
  global.fetch = safeFetch;
  // Preserve the actual SDK while forcing its transport and disabling Auth persistence.
  let sdk;
  Object.defineProperty(global, 'supabase', { configurable: true, get: () => sdk, set(value) { if (value?.createClient && !value.__previewGuarded) { const create = value.createClient; value.createClient = (url, key, options = {}) => create(url, key, { ...options, global: { ...options.global, fetch: safeFetch }, auth: { ...options.auth, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); value.__previewGuarded = true; } sdk = value; } });
  class PreviewXHR extends EventTarget {
    constructor() { super(); this.readyState = 0; this.status = 0; this.responseType = ''; this.responseText = ''; this.response = null; this.upload = new EventTarget(); this.headers = new Headers(); }
    open(method, url, async = true) { if (!async) throw new Error('XHR síncrono no disponible en preview.'); this.method = method; this.url = url; this.readyState = 1; }
    setRequestHeader(key, value) { this.headers.set(key, value); }
    getResponseHeader(key) { return this.responseHeaders?.get(key) || null; }
    getAllResponseHeaders() { return this.responseHeaders ? [...this.responseHeaders].map(([k, v]) => k + ': ' + v).join('\r\n') : ''; }
    abort() { this.controller?.abort(); }
    async send(body) { this.controller = new AbortController(); try { const response = await safeFetch(this.url, { method: this.method, headers: this.headers, body, signal: this.controller.signal }); this.status = response.status; this.responseHeaders = response.headers; if (this.responseType === 'blob') this.response = await response.blob(); else { this.responseText = await response.text(); this.response = this.responseType === 'json' ? JSON.parse(this.responseText) : this.responseText; } this.readyState = 4; this.fire('readystatechange'); this.fire('load'); } catch (_) { this.readyState = 4; this.fire('error'); } finally { this.fire('loadend'); } }
    fire(type) { const event = new Event(type); this.dispatchEvent(event); if (typeof this['on' + type] === 'function') this['on' + type](event); }
  }
  global.XMLHttpRequest = PreviewXHR;
  global.WebSocket = class { constructor() { throw new Error('WebSocket externo deshabilitado en la demo.'); } };
  global.EventSource = class { constructor() { throw new Error('EventSource deshabilitado en la demo.'); } };
  if (navigator.sendBeacon) navigator.sendBeacon = () => false;
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(items => items.forEach(item => item.unregister())).catch(() => {});
    navigator.serviceWorker.register = () => Promise.reject(new Error('Service worker deshabilitado en la preview.'));
  }
  const captcha = Object.freeze({ show(id) { const panel = document.getElementById(id)?.closest('.captcha-panel'); if (panel) { panel.dataset.state = 'verified'; const status = panel.querySelector('.captcha-status'); if (status) status.textContent = 'Verificación simulada lista. No se conecta a hCaptcha.'; const box = document.getElementById(id); if (box) box.textContent = '✓ DEMO · verificación local'; } }, requireResponse(id) { this.show(id); return 'local-preview-captcha'; }, reset(id) { this.show(id); } });
  Object.defineProperty(global, 'RegistroCaptcha', { configurable: false, get: () => captcha, set() {} });
  const originalOpen = global.open.bind(global);
  global.open = (url, target, features) => { const destination = new URL(String(url || ''), origin); if (destination.origin !== origin) { alert('Esta preview no abre servicios externos. Los datos son de demostración.'); return null; } return originalOpen(destination.href, target, features); };
  document.addEventListener('click', event => { const link = event.target.closest?.('a[href]'); if (!link) return; const destination = new URL(link.href, origin); if (destination.origin !== origin && !link.hasAttribute('data-preview-external-allowed')) { event.preventDefault(); alert('Enlace externo deshabilitado en esta demo local.'); } }, true);
  // Images assigned by existing upload code resolve to the local stored bytes.
  new MutationObserver(records => {
    for (const record of records) {
      const targets = record.type === 'attributes' ? [record.target] : Array.from(record.addedNodes).flatMap(node => node.nodeType === 1 ? [node, ...node.querySelectorAll('img')] : []);
      targets.forEach(node => { if (node.tagName === 'IMG') { const src = node.getAttribute('src'); const replacement = localPhoto(src); if (replacement && replacement !== src) node.setAttribute('src', replacement); } });
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  global.BuscartePreview = Object.freeze({ demo: true, password: 'Demo1234!', email: 'alex@preview.invalid', useAccount, logout() { ['ba_logged', 'ba_user_id', 'ba_name', 'ba_email', 'ba_rubro', 'ba_tipo_cuenta'].forEach(key => localStorage.removeItem(key)); global.BuscARTEInicio?.refresh(); }, reset() { state = seed(); realLocal.removeItem('ba_preview_disciplinas_v1'); sessionStorage.removeItem('ba_preview_next_step_dismissed'); localStorage.setItem('ba_preview_view_mode', 'member'); persist(); useAccount(); }, getData: () => clone(state), getProfile(id = 9001) { const row = state.perfiles.find(item => sameId(item.id, id)); return row ? demoProfile(row) : null; }, get data() { return clone(state); }, get profiles() { return state.perfiles.map(row => demoProfile(row)); }, get blockedRequests() { return clone(blocked); }, currentProfile: () => { const row = state.perfiles.find(item => sameId(item.id, currentId())); return row ? demoProfile(row) : null; } });
  global.BuscARTEPreview = global.BuscartePreview;
  console.info('BuscARTE PREVIEW LOCAL: cuenta y datos demo; red productiva bloqueada.');
})(window);
