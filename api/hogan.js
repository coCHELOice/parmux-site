const { createHash, timingSafeEqual } = require('node:crypto');

const ACCESS_TOKEN_HASH = '0d2a0dd80f2bed4636025223ab361a1ade83b34594a897f8e09bb653a6fdf2d4';
const ACCESS_EXPIRES_AT = Date.parse('2026-09-15T03:59:59.000Z');
const SESSION_COOKIE = '__Host-parmux_hogan';
const SESSION_MAX_AGE = 60 * 60 * 12;
const MAX_BODY_BYTES = 32 * 1024;
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/negocios@parmux.com';

const FIELD_LIMITS = Object.freeze({
  farmacia: 120,
  responsable: 120,
  email: 254,
  canal_derivacion: 300,
  horarios: 1000,
  canales: 1000,
  faq_respuestas: 6000,
  limites: 4000,
  derivacion_inmediata: 4000,
  reglas_medicamentos: 6000,
  informacion_incierta: 2000,
  tono: 1000,
  responsable_derivaciones: 120,
  ejemplos_prueba: 6000,
  aprobacion: 20,
});

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

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, pair) => {
    const separator = pair.indexOf('=');
    if (separator < 1) return cookies;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = '';
    }
    return cookies;
  }, {});
}

function requestToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';
}

function csrfFor(token) {
  return createHash('sha256').update(`${token}|parmux-hogan-csrf-v1`, 'utf8').digest('base64url');
}

function setSecurityHeaders(res, contentType) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
}

function json(res, status, payload, extraHeaders = {}) {
  setSecurityHeaders(res, 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  return res.status(status).json(payload);
}

function html(res, status, body, extraHeaders = {}) {
  setSecurityHeaders(res, 'text/html; charset=utf-8');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  return res.status(status).send(body);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.host === host;
  } catch {
    return false;
  }
}

function readJsonBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error('body_too_large');
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new Error('invalid_content_type');
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string' && Buffer.byteLength(req.body, 'utf8') <= MAX_BODY_BYTES) {
    const parsed = JSON.parse(req.body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  throw new Error('invalid_body');
}

function normalizeSubmission(body) {
  const output = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!value || value.length > limit) throw new Error(`invalid_${field}`);
    output[field] = value;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(output.email)) throw new Error('invalid_email');
  if (output.aprobacion !== 'Confirmado') throw new Error('approval_required');
  if (typeof body._honey === 'string' && body._honey.trim()) throw new Error('honeypot');
  return output;
}

function accessShell() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <title>Acceso privado | PARMUX</title>
  <link rel="stylesheet" href="/campaign.css">
  <link rel="stylesheet" href="/hogan.css">
</head>
<body class="hogan-page hogan-access-page">
  <main class="hogan-access" aria-live="polite">
    <p class="dialog-eyebrow">PARMUX · Acceso privado</p>
    <h1 id="access-title">Verificando el enlace seguro…</h1>
    <p id="access-status">Este acceso está protegido y sólo funciona desde el enlace completo enviado por PARMUX.</p>
  </main>
  <script src="/hogan-access.js" defer></script>
