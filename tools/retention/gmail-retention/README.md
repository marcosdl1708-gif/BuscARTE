# Conservación administrativa en Gmail — activa con selección manual

Estado actual del 15/10/2026: **`ACTIVE` en `buscarte.webmail@gmail.com`, con un único activador diario `dailyRetention` basado en tiempo**. `setupRetention()` a las 13:03:47 ART confirmó `accountVerified:true`, `missingLabels:[]` y `triggerInstalled:true`. La pasada supervisada de las 13:04:35 ART informó `examined:0`, `errors:0`, `limitExceeded:false`, `stoppedForBudget:false`, `movedToTrash:0`, `restoredFromTrash:0` y `manualReviewRequired:false`. La tabla Activadores mostró una sola fila del ejecutor diario.

Está activo el mecanismo **opt-in**: sólo alcanza casos comunes elegidos por el operador, con cierre explícito. No se clasificó ni retiró correo histórico, ni se examinó el buzón completo. Con cero casos seleccionados, esta primera pasada verifica la configuración y ejecución sin errores, no un retiro real ni una garantía de eliminación exacta a los 90 días. Evidencia privada: `BuscARTE-resguardos/retention-manual-20261015/gmail-activation.json`; capturas `release-final-20261015/retention-active-first-run.png` y `retention-daily-trigger.png`.

## Historial previo a la activación

A las 12:56 ART del 15/10/2026, **la auditoría de configuración de las cuatro etiquetas vacías terminó sin alertas**: `accountVerified:true`, `mode:AUDIT_ONLY`, `examined:0`, `planned:{}`, `errors:0`, `limitExceeded:false`, `stoppedForBudget:false`, `movedToTrash:0`, `restoredFromTrash:0` y `manualReviewRequired:false`. No era una auditoría de casos reales: no había conversaciones incorporadas ni registros de retención. En ese momento la limpieza seguía apagada, sin activadores.

La alerta de las 12:47 (`limitExceeded:true`) se diagnosticó con autorización del responsable, sin escribir en Gmail/Properties/triggers. A las 12:55 `diagnoseRetentionReadOnly()` confirmó para las cuatro etiquetas: la máscara anterior `threads(id),nextPageToken` devolvía `null`; al solicitar también `resultSizeEstimate`, el servicio devolvía un objeto con estimación cero. Se corrigió la consulta y su validación conservadora: sólo se acepta ausencia de `threads` si la respuesta contiene cero explícito, nunca se interpreta `null` como vacío; paginación, respuestas malformadas y el máximo de 40 IDs siguen bloqueando la pasada. No se aumentaron límites. Fuente actualizada en el proyecto y comparada con la copia local normalizando finales de línea; manifiesto y permisos sin cambios. Se ejecutaron únicamente diagnóstico y auditoría, no `dailyRetention()` ni `setupRetention()`.

La conexión inicial se comprobó a las 12:41 mediante lecturas de perfil/etiquetas tras el OK de permisos, con `RETENTION_GMAIL_API_ENABLED=true` y `RETENTION_MODE=AUDIT_ONLY`. No se observó la pantalla OAuth con el detalle de scopes en esa ejecución. Con un OK posterior se crearon manualmente las cuatro etiquetas exactas, vacías, sin filtros ni aplicación a mensajes; Activadores mostró 0 a las 12:47 y no se instaló ninguno durante esa preparación. No se clasificaron casos ni se modificó contenido, lectura, archivo o Papelera del correo. **Esos controles previos no equivalían a un inventario completo del buzón ni a conservación activa.** El responsable aprobó posteriormente el cierre seguro y la activación descrita arriba.

Este directorio no está instalado, autorizado ni activado por existir en Git. No forma parte de `site-files.json`, `dist/` ni de las Functions. No gestiona Supabase, Resend, respaldos ni notificaciones normales de la plataforma.

## Alcance y permisos

`Retention.gs` usa el servicio avanzado Gmail v1 para la cuenta exacta `buscarte.webmail@gmail.com`. El manifest pide `gmail.modify` y `script.scriptapp`, no acceso completo `https://mail.google.com/`. **`gmail.modify` es un permiso amplio: Google permite con él leer, redactar, enviar y modificar correo. Este script no envía, redacta, descarga cuerpos ni elimina permanentemente**, pero la pantalla OAuth describe la capacidad del permiso, no sólo las operaciones utilizadas. `script.scriptapp` permite gestionar triggers del proyecto. Revisar y autorizar esos permisos expresamente antes de la primera ejecución; no subir credenciales al repositorio.

