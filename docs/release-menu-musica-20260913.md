# Menú táctil y generador exclusivo de Música — 13/9/2026

Autorizado por el usuario: «go, tené en cuenta que el generador de nombres no es para todos los rubros». Alcance aprobado: corregir el toque del menú y completar sus accesos para músicos, con un único deploy. Sin modificar cuentas, datos, filtros, anuncios, emails, migraciones ni Android.

## Corrección

En ambos Inicio, `focusout` podía cerrar el menú antes del click si el navegador soltaba el foco durante el toque y entregaba `relatedTarget=null`. La reproducción controlada anterior terminaba con el click sobre el título detrás del menú, sin navegación. Se reemplazó por `focusin` fuera de la cuenta; Escape, click afuera y foco dentro conservan su comportamiento. No se certifica que sea la única causa del teléfono reportado: no se dispone de ese dispositivo.

El generador ya aparecía en los desplegables de escritorio, pero faltaba en siete paneles móviles. Ahora está en los ocho paneles de cuenta de Artistas, Anuncios, detalle, edición/perfil público, Mensajes, Mis anuncios y Guardados. El controlador compartido `assets/js/menu-cuenta.js` muestra esos accesos sólo con estado local registrado, ID legacy positivo, tipo artista y rubro Música explícito. También alcanza los enlaces de ambos Inicio y los de Guardados fuera del menú. No se infiere Música cuando falta rubro; no es una integración nueva de autenticación ni una validación de permisos del servidor.

El Generador utiliza la misma regla, muestra el bloqueo existente a otros rubros/cuentas, deshabilita el contenido bloqueado para teclado y reevalúa al cambiar los datos de presentación. Relectura en apertura del menú, storage, pageshow, foco y retorno de visibilidad. La firma de las cuatro claves detecta también cambios de cuenta que conservan la misma elegibilidad. El selector de visibilidad funciona con URLs originales y las Pretty URLs de Netlify.

## Verificación y publicación

- Cuatro pruebas focalizadas en `scripts/menu-musica.test.cjs`: elegibilidad/cache incompleta; toque con blur transitorio y teclado en ambos Inicio; ocho paneles móviles Música/otro rubro; bloqueo del generador y cambios de estado. Edge con viewport/touch móvil y red completamente interceptada; no es prueba en teléfono físico.
- Build de 37 archivos públicos, incluyendo el controlador nuevo por allowlist. Sólo `dist` y funciones existentes se publican; documentación, pruebas, resguardos y guía no se sirven.
- Fuente `a9602e2`; único deploy de producción `6aa6bd88018fd650aaa404a2`, 12:13 ART; SW `buscarte-v22-2026-09-13-menu-musica`.
- Catorce recursos públicos HTTP200: once HTML con scripts inline idénticos y selector/helper presentes, dos JS y SW idénticos a fuente. Cinco paquetes de funciones/runtimes nodejs24.x y ambos cron idénticos al deploy anterior. Evidencia en `../BuscARTE-resguardos/menu-musica-20260913/after.json`. Cierre GitHub con `[skip netlify]` y comprobación de SHA/deploy en `github-after.json` del mismo resguardo.
- Edición previa ajena de `docs/guia-prueba-app-usuario-nuevo.md` preservada y excluida: SHA256 `cb3fa88aecc1537af9d936f9997934d3eb1fdb9a88779c4f5aadc9a4d688bb3f`. Original y worktree Android sin modificaciones.

Las guías de Netlify mantuvieron el sitio existente y la publicación limitada a dist, sin preview ni cambio de hosting. No se enviaron correos, crearon cuentas ni alteraron datos de usuarios durante las pruebas. La migración Auth, multirrubro/principal y demás pendientes siguen separados.

Validación física breve: cerrar/reabrir la app conectada; desde Inicio tocar Mi perfil, Mensajes y Guardados. Con un músico, abrir Mi cuenta desde otra pestaña y entrar al Generador. Con otro rubro no debe aparecer esa opción. Si el teléfono originalmente reportado continúa fallando, obtener modelo, navegador y opción exacta; no dar por validado ese dispositivo sólo por la reproducción aislada.
