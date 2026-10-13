# A2 + sesiones seguras — cierre del 13/10/2026

## Publicación verificada

Producción: https://buscarte.com.ar. Corte final `82fcdbf91b294c881eaf22105d3c2119606a756a`, deploy `6ace9c13d1532ff6e861b174`, publicado 18:01 ART. 66 archivos explícitos de build: 65 recursos servidos y 35 rutas comprobados; README, package y herramientas no publicados. Siete funciones Node 24, dos horarios de correo iguales y escaneo de secretos sin coincidencias. El cierre documental usa `[skip netlify]`.

A2 conserva colores por rubro y arte aprobado sin personas generadas, ahora con fondos fijos. Se corrigieron alineación/tamaño de acciones, filtros, contraste de elementos sobre pintura, contadores y presentación vacía. La navegación pública sigue abierta; editar, guardar, publicar y mensajes requieren identidad comprobada por el servidor. hCaptcha se verifica también en el servidor con secreto sólo de producción, no incluido en GitHub/frontend. Las guías de Netlify/Supabase guiaron la separación entre archivos públicos, secretos y acceso del servidor.

## Cuentas y sesiones

No se importaron usuarios ni se ejecutó la migración Auth histórica. IDs, contraseñas y datos existentes se conservan. Una cookie opaca HttpOnly/Secure dura hasta 30 días; la caché local sirve sólo para presentación. Las cuentas antiguas ingresan una vez para obtener esa sesión; guardar el perfil no pide contraseña en cada cambio. Eliminar la cuenta sigue requiriendo la contraseña actual. Reset invalida sesiones y consume el enlace de forma atómica.

Migraciones aplicadas en el proyecto correcto: `20261013202641` aditiva (`web_session_backend`) y `20261013204628` de cierre (`close_legacy_public_access`), esta última sólo después de confirmar frontend y funciones publicados. Las fechas de archivos locales son las creadas con CLI; los números remotos los asignó el servicio. Este repositorio NO es una línea base completa para ejecutar `db push/pull` indiscriminadamente.

## Incidencias durante el corte

El primer deploy `373e3eb` tuvo un bug: el INSERT de sesión exitoso devuelve 201 sin cuerpo, pero el helper intentaba leer JSON. Corregido con cobertura de esa respuesta real en `77dc598`; el usuario confirmó que ya ingresó. Los deploys intermedios `91d8e48`/`77dc598` fallaron porque Netlify había dejado su configuración generada dentro del dist cacheado. El reintento limpio `6ace9ae5078fba02f2db2294` publicó el arreglo. El corte final maneja ese único archivo con cuarentena recuperable sólo en CI, manteniendo el bloqueo de cualquier otro archivo desconocido. No se borraron carpetas del usuario ni de otros proyectos.

También se retiró el botón de movimiento por feedback del usuario. La imagen de compartir era SVG disfrazado de JPG; se convirtió a JPEG real 1200×630 con copy de artistas, no sólo músicos. No se modificó ninguna función en ese último corte: sus siete hashes son los mismos que en el hotfix confirmado.

## Validación y límites

- Matriz previa congelada: 154/154 (122 A2 + 32 layouts), 19 páginas, diez rubros, 320/390/1440 y casos sin sesión; sin cambios de fuente durante la corrida. Después de quitar el movimiento, dos comprobaciones focales adicionales de Home 320/1440 sobre la fuente nueva, sin drift. No atribuir la matriz previa al JPEG nuevo ni a cambios posteriores.
- Frontend de sesión: 41/41 aisladas. Backend/correo: 57/57 finales, incluida respuesta 201 vacía y cookie → consulta → logout. Build: 26/26, incluida caché generada de CI y rechazos de rutas/links/archivos desconocidos.
- Supabase real: metadata de permisos/RPC/políticas y prueba con service_role dentro de BEGIN/ROLLBACK para registro/login, guardado, reset/replay, anuncios y eliminación conservando historial ajeno. Cero perfiles, anuncios, conversaciones o mensajes sintéticos retenidos. Las secuencias pueden dejar huecos pequeños normales; no se resetearon.
- Producción: rutas/assets, rechazo de operaciones sin sesión, rechazo de captcha inválido y correo sin autorización; Home, búsqueda y anuncios móviles con datos públicos. El usuario confirmó login real. No se enviaron mails, fotos, mensajes, asistencias o anuncios reales de prueba desde herramientas. La navegación de anuncios conserva el mantenimiento acotado de vencimientos existente.
- No es certificación de cero bugs, WCAG completo, entrega en todos los clientes de email ni APK físico. El alta con captcha válido y la pasada física requieren usuario/testers: `prueba-cierre-a2-20261013.md`.

## Pendientes separados

Multidisciplina no se activó: no hay datos de demo, selector ni cambio de modelo en producción. Sigue requiriendo modelo compatible, principal, filtros, anuncios/perfiles y migración coordinada con rollback antes de publicar. La migración a Supabase Auth sería una decisión futura independiente; no es necesaria para usar las sesiones seguras actuales.

Supabase ya no reporta los hallazgos anteriores de procedimientos sin search_path/definer accesible. Mantiene un aviso por [unaccent en public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), que requiere revisar llamadas dinámicas antes de moverlo. Las tablas privadas con RLS y ninguna política son bloqueo deliberado para clientes, no una apertura. Rendimiento: ocho [FK sin índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) y un [índice de email duplicado](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index), documentados para un bloque acotado; no se alteraron índices por limpiar avisos.

Evidencia detallada y capturas fuera de GitHub/publicación: `../BuscARTE-resguardos/seguridad-a2-release-20261013/`, `a2-security-final2-20261013/` y la corrida focal `escena-release-2026-10-13T20-53-03-568Z/`. Guía ajena `docs/guia-prueba-app-usuario-nuevo.md` preservada exacta/excluida. Original y Android no se tocaron.
