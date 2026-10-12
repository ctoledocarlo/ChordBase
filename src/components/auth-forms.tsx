"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  requestPasswordReset,
  signIn,
  updatePassword,
  type FormState,
} from "@/app/(auth)/actions";

const initial: FormState = {};

function Field({
  label,
  name,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700"
      />
    </label>
  );
}

function Form({
  action,
  state,
  pending,
  submitLabel,
  children,
}: {
  action: (formData: FormData) => void;
  state: FormState;
  pending: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <form action={action} className="space-y-4">
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity disabled:opacity-60"
      >
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <Form action={action} state={state} pending={pending} submitLabel="Log in">
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
      />
      <p className="text-sm">
        <Link href="/forgot-password" className="underline">
          Forgot your password?
        </Link>
      </p>
    </Form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initial,
  );
  return (
    <Form
      action={action}
      state={state}
      pending={pending}
      submitLabel="Send reset link"
    >
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <p className="text-sm">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </Form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <Form
      action={action}
      state={state}
      pending={pending}
      submitLabel="Save new password"
    >
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
      />
    </Form>
  );
}
