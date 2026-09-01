const {
  createCipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} = require('node:crypto');

const ACCESS_TOKEN_HASH = '4b3ba060403a4b21b68a89e0b3f638e1d918859f8a51e68ee990b3d71805b6db';
const ACCESS_EXPIRES_AT = Date.parse('2026-10-16T02:59:59.000Z');
const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const MAX_BACKUP_BYTES = 64 * 1024;
const FORM_EMAIL_ENDPOINT = 'https://formsubmit.co/ajax/negocios@parmux.com';
const FORM_TOKEN_ENDPOINT = 'https://formsubmit.co/ajax/cc6e1ab5ad4e5885441e159ec477ec97';
const FORM_PAGE_URL = 'https://parmux.com/triagevet/diagnostico';
const BACKUP_CONTEXT = 'parmux-triagevet-discovery-backup-v1';
const nativeFetch = globalThis.fetch.bind(globalThis);

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
  return String(header).split(';').reduce((cookies, pair) => {
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

function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function isSubmission(req, body) {
  return String(req.method || '').toUpperCase() === 'POST'
    && body
    && body.client_id === 'pet-house'
    && body.clinic_name === 'Pet House'
    && !(typeof body._honey === 'string' && body._honey.trim());
}

function encryptBackup(req, body) {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE] || '';
  if (!validToken(token)) throw new Error('backup_session_unavailable');

  const record = JSON.stringify({
    version: 1,
    capturedAt: new Date().toISOString(),
    payload: body,
  });
  if (Buffer.byteLength(record, 'utf8') > MAX_BACKUP_BYTES) {
    throw new Error('backup_body_too_large');
  }

  const key = createHash('sha256')
    .update(`${token}|${BACKUP_CONTEXT}`, 'utf8')
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(record, 'utf8'),
    cipher.final(),
  ]);
  const envelope = [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
  const submissionId = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
  const parts = envelope.match(/.{1,1400}/g) || [''];

  console.info(`[TRIAGEVET_DISCOVERY_BACKUP_BEGIN] id=${submissionId} parts=${parts.length}`);
  parts.forEach((data, index) => {
    console.info(
      `[TRIAGEVET_DISCOVERY_BACKUP_PART] id=${submissionId} part=${index + 1}/${parts.length} data=${data}`,
    );
  });
  console.info(`[TRIAGEVET_DISCOVERY_BACKUP_END] id=${submissionId}`);

  return submissionId;
}

function installFormDeliveryBridge() {
  if (globalThis.fetch.__parmuxTriageVetDeliveryBridge) return;

  const bridgedFetch = async (input, init = {}) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url;

    if (url !== FORM_EMAIL_ENDPOINT) return nativeFetch(input, init);

    let outbound = null;
    try {
      outbound = JSON.parse(String(init.body || ''));
    } catch {
      outbound = null;
    }

    if (outbound && typeof outbound === 'object' && !Array.isArray(outbound)) {
      delete outbound._captcha;
      outbound._url = FORM_PAGE_URL;
    }

    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set('Origin', 'https://parmux.com');
    headers.set('Referer', FORM_PAGE_URL);

    const response = await nativeFetch(FORM_TOKEN_ENDPOINT, {
      ...init,
      headers,
      body: outbound ? JSON.stringify(outbound) : init.body,
    });

    if (!response.ok) {
      const providerBody = await response.clone().text().catch(() => '');
      console.warn(
        `[TRIAGEVET_FORM_PROVIDER] status=${response.status} body=${providerBody
          .replace(/\s+/g, ' ')
          .slice(0, 300)}`,
      );
    }

    return response;
  };

  Object.defineProperty(bridgedFetch, '__parmuxTriageVetDeliveryBridge', {
    value: true,
  });
  globalThis.fetch = bridgedFetch;
}

async function invokeWithStoredFallback(entryHandler, req, res, submissionId) {
  const originalStatus = res.status;
  const originalJson = res.json;
  let pendingStatus = Number(res.statusCode) || 200;

  res.status = function patchedStatus(status) {
    pendingStatus = status;
    return res;
  };

  res.json = function patchedJson(payload) {
    if (
      pendingStatus === 502
      && payload
      && payload.error === 'delivery_unavailable'
    ) {
      console.warn(`[TRIAGEVET_DISCOVERY_DELIVERY_FALLBACK] id=${submissionId}`);
      originalStatus.call(res, 200);
      return originalJson.call(res, {
        ok: true,
        delivered: false,
        stored: true,
        submissionId,
      });
    }

    originalStatus.call(res, pendingStatus);
    return originalJson.call(res, payload);
  };

  try {
    return await entryHandler(req, res);
  } finally {
    res.status = originalStatus;
    res.json = originalJson;
  }
}

installFormDeliveryBridge();
const entryHandler = require('./triagevet-discovery-entry');

module.exports = async function handler(req, res) {
  const body = requestBody(req);
  if (!isSubmission(req, body)) return entryHandler(req, res);

  let submissionId;
  try {
    submissionId = encryptBackup(req, body);
  } catch (error) {
    console.error(`[TRIAGEVET_DISCOVERY_BACKUP_ERROR] ${error.message}`);
    return entryHandler(req, res);
  }

  return invokeWithStoredFallback(entryHandler, req, res, submissionId);
};
