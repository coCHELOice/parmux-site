const { createHash, timingSafeEqual } = require('node:crypto');

const TEST_SECRET_HASH = '34d17839a34a871c94026ef2b9fc9e67a5d8a03e0971a1862ebf7da9f7721e0a';
const TEST_EXPIRES_AT = Date.parse('2026-09-01T18:00:00.000Z');
const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const FORM_URL = 'https://parmux.com/triagevet/diagnostico';

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function validSecret(secret) {
  return typeof secret === 'string'
    && secret.length === 64
    && Date.now() <= TEST_EXPIRES_AT
    && safeEqualHex(hash(secret), TEST_SECRET_HASH);
}

function respond(res, status, payload) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  return res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  if (String(req.method || '').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const secret = typeof req.query?.key === 'string' ? req.query.key.trim() : '';
  const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';
  if (!validSecret(secret) || !/^[a-f0-9]{64}$/i.test(access)) {
    return respond(res, 404, { ok: false, error: 'not_found' });
  }

  const cookie = `${SESSION_COOKIE}=${access}`;
  const pageResponse = await fetch(`${FORM_URL}?start=1`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  const page = await pageResponse.text();
  const csrf = page.match(/<meta name="triagevet-csrf" content="([^"]+)">/)?.[1] || '';
  if (!pageResponse.ok || !csrf) {
    return respond(res, 502, {
      ok: false,
      stage: 'questionnaire',
      upstreamStatus: pageResponse.status,
    });
  }

  const stamp = new Date().toISOString();
  const payload = {
    clinic_name: 'Pet House',
    client_id: 'pet-house',
    channels: ['WhatsApp'],
    main_channel: 'WhatsApp',
    channel_friction: 'No estamos seguros',
    whatsapp_clinical: 'No actualmente',
    query_types: ['Solicitud de hora'],
    urgent_frequency: 'Muy pocas',
    initial_responder: 'PRUEBA TÉCNICA PARMUX',
    priorities: ['Mejorar trazabilidad'],
    top_impact: `Verificación técnica del flujo de envío seguro · ${stamp}`,
    contact_name: 'PRUEBA TÉCNICA PARMUX — NO CLIENTE',
    contact_role: 'Autoverificación de entrega',
    contact_email: 'negocios@parmux.com',
    consent: 'Confirmado',
    _honey: '',
  };

  const submitResponse = await fetch(FORM_URL, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://parmux.com',
      Referer: `${FORM_URL}?start=1`,
      'Content-Type': 'application/json',
      'X-TriageVet-CSRF': csrf,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const result = await submitResponse.json().catch(() => ({}));

  return respond(res, submitResponse.ok && result.ok === true ? 200 : 502, {
    ok: submitResponse.ok && result.ok === true,
    stage: 'submission',
    upstreamStatus: submitResponse.status,
    delivered: result.delivered !== false,
    stored: result.stored === true,
    submissionId: result.submissionId || null,
  });
};
