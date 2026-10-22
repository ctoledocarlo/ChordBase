import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where Google sends people back to after they choose an account:
//   {SiteURL}/auth/callback?code=...
// Exchanges the one-time code for a session (the same login cookies a password login sets), then opens the app.
// A Google account that isn't linked to a church signs in but sees nothing, and gets the usual "not linked yet" notice.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.redirect(new URL("/login?error=oauth", request.url));
}
