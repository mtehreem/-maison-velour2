# Maison Velour

Luxury beauty storefront with a built-in admin panel. Vanilla HTML/CSS/JS on the
front, a small Node API on the back, and **Supabase (Postgres)** as the database.

---

## Running it

```bash
npm install          # once
node server.js       # start
```

Then open **http://localhost:4321/**

- Storefront: http://localhost:4321/
- Admin panel: http://localhost:4321/admin.html

The server must be running for login, cart, orders and the admin panel to work.

To stop it, press `Ctrl+C`. If you see `EADDRINUSE`, a server is already running
on that port — stop it first, or run `PORT=4322 node server.js`.

### Setting up a fresh database

If you are pointing at a new Supabase project, fill in `.env` (see below) and run:

```bash
npm run seed
```

That creates every table and loads the full 60-product catalogue plus the admin
account. It is safe to re-run.

---

## Files

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole storefront — one self-contained page (markup, CSS, JS). |
| `public/admin.html` | The admin panel. |
| `server.js` | Local dev server: serves `public/` and routes `/api/*` to the handler. |
| `api/[[...slug]].js` | Vercel entry point for `/api/*` — a thin wrapper. |
| `api/_handler.js` | **The API.** Every endpoint lives here, shared by local and production. |
| `api/_supabase.js` | Database client (server-side only, uses the service-role key). |
| `api/_crypto.js` | Password hashing (scrypt) and session-token generation. |
| `scripts/schema.sql` | Table definitions, indexes, and Row Level Security. |
| `scripts/seed.js` | Creates the schema and seeds the catalogue + admin user. |
| `vercel.json` | Routes `/api/*` to the serverless function. |
| `PAYMENTS.md` | **Card payments** — how the flow works, where to watch payments, and how to go live. |
| `.env` | **Secret.** Database credentials. Never commit this. |

Files starting with `_` inside `api/` are shared modules, not routes.

---

## `.env`

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role secret key>
DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
```

Get these from your Supabase project:

- **SUPABASE_URL** and **SUPABASE_SERVICE_KEY** → Project Settings → API.
  Use the `service_role` key (not `anon`). The API is the only thing that talks
  to the database, so it holds the privileged key; Row Level Security is enabled
  with no public policies, which means the anon key cannot reach your data at all.
- **DATABASE_URL** → Project Settings → Database → Connection string → URI.
  Use the direct connection (port `5432`), not the transaction pooler (`6543`),
  which cannot run schema changes.

`DATABASE_URL` is only needed to run `npm run seed`.

---

## API

All endpoints are under `/api`. Admin endpoints require a bearer token belonging
to a user with `is_admin = 1`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/products` | Product catalogue |
| POST | `/api/register` | Create account `{name, email, pass}` |
| POST | `/api/login` | Log in `{email, pass}` → token |
| GET | `/api/me` | Current user (Bearer token) |
| POST | `/api/logout` | End the session |
| GET/POST/PUT/DELETE | `/api/cart` | Cart, scoped by the `x-session` header |
| POST | `/api/orders` | Place an order |
| GET | `/api/orders` | Order history for the signed-in user |
| POST | `/api/orders/track` | Track `{num, zip}` |
| GET/POST/DELETE | `/api/wishlist` | Wishlist (account-scoped when signed in) |
| POST | `/api/wishlist/merge` | Move a guest wishlist onto the account at login |
| GET/POST/PUT/DELETE | `/api/admin/products` | Manage products |
| GET/PUT/DELETE | `/api/admin/orders` | Manage orders and payment status |
| GET/DELETE | `/api/admin/wishlist` | View / remove wishlist entries |
| GET/PUT/DELETE | `/api/admin/users` | Manage users and admin rights |

---

## Admin panel

Sign in at `/admin.html` with the seeded account:

```
admin@maisonvelour.com
admin123
```

Change that password before the site goes public.

---

## Security notes

- Passwords are stored as salted **scrypt** hashes, never plaintext. Existing
  plaintext rows are upgraded automatically the next time that user logs in.
- Login attempts are rate-limited per IP + email (10 failures per 15 minutes).
  On Vercel this counter is per-instance, so it is a speed bump, not a wall.
- All database access goes through the API using the service-role key. Row Level
  Security is on with no public policies, so the public anon key is useless
  against your data.
- User-supplied values are HTML-escaped before being rendered.
- `.env` is gitignored. Never commit it, and never paste real keys into chat or
  issue trackers.

---

## Deploying to Vercel

Push to the connected repository. Vercel serves `public/` as static files and
builds `api/[[...slug]].js` as a serverless function.

Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in the project's environment
variables. **Environment variables only apply to deployments created after they
are added** — after changing them, redeploy.
