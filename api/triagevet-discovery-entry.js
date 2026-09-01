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

function installTrustFooter(res) {
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (typeof body !== 'string' || !body.includes('</main>')) return originalSend(body);
    let output = body;
    if (!output.includes('/triagevet-trust.css')) {
      output = output.replace('</head>', '  <link rel="stylesheet" href="/triagevet-trust.css?v=1">\n</head>');
    }
    output = output.replace('</main>', `${trustFooter()}\n</main>`);
    return originalSend(output);
  };
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';

  if (method === 'GET' && access) {
    if (!validToken(access)) return unavailable(res);

    // SameSite=Lax allows a private link opened from email, WhatsApp or another
    // external app to establish its secure session on the immediate redirect.
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(access)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    res.setHeader('Set-Cookie', cookie);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive,nosnippet');
    res.setHeader('Location', '/triagevet/diagnostico');
    return res.status(302).end();
  }

  if (method === 'GET') installTrustFooter(res);
  return discoveryHandler(req, res);
};
