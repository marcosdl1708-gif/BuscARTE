# Auditoría de bienvenida y recordatorios — Resend

Consulta del 6/9/2026 autorizada por el usuario antes de continuar los mails. El usuario inició sesión; sólo se leyeron panel, filtros, métricas, uso, dominio y muestras de correos de sistema. No se enviaron mails ni se modificó configuración/producción.

## Conclusión

**Resend está enviando bienvenida, recordatorios, resumen mensual y avisos de mensajes.** El dominio y sus registros de envío están verificados. Hay rebotes y supresiones activas que deben respetarse. Los errores de API filtrados en el período no devolvieron resultados, pero eso no demuestra que todas las altas lleguen al proveedor ni que los destinatarios lean los correos.

La nueva bienvenida continúa local, sin publicar: se observó el asunto/plantilla antigua entre los envíos reales. Los recordatorios reales conservan la plantilla anterior, incluido el enlace a perfil sin retorno por login y la afirmación sin respaldo de visitas. El detalle agregado de fechas, cantidades y límites está en el informe privado `../../BuscARTE-resguardos/auditoria-resend-20260906/RESUMEN.md`; no copiar listas de destinatarios al repo.

## Qué hay que mejorar

1. **Contenido/enlaces:** primero corregir la utilidad del recordatorio, conservando alcance y frecuencia. La bienvenida preparada requiere muestra controlada en clientes reales antes de cerrar su publicación.
2. **Elegibilidad:** el recordatorio sólo selecciona altas de 7–14 días con foto/bio faltantes o bio menor a diez caracteres; no los cinco básicos del perfil. Revisar roles/preferencias antes de ampliar.
3. **Cobertura y límites:** el resumen toma los primeros 90 por antigüedad sin rotación. El límite diario de Resend es compartido; reservar margen para bienvenida/mensajes/reset. No reemplazar el recorte por envío masivo automático.
4. **Bajas y seguimiento:** estos callers no conservan IDs, no usan idempotencia ni webhooks; Resend sí mantiene supresiones por rebote. La invitación a responder para darse de baja no equivale a un sistema de exclusión implementado en estas funciones. No se verificó gestión manual externa de respuestas.

Fuentes: `netlify/functions/recordatorio-perfil.js:16`, `netlify/functions/resumen-mensual.js:54` y `:94`, `netlify/functions/send-email.js:280` y `:354`, `buscARTE_registro.html:1257`, `buscARTE_mensajes.html:754`, `netlify.toml:22`. Frente a e4783b7, ff7e959 sólo cambia bienvenida; la auditoría no modifica ninguna fuente ejecutable.

Las guías de Functions/Supabase se aplicaron al límite de sólo lectura: no ejecutar tareas programadas ni consultas de usuarios para probar envío, no cargar claves reales en arneses ni mezclar Auth/migraciones con un diagnóstico de correo. La lectura de Resend se hizo mediante navegador, sin crear credenciales.

## Decisiones de producto vigentes

- Roles técnicos: evaluar como especialidades/subrubros dentro de rubros existentes, no un rubro nuevo por defecto.
- Identidad visual postergada, al igual que multirrubro/principal.
- Al cerrar los bloques acordados, entregar al usuario una guía integral de una pasada desde una cuenta nueva para validar físicamente la app. No sustituirla por tests sintéticos ni hacer contactos reales automáticamente.

La auditoría está terminada; las correcciones propuestas necesitan su siguiente autorización. No hubo deploy/push, altas, envíos, campañas, cambios de horarios/supresiones/planes ni escrituras remotas.

### Actualización posterior — recordatorio local autorizado

El usuario autorizó continuar con «go». Implementado únicamente contenido/enlace del recordatorio en `bdf652f`; ver `qa-recordatorio-perfil-20260906.md`. Bienvenida y recordatorio nuevos siguen sin publicar ni enviar pruebas reales. Esta actualización no altera las observaciones históricas del panel, límites ni prioridades previas a ampliar envíos.
