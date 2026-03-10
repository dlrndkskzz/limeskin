// api/sync.js
// 앱 → 서버 데이터 동기화 (Upstash Redis)

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { bookings, members, settings } = req.body || {};
    await redis.set('limeskin_data', JSON.stringify({
      bookings: bookings || [],
      members:  members  || [],
      settings: settings || {}
    }));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[sync 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
