/**
 * Searching songs by their words. The database keeps a flattened copy of each song's lyrics
 * (see the song_lyrics_search migration); these helpers turn what someone typed into the same
 * flat form, and find the line to show under a match.
 */

/** Lower case, punctuation removed, spacing flattened: the same form the database keeps. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_TOKENS = 6;

/** The words to look for in the lyrics. Every one has to appear (anywhere, in any order). */
export function searchTokens(query: string): string[] {
  const words = normalizeText(query)
    .split(" ")
    // One-letter words ("a", "i") are in nearly every song and only add noise.
    .filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, MAX_TOKENS);
}

/** The words of a song with the chords and directives taken out, one line each. */
export function lyricLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*\{.*\}\s*$/.test(line))
    .map((line) => line.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");
}

const SNIPPET_MAX = 90;

/** The line of the song that best shows why it matched (null if the words aren't found together). */
export function lyricSnippet(body: string, tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const lines = lyricLines(body);
  const trim = (s: string) => (s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : s);

  // A line that holds every word on its own.
  const whole = lines.find((l) => tokens.every((t) => normalizeText(l).includes(t)));
  if (whole) return trim(whole);
  // Or a line and the next one together, since a phrase can run over.
  for (let i = 0; i < lines.length - 1; i++) {
    const window = normalizeText(`${lines[i]} ${lines[i + 1]}`);
    if (tokens.every((t) => window.includes(t))) return trim(lines[i]);
  }
  // Otherwise the first line with any of them.
  const any = lines.find((l) => tokens.some((t) => normalizeText(l).includes(t)));
  return any ? trim(any) : null;
}
