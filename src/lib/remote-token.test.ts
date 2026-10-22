import { describe, expect, it } from "vitest";
import { cleanPin, isPin, isUuid, newPin, pinGuardKeys, pinsMatch, pinWords, signRemote, verifyRemote } from "./remote-token";

const SECRET = "service-key-for-tests";
const SETLIST = "6f1d6d5a-1c52-4a0e-8a6e-0d3a6d2d0c11";

describe("PINs", () => {
  it("makes six digits, keeping leading zeros, and not always the same one", () => {
    const pins = Array.from({ length: 200 }, newPin);
    expect(pins.every(isPin)).toBe(true);
    expect(new Set(pins).size).toBeGreaterThan(150);
  });

  it("reads what people type", () => {
    expect(cleanPin("123 456")).toBe("123456");
    expect(cleanPin("12-34-56")).toBe("123456");
    expect(cleanPin("1234567890")).toBe("123456");
    expect(cleanPin("abc")).toBe("");
    expect(isPin("12345")).toBe(false);
    expect(isPin("1234567")).toBe(false);
    expect(isPin("12345a")).toBe(false);
    expect(isPin(123456)).toBe(false);
    expect(pinWords("004217")).toBe("004 217");
  });

  it("compares PINs", () => {
    expect(pinsMatch("123456", "123456")).toBe(true);
    expect(pinsMatch("123456", "123457")).toBe(false);
    expect(pinsMatch("", "123456")).toBe(false);
  });
});

describe("the ticket a joined phone carries", () => {
  const now = 1_000_000;
  const ticket = signRemote(SECRET, SETLIST, "123456", now + 5000);

  it("is good for the setlist and PIN it was made for, until it runs out", () => {
    expect(verifyRemote(SECRET, ticket, SETLIST, "123456", now)).toBe(true);
    expect(verifyRemote(SECRET, ticket, SETLIST, "123456", now + 4999)).toBe(true);
    expect(verifyRemote(SECRET, ticket, SETLIST, "123456", now + 5000)).toBe(false);
  });

  it("stops working when the PIN is changed, or for another setlist", () => {
    expect(verifyRemote(SECRET, ticket, SETLIST, "654321", now)).toBe(false);
    expect(verifyRemote(SECRET, ticket, "6f1d6d5a-1c52-4a0e-8a6e-0d3a6d2d0c12", "123456", now)).toBe(false);
  });

  it("can't be made without the secret or stretched out", () => {
    expect(verifyRemote("another secret", ticket, SETLIST, "123456", now)).toBe(false);
    const [, signature] = ticket.split(".");
    expect(verifyRemote(SECRET, `${now + 999_999}.${signature}`, SETLIST, "123456", now)).toBe(false);
  });

  it("turns away rubbish without throwing", () => {
    for (const bad of [undefined, "", "abc", ".", "5.", ".abc", "x.y", `${now + 10}.zz`, `${now + 10}.`]) {
      expect(verifyRemote(SECRET, bad, SETLIST, "123456", now)).toBe(false);
    }
  });
});

describe("guessing limits", () => {
  it("counts a guess against the address, the address for this setlist, and the setlist", () => {
    const keys = pinGuardKeys(SETLIST, "203.0.113.5");
    expect(keys.all).toHaveLength(3);
    expect(keys.all).toContain(keys.pair);
    expect(new Set(keys.all.map((k) => k.key)).size).toBe(3);
    // Few guesses per address and setlist, more across the setlist.
    expect(keys.pair.limit).toBeLessThan(keys.all[2].limit);
  });

  it("keeps one address's guesses apart from another's", () => {
    const a = pinGuardKeys(SETLIST, "203.0.113.5");
    const b = pinGuardKeys(SETLIST, "203.0.113.6");
    expect(a.pair.key).not.toBe(b.pair.key);
    expect(a.all[2].key).toBe(b.all[2].key);
  });
});

describe("ids", () => {
  it("accepts only real ids", () => {
    expect(isUuid(SETLIST)).toBe(true);
    expect(isUuid("not-an-id")).toBe(false);
    expect(isUuid(`${SETLIST}; drop table`)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
