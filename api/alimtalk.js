// api/alimtalk.js - 솔라피 알림톡 발송 (HMAC-SHA256 인증)
const crypto = require('crypto');

const API_KEY = process.env.SOLAPI_API_KEY || 'NCSN84FMPLK0ZRJV';
const API_SECRET = process.env.SOLAPI_API_SECRET || 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
const PFID = process.env.SOLAPI_PFID || 'KA01PF260303011802344MukuvkKjzXI';
const SENDER_PHONE = process.env.SOLAPI_SENDER_PHONE || '01032057451';

function getSignature(date) {
  const salt = crypto.randomBytes(32).toString('hex');
  const message = date + salt;
  const hmac = crypto.createHmac('sha256', API_SECRET);
  hmac.update(message);
  const signature = hmac.digest('hex');
  return { salt, signature };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { to, templateId, variables } = req.body;
    if (!to || !templateId) return res.status(400).json({ error: 'Missing required fields' });

    const date = new Date().toISOString();
    const { salt, signature } = getSignature(date);

    const payload = {
      message: {
        to,
        from: SENDER_PHONE,
        kakaoOptions: {
          pfId: PFID,
          templateId,
          variables: variables || {},
          disableSms: true
        }
      }
    };

    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Solapi error:', data);
      return res.status(500).json({ error: data.errorMessage || 'Solapi error', detail: data });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('alimtalk error:', err);
    return res.status(500).json({ error: err.message });
  }
};
