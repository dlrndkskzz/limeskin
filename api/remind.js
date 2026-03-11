// api/remind.js
const crypto = require('crypto');

const API_KEY    = process.env.SOLAPI_API_KEY    || 'NCSN84FMPLK0ZRJV';
const API_SECRET = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
const TPL_REMIND = 'KA01TP260303085208365I0uoVbWPhTo';
const PFID       = 'KA01PF260303011802344MukuvkKjzXI';
const FROM_PHONE = '01032057451';

function makeSignature() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', API_SECRET);
  hmac.update(date + salt);
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${hmac.digest('hex')}`;
}

function tomorrowKST() {
  const d = new Date();
  d.setHours(d.getHours() + 9);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  console.log('[remind] KV_REST_API_URL:', url ? url.slice(0,30)+'...' : '없음');

  if (!url || !token) {
    return res.status(500).json({ ok: false, error: 'KV 환경변수 없음' });
  }

  try {
    // Redis에서 데이터 읽기 (fetch 직접 사용)
    const r = await fetch(`${url}/get/limeskin_data`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await r.json();
    console.log('[remind] Redis 응답:', JSON.stringify(json).slice(0, 100));

    if (!json.result) return res.status(200).json({ ok: true, message: '데이터 없음' });

    // 이중 JSON 파싱 처리
    let raw = json.result;
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (typeof raw === 'object' && raw.value) raw = typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value;
    const data = raw;
    const bookings = data.bookings || [];
    const members  = data.members  || [];
    const tomorrow = tomorrowKST();

    const targets = bookings.filter(b => b.date === tomorrow && b.status !== 'cancelled');
    console.log('[remind] 내일:', tomorrow, '발송대상:', targets.length);

    const results = [];
    for (const b of targets) {
      let phone = (b.phone || '').replace(/-/g, '');
      if (!phone && b.memberId) {
        const m = members.find(x => x.id === b.memberId);
        if (m) phone = (m.phone || '').replace(/-/g, '');
      }
      if (!phone) continue;

      const variables = { '#{고객명}': b.name||'', '#{시간}': b.time||'', '#{서비스}': b.service||'' };
      const text = `${b.name||''}님, 내일 예약이 있습니다 🔔\n\n📅 내일 ${b.time||''}\n✨ 시술: ${b.service||''}\n\n📞 010-3205-7451\n📍 라임스킨 목동서로213 404호`;

      const body = { message: { to: phone, from: FROM_PHONE, type: 'ATA', text,
        kakaoOptions: { pfId: PFID, templateId: TPL_REMIND, variables, disableSms: true } } };

      const sr = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: makeSignature() },
        body: JSON.stringify(body)
      });
      const sd = await sr.json();
      console.log('[remind 발송]', b.name, phone, JSON.stringify(sd));
      results.push({ name: b.name, phone, ok: !sd.errorCode });
    }

    return res.status(200).json({ ok: true, tomorrow, sent: results.length, results });
  } catch (err) {
    console.error('[리마인드 오류]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
