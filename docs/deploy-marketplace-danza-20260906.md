# Publicación pendiente — Marketplace + guardado de danza

El usuario autorizó publicar ambos bloques juntos. El 6/9/2026 se hizo **un intento de deploy**, rechazado por Netlify con `JSONHTTPError: Forbidden` (exit 1). **No se publicó este paquete ni se obtuvo un nuevo deploy ID.**

## Causa y estado seguro

El panel de Netlify confirmó que el equipo está en modo de **créditos operativos**: el saldo restante sostiene los sitios existentes, pero los deploys de producción y Agent Runners están pausados. `getAccount` confirmó `in_operational_mode: true`; el usuario autenticado es Owner y la cuenta sigue activa. Los arrays `usages_exceeded` vacíos no bastan para descartar este bloqueo. El próximo período informado comienza el 14/9/2026 a las 04:00 ART.

No se reintentó para obtener más detalle, no se cambió de plan, no se compraron créditos y no se alteraron permisos. La guía de Netlify se usó para comprobar autenticación/sitio, publicar sólo el paquete preparado y separar el fallo de plataforma de las pruebas del código. El detalle de saldo queda en evidencia privada, no en el paquete público.

Producción conserva el deploy `6a9cd36de8ea461b8c4b7063`, fuente pública `a441167`, caché `buscarte-v11-2026-09-05-perfil-chat`. La lista de deploys y la consulta del proyecto después del rechazo mantienen esa referencia. No se necesita rollback: no hubo publicación nueva.

## Paquete preparado

- Repositorio canónico: `BuscARTE-web`; rama `codex/danza-guardado-20260906`.
- Fuente pública candidata: `8957ad0523e85d30188c7dfb55b77318f7576fb9`; HEAD al inicio: `b0e0d7a105a540faeb05f7abd83790539b8db9f9`.
- Incluye Marketplace y guardado/visualización de estilos de danza. No incluye onboarding, disciplinas múltiples/principal ni migración Auth.
- Caché candidata: `buscarte-v13-2026-09-06-perfil-danza`.
- Build: 36/36 archivos de la lista permitida. Sólo `dist/` más las funciones existentes, nunca la raíz del repositorio.
- No se modificaron funciones, horarios, Auth, contratos de datos, configuración Netlify ni identidad Android.

Comando ejecutado con Netlify CLI 27.5.0 ya instalado y autenticado, Node 24.19.0:

```sh
netlify deploy --prod --no-build --dir dist --functions netlify/functions --site 43524f56-8833-41ab-8916-cb75de47dd1e --message "Release Marketplace + guardado danza 8957ad0 - 214 pruebas locales - sin onboarding ni migracion Auth" --json
```

No se creó otra preview ni se hizo push a GitHub. La conexión de `main` con Netlify sigue intacta; un push no es una alternativa para esquivar el bloqueo ni está autorizado en este cierre.

## Validación local y límites

- Regresión completa: **214/214 aprobadas en una sola corrida**, sin saltos ni fallos. Log privado `predeploy-regression.log`.
- Diagnóstico de publicación ampliado: **11/11 aprobados sobre un servidor local**, no sobre producción. Añade ambas Home → Marketplace a 320 px, filtros combinados con casos negativos y CTA visible, y edición sintética Tango → Ballet → recarga → perfil público coherente.
- Todo backend, PATCH, RPC de vencimiento, registro, emails, chat, captcha y tracking se simulan o bloquean. Sólo GET estáticos de la lista permitida pueden llegar al origen elegido; cada salto de redirección se valida. Workers/WebSockets bloqueados.
- Capturas de diagnóstico sin animaciones; revisadas a 320 px. El código del sitio no cambió en este intento.
- Revisión posterior del diagnóstico limita los headers registrados a `prefer` y `content-type`, sin claves de acceso. El caso de danza se repitió y aprobó **1/1**, en evidencia separada.
- **No se ejecutaron verificaciones contra producción con el paquete nuevo**: el sitio todavía sirve la versión anterior. No presentar los 11 casos locales como QA del release publicado.
- La app instalada/dispositivo físico sigue sin validar; no hubo recompilación Android ni escritura de prueba a usuarios reales.

Evidencia privada: `../BuscARTE-resguardos/release-marketplace-danza-20260906/`, con `metadata-before.json`, `predeploy-regression.log`, `smoke-local-final/`, `smoke-local-headers-review/` y `deploy-blocked.json`.

## Para retomar

1. Resolver la disponibilidad para deploy de producción (renovación de ciclo, o decisión explícita del usuario sobre un cambio de plan). No reintentar mientras el panel siga pausado.
2. Volver a comprobar HEAD, diferencias locales, paquete permitido y deploy activo; los hashes de este documento son un corte histórico.
3. Si sigue aprobado el mismo corte, hacer una publicación y verificar nuevo ID activo, recursos/rutas/exclusiones, 11 smoke tests aislados y hashes/runtimes/horarios de funciones contra la referencia vigente.
4. Registrar la publicación sólo después de esa confirmación. No promover previews antiguas ni incluir cambios futuros sin revisar el nuevo alcance.

Onboarding/completitud progresiva sigue siendo el siguiente bloque propuesto, pendiente de decisión del usuario. Se puede trabajar en local sin publicar, pero no se inició en este intento.
