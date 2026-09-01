const form = document.querySelector('#hogan-form');
const status = document.querySelector('#hogan-status');
const csrf = document.querySelector('meta[name="hogan-csrf"]')?.content || '';
const DRAFT_KEY = 'parmux:hogan:questionnaire:v1';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let submissionComplete = false;

function draftSnapshot() {
  if (!(form instanceof HTMLFormElement)) return null;

  const values = {};
  form.querySelectorAll('[name]').forEach((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return;
    if (!control.name || control.name === '_honey') return;

    values[control.name] = control instanceof HTMLInputElement && control.type === 'checkbox'
      ? control.checked
      : control.value;
  });

  return {
    version: 1,
    savedAt: Date.now(),
    values,
  };
}

function saveDraft() {
  if (submissionComplete) return;

  try {
    const snapshot = draftSnapshot();
    if (snapshot) localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  } catch {
    // The form remains usable when storage is unavailable or blocked.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function restoreDraft() {
  if (!(form instanceof HTMLFormElement)) return;

  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;

    const draft = JSON.parse(raw);
    const expired = !draft
      || draft.version !== 1
      || !Number.isFinite(draft.savedAt)
      || Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS
      || !draft.values
      || typeof draft.values !== 'object';

    if (expired) {
      clearDraft();
      return;
    }

    Object.entries(draft.values).forEach(([name, value]) => {
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = value === true;
      } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.value = typeof value === 'string' ? value : '';
      }
    });

    if (status) {
      status.textContent = 'Recuperamos las respuestas guardadas en este navegador.';
      status.className = 'form-status is-success';
    }
  } catch {
    clearDraft();
  }
}

restoreDraft();
form?.addEventListener('input', saveDraft);
form?.addEventListener('change', saveDraft);
window.addEventListener('pagehide', saveDraft);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  saveDraft();

  const button = form.querySelector('button[type="submit"]');
  const label = button?.firstChild;
  if (button instanceof HTMLButtonElement) button.disabled = true;
  if (label) label.textContent = 'Enviando… ';
  if (status) {
    status.className = 'form-status';
    status.textContent = 'Enviando la configuración de forma segura…';
  }

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

    submissionComplete = true;
    clearDraft();
    form.reset();
    if (status) {
      status.textContent = result.stored === true && result.delivered === false
        ? 'Recibido y resguardado. PARMUX revisará la configuración por escrito antes de activar el piloto.'
        : 'Recibido. PARMUX revisará la configuración por escrito antes de activar el piloto.';
      status.className = 'form-status is-success';
    }
  } catch (error) {
    saveDraft();
    if (status) {
      status.textContent = error.message === 'session_expired'
        ? 'La sesión privada venció. Tus respuestas quedaron guardadas en este navegador; abre nuevamente el enlace original para recuperarlas.'
        : 'No pudimos enviar el formulario. Tus respuestas quedaron guardadas en este navegador; inténtalo nuevamente o escribe a negocios@parmux.com.';
      status.className = 'form-status is-error';
    }
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
    if (label) label.textContent = 'Enviar configuración ';
  }
});
