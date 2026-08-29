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
const whatsappDialog = document.querySelector('#whatsapp-dialog');
const leadDialog = document.querySelector('#lead-dialog');
const whatsappMessage = document.querySelector('#whatsapp-message');
const whatsappContinue = document.querySelector('#whatsapp-continue');
const leadForm = document.querySelector('#lead-form');
const leadInterest = document.querySelector('#lead-interest');
const leadFormStatus = document.querySelector('#lead-form-status');

function openDialog(dialog) {
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (!dialog.open) dialog.showModal();
}

function updateWhatsAppLink() {
  if (!(whatsappMessage instanceof HTMLTextAreaElement) || !(whatsappContinue instanceof HTMLAnchorElement)) return;
  const message = whatsappMessage.value.trim() || 'Hola PARMUX AI, quiero conversar sobre un proyecto.';
  whatsappContinue.href = `https://wa.me/${PARMUX_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

document.querySelectorAll('[data-open-whatsapp]').forEach((button) => {
  button.addEventListener('click', () => openDialog(whatsappDialog));
});

document.querySelectorAll('[data-whatsapp-topic]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-whatsapp-topic]').forEach((item) => item.classList.remove('is-selected'));
    button.classList.add('is-selected');
    if (whatsappMessage instanceof HTMLTextAreaElement) {
      whatsappMessage.value = `Hola PARMUX AI. ${button.dataset.whatsappTopic}`;
      whatsappMessage.focus();
      whatsappMessage.setSelectionRange(whatsappMessage.value.length, whatsappMessage.value.length);
    }
    updateWhatsAppLink();
  });
});

whatsappMessage?.addEventListener('input', updateWhatsAppLink);
whatsappContinue?.addEventListener('click', () => whatsappDialog?.close());
updateWhatsAppLink();

document.querySelectorAll('[data-open-lead-form]').forEach((button) => {
  button.addEventListener('click', () => {
    if (leadInterest instanceof HTMLSelectElement && button.dataset.interest) {
      leadInterest.value = button.dataset.interest;
    }
    if (leadFormStatus) {
      leadFormStatus.textContent = '';
      leadFormStatus.className = 'form-status';
    }
    openDialog(leadDialog);
  });
});

[whatsappDialog, leadDialog].forEach((dialog) => {
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
  payload._subject = `Nuevo contacto web PARMUX · ${payload.interes || 'Consulta'}`;
  payload._template = 'table';
  payload._url = window.location.href;
  payload.origen = 'Landing parmux.com';

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
      leadFormStatus.textContent = 'Solicitud enviada. El equipo de PARMUX la recibió y podrá responderte por email.';
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
