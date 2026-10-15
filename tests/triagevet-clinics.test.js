'use strict';

const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire, stripTypeScriptTypes } = require('node:module');
const storage = require('../api/lib/questionnaire-storage');
const notification = require('../api/lib/questionnaire-notification');
const { browser } = require('./helpers/triagevet-browser.cjs');

const root = path.resolve(__dirname, '..');
const originalEnv = { ...process.env };
const legacyToken = '1'.repeat(64); // Offline fixtures: never valid production links.
const clinicToken = '2'.repeat(64);
const expiredToken = '3'.repeat(64);
const disabledToken = '4'.repeat(64);
const clinic = { client_id: 'clinica-demo', clinic_name: 'Clínica Demo' };
const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const entry = (token, identity, extra = {}) => ({
  ...identity, access_token_sha256: hash(token), expires_at: '2099-01-01T00:00:00.000Z', ...extra,
});
const fixtureRegistry = [
  entry(legacyToken, { client_id: 'pet-house', clinic_name: 'Pet House' }),
  entry(clinicToken, clinic),
  entry(expiredToken, { client_id: 'expired-clinic', clinic_name: 'Expired Clinic' }, { expires_at: '2020-01-01T00:00:00.000Z' }),
  entry(disabledToken, { client_id: 'disabled-clinic', clinic_name: 'Disabled Clinic' }, { enabled: false }),
];
const quietConsole = { log() {}, info() {}, warn() {}, error() {} };

function load(file, overrides = {}, globals = {}) {
  const filename = path.join(root, file);
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : realRequire(name),
    Buffer, URL, Headers, console: quietConsole, fetch: async () => { throw new Error('network_forbidden'); },
    ...globals,
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return module.exports;
}

function makeAccess(entries = fixtureRegistry) {
  return load('api/lib/triagevet-access.js', { '../config/triagevet-clinics.json': entries });
}

function response() {
  return {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; },
  };
}

function makeEdge() {
  const rows = new Map();
  let handler;
  class Query {
    constructor(operation = 'select', patch = {}) { this.operation = operation; this.patch = patch; this.filters = []; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    select() { return this; }
    async maybeSingle() {
      const record = [...rows.values()].find((row) => this.filters.every(([key, value]) => row[key] === value));
      if (!record) return { data: null, error: null };
      if (this.operation === 'update') Object.assign(record, this.patch);
      return { data: { ...record }, error: null };
    }
  }
  const database = {
    from(table) {
      assert.equal(table, 'parmux_questionnaire_submissions');
      return {
        upsert(record, options) {
          assert.equal(options.ignoreDuplicates, true);
          const inserted = !rows.has(record.id);
          if (inserted) rows.set(record.id, JSON.parse(JSON.stringify(record)));
          return {
            select() { return this; },
            async maybeSingle() { return { data: inserted ? { id: record.id } : null, error: null }; },
          };
        },
        select: () => new Query(),
        update: (patch) => new Query('update', patch),
      };
    },
  };
  const file = path.join(root, 'supabase/functions/ingest-questionnaire/index.ts');
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '');
  source = stripTypeScriptTypes(source);
  const context = vm.createContext({
    createClient: () => database,
    jose: {
      createRemoteJWKSet() {},
      async jwtVerify(token) {
        if (token !== 'offline-oidc') throw new Error('unauthorized');
        return { payload: {
          environment: 'production', owner: 'avenidalibertarias-projects',
          owner_id: 'team_XONRduQZeKrZ1BaidsmyRy9V', project: 'parmux-site',
          project_id: 'prj_E4P7e5uTzKT3CRy5YXgdbHMZ2x3Z',
          sub: 'owner:avenidalibertarias-projects:project:parmux-site:environment:production',
        } };
      },
    },
    Deno: { env: { get: () => 'offline-only' }, serve(fn) { handler = fn; } },
    Response, TextEncoder, URL, console: quietConsole,
  });
  vm.runInContext(source, context, { filename: file });
  const call = (body, token = 'offline-oidc') => handler(new Request('https://edge.example.test', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { rows, call };
}

function makeApp() {
  const access = makeAccess();
  const edge = makeEdge();
  const emails = [];
  const backups = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url === process.env.SUPABASE_QUESTIONNAIRE_INGEST_URL) return edge.call(body);
    if (url === process.env.HETZNER_QUESTIONNAIRE_BACKUP_URL) {
      backups.push(body);
      return { ok: true, status: 201 };
    }
    if (url === 'https://api.resend.com/emails') {
      emails.push(body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: `offline-email-${emails.length}` }) };
    }
    throw new Error('unexpected_outbound_request');
  };
  const core = load('api/triagevet-discovery-v3.js', {
    './lib/triagevet-access': access,
    './lib/questionnaire-storage': {
      persistPrimary: (data) => storage.persistPrimary(data, fetchImpl),
      replicateToHetzner: (stored) => storage.replicateToHetzner(stored, fetchImpl),
      updateDeliveryState: (id, clientId, patch) => storage.updateDeliveryState(id, clientId, patch, fetchImpl),
    },
    './lib/questionnaire-notification': { deliverNotification: (data) => notification.deliverNotification(data, fetchImpl) },
  });
  const entryHandler = load('api/triagevet-discovery-entry.js', {
    './lib/triagevet-access': access, './triagevet-discovery-v3': core,
  });
  const safe = load('api/triagevet-discovery-safe.js', {
    './lib/triagevet-access': access, './triagevet-discovery-entry': entryHandler,
  }, { fetch: fetchImpl });
  const run = async (method, token, body, headers = {}, query = {}) => {
    const req = {
      method, query, body,
      headers: {
        cookie: `${access.SESSION_COOKIE}=${token}`, host: 'parmux.com', origin: 'https://parmux.com',
        'content-type': 'application/json', 'x-triagevet-csrf': access.csrfFor(token), ...headers,
      },
    };
    const res = response();
    await safe(req, res);
    return res;
  };
  return { ...edge, access, emails, backups, run };
}

