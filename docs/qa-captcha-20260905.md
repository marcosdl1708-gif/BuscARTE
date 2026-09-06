# Bloque 1 — captcha de registro mobile

Fecha: 5 de septiembre de 2026. Rama: `codex/captcha-mobile-20260905`.
Base: `dad2e25` (organización) sobre `130577f` (versión publicada recuperada).
Estado: implementado y probado localmente; sin push, preview remota ni deploy de producción.

Actualización de publicación, 5/9 a las 22:09 ART: este bloque se publicó junto con anuncios, después de la preview técnica. Ver `release-20260905.md`. Los resultados y límites siguientes documentan el trabajo original; el pendiente antispam de servidor continúa separado.

## Problema confirmado en el código anterior

La espera de hCaptcha reintentaba cada 300 ms indefinidamente si no había SDK. Si render fallaba, sólo escribía en consola. Las tres rutas terminaban mostrando la misma alerta de completar captcha, sin distinguir carga, error ni vencimiento. Un render pendiente podía ejecutarse después de abandonar su paso.

Estos comportamientos se reprodujeron con el código anterior en un entorno JS aislado. No se reprodujo la sesión exacta del usuario que reportó el problema, por lo que no se atribuye su caso exclusivamente a una causa de red, dispositivo o configuración.

La documentación de hCaptcha indica que su callback de carga garantiza que terminó la inicialización; detectar simplemente que existe `render` puede anticiparse a ella. También exige informar al usuario cómo reintentar ante errores. [Configuración oficial de hCaptcha](https://docs.hcaptcha.com/configuration/).

## Cambio acotado

- Controlador `assets/js/registro-captcha.js`, compartido por artista, negocio y visitante.
- Carga explícita con callback definido antes del SDK, sólo para el paso final visible. Sin polling infinito: límite de 15 segundos para carga/iframe y recuperación manual.
- Estados visibles de carga, disponible, completado, vencido y error. Explicaciones junto al widget, región de estado accesible y foco al intentar continuar sin respuesta.
- Reintento sin recargar la página ni borrar datos del formulario. Reset del widget correcto; reconstrucción si su ID dejó de ser válido; descarte de callbacks de instancias reemplazadas.
- Widget oscuro/compacto para evitar recortes al abrir o rotar un celular. Acciones apiladas en mobile, sin transformar/escalar el iframe.
- Lista de publicación y service worker incluyen el nuevo controlador; versión de caché `buscarte-v8-2026-09-05-registro-captcha`.

Sin cambios de contratos RPC, fuentes de funciones, base de datos, migración Auth, manifest, assetlinks, paquete o firma de Android. Playwright se agrega únicamente como dependencia de desarrollo con versión fijada y lockfile.

## Verificación ejecutada

15 pruebas de empaquetado + 17 pruebas de navegador aprobadas, con Edge headless/Chromium:

- Tres tipos de cuenta: bloquear envío sin respuesta, continuar con respuesta simulada, conservar campos RPC, sesión local y comportamiento previo de bienvenida.
- SDK expuesto pero no inicializado; salida y retorno de pasos; no duplicar widgets ni renderizar ocultos.
- SDK bloqueado/lento, timeout, error de render parcial, iframe ausente y reintento conservando los campos escritos.
- Vencimiento/error aun si el SDK expone un token viejo; reset inválido y callbacks antiguos; error de registro y reset del widget correspondiente.
- Anchos 320, 360, 390 y 1280 px, incluyendo reducción de ancho tras el render. Widget y botones dentro del viewport.

Todas las solicitudes de esas 17 pruebas se interceptan: respuestas de registro/email ficticias, tracking desactivado, SDK simulado, cualquier otro destino bloqueado. No se crean usuarios, publican datos ni envían emails reales.

Además se comprobó una carga real de hCaptcha a 390 px, sin resolver el desafío ni intentar registrar una cuenta. Se sirvió el HTML candidato mediante interceptación local bajo el origen del sitio, con llamadas al backend y tracking bloqueadas. Resultado: checkbox «Soy humano» visible, 1 iframe, sin errores JS. Esto prueba carga/render, no equivale a un deploy remoto ni a una validación de token en servidor.

Capturas y diagnóstico puntual: `C:\Users\Usuario\Documents\ChatGPT\BuscARTE-resguardos\captcha-20260905`. Las capturas con SDK ficticio llevan la etiqueta SIMULACIÓN LOCAL; `captcha-mobile-real-render.png` muestra el widget real.

Build final: 34 archivos aprobados. `git diff --check` sin errores. Fuentes de funciones, configuración Auth, manifest y assetlinks idénticos a la base. No hubo cambios en la carpeta original ni en el worktree Android.

## Pendiente importante de seguridad (preexistente)

Las tres funciones de creación obtenían `captchaResponse`, pero no lo incluían en la petición a `registrar_usuario`. El cambio mantiene ese contrato; no inventa un parámetro RPC ni activa la migración Auth. Por tanto, no se debe presentar este arreglo visual como protección antispam validada de extremo a extremo.

Debe revisarse por separado el endpoint y la validación del token en servidor antes de considerar resuelta la protección contra altas automatizadas. La validación en servidor es parte necesaria de la integración según la [guía oficial de hCaptcha](https://docs.hcaptcha.com/#verify-the-user-response-server-side). No se consultó ni modificó la definición remota de la RPC en este bloque.

## Antes de publicar

1. Integrar la rama sobre la base web reconciliada, no sobre una copia vieja de GitHub.
2. Validar el paquete `dist/` en preview y el flujo real con una cuenta de prueba expresamente acordada y datos aislados. Una preview no separa Supabase automáticamente.
3. Comprobar carga/desafío real en Safari iOS y Android/app instalada; no se probaron dispositivos físicos en este bloque.
4. Publicar sólo dentro del alcance acordado, conservando el deploy anterior para reversión. El usuario real debe recibir la nueva versión del service worker/controlador.

El siguiente bloque UX es publicación de anuncios mobile; no mezclarlo en este commit. El pendiente antispam del servidor requiere su propia revisión de alcance y compatibilidad.
