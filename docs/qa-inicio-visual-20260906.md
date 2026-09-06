# QA local — Inicio más claro en mobile

Cierre del 6/9/2026. Rama `codex/inicio-visual-20260906`, desde `91608addecca582af0e04bab7197efd406cf0be0`. Implementación y pruebas: `5b26d0a4621e20fa093c319f63ce750478e9f13e`. Incluye el onboarding local anterior.

**Sólo local: sin deploy, preview ni push.** Caché preparada en v15. Última producción verificada en el release anterior: `6a9d8cbb808123cc8c948eb2`, fuente `8957ad0`, caché v13. No se consultó Netlify en este bloque ni se consumieron créditos de publicación.

## Alcance

- Primer pantallazo más breve, con búsqueda como acción principal y registro secundario. Menos mensajes repetidos, tarjetas más legibles, espaciado consistente y estadísticas después de las acciones y ejemplos.
- Se conserva la identidad de colores y tipografías existentes. Se eliminan las tiras decorativas de texto y la indicación de scroll, sin introducir imágenes generadas ni material de personas nuevas.
- Los perfiles ilustrativos existentes quedan identificados como ejemplos; se retiran sus porcentajes ficticios de afinidad. No se presentan como usuarios reales ni se convierten en un catálogo conectado al backend.
- Se mantienen las variantes de visitante, cuenta conocida y recuperación, los cuatro accesos de la cuenta y la protección visual durante la carga. No se vuelven a ofrecer CTAs de registro a una cuenta conocida.
- La Home histórica conserva su buscador musical. Sus tres tarjetas con acciones `irA(...)` pasan de divs a botones nativos, utilizables con Enter y espacio, sin cambiar los handlers ni su puerta de registro para invitados. Marketplace sigue siendo un enlace a productos.
- Foco visible, controles principales de al menos 44 px, anclas con separación del encabezado y movimiento reducido. Las secciones no dependen de animaciones para aparecer.

## Contratos preservados

Las dos URLs siguen separadas: `index.html#explorar` apunta a rubros y `buscARTE_index.html#explorar` a perfiles ilustrativos. No se fusionaron ni redirigieron. El nuevo atajo de búsqueda en la segunda Home duplica un destino ya disponible; conserva además su enlace al ancla, ahora rotulado como ejemplos.

La suite compara con `91608ad`: todos los IDs existentes, cada aparición de los hrefs previos, clases/destinos de `#explorar`, scripts completos e imports, handlers y campos de búsqueda con opciones/defaults. Se conservan las consultas de estadísticas y sus valores; la etiqueta de la Home histórica ahora dice «Perfiles registrados» porque esa consulta cuenta perfiles, no sólo artistas.

Sin cambios de JS de sesión, filtros, rubros, anuncios, Marketplace, permisos, Auth, API, funciones, base de datos, manifiesto, redirects, asset links, configuración Netlify, allowlist ni dependencias. El único cambio de service worker es la versión de caché. Android y la carpeta original quedan intactos.

## Verificación y cronología

Se cubrieron **334 casos distintos**, sin sumar repeticiones como cobertura nueva:

1. Regresión general **334/334**, 342,7 segundos: 286 casos previos y 48 nuevos de Inicio visual. Log `local-regression-final.log`. Esta corrida terminó correctamente, pero precede a los últimos ajustes de CSS del encabezado intermedio y de los números decorativos.
2. Después de esos ajustes se repitieron las **80/80 pruebas de Inicio**: 48 visuales y 32 existentes de sesión, con aserciones reforzadas; 61,0 segundos. Log definitivo `visual-cierre-final-80.log`. Las demás fuentes funcionales permanecieron sin cambios. No se declara una segunda corrida completa de 334 sobre el CSS final.
3. Matriz adicional con **16/16 escenarios y fuentes reales**, ambas Home, visitante/cuenta conocida, 320, 390, 769 y 1280 px; 24 capturas. Informe definitivo `fonts-real/font-qa.json`. Verificación de Archivo/Archivo Black cargadas, viewport físico, desborde, controles, encabezado y CTA visible a 390 × 844.

Node 24.19.0, Playwright 1.62.1, Edge headless. Las 48 pruebas nuevas incluyen contratos, ejemplos honestos, ambas Home en tres estados de sesión y seis anchos (320, 390, 768, 769, 820 y 1280), anclas, foco/movimiento reducido y teclado en las tarjetas históricas. Aserciones de separación entre controles, kicker no tapado, variantes de navegación exclusivas y menú inicialmente cerrado. Los números decorativos se comprueban ocultos en los cuatro pasos legacy, a todos los anchos probados.

