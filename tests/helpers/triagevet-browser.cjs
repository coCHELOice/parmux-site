'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../triagevet-discovery.js'), 'utf8');

function browser(identity, sharedStorage, uuid, options = {}) {
  const fields = new Map();
  const listeners = {};
  let pendingSubmission;
  let generated = 0;
  const element = () => ({
    value: '', type: 'text', hidden: true, disabled: false, textContent: '', innerHTML: '', events: {},
    classList: { toggle() {} }, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(event, fn) { this.events[event] = fn; }, appendChild() {}, after() {},
  });
  const scalar = {
    client_id: identity.id, clinic_name: identity.name, contact_name: '', contact_role: '', contact_email: '',
    initial_responder: '', top_impact: '',
  };
  for (const [name, value] of Object.entries(scalar)) fields.set(name, [{ ...element(), value }]);
  for (const [name, value] of Object.entries({ channels: 'Email', query_types: 'Horarios', priorities: 'Mejorar trazabilidad', consent: 'Confirmado' })) {
    fields.set(name, [{ ...element(), value, type: 'checkbox', checked: false }]);
  }
  for (const [name, value] of Object.entries({ main_channel: 'Email', whatsapp_clinical: 'No actualmente', urgent_frequency: 'No' })) {
    fields.set(name, [{ ...element(), value, type: 'radio', checked: false }]);
  }
  const key = `parmux:triagevet:${identity.id}:v3`;
  if (options.answers && !sharedStorage.has(key)) {
    sharedStorage.set(key, JSON.stringify({ ...options.answers, client_id: identity.id, clinic_name: identity.name, _step: 6 }));
  }
  const named = (selector) => {
    if (selector === 'input, textarea, select') return [...fields.values()].flat();
    const name = selector.match(/name="([^"]+)"/)?.[1];
    const controls = fields.get(name) || [];
    return selector.endsWith(':checked') ? controls.filter((item) => item.checked) : controls;
  };
  const form = {
    elements: { namedItem: (name) => fields.get(name)?.[0] },
    querySelectorAll: named, querySelector: (selector) => named(selector)[0] || null,
    addEventListener: (event, fn) => { listeners[event] = fn; },
    requestSubmit() { pendingSubmission = listeners.submit({ preventDefault() {} }); },
  };
  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (selector === '#discovery-form') return form;
      if (selector.startsWith('meta[')) return { content: options.csrf || 'offline-csrf' };
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll: () => [], createElement: element,
  };
  const storage = options.storage || {
    getItem: (name) => sharedStorage.get(name) || null,
    setItem: (name, value) => sharedStorage.set(name, value), removeItem: (name) => sharedStorage.delete(name),
  };
  const context = vm.createContext({
    document, CSS: { escape: (value) => value },
    window: { scrollTo() {}, confirm: options.confirm || (() => true) },
    crypto: { randomUUID: () => Array.isArray(uuid) ? uuid[Math.min(generated++, uuid.length - 1)] : uuid },
    localStorage: storage,
    fetch: options.fetch || (() => { throw new Error('network_forbidden'); }),
  });
  vm.runInContext(source, context);
  return {
    field: (name) => fields.get(name)[0],
    node: (selector) => document.querySelector(selector),
    save: () => listeners.input(),
    async submit() { if (!document.querySelector('#submit').disabled) await listeners.submit({ preventDefault() {} }); },
    async recover() { document.querySelector('#new-submission').events.click(); await pendingSubmission; },
  };
}

module.exports = { browser };
