# Release — onboarding + Inicio visual

Publicado el **6/9/2026 a las 14:46:51 ART** (17:46:51 UTC), autorizado por el usuario: «Go con el deploy y decime que seguiria».

- Dominio: https://buscarte.com.ar.
- Sitio Netlify: `43524f56-8833-41ab-8916-cb75de47dd1e`.
- Deploy confirmado activo, `ready`, contexto `production`: `6a9da7082372f367b398b7c3`.
- Fuente pública: `5b26d0a4621e20fa093c319f63ce750478e9f13e`. HEAD al publicar: `dbfb132d7ddbcc7c18c9965de39ad2e5bc4a7548` (amplía sólo pruebas de publicación).
- Rama: `codex/inicio-visual-20260906`; caché `buscarte-v15-2026-09-06-inicio-visual`.
- Punto anterior verificado: `6a9d8cbb808123cc8c948eb2` / `8957ad0` / v13.
- [Deploy y logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9da7082372f367b398b7c3).

## Alcance publicado

Alta artística breve de cuatro pantallas por defecto, detalles opcionales, salida a explorar y perfil progresivo con cinco básicos calculados sobre datos confirmados. Inicio más breve y legible, acciones prioritarias, estadísticas más abajo y perfiles ilustrativos identificados como ejemplos. Las dos Home conservan sus URLs, anclas distintas y estados de sesión. Incluye los arreglos anteriores ya publicados.

Sin migración Auth, multirrubro/principal entre rubros, cambios de datos/esquema, filtros o funciones de correo. No se editó/compiló Android ni se cambiaron dominio, manifest, assetlinks o firma. El alcance y límites funcionales están en `qa-onboarding-progresivo-20260906.md` y `qa-inicio-visual-20260906.md`; sus notas «sólo local» describen el estado anterior a esta publicación.

## Publicación controlada

Las guías de Netlify orientaron la comprobación de autenticación, sitio y contexto antes de subir el paquete delimitado, sin otra preview. Se reutilizó CLI 27.5.0 ya disponible en la caché pnpm de la PC, ejecutado con Node 24.19.0. No se instaló ni actualizó una dependencia. `npx` no estaba en PATH; se localizó el CLI existente y se verificaron `status` y `deploy --help`.

Árbol limpio al iniciar. Antes de publicar se volvió a confirmar que producción seguía en el deploy anterior y se reconstruyeron/verificaron los **36 archivos públicos** de la allowlist. Sólo seis recursos públicos difieren de la versión anterior: ambas Home, registro, perfil, CSS compartido de Inicio y service worker. Funciones, dependencias, configuración y contratos protegidos permanecen sin cambios.

```sh
netlify deploy --prod --no-build --dir dist --functions netlify/functions --site 43524f56-8833-41ab-8916-cb75de47dd1e --message "Release onboarding + Inicio visual 5b26d0a - 334 pruebas y 14 smokes locales - sin migracion Auth" --json
```

Exit 0: **un único deploy de producción**, sin preview, push, cambio de planes/pagos o configuración remota. Se publicaron sólo `dist/` y las funciones existentes, nunca la raíz. Netlify informó cuatro páginas y dos assets nuevos/cambiados, 35 reglas, sin headers ni Edge Functions nuevos.

## Verificación

- Regresión predeploy **334/334 en una corrida** sobre la fuente final, 350,9 segundos, sin fallas, cancelaciones ni omitidas. Incluye empaquetado, captcha, anuncios, sesión/Inicio visual, perfil propio, chat, Marketplace, guardado/danza, onboarding y progreso. No hubo cambios de fuentes públicas después.
- Smoke ampliado a **14 casos**: conserva los 11 previos y agrega Inicio visual, alta breve sintética → perfil y progreso confirmado tras guardar. **14/14 locales**, 17,0 segundos. Una primera corrida local fue 13/14 por ECONNRESET al servir un asset de loopback; se preservó la evidencia y se repitió con el servidor privado cerrando conexiones por respuesta, sin ignorar errores ni debilitar aserciones.
- **35 recursos y 35 rutas verificados contra producción**, más cuatro exclusiones con 404. Assets comparados por bytes; HTML mediante la normalización inerte y acotada de Pretty URLs/serialización ya existente. No equivale a un inventario remoto exhaustivo.
- **14/14 smoke tests en https://buscarte.com.ar**, 21,2 segundos. 78 GET estáticos servidos, cero solicitudes inesperadas ni errores de red/página/consola en todos los casos. CSS/JS exactos y MIME comprobado; el comparador separado verifica HTML.
- Revisión directa de capturas de producción a 320 px: éxito del alta breve y perfil progresivo después de guardar. La revisión tipográfica con fuentes reales del bloque local sigue documentada por separado; las fuentes y el captcha de los smokes son sintéticos.

Los smokes sólo permiten GET de assets allowlisted del dominio elegido y controlan cada salto de redirección. Backend, registro/RPC, bienvenida, PATCH, publicaciones, Storage, mensajes, tracking y captcha permanecen simulados o bloqueados. La única alta y bienvenida registradas en el informe son fixtures en memoria: **no se crearon cuentas ni se enviaron correos de prueba reales**. Service workers y WebSockets bloqueados. El servidor local quedó cerrado; no quedaron procesos de pruebas activos.

## Funciones y compatibilidad

La metadata anterior y posterior confirma **los cuatro hashes binarios, runtimes nodejs24.x y horarios idénticos**: `recordatorio-perfil` (`0 13 * * 1`), `resumen-mensual` (`0 13 1 * *`), `reset-password` y `send-email`. Los hashes completos están en `metadata-before.json` y `metadata-published.json` privados. No se invocaron manualmente las funciones ni se cambiaron destinatarios/cadencias. El NODE_VERSION histórico de la configuración fuente no se alteró.

Pendiente validación en dispositivo físico/app instalada y teclado nativo; no confundir viewport móvil con QA nativo completo. La app usa el dominio compartido, pero no se declara una prueba física ni una nueva compilación. Integración real de captcha, RPC/RLS, Storage y correo requiere una cuenta/entorno expresamente autorizado.

## Evidencia, reversión y siguiente bloque

Directorio privado: `../BuscARTE-resguardos/release-onboarding-inicio-20260906/`: metadata antes/después, `deploy-result.json`, `predeploy-regression.log`, `production-files.json`, `smoke-production.log`, `smoke-production/deploy-smoke.json` y capturas. El historial completo se respalda en el bundle descrito por `RESGUARDO.md`. No publicar ese directorio; no incluye la base remota ni protege contra pérdida del disco.

No hubo rollback. Si surge una regresión atribuible a este release, comprobar primero que siga activo antes de restaurar `6a9d8cbb808123cc8c948eb2`. No pisar una publicación posterior ni restaurar datos por una reversión web. Después comprobar dominio, caché, funciones y flujos.

GitHub `main` continúa pendiente de sincronización. No hacer push que dispare otro deploy sin acordarlo. Los originales y Android permanecen en sus rutas.

**Siguiente bloque propuesto, no implementado ni autorizado aún: bienvenida útil después del alta breve.** Ajustar sólo ese email: texto más humano y corto, una acción principal para explorar y otra para completar el perfil a su ritmo, con enlaces probados que contemplen volver a ingresar. Preparar/validar localmente sin envíos, sin cambiar destinatarios, frecuencia ni el envoltorio común de los demás correos. No confundirlo con reformar todo el engagement: los recordatorios actuales sólo evalúan foto/bio y las campañas más amplias requieren revisar rol, bajas, cadencia, idempotencia y protección del endpoint por separado. Multirrubro/principal y migración Auth siguen postergados/separados.
