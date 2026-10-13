'use strict';

const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const {
  encryptForHetzner,
  ingestRequest,
  persistPrimary,
  replicateToHetzner,
  stableJson,
  submissionId,
  updateDeliveryState,
} = require('../api/lib/questionnaire-storage');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_QUESTIONNAIRE_INGEST_URL = 'https://example.supabase.co/functions/v1/ingest-questionnaire';
  process.env.VERCEL_OIDC_TOKEN = 'short-lived-vercel-oidc-token';
  process.env.HETZNER_QUESTIONNAIRE_BACKUP_URL = 'https://backup.parmux.test/submissions';
  process.env.HETZNER_QUESTIONNAIRE_BACKUP_TOKEN = 'backup-token';
  process.env.HETZNER_BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('stableJson is deterministic for object key order', () => {
  assert.equal(stableJson({ b: 2, a: [1, { d: 4, c: 3 }] }), stableJson({ a: [1, { c: 3, d: 4 }], b: 2 }));
});

test('submissionId accepts UUID and rejects arbitrary values', () => {
  assert.equal(submissionId({ submission_id: 'A42E36C1-B20F-4EE1-9F41-0AE18CC04D58' }), 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58');
  assert.throws(() => submissionId({ submission_id: 'not-an-id' }), /invalid_submission_id/);
});

test('ingestRequest authenticates with the short-lived Vercel OIDC token', async () => {
  const request = await ingestRequest({ action: 'test' });
  assert.equal(request.headers.Authorization, `Bearer ${process.env.VERCEL_OIDC_TOKEN}`);
  assert.equal(request.url, process.env.SUPABASE_QUESTIONNAIRE_INGEST_URL);
  assert.ok(!JSON.stringify(request).includes('service_role'));
});

test('ingestRequest uses the fixed public Supabase endpoint when no override exists', async () => {
  delete process.env.SUPABASE_QUESTIONNAIRE_INGEST_URL;
  const request = await ingestRequest({ action: 'test' });
  assert.equal(request.url, 'https://rqdmvbtoxxndhuuyrwnh.supabase.co/functions/v1/ingest-questionnaire');
});

test('persistPrimary performs an idempotent server-side Supabase insert', async () => {
  let request;
  const fakeFetch = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 201, text: async () => '' };
  };
  const stored = await persistPrimary({
    submission_id: 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58',
    client_id: 'pet-house',
    clinic_name: 'Pet House',
    contact_email: 'Dra@example.com',
  }, fakeFetch);

  assert.equal(stored.id, 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58');
  assert.equal(request.url, process.env.SUPABASE_QUESTIONNAIRE_INGEST_URL);
  assert.equal(JSON.parse(request.init.body).action, 'create');
  assert.equal(JSON.parse(request.init.body).record.contact_email, 'dra@example.com');
});

test('Hetzner replica contains ciphertext, not questionnaire plaintext', async () => {
  const record = { id: 'x', payload: { private_answer: 'contenido sensible' } };
  const encrypted = encryptForHetzner(record);
  assert.equal(encrypted.algorithm, 'aes-256-gcm');
  assert.ok(!JSON.stringify(encrypted).includes('contenido sensible'));

  let body;
  const result = await replicateToHetzner({
    id: 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58',
    capturedAt: '2026-09-02T19:00:00.000Z',
    payloadSha256: 'a'.repeat(64),
    record: { client_id: 'pet-house', payload: record.payload },
  }, async (_url, init) => {
    body = init.body;
    return { ok: true, status: 201 };
  });
  assert.equal(result.status, 'stored');
  assert.ok(!body.includes('contenido sensible'));
});

test('delivery updates carry clinic identity and reject invalid identities before sending', async () => {
  const id = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  let body;
  const fakeFetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200 };
  };
  await updateDeliveryState(id, 'clinica-demo', { email_status: 'delivered', client_id: 'other-clinic' }, fakeFetch);
  assert.equal(body.client_id, 'clinica-demo');
  assert.equal(body.patch.client_id, undefined);
  assert.equal(body.patch.email_status, 'delivered');
  await assert.rejects(updateDeliveryState(id, '../invalid', {}, fakeFetch), /invalid_client_id/);
});

test('storage preserves a conflict code and recognizes the receipt for an already saved response', async () => {
  const data = {
    submission_id: 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58',
    client_id: 'clinica-demo', clinic_name: 'Clínica Demo', contact_email: 'test@example.test',
  };
  await assert.rejects(persistPrimary(data, async () => ({ ok: false, status: 409 })), { code: 'submission_conflict' });
  const receipt = await persistPrimary(data, async () => ({
    ok: true, status: 200,
    json: async () => ({ already_stored: true, email_status: 'delivered', hetzner_backup_status: 'failed' }),
  }));
  assert.equal(receipt.alreadyStored, true);
  assert.equal(receipt.emailStatus, 'delivered');
  assert.equal(receipt.backupStatus, 'failed');
});
