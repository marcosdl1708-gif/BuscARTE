# buscARTE — base web de trabajo

Esta copia independiente es la base para los próximos bloques de mejoras web/mobile.
No depende del repositorio original ni del worktree de Android para funcionar.

## Estado operativo — guardado seguro y mails publicados

**Publicado 6/9, 17:38 ART:** deploy activo `6a9dcf37d0aeb9991f8eb446`, fuente `b1d35dd`, caché v17. Guardado con contraseña verificada por servidor + bienvenida/recordatorio; sin RLS/migración, cambios de cuentas, horarios, Android ni variables remotas. Verificación esencial local y chequeo de rechazo de credenciales en producción aprobados, sin escrituras de perfiles desde herramientas. Falta confirmación positiva del usuario con su cuenta. Informe `docs/guardado-seguro-mails-20260906.md`; rama `codex/guardado-seguro-20260906`. No repetir deploy ni enviar mails de muestra. GitHub main continúa pendiente de sincronización.

### Histórico anterior a esta publicación

**Corte autorizado posterior:** guardado seguro + ambos mails listos para publicar en `codex/guardado-seguro-20260906`. Reingreso de contraseña sólo para guardar; servidor verifica identidad antes del PATCH, sin modificar RLS ni activar la migración. Validación acotada por pedido del usuario: 13 comprobaciones de guardado, contratos de correo y build36/v17. Ver `docs/guardado-seguro-mails-20260906.md`; no confundir con la regresión histórica de PATCH directo. El estado de publicación se confirma en ese informe.

**Incidente posterior — deploy pausado:** el usuario confirmó que recibió ambos mails, pero no puede guardar el perfil. Se diagnosticó incompatibilidad entre el JWT público sin identidad personal del editor y la política UPDATE real de Supabase; la respuesta observada es `[]`. Sólo diagnóstico, sin modificar datos/permisos/Auth ni publicar. Ver `docs/diagnostico-guardado-perfil-20260906.md`. Acordar reparación de identidad/autorización antes de retomar el deploy; no activar la migración ni abrir RLS por defecto. Esta prioridad prevalece sobre la revisión de muestras indicada abajo.

**Actualización posterior — muestras enviadas:** el usuario autorizó dos pruebas a su correo. Se enviaron por Test email desde dos borradores Resend sin publicar; ambas figuran Delivered con prefijo [TEST]. No hubo deploy/push ni cambios ejecutables/configuración. **Esperar su comprobación en Gmail móvil y de los enlaces antes del deploy conjunto; no reenviar automáticamente.** Ver `docs/muestras-correos-20260906.md` y evidencia privada `../BuscARTE-resguardos/muestras-correos-20260906/RESULTADO.md`. Los párrafos siguientes registran el estado anterior al envío de estas muestras, no un nuevo pendiente de enviarlas.

Continuar en `codex/recordatorio-perfil-20260906`, desde la auditoría `9b75b23`; implementación `bdf652f`. Tras el «go» del usuario se mejoró **sólo el contenido/enlace de perfil_incompleto**: foto/presentación opcionales, sin promesa de visitas, un botón para ingresar y volver a `perfil#completar`. Bienvenida preparada previamente sigue intacta. Handler, otras plantillas, selección, destinatarios, frecuencia, configuración, 36 archivos públicos, datos/Auth y Android no cambian. **191/191 pruebas locales**, build36; informe `docs/qa-recordatorio-perfil-20260906.md`, evidencia/resguardo privado `../BuscARTE-resguardos/recordatorio-perfil-20260906`.

**Sin deploy, preview, push ni emails reales.** Producción no se volvió a consultar en este bloque; última publicación verificada: v16 inferior. Bienvenida y recordatorio nuevos siguen pendientes juntos, aunque el dist estático coincide con la fuente publicada. Próximo corte propuesto: muestra controlada en clientes reales con autorización y luego un único deploy conjunto, conservando las otras tres funciones/horarios. No ampliar campañas ni sincronizar main automáticamente. Roles técnicos como subrubros por evaluar; identidad visual y multirrubro siguen postergados. Guía física de usuario nuevo al cierre del trabajo acordado.

### Histórico previo — bienvenida y auditoría Resend

