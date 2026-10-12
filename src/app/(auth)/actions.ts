"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

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
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Incorrect email or password." };
  }

  // A valid login that isn't linked to a church can't use the app.
  const { data: link } = await supabase
    .from("church_accounts")
    .select("church_id")
    .maybeSingle();
  if (!link) {
    await supabase.auth.signOut();
    return { error: "This login isn't linked to a church yet." };
  }

  redirect("/");
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = text(formData, "email").trim();
  if (!email) {
    return { error: "Enter your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  // Surface rate limiting, but never reveal whether the email has an account.
  if (error?.status === 429) {
    return { error: "Too many requests. Please wait a bit and try again." };
  }

  return {
    message: "If that email has a church login, a reset link is on its way.",
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
