# Asistencia a eventos — 11/9/2026

Publicado a las 19:56 ART en buscarte.com.ar, con autorización «go» posterior a explicar alcance y riesgos. Un único deploy de producción `6aa4872b940d5068912622e8`, fuente `da86a9c`, caché `buscarte-v20-2026-09-11-asistencia-eventos`.

## Cambio

El botón «Confirmar asistencia» usaba sendMsg, que devolvía silenciosamente ante texto vacío y sólo enviaba chat cuando había texto. No registraba asistencia. Ahora usa la misma tabla/reacción que «Asistiré», sin mensaje obligatorio; ambos controles comparten bloqueo y estado verificado. Cancelar es una acción separada con confirmación. El mensaje opcional conserva el circuito existente; si falla, conserva borrador y asistencia y recomienda revisar Mensajes antes de reintentar. Otros tipos de anuncio mantienen el mensaje obligatorio.

Una lectura tardía no sobreescribe la operación nueva; el contador no bloquea confirmación/mensaje. Las peticiones de asistencia tienen límite de 15 segundos. Ausencia comprobada reconcilia el estado local; la UI no interpreta una respuesta vacía como confirmación. La confirmación no crea conversación ni envía correo si el mensaje está vacío.

## Contrato y límites

Metadatos de Supabase consultados sólo en lectura: `public.reacciones` ya tiene UNIQUE(user_id, anuncio_id, tipo) y admite `asistire`. Se usa POST con on_conflict y resolution=ignore-duplicates, seguido de lectura exacta; no requiere UPDATE ni migración. Referencia oficial: [PostgREST, upsert y on conflict](https://docs.postgrest.org/en/stable/references/api/tables_views.html#upsert). Changelog de Supabase y documentación de upsert revisados sin cambio aplicable al contrato existente.

**Deuda previa preservada, no resuelta por este arreglo:** las políticas existentes de reacciones permiten SELECT/INSERT/DELETE públicos; no verifican propiedad de la cuenta. No se amplió RLS ni se presenta esta corrección como migración de seguridad. El tratamiento de identidad/Auth permanece en su bloque separado; no copiar este patrón a operaciones nuevas o sensibles.

Se conservan funciones de correo, destinatarios/horarios, datos guardados, taxonomía, otras páginas, manifest, asset links, configuración Netlify y proyecto Android. No se generó APK ni se probó físicamente un teléfono.

## Verificación acotada

- 7 pruebas específicas: vacío/espacios sin chat, doble clic/duplicado, cancelación, fallos de escritura/readback, mensaje fallido y reintento sin repetir RSVP, carga tardía, contador pendiente, estado local obsoleto, invitado/no-evento y envío no-evento; sintaxis inline válida.
- Una comprobación Edge móvil 390×844 con TODO el tráfico interceptado: flujo real de render y clic con mensaje vacío, etiqueta opcional, cancelación oculta antes de confirmar, sin overflow horizontal. Sin requests externos ni escrituras/correos reales; captura revisada.
- Build allowlist: 36 archivos públicos. Sólo dist y las funciones existentes publicados.
- Producción: HTML 200, scripts inline idénticos a fuente, SW idéntico v20; cinco hashes de funciones y runtimes nodejs24.x idénticos, ambos cron idénticos.
- Guía modificada previamente por el usuario intacta y excluida: SHA256 `cb3fa88aecc1537af9d936f9997934d3eb1fdb9a88779c4f5aadc9a4d688bb3f`.

Evidencia operativa privada: `../BuscARTE-resguardos/asistencia-eventos-20260911/` (relativa al padre de BuscARTE-web). No publicar ese resguardo. El último commit de cierre usa `[skip netlify]`; comprobar SHA remoto y deploy después del push, sin lanzar otro.

Prueba pendiente del tester: reabrir app conectada, entrar a un evento ajeno, confirmar sin texto, verificar confirmación al volver a abrir; si no va a asistir, usar Cancelar asistencia. Para verificar mensaje opcional, usar un evento de prueba coordinado con el organizador. No repetir el alta integral ni crear cuentas innecesarias para este arreglo.