function sample(identity = clinic, id = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58') {
  return {
    ...identity, submission_id: id, channels: ['Email'], main_channel: 'Email',
    whatsapp_clinical: 'No actualmente', query_types: ['Horarios'], urgent_frequency: 'No',
    initial_responder: 'PRUEBA LOCAL', priorities: ['Mejorar trazabilidad'], top_impact: 'PRUEBA LOCAL',
    contact_name: 'PRUEBA LOCAL', contact_email: 'test@example.test', consent: 'Confirmado',
  };
}

beforeEach(() => {
  process.env = { ...originalEnv, VERCEL_OIDC_TOKEN: 'offline-oidc',
    SUPABASE_QUESTIONNAIRE_INGEST_URL: 'https://edge.example.test/functions/v1/ingest-questionnaire',
    HETZNER_QUESTIONNAIRE_BACKUP_URL: 'https://backup.example.test/v1/submissions',
    HETZNER_QUESTIONNAIRE_BACKUP_TOKEN: 'offline-backup-token',
    HETZNER_BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), RESEND_API_KEY: 'offline-resend-key',
    QUESTIONNAIRE_NOTIFICATION_TO: 'negocios@parmux.com', QUESTIONNAIRE_NOTIFICATION_FROM: 'PARMUX <test@example.test>',
  };
});
afterEach(() => { process.env = { ...originalEnv }; });

test('production registry preserves Pet House access with the authorized November expiration', () => {
  const registry = require('../api/config/triagevet-clinics.json');
  assert.equal(registry.length, 1);
  assert.equal(registry[0].client_id, 'pet-house');
  assert.equal(registry[0].clinic_name, 'Pet House');
  assert.equal(registry[0].expires_at, '2026-11-30T02:59:59.000Z');
  assert.equal(registry[0].access_token_sha256, '4b3ba060403a4b21b68a89e0b3f638e1d918859f8a51e68ee990b3d71805b6db');
  assert.equal(registry[0].enabled, true);
  assert.ok(!JSON.stringify(registry).includes(legacyToken));
});