**Decisión posterior del usuario:** auditar Resend antes de avanzar con bienvenida/recordatorios, sólo lectura y sin envíos ni deploy. Roles técnicos se evalúan como especialidades/subrubros dentro de los rubros existentes; identidad visual queda postergada. Al cerrar el trabajo acordado, entregar una guía integral para que el usuario pruebe la app desde una cuenta nueva. Ver `docs/feedback-mobile-seguimiento-20260906.md`. No se autoriza una campaña ni la implementación de roles con esta decisión.

**Auditoría Resend completada el 6/9**, después de que el usuario iniciara sesión: bienvenida antigua y recordatorios sí tienen envíos/entregas reales. Dominio verificado, supresiones por rebote activas; sin automatizaciones/broadcasts/webhooks configurados en Resend. Los circuitos dependen de las funciones existentes. Ver `docs/auditoria-correos-20260906.md`; cifras/uso privado en `../BuscARTE-resguardos/auditoria-resend-20260906/RESUMEN.md`. No hubo envío/configuración/deploy ni nuevas modificaciones ejecutables. Próximo bloque propuesto: utilidad y retorno por login del recordatorio antes de ampliar elegibilidad/cadencia; preservar límites diarios compartidos y bajas/supresiones.

Continuar en `codex/bienvenida-20260906`, desde el cierre de release `e59623a`, implementación `2d0f65d`. **Sólo cambia la plantilla bienvenida**: copy general más breve, explorar los diez rubros primero y completar el perfil mediante el login existente después. No modifica handler, helpers compartidos, destinatarios, cadencia, otras siete plantillas, páginas/Auth/datos ni Android. **105/105 pruebas locales** en una corrida (70 contratos/contenido, 20 visuales y 15 empaquetado), build36. QA y límites: `docs/qa-bienvenida-20260906.md`; evidencia/resguardo privado `../BuscARTE-resguardos/bienvenida-20260906`. Sin envío real ni deploy/preview/push de bienvenida. Probar clientes de correo reales con autorización antes del próximo corte; no certificar entrega o compatibilidad nativa con el render de Edge.

Producción sigue en el release v16 inferior, comprobado nuevamente al cierre: **no contiene este nuevo mail**. El dist estático sí sigue siendo idéntico; la diferencia pendiente está en `netlify/functions/send-email.js`. No publicar accidentalmente esa carpeta ni sincronizar main. Feedback pendiente ordenado en `docs/feedback-mobile-seguimiento-20260906.md`: engagement completo, roles técnicos/niveles, identidad visual/editorial humana y validación física; multirrubro/principal permanece postergado.

### Última publicación — coherencia entre rubros

**Publicado el 6/9/2026 a las 15:42 ART**: deploy activo verificado `6a9db430d7eed8dbdc9489d2`, fuente pública `e4783b7`, HEAD de publicación `d5352f4`, caché v16. Un único deploy de producción autorizado, sin preview ni push. Regresión final **412/412**, smokes **16/16 locales y 16/16 en producción** con backend simulado; 35 recursos, 35 rutas y cuatro exclusiones comprobados. Las cuatro funciones, hashes/runtimes y dos horarios permanecen idénticos. Ver `docs/release-coherencia-rubros-20260906.md`; evidencia privada `../BuscARTE-resguardos/release-coherencia-rubros-20260906`. Sin cambios Auth, datos o Android; app física e integración real pendientes. GitHub main sigue sin sincronizar: no disparar otro deploy mediante push accidental.

El usuario autorizó continuar con **bienvenida en local**, únicamente plantilla y enlaces, sin correos reales ni cambios de destinatarios/cadencia. No forma parte del deploy superior. Multirrubro/principal sigue postergado. Las notas inferiores describen estados históricos.

### Histórico previo — coherencia local

Preparación local en `codex/coherencia-rubros-20260906`, desde `f070ba3`, implementación `4668dd5` y ajuste tipográfico `e4783b7`: registro/perfil/Inicio coherentes con los diez rubros existentes, textos compartidos neutrales, acciones de completitud específicas, selector legible y diez accesos generales también en legacy. No cambia taxonomía, filtros, datos, Auth ni Android; multirrubro/principal sigue postergado. Caché local v16; **sin deploy, preview ni push**. Regresión 412/412 antes del último ajuste de título mobile, seguida de 99/99 pruebas afectadas y 14/14 smokes locales definitivos; build36. Alcance, revisión tipográfica y límites en `docs/qa-coherencia-rubros-20260906.md`. Evidencia/resguardo privado `../BuscARTE-resguardos/coherencia-rubros-20260906`. No confundir este dist con la publicación v15 inferior ni verificarlo contra producción como si ya estuviera publicado. App física e integración real con cuenta autorizada pendientes.

