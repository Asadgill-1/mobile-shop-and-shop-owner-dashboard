# Role matrix — keeper vs shop owner

Built from source on 2026-07-31 and verified live under **both** roles — `shop1@shop.ae` (keeper) and
`owner1@owner.ae` on "All shops" (2 shops in scope, no `active_shop` cookie). Every cell below
matched except the two noted. Keeper and shop owner are served by **the same app**; the only
difference is what `dashboard_users.role` resolves to in [`lib/scope.ts`](lib/scope.ts). This file
records which differences are deliberate. [`lib/role-parity.test.ts`](lib/role-parity.test.ts) pins
it — a gate added or removed makes that test fail rather than shipping.

## Three states, not two

| State | `shopIds` | `activeShopId` | `scopedShopIds()` |
|---|---|---|---|
| **keeper** | exactly one | always that one (`scope.ts:65`) | that one |
| **owner, one shop picked** | every shop of the client | the cookie pick (`scope.ts:67`) | the pick |
| **owner, "All shops"** | every shop of the client | **`null`** (`scope.ts:68`) | all of them |

The third state is where things go wrong: a surface that needs *one* shop id has nothing to use.

## Where role is actually consulted

Five files, and that is the whole list.

| File | What it decides |
|---|---|
| [`lib/scope.ts:49,52,66`](lib/scope.ts) | resolves the role into shops + the active-shop cookie |
| [`app/(app)/logs/page.tsx:93`](app/(app)/logs/page.tsx) | `role !== "owner"` → `notFound()` |
| [`app/(app)/logs/export/route.ts:13`](app/(app)/logs/export/route.ts) | `role !== "owner"` → 404 — **the twin of the page above** |
| [`app/(app)/reports/page.tsx:44,203`](app/(app)/reports/page.tsx) | the "By shop" comparison table |
| [`app/(app)/layout.tsx:32,44`](app/(app)/layout.tsx) | nav entries + the shop switcher |
| [`actions/shop.ts:12`](actions/shop.ts) | only an owner may move the active-shop cookie |

**Everything else is tenant-gated, not role-gated.** Every one of the 37 server actions reaches
`shopIds` / `assertShop` / `ownProduct` (only `actions/auth.ts` does not, correctly — it runs before
there is a scope). No action asks *who* is calling.

## Surfaces

`allowed` = same for both · `degraded` = works but does less · `denied` = refused.

| Surface | keeper | owner + shop | owner, all shops | decided at |
|---|---|---|---|---|
| `/` home | allowed | allowed | allowed (aggregated) | no gate |
| `/orders`, `/orders/[id]` | allowed | allowed | allowed (aggregated) | no gate |
| `/orders/new` | allowed | allowed | **denied** — "Pick a shop first" | `orders/new/page.tsx:13` |
| `/orders/export` | allowed | allowed | allowed | no gate |
| `/inventory`, `/inventory/[id]` | allowed | allowed | allowed (aggregated) | no gate |
| `/inventory/new` | allowed | allowed | **allowed — shop picker** | `inventory/new/page.tsx:9` + `product-form.tsx:72` |
| `/inventory/export` | allowed | allowed | allowed | no gate |
| `/invoices`, `/invoices/[id]` | allowed | allowed | allowed (aggregated) | no gate |
| `/invoices/export` | allowed | allowed | allowed | no gate |
| `/pos` | allowed | allowed | **denied** — "Pick a shop first" | `pos/page.tsx:15` |
| `/reports` | allowed | allowed | allowed | no gate |
| `/reports` → "By shop" table | **absent** | absent | present **only when ≥2 shops traded** ² | `reports/page.tsx:203` |
| `/reports/sales` | allowed | allowed | allowed (aggregated) | no gate |
| `/reports/export` | allowed | allowed | allowed | no gate |
| `/riders`, `/riders/export` | allowed | allowed | allowed | no gate |
| `/chats`, `/chats/[identity]` | allowed | allowed | allowed (aggregated) | no gate |
| `/settings` | allowed | allowed | **allowed — every shop in scope** | `settings/page.tsx:36` |
| `/logs` | **denied** — not-found page, but **HTTP 200** ¹ | allowed | allowed | `logs/page.tsx:93` |
| `/logs/export` | **denied — HTTP 404** | allowed | allowed | `logs/export/route.ts:13` |

¹ Measured live under a keeper session on the dev server: `notFound()` renders "This item doesn't
exist, or it belongs to another shop." and the keeper sees nothing, so access control holds — but the
document response is `200 OK`, while the export route beside it answers a real `404`. Not worth
changing on its own; worth knowing before anything (uptime check, crawler, script) starts trusting
the status code to mean "denied". Unverified in a production build, where Next may set 404.

