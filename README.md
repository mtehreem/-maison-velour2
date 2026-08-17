# Maison Velour — Supabase-Backed Setup

The website is backed by a **cloud Supabase (Postgres) database** via a small Node API server.

## Files
- `supabase.js` — loads credentials from `.env` and creates the Supabase client.
- `.env` — **secret**: holds `SUPABASE_URL` + `SUPABASE_ANON_KEY` (never commit this).
- `server.js` — HTTP API + static site server on **http://localhost:4321** (talks to Supabase).
- `maison-velour.html` — the site; talks to the API through a `DB` bridge with automatic **localStorage fallback** (site keeps working offline).
- `admin.html` — admin panel (products, orders, wishlist, users).
- `maison-velour.db` — legacy local SQLite file (kept only as a fallback/backup; no longer used by the server).

## How to run
1. Install dependencies (once):
   ```
   npm install
   ```
2. Start the server (from this folder):
   ```
   node server.js
   ```
3. Open **http://localhost:4321/** in your browser (the site is served by the server).

## Supabase setup (already done)
- 7 tables created: `products`, `users`, `sessions`, `cart_items`, `orders`, `order_items`, `wishlist`.
- Row-Level Security policies enabled for reads/inserts matching the site's behavior.
- Seeded: 40 products + admin account (`admin@maisonvelour.com` / `admin123`).

## API endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/products` | Product catalog |
| POST | `/api/register` | Create account `{name, email, pass}` |
| POST | `/api/login` | Login `{email, pass}` → token |
| GET | `/api/me` | Current user (Bearer token) |
| POST | `/api/logout` | Invalidate session |
| GET/POST/PUT/DELETE | `/api/cart` | Session cart (header `x-session`) |
| POST | `/api/orders` | Place order `{items[], total}` |
| GET | `/api/orders` | Order history (by email or token) |
| POST | `/api/orders/track` | Track order `{num, zip}` |
| GET/POST/DELETE | `/api/wishlist` | Wishlist (session-scoped) |
| *Admin* | `/api/admin/*` | Products/orders/users management (admin token) |

## Notes
- The site degrades gracefully: if the server isn't running, everything (login, cart, orders, wishlist) continues to work via `localStorage`.
- For a real production launch: hash passwords, restrict RLS further, and use HTTPS.
