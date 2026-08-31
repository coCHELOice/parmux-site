const form = document.querySelector('#hogan-form');
const status = document.querySelector('#hogan-status');
const csrf = document.querySelector('meta[name="hogan-csrf"]')?.content || '';

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const button = form.querySelector('button[type="submit"]');
  const label = button?.firstChild;
  button.disabled = true;
  if (label) label.textContent = 'Enviando… ';
  status.className = 'form-status';
  status.textContent = 'Enviando la configuración de forma segura…';

  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch('/hogan', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Hogan-CSRF': csrf,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error('session_expired');
    }
    if (!response.ok || result.ok !== true) throw new Error('send_failed');

    form.reset();
    status.textContent = 'Recibido. PARMUX revisará la configuración por escrito antes de activar el piloto.';
    status.className = 'form-status is-success';
  } catch (error) {
    status.textContent = error.message === 'session_expired'
      ? 'La sesión privada venció. Abre nuevamente el enlace original enviado por PARMUX.'
      : 'No pudimos enviar el formulario. Tus datos permanecen en pantalla; inténtalo nuevamente o escribe a negocios@parmux.com.';
    status.className = 'form-status is-error';
  } finally {
    button.disabled = false;
    if (label) label.textContent = 'Enviar configuración ';
  }
});