² The gate is `isOwner && !activeShopId && perShop.length > 1`, so the table needs **two shops with
activity in the period**, not just two shops. Live on the July range the owner's export shows
`BY SHOP` with a single row (Shop 01 — 14 orders, 14796.00, 22.61%) because Shop 02 has never traded,
and the page correctly hides a one-row comparison. **The role half of this row is therefore not
provable with today's data** — it is the only cell in this table not confirmed live.
Note the deliberate divergence: the **CSV keeps the `BY SHOP` block even at one row** (stable file
shape for a spreadsheet) while the **page hides it** (a one-row comparison is noise on screen).

Every destructive action — void, cancel, delete, price edit, TRN change, stock adjust — is
**identical for both roles**. `/logs` is the only thing a keeper cannot reach.

## Open questions for the owner (decision D0)

Each of these is a real difference the matrix turned up. Only you can say which side is right.

1. **Three pages need one shop; they disagree about what to do.** All three confirmed live on
   "All shops": `/pos` and `/orders/new` both render "Pick a shop first", while `/inventory/new`
   renders a real `<select name="shop_id">` listing both shops. Refusing at the till is defensible —
   you are standing at one counter. Refusing to *write down an order* is harder to justify when
   adding a product from the same screen state works fine.
   Minor, same row: the picker defaults to `scope.shops[0]`, which is the **oldest** shop by
   `created_at` (Shop 02 — Abu Dhabi here), not the one the owner last used.

2. **A keeper can change the shop's TRN.** `setInvoiceIdentity` ([`actions/settings.ts:18`](actions/settings.ts))
   is tenant-gated only. The TRN is printed on every tax invoice, and Phase 1's guard now refuses
   checkout without one — so a keeper can halt the till, or print a wrong TRN on real tax documents.
   **Confirmed live** under `shop1@shop.ae`: `/settings` renders one shop with the TRN field
   editable. Phase 3 lists this as always-PIN; worth confirming that is the intent rather than
   owner-only.

3. **A keeper can hard-delete a product** (`deleteProduct`), edit `cost_price`, void any sale and
   cancel any order, with no ceiling. Phase 3's thresholds are the answer, and they need this table
   to know which role is doing it.

4. **The console (`owner-dashboard-mobile`) has no roles at all.** One `requireOwner()` email
   allowlist, and every allowlisted operator can hard-delete chat transcripts across every shop
   (`actions/messages.ts:20`). Decide whether that stays single-tier.

## Live run, 2026-07-31

| Check | keeper `shop1@shop.ae` | owner `owner1@owner.ae`, All shops |
|---|---|---|
| `/logs` | not-found page (HTTP 200) | renders ✓ |
| `/logs/export` | **HTTP 404** | 200 + CSV ✓ |
| "Shop logs" nav entry | absent | present |
| `/pos` | works, "Shop 01 — Dubai Marina" | "Pick a shop first" |
| `/orders/new` | works | "Pick a shop first" |
| `/inventory/new` | works | shop `<select>`, both shops |
| `/settings` | 1 shop, **TRN editable** | 2 shops |
| `/reports` "By shop" | absent | absent — only 1 shop has traded (see ²) |
| exports: orders · riders · logs · invoices · inventory · reports | all 200 + CSV except logs (404) | all 200 + CSV |

The gated pair behaves: `/logs/export` is the one surface that answers **404 to a keeper and CSV to
an owner**, which is exactly what the test in the next section exists to keep true.

Confirmed in passing: the keeper's exports appear in the **owner's** `/logs` as "exported the stock
list with valuations", "exported the invoice register (…)" — so the `dexport` action added in Phase
1c does what it was for. Who pulled a copy of the books is visible to the owner.

## What the test pins

[`lib/role-parity.test.ts`](lib/role-parity.test.ts), four assertions, source-level so it needs no
login, no database and no server:

1. The set of files mentioning `scope.role` is exactly the five above. A new name means a role
   difference was introduced — add it here with a reason, or take it out.
2. The files that refuse a keeper outright are exactly `/logs` and `/logs/export`, **and** any
   owner-only page whose directory has an `export/route.ts` sibling must gate that route too. This
   is the leak shape: gate the page, forget the route, and the same rows leave as a file.
3. Every page and route calls `getScope()` before it reads anything.
4. Every server action reaches a tenant guard.

Proven to discriminate: deleting the gate from `logs/export/route.ts` fails assertions 1 and 2, the
second with *"a page gated without its export route leaks the same rows"*.
