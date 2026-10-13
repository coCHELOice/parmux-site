'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const registry = require('../config/triagevet-clinics.json');

const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const CLIENT_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function createClinicResolver(entries) {
  if (!Array.isArray(entries)) throw new Error('invalid_clinic_registry');
  const ids = new Set();
  const hashes = new Set();
  const clinics = entries.map((entry) => {
    if (!entry || !CLIENT_ID_RE.test(entry.client_id || '')
      || typeof entry.clinic_name !== 'string'
      || entry.clinic_name !== entry.clinic_name.trim()
      || entry.clinic_name.length < 1 || entry.clinic_name.length > 160
      || /[\u0000-\u001f\u007f]/u.test(entry.clinic_name)
      || !/^[a-f0-9]{64}$/.test(entry.access_token_sha256 || '')
      || typeof entry.expires_at !== 'string' || !Number.isFinite(Date.parse(entry.expires_at))
      || new Date(entry.expires_at).toISOString() !== entry.expires_at
      || (entry.enabled !== undefined && typeof entry.enabled !== 'boolean')
      || ids.has(entry.client_id) || hashes.has(entry.access_token_sha256)) {
      throw new Error('invalid_clinic_registry');
    }
    ids.add(entry.client_id);
    hashes.add(entry.access_token_sha256);
    return Object.freeze({ ...entry });
  });

  return (token, now = Date.now()) => {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
    const tokenHash = hash(token);
    return clinics.find((clinic) => clinic.enabled !== false
      && now <= Date.parse(clinic.expires_at)
      && safeEqualHex(tokenHash, clinic.access_token_sha256)) || null;
  };
}

const resolveClinic = createClinicResolver(registry);

function requestToken(req) {
  const cookies = String(req.headers?.cookie || '').split(';');
  for (const pair of cookies) {
    const separator = pair.indexOf('=');
    if (separator < 1 || pair.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function csrfFor(token) {
  return createHash('sha256').update(`${token}|triagevet-discovery-v3`, 'utf8').digest('base64url');
}

function sameOrigin(req) {
  const origin = req.headers?.origin;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.host === host;
  } catch {
    return false;
  }
}

function authorizedSubmission(req, token = requestToken(req)) {
  const supplied = req.headers?.['x-triagevet-csrf'];
  return Boolean(resolveClinic(token)) && sameOrigin(req)
    && typeof supplied === 'string'
    && safeEqualHex(hash(supplied), hash(csrfFor(token)));
}

function sessionCookie(token, clinic) {
  const remaining = Math.max(0, Math.floor((Date.parse(clinic.expires_at) - Date.now()) / 1000));
  const maxAge = Math.min(SESSION_MAX_AGE, remaining);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  CLIENT_ID_RE,
  SESSION_COOKIE,
  authorizedSubmission,
  createClinicResolver,
  csrfFor,
  escapeHtml,
  requestToken,
  resolveClinic,
  sessionCookie,
};
