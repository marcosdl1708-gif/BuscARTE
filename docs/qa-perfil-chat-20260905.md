# QA local — perfil propio y chat → perfil

Bloque iniciado el 5/9/2026. Rama `codex/perfil-chat-20260905`, desde `8cd3947`, que ya incluye Inicio con sesión. No es una publicación.

## Alcance y causa

- Perfil propio (`9deecd4`): el código anterior ocultaba el formulario, pero dejaba el botón del hero que intentaba enfocarlo. Ahora, sólo después de cargar un perfil válido, se muestran las acciones propias o ajenas. El propio ofrece editar/compartir; no contactar, guardar ni reportar. Se aclara que es el perfil público y se mantienen controles de al menos 44 px.
- Chat (`c764b34`): la regla mobile `:not(:first-child)` ocultaba el enlace porque la primera hija era una etiqueta de estado. Ahora Ver perfil permanece visible y nombre/avatar son un segundo acceso a la misma URL. Un perfil ausente o de demostración no recibe un enlace ficticio.
- Compartir genera una URL con el ID del perfil cargado, incluso cuando se abrió el propio sin parámetro. Volver desde el perfil conserva la conversación elegida, aun si se abrió antes de terminar la carga de mensajes.
- Se ignoran respuestas de conversaciones anteriores al cambiar rápidamente. Los estados de perfil no disponible/error no ofrecen acciones inválidas. Un cambio de cuenta limpia el borrador y los videos anteriores; las operaciones pendientes de contacto dejan de avanzar si cambió la identidad/destinatario. Esto no puede deshacer solicitudes ya enviadas.

## Verificación

| Suite local | Aprobadas |
| --- | ---: |
| Empaquetado | 15 |
| Registro/captcha | 17 |
| Publicación de anuncios | 31 |
| Inicio con sesión | 32 |
| Perfil propio/ajeno | 36 |
| Chat → perfil | 21 |
| Total | 152 |

Comandos reproducibles: `npm test`, `npm run test:registro`, `npm run test:anuncios`, `npm run test:inicio`, `npm run test:perfil`, `npm run test:chat` y `npm run build`. En esta PC se ejecutaron directamente con Node v24.19.0 y Edge mediante Playwright 1.62.1. El build verificó los mismos 36 archivos de `site-files.json`; no se agregan archivos públicos. `git diff --check` sin errores. La reproducción histórica adicional del chat (`BUSCARTE_CHAT_BASELINE=1`) confirma el fallo anterior en `8cd3947` y no se cuenta dentro de las 152.

Perfil: artista/negocio/visitante a 320, 390, 768 y 1280 px; ID explícito/implícito, cambios de sesión, caché incompleta, almacenamiento bloqueado, carga demorada, error HTTP, perfil inexistente/suspendido y respuesta con otro ID. Los intentos programáticos de contactarse, guardarse o reportarse no producen escrituras. Los casos sintéticos de contacto ajeno preservan los payloads de conversación/mensaje existentes.

Chat: 320, 390, 900, 901 y 1280 px; nombre largo, perfil ausente, IDs codificados, navegación por teclado, ambas posiciones de participante, contexto de anuncio, historial, respuestas tardías exitosas/fallidas y contrato de envío/notificación. Los casos de navegación no generan POST ni email.

También se recorrió mediante el navegador la fuente HTML actual, servida exclusivamente en loopback con cuentas ficticias Paula/Marina: perfil propio → edición simulada; chat → perfil ajeno → Contactar; Volver → misma conversación. Revisión visual a 390×844 y 1280×900. Editar/Ver perfil quedaron visibles, sin superposición con la barra inferior; Contactar enfoca el formulario visible. La pestaña y el servidor de QA fueron cerrados al terminar.

## Aislamiento y evidencia

Las suites interceptan todas las solicitudes: no hay `continue`, `fallback` ni petición real desde sus mocks. APIs, mensajes, reportes, notificaciones y tracking son simulados o rechazados. La fixture visual bloquea escrituras, conexiones, workers, scripts externos y fuentes remotas mediante harness y CSP; usa tipografías de reemplazo. No hay cuentas, mensajes ni registros de usuarios reales en las capturas.

Evidencia privada fuera de `dist/` y GitHub: `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\perfil-chat-20260905`.

- `perfil-propio-test.log`, `perfil-propio-390.png`, `perfil-ajeno-contacto-390.png`.
- `chat-before-390.png`, `chat-after-{320,390,900,901,1280}.png`, `chat-profile-unavailable-390.png`.
- `visual-fixture.cjs`: servidor reproducible; puerto efímero y sólo loopback.

## Límites y publicación futura

No hubo preview nueva, deploy, push ni consulta/escritura a Supabase. Producción se deja intacta: la última referencia verificada del bloque anterior es `6a9cbd37518d43630307438c` (captcha + anuncios). No se consultó de nuevo para declarar un estado remoto más reciente. La preview `6a9cc9c456bb08b603d9b3cf` corresponde sólo a Inicio y no prueba estos cambios.

No se cambian Auth, esquema, permisos de backend, funciones, contratos de datos, claves, `manifest.json` ni Android/asset links. La caché legacy se usa para presentación, no se convierte en autenticación validada. Los guardas del frontend no sustituyen los permisos del servidor. Se conserva la deuda previa de comprobación de respuestas HTTP en envío/guardado, fuera del alcance de este bloque; los tests no certifican entrega real de mensajes.

El service worker se prepara en `buscarte-v11-2026-09-05-perfil-chat`, todavía local. Inicio + perfil/chat pueden publicarse juntos, previa aprobación y verificación del contexto/funciones del deploy. No hace falta crear una preview por cada bloque para seguir desarrollando localmente.

Pendiente: app instalada/dispositivo físico, teclado real y compartir nativo; backend real con cuenta de prueba expresamente autorizada; validación del paquete combinado al publicarlo. Marketplace, estilo de danza, onboarding, disciplinas múltiples/principal y renovación visual general siguen como bloques separados.
