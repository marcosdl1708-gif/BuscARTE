# Sincronización de la versión publicada con GitHub

Fecha: 5 de septiembre de 2026 (ART). Autorizada por el usuario después de publicar captcha + anuncios.

Repositorio: `https://github.com/marcosdl1708-gif/BuscARTE`, rama `main`.
Base remota comprobada antes de sincronizar: `c40e88045a32f8311db82b923c0a598b4ae2fbff`.
El remoto no tenía commits nuevos ni divergencias; los cinco commits locales eran descendientes directos. `main` no estaba protegida y no tenía reglas ni workflows en `.github`.

## Qué incorpora

- `130577f`: recuperación de la versión que ya estaba publicada el 4/9, más adelantada que GitHub.
- `dad2e25`: organización y build con lista explícita `dist/`.
- `390dcb3`: captcha mobile.
- `ac97d2d`: publicación de anuncios mobile.
- `84d4b62`: verificación y documentación del deploy del 5/9.
- Este commit de documentación de sincronización, sin cambios funcionales.

La actualización es un fast-forward: no se reescriben commits, no se usa force push y no se mezclan los pendientes de la carpeta original ni Android. Los archivos de `node_modules` dejaron de estar versionados en el commit de organización; siguen declaradas las dependencias y su lockfile, y sus copias físicas locales no se eliminan. Los originales y el historial previo están preservados en los resguardos locales.

## Separación de GitHub y producción

El sitio Netlify existente tiene GitHub conectado y permite builds de `main`. Un push sin precaución podría reemplazar la publicación manual verificada.

Por eso el último commit de este push lleva `[skip netlify]`. Según la [documentación oficial de Netlify](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy), la marca en el último commit omite el deploy del conjunto de commits enviado. No se usa `[skip ci]`, no se desactivan builds, no se cambian variables y no se bloquea permanentemente el sitio.

La versión de producción que debe permanecer activa es `6a9cbd37518d43630307438c`, publicada el 5/9 a las 22:09 ART. El código público corresponde a `ac97d2d`; los cambios posteriores son herramientas y documentación fuera de `site-files.json`. Mantener intactos los cuatro binarios de funciones, horarios, manifest, assetlinks, Auth y base de datos.

Un siguiente commit a `main` sin la marca volverá a activar el flujo automático habitual. Para próximos bloques: rama `codex/` desde `main` actualizado, pruebas aisladas y decisión explícita de publicación antes de integrar. La configuración histórica `NODE_VERSION=20` todavía requiere revisar la compatibilidad del build remoto en un cambio separado; el último deploy manual tiene funciones `nodejs24.x` verificadas.

## Comprobaciones y cierre

- `git fetch origin`, relación de ancestro y revisión de los archivos/blobs nuevos antes del push; no publicar secretos privados, respaldos, datos de usuarios ni material de firma Android.
- Build de 34 archivos y suites locales de empaquetado, captcha y anuncios; sin solicitudes reales al backend.
- Push normal de la rama actual a `refs/heads/main`, sin forzar; Git debe rechazar cualquier divergencia nueva.
- Al finalizar, comparar SHA remoto, `origin/main` y `main` local; conservar la rama de trabajo y todos sus commits.
- Consultar Netlify después del push: la sincronización puede aparecer como un deploy omitido, pero no debe compilar ni cambiar el sitio publicado.

El bundle local anterior `BuscARTE-resguardos/release-20260905/release-web-history.bundle` permite recuperar la base previa a esta sincronización. El cierre se conserva adicionalmente en `BuscARTE-resguardos/github-sync-20260905/github-sync-web-history.bundle`. Estos respaldos de la misma PC no sustituyen un backup de la base de datos.
