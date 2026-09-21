# Enlaces de Instagram — 21/9/2026

Usuario autorizó corrección y un deploy tras reportar los perfiles 304 y 309. El editor guarda usuario o @usuario; el perfil público aplicaba `safeUrl` al valor sin considerar la plataforma y generaba un host incorrecto. Los dos formatos reportados fueron confirmados mediante GET público limitado a id/redes; no se modificaron filas ni se accedió a credenciales de usuarios.

La función `socialUrl` interpreta únicamente la clave de Instagram: usuario, @usuario, URL completa o URL de instagram.com sin esquema. Construye HTTPS del dominio de Instagram; rechaza hosts ajenos, credenciales y puertos no estándar. Conserva rutas/query de enlaces completos. No modifica safeUrl, otras redes, videos/fotos, guardado, Auth, datos ni Android. Mantiene escapeHtml, target=_blank y rel=noopener noreferrer. Los datos anteriores quedan cubiertos sin volver a guardar el perfil.

Tres pruebas focalizadas aprobadas: formatos compatibles, destinos inválidos/otras redes y toque móvil emulado con navegación a Instagram completamente interceptada. Sin cuentas, escrituras, correos ni visitas reales a Instagram durante pruebas. Sintaxis inline validada; build37. Revisión estática independiente sin hallazgos bloqueantes.

Fuente `17b844f`; deploy único `6ab1abe3118fa89e00fdf1e8`; SW `buscarte-v23-2026-09-21-instagram`. Verificación remota en `../BuscARTE-resguardos/instagram-links-20260921/after.json`: perfil HTML/scripts y SW publicados, ambos enlaces reportados resueltos desde el código online, campos reportados sin cambios, cinco paquetes/runtimes de funciones y dos cron comparados con la publicación anterior. GitHub se sincroniza con cierre `[skip netlify]`, sin segundo deploy; resultado en `github-after.json` del mismo resguardo.

Guía ajena preservada y excluida: SHA256 `cb3fa88aecc1537af9d936f9997934d3eb1fdb9a88779c4f5aadc9a4d688bb3f`. Original y Android intactos. No se aplicó ninguna migración ni cambio de configuración.

Las guías de Supabase y Netlify limitaron el trabajo a lecturas públicas y publicación del dist existente. Referencia de lectura: [selección de datos](https://supabase.com/docs/reference/javascript/select); changelog revisado sin cambio relevante para esta consulta. No se certifica disponibilidad del perfil dentro de Instagram ni comportamiento de su aplicación instalada: la comprobación física final es reabrir buscARTE conectado y tocar Instagram en los perfiles reportados. No necesitan editar su cuenta ni instalar otro APK por este cambio web.
