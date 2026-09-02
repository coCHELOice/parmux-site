'use strict';

const {
  createCipheriv,
  createHash,
  randomBytes,
} = require('node:crypto');

const TABLE = 'parmux_questionnaire_submissions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_INGEST_URL = 'https://rqdmvbtoxxndhuuyrwnh.supabase.co/functions/v1/ingest-questionnaire';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function submissionId(data) {
  const value = String(data.submission_id || '').trim();
  if (!UUID_RE.test(value)) throw new Error('invalid_submission_id');
  return value.toLowerCase();
}

function ingestRequest(payload) {
  const body = JSON.stringify(payload);
  const token = requiredEnv('VERCEL_OIDC_TOKEN');
  return {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    url: String(process.env.SUPABASE_QUESTIONNAIRE_INGEST_URL || DEFAULT_INGEST_URL).trim(),
  };
}

async function persistPrimary(data, fetchImpl = globalThis.fetch) {
  const id = submissionId(data);
  const capturedAt = new Date().toISOString();
  const canonicalPayload = stableJson(data);
  const record = {
    id,
    client_id: data.client_id,
    clinic_name: data.clinic_name,
    schema_version: 1,
    payload: data,
    payload_sha256: sha256(canonicalPayload),
    contact_email: String(data.contact_email || '').toLowerCase(),
    status: 'received',
    email_status: 'pending',
    hetzner_backup_status: 'pending',
    received_at: capturedAt,
    updated_at: capturedAt,
  };

  const request = ingestRequest({ action: 'create', record });
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`supabase_insert_failed_${response.status}_${detail.slice(0, 120)}`);
  }

  return {
    id,
    capturedAt,
    payloadSha256: record.payload_sha256,
    record,
  };
}

async function updateDeliveryState(id, fields, fetchImpl = globalThis.fetch) {
  if (!UUID_RE.test(String(id))) throw new Error('invalid_submission_id');
  const allowed = ['email_status', 'hetzner_backup_status', 'status'];
  const patch = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
  patch.updated_at = new Date().toISOString();

  const request = ingestRequest({ action: 'update_delivery', id, patch });
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`supabase_update_failed_${response.status}`);
}

function backupKey() {
  const encoded = requiredEnv('HETZNER_BACKUP_ENCRYPTION_KEY');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('invalid_hetzner_backup_encryption_key');
  return key;
}

function encryptForHetzner(record) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', backupKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(record), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

async function replicateToHetzner(stored, fetchImpl = globalThis.fetch) {
  const url = String(process.env.HETZNER_QUESTIONNAIRE_BACKUP_URL || '').trim();
  const token = String(process.env.HETZNER_QUESTIONNAIRE_BACKUP_TOKEN || '').trim();
  const key = String(process.env.HETZNER_BACKUP_ENCRYPTION_KEY || '').trim();
  if (!url || !token || !key) return { status: 'not_configured' };
  if (!/^https:\/\//i.test(url)) throw new Error('hetzner_backup_requires_https');

  const envelope = {
    id: stored.id,
    client_id: stored.record.client_id,
    captured_at: stored.capturedAt,
    payload_sha256: stored.payloadSha256,
    ...encryptForHetzner(stored.record),
  };
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': stored.id,
    },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`hetzner_backup_failed_${response.status}`);
  return { status: 'stored' };
}

module.exports = {
  encryptForHetzner,
  ingestRequest,
  persistPrimary,
  replicateToHetzner,
  stableJson,
  submissionId,
  updateDeliveryState,
};
