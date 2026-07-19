// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// Service-role Supabase client. Server only — the key bypasses RLS and must
// never reach the browser bundle; `server-only` makes a client import a build error.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
