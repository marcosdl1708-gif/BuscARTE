# Release — coherencia de los diez rubros existentes

Publicado el **6/9/2026 a las 15:42:59 ART** (18:42:59 UTC), autorizado: «Hace deploy y atacamos los mails».

- Dominio: https://buscarte.com.ar.
- Sitio Netlify: `43524f56-8833-41ab-8916-cb75de47dd1e`.
- Deploy confirmado activo, ready/production: `6a9db430d7eed8dbdc9489d2`.
- Fuente pública: `e4783b7756f92ed32f44b6577d32dff6f0c3669e`; HEAD al publicar: `d5352f4`.
- Rama: `codex/coherencia-rubros-20260906`; caché `buscarte-v16-2026-09-06-coherencia-rubros`.
- Anterior: `6a9da7082372f367b398b7c3` / `5b26d0a` / v15.
- [Deploy y logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9db430d7eed8dbdc9489d2).

## Alcance y publicación

Textos compartidos neutrales, campos/acciones de completitud propios de cada rubro, selector mobile legible, metadata general y diez accesos también en Home legacy. Se conserva su sección histórica de ejemplos. No es multirrubro: no cambian taxonomía, filtros, tablas, Auth ni contratos. Ver `qa-coherencia-rubros-20260906.md`. Correo y Android permanecen intactos en esta publicación.

Las guías de Netlify orientaron la comprobación de sitio/contexto y paquete delimitado. Se reutilizó CLI 27.5.0 con Node 24.19.0, sin instalar dependencias ni modificar variables remotas. Se verificó producción antes del despliegue y se construyeron los 36 archivos allowlisted de dist; fuentes y funciones congeladas durante QA y publicación.

```sh
netlify deploy --prod --no-build --dir dist --functions netlify/functions --site 43524f56-8833-41ab-8916-cb75de47dd1e --message "Coherencia 10 rubros v16 — e4783b7 — 412 regresiones y 16 smokes locales verificados" --json
```

Exit 0. **Un único deploy de producción**, sin preview, push ni cambios de planes/pagos. Nunca se publicó la raíz. Un helper privado de lectura requirió corregir las claves abreviadas de metadata de funciones (`n/d/r`); la primera ejecución del wrapper de deploy se detuvo antes de invocar Netlify porque el preflight todavía estaba en curso. Ambos fueron fallos locales/read-only, no publicaciones ni reintentos remotos. Se preservó una marca de intento exclusiva antes de la única invocación efectiva.

## Verificación

- Regresión final **412/412**, 400,0 s, sin fallos/omitidas: empaquetado, captcha, publicación, Inicio/sesión/visual, perfil propio, chat, Marketplace, guardado/danza, onboarding, progreso y coherencia. Mismas fuentes públicas finales publicadas.
- Smokes ampliados de 14 a **16**, conservando los previos y agregando diez rubros en ambas Home y perfiles no musicales. Definitiva local **16/16**, 18,1 s; producción **16/16**, 27,6 s.
- Comparación de **35 recursos y 35 rutas**, cuatro exclusiones con 404. Assets por bytes; HTML con normalización inerte/acotada de Pretty URLs. No es inventario remoto exhaustivo.
- Smokes de producción: 17 contextos sintéticos, 94 GET estáticos; cero solicitudes inesperadas ni errores de página/consola/red. Se inspeccionaron capturas de Home legacy y checklist maquillaje a 320 px.
- Cuatro funciones con **hashes binarios y runtime nodejs24.x idénticos** antes/después. Horarios idénticos: recordatorio-perfil `0 13 * * 1`, resumen-mensual `0 13 1 * *`.

Los smokes sólo permiten GET de archivos públicos revisados y controlan redirecciones. Todo el backend, altas, PATCH, mensajes, Storage, tracking, captcha y correos se simula o bloquea; service workers y WebSockets bloqueados. **No se crearon cuentas ni se enviaron correos de prueba reales.** No se invocaron funciones manualmente ni se modificó la base de datos.

Viewport móvil no equivale a prueba física: app instalada, teclado nativo y entrega/integración real de captcha/RPC/RLS/Storage/correo siguen pendientes de un entorno/cuenta expresamente autorizados. No hubo compilación Android ni cambios de manifest, assetlinks, dominio o firma.

## Evidencia y continuidad

Evidencia privada en `../BuscARTE-resguardos/release-coherencia-rubros-20260906`: metadata-before/preflight/published, deploy-attempt/result, predeploy-regression.log, production-files.json, smoke-local-16-final y smoke-production con logs/informes/capturas. Respaldo Git descrito en RESGUARDO.md. No publicar evidencia ni confundir el bundle con respaldo de la base remota o contra pérdida del disco.

No hubo rollback. Si se detecta una regresión atribuible a este release, comprobar primero qué deploy sigue activo antes de restaurar el anterior `6a9da7082372f367b398b7c3`; no pisar una publicación posterior ni tocar datos. Verificar dominio, caché, funciones y flujos tras la reversión.

GitHub main no se sincronizó: evitar otro deploy accidental por push. Originales y Android preservados. Siguiente bloque autorizado: **bienvenida únicamente en local**, plantilla/enlaces y pruebas sin envíos, conservando handler, destinatarios, cadencia, otras siete plantillas y configuración. No incluido en este deploy.

Además de multirrubro/principal postergado, queda feedback de engagement completo (recordatorios/segmentación/bajas/frecuencia), roles técnicos y clasificación por experiencia/venue, identidad visual/editorial más humana y material real/Instagram. Los bugs originales tienen correcciones web verificadas; no se declara resuelto el QA físico ni probado un aumento de completitud/engagement.
