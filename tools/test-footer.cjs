const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const footer = html.match(/<footer class="parmux-footer">[\s\S]*?<\/footer>/)?.[0];

test('homepage includes the business details supplied by PARMUX', () => {
  assert.ok(footer, 'The company footer must be present');
  for (const value of ['PARMUX SPA', 'VILLANELO 180 OF 606', 'VINA DEL MAR, Valparaíso 2520000', 'Chile']) {
    assert.ok(footer.includes(value), `Missing exact business detail: ${value}`);
  }
  assert.match(footer, /<address>[^]*?<\/address>/);
});

test('business telephone and website use the exact approved links', () => {
  assert.ok(footer.includes('<a href="tel:+56991020231">+56991020231</a>'));
  assert.ok(footer.includes('<a href="https://parmux.com/">https://parmux.com/</a>'));
  assert.ok(!html.includes('wa.me/56991020231'), 'Business telephone is not the WhatsApp channel');
  assert.ok(html.includes('wa.me/56961597939'), 'Preserve the existing WhatsApp channel');
});

test('existing contact emails and legal navigation remain accessible', () => {
  for (const email of ['contacto@parmux.com', 'negocios@parmux.com']) {
    assert.ok(footer.includes(`href="mailto:${email}"`));
  }
  for (const page of ['privacidad', 'terminos', 'cookies', 'eliminacion-datos']) {
    assert.ok(footer.includes(`href="legal/${page}.html"`));
  }
  assert.ok(footer.includes('aria-label="Información legal"'));
  for (const id of ['footer-company-title', 'footer-contact-title']) {
    assert.ok(footer.includes(`aria-labelledby="${id}"`));
    assert.ok(footer.includes(`id="${id}"`));
  }
});

test('the existing structured-data script remains allowed by the CSP', () => {
  const structuredData = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  JSON.parse(structuredData);
  const hash = createHash('sha256').update(structuredData.replace(/\r\n/g, '\n')).digest('base64');
  const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
  const csp = config.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy').value;
  assert.ok(csp.includes(`'sha256-${hash}'`));
});
