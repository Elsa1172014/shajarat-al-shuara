module.exports = async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      ok: false,
      stage: 'environment',
      error: 'GEMINI_API_KEY is not configured'
    });
  }

  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const expireTime = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        authToken: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.name) {
      return res.status(502).json({
        ok: false,
        stage: 'ephemeral-token',
        googleStatus: response.status,
        googleError: data?.error?.message || 'Token was not returned',
        latencyMs: Date.now() - started,
      });
    }

    return res.status(200).json({
      ok: true,
      stage: 'ephemeral-token',
      message: 'Gemini Live ephemeral token can be created successfully',
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      stage: 'request',
      error: error?.name === 'AbortError' ? 'Google auth token request timed out' : (error?.message || 'Unexpected error'),
      latencyMs: Date.now() - started,
    });
  }
};
