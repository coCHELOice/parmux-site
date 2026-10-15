# Diagnósticos TriageVet por clínica

Cada enlace privado identifica una clínica mediante un acceso opaco de 32 bytes.
El servidor resuelve su hash en `api/config/triagevet-clinics.json`. El nombre y el
`client_id` se obtienen de ese registro; el formulario no puede elegir otra clínica.
No hay alta pública, listado de clínicas ni respuestas visibles para otros destinatarios.

## Compatibilidad y alcance

El registro contiene únicamente Pet House, con el mismo hash del enlace existente.
Su vigencia autorizada se amplió hasta `2026-11-30T02:59:59.000Z`, equivalente al
29 de noviembre de 2026 a las 23:59:59 en `America/Santiago`. No se generaron
accesos nuevos. El formato sigue siendo `/triagevet/diagnostico?access=…`.
La cookie mantiene `HttpOnly`, `Secure` y `SameSite=Lax`, y su duración se limita al
vencimiento del enlace. Un acceso desconocido, deshabilitado o vencido no abre el formulario.

Los siete pasos y las preguntas operativas son los mismos. El nombre de la clínica
se muestra en la portada y el cierre. Los borradores y UUID del navegador usan una
clave por `client_id`; la clave previa de Pet House sigue funcionando. Cambiar de
enlace en otra pestaña invalida el CSRF de la pestaña anterior, en vez de atribuir
sus respuestas a la nueva clínica.

## Preparar otra clínica, después de aprobar el acceso

Se necesita un `client_id` estable (2–64 caracteres, letras minúsculas, números y
guiones), nombre de 1–160 caracteres, destinatario del enlace y vencimiento UTC
aprobados. Después de esa aprobación:

1. Generar un acceso aleatorio de 32 bytes, representado en hexadecimal, fuera de logs
   y del repositorio. Conservarlo y compartirlo sólo por el canal privado autorizado.
2. Guardar únicamente su SHA-256, `client_id`, `clinic_name`, `expires_at` y
   `enabled: true` en el registro del servidor. No almacenar el enlace completo.
3. Revisar el cambio de configuración y las pruebas antes de publicarlo.
4. Compartir el enlace privado únicamente con el destinatario aprobado. Para revocar
   un enlace se deshabilita la entrada; para rotarlo se cambia el hash manteniendo el ID.

La validación rechaza IDs o hashes duplicados, nombres inválidos y vencimientos
ausentes. El registro está dentro de `api/`, excluido del directorio público `dist`.
No debe moverse a `assets`, `proposals`, un archivo público ni un endpoint de listado.

## Persistencia y separación

La tabla sigue siendo `parmux_questionnaire_submissions`; no requiere una migración.
Vercel valida sesión, origen, CSRF, identidad y campos antes de llamar a la ingesta
con el OIDC existente. Supabase comprueba que fila y payload tienen la misma clínica.
Un UUID repetido sólo puede corresponder a la misma clínica y al mismo hash de
payload; un conflicto devuelve 409 sin sobrescribir la fila. Las actualizaciones de
correo y respaldo se filtran por UUID **y** `client_id`. Los clientes antiguos que
omiten el ID sólo pueden actualizar filas de Pet House.

Se conserva la copia cifrada de Hetzner, el respaldo cifrado heredado en logs y el
correo interno existente. El destinatario de notificación sigue siendo
`negocios@parmux.com` (o su reemplazo de configuración previo); el contacto del
formulario se usa como `Reply-To`. No se agregan CC, BCC ni correos de confirmación.
FormSubmit también usa el nombre de la clínica resuelta cuando actúa como fallback.

## Respuesta perdida y recuperación del envío

Un reintento idéntico conserva el UUID y recibe un recibo de la fila existente;
no vuelve a ejecutar el correo ni la copia Hetzner. El recibo conserva sus estados
reales: una entrega `pending` o `failed` requiere recuperación operativa separada,
no reenviar el cuestionario para intentar repetir esos efectos.
El respaldo cifrado heredado en logs mantiene su auditoría por intento.

Si se editaron respuestas después de un envío cuya respuesta HTTP se perdió,
el servidor devuelve `409 submission_conflict`, sin sobrescribir la fila anterior.
El navegador conserva respuestas, UUID y conflicto por clínica, también tras
recargar cuando el almacenamiento local está disponible. Se ofrece «Enviar como
nueva respuesta» con confirmación explícita: sólo entonces se genera otro UUID y
se permite crear otra fila y notificación. Cancelar no cambia el UUID ni envía nada.
Una respuesta tardía, tanto exitosa como de conflicto, tampoco reemplaza un
borrador más reciente de otra pestaña ni su UUID o estado de recuperación.
Sin almacenamiento local, el UUID se mantiene en memoria durante la página actual;
no se puede garantizar recuperación de borradores después de cerrar o recargar.

## Validación y publicación posterior

`npm test` ejecuta pruebas locales sin acceder a Supabase, Hetzner o Resend reales
(el receptor de respaldo se prueba sólo en localhost). Las pruebas de varias
clínicas usan accesos sintéticos dentro del proceso, sin modificar el registro real.
`npm run build` genera el sitio y mantiene fuera los archivos de configuración privada.

Para una publicación aprobada: desplegar primero la Edge Function compatible con
ambas versiones y luego Vercel; comprobar después el enlace existente y cualquier
nuevo enlace aprobado. No ejecutar otra prueba en producción sin la autorización
correspondiente para filas, respaldo y correo.

El respaldo Hetzner tiene un fallo HTTP 404 pendiente de diagnóstico de su
URL/ruta de destino. Debe revisarse por separado antes de considerar saludable
la réplica. La evidencia de pruebas reales y sus identificadores se mantiene
fuera del repositorio público.
