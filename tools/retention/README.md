# Conservación de respaldos propios — preparación local

Estado comprobado el 15/10/2026: **registro privado vacío y revisión manual,
`audit_only`, sin rotación ni borrado**. La
decisión operativa es conservar las copias propias que contienen datos de
usuarios durante 30 días desde su captura, salvo una excepción concreta y
documentada. Esta herramienta informa vencimientos; **no aplica todavía ese
máximo y no acredita cumplimiento**.

## Alcance y límites actuales

- La raíz reservada es
  `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\managed-user-backups`.
  Se inicializó únicamente `registry.json` vacío, sin copiar respaldos.
- El registro real está inicializado con **cero copias elegibles registradas**;
  `registry.example.json` también está vacío. Esto no acredita cobertura de
  datos, respaldo íntegro ni cumplimiento. Una ejecución sin `--manifest`
  sigue siendo una comprobación sin registro explícito y lo declara como tal.
- La revisión privada `../retention-manual-20261015/historical-review.json`
  (relativa al directorio administrado) identifica sólo algunos históricos por
  metadatos, con clasificación pendiente y revisión manual prevista para el
  22/10/2026. Esa fecha no instala una tarea ni dispara un borrado.
- Sólo se verifican los archivos registrados individualmente como
  `user_data_backup`. Los desconocidos se protegen: nunca se incorporan
  automáticamente por extensión, edad o nombre de carpeta.
- No hay eliminación, traslado, generación de backups, acceso a red ni tarea
  programada. El resultado `review_due` significa «revisar», no «borrar».
- No se acreditó una copia íntegra y restaurable de la base de datos productiva.
  No se encontraron los dumps `data.sql`, `roles.sql` y `schema.sql` en el
  resguardo inventariado; eso no prueba que no existan copias en otros destinos.
- No hay generación programada ni enforcement del máximo de 30 días. Los
  periodos o mecanismos de proveedores no se modifican con esta herramienta.

## Por qué no expira todo `BuscARTE-resguardos`

El resguardo histórico es mixto: contiene fuentes, bundles Git, evidencia de
pruebas, configuración y material de recuperación Android, además de algunas
evidencias con datos personales. El snapshot `20260905-205819`, por ejemplo,
incluye las keystores de firma y un bundle del historial; **no es un backup de la
base remota**. Borrar esa carpeta por superar los 30 días podría impedir la
recuperación o actualización de la aplicación.

No se borran ni mueven esos materiales como parte de esta preparación. Tampoco
se presume que todos los bundles, documentos o capturas estén libres de datos
personales. Las copias históricas sin clasificar permanecen protegidas y
pendientes de revisión individual, no excluidas indefinidamente de toda
obligación de conservación o eliminación.

## Registro privado e individual

Antes de incorporar copias, un operador debe identificar cuáles contienen datos
reales y cuáles son fuentes, claves, configuración o pruebas sintéticas. No
copiar el snapshot completo al directorio administrado ni mover las keystores.
Si una carpeta es mixta, revisar los archivos individualmente y preservar el
material necesario para recuperación.

El registro JSON real debe permanecer **dentro de la raíz privada administrada**,
fuera de Git, `dist/`, publicaciones y servicios de terceros. Puede usarse el
esquema vacío de `registry.example.json`, sin añadir datos reales a ese ejemplo.
Debe contener `schemaVersion: 1` y una lista `backups` con estas propiedades por
archivo:

| Propiedad | Qué debe acreditar el operador |
| --- | --- |
| `id` | Identificador genérico único; no usar nombres, correos ni otros datos personales. |
| `relativePath` | Ruta relativa con `/`, de un archivo dentro de la raíz dedicada. Sin rutas absolutas, `..`, enlaces o directorios completos. |
| `classification` | Exactamente `user_data_backup`; nunca clasificar claves o fuentes como datos de usuarios para hacerlas expirar. |
| `capturedAt` | Fecha real de captura, ISO UTC canónica con milisegundos, por ejemplo `2026-10-15T15:00:00.000Z`. No usar la fecha de copia local ni `LastWriteTime`. |
| `bytes`, `sha256` | Tamaño entero y SHA256 de 64 caracteres hexadecimales minúsculos, calculados sobre la copia concreta. |
| `hold` | `null`, o una excepción documentada con `reasonCode` y `reviewBy` ISO UTC. |
| `needForRecovery` | Booleano explícito; `true` protege una copia necesaria para recuperación. |
| `requiresRestoreProof` | Booleano explícito; usar `true` cuando no corresponde descartar la copia sin acreditar recuperación. |
| `restoreProof` | `null`, o `verifiedAt` ISO UTC y `backupSha256` que coincida con esa copia. Sólo registrar una prueba realmente realizada. |

