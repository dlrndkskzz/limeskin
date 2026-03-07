const crypto = require('crypto');

const SOLAPI_KEY = 'NCSN84FMPLK0ZRJV';
const SOLAPI_SECRET = 'I7TAN3PP8A0JOCPYFFM5B4XEN0SHNTYL';
const SENDER = '01032057451';

function makeSignature() {
  var date = new Date().toISOString();
  var salt = crypto.randomBytes(16).toString('hex');
  var hmac = crypto.createHmac('sha256', SOLAPI_SECRET);
  hmac.update(date + salt);
  var sig = hmac.digest('hex');
  return {
    authorization: 'HMAC-SHA256 apiKey=' + SOLAPI_KEY + ', date=' + date + ', salt=' + salt + ', signature=' + sig
  };
}

module.exports = async function(req, res) {
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
    var body = req.body;
    var { templateCode, to, variables, type, text } = body;

    var pfId = process.env.KAKAO_PF_ID || 'KA01PF260303011802344MukuvkKjzXI';

    var msg = {};

    if (type === 'SMS') {
      // SMS 발송
      msg = {
        to: to,
        from: SENDER,
        type: (text && text.length > 45) ? 'LMS' : 'SMS',
        text: text || ''
      };
    } else {
      // 카카오 알림톡
      msg = {
        to: to,
        from: SENDER,
        type: 'ATA',
        kakaoOptions: {
          pfId: pfId,
          templateId: templateCode,
          variables: variables || {}
        }
      };
    }

    var { authorization } = makeSignature();

    var response = await fetch('https://api.solapi.com/messages/v4/send-many', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization
      },
      body: JSON.stringify({ messages: [msg] })
    });

    var result = await response.json();
    return res.status(200).json(result);

  } catch (err) {
    console.error('Alimtalk error:', err);
    return res.status(500).json({ error: err.message });
  }
};