El bloque de bienvenida quedó después de esta revisión: **propuesto, no iniciado**, sólo plantilla/enlaces con pruebas locales y sin envíos, conservando destinatarios y cadencia. La publicación y la sincronización de main se acuerdan por separado para no disparar otro deploy accidental.

### Última publicación verificada — onboarding + Inicio, 6/9, 14:46 ART

**Onboarding + Inicio visual ya publicados**, deploy activo verificado `6a9da7082372f367b398b7c3`, fuente pública `5b26d0a`, HEAD de publicación `dbfb132`, caché v15. Un único deploy de producción autorizado, sin preview ni push. **334/334 pruebas locales en una corrida**, 14/14 smokes locales y 14/14 sobre producción, 35 recursos, 35 rutas y cuatro exclusiones verificados. Funciones/runtimes/horarios idénticos; sin migración Auth, cambios de datos ni Android. Informe `docs/release-onboarding-inicio-20260906.md`; evidencia/resguardo privado `../BuscARTE-resguardos/release-onboarding-inicio-20260906`. Validación física/app e integración con una cuenta real autorizada pendientes. GitHub main aún no sincronizado; no disparar otro deploy por push accidental.

Siguiente bloque **propuesto, no iniciado**: mejorar sólo el email de bienvenida para acompañar el alta breve, inicialmente en local y sin envíos. Copy/diseño mobile y enlaces para explorar/completar, contemplando reingreso. Conservar destinatarios y frecuencia; no activar campañas ni cambiar el resto de los correos como efecto colateral. Multirrubro/principal entre rubros sigue postergado.

### Histórico previo a esta publicación — Inicio visual local

**Inicio más claro implementado sólo en local**, rama `codex/inicio-visual-20260906` desde `91608ad`, implementación `5b26d0a`. Incluye el onboarding anterior: primer pantallazo más breve, búsqueda prioritaria, menos repeticiones, estadísticas más abajo y perfiles ilustrativos identificados como ejemplos. Ambas Home conservan sus URLs, sesión, destinos de anclas y contratos. **334 casos cubiertos**: regresión 334/334 previa a los últimos ajustes de CSS, más repetición definitiva 80/80 de Inicio y 16/16 escenarios con fuentes reales. Build de 36 archivos. Ver `docs/qa-inicio-visual-20260906.md`; evidencia/resguardo privado `../BuscARTE-resguardos/inicio-visual-20260906`. Caché local v15; **sin deploy, preview ni push**, ni cambios de backend/Auth, datos, funciones o Android. Validación física de la app pendiente. No publicar ni sincronizar automáticamente; acordar un corte conjunto de onboarding + Inicio.

### Estado previo — onboarding

**Alta breve + perfil progresivo listos sólo en local**, rama `codex/onboarding-progresivo-20260906` desde `ed295b3`, implementación `28a2dd3`. El alta artística pasa de cinco/seis pantallas a cuatro por defecto, conserva detalles opcionales y ofrece empezar a explorar. El editor muestra cinco básicos con accesos a pendientes y progreso de datos guardados. **286/286 pruebas** en una corrida, build de 36 archivos y revisión móvil/escritorio. Ver `docs/qa-onboarding-progresivo-20260906.md`; evidencia/resguardo privado `../BuscARTE-resguardos/onboarding-progresivo-20260906`. Caché local v14: **sin deploy, preview ni push**, ni cambios de Auth, esquema, funciones o Android. Sólo consultas SELECT de metadatos de Supabase, sin usuarios ni escrituras. App física e integración con una cuenta de prueba autorizada pendientes. Puede agruparse antes de acordar la próxima publicación.

## Decisión de producto — 6/9, después del onboarding

