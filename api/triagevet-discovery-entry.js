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

function secureWelcome(res, cookie) {
  baseHeaders(res);
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta name="referrer" content="no-referrer">
  <title>Diagnóstico privado · Pet House × TriageVet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/triagevet-discovery.css">
</head>
<body>
  <main class="shell">
    <header class="top">
      <a class="brand" href="/"><span class="mark">P</span><span><strong>PARMUX</strong><small>TriageVet</small></span></a>
      <span class="badge">Acceso privado · Pet House</span>
    </header>

    <section class="intro">
      <p class="eyebrow">Pet House × TriageVet</p>
      <h1>Primero, confidencialidad y seguridad.</h1>
      <p class="lead">Antes de solicitar cualquier información sobre la operación de Pet House, queremos dejar explícito cómo protegemos este diagnóstico.</p>

      <div class="note">
        <strong>Información estrictamente confidencial</strong>
        <span>La información ingresada se utiliza únicamente para comprender la operación de la clínica y preparar una demostración y propuesta pertinentes. El acceso a este diagnóstico es privado y restringido.</span>
      </div>

      <div class="note">
        <strong>Transmisión cifrada y acceso protegido</strong>
        <span>La información se transmite mediante conexión cifrada HTTPS/TLS y el acceso utiliza una sesión segura con controles contra accesos no autorizados. El diagnóstico no es indexado públicamente.</span>
      </div>

      <div class="note">
        <strong>Sin datos identificables de pacientes</strong>
        <span>No solicitamos nombres, fichas clínicas, RUT, teléfonos, antecedentes clínicos identificables ni ningún otro dato personal de pacientes o tutores. Las respuestas pueden ser operacionales y aproximadas.</span>
      </div>

      <div class="facts">
        <span>Acceso privado</span>
        <span>HTTPS/TLS</span>
        <span>Sesión segura</span>
        <span>Confidencialidad</span>
        <span>Sin datos de pacientes</span>
      </div>

      <form action="/triagevet/diagnostico" method="get">
        <button class="primary" type="submit">Entendido · comenzar diagnóstico →</button>
      </form>
    </section>
  </main>
</body>
</html>`);
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';

  if (method === 'GET' && access) {
    if (!validToken(access)) return unavailable(res);

    // Lax is intentional: this link is normally opened from email, WhatsApp or
    // another messaging app. The token itself remains private, hashed server-side,
    // and the established session remains HttpOnly + Secure.
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(access)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    return secureWelcome(res, cookie);
  }

  return discoveryHandler(req, res);
};
