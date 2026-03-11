/**
 * api/data.js
 * Upstash Redis 데이터 GET / POST 엔드포인트
 * GET  /api/data  → Redis에서 limeskin_alldata 불러오기
 * POST /api/data  → Redis에 limeskin_alldata 저장
 */

const REDIS_KEY = 'limeskin_alldata';

function getRedisConfig() {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis 환경변수가 설정되지 않았습니다 (KV_REST_API_URL, KV_REST_API_TOKEN)');
  return { url, token };
}

async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Redis GET 실패: ${res.status}`);
  const data = await res.json();
  return data.result ?? null;          // null → 키 없음
}

async function redisSet(url, token, key, value) {
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify([['SET', key, value]]),
  });
  if (!res.ok) throw new Error(`Redis SET 실패: ${res.status}`);
  return await res.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url, token } = getRedisConfig();

    // ── GET: 데이터 불러오기 ──────────────────────────────────────
    if (req.method === 'GET') {
      const raw = await redisGet(url, token, REDIS_KEY);

      if (!raw) {
        return res.status(200).json({ ok: true, data: null, message: '저장된 데이터 없음' });
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(200).json({ ok: true, data: null, message: '데이터 파싱 오류' });
      }

      // 빈 데이터 가드: 회원 0명이면 null 반환 → 프론트가 localStorage 사용
      if (!parsed.members || parsed.members.length === 0) {
        return res.status(200).json({ ok: true, data: null, message: '빈 데이터' });
      }

      return res.status(200).json({ ok: true, data: parsed });
    }

    // ── POST: 데이터 저장 ─────────────────────────────────────────
    if (req.method === 'POST') {
      let body = req.body;

      // body가 string인 경우 (raw body)
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* 그냥 string으로 저장 */ }
      }

      const payload = typeof body === 'string' ? body : JSON.stringify(body);

      // 최소 유효성 검사
      const parsed = typeof body === 'object' ? body : JSON.parse(payload);
      if (!parsed.members) {
        return res.status(400).json({ ok: false, message: 'members 필드가 없습니다' });
      }

      await redisSet(url, token, REDIS_KEY, payload);
      return res.status(200).json({ ok: true, message: '저장 완료', updatedAt: new Date().toISOString() });
    }

    return res.status(405).json({ ok: false, message: '허용되지 않는 메서드' });

  } catch (err) {
    console.error('[api/data] 오류:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
}