test('Pet House stays available for 45 days and through November 29 in Santiago', () => {
  const clinic = require('../api/config/triagevet-clinics.json')[0];
  const expires = Date.parse(clinic.expires_at);
  const after45Days = Date.parse('2026-10-15T20:28:00.000Z') + 45 * 24 * 60 * 60 * 1000;
  const resolve = makeAccess().createClinicResolver([
    { ...clinic, access_token_sha256: hash(legacyToken) },
  ]);
  assert.equal(resolve(legacyToken, after45Days).client_id, 'pet-house');
  assert.equal(resolve(legacyToken, expires).client_id, 'pet-house');
  assert.equal(resolve(legacyToken, expires + 1), null);
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  assert.equal(local.format(new Date(expires)), '2026-11-29 23:59:59');
});

test('registry rejects ambiguous identities, duplicate token hashes and invalid configuration', () => {
  const access = makeAccess();
  assert.throws(() => access.createClinicResolver([fixtureRegistry[0], fixtureRegistry[0]]), /invalid_clinic_registry/);
  assert.throws(() => access.createClinicResolver([fixtureRegistry[0], { ...fixtureRegistry[1], access_token_sha256: fixtureRegistry[0].access_token_sha256 }]), /invalid_clinic_registry/);
  for (const change of [{ client_id: '../bad' }, { clinic_name: '' }, { clinic_name: 'x'.repeat(161) }, { expires_at: 'never' }, { expires_at: '2099-01-01' }, { enabled: 'yes' }]) {
    assert.throws(() => access.createClinicResolver([{ ...fixtureRegistry[1], ...change }]), /invalid_clinic_registry/);
  }
});

