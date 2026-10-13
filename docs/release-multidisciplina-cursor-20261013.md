# Cursor y multidisciplina — cierre del 13/10/2026

Publicado: **18:51 ART**, fuente `3731821a0fce409b6946202d7d04d734f425d6cf`, deploy Netlify `6acea7bc84635ed9a960b4a6`. Sitio único `43524f56-8833-41ab-8916-cb75de47dd1e`; Supabase único `xiaanchoanxmampegoay`. Rama de trabajo `codex/revision-multidisciplina-20261013`. Publicación de `dist/` mediante Git CD, caché v25. No se publicó la raíz, preview, documentos, originales de imágenes, pruebas o credenciales.

## Qué cambió

- El cursor antiguo estaba oculto por A2, mientras botones y nombre conservaban `cursor:none`. Nuevo círculo independiente en escritorio; el puntero nativo sólo se oculta cuando su sustituto está realmente visible sobre ese elemento. Si faltan JS/CSS/RAF, desaparece el nodo, se abre un diálogo, cambia el foco o hay preferencias de accesibilidad, queda el puntero nativo. Sin interceptar clicks/taps. Mobile no necesita un cursor artificial.
- Artistas pueden agregar/quitar disciplinas y elegir una principal. Nombre, cuenta, ID, foto, bio, ubicación, redes, portfolio, chats y guardados son compartidos. Los datos profesionales, disponibilidad y experiencia son propios de cada disciplina. Negocios y visitantes conservan sus roles.
- `perfiles.rubro` sigue siendo la principal y sus columnas históricas reflejan únicamente ese detalle. `disciplinas` es JSONB opcional versionado; no hay backfill masivo. Las nueve filas históricas con JSON serializado válido se interpretan al editar, sin descartar opciones desconocidas.
- Búsqueda por pertenencia real en servidor y proyección contextual: un músico/bailarín aparece en ambas búsquedas, sin mezclar géneros musicales con danza. Principal visible en el banner; bloques independientes en perfil público. Un ID y un guardado por persona. Música secundaria habilita el generador de nombres.
- Anuncios Ofrezco/Clases/Evento permiten elegir una disciplina propia. Busco sigue el rubro buscado y Marketplace continúa transversal. Los tipos ofrecidos contemplan las disciplinas secundarias. Un cambio de principal no mueve/recolorea anuncios históricos. Precio cero se conserva; precio negativo muestra un error claro.
- Guardado atómico con `perfil_revision` y CAS. Editor actual envía la revisión leída; 409 conserva el borrador ante otro guardado. Respuesta vacía/204 no se presenta como éxito. Actualización de foto renueva la revisión local. Compatibilidad con editores anteriores fusiona datos de la principal sin borrar secundarias, pero no convierte la caché local en autoridad.
- Scroll sin editar ya no marca cambios; favoritos verifican resultado y bloquean doble envío; principal virtual se renueva tras guardar. Dos textos de Tatuaje recuperan contraste, conservando violeta/bordes/pintura.

## Supabase y Auth

Migraciones aplicadas mediante herramienta de migraciones, revisadas por separado:

- Remota `20261013213500` / local `20261013212006_profile_multidiscipline.sql`: columnas aditivas, validación de formato/roles/principal/reflejo, revisión segura, índices de pertenencia y grants SELECT de campos profesionales. Primer intento falló por sintaxis CASE y revirtió todo; se corrigió antes de aplicar y no se desplegó frontend con un esquema incompleto.
- Remota `20261013213526` / local `20261013212007_legacy_fk_indexes.sql`: ocho índices FK faltantes, sin borrar índices ni datos.

Fixture de constraints ejecutada con rol service_role sobre tabla TEMP dentro de BEGIN/ROLLBACK, sin usuarios, secuencias ni persistencia. Diez principales válidas, legado, CAS, principales ajenas, espejo contradictorio, cambio de rol, duplicados, versión desconocida, tipos inválidos y revisión negativa/insegura cubiertos. Sintaxis de contención/proyección y filtro de instrumento también comprobadas con PostgREST real.

**No se convirtió ninguna cuenta a Supabase Auth. No hace falta para el acceso actual.** La solución activa son las sesiones opacas del servidor (cookie Secure/HttpOnly/SameSite, máximo 30 días) vinculadas a la cuenta existente. El login sigue usando email/contraseña al ingresar, no en cada guardado. Baneo, cambio de contraseña, cierre o eliminación invalidan sesiones según el contrato vigente. No activar el Auth shadow ni ejecutar migraciones históricas del repositorio original/Android.

