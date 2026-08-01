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
| [`app/(app)/settings/page.tsx`](app/(app)/settings/page.tsx) | renders the Manager PIN card — owner only (035) |
| [`actions/settings.ts::setManagerPin`](actions/settings.ts) | refuses a keeper outright — **the one gate the gated person must not be able to move** |

**Phase 3 added the last two.** Everything else about `/settings` is unchanged: a keeper still opens
the page and still edits every other field on it. Only the PIN card is withheld, and the action
answers a keeper with an error rather than a 404 — someone who reaches it should be told why, not
shown a missing page. That is why `setManagerPin` is role-aware but *not* in the OWNER_ONLY set the
parity test pins.

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
| `/purchases` register | allowed | allowed | allowed (aggregated) | no gate |
| `/purchases` → booking form | allowed | allowed | **degraded** — register still shows, "Pick a shop to book a bill" | `purchases/page.tsx:41` |
| `/purchases/export` | allowed | allowed | allowed | no gate |
| `/reports` | allowed | allowed | allowed | no gate |
| `/reports` → "By shop" table | **absent** | absent | present **only when ≥2 shops traded** ² | `reports/page.tsx:203` |
| `/reports/sales` | allowed | allowed | allowed (aggregated) | no gate |
| `/reports/export` | allowed | allowed | allowed | no gate |
| `/riders`, `/riders/export` | allowed | allowed | allowed | no gate |
| `/chats`, `/chats/[identity]` | allowed | allowed | allowed (aggregated) | no gate |
| `/settings` | allowed | allowed | **allowed — every shop in scope** | `settings/page.tsx:36` |
| `/logs` (4 views: activity · **approvals** · cancels · discounts) | **denied** — not-found page, but **HTTP 200** ¹ | allowed | allowed | `logs/page.tsx:93` |
| `/logs/export` | **denied — HTTP 404** | allowed | allowed | `logs/export/route.ts:13` |
| `/settings` → Manager PIN card | **absent** | present | present (per shop) | `settings/page.tsx` + `actions/settings.ts` |

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
**identical for both roles**, and that is deliberate: it is not the *role* that gates them but the
**manager PIN** (migration 035, Phase 3). A keeper may still do all of it; past a threshold they must
fetch someone with the PIN, and either way the attempt is written to `override_approvals` and shown
in the owner's Approvals view. The two things a keeper cannot do are read `/logs` and set the PIN.

## The manager PIN, in one table (035)

Thresholds are constants in [`lib/override-rules.ts`](lib/override-rules.ts); per-shop deltas live in
`manager_pins.limits`. Every one gates the **loosening direction only** — list price, a price rise,
a restock and a small cancel are all still one tap.

| Action | Asks for a PIN when | Where |
|---|---|---|
| POS cart discount | > 200 AED **or** > 10% of the cart | `actions/pos.ts::checkoutSale` |
| Unit price at the till | below cost · below `min_price` · > 10% under `selling_price` | same |
| Void | > 1,000 AED **or** not today's sale | `actions/pos.ts::voidSale` |
| Order cancel | > 2,000 AED | `actions/orders.ts::cancelOrder` |
| Stock adjustment | > 5 units **or** > 1,000 AED at cost | `actions/products.ts::adjustStock` |
| Product delete | always (asked last — the FK refuses anything with stock history first) | `actions/products.ts::deleteProduct` |
| `cost_price` edit | always | `actions/products.ts::updateProduct` |
| `selling_price` cut | > 15% below the current price (raising never asks) | same |
| TRN change | always, and only when it actually changes | `actions/settings.ts::setInvoiceIdentity` |
| Emirate change (036) | always, and only when it actually changes | `actions/settings.ts::setVatProfile` |

Booking a supplier bill is **not** gated, and that is the same principle upside down: it is money
*out*, it is the paper the shop was handed, and a till that asks permission to file its bills does
not get its bills filed. What protects that side is the unique index — the same document cannot be
claimed twice however it is typed.

**No PIN set = nothing blocked.** The action goes through and logs `outcome='unset'`, so the owner's
first look at the Approvals view is a priced list of what has been happening unsupervised. Five wrong
PINs lock the shop's row with an exponential backoff; setting a new PIN clears it.

**The PIN is the shop's, not a role gate — it stops the owner too.** Confirmed live on 2026-08-01
under `owner1@owner.ae`: a +1 stock adjust on a 2,600 AED phone raised the same prompt it raises for
a keeper. That is deliberate (the owner knows the PIN, so it costs them one field) and it is what
makes the approvals log honest — otherwise "approved" would only ever mean "a keeper did it".

## Open questions for the owner (decision D0)

