// Session refresh + auth gate (PLAN §3.2). Signed-out requests land on /login;
// signed-in visits to /login bounce home. Supabase tokens are refreshed here so
// RSCs (read-only cookies) always see a valid session.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // ...unless we sent them here BECAUSE they have no dashboard account. getScope() redirects a
  // signed-in but unprovisioned user to /login?error=noaccess; bouncing them home would land on
  // that same redirect again, forever — and `url.search = ""` would throw the explanation away
  // too. Easy to hit on localhost, where this app and the platform console share the Supabase
  // cookie (cookies ignore port), but the loop is the two rules disagreeing, not the cookie.
  const noAccess = request.nextUrl.searchParams.get("error") === "noaccess";
  if (user && isLogin && !noAccess) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
