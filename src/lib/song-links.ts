/** Web links kept with a song: a recording to listen to, a video, sheet music. Checked before they are saved. */

export type LinkKind = "recording" | "video" | "sheet" | "other";

export type SongLink = { label: string; url: string; kind: LinkKind };

export const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: "recording", label: "Recording" },
  { value: "video", label: "Video" },
  { value: "sheet", label: "Sheet music" },
  { value: "other", label: "Other" },
];

export const MAX_LINKS = 12;

/** What kind of link an address probably is, from where it points. */
export function guessKind(url: string): LinkKind {
  const u = url.toLowerCase();
  if (/(youtube\.com|youtu\.be|vimeo\.com)/.test(u)) return "video";
  if (/(spotify\.com|music\.apple\.com|soundcloud\.com|bandcamp\.com|deezer\.com|music\.youtube\.com)/.test(u)) return "recording";
  if (/\.pdf($|[?#])/.test(u)) return "sheet";
  return "other";
}

const isKind = (v: unknown): v is LinkKind => v === "recording" || v === "video" || v === "sheet" || v === "other";

/** A web address from whatever was typed: "example.com/song" gets https://, anything not http(s) is refused. */
export function cleanUrl(input: string): string | null {
  let text = input.trim();
  if (!text || text.length > 500) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The links as they will be saved. Blank rows are dropped; a row with a bad address stops it with a message
 * that names the address. Labels default to the kind of link.
 */
export function normalizeLinks(input: unknown): { links: SongLink[]; error?: string } {
  if (input === undefined || input === null || input === "") return { links: [] };
  if (!Array.isArray(input)) return { links: [], error: "The links weren't in the right form." };
  const links: SongLink[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const typed = typeof row.url === "string" ? row.url.trim() : "";
    if (!typed) continue;
    const url = cleanUrl(typed);
    if (!url) return { links, error: `“${typed.slice(0, 60)}” isn't a web address. Start it with https://` };
    const kind = isKind(row.kind) ? row.kind : guessKind(url);
    const label = (typeof row.label === "string" ? row.label.trim() : "").slice(0, 60) || LINK_KINDS.find((k) => k.value === kind)!.label;
    links.push({ label, url, kind });
  }
  if (links.length > MAX_LINKS) return { links: links.slice(0, MAX_LINKS), error: `Keep it to ${MAX_LINKS} links per song.` };
  return { links };
}

/** What the database column holds, back as links (anything odd in it is skipped). */
export function readLinks(value: unknown): SongLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const row = raw as Partial<SongLink> | null;
    if (!row || typeof row.url !== "string" || !cleanUrl(row.url)) return [];
    const kind = isKind(row.kind) ? row.kind : guessKind(row.url);
    return [{ url: row.url, kind, label: typeof row.label === "string" && row.label ? row.label : "Link" }];
  });
}
