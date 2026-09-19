// Maison Velour — Safepay client (server-side only).
//
// Sandbox and live are separate Safepay accounts with separate keys, so the
// environment is selected by SAFEPAY_ENV. Nothing here may ever run in the
// browser: the secret key authenticates the whole account.
const crypto = require('crypto');

// Load .env for local runs; Vercel supplies real environment variables. The
// loader in _supabase.js normally runs first, but this keeps the module
// self-contained so importing it alone still works.
(function loadEnv(){
  try {
    const fs = require('fs');
    const path = require('path');
    const lines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    for(const line of lines){
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
      if(m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch(e){ /* no .env — rely on real env vars */ }
})();

const ENV = String(process.env.SAFEPAY_ENV || 'sandbox').trim().toLowerCase();
const IS_LIVE = ENV === 'production' || ENV === 'live';

// API host. The SDK's checkout URL builder wants the word "production", not "live".
const HOST = IS_LIVE ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com';
const CHECKOUT_ENV = IS_LIVE ? 'production' : 'sandbox';

// Currencies the storefront offers that Safepay actually accepts. Verified
// against the sandbox: INR, AUD and JPY come back
// "currency: unsupported or invalid currency".
const SUPPORTED_CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD'];

// Every supported currency above is 2-decimal, so one multiplier covers them.
// (JPY, the obvious zero-decimal exception, is not supported at all.)
const MINOR_UNITS = 100;

function credentials(){
  return {
    apiKey: String(process.env.SAFEPAY_API_KEY || '').trim(),
    secretKey: String(process.env.SAFEPAY_SECRET_KEY || '').trim(),
    webhookSecret: String(process.env.SAFEPAY_WEBHOOK_SECRET || '').trim()
  };
}

// Read lazily rather than at import time, so a missing key never stops the rest
// of the site from booting — only card payments go dark.
function isConfigured(){
  const c = credentials();
  return !!(c.apiKey && c.secretKey);
}

function publicApiKey(){ return credentials().apiKey; }

let cached = null;
function client(){
  const c = credentials();
  if(!c.apiKey || !c.secretKey){
    throw new Error('Safepay is not configured — set SAFEPAY_API_KEY and SAFEPAY_SECRET_KEY');
  }
  if(!cached){
    const Safepay = require('@sfpy/node-core');
    cached = Safepay(c.secretKey, { authType: 'secret', host: HOST });
  }
  return cached;
}

// Safepay takes the amount in the lowest denomination for *every* currency,
// PKR included — Rs 1,000 is 100000, not 1000. Confirmed against the sandbox:
// a $100.00 quote returns base_amount 2772741 PKR at a rate of 277.27411, which
// only balances if PKR is counted in paisa.
function toMinorUnits(majorAmount){
  return Math.round(Number(majorAmount) * MINOR_UNITS);
}

// The reporter endpoint does NOT match its documentation. The docs show the
// tracker nested under `data.tracker`, but the live v3 response puts it
// directly under `data` (with a top-level `ok`). Verified against the sandbox —
// reading `data.tracker` silently yields undefined and the payment would never
// be recognised as settled. Accept both shapes.
function trackerFrom(response){
  const data = (response && response.data) || {};
  return data.tracker || data;
}

// Webhook payloads are documented with `data.tracker`, but the reporter endpoint
// already broke that promise once, so pull the tracker from either place the API
// is known to use rather than trusting the documented shape alone.
function trackerFromEvent(data){
  if(data && data.tracker) return String(data.tracker);
  if(data && typeof data.token === 'string' && data.token.startsWith('track_')) return data.token;
  return '';
}

// Metadata values come back as plain strings in the documented webhook sample,
// but the reporter returns them as objects ({ token, key, value }). Handle both,
// otherwise `String(obj)` yields "[object Object]" and the order never matches.
function metadataValue(metadata, key){
  const v = metadata && metadata[key];
  if(v && typeof v === 'object') return v.value == null ? '' : String(v.value);
  return v == null ? '' : String(v);
}

// Webhooks are signed with HMAC-SHA512 over the exact bytes Safepay sent, so
// this must receive the RAW body — re-serialising the parsed object changes the
// bytes and the signature will never match.
function verifyWebhookSignature(rawBody, signature, secret){
  const key = secret || credentials().webhookSecret;
  if(!key || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha512', key).update(Buffer.from(rawBody, 'utf8')).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).trim(), 'utf8');
  if(a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  client,
  isConfigured,
  publicApiKey,
  verifyWebhookSignature,
  toMinorUnits,
  trackerFrom,
  trackerFromEvent,
  metadataValue,
  SUPPORTED_CURRENCIES,
  MINOR_UNITS,
  HOST,
  CHECKOUT_ENV,
  IS_LIVE
};