test('legacy and new private links render their server-resolved clinic with secure cookies', async () => {
  const app = makeApp();
  for (const [token, name] of [[legacyToken, 'Pet House'], [clinicToken, 'Clínica Demo']]) {
    const welcome = await app.run('GET', '', undefined, {}, { access: token });
    assert.equal(welcome.statusCode, 200);
    assert.ok(welcome.body.includes(`${name} × TriageVet`));
    assert.match(welcome.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
    assert.match(welcome.headers['x-robots-tag'], /noindex/);
    const form = await app.run('GET', token, undefined, {}, { start: '1' });
    assert.equal(form.statusCode, 200);
    assert.ok(form.body.includes(`name="clinic_name" value="${name}"`));
    assert.ok(form.body.includes('id="workspace">'));
    assert.ok(form.body.includes('Clínica destinataria'));
  }
  assert.equal(app.rows.size, 0);
});

test('unknown, malformed, expired and disabled links and sessions fail closed', async () => {
  const app = makeApp();
  for (const token of ['', 'bad', '5'.repeat(64), expiredToken, disabledToken]) {
    assert.equal((await app.run('GET', token)).statusCode, 404);
    if (token) assert.equal((await app.run('GET', '', undefined, {}, { access: token })).statusCode, 404);
    assert.equal((await app.run('POST', token, sample())).statusCode, 403);
  }
  assert.equal(app.rows.size, 0);
  assert.equal(app.emails.length, 0);
  assert.equal(app.backups.length, 0);
});

test('clinic names are escaped in welcome and questionnaire HTML', async () => {
  const name = 'Clínica "Nueva" <Norte>';
  const access = makeAccess([entry(clinicToken, { ...clinic, clinic_name: name })]);
  const core = load('api/triagevet-discovery-v3.js', { './lib/triagevet-access': access });
  const entryHandler = load('api/triagevet-discovery-entry.js', { './lib/triagevet-access': access, './triagevet-discovery-v3': core });
  const res = response();
  await entryHandler({ method: 'GET', query: { access: clinicToken }, headers: {} }, res);
  assert.ok(res.body.includes('Clínica &quot;Nueva&quot; &lt;Norte&gt;'));
  assert.ok(!res.body.includes(name));
  const form = response();
  await core({ method: 'GET', headers: { cookie: `${access.SESSION_COOKIE}=${clinicToken}` } }, form);
  assert.equal(form.statusCode, 200);
  assert.ok(form.body.includes('value="Clínica &quot;Nueva&quot; &lt;Norte&gt;"'));
  assert.ok(!form.body.includes(name));
});

test('valid responses from two clinics keep identity, payload, ciphertext and email destinations separate', async () => {
  const app = makeApp();
  const first = sample({ client_id: 'pet-house', clinic_name: 'Pet House' });
  const second = sample(clinic, 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58');
  for (const [token, body] of [[legacyToken, first], [clinicToken, second]]) {
    const res = await app.run('POST', token, body);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stored, true);
    assert.equal(res.body.delivered, true);
    assert.equal(res.body.backedUp, true);
    const row = app.rows.get(body.submission_id);
    assert.equal(row.client_id, body.client_id);
    assert.equal(row.payload.clinic_name, body.clinic_name);
    assert.equal(row.email_status, 'delivered');
    assert.equal(row.hetzner_backup_status, 'stored');
  }
  assert.equal(app.rows.size, 2);
  assert.deepEqual(app.backups.map((item) => item.client_id), ['pet-house', 'clinica-demo']);
  assert.ok(!JSON.stringify(app.backups).includes('PRUEBA LOCAL'));
  assert.deepEqual(app.emails.map((email) => email.to), [['negocios@parmux.com'], ['negocios@parmux.com']]);
  assert.equal(app.emails[1].subject, 'Diagnóstico TriageVet - Clínica Demo');
  assert.equal(app.emails[1].reply_to, 'test@example.test');
  assert.ok(app.emails.every((email) => email.cc === undefined && email.bcc === undefined));
});

test('tampered clinic identity, missing required fields and CSRF or origin errors produce no persistence or email', async () => {
  const app = makeApp();
  for (const patch of [{ client_id: 'pet-house' }, { clinic_name: 'Pet House' }, { consent: '' }, { contact_email: 'invalid' }, { channels: [] }]) {
    assert.equal((await app.run('POST', clinicToken, { ...sample(), ...patch })).statusCode, 400);
  }
  assert.equal((await app.run('POST', clinicToken, sample(), { 'x-triagevet-csrf': app.access.csrfFor(legacyToken) })).statusCode, 403);
  assert.equal((await app.run('POST', clinicToken, sample(), { origin: 'https://evil.example.test' })).statusCode, 403);
  assert.equal(app.rows.size, 0);
  assert.equal(app.emails.length, 0);
  assert.equal(app.backups.length, 0);
});

test('changing the active clinic session prevents a stale clinic tab from submitting', async () => {
  const app = makeApp();
  const stale = sample({ client_id: 'pet-house', clinic_name: 'Pet House' });
  assert.equal((await app.run('POST', clinicToken, stale, { 'x-triagevet-csrf': app.access.csrfFor(legacyToken) })).statusCode, 403);
  assert.equal(app.rows.size, 0);
});

test('reusing another clinic UUID or changing an existing payload never updates that row or sends a notification', async () => {
  const app = makeApp();
  const first = sample({ client_id: 'pet-house', clinic_name: 'Pet House' });
  await app.run('POST', legacyToken, first);
  const original = JSON.stringify(app.rows.get(first.submission_id));
  const conflict = await app.run('POST', clinicToken, sample(clinic, first.submission_id));
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.error, 'submission_conflict');
  assert.equal((await app.run('POST', legacyToken, { ...first, top_impact: 'CHANGED' })).statusCode, 409);
  assert.equal(JSON.stringify(app.rows.get(first.submission_id)), original);
  assert.equal(app.rows.size, 1);
  assert.equal(app.emails.length, 1);
  assert.equal(app.backups.length, 1);
});

