# Maison Velour — WhatsApp Assistant

Everything about the WhatsApp support bot: how it works, what it says, how it was
set up, and everything that went wrong on the way — so none of it has to be
worked out twice.

---

## 1. What it is

A customer can message the shop on WhatsApp and get an answer. It handles three
things: a menu, order tracking against the real database, and questions about
delivery, returns and payment. Anything else goes to an AI model.

**It is not a human.** It cannot change an order, cancel a delivery or issue a
refund, and it says so.

### The pieces

```
Customer's WhatsApp
      │
      ▼
Meta (WhatsApp Cloud API)
      │  POST, signed with HMAC-SHA256
      ▼
https://maison-velour2.vercel.app/api/whatsapp/webhook     ← our endpoint
      │
      ├─ verify Meta's signature (app secret, raw body)
      ├─ read the message out of Meta's envelope
      ├─ scripted reply?  ──yes──▶ send
      │        │
      │        no
      │        ▼
      │   order lookup (number + postcode)  ──▶ Supabase
      │        │
      │        ▼
      │   Gemini (phrases the answer, never supplies data)
      │
      └─▶ send back via Graph API (access token)
```

| File | Role |
| --- | --- |
| `api/_whatsapp.js` | Signature check, envelope parsing, order-number parsing, the reply copy, sending, the AI call |
| `api/_handler.js` | The two endpoints, and the routing that decides which reply to use |
| `public/index.html` | The floating button that opens a WhatsApp chat |

---

## 2. The two endpoints

### `GET /api/whatsapp/webhook`

Meta calls this once, when the webhook URL is saved, to prove you control the
endpoint. It sends three query parameters and expects the **challenge** echoed
back as plain text — not JSON.

| Parameter | Meaning |
| --- | --- |
| `hub.mode` | `subscribe` |
| `hub.verify_token` | must match `WHATSAPP_VERIFY_TOKEN` |
| `hub.challenge` | echo this back |

Correct token → `200` with the challenge. Anything else → `403`.

Opening this URL in a browser returns `403`. That is correct — a browser sends
none of those parameters.

### `POST /api/whatsapp/webhook`

Where messages arrive. This endpoint is public, so the signature is the only
thing between the bot and forged traffic.

1. Read the **raw** body.
2. Verify `X-Hub-Signature-256` — HMAC-SHA256 of the raw bytes, keyed with the
   app secret. Invalid → `401`.
3. Read messages out of the envelope. Delivery/read receipts are ignored.
4. Reply to each message.
5. Return `200` **always**, once the signature passed.

**Why always 200:** Meta retries anything that isn't a 2xx, and a retry would
send the customer the same reply twice. If a reply fails to send, it is logged,
not retried.

**Why the raw body matters:** verifying a re-serialised object changes the bytes
and the signature can never match. Same trap as the payment webhook.

---

## 3. Every reply it can give

| Trigger | Reply |
| --- | --- |
| `hi`, `hello`, `hey`, `menu`, `start`, `help`, `salam` | The menu: track order / FAQ / person |
| `1`, or the word "track" | Asks for order number **and** postcode together, with an example |
| Order number **and** postcode, both matching | The order: number, date, status, items, total, payment state |
| Order number **and** postcode, not matching | "I couldn't find an order matching that number and postcode…" plus what to check |
| Order number **only** | Asks for the postcode |
| Postcode **only** | "I have the postcode — I just need the order number too" |
| `2`, or words like delivery/return/refund/payment | The FAQ |
| `3`, or words like human/agent/complain | Hands over to a person |
| A photo, voice note or file | "I can only read text — send it in words, or reply 3" |
| Anything else | The AI answers; if it fails, a "sorry, I didn't catch that" menu |

### The safety rules baked into it

- **The AI never supplies order data.** Menu and tracking are scripted. The model
  is only consulted for everything else.
- **The model never sees personal data.** The lookup returns a whitelist — order
  number, status, date, item count, total, payment method and state. No email, no
  phone, no address. There are tests asserting the reply contains none of them,
  so the model cannot be talked into reading them out.
