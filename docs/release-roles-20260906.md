# Release — roles técnicos en Música

Publicado el **6/9/2026 a las 18:13:32 ART**, por autorización explícita del usuario: primero deploy y después una sola guía completa.

- Producción: https://buscarte.com.ar.
- Deploy activo confirmado: `6a9dd772a759ecdf9c3c56e5`, ready/production.
- Fuente: `04b584da87f09aa8f6b4f3a0edc7f9c9e673e905`, rama `codex/release-roles-20260906`.
- Caché: `buscarte-v18-2026-09-06-roles-tecnicos`.
- Anterior: `6a9dcf37d0aeb9991f8eb446` / v17.
- [Deploy y logs](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9dd772a759ecdf9c3c56e5).

## Alcance

FOH, monitores, iluminación, Stage / Asistente de escenario y Stage Manager como especialidades de Música, en registro, perfil, búsqueda y anuncios Busco/Ofrezco/filtros. Conserva valores existentes y sus campos; no crea rubros, multirrubro ni categorías de productos. Se actualizó SW a v18. No modifica funciones fuente, configuración, cron, cuentas, datos, Auth, manifest o Android. La contraseña de guardado continúa vigente y los mails anteriores se conservan.

Se siguieron las guías de Netlify para confirmar autenticación/sitio y publicar sólo el paquete delimitado, reutilizando el CLI 27.5.0 instalado. **Un único deploy de producción** con `--prod --no-build --dir dist --functions netlify/functions`; sin preview, instalaciones o cambios remotos de variables/planes. Resguardo Git previo creado y verificado.

## Verificación mínima y diferencia de empaquetado

- 4/4 pruebas específicas, sin backend: catálogos únicos, clasificación/filtros, serialización/render de anuncios, exclusión de otros rubros/Marketplace y parseo de scripts.
- Build: 36 archivos públicos; diff-check sin errores.
- Producción: registro, perfil, búsqueda y anuncios responden 200; cinco roles presentes y scripts inline idénticos a las fuentes revisadas. SW publicado idéntico a v18.
- Los cinco runtimes siguen en nodejs24.x y ambos horarios son idénticos. Hashes de guardar-perfil, recordatorio-perfil, reset-password y resumen-mensual idénticos al deploy anterior.
- `send-email` cambió de hash binario (`c60940f…` → `d5648a4…`) sin cambios en su fuente Git. Se detuvo el cierre para revisarlo: el ZIP actual se reprodujo exactamente con la telemetría y empaquetador instalados, y su código coincide con `b1d35dd` normalizando finales de línea CRLF/LF. El ZIP anterior no estaba disponible y no se logró reproducir su hash; por eso **no se afirma identidad binaria ni que se haya demostrado toda la causa de la diferencia**. El código de negocio, las plantillas, destinatarios y horarios no se editaron. No se envió correo de prueba ni se repitió deploy.

La validación no incluyó una matriz visual nueva ni dispositivo físico, cuentas, PATCH, Storage, anuncios, chat o correo reales. La guía `guia-prueba-app-usuario-nuevo.md` cubre esa pasada a cargo del usuario, con roles integrados y sin pedir dos recorridos. No hay un APK nuevo en este corte: se publicó la web y se debe comprobar que la app instalada recibe v18.

## GitHub y continuidad

El cierre documental se sincroniza a main mediante push normal con `[skip netlify]` en el último commit para evitar un segundo deploy. La verificación del SHA remoto y deploy activo posterior al push queda en el resguardo privado, sin otro commit sólo para anotar su propio hash.

Evidencia y scripts privados: `../BuscARTE-resguardos/release-roles-20260906` (metadata antes/después, intento único, respuesta CLI, prueba de empaquetado y bundle). No publicar esa carpeta. Si hubiera una regresión atribuible a este corte, comprobar primero que sigue activo este deploy antes de restaurar el anterior v17; no revertir una publicación posterior ni tocar datos. No se ejecutó rollback.