El usuario confirmó **postergar disciplinas múltiples/multirrubro y elección de principal entre rubros**. No retomarlo como siguiente mejora automática: requiere una decisión explícita y diseño separado de identidad del perfil, aparición en búsquedas y disciplina de cada anuncio. Conservar los contratos de rubro único y no mezclarlo con la migración Auth. Varios estilos dentro del mismo rubro no son lo mismo que varios rubros por cuenta.

El usuario autorizó con «Go» el bloque alternativo de jerarquía visual y claridad del Inicio mobile, y posteriormente su deploy conjunto con onboarding. **Ya publicados**, como indica el estado operativo. Se preservan sesión, destinos, filtros, permisos y datos, y ambas Home (`index.html` y `buscARTE_index.html`) mantienen sus URLs y el distinto significado de `#explorar`; no se fusionaron. No implica un rediseño completo, material de personas inventado ni cambios de taxonomía/roles técnicos. Sigue pendiente validación física de la app. Esta decisión prevalece sobre los órdenes históricos inferiores.

## Publicación anterior — 6/9, 12:54 ART

**Marketplace + guardado/danza ya están publicados**: deploy activo verificado al cierre de esa publicación `6a9d8cbb808123cc8c948eb2`, fuente pública `8957ad0`, caché v13. El usuario resolvió el saldo de Netlify y autorizó retomar; hubo un único deploy exitoso, sin preview ni push. Verificados 35 recursos, 35 rutas, cuatro exclusiones y **11/11 smoke tests sobre producción con backend simulado**, además de las 214 pruebas locales previas. Funciones y horarios intactos; sin migración Auth ni cambios Android. Informe `docs/release-marketplace-danza-20260906.md`, respaldo privado `../BuscARTE-resguardos/release-marketplace-danza-20260906`. El onboarding posterior es local, como se indica arriba. GitHub `main` sigue pendiente de sincronizar; no disparar otro deploy por accidente.

Las entradas siguientes registran los estados históricos previos a esta publicación, incluido el bloqueo por créditos ya resuelto.

Actualización 6/9 — **Marketplace + guardado/danza siguen sin publicar**. El deploy conjunto autorizado fue rechazado con `Forbidden`: Netlify confirmó que el equipo está en créditos operativos y tiene pausadas las publicaciones de producción. No hubo nuevo deploy ID ni cambio de versión pública; no se reintentó ni se cambió de plan. Paquete listo con **214/214 pruebas locales** en una corrida, más **11/11 smoke tests locales**. Diagnóstico y condiciones para retomar: `docs/deploy-marketplace-danza-20260906.md`. Próximo período informado: 14/9, 04:00 ART. No confundir este `dist/` v13 con producción v11.

Inicio + perfil propio/chat están **publicados**: deploy `6a9cd36de8ea461b8c4b7063`, fuente pública `a441167`, caché v11. Ver `docs/release-inicio-perfil-chat-20260905.md`. Se comprobaron 35 recursos, 35 rutas, cuatro exclusiones y ocho smoke tests sobre producción, además de las 152 pruebas locales. Funciones y horarios permanecen idénticos. No se creó otra preview ni se hizo push; GitHub `main` sigue pendiente de incorporar estos commits. Las secciones que describen los bloques como locales/preview registran el estado previo a esta publicación.

Marketplace está implementado **sólo en local**, en `codex/marketplace-20260905` desde `584bd65`. Ambas Home abren el catálogo de productos, con foto/precio/zona, filtros propios y publicación de venta/alquiler. Conserva los datos y permisos existentes. Ver `docs/qa-marketplace-20260905.md`; caché local v12, todavía sin publicar. No ejecutar el verificador de archivos contra producción con este `dist/`: contiene otro bloque.

Cierre local del 6/9, 00:07 ART: **183/183 pruebas aprobadas**, build de 36 archivos y revisión visual móvil/escritorio. No hubo segundo deploy, nueva preview ni push. Resguardo privado: `../BuscARTE-resguardos/marketplace-20260905`. La app instalada/dispositivo físico sigue pendiente de comprobar.

Continuación local del 6/9: guardado/estilos de danza en `codex/danza-guardado-20260906` desde `60424d5`, incluyendo Marketplace. Corrige el vaciado de campos, confirma la actualización de la fila y unifica la disciplina mostrada en editor/perfil/búsqueda. También corrige el desborde que sacaba Guardar fuera del viewport mobile. Caché local v13; **ninguno de estos dos bloques está publicado**. QA y límites: `docs/qa-perfil-danza-20260906.md`; respaldo privado: `../BuscARTE-resguardos/perfil-danza-20260906`.

