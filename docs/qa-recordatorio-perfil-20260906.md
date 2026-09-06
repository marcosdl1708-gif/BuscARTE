# QA — recordatorio de perfil con una acción clara

Preparado sólo en local el 6/9/2026 tras la auditoría Resend y el «go» del usuario. Rama `codex/recordatorio-perfil-20260906`, base `9b75b238cb89fa88b2a355fc926aa6e1639a0a34`, implementación `bdf652f5711e63d4bf4929d12d694ce29d52a0f1`.

## Alcance

Único cambio de producto: rama `perfil_incompleto` en `netlify/functions/send-email.js`. Asunto «Dale forma a tu perfil en buscARTE», título «Mostrá qué hacés.», foto/presentación opcionales y un botón «Completar mi perfil». Elimina «casi listo», «te falta poco» y «hasta 3 veces más visitas», sin diagnosticar faltantes precisos ni inventar porcentajes. Texto no restringido a música.

El botón usa `/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar`, contrato existente que conserva el hash hasta el perfil. Se aclara ingresar con email/contraseña; no promete auto-login si ya existía sesión. Nombre sólo string, trim/límite80 y HTML escapado; dato ausente/inválido da «Hola.». El caller programado conserva su fallback previo `artista` cuando falta nombre: no se modifica ni se afirma haber neutralizado ese comportamiento upstream.

Todo fuera de esa rama permanece idéntico a la base, normalizando sólo EOL: bienvenida local, seis plantillas restantes, helpers comunes, handler, variables, destinatario y transporte. Las otras tres funciones, horarios, configuración, dependencias/lockfile y los 36 archivos públicos no cambiaron. No se tocó Auth, esquema, datos ni Android. Las guías Functions/Supabase orientaron pruebas con VMs/credenciales ficticias; no se migró firma de handler/entorno ni se consultó la base para probar un template. Changelog revisado sin cambios de API aplicables a este alcance.

## Verificación final

**191/191 aprobadas**, cero fallos/omitidas, en la ejecución definitiva de `verify-local.cjs` (resguardo privado):

- 67 contratos/contenido de bienvenida + 69 de recordatorio + 15 empaquetado: 151/151.
- 20 visuales de bienvenida + 20 de recordatorio, ejecutadas separadamente con directorios distintos: 40/40.
- `node --check`, `git diff --check`, comparación pública/configuración/otras funciones frente a `9b75b23` y build36 correctos. Los 36 archivos de dist coinciden byte a byte con sus fuentes.

La nueva suite compara exactamente 21 salidas de las otras siete plantillas, nombres inválidos/maliciosos/largos, asunto fijo, único enlace, payload y destinatario, secreto, errores y ausencia de reintentos. Comprueba los 36 archivos públicos y horarios sin cambios. Cuatro controles negativos en memoria rechazan asunto/enlace/fallback históricos y una alteración ficticia de bienvenida. Su guard estricto compensa explícitamente la exclusión del recordatorio aprobado en la suite histórica de bienvenida; no se reemplazó su baseline ni se dejaron las otras plantillas sin cobertura.

Visuales: 320/360/390/600/1280 px × nombre normal/ausente/80W sin espacios/HTML malicioso. CTA48px, contraste nuevo mínimo8,52:1, saludo exacto, un solo destino, cero overflow de viewport/glyphs, superposiciones, ejecución de HTML, errores o solicitudes. Se revisaron directamente capturas normales320/390/1280 y nombre largo320. Corrida visual independiente adicional20/20. Sólo HTML sintético; toda la red/WS/service workers bloqueados y enlaces no activados.

La primera corrida de contratos tuvo dos fallos del arnés, corregidos sin cambiar el producto: se comprobaba `100%` del CSS como si fuera estadística, y se asumía por extensión que `og-image.jpg` era binario, cuando es un SVG heredado con EOL de Windows. Ahora se revisa texto visible y firmas PNG/JPEG para distinguir binarios de texto; el asset no se modifica. Saludo inválido reforzado a primer párrafo exactamente «Hola.».

No se repitieron todas las suites funcionales web: sus fuentes/contratos están comprobados sin cambios; no se presenta esta corrida como una nueva validación de los 412 casos del release anterior.

## Límites y próximo corte

- No hay entrega real probada ni certificación de Gmail/Outlook/Apple Mail, reescrituras de enlaces o app física. Requiere muestra controlada con autorización y guía de usuario nuevo al cierre del trabajo acordado.
- Footer común heredado conserva12px/#555 y contraste2,66:1. No se aprueba como accesible ni se cambia aquí porque afecta a todos los correos.
- Selección sigue en altas7–14d con foto/bio faltante o bio<10, sin filtro de tipo de cuenta: no equivale a los cinco básicos, personalización ni compatibilidad integral de negocios/visitantes. Cadencia lunes10ART intacta. No se agregan bajas, deduplicación, reintentos, preferencias, métricas o campañas.
- Fall-open de autorización ante configuración/fallos, supresiones/bajas y límites compartidos son pendientes previos a ampliar envíos. Ver `auditoria-correos-20260906.md`.
- **Sin deploy, preview, push ni envíos reales.** No se volvió a consultar producción en este bloque; último deploy verificado `6a9db430d7eed8dbdc9489d2`/v16 no contiene las nuevas plantillas. No confundir dist estático idéntico con funciones publicadas. Proponer un único corte bienvenida+recordatorio después de muestra controlada autorizada, verificando cambio esperado sólo en send-email y conservación de las otras funciones/horarios. No sincronizar main accidentalmente.

Evidencia privada `../../BuscARTE-resguardos/recordatorio-perfil-20260906/`: `verification-final/summary.json`, logs y dos carpetas visuales; revisión independiente `visual-agente/` y su log. Fuente probada SHA-256 bytes locales: `09be4243b970c0b4cfa495212ce8cc90b264e9289d29ee3d59deb8ac60432152`. Bundle y límites en `RESGUARDO.md` privado. No publicar esos artefactos. Decisiones restantes en `feedback-mobile-seguimiento-20260906.md`.
