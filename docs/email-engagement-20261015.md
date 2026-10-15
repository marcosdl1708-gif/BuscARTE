# Emails y engagement — 15/10/2026

Implementación autorizada con «go», sobre `4e2fd1c` (incluye el arreglo móvil publicado hoy). El corte cambia sólo correo, registro/preferencias y su caché; conserva los contratos de cuentas y sesiones.

## Presupuesto y entrega

- Un único transporte en `netlify/lib/mail-runtime.mjs` para bienvenida, mensajes, contacto/reporte, recuperación y engagement.
- Techo de 90 intentos diarios de BuscARTE sobre los 100 de Resend; engagement máximo 20/día. Techo mensual 2.700 intentos y 600 de engagement. Se cuentan también intentos ambiguos y reintentos, sin devolver capacidad por un rebote.
- Día y mes UTC: el día reinicia a las 21:00 ART. Reserva atómica en PostgreSQL, prioridades, lease de 90 segundos y separación global de un segundo entre intentos.
- Los eventos se guardan antes de intentar enviar. Identificador de Resend estable y payload congelado en reintentos; después de 23 horas con resultado ambiguo pasan a revisión, sin reenviar fuera de la ventana de idempotencia del proveedor.
- La clave existente conserva su permiso de envío. El modo normal utiliza contador duradero, bootstrap explícito y cabeceras `x-resend-daily-quota` / `x-resend-monthly-quota`; los máximos observados nunca reducen el contador. Un 429 de cuota pausa hasta el reinicio. La lectura `/usage` sólo se usa si existe una clave opcional específica ya configurada.
- Bootstrap: lectura del panel al activar, 3 envíos diarios. El piso mensual se inicializó conservadoramente en 131, el mayor número observado en la auditoría, aunque Usage mostraba 3. No se cambiaron plan ni claves. Recepción está desactivada y se observó una sola clave. Emisores ajenos a la cola pueden consumir el margen; Resend conserva su límite efectivo de 100 y la cola difiere ante su rechazo.

## Secuencia y preferencias

- Bienvenida con acción principal de completar perfil para artistas, presentación de espacio/servicio para negocios y exploración para visitantes.
- Recordatorios artísticos a partir de 48 horas y siete días, con los mismos cinco básicos del editor, datos faltantes reales y validación al reservar. Se detienen al completar, darse de baja, cambiar email, bloquear o eliminar la cuenta.
- Reactivación histórica única sólo con opt-in explícito; no se reprodujo retroactivamente toda la secuencia. Los resúmenes alcanzan a todos los suscriptores elegibles, con paginación y cola; se eliminó el recorte fijo de los primeros 90.
- Marketing opcional y desmarcado en las tres altas. Preferencias independientes en el perfil para novedades y ayuda de completitud. Las cuentas históricas no se convirtieron automáticamente en suscriptoras.
- GET de baja muestra confirmación sin modificar preferencias; POST firmado aplica la baja, compatible con RFC 8058. No afecta recuperación, seguridad ni mensajes.
- Enlace de acción firmado, clic registrado y asociación de completitud dentro de siete días. Un clic puede ser de un escáner y la asociación no acredita causalidad. `sent` en la cola significa aceptado por Resend, no bandeja principal ni lectura.
- Plantillas con preheader, texto alternativo, HTML de tablas, mejor contraste y enlaces canónicos. Composición revisada a 375/600 px; revisión nativa Gmail/Outlook pendiente.

## Base y verificación

Migración aditiva local `supabase/migrations/20261015121825_email_engagement_queue.sql`, aplicada mediante MCP con versión remota `20261015124058`. No ejecutar `db push/pull`: la carpeta conserva un archivo parcial de migraciones. Tablas y RPC exclusivamente `service_role`, RLS activo y privilegios públicos revocados. Borrado de cuenta elimina sus correos/preferencias mediante FK CASCADE.

177/177 comprobaciones de código, seguridad y empaquetado; 25/25 SQL aisladas en PGlite, incluidos 29 casos de coherencia de básicos; 31 controles de interfaz con datos ficticios. Límites diarios/mensuales, leases y permisos también verificados en PostgreSQL real dentro de BEGIN/ROLLBACK, sin filas de prueba retenidas ni llamadas a Resend. PGlite y esa comprobación no simulan dos sesiones PostgreSQL reales compitiendo en paralelo; las reservas usan el mismo mutex transaccional para todos los caminos.

Tras migrar: 333 perfiles, hashes de registro/reset/límites anteriores iguales; cola y preferencias vacías. Auditoría de seguridad sin advertencias nuevas: cuatro avisos informativos de tablas privadas con RLS sin políticas son deliberados; `unaccent` en public es una advertencia previa.

Cron: generación de recordatorios diaria 13:00 UTC; resumen día 1 13:00 UTC; despacho cada cinco minutos. El despacho de engagement sólo ocurre entre 10:00 y 18:59 ART. El paquete publica sólo los 70 archivos revisados en `dist/`, nunca documentos, backups o credenciales.

## Publicación confirmada

Publicado a las **09:44:52 ART**, fuente `0c352d9492995b67a2577ec56582a5829af07cd6`, deploy `6ad0cab54252a45ecea3bfa6`, caché v28. Once funciones Node 24 y tres cron coinciden con el corte revisado. Escaneo de 189 archivos sin coincidencias de secretos. GitHub rechazó inicialmente una cadena sintética del fixture; se construyó esa cadena en la prueba y se reemplazó únicamente el commit local no publicado, sin excepciones al escaneo ni force push.

69 recursos servidos, 35 rutas y cuatro exclusiones comprobados contra el build; nueve controles públicos de funciones aprobados (incluido 403 de protección Netlify para el worker programado). Ningún envío de prueba. Cola/preferencias vacías; presupuesto inicial 3/131 sin consumo nuevo en la verificación; 333 perfiles y hashes de los procedimientos anteriores conservados. El siguiente envío natural y el render nativo de los clientes de correo siguen pendientes de validación, sin atribuirles una prueba no realizada.

Evidencia y vistas sintéticas privadas en `../BuscARTE-resguardos/auditoria-emails-20261015/`. Cierre documental con `[skip netlify]`, sin un segundo deploy. La copia canónica conserva sus cambios ajenos de guía/preview; trabajo aislado en `../BuscARTE-web-emails-20261015`.
