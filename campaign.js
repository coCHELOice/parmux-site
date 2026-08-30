const menuButton = document.querySelector('.campaign-menu-toggle');
const mobileMenu = document.querySelector('.campaign-mobile-menu');
const campaignHero = document.querySelector('.campaign-hero');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Abrir menú' : 'Cerrar menú');
  mobileMenu.hidden = expanded;
});

mobileMenu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    if (menuButton) menuButton.setAttribute('aria-label', 'Abrir menú');
    mobileMenu.hidden = true;
  });
});

if (campaignHero && !reduceMotion) {
  campaignHero.addEventListener('pointermove', (event) => {
    const x = (event.clientX / window.innerWidth - .5) * -8;
    const y = (event.clientY / window.innerHeight - .5) * -5;
    campaignHero.style.setProperty('--campaign-art-x', `${x}px`);
    campaignHero.style.setProperty('--campaign-art-y', `${y}px`);
  }, { passive: true });
}

const revealTargets = document.querySelectorAll('.principles article, .capabilities article, .method-steps article, .continuity-grid article, .human-copy, .closing-section h2');

if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: .1 });

  revealTargets.forEach((target, index) => {
    target.classList.add('campaign-reveal');
    target.style.transitionDelay = `${(index % 4) * 40}ms`;
    observer.observe(target);
  });
} else {
  revealTargets.forEach((target) => target.classList.add('is-visible'));
}

const PARMUX_WHATSAPP = '56961597939';
const WEB_CHAT_ENDPOINT = 'https://automation.parmux.com/webhook/parmux-web-chat';
const pageParams = new URLSearchParams(window.location.search);
const leadSource = pageParams.get('origen') === 'whatsapp' ? 'WhatsApp PARMUX' : 'Landing parmux.com';
const webChatDialog = document.querySelector('#web-chat-dialog');
const leadDialog = document.querySelector('#lead-dialog');
const webChatLog = document.querySelector('#web-chat-log');
const webChatActions = document.querySelector('#web-chat-actions');
const webChatForm = document.querySelector('#web-chat-form');
const webChatInput = document.querySelector('#web-chat-input');
const webChatStatus = document.querySelector('#web-chat-status');
const webChatWhatsApp = document.querySelector('#web-chat-whatsapp');
const leadForm = document.querySelector('#lead-form');
const leadInterest = document.querySelector('#lead-interest');
const leadRut = document.querySelector('#lead-rut');
const leadFormStatus = document.querySelector('#lead-form-status');
let webChatStage = 'start';
let webChatTopic = '';
let webChatBusy = false;
let webChatTyping = null;
let lastChatContext = 'Quiero conversar sobre un proyecto.';

