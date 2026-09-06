# Release — Marketplace + guardado de danza

Publicado el **6/9/2026 a las 12:54:38 ART** (15:54:38 UTC), tras la indicación del usuario: «agregue creditos de netlify, go».

- Dominio: https://buscarte.com.ar.
- Sitio Netlify: `43524f56-8833-41ab-8916-cb75de47dd1e`.
- Deploy confirmado activo, `ready`, contexto `production`: `6a9d8cbb808123cc8c948eb2`.
- Fuente pública: `8957ad0523e85d30188c7dfb55b77318f7576fb9`; HEAD al publicar `57064cc2367feded16551f781abddc62f96ba05d` (diagnóstico/documentación).
- Rama: `codex/danza-guardado-20260906`; caché `buscarte-v13-2026-09-06-perfil-danza`.
- Referencia anterior: `6a9cd36de8ea461b8c4b7063` / `a441167` / v11.
- [Deploy y logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9d8cbb808123cc8c948eb2).

## Alcance y publicación

Incluye el catálogo de Marketplace (productos, filtros y acción de publicar venta/alquiler) y la corrección del guardado/visualización de estilos de danza, incluido el botón Guardar accesible en mobile. No incorpora onboarding ni el cambio de modelo para disciplinas múltiples/principal.

El intento anterior había sido rechazado por falta de créditos utilizables para producción, sin crear deploy. Ese historial permanece en `docs/deploy-marketplace-danza-20260906.md`. Tras la intervención del usuario, una consulta autenticada confirmó `in_operational_mode: false`, cuenta activa y producción anterior sin cambios. No se modificaron planes, pagos, permisos ni credenciales desde esta tarea.

La guía de Netlify orientó la comprobación del sitio y la publicación del paquete ya validado, preservando funciones/configuración y evitando otra preview. CLI 27.5.0 / Node 24.19.0, build local 36/36 archivos, sin cambios públicos respecto de `8957ad0`:

```sh
netlify deploy --prod --no-build --dir dist --functions netlify/functions --site 43524f56-8833-41ab-8916-cb75de47dd1e --message "Release Marketplace + guardado danza 8957ad0 - 214 pruebas locales - sin onboarding ni migracion Auth" --json
```

Resultado exit 0: **un deploy exitoso de producción en esta reanudación**, sin preview ni push. Se publicaron sólo `dist/` y las funciones existentes; no la raíz ni documentos, campañas, respaldos o claves. Netlify informó siete archivos nuevos/cambiados (seis páginas y un asset), 35 reglas y ningún header o Edge Function nuevo.

## Verificación

- **214/214 pruebas locales** en una corrida antes del primer intento. Al retomar se comprobó que la fuente pública no había cambiado, se repitió build y revisión independiente del alcance.
- **35 recursos y 35 rutas comprobados contra producción**, con cuatro exclusiones respondiendo 404. Bytes exactos en assets; HTML con la normalización inerte de Pretty URLs/serialización ya documentada. No equivale a un inventario remoto exhaustivo.
- **11/11 smoke tests aprobados contra https://buscarte.com.ar**, además de los 11 locales previos. Incluyen Home, captcha, anuncios, perfil propio, chat → perfil, ambas Home → Marketplace con filtros combinados y guardado sintético Tango → Ballet → recarga → perfil público.
- Capturas de Marketplace y danza a 320 px revisadas; botón Guardar dentro del viewport y confirmación visible. Cero solicitudes inesperadas ni errores de página/consola/red en el informe final.
- Sólo GET estáticos permitidos llegaron al dominio. Backend, PATCH, RPC automática de vencimiento, publicaciones, mensajes, registro, emails, captcha y tracking permanecieron simulados o bloqueados. No se crearon anuncios ni modificaron perfiles reales. Los informes del PATCH sólo conservan `prefer` y `content-type`.

## Funciones y compatibilidad

Hashes binarios, runtimes y horarios remotos idénticos al deploy anterior:

| Función | SHA-256 | Runtime / horario UTC |
| --- | --- | --- |
| recordatorio-perfil | `9bb512cfd1d732fcb217e47a08b486fd6230681c060bfae43579fef62a37d42b` | nodejs24.x / `0 13 * * 1` |
| reset-password | `93ece7099dd5df6485983aaaa0bce7a2301bdf691b5deccdc80bb2baec7c7bc1` | nodejs24.x |
| resumen-mensual | `62100fbf71e00a910845eba74ea080fb1545978f591cefeeac9301c0777611a8` | nodejs24.x / `0 13 1 * *` |
| send-email | `1c9c2ff51c6f71c987aa258039c59e436557c6f632b63566852b7588dfcb6c7f` | nodejs24.x |

Sin cambios de Auth, base de datos, dominios, variables, manifest, assetlinks ni firma Android. La app instalada/dispositivo físico sigue pendiente de comprobar; no hubo recompilación. No confundir los tests de viewport móvil con una validación nativa completa.

## Evidencia, reversión y continuidad

Evidencia privada en `../BuscARTE-resguardos/release-marketplace-danza-20260906/`: `metadata-before.json`, `deploy-blocked.json`, `metadata-published.json`, `predeploy-regression.log`, `production-files.json` y `smoke-production/deploy-smoke.json` con capturas. Los directorios `smoke-local*` son históricos/locales y no sustituyen la verificación remota.

No se hizo rollback. Si aparece una regresión de este release, comprobar primero que siga activo antes de restaurar `6a9cd36de8ea461b8c4b7063`; nunca pisar una publicación posterior ni restaurar datos por una reversión web.

GitHub `main` continúa pendiente de incorporar estos bloques; no se hizo push que pudiera duplicar deploy. Continuar en la copia canónica y conservar los originales/Android. Próximo bloque propuesto: alta más breve y completitud progresiva del perfil, inicialmente en local y separado de la migración Auth.