- **Two factors for tracking.** Order number *and* postcode. One leaked number is
  not enough.
- **The not-found message never says which part failed.** Saying "no such order"
  versus "wrong postcode" would let someone guess order numbers and learn which
  exist.
- **The AI is never a single point of failure.** If the model errors or no key is
  configured, a scripted reply goes out instead.
- **No card or bank details.** The prompt forbids asking for them.

---

## 4. Meta setup — what actually had to be true

Every one of these had to be right. Five of them were wrong at some point and
each failure looked identical: **messages arrive, no reply**.

| # | Requirement | Where | Symptom when wrong |
| --- | --- | --- | --- |
| 1 | App has the **WhatsApp** product | App Dashboard → Add Product | No API Setup page |
| 2 | **Webhook URL** saved | WhatsApp → Configuration | Nothing delivered |
| 3 | **Verify token** matches ours | same page | Meta's "Verify and save" fails |
| 4 | **App subscribed to the WhatsApp Business Account** | `POST /{WABA_ID}/subscribed_apps` | Nothing delivered |
| 5 | **`messages` field subscribed** | App Dashboard → Configuration → Webhook fields | Nothing delivered |
| 6 | **App secret** matches the one we verify with | App Settings → Basic | Everything arrives, all rejected `401 Invalid signature` |
| 7 | **App published** (Live mode) | Top of App Dashboard | Meta delivers nothing |
| 8 | The **customer's number is on the recipient list** (test number only) | API Setup → "To" → Manage phone number list | Message arrives, reply refused `#131030` |

### Current configuration

| | |
| --- | --- |
| App | Maison Velour Support · `2000073413986547` |
| Business account (WABA) | `1703084560796423` |
| Sender (test number) | `+1 555-178-8880` · `1270034332865974` |
| Webhook URL | `https://maison-velour2.vercel.app/api/whatsapp/webhook` |
| Subscribed field | `messages` (v26.0) |
| App mode | Live |

---

## 5. Environment variables

| Name | What it is |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | The **sender's** ID — not the phone number itself |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | The WABA ID |
| `WHATSAPP_APP_ID` | App ID |
| `WHATSAPP_APP_SECRET` | Verifies Meta's signatures. **Rotating it breaks all webhooks** until updated here and in Vercel |
| `WHATSAPP_VERIFY_TOKEN` | A string you invent. Used only during the one-time handshake |
| `WHATSAPP_TOKEN` | Access token for sending. See below |
| `GEMINI_API_KEY` | For AI replies. Without it, replies are scripted |

Set in `.env` locally and in **Vercel → Settings → Environment Variables** for
Production *and* Preview. **Variables only apply to deployments created after
they are added** — redeploy after changing them.

> There are two identical copies of every `WHATSAPP_*` variable in Vercel, one
> per environment. Changing one does not change the other.

### Access tokens — the important bit

| Type | Lifetime | How to get it |
| --- | --- | --- |
| **User** (from API Setup) | **24 hours** | The "Generate" button on API Setup |
| **System User** ✅ | **Never expires** | business.facebook.com → Settings → Users → System users |

The bot currently uses a **System User** token. If it ever needs replacing:

1. business.facebook.com → **Settings → Users → System users**
2. **Add** → name `whatsapp-bot` → role **Admin**
3. **Add Assets** → **Apps** → your app → **Full control**
4. **Add Assets** → **WhatsApp Accounts** → your account → **Full control**
5. **Generate New Token** → tick `whatsapp_business_messaging` and
   `whatsapp_business_management`
6. Copy it — **shown once**

An expired token produces `401 Authentication Error (code 190)`. Everything else
still works; only sending breaks.

---

## 6. Testing

### By hand

Message the sender number from a phone whose number is on the recipient list:

1. **"hi"** → the menu. Proves the whole chain.
2. **"do you have gift wrapping?"** → a real AI reply.
3. **"1"**, then an order number + postcode → a real lookup.

### The suites

