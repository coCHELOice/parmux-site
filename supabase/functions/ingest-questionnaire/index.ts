import { createClient } from 'npm:@supabase/supabase-js@2';

const TABLE = 'parmux_questionnaire_submissions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 96 * 1024;
const INGEST_TOKEN_SHA256 = '601614b8b52d6bdc2153d70624e57f106006fa6adad03a93866403a59c0caaaa';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function authorized(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(authorization.slice(7)),
  );
  return constantTimeEqual(bytesToHex(digest), INGEST_TOKEN_SHA256);
}

function validCreate(record: Record<string, unknown>) {
  return UUID_RE.test(String(record.id || ''))
    && record.client_id === 'pet-house'
    && record.clinic_name === 'Pet House'
    && typeof record.payload === 'object'
    && /^[a-f0-9]{64}$/.test(String(record.payload_sha256 || ''))
    && typeof record.contact_email === 'string';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json(413, { ok: false, error: 'body_too_large' });

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'body_too_large' });
  }
  if (!(await authorized(req))) return json(401, { ok: false, error: 'unauthorized' });

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  if (input.action === 'create') {
    const record = input.record as Record<string, unknown>;
    if (!record || !validCreate(record)) return json(400, { ok: false, error: 'invalid_record' });
    const { error } = await supabase.from(TABLE).upsert(record, {
      onConflict: 'id',
      ignoreDuplicates: true,
    });
    if (error) {
      console.error(`[QUESTIONNAIRE_INGEST_CREATE] ${error.code}`);
      return json(503, { ok: false, error: 'storage_unavailable' });
    }
    return json(200, { ok: true, id: record.id });
  }

  if (input.action === 'update_delivery') {
    const id = String(input.id || '');
    const candidate = (input.patch || {}) as Record<string, unknown>;
    if (!UUID_RE.test(id)) return json(400, { ok: false, error: 'invalid_id' });
    const allowed = ['email_status', 'hetzner_backup_status', 'status', 'updated_at'];
    const patch = Object.fromEntries(Object.entries(candidate).filter(([key]) => allowed.includes(key)));
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
    if (error) {
      console.error(`[QUESTIONNAIRE_INGEST_UPDATE] ${error.code}`);
      return json(503, { ok: false, error: 'storage_unavailable' });
    }
    return json(200, { ok: true, id });
  }

  return json(400, { ok: false, error: 'invalid_action' });
});
