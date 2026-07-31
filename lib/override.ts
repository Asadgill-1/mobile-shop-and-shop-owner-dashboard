// Manager PIN gate (migration 035).
//
// Phase 1d measured it live: every destructive action here is identical for a keeper and the shop
// owner. This is the ceiling on the loosening direction only — a deeper discount, a lower price, a
// bigger void — and never on charging list price. Raising a price, selling at list, restocking and
// cancelling a 50 AED order all stay one tap, because a till that asks permission to do its job
// stops being a till.
//
// THERE IS NO OVERRIDE TOKEN. The PIN is verified inside the same server action that performs the
// write, after getScope()/assertShop has already established the caller may touch this shop. There
// is no window between approval and effect, nothing to replay, and nothing to steal from a
// client-side store. The amounts compared against the thresholds are read from the database inside
// that same action — never taken from the browser, which is the whole reason a 1 AED phone was
// possible before this.
//
// Hashing is scrypt + an env pepper, NOT pgcrypto: crypt('123456', …) travels inside the SQL body,
// so the PIN would land in the query log, in Supabase's request log and in any pooler between here
// and the database. A 6-digit PIN is 10^6 — the per-row salt stops one table scan cracking every
// shop at once, and the pepper (which never touches the database) is what makes a DB-only leak
// worthless.
//
// FAILS OPEN, LOUDLY. A shop with no manager_pins row is blocked from nothing, but every
// over-threshold action still writes an override_approvals row with outcome='unset'. The owner's
// first look at the approvals view is a priced list of what has been happening unsupervised, which
// argues for setting a PIN far better than a locked screen — and means this cannot break a live
// shop on the day it ships.
import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";
import { LIMITS, PIN_MIN, pinError, type Limits, type OverrideNeed, type OverrideRefusal } from "./override-rules";

// One import for every call site: the thresholds and the vocabulary live in override-rules.ts,
// which has no imports of its own and so can be tested without a database.
export * from "./override-rules";

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const KEYLEN = 64;
/** Wrong PINs before the row locks. The 5th strike starts the backoff. */
const MAX_FAILS = 5;
const MAX_LOCK_MIN = 60;

async function log(
  shopId: string,
  actor: string,
  needs: OverrideNeed[],
  outcome: "approved" | "refused" | "locked" | "unset",
): Promise<void> {
  // ponytail: best-effort, the same call the audit trail makes — a POS that refuses to sell because
  // a secondary insert failed is a worse failure than a missing log line, and a failed write here is
  // not silent (it surfaces in the platform log). Make it blocking if an auditor ever asks.
  await db.from("override_approvals").insert(
    needs.map((n) => ({
      shop_id: shopId,
      kind: n.kind,
      outcome,
      actor,
      amount: n.amount ?? null,
      threshold: n.threshold ?? null,
      detail: n.detail,
      ref_table: n.ref?.table ?? null,
      ref_id: n.ref?.id ?? null,
    })),
  );
}

/**
 * Gate one action.
 *
 * `build` receives the shop's effective limits and returns what (if anything) needs approving — a
 * closure rather than a plain array so the whole check costs ONE round trip on the ordinary sale
 * that trips nothing.
 *
 * Returns null to proceed. Anything else is the refusal to hand straight back to the caller;
 * `needsPin` tells the UI to ask for a PIN and try the identical call again.
 */
export async function requireOverride(
  shopId: string,
  actor: string,
  pin: string | undefined,
  build: (limits: Limits) => OverrideNeed[],
): Promise<OverrideRefusal | null> {
  const { data: row } = await db
    .from("manager_pins")
    .select("pin_hash,pin_salt,limits,fail_count,locked_until")
    .eq("shop_id", shopId)
    .maybeSingle();

  const limits: Limits = { ...LIMITS, ...((row?.limits ?? {}) as Partial<Limits>) };
  const needs = build(limits);
  if (needs.length === 0) return null;

  if (!row) {
    await log(shopId, actor, needs, "unset");
    return null; // fails open — see the header
  }

  const pepper = process.env.OVERRIDE_PEPPER;
  if (!pepper) {
    // A deployment fault, not a wrong PIN: never spend a strike on it, and never lock a shop out of
    // its own till because an env var went missing between deploys.
    return {
      ok: false,
      error: "Manager approval is unavailable — OVERRIDE_PEPPER is not set on the server.",
    };
  }

  const now = Date.now();
  const lockedFor = row.locked_until
    ? Math.ceil((new Date(row.locked_until).getTime() - now) / 60_000)
    : 0;
  if (lockedFor > 0) {
    await log(shopId, actor, needs, "locked");
    return { ok: false, error: `Too many wrong PINs — locked for ${lockedFor} more minute(s).` };
  }

  const entered = (pin ?? "").trim();
  if (!entered) {
    // Deliberately NOT logged: this is the prompt appearing, not a decision. Logging it would bury
    // the real approvals under a row for every cancelled keystroke.
    const why = needs.map((n) => n.detail).join(" · ").slice(0, 300);
    return { ok: false, needsPin: true, error: `Manager PIN required — ${why}.` };
  }

  // Lockout is checked above so a wrong-PIN storm cannot pin the event loop on 64ms hashes.
  const got = await scryptAsync(entered + pepper, row.pin_salt, KEYLEN);
  const want = Buffer.from(row.pin_hash, "hex");
  const ok = want.length === got.length && timingSafeEqual(got, want);

  if (!ok) {
    const fails = row.fail_count + 1;
    const lockMin = fails >= MAX_FAILS ? Math.min(2 ** (fails - MAX_FAILS), MAX_LOCK_MIN) : 0;
    await db
      .from("manager_pins")
      .update({
        fail_count: fails,
        locked_until: lockMin ? new Date(now + lockMin * 60_000).toISOString() : null,
      })
      .eq("shop_id", shopId);
    await log(shopId, actor, needs, lockMin ? "locked" : "refused");
    // No needsPin once locked: the prompt would only invite a 6th guess it cannot spend.
    return lockMin
      ? { ok: false, error: `Wrong PIN — locked for ${lockMin} minute(s).` }
      : {
          ok: false,
          needsPin: true,
          error: `Wrong PIN. ${MAX_FAILS - fails} attempt(s) left.`,
        };
  }

  if (row.fail_count > 0 || row.locked_until) {
    await db
      .from("manager_pins")
      .update({ fail_count: 0, locked_until: null })
      .eq("shop_id", shopId);
  }
  await log(shopId, actor, needs, "approved");
  return null;
}

/** Hash a new PIN for storage. Returns the error instead when it cannot be stored safely. */
export async function newPinRow(
  pin: string,
): Promise<{ ok: true; pin_hash: string; pin_salt: string } | { ok: false; error: string }> {
  const bad = pinError(pin);
  if (bad) return { ok: false, error: bad };
  const pepper = process.env.OVERRIDE_PEPPER;
  if (!pepper) {
    // Storing a peppered hash without a pepper would make the digest 10^6 guesses on its own, and
    // every PIN set now would stop verifying the moment the var appeared. Refuse, loudly.
    return { ok: false, error: "OVERRIDE_PEPPER is not set on the server — ask your admin first." };
  }
  const pin_salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(pin + pepper, pin_salt, KEYLEN);
  return { ok: true, pin_hash: hash.toString("hex"), pin_salt };
}
