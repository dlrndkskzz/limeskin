// api/data.js - Upstash Redis GET/POST
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const REDIS_KEY = 'limeskin_alldata';

async function redisGet(key) {
  const res = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

async function redisSet(key, value) {
  const res = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  try {
    if (req.method === 'GET') {
      const raw = await redisGet(REDIS_KEY);
      if (!raw) return res.status(200).json({ data: null });
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json({ data: parsed });
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (!body) return res.status(400).json({ error: 'No data' });
      const payload = JSON.stringify({ ...body, updatedAt: new Date().toISOString() });
      await redisSet(REDIS_KEY, payload);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('data.js error:', err);
    return res.status(500).json({ error: err.message });
  }
};
