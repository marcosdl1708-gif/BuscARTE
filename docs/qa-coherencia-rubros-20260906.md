# QA local — coherencia entre los diez rubros existentes

6/9/2026. Rama `codex/coherencia-rubros-20260906`, desde `f070ba34b5a3db5f9b8a1f98c625c9249dbb5c31`. Implementación: `4668dd56aed7007d2082af7bab2a1d948727a2d7`; ajuste tipográfico final: `e4783b7756f92ed32f44b6577d32dff6f0c3669e`.

**Sólo local; sin deploy, preview ni push.** Se revisó registro → editor de perfil → ambas Home antes del bloque de bienvenida, a partir de la inquietud del usuario por mensajes exclusivos de músicos. Caché local preparada en v16. Última publicación verificada en el release anterior: `6a9da7082372f367b398b7c3`, fuente `5b26d0a`, v15. No se volvió a consultar Netlify ni se consumieron créditos de publicación.

## Qué cambia

- Registro: instrucciones compartidas neutrales, sin sugerir una disciplina principal entre varios rubros. La pantalla de éxito contempla también fotografía, arte corporal, vestuario/FX, artes escénicas y escritura, sin reducir esos rubros a una única profesión.
- Perfil: la biografía deja de proponer un ejemplo de guitarrista a todos y redes deja de hablar sólo de otros músicos. La acción pendiente nombra el campo existente: instrumento/voz, rol, tipo de trabajo, estilos de danza o especialidad. Se conservan el cálculo sobre datos guardados y sus destinos.
- Selector de rubro: nombres completos alineados con registro; se retira la promesa falsa de perfiles independientes y la fecha pasada. Se aclara que guardar cambia el rubro del perfil actual, no crea otro. En teléfonos usa una columna y botones sin recortes; no cambia su funcionamiento ni habilita multirrubro.
- Inicio: metadatos para una comunidad de artistas y etiquetas consistentes. La Home histórica agrega diez accesos compactos con los mismos parámetros y destinos del Inicio principal. Su buscador musical se conserva completo y se identifica como específico/opcional.

Los diez rubros son música, actuación, audiovisual, modelaje, diseño, tatuaje, danza, maquillaje, circo y escritura. Sus nombres técnicos y opciones persistidas no se renombran.

## Contratos y límites de implementación

Sólo seis recursos públicos difieren de la base: ambas Home, registro, perfil, CSS compartido de Inicio y versión del service worker. No se editaron búsqueda, anuncios, Marketplace, chat, perfil público, API/Auth, funciones, correos, dependencias, configuración Netlify, allowlist, manifest ni assetlinks. El único cambio de package.json agrega el comando de pruebas.

Se preservan IDs, handlers, campos, defaults, scripts de Home y todos los enlaces anteriores. La excepción al contrato histórico admite exactamente los diez accesos deliberados nuevos en legacy. `index.html#explorar` sigue siendo rubros y `buscARTE_index.html#explorar` sigue siendo ejemplos. No se fusionaron páginas ni se activaron filtros nuevos.

La revisión independiente no encontró cambios nuevos de RPC, PATCH, claves JSON o guardas de sesión. La guía de Supabase orientó el aislamiento de los formularios: datos y respuestas de prueba en memoria, sin consultas ni mutaciones contra el proyecto real. No se crearon cuentas ni se subieron fotos, publicaron anuncios, enviaron mensajes o correos reales. Sólo las verificaciones tipográficas adicionales leen archivos públicos de Google Fonts; toda su red de aplicación permanece simulada/bloqueada.

## Pruebas

Regresión general **412/412**, 405,3 segundos, en una corrida sobre `4668dd5` (`regression-definitive.log`), sin fallas, cancelaciones ni omitidas. Incluye los 334 casos anteriores y 78 adicionales: 38 de onboarding y 40 de coherencia. Después se ajustó únicamente el tamaño/wrap del título del editor mobile (`e4783b7`) y se repitieron **99/99 casos de perfil/coherencia/guardado**, 53,8 s, más **14/14 smokes del paquete local definitivo**, 18,7 s. No se declara otra corrida completa de 412 sobre ese último renglón de CSS; las demás fuentes funcionales permanecen idénticas.

Pruebas focales aprobadas:

