# Maison Velour — Setup Notes

A plain-language record of how this project is set up, so you never have to
remember it. Ask me to update this file whenever something changes.

---

## 1. How to run the website (local)

Open **Terminal** (`Cmd + Space`, type "Terminal", Enter), then:

```
cd /Users/mt/Documents/vibe_coding
node server.js
```

Leave that window open. Now visit:

| | |
| --- | --- |
| Storefront | http://localhost:4321/ |
| Admin panel | http://localhost:4321/admin.html |

To stop the server: click the Terminal window and press **Ctrl + C**.

> If you see **`EADDRINUSE`**, it just means a server is *already* running on that
> port. Either use the window that is already open, or run
> `PORT=4322 node server.js` and visit port 4322 instead.

---

## 2. Admin login

```
Email:    admin@maisonvelour.com
Password: admin123
```

Change this password before the site is public.

---

## 3. Where the credentials live

Nothing secret is written in this file. The credentials live in two places:

| Where | What | Used by |
| --- | --- | --- |
| `.env` (in this folder) | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL` | Running locally |
| Vercel → Project → Settings → Environment Variables | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | The live website |

> **The API needs the `service_role` key, not the `anon` key.** Row Level
> Security is switched on with no public policies, so the anon key can read and
> write *nothing*. Earlier the `.env` held only an `anon` key, which would have
> blocked every request even with a healthy database.

> **Current status (Sept 2026): the database is offline.** The Supabase project
> `xthqgkvdaaymmsynkfdv` was deleted — its address no longer resolves, so login,
> products, cart and orders all fail with `TypeError: fetch failed`, both locally
> and on the live site. A new project must be created and the three values above
> filled in, then `npm run seed` run to rebuild the tables and the 60 products.

`.env` is deliberately **not** uploaded to GitHub (it is listed in `.gitignore`),
so the live site reads its own copy from Vercel.

The full list of files and what each one does is in `README.md`.

---

## 4. The database (Supabase)

| | |
| --- | --- |
| Project name | _(filled in during setup)_ |
| Project ref | _(filled in during setup)_ |
| Dashboard | https://supabase.com/dashboard |

**How to see your data:** Supabase dashboard → your project → **Table Editor** →
pick a table. `products` is the shop catalogue; `users`, `orders`, `wishlist`,
`cart_items` and `sessions` hold the rest.

**Rebuilding the database from scratch** (creates the tables and reloads the
60 products + admin account):

```
npm run seed
```

---

## 5. The shop catalogue

60 products across six categories:

| Category | Count |
| --- | --- |
| Skincare | 10 |
| Makeup | 10 |
| Fragrance | 10 |
| Hair & Body | 10 |
| Gifts & Sets | 10 |
| Accessories | 10 |

Everything the storefront shows comes from the database, so editing a product in
the admin panel changes the live site immediately.

---

## 6. Real payments — Stripe

The checkout currently collects the customer's details and records **which**
payment method they picked, but no money changes hands — the card fields are
placeholders. Nothing is sent to a payment processor: the card number, expiry
and CVV are collected in the browser and then thrown away.

**Decision: Stripe** (there is now a Stripe account with keys). Stripe does not
onboard businesses based in Pakistan, so the account has to be registered in a
supported country — confirm this before going live, otherwise the realistic
alternatives are Safepay or PayFast (Pakistani cards, JazzCash/Easypaisa), or a
merchant-of-record like Lemon Squeezy or Paddle.

The database is already prepared for this: orders have `payment_method`,
`payment_status` and `payment_ref` columns, and the admin panel can show and
update payment status. The plan is to create a Stripe Checkout session in
`api/_handler.js`, redirect the customer to Stripe's hosted page (so card data
never touches this server), and mark the order paid from a Stripe webhook.
