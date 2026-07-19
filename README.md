# Shop & Shop-Owner Dashboard

One web app, two roles — **Keeper** (staff of one shop) and **Shop Owner** (client owning 1+ shops).
Companion dashboard to the `new retail v2` Python/Telegram backend; same Supabase project, same
tenant rules. Full feature plan in [PLAN.md](PLAN.md).

## Stack

Next.js (App Router) · Tailwind v4 · Supabase (Postgres + Auth + Storage) · lucide-react.
Reads are React Server Components using the service-role key (server-only); tenant scoping is
enforced in `lib/scope.ts` on every request, mirroring the bots' `_own_shop` guard.

## Run locally

```bash
npm install
npm run dev
```

Create `.env.local` with:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # server only — never NEXT_PUBLIC
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
TELEGRAM_RIDER_BOT_TOKEN=...         # rider assignment pushes (same token as backend)
TELEGRAM_SHOPOWNER_BOT_TOKEN=...     # low-stock pings to shop owners
```

## Deploy (Vercel)

1. Import this GitHub repo in Vercel.
2. Add the same four environment variables (Production + Preview).
3. Deploy — no other config needed.

## Auth

Supabase Auth email/password. **No self-signup**: an account works only if it has a row in
`dashboard_users` (migration `020_dashboard_users.sql` in the backend repo) mapping it to
`role='keeper'` + `shop_id`, or `role='owner'` + `client_id`.

## Build phases (PLAN §9)

- **P1 (this)**: auth, tenant scope, app shell, read-only Home / Orders / Inventory / Chats /
  Riders & COD / Reports / Settings. Dubai-day period math, AED, dark mode, mobile bottom nav.
- **P2**: mutations (confirm/reject, price requests, product CRUD + media, reconcile COD…).
- **P3**: POS + UAE tax invoices.
- **P4**: owner Oversight views + bridge API (escalation reply/handover, Excel exports).
- **P5**: polish pass.
