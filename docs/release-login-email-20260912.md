# Login y normalización del email — 12/9/2026

Autorizado por el usuario: «no tengo sus datos; si el problema es real go». Corrección de un defecto confirmado y reproducido; no atribuir con certeza el caso del foro sin su correo/error.

## Causa y reparación

El registro conservaba mayúsculas, login web convertía a minúsculas y login_usuario comparaba email por igualdad exacta. Había cuatro cuentas con mayúsculas, sin espacios ni colisiones normalizadas. La sesión local creada al registrarse podía funcionar hasta salir, sin haber comprobado un reingreso.

Se eligió normalizar los cuatro correos existentes y el parámetro p_email de registrar_usuario/login_usuario mediante lower(btrim()). Esto mantiene el índice UNIQUE(email) existente y la consulta exacta de recuperación/guardado. No se cambió ningún password, ID, token, fecha ni otro dato de las filas; tampoco se fusionaron cuentas. Las tres altas frontend y su validación ahora usan trim().toLowerCase(). Las versiones cacheadas también quedan cubiertas por normalización en el RPC. No se alteran mayúsculas/espacios de la contraseña.

Los RPC siguen con sus argumentos, respuestas, dueño, SECURITY INVOKER y privilegios originales. No se cambia RLS ni se activa Supabase Auth, sesiones nuevas o la migración de cuentas. No se añaden índices, triggers ni vistas. UNIQUE(email) protege los valores normalizados del flujo; no afirmar que una escritura directa externa que omita el RPC también normaliza automáticamente.

## Aplicación y guardas

Parche local creado con Supabase CLI: `supabase/migrations/20260912174431_normalize_legacy_login_email.sql`. Aplicado mediante herramienta de migración, historial remoto **20260912174834 / normalize_legacy_login_email**. La diferencia de timestamp corresponde al momento de creación local y aplicación remota. Esta carpeta NO contiene el esquema histórico completo ni autoriza db push/pull de migraciones pendientes del proyecto original.

Un bloque DO atómico toma un bloqueo corto de escritura con lock_timeout de 5 s, comprueba definiciones esperadas de los RPC, ausencia de colisiones y cuatro filas afectadas. Verifica dentro de la misma operación todos los campos de esas filas excepto el email, y privilegios/configuración de ambas funciones; cualquier diferencia inesperada aborta el bloque completo. Copia privada previa de definiciones y de los cuatro emails para recuperación manual: `../BuscARTE-resguardos/login-email-20260912/database-before.json`. No publicar ese archivo. El statement_timeout configurado dentro del DO no se presenta como límite estricto de duración del propio DO.

## Verificación acotada

- Antes: cuerpos candidatos con tablas/funciones temporales, rollback. Alta normalizada; login con mayúsculas y espacios; contraseña incorrecta rechazada; duplicado rechazado; hash intacto; lookup exacto de recuperación accesible.
- Después: mismos casos invocando los RPC públicos ya corregidos bajo rol anon y search_path con tabla temporal. Sin usar perfiles reales, sin consumir sus secuencias, sin crear cuentas permanentes ni enviar emails.
- Definiciones remotas iguales a la fuente esperada, dueño/ACL/SECURITY INVOKER/config iguales; cero emails pendientes de normalizar. La conservación de los demás campos fue condición de éxito del bloque atómico.
- 3 pruebas locales: normalización en cuatro lecturas de registro y login, passwords sin transformación/sintaxis inline y guardas SQL. Build de 36 archivos públicos, sin publicar SQL/documentación/resguardos.
- Un único deploy Netlify **6aa590c8dcefc07a7832050d**, 14:50 ART, fuente **7c8a559**, SW **buscarte-v21-2026-09-12-login-email**. Registro HTTP200, scripts y SW iguales a fuente; cinco paquetes de funciones y runtimes nodejs24.x idénticos, ambos cron idénticos.
- Guía ajena conservada y excluida, SHA256 `cb3fa88aecc1537af9d936f9997934d3eb1fdb9a88779c4f5aadc9a4d688bb3f`. Original/Android intactos. Cierre GitHub con `[skip netlify]`; verificación posterior de SHA/deploy en resguardo privado.

Las guías de Supabase/Postgres orientaron la conservación de permisos e índice; Netlify mantuvo el deploy limitado a dist y funciones existentes. [Documentación de funciones](https://supabase.com/docs/guides/database/functions) y changelog consultados. Auditoría de seguridad antes/después sin hallazgos nuevos; deuda previa sin incorporar a este parche. Referencias de remediación de los avisos existentes: [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [extensiones en public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [funciones SECURITY DEFINER públicas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). No declarar completada la migración/auditoría general de seguridad.

Validación humana pendiente: reabrir web/app conectada e ingresar normalmente con email/contraseña existentes. Si el usuario del foro sigue sin poder entrar, obtener el mensaje exacto y su navegador; podría existir otra causa. No hace falta recrear cuentas ni restablecer contraseñas por este bug.