test('edge insert retries are idempotent and delivery updates are scoped to clinic, including legacy updates', async () => {
  const app = makeApp();
  const first = sample({ client_id: 'pet-house', clinic_name: 'Pet House' });
  await app.run('POST', legacyToken, first);
  const stored = app.rows.get(first.submission_id);
  assert.equal((await app.call({ action: 'create', record: stored })).status, 200);
  assert.equal(app.rows.size, 1);
  assert.equal((await app.call({ action: 'update_delivery', id: first.submission_id, client_id: clinic.client_id, patch: { email_status: 'failed' } })).status, 409);
  assert.equal(stored.email_status, 'delivered');
  assert.equal((await app.call({ action: 'update_delivery', id: first.submission_id, patch: { email_status: 'pending' } })).status, 200);
  assert.equal(stored.email_status, 'pending');
  const second = sample(clinic, 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58');
  await app.run('POST', clinicToken, second);
  assert.equal((await app.call({ action: 'update_delivery', id: second.submission_id, patch: { email_status: 'failed' } })).status, 409);
  assert.equal(app.rows.get(second.submission_id).email_status, 'delivered');
});

test('edge rejects unauthenticated requests, null bodies and inconsistent record identities', async () => {
  const app = makeApp();
  assert.equal((await app.call({ action: 'health' }, 'wrong-oidc')).status, 401);
  assert.equal((await app.call(null)).status, 400);
  const body = sample();
  const record = { id: body.submission_id, ...clinic, contact_email: body.contact_email, payload: body, payload_sha256: hash(JSON.stringify(body)) };
  for (const patch of [{ client_id: '../bad' }, { clinic_name: 'Other Clinic' }, { contact_email: 'other@example.test' }, { payload: null }]) {
    assert.equal((await app.call({ action: 'create', record: { ...record, ...patch } })).status, 400);
  }
  assert.equal(app.rows.size, 0);
});

function transport(app, token, loseFirstResponse = false) {
  const requests = [];
  return {
    requests,
    async fetch(url, init) {
      assert.equal(url, '/triagevet/diagnostico');
      const body = JSON.parse(init.body);
      requests.push(body);
      const reply = await app.run('POST', token, body, { 'x-triagevet-csrf': init.headers['X-TriageVet-CSRF'] });
      if (loseFirstResponse) { loseFirstResponse = false; throw new Error('simulated_response_lost'); }
      return { ok: reply.statusCode >= 200 && reply.statusCode < 300, status: reply.statusCode, json: async () => reply.body };
    },
  };
}

test('a lost HTTP response followed by an identical retry confirms one row without replaying notifications or backup', async () => {
  const app = makeApp();
  const storage = new Map();
  const link = transport(app, clinicToken, true);
  const id = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const form = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, id, {
    answers: sample(), csrf: app.access.csrfFor(clinicToken), fetch: link.fetch,
  });
  await form.submit();
  assert.equal(app.rows.size, 1);
  assert.equal(form.node('#success').hidden, true);
  assert.ok(storage.has(`parmux:triagevet:${clinic.client_id}:v3`));
  await form.submit();
  assert.deepEqual(link.requests[1], link.requests[0]);
  assert.equal(form.node('#success').hidden, false);
  assert.equal(app.rows.size, 1);
  assert.equal(app.emails.length, 1);
  assert.equal(app.backups.length, 1);
});

test('an identical retry after reload retains the original UUID and confirms the existing response', async () => {
  const app = makeApp();
  const storage = new Map();
  const link = transport(app, clinicToken, true);
  const firstId = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const form = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, firstId, {
    answers: sample(), csrf: app.access.csrfFor(clinicToken), fetch: link.fetch,
  });
  await form.submit();
  const reloaded = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58', {
    csrf: app.access.csrfFor(clinicToken), fetch: link.fetch,
  });
  await reloaded.submit();
  assert.equal(link.requests[1].submission_id, firstId);
  assert.equal(app.rows.size, 1);
  assert.equal(app.emails.length, 1);
  assert.equal(app.backups.length, 1);
});

