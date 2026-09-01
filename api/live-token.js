module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

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
    });

    const data = await response.json();
    if (!response.ok || !data?.name) {
      console.error('Live token error', response.status, JSON.stringify(data));
      return res.status(502).json({ error: 'Could not create Live API token' });
    }

    return res.status(200).json({ token: data.name });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