Durante las iteraciones se detectaron y corrigieron tres problemas: una regla genérica de display exponía el acceso de recuperación en otros estados; el encabezado quedaba apretado y cubría el texto introductorio en anchos intermedios; y los números gigantes heredados tapaban títulos de tarjetas. Este último surgió de la inspección visual con las fuentes reales, aunque la geometría automática pasaba. Las capturas definitivas fueron regeneradas tras corregirlos y revisadas directamente en mobile, tablet y escritorio.

Build final: **36 archivos públicos verificados**, sin ampliar `site-files.json`; `git diff --check` correcto. Revisión independiente de límites y contratos sin hallazgos bloqueantes al cierre.

```powershell
# Regresión general (la corrida de este cierre precedió a los dos últimos ajustes de CSS):
node --test --test-concurrency=1 scripts/build-site.test.mjs scripts/registro-captcha.test.cjs scripts/anuncios-publicacion.test.cjs scripts/inicio-sesion.test.cjs scripts/inicio-visual.test.cjs scripts/perfil-propio.test.cjs scripts/chat-perfil.test.cjs scripts/marketplace.test.cjs scripts/perfil-guardado.test.cjs scripts/onboarding.test.cjs scripts/perfil-progreso.test.cjs
# Repetición final de las suites afectadas:
node --test --test-concurrency=1 scripts/inicio-sesion.test.cjs scripts/inicio-visual.test.cjs
node scripts/build-site.mjs
```

Disponible `npm run test:inicio-visual`. `BUSCARTE_QA_OUTPUT` guarda capturas sintéticas fuera del repositorio. `BUSCARTE_INICIO_VISUAL_BASELINE=1` ejecuta por separado 12 capturas históricas de `91608ad`; sirven para comparación visual y no se cuentan como pruebas de la mejora.

## Aislamiento y evidencia

Las suites usan fixtures locales, bloquean service workers y WebSockets, responden en memoria las solicitudes conocidas y rechazan las demás. No consultan ni escriben usuarios reales. La navegación por teclado se verifica contra páginas destino sintéticas sin scripts ni backend.

La comprobación privada con fuentes reales es separada: permite exclusivamente tres GET públicos de Google Fonts por corrida (una hoja CSS y dos WOFF2). El contenido web es local y todo el backend permanece simulado/bloqueado. No generó cuentas, publicaciones, mensajes, fotos ni emails. Los hashes de las fuentes y los archivos examinados están en su informe; no se agregaron assets ni dependencias al sitio.

Directorio privado: `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\inicio-visual-20260906`. Referencias de cierre: `local-regression-final.log` para la regresión general anterior a los ajustes finales; `visual-cierre-final-80.log` y `visual-final/` para Inicio definitivo; `fonts-real/` para la matriz final con fuentes reales. Los demás logs son iteraciones históricas y pueden contener los fallos detectados durante el desarrollo. No publicarlos.

## Límites y siguiente corte

- Pendiente comprobación de la app instalada/dispositivo físico, teclado nativo y navegadores distintos de Edge. No se compiló ni editó Android. No se certifica la integración real de Auth, captcha, RPC, Storage o correo mediante estas pruebas visuales.
- Se conserva una deuda previa del buscador musical histórico: el selector de objetivo no participa en la URL generada por `buscarDesdeIndex`. También se preserva su gate de registro en las tres tarjetas. No se cambió lógica funcional para resolverlas en este bloque.
- Multirrubro/disciplinas múltiples y principal entre rubros siguen expresamente postergados. Roles técnicos, emails de engagement, campañas/Instagram, migración Auth y rediseño amplio quedan fuera de alcance.
- Inicio y onboarding permanecen locales; se pueden proponer como un corte conjunto después de revisar las pantallas. Cualquier publicación requiere autorización y comprobación del paquete/contexto. No hacer push a `main` que dispare un deploy por accidente ni publicar la raíz.
- Reversión revisable: preparar una rama desde `91608ad` para conservar onboarding sin este bloque, o revertir el commit funcional. No usar reset destructivo ni tocar originales/Android. Resguardo del historial en el directorio privado indicado, con verificación y límites en `RESGUARDO.md`; no incluye la base remota ni protege contra pérdida del disco.
