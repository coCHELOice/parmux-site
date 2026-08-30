const crypto = require('node:crypto');

const ALLOWED_ORIGINS = new Set([
  'https://parmux.com',
  'https://www.parmux.com'
]);

const RUBROS = new Set([
  'Servicios profesionales',
  'Tecnología y software',
  'Comercio y e-commerce',
  'Industria y logística',
  'Construcción e inmobiliario',
  'Educación',
  'Turismo y hospitalidad',
  'Otro'
]);

const TAMANOS = new Set([
  '1–10 personas',
  '11–50 personas',
  '51–200 personas',
  '201–500 personas',
  'Más de 500 personas'
]);

const INTERESES = new Set([
  'Infraestructura y continuidad',
  'Integración de sistemas',
  'Automatización e IA aplicada',
  'Software a medida',
  'Diagnóstico inicial',
  'Otro desafío'
]);

const PLAZOS = new Set([
  'Lo antes posible',
  'Durante los próximos 30 días',
  'En 1–3 meses',
  'En 3–6 meses',
  'Solo estamos explorando'
]);

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.end(JSON.stringify(body));
}

function clean(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validRut(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (!/^\d{7,8}[0-9K]$/.test(normalized)) return false;

  const body = normalized.slice(0, -1);
  const verifier = normalized.slice(-1);
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

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return value.length >= 7 && value.length <= 30 && /^[+()\d\s.-]+$/.test(value);
}

function normalizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString().slice(0, 240) : '';
  } catch {
    return '';
  }
}

function normalizePayload(payload) {
  const data = {
    razonSocial: clean(payload.razon_social, 120),
    rutEmpresa: clean(payload.rut_empresa, 16),
    rubro: clean(payload.rubro, 80),
    tamanoEmpresa: clean(payload.tamano_empresa, 40),
    sitioWeb: normalizeUrl(clean(payload.sitio_web, 240)),
    nombreContacto: clean(payload.nombre_contacto, 120),
    cargo: clean(payload.cargo, 100),
    email: clean(payload.email, 254).toLowerCase(),
    telefono: clean(payload.telefono, 30),
    interes: clean(payload.interes, 80),
    plazo: clean(payload.plazo, 80),
    sistemasActuales: clean(payload.sistemas_actuales, 300),
    mensaje: clean(payload.mensaje, 2400),
    consentimiento: clean(payload.consentimiento, 20),
    origen: clean(payload.origen, 80),
    pagina: normalizeUrl(clean(payload._url, 500))
  };

  const valid =
    data.razonSocial.length >= 2 &&
    validRut(data.rutEmpresa) &&
    RUBROS.has(data.rubro) &&
    TAMANOS.has(data.tamanoEmpresa) &&
    data.nombreContacto.length >= 3 &&
    data.cargo.length >= 2 &&
    validEmail(data.email) &&
    validPhone(data.telefono) &&
    INTERESES.has(data.interes) &&
    PLAZOS.has(data.plazo) &&
    data.sistemasActuales.length >= 2 &&
    data.mensaje.length >= 40 &&
    data.consentimiento === 'Aceptado';

  return valid ? data : null;
}

function makeEmail(data) {
  const rows = [
    ['Razón social', data.razonSocial],
    ['RUT empresa', data.rutEmpresa],
    ['Rubro', data.rubro],
    ['Tamaño', data.tamanoEmpresa],
    ['Sitio web', data.sitioWeb || 'No informado'],
    ['Contacto', data.nombreContacto],
    ['Cargo', data.cargo],
    ['Email', data.email],
    ['Teléfono', data.telefono],
    ['Interés', data.interes],
    ['Plazo', data.plazo],
    ['Sistemas actuales', data.sistemasActuales],
    ['Origen', data.origen || 'Landing'],
    ['Página', data.pagina || 'https://parmux.com/']
  ];

  const htmlRows = rows
    .map(([label, value]) => `<tr><th align="left" style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(label)}</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(value)}</td></tr>`)
    .join('');
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join('\n');

  return {
    subject: `Nuevo diagnóstico PARMUX · ${data.razonSocial} · ${data.interes}`.slice(0, 180),
    html: `<h1>Nuevo diagnóstico empresarial</h1><table style="border-collapse:collapse">${htmlRows}</table><h2>Desafío y resultado esperado</h2><p style="white-space:pre-wrap">${escapeHtml(data.mensaje)}</p><p><small>Consentimiento de contacto: aceptado.</small></p>`,
    text: `Nuevo diagnóstico empresarial\n\n${textRows}\n\nDesafío y resultado esperado:\n${data.mensaje}\n\nConsentimiento de contacto: aceptado.`
  };
}

async function handler(request, response) {
  const requestId = crypto.randomUUID();

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { success: false, error: 'method_not_allowed', request_id: requestId });
  }

  const origin = String(request.headers.origin || '');
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json(response, 403, { success: false, error: 'origin_not_allowed', request_id: requestId });
  }

  const fetchSite = String(request.headers['sec-fetch-site'] || '');
  if (fetchSite && fetchSite !== 'same-origin') {
    return json(response, 403, { success: false, error: 'cross_site_request', request_id: requestId });
  }

  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return json(response, 415, { success: false, error: 'unsupported_media_type', request_id: requestId });
  }

  const contentLength = Number(request.headers['content-length'] || 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > 20000) {
    return json(response, 413, { success: false, error: 'invalid_request_size', request_id: requestId });
  }

  let payload = request.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return json(response, 400, { success: false, error: 'invalid_json', request_id: requestId });
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json(response, 400, { success: false, error: 'invalid_payload', request_id: requestId });
  }

  if (clean(payload._honey, 200)) {
    return json(response, 200, { success: true, request_id: requestId });
  }

  const data = normalizePayload(payload);
  if (!data) {
    return json(response, 422, { success: false, error: 'validation_failed', request_id: requestId });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const recipient = process.env.LEAD_NOTIFY_TO;
  const sender = process.env.LEAD_FROM;
  if (!accountId || !apiToken || !recipient || !sender) {
    console.error('diagnostico_configuration_missing', { requestId });
    return json(response, 503, { success: false, error: 'delivery_unavailable', request_id: requestId });
  }

  const email = makeEmail(data);
  let delivery;
  try {
    delivery = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: recipient,
        from: sender,
        subject: email.subject,
        html: email.html,
        text: email.text,
        reply_to: data.email
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    console.error('diagnostico_delivery_network_error', { requestId, name: error && error.name });
    return json(response, 502, { success: false, error: 'delivery_failed', request_id: requestId });
  }

  let deliveryBody = null;
  try {
    deliveryBody = await delivery.json();
  } catch {
    deliveryBody = null;
  }

  const accepted = delivery.ok && deliveryBody && deliveryBody.success === true;
  if (!accepted) {
    console.error('diagnostico_delivery_rejected', { requestId, status: delivery.status });
    return json(response, 502, { success: false, error: 'delivery_failed', request_id: requestId });
  }

  return json(response, 200, { success: true, request_id: requestId });
}

module.exports = handler;
module.exports._test = { validRut, normalizePayload, makeEmail };
