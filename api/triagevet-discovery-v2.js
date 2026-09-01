const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const ACCESS_TOKEN_HASH = '4b3ba060403a4b21b68a89e0b3f638e1d918859f8a51e68ee990b3d71805b6db';
const ACCESS_EXPIRES_AT = Date.parse('2026-10-16T02:59:59.000Z');
const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const MAX_BODY_BYTES = 64 * 1024;
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/negocios@parmux.com';

function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function safeHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function validToken(token) { return typeof token === 'string' && token.length === 64 && Date.now() <= ACCESS_EXPIRES_AT && safeHex(hash(token), ACCESS_TOKEN_HASH); }
function parseCookies(header = '') {
  return header.split(';').reduce((out, part) => {
    const i = part.indexOf('='); if (i < 1) return out;
    const key = part.slice(0, i).trim();
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[key] = ''; }
    return out;
  }, {});
}
function tokenFrom(req) { return parseCookies(req.headers.cookie)[SESSION_COOKIE] || ''; }
function csrfFor(token) { return createHash('sha256').update(`${token}|triagevet-discovery-v2`).digest('base64url'); }
function sameOrigin(req) {
  const origin = req.headers.origin, host = req.headers['x-forwarded-host'] || req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try { const u = new URL(origin); return u.protocol === 'https:' && u.host === host; } catch { return false; }
}
function security(res, type, nonce = '') {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  const scripts = nonce ? `'nonce-${nonce}'` : "'self'";
  const styles = nonce ? `'nonce-${nonce}' https://fonts.googleapis.com` : "'self' https://fonts.googleapis.com";
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src ${scripts}; script-src-attr 'none'; style-src ${styles}; style-src-attr 'none'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self';`);
}
function json(res, code, value) { security(res, 'application/json; charset=utf-8'); return res.status(code).json(value); }
function clean(value, depth = 0) {
  if (depth > 4) throw new Error('depth');
  if (typeof value === 'string') { const s = value.trim(); if (s.length > 5000) throw new Error('length'); return s; }
  if (Array.isArray(value)) { if (value.length > 30) throw new Error('array'); return value.map(v => clean(v, depth + 1)); }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value); if (entries.length > 80) throw new Error('object');
    return Object.fromEntries(entries.map(([k, v]) => [String(k).slice(0, 80), clean(v, depth + 1)]));
  }
  return value == null ? '' : String(value).slice(0, 100);
}
function readBody(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) throw new Error('large');
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new Error('type');
  const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('body');
  return clean(raw);
}
function validate(d) {
  if (d._honey) return 'honeypot';
  if (d.client_id !== 'pet-house' || d.clinic_name !== 'Pet House') throw new Error('client');
  if (!Array.isArray(d.channels) || !d.channels.length || !d.main_channel) throw new Error('channels');
  if (!d.whatsapp_clinical) throw new Error('whatsapp');
  if (!Array.isArray(d.query_types) || !d.query_types.length || !d.urgent_frequency) throw new Error('clinical');
  if (!d.initial_responder) throw new Error('operation');
  if (!Array.isArray(d.priorities) || d.priorities.length < 1 || d.priorities.length > 3 || !d.top_impact) throw new Error('priorities');
  if (!d.contact_name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(d.contact_email || '')) throw new Error('contact');
  if (d.consent !== 'Confirmado') throw new Error('consent');
}
function textSummary(d) {
  const j = v => Array.isArray(v) ? v.join(', ') : (v && typeof v === 'object' ? JSON.stringify(v, null, 2) : (v || 'No indicado'));
  const rows = [
    ['Clínica', d.clinic_name], ['Canales', d.channels], ['Canal principal', d.main_channel], ['Fricción', d.channel_friction], ['Detalle fricción', d.channel_friction_detail],
    ['WhatsApp clínico', d.whatsapp_clinical], ['Cantidad WhatsApp', d.whatsapp_count], ['WhatsApp detallados', d.whatsapp_numbers], ['Mezcla con otros servicios', d.whatsapp_mixed], ['Separación actual', d.whatsapp_mixed_process], ['Interés WhatsApp si no usan', d.whatsapp_interest], ['Razón de no uso', d.whatsapp_reason],
    ['Consultas clínicas', d.query_types], ['Información inicial', d.required_info], ['Frecuencia urgencias', d.urgent_frequency], ['Proceso urgencias', d.urgent_process], ['Nunca automatizar', d.automation_never],
    ['Primer receptor', d.initial_responder], ['Equipo digital', d.digital_team_size], ['Escalamiento veterinario', d.vet_escalation], ['Momentos difíciles', d.difficult_moments], ['Detalle momentos difíciles', d.difficult_moments_detail],
    ['AgendaPro', d.agendapro_uses], ['Copia manual', d.manual_copy], ['Qué copian', d.manual_copy_detail], ['Otros sistemas', d.other_systems],
    ['Objetivos web', d.web_goals], ['Preguntas repetidas web', d.web_repeated_questions], ['Interés mejora web', d.web_improvement_interest],
    ['Instagram', { frecuencia: d.instagram_frequency, responsable: d.instagram_responder, consultas: d.instagram_questions, interes: d.instagram_interest }],
    ['Facebook', { relevancia: d.facebook_relevance, interes: d.facebook_interest }],
    ['Prioridades', d.priorities], ['Mayor impacto 30 días', d.top_impact], ['Contexto adicional', d.missing_context], ['Contacto', `${d.contact_name}${d.contact_role ? ` · ${d.contact_role}` : ''}`], ['Email', d.contact_email]
  ];
  return rows.map(([a,b]) => `${a}: ${j(b)}`).join('\n\n');
}
async function deliver(d) {
  const payload = { _subject: 'Diagnóstico TriageVet — Pet House', _replyto: d.contact_email, _captcha: 'false', _template: 'table', tipo_solicitud: 'Diagnóstico de operación clínica digital — TriageVet', origen: 'parmux.com/triagevet/diagnostico', clinica: 'Pet House', contacto: d.contact_name, email: d.contact_email, prioridades: (d.priorities || []).join(', '), mayor_impacto_30_dias: d.top_impact, resumen_operacional: textSummary(d) };
  const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  const x = await r.json().catch(() => ({}));
  if (!r.ok || !(x.success === true || x.success === 'true')) throw new Error('delivery');
}

