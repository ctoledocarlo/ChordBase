import { NextResponse, type NextRequest } from "next/server";
import { INTENT_COOKIE, isAccountType } from "@/lib/account-type";
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
    if (!error) {
      // A new account remembers which door it came in by (a church registering, or an individual joining).
      const intent = request.cookies.get(INTENT_COOKIE)?.value;
      if (isAccountType(intent)) {
        const { data } = await supabase.auth.getUser();
        if (data.user && !isAccountType(data.user.user_metadata?.account_type)) await supabase.auth.updateUser({ data: { account_type: intent } });
      }
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete(INTENT_COOKIE);
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", request.url));
}