Implementación `8957ad0`, cierre validado el 6/9: 214 casos locales cubiertos (regresión 213/213 más repetición de guardado ampliada 31/31), tres reproducciones históricas aparte, build 36 y capturas verificadas. Próximo corte recomendado: Marketplace + guardado/danza juntos, con aprobación y verificaciones de publicación, antes de onboarding. No hubo deploy/preview/push en este bloque.

## Procedencia verificada — 5 de septiembre de 2026

- GitHub: `https://github.com/marcosdl1708-gif/BuscARTE`, main `c40e88045a32f8311db82b923c0a598b4ae2fbff`.
- Producción estaba más adelantada: deploy Netlify `6a9aaf1d3f91b32a6e3336bc`, publicado el 4 de septiembre, “Fix mobile header overlap”. No tenía commit asociado.
- Commit local `130577f`: recupera los 33 archivos fuente públicos comparando SHA-1 y tamaño contra el inventario de Netlify, incluido el arreglo del encabezado mobile. Las cuatro funciones conservan el código que existía en GitHub y en la carpeta usada para ese deploy; no se verificó equivalencia binaria del empaquetado remoto.
- El `netlify.toml` servido por Netlify era generado; se conservó la configuración fuente, no esa copia transformada.
- Los scripts Auth ya publicados se conservan con su configuración existente: modo shadow y red deshabilitada. Esta organización no activa la migración.

La organización inicial fue local; después se publicaron captcha + anuncios y se sincronizó esta base con GitHub. Ver `docs/release-20260905.md` y `docs/github-sync-20260905.md` para distinguir ambas operaciones.

## Construcción local

```sh
npm ci
npm run build
npm test
npm run test:registro
npm run test:anuncios
npm run test:inicio
npm run test:inicio-visual
npm run test:perfil
npm run test:chat
npm run test:marketplace
npm run test:perfil-guardado
npm run test:onboarding
npm run test:perfil-progreso
npm run test:coherencia-rubros
npm run test:bienvenida
npm run test:bienvenida-visual
npm run test:recordatorio
npm run test:recordatorio-visual
```

El build también funciona directamente con `node scripts/build-site.mjs`, sin instalar dependencias: copia y verifica archivos, sin consultar servicios remotos. `npm ci` sí es necesario para instalar dependencias de las funciones en un entorno limpio.

`npm test` verifica el empaquetado con archivos ficticios aislados (lista permitida, integridad, reconstrucción y rechazo de rutas peligrosas/enlaces). No es una suite funcional de registro, perfiles, chat ni Android.

`npm run test:registro` prueba el flujo de captcha con Playwright y servicios simulados; no permite tráfico real de registro, emails, tracking ni hCaptcha. En Windows usa Edge instalado; en otros sistemas, instalar Chromium con `npx playwright install chromium` antes. Opcionalmente `BUSCARTE_PLAYWRIGHT_MODULE` permite usar una instalación existente de Playwright, y `BUSCARTE_QA_OUTPUT` indica dónde guardar capturas sintéticas (fuera de `dist/`).

`npm run test:anuncios` usa el mismo entorno para verificar publicación mobile, contratos de los cinco tipos de anuncios, fotos, errores y envíos repetidos. Todas las solicitudes se simulan, incluida la RPC de vencimiento que la página ejecuta al cargar: no abrir la página real como una prueba supuestamente de sólo lectura.

`npm run test:inicio` verifica ambas Home con visitantes y cuentas conocidas, datos de sesión incompletos, retorno por historial, cambio entre pestañas, enlaces al perfil, menú accesible y mensajes tardíos. Usa fixtures aisladas, sin tráfico real de backend ni escrituras de identidad. También comprueba que el modo Auth local no tome la caché legacy como una sesión validada.

`npm run test:inicio-visual` verifica contratos frente a `91608ad`, jerarquía, ejemplos identificados, tres estados de sesión a seis anchos, navegación sin superposición, estadísticas más abajo, anclas, foco, movimiento reducido y teclado. Todo el backend es simulado/bloqueado. Ver el informe del bloque para la comprobación adicional con fuentes reales y los límites de la app física.

