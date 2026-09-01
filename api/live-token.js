module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured', stage: 'environment' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const expireTime = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 55 * 1000).toISOString();

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
      }),
      signal: controller.signal,
    });

    let data = {};
    try { data = await response.json(); } catch (_) {}

    if (!response.ok || !data?.name) {
      console.error('Live token error', response.status, JSON.stringify(data));
      return res.status(502).json({
        error: data?.error?.message || 'Could not create Live API token',
        stage: 'token',
        upstreamStatus: response.status,
      });
    }

    return res.status(200).json({ token: data.name });
  } catch (error) {
    console.error('Live token exception', error);
    return res.status(error?.name === 'AbortError' ? 504 : 500).json({
      error: error?.name === 'AbortError' ? 'Live token request timed out' : 'Unexpected server error',
      stage: 'token',
    });
  } finally {
    clearTimeout(timer);
  }
};
