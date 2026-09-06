# Roles técnicos — preparación local del 6/9/2026

**Actualización: publicados el 6/9 a las 18:13 ART**, deploy `6a9dd772a759ecdf9c3c56e5`, fuente `04b584d`, v18. El usuario autorizó explícitamente publicar antes de hacer la única pasada física. Ver `release-roles-20260906.md` y `guia-prueba-app-usuario-nuevo.md`. Las notas inferiores de rama local/publicación pendiente describen la preparación anterior, ya superada.

## Alcance autorizado

Especialidades dentro de **Música**, junto a los roles existentes Técnico de sonido, Productor y Manager. No se crea un rubro nuevo ni se distribuyen automáticamente perfiles entre rubros.

- Operador de sonido FOH.
- Operador de sonido de monitores.
- Operador de iluminación.
- Stage / Asistente de escenario.
- Stage Manager.

Se conservan todos los valores anteriores y el contrato existente: `perfiles.instrumento` y `anuncios.instrumentos`. Las cinco etiquetas coinciden en registro, editor, búsqueda y anuncios (Busco/Ofrezco y filtros). El perfil público ya presenta esos valores sin necesitar otro campo.

Los textos específicos de Música también contemplan experiencia y trabajo técnico. Los otros nueve rubros, categorías de venta/alquiler del Marketplace, login, guardado seguro, funciones, correos y Android no cambian. No hay escrituras de datos ni migración. Multirrubro/principal y niveles tipo A1/B1 siguen postergados.

## Publicación separada

Rama local `codex/roles-tecnicos-20260906`, basada en `f3cc54d`. **Este bloque no está publicado ni incluido en la sincronización de main con producción.** La producción v17 sigue siendo la fuente `b1d35dd`, deploy `6a9dcf37d0aeb9991f8eb446`.

Para publicar los roles hará falta un corte explícito: integrar esta rama, actualizar la versión del service worker, construir sólo `dist/` y hacer el deploy autorizado. No activar una migración Auth o cambios de datos como parte de ese corte. La prueba física de estos roles se hace después de publicarlos; la guía distingue ese anexo del recorrido disponible hoy.

## Verificación acotada

La prueba específica está en `scripts/roles-tecnicos.test.cjs`; se ejecuta con `node --test scripts/roles-tecnicos.test.cjs`. Resultado: **4/4**, incluidos catálogos sin duplicados, clasificación/filtro, serialización y render de Busco/Ofrezco, exclusión de otros rubros/Marketplace y parseo de JavaScript inline. Build local: **36 archivos públicos**; `git diff --check` sin errores. Se actualizó una expectativa literal de la suite histórica de coherencia, sin repetir esa matriz.

Datos sintéticos, sin servicios remotos. No hubo validación visual o física nueva, ni pruebas de guardado, publicaciones o contactos reales. El `dist/` local contiene este bloque y no debe confundirse con producción; no se actualizó el service worker para una publicación todavía no autorizada.
