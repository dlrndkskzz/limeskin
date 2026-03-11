/**
 * api/alimtalk.js
 * 솔라피 카카오 알림톡 발송 (HMAC-SHA256 인증)
 *
 * POST /api/alimtalk
 * Body: {
 *   to: "01012345678",          // 수신번호 (- 없이)
 *   templateId: "KA01TP...",    // 알림톡 템플릿 ID
 *   variables: { "고객명": "홍길동", ... }
 * }
 */

import crypto from 'crypto';

// ── 솔라피 설정 ────────────────────────────────────────────────
const SOLAPI_API_URL    = 'https://api.solapi.com/messages/v4/send';
const API_KEY           = process.env.SOLAPI_API_KEY    || 'NCSN84FMPLK0ZRJV';
const API_SECRET        = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
const PFID              = process.env.SOLAPI_PFID       || 'KA01PF260303011802344MukuvkKjzXI';
const SENDER_PHONE      = process.env.SOLAPI_SENDER     || '01032057451';

// ── 템플릿 ID 맵 ───────────────────────────────────────────────
const TEMPLATES = {
  confirm:       'KA01TP260303085248678ef4l9FvKT92',  // 예약확정   #{고객명} #{날짜} #{시간} #{서비스} #{소요시간}
  cancel:        'KA01TP260303085406608JlVxRzvGT24',  // 예약취소   #{고객명} #{날짜} #{시간} #{서비스}
  ticketUse:     'KA01TP260303085526915X7VfYFYZD6s',  // 이용차감   #{고객명} #{서비스} #{사용금액} #{잔여금액} #{만료일}
  ticketLow:     'KA01TP260303085621327gXfCYSrmKBF',  // 잔여소진임박 #{고객명} #{이용권명} #{잔여금액} #{만료일}
  ticketExpire:  'KA01TP26030308570608289qGVOhqmrP',  // 만료7일전  #{고객명} #{이용권명} #{잔여금액} #{만료일}
  remind:        'KA01TP260303085208365I0uoVbWPhTo',  // 리마인드   #{고객명} #{시간} #{서비스}
};

// ── HMAC-SHA256 서명 생성 ──────────────────────────────────────
function makeSignature(apiKey, apiSecret) {
  const date    = new Date().toISOString();           // ISO8601
  const salt    = crypto.randomBytes(16).toString('hex');
  const hmac    = crypto.createHmac('sha256', apiSecret);
  hmac.update(date + salt);
  const signature = hmac.digest('hex');
  return {
    Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
  };
}

// ── variables 오브젝트 → #{변수명} 형식 치환 ─────────────────
function buildVariables(vars = {}) {
  // 솔라피는 templateVariables 필드에 { "#{변수명}": "값" } 형식 사용
  const result = {};
  for (const [k, v] of Object.entries(vars)) {
    const key = k.startsWith('#{') ? k : `#{${k}}`;
    result[key] = String(v ?? '');
  }
  return result;
}

// ── 핸들러 ────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ ok: false, message: 'POST만 허용' });

  const { to, templateId: rawTemplateId, type, variables = {} } = req.body || {};

  // templateId: 직접 전달하거나 type 키로 매핑
  const templateId = rawTemplateId || (type ? TEMPLATES[type] : null);

  if (!to || !templateId) {
    return res.status(400).json({ ok: false, message: 'to, templateId(또는 type) 필수' });
  }

  // 수신번호 정규화 (- 제거)
  const toNormalized = to.replace(/-/g, '');

  const body = {
    message: {
      to:   toNormalized,
      from: SENDER_PHONE,
      kakaoOptions: {
        pfId:              PFID,
        templateId,
        templateVariables: buildVariables(variables),
        disableSms:        true,          // 알림톡 실패 시 SMS 미발송
      },
    },
  };

  try {
    const authHeader = makeSignature(API_KEY, API_SECRET);

    const solapiRes = await fetch(SOLAPI_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify(body),
    });

    const data = await solapiRes.json();

    if (!solapiRes.ok) {
      console.error('[api/alimtalk] 솔라피 오류:', JSON.stringify(data));
      return res.status(502).json({ ok: false, message: '솔라피 발송 실패', detail: data });
    }

    console.log('[api/alimtalk] 발송 성공 →', toNormalized, templateId);
    return res.status(200).json({ ok: true, result: data });

  } catch (err) {
    console.error('[api/alimtalk] 예외:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
}
