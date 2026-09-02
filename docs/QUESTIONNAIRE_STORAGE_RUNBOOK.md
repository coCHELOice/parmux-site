# Persistencia de cuestionarios PARMUX

## Flujo de producción

1. El navegador conserva el borrador localmente y crea un UUID de envío.
2. Vercel valida sesión, origen, CSRF, campos y consentimiento.
3. Vercel firma la solicitud con HMAC y una Edge Function inserta idempotentemente el envío en Supabase.
4. El servidor replica un sobre AES-256-GCM a Hetzner cuando la réplica está configurada.
5. El servidor envía el resumen a `negocios@parmux.com`.
6. Los estados de réplica y correo se actualizan en Supabase.

Supabase es la fuente de verdad. El correo es una notificación y Hetzner una copia independiente. Ningún secreto se entrega al navegador.

## Variables protegidas en Vercel

- `SUPABASE_QUESTIONNAIRE_INGEST_URL`
- `QUESTIONNAIRE_INGEST_SECRET`: secreto aleatorio compartido sólo entre Vercel y la función de Supabase.
- `HETZNER_QUESTIONNAIRE_BACKUP_URL`
- `HETZNER_QUESTIONNAIRE_BACKUP_TOKEN`
- `HETZNER_BACKUP_ENCRYPTION_KEY`: 32 bytes aleatorios codificados en Base64.

La Edge Function conserva `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y el mismo `QUESTIONNAIRE_INGEST_SECRET` dentro de Supabase. La clave `service_role` nunca se instala en el sitio Vercel.

Las tres variables de Hetzner pueden omitirse durante una contingencia; el envío sigue válido si Supabase confirma. Las variables de ingesta son obligatorias y el sistema falla cerrado si faltan.

## Controles

- Tabla con RLS forzado y permisos revocados a `anon` y `authenticated`.
- Escritura exclusiva mediante una Edge Function con firma HMAC, ventana antirrepetición de cinco minutos y cuerpo limitado.
- La función Vercel no posee credenciales amplias de lectura de Supabase.
- UUID e inserción `on_conflict` para reintentos sin duplicación.
- HTTPS obligatorio para la réplica.
- Respaldo Hetzner cifrado antes de salir de Vercel.
- No se observan ni almacenan centralmente borradores parciales.

## Recuperación

La fila de Supabase contiene el envío completo. La réplica de Hetzner requiere la clave `HETZNER_BACKUP_ENCRYPTION_KEY`; la clave nunca debe almacenarse junto a los sobres cifrados. Los logs cifrados heredados pueden retirarse después de verificar dos envíos reales con ambas capas.