Preparación sin OAuth: revisar fuente/manifest, ejecutar las pruebas VM y crear un proyecto vacío. No hace falta autorizar Gmail para esas tareas locales. No desplegarlo como web app ni publicarlo como aplicación externa.

## Operación diaria: Pendiente, Cerrar y Conservar

Las cuatro etiquetas ya están creadas. No recrearlas ni añadir filtros que clasifiquen automáticamente:

- `BuscARTE/Admin/Pendiente`: opt-in para una consulta administrativa común que se está gestionando.
- `BuscARTE/Admin/Cerrar`: el operador confirma que está resuelta; el script registra el cierre cuando lo observa y cambia a Cerrado. Nunca usa la antigüedad, lectura o archivo del mensaje para inferir resolución.
- `BuscARTE/Admin/Cerrado`: estado mantenido por el script. Aplicarla sola no crea una fecha válida de cierre.
- `BuscARTE/Admin/Conservar`: hold sin vencimiento. Usar para obligaciones legales, seguridad, investigación o cualquier caso necesario. No incluir esos casos en la limpieza ordinaria. Después de retirar el hold hace falta cerrar nuevamente de forma explícita.

Recorrido breve del operador:

1. Para una consulta administrativa común que querés incorporar, aplicá **Pendiente** mientras la gestionás. No etiquetes conversaciones mixtas, documentación necesaria o correo ajeno al proyecto.
2. Sólo cuando esté resuelta, retirale **Pendiente** y aplicá **Cerrar**. El próximo ciclo registra cuándo observó el cierre y mantiene **Cerrado**; no apliques Cerrado sola ni uses la edad del correo como fecha de resolución.
3. Si hay que preservar un caso, aplicá **Conservar** y documentá el motivo y su revisión. Para reabrirlo, volvé a **Pendiente**. Tras retirar un hold, revisá el caso y cerralo de nuevo expresamente si corresponde.

Después de 60 días completos desde el cierre observado, un caso que siga elegible puede pasar a Papelera; Gmail normalmente elimina esos mensajes después de otros 30 días. El programa no vacía Papelera ni hace borrado permanente. No hay limpieza retroactiva automática de correos históricos sin selección y cierre manual nuevos.

Una respuesta nueva o volver a Pendiente cancela el cierre. Una etiqueta desconocida bajo `BuscARTE/Admin/`, Spam o borradores impide nuevos retiros. No aplicar las etiquetas a correo ajeno o conversaciones mixtas; el script no puede decidir por el asunto si hay documentación necesaria.

## Procedimiento de instalación o recuperación — ya realizado

No volver a ejecutar instalación ni duplicar triggers por rutina. Estos pasos documentan la activación realizada y sirven para una reinstalación revisada, no son pendientes del estado actual.

1. Revisar este código y los 2 scopes; copiar `Retention.gs` y `appsscript.json` al proyecto de la cuenta correcta y habilitar el servicio avanzado Gmail. Esta configuración por sí sola no instala un trigger.
2. En las propiedades del script, establecer `RETENTION_GMAIL_API_ENABLED=true` y mantener `RETENTION_MODE=AUDIT_ONLY`. Ausencia u otro valor del modo también se interpreta como auditoría. Autorizar OAuth sólo después del OK específico del responsable.
3. Ejecutar `auditRetention()`. Verificar `accountVerified:true`, sin etiquetas faltantes, sin errores/alertas de límites y sólo los casos administrativos que el operador etiquetó. La auditoría no escribe etiquetas, Properties ni triggers, aunque el modo configurado fuera ACTIVE. Los logs muestran sólo contadores, nunca asuntos, emails, cuerpos, IDs de mensajes o errores crudos.
4. Con aprobación de activación, establecer `RETENTION_MODE=ACTIVE` y ejecutar `setupRetention()`. Comprueba nuevamente cuenta y las cuatro etiquetas antes de instalar un único trigger diario alrededor de las 04 ART. No acepta otra cuenta ni repara triggers duplicados automáticamente. Ejecutar una pasada supervisada y revisar el informe, sin marcar mensajes reales como resueltos sólo para hacer QA.

