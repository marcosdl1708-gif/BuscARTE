# Engagement recurrente — 25/10/2026

## Alcance del corte

El responsable autorizó novedades cada quince días y recordatorios sin límite del primer mes. Este corte prepara v34 desde `ca70f1e`, conservando los cambios públicos v33 y la guía/preview ajenas. No modifica campañas pagas, Android, Auth, credenciales ni planes.

La política de Resend exige permiso para las comunicaciones promocionales y no acepta asumirlo hasta una baja: [Acceptable Use Policy](https://resend.com/legal/acceptable-use), [Email consent](https://resend.com/blog/how-to-properly-get-email-consent). Por eso **no se ejecuta la parte de la solicitud que inscribiría a todas las cuentas sin permiso ni se revierten bajas**. No se cambia marketing_opt_in de cuentas existentes. Las doce preferencias activas anteriores conservan su frecuencia mensual y la evidencia previa no se inventa.

## Comportamiento

- Primeros recordatorios con las claves 48h y 7d anteriores.
- Desde los 21 días de antigüedad, seguimiento cada catorce días, sin fecha final mientras el perfil siga incompleto y no se haya cancelado.
- Sólo se genera el ciclo vigente; no se acumulan ciclos de meses pasados al activar o recuperarse de una caída.
- El worker revalida los datos actuales, baja, perfil completo, dirección y restricciones. El intervalo mínimo entre seguimientos es catorce días incluso con retrasos; entre otros engagement, siete.
- Las cuentas históricas desconocidas no se convierten en suscriptores al cambiar el nombre de la etapa. Pueden activar ayuda del perfil por separado mediante una elección expresa, que queda documentada con versión y fecha del servidor.
- Las novedades quincenales usan ciclos de quince días reales desde el 25/10/2026 a las 10 ART, con altas, anuncios y próximos eventos del período. Un período sin contenido no genera correo vacío. El resumen mensual sigue independiente para quienes eligieron ese límite.
- La separación se comprueba también al reservar: al menos quince días entre newsletters quincenales; como máximo una newsletter por mes calendario argentino para preferencias mensuales, incluso en el endpoint interno genérico.
- Registro nuevo comunica la frecuencia de quince días y guarda aceptación o rechazo; un cliente antiguo sin frecuencia conserva mensual. El perfil permite mensual/quincenal, mantiene las opciones al fallar y no cambia nada al cargar.

## Presupuesto y datos

Engagement sube de 20 a **40 intentos diarios** y de 600 a **1.200 mensuales**. Se conservan los 70 acumulados para correos no-reset, los 90 globales diarios y 2.700 mensuales, el margen para recuperación, pacing, leases, idempotencia y cuarentena de intentos ambiguos. No se eluden límites mediante nuevas cuentas o claves.

Migración local `20261025143023_recurring_engagement_frequency.sql`; remota **`20261025144733`**, aplicada a las **11:47 ART** con preflight de la definición vigente. Agrega frecuencia y evidencia a la tabla privada, conserva RLS/ACL y reemplaza sólo la reserva de mail. Tras aplicarla: 351 perfiles, las mismas 18 filas de preferencias (12 marketing sí, seis no, cuatro recordatorios desactivados), todas mensuales por defecto, cero nuevas evidencias y cero trabajos pendientes. Los demás procedimientos protegidos conservan sus hashes.

No se importan contactos a Resend, no se usa Broadcasts en este corte y no se envía una campaña real de prueba. Todos los envíos continúan por la cola compartida. No se tocan mensajes históricos ni las notificaciones directas desde la base.

## Verificación

**246 comprobaciones aprobadas, sin omisiones:** 214 de planner, runtime, templates, endpoints, registro, UI y empaquetado; 21 SQL PostgreSQL/WASM; siete de privacidad en navegador y cuatro del formulario real. Incluyen meses de antigüedad, ciclos omitidos, reactivación sin duplicados, privacidad de preferencias, cliente mensual antiguo, evidencia explícita, baja/completitud mientras se espera, bordes de mes UTC-3, separación y prioridades. El control histórico de ayuda empieza desmarcado si requiere una elección nueva; guardar otra opción o usar un cliente antiguo no inventa evidencia. No se agregaron advertencias nuevas en Advisors.

Build de 75 archivos permitidos. Evidencia privada: `../BuscARTE-resguardos/engagement-recurrente-20261025/`, `email-preferences-browser-2026-10-25T14-48-36-436Z/` y los resultados finales de los fixtures. No se crearon cuentas ni mensajes de prueba en producción. La prueba física del usuario permanece separada.

## Publicación comprobada

Único deploy Git CD **`6ade17731d03bbad9793c390`**, fuente **`d7ba5a1b721663e7089e982492cae936dd1e8f55`**, publicado a las **11:51:50 ART** del 25/10. Caché v34. Se compararon 74 recursos reales con el build, 35 rutas y cuatro exclusiones privadas 404. Seis controles GET de endpoints rechazaron identidad, tokens o métodos ausentes con sus estados esperados, sin enviar correos.

Netlify confirmó 13 funciones Node 24 y exactamente los tres horarios anteriores: worker cada cinco minutos, planner diario a las 10 ART y resumen mensual el día 1 a las 10 ART. El escaneo de 233 archivos no detectó secretos. Las fuentes de sesión, worker, manifiesto y configuración de cron no cambiaron; los paquetes compartidos de correo sí se actualizaron. El siguiente disparo natural del planner y los nuevos seguimientos futuros no se presentan como envíos ya realizados.

La documentación se cierra con `[skip netlify]`, sin otro deploy. Los cambios locales ajenos de guía y `preview/` permanecen fuera de los commits.
