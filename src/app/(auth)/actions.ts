"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, guardKeys, tooLong, waitMessage } from "@/lib/login-guard";
import { gate, recordFailure, recordSuccess } from "@/lib/login-guard-store";
import { createClient } from "@/lib/supabase/server";

/** `email` is sent back so the box still holds it after a failed attempt (the password never is). */
export type FormState = { error?: string; message?: string; email?: string };

const WRONG = "Incorrect email or password.";

const MIN_PASSWORD_LENGTH = 8;

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = text(formData, "email").trim();
  const password = text(formData, "password");
  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }
  // Checks run from cheapest to dearest, and the dear one (the password check) only happens if all pass.
  // 1. Free: nothing that long is a real email or password, and hashing a huge one is a cheap way to cost us work.
  if (tooLong(email, password)) return { error: WRONG, email: email.slice(0, 254) };

  // 2. Free: hash the address and email into keys, and ask this server's memory if any is already locked.
  // 3. One small indexed database call, if memory didn't already say no (see login-guard-store.ts).
  const keys = guardKeys(email, clientIp(await headers()));
  const guard = await gate(keys.all, keys.pair);
  if (guard.blockedFor > 0) return { error: waitMessage(guard.blockedFor), email };

  // 4. Only now the expensive part: Supabase checks the password against its stored hash.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const lockedFor = await recordFailure(keys.all);
    return { error: lockedFor > 0 ? waitMessage(lockedFor) : WRONG, email };
  }
  // A good login wipes this email's failures from this address (only if there were any to wipe).
  if (guard.hadFailures) await recordSuccess(keys.pair);

  // Someone who isn't in a church yet still gets in: the first screen lets them join one or register their own.
  redirect("/");
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = text(formData, "email").trim();
  if (!email) {
    return { error: "Enter your email.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  // Surface rate limiting, but never reveal whether the email has an account.
  if (error?.status === 429) {
    return { error: "Too many requests. Please wait a bit and try again.", email };
  }

  return {
    message: "If that email has a church login, a reset link is on its way.",
    email,
  };
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = text(formData, "password");
  const confirm = text(formData, "confirm");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