function choices(name, values, multi = false) {
  return `<div class="choices ${values.length > 6 ? 'three' : ''}">${values.map(v => `<label class="choice"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${v}"><span>${v}</span></label>`).join('')}</div>`;
}
function field(name, label, area = false, placeholder = '') {
  return `<label class="field"><span>${label}</span>${area ? `<textarea name="${name}" rows="3" placeholder="${placeholder}"></textarea>` : `<input name="${name}" placeholder="${placeholder}">`}</label>`;
}
function head(i, title, sub) { return `<header class="step-head"><p>Paso ${i} de 7</p><h2>${title}</h2><span>${sub}</span></header>`; }

function clientApp() {
  'use strict';
  const STORE = 'parmux:triagevet:pet-house:v2';
  const form = document.querySelector('#discovery-form');
  const panels = [...document.querySelectorAll('[data-step]')];
  const nav = [...document.querySelectorAll('[data-nav]')];
  const error = document.querySelector('#error');
  const workspace = document.querySelector('#workspace');
  const intro = document.querySelector('#intro');
  const success = document.querySelector('#success');
  const csrf = document.querySelector('meta[name="triagevet-csrf"]').content;
  let step = 0;

  const all = name => [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
  const radio = name => form.querySelector(`[name="${CSS.escape(name)}"]:checked`)?.value || '';
  const checks = name => all(name).filter(x => x.checked).map(x => x.value);
  const val = name => { const x = form.elements.namedItem(name); return x && typeof x.value === 'string' ? x.value.trim() : ''; };
  const escapeHtml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function selectedClasses() { document.querySelectorAll('.choice').forEach(x => x.classList.toggle('selected', !!x.querySelector('input')?.checked)); }
  function updateMain() {
    const box = document.querySelector('#main-channel'), current = radio('main_channel'), channels = checks('channels');
    box.innerHTML = channels.length ? channels.map(c => `<label class="choice"><input type="radio" name="main_channel" value="${escapeHtml(c)}"><span>${escapeHtml(c)}</span></label>`).join('') : '<small>Selecciona al menos un canal arriba.</small>';
    if (channels.includes(current)) { const input = [...box.querySelectorAll('input')].find(x => x.value === current); if (input) input.checked = true; }
    selectedClasses();
  }
  function readWhatsapp() {
    const out = [];
    for (let i=0;i<6;i++) {
      const number=val(`wa_${i}_number`), label=val(`wa_${i}_label`), responder=val(`wa_${i}_responder`), volume=val(`wa_${i}_volume`), uses=checks(`wa_${i}_uses`);
      if (number || label || responder || volume || uses.length) out.push({number,label,responder,volume,uses});
    }
    return out;
  }
  function renderWhatsapp(saved = readWhatsapp()) {
    const answer = radio('whatsapp_clinical'), yes = answer && answer !== 'No actualmente';
    document.querySelector('#wa-yes').hidden = !yes;
    document.querySelector('#wa-no').hidden = answer !== 'No actualmente';
    const countValue = radio('whatsapp_count');
    const count = countValue === '4 o más' ? 4 : Number(countValue) || 0;
    const box = document.querySelector('#wa-cards');
    if (!yes || !count) { box.innerHTML=''; return; }
    const uses = ['Consultas veterinarias','Agendamiento','Urgencias','Hospitalizados','Resultados / controles','Peluquería','Hotel','Administración','Otro'];
    box.innerHTML = Array.from({length:count},(_,i)=>{ const d=saved[i]||{}; return `<article class="wa-card"><h3>WhatsApp ${i+1}</h3><div class="two"><label class="field"><span>Número</span><input name="wa_${i}_number" value="${escapeHtml(d.number||'')}" placeholder="+56 9 …"></label><label class="field"><span>Uso o nombre interno</span><input name="wa_${i}_label" value="${escapeHtml(d.label||'')}" placeholder="Ej.: recepción, clínica, principal…"></label></div><fieldset><legend>¿Para qué se utiliza?</legend><div class="choices three">${uses.map(u=>`<label class="choice"><input type="checkbox" name="wa_${i}_uses" value="${u}" ${(d.uses||[]).includes(u)?'checked':''}><span>${u}</span></label>`).join('')}</div></fieldset><div class="two"><label class="field"><span>¿Quién responde?</span><input name="wa_${i}_responder" value="${escapeHtml(d.responder||'')}"></label><label class="field"><span>Volumen clínico aproximado</span><select name="wa_${i}_volume"><option value="">Seleccionar</option>${['Menos de 10/día','10–30/día','31–60/día','61–100/día','Más de 100/día','No sabemos'].map(v=>`<option ${d.volume===v?'selected':''}>${v}</option>`).join('')}</select></label></div></article>`; }).join('');
    selectedClasses();
  }
  function branches() {
    const c = checks('channels');
    document.querySelector('#instagram').hidden = !c.includes('Instagram');
    document.querySelector('#facebook').hidden = !c.includes('Facebook / Messenger');
  }
  function data() {
    const scalar=['clinic_name','client_id','main_channel','channel_friction','channel_friction_detail','whatsapp_clinical','whatsapp_count','whatsapp_mixed','whatsapp_mixed_process','whatsapp_interest','whatsapp_reason','urgent_frequency','urgent_process','automation_never','initial_responder','digital_team_size','vet_escalation','difficult_moments','difficult_moments_detail','manual_copy','manual_copy_detail','other_systems','web_repeated_questions','web_improvement_interest','instagram_frequency','instagram_responder','instagram_questions','instagram_interest','facebook_relevance','facebook_interest','top_impact','missing_context','contact_name','contact_role','contact_email','_honey'];
    const d=Object.fromEntries(scalar.map(n=>[n,radio(n)||val(n)]));
    ['channels','query_types','required_info','agendapro_uses','web_goals','priorities'].forEach(n=>d[n]=checks(n));
    d.whatsapp_numbers=readWhatsapp(); d.consent=form.querySelector('[name="consent"]:checked')?.value||''; d._step=step; return d;
  }
  function save(){ try{localStorage.setItem(STORE,JSON.stringify(data()));}catch{} }
  function restore(){ let d;try{d=JSON.parse(localStorage.getItem(STORE)||'null')}catch{} if(!d)return false;
    Object.entries(d).forEach(([n,v])=>{ if(n==='whatsapp_numbers'||n==='_step')return; if(Array.isArray(v))all(n).forEach(x=>x.checked=v.includes(x.value)); else { const nodes=all(n); if(nodes.some(x=>x.type==='radio'||x.type==='checkbox'))nodes.forEach(x=>x.checked=x.value===v); else { const x=form.elements.namedItem(n); if(x&&typeof v==='string')x.value=v; } } });
    updateMain(); renderWhatsapp(Array.isArray(d.whatsapp_numbers)?d.whatsapp_numbers:[]); branches(); step=Number.isInteger(d._step)?Math.max(0,Math.min(6,d._step)):0; selectedClasses(); return true;
  }
  function validate(){ if(step===0&&(!checks('channels').length||!radio('main_channel')))return'Indica los canales actuales y el principal.'; if(step===1&&!radio('whatsapp_clinical'))return'Indica si utilizan WhatsApp para consultas veterinarias.'; if(step===1&&radio('whatsapp_clinical')!=='No actualmente'&&!radio('whatsapp_count'))return'Indica cuántos números de WhatsApp utilizan.'; if(step===2&&(!checks('query_types').length||!radio('urgent_frequency')))return'Indica los tipos de consulta y la frecuencia de consultas urgentes.'; if(step===3&&!val('initial_responder'))return'Indica quién recibe normalmente el primer contacto clínico.'; if(step===5&&(checks('priorities').length<1||checks('priorities').length>3||!val('top_impact')))return'Selecciona hasta tres prioridades e indica cuál tendría mayor impacto.'; if(step===6&&(!val('contact_name')||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(val('contact_email'))||!form.querySelector('[name="consent"]:checked'))return'Completa nombre, email y confirmación final.'; return''; }
  function render(){ panels.forEach((p,i)=>p.hidden=i!==step); nav.forEach((n,i)=>{n.classList.toggle('active',i===step);n.classList.toggle('done',i<step)}); document.querySelector('#prev').hidden=step===0; document.querySelector('#next').hidden=step===6; document.querySelector('#submit').hidden=step!==6; error.textContent=''; branches(); renderWhatsapp(); selectedClasses(); save(); window.scrollTo({top:0,behavior:'smooth'}); }
  document.querySelector('#start').onclick=()=>{intro.hidden=true;workspace.hidden=false;render();};
  form.addEventListener('change',e=>{ if(e.target.name==='channels')updateMain(); if(e.target.name==='whatsapp_clinical'||e.target.name==='whatsapp_count')renderWhatsapp(); if(e.target.name==='priorities'&&checks('priorities').length>3){e.target.checked=false;error.textContent='Puedes seleccionar hasta tres prioridades.';} branches();selectedClasses();save(); });
  form.addEventListener('input',save);
  document.querySelector('#next').onclick=()=>{const m=validate();if(m){error.textContent=m;return;}step++;render();}; document.querySelector('#prev').onclick=()=>{step--;render();};
  form.onsubmit=async e=>{e.preventDefault();const m=validate();if(m){error.textContent=m;return;}const b=document.querySelector('#submit');b.disabled=true;b.textContent='Enviando…';try{const r=await fetch('/triagevet/diagnostico',{method:'POST',headers:{'Content-Type':'application/json','X-TriageVet-CSRF':csrf},body:JSON.stringify(data())});const x=await r.json().catch(()=>({}));if(!r.ok||x.ok!==true)throw 0;try{localStorage.removeItem(STORE)}catch{}workspace.hidden=true;success.hidden=false;window.scrollTo({top:0,behavior:'smooth'});}catch{error.textContent='No pudimos enviar el diagnóstico. Tus respuestas siguen guardadas; puedes volver a intentarlo.';b.disabled=false;b.textContent='Enviar diagnóstico →';}};
  const had=restore(); updateMain(); branches(); selectedClasses(); if(had){intro.hidden=true;workspace.hidden=false;render();}
}

function page(nonce, csrf) {
  const channels=['WhatsApp','Teléfono','AgendaPro','Sitio web / formulario','Instagram','Facebook / Messenger','Email','Google','Presencial','Otro'];
  const queries=['Solicitud de hora','Síntomas o problema de salud','Consulta potencialmente urgente','Controles','Resultados de exámenes','Paciente hospitalizado','Medicamentos o tratamientos','Precios','Horarios','Especialidades','Disponibilidad profesional','Fotos o videos','Exámenes o documentos','Seguimiento posterior','Otro'];
  const info=['Especie','Edad','Motivo','Síntomas','Tiempo de evolución','Estado general','Antecedentes','Medicamentos','Fotos o videos','Exámenes previos','Identificación del paciente','Otro'];
  const priorities=['Reducir consultas repetitivas','Responder más rápido','Evitar consultas importantes sin atender','Identificar casos prioritarios','Obtener antecedentes antes del equipo','Ordenar WhatsApp','Separar clínica de otros servicios','Mejorar derivaciones internas','Integrar WhatsApp y AgendaPro','Reducir carga de recepción','Mejorar trazabilidad','Mejorar recorrido del sitio','Ordenar Instagram','Otro'];
  const nav=['Canales','WhatsApp','Clínica','Operación','Digital','Prioridades','Cierre'];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><meta name="referrer" content="no-referrer"><meta name="triagevet-csrf" content="${csrf}"><title>Diagnóstico clínico digital · Pet House × TriageVet</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700&display=swap" rel="stylesheet"><style nonce="${nonce}">
:root{--ink:#17201f;--muted:#64716e;--line:#dde5e2;--paper:#f5f7f6;--card:#fff;--accent:#1d6b5d;--soft:#e9f3f0;--warn:#8a4d16}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}button,input,select,textarea{font:inherit}[hidden]{display:none!important}.shell{width:min(1180px,calc(100% - 28px));margin:auto;padding:18px 0 48px}.top{display:flex;align-items:center;justify-content:space-between;min-height:52px}.brand{display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit}.mark{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:var(--ink);color:#fff;font-weight:700}.brand strong,.brand small{display:block}.brand small{font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase}.badge{font-size:11px;padding:8px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--muted)}.intro,.success{max-width:850px;margin:10vh auto 0;text-align:center}.eyebrow{margin:0 0 13px;color:var(--accent);font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}h1,h2{font-family:Manrope,sans-serif;letter-spacing:-.045em}.intro h1,.success h1{font-size:clamp(38px,6vw,64px);line-height:1.03;margin:0}.lead{max-width:730px;margin:22px auto;color:var(--muted);font-size:18px;line-height:1.65}.facts{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;margin:26px 0}.facts span{padding:8px 12px;border:1px solid var(--line);background:#fff;border-radius:999px;font-size:12px}.note{max-width:690px;margin:26px auto;padding:17px 19px;border:1px solid #ccddd8;border-radius:14px;background:var(--soft);text-align:left}.note strong,.note span{display:block}.note span{margin-top:4px;color:#53635f;font-size:13px;line-height:1.55}.primary,.secondary{min-height:48px;padding:0 20px;border-radius:11px;font-weight:700;cursor:pointer}.primary{border:0;background:var(--ink);color:#fff}.secondary{border:1px solid var(--line);background:#fff;color:var(--ink)}.workspace{display:grid;grid-template-columns:235px 1fr;gap:28px;margin-top:42px;align-items:start}.side{position:sticky;top:16px}.side h2{font-size:25px;line-height:1.15;margin:0 0 20px}.nav{list-style:none;padding:0;margin:0;display:grid;gap:3px}.nav li{padding:9px 10px;border-radius:9px;color:#7d8986;font-size:12px}.nav li.active{background:#fff;color:var(--ink);box-shadow:0 5px 18px rgba(30,55,49,.06)}.nav li.done{color:var(--accent)}.scope{margin-top:20px;padding:14px 10px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);line-height:1.5}.card{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 22px 65px rgba(32,52,48,.08);padding:clamp(22px,4vw,42px)}.panel{display:grid;gap:27px}.step-head{padding-bottom:20px;border-bottom:1px solid var(--line)}.step-head p{margin:0 0 6px;color:var(--accent);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}.step-head h2{font-size:clamp(28px,4vw,39px);line-height:1.08;margin:0}.step-head span{display:block;margin-top:10px;color:var(--muted);line-height:1.55}fieldset{border:0;padding:0;margin:0}legend,.field>span{display:block;margin-bottom:10px;font-weight:600;line-height:1.4}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.choices.three{grid-template-columns:repeat(3,minmax(0,1fr))}.choice{position:relative;min-height:48px;display:flex;align-items:center;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fbfcfc;color:#46524f;cursor:pointer}.choice input{position:absolute;opacity:0}.choice.selected{border-color:#78a99e;background:var(--soft);color:#145145}.choice span{font-size:12px;font-weight:550;line-height:1.3}.field input,.field select,.field textarea{width:100%;border:1px solid var(--line);border-radius:10px;background:#fbfcfc;color:var(--ink);outline:none}.field input,.field select{height:47px;padding:0 12px}.field textarea{min-height:90px;padding:11px 12px;resize:vertical;line-height:1.5}.field input:focus,.field select:focus,.field textarea:focus{border-color:#77a99e;box-shadow:0 0 0 3px rgba(29,107,93,.08)}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wa-card,.branch{padding:17px;border:1px solid #d6e2de;border-radius:13px;background:#fafcfc;display:grid;gap:16px}.wa-card h3{margin:0;font-size:15px}.branch>strong{color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.1em}.emphasis{padding:17px;border-radius:13px;background:var(--soft)}.consent{display:flex;gap:10px;align-items:flex-start;padding:16px;border:1px solid var(--line);border-radius:12px;background:#fbfcfc;color:#4f5c59;font-size:12px;line-height:1.5}.error{min-height:18px;color:var(--warn);font-size:12px;font-weight:600;margin:19px 0 0}.actions{display:flex;gap:10px;justify-content:space-between;padding-top:20px;margin-top:10px;border-top:1px solid var(--line)}.actions .primary{margin-left:auto}.saved{text-align:right;color:#8a9593;font-size:10px}.honey{position:absolute;left:-9999px}.success .check{width:50px;height:50px;margin:0 auto 20px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:23px}.success p{max-width:690px;margin:20px auto;color:var(--muted);font-size:16px;line-height:1.65}@media(max-width:850px){.workspace{grid-template-columns:1fr}.side{position:static}.side h2,.scope{display:none}.nav{display:flex;overflow:auto}.nav li{min-width:max-content}.choices.three{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.badge{display:none}.intro{margin-top:7vh}.intro h1{font-size:41px}.card{padding:20px 15px}.choices,.choices.three,.two{grid-template-columns:1fr}.actions{position:sticky;bottom:0;margin-left:-15px;margin-right:-15px;padding:11px 15px calc(11px + env(safe-area-inset-bottom));background:rgba(255,255,255,.94);backdrop-filter:blur(8px)}.actions button{flex:1}.saved{text-align:center}}
</style></head><body><main class="shell"><header class="top"><a class="brand" href="/"><span class="mark">P</span><span><strong>PARMUX</strong><small>TriageVet</small></span></a><span class="badge">Diagnóstico privado · Pet House</span></header><section class="intro" id="intro"><p class="eyebrow">Pet House × TriageVet</p><h1>Antes de mostrar una solución, queremos entender cómo funciona su clínica.</h1><p class="lead">Cada clínica organiza de manera distinta sus consultas, agenda, WhatsApp y equipo. Este diagnóstico permite preparar una demostración centrada sólo en aquello que pueda aportar valor.</p><div class="facts"><span>5–8 minutos</span><span>Respuestas aproximadas están bien</span><span>Sin datos de pacientes</span></div><div class="note"><strong>No buscamos reemplazar herramientas que ya funcionan.</strong><span>Primero reconstruimos el recorrido clínico actual; después proponemos mejoras progresivas y específicas.</span></div><button class="primary" id="start">Comenzar →</button></section><div class="workspace" id="workspace" hidden><aside class="side"><p class="eyebrow">Diagnóstico operacional</p><h2>Una imagen completa, paso a paso.</h2><ol class="nav">${nav.map((n,i)=>`<li data-nav>${String(i+1).padStart(2,'0')} · ${n}</li>`).join('')}</ol><div class="scope"><strong>Alcance clínico:</strong> TriageVet se evalúa exclusivamente para la operación veterinaria. Hotel y peluquería sólo se consultan para entender si comparten canales.</div></aside><form class="card" id="discovery-form" novalidate><input type="hidden" name="clinic_name" value="Pet House"><input type="hidden" name="client_id" value="pet-house"><label class="honey">No completar<input name="_honey" tabindex="-1" autocomplete="off"></label>
<section class="panel" data-step>${head(1,'¿Cómo llegan hoy las consultas clínicas?','Mapeamos la puerta de entrada antes de hablar de automatización.')}<fieldset><legend>¿Por qué canales reciben consultas relacionadas con la clínica veterinaria?</legend>${choices('channels',channels,true)}</fieldset><fieldset><legend>¿Cuál concentra hoy la mayor cantidad de consultas clínicas?</legend><div id="main-channel"></div></fieldset><fieldset><legend>¿Hay algún canal que genere más trabajo, desorden o consultas repetidas?</legend>${choices('channel_friction',['Sí','No','No estamos seguros'])}</fieldset>${field('channel_friction_detail','Si corresponde, ¿qué ocurre principalmente?',true,'Ej.: consultas duplicadas, mensajes sin respuesta, información repartida…')}</section>
<section class="panel" data-step hidden>${head(2,'Arquitectura real de WhatsApp','Necesitamos saber cuántos canales existen y qué función cumple cada uno.')}<fieldset><legend>¿Utilizan actualmente WhatsApp para consultas veterinarias?</legend>${choices('whatsapp_clinical',['Sí, regularmente','Sí, de forma limitada','Sólo determinadas consultas','No actualmente'])}</fieldset><div id="wa-yes" hidden><fieldset><legend>¿Cuántos números de WhatsApp utiliza actualmente Pet House?</legend>${choices('whatsapp_count',['1','2','3','4 o más'])}</fieldset><div id="wa-cards"></div><fieldset><legend>¿Alguno mezcla consultas clínicas con hotel, peluquería u otros servicios?</legend>${choices('whatsapp_mixed',['Sí','No','No estamos seguros'])}</fieldset>${field('whatsapp_mixed_process','¿Cómo distinguen actualmente unas consultas de otras?',true)}</div><div id="wa-no" hidden><fieldset><legend>¿Les interesaría evaluar WhatsApp como canal clínico si pudiera funcionar de forma estructurada y controlada?</legend>${choices('whatsapp_interest',['Sí','Tal vez','No por ahora'])}</fieldset>${field('whatsapp_reason','¿Existe alguna razón por la que hoy prefieran no utilizarlo?',true)}</div></section>
<section class="panel" data-step hidden>${head(3,'Qué ocurre cuando la consulta ya es clínica','TriageVet sólo tiene sentido si respeta los límites y criterios de la clínica.')}<fieldset><legend>¿Qué tipos de consultas reciben habitualmente?</legend>${choices('query_types',queries,true)}</fieldset><fieldset><legend>¿Qué información necesitan normalmente antes de decidir qué hacer?</legend>${choices('required_info',info,true)}</fieldset><fieldset><legend>¿Con qué frecuencia reciben consultas potencialmente urgentes?</legend>${choices('urgent_frequency',['Frecuentemente','A veces','Muy pocas','No'])}</fieldset>${field('urgent_process','¿Cómo reconocen y derivan actualmente esos casos?',true)}${field('automation_never','¿Qué situaciones o preguntas nunca debería responder automáticamente un sistema?',true)}</section>
<section class="panel" data-step hidden>${head(4,'Equipo, derivación y sistemas','Queremos entender dónde termina la clasificación inicial y dónde continúan AgendaPro y el equipo.')}${field('initial_responder','¿Quién recibe normalmente el primer contacto clínico?',false,'Ej.: recepción, técnico veterinario, depende del horario…')}${field('digital_team_size','¿Cuántas personas participan aproximadamente en los canales digitales?')}${field('vet_escalation','Cuando recepción necesita intervención veterinaria, ¿qué ocurre?',true)}<fieldset><legend>¿Hay momentos del día en que responder o clasificar sea especialmente difícil?</legend>${choices('difficult_moments',['Sí','A veces','No'])}</fieldset>${field('difficult_moments_detail','¿Cuándo ocurre principalmente?',true)}<fieldset><legend>¿Para qué utilizan actualmente AgendaPro?</legend>${choices('agendapro_uses',['Reserva de horas','Agenda de profesionales','Fichas de pacientes','Recordatorios','Pagos','Gestión interna','Otro'],true)}</fieldset><fieldset><legend>Cuando una conversación comienza fuera de AgendaPro, ¿copian información manualmente después?</legend>${choices('manual_copy',['Sí','A veces','No'])}</fieldset>${field('manual_copy_detail','¿Qué información tienen que copiar?',true)}${field('other_systems','¿Utilizan otros sistemas relevantes para la operación clínica?',true,'Opcional')}</section>
<section class="panel" data-step hidden>${head(5,'Ecosistema digital alrededor de la clínica','Sólo profundizamos en canales que realmente tengan valor operativo.')}<fieldset><legend>¿Qué esperan principalmente que pueda resolver una persona desde el sitio web?</legend>${choices('web_goals',['Conocer servicios clínicos','Encontrar especialista','Solicitar hora','Urgencias','Contactar recepción','Iniciar WhatsApp','Horarios','Precios','Ubicación','Resolver dudas antes de contactar','Otro'],true)}</fieldset>${field('web_repeated_questions','¿Qué preguntas repetidas podría resolver mejor el sitio?',true)}<fieldset><legend>Si detectamos fricciones concretas entre sitio, consulta y agenda, ¿estarían abiertos a evaluar mejoras?</legend>${choices('web_improvement_interest',['Sí','Probablemente','Preferimos revisarlo primero','No por ahora'])}</fieldset><div class="branch" id="instagram" hidden><strong>Instagram</strong><fieldset><legend>¿Con qué frecuencia reciben consultas veterinarias?</legend>${choices('instagram_frequency',['Frecuentemente','A veces','Muy pocas','No'])}</fieldset>${field('instagram_responder','¿Quién responde actualmente?')}${field('instagram_questions','¿Qué preguntas reciben principalmente?',true)}<fieldset><legend>¿Les interesaría evaluar más adelante respuestas controladas y derivación clínica desde Instagram?</legend>${choices('instagram_interest',['Sí','Tal vez','No por ahora'])}</fieldset></div><div class="branch" id="facebook" hidden><strong>Facebook / Messenger</strong><fieldset><legend>¿Sigue siendo un canal relevante?</legend>${choices('facebook_relevance',['Sí','Secundario','Muy poco'])}</fieldset><fieldset><legend>Si tiene suficiente uso, ¿les interesaría integrarlo posteriormente al mismo esquema?</legend>${choices('facebook_interest',['Sí','Tal vez','No por ahora'])}</fieldset></div></section>
<section class="panel" data-step hidden>${head(6,'¿Dónde tendría más impacto intervenir?','Seleccionen hasta tres prioridades. La propuesta se construirá alrededor de ellas.')}<fieldset><legend>Prioridades principales · máximo 3</legend>${choices('priorities',priorities,true)}</fieldset><div class="emphasis">${field('top_impact','Si pudiéramos mejorar una sola parte durante los próximos 30 días, ¿cuál tendría mayor impacto para Pet House?',true)}</div>${field('missing_context','¿Hay algo particular de la operación que debamos entender antes de preparar la demo?',true,'Opcional')}</section>
<section class="panel" data-step hidden>${head(7,'Listo. ¿Con quién coordinamos la demostración?','Usaremos estos datos únicamente para continuar esta evaluación por escrito.')}<div class="two">${field('contact_name','Nombre',false,'Ej.: Constanza Silva')}${field('contact_role','Cargo o función',false,'Opcional')}</div><label class="field"><span>Email</span><input type="email" name="contact_email" autocomplete="email"></label><label class="consent"><input type="checkbox" name="consent" value="Confirmado"><span>Confirmo que las respuestas describen de forma aproximada la operación y no incluyen datos personales ni clínicos identificables de pacientes.</span></label><div class="note"><strong>Qué sucede después</strong><span>PARMUX preparará una demostración de TriageVet enfocada en la operación clínica real. Sitio, Instagram, Facebook o integraciones sólo se propondrán si las respuestas muestran que aportan valor.</span></div></section>
<p class="error" id="error" role="alert"></p><div class="actions"><button class="secondary" id="prev" type="button">← Atrás</button><button class="primary" id="next" type="button">Continuar →</button><button class="primary" id="submit" type="submit" hidden>Enviar diagnóstico →</button></div><p class="saved">Las respuestas se guardan temporalmente en este dispositivo.</p></form></div><section class="success" id="success" hidden><div class="check">✓</div><p class="eyebrow">Diagnóstico recibido</p><h1>Ya tenemos una imagen mucho más clara.</h1><p>Revisaremos el recorrido clínico, WhatsApp, AgendaPro y los canales digitales relevantes para preparar una demostración centrada en la operación real de Pet House.</p><p><strong>TriageVet · PARMUX</strong><br>Tecnología que devuelve tiempo.</p></section></main><script nonce="${nonce}">(${clientApp.toString()})();</script></body></html>`;
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const session = tokenFrom(req);
  if (method === 'GET') {
    const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';
    if (access) {
      if (!validToken(access)) { security(res,'text/html; charset=utf-8'); return res.status(404).send('<!doctype html><meta charset="utf-8"><title>No disponible</title>'); }
      security(res,'text/plain; charset=utf-8');
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(access)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`);
      res.setHeader('Location','/triagevet/diagnostico');
      return res.status(302).send('');
    }
    if (!validToken(session)) { security(res,'text/html; charset=utf-8'); return res.status(404).send('<!doctype html><meta charset="utf-8"><title>No disponible</title>'); }
    const nonce=randomBytes(16).toString('base64'); security(res,'text/html; charset=utf-8',nonce); return res.status(200).send(page(nonce,csrfFor(session)));
  }
  if (method === 'POST') {
    if (!validToken(session) || !sameOrigin(req)) return json(res,403,{ok:false,error:'invalid_request'});
    const supplied=req.headers['x-triagevet-csrf']; if(typeof supplied!=='string'||hash(supplied)!==hash(csrfFor(session))) return json(res,403,{ok:false,error:'invalid_request'});
    let data; try { data=readBody(req); const state=validate(data); if(state==='honeypot') return json(res,200,{ok:true}); } catch { return json(res,400,{ok:false,error:'invalid_form'}); }
    try { await deliver(data); return json(res,200,{ok:true}); } catch { return json(res,502,{ok:false,error:'delivery_unavailable'}); }
  }
  res.setHeader('Allow','GET, POST'); return json(res,405,{ok:false,error:'method_not_allowed'});
};