Revisión de permisos: accesos privados legacy siguen cerrados. Asesores: ocho advertencias FK resueltas; tablas privadas con RLS sin políticas son el cierre intencional deny-by-default. Se conservan una advertencia preexistente por `unaccent` en public y un índice email redundante: no mover/eliminar a ciegas como parte del release. Referencias: [extensión](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [índice duplicado](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

## Evidencia y límites

- Servidor: 75/75; sesión+MD frontend: 60/60; publicación de anuncios con gateway/handlers reales y backend sintético aislado: 43/43; captcha/browser: 17/17; auditoría puntual de anuncios: 12/12.
- Cursor: 107/107 sobre su snapshot, más 6/6 sobre el editor definitivo; el único archivo público cambiado entre ambos fue ese editor. A2 final: 123/123, snapshot sin deriva, 19 páginas, diez rubros, mobile 320/390 y desktop 1440, guest/miembro y controles. Build/layout reportado: 58/58. Fixtures antiguas actualizadas al protocolo de sesión/gateway, sin reducir assertions ni hacer tráfico real.
- Tests reutilizan sólo `scripts/fixtures/legacy-runtime.js`, datos auditados 100% sintéticos. No dependen de publicar o versionar el resto de preview. Nuevos comandos `test:multidisciplina`, `test:cursor`, `test:escena`.
- Verificación del dominio: 68 archivos servidos comparados con el build, 35 rutas y cuatro exclusiones privadas 404. Siete funciones Node 24, crons `0 13 * * 1` y `0 13 1 * *`, cero coincidencias de secretos en escaneo. No se cambió hCaptcha secreto, proveedores, plan ni cadencia de mails.
- Prueba real autorizada: una cuenta temporal y cinco anuncios marcados QA, uno de cada tipo. Todos dieron 201 con ID y persistencia y se pausaron inmediatamente. Guardado Música+Danza con principal Danza, sesión renovada, búsqueda secundaria/filtro real, no coincidencia en disciplina ajena, 409 por revisión vieja, 400 por principal inválida, quitar/reagregar con revisiones 1→2→3. El anuncio anterior conservó su rubro. Esta parte se verificó por API real; la UI de publicar se verificó con navegador aislado. No equivale a probar un teléfono físico.
- Perfil público multidisciplina inspeccionado además en el navegador sobre el dominio publicado a 390 px. Sin login/edición/contacto en la cuenta humana del usuario. Vista temporal restaurada a Inicio y tamaño normal después.
- Limpieza real por el flujo autenticado de eliminar cuenta con su contraseña sintética: cuenta, cinco anuncios y sesiones eliminados definitivamente. Consulta de cierre confirma cero perfiles/anuncios/sesiones/chats/mensajes/archivos QA. Ninguna subida de Storage, mensaje, contacto o correo de prueba.
- Antes/después: 332 perfiles, 104 anuncios, 300 conversaciones, 414 mensajes; hashes agregados de campos artísticos de perfiles y campos históricos de anuncios idénticos. Las cuentas reales permanecen sin conversión MD automática.

Evidencia privada (no Git/public): `../BuscARTE-resguardos/a2-md-final2-20261013/`, `cursor-final-20261013/`, `cursor-final-editor2-20261013/`, `disciplinas-frontend-2026-10-13T21-45-38-293Z/` y `seguridad-a2-release-20261013/` (QA SQL/API, comparación estática y captura mobile). No hay contraseñas/tokens QA guardados en el repo.

## Pasada física incremental para testers

Sin reemplazar ni modificar la guía previa:

1. Reabrir la app conectada a Internet. En PC recargar con Ctrl+F5 si se ve el release anterior.
2. Cuenta nueva: registro con captcha humano visible, entrar y ver Inicio de miembro; luego cerrar sesión y volver a ingresar con el mismo email/contraseña. No es necesario crear otra cuenta ni migrarla.
3. Configurar perfil: elegir la disciplina inicial, foto/bio opcionales; guardar, reabrir y confirmar persistencia. Desplazarse sin editar no debería activar cambios sin guardar.
4. Agregar una segunda disciplina, completar un dato propio, elegir principal y guardar. Volver a ambas: datos separados y la misma foto, bio y cuenta. Quitar una secundaria sólo con confirmación; para quitar la principal elegir otra primero.
5. Buscar el perfil por ambas disciplinas. Ver principal en banner y bloques propios; guardar una sola vez. Generador sólo con Música entre las disciplinas.
6. Publicar un anuncio real permitido desde la secundaria (o uno claramente marcado de prueba que el tester luego retire). Con teclado abierto, llegar al botón de publicar, una sola confirmación y comprobarlo en Mis anuncios. Elegir otra principal no debe mover esa publicación. Marketplace mantiene venta/alquiler, no perfiles.
7. Abrir un evento ajeno, confirmar asistencia sin mensaje obligatorio; chat→perfil; Instagram del perfil con destino correcto. No usar cuentas QA ya retiradas.
8. En desktop recorrer Artistas→menú de nombre→Anuncios→Mensajes: círculo sobre controles, caret normal en campos y puntero visible en diálogos. No se espera círculo en touch ni con movimiento reducido.

No se certifica hardware Android, teclado real, instalación/actualización nativa, CAPTCHA humano ni contenido de enlaces externos con emulación de viewport. No hubo rebuild de APK ni cambios de signing/assetlinks/original/Android. No hay garantía de ausencia absoluta de bugs: reportar pantalla, acción, dispositivo y si persiste tras reabrir.

Guía ajena `docs/guia-prueba-app-usuario-nuevo.md` conservada y excluida (SHA256 `CB3FA88AECC1537AF9D936F9997934D3EB1FDB9A88779C4F5AADC9A4D688BB3F`). Cierre de documentación con `[skip netlify]`, sin otro deploy.
