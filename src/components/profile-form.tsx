"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateMyProfile } from "@/app/(app)/members/actions";
import { MAX_NAME } from "@/lib/ministries";
import type { Profile } from "@/lib/members";
import { ROLE_LABELS } from "@/lib/roles";
import { MinistryPicker } from "./ministry-picker";
import { useToast } from "./toast";

/** A person's own name and ministries, changeable any time. Their role is shown but is set by the church. */
export function ProfileForm({ profile, churchName }: { profile: Profile; churchName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [first, setFirst] = useState(profile.first_name);
  const [last, setLast] = useState(profile.last_name);
  const [ministries, setMinistries] = useState(profile.ministries);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateMyProfile(first, last, ministries);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    toast("Saved.", { tone: "success" });
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-sm text-muted">
        In {churchName} as <strong className="font-medium text-foreground">{ROLE_LABELS[profile.role]}</strong>. Your church sets your role. Change your name or ministries whenever things change.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">First name</span>
            <input value={first} onChange={(e) => setFirst(e.target.value)} className="field" maxLength={MAX_NAME} autoComplete="given-name" required />
          </label>
          <label className="block">
            <span className="label">Last name</span>
            <input value={last} onChange={(e) => setLast(e.target.value)} className="field" maxLength={MAX_NAME} autoComplete="family-name" required />
          </label>
        </div>
        <MinistryPicker value={ministries} onChange={setMinistries} disabled={busy} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary min-h-11" disabled={busy || !first.trim() || !last.trim() || ministries.length === 0}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
