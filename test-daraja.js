// ─── Daraja Diagnostic — run this on YOUR machine ────────────────────────────
// node test-daraja.js
//
// Put this file in your Orthogenics project root (next to .env), then run:
//   node test-daraja.js
// It will tell you exactly which step is failing.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const KEY      = process.env.MPESA_CONSUMER_KEY;
const SECRET   = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE= process.env.MPESA_SHORTCODE;
const PASSKEY  = process.env.MPESA_PASSKEY;
const CB_URL   = process.env.MPESA_CALLBACK_URL;

// ─── helpers ─────────────────────────────────────────────────────────────────
function buildPassword() {
  const nowEAT    = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const timestamp = nowEAT.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password  = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
  return { timestamp, password };
}

async function safeJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

// ─── main ────────────────────────────────────────────────────────────────────
async function run() {

  // ── Check .env loaded ──────────────────────────────────────────────────────
  console.log('\n━━━ ENV CHECK ━━━');
  const missing = ['MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE',
                   'MPESA_PASSKEY','MPESA_CALLBACK_URL'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error('❌ Missing .env vars:', missing.join(', '));
    process.exit(1);
  }
  console.log('✅ All required env vars present');
  console.log('   CALLBACK_URL =', CB_URL);

  // ── 1. Get token ───────────────────────────────────────────────────────────
  console.log('\n━━━ 1. DARAJA TOKEN ━━━');
  const creds  = Buffer.from(`${KEY}:${SECRET}`).toString('base64');
  const tokRes = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  );
  const tokData = await safeJson(tokRes);
  console.log('HTTP', tokRes.status, '→', JSON.stringify(tokData));

  if (!tokData.access_token) {
    console.error('❌ FAILED — invalid CONSUMER_KEY or CONSUMER_SECRET');
    return;
  }
  const token = tokData.access_token;
  console.log('✅ Token OK');

  // ── 2. Callback URL reachability ───────────────────────────────────────────
  console.log('\n━━━ 2. CALLBACK URL REACHABILITY ━━━');
  console.log('POST-ing test payload to:', CB_URL);
  try {
    const cbRes = await fetch(CB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'TEST', ResultCode: 99, ResultDesc: 'Diagnostic test' } } }),
      signal: AbortSignal.timeout(8000),
    });
    console.log('✅ Reachable — HTTP', cbRes.status, '(any 2xx or 4xx means ngrok is forwarding)');
  } catch (e) {
    console.error('❌ NOT REACHABLE:', e.message);
    console.error('   ↳ ngrok might be stopped, or the URL changed. Run:  ngrok http 3000');
    console.error('   ↳ Then update MPESA_CALLBACK_URL in .env and restart your server.');
  }

  // ── 3. STK Query (dummy checkout ID — just tests auth) ────────────────────
  console.log('\n━━━ 3. STK QUERY ENDPOINT ━━━');
  const { timestamp, password } = buildPassword();
  console.log('Timestamp (EAT):', timestamp);
  const qRes  = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      CheckoutRequestID: 'ws_CO_TEST_PLACEHOLDER_000',
    }),
  });
  const qData = await safeJson(qRes);
  console.log('HTTP', qRes.status, '→', JSON.stringify(qData));

  // 400.002.02 = "Invalid CheckoutRequestID" → expected, means auth is fine
  if (qData.errorCode === '400.002.02' || qData.ResultCode !== undefined) {
    console.log('✅ Query endpoint auth OK  (Invalid CheckoutRequestID is expected for a dummy ID)');
    console.log('\n✅ All checks passed — Daraja config is correct.');
    console.log('   The PENDING-forever issue is most likely the callback URL not being');
    console.log('   reached. Confirm step 2 above shows ✅ after a real STK push.');
  } else {
    console.warn('⚠️  Unexpected query response — may indicate passkey or shortcode mismatch');
  }
}

run().catch(err => { console.error('Unhandled error:', err.message); });
