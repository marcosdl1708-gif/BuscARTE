# Operación de conservación — Gmail activo y respaldos manuales

## Gmail: activo, sólo casos elegidos por el operador

El 15/10/2026 `setupRetention()` confirmó a las 13:03:47 ART la cuenta exacta
`buscarte.webmail@gmail.com`, las cuatro etiquetas y la instalación. La pasada
de las 13:04:35 ART examinó cero casos, con cero errores, retiros o recuperaciones
y sin alertas de límites. Activadores mostró **una sola fila `dailyRetention`
basada en tiempo**. La configuración es `ACTIVE`; no se limpió correo histórico.

- **Pendiente**: aplicarla sólo a una consulta administrativa común que elegís
  incorporar, mientras la gestionás.
- **Cerrar**: una vez resuelta, retirar Pendiente y aplicar Cerrar. El ciclo
  registra el cierre observado y mantiene Cerrado; no aplicar Cerrado sola.
- **Conservar**: aplicarla a todo caso necesario o con motivo legal/seguridad;
  documentar el motivo y revisarlo. Reabrir con Pendiente cancela el cierre.

Son las etiquetas `BuscARTE/Admin/Pendiente`, `BuscARTE/Admin/Cerrar` y
`BuscARTE/Admin/Conservar`. No añadir filtros masivos, no clasificar históricos
por antigüedad y no duplicar el activador. El mecanismo prevé Papelera tras
**60 días completos desde el cierre observado**, y Gmail normalmente elimina
después de **otros 30 días en Papelera**; no hay borrado permanente por el script
ni garantía de purga exacta. Revisar las ejecuciones y cualquier alerta.

No vaciar Papelera ni borrar Properties si hay recuperaciones pendientes.
La pasada inicial con cero casos demuestra instalación/ejecución sin errores,
no un retiro real ni cobertura de todo el buzón. Ver
[Gmail: operación y recuperación](gmail-retention/README.md).

## Respaldos: registro y revisión manual, sin borrados

El 15/10/2026 se inicializó un registro privado vacío y una revisión histórica
manual por metadatos. La herramienta local de respaldos sigue en `audit_only`
(este modo no describe el Gmail activo), **cero copias elegibles
registradas**. No hay una copia íntegra productiva/restaurable acreditada ni
rotación efectiva de 30 días. No se movieron, copiaron ni borraron históricos.

## Qué se puede usar ahora, sin credenciales

Desde `BuscARTE-web`, ejecutar esta auditoría local y sin red:

```powershell
& 'C:\Users\Usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools/retention/audit-backups.mjs --manifest 'C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\managed-user-backups\registry.json'
```

Leer juntos estos campos; un `valid: true` aislado **no demuestra cobertura**:

| Resultado | Interpretación |
| --- | --- |
| `registryInitialized: false` o `registered: 0` | No se está verificando ningún respaldo registrado. Cero candidatos no significa que los históricos cumplan el plazo. |
| `valid: false` | Detener la revisión de vencimientos y resolver el error; ningún candidato es utilizable. |
| `protectedUnknown` / `protectedLinks` mayor que cero | Hay material fuera del registro o enlaces protegidos; no borrarlo ni incorporarlo automáticamente. |
| `dueForReview` mayor que cero | Revisar esas copias individualmente en sesión privada; no es una orden de eliminación. |
| `rotationActive: false`, `actionsPerformed: 0` | La herramienta no genera, rota, traslada ni borra copias. |

No redirigir salidas con `--private-details` a Git, tickets o documentación
pública. Los informes privados, si se conservan, pertenecen a
`BuscARTE-resguardos`, nunca a `dist/`.

La revisión histórica está en
`BuscARTE-resguardos/retention-manual-20261015/historical-review.json`.
Registra únicamente metadatos y alcance de algunos casos conocidos, sin inventar
capturas ni inspeccionar registros personales. Su revisión manual está prevista
para el **22/10/2026**, a cargo del responsable del proyecto; no hay recordatorio
automático ni una tarea que ejecute eliminaciones al llegar esa fecha.

## Decisión segura sobre el material ya encontrado

- Mantener intacto el snapshot histórico `20260905-205819`: contiene material
  Android de recuperación y un bundle Git. No es un dump de la base remota.
- Mantener también los archivos originales y el worktree Android. No mover
  claves para inicializar el nuevo registro.
- Las evidencias puntuales con datos reales requieren clasificación individual:
  no se convierten en un backup íntegro por registrarlas ni justifican borrar
  toda su carpeta por antigüedad.
- No ejecutar los antiguos scripts de backup/restore para simular que esta
  auditoría obtuvo una copia productiva. No extraer nuevos datos ni pedir
  credenciales para completar este control de lectura.

## Único paso previo a una futura activación

El responsable debe acreditar una copia coherente y recuperable, identificar
cada archivo de datos que corresponda administrar y su captura real, y registrar
en privado hashes, tamaño y protecciones. Una copia única necesaria, una
investigación o una clasificación pendiente se documentan con revisión concreta;
no se elimina para cumplir formalmente una fecha ni se cambia su captura.

Antes de volver a servicio una restauración deben reaplicarse las eliminaciones
posteriores a la copia y comprobar sus archivos asociados. Eso aún no está
automatizado por esta herramienta.

Hasta disponer de esas pruebas, el cierre correcto es: **control de lectura
disponible y material crítico protegido; retención de respaldos pendiente de
operación efectiva**. No declarar en la política que todos los respaldos se
eliminan automáticamente a los 30 días. La decisión de plazo y una auditoría
vacía no sustituyen su implementación.

Para el esquema del registro y las validaciones, ver [README.md](README.md).