test('edited answers survive conflict and reload; a new response requires explicit confirmation', async () => {
  const app = makeApp();
  const storage = new Map();
  const link = transport(app, clinicToken, true);
  const firstId = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const secondId = 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const form = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, firstId, {
    answers: sample(), csrf: app.access.csrfFor(clinicToken), fetch: link.fetch,
  });
  await form.submit();
  form.field('top_impact').value = 'EDITED LOCAL ANSWER';
  form.save();
  await form.submit();
  assert.equal(app.rows.size, 1);
  assert.equal(app.emails.length, 1);
  assert.equal(form.node('#submit').disabled, true);
  assert.equal(form.node('#submission-conflict').hidden, false);
  assert.equal(form.field('top_impact').value, 'EDITED LOCAL ANSWER');
  let confirmed = false;
  const reloaded = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, secondId, {
    csrf: app.access.csrfFor(clinicToken), fetch: link.fetch, confirm: () => confirmed,
  });
  assert.equal(reloaded.field('top_impact').value, 'EDITED LOCAL ANSWER');
  assert.equal(reloaded.node('#new-submission').hidden, false);
  assert.equal(reloaded.node('#submit').disabled, true);
  await reloaded.submit();
  await reloaded.recover(); // Cancelled: no rotation, row, request or notification.
  assert.equal(link.requests.length, 2);
  assert.equal(app.rows.size, 1);
  assert.equal(storage.get(`parmux:triagevet:${clinic.client_id}:v3:submission-id`), firstId);
  confirmed = true;
  await reloaded.recover();
  assert.equal(link.requests.length, 3);
  assert.equal(link.requests[2].submission_id, secondId);
  assert.equal(app.rows.size, 2);
  assert.equal(app.rows.get(firstId).payload.top_impact, 'PRUEBA LOCAL');
  assert.equal(app.rows.get(secondId).payload.top_impact, 'EDITED LOCAL ANSWER');
  assert.equal(app.emails.length, 2);
  assert.equal(app.backups.length, 2);
  assert.equal(reloaded.node('#success').hidden, false);
});

test('a persisted conflict from one clinic neither rotates another clinic UUID nor mixes its answers', async () => {
  const app = makeApp();
  const storage = new Map();
  const first = transport(app, legacyToken, true);
  const firstId = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const secondId = 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const firstForm = browser({ id: 'pet-house', name: 'Pet House' }, storage, firstId, {
    answers: sample({ client_id: 'pet-house', clinic_name: 'Pet House' }), csrf: app.access.csrfFor(legacyToken), fetch: first.fetch,
  });
  await firstForm.submit();
  firstForm.field('top_impact').value = 'EDITED FIRST CLINIC';
  firstForm.save();
  await firstForm.submit();
  const second = transport(app, clinicToken);
  const secondForm = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, secondId, {
    answers: sample(), csrf: app.access.csrfFor(clinicToken), fetch: second.fetch,
  });
  assert.equal(secondForm.node('#submit').disabled, false);
  assert.equal(secondForm.node('#new-submission').hidden, true);
  await secondForm.submit();
  assert.equal(app.rows.get(firstId).client_id, 'pet-house');
  assert.equal(app.rows.get(firstId).payload.top_impact, 'PRUEBA LOCAL');
  assert.equal(app.rows.get(secondId).client_id, clinic.client_id);
  assert.equal(app.rows.get(secondId).payload.top_impact, 'PRUEBA LOCAL');
  assert.equal(storage.get('parmux:triagevet:pet-house:v3:submission-conflict'), firstId);
  assert.equal(secondForm.node('#success').hidden, false);
});

test('when storage is unavailable, an in-memory retry still preserves its UUID and avoids a duplicate', async () => {
  const app = makeApp();
  const link = transport(app, clinicToken, true);
  const ids = ['a42e36c1-b20f-4ee1-9f41-0ae18cc04d58', 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58'];
  const form = browser({ id: clinic.client_id, name: clinic.clinic_name }, new Map(), ids, {
    csrf: app.access.csrfFor(clinicToken), fetch: link.fetch,
    storage: { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); }, removeItem() { throw new Error('unavailable'); } },
  });
  // The fixture starts without a restored step; these existing fields are sufficient
  // for the server and the current step's client-side validation.
  form.field('channels').checked = true;
  form.field('main_channel').checked = true;
  form.field('whatsapp_clinical').checked = true;
  form.field('query_types').checked = true;
  form.field('urgent_frequency').checked = true;
  form.field('priorities').checked = true;
  form.field('consent').checked = true;
  form.field('contact_name').value = 'PRUEBA LOCAL';
  form.field('contact_email').value = 'test@example.test';
  form.field('initial_responder').value = 'PRUEBA LOCAL';
  form.field('top_impact').value = 'PRUEBA LOCAL';
  await form.submit();
  await form.submit();
  assert.equal(link.requests[1].submission_id, link.requests[0].submission_id);
  assert.equal(app.rows.size, 1);
  assert.equal(app.emails.length, 1);
});

