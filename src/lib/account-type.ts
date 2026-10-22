/**
 * Two kinds of account come in through two doors:
 *   - a CHURCH registers itself, and its account is the church's first main account;
 *   - an INDIVIDUAL signs up and then applies to a church.
 * The kind is remembered on the account when it is made (and in a short-lived cookie across the trip to Google
 * and back), so the first screen after signing in is the right one. What an account can do afterwards depends on
 * its role in a church, not on the door it came in by.
 */

export type AccountType = "individual" | "church";

export const isAccountType = (value: unknown): value is AccountType => value === "individual" || value === "church";

/** The cookie that carries the choice to /auth/callback and back. */
export const INTENT_COOKIE = "cb_intent";
export const INTENT_MAX_AGE_SECONDS = 600;

export const MIN_PASSWORD = 8;
export const MIN_CHURCH_NAME = 2;
export const MAX_CHURCH_NAME = 80;

/** Why a new password can't be used yet, or null when it can. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for the password.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

/** A church name as it will be saved: trimmed, with runs of spaces made one. */
export const tidyChurchName = (name: string): string => name.replace(/\s+/g, " ").trim();

/** Why a church name can't be used, or null when it can. */
export function churchNameProblem(name: string): string | null {
  const n = tidyChurchName(name);
  if (n.length < MIN_CHURCH_NAME) return "Give your church a name.";
  if (n.length > MAX_CHURCH_NAME) return `Keep the church's name under ${MAX_CHURCH_NAME} characters.`;
  return null;
}
