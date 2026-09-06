# QA local — alta breve y perfil progresivo

Cierre del 6/9/2026. Rama `codex/onboarding-progresivo-20260906`, desde `ed295b32b66d783c863f6505d467de85c9114a65`. Implementación y pruebas: `28a2dd3c99fbb8bc172412d21a105e25a577927e`.

**Sólo local.** No hubo deploy, preview ni push. La última publicación verificada corresponde a Marketplace + guardado/danza: deploy `6a9d8cbb808123cc8c948eb2`, fuente pública `8957ad0`, caché v13. Este bloque prepara v14; no se declara una nueva consulta de Netlify ni una validación remota de estos cambios.

## Alcance implementado

- Alta artística por defecto en cuatro pantallas: tipo de cuenta → datos básicos → rubro → verificación/crear perfil. Antes música recorría seis y los demás rubros cinco. Los recorridos de negocio y visitante conservan cuatro y tres, respectivamente.
- Datos básicos visibles: nombre, email, contraseña y provincia. Apellido, ciudad y barrio quedan en una sección opcional. Foto, bio, objetivos y detalles artísticos se pueden completar después; el recorrido extendido sigue disponible durante el alta.
- Indicador de avance visible también en mobile, títulos enfocados al cambiar de pantalla, selecciones anunciadas y detalles conservados al volver dentro del mismo rubro. El captcha permanece visible fuera de la sección opcional y no se elimina su validación existente.
- Éxito con acción principal «Empezar a explorar». Para artistas conserva el rubro seleccionado y ofrece «Completar mi perfil» como acción secundaria, con enlace a `buscARTE_perfil.html#completar`. No promete un editor artístico a negocios o visitantes; estos últimos pueden explorar el Marketplace.
- Nombre de negocio precargado desde los datos de cuenta sin pisar una edición explícita. Se separó su foto de la del artista para evitar arrastrarla al cambiar de tipo de cuenta.
- En el editor artístico, «Tu presentación» muestra cinco básicos: nombre, foto, bio, provincia + ciudad y detalle principal del rubro/instrumento. Ofrece accesos directos a cada pendiente y aclara que se puede seguir usando la plataforma. Vídeos, redes, experiencia, edad y referentes no son requisitos del indicador.

## Consistencia y recuperación

El alta conserva los 14 parámetros de `registrar_usuario`, las claves legacy de sesión y las URLs existentes. La validación final vuelve a comprobar datos mínimos, tipo de cuenta y rubro. Un envío pendiente o una cuenta ya confirmada no puede disparar otra alta desde esa pantalla. Una respuesta sin ID válido no se presenta como cuenta creada.

Si la cuenta fue confirmada pero el navegador no logra guardar la sesión, se muestra «cuenta creada» con acceso a iniciar sesión, sin volver a llamar la RPC. La marca de sesión se escribe al final y se intenta retirar la caché parcial ante fallo. Una excepción del tracking opcional no impide llegar al resultado. La bienvenida existente para artistas conserva su contrato; no se agregaron campañas, destinatarios ni emails de completitud.

El progreso se calcula únicamente sobre `perfilCargado`, después de una lectura o guardado confirmado; no cuenta borradores ni presenta un porcentaje ficticio durante la carga. Una cuenta/rubro/rol incompatible oculta la tarjeta. JSON vacío, espacios, arrays vacíos y metadatos no cuentan como disciplina. Las claves canónicas vacías prevalecen sobre aliases antiguos. Valores históricos de ubicación se conservan como opciones al cargar, sin inventar ni normalizar masivamente datos.

La foto del editor sólo aumenta el progreso después de subir y confirmar un PATCH que devuelve exactamente el ID y la URL esperados. Se mantiene el bucket, optimizador y contrato de datos; se agregan guardas de cuenta, deduplicación y timeout de 20 segundos. Fallos y resultados inciertos conservan la foto previa y no reintentan automáticamente. Un cambio de cuenta no puede deshacer una solicitud ya enviada al servidor; sólo impide continuar o aplicar una respuesta tardía a otra cuenta. Subir foto y guardar el formulario simultáneamente conserva ambos resultados, en cualquiera de los dos órdenes de respuesta.

## Verificación final

**286/286 pruebas aprobadas en una corrida**, sin fallas, cancelaciones ni omitidas; duración 304,4 segundos. Incluye 214 casos previos, 44 nuevos de onboarding y 28 de progreso/foto. Node 24.19.0, Playwright 1.62.1 y Edge headless.

```powershell
$env:BUSCARTE_QA_OUTPUT='C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\onboarding-progresivo-20260906\regression-final'
node --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination='C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\onboarding-progresivo-20260906\local-regression-final.log' scripts/build-site.test.mjs scripts/registro-captcha.test.cjs scripts/anuncios-publicacion.test.cjs scripts/inicio-sesion.test.cjs scripts/perfil-propio.test.cjs scripts/chat-perfil.test.cjs scripts/marketplace.test.cjs scripts/perfil-guardado.test.cjs scripts/onboarding.test.cjs scripts/perfil-progreso.test.cjs
node scripts/build-site.mjs
```

