# buscARTE — base web de trabajo

Esta copia independiente es la base para los próximos bloques de mejoras web/mobile.
No depende del repositorio original ni del worktree de Android para funcionar.

## Procedencia verificada — 5 de septiembre de 2026

- GitHub: `https://github.com/marcosdl1708-gif/BuscARTE`, main `c40e88045a32f8311db82b923c0a598b4ae2fbff`.
- Producción estaba más adelantada: deploy Netlify `6a9aaf1d3f91b32a6e3336bc`, publicado el 4 de septiembre, “Fix mobile header overlap”. No tenía commit asociado.
- Commit local `130577f`: recupera los 33 archivos fuente públicos comparando SHA-1 y tamaño contra el inventario de Netlify, incluido el arreglo del encabezado mobile. Las cuatro funciones conservan el código que existía en GitHub y en la carpeta usada para ese deploy; no se verificó equivalencia binaria del empaquetado remoto.
- El `netlify.toml` servido por Netlify era generado; se conservó la configuración fuente, no esa copia transformada.
- Los scripts Auth ya publicados se conservan con su configuración existente: modo shadow y red deshabilitada. Esta organización no activa la migración.

La organización inicial fue local; después se publicaron captcha + anuncios y se sincronizó esta base con GitHub. Ver `docs/release-20260905.md` y `docs/github-sync-20260905.md` para distinguir ambas operaciones.

## Construcción local

```sh
npm ci
npm run build
npm test
npm run test:registro
npm run test:anuncios
npm run test:inicio
```

El build también funciona directamente con `node scripts/build-site.mjs`, sin instalar dependencias: copia y verifica archivos, sin consultar servicios remotos. `npm ci` sí es necesario para instalar dependencias de las funciones en un entorno limpio.

`npm test` verifica el empaquetado con archivos ficticios aislados (lista permitida, integridad, reconstrucción y rechazo de rutas peligrosas/enlaces). No es una suite funcional de registro, perfiles, chat ni Android.

`npm run test:registro` prueba el flujo de captcha con Playwright y servicios simulados; no permite tráfico real de registro, emails, tracking ni hCaptcha. En Windows usa Edge instalado; en otros sistemas, instalar Chromium con `npx playwright install chromium` antes. Opcionalmente `BUSCARTE_PLAYWRIGHT_MODULE` permite usar una instalación existente de Playwright, y `BUSCARTE_QA_OUTPUT` indica dónde guardar capturas sintéticas (fuera de `dist/`).

`npm run test:anuncios` usa el mismo entorno para verificar publicación mobile, contratos de los cinco tipos de anuncios, fotos, errores y envíos repetidos. Todas las solicitudes se simulan, incluida la RPC de vencimiento que la página ejecuta al cargar: no abrir la página real como una prueba supuestamente de sólo lectura.

`npm run test:inicio` verifica ambas Home con visitantes y cuentas conocidas, datos de sesión incompletos, retorno por historial, cambio entre pestañas, enlaces al perfil, menú accesible y mensajes tardíos. Usa fixtures aisladas, sin tráfico real de backend ni escrituras de identidad. También comprueba que el modo Auth local no tome la caché legacy como una sesión validada.

`site-files.json` contiene la lista explícita de publicación. El resultado actual es `dist/` (36 archivos incluyendo `_redirects`, el controlador de captcha y los dos assets compartidos del Inicio), sin documentos, campañas, respaldos, `files.zip` ni herramientas internas. No modificar HTML al empaquetar. Un archivo nuevo requiere incorporarlo deliberadamente a esa lista. Si encuentra archivos inesperados en `dist/`, el build se detiene y no los elimina.

Netlify usa `dist/` y `netlify/functions/`. El paquete se validó en preview y se publicó el 5/9/2026 a las 22:09 ART: deploy `6a9cbd37518d43630307438c`. Las cuatro funciones de producción conservan exactamente los binarios anteriores, runtime `nodejs24.x` y sus dos horarios. `NODE_VERSION=20` sigue en la configuración fuente histórica; no se cambió en este bloque y no debe confundirse con el runtime remoto comprobado. Nunca publicar la raíz del repositorio.

Ver `docs/release-20260905.md` para verificación, contexto del CLI, comandos y reversión. Los diagnósticos `npm run verify:deploy` y `npm run test:deploy-smoke` requieren `BUSCARTE_DEPLOY_URL` con el origen exacto; el primero compara recursos/rutas y el segundo abre páginas con todo el backend simulado o bloqueado. Ambos admiten `BUSCARTE_PLAYWRIGHT_MODULE`. Los informes/capturas se guardan fuera de `dist/` mediante `BUSCARTE_VERIFY_REPORT` y `BUSCARTE_QA_OUTPUT` respectivamente.

## Forma de trabajar

Un bloque por vez, con cambios pequeños y verificables. Primero reproducir el problema; luego corregir y revisar web móvil/escritorio y su efecto en la app. Una preview no aísla automáticamente los datos: no hacer altas, envíos, publicaciones ni escrituras de prueba contra usuarios reales.

Los bloques de captcha y publicación de anuncios están implementados en commits separados y ya publicados juntos. El código público corresponde a `ac97d2d`; los commits posteriores de diagnóstico/documentación no cambian archivos públicos. `main` de GitHub y de esta copia canónica incorporan la base reconciliada y ambos bloques, conservando el historial. Ver `docs/qa-captcha-20260905.md`, `docs/qa-anuncios-20260905.md`, `docs/release-20260905.md` y `docs/github-sync-20260905.md` para pruebas y límites. La comprobación física de la app instalada sigue pendiente, aunque su dominio ya sirve la versión nueva.

Netlify está conectado a `main`: un push normal puede publicar automáticamente. La sincronización de código ya publicado usa un último commit marcado `[skip netlify]` para omitir sólo ese deploy. No se desactivaron builds ni se cambió la configuración remota. Para un próximo cambio funcional, acordar y validar su publicación antes de actualizar `main`; empezar el trabajo en una rama `codex/` desde la base actual.

Los demás bugs siguen pendientes, incluido el enlace general de Marketplace: mejorar el formulario de venta no corrige por sí solo ese recorrido. Mantener separados los cambios visuales, la migración Auth y los cambios de disciplinas/modelo de datos.

## Siguiente bloque preparado — Inicio con sesión

La rama `codex/inicio-sesion-20260905`, desde `ce51224`, mejora sólo el Inicio de las cuentas conocidas. Ambas URLs conservan sus contratos y comparten presentación: saludo, cuatro accesos útiles, exploración por rubro y cierre sin volver a pedir registro. Una caché marcada como registrada pero sin ID ofrece reingresar, no otra alta. El menú y los enlaces personalizados esperan a estar listos antes de poder usarse.

Este bloque ya está **validado en preview, no publicado en producción**. El código público es `e63d92f`; la draft Netlify `6a9cc9c456bb08b603d9b3cf` pasó comparación de 35 recursos, 35 rutas y seis smoke tests remotos aislados. No se hizo push a `main` ni se cambió el deploy activo de producción: la publicación descrita arriba sigue correspondiendo a captcha + anuncios. Ver `docs/preview-inicio-20260905.md` para el resultado remoto y `docs/qa-inicio-20260905.md` para pruebas locales, capturas y límites. La publicación en producción requiere su aprobación y repetir allí las verificaciones; no promover la draft directamente como sustituto de validar su contexto y funciones.

El mapa local y la ubicación del respaldo están en `../BuscARTE-ORGANIZACION.md`.