Each of these is a real difference the matrix turned up. Only you can say which side is right.

1. **Three pages need one shop; they disagree about what to do.** All three confirmed live on
   "All shops": `/pos` and `/orders/new` both render "Pick a shop first", while `/inventory/new`
   renders a real `<select name="shop_id">` listing both shops. Refusing at the till is defensible —
   you are standing at one counter. Refusing to *write down an order* is harder to justify when
   adding a product from the same screen state works fine.
   Minor, same row: the picker defaults to `scope.shops[0]`, which is the **oldest** shop by
   `created_at` (Shop 02 — Abu Dhabi here), not the one the owner last used.

2. **A keeper can change the shop's TRN** — `setInvoiceIdentity` is tenant-gated only, and the TRN
   prints on every tax invoice while Phase 1's guard refuses checkout without one, so a keeper could
   halt the till or print a wrong TRN on real documents. **Phase 3 made it always-PIN**, verified
   live on 2026-08-01: as `shop1@shop.ae`, editing the TRN returned
   *"Manager PIN required — TRN 100123456700003 → 999888777666555"* and the shop row was unchanged.
   Still open for you: should it be **owner-only** rather than PIN-gated? A keeper with the PIN can
   still do it.

3. ~~**A keeper can hard-delete a product** (`deleteProduct`), edit `cost_price`, void any sale and
   cancel any order, with no ceiling.~~ **Answered by Phase 3** — see the PIN table above. Still your
   call whether the default numbers are the right ones for this shop.

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

## Live run, 2026-08-01 — the PIN gate under a keeper

`shop1@shop.ae`, with a temporary PIN set on Shop 01 and removed afterwards.

| Check | Result |
|---|---|
| Manager PIN card on `/settings` | **absent** ✓ (owner-only) |
| Ring a 3,399 AED iPhone at **1 AED** | refused — *"Apple iPhone 16 at AED 1.00 — BELOW COST AED 2600.00"*. The cost came from the products row; the browser was never sent it. |
| …did anything get written? | **no** — no `counter_sales`, no invoice, no stock move, Today's cash/card still 0 |
| Wrong PIN | *"Wrong PIN. 4 attempt(s) left."* + one `refused` row |
| 5th wrong PIN | *"locked for 1 minute(s)"*, prompt withdrawn, `locked_until` set, one `locked` row |
| Correct PIN on a +1 stock adjust (2,600 AED at cost) | approved, stock 5 → 6, `fail_count` reset to 0 |
| …and −1 back | approved, 5 again; `quantity` = `sum(stock_moves.delta)` = 5 |
| TRN change | refused without a PIN, applied with one, restored the same way — both logged |

Found and fixed during that run: React 19 resets an uncontrolled form once its action returns, so a
PIN carried as a form *field* would have re-sent the **original** values — on the TRN that is a
silent no-op (nothing differs, so nothing is gated, so nothing changes). Every form caller now uses
`usePinRetry`, which replays the FormData that was actually submitted.

## Live run, 2026-08-01 — the owner half

`owner1@owner.ae` on "All shops".

| Check | Result |
|---|---|
| Manager PIN card on `/settings` | present on **both** shops (absent for the keeper) ✓ |
| `setManagerPin` | the owner set a PIN on each shop through the UI — two `manager_pins` rows, `set_by dashboard:owner1@owner.ae`. The supabase-js upsert path works. |
| `/logs?view=approvals` | all 6 rows, correct labels and badges, `4 APPROVED · 2 REFUSED` |
| `/logs/export?view=approvals` | 200, BOM, 6 rows, `Kind` column disambiguates the units |
| the owner's own +1 stock adjust | **also gated** — same prompt, stock unchanged, nothing logged |

Fixed here: the Approvals view printed `limit AED 5` against `stock_adjust`, whose threshold is 5
**units**. `limitText()` now follows `kind` — units for a stock correction, percent for a price cut,
AED otherwise. The CSV keeps raw numbers, which is right for a spreadsheet, and its `Kind` column
says which is which.

## Live run, 2026-08-01 — purchases and the VAT profile (036)

`owner1@owner.ae` with Shop 01 — Dubai Marina active. Every row below was driven through the real
server actions in the browser, not through SQL.