`npm run test:perfil` verifica la presentación propia/ajena, edición, compartir con ID explícito, contacto y cambios de cuenta. `npm run test:chat` verifica los accesos al perfil, mobile, historial y respuestas tardías. Ambas suites usan servicios simulados y rechazan toda solicitud no prevista; los casos de envío nunca contactan usuarios reales.

`npm run test:marketplace` verifica las dos Home y URLs históricas, catálogo público, filtros combinados, publicación por rol, productos sin foto/precio, paginación y respuestas tardías. Incluye revisión de layout a 320, 390 y 1280 px. Toda su red es simulada o rechazada; navegar no puede generar publicaciones inadvertidas sin hacer fallar la prueba.

`npm run test:perfil-guardado` verifica el PATCH y su confirmación, recarga, valores vacíos/históricos, compatibilidad de rubros, errores, concurrencia y coherencia entre editor, perfil público y búsqueda. Todo el backend es simulado. Con `BUSCARTE_GUARDADO_BASELINE=1` ejecuta por separado tres reproducciones del fallo anterior en `60424d5`.

`npm run test:onboarding` verifica alta breve/extendida, roles, rubros, datos opcionales, captcha, contrato RPC, duplicados, errores, recuperación de sesión y layout. `npm run test:perfil-progreso` verifica los cinco básicos sobre datos confirmados, acciones directas, enlaces, estados vacíos/históricos, cambios de cuenta, foto y guardado concurrente. Ambas suites simulan o rechazan toda su red; no generan cuentas, fotos ni emails reales.

`npm run test:coherencia-rubros` verifica los diez rubros en el editor y ambas Home: campos correctos, textos, progreso, foco, selector, destinos y estados de sesión sin escrituras. Onboarding también cubre las altas mínimas de los diez rubros a 320/390/1280 y los detalles opcionales propios. `BUSCARTE_COHERENCIA_BASELINE=1` ejecuta por separado dos reproducciones históricas de copy/navegación en `f070ba3`. Capturas mediante `BUSCARTE_QA_OUTPUT`, fuera del repositorio; toda la aplicación se simula o bloquea.

Las suites `test:bienvenida` y `test:recordatorio` evalúan templates/handler/login con VMs y entorno ficticio, sin red real. La suite nueva fija `9b75b23` para preservar todo fuera del recordatorio, incluida bienvenida; la histórica de bienvenida excluye explícitamente ese bloque ahora aprobado, no los demás. Las dos suites `*-visual` renderizan HTML sintético sin red a cinco anchos; cada una necesita un `BUSCARTE_QA_OUTPUT` nuevo y distinto, fuera del repo, o su directorio privado automático. No equivalen a clientes de correo ni entrega real.

`site-files.json` contiene la lista explícita de publicación. El resultado actual es `dist/` (36 archivos incluyendo `_redirects`, el controlador de captcha y los dos assets compartidos del Inicio), sin documentos, campañas, respaldos, `files.zip` ni herramientas internas. No modificar HTML al empaquetar. Un archivo nuevo requiere incorporarlo deliberadamente a esa lista. Si encuentra archivos inesperados en `dist/`, el build se detiene y no los elimina.

Netlify usa `dist/` y `netlify/functions/`. El paquete se validó en preview y se publicó el 5/9/2026 a las 22:09 ART: deploy `6a9cbd37518d43630307438c`. Las cuatro funciones de producción conservan exactamente los binarios anteriores, runtime `nodejs24.x` y sus dos horarios. `NODE_VERSION=20` sigue en la configuración fuente histórica; no se cambió en este bloque y no debe confundirse con el runtime remoto comprobado. Nunca publicar la raíz del repositorio.

Ver `docs/release-20260905.md` para verificación, contexto del CLI, comandos y reversión. Los diagnósticos `npm run verify:deploy` y `npm run test:deploy-smoke` requieren `BUSCARTE_DEPLOY_URL` con el origen exacto; el primero compara recursos/rutas y el segundo abre páginas con todo el backend simulado o bloqueado. Ambos admiten `BUSCARTE_PLAYWRIGHT_MODULE`. Los informes/capturas se guardan fuera de `dist/` mediante `BUSCARTE_VERIFY_REPORT` y `BUSCARTE_QA_OUTPUT` respectivamente.

