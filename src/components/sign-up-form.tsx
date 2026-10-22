"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INTENT_COOKIE, MAX_CHURCH_NAME, MIN_PASSWORD, churchNameProblem, passwordProblem, tidyChurchName, type AccountType } from "@/lib/account-type";
import { createClient } from "@/lib/supabase/client";

/** What Supabase said, in words a person can act on. */
function friendly(error: { message: string; status?: number; code?: string }): string {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") return "Too many attempts. Please wait a little and try again.";
  if (error.code === "user_already_exists" || /already registered/i.test(error.message)) return "That email already has an account. Log in instead.";
  if (error.code === "weak_password") return error.message;
  if (error.code === "signup_disabled" || /signups not allowed/i.test(error.message)) return "Sign-ups are turned off right now.";
  return "Couldn't create the account. Please try again.";
}

/**
 * Making an account with an email and password. A church gives its name and becomes its first main account; an
 * individual just signs up and then applies to a church. Either way the account's kind is saved with it.
 */
export function SignUpForm({ as }: { as: AccountType }) {
  const router = useRouter();
  const [church, setChurch] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    const problem = (as === "church" ? churchNameProblem(church) : null) ?? passwordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { account_type: as, ...(as === "church" ? { church_name: tidyChurchName(church) } : {}) },
      },
    });
    setBusy(false);
    if (error) return setError(friendly(error));
    // With "confirm email" on, an address that already has an account comes back without an error and without identities.
    if (data.user && data.user.identities?.length === 0) return setError("That email already has an account. Log in instead.");
    if (data.session) {
      document.cookie = `${INTENT_COOKIE}=; path=/; max-age=0`;
      router.replace("/");
      router.refresh();
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="space-y-2 rounded-xl border border-line p-5">
        <p className="font-medium">Check your email</p>
        <p className="text-sm text-muted">
          We sent a link to <strong className="font-medium text-foreground">{email.trim()}</strong>. Open it to confirm your address
          {as === "church" ? ", and then you can register your church." : ", and then you can find your church and apply."}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {as === "church" && (
        <label className="block">
          <span className="label">Church name</span>
          <input value={church} onChange={(e) => setChurch(e.target.value)} className="field" maxLength={MAX_CHURCH_NAME} autoComplete="organization" required />
        </label>
      )}
      <label className="block">
        <span className="label">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="email" required />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required />
      </label>
      <label className="block">
        <span className="label">Confirm password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" autoComplete="new-password" required />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5 text-[0.9375rem]">
        {busy ? "Please wait…" : as === "church" ? "Register your church" : "Create account"}
      </button>
    </form>
  );
}
