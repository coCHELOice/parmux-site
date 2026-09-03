'use strict';

const DEFAULT_NOTIFICATION_TO = 'negocios@parmux.com';
const DEFAULT_NOTIFICATION_FROM = 'PARMUX <onboarding@resend.dev>';
const DEFAULT_FORM_ENDPOINT = 'https://formsubmit.co/ajax/negocios@parmux.com';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function serialize(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'No indicado';
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return value || 'No indicado';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notificationFrom() {
  const configured = env('QUESTIONNAIRE_NOTIFICATION_FROM');
  if (configured) return configured;
  const domain = env('RESEND_EMAIL_DOMAIN');
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return `PARMUX <notificaciones@${domain.toLowerCase()}>`;
  }
  return DEFAULT_NOTIFICATION_FROM;
}

function operationalSummary(data) {
  const rows = [
    ['Clínica', data.clinic_name],
    ['Canales actuales', data.channels],
    ['Canal principal', data.main_channel],
    ['Fricción entre canales', data.channel_friction],
    ['Detalle de fricción', data.channel_friction_detail],
    ['Uso clínico de WhatsApp', data.whatsapp_clinical],
    ['Cantidad de WhatsApp', data.whatsapp_count],
    ['Arquitectura de WhatsApp', data.whatsapp_numbers],
    ['Otros WhatsApp / usos', data.wa_more_notes],
    ['Mezcla clínica / no clínica', data.whatsapp_mixed],
    ['Cómo separan hoy', data.whatsapp_mixed_process],
    ['Interés en WhatsApp si no usan', data.whatsapp_interest],
    ['Razón de no uso', data.whatsapp_reason],
    ['Tipos de consulta clínica', data.query_types],
    ['Información inicial requerida', data.required_info],
    ['Frecuencia de consultas potencialmente urgentes', data.urgent_frequency],
    ['Proceso actual de urgencias', data.urgent_process],
    ['Situaciones que nunca deberían automatizarse', data.automation_never],
    ['Primer receptor', data.initial_responder],
    ['Tamaño del equipo digital', data.digital_team_size],
    ['Escalamiento al veterinario', data.vet_escalation],
    ['Momentos difíciles', data.difficult_moments],
    ['Detalle de momentos difíciles', data.difficult_moments_detail],
    ['Usos de AgendaPro', data.agendapro_uses],
    ['Copia manual hacia AgendaPro', data.manual_copy],
    ['Información que copian', data.manual_copy_detail],
    ['Otros sistemas', data.other_systems],
    ['Objetivos del sitio', data.web_goals],
    ['Preguntas repetidas que podría resolver la web', data.web_repeated_questions],
    ['Interés en mejoras web', data.web_improvement_interest],
    ['Instagram', {
      frecuencia: data.instagram_frequency,
      responsable: data.instagram_responder,
      consultas: data.instagram_questions,
      interes: data.instagram_interest,
    }],
    ['Facebook / Messenger', {
      relevancia: data.facebook_relevance,
      interes: data.facebook_interest,
    }],
    ['Prioridades', data.priorities],
    ['Mayor impacto a 30 días', data.top_impact],
    ['Contexto adicional', data.missing_context],
    ['Contacto', `${data.contact_name}${data.contact_role ? ` · ${data.contact_role}` : ''}`],
    ['Email', data.contact_email],
  ];
  return rows.map(([label, value]) => `${label}: ${serialize(value)}`).join('\n\n');
}

function notificationContent(data) {
  const summary = operationalSummary(data);
  const contact = `${data.contact_name}${data.contact_role ? ` · ${data.contact_role}` : ''}`;
  const subject = `Diagnóstico TriageVet - ${data.clinic_name || 'Pet House'}`;
  const text = [
    subject,
    '',
    `Contacto: ${contact}`,
    `Email: ${data.contact_email}`,
    `Submission ID: ${data.submission_id}`,
    '',
    summary,
  ].join('\n');
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f6f7f8;color:#111827;font-family:Arial,sans-serif;">
    <main style="max-width:720px;margin:0 auto;padding:32px 20px;">
      <section style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">PARMUX · TriageVet</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;">${escapeHtml(subject)}</h1>
        <p style="margin:0 0 4px;"><strong>Contacto:</strong> ${escapeHtml(contact)}</p>
        <p style="margin:0 0 4px;"><strong>Email:</strong> ${escapeHtml(data.contact_email)}</p>
        <p style="margin:0 0 24px;"><strong>Submission ID:</strong> ${escapeHtml(data.submission_id)}</p>
        <pre style="white-space:pre-wrap;font:14px/1.55 Arial,sans-serif;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">${escapeHtml(summary)}</pre>
      </section>
    </main>
  </body>
</html>`;
  return { html, subject, text };
}

async function deliverViaResend(data, fetchImpl = globalThis.fetch) {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) throw new Error('resend_not_configured');

  const { html, subject, text } = notificationContent(data);
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': data.submission_id,
    },
    body: JSON.stringify({
      from: notificationFrom(),
      to: [env('QUESTIONNAIRE_NOTIFICATION_TO', DEFAULT_NOTIFICATION_TO)],
      reply_to: data.contact_email,
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const raw = await response.text().catch(() => '');
  let result = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = {};
  }

  if (!response.ok || result.error) {
    const detail = typeof result.message === 'string'
      ? result.message
      : typeof result.error === 'string'
        ? result.error
        : raw;
    throw new Error(`resend_delivery_failed_${response.status}_${String(detail).replace(/\s+/g, ' ').slice(0, 120)}`);
  }

  return { id: result.id || result.data?.id || '', provider: 'resend' };
}

async function deliverViaFormSubmit(data, fetchImpl = globalThis.fetch) {
  const { text } = notificationContent(data);
  const payload = {
    _subject: 'Diagnóstico TriageVet — Pet House',
    _replyto: data.contact_email,
    _captcha: 'false',
    _template: 'table',
    tipo_solicitud: 'Diagnóstico de operación clínica digital — TriageVet',
    origen: 'parmux.com/triagevet/diagnostico',
    clinica: 'Pet House',
    contacto: `${data.contact_name}${data.contact_role ? ` · ${data.contact_role}` : ''}`,
    email: data.contact_email,
    prioridades: (data.priorities || []).join(', '),
    mayor_impacto_30_dias: data.top_impact,
    resumen_operacional: text,
  };

  const response = await fetchImpl(env('FORM_SUBMIT_ENDPOINT', DEFAULT_FORM_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  const delivered = result.success === true || result.success === 'true';
  if (!response.ok || !delivered) throw new Error('formsubmit_delivery_failed');
  return { provider: 'formsubmit' };
}

async function deliverNotification(data, fetchImpl = globalThis.fetch) {
  if (env('RESEND_API_KEY')) return deliverViaResend(data, fetchImpl);
  return deliverViaFormSubmit(data, fetchImpl);
}

module.exports = {
  deliverNotification,
  deliverViaFormSubmit,
  deliverViaResend,
  notificationContent,
  operationalSummary,
};
