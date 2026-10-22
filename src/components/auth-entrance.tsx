"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type AccountType } from "@/lib/account-type";
import { LoginForm } from "./auth-forms";
import { GoogleSignIn } from "./google-sign-in";
import { SignUpForm } from "./sign-up-form";

type Mode = "login" | "signup";

const COPY: Record<AccountType, Record<Mode, { title: string; text: string }>> = {
  individual: {
    login: { title: "Welcome back", text: "Log in to your church's songs and setlists." },
    signup: {
      title: "Create your account",
      text: "For band and media team members. After you sign up, you find your church and apply; its main account lets you in.",
    },
  },
  church: {
    login: { title: "Church log in", text: "For your church's main account." },
    signup: {
      title: "Register your church",
      text: "For a church's main account. You manage your team and decide who joins. A church has up to 2 main accounts.",
    },
  },
};

const href = (as: AccountType, mode: Mode) => `/login?as=${as}${mode === "signup" ? "&mode=signup" : ""}`;

/**
 * The front door. There are two: Individual (a member of a church's team) and Church (the church's own main account),
 * each with its own log in and its own sign up, so each account starts in the right place.
 */
export function AuthEntrance() {
  const params = useSearchParams();
  const as: AccountType = params.get("as") === "church" ? "church" : "individual";
  const mode: Mode = params.get("mode") === "signup" ? "signup" : "login";
  const copy = COPY[as][mode];

  return (
    <>
      <div role="tablist" aria-label="Who is this for" className="mb-8 grid grid-cols-2 rounded-lg border border-line p-1 text-sm">
        {(["individual", "church"] as const).map((kind) => (
          <Link
            key={kind}
            href={href(kind, mode)}
            replace
            role="tab"
            aria-selected={as === kind}
            className={`rounded-md px-3 py-2 text-center font-medium transition-colors ${as === kind ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
          >
            {kind === "individual" ? "Individual" : "Church"}
          </Link>
        ))}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mb-8 mt-2 text-muted">{copy.text}</p>

      {mode === "login" ? <LoginForm /> : <SignUpForm key={as} as={as} />}

      <div className="mt-6">
        <GoogleSignIn as={as} signup={mode === "signup"} />
      </div>

      <p className="mt-8 text-sm text-muted">
        {mode === "login" ? (
          <>
            {as === "church" ? "Is your church new to ChordBase?" : "New here?"}{" "}
            <Link href={href(as, "signup")} replace className="font-medium text-foreground underline">
              {as === "church" ? "Register your church" : "Create an account"}
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={href(as, "login")} replace className="font-medium text-foreground underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </>
  );
}
