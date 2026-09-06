# Bloque 2 — publicación de anuncios mobile

Fecha: 5 de septiembre de 2026. Rama: `codex/anuncios-mobile-20260905`.
Base: `390dcb3`, que incluye captcha y la versión publicada recuperada.
Estado: candidato local; sin push ni deploy. Esta rama reúne captcha + anuncios como próximo corte de publicación, sin incluir los demás bloques.

## Problemas comprobados y cambios

- La barra de navegación mobile tenía mayor prioridad visual que el modal. El formulario completo se desplazaba, junto con sus acciones. Ahora el modal está por encima de esa barra; sólo se desplazan los campos y la acción «Publicar anuncio» tiene una zona propia.
- El modal usa la altura y el desplazamiento del viewport visual. Se conserva el scroll previo al cerrarlo, hay recorrido de foco contenido, cierre con Escape y etiquetas accesibles.
- Dos toques durante la subida de fotos podían enviar dos POST. También se rehabilitaba el botón después del éxito, antes del cierre automático. Ahora el bloqueo ocurre antes del primer `await` y el éxito permanece visible, sin temporizador de cierre ni reenvío habilitado.
- Cerrar o cambiar de tipo podía borrar selecciones. Se conservan los campos, chips y categoría al cerrar y volver en la misma página; se limpian después de una publicación confirmada. Esto no es un borrador persistente: navegar o recargar puede perder lo escrito.
- Las fotos fallidas podían terminar publicadas como si no se hubiera elegido ninguna. Ahora se exige reintentar esa foto o quitarla explícitamente. Una subida vieja no puede reemplazar una imagen más nueva ni reaparecer después de quitarla.
- Se limita a 60 segundos la preparación/subida de cada foto y la petición de publicación, incluida la lectura de respuesta, para evitar bloquear el formulario indefinidamente.
- Sólo se muestra «Publicado» cuando la respuesta satisfactoria incluye el ID del anuncio. El enlace abre ese anuncio aunque el tablón actual tenga otros filtros. Un fallo de medición no altera el resultado.
- Ante error HTTP se mantienen los datos para reintentar. Los estados 408/502/503/504 se consideran inciertos, al igual que un corte de conexión o la falta de confirmación tras el POST: se muestra «Revisar mis anuncios» y se exige confirmar que no se publicó antes de habilitar otro intento. No hay reintento automático. Sin idempotencia del servidor no se promete deduplicación entre pestañas, recargas ni reintentos manuales.

Se preservan los cinco tipos (`busco`, `ofrezco`, `jam`, `vende`, `clases`), sus campos y los permisos existentes para visitantes. Sin cambios de esquema, RPC, funciones, Auth, manifest, assetlinks, firma/paquete Android ni correos. La mejora del formulario de venta no resuelve el enlace general de Marketplace, pendiente en otro bloque.

## Verificación local

La suite `npm run test:anuncios` usa Edge/Chromium headless, con todos los destinos de red interceptados. Incluye lecturas, publicaciones, Storage, tracking y la RPC `vencer_anuncios_viejos` que la página ejecuta al cargar. No se crearon usuarios o anuncios ni se subieron fotos reales.

31/31 pruebas de anuncios aprobadas. Comprueban contratos de los cinco tipos, visitantes, doble toque durante foto/POST, éxito persistente, fallo de tracking, errores HTTP, resultados inciertos, conservación del borrador, fotos múltiples, errores de imagen, eliminación/reemplazo, resultados tardíos y timeouts con reloj simulado. También verifican foco/Tab/Escape, scroll, botón visible y ausencia de desbordamiento a 320, 390 y 1280 px, incluida altura reducida. Se simulan viewports visuales de 280/360 px con desplazamiento sin cambiar el viewport de layout; el modo compacto mantiene accesibles las acciones y espacio para campos. Estas comprobaciones no equivalen a un teclado físico o a Safari iOS.

Capturas sintéticas y respaldo del candidato: `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\anuncios-20260905`, fuera de `dist/`. Son datos ficticios; no constituyen publicaciones reales.

Build final verificado: 34 archivos públicos explícitos. El service worker pasa a `buscarte-v9-2026-09-05-anuncios-mobile` e incluye el controlador de captcha del bloque anterior. Regresión aprobada: 15/15 pruebas de empaquetado y 17/17 de captcha, para un total de 63/63. `git diff --check` sin errores; funciones, scripts Auth/API/config, manifest, assetlinks y redirects idénticos a `130577f`.

Revisión visual de las capturas mobile realizada. Una revisión independiente detectó el bloqueo por espera sin límite y el recorte con teclado visual de 280 px; ambos se corrigieron y cuentan con pruebas de regresión. El reset tras éxito limpia también lo escrito en los demás tipos dentro del modal, no sólo el tipo publicado.

## Corte recomendado y límites de publicación

Captcha + anuncios es un corte acotado para publicar, sin esperar a rediseñar Inicio, onboarding o disciplinas. No se ejecuta una publicación por este documento: requiere el alcance acordado con el usuario.

1. Validar en preview el nuevo empaquetado `dist/`, aún no probado remotamente. Revisar inicio, registro, anuncios, recursos, service worker y assetlinks, sin operaciones reales de prueba. Una preview no aísla Supabase.
2. Confirmar que conserva los 35 redirects, las cuatro funciones (`recordatorio-perfil`, `resumen-mensual`, `reset-password`, `send-email`) y sus dos horarios. El despliegue actual informa runtime de funciones `nodejs24.x`, pero la configuración fuente conserva `NODE_VERSION=20`: verificar el runtime resultante antes de promover; no cambiarlo incidentalmente como parte del arreglo UX.
3. Conservar como punto de reversión el deploy activo verificado el 5/9: `6a9aaf1d3f91b32a6e3336bc`, publicado el 4/9, «Fix mobile header overlap». Reconfirmar que sigue siendo el activo antes de publicar.
4. Después de publicar, comprobar que navegador y app instalada reciben la caché nueva. Android está configurado como TWA de `https://buscarte.com.ar/`; una preview móvil no prueba esa app instalada. Este cambio web no requiere modificar el proyecto Android.

No se validaron dispositivos físicos ni un POST real de publicación en este bloque. El pendiente preexistente de verificación de captcha en servidor, documentado en `qa-captcha-20260905.md`, sigue separado: el arreglo UX no demuestra protección antispam integral.
