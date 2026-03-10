// api/remind.js
// Vercel Cron - 매일 KST 15시 (UTC 06:00) 자동 리마인드 발송

const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const API_KEY    = process.env.SOLAPI_API_KEY    || 'NCSN84FMPLK0ZRJV';
const API_SECRET = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
const TPL_REMIND = 'KA01TP260303085208365I0uoVbWPhTo';
const PFID       = 'KA01PF260303011802344MukuvkKjzXI';
const FROM_PHONE = process.env.SOLAPI_FROM || '01032057451';

function makeSignature() {
  const date      = new Date().toISOString();
  const salt      = crypto.randomBytes(16).toString('hex');
  const hmac      = crypto.createHmac('sha256', API_SECRET);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

function tomorrowKST() {
  const d = new Date();
  d.setHours(d.getHours() + 9); // UTC → KST
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function sendRemind(to, name, time, service) {
  const variables = {
    '#{고객명}': name    || '',
    '#{시간}':   time    || '',
    '#{서비스}': service || ''
  };
  const text = `${name}님, 내일 예약이 있습니다 🔔\n\n📅 내일 ${time}\n✨ 시술: ${service}\n\n📞 010-3205-7451\n📍 라임스킨 목동서로213 404호`;

  const body = {
    message: {
      to, from: FROM_PHONE, type: 'ATA', text,
      kakaoOptions: { pfId: PFID, templateId: TPL_REMIND, variables, disableSms: true }
    }
  };

  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': makeSignature() },
    body: JSON.stringify(body)
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  // Cron 보안 검증
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const raw = await redis.get('limeskin_data');
    if (!raw) return res.status(200).json({ ok: true, message: '데이터 없음' });

    const data     = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const bookings = data.bookings || [];
    const members  = data.members  || [];
    const tomorrow = tomorrowKST();

    console.log('[리마인드] 내일 날짜:', tomorrow, '전체 예약:', bookings.length);

    const targets = bookings.filter(b => b.date === tomorrow && b.status !== 'cancelled');
    console.log('[리마인드] 발송 대상:', targets.length);

    const results = [];
    for (const b of targets) {
      let phone = (b.phone || '').replace(/-/g, '');
      if (!phone && b.memberId) {
        const m = members.find(x => x.id === b.memberId);
        if (m) phone = (m.phone || '').replace(/-/g, '');
      }
      if (!phone) { console.log('[리마인드] 전화번호 없음:', b.name); continue; }

      const r = await sendRemind(phone, b.name || '', b.time || '', b.service || '');
      console.log('[리마인드 발송]', b.name, phone, JSON.stringify(r));
      results.push({ name: b.name, phone, ok: !r.errorCode });
    }

    return res.status(200).json({ ok: true, tomorrow, sent: results.length, results });

  } catch (err) {
    console.error('[리마인드 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
