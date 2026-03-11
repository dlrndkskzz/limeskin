// api/remind.js - Vercel Cron: 매일 UTC 06:00 (KST 15:00) 실행 → 내일 예약 리마인드 발송
const crypto = require('crypto');

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET || 'limeskin2026';

const API_KEY = process.env.SOLAPI_API_KEY || 'NCSN84FMPLK0ZRJV';
const API_SECRET_KEY = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
const PFID = process.env.SOLAPI_PFID || 'KA01PF260303011802344MukuvkKjzXI';
const SENDER_PHONE = process.env.SOLAPI_SENDER_PHONE || '01032057451';
const TPL_REMIND = 'KA01TP260303085208365I0uoVbWPhTo';

function getSignature(date) {
  const salt = crypto.randomBytes(32).toString('hex');
  const message = date + salt;
  const hmac = crypto.createHmac('sha256', API_SECRET_KEY);
  hmac.update(message);
  const signature = hmac.digest('hex');
  return { salt, signature };
}

async function sendAlimtalk(to, templateId, variables) {
  const date = new Date().toISOString();
  const { salt, signature } = getSignature(date);
  await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`
    },
    body: JSON.stringify({
      message: {
        to, from: SENDER_PHONE,
        kakaoOptions: { pfId: PFID, templateId, variables, disableSms: true }
      }
    })
  });
}

async function redisGet(key) {
  const res = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

module.exports = async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const raw = await redisGet('limeskin_alldata');
    if (!raw) return res.status(200).json({ message: 'No data' });
    const appData = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const { bookings = [], members = [], settings = {} } = appData;

    // 내일 날짜 (KST 기준)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kstNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const tomorrowBookings = bookings.filter(b =>
      b.date === tomorrowStr && ['pending', 'confirmed'].includes(b.status)
    );

    let sent = 0;
    for (const b of tomorrowBookings) {
      if (!b.phone) continue;
      const variables = {
        '#{고객명}': b.name || '',
        '#{시간}': b.time || '',
        '#{서비스}': b.service || ''
      };
      await sendAlimtalk(b.phone, TPL_REMIND, variables);
      sent++;
    }

    return res.status(200).json({ success: true, sent, date: tomorrowStr });
  } catch (err) {
    console.error('remind error:', err);
    return res.status(500).json({ error: err.message });
  }
};
