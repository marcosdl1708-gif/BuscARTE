# Muestras reales de bienvenida y recordatorio

6/9/2026, autorización específica del usuario y destino indicado en conversación. Se enviaron exactamente dos muestras a su correo, ninguna a otras personas. Ambas figuran **Delivered** en el panel Resend, con prefijo automático `[TEST]` en el asunto. Destinatario, IDs, borradores y evidencia privada: `../../BuscARTE-resguardos/muestras-correos-20260906/RESULTADO.md`.

Se usaron dos borradores claramente identificados como MUESTRA en Resend, sin publicarlos ni conectarlos a la aplicación/campañas. HTML de los templates aprobados en `6ed7642`, nombre Marcos y dominio público correcto. Antes de cada envío se compararon tags, estilos, texto y enlaces después del reformateo de espacios del editor. No son nuevos envíos del alta ni de la tarea programada; esa integración aún requiere publicación y comprobación separada.

La CLI Netlify existente devolvió la clave de correo enmascarada; no se crearon claves ni se intentó eludirlo. Las guías de navegación/Netlify y la [documentación de pruebas desde borradores](https://resend.com/docs/dashboard/templates/create-template) orientaron la alternativa por UI. El script privado de envío API quedó deshabilitado, sin haber enviado correos.

**Pendiente del usuario antes del deploy conjunto:** abrir ambos en Gmail móvil, comprobar legibilidad/sin recortes y probar Explorar artistas → rubros y Completar mi perfil → login → perfil/completitud. Delivered no confirma bandeja principal ni diseño/lectura/clics. No enviar otra muestra ni publicar automáticamente.

**Actualización posterior:** el usuario confirmó que llegaron, pero reportó un fallo real de guardado del perfil. El deploy queda pausado por ese incidente, diagnosticado en `diagnostico-guardado-perfil-20260906.md`. No tomar la recepción como validación de diseño móvil ni de la integración del editor; no reenviar.

No cambió código ejecutable, funciones, configuración, destinatarios/cadencia, audiencia/supresiones, datos/Auth ni Android. No hubo deploy/preview/push. Las plantillas mejoradas continúan locales; los borradores no actualizan producción. No se repitieron suites funcionales porque el código permanece idéntico al QA 191/191. Identidad visual y multirrubro postergados; roles técnicos como subrubros por evaluar; guía integral de app física al cierre de lo acordado.
