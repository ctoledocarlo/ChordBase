import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

// Reachable without being signed in. /auth/confirm exchanges the emailed
// reset-link token for a session, so it must be open.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm"];
// Signed-in users have no reason to see these.
const GUEST_ONLY_PATHS = ["/login", "/forgot-password"];

const matches = (pathname: string, paths: string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session cookies and applies route protection:
 * signed-out visitors go to /login, signed-in visitors skip the login pages.
 * (Pages and actions still check access themselves; this is the first gate.)
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Verifies the JWT (don't trust getSession() on the server).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed session cookies on the redirect response.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) {
    return redirectTo("/login");
  }
  if (signedIn && matches(pathname, GUEST_ONLY_PATHS)) {
    return redirectTo("/");
  }
  return response;
}
