'use strict';

(() => {
  const STORE = 'parmux:triagevet:pet-house:v3';
  const SUBMISSION_ID_STORE = `${STORE}:submission-id`;
  const form = document.querySelector('#discovery-form');
  if (!form) return;

  const panels = [...document.querySelectorAll('[data-step]')];
  const nav = [...document.querySelectorAll('[data-nav]')];
  const error = document.querySelector('#error');
  const workspace = document.querySelector('#workspace');
  const intro = document.querySelector('#intro');
  const success = document.querySelector('#success');
  const csrf = document.querySelector('meta[name="triagevet-csrf"]')?.content || '';
  let step = 0;

  const securityNote = document.createElement('div');
  securityNote.className = 'note';
  securityNote.innerHTML = '<strong>Confidencialidad y seguridad</strong><span>Toda la información ingresada se trata como estrictamente confidencial y está protegida mediante acceso privado, transmisión cifrada por HTTPS, sesión segura y controles contra accesos no autorizados. No solicitamos datos personales ni clínicos identificables de pacientes.</span>';
  const introNote = intro?.querySelector('.note');
  if (introNote) introNote.after(securityNote);

  const all = (name) => [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
  const radio = (name) => form.querySelector(`[name="${CSS.escape(name)}"]:checked`)?.value || '';
  const checks = (name) => all(name).filter((x) => x.checked).map((x) => x.value);
  const val = (name) => {
    const x = form.elements.namedItem(name);
    return x && typeof x.value === 'string' ? x.value.trim() : '';
  };
  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function selectedClasses() {
    document.querySelectorAll('.choice').forEach((label) => {
      label.classList.toggle('selected', Boolean(label.querySelector('input')?.checked));
    });
  }

  function updateMain(preferred = '') {
    const box = document.querySelector('#main-channel');
    const current = preferred || radio('main_channel');
    const channels = checks('channels');
    if (!channels.length) {
      box.innerHTML = '<small>Selecciona al menos un canal arriba.</small>';
      return;
    }
    box.innerHTML = channels.map((channel) => (
      `<label class="choice"><input type="radio" name="main_channel" value="${escapeHtml(channel)}"><span>${escapeHtml(channel)}</span></label>`
    )).join('');
    if (channels.includes(current)) {
      const input = [...box.querySelectorAll('input')].find((x) => x.value === current);
      if (input) input.checked = true;
    }
    selectedClasses();
  }

  function readWhatsapp() {
    const out = [];
    for (let i = 0; i < 8; i += 1) {
      const number = val(`wa_${i}_number`);
      const label = val(`wa_${i}_label`);
      const responder = val(`wa_${i}_responder`);
      const volume = val(`wa_${i}_volume`);
      const uses = checks(`wa_${i}_uses`);
      if (number || label || responder || volume || uses.length) {
        out.push({ number, label, responder, volume, uses });
      }
    }
    return out;
  }

  function renderWhatsapp(saved = readWhatsapp()) {
    const answer = radio('whatsapp_clinical');
    const yes = Boolean(answer && answer !== 'No actualmente');
    const yesBox = document.querySelector('#wa-yes');
    const noBox = document.querySelector('#wa-no');
    const moreBox = document.querySelector('#wa-more');
    yesBox.hidden = !yes;
    noBox.hidden = answer !== 'No actualmente';

    const countValue = radio('whatsapp_count');
    const count = countValue === '4 o más' ? 4 : Number(countValue) || 0;
    moreBox.hidden = countValue !== '4 o más';

    const box = document.querySelector('#wa-cards');
    if (!yes || !count) {
      box.innerHTML = '';
      return;
    }

    const uses = [
      'Consultas veterinarias', 'Agendamiento', 'Urgencias', 'Hospitalizados',
      'Resultados / controles', 'Peluquería', 'Hotel', 'Administración', 'Otro',
    ];
    const volumeOptions = [
      'Menos de 10/día', '10–30/día', '31–60/día', '61–100/día',
      'Más de 100/día', 'No sabemos',
    ];

    box.innerHTML = Array.from({ length: count }, (_, i) => {
      const d = saved[i] || {};
      const useChoices = uses.map((use) => (
        `<label class="choice"><input type="checkbox" name="wa_${i}_uses" value="${use}" ${(d.uses || []).includes(use) ? 'checked' : ''}><span>${use}</span></label>`
      )).join('');
      const volumes = volumeOptions.map((option) => (
        `<option ${d.volume === option ? 'selected' : ''}>${option}</option>`
      )).join('');
      return `<article class="wa-card">
        <h3>WhatsApp ${i + 1}</h3>
        <div class="two">
          <label class="field"><span>Número</span><input name="wa_${i}_number" value="${escapeHtml(d.number || '')}" placeholder="+56 9 …"></label>
          <label class="field"><span>Uso o nombre interno</span><input name="wa_${i}_label" value="${escapeHtml(d.label || '')}" placeholder="Ej.: recepción, clínica, principal…"></label>
        </div>
        <fieldset><legend>¿Para qué se utiliza?</legend><div class="choices three">${useChoices}</div></fieldset>
        <div class="two">
          <label class="field"><span>¿Quién responde?</span><input name="wa_${i}_responder" value="${escapeHtml(d.responder || '')}"></label>
          <label class="field"><span>Volumen clínico aproximado</span><select name="wa_${i}_volume"><option value="">Seleccionar</option>${volumes}</select></label>
        </div>
      </article>`;
    }).join('');
    selectedClasses();
  }

  function branches() {
    const channels = checks('channels');
    document.querySelector('#instagram').hidden = !channels.includes('Instagram');
    document.querySelector('#facebook').hidden = !channels.includes('Facebook / Messenger');
  }

  function newSubmissionId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function submissionId() {
    try {
      const stored = localStorage.getItem(SUBMISSION_ID_STORE);
      if (stored) return stored;
      const created = newSubmissionId();
      localStorage.setItem(SUBMISSION_ID_STORE, created);
      return created;
    } catch {
      return newSubmissionId();
    }
  }

  function data() {
    const scalar = [
      'clinic_name', 'client_id', 'main_channel', 'channel_friction', 'channel_friction_detail',
      'whatsapp_clinical', 'whatsapp_count', 'whatsapp_mixed', 'whatsapp_mixed_process',
      'whatsapp_interest', 'whatsapp_reason', 'wa_more_notes', 'urgent_frequency', 'urgent_process',
      'automation_never', 'initial_responder', 'digital_team_size', 'vet_escalation',
      'difficult_moments', 'difficult_moments_detail', 'manual_copy', 'manual_copy_detail',
      'other_systems', 'web_repeated_questions', 'web_improvement_interest',
      'instagram_frequency', 'instagram_responder', 'instagram_questions', 'instagram_interest',
      'facebook_relevance', 'facebook_interest', 'top_impact', 'missing_context',
      'contact_name', 'contact_role', 'contact_email', '_honey',
    ];
    const result = Object.fromEntries(scalar.map((name) => [name, radio(name) || val(name)]));
    ['channels', 'query_types', 'required_info', 'agendapro_uses', 'web_goals', 'priorities']
      .forEach((name) => { result[name] = checks(name); });
    result.whatsapp_numbers = readWhatsapp();
    result.consent = form.querySelector('[name="consent"]:checked')?.value || '';
    result.submission_id = submissionId();
    result._step = step;
    return result;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(data())); } catch { /* storage is optional */ }
  }

  function restore() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { stored = null; }
    if (!stored) return false;

    Object.entries(stored).forEach(([name, value]) => {
      if (name === 'whatsapp_numbers' || name === '_step' || name === 'main_channel') return;
      if (Array.isArray(value)) {
        all(name).forEach((x) => { x.checked = value.includes(x.value); });
        return;
      }
      const nodes = all(name);
      if (nodes.some((x) => x.type === 'radio' || x.type === 'checkbox')) {
        nodes.forEach((x) => { x.checked = x.value === value; });
      } else {
        const x = form.elements.namedItem(name);
        if (x && typeof value === 'string') x.value = value;
      }
    });

    updateMain(stored.main_channel || '');
    renderWhatsapp(Array.isArray(stored.whatsapp_numbers) ? stored.whatsapp_numbers : []);
    branches();
    step = Number.isInteger(stored._step) ? Math.max(0, Math.min(6, stored._step)) : 0;
    selectedClasses();
    return true;
  }

  function validate() {
    if (step === 0 && (!checks('channels').length || !radio('main_channel'))) {
      return 'Indica los canales actuales y cuál concentra más consultas.';
    }
    if (step === 1 && !radio('whatsapp_clinical')) {
      return 'Indica si utilizan WhatsApp para consultas veterinarias.';
    }
    if (step === 1 && radio('whatsapp_clinical') !== 'No actualmente' && !radio('whatsapp_count')) {
      return 'Indica cuántos números de WhatsApp utilizan.';
    }
    if (step === 2 && (!checks('query_types').length || !radio('urgent_frequency'))) {
      return 'Indica los tipos de consulta habituales y la frecuencia de consultas potencialmente urgentes.';
    }
    if (step === 3 && !val('initial_responder')) {
      return 'Indica quién recibe normalmente el primer contacto clínico.';
    }
    if (step === 5 && (checks('priorities').length < 1 || checks('priorities').length > 3 || !val('top_impact'))) {
      return 'Selecciona hasta tres prioridades e indica cuál tendría mayor impacto.';
    }
    if (step === 6 && (
      !val('contact_name')
      || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(val('contact_email'))
      || !form.querySelector('[name="consent"]:checked')
    )) {
      return 'Completa nombre, email y confirmación final.';
    }
    return '';
  }

  function render() {
    panels.forEach((panel, index) => { panel.hidden = index !== step; });
    nav.forEach((item, index) => {
      item.classList.toggle('active', index === step);
      item.classList.toggle('done', index < step);
    });
    document.querySelector('#prev').hidden = step === 0;
    document.querySelector('#next').hidden = step === 6;
    document.querySelector('#submit').hidden = step !== 6;
    error.textContent = '';
    branches();
    renderWhatsapp();
    selectedClasses();
    save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelector('#start').addEventListener('click', () => {
    intro.hidden = true;
    workspace.hidden = false;
    render();
  });

  form.addEventListener('change', (event) => {
    if (event.target.name === 'channels') updateMain();
    if (event.target.name === 'whatsapp_clinical' || event.target.name === 'whatsapp_count') renderWhatsapp();
    if (event.target.name === 'priorities' && checks('priorities').length > 3) {
      event.target.checked = false;
      error.textContent = 'Puedes seleccionar hasta tres prioridades.';
    }
    branches();
    selectedClasses();
    save();
  });
  form.addEventListener('input', save);

  document.querySelector('#next').addEventListener('click', () => {
    const message = validate();
    if (message) { error.textContent = message; return; }
    step += 1;
    render();
  });
  document.querySelector('#prev').addEventListener('click', () => {
    step -= 1;
    render();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = validate();
    if (message) { error.textContent = message; return; }

    const button = document.querySelector('#submit');
    button.disabled = true;
    button.textContent = 'Enviando…';
    try {
      const response = await fetch('/triagevet/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TriageVet-CSRF': csrf },
        body: JSON.stringify(data()),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error('send_failed');
      try {
        localStorage.removeItem(STORE);
        localStorage.removeItem(SUBMISSION_ID_STORE);
      } catch { /* storage is optional */ }
      workspace.hidden = true;
      success.hidden = false;
      const successSecurity = document.createElement('p');
      successSecurity.innerHTML = '<strong>Confidencialidad y seguridad</strong><br>La información recibida se mantiene bajo controles estrictos de acceso, seguridad y confidencialidad, con transmisión cifrada mediante HTTPS.';
      success.appendChild(successSecurity);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      error.textContent = 'No pudimos enviar el diagnóstico. Tus respuestas siguen guardadas en este dispositivo; puedes volver a intentarlo.';
      button.disabled = false;
      button.textContent = 'Enviar diagnóstico →';
    }
  });

  const restored = restore();
  updateMain(radio('main_channel'));
  branches();
  selectedClasses();
  if (restored) {
    intro.hidden = true;
    workspace.hidden = false;
    render();
  }
})();
