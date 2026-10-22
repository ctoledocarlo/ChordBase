import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { GuardKey } from "./login-guard";

/**
 * The phone remote has no login. Whoever has the PIN shown on the Media screen can join, so the PIN is the whole
 * lock: it is six digits, tried only a few times before a wait, and a joined phone is given a signed ticket
 * (a cookie) that stops working when the PIN is changed or the remote is switched off.
 */

export const PIN_LENGTH = 6;
/** The longest a joined phone's ticket can last. The remote itself switches off sooner (see remote-window.ts), which ends it for every phone. */
export const REMOTE_TTL_SECONDS = 12 * 60 * 60;

export const isPin = (value: unknown): value is string => typeof value === "string" && /^\d{6}$/.test(value);

/** A fresh PIN from the system's random source, with leading zeros kept. */
export const newPin = (): string => String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");

/** "123456" as "123 456", for reading it out. */
export const pinWords = (pin: string): string => `${pin.slice(0, 3)} ${pin.slice(3)}`;

/** What people type is usually "123 456" or "123-456". Keeps the digits. */
export const cleanPin = (typed: string): string => typed.replace(/\D/g, "").slice(0, PIN_LENGTH);

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compares two PINs without the time taken giving anything away. */
export function pinsMatch(typed: string, actual: string): boolean {
  return timingSafeEqual(digest(`pin:${typed}`), digest(`pin:${actual}`));
}

const mac = (secret: string, setlistId: string, pin: string, expiresAt: number) =>
  createHmac("sha256", secret).update(`remote|${setlistId}|${pin}|${expiresAt}`).digest("hex");

/** The ticket given to a phone that entered the right PIN. It is only good for this setlist, this PIN, until `expiresAt`. */
export function signRemote(secret: string, setlistId: string, pin: string, expiresAt: number): string {
  return `${expiresAt}.${mac(secret, setlistId, pin, expiresAt)}`;
}

/** Whether a ticket is genuine, unexpired, and for the setlist's PIN as it is right now. */
export function verifyRemote(secret: string, ticket: string | undefined, setlistId: string, pin: string, now: number): boolean {
  if (!ticket) return false;
  const dot = ticket.indexOf(".");
  if (dot < 1) return false;
  const expiresAt = Number(ticket.slice(0, dot));
  if (!Number.isInteger(expiresAt) || expiresAt <= now) return false;
  const given = Buffer.from(ticket.slice(dot + 1), "hex");
  const wanted = Buffer.from(mac(secret, setlistId, pin, expiresAt), "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Wrong guesses allowed (per 15 minutes) before a wait: at one address, at one address for one setlist, and from anywhere for one setlist. */
export const PIN_LIMITS = { ip: 40, pair: 6, setlist: 30 } as const;

const keyOf = (kind: string, value: string): string => createHash("sha256").update(`remote-${kind}:${value}`).digest("hex");

/** What a guess counts against. `pair` is the one a right PIN clears. */
export function pinGuardKeys(setlistId: string, ip: string): { pair: GuardKey; all: GuardKey[] } {
  const ipKey = { key: keyOf("ip", ip), limit: PIN_LIMITS.ip };
  const pair = { key: keyOf("pair", `${setlistId}|${ip}`), limit: PIN_LIMITS.pair };
  const setlist = { key: keyOf("setlist", setlistId), limit: PIN_LIMITS.setlist };
  return { pair, all: [ipKey, pair, setlist] };
}

/** The name of the cookie holding the ticket for a setlist. */
export const remoteCookie = (setlistId: string) => `remote-${setlistId}`;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