## Forma de trabajar

Un bloque por vez, con cambios pequeños y verificables. Primero reproducir el problema; luego corregir y revisar web móvil/escritorio y su efecto en la app. Una preview no aísla automáticamente los datos: no hacer altas, envíos, publicaciones ni escrituras de prueba contra usuarios reales.

Los bloques de captcha y publicación de anuncios están implementados en commits separados y ya publicados juntos. El código público corresponde a `ac97d2d`; los commits posteriores de diagnóstico/documentación no cambian archivos públicos. `main` de GitHub y de esta copia canónica incorporan la base reconciliada y ambos bloques, conservando el historial. Ver `docs/qa-captcha-20260905.md`, `docs/qa-anuncios-20260905.md`, `docs/release-20260905.md` y `docs/github-sync-20260905.md` para pruebas y límites. La comprobación física de la app instalada sigue pendiente, aunque su dominio ya sirve la versión nueva.

Netlify está conectado a `main`: un push normal puede publicar automáticamente. La sincronización de código ya publicado usa un último commit marcado `[skip netlify]` para omitir sólo ese deploy. No se desactivaron builds ni se cambió la configuración remota. Para un próximo cambio funcional, acordar y validar su publicación antes de actualizar `main`; empezar el trabajo en una rama `codex/` desde la base actual.

Marketplace y el guardado de estilos de danza se implementaron como bloques separados y ya están publicados (ver estado operativo arriba). Onboarding/completitud progresiva se completó después sólo en local. Mantener separados la migración Auth y los cambios de disciplinas/modelo de datos; el nuevo indicador no implementa múltiples rubros ni elección de disciplina principal.

## Histórico previo al deploy — Inicio con sesión

La rama `codex/inicio-sesion-20260905`, desde `ce51224`, mejora sólo el Inicio de las cuentas conocidas. Ambas URLs conservan sus contratos y comparten presentación: saludo, cuatro accesos útiles, exploración por rubro y cierre sin volver a pedir registro. Una caché marcada como registrada pero sin ID ofrece reingresar, no otra alta. El menú y los enlaces personalizados esperan a estar listos antes de poder usarse.

Este bloque ya está **validado en preview, no publicado en producción**. El código público es `e63d92f`; la draft Netlify `6a9cc9c456bb08b603d9b3cf` pasó comparación de 35 recursos, 35 rutas y seis smoke tests remotos aislados. No se hizo push a `main` ni se cambió el deploy activo de producción: la publicación descrita arriba sigue correspondiendo a captcha + anuncios. Ver `docs/preview-inicio-20260905.md` para el resultado remoto y `docs/qa-inicio-20260905.md` para pruebas locales, capturas y límites. La publicación en producción requiere su aprobación y repetir allí las verificaciones; no promover la draft directamente como sustituto de validar su contexto y funciones.

El mapa local y la ubicación del respaldo están en `../BuscARTE-ORGANIZACION.md`.

## Histórico previo al deploy — Perfil propio y chat → perfil

Continuación desde `8cd3947` en `codex/perfil-chat-20260905`, que incluye el Inicio todavía pendiente de publicación. Cambios separados: `9deecd4` (perfil propio/acciones) y `c764b34` (chat → perfil). El perfil propio muestra **Editar mi perfil** y compartir, sin invitar a contactarse, guardarse o reportarse. En el chat, **Ver perfil** sigue visible en mobile; nombre/avatar también enlazan y volver conserva la conversación.

Validado **sólo localmente**: 152 pruebas aprobadas, build de 36 archivos y revisión visual móvil/escritorio con datos sintéticos. No se creó otra preview, no hubo deploy ni push; Supabase, funciones y Android no se modificaron. La preview anterior contiene sólo Inicio, no este bloque. El service worker queda preparado en v11 para la futura publicación conjunta.

Por decisión del usuario se agrupan las mejoras para evitar deploys por cada bloque. No publicar ni actualizar `main` automáticamente: primero acordar el corte, revisar el paquete conjunto y validar el contexto de producción. Ver `docs/qa-perfil-chat-20260905.md` para resultados y límites. Próximos recorridos a revisar por separado: entrada general de Marketplace y guardado de estilo de danza; después onboarding/completitud y disciplinas/modelo de datos.
