# Preview — Inicio con sesión

5 de septiembre de 2026, hora argentina. Autorización: «Go» sobre la propuesta de pasar el bloque a preview antes del deploy de producción. Esta operación **no cambia producción ni sincroniza `main`**.

## Identificación

- Sitio existente: `43524f56-8833-41ab-8916-cb75de47dd1e`, `rococo-gaufre-c6b9b1`.
- Código público: `e63d92f9f46591eed35fd3b4eba9bd81d2cff303`, rama `codex/inicio-sesion-20260905`.
- Draft: `6a9cc9c456bb08b603d9b3cf`, estado `ready`, contexto remoto `deploy-preview`, `published_at=null`.
- [Preview](https://6a9cc9c456bb08b603d9b3cf--rococo-gaufre-c6b9b1.netlify.app).
- [Logs del deploy](https://app.netlify.com/projects/rococo-gaufre-c6b9b1/deploys/6a9cc9c456bb08b603d9b3cf).
- Producción antes y después: `6a9cbd37518d43630307438c`, `ready`, contexto `production`; mismo dominio `https://buscarte.com.ar`.
- `main` local/remoto permanece en `ce512247df40c69a2976de6bfedfe63e23ca9bf1`, verificado mediante fetch sin diferencias. No hubo push.

## Ejecución

Se repitieron build y 15 pruebas de empaquetado. El paquete tiene 36 archivos permitidos, incluyendo `_redirects`, sin documentación ni herramientas. La implementación ya contaba con 95 pruebas locales aprobadas, documentadas en `qa-inicio-20260905.md`.

```sh
netlify deploy --context production --dir dist --functions netlify/functions --site 43524f56-8833-41ab-8916-cb75de47dd1e --message "Preview Inicio con sesion e63d92f - sin publicar produccion" --json
```

Se conservó el procedimiento de preview del release previo. `--context production` toma la configuración del build; **no publica producción**. La API confirmó que el deploy creado es una draft `deploy-preview`, sin fecha de publicación.

## Resultado remoto

- 35 recursos servidos verificados frente al código local. JS/CSS y otros binarios se comparan exactamente; HTML sólo admite la normalización de Pretty URLs/serialización inerte ya existente en el verificador.
- 35 rutas verificadas, sin bucles y con destino correcto.
- Cuatro archivos internos comprobados responden 404: README, QA de anuncios, package.json y script de build. Esto, junto al build por lista permitida, evita incluir los archivos internos conocidos. No se obtuvo un listado completo remoto de archivos por deploy; no afirmar que se verificó un inventario remoto exhaustivo.
- Seis smoke tests aprobados contra HTML/JS de la preview: Home invitada/configuración conservada, ambas Home con sesión sintética, captcha, formulario mobile de anuncios y publicación con respuestas simuladas.
- Se hizo un ajuste **sólo al diagnóstico** para que la detección de enlaces de registro ignore mayúsculas/minúsculas, porque Pretty URLs puede reescribirlas. Se añadió comprobación de copy de invitado. Ningún archivo público cambió después de subir la preview.
- Sin errores inesperados de navegador, tráfico backend real, tracking ni WebSockets durante las pruebas. Sólo GET estáticos de una lista explícita alcanzaron Netlify; Supabase, funciones, vencimiento de anuncios, captcha, fotos y envíos se simularon o bloquearon. No se usó una cuenta real ni se invocaron funciones programadas.
- Fuentes protegidas sin cambios respecto de la base: Auth/API/config/vendor, cuatro funciones, configuración Netlify, lockfile, rutas, manifest, iconos y assetlinks Android. La actualización de SW v10 sólo añade los dos assets de Inicio al shell existente.

## Funciones y precaución para producción

La preview conserva cuatro funciones `nodejs24.x` y ambos horarios: `recordatorio-perfil` a `0 13 * * 1` y `resumen-mensual` a `0 13 1 * *`. Los cuatro hashes de los binarios de la preview difieren de producción, aunque sus fuentes no se modificaron: se empaquetaron de nuevo, como ocurrió en la preview anterior.

Por eso esta validación **no equivale a una prueba end-to-end del backend** ni autoriza restaurar/promover directamente la draft a producción. Al aprobar el siguiente paso, usar el contexto de producción, comprobar las funciones/horarios efectivos y repetir archivos/rutas/smoke sobre el dominio activo. No agregar cambios de funciones o variables dentro del bloque de Inicio si la verificación detecta diferencias pendientes de explicar.

Las funciones programadas no se ejecutan automáticamente por su horario en Deploy Previews. No se las invocó manualmente. [Documentación de Netlify](https://docs.netlify.com/build/functions/scheduled-functions/).

## Evidencia y límites

Informes locales fuera de `dist`, en `../BuscARTE-resguardos/inicio-preview-20260905/`:

- `preview-files.json`: comparación de recursos/rutas y exclusiones.
- `smoke/deploy-smoke.json`: llamadas estáticas, mocks, resultados y errores; capturas sintéticas en la misma carpeta.
- `independent-audit.json`: revisión independiente de metadata, contextos, funciones, horarios y ausencia de cambios protegidos, sin credenciales.

El backup previo del código está en `../BuscARTE-resguardos/inicio-20260905/inicio-web-history.bundle` (historial completo, verificado).

La URL de preview tiene otro origen y **no hereda la sesión del dominio público**. La vista registrada se verificó con identidad simulada y backend bloqueado; abrir la URL normalmente puede mostrar la vista invitada y conectarse a servicios reales. No usarla para crear cuentas o publicaciones de prueba contra producción.

No se recompiló Android ni se comprobó un dispositivo físico. La app instalada seguirá usando la web de producción, sin este bloque, hasta su publicación. La preview web está lista para la decisión de release; la aprobación y verificación de producción son el siguiente paso.
