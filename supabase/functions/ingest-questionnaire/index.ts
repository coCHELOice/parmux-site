import { createClient } from 'npm:@supabase/supabase-js@2';
import * as jose from 'npm:jose@6.2.10';

const TABLE = 'parmux_questionnaire_submissions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 96 * 1024;
const VERCEL_TEAM_SLUG = 'avenidalibertarias-projects';
const VERCEL_PROJECT = 'parmux-site';
const VERCEL_PROJECT_ID = 'prj_E4P7e5uTzKT3CRy5YXgdbHMZ2x3Z';
const VERCEL_TEAM_ID = 'team_XONRduQZeKrZ1BaidsmyRy9V';
const VERCEL_ISSUER = `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}`;
const VERCEL_GLOBAL_ISSUER = 'https://oidc.vercel.com';
const VERCEL_AUDIENCE = `https://vercel.com/${VERCEL_TEAM_SLUG}`;
const VERCEL_JWKS = jose.createRemoteJWKSet(
  new URL(`https://oidc.vercel.com/${VERCEL_TEAM_SLUG}/.well-known/jwks`),
);
const VERCEL_GLOBAL_JWKS = jose.createRemoteJWKSet(
  new URL('https://oidc.vercel.com/.well-known/jwks'),
);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function authorized(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7);
  for (const [issuer, jwks] of [
    [VERCEL_ISSUER, VERCEL_JWKS],
    [VERCEL_GLOBAL_ISSUER, VERCEL_GLOBAL_JWKS],
  ] as const) {
    try {
      const { payload } = await jose.jwtVerify(token, jwks, {
        issuer,
        audience: VERCEL_AUDIENCE,
      });
      const environment = String(payload.environment || '');
      const expectedSubject = `owner:${VERCEL_TEAM_SLUG}:project:${VERCEL_PROJECT}:environment:${environment}`;
      return (environment === 'preview' || environment === 'production')
        && payload.sub === expectedSubject
        && payload.owner === VERCEL_TEAM_SLUG
        && payload.owner_id === VERCEL_TEAM_ID
        && payload.project === VERCEL_PROJECT
        && payload.project_id === VERCEL_PROJECT_ID;
    } catch {
      // Try the other Vercel issuer mode before rejecting the request.
    }
  }
  return false;
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