function createChatSession() {
  try {
    const stored = sessionStorage.getItem('parmux_web_chat_session');
    if (stored) return stored;
    const generated = window.crypto?.randomUUID?.() || `parmux-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('parmux_web_chat_session', generated);
    return generated;
  } catch (error) {
    return `parmux-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const webChatSession = createChatSession();

function openDialog(dialog) {
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (!dialog.open) dialog.showModal();
}

function getWhatsAppUrl() {
  const message = `Hola PARMUX AI. Inicié una conversación en parmux.com y quiero continuar. Mi contexto: ${lastChatContext}`;
  return `https://wa.me/${PARMUX_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

function updateWhatsAppHandoff() {
  if (webChatWhatsApp instanceof HTMLAnchorElement) webChatWhatsApp.href = getWhatsAppUrl();
}

function appendChatMessage(text, role = 'assistant') {
  if (!(webChatLog instanceof HTMLElement) || !text) return;
  const message = document.createElement('div');
  message.className = `web-chat-message is-${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('span');
    avatar.className = 'web-chat-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'P';
    message.append(avatar);
  }

  const body = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  body.append(paragraph);

  if (role === 'assistant') {
    const author = document.createElement('small');
    author.textContent = 'PARMUX AI';
    body.append(author);
  }

  message.append(body);
  webChatLog.append(message);
  webChatLog.scrollTo({ top: webChatLog.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function renderChatActions(actions = []) {
  if (!(webChatActions instanceof HTMLElement)) return;
  webChatActions.replaceChildren();
  const conversionReady = actions.length === 2 && actions.every((action) => ['form', 'whatsapp'].includes(action?.kind));
  webChatActions.classList.toggle('is-ready', conversionReady);

  actions.forEach((action, index) => {
    if (!action?.id || !action?.label) return;
    if (action.kind === 'whatsapp') {
      const link = document.createElement('a');
      link.href = getWhatsAppUrl();
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = action.label;
      link.className = 'is-conversion';
      link.style.setProperty('--chat-action-index', index);
      webChatActions.append(link);
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.chatAction = action.id;
    button.dataset.chatKind = action.kind || 'reply';
    button.textContent = action.label;
    if (action.kind === 'form') button.className = 'is-conversion';
    button.style.setProperty('--chat-action-index', index);
    webChatActions.append(button);
  });
}

function setChatBusy(busy) {
  webChatBusy = busy;
  if (webChatInput instanceof HTMLTextAreaElement) webChatInput.disabled = busy;
  const submit = webChatForm?.querySelector('button[type="submit"]');
  if (submit instanceof HTMLButtonElement) submit.disabled = busy;
  webChatActions?.querySelectorAll('button').forEach((button) => { button.disabled = busy; });

  if (busy) {
    if (webChatStatus) webChatStatus.textContent = 'PARMUX está preparando la respuesta…';
    if (webChatLog instanceof HTMLElement && !webChatTyping) {
      webChatTyping = document.createElement('div');
      webChatTyping.className = 'web-chat-typing';
      webChatTyping.setAttribute('aria-label', 'PARMUX está escribiendo');
      webChatTyping.innerHTML = '<span></span><span></span><span></span>';
      webChatLog.append(webChatTyping);
      webChatLog.scrollTop = webChatLog.scrollHeight;
    }
  } else {
    webChatTyping?.remove();
    webChatTyping = null;
    if (webChatStatus) webChatStatus.textContent = 'Tus mensajes se usan sólo para orientar esta conversación.';
  }
}

function interestFromChat() {
  if (webChatTopic === 'automation' || webChatTopic === 'ai') return 'Automatización e IA aplicada';
  if (webChatTopic === 'integration') return 'Integración de sistemas';
  return 'Diagnóstico inicial';
}

function openLeadForm(interest = 'Diagnóstico inicial') {
  if (leadInterest instanceof HTMLSelectElement && interest) leadInterest.value = interest;
  if (leadFormStatus) {
    leadFormStatus.textContent = '';
    leadFormStatus.className = 'form-status';
  }
  if (webChatDialog instanceof HTMLDialogElement && webChatDialog.open) webChatDialog.close();
  openDialog(leadDialog);
}

async function sendChatMessage({ action = '', message = '', label = '' } = {}) {
  if (webChatBusy || (!action && !message)) return;

  const visibleMessage = message || label;
  if (visibleMessage) {
    appendChatMessage(visibleMessage, 'user');
    lastChatContext = visibleMessage.slice(0, 700);
    updateWhatsAppHandoff();
  }
  renderChatActions([]);
  setChatBusy(true);

  try {
    const response = await fetch(WEB_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        session_id: webChatSession,
        stage: webChatStage,
        action,
        message
      })
    });
    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      if (result.reply) {
        appendChatMessage(result.reply);
        renderChatActions([
          { id: 'open_form', label: 'Quiero un diagnóstico', kind: 'form' },
          { id: 'whatsapp', label: 'Continuar en WhatsApp', kind: 'whatsapp' }
        ]);
        return;
      }
      throw new Error(result.error || 'chat_request_failed');
    }

    webChatStage = result.stage || webChatStage;
    if (result.topic) webChatTopic = result.topic;
    appendChatMessage(result.reply);
    renderChatActions(Array.isArray(result.actions) ? result.actions : []);
  } catch (error) {
    if (!webChatLog?.querySelector('[data-chat-fallback]')) {
      const fallback = document.createElement('div');
      fallback.dataset.chatFallback = 'true';
      fallback.className = 'web-chat-message is-assistant';
      fallback.innerHTML = '<span class="web-chat-avatar" aria-hidden="true">P</span><div><p>La orientación en línea no está disponible por un momento. Aún puedes continuar por WhatsApp o completar el diagnóstico.</p><small>PARMUX AI</small></div>';
      webChatLog?.append(fallback);
    }
    renderChatActions([
      { id: 'open_form', label: 'Quiero un diagnóstico', kind: 'form' },
      { id: 'whatsapp', label: 'Continuar en WhatsApp', kind: 'whatsapp' }
    ]);
  } finally {
    setChatBusy(false);
    webChatInput?.focus();
  }
}

function cleanRut(value) {
  return String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
}

function formatRut(value) {
  const clean = cleanRut(value).slice(0, 9);
  if (clean.length <= 1) return clean;
  const verifier = clean.slice(-1);
  const body = clean.slice(0, -1).replace(/^0+/, '') || '0';
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${verifier}`;
}

function isValidRut(value) {
  const clean = cleanRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const verifier = clean.slice(-1);
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return verifier === expected;
}

function updateRutValidity() {
  if (!(leadRut instanceof HTMLInputElement)) return;
  leadRut.value = formatRut(leadRut.value);
  const message = leadRut.value && !isValidRut(leadRut.value)
    ? 'Ingresa un RUT de empresa válido, incluido el dígito verificador.'
    : '';
  leadRut.setCustomValidity(message);
}

document.querySelectorAll('[data-open-web-chat]').forEach((button) => {
  button.addEventListener('click', () => {
    openDialog(webChatDialog);
    window.setTimeout(() => webChatInput?.focus(), 80);
  });
});

webChatActions?.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button[data-chat-action]');
  if (!(button instanceof HTMLButtonElement)) return;
  const action = button.dataset.chatAction || '';
  const kind = button.dataset.chatKind || 'reply';

  if (kind === 'form' || action === 'open_form') {
    openLeadForm(interestFromChat());
    return;
  }

  sendChatMessage({ action, label: button.textContent.trim() });
});

webChatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!(webChatInput instanceof HTMLTextAreaElement)) return;
  const message = webChatInput.value.trim();
  if (!message) return;
  webChatInput.value = '';
  sendChatMessage({ message });
});

webChatInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  webChatForm?.requestSubmit();
});

updateWhatsAppHandoff();

leadRut?.addEventListener('input', updateRutValidity);
leadRut?.addEventListener('blur', updateRutValidity);

document.querySelectorAll('[data-open-lead-form]').forEach((button) => {
  button.addEventListener('click', () => {
    openLeadForm(button.dataset.interest || 'Diagnóstico inicial');
  });
});

if (pageParams.get('diagnostico') === 'empresa') {
  window.requestAnimationFrame(() => openLeadForm('Diagnóstico inicial'));
}

[webChatDialog, leadDialog].forEach((dialog) => {
  dialog?.addEventListener('click', (event) => {
    if (!(dialog instanceof HTMLDialogElement) || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) dialog.close();
  });
});

leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!(leadForm instanceof HTMLFormElement)) return;

  const submitButton = leadForm.querySelector('.lead-submit');
  const formData = new FormData(leadForm);
  const honeypot = String(formData.get('_honey') || '').trim();

  if (honeypot) {
    leadForm.reset();
    leadDialog?.close();
    return;
  }

  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
    submitButton.firstChild.textContent = 'Enviando… ';
  }
  if (leadFormStatus) {
    leadFormStatus.textContent = 'Enviando la solicitud de forma segura…';
    leadFormStatus.className = 'form-status';
  }

  const payload = Object.fromEntries(formData.entries());
  payload._subject = `Nuevo diagnóstico PARMUX · ${payload.razon_social || 'Empresa'} · ${payload.interes || 'Consulta'}`;
  payload._replyto = payload.email;
  payload._template = 'table';
  payload._url = window.location.href;
  payload.origen = leadSource;
  payload.tipo_solicitud = 'Ficha de diagnóstico empresarial';

  try {
    const response = await fetch('https://formsubmit.co/ajax/negocios@parmux.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    const delivered = result.success === true || result.success === 'true';
    if (!response.ok || !delivered) throw new Error('form_delivery_failed');

    leadForm.reset();
    if (leadFormStatus) {
      const returnMessage = encodeURIComponent('Hola PARMUX AI. Ya completé y envié el diagnóstico empresarial. Quedo atento al siguiente paso.');
      leadFormStatus.innerHTML = `Solicitud enviada. El equipo de PARMUX la recibió. <a href="https://wa.me/${PARMUX_WHATSAPP}?text=${returnMessage}" target="_blank" rel="noreferrer">Volver a WhatsApp para continuar</a>.`;
      leadFormStatus.className = 'form-status is-success';
    }
  } catch (error) {
    if (leadFormStatus) {
      leadFormStatus.innerHTML = 'No pudimos enviar ahora. Puedes escribir directamente a <a href="mailto:negocios@parmux.com">negocios@parmux.com</a>.';
      leadFormStatus.className = 'form-status is-error';
    }
  } finally {
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
      submitButton.firstChild.textContent = 'Enviar solicitud ';
    }
  }
});
