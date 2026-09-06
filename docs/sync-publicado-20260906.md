# Corte de sincronización con GitHub — 6/9/2026

## Qué se sincroniza

El usuario pidió actualizar GitHub con lo publicado sin provocar otro deploy. Se prepara un avance normal, sin force push, desde `origin/main` (`ce512247df40c69a2976de6bfedfe63e23ca9bf1`) hasta el historial publicado `f3cc54d` más esta documentación. El fetch previo no encontró divergencia: 0 commits exclusivos de main remoto y 32 exclusivos del historial publicado.

El código ejecutable publicado corresponde a `b1d35dd`. Entre ese commit y `f3cc54d` sólo hay documentación. Este corte tampoco cambia código, configuración o funciones.

Los roles técnicos de `5855c8c`, rama local `codex/roles-tecnicos-20260906`, **quedan fuera del push a main**. Su futura publicación necesita un corte separado. No se sincroniza la carpeta original ni el worktree Android.

## Cómo se evita otro deploy

El último commit del push lleva **`[skip netlify]`**. Según la [documentación oficial de Netlify](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy), la marca en el último commit evita el deploy del push completo, aunque contenga varios commits. No se desactivan los builds del sitio ni se cambia el vínculo Git, configuración, plan o publicación automática. Un push futuro sin esa marca retoma el comportamiento habitual.

No se ejecuta `netlify deploy`, no se crea una preview ni un PR. La sincronización usa un push normal a main; se detiene ante divergencia o rechazo en lugar de sobrescribir el remoto.

## Resguardo y verificaciones

- Bundle privado del historial publicado creado y verificado antes del push; original y Android intactos.
- Revisión de 122 blobs nuevos del historial: sin hallazgos de rutas privadas o patrones de credenciales privilegiadas; no se imprime su contenido. No equivale a una auditoría universal de secretos.
- Inspección de la diferencia final contra `f3cc54d`: sólo documentación, sin nuevas fuentes ejecutables.
- Confirmación del SHA de main remoto después del push.
- Comparación de la publicación activa y últimos deploys de Netlify antes/después. Debe seguir activo `6a9dcf37d0aeb9991f8eb446` (v17, publicado a las 17:38 ART), sin un nuevo build/deploy causado por el push.

El resultado remoto posterior se registra fuera del repositorio, en `../BuscARTE-resguardos/roles-sync-20260906`, para no necesitar un segundo push sólo por documentar el primero. Esa carpeta es privada y no se publica. Los pasos anteriores son el procedimiento del corte; la finalización se confirma contra las respuestas reales de GitHub y Netlify, no por el mensaje de commit.

## Guía física

`guia-prueba-app-usuario-nuevo.md` es el entregable para el recorrido de usuario nuevo. Está versionada como documentación, fuera del paquete público `dist/`. Los roles nuevos tienen un anexo expresamente pendiente de publicación. No se efectuaron altas, cambios de datos, anuncios, chat ni envíos reales como parte de esta sincronización.