```bash
cd /Users/mt/Documents/vibe_coding
node server.js          # in one window

# in another
node <scratchpad>/whatsapp-test.js
```

`whatsapp-test.js` covers signature handling, envelope parsing (including
delivery receipts and unreadable messages), order parsing, privacy of the reply
payload, the handshake, message routing, and order lookup — **47 checks**. It
creates and deletes its own test order.

### Diagnosing from the logs

```bash
vercel logs https://maison-velour2.vercel.app
```

| Log line | Meaning |
| --- | --- |
| `WhatsApp incoming from ****6146 (2 chars)` | A message arrived. Only the last 4 digits are logged — enough to identify a tester, not a customer record |
| `WhatsApp payload with no readable message. Shape: …` | A payload arrived that the parser could not read. Keys and types only, never contents. **If this appears for real messages, Meta changed its envelope** |
| `WhatsApp reply failed: …` | A reply could not be sent — usually the recipient list or the token |
| `WhatsApp AI reply failed: …` | Gemini failed; a scripted reply was sent instead |

Delivery and read receipts also arrive here and are **not** errors — they carry
`statuses`, need no reply, and are ignored.

---

## 7. Going live for real customers

The current sender is **Meta's test number**, which can only ever message the
**5 recipients** on its list. That cap does not lift when the app goes Live. Real
customers need a real sender:

1. **Register your own phone number** — WhatsApp → API Setup → the **"From"**
   dropdown → **Add phone number**
2. It must **not already be registered to WhatsApp**. Using a number deletes its
   WhatsApp account and its chat history, so use a spare SIM unless you accept
   that
3. Verify it by SMS or voice, and set a display name (Meta reviews it)
4. Update `WHATSAPP_PHONE_NUMBER_ID` and the `wa.me` link in `public/index.html`
5. **Business verification** raises the messaging and phone-number limits
   properly — you will need it for real volume

### The 24-hour window

You can reply freely for 24 hours after the customer's last message. Outside
that you must use a pre-approved **template** instead. Fine for a support bot
that answers immediately; a problem for follow-ups the next day.

### Current limits

| Limit | Value | Notes |
| --- | --- | --- |
| Test-number recipients | 5 | Recipients only, not messages |
| Phone numbers per business account | 2 by default | Raised by business verification |

---

## 8. Troubleshooting — everything encountered

| Symptom | Cause |
| --- | --- |
| Messages arrive, no reply, error `#131030 Recipient phone number not in allowed list` | The customer's number is not on the recipient list. **Test number only.** Add it, international format, no leading zero |
| Everything arrives, all rejected `401 Invalid signature` | The app secret in `.env`/Vercel does not match the app's current secret. Common after a secret rotation |
| Nothing arrives at all | Check in order: app is **Live**, the app is **subscribed to the WABA**, the **`messages` field** is subscribed, the webhook URL is saved |
| Meta's "Verify and save" says *Provide a valid URL* | Either the URL lacks its path (use `/privacy.html`, not the bare domain), or the domain is not listed under **App Settings → Basic → App Domains** |
| Pasting a number in the Vercel UI silently does nothing | If a variable already exists, adding fails. It must be **updated** |
| `401 Authentication Error` when sending | The access token expired. Replace it with a System User token |
| The AI replies look scripted | Gemini failed, or `GEMINI_API_KEY` is unset. Check the logs for `AI reply failed` |
| `404 … model is no longer available` | Google retired the model name. Add a current one to `GEMINI_MODELS` in `api/_whatsapp.js` |
| Two `WHATSAPP_X=` lines in `.env` | The **first** wins. Replace the value in place, never append |

### Traps worth remembering

- **Editing `.env` by appending** a second line for a key that already exists
  does nothing, because the loader takes the first occurrence. This cost real
  time twice.
- **Rotating the app secret** silently breaks every webhook until the new value
  is deployed. Rotate, then update, then redeploy.
- **The test number's 5-recipient cap** and the **business account's
  phone-number cap** produce similar-sounding errors and are different things.
- **Local number formats.** `03117696146` is unroutable. Use `923117696146`.
