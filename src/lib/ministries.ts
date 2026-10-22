/**
 * The ministries a person can serve in. Stage has an instrument (a person can pick several); Media has no
 * specific roles. They are stored as short tokens ("stage:drums", "media") and the database refuses any other.
 */

export type MinistryGroup = { id: "stage" | "media"; label: string; options: { token: string; label: string }[] };

export const MINISTRY_GROUPS: MinistryGroup[] = [
  {
    id: "stage",
    label: "Stage",
    options: [
      { token: "stage:drums", label: "Drums" },
      { token: "stage:keys", label: "Keys" },
      { token: "stage:acoustic-guitar", label: "Acoustic guitar" },
      { token: "stage:electric-guitar", label: "Electric guitar" },
      { token: "stage:bass", label: "Bass" },
      { token: "stage:vocals", label: "Vocals" },
      { token: "stage:other", label: "Other instrument" },
    ],
  },
  { id: "media", label: "Media", options: [{ token: "media", label: "Media (no specific roles)" }] },
];

export const ALL_MINISTRIES: string[] = MINISTRY_GROUPS.flatMap((g) => g.options.map((o) => o.token));

export const isMinistry = (token: unknown): token is string => typeof token === "string" && ALL_MINISTRIES.includes(token);

/** Only the known ministries, each once, in the order the picker lists them. */
export function cleanMinistries(tokens: unknown): string[] {
  if (!Array.isArray(tokens)) return [];
  const given = new Set(tokens.filter(isMinistry));
  return ALL_MINISTRIES.filter((t) => given.has(t));
}

/** Adds the ministry if it isn't chosen, takes it away if it is. */
export function toggleMinistry(chosen: string[], token: string): string[] {
  return cleanMinistries(chosen.includes(token) ? chosen.filter((t) => t !== token) : [...chosen, token]);
}

const labelOf = (token: string) => MINISTRY_GROUPS.flatMap((g) => g.options).find((o) => o.token === token)?.label ?? token;

/** "Stage: Drums, Keys · Media" */
export function describeMinistries(tokens: string[]): string {
  const chosen = cleanMinistries(tokens);
  const stage = chosen.filter((t) => t.startsWith("stage:")).map(labelOf);
  const parts: string[] = [];
  if (stage.length > 0) parts.push(`Stage: ${stage.join(", ")}`);
  if (chosen.includes("media")) parts.push("Media");
  return parts.join(" · ");
}

/** A person's name as it is shown: "Maria Reyes", or nothing when they haven't given one. */
export const fullName = (first: string | null | undefined, last: string | null | undefined): string => [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");

export const MAX_NAME = 60;
