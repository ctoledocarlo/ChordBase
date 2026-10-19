import { createHash } from "node:crypto";

/**
 * The cheap half of login protection: everything here is a few string operations or a map lookup, so a
 * guess can be turned away without ever reaching the password check, which is the expensive part.
 * (The shared counters live in the database; see login-guard-store.ts and the login_guard migration.)
 */

/** Failures allowed per 15 minutes before a key is locked for 15 minutes (the window is in the database functions). */
export const LIMITS = {
  /** Anyone at one address, whatever emails they try. */
  ip: 30,
  /** One email from one address: stops guessing a single account. */
  pair: 5,
  /** One email from anywhere: slows a spread-out attack on a single account. */
  email: 20,
} as const;

/** No real email or password is longer; longer ones are turned away before anything is looked up or hashed. */
export const MAX_EMAIL = 254;
export const MAX_PASSWORD = 256;

export const tooLong = (email: string, password: string) => email.length > MAX_EMAIL || password.length > MAX_PASSWORD;

export type GuardKey = { key: string; limit: number };

const digest = (kind: string, value: string) => createHash("sha256").update(`${kind}:${value}`).digest("hex");

/**
 * The three things an attempt counts against, as hashes (so the database holds no readable emails or addresses).
 * `pair` is the one a good login clears.
 */
export function guardKeys(email: string, ip: string): { ip: GuardKey; pair: GuardKey; email: GuardKey; all: GuardKey[] } {
  const e = email.trim().toLowerCase();
  const keys = {
    ip: { key: digest("ip", ip), limit: LIMITS.ip },
    pair: { key: digest("pair", `${e}|${ip}`), limit: LIMITS.pair },
    email: { key: digest("email", e), limit: LIMITS.email },
  };
  return { ...keys, all: [keys.ip, keys.pair, keys.email] };
}

/** The first four groups of an IPv6 address (its /64), written out in full. Everyone in one /64 is one network. */
function ipv6Prefix(ip: string): string {
  const [head, tail = ""] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? Math.max(0, 8 - front.length - back.length) : 0;
  const groups = [...front, ...Array(missing).fill("0"), ...back];
  return groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().padStart(4, "0"))
    .join(":");
}

/** Who is asking, as far as the platform's headers say (Vercel sets them itself, so they can't be forged from outside). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = (headers.get("x-real-ip")?.trim() || forwarded || "").slice(0, 64);
  if (!ip) return "unknown";
  return ip.includes(":") && !ip.includes(".") ? ipv6Prefix(ip) : ip;
}

/** "Try again in 3 minutes." for a lock with this many seconds left. */
export function waitMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_SECONDS = 15 * 60;

/** The same counting the database functions do, kept in this instance's memory for when there is no database to ask. */
export class FailureCounter {
  private rows = new Map<string, { fails: number; start: number }>();

  constructor(private readonly max = 5000) {}

  /** Counts one failure against each key; returns the keys that just reached their limit. */
  record(keys: GuardKey[], now: number): { key: string; seconds: number }[] {
    if (this.rows.size > this.max) {
      for (const [key, row] of this.rows) if (now - row.start >= WINDOW_MS) this.rows.delete(key);
      if (this.rows.size > this.max) this.rows.clear();
    }
    const locked: { key: string; seconds: number }[] = [];
    for (const { key, limit } of keys) {
      const row = this.rows.get(key);
      const fresh = !row || now - row.start >= WINDOW_MS;
      const next = { fails: fresh ? 1 : row.fails + 1, start: fresh ? now : row.start };
      this.rows.set(key, next);
      if (next.fails >= limit) locked.push({ key, seconds: LOCK_SECONDS });
    }
    return locked;
  }

  clear(key: string) {
    this.rows.delete(key);
  }
}

/**
 * What this server instance already knows is locked, so a repeat attempt is turned away without even a
 * database call. It only ever adds locks the database itself reported; the database stays the source of truth.
 */
export class LockMemory {
  private until = new Map<string, number>();

  constructor(private readonly max = 5000) {}

  /** Seconds left on the longest lock among these keys, or 0. */
  secondsLeft(keys: string[], now: number): number {
    let longest = 0;
    for (const key of keys) {
      const until = this.until.get(key);
      if (until === undefined) continue;
      if (until <= now) this.until.delete(key);
      else longest = Math.max(longest, until - now);
    }
    return Math.ceil(longest / 1000);
  }

  remember(locked: { key: string; seconds: number }[], now: number) {
    if (this.until.size > this.max) {
      for (const [key, until] of this.until) if (until <= now) this.until.delete(key);
      if (this.until.size > this.max) this.until.clear();
    }
    for (const { key, seconds } of locked) this.until.set(key, now + seconds * 1000);
  }
}
