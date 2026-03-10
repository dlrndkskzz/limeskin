// api/alimtalk.js
// Vercel Serverless Function - 솔라피 알림톡 발송 (HMAC-SHA256)

const crypto = require('crypto');

const API_KEY    = process.env.SOLAPI_API_KEY    || 'NCSN84FMPLK0ZRJV';
const API_SECRET = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';

function makeSignature() {
  const date     = new Date().toISOString();
  const salt     = Math.random().toString(36).substring(2, 14) +
                   Math.random().toString(36).substring(2, 14);
  const hmac     = crypto.createHmac('sha256', API_SECRET);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // 필수값 검증
    const msg = body && body.messages && body.messages[0];
    if (!msg || !msg.to) {
      return res.status(400).json({ error: '수신번호(to)가 없습니다.' });
    }
    if (!msg.from) {
      return res.status(400).json({ error: '발신번호(from)가 없습니다.' });
    }

    const authorization = makeSignature();

    const solapiRes = await fetch('https://api.solapi.com/messages/v4/send-many', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: JSON.stringify(body),
    });

    const data = await solapiRes.json();

    if (!solapiRes.ok || data.errorCode) {
      console.error('[솔라피 오류]', data);
      return res.status(400).json({
        ok: false,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage || '알림톡 발송 실패',
        raw: data,
      });
    }

    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error('[서버 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
