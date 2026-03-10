// api/sync.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    console.error('[sync] 환경변수 없음 - KV_REST_API_URL:', url);
    return res.status(500).json({ ok: false, error: '환경변수 없음' });
  }

  try {
    const { bookings, members, settings } = req.body || {};
    const value = JSON.stringify({ bookings: bookings||[], members: members||[], settings: settings||{} });

    const r = await fetch(`${url}/set/limeskin_data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    const data = await r.json();
    console.log('[sync] 저장결과:', JSON.stringify(data));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[sync 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
