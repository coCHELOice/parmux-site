import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const STORAGE_DIR = process.env.STORAGE_DIR || '/data/submissions';
const TOKEN = process.env.BACKUP_TOKEN || '';
const MAX_BYTES = 128 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function equalSecret(left, right) {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function validEnvelope(value) {
  return value
    && UUID_RE.test(String(value.id || ''))
    && value.algorithm === 'aes-256-gcm'
    && /^[A-Za-z0-9_-]{16}$/.test(String(value.iv || ''))
    && /^[A-Za-z0-9_-]{22}$/.test(String(value.tag || ''))
    && /^[A-Za-z0-9_-]+$/.test(String(value.ciphertext || ''))
    && /^[a-f0-9]{64}$/.test(String(value.payload_sha256 || ''));
}

if (TOKEN.length < 32) throw new Error('BACKUP_TOKEN must contain at least 32 characters');
await mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    try {
      await stat(STORAGE_DIR);
      return send(res, 200, { ok: true });
    } catch {
      return send(res, 503, { ok: false });
    }
  }
  if (req.method !== 'POST' || req.url !== '/v1/submissions') {
    return send(res, 404, { ok: false, error: 'not_found' });
  }

  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !equalSecret(authorization.slice(7), TOKEN)) {
    return send(res, 401, { ok: false, error: 'unauthorized' });
  }

  try {
    const raw = await readBody(req);
    const envelope = JSON.parse(raw);
    if (!validEnvelope(envelope) || req.headers['idempotency-key'] !== envelope.id) {
      return send(res, 400, { ok: false, error: 'invalid_envelope' });
    }

    const destination = path.join(STORAGE_DIR, `${envelope.id}.json`);
    try {
      const file = await open(destination, 'wx', 0o600);
      await file.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8');
      await file.sync();
      await file.close();
      return send(res, 201, { ok: true, stored: true, id: envelope.id });
    } catch (error) {
      if (error.code === 'EEXIST') return send(res, 200, { ok: true, stored: true, duplicate: true, id: envelope.id });
      throw error;
    }
  } catch (error) {
    if (error.message === 'body_too_large') return send(res, 413, { ok: false, error: 'body_too_large' });
    console.error(`[BACKUP_RECEIVER] ${String(error.message || error).slice(0, 160)}`);
    return send(res, 500, { ok: false, error: 'storage_unavailable' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[BACKUP_RECEIVER_READY] port=${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
