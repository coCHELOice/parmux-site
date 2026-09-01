const { createHash, timingSafeEqual } = require('node:crypto');

const ACCESS_TOKEN_HASH = '4b3ba060403a4b21b68a89e0b3f638e1d918859f8a51e68ee990b3d71805b6db';
const ACCESS_EXPIRES_AT = Date.parse('2026-10-16T02:59:59.000Z');
const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const MAX_BODY_BYTES = 64 * 1024;
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/negocios@parmux.com';

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function validToken(token) {
  return typeof token === 'string'
    && token.length === 64
    && Date.now() <= ACCESS_EXPIRES_AT
    && safeEqualHex(hash(token), ACCESS_TOKEN_HASH);
}

function parseCookies(header = '') {
  return header.split(';').reduce((output, part) => {
    const index = part.indexOf('=');
    if (index < 1) return output;
    const key = part.slice(0, index).trim();
    try {
      output[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      output[key] = '';
    }
    return output;
  }, {});
}

function requestToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';
}

function csrfFor(token) {
  return createHash('sha256').update(`${token}|triagevet-discovery-v3`, 'utf8').digest('base64url');
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.host === host;
  } catch {
    return false;
  }
}

function setSecurityHeaders(res, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
}

function json(res, status, payload, extraHeaders = {}) {
  setSecurityHeaders(res, 'application/json; charset=utf-8');
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).json(payload);
}

function html(res, status, body, extraHeaders = {}) {
  setSecurityHeaders(res, 'text/html; charset=utf-8');
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).send(body);
}

function clean(value, depth = 0) {
  if (depth > 4) throw new Error('depth');
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length > 5000) throw new Error('length');
    return normalized;
  }
  if (Array.isArray(value)) {
    if (value.length > 30) throw new Error('array');
    return value.map((item) => clean(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 80) throw new Error('object');
    return Object.fromEntries(entries.map(([key, item]) => [String(key).slice(0, 80), clean(item, depth + 1)]));
  }
  return value == null ? '' : String(value).slice(0, 100);
}

function readBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error('large');
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new Error('type');
  const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('body');
  return clean(raw);
}

function validate(data) {
  if (data._honey) return 'honeypot';
  if (data.client_id !== 'pet-house' || data.clinic_name !== 'Pet House') throw new Error('client');
  if (!Array.isArray(data.channels) || !data.channels.length || !data.main_channel) throw new Error('channels');
  if (!data.whatsapp_clinical) throw new Error('whatsapp');
  if (data.whatsapp_clinical !== 'No actualmente' && !data.whatsapp_count) throw new Error('whatsapp_count');
  if (!Array.isArray(data.query_types) || !data.query_types.length || !data.urgent_frequency) throw new Error('clinical');
  if (!data.initial_responder) throw new Error('operation');
  if (!Array.isArray(data.priorities) || data.priorities.length < 1 || data.priorities.length > 3 || !data.top_impact) throw new Error('priorities');
  if (!data.contact_name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(data.contact_email || '')) throw new Error('contact');
  if (data.consent !== 'Confirmado') throw new Error('consent');
  return 'ok';
}

