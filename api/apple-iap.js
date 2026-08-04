// Vercel serverless function — Apple In-App Purchase verification + server notifications.
//
// Two jobs:
//   1) action:"verify"  — the iOS app sends a StoreKit 2 signed transaction (JWS) plus
//      the user's session token. We cryptographically verify the JWS against Apple's
//      root, map the product to a plan, and set profiles.plan for that user.
//   2) App Store Server Notifications V2 — Apple POSTs { signedPayload } on renew /
//      cancel / refund / expire. We verify it and keep profiles.plan in sync.
//
// Zero external dependencies: verification uses Node's built-in crypto (X509Certificate
// + ECDSA P-256). Apple's Root CA G3 is fetched over TLS from apple.com and cached, so
// no security constant is hard-coded.
//
// Env (already configured for the site): SUPABASE_URL, SUPABASE_SECRET_KEY.

import crypto from 'crypto';

const BUNDLE_ID = 'ai.learninggpt.app';
const APPLE_ROOT_URL = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';

const PLAN_FOR_PRODUCT = {
  'ai.learninggpt.app.pro.monthly': 'pro',
  'ai.learninggpt.app.proplus.monthly': 'pro_plus',
};

// Renewal grace so a just-expired-then-renewed sub isn't briefly downgraded.
const EXPIRY_GRACE_MS = 60 * 1000;

let appleRootCache = null;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    // ── App Store Server Notification V2 (Apple → us) ──────────────────────
    if (body.signedPayload) {
      return await handleNotification(body.signedPayload, res);
    }
    // ── Purchase verification (our app → us) ───────────────────────────────
    if (body.action === 'verify') {
      return await handleVerify(body, res);
    }
    return res.status(400).json({ error: 'Invalid request' });
  } catch (err) {
    console.error('[apple-iap] error:', err && err.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase verification
// ─────────────────────────────────────────────────────────────────────────────
async function handleVerify(body, res) {
  const { token, jws } = body;
  if (!token || !jws) return res.status(400).json({ error: 'Missing token or receipt' });

  const tx = await verifyAppleJWS(jws);
  if (tx.bundleId && tx.bundleId !== BUNDLE_ID) {
    return res.status(400).json({ error: 'Bundle mismatch' });
  }
  const plan = PLAN_FOR_PRODUCT[tx.productId];
  if (!plan) return res.status(400).json({ error: 'Unknown product' });

  // Identify the LearningGPT user from their session token.
  const userId = await userIdFromToken(token);
  if (!userId) return res.status(401).json({ error: 'Invalid session' });

  const active = isActive(tx);
  const newPlan = active ? plan : 'free';

  await setProfilePlan({
    userId,
    plan: newPlan,
    originalTransactionId: tx.originalTransactionId,
  });

  return res.status(200).json({ success: true, plan: newPlan });
}

// ─────────────────────────────────────────────────────────────────────────────
// App Store Server Notifications V2
// ─────────────────────────────────────────────────────────────────────────────
async function handleNotification(signedPayload, res) {
  const payload = await verifyAppleJWS(signedPayload); // notification body
  const notificationType = payload.notificationType;
  const data = payload.data || {};

  // The transaction info is itself a signed JWS.
  let tx = null;
  if (data.signedTransactionInfo) {
    tx = await verifyAppleJWS(data.signedTransactionInfo);
  }
  if (!tx || !tx.originalTransactionId) {
    return res.status(200).json({ ok: true }); // ack; nothing actionable
  }

  const plan = PLAN_FOR_PRODUCT[tx.productId] || 'free';

  // Types that mean "no longer entitled".
  const revoking = ['EXPIRED', 'REFUND', 'REVOKE', 'GRACE_PERIOD_EXPIRED'];
  const active = !revoking.includes(notificationType) && isActive(tx);
  const newPlan = active ? plan : 'free';

  await setProfilePlanByOriginalTx({
    originalTransactionId: tx.originalTransactionId,
    plan: newPlan,
  });

  return res.status(200).json({ ok: true });
}

function isActive(tx) {
  if (tx.revocationDate) return false;
  if (tx.expiresDate && Number(tx.expiresDate) < Date.now() - EXPIRY_GRACE_MS) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apple JWS verification (built-in crypto)
// ─────────────────────────────────────────────────────────────────────────────
async function verifyAppleJWS(jws) {
  const parts = String(jws).split('.');
  if (parts.length !== 3) throw new Error('Malformed JWS');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlToBuf(headerB64).toString('utf8'));
  if (header.alg !== 'ES256') throw new Error('Unexpected alg');
  if (!Array.isArray(header.x5c) || header.x5c.length < 2) throw new Error('Missing x5c chain');

  // x5c: [leaf, intermediate, root] as base64 DER.
  const chain = header.x5c.map((b64) => new crypto.X509Certificate(Buffer.from(b64, 'base64')));
  const leaf = chain[0];
  const intermediate = chain[1];
  const chainRoot = chain[chain.length - 1];

  // 1) Pin: the chain root must be Apple's real Root CA G3.
  const appleRoot = await getAppleRoot();
  if (!chainRoot.raw.equals(appleRoot.raw)) throw new Error('Root not pinned to Apple');

  // 2) Chain linkage: each cert signed by the next issuer up.
  if (!leaf.verify(intermediate.publicKey)) throw new Error('Leaf not signed by intermediate');
  if (!intermediate.verify(appleRoot.publicKey)) throw new Error('Intermediate not signed by root');

  // 3) Validity windows.
  const now = Date.now();
  for (const c of [leaf, intermediate]) {
    if (now < Date.parse(c.validFrom) || now > Date.parse(c.validTo)) {
      throw new Error('Certificate expired or not yet valid');
    }
  }

  // 4) JWS signature over header.payload using the leaf public key (ES256 = raw r||s).
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = b64urlToBuf(sigB64);
  const ok = crypto.verify(
    'sha256',
    signingInput,
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
  if (!ok) throw new Error('Bad JWS signature');

  return JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
}

async function getAppleRoot() {
  if (appleRootCache) return appleRootCache;
  const r = await fetch(APPLE_ROOT_URL);
  if (!r.ok) throw new Error('Could not fetch Apple root');
  const der = Buffer.from(await r.arrayBuffer());
  appleRootCache = new crypto.X509Certificate(der);
  return appleRootCache;
}

function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase helpers (raw REST, matching the rest of the codebase)
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function userIdFromToken(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${token}` },
  });
  const u = await r.json();
  return u && u.id ? u.id : null;
}

async function setProfilePlan({ userId, plan, originalTransactionId }) {
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      plan,
      apple_original_transaction_id: originalTransactionId || null,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function setProfilePlanByOriginalTx({ originalTransactionId, plan }) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?apple_original_transaction_id=eq.${originalTransactionId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ plan, updated_at: new Date().toISOString() }),
    }
  );
}
