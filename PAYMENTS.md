# Maison Velour — Payments

How card payments work, where to watch them, and what to do before taking real
money. Written to be read by a human, not a compiler.

**Current state: SANDBOX.** Card payments use Safepay's test environment. No real
money moves, and test cards are the only ones that will work. Section 6 covers
switching to live.

---

## 1. What happens when someone pays by card

1. The shopper fills in their details and picks **Credit / Debit Card**, then
   clicks **Place Order**.
2. The browser sends the cart, the currency they are viewing, and the exact
   amount shown on screen to `POST /api/checkout`.
3. The server writes the order to the database with `payment_status = 'unpaid'`,
   then asks Safepay for a **tracker** (Safepay's ID for that payment session)
   and a short-lived **passport token**.
4. The server builds Safepay's hosted checkout URL and stores the tracker in the
   order's `payment_ref` column, so the order and the payment are linked both
   ways.
5. The browser is redirected to Safepay's page. **Card details are typed there,
   never on this site** — that is the whole point of the redirect, and it keeps
   the PCI burden on Safepay.
6. The shopper pays. Safepay sends them back with `?tracker=track_...`.
7. Two independent things can mark the order paid:
   - the return trip: the page asks the server, the server asks Safepay for the
     tracker's state, and `TRACKER_ENDED` means paid;
   - a **webhook**: Safepay posts `payment.succeeded` straight to
     `/api/safepay/webhook`, and the server verifies the HMAC signature before
     believing a word of it.
   Both are idempotent, so whichever arrives first wins and the other is a no-op.
8. The confirmation screen shows, and the bag is emptied.

**Cash on Delivery** skips all of the above. It writes the order as `unpaid` with
`payment_method = 'cod'` and nothing else happens until you mark it paid by hand.

### Amounts — the thing that bit us once

Safepay takes amounts in the **lowest denomination, for every currency**.
PKR is counted in **paisa**, so Rs 1,000 must be sent as `100000`. Send `1000` and
you charge ten rupees.

The figure charged is always the figure the shopper saw. The site's own exchange
rates are used to work it out, so the price on screen and the price on Safepay's
page match exactly.

---

## 2. What happens when a payment fails

| Situation | What the shopper sees | What the order shows |
| --- | --- | --- |
| Card declined | Safepay shows the decline on its own page, and they can retry there | `unpaid` — nothing is falsely marked paid |
| They retry and succeed | The normal confirmation screen | `paid` |
| They cancel on Safepay | "Payment cancelled — No payment was taken…" | `unpaid` |
| They close Safepay and come back later | "Your card was declined…" or "Payment not completed…" | `unpaid` or `failed` |
| The webhook reports a failure | — | `failed` |
| A failure webhook arrives *after* a success | — | Stays `paid` — a late failure can never un-pay a settled order |

A declined card is detected in two places: the webhook marks the order `failed`,
and if the shopper returns to the site we tell them directly, because Safepay
owns the page they were on when it was declined.

---

## 3. Where to see everything

| What you want to see | Where to look |
| --- | --- |
| Every test payment, its state, its amount | Safepay sandbox dashboard → **Payments → Payments 2.0** |
| Webhook deliveries and retries | Safepay sandbox dashboard → **Developers → Endpoints** |
| Your API keys | Safepay sandbox dashboard → **Developers → API** |
| Orders, payment method, paid/unpaid | `https://<your-site>/admin.html` → Orders tab |
| The Safepay tracker for any order | Admin Orders tab, small grey `track_…` under the payment method — click it to select the whole ID and paste it into Safepay |
| A customer's own order history | Storefront → Account (person icon) → **Your Orders**, once signed in |

**Safepay sandbox dashboard:** https://sandbox.api.getsafepay.com/dashboard/login
That is a separate login from the live dashboard — sandbox accounts are their own
signup.

---

## 4. Testing

Safepay's test cards only work in sandbox:

| Card number | What it does |
| --- | --- |
| `4456 5300 0000 1005` | Successful payment |
| `4456 5300 0000 1013` | Declined |
| `4456 5300 0000 1096` | Step-up 3-D Secure, then succeeds |
| `4456 5300 0000 1070` | Times out |

Any future expiry date and any 3 digits for the CVC. Use a Pakistani phone number
after selecting Pakistan, or Safepay's form will not open the card fields.

To test the whole loop: add something to the bag, check out, pay with the first
card, and confirm the order flips to `Card · paid` in the admin panel.

---

## 5. Environment variables

Set in Vercel → Project → Settings → Environment Variables, and in `.env` for
local work. **They must be added to every environment you deploy** — Production
and Preview are separate, and a variable added after a deployment does not apply
to it. Redeploy afterwards.

| Name | Value |
| --- | --- |
| `SAFEPAY_ENV` | `sandbox` now, `production` when live |
| `SAFEPAY_API_KEY` | Public API key, starts with `sec_` |
| `SAFEPAY_SECRET_KEY` | Private secret key. Never put this in browser code |
| `SAFEPAY_WEBHOOK_SECRET` | Webhook signing secret. Sandbox and live secrets differ |

If these are missing the card option still appears but returns "Card payments are
not set up yet". Cash on Delivery keeps working, so the shop is never dead.

---

## 6. Going live — real money

1. **Apply for a Safepay live account.** This is a separate signup from sandbox,
   with business details and KYC. Sandbox keys can never take real money.
2. **Get the live keys** from the live dashboard → Developers → API.
3. **Register the webhook** in the live dashboard → Developers → Endpoints:
   ```
   https://<your-production-domain>/api/safepay/webhook
   ```
   Then copy the **live** shared secret — it is different from the sandbox one.
4. **Update the Vercel variables** for Production: `SAFEPAY_ENV=production`, and
   the three live keys.
5. **Redeploy.** Environment variables only apply to deployments created after
   they are added.
6. **Test with a small real payment**, confirm it shows `paid` in the admin panel
   and appears in the live Safepay dashboard, then refund it.

### One limitation to know about

Vercel protects Preview deployments behind a login. That means **Safepay cannot
deliver webhooks to a preview URL** — its servers would hit the login page. So
webhooks only work on Production, or on a preview with deployment protection
switched off. The return-trip check still settles orders on a preview, so testing
there is fine; it is only the webhook that cannot arrive.

---

## 7. Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Card payments are not set up yet" | The `SAFEPAY_*` variables are missing from that environment, or were added after the deployment was built |
| "We could not start the payment" | The server could not reach Safepay. Check the deployment's runtime logs |
| Payment works but the order stays `unpaid` | The webhook never arrived and the shopper never returned. Check Developers → Endpoints |
| Charge is 100× too big or too small | The amount was not converted to minor units (section 1) |
| Card option missing at checkout | The selected currency is INR, AUD or JPY — Safepay does not accept those |
| `Cannot find module 'axios'` | `axios` is missing from `package.json` dependencies (the Safepay SDK wrongly lists it as a dev dependency) |

Runtime logs for a deployment:

```bash
vercel logs <deployment-url>
```

---

## 8. Files involved

| File | Role |
| --- | --- |
| `api/_safepay.js` | Safepay client, sandbox/live switching, HMAC verification, minor-unit conversion |
| `api/_handler.js` | `POST /api/checkout`, `GET /api/checkout/status`, `POST /api/safepay/webhook` |
| `public/index.html` | Card redirect, confirmation, declined/cancelled messages, member order history |
| `public/admin.html` | Orders table with payment method, status and the Safepay tracker |
