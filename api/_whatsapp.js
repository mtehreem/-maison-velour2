// Maison Velour — WhatsApp support bot.
//
// Two rules shape this file:
//
// 1. Order data never comes from the model. The bot asks for an order number AND
//    a postcode, looks them up in the database, and only then lets anything be
//    said about the order. The AI phrases the answer; it never invents one.
// 2. The AI is never a single point of failure. If the model is unreachable, or
//    no key is configured, the deterministic menu and tracking paths still work.
const crypto = require('crypto');

(function loadEnv(){
  try {
    const fs = require('fs');
    const path = require('path');
    const lines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    for(const line of lines){
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
      if(m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch(e){ /* rely on real env vars */ }
})();

function config(){
  return {
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    token:         String(process.env.WHATSAPP_TOKEN || '').trim(),
    verifyToken:   String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
    appSecret:     String(process.env.WHATSAPP_APP_SECRET || '').trim(),
    geminiKey:     String(process.env.GEMINI_API_KEY || '').trim()
  };
}

// Read at call time, so a missing credential disables the bot rather than
// breaking the rest of the site.
function isConfigured(){
  const c = config();
  return !!(c.phoneNumberId && c.token && c.verifyToken);
}
function canReplyWithAi(){ return !!config().geminiKey; }

const GRAPH = 'https://graph.facebook.com/v21.0';

// Meta signs every webhook POST with HMAC-SHA256 over the raw body, in a header
// shaped "sha256=<hex>". Same trap as the payment webhook: this must be given the
// bytes as received, never a re-serialised object.
function verifySignature(rawBody, signatureHeader){
  const secret = config().appSecret;
  const given = String(signatureHeader || '');
  if(!secret || !given.startsWith('sha256=') || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given.slice('sha256='.length).trim(), 'utf8');
  if(a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Walk Meta's envelope down to the actual text messages. The shape is deeply
// nested and every level is optional, because the same endpoint also receives
// delivery receipts, read receipts and errors.
function extractMessages(payload){
  const out = [];
  const entries = (payload && Array.isArray(payload.entry)) ? payload.entry : [];
  for(const entry of entries){
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for(const change of changes){
      const value = change && change.value;
      if(!value) continue;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for(const msg of messages){
        const from = String(msg.from || '');
        const id = String(msg.id || '');
        if(!from) continue;
        // Only text is handled; buttons and lists arrive as their own types.
        const text = (msg.text && typeof msg.text.body === 'string') ? msg.text.body
                   : (msg.button && msg.button.text) ? msg.button.text
                   : (msg.interactive && msg.interactive.list_reply && msg.interactive.list_reply.title) ? msg.interactive.list_reply.title
                   : '';
        if(text) out.push({ from, id, text: text.trim() });
      }
    }
  }
  return out;
}

// Postcodes and order numbers are pulled out of free text. People type them any
// way they like, so this is deliberately forgiving.
function parseTracking(text){
  const s = String(text || '').toUpperCase();
  const order = (s.match(/\bMV-[A-Z0-9]{6,10}\b/) || [])[0] || '';
  let postcode = '';
  if(order){
    const rest = s.replace(order, ' ');
    const candidate = (rest.match(/\b[A-Z0-9][A-Z0-9-]{2,9}\b/g) || [])
      .filter(t => /[0-9]/.test(t))          // a postcode always contains a digit
      .filter(t => !/^MV-/.test(t));
    postcode = candidate[0] || '';
  }
  return { order, postcode };
}

// Keys and types only — never values. Meta's envelope is documented poorly and
// the shape could change under us; if a payload arrives that we cannot read a
// message out of, this makes it diagnosable from the deployment logs without
// ever writing a customer's message into them.
function describeShape(node, depth, maxDepth){
  depth = depth || 0;
  maxDepth = maxDepth || 6;
  if(depth > maxDepth) return '...';
  if(Array.isArray(node)) return node.length ? [describeShape(node[0], depth + 1, maxDepth)] : [];
  if(node && typeof node === 'object'){
    const out = {};
    for(const k of Object.keys(node)) out[k] = describeShape(node[k], depth + 1, maxDepth);
    return out;
  }
  if(typeof node === 'string') return '<string>';
  return typeof node;
}

const MENU =
  'Welcome to Maison Velour ✨ How can I help?\n\n' +
  '1. 📦 Track my order\n' +
  '2. ❓ Delivery, returns & payment questions\n' +
  '3. 👤 Talk to a person\n\n' +
  'Reply with a number, or just tell me what you need.';

const ASK_TRACKING =
  'Happy to check 📦\n\n' +
  'Send me your order number and the delivery postcode together, like this:\n' +
  'MV-8Z28PN 54000';

const FAQ =
  'Here to help ✨\n\n' +
  '• Delivery — worldwide, [YOUR SHIPPING TIMES]\n' +
  '• Payment — Card (Visa, Mastercard, PayPak, handled securely by Safepay) or Cash on Delivery\n' +
  '• Returns — [YOUR RETURNS POLICY]\n\n' +
  'Anything else, just ask.';

const ESCALATE =
  'Let me bring in a member of the team — they will reply here shortly ✨';

const NEED_HUMAN = 'What is your order number and the delivery postcode?';

// Only these fields are ever sent back over WhatsApp. The model never sees the
// customer's address, phone or email, so it cannot be talked into reading them.
function publicOrder(order){
  if(!order) return null;
  return {
    num: String(order.num),
    status: String(order.status || 'In transit 🚚'),
    placed: order.created_at ? new Date(order.created_at).toISOString().slice(0,10) : '',
    items: Number(order.items || 0),
    total: Number(order.total || 0),
    payment_method: String(order.payment_method || ''),
    payment_status: String(order.payment_status || 'unpaid')
  };
}

function formatOrder(o){
  const method = o.payment_method === 'card' ? 'Card'
               : o.payment_method === 'cod' ? 'Cash on Delivery'
               : (o.payment_method || '—');
  const paid = String(o.payment_status).toLowerCase() === 'paid' ? 'paid' : 'unpaid';
  return 'Found it ✨\n\n' +
    '• Order: ' + o.num + '\n' +
    '• Placed: ' + o.placed + '\n' +
    '• Status: ' + o.status + '\n' +
    '• Items: ' + o.items + ' · Total: $' + o.total.toFixed(2) + '\n' +
    '• Payment: ' + method + ' — ' + paid;
}

async function sendText(to, body){
  const c = config();
  if(!c.phoneNumberId || !c.token) throw new Error('WhatsApp is not configured');
  const res = await fetch(`${GRAPH}/${c.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body }
    })
  });
  const json = await res.json().catch(() => null);
  if(!res.ok){
    const msg = (json && json.error && json.error.message) || `HTTP ${res.status}`;
    throw new Error('WhatsApp send failed: ' + msg);
  }
  return json;
}

// The AI layer. Nothing here is trusted with order data: it may only phrase a
// reply, and if it fails for any reason the caller falls back to a scripted one.
async function aiReply(userText, orderContext){
  const c = config();
  if(!c.geminiKey) return null;
  const prompt =
    'You are the WhatsApp support assistant for Maison Velour, a luxury beauty house. ' +
    'Reply in 1-3 short sentences, warm and brief, at most one emoji. Never invent an ' +
    'order status, delivery date or policy. If the customer wants order information, ask ' +
    'for their order number AND delivery postcode. Never ask for card or bank details.\n\n' +
    (orderContext ? 'The order lookup already returned: ' + JSON.stringify(orderContext) + '\n\n' : '') +
    'Customer: ' + userText;
  // Google currently documents two different Gemini APIs: this long-standing
  // generateContent shape, and a newer /v1beta/interactions one. This has NOT
  // been verified against a live key — the first thing to check once
  // GEMINI_API_KEY exists is whether this call succeeds, and if it 404s, switch
  // the URL and body to the interactions shape.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${c.geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const json = await res.json().catch(() => null);
  if(!res.ok) throw new Error('Gemini failed: ' + ((json && json.error && json.error.message) || res.status));
  const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content &&
                json.candidates[0].content.parts;
  const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('').trim() : '';
  return text || null;
}

module.exports = {
  config, isConfigured, canReplyWithAi, verifySignature, extractMessages,
  parseTracking, publicOrder, formatOrder, sendText, aiReply, describeShape,
  MENU, ASK_TRACKING, FAQ, ESCALATE, NEED_HUMAN
};
