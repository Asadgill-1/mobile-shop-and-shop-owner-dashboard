// Cookie-bound Supabase auth client (anon key) for RSCs and server actions.
// Data reads never use this — they go through the service-role client in db.ts
// after getScope() has resolved the tenant. This client only answers "who is logged in".
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function supabaseAuth() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from an RSC (read-only cookies) — middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
