# Perfil de Modelaje — corrección publicada

Publicado el **11/9/2026 a las 19:36:05 ART**, con aprobación explícita después de explicar beneficio, alcance y riesgo.

- Sitio: https://buscarte.com.ar.
- Deploy confirmado activo/ready/production: `6aa48252875c3a2023f75eaf`.
- Fuente: `646640f65a8cb45f88a71bbe88b88d637fbd4345`, rama `codex/perfil-modelaje-20260911`.
- SW: `buscarte-v19-2026-09-11-perfil-modelaje`.
- Anterior: `6a9dd772a759ecdf9c3c56e5`, v18.
- [Publicación y logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6aa48252875c3a2023f75eaf).

## Arreglo

Modelaje tenía un título «Tipo de trabajo» sobre valores del campo `genero`. La sección ahora usa `tipo_trabajo`, con todos sus valores y compatibilidad con aliases históricos. No se modifica `CAMPO_KEYS.gen`: stat de género y tags del encabezado siguen leyendo género. Campos vacíos no recuperan datos antiguos ni utilizan género como sustituto.

El portfolio vacío de Modelaje muestra «Sin material de portfolio cargado», tanto en inicialización como al recibir el perfil. No se cambia la carga de material ni se agrega galería/fotos. La actualización inicial sólo busca un bloque vacío que sea hijo único, sin alterar enlaces o el espacio disponible de un portfolio con contenido. Otros rubros conservan sus campos y mensajes.

## Verificación y límites

- `node --test scripts/perfil-modelaje.test.cjs`: **4/4** grupos, datos sintéticos, sin red. Tipo de trabajo vs género, varios valores, aliases, vacíos/ausencia/JSON inválido, estado vacío y comparación con Música/Danza; JavaScript inline válido.
- Build: **36 archivos públicos**; diff-check sin errores.
- GET público del perfil 200, scripts inline idénticos a la fuente corregida; SW publicado idéntico a v19.
- Las **cinco funciones mantienen hashes y runtimes**, y los dos horarios no cambiaron. No se editaron funciones, configuración, permisos, datos, filtros, cuentas, Android o migración Auth; no se enviaron correos ni se guardaron perfiles de prueba.
- No se ejecutó otra matriz visual ni prueba física. Los testers pueden comprobar específicamente esta sección al reabrir la app con conexión; no hace falta repetir todo el alta.

Guías de cambios web/Netlify aplicadas preservando arquitectura y alojamiento existentes. Un único deploy de producción de `dist/`, sin preview ni instalaciones. Resguardo previo de historial verificado. Sin rollback. El original y el worktree Android permanecen intactos.

La edición previa de `docs/guia-prueba-app-usuario-nuevo.md` no pertenece a este arreglo: se conserva local, fuera de los commits y del paquete público, con su hash comprobado antes/después. No declaramos árbol completamente limpio.

Cierre de código/documentación mediante push normal a main con `[skip netlify]` en el último commit, sin repetir deploy. Evidencia del SHA remoto y deploy posterior en el resguardo privado `../BuscARTE-resguardos/perfil-modelaje-20260911/github-after.json`; metadata, intento único y bundle en esa misma carpeta, que nunca se publica. Antes de una eventual reversión, verificar que sigue activo este corte para no sobrescribir trabajo posterior; el anterior v18 restablecería el error de presentación.
