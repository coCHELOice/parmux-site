(async () => {
  const title = document.querySelector('#access-title');
  const status = document.querySelector('#access-status');
  const token = window.location.hash.slice(1).trim();

  window.history.replaceState(null, '', '/hogan');

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    title.textContent = 'Enlace privado no disponible.';
    status.textContent = 'Abre el enlace completo que PARMUX te envió. Si el problema continúa, escribe a negocios@parmux.com.';
    return;
  }

  try {
    const response = await fetch('/hogan', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'authorize', token }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new Error('access_denied');
    window.location.replace('/hogan');
  } catch {
    title.textContent = 'Enlace privado no disponible.';
    status.textContent = 'El enlace puede estar incompleto o vencido. Solicita a PARMUX un nuevo acceso por escrito.';
  }
})();
