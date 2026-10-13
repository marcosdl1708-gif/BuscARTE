# Cursor continuo y filtros — 13/10/2026

Publicado **19:28 ART** (22:28:51 UTC): fuente `98b07bf5dea663f8aee5f29f25483c63641ab22b`, deploy `6aceb0967c1d2013614da922`. Sitio único `43524f56-8833-41ab-8916-cb75de47dd1e`, dominio https://buscarte.com.ar/, caché v26. Publicación de los 69 archivos permitidos en `dist/` mediante Git CD. No se publicó la raíz, pruebas, documentos o preview.

## Causas y correcciones

- El controlador del cursor anterior desactivaba el círculo antes de cada RAF en `pointermove`, y también al hacer click, scroll o abrir un diálogo. La reproducción registró esa alternancia en las fases reales del evento. Se retiró el motor DOM/RAF: el navegador dibuja directamente el anillo y punto mediante SVG estático de 32×32 y hotspot 16×16. JS sólo actualiza el color del rubro. Sin overlays, listeners de mouse ni interceptar clicks. Los campos conservan caret y controles nativos; touch, movimiento reducido, colores forzados y umbral desktop de 901 px siguen el contrato existente. Fallback visible si falla JS o la hoja de cursor de forma independiente. Referencia de formato, dimensiones y fallback: [MDN cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor).
- En Anuncios, el grupo `#fp-rubro-global` está fuera de `.filter-panel` y no heredaba su padding superior. El texto empezaba exactamente sobre el separador: 0 px de distancia. Fix mínimo y específico: `padding-top:1rem`. Distancia final entre glifo y separador: **16 px**. No se modificaron HTML, colores, taxonomía o lógica de filtros.
- Service worker actualizado a `buscarte-v26-2026-10-13-cursor-filtros` para renovar los recursos de la app/web al volver a conectarse.

## Verificación

- Cursor: **105/105** en snapshot definitivo, sin deriva de los 69 públicos ni errores JS/red imprevista. Las 19 páginas como visitante/miembro, touch 320/390 y sin JS. Movimiento de 25 pasos, pointerdown/up/click, nombre dinámico, menú y scroll en Artistas/Anuncios/Mensajes: SVG presente en cada muestra. Diez colores, campos/chat/diálogos/botones deshabilitados y fallos de carga. SVG realmente decodificado por el navegador y validado como estático, sin recursos externos.
- Filtros: **125/125**. Artistas y Anuncios por diez rubros y anchos 320/390/768/1024/1440; cinco categorías del tablón por esos anchos, incluido Marketplace expandido. Sin recortes, overflow, errores o tráfico real. Baseline: cinco reproducciones de la distancia original 0 px. Capturas aisladas mobile/desktop inspeccionadas.
- Empaquetado: **26/26**, build de 69 archivos. Sólo tres assets compartidos y SW públicos cambiados; las dos pruebas quedan fuera de publicación.
- Producción: **68 recursos** servidos comparados con el build, **35 rutas** sin loops y **cuatro exclusiones privadas 404**. Commit publicado exacto, escaneo de secretos sin coincidencias.
- Las **siete funciones** conservan exactamente sus digests y runtime Node 24 respecto de `6acea7bc84635ed9a960b4a6`. Crons `0 13 * * 1` y `0 13 1 * *` idénticos. No se ejecutaron pruebas que creen registros, anuncios, conversaciones, correos o subidas; no hubo cambios de DB, Auth, multidisciplina, hCaptcha, configuración, plan, Android ni otros proyectos.
- Navegador real sobre el dominio: separación inicial 0 px, final 16 px a 390 y 1440 px, sin overflow mobile; SVG computado correcto en body y nombre, sin overlay ni punteros ocultos. Cuenta humana utilizada sólo para navegación/lectura, sin editar, publicar o cerrar sesión. Tamaño de viewport restaurado.

Límites: las capturas de navegador no registran el cursor del sistema operativo. La continuidad se prueba con estilos computados en cada fase y carga real del SVG, sin simularlo encima de una captura. La herramienta de captura del navegador real agotó su tiempo; no se presenta una imagen aislada como si fuera producción. No certifica todos los teléfonos físicos ni ausencia absoluta de otros bugs.

Evidencia privada (no publicar): `../BuscARTE-resguardos/cursor-native-circle-final2-20261013/` y `../BuscARTE-resguardos/cursor-filtros-final-20261013/` (reproducción, matrices, capturas aisladas y `static-live.json`).

Para recibir el corte, reabrir la app conectada o recargar PC con Ctrl+F5. Revisar el nombre/menú y navegación en Artistas, Anuncios y Mensajes; el cursor de escritura normal es intencional. Si persiste otro caso, registrar página, acción, navegador y dispositivo, no atribuirlo automáticamente a caché.

Guía ajena `docs/guia-prueba-app-usuario-nuevo.md` intacta/excluida (SHA256 `CB3FA88AECC1537AF9D936F9997934D3EB1FDB9A88779C4F5AADC9A4D688BB3F`). Preview también intacto/excluido. Cierre documental `[skip netlify]`, sin segundo deploy.