test('confirming one request never discards a newer draft edited in another tab', async () => {
  const app = makeApp();
  const storage = new Map();
  const id = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  let release;
  let notifyResponseReached;
  const responseReached = new Promise((resolve) => { notifyResponseReached = resolve; });
  const held = async (_url, init) => {
    const body = JSON.parse(init.body);
    const reply = await app.run('POST', clinicToken, body);
    notifyResponseReached();
    await new Promise((resolve) => { release = resolve; });
    return { ok: true, status: 200, json: async () => reply.body };
  };
  const first = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, id, {
    answers: sample(), csrf: app.access.csrfFor(clinicToken), fetch: held,
  });
  const sending = first.submit();
  await responseReached;
  const other = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, id, {
    csrf: app.access.csrfFor(clinicToken), fetch: transport(app, clinicToken).fetch,
  });
  other.field('top_impact').value = 'NEWER TAB DRAFT';
  other.save();
  release();
  await sending;
  const key = `parmux:triagevet:${clinic.client_id}:v3`;
  assert.equal(JSON.parse(storage.get(key)).top_impact, 'NEWER TAB DRAFT');
  assert.equal(storage.get(`${key}:submission-id`), id);
  await other.submit();
  assert.equal(other.node('#new-submission').hidden, false);
  assert.equal(app.rows.size, 1);
  assert.equal(app.rows.get(id).payload.top_impact, 'PRUEBA LOCAL');
});

test('a late 409 never overwrites a newer shared draft or its recovery metadata', async () => {
  const app = makeApp();
  const storage = new Map();
  const id = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  let loseFirst = true;
  let release;
  let notifyConflictReached;
  const conflictReached = new Promise((resolve) => { notifyConflictReached = resolve; });
  const held = async (_url, init) => {
    const reply = await app.run('POST', clinicToken, JSON.parse(init.body));
    if (loseFirst) { loseFirst = false; throw new Error('simulated_response_lost'); }
    assert.equal(reply.statusCode, 409);
    notifyConflictReached();
    await new Promise((resolve) => { release = resolve; });
    return { ok: false, status: 409, json: async () => reply.body };
  };
  const first = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, id, {
    answers: sample(), csrf: app.access.csrfFor(clinicToken), fetch: held,
  });
  await first.submit();
  first.field('top_impact').value = 'TAB A EDIT';
  first.save();
  const waiting = first.submit();
  await conflictReached;
  const second = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, id, {
    csrf: app.access.csrfFor(clinicToken), fetch: transport(app, clinicToken).fetch,
  });
  second.field('top_impact').value = 'NEWER TAB B EDIT';
  second.save();
  const key = `parmux:triagevet:${clinic.client_id}:v3`;
  const newerDraft = storage.get(key);
  const newerId = storage.get(`${key}:submission-id`);
  const newerConflict = storage.get(`${key}:submission-conflict`);
  release();
  await waiting;
  assert.equal(storage.get(key), newerDraft);
  assert.equal(storage.get(`${key}:submission-id`), newerId);
  assert.equal(storage.get(`${key}:submission-conflict`), newerConflict);
  assert.equal(first.field('top_impact').value, 'TAB A EDIT');
  assert.equal(first.node('#new-submission').hidden, false);
  const reloaded = browser({ id: clinic.client_id, name: clinic.clinic_name }, storage, 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58', {
    csrf: app.access.csrfFor(clinicToken), fetch: transport(app, clinicToken).fetch,
  });
  assert.equal(reloaded.field('top_impact').value, 'NEWER TAB B EDIT');
  assert.equal(reloaded.node('#submit').disabled, false);
  assert.equal(app.rows.size, 1);
  assert.equal(app.rows.get(id).payload.top_impact, 'PRUEBA LOCAL');
  assert.equal(app.emails.length, 1);
});
