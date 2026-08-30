# Canales publicos de PARMUX

Este archivo define la fuente de verdad para los canales de contacto de `parmux.com`.

## WhatsApp oficial unico

- Numero visible: `+56 9 6159 7939`
- Numero para enlaces `wa.me`: `56961597939`
- No publicar ni reutilizar otros numeros en la landing, paginas legales o propuestas.

## Correos publicos

- Consultas y soporte: `contacto@parmux.com`
- Proyectos y alianzas: `negocios@parmux.com`

Ambos correos se enrutan externamente a la casilla operativa definida por PARMUX. La direccion de destino no debe exponerse en la landing.

## Mapa de CTA de la landing

- `Conversemos`, en la cabecera: abre directamente el WhatsApp oficial.
- `Hablar con un experto` y el boton flotante: abren el panel de WhatsApp dentro del sitio; el usuario elige un tema o edita el mensaje antes de continuar.
- `Solicitar contacto`, en capacidades, y `Solicitar un diagnostico`, en el cierre: abren la ficha de diagnostico empresarial dentro del sitio.
- La ficha solicita razon social, RUT de empresa con validacion de digito verificador, rubro, tamano, persona y cargo de contacto, email, telefono, sistemas actuales, area de interes, plazo y descripcion del desafio.
- El formulario entrega las solicitudes ordenadas a `negocios@parmux.com` mediante el endpoint AJAX de FormSubmit y conserva un enlace de correo como fallback visible si el servicio no responde.

## Regla de consistencia

Todo cambio futuro debe actualizar en conjunto la landing, las paginas legales y cualquier propuesta publica. No se deben modificar el logotipo canonico ni los textos legales como consecuencia de un cambio de CTA.
