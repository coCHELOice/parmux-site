const { createHash, timingSafeEqual } = require('node:crypto');
const discoveryHandler = require('./triagevet-discovery-v3');

const ACCESS_TOKEN_HASH = '4b3ba060403a4b21b68a89e0b3f638e1d918859f8a51e68ee990b3d71805b6db';
const ACCESS_EXPIRES_AT = Date.parse('2026-10-16T02:59:59.000Z');
const SESSION_COOKIE = '__Host-parmux_triagevet_discovery';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

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

function unavailable(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(404).send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Enlace no disponible | PARMUX</title><body><main><h1>Este enlace privado no está disponible.</h1><p>Si recibiste este enlace directamente de PARMUX, vuelve a abrir el enlace completo o responde al correo de contacto.</p></main></body></html>');
}

module.exports = async function handler(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  const access = typeof req.query?.access === 'string' ? req.query.access.trim() : '';

  if (method === 'GET' && access) {
    if (!validToken(access)) return unavailable(res);

    // Lax is intentional: the private link is normally opened from an external
    // email, WhatsApp or messaging app. Strict can suppress the cookie on the
    // immediate redirect in some mobile browsers, resulting in a false 404.
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(access)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
    res.setHeader('Set-Cookie', cookie);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    res.setHeader('Location', '/triagevet/diagnostico');
    return res.status(302).end();
  }

  return discoveryHandler(req, res);
};