</body>
</html>`;
}

function questionnaire(csrfToken) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta name="referrer" content="no-referrer">
  <meta name="hogan-csrf" content="${csrfToken}">
  <title>Cuestionario de configuración · Farmacia HOGAN | PARMUX</title>
  <meta name="description" content="Cuestionario privado para configurar el piloto de Farmacia HOGAN.">
  <link rel="stylesheet" href="/campaign.css">
  <link rel="stylesheet" href="/hogan.css">
</head>
<body class="hogan-page">
  <main class="hogan-shell">
    <a class="hogan-back" href="/">← PARMUX</a>
    <header class="hogan-hero">
      <p class="dialog-eyebrow">Configuración privada del piloto · Farmacia HOGAN</p>
      <h1>Definamos juntos una automatización segura.</h1>
      <p>Este formulario nos permite configurar respuestas únicamente con información y reglas aprobadas por HOGAN. Completarlo toma unos minutos y toda la coordinación puede hacerse por escrito.</p>
      <div class="hogan-private-note"><strong>Enlace privado protegido</strong><span>No incluyas datos personales, clínicos ni identificadores de pacientes.</span></div>
      <div class="hogan-pilot"><strong>Piloto de 30 días · $59.900 + IVA</strong><span>Sin permanencia · WhatsApp independiente · Sin integración inicial con inventario</span><span>Continuidad: $49.900 + IVA mensuales</span></div>
    </header>
    <form id="hogan-form" class="hogan-form" novalidate>
      <section><h2><span>01</span> Farmacia y responsable</h2><div class="hogan-grid">
        <label>Nombre de la farmacia<input name="farmacia" value="Farmacia HOGAN" maxlength="120" required></label>
        <label>Persona responsable<input name="responsable" autocomplete="name" maxlength="120" required></label>
        <label>Email para coordinación<input type="email" name="email" autocomplete="email" maxlength="254" required></label>
        <label>Canal escrito de derivaciones<input name="canal_derivacion" placeholder="Ej.: WhatsApp independiente o email" maxlength="300" required></label>
      </div></section>
      <section><h2><span>02</span> Atención y consultas</h2><div class="hogan-grid">
        <label>Horarios de atención<textarea name="horarios" rows="2" maxlength="1000" required></textarea></label>
        <label>Canales que atenderá el piloto<textarea name="canales" rows="2" placeholder="WhatsApp, web, etc." maxlength="1000" required></textarea></label>
        <label class="wide">Consultas frecuentes y respuesta autorizada<textarea name="faq_respuestas" rows="5" placeholder="Una consulta por línea, con la respuesta exacta que HOGAN aprueba." maxlength="6000" required></textarea></label>
      </div></section>
      <section><h2><span>03</span> Reglas y límites</h2><div class="hogan-grid">
        <label>¿Qué nunca debe afirmar o responder automáticamente?<textarea name="limites" rows="4" maxlength="4000" required></textarea></label>
        <label>Casos que deben derivarse inmediatamente<textarea name="derivacion_inmediata" rows="4" placeholder="Urgencias, reacciones adversas, dudas clínicas, reclamos…" maxlength="4000" required></textarea></label>
        <label class="wide">Medicamentos, recetas, disponibilidad y reservas<textarea name="reglas_medicamentos" rows="5" placeholder="Qué puede informar, qué debe confirmar una persona y cómo reservar." maxlength="6000" required></textarea></label>
        <label class="wide">Cómo tratar información incierta o no confirmada<textarea name="informacion_incierta" rows="3" maxlength="2000" required></textarea></label>
      </div></section>
      <section><h2><span>04</span> Voz y pruebas</h2><div class="hogan-grid">
        <label>Tono de comunicación<textarea name="tono" rows="3" placeholder="Ej.: cercano, claro, prudente, chileno…" maxlength="1000" required></textarea></label>
        <label>Responsable que revisa derivaciones<input name="responsable_derivaciones" maxlength="120" required></label>
        <label class="wide">Ejemplos reales para probar el sistema<textarea name="ejemplos_prueba" rows="5" placeholder="Incluye preguntas habituales y el resultado esperado. No incluyas datos personales de pacientes." maxlength="6000" required></textarea></label>
      </div></section>
      <label class="hogan-consent"><input type="checkbox" name="aprobacion" value="Confirmado" required><span>Confirmo que esta información será revisada y aprobada por HOGAN antes de activar el piloto. Entiendo que una respuesta incorrecta puede ser más grave que una respuesta tardía; los casos inciertos, regulados o que requieran criterio se derivarán a una persona. Esta automatización no reemplaza el inventario y una integración posterior se evaluará sólo si HOGAN la necesita.</span></label>
      <label class="form-honey" aria-hidden="true">Deja este campo vacío<input name="_honey" tabindex="-1" autocomplete="off"></label>
      <button class="dialog-primary" type="submit">Enviar configuración <span>→</span></button>
      <p id="hogan-status" class="form-status" role="status" aria-live="polite"></p>
    </form>
    <footer class="hogan-footer">PARMUX AI · Viña del Mar, Chile · <a href="mailto:negocios@parmux.com">negocios@parmux.com</a></footer>
  </main>
  <script src="/hogan.js" defer></script>
</body>
</html>`;
}

async function authorize(req, res, body) {
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!validToken(token)) return json(res, 404, { ok: false, error: 'not_available' });
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
  return json(res, 200, { ok: true }, { 'Set-Cookie': cookie });
}

async function submit(req, res, token, body) {
  const csrf = req.headers['x-hogan-csrf'];
  if (typeof csrf !== 'string' || !safeEqualHex(hash(csrf), hash(csrfFor(token)))) {
    return json(res, 403, { ok: false, error: 'invalid_request' });
  }

  let payload;
  try {
    payload = normalizeSubmission(body);
  } catch (error) {
    if (error.message === 'honeypot') return json(res, 200, { ok: true });
    return json(res, 400, { ok: false, error: 'invalid_form' });
  }

  const outbound = {
    ...payload,
    _subject: 'Configuración piloto Farmacia HOGAN',
    _replyto: payload.email,
    _captcha: 'false',
    _template: 'table',
    tipo_solicitud: 'Cuestionario protegido Farmacia HOGAN',
    origen: 'parmux.com/hogan',
  };

  try {
    const response = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(outbound),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    const delivered = result.success === true || result.success === 'true';
    if (!response.ok || !delivered) throw new Error('delivery_failed');
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 502, { ok: false, error: 'delivery_unavailable' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const token = requestToken(req);
    if (!validToken(token)) return html(res, 200, accessShell());
    const body = questionnaire(csrfFor(token));
    if (req.method === 'HEAD') {
      setSecurityHeaders(res, 'text/html; charset=utf-8');
      return res.status(200).end();
    }
    return html(res, 200, body);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'invalid_origin' });

  let body;
  try {
    body = readJsonBody(req);
  } catch (error) {
    return json(res, error.message === 'body_too_large' ? 413 : 400, { ok: false, error: 'invalid_request' });
  }

  if (body.action === 'authorize') return authorize(req, res, body);
  const token = requestToken(req);
  if (!validToken(token)) return json(res, 401, { ok: false, error: 'session_expired' });
  return submit(req, res, token, body);
};