- Onboarding **82/82**: alta breve de los diez rubros a 320/390/1280 px, detalles opcionales propios a 320 y todos los casos anteriores de captcha, roles, errores, datos opcionales y sesión. Se mantienen claves de RPC y se comprueba que los otros nueve rubros no envían instrumentos musicales.
- Coherencia **40/40**, sobre el CSS definitivo: veinte casos de editor (diez rubros × 320/1280) y veinte de Home (dos URLs × diez rubros en caché; cada uno recorre visitante/cuenta conocida/recuperación). Comprueba datos, secciones, checklist, foco, modal, enlaces por teclado, geometría y cero escrituras al navegar.
- Inicio visual **48/48** con la excepción de enlaces acotada. Perfil progresivo **28/28** sin modificar su suite.
- Paquete local **14/14 smoke tests**, 16,8 s, servido exclusivamente por loopback desde la allowlist de dist. Backend, captcha y correo simulados. No es una prueba de producción ni de integración real.
- Fuentes reales: Home **18/18 escenarios**, 39 capturas, en 320/390/1280 y tres estados de sesión; registro **6/6**, éxito/detalles de audiovisual, maquillaje y escritura a 320. Perfil definitivo **12/12**: los diez rubros a 320 y modal común a 320/1280, 18 capturas. Se comprueba innerWidth exacto, ancho de documento, rangos del título, bordes de overlay/modal y acceso por scroll a la última opción y nota. En todos los perfiles de 320, documento y viewport quedan en 320; el modal termina en x304. Cada corrida tipográfica permite sólo tres/cuatro GET públicos de fuentes. Revisión visual directa de nombres largos y controles.

Build: **36 archivos públicos verificados**, sin ampliar la allowlist. `git diff --check` correcto. Node 24.19.0, Playwright 1.62.1, Edge headless.

### Hallazgos durante la validación

Se reprodujeron dos problemas históricos en `f070ba3`: ejemplo de guitarrista dentro de un perfil de danza y ausencia de los diez accesos en legacy. La ampliación posterior de nombres del modal expuso un desborde a 320 px (310 px de contenido en 286 px útiles); se corrigió con columnas adaptativas, ajuste de texto y botones de al menos 48 px. Se repitieron los cuarenta casos completos después.

El primer smoke local fue 13/14: la animación preexistente del perfil público hacía medir un botón de 44 px como 43,99997 px. Diagnóstico aislado: cuatro fallos en doce intentos sin espera, doce de doce correctos tras terminar la animación. Se corrigió sólo la sincronización del test, conservando el umbral exacto de 44 px y sin editar esa página. La repetición completa fue 14/14.

La inspección de capturas adicionales con fuentes reales detectó una segunda deuda previa: el texto CONFIGURAR ocupaba 327 px dentro de 280 px disponibles y llevaba el viewport de layout a 347 px en una pantalla de 320. Se reprodujo también en `f070ba3`; no lo creó el nuevo selector. Un primer helper de fuentes sólo medía botones y no verificaba el viewport físico, por lo que su resultado aparente de 2/2 queda invalidado como aprobación visual (`perfil-modal-fonts/`). El ajuste de tamaño adaptable y wrap del título devuelve el editor a su ancho; no se ocultó el desborde con otra regla de clipping. Diagnóstico en `perfil-modal-viewport-diagnostic/` y `perfil-modal-viewport-cause/`; las pruebas finales incorporan dimensiones efectivas y bordes completos del modal.

`regression-final.log` es una corrida parcial interrumpida al detectar el desborde; no es evidencia de cierre. Los logs iniciales del modal y smoke se conservan para trazabilidad, no se sobrescribieron ni se contaron como aprobados.

## Evidencia y continuidad

Directorio privado `../BuscARTE-resguardos/coherencia-rubros-20260906/`: `regression-definitive.log`, `perfil-typography-final-99.log`, `registro/`, `registro-fonts/`, `home/`, `perfil-home-cierre/`, `perfil-home-cierre-40.log`, `perfil-fonts-cierre/perfil-modal-fonts.json`, `smoke-local-typography/`, `smoke-share-diagnostic/` y `baseline/`. Resguardo del historial y límites en `RESGUARDO.md`; no publicar ese directorio. Las capturas de `perfil-home-cierre/` anteceden al último ajuste tipográfico; las definitivas están en `perfil-fonts-cierre/`. SHA-256 del perfil definitivo comprobado contra su reporte: `c49e5777f9bc1e64fcda8bc4a4376ad308dd3a5b03619db38c52af3b5c4507f5`.

Pendientes separados:

- App instalada/dispositivo físico, teclado nativo y otros navegadores. No se editó ni compiló Android. Las pruebas de viewport no certifican comportamiento nativo ni integración real de captcha, RPC/RLS, Storage o correo.
- Cambio entre rubros del mismo perfil: el flujo heredado cambia primero caché/editor y sólo persiste al guardar. Reutiliza el mismo JSON y algunas claves compartidas; necesita diseño y pruebas de migración propios. No se declara resuelto por un ajuste de copy.
- Música aún agrupa instrumentos con producción, técnica y management. No se reclasificaron roles ni se modificó taxonomía.
- Multirrubro/principal entre rubros y migración Auth siguen expresamente postergados/separados. Los estilos múltiples dentro de danza no equivalen a varios rubros por cuenta.

Siguiente bloque propuesto: plantilla del email de bienvenida, sólo preparación local y enlaces probados sin envíos, manteniendo destinatarios y cadencia. No fue iniciado en este bloque. Se puede agrupar antes de acordar otra publicación. No hacer push a main que dispare un deploy accidental; no publicar la raíz. Para revertir esta preparación, usar una rama revisable desde `f070ba3` o revertir los dos commits funcionales, sin reset destructivo ni cambios en originales/Android o datos remotos.
