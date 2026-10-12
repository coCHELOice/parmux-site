'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { browser } = require('./helpers/triagevet-browser.cjs');

test('the real frontend keeps draft answers and submission UUIDs separate across clinics', () => {
  const storage = new Map();
  const firstId = 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const secondId = 'b42e36c1-b20f-4ee1-9f41-0ae18cc04d58';
  const first = browser({ id: 'pet-house', name: 'Pet House' }, storage, firstId);
  first.field('contact_name').value = 'Draft A';
  first.save();
  const second = browser({ id: 'clinica-demo', name: 'Clínica Demo' }, storage, secondId);
  assert.equal(second.field('contact_name').value, '');
  second.field('contact_name').value = 'Draft B';
  second.save();
  const restored = browser({ id: 'pet-house', name: 'Pet House' }, storage, firstId);
  assert.equal(restored.field('contact_name').value, 'Draft A');
  assert.equal(storage.get('parmux:triagevet:pet-house:v3:submission-id'), firstId);
  assert.equal(storage.get('parmux:triagevet:clinica-demo:v3:submission-id'), secondId);
  assert.equal(JSON.parse(storage.get('parmux:triagevet:clinica-demo:v3')).contact_name, 'Draft B');
});

test('cached or edited identity fields cannot overwrite the clinic rendered by the server', () => {
  const key = 'parmux:triagevet:clinica-demo:v3';
  const storage = new Map([[key, JSON.stringify({ client_id: 'other-clinic', clinic_name: 'Other Clinic', contact_name: 'Wrong draft' })]]);
  const first = browser({ id: 'clinica-demo', name: 'Clínica Demo' }, storage, 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58');
  assert.equal(first.field('contact_name').value, '');
  storage.set(key, JSON.stringify({ client_id: 'clinica-demo', clinic_name: 'Wrong Name', contact_name: 'Right draft' }));
  const restored = browser({ id: 'clinica-demo', name: 'Clínica Demo' }, storage, 'a42e36c1-b20f-4ee1-9f41-0ae18cc04d58');
  assert.equal(restored.field('clinic_name').value, 'Clínica Demo');
  assert.equal(restored.field('contact_name').value, 'Right draft');
  restored.field('client_id').value = 'other-clinic';
  restored.field('clinic_name').value = 'Other Clinic';
  restored.save();
  const saved = JSON.parse(storage.get(key));
  assert.equal(saved.client_id, 'clinica-demo');
  assert.equal(saved.clinic_name, 'Clínica Demo');
});
