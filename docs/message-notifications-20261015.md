# Avisos de mensajes insertados en la base — 15/10/2026

El responsable autorizó generar los avisos del lote de invitación a probar Android y automatizar futuros mensajes creados directamente en la base. El trabajo parte de `cde97d1`, conserva v30 y aprovecha el worker publicado; no necesita cambios en HTML, Functions, configuración, claves, cron o Android.

## Mecanismo

Migración aditiva `supabase/migrations/20261015163645_message_mail_trigger.sql`. Un trigger AFTER INSERT en `mensajes` llama a `mail_enqueue_message(bigint)`, con SECURITY INVOKER, search_path vacío y ejecución sólo service_role. Lee el mensaje persistido, valida remitente/destinatario, direcciones y bloqueos; los guards actuales de moderación y términos se conservan.

La clave `message:<id>` coincide con el envío web existente. El primer registro se conserva incluso si ya terminó: un reintento del helper o del hook web no duplica ni revive el aviso. La cola guarda sólo el nombre del remitente para este aviso genérico; no copia el cuerpo del chat. El template publicado muestra «Nuevo mensaje de … en buscARTE» y «Ver mensaje».

Vigencia de 31 días para estos trabajos nuevos, suficiente para repartir un lote de varios cientos bajo el cupo diario. La ventana de reintentos ambiguos de 23 horas y la clave idempotente del proveedor se conservan.

## Cupo y entrega

`mail_reserve` mantiene la reserva atómica y todos los controles previos. Añade un corte en 70 intentos diarios acumulados para correos distintos de recuperación; los reset pueden continuar hasta el techo global de 90. Quedan 20 intentos internos reservados para recuperación y 10 de margen respecto de los 100 diarios del plan Free. No se descuenta un intento ante rechazo, ambigüedad o rebote.

Siguen 2.700 intentos mensuales, engagement 20 diarios/600 mensuales, prioridad de reset y pacing global. El worker continúa cada cinco minutos, hasta cinco trabajos por pasada. El reset diario UTC ocurre a las 21 ART. El lote requiere aproximadamente cinco ventanas diarias, sujeto a otros correos y reintentos; no se promete una fecha exacta ni entrega en bandeja principal.

## Lote autorizado y validación

Se identificaron 333 mensajes persistidos, mismo remitente/contenido y 333 destinatarios diferentes. Hay 332 emails válidos únicos y uno incompleto; ese caso se registra en evidencia privada sin inventar una dirección ni alterar el perfil. El backfill privado verifica IDs, fecha y hash del contenido, aborta ante diferencias y exige 332 avisos únicos. No incorpora otros mensajes históricos ni vuelve a enviar los chats.

Evidencia privada y script acotado en `../BuscARTE-resguardos/db-message-notifications-20261015/`. Los identificadores y la dirección inválida no se publican en este informe. El helper permite recuperar ese aviso después de corregir legítimamente el email.

Validación: **115 regresiones existentes y 18 pruebas SQL PostgreSQL/WASM, todas aprobadas y sin omisiones**. Las pruebas cubren inserción directa y masiva, rollback, reintentos del helper/hook web, permisos, direcciones inválidas, bloqueos, términos, expiración y límites 69/70/89/90, mensual, engagement y pacing. Se ejecutan con `node --test scripts/mail-message-sql.test.mjs` y una ruta de módulo PGlite instalada mediante `BUSCARTE_PGLITE_MODULE`; no añaden dependencias al runtime. Build de 74 archivos permitido. No se crearon mensajes ni cuentas de prueba en producción.

La revisión independiente verificó los permisos, el backfill, deduplicación y que el cuerpo de reserva conserva exactamente el anterior salvo el corte de 70. Se comparó además con la definición remota previa antes de aplicar, abortando ante cualquier desvío. La migración remota es **`20261015164039`**, aplicada a las **13:40 ART**; el trigger está habilitado y sólo service_role conserva ejecución de los helpers. Los otros 31 procedimientos protegidos permanecen idénticos. Advisors mantiene las 13 notas informativas de RLS privado y la advertencia previa de unaccent, sin avisos nuevos.

El backfill terminó a las **13:40:54 ART** con 332 avisos `pending`, sin intentos ni duplicados, 333 chats originales intactos y 334 perfiles preservados. El único excluido es un email incompleto; la constancia privada permite al responsable corregir ese caso y luego llamar al helper con el ID del mensaje. No se alteraron ni reenviaron los chats.

La ejecución automática de las **13:45 ART** tomó la cola y produjo los primeros **cinco avisos aceptados por Resend**, con un intento por trabajo y sin errores. En la cuenta de Resend se observaron al menos **dos como Delivered** durante esa primera tanda; no se confunde la aceptación de los otros con entrega final. A las 13:45:55 había 326 pendientes, uno en procesamiento y cinco enviados; ledger diario 9 y mensual 137. El resto continúa con el worker y los mismos límites. La evidencia privada conserva los IDs de proveedor, sin publicarlos aquí.

Este cierre se sincroniza con `[skip netlify]`: no hay un deploy nuevo ni cambio de SW, sitio, Functions o cron. El deploy activo continúa siendo v30 `6ad0fae5a6b2bf2faf664a7a`. La guía ajena y `preview/` se preservan.

`sent` y un `resend_id` prueban aceptación por el proveedor; `Delivered` se comprueba por separado en Resend.
