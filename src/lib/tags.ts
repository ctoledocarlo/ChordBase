/** Tags on songs: collections like "Easter" or "communion". */

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/** Tidied tags: trimmed, a leading # dropped, no repeats (ignoring case), each up to 40 characters, at most 20. */
export function tidyTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/^#+/, "").slice(0, MAX_TAG_LENGTH).trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}

/** Tags typed as "Easter, communion, slow". */
export const parseTagText = (text: string) => tidyTags(text.split(","));
