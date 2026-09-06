# buscARTE — base web de trabajo

Esta copia independiente es la base para los próximos bloques de mejoras web/mobile.
No depende del repositorio original ni del worktree de Android para funcionar.

## Procedencia verificada — 5 de septiembre de 2026

- GitHub: `https://github.com/marcosdl1708-gif/BuscARTE`, main `c40e88045a32f8311db82b923c0a598b4ae2fbff`.
- Producción estaba más adelantada: deploy Netlify `6a9aaf1d3f91b32a6e3336bc`, publicado el 4 de septiembre, “Fix mobile header overlap”. No tenía commit asociado.
- Commit local `130577f`: recupera los 33 archivos fuente públicos comparando SHA-1 y tamaño contra el inventario de Netlify, incluido el arreglo del encabezado mobile. Las cuatro funciones conservan el código que existía en GitHub y en la carpeta usada para ese deploy; no se verificó equivalencia binaria del empaquetado remoto.
- El `netlify.toml` servido por Netlify era generado; se conservó la configuración fuente, no esa copia transformada.
- Los scripts Auth ya publicados se conservan con su configuración existente: modo shadow y red deshabilitada. Esta organización no activa la migración.

Los cambios de organización posteriores son locales. No implican un push ni una publicación.

## Construcción local

```sh
npm ci
npm run build
npm test
npm run test:registro
npm run test:anuncios
```

El build también funciona directamente con `node scripts/build-site.mjs`, sin instalar dependencias: copia y verifica archivos, sin consultar servicios remotos. `npm ci` sí es necesario para instalar dependencias de las funciones en un entorno limpio.

`npm test` verifica el empaquetado con archivos ficticios aislados (lista permitida, integridad, reconstrucción y rechazo de rutas peligrosas/enlaces). No es una suite funcional de registro, perfiles, chat ni Android.

`npm run test:registro` prueba el flujo de captcha con Playwright y servicios simulados; no permite tráfico real de registro, emails, tracking ni hCaptcha. En Windows usa Edge instalado; en otros sistemas, instalar Chromium con `npx playwright install chromium` antes. Opcionalmente `BUSCARTE_PLAYWRIGHT_MODULE` permite usar una instalación existente de Playwright, y `BUSCARTE_QA_OUTPUT` indica dónde guardar capturas sintéticas (fuera de `dist/`).

`npm run test:anuncios` usa el mismo entorno para verificar publicación mobile, contratos de los cinco tipos de anuncios, fotos, errores y envíos repetidos. Todas las solicitudes se simulan, incluida la RPC de vencimiento que la página ejecuta al cargar: no abrir la página real como una prueba supuestamente de sólo lectura.

`site-files.json` contiene la lista explícita de publicación. El resultado actual es `dist/` (34 archivos incluyendo `_redirects` y el controlador de captcha), sin documentos, campañas, respaldos, `files.zip` ni herramientas internas. No modificar HTML al empaquetar. Un archivo nuevo requiere incorporarlo deliberadamente a esa lista. Si encuentra archivos inesperados en `dist/`, el build se detiene y no los elimina.

Netlify usa `dist/` y `netlify/functions/`. Las funciones programadas y Node 20 conservan su configuración anterior. Nunca publicar la raíz del repositorio. No se han validado todavía estas nuevas opciones en un deploy remoto.

## Forma de trabajar

Un bloque por vez, con cambios pequeños y verificables. Primero reproducir el problema; luego corregir y revisar web móvil/escritorio y su efecto en la app. Una preview no aísla automáticamente los datos: no hacer altas, envíos, publicaciones ni escrituras de prueba contra usuarios reales.

Los bloques de captcha y publicación de anuncios están implementados localmente en commits separados. La rama `codex/anuncios-mobile-20260905` incluye ambos y es el candidato para la próxima publicación. Ver `docs/qa-captcha-20260905.md` y `docs/qa-anuncios-20260905.md` para pruebas y límites. No se hizo push ni deploy. Primero validar técnicamente el nuevo empaquetado en preview, sin altas ni publicaciones reales; después promover dentro del alcance autorizado. La comprobación en app instalada sigue pendiente de que el dominio de producción sirva la versión nueva.

Los demás bugs siguen pendientes, incluido el enlace general de Marketplace: mejorar el formulario de venta no corrige por sí solo ese recorrido. Mantener separados los cambios visuales, la migración Auth y los cambios de disciplinas/modelo de datos.

El mapa local y la ubicación del respaldo están en `../BuscARTE-ORGANIZACION.md`.
