'use strict';

const { ingestRequest } = require('./lib/questionnaire-storage');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  try {
    const request = await ingestRequest({ action: 'health' });
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(`[QUESTIONNAIRE_STORAGE_HEALTH] upstream_${response.status}`);
      return res.status(503).json({
        ok: false,
        error: 'storage_unavailable',
        diagnostic: `upstream_${response.status}`,
      });
    }
    return res.status(200).json({ ok: true, storage: 'reachable', auth: 'vercel_oidc' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`[QUESTIONNAIRE_STORAGE_HEALTH] ${message}`);
    return res.status(503).json({
      ok: false,
      error: 'storage_unavailable',
      diagnostic: message === 'missing_vercel_oidc_token' ? 'oidc_missing' : 'request_failed',
    });
  }
};