function serialize(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'No indicado';
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return value || 'No indicado';
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

async function deliver(data) {
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
    resumen_operacional: operationalSummary(data),
  };

  const response = await fetch(FORM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  const delivered = result.success === true || result.success === 'true';
  if (!response.ok || !delivered) throw new Error('delivery_failed');
}

function choices(name, values, multiple = false) {
  const type = multiple ? 'checkbox' : 'radio';
  const grid = values.length > 6 ? 'choices three' : 'choices';
  return `<div class="${grid}">${values.map((value) => `<label class="choice"><input type="${type}" name="${name}" value="${value}"><span>${value}</span></label>`).join('')}</div>`;
}

function field(name, label, options = {}) {
  const { area = false, placeholder = '', type = 'text' } = options;
  if (area) return `<label class="field"><span>${label}</span><textarea name="${name}" rows="3" placeholder="${placeholder}"></textarea></label>`;
  return `<label class="field"><span>${label}</span><input type="${type}" name="${name}" placeholder="${placeholder}"></label>`;
}

function stepHeader(number, title, subtitle) {
  return `<header class="step-head"><p>Paso ${number} de 7</p><h2>${title}</h2><span>${subtitle}</span></header>`;
}

function questionnaire(csrf) {
  const channels = ['WhatsApp', 'Teléfono', 'AgendaPro', 'Sitio web / formulario', 'Instagram', 'Facebook / Messenger', 'Email', 'Google', 'Presencial', 'Otro'];
  const queryTypes = ['Solicitud de hora', 'Síntomas o problema de salud', 'Consulta potencialmente urgente', 'Controles', 'Resultados de exámenes', 'Paciente hospitalizado', 'Medicamentos o tratamientos', 'Precios', 'Horarios', 'Especialidades', 'Disponibilidad profesional', 'Fotos o videos', 'Exámenes o documentos', 'Seguimiento posterior', 'Otro'];
  const requiredInfo = ['Especie', 'Edad', 'Motivo', 'Síntomas', 'Tiempo de evolución', 'Estado general', 'Antecedentes', 'Medicamentos', 'Fotos o videos', 'Exámenes previos', 'Identificación del paciente', 'Otro'];
  const webGoals = ['Conocer servicios clínicos', 'Encontrar especialista', 'Solicitar hora', 'Urgencias', 'Contactar recepción', 'Iniciar WhatsApp', 'Horarios', 'Precios', 'Ubicación', 'Resolver dudas antes de contactar', 'Otro'];
  const priorities = ['Reducir consultas repetitivas', 'Responder más rápido', 'Evitar consultas importantes sin atender', 'Identificar casos prioritarios', 'Obtener antecedentes antes del equipo', 'Ordenar WhatsApp', 'Separar clínica de otros servicios', 'Mejorar derivaciones internas', 'Integrar WhatsApp y AgendaPro', 'Reducir carga de recepción', 'Mejorar trazabilidad', 'Mejorar recorrido del sitio', 'Ordenar Instagram', 'Otro'];
  const navigation = ['Canales', 'WhatsApp', 'Clínica', 'Operación', 'Digital', 'Prioridades', 'Cierre'];

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta name="referrer" content="no-referrer">
  <meta name="triagevet-csrf" content="${csrf}">
  <title>Diagnóstico clínico digital · Pet House × TriageVet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/triagevet-discovery.css">
</head>
<body>
<main class="shell">
  <header class="top">
    <a class="brand" href="/"><span class="mark">P</span><span><strong>PARMUX</strong><small>TriageVet</small></span></a>
    <span class="badge">Diagnóstico privado · Pet House</span>
  </header>

  <section class="intro" id="intro">
    <p class="eyebrow">Pet House × TriageVet</p>
    <h1>Antes de mostrar una solución, queremos entender cómo funciona su clínica.</h1>
    <p class="lead">Cada clínica organiza de manera distinta sus consultas, agenda, WhatsApp y equipo. Este diagnóstico permite preparar una demostración centrada sólo en aquello que pueda aportar valor.</p>
    <div class="facts"><span>5–8 minutos</span><span>Respuestas aproximadas están bien</span><span>Sin datos de pacientes</span></div>
    <div class="note"><strong>No buscamos reemplazar herramientas que ya funcionan.</strong><span>Primero reconstruimos el recorrido clínico actual; después proponemos mejoras progresivas y específicas.</span></div>
    <button class="primary" id="start" type="button">Comenzar →</button>
  </section>

  <div class="workspace" id="workspace" hidden>
    <aside class="side">
      <p class="eyebrow">Diagnóstico operacional</p>
      <h2>Una imagen completa, paso a paso.</h2>
      <ol class="nav">${navigation.map((item, index) => `<li data-nav>${String(index + 1).padStart(2, '0')} · ${item}</li>`).join('')}</ol>
      <div class="scope"><strong>Alcance clínico:</strong> TriageVet se evalúa exclusivamente para la operación veterinaria. Hotel y peluquería sólo se consultan para entender si comparten canales.</div>
    </aside>

    <form class="card" id="discovery-form" novalidate>
      <input type="hidden" name="clinic_name" value="Pet House">
      <input type="hidden" name="client_id" value="pet-house">
      <label class="honey" aria-hidden="true">No completar<input name="_honey" tabindex="-1" autocomplete="off"></label>

      <section class="panel" data-step>
        ${stepHeader(1, '¿Cómo llegan hoy las consultas clínicas?', 'Mapeamos la puerta de entrada antes de hablar de automatización.')}
        <fieldset><legend>¿Por qué canales reciben consultas relacionadas con la clínica veterinaria?</legend>${choices('channels', channels, true)}</fieldset>
        <fieldset><legend>¿Cuál concentra hoy la mayor cantidad de consultas clínicas?</legend><div id="main-channel"></div></fieldset>
        <fieldset><legend>¿Hay algún canal que genere más trabajo, desorden o consultas repetidas?</legend>${choices('channel_friction', ['Sí', 'No', 'No estamos seguros'])}</fieldset>
        ${field('channel_friction_detail', 'Si corresponde, ¿qué ocurre principalmente?', { area: true, placeholder: 'Ej.: consultas duplicadas, mensajes sin respuesta, información repartida…' })}
      </section>

      <section class="panel" data-step hidden>
        ${stepHeader(2, 'Arquitectura real de WhatsApp', 'Necesitamos saber cuántos canales existen y qué función cumple cada uno.')}
        <fieldset><legend>¿Utilizan actualmente WhatsApp para consultas veterinarias?</legend>${choices('whatsapp_clinical', ['Sí, regularmente', 'Sí, de forma limitada', 'Sólo determinadas consultas', 'No actualmente'])}</fieldset>
        <div id="wa-yes" hidden>
          <fieldset><legend>¿Cuántos números de WhatsApp utiliza actualmente Pet House?</legend>${choices('whatsapp_count', ['1', '2', '3', '4 o más'])}</fieldset>
          <div id="wa-cards"></div>
          <div id="wa-more" hidden>${field('wa_more_notes', 'Si utilizan más de cuatro, indíquenos brevemente los números o usos adicionales', { area: true })}</div>
          <fieldset><legend>¿Alguno mezcla consultas clínicas con hotel, peluquería u otros servicios?</legend>${choices('whatsapp_mixed', ['Sí', 'No', 'No estamos seguros'])}</fieldset>
          ${field('whatsapp_mixed_process', '¿Cómo distinguen actualmente unas consultas de otras?', { area: true })}
        </div>
        <div id="wa-no" hidden>
          <fieldset><legend>¿Les interesaría evaluar WhatsApp como canal clínico si pudiera funcionar de forma estructurada y controlada?</legend>${choices('whatsapp_interest', ['Sí', 'Tal vez', 'No por ahora'])}</fieldset>
          ${field('whatsapp_reason', '¿Existe alguna razón por la que hoy prefieran no utilizarlo?', { area: true })}
        </div>
      </section>

      <section class="panel" data-step hidden>
        ${stepHeader(3, 'Qué ocurre cuando la consulta ya es clínica', 'TriageVet sólo tiene sentido si respeta los límites y criterios de la clínica.')}
        <fieldset><legend>¿Qué tipos de consultas reciben habitualmente?</legend>${choices('query_types', queryTypes, true)}</fieldset>
        <fieldset><legend>¿Qué información necesitan normalmente antes de decidir qué hacer?</legend>${choices('required_info', requiredInfo, true)}</fieldset>
        <fieldset><legend>¿Con qué frecuencia reciben consultas potencialmente urgentes?</legend>${choices('urgent_frequency', ['Frecuentemente', 'A veces', 'Muy pocas', 'No'])}</fieldset>
        ${field('urgent_process', '¿Cómo reconocen y derivan actualmente esos casos?', { area: true })}
        ${field('automation_never', '¿Qué situaciones o preguntas nunca debería responder automáticamente un sistema?', { area: true })}
      </section>

      <section class="panel" data-step hidden>
        ${stepHeader(4, 'Equipo, derivación y sistemas', 'Queremos entender dónde termina la clasificación inicial y dónde continúan AgendaPro y el equipo.')}
        ${field('initial_responder', '¿Quién recibe normalmente el primer contacto clínico?', { placeholder: 'Ej.: recepción, técnico veterinario, depende del horario…' })}
        ${field('digital_team_size', '¿Cuántas personas participan aproximadamente en los canales digitales?')}
        ${field('vet_escalation', 'Cuando recepción necesita intervención veterinaria, ¿qué ocurre?', { area: true })}
        <fieldset><legend>¿Hay momentos del día en que responder o clasificar sea especialmente difícil?</legend>${choices('difficult_moments', ['Sí', 'A veces', 'No'])}</fieldset>
        ${field('difficult_moments_detail', '¿Cuándo ocurre principalmente?', { area: true })}
        <fieldset><legend>¿Para qué utilizan actualmente AgendaPro?</legend>${choices('agendapro_uses', ['Reserva de horas', 'Agenda de profesionales', 'Fichas de pacientes', 'Recordatorios', 'Pagos', 'Gestión interna', 'Otro'], true)}</fieldset>
        <fieldset><legend>Cuando una conversación comienza fuera de AgendaPro, ¿copian información manualmente después?</legend>${choices('manual_copy', ['Sí', 'A veces', 'No'])}</fieldset>
        ${field('manual_copy_detail', '¿Qué información tienen que copiar?', { area: true })}
        ${field('other_systems', '¿Utilizan otros sistemas relevantes para la operación clínica?', { area: true, placeholder: 'Opcional' })}
      </section>

      <section class="panel" data-step hidden>
        ${stepHeader(5, 'Ecosistema digital alrededor de la clínica', 'Sólo profundizamos en canales que realmente tengan valor operativo.')}
        <fieldset><legend>¿Qué esperan principalmente que pueda resolver una persona desde el sitio web?</legend>${choices('web_goals', webGoals, true)}</fieldset>
        ${field('web_repeated_questions', '¿Qué preguntas repetidas podría resolver mejor el sitio?', { area: true })}
        <fieldset><legend>Si detectamos fricciones concretas entre sitio, consulta y agenda, ¿estarían abiertos a evaluar mejoras?</legend>${choices('web_improvement_interest', ['Sí', 'Probablemente', 'Preferimos revisarlo primero', 'No por ahora'])}</fieldset>
        <div class="branch" id="instagram" hidden>
          <strong>Instagram</strong>
          <fieldset><legend>¿Con qué frecuencia reciben consultas veterinarias?</legend>${choices('instagram_frequency', ['Frecuentemente', 'A veces', 'Muy pocas', 'No'])}</fieldset>
          ${field('instagram_responder', '¿Quién responde actualmente?')}
          ${field('instagram_questions', '¿Qué preguntas reciben principalmente?', { area: true })}
          <fieldset><legend>¿Les interesaría evaluar más adelante respuestas controladas y derivación clínica desde Instagram?</legend>${choices('instagram_interest', ['Sí', 'Tal vez', 'No por ahora'])}</fieldset>
        </div>
        <div class="branch" id="facebook" hidden>
          <strong>Facebook / Messenger</strong>
          <fieldset><legend>¿Sigue siendo un canal relevante?</legend>${choices('facebook_relevance', ['Sí', 'Secundario', 'Muy poco'])}</fieldset>
          <fieldset><legend>Si tiene suficiente uso, ¿les interesaría integrarlo posteriormente al mismo esquema?</legend>${choices('facebook_interest', ['Sí', 'Tal vez', 'No por ahora'])}</fieldset>
        </div>
      </section>

      <section class="panel" data-step hidden>
        ${stepHeader(6, '¿Dónde tendría más impacto intervenir?', 'Seleccionen hasta tres prioridades. La propuesta se construirá alrededor de ellas.')}
        <fieldset><legend>Prioridades principales · máximo 3</legend>${choices('priorities', priorities, true)}</fieldset>
        <div class="emphasis">${field('top_impact', 'Si pudiéramos mejorar una sola parte durante los próximos 30 días, ¿cuál tendría mayor impacto para Pet House?', { area: true })}</div>
        ${field('missing_context', '¿Hay algo particular de la operación que debamos entender antes de preparar la demo?', { area: true, placeholder: 'Opcional' })}
      </section>

      <section class="panel" data-step hidden>
        ${stepHeader(7, 'Listo. ¿Con quién coordinamos la demostración?', 'Usaremos estos datos únicamente para continuar esta evaluación por escrito.')}
        <div class="two">
          ${field('contact_name', 'Nombre', { placeholder: 'Ej.: Constanza Silva' })}
          ${field('contact_role', 'Cargo o función', { placeholder: 'Opcional' })}
        </div>
        ${field('contact_email', 'Email', { type: 'email' })}
        <label class="consent"><input type="checkbox" name="consent" value="Confirmado"><span>Confirmo que las respuestas describen de forma aproximada la operación y no incluyen datos personales ni clínicos identificables de pacientes.</span></label>
        <div class="note"><strong>Qué sucede después</strong><span>PARMUX preparará una demostración de TriageVet enfocada en la operación clínica real. Sitio, Instagram, Facebook o integraciones sólo se propondrán si las respuestas muestran que aportan valor.</span></div>
      </section>

      <p class="error" id="error" role="alert" aria-live="polite"></p>
      <div class="actions">
        <button class="secondary" id="prev" type="button">← Atrás</button>
        <button class="primary" id="next" type="button">Continuar →</button>
        <button class="primary" id="submit" type="submit" hidden>Enviar diagnóstico →</button>
      </div>
      <p class="saved">Las respuestas se guardan temporalmente en este dispositivo.</p>
    </form>
  </div>

  <section class="success" id="success" hidden>
    <div class="check">✓</div>
    <p class="eyebrow">Diagnóstico recibido</p>
    <h1>Ya tenemos una imagen mucho más clara.</h1>
    <p>Revisaremos el recorrido clínico, WhatsApp, AgendaPro y los canales digitales relevantes para preparar una demostración centrada en la operación real de Pet House.</p>
    <p><strong>TriageVet · PARMUX</strong><br>Tecnología que devuelve tiempo.</p>
  </section>
</main>
<script src="/triagevet-discovery.js" defer></script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const session = requestToken(req);

  if (method === 'GET') {
    const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';
    if (access) {
      if (!validToken(access)) return html(res, 404, '<!doctype html><meta charset="utf-8"><title>No disponible</title>');
      const cookie = `${SESSION_COOKIE}=${encodeURIComponent(access)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
      return html(res, 302, '', { 'Set-Cookie': cookie, Location: '/triagevet/diagnostico' });
    }
    if (!validToken(session)) return html(res, 404, '<!doctype html><meta charset="utf-8"><title>No disponible</title>');
    return html(res, 200, questionnaire(csrfFor(session)));
  }

  if (method === 'POST') {
    if (!validToken(session) || !sameOrigin(req)) return json(res, 403, { ok: false, error: 'invalid_request' });
    const supplied = req.headers['x-triagevet-csrf'];
    if (typeof supplied !== 'string' || !safeEqualHex(hash(supplied), hash(csrfFor(session)))) {
      return json(res, 403, { ok: false, error: 'invalid_request' });
    }

    let data;
    try {
      data = readBody(req);
      const status = validate(data);
      if (status === 'honeypot') return json(res, 200, { ok: true });
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_form' });
    }

    try {
      await deliver(data);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 502, { ok: false, error: 'delivery_unavailable' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { ok: false, error: 'method_not_allowed' });
};
