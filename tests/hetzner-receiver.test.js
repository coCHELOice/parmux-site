'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const token = 'test-backup-token-with-more-than-32-characters';
const id = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
let directory;
let child;

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'parmux-backup-'));
  child = spawn(process.execPath, ['infra/hetzner-questionnaire-backup/receiver.mjs'], {
    env: { ...process.env, PORT: '18787', STORAGE_DIR: directory, BACKUP_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('receiver_start_timeout')), 3000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('BACKUP_RECEIVER_READY')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', (code) => reject(new Error(`receiver_exited_${code}`)));
  });
});

after(async () => {
  child?.kill('SIGTERM');
  await rm(directory, { recursive: true, force: true });
});

test('receiver rejects unauthenticated writes and stores an idempotent encrypted envelope', async () => {
  const envelope = {
    id,
    client_id: 'pet-house',
    captured_at: '2026-09-02T19:00:00.000Z',
    payload_sha256: 'a'.repeat(64),
    algorithm: 'aes-256-gcm',
    iv: 'A'.repeat(16),
    tag: 'B'.repeat(22),
    ciphertext: 'encrypted_payload',
  };
  const denied = await fetch('http://127.0.0.1:18787/v1/submissions', { method: 'POST', body: JSON.stringify(envelope) });
  assert.equal(denied.status, 401);

  const send = () => fetch('http://127.0.0.1:18787/v1/submissions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': id },
    body: JSON.stringify(envelope),
  });
  assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 200);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, `${id}.json`), 'utf8')), envelope);
});
