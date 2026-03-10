// api/remind.js
// Vercel Cron Job - 매일 오후 3시(KST) 자동 리마인드 발송
// vercel.json 에서 "0 6 * * *" (UTC 6시 = KST 15시) 로 스케줄

const crypto = require('crypto');

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

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function sendOne(to, vars) {
  const body = {
    message: {
      to, from: FROM_PHONE, type: 'ATA',
      text: `${vars['#{고객명}'] || ''}님, 내일 예약이 있습니다 🔔\n\n📅 내일 ${vars['#{시간}'] || ''}\n✨ 시술: ${vars['#{서비스}'] || ''}\n\n📞 010-3205-7451\n📍 라임스킨 목동서로213 404호`,
      kakaoOptions: {
        pfId: PFID, templateId: TPL_REMIND,
        variables: vars, disableSms: true
      }
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
  // Vercel Cron 보안: Authorization 헤더 확인
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 앱에서 POST로 보낸 예약 데이터 사용
    // GET 요청 시 (Cron): KV에서 데이터 읽기
    const { kv } = require('@vercel/kv');
    const data = await kv.get('limeskin_bookings');

    if (!data || !data.bookings) {
      return res.status(200).json({ ok: true, message: '데이터 없음' });
    }

    const tomorrow = tomorrowStr();
    const bookings = data.bookings || [];
    const members  = data.members  || [];

    const targets = bookings.filter(function(b) {
      return b.date === tomorrow && b.status !== 'cancelled';
    });

    const results = [];
    for (const b of targets) {
      let phone = b.phone || '';
      if (!phone && b.memberId) {
        const m = members.find(x => x.id === b.memberId);
        if (m) phone = m.phone || '';
      }
      if (!phone) continue;

      const r = await sendOne(phone.replace(/-/g, ''), {
        '#{고객명}': b.name || '',
        '#{시간}':   b.time || '',
        '#{서비스}': b.service || ''
      });
      results.push({ name: b.name, phone, result: r });
      console.log('[리마인드 발송]', b.name, phone, r);
    }

    return res.status(200).json({ ok: true, sent: results.length, results });

  } catch (err) {
    console.error('[리마인드 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
