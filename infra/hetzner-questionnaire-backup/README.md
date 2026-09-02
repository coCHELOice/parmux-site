# Receptor de respaldo Hetzner

El receptor almacena únicamente sobres AES-256-GCM. La clave de descifrado permanece fuera de Hetzner.

1. Crear `data/` con propietario `10001:10001` y permisos `0700`.
2. Crear `.env` con `BACKUP_TOKEN` aleatorio de al menos 32 caracteres y permisos `0600`.
3. Ejecutar `docker compose up -d --build`.
4. Publicar sólo `/v1/submissions` detrás del proxy HTTPS existente; el puerto 8787 permanece ligado a localhost.
5. Configurar en Vercel la URL HTTPS, el mismo token y una clave AES independiente.

La operación es idempotente: un UUID ya existente responde correctamente sin sobrescribir el archivo previo.
