// api/data.js - 전체 데이터 저장/불러오기
const KEY = 'limeskin_alldata';

async function redisGet(url, token) {
  const r = await fetch(`${url}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  if (!j.result) return null;
  try { return typeof j.result === 'string' ? JSON.parse(j.result) : j.result; } catch(e) { return null; }
}

async function redisSet(url, token, value) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([["SET", KEY, JSON.stringify(value)]])
  });
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(500).json({ ok: false, error: 'KV 환경변수 없음' });

  // GET - 데이터 불러오기
  if (req.method === 'GET') {
    try {
      const data = await redisGet(url, token);
      return res.status(200).json({ ok: true, data: data || null });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // POST - 데이터 저장
  if (req.method === 'POST') {
    try {
      const { members, bookings, tickets, ticketHistory, services, settings } = req.body || {};
      const value = { members: members||[], bookings: bookings||[], tickets: tickets||[],
        ticketHistory: ticketHistory||[], services: services||[], settings: settings||{},
        updatedAt: new Date().toISOString() };
      await redisSet(url, token, value);
      // sync도 같이 업데이트 (리마인드용)
      await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([["SET", "limeskin_data", JSON.stringify({ bookings: bookings||[], members: members||[], settings: settings||{} })]])
      });
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).end();
};
