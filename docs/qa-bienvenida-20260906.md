# QA — bienvenida útil después del alta breve

Implementación **sólo local**, 6/9/2026: rama `codex/bienvenida-20260906`, base `e59623a`, cambio `2d0f65dbe31a5e76f3234b03ad5d03ff4d3adb67`. Autorizada después del deploy de coherencia; no incluida en él. Producción se volvió a comprobar activa en `6a9db430d7eed8dbdc9489d2` a las 15:51 ART, con las cuatro funciones y horarios anteriores.

## Cambio acotado

Sólo la rama bienvenida de `netlify/functions/send-email.js` cambia el correo. Asunto fijo «Ya estás en buscARTE. ¿Por dónde empezamos?», saludo seguro, confirmación del perfil **inicial**, exploración como acción principal y completar foto/presentación a su ritmo como secundaria. Lenguaje válido para todos los rubros, sin promesas de ranking o métricas sin respaldo.

1. Explorar artistas → `/index.html#explorar`, selección de diez rubros. La búsqueda sin parámetro anterior depende de la caché y puede abrir Música por defecto; el ancla de la Home legacy tiene otro significado.
2. Completar mi perfil → `/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar`. El perfil directo sin sesión devuelve a Inicio; el login existente admite este retorno y conserva el hash. Se aclara que debe ingresar con su email/contraseña, incluso si ese navegador ya tenía sesión. No se implementó auto-login ni se editó Auth.

Se conserva `datos.nombre` del alta artística, limitándolo a string/80 caracteres y escapando HTML; ausente/inválido produce «Hola.». No se agregan rubro, email, IDs, tokens ni URLs aportadas por la persona al template. Asunto sin interpolación de nombre.

Handler, variables, remitente/destinatarios, frecuencia, helpers `brandShell`/`cta`, consultas, horarios y los otros siete correos permanecen idénticos. Sólo se agregan dos suites y comandos npm, sin dependencias ni cambios de lockfile. Las guías de Functions/Supabase orientaron el aislamiento con entornos ficticios; no se migró la firma del handler ni se cargaron variables reales para probar.

## Verificación

- **105/105 en una corrida final**, 6,1 segundos, cero fallos/omitidas: 70 contenido/contratos + 20 visuales + 15 empaquetado.
- 70 casos VM: guardia de todo el archivo fuera de bienvenida; 21 equivalencias exactas de las otras siete plantillas; nombres nulos/incorrectos/HTML/acentos/largos/CRLF; dos destinos; mismo transporte y destinatario; errores/no reintentos; caller/cadencias idénticos; login legacy/Auth local simulado y rechazo de redirects externos. Control negativo anterior sólo en memoria: 16 fallos esperados sobre la bienvenida vieja.
- 20 visuales: 320/360/390/600/1280 px × nombre normal/ausente/largo sin espacios/HTML malicioso. Saludo exacto, no inyección, dos acciones ordenadas de al menos44 px, sin overflow de viewport/glyphs, contraste nuevo mínimo8,52:1. Capturas de móvil normal/largo y escritorio revisadas directamente.
- Corrida visual independiente final20/20 (7,4 s). Una corrida intermedia quedó19/20 por `Page.captureScreenshot: Unable to capture screenshot` en el primer PNG. Se preservó evidencia, se agregó espera de fonts/dos frames antes de capturar y se volvió a verificar sin tolerar el error ni relajar aserciones. También se hizo explícita la comprobación de «Hola.» para impedir falsos positivos por la palabra «artistas» en el cuerpo.
- `node --check`, `git diff --check` y build36 correctos. Archivos públicos estáticos, manifest, assetlinks, SWv16, Auth y las otras tres funciones sin diferencias respecto del release.
- Lectura HTTP sin ejecutar scripts de las dos entradas ya publicadas: index.html devuelve200; login.html conserva exactamente `redirect=buscARTE_perfil.html%23completar` al301 hacia `/buscarte_login`, que devuelve200. No se hizo login real.

Las VMs sólo reciben credenciales ficticias y fetch inyectado; no usan el entorno real. El navegador renderiza HTML sintético con **toda la red, WebSockets y service workers bloqueados**, sin activar enlaces. Cero solicitudes reales durante las suites, cero envíos/cuentas/mensajes de prueba. La comprobación HTTP separada sólo leyó HTML estático público.

```sh
node --test scripts/bienvenida.test.cjs scripts/bienvenida-visual.test.cjs scripts/build-site.test.mjs
node scripts/build-site.mjs
```

La suite visual exige salida fuera del repo y directorio nuevo, con `BUSCARTE_QA_OUTPUT` opcional. Por defecto crea uno fechado en el resguardo privado. Nunca publicar PNG/HTML de QA. Los nombres son sintéticos y los enlaces del HTML de prueba usan un dominio `.invalid`.

## Límites y siguiente paso

- Edge no certifica Gmail, Outlook, Apple Mail, sus versiones móviles, modo oscuro forzado ni reescrituras de enlaces. Falta muestra controlada en clientes reales/cuenta autorizada; no hay prueba de entrega.
- Footer compartido heredado: 12px/#555, contraste2,66:1. No se aprueba como accesible ni se modifica aquí porque afectaría a todos los mails. Revisarlo en un bloque común separado.
- Bienvenida sigue disparándose sólo en el alta artística, no negocio/visitante. Su caller es no bloqueante y no garantiza entrega/reintentos. Verificación de destinatario fail-open ante fallo/configuración ausente es deuda anterior, conservada por alcance, no validación de seguridad.
- Sin nuevas campañas, bajas, automatizaciones, horarios ni envíos masivos. Recordatorios actuales foto/bio, segmentación, frecuencia y deduplicación requieren un bloque propio; no activar para toda la base por defecto.
- No hay deploy/preview/push de bienvenida. El siguiente corte requiere acordarlo y comprobar que el único cambio de función esperado sea send-email, conservando las otras tres y sus horarios. No tomar hashes de función iguales como requisito para publicar una plantilla deliberadamente distinta.

Evidencia privada: `../BuscARTE-resguardos/bienvenida-20260906/`, `verification-final.log`, `visual-root-cierre-20/`, `visual-definitiva-20/` y corridas anteriores preservadas. Fuente probada SHA-256 (bytes antes de normalización Git): `372f8f58332d98d3b76136cefcf31ce7ad16e324e362f338cb3e45a01000fbc4`. Bundle/historial y límites en RESGUARDO.md. Feedback restante: `feedback-mobile-seguimiento-20260906.md`.
