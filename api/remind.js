/**
 * api/remind.js
 * Vercel Cron Job — 매일 KST 15:00 (UTC 06:00) 실행
 * 내일 예약 고객에게 리마인드 알림톡 자동 발송
 *
 * vercel.json cron: { "path": "/api/remind", "schedule": "0 6 * * *" }
 *
 * 보안: Authorization 헤더에 Bearer <CRON_SECRET> 필요
 */

import crypto from 'crypto';

const REDIS_KEY_ALL   = 'limeskin_alldata';
const SOLAPI_API_URL  = 'https://api.solapi.com/messages/v4/send-many';
const TPL_REMIND      = 'KA01TP260303085208365I0uoVbWPhTo'; // #{고객명} #{시간} #{서비스}

// ── 유틸 ──────────────────────────────────────────────────────
function kstTomorrow() {
  // KST = UTC+9
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setDate(kst.getDate() + 1);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function makeSignature(apiKey, apiSecret) {
  const date      = new Date().toISOString();
  const salt      = crypto.randomBytes(16).toString('hex');
  const hmac      = crypto.createHmac('sha256', apiSecret);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Redis GET 실패: ${res.status}`);
  const json = await res.json();
  return json.result ?? null;
}

// ── 핸들러 ────────────────────────────────────────────────────
export default async function handler(req, res) {
  // 보안 검증 (Vercel Cron은 Authorization 헤더 자동 포함 가능)
  const cronSecret = process.env.CRON_SECRET || 'limeskin2026';
  const authHeader = req.headers.authorization || '';
  if (!authHeader.endsWith(cronSecret)) {
    console.warn('[remind] 인증 실패:', authHeader);
    return res.status(401).json({ ok: false, message: '인증 실패' });
  }

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const apiKey  = process.env.SOLAPI_API_KEY    || 'NCSN84FMPLK0ZRJV';
  const apiSec  = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
  const pfId    = process.env.SOLAPI_PFID       || 'KA01PF260303011802344MukuvkKjzXI';
  const sender  = process.env.SOLAPI_SENDER     || '01032057451';

  if (!kvUrl || !kvToken) {
    return res.status(500).json({ ok: false, message: 'Redis 환경변수 없음' });
  }

  try {
    // 1. Redis에서 데이터 불러오기
    const raw = await redisGet(kvUrl, kvToken, REDIS_KEY_ALL);
    if (!raw) return res.status(200).json({ ok: true, message: '데이터 없음', sent: 0 });

    const db = JSON.parse(raw);
    const { bookings = [], members = [], settings = {} } = db;

    // 2. 내일 날짜 예약 필터 (상태: confirmed 또는 pending)
    const tomorrow = kstTomorrow();
    const targets  = bookings.filter(
      b => b.date === tomorrow && ['confirmed', 'pending'].includes(b.status)
    );

    if (targets.length === 0) {
      console.log(`[remind] ${tomorrow} 발송 대상 없음`);
      return res.status(200).json({ ok: true, message: '발송 대상 없음', date: tomorrow, sent: 0 });
    }

    // 3. 메시지 배열 구성
    const messages = targets.map(b => {
      // 회원 전화번호 찾기 (booking.phone > members 테이블 순)
      let phone = b.phone || '';
      if (!phone && b.memberId) {
        const member = members.find(m => m.id === b.memberId);
        phone = member?.phone || '';
      }
      const to = phone.replace(/-/g, '');
      if (!to) return null;

      return {
        to,
        from: sender,
        kakaoOptions: {
          pfId,
          templateId: TPL_REMIND,
          templateVariables: {
            '#{고객명}': b.name   || '',
            '#{시간}':   b.time   || '',
            '#{서비스}': b.service || '',
          },
          disableSms: true,
        },
      };
    }).filter(Boolean);

    if (messages.length === 0) {
      return res.status(200).json({ ok: true, message: '전화번호 있는 대상 없음', sent: 0 });
    }

    // 4. 솔라피 일괄 발송
    const solapiRes = await fetch(SOLAPI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  makeSignature(apiKey, apiSec),
      },
      body: JSON.stringify({ messages }),
    });

    const result = await solapiRes.json();

    if (!solapiRes.ok) {
      console.error('[remind] 솔라피 오류:', JSON.stringify(result));
      return res.status(502).json({ ok: false, message: '솔라피 발송 실패', detail: result });
    }

    console.log(`[remind] ${tomorrow} 리마인드 ${messages.length}건 발송 완료`);
    return res.status(200).json({
      ok:   true,
      date: tomorrow,
      sent: messages.length,
      result,
    });

  } catch (err) {
    console.error('[remind] 예외:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
}
