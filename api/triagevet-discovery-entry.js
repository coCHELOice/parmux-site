const { createHash, timingSafeEqual } = require('node:crypto');
const discoveryHandler = require('./triagevet-discovery-v3');

const ACCESS_TOKEN_HASH = '4b3ba060403a4b21b68a89e0b3f638e1d918859f8a51e68ee990b3d71805b6db';
const ACCESS_EXPIRES_AT = Date.parse('2026-10-16T02:59:59.000Z');
const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function validToken(token) {
  return typeof token === 'string'
    && token.length === 64
    && Date.now() <= ACCESS_EXPIRES_AT
    && safeEqualHex(hash(token), ACCESS_TOKEN_HASH);
}

function baseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
}

function unavailable(res) {
  baseHeaders(res);
  return res.status(404).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <title>Enlace no disponible | PARMUX</title>
  <link rel="stylesheet" href="/triagevet-discovery.css">
</head>
<body>
  <main class="shell">
    <section class="intro">
      <p class="eyebrow">PARMUX · Acceso privado</p>
      <h1>Este enlace privado no está disponible.</h1>
      <p class="lead">Si recibiste este acceso directamente de PARMUX, vuelve a abrir el enlace completo o responde al correo de contacto.</p>
    </section>
  </main>
</body>
</html>`);
}

function trustFooter() {
  return `<footer class="trust-footer" aria-label="Seguridad y tecnologías PARMUX">
    <div class="trust-footer__row">
      <div class="trust-footer__copy">
        <strong>Seguridad y confidencialidad</strong>
        <span>Acceso privado · conexión cifrada HTTPS/TLS · sesión segura · diagnóstico no indexado. La información se utiliza únicamente para esta evaluación y no solicitamos datos identificables de pacientes.</span>
      </div>
      <div class="trust-footer__tech">
        <p class="trust-footer__label">Tecnologías utilizadas en nuestra infraestructura</p>
        <div class="trust-footer__seals" aria-label="Infraestructura tecnológica">
          <span class="tech-seal"><img src="/assets/tech/cloudflare.svg" alt="Cloudflare"><span>Cloudflare</span></span>
          <span class="tech-seal"><img src="/assets/tech/google-cloud.svg" alt="Google Cloud"><span>Google Cloud</span></span>
          <span class="tech-seal"><img src="/assets/tech/vercel.svg" alt="Vercel"><span>Vercel</span></span>
          <span class="tech-seal"><img src="/assets/tech/supabase.svg" alt="Supabase"><span>Supabase</span></span>
          <span class="tech-seal"><img src="/assets/tech/meta.svg" alt="Meta"><span>Meta</span></span>
        </div>
      </div>
    </div>
  </footer>`;
}

function welcomePage(res, cookie) {
  baseHeaders(res);
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta name="referrer" content="no-referrer">
  <title>Diagnóstico clínico digital · Pet House × TriageVet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/triagevet-discovery.css">
  <link rel="stylesheet" href="/triagevet-trust.css?v=3">
</head>
<body>
  <main class="shell">
    <header class="top">
      <a class="brand" href="/"><span class="mark">P</span><span><strong>PARMUX</strong><small>TriageVet</small></span></a>
      <span class="badge">Diagnóstico privado · Pet House</span>
    </header>

    <section class="intro" id="intro">
      <p class="eyebrow">Pet House × TriageVet</p>
      <h1>Antes de mostrar una solución, queremos entender cómo funciona su clínica.</h1>
      <p class="lead">Cada clínica organiza de manera distinta sus consultas, agenda, WhatsApp y equipo. Este diagnóstico permite preparar una demostración centrada sólo en aquello que pueda aportar valor.</p>
      <div class="facts"><span>5–8 minutos</span><span>Respuestas aproximadas están bien</span><span>Sin datos de pacientes</span></div>
      <div class="note"><strong>No buscamos reemplazar herramientas que ya funcionan.</strong><span>Primero reconstruimos el recorrido clínico actual; después proponemos mejoras progresivas y específicas.</span></div>
      <form action="/triagevet/diagnostico" method="get">
        <input type="hidden" name="start" value="1">
        <button class="primary" type="submit">Comenzar →</button>
      </form>
      ${trustFooter()}
    </section>
  </main>
</body>
</html>`);
}

function prepareQuestionnaire(res, startImmediately) {
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (
      typeof body !== 'string'
      || !body.includes('id="intro"')
      || !body.includes('id="workspace"')
    ) {
      return originalSend(body);
    }

    let output = body;
    if (!output.includes('/triagevet-trust.css')) {
      output = output.replace(
        '</head>',
        '  <link rel="stylesheet" href="/triagevet-trust.css?v=3">\n</head>',
      );
    }

    const introEnd = '  </section>\n\n  <div class="workspace"';
    if (output.includes(introEnd) && !output.includes('class="trust-footer"')) {
      output = output.replace(
        introEnd,
        `${trustFooter()}\n  </section>\n\n  <div class="workspace"`,
      );
    }

    if (startImmediately) {
      output = output
        .replace(
          '<section class="intro" id="intro">',
          '<section class="intro" id="intro" hidden>',
        )
        .replace(
          '<div class="workspace" id="workspace" hidden>',
          '<div class="workspace" id="workspace">',
        );
    }

    return originalSend(output);
  };
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';

  if (method === 'GET' && access) {
    if (!validToken(access)) return unavailable(res);

    // SameSite=Lax allows a private link opened from email, WhatsApp or another
    // external app to establish its secure session without losing the cover page.
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(access)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    return welcomePage(res, cookie);
  }

  if (method === 'GET') {
    const startImmediately = req.query?.start === '1';
    prepareQuestionnaire(res, startImmediately);
  }
  return discoveryHandler(req, res);
};
