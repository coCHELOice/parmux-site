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
    target.style.transitionDelay = `${(index % 4) * 55}ms`;
    observer.observe(target);
  });
} else {
  revealTargets.forEach((target) => target.classList.add('is-visible'));
}
