# Bloque 2 — correcciones mobile y retorno a Artistas, 15/10/2026

Preparado sólo en local, rama `codex/mobile-ux-retorno-20261015`, sobre `8d460ff`. Producción comprobada en el bloque anterior: fuente `98b07bf`, deploy `6aceb0967c1d2013614da922`, SW v26. Este bloque no incluye deploy, push ni solicitud a Google Play.

## Cambios

- **Chat:** rótulo y fila de respuestas rápidas separados. En celular aparecen botones de 44 px desde el primer estado y la fila admite desplazamiento horizontal; en escritorio puede envolver. Elegir una respuesta sigue completando el compositor, sin enviar el mensaje. Conserva textos, borrador, contador y botón Enviar.
- **Mi cuenta:** regla compartida para los ocho paneles mobile, con altura limitada al viewport dinámico, desplazamiento interno y espacio inferior. En horizontal deja al menos 56 px arriba para cerrar desde el fondo exterior; la última opción no queda tapada por la barra inferior. Mantiene roles y visibilidad del Generador.
- **Artistas → perfil → Atrás:** cada entrada de historial conserva texto, chips, ubicación, referente, orden, vista, cantidad cargada y posición de la persona. Reconstruye las tarjetas necesarias después de cargar datos y fuentes. Una búsqueda nueva no hereda el estado de otra entrada/pestaña.
- La flecha visible del perfil usa el historial cuando procede de una lista del mismo origen; enlaces directos o pestañas nuevas conservan una búsqueda contextual de respaldo. Compartir sigue generando una URL limpia con el ID del perfil.
- Se ignoran resultados asíncronos anteriores a una búsqueda más nueva y se bloquea el doble Cargar más. La restauración no desplaza al usuario después de que éste empieza a interactuar. Esperar fuentes no bloquea el botón de resultados. Guardar posición usa debounce, no escrituras de historial por cada frame.
- Caché preparada como `buscarte-v27-2026-10-15-mobile-retorno` para la futura publicación. Sin nuevo archivo público ni cambios de funciones, datos, Auth, dominios, paquete Android o firma.

El estado de retorno vive sólo en `history.state`, validado por versión, URL y rubro. No almacena perfiles completos, contraseñas, cookies ni sesiones; no usa almacenamiento global para heredar búsquedas.

## Verificación

- Reproducciones contra `8d460ff`: chat sin ningún botón inicialmente visible (primer botón x381,19 fuera de contenedor x16–374) y menú 844×390 con inicio en y−55,69. La reproducción de búsqueda con Atrás nativo pierde chips, vista y segunda página; se conserva como baseline separado.
- `scripts/mobile-controls.test.cjs`: 27/27; ocho páginas, 320×568, 390×844 y 844×390. Apertura, primera/última opción, cierre desde fondo y cuatro respuestas rápidas sin envío; conserva borrador en viewport compacto.
- `scripts/busqueda-retorno.test.cjs`: 13/13; retorno real con documentos nuevos, lista paginada, filtros, orden, vistas, recarga, conexión lenta, entradas independientes, ancla movida/eliminada, estado inválido, pestaña nueva, compartir y respuestas tardías. Incluye verificación de restauración nativa BFCache y cancelación de restauración frente a gestos/fuentes lentas; resultados detallados en evidencia privada.
- Corrida conjunta de `escena-release`, `sesion-segura-browser` y `mobile-controls`: exit 0. Layout A2: 123 escenarios, 19 páginas principales y ambas Home, diez rubros, visitantes/miembros; sin excepciones, tráfico inesperado ni deriva de fuentes. Conserva los contratos actuales de sesión y guardado.
- Complemento con Archivo/Archivo Black reales: 5/5, chat y cuatro pantallas a 844×390. Sin desbordes en Inicio, Ingresar, Registro y Editor.
- Build: 69 archivos públicos verificados. Empaquetado: 26/26. `git diff --check` aprobado. Scripts/informes/preview permanecen fuera de `dist/`.

Todos los datos y servicios de aplicación de estas pruebas se simulan o bloquean. Sólo el complemento de fuentes permite GET a los dos orígenes públicos de Google Fonts. No hubo cuentas, publicaciones, mensajes, visitas, archivos o emails reales de prueba.

## Evidencia privada

En `../BuscARTE-resguardos/`, nunca para Git o publicación:

- `mobile-controls-2026-10-15T12-10-24-878Z/`: dos fallos de baseline esperados.
- `mobile-controls-2026-10-15T12-17-05-816Z/`: 27 casos finales, hashes y capturas.
- `escena-release-2026-10-15T12-17-05-834Z/`: matriz A2 final, hashes sin deriva.
- `mobile-audit-20261015/extra-fixed/`: cinco casos con fuentes reales y capturas.
- `busqueda-retorno-2026-10-15T12-19-55-828Z/`: 13 casos finales, captura y evidencia de BFCache nativo (`pageshow.persisted=true`).

La corrida intermedia del menú tuvo seis fallos por exigir cerrar mediante una barra que dos páginas cubren deliberadamente. Se verificó el cierre real desde el fondo y se dejó espacio táctil suficiente; no se deshabilitaron assertions de visibilidad/scroll del menú. Los resultados finales indicados son los posteriores a ese ajuste.

## Antes de publicar y pasada física

Publicación requiere el OK del usuario y comprobar de nuevo el corte remoto. Publicar sólo `dist/` con el flujo existente y preservar funciones/horarios. Este cambio web no exige otro AAB por sí mismo.

Después, en la app Android instalada: reabrir conectada, probar Mi cuenta vertical/horizontal y desplazarse hasta Cerrar sesión; abrir un chat y tocar una respuesta sin enviarla; filtrar Artistas, cargar más, abrir un perfil y usar Atrás para comprobar la misma persona. Verificar además teclado real, barras del sistema y persistencia de sesión. La emulación no certifica esos componentes físicos.

Google Play Console queda para el bloque posterior: revisar rechazo real, requisitos/fecha habilitada, pista, versión, ficha y certificado de firma. No reenviar una solicitud ni contar automáticamente quince días desde este informe.

Guía ajena y preview previas preservadas y excluidas. Original y worktree Android sin cambios.
