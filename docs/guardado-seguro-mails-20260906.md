# Guardado seguro + mails — corte autorizado

El usuario autorizó reparar, terminar los mails y publicar, con validación local mínima. Base `58e48fd`, rama `codex/guardado-seguro-20260906`.

## Reparación

- El editor pide confirmar la contraseña actual, sólo en memoria para esa operación. Se borra al terminar/cancelar/cambiar de cuenta y no se incorpora a URLs, logs ni almacenamiento local.
- Nueva función `guardar-perfil`: verifica email/contraseña mediante la RPC existente `login_usuario`, deriva el ID de esa respuesta y exige coincidencia con el perfil editado. Rechaza cuenta suspendida, identidad ajena, campos no editables, cuerpos grandes y orígenes ajenos. Límite de solicitudes por IP y deadline total de 15 segundos.
- El PATCH sale sólo del servidor con la clave privilegiada existente. Se confirma fila, ID y géneros/campos/foto/rubro enviados. No se abre RLS ni se crea una sesión/migración Auth nueva.
- Fotos: verificación antes de subir bytes y confirmación autenticada de la URL del mismo proyecto/bucket/propietario. Se conserva la subida existente; no es una auditoría integral de Storage.
- Se conserva el selector histórico de un único rubro entre los diez existentes. No se introducen multirrubro, categorías nuevas ni cambios de tipo de cuenta.
- `SUPABASE_SERVICE_KEY` está configurada en producción y enmascarada para el CLI. `SUPABASE_URL` no está configurada: la función nueva usa el mismo fallback de proyecto que el editor/reset existentes. No se cambió configuración global ni se expusieron claves.

## Mails y validación

Bienvenida y recordatorio ya preparados, mostrados y recibidos por el usuario se incluyen en este corte. Sin nuevas muestras ni cambios en selección, frecuencia o las otras tres funciones existentes. No se publican los borradores de Resend; se publica el código de los templates.

- 13/13 comprobaciones acotadas servidor/editor, ~7 segundos: propietario correcto/ajeno, contraseña, ban, cancelación, cambio de cuenta, foto, datos inválidos y confirmación. Red simulada.
- 136/136 contratos de correo en ~3 segundos; sin repetir renderizados visuales previos ni envíos reales. Los guards históricos de mail excluyen explícitamente sólo editor/SW por esta reparación separada.
- Build: 36 archivos públicos, caché v17. Sin cambios de dominio/manifest/Android, base de datos, registro/login o funciones programadas.

Comando vigente para el nuevo transporte: `node --test scripts/guardar-perfil-servidor.test.mjs scripts/perfil-guardado-seguro.test.cjs` (`npm run test:guardado-seguro` donde npm esté disponible). Las suites históricas de guardado/progreso que simulan PATCH directo necesitan adaptar ese transporte; no se ejecutó ni se declara aprobada la regresión completa anterior.

## Publicación

**Publicado el 6/9/2026 a las 17:38:25 ART**, deploy `6a9dcf37d0aeb9991f8eb446`, fuente `b1d35dd`, v17. Confirmado activo/ready/production en `https://buscarte.com.ar`. Un único deploy autorizado, sin preview ni push. [Deploy y logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9dcf37d0aeb9991f8eb446).

Verificación mínima en producción: GET de editor y SW 200; scripts inline idénticos a la fuente revisada; v17 presente. Una operación `verify` con identidad ficticia de dominio `.invalid` y contraseña aleatoria fue rechazada con 401/no-store, comprobando configuración privilegiada aceptada y conexión a la RPC de login sin actualizar perfiles. No se ejecutó ningún guardado real desde herramientas ni se enviaron más correos. La prueba positiva con la cuenta/contraseña del usuario queda a su cargo.

Cinco funciones en nodejs24.x: `guardar-perfil` nueva y `send-email` actualizada; hashes binarios de `recordatorio-perfil`, `resumen-mensual` y `reset-password` idénticos al deploy anterior. Ambos horarios idénticos. Las dos plantillas nuevas están publicadas; no se cambió selección/cadencia ni se activó otra campaña. Evidencia privada y bundle previo: `../../BuscARTE-resguardos/guardado-seguro-20260906/`.

Reversión de código si fuera necesaria: primero comprobar el deploy activo, luego restaurar el anterior `6a9db430d7eed8dbdc9489d2`; esa versión conserva el bloqueo original de edición. No hay migraciones ni datos que revertir. Una prueba positiva con la contraseña/cuenta real queda a cargo del usuario; no se solicitaron credenciales ni se escribieron sus datos desde herramientas.
