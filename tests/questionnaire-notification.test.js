'use strict';

const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const {
  deliverNotification,
  deliverViaFormSubmit,
  deliverViaResend,
  notificationContent,
  operationalSummary,
} = require('../api/lib/questionnaire-notification');

const ORIGINAL_ENV = { ...process.env };
const sample = {
  submission_id: 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58',
  client_id: 'pet-house',
  clinic_name: 'Pet House',
  contact_name: 'PRUEBA AUTOMATIZADA PARMUX',
  contact_role: 'Control QA',
  contact_email: 'negocios@parmux.com',
  channels: ['WhatsApp', 'AgendaPro'],
  main_channel: 'WhatsApp',
  whatsapp_clinical: 'Sí, regularmente',
  query_types: ['Solicitud de hora'],
  required_info: ['Especie', 'Motivo'],
  urgent_frequency: 'A veces',
  initial_responder: 'Recepción',
  priorities: ['Ordenar WhatsApp'],
  top_impact: 'Reducir consultas repetitivas',
  missing_context: 'PRUEBA AUTOMATIZADA',
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('operationalSummary formats questionnaire answers for internal review', () => {
  const summary = operationalSummary(sample);
  assert.match(summary, /Clínica: Pet House/);
  assert.match(summary, /Canales actuales: WhatsApp, AgendaPro/);
  assert.match(summary, /Contexto adicional: PRUEBA AUTOMATIZADA/);
});

test('notificationContent creates text and escaped HTML versions', () => {
  const content = notificationContent({ ...sample, top_impact: '<script>alert(1)</script>' });
  assert.match(content.subject, /Diagnóstico TriageVet - Pet House/);
  assert.match(content.text, /Submission ID: a42e36c1/);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('deliverViaResend posts to Resend with an idempotency key', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_EMAIL_DOMAIN = 'parmux.com';
  let request;

  const result = await deliverViaResend(sample, async (url, init) => {
    request = { init, url };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'email_123' }),
    };
  });

  const body = JSON.parse(request.init.body);
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.init.headers.Authorization, 'Bearer re_test_key');
  assert.equal(request.init.headers['Idempotency-Key'], sample.submission_id);
  assert.equal(body.from, 'PARMUX <notificaciones@parmux.com>');
  assert.deepEqual(body.to, ['negocios@parmux.com']);
  assert.equal(body.reply_to, 'negocios@parmux.com');
  assert.equal(result.provider, 'resend');
  assert.equal(result.id, 'email_123');
});

test('deliverViaResend accepts an explicit notification sender override', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_EMAIL_DOMAIN = 'parmux.com';
  process.env.QUESTIONNAIRE_NOTIFICATION_FROM = 'PARMUX <alertas@parmux.com>';
  let body;

  await deliverViaResend(sample, async (_url, init) => {
    body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'email_override' }),
    };
  });

  assert.equal(body.from, 'PARMUX <alertas@parmux.com>');
});

test('deliverNotification prefers Resend when configured', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  const result = await deliverNotification(sample, async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: 'email_456' }),
  }));
  assert.equal(result.provider, 'resend');
});

test('deliverViaFormSubmit remains as a temporary fallback', async () => {
  let request;
  const result = await deliverViaFormSubmit(sample, async (url, init) => {
    request = { init, url };
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    };
  });

  const body = JSON.parse(request.init.body);
  assert.equal(request.url, 'https://formsubmit.co/ajax/negocios@parmux.com');
  assert.equal(body.email, 'negocios@parmux.com');
  assert.equal(result.provider, 'formsubmit');
});
