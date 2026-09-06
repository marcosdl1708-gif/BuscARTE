# QA local — Marketplace de productos

Bloque iniciado el 5/9/2026 y verificado el 6/9 ART. Rama `codex/marketplace-20260905`, desde `584bd65`; implementación y pruebas en `1bb377cf87082cca726bf7bbd001a8bd27a293a8`. Es posterior al deploy de Inicio + perfil/chat y **no está publicado**.

## Problema y alcance

La Home principal enviaba al tablón general; la Home anterior pasaba por una función que exigía registro. Además, `?tipo=vende` seleccionaba un tipo pero no el tablón Marketplace: el filtro de anuncios artísticos excluía precisamente las ventas. El alias `?rubro=marketplace` tampoco se reconocía. Al elegir Marketplace manualmente se mostraban filtros de artistas y no los de productos.

- Ambas Home llevan directamente al catálogo público. Se admiten `?tipo=vende`, el alias histórico `?tipo=vendo` y `?rubro=marketplace`.
- Marketplace reúne ventas/alquileres de todos los rubros, incluidos anuncios históricos `vendo` y vendedores sin rubro. No convierte Marketplace en una disciplina ni modifica el rubro del autor.
- Tarjetas centradas en producto: foto o alternativa sin foto, título, precio o «Consultar precio», categoría, condición, zona y enlace al anuncio. El perfil del vendedor es una acción secundaria.
- Filtros reales de categoría, condición, rango de precio y zona. Varias selecciones del mismo grupo se combinan como alternativas; los grupos se combinan entre sí. Elegir guitarra y usado no devuelve todas las guitarras nuevas ni todos los productos usados.
- Los filtros de productos tienen prioridad visual. El selector de rubros artísticos queda plegado en Marketplace y se mantiene abierto en los tablones artísticos. La barra lateral ofrece venta/alquiler; el modal conserva todos los tipos permitidos para la cuenta.
- Acciones explícitas para publicar venta/alquiler. La exploración es pública; publicar conserva los requisitos y contratos existentes.
- La consulta pide ventas al servidor antes de paginar. El fallback conserva tipo, exclusión de ocultos, orden estable y offset; sólo reduce el tamaño de página. Se evitan duplicados, cargas simultáneas y resultados de una navegación anterior. Un error al cargar más conserva lo ya mostrado y ofrece reintentar.

No se agregan checkout, pagos, conversión de monedas, tablas, disciplinas, roles ni notificaciones. El precio conserva los datos existentes; el rango filtra el importe numérico disponible, sin normalización ni separación por moneda.

## Verificación

La suite `npm run test:marketplace` tiene 31 casos: entradas históricas y Home, navegación por teclado, productos detrás de más de 200 anuncios artísticos, datos antiguos, filtros combinados, roles/publicación, visitante, vacío/error, respuestas tardías, paginación/fallback, destinos producto/perfil, escape de texto y presentación a 320, 390 y 1280 px.

Resultado final: **183/183 pruebas aprobadas**, sin fallas ni casos omitidos, en 98 segundos. Desglose: 15 de empaquetado, 17 de captcha, 31 de publicación de anuncios, 32 de Inicio, 36 de perfil, 21 de chat y 31 de Marketplace. Ejecutado con Node 24.19.0, Playwright 1.62.1 y Edge headless en Windows. Log íntegro: `local-regression-final.log` en la carpeta privada indicada abajo.

El build verificó los mismos 36 archivos públicos, sin documentos ni capturas. `git diff --check` pasó. Se comprobó que funciones, configuración Netlify, assets de Auth/Inicio, dependencias fijadas, manifest, iconos, asset links, redirecciones, perfil público y chat no difieren de la fuente ya publicada `a441167`.

Revisión visual de capturas finales a 320/390/1280 px y filtros a 390 px: catálogo de productos legible, imagen sin recortar, precios y alternativa sin foto, botón de publicación de al menos 44 px, filtros de producto prioritarios y selector artístico plegado. Las pruebas comprueban ausencia de desborde horizontal y funcionamiento de filtros/destinos con scroll. No se sustituye con esto la prueba física de app/teclado. La revisión independiente del diff no encontró bloqueantes; corrigió durante el trabajo la inconsistencia del cursor fallback y reforzó la prohibición de POST de publicación en los 29 casos que sólo navegan.

Comando integral reproducible, excluyendo deliberadamente los diagnósticos de deploy remoto:

```sh
node --test --test-concurrency=1 scripts/build-site.test.mjs scripts/registro-captcha.test.cjs scripts/anuncios-publicacion.test.cjs scripts/inicio-sesion.test.cjs scripts/perfil-propio.test.cjs scripts/chat-perfil.test.cjs scripts/marketplace.test.cjs
node scripts/build-site.mjs
```

## Aislamiento y evidencia

Todas las solicitudes de las suites se simulan o rechazan, incluida la RPC automática de vencimiento que se ejecuta al cargar anuncios. No se realizaron publicaciones, contactos, emails ni cargas de fotos reales. Las capturas usan productos, personas e imágenes sintéticos, con servicios y tipografías externos bloqueados.

Fuera de las suites se hizo **una lectura mínima real** para comprobar que PostgREST admite la consulta: GET de `anuncios`, sólo el campo `tipo`, `oculto=not.is.true`, `tipo=in.(vende,vendo)`, orden `created_at.desc,id.desc`, límite 1 y offset 0. Respondió HTTP 200 con un tipo `vende`. No se solicitaron nombres, IDs, descripciones ni sesiones; no hubo escrituras. Se siguió la guía de Supabase manteniendo esquema, permisos y Auth existentes y contrastando la [documentación de filtros de PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html#horizontal-filtering).

Evidencia privada: `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\marketplace-20260905`. Capturas de viewport `marketplace-{320,390,1280}.png`, `marketplace-no-photo-{320,390,1280}.png` y `marketplace-filters-{320,390}.png`. Los archivos experimentales `*-full.png` se conservaron pero no se usan como evidencia: capturaban un drawer fijo fuera del viewport.

## Publicación y límites

La producción verificada en este turno es el deploy `6a9cd36de8ea461b8c4b7063`, fuente pública `a441167`, caché v11: contiene Inicio + perfil/chat, **no Marketplace**. Ver `release-inicio-perfil-chat-20260905.md`. No hubo segundo deploy, nueva preview ni push.

Marketplace prepara caché local `buscarte-v12-2026-09-05-marketplace`. Se mantienen el dominio, manifest, asset links, código Android, Auth, funciones y contratos de publicación. El mismo sitio puede alimentar la app basada en el dominio, pero no se probó la app instalada ni un dispositivo físico; no se afirma una validación nativa.

La lectura mínima confirma compatibilidad del filtro, no una auditoría de todos los registros ni de permisos. Las pruebas aisladas no certifican entrega real de contactos/publicaciones. Antes de publicar este bloque hay que acordar el corte, verificar paquete/contexto de Netlify y repetir los diagnósticos sobre el nuevo deploy. No ejecutar ahora la comparación contra producción usando `dist/` de Marketplace: son versiones distintas.

GitHub `main` sigue pendiente de incorporar Inicio + perfil/chat y este bloque; no hacer push automáticamente porque está conectado a Netlify. El siguiente bug funcional a abordar por separado es el guardado de estilo de danza; onboarding, disciplinas múltiples/principal, roles técnicos, engagement y renovación visual general continúan fuera de este bloque.
