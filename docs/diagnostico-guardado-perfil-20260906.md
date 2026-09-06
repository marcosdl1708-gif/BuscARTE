# Incidente de guardado de perfil — diagnóstico, sin reparación aplicada

## Estado

El usuario confirmó la recepción de las dos muestras de correo y reportó que no puede guardar géneros desde PC; informó otro reporte de un usuario horas antes. El deploy de los mails queda pausado. No dar el guardado por solucionado ni ampliar bloques hasta acordar la reparación.

## Evidencia del 6/9

- La captura final de Network muestra `[]` en Response de la solicitud de perfiles con la selección de confirmación del editor. El método/status no aparecen en esa captura; el nombre de la solicitud y la pestaña Payload son consistentes con el guardado. No se repitieron escrituras desde herramientas.
- El mensaje «No API key found in request» anterior provenía de abrir la URL de la API en otra pestaña, confirmado por el usuario; no era la respuesta del guardado. El aviso de meta móvil tampoco identifica esta falla.
- Consulta de catálogo de Supabase: `public.perfiles` tiene RLS habilitada, SELECT público permitido, un único permiso de fila UPDATE que compara `id::text` con el claim JWT `sub`, y ningún trigger no interno. El rol `anon` sí tiene el grant UPDATE; agregar ese grant no resolvería el problema.
- Consulta mínima: el perfil indicado en la captura existe. No se leyeron nombre, email, géneros ni otros valores del perfil. Evaluar la comparación con claims de rol `anon` sin `sub` da falso a efectos del permiso.
- Lectura del HTML público: el editor envía la clave pública de rol `anon`, sin `sub`, como Authorization del PATCH. Su sección de guardado coincide con la local. El HTML completo tiene reescrituras de enlaces de Netlify, por lo que no se afirma igualdad byte a byte.
- El login local publicado en esta línea de trabajo usa `login_usuario` y conserva ID/datos en localStorage, pero no instala un token personal para el PATCH. El camino Supabase Auth permanece restringido a runtime local, con modo shadow/red deshabilitada por defecto.

## Conclusión y límites

Existe una incompatibilidad concreta entre el guardado publicado y la política real: puede leerse el perfil, pero ese JWT sin identidad de usuario no satisface UPDATE. La lista vacía observada es consistente con cero filas autorizadas. Afecta al recorrido compartido de edición, no sólo a géneros o Música. No se ha fechado cuándo se introdujo la política ni se atribuye el incidente a un deploy concreto.

Las pruebas previas usaban backend simulado; verificaban confirmación de filas y errores pero no la política remota. Las reproducciones aisladas de Música confirman éxito con una fila válida y el banner reportado con cero filas/204/5xx. Otra prueba aislada comprobó headers presentes y que un 401 real generaría un mensaje diferente. Esta cobertura no sustituye una prueba de autorización integrada.

## Reparación pendiente de acuerdo

Resolver la identidad verificada por el servidor al editar y mantener ownership sobre el perfil existente; revisar compatibilidad con la migración pendiente antes de elegir la implementación. No basta con reenviar la clave pública ni aceptar `[]` como éxito. No habilitar UPDATE público, desactivar RLS, aceptar un ID local como prueba de identidad ni exponer una clave privilegiada. No activar toda la migración Auth como arreglo incidental.

Antes de publicar: comprobar en entorno aislado usuario propio permitido, usuario ajeno/no identificado rechazado, persistencia tras recarga, géneros/otros rubros/foto y compatibilidad web/app; después validación integrada con cuenta y alcance expresamente autorizados. Preparar reversión sin pérdida de cuentas/perfiles. La solución requiere acordar alcance de identidad/autorización, no sólo un retoque visual.

Sólo hubo SELECT de catálogo/existencia/evaluación, lecturas HTTP públicas y pruebas locales simuladas. Sin PATCH real desde herramientas, cambios de datos/permisos/Auth, deploy, push, envíos adicionales ni cambios en Android. Las guías de Supabase y PostgreSQL orientaron la separación entre grants, RLS y sesión, preservando mínimo privilegio. Referencia: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
