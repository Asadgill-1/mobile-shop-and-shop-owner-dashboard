// run: node --test lib/role-parity.test.ts
//
// Keeper and shop owner are served by the SAME app, differing only in what dashboard_users.role
// resolves to in lib/scope.ts. Nothing else in the codebase tests that the difference is deliberate,
// and there are two ways it goes wrong that no type checker can see:
//
//   1. A gate lands on a page but not on the export route beside it. /logs is owner-only precisely
//      because a keeper must not read the owner's oversight views — and /logs/export serves the same
//      rows as a file. Gate one, forget the other, and the data walks out of the door you left open.
//   2. A new surface ships with no tenant guard at all, so it answers for every shop in the table
//      rather than the caller's own.
//
// This is a SOURCE-level test on purpose: it needs no login, no database and no running server, so
// it fails in CI the moment a gate goes missing rather than the day someone tries the URL. Same
// shape as the backend's tests/messaging/test_channel.py, which pins a call-site count.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = "app/(app)";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p.replace(/\\/g, "/")];
  });
}

const surfaces = walk(APP).filter((f) => f.endsWith("/page.tsx") || f.endsWith("/route.ts"));
const actions = readdirSync("actions").map((f) => `actions/${f}`).filter((f) => f.endsWith(".ts"));
const read = (f: string) => readFileSync(f, "utf8");

/** Files that branch on WHO is asking, rather than only on which shops they own. */
const ROLE_AWARE = [
  "actions/shop.ts", // only an owner may move the active-shop cookie
  "actions/settings.ts", // only an owner may SET the manager PIN (035) — see below
  `${APP}/layout.tsx`, // nav entries + the shop switcher
  `${APP}/logs/export/route.ts`, // owner-only, and the twin of the page below
  `${APP}/logs/page.tsx`, // owner-only oversight views
  `${APP}/reports/page.tsx`, // the "By shop" comparison table
  `${APP}/settings/page.tsx`, // renders the manager-PIN card for owners only
].sort();

/**
 * The subset that REFUSES a keeper outright. Page and export route must move together.
 *
 * settings is deliberately NOT here: a keeper still loads /settings and still edits everything they
 * could before. Only the manager-PIN card is withheld, and setManagerPin returns an error rather
 * than a 404 — a keeper who reaches it should be told why, not shown a missing page.
 */
const OWNER_ONLY = [`${APP}/logs/export/route.ts`, `${APP}/logs/page.tsx`].sort();

test("the set of role-aware files is exactly the intended one", () => {
  const found = [...walk(APP), ...actions]
    .filter((f) => /\.tsx?$/.test(f) && read(f).includes("scope.role"))
    .sort();

  // A new name here is not automatically wrong — it means a role difference was introduced and
  // nobody wrote down whether it was meant. Add it to ROLE_AWARE with a comment saying why.
  assert.deepEqual(found, ROLE_AWARE);
});

test("an owner-only page and its export route are gated together", () => {
  const denies = (src: string) =>
    /scope\.role\s*!==\s*"owner"/.test(src) && /notFound\(\)|status:\s*404/.test(src);

  const found = [...walk(APP)]
    .filter((f) => /\.tsx?$/.test(f) && denies(read(f)))
    .sort();
  assert.deepEqual(found, OWNER_ONLY, "a page gated without its export route leaks the same rows");

  // The pairing rule itself, so a SECOND owner-only page cannot ship half-gated either.
  for (const page of found.filter((f) => f.endsWith("/page.tsx"))) {
    const route = page.replace(/\/page\.tsx$/, "/export/route.ts");
    if (surfaces.includes(route)) {
      assert.ok(denies(read(route)), `${route} serves ${page}'s rows and must refuse a keeper too`);
    }
  }
});

test("every page and route resolves a scope before it reads anything", () => {
  const ungated = surfaces.filter((f) => !read(f).includes("getScope"));
  assert.deepEqual(ungated, [], "a surface that never calls getScope answers for every tenant");
});

test("every server action reaches a tenant guard", () => {
  // auth.ts is the sign-in/sign-out pair — it runs BEFORE there is a scope to guard with.
  const guard = /shopIds|assertShop|ownProduct|scopedShopIds/;
  const ungated = actions.filter((f) => f !== "actions/auth.ts" && !guard.test(read(f)));
  assert.deepEqual(ungated, [], "an action with no shop_id filter writes to any tenant");
});
