const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** A date ("2026-10-17") written every way someone might search for it, lower case. */
export function dateSearchText(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[m - 1];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return [
    iso,
    `${y}-${mm}`,
    month,
    month.slice(0, 3),
    weekday,
    weekday.slice(0, 3),
    String(y),
    `${month} ${d}`,
    `${month.slice(0, 3)} ${d}`,
    `${m}/${d}/${y}`,
    `${mm}/${dd}/${y}`,
    `${m}/${d}`,
    `${mm}/${dd}`,
    `${d}`,
    dd,
  ].join(" ");
}

/**
 * Whether a setlist matches what was typed in the search box. Every word has to match
 * either the name or the date, so "oct 17", "2026-10-17", "10/17" and "sunday october"
 * all find setlists by when they are, not just by what they are called.
 */
export function setlistMatches(query: string, name: string, date: string | null): boolean {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${name.toLowerCase()} ${dateSearchText(date)}`;
  const tokens = haystack.split(/\s+/);
  // A bare number like "17" should mean the day, not be found inside "2017" or "10/17/2026".
  return words.every((w) => (/^\d{1,2}$/.test(w) ? tokens.includes(w) : haystack.includes(w)));
}