Los 30 días se calculan como 30 periodos de 24 horas desde `capturedAt`, en UTC.
Una copia vencida continúa protegida si tiene un hold, es necesaria para
recuperación o le falta la prueba de restauración exigida. No se modifica la
fecha de captura para evitar un vencimiento.

Los códigos de hold admitidos son `legal`, `security`, `recovery` y
`classification_pending`. El expediente privado debe documentar el motivo
concreto, alcance mínimo, responsable y próxima revisión. El JSON sólo guarda
el código y `reviewBy`, no el contenido sensible del expediente. Un hold cuya
revisión venció **bloquea el informe completo**: nunca habilita el borrado.

## Ejecutar la auditoría

Desde la raíz de `BuscARTE-web`, con Node disponible:

```powershell
node tools/retention/audit-backups.mjs
```

Ese comando inicial no selecciona el registro privado ni activa nada. Para leer
explícitamente el registro privado vacío ya inicializado:

```powershell
node tools/retention/audit-backups.mjs --manifest 'C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\managed-user-backups\registry.json'
```

Por defecto la salida sólo contiene agregados y códigos de error, sin rutas,
identificadores ni contenido de las copias. `--private-details` añade las rutas
relativas registradas, su vencimiento y protecciones: utilizarlo sólo en una
sesión local privada, sin pegar la salida en issues, repositorios o informes
públicos. Nunca incluir cuerpos de registros, contraseñas o claves en el JSON.

La herramienta verifica tamaño y SHA256, archivo regular sin hardlinks, cadena
de ancestros y rutas finales sin symlinks/junctions. Rechaza traversal, rutas
absolutas/UNC/ADS, claves, configuración sensible, duplicados, solapes, fechas
futuras y cambios de raíz o modo. Un error invalida todos los candidatos. Los
archivos desconocidos no se leen para extraer su contenido ni se promueven a
candidatos.

## Restauraciones y solicitudes de eliminación

Una restauración no debe resucitar datos cuya eliminación ya se cumplió.
Antes de devolver una copia a servicio, el operador debe cotejar un registro
privado mínimo de eliminaciones, reaplicar las bajas posteriores a la captura y
comprobar también archivos asociados. Este procedimiento requiere evidencia
real; la herramienta de auditoría **no lo implementa ni lo certifica**.

El plazo de 30 días no permite demorar una solicitud de eliminación exigible.
Una excepción por deber legal o investigación pendiente debe ser específica,
limitada a lo necesario, con acceso restringido y revisada periódicamente; no
una retención genérica indefinida.

## Transición pendiente para una rotación efectiva

1. Clasificar las copias históricas y separar documentalmente datos de usuarios
   del material de recuperación, sin purgar carpetas mixtas.
2. Acreditar una copia productiva coherente, protegida y restaurable y documentar
   el procedimiento para reaplicar eliminaciones.
3. Incorporar al registro privado sólo copias elegibles, con fechas de captura y hashes comprobados;
   resolver copias únicas, holds y pruebas de recuperación pendientes.
4. Definir y verificar la generación de nuevas copias, sus controles de acceso,
   cifrado y revisiones periódicas, sin agregar costes o integraciones implícitos.
5. Revisar los informes en seco y diseñar por separado un mecanismo acotado de
   expiración. Cualquier cuarentena debe contar dentro del periodo total, no
   ampliar silenciosamente la conservación.
6. Aprobar e implementar esa activación como un bloque distinto, con pruebas y
   evidencia. Sólo entonces se podrá afirmar que existe rotación efectiva.

## Pruebas locales

```powershell
node --test tools/retention/audit-backups.test.mjs
```

Las pruebas usan directorios temporales recién creados y contenido sintético;
no abren, modifican ni borran respaldos productivos. La limpieza del harness se
restringe a su propio `mkdtemp` y no forma parte de la herramienta operativa.
