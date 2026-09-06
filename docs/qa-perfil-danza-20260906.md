# QA local — guardado del perfil y estilos de danza

Bloque del 6/9/2026. Rama `codex/danza-guardado-20260906` desde `60424d5` (incluye Marketplace local). Implementación y suite en `8957ad0523e85d30188c7dfb55b77318f7576fb9`. Sin deploy ni push.

## Causas reproducidas

Tres reproducciones aisladas sobre `60424d5` confirmaron:

1. Al vaciar todos los campos específicos, el PATCH omitía `campos_especificos`. El valor anterior permanecía y Tango reaparecía al recargar.
2. `return=minimal` y la comprobación de HTTP exitoso mostraban «guardado» incluso si no se actualizaba ninguna fila.
3. El banner de danza usaba `generos` (música), mientras la sección de disciplina usaba `campos_especificos.disciplina`. Podían mostrar estilos diferentes.

También se detectaron lectores que cortaban un string histórico a su primer carácter o esperaban siempre un array. Editar ya escribía la clave canónica `disciplina`; no se necesitó crear una columna o migración.

## Corrección acotada

- Guardar siempre incluye el JSON de campos no musicales, incluso `{}` cuando se vacía. Reemplaza las claves visibles y elimina sus aliases antiguos; conserva claves desconocidas y de otras secciones. Los valores históricos que no están en el catálogo aparecen como opciones seleccionadas para poder conservarlos o quitarlos expresamente.
- PATCH conserva tabla, ID filtrado y payload previo; solicita `return=representation` y sólo `id,campos_especificos`. Confirma una sola fila con el ID esperado y, fuera de música, compara los campos enviados con los devueltos sin depender del orden de las claves JSON.
- No permite guardar antes de cargar un perfil válido ni escribir el formulario anterior con el ID de otra cuenta. Un PATCH pendiente no se duplica. Los cambios hechos durante o después de una respuesta siguen pendientes; el temporizador anterior no oculta el nuevo borrador.
- Errores, respuesta vacía/inconsistente, timeout de 20 segundos y desconexión no muestran éxito ni reintentan automáticamente. Se conserva la selección. Un resultado incierto pide revisar el perfil antes de volver a guardar. El guardado ya enviado no se puede deshacer por cambiar de cuenta.
- Perfil público y búsqueda leen strings, arrays, JSON en texto y aliases históricos. Una clave canónica definida, incluso vacía/null, prevalece sobre el alias. El banner no musical toma la misma disciplina que la sección, manteniendo música sin cambios.
- «Estilos de danza» aclara que pueden elegirse varios y que para reemplazar uno hay que desmarcar el anterior. Esto no introduce una disciplina principal ni múltiples rubros por cuenta.

## Verificación

Regresión conjunta: **213/213 aprobadas** (183 previas + 30 nuevas) en 136 segundos, sin fallas ni omisiones; log privado `local-regression-final.log`. Después se agregó una prueba para rubro de caché inválido, dejando la suite de guardado en 31 casos. La repetición final pasó **31/31** en 30 segundos y se registra en `local-guardado-final.log`; el conjunto completo contiene **214 casos únicos cubiertos**, verificados en esas corridas, no una única ejecución de 214. Las tres reproducciones históricas son aparte y no se suman a la corrección.

La suite nueva es `npm run test:perfil-guardado`. Reproducción histórica opcional: ejecutar esa misma suite con `BUSCARTE_GUARDADO_BASELINE=1`; son tres demostraciones del fallo anterior, no pruebas de la corrección.

Ejecución con Node 24.19.0, Playwright 1.62.1 y Edge headless. Revisión visual de capturas finales del editor a 320/390/1280 px, perfil público y búsqueda a 390 px. El diff fue revisado independientemente; sin bloqueantes al cierre.

La regresión de los siete bloques anteriores pasó 183/183. Build de los mismos 36 archivos de `site-files.json`, sin nuevos archivos públicos; `git diff --check` correcto. La nueva suite usa una base ficticia con estado: aplica el PATCH simulado y sirve ese resultado al recargar el editor, abrir el perfil público y buscar artistas. Revisa también música/tatuaje, errores, borrado, aliases, campos desconocidos, texto malicioso, cambios de cuenta y respuestas tardías.

Durante las pruebas mobile se corrigió un desborde real: contenido de ancho mínimo en el editor/videos expandía el viewport de 320 a 411/380 px y colocaba la barra fija fuera de la pantalla física. La grilla puede contraerse, la cabecera de videos se apila y Guardar ocupa todo el ancho disponible. No se ocultó la falla con clics forzados. Feedback de éxito/error junto al botón y opciones del rubro con controles de 44 px. La prueba compara contra el viewport físico configurado, no sólo `innerWidth`.

## Aislamiento y guía de Supabase

Las suites simulan o rechazan todas las solicitudes, incluyendo Auth, tracking, fotos, mensajes, RPC y cualquier escritura no prevista. No se modificaron perfiles reales. Capturas y logs privados en `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\perfil-danza-20260906`; la imagen inicial `danza-before-390.png` muestra datos ficticios de la reproducción histórica.

Se siguió la guía de Supabase: changelog actual revisado, sin cambios incompatibles relevantes para este uso de REST; contrato de [retorno de la fila actualizada en PostgREST 14](https://docs.postgrest.org/en/v14/references/api/preferences.html#return-representation) contrastado. Se mantuvieron los permisos existentes: los guardas del frontend no son autenticación ni sustituyen RLS. Una actualización necesita también visibilidad SELECT; no se amplían permisos para resolver una respuesta vacía.

Fuera de los tests se realizó **una lectura mínima real**, GET de `perfiles?select=id,campos_especificos&limit=0`: HTTP 200 y cero filas. Confirma que la selección de columnas es admitida, sin traer IDs, campos o nombres de personas. No valida una escritura real ni certifica RLS. Ninguna función de Netlify ni email se ejecutó como parte de esa lectura.

## Límites y publicación

Sin cambios de esquema, permisos, Auth, funciones, manifest, asset links, código Android, URLs de destino ni dependencias. Se prepara caché local `buscarte-v13-2026-09-06-perfil-danza`. No se publicó este bloque ni Marketplace; la última producción verificada en el turno anterior fue Inicio + perfil/chat (`6a9cd36de8ea461b8c4b7063`, fuente `a441167`, caché v11). No se declara una nueva comprobación remota del estado de Netlify en este bloque.

Pendientes delimitados: app instalada/dispositivo físico y teclado nativo; escritura real con una cuenta de prueba autorizada; búsqueda textual sobre históricos nunca editados con aliases contradictorios; elección de rubro basada en caché y flujo de cambiar rubro, que no se reconcilió automáticamente porque anularía el cambio explícito actual. Una caché con rubro desconocido ahora bloquea el guardado para no escribir campos vacíos por accidente. El botón histórico Descartar sólo oculta la barra, no revierte campos: no se cambió ese comportamiento ni se lo hizo visible en mobile. Completitud aún evalúa la presencia del JSON en vez de sus opciones (`'{}'` cuenta como contenido), deuda del próximo bloque de completitud. Foto/otras acciones de cuenta conservan sus flujos anteriores.

No se hicieron migraciones ni limpieza masiva de datos históricos. La corrección normaliza únicamente los campos visibles cuando el usuario guarda su propio formulario. Onboarding/completitud progresiva, disciplina principal, múltiples rubros, roles técnicos, engagement y rediseño general permanecen como bloques separados.
