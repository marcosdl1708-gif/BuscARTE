# Publicación — mobile y retorno a Artistas, 15/10/2026

Publicado por Git CD después del «go» del usuario, a las **09:26 ART** (12:26:18 UTC).

- Fuente: `aa4f8ac17bf321e633da56af1bbaf29372b06419`, sobre `8d460ff`.
- Sitio: `43524f56-8833-41ab-8916-cb75de47dd1e`, `https://buscarte.com.ar`.
- Deploy activo: `6ad0c656fae3a210383bc9ca`, estado `ready`.
- Service worker: `buscarte-v27-2026-10-15-mobile-retorno`.
- Paquete: 69 archivos permitidos en `dist/`; nunca se publicó la raíz del repositorio.

## Resultado

Respuestas rápidas del chat visibles y táctiles, menú Mi cuenta desplazable en pantallas bajas/horizontales y retorno desde perfiles que conserva filtros, orden, vista, cantidad cargada y posición de Artistas. La selección de una respuesta rápida sólo completa el borrador, sin enviarlo. La restauración usa cada entrada de historial y respeta gestos posteriores del usuario; una búsqueda nueva no hereda otra sesión de navegación. Enlaces directos, pestañas nuevas y compartir conservan sus destinos limpios.

Sólo cambian cinco recursos públicos: CSS compartido, búsqueda, perfil público, mensajes y versión del service worker. Contratos de datos, sesiones, funciones, configuración, manifest, assetlinks, paquete/firma Android y horarios no se modificaron. Alcance y detalles de implementación/pruebas en `qa-mobile-retorno-20261015.md`.

## Verificaciones

- Antes de publicar: 27/27 controles mobile y 13/13 retorno/historial, incluyendo BFCache nativo; cinco comprobaciones complementarias con fuentes reales. Matriz A2: 123 escenarios, sin excepciones, tráfico imprevisto o deriva de fuentes; regresión de sesión segura aprobada.
- Empaquetado 26/26, build de 69 archivos y `git diff --check` aprobados. Preflight independiente comprobó allowlist y hashes de los 69 archivos; sólo los cinco recursos públicos esperados difieren del corte anterior.
- Después de publicar: 68 recursos, 35 rutas y cuatro exclusiones comprobados contra el dominio, con contenido servido igual al build donde corresponde. Manifest, assetlinks y SW incluidos. Escaneo de secretos remoto: 172 archivos, cero coincidencias.
- Tres recorridos de navegador contra los estáticos **reales del dominio** aprobados: chat 390×844, Mi cuenta 844×390 y Artistas→perfil→Atrás con 18 tarjetas, filtros, vista y posición restaurados. Backend/datos interceptados y sintéticos, cualquier petición inesperada bloqueada; ningún handler de producción ejecutado.
- La primera corrida postdeploy tuvo un timeout de la propia comprobación por exigir mayúsculas en la URL; Netlify Pretty URLs redirige a minúsculas. Se corrigió únicamente la expresión de navegación del script privado y la corrida final fue 3/3. No fue necesario otro cambio o deploy de la aplicación.

## Funciones y correos programados

Siete funciones conservadas en `nodejs24.x`. Cinco digests remotos son idénticos al corte anterior. Los ZIP de `recordatorio-perfil` y `resumen-mensual` tienen nuevos digests, **no se declara identidad binaria remota**. Sus fuentes, helper de sesión, dependencias/lockfile y configuración son idénticos desde la fuente publicada anterior `98b07bf`.

Prueba de empaquetado offline con NFT: ambos ZIP incluyen el `package.json` raíz y la única entrada que difiere entre las dos fuentes es ese archivo (2277→2431 bytes), que sólo agrega los dos comandos de pruebas de este bloque. Handler, helper y archivos de soporte quedan idénticos. Esta prueba explica la diferencia de metadatos sin atribuirla a cambios de lógica; no reproduce necesariamente todos los flags y digests del CI remoto. No se invocaron los cron ni se enviaron correos de prueba.

Horarios remotos comprobados sin cambios:

- `recordatorio-perfil`: `0 13 * * 1`, lunes a las 10:00 ART.
- `resumen-mensual`: `0 13 1 * *`, día 1 a las 10:00 ART.

## Evidencia y límites

Evidencia privada fuera de Git y publicación: `../BuscARTE-resguardos/mobile-release-20261015/` (`baseline.json`, `published.json`, `static-live.json`, prueba offline de ZIP y `live-check-2026-10-15T12-32-56-027Z/`). Los registros previos y capturas están referidos desde el informe QA.

No hubo migraciones, cambios de permisos, cuentas/usuarios, publicaciones, mensajes, visitas, subidas o correos reales de prueba. Guía ajena `guia-prueba-app-usuario-nuevo.md` y `preview/` conservados y excluidos. Original y worktree Android no se tocaron.

La app TWA recibe estos cambios web sin otro AAB: cerrar y reabrir conectada, y recargar/reabrir si el SW aún sirve la versión previa. Falta validar en un teléfono real teclado, barras del sistema, selector de archivos/cámara, captcha y persistencia de sesión. Las pruebas de navegador no certifican esos componentes ni permiten prometer ausencia total de bugs.

Google Play Console se revisará en el siguiente bloque, con nuevo OK: motivo real de rechazo, requisitos/fecha habilitada, pista, ficha, versión y firma. No se presentó ni reenvió solicitud a Google en este bloque. El cierre documental usa `[skip netlify]` para no crear otro deploy.
