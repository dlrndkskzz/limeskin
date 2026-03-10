// api/sync.js
// 앱 → 서버 데이터 동기화 (예약/회원 데이터 저장)
// limeskin.html에서 saveData() 호출 시 같이 전송

const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { bookings, members, settings } = req.body || {};
    await kv.set('limeskin_bookings', { bookings: bookings||[], members: members||[], settings: settings||{} });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[sync 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
