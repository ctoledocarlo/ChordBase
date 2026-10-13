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
    <label className="block">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="field"
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
    <form action={action} className="space-y-5">
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-muted">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full py-2.5 text-[0.9375rem]"
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
      <p className="text-sm text-muted">
        <Link href="/forgot-password" className="underline hover:text-foreground">
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