Pruebas focalizadas disponibles: `npm run test:onboarding` y `npm run test:perfil-progreso`. La fixture anterior de captcha, que salta directamente al paso final, ahora precarga el tipo de negocio requerido para seguir verificando captcha; no se debilitaron sus aserciones.

La cobertura nueva incluye los tres tipos de cuenta, los rubros artísticos actuales, recorrido breve y extendido, vuelta atrás/cambio de rubro, payload y caché, validaciones, captcha, duplicados, errores y respuestas inesperadas. También verifica fallo de almacenamiento local y tracking, confirmación de datos/foto, concurrencia, cambios de cuenta, estados de carga, datos históricos, foco y enlace `#completar`.

Capturas finales generadas a 320, 390 y 1280 px para alta y progreso. Revisión visual directa de las capturas finales a 320 y 1280 px, incluyendo éxito mobile. El encabezado mobile se ajustó para separar logo y enlace de regreso a 320 px. Las pruebas de acciones visibles admiten hasta 1 px de redondeo vertical subpíxel y mantienen tamaño táctil mínimo de 44 px. Las suites nuevas comparan el desborde con `innerWidth`; onboarding también comprueba las cajas de sus controles principales contra el ancho configurado. No se extiende esta última aserción a toda la página de perfil. Las fuentes externas se simulan sin descargar tipografías; el captcha mostrado es explícitamente sintético.

Build final: mismos **36 archivos públicos**, sin ampliar `site-files.json`. `git diff --check` correcto. Revisión independiente de registro, perfil y aislamiento de pruebas, sin bloqueantes al cierre. Configuración/SDK de Auth, funciones, `netlify.toml`, manifiesto, asset links, redirects, assets compartidos, Home y lockfile no tienen cambios contra la base. Sin nuevas dependencias.

Evidencia privada: `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\onboarding-progresivo-20260906`. La referencia final es `local-regression-final.log` y sus capturas `regression-final/`; los logs de desarrollo en `registro/` y `perfil/` son anteriores. Una invocación diagnóstica con filtro `layout`, que no coincidía con ningún nombre, fue detenida sin cobertura útil; no se incluye en el resultado. La corrida completa terminó normalmente con código 0.

## Supabase y aislamiento

Se siguieron las guías de Supabase: revisión del [changelog](https://supabase.com/changelog) y del [contrato de RPC](https://supabase.com/docs/reference/javascript/rpc). Esto llevó a confirmar el contrato existente antes de hacer opcionales los detalles, sin introducir un proveedor de identidad ni una migración.

Fuera de las pruebas se ejecutaron únicamente consultas SELECT de metadatos: definición de `public.registrar_usuario` y catálogo de checks/triggers de `public.perfiles`. No devolvieron personas ni ejecutaron la función de registro. La definición mantiene 14 argumentos e inserta los detalles recibidos sin exigir instrumento; la consulta combinada devolvió checks y triggers vacíos. Esto no es una auditoría de permisos, nulabilidad completa ni una prueba de escritura. Se conservan los valores vacíos compatibles del contrato, sin alterar esquema o datos.

Las suites usan fixtures locales: todas las solicitudes previstas se responden en memoria; lo imprevisto se aborta y hace fallar la prueba. No hay `route.fetch`, `route.continue` ni llamadas API reales desde esas suites. Service workers bloqueados y WebSockets interceptados. Altas, bienvenida, referencias, Storage, PATCH y mensajes nunca llegan a servicios reales. Las guardas de frontend no son autenticación ni sustituyen controles del servidor/RLS.

## Límites, siguiente paso y reversión

- Falta validar en dispositivo físico/app instalada y con teclado nativo. La mejora es de la web compartida; no se editó ni compiló Android.
- No se hicieron altas ni subidas reales. RPC/RLS/Storage, entrega de correo y captcha real requieren una prueba de integración con una cuenta/entorno expresamente autorizado. La foto de prueba es un PNG diminuto; no certifica HEIC ni archivos grandes.
- Continúan fuera de alcance la migración Auth y protección servidor del captcha, disciplinas múltiples/principal, roles técnicos, editor de negocio, emails de engagement, reordenamiento general del Inicio y rediseño visual amplio.
- No hubo deploy, preview, push, cambio de planes ni escritura sobre usuarios reales. Puede agruparse con otro bloque antes de acordar el próximo corte de publicación. No comparar este `dist/` v14 con producción v13 como si fueran el mismo release.
- Para descartar el bloque, preparar una rama desde la base `ed295b3` o revertir el commit funcional de forma revisable, preservando pendientes. No hacer reset destructivo. Si se decide publicar, volver a validar paquete/contexto, obtener el corte acordado y comprobar recursos y flujos publicados; no desplegar la raíz ni promover cambios por push accidental.

Resguardo privado del historial y referencias en `../BuscARTE-resguardos/onboarding-progresivo-20260906/RESGUARDO.md`. No incluye base remota ni protege contra pérdida del disco; nunca publicar este directorio.
