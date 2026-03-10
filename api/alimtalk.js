// api/alimtalk.js
// Vercel Serverless Function - 솔라피 알림톡 단건 발송 (HMAC-SHA256)

const crypto = require('crypto');

const API_KEY    = process.env.SOLAPI_API_KEY    || 'NCSN84FMPLK0ZRJV';
const API_SECRET = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';

function makeSignature() {
  const date      = new Date().toISOString();
  const salt      = crypto.randomBytes(16).toString('hex');
  const hmac      = crypto.createHmac('sha256', API_SECRET);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const msg  = body && body.messages && body.messages[0];

    if (!msg)       return res.status(400).json({ ok: false, errorMessage: '메시지가 없습니다.' });
    if (!msg.to)    return res.status(400).json({ ok: false, errorMessage: '수신번호(to)가 없습니다.' });
    if (!msg.from)  return res.status(400).json({ ok: false, errorMessage: '발신번호(from)가 없습니다. 업체 설정에서 발신 전화번호를 저장하세요.' });

    // ── 단건 발송 엔드포인트 사용 ──────────────────────────────
    const solapiPayload = {
      message: {
        to:   msg.to,
        from: msg.from,
        type: 'ATA',
        text: msg.text || '',
        kakaoOptions: msg.kakaoOptions || {}
      }
    };

    console.log('[솔라피 요청]', JSON.stringify(solapiPayload));

    const solapiRes = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': makeSignature(),
      },
      body: JSON.stringify(solapiPayload),
    });

    const data = await solapiRes.json();
    console.log('[솔라피 응답]', JSON.stringify(data));

    // 솔라피는 HTTP 200이어도 내부 failedMessageList에 오류를 담을 수 있음
    const failed = data.failedMessageList && data.failedMessageList[0];
    if (failed) {
      return res.status(200).json({
        ok:           false,
        errorCode:    failed.errorCode,
        errorMessage: failed.errorMessage || '알림톡 발송 실패',
        raw:          data,
      });
    }

    // HTTP 오류 또는 최상위 errorCode
    if (!solapiRes.ok || data.errorCode) {
      return res.status(200).json({
        ok:           false,
        errorCode:    data.errorCode,
        errorMessage: data.errorMessage || '알림톡 발송 실패',
        raw:          data,
      });
    }

    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error('[서버 오류]', err);
    return res.status(500).json({ ok: false, errorMessage: err.message });
  }
};
