# Feedback mobile — seguimiento al 6/9/2026

Este seguimiento separa implementación web, validación física y resultados de uso. No reabre automáticamente bloques postergados.

## Decisiones posteriores del usuario — auditoría de correo primero

- Antes de avanzar con bienvenida/engagement, consultar Resend para entender el estado real de envíos, entregas, errores y configuración; contrastarlo con código. Esta consulta es de sólo lectura: no autoriza envíos, campañas, deploys ni cambios de configuración.
- Roles técnicos: evaluar primero su inclusión como **especialidades/subrubros de rubros existentes**, no como un rubro nuevo. Revisar compatibilidad de campos/filtros antes de proponer cambios.
- **Identidad visual/editorial postergada** por ahora. No retomarla automáticamente después de los mails.
- **Validación física al cierre del trabajo acordado**: entregar al usuario un paso a paso único desde una cuenta nueva, con resultados esperados y puntos de control de registro/captcha, bienvenida, exploración, perfil/foto/guardado, anuncios, Marketplace y chat. El usuario hará esa pasada en el teléfono/app; esta decisión no autoriza crear cuentas ni contactar personas reales desde pruebas automáticas.

Estas decisiones prevalecen sobre el orden propuesto anteriormente. Multirrubro/principal sigue postergado.

**Auditoría Resend ya realizada**: se comprobaron envíos reales de bienvenida, recordatorios, resumen y mensajes; no se enviaron pruebas ni se alteró el servicio. Ver `auditoria-correos-20260906.md` para las mejoras propuestas y límites. La bienvenida nueva continúa sin publicar.

## Correcciones y mejoras web publicadas

- Captcha visible/recuperable y publicación de anuncios alcanzable en móvil: `release-20260905.md`.
- Inicio para cuentas conocidas, perfil propio sin Contactar y chat → perfil: `release-inicio-perfil-chat-20260905.md`.
- Entrada/catálogo de Marketplace y guardado/visualización de estilos de danza: `release-marketplace-danza-20260906.md`.
- Alta artística breve, detalles opcionales, cinco básicos y accesos a completar, estadísticas más abajo y jerarquía del Inicio: `release-onboarding-inicio-20260906.md`.
- Coherencia de textos/campos/acciones con diez rubros existentes y accesos generales en ambas Home: `release-coherencia-rubros-20260906.md`.

Pruebas web con datos sintéticos y verificación de archivos publicados no prueban toda la app instalada, teclado nativo ni la integración real de captcha/RPC/RLS/Storage/email. Eso sigue pendiente de dispositivo y cuenta/entorno expresamente autorizados. Tampoco hay medición que demuestre aún mayor completitud de perfiles o contratación.

## Bloque actual — bienvenida

Preparado después del deploy v16 en `2d0f65d`: sólo texto/diseño/enlaces de bienvenida en local, sin envío real ni otra publicación. Exploración general de rubros primero; foto/presentación y retorno mediante login después. Registro, Auth, destinatarios, cadencia, configuración, handler y los otros siete correos intactos. 105/105 pruebas; límites de clientes reales y entrega en `qa-bienvenida-20260906.md`.

## Feedback que queda, además de multirrubro

1. **Engagement completo**: avisos/emails por pendientes reales del perfil, foto, disciplinas, regreso y mensajes/contactos. El checklist web ya existe y hay correos de mensajes, pero los recordatorios actuales sólo consideran foto/bio. Antes de ampliar: revisar roles elegibles, bajas, frecuencia, deduplicación, seguridad y métricas; no activar campañas con la base registrada por defecto. Retirar o respaldar afirmaciones como «hasta 3 veces más visitas» en un bloque de revisión de esa plantilla.
2. **Roles técnicos dentro de rubros existentes**: evaluar FOH, monitores, iluminación, stage y stage manager como especialidades/subrubros, no crear un rubro nuevo por defecto. Experiencia, tipo/tamaño de venue y responsabilidades requieren diseño propio. A1/B1 sigue siendo una referencia a investigar, no una clasificación aprobada. Revisar impacto en campos/filtros antes de implementar.
3. **Identidad visual/editorial más humana — postergada**: el Inicio mejoró, pero no es un rediseño integral ni una renovación de Instagram. Material real, historias y casos de uso quedan para más adelante, con permisos disponibles.
4. **Validación en uso — guía al cierre**: entregar un recorrido único de usuario nuevo para que el usuario pruebe en teléfono/app. Después se podrá medir abandono, completitud y llegada a buscar/publicar/contactar. No declarar impacto a partir de tests sintéticos.

## Postergado por decisión explícita

**Disciplinas múltiples/multirrubro y principal entre rubros**, incluida edición posterior. Requiere diseño conjunto de identidad del perfil, búsqueda/filtros y disciplina de cada anuncio. No confundir varios estilos dentro de un rubro con múltiples rubros. No retomarlo sin nueva decisión.

## Pendientes técnicos separados del feedback

- Migración Auth y validación antispam del servidor: no activarlas como retoque visual o de email.
- Deudas preexistentes de correo: verificación del destinatario puede continuar ante error/configuración ausente; el caller de bienvenida es no bloqueante y no garantiza entrega/reintentos. Revisión específica antes de ampliar campañas.
- Sincronización de GitHub main con releases ya publicados: pendiente, evitando que un push dispare otro deploy. El original y el worktree Android conservan sus rutas/cambios.
