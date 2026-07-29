(function () {
  const header = document.querySelector("[data-elevate]");
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  function setHeaderState() {
    header?.classList.toggle("is-scrolled", window.scrollY > 14);
  }

  setHeaderState();
  window.addEventListener("scroll", setHeaderState, { passive: true });

  navToggle?.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navLinks?.classList.toggle("is-open", !isOpen);
    header?.classList.toggle("is-open", !isOpen);
    document.body.classList.toggle("nav-open", !isOpen);
  });

  navLinks?.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) return;
    navToggle?.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("is-open");
    header?.classList.remove("is-open");
    document.body.classList.remove("nav-open");
  });

  const revealEls = Array.from(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -70px 0px" }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  const controls = Array.from(document.querySelectorAll("[data-ai-control]"));
  const optimize = document.querySelector("[data-ai-optimize]");
  const state = document.querySelector("[data-control-state]");
  const insight = document.querySelector("[data-control-insight]");
  const flowBadge = document.querySelector("[data-flow-badge]");
  const chartMain = document.querySelector("[data-chart-main]");
  const chartSecondary = document.querySelector("[data-chart-secondary]");
  const metrics = {
    velocity: document.querySelector('[data-dashboard-metric="velocity"]'),
    ai: document.querySelector('[data-dashboard-metric="ai"]'),
    risk: document.querySelector('[data-dashboard-metric="risk"]'),
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function value(name) {
    const input = document.querySelector(`[data-ai-control="${name}"]`);
    return input ? Number(input.value) : 0;
  }

  function setValue(name, nextValue) {
    const input = document.querySelector(`[data-ai-control="${name}"]`);
    if (input) input.value = String(Math.round(nextValue));
  }

  function buildPath(automation, load, confidence, velocity) {
    const y1 = clamp(132 - automation * 0.62, 28, 132);
    const y2 = clamp(136 - load * 0.72, 24, 136);
    const y3 = clamp(134 - confidence * 0.84, 18, 134);
    const y4 = clamp(138 - velocity * 0.78, 18, 138);
    return `M8 ${Math.round(y1)} C72 ${Math.round(y2)} 104 ${Math.round(y1 + 12)} 168 ${Math.round(y3)} S270 ${Math.round(y2 - 10)} 334 ${Math.round(y4)} 376 ${Math.round(y3 + 12)} 412 ${Math.round(y4 - 6)}`;
  }

  function updateBoard() {
    if (controls.length === 0) return;

    const automation = value("automation");
    const load = value("load");
    const confidence = value("confidence");
    const velocity = clamp(Math.round(automation * 0.48 + load * 0.28 + confidence * 0.24), 0, 100);
    const ai = clamp(Math.round(confidence * 0.72 + automation * 0.2 + (100 - load) * 0.08), 0, 99);
    const riskScore = clamp(Math.round(100 - confidence * 0.58 - automation * 0.24 + load * 0.38), 0, 100);
    const risk = riskScore > 62 ? "Alto" : riskScore > 38 ? "Medio" : "Bajo";

    controls.forEach((input) => {
      const readout = document.querySelector(`[data-control-readout="${input.dataset.aiControl}"]`);
      if (readout) readout.textContent = `${input.value}%`;
    });

    if (chartMain) chartMain.setAttribute("d", buildPath(automation, load, confidence, velocity));
    if (chartSecondary) {
      chartSecondary.setAttribute(
        "d",
        buildPath(clamp(automation - 14, 0, 100), clamp(load + 10, 0, 100), clamp(confidence - 8, 0, 100), clamp(velocity - 10, 0, 100))
      );
    }

    if (metrics.velocity) metrics.velocity.textContent = `${velocity}%`;
    if (metrics.ai) metrics.ai.textContent = `${ai}%`;
    if (metrics.risk) metrics.risk.textContent = risk;
    if (flowBadge) flowBadge.textContent = `Auto ${automation}%`;
    if (state) state.textContent = risk === "Alto" ? "Revisar" : automation > 84 && confidence > 84 ? "Autonomo" : "Asistido";
    if (insight) {
      insight.textContent =
        risk === "Alto"
          ? "La mesa recomienda reducir demanda o elevar confianza antes de aumentar autonomia."
          : automation > 84
            ? "La operacion queda en modo autonomo con seguimiento ejecutivo activo."
            : "El tablero recalcula flujo, riesgo y carga al mover cada variable.";
    }
  }

  controls.forEach((input) => input.addEventListener("input", updateBoard));

  optimize?.addEventListener("click", () => {
    const start = {
      automation: value("automation"),
      load: value("load"),
      confidence: value("confidence"),
    };
    const target = { automation: 88, load: 42, confidence: 92 };
    const duration = 700;
    const startedAt = performance.now();

    function tick(now) {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      Object.keys(target).forEach((name) => {
        setValue(name, start[name] + (target[name] - start[name]) * eased);
      });
      updateBoard();
      if (progress < 1) window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
  });

  updateBoard();

  const hero = document.querySelector(".hero");
  const kineticObject = document.querySelector(".kinetic-object");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (hero && kineticObject && !reducedMotion) {
    hero.addEventListener(
      "pointermove",
      (event) => {
        const bounds = hero.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
        kineticObject.style.setProperty("--tilt-x", `${clamp(y * -5, -5, 5).toFixed(2)}deg`);
        kineticObject.style.setProperty("--tilt-y", `${clamp(x * 7, -7, 7).toFixed(2)}deg`);
      },
      { passive: true }
    );

    hero.addEventListener("pointerleave", () => {
      kineticObject.style.setProperty("--tilt-x", "0deg");
      kineticObject.style.setProperty("--tilt-y", "0deg");
    });
  }
})();