| Check | Result |
|---|---|
| `addSupplier` | "ZZ Probe Trading added." |
| the same name as `"  zz probe TRADING  "` | refused — *"already a supplier here"*. The unique index is on `lower(btrim(name))`, so one supplier cannot become two accounts. |
| VAT auto-fill | typing a 1,000 net filled VAT as `50.00`; typing over it stops the auto-fill for good |
| `bookPurchase` INV-7001 (1000 / 50) | booked, **no warning** — 50 is exactly 5% |
| the same bill as `"  inv-7001 "` | refused — *"already booked — claiming it twice is what the FTA looks for"* |
| INV-7002 (1000 / **100**) | **booked**, with *"VAT 100.00 is 50.00 off 5% of 1000.00 (50.00). Booked as entered — check the bill."* A warning is not a refusal. |
| cards ↔ register ↔ CSV | AED 2,000.00 net · AED 150.00 input VAT · AED 150.00 claimable, agreeing to the fil across all three |
| filing period monthly → quarterly | saved with **no prompt** — a display default is not a tax figure |
| emirate (none) → Dubai | **"Manager PIN required — Emirate (none) → Dubai."**, nothing written, and **no `override_approvals` row** — 035's rule that a prompt appearing is not a decision holds for the new kind |
| `/purchases` for an owner on "All shops" | register aggregates, booking form replaced by "Pick a shop to book a bill" |

Every probe row was deleted afterwards, unlike Phase 3's approvals rows: a fabricated supplier bill
is a *tax record*, and a claim for input VAT that never happened is not something to leave on a real
shop's books. The `audit_logs` entries stay — that table is append-only and the entries are true.

### Second run, same day, after the owner set a PIN-approved emirate

Eight bills across three treatments and both claimable states, booked through the form:

| Check | Result |
|---|---|
| photo of the bill | uploaded straight to `shop-media` via the signed PUT; the row renders a **Bill** link from a batched `createSignedUrls` |
| `reverse_charge` + `not claimable` badges | both render; a `standard` claimable bill shows neither |
| VAT 155.50 on a 3,000 net | booked, warned *"5.50 off 5% of 3000.00 (150.00)"* |
| VAT **50.02** on a 1,000 net | booked **silently** — a bill that merely rounds must not cry wolf, or the warning gets ignored |
| duplicate typed `"  gmd-2026-0455 "` | refused |
| page ↔ CSV ↔ SQL | 8 bills · **12,750.00** net · **595.52** input VAT · **415.52** claimable, identical all three ways |
| `/logs?view=approvals` | `5 approved · 2 refused`, newest row **"Emirate changed · approved · Emirate (none) → Dubai · owner1@owner.ae · Shop 02"** — and invisible while Shop 01 was the active shop, which is the scoping working |

**Timing finding, fixed here.** React 19 does reset an uncontrolled form after a function action, but
only once the whole transition settles — and this transition contains a `router.refresh()`. Measured:
the action returned at ~2.5 s while the transition ran to **7.5 s**, so for five seconds the form
still showed the previous bill's tick-box and note. The submit button is `disabled` for that entire
window, so no user could have booked a second bill with stale flags — but anything typed in it would
have been wiped when the reset finally landed. Both forms now call `formRef.current?.reset()` the
moment the action returns; re-measured, the fields are clean at 3.9 s and the button re-enables at
7.5 s. (The one row that *did* inherit stale flags during testing was a script calling
`requestSubmit()` past the disabled button — not a path the UI offers.)

Shop 01's `emirate` is **still unset**, on purpose: the PIN is the owner's and was never shared with
me. Phase 5's return needs it, so it is the one field the owner has to fill themselves.

## What the test pins

[`lib/role-parity.test.ts`](lib/role-parity.test.ts), four assertions, source-level so it needs no
login, no database and no server:

1. The set of files mentioning `scope.role` is exactly the seven above. A new name means a role
   difference was introduced — add it here with a reason, or take it out.
2. The files that refuse a keeper outright are exactly `/logs` and `/logs/export`, **and** any
   owner-only page whose directory has an `export/route.ts` sibling must gate that route too. This
   is the leak shape: gate the page, forget the route, and the same rows leave as a file.
3. Every page and route calls `getScope()` before it reads anything.
4. Every server action reaches a tenant guard.

Proven to discriminate: deleting the gate from `logs/export/route.ts` fails assertions 1 and 2, the
second with *"a page gated without its export route leaks the same rows"*. Re-proven on 2026-08-01
by dropping `actions/settings.ts` from `ROLE_AWARE` — assertion 1 fails naming it.

[`lib/override.test.ts`](lib/override.test.ts) pins the other half: that the scrypt digest verifies
the right PIN and nothing else (including with the pepper missing or wrong), and that every
threshold in the table above bites where it should and stays quiet where it should. Proven to
discriminate by raising `discount_aed` to 100000 — the discount test fails on *"250 is over the AED
limit even on a huge cart"*. `scripts/pos_integration_check.py` covers what neither can reach: that
Node's scrypt defaults and Python's agree on the same digest, and that anon gets 401 on both new
tables.
