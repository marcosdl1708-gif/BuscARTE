# Release — Inicio + perfil propio/chat

Autorización: «Hace deploy y pasa al sig bloque». Publicado el 5/9/2026 a las 23:44:00 ART (6/9 02:44 UTC).

- Dominio: https://buscarte.com.ar.
- Sitio Netlify: `43524f56-8833-41ab-8916-cb75de47dd1e`.
- Deploy activo y `ready`, contexto `production`: `6a9cd36de8ea461b8c4b7063`.
- Fuente pública: `a4411676f7e4a502ed4fc08241b3b37dba94e88f` en `codex/perfil-chat-20260905`.
- Caché: `buscarte-v11-2026-09-05-perfil-chat`.
- Deploy anterior comprobado antes de publicar: `6a9cbd37518d43630307438c`.
- [Logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9cd36de8ea461b8c4b7063).

## Ejecución y verificación

Netlify CLI 27.5.0 ya autenticado al sitio correcto, Node 24.19.0. Se repitieron las 152 pruebas locales, el build verificó 36 archivos y se comprobó que la fuente pública no difería del commit aprobado. Se publicó únicamente `dist/` y las funciones existentes, sin reconstruir ni promover la preview anterior:

```sh
netlify deploy --prod --no-build --dir dist --functions netlify/functions --site 43524f56-8833-41ab-8916-cb75de47dd1e --message "Release Inicio + perfil/chat a441167 - 152 pruebas locales, Marketplace excluido" --json
```

Se hizo **un deploy de producción, sin nueva preview ni push**. No se cambió la configuración remota, DNS, variables, base de datos o aplicación Android. Netlify no asoció commit_ref al deploy manual; el mensaje identifica la fuente.

Resultados contra `https://buscarte.com.ar`:

- 35 recursos y 35 rutas verificados. Archivos no HTML comparados exactamente; HTML con la normalización de Pretty URLs/serialización inerte ya documentada. README, QA, package.json y script de build responden 404. Esto no equivale a un inventario exhaustivo remoto.
- Ocho smoke tests finales aprobados: Home pública, ambas Home registradas, captcha, formulario mobile de anuncios, publicación simulada, perfil propio y chat → perfil → volver a la misma conversación.
- Los nuevos smoke tests requirieron ajustes del diagnóstico para enlaces Pretty URLs y navegación con body transitoriamente nulo. Se endureció el seguimiento de redirects: cada salto se obtiene manualmente con `maxRedirects:0` y sólo dentro de la lista de GET estáticos permitidos. No se modificaron archivos públicos después de subirlos. La última corrida completa pasó 8/8.
- APIs, RPC automática de vencimiento, registro, mensajes, emails, captcha, fotos, tracking y fuentes externas se simularon o bloquearon. No se crearon registros ni se enviaron mensajes reales; tampoco se invocaron manualmente funciones programadas. Compartir usa un sustituto de prueba, sin clipboard ni UI nativa.
- API de Netlify confirmó el deploy activo, `ready`, contexto `production`, 35 reglas, sin headers nuevos ni Edge Functions.

## Funciones intactas

Los cuatro hashes binarios y runtimes coinciden con producción anterior:

| Función | Hash | Runtime / horario UTC |
| --- | --- | --- |
| recordatorio-perfil | `9bb512cfd1d732fcb217e47a08b486fd6230681c060bfae43579fef62a37d42b` | nodejs24.x / `0 13 * * 1` |
| reset-password | `93ece7099dd5df6485983aaaa0bce7a2301bdf691b5deccdc80bb2baec7c7bc1` | nodejs24.x |
| resumen-mensual | `62100fbf71e00a910845eba74ea080fb1545978f591cefeeac9301c0777611a8` | nodejs24.x / `0 13 1 * *` |
| send-email | `1c9c2ff51c6f71c987aa258039c59e436557c6f632b63566852b7588dfcb6c7f` | nodejs24.x |

## Evidencia, reversión y pendientes

Evidencia privada en `../BuscARTE-resguardos/release-inicio-perfil-chat-20260905/`: `metadata.json`, `production-files.json` y `smoke/final/deploy-smoke.json` con capturas sintéticas. Los reportes iniciales se conservaron aparte, no sustituyen la corrida final. El resguardo anterior completo está en `perfil-chat-20260905/perfil-chat-web-history.bundle`.

No se ejecutó rollback. Ante una regresión de este release, comprobar primero que siga siendo el activo antes de restaurar el deploy anterior `6a9cbd37518d43630307438c`; nunca pisar una publicación posterior de otra persona ni restaurar Supabase por una reversión de web.

Falta probar la app instalada/dispositivo físico, teclado real y compartir nativo. Android usa el dominio de producción; no hubo recompilación ni cambios de firma/manifest/assetlinks. La migración Auth sigue separada y deshabilitada en configuración.

GitHub `main` no recibió estos cambios: conservar la rama local con el código publicado y acordar la sincronización sin duplicar deploy. Marketplace queda explícitamente **fuera** de esta publicación y continúa como siguiente bloque local.
