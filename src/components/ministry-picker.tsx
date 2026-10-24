"use client";

import { MINISTRY_GROUPS, toggleMinistry } from "@/lib/ministries";

/**
 * Choosing the ministries a person serves in: Stage (with the instrument, as many as they play or sing) and Media
 * (Audio, Sound booth or Camera). Several can be chosen, and they can be changed any time.
 */
export function MinistryPicker({ value, onChange, disabled = false }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="label">Ministry (choose all that apply)</legend>
      {MINISTRY_GROUPS.map((group) => (
        <div key={group.id} className="rounded-lg border border-line p-3">
          <p className="mb-2 text-sm font-medium">{group.label}</p>
          <div className={group.options.length > 1 ? "grid grid-cols-2 gap-x-3 gap-y-1.5" : ""}>
            {group.options.map((o) => (
              <label key={o.token} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 flex-none" checked={value.includes(o.token)} onChange={() => onChange(toggleMinistry(value, o.token))} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