El trigger diario y los informes requieren supervisión humana en Apps Script/Triggers/Executions. No existe un aviso externo garantizado por correo desde este programa. `manualReviewRequired`, `errors`, `limitExceeded` o `stoppedForBudget` requieren revisión; no asumir que el silencio prueba funcionamiento. Límite conservador: 40 hilos/casos, 20 mensajes por hilo para retiros nuevos, 40 movimientos por pasada y 240 segundos. Si el inventario supera el límite o requiere paginación, bloquea la pasada completa sin tocar Gmail. Escalar sólo después de revisar el lote y cuotas; no es un proceso masivo.

## Plazo, recuperación y límites

Tras **60 días completos desde el cierre observado**, el script puede mover los mensajes exactos sin cambios a Papelera. Gmail normalmente los elimina tras **otros 30 días en Papelera**. Es un objetivo operativo aproximado de 90 días, **no una garantía de purga exacta**: los triggers son aproximados y errores, cuotas, límites o suspensión pueden retrasar tanto el retiro como la recuperación. Un hold o reapertura que nadie registre a tiempo no puede impedir un borrado ya realizado por Google.

Antes del primer retiro se guarda una lista exacta permitida; antes de cada llamada se guarda el ID intentado y se revalidan etiquetas/mensajes. Nunca se retira un hilo entero. Si llega una respuesta entre lectura y acción, su ID nuevo no puede entrar al lote. Los casos con mensajes ya manualmente en Papelera no se incorporan al retiro. Gmail no proporciona compare-and-trash atómico: una respuesta/hold que llegue durante el lote puede coexistir brevemente con mensajes anteriores retirados.

Se revalida al finalizar y en las pasadas diarias posteriores. Ante respuesta, Pendiente, Conservar o error parcial se intenta recuperar de Papelera **sólo los IDs intentados por este script**, incluso si la API actuó pero perdió la respuesta. Nunca se recupera un mensaje ajeno que estaba manualmente en Papelera antes del lote. Un fallo de recuperación conserva el diario `recovering` y sólo reintenta recuperación; no nuevos retiros. Al completarse queda abierto o held y requiere revisión/cierre explícito nuevo. La recuperación no puede revivir mensajes que Google ya eliminó permanentemente; una interrupción de 30 días puede volverla imposible. No vaciar Papelera ni borrar el diario de Properties mientras haya casos por recuperar/revisar.

Properties conserva IDs técnicos, huella, fechas y flags, sin contenido del correo; los metadatos tras un retiro completo se retiran después de 35 días. Los estados de recuperación fallida se conservan para revisión. No limpiar Properties como una reparación automática.

## Pausar o desactivar

Para detener cambios nuevos, poner `RETENTION_MODE=AUDIT_ONLY` y eliminar manualmente el trigger `dailyRetention` en Apps Script. **Pausar también detiene las recuperaciones automáticas**: primero ejecutar/supervisar recuperación de casos que deban conservarse o restaurar manualmente en Gmail los mensajes necesarios, antes del vencimiento de Papelera. No revocar permisos ni borrar el proyecto/Properties mientras necesites el diario para esa recuperación. Cuando no queden pendientes, el responsable puede revocar el acceso de la aplicación desde su cuenta Google. El script no cambia otros triggers ni vacía Papelera.

## Pruebas locales y documentación

`node --test tools/retention/gmail-retention/retention.test.cjs` usa VM y Gmail/Properties/tiempo sintéticos; no requiere OAuth, envíos ni red. Resultado: 40/40 PASS, incluidos vacío explícito, respuestas inválidas, límites/paginación, diagnóstico sin escrituras y recuperación de retiros parciales. Las pruebas por sí solas no certifican cuotas reales ni instalación; la activación actual se acredita separadamente con la ejecución y tabla de triggers descritas arriba.

Fuentes oficiales consultadas el 15/10/2026: [servicio avanzado Gmail](https://developers.google.com/apps-script/advanced/gmail), [Threads.list y estimación de resultados](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list), [scopes Gmail y capacidades](https://developers.google.com/workspace/gmail/api/auth/scopes), [Messages.trash](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/trash), [Messages.untrash](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/untrash), [triggers temporales](https://developers.google.com/apps-script/reference/script/clock-trigger-builder), [Papelera y recuperación de 30 días](https://support.google.com/mail/answer/7401?hl=es).
