import { describe, expect, it } from "vitest";
import { FailureCounter, LIMITS, LockMemory, clientIp, guardKeys, tooLong, waitMessage } from "./login-guard";

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });

describe("login guard keys", () => {
  it("makes the same keys for the same email and address, ignoring case and spaces", () => {
    const a = guardKeys("Pastor@Church.org ", "1.2.3.4");
    const b = guardKeys("pastor@church.org", "1.2.3.4");
    expect(a.all.map((k) => k.key)).toEqual(b.all.map((k) => k.key));
  });

  it("keeps the three kinds apart, and never stores a readable email or address", () => {
    const k = guardKeys("a@b.org", "1.2.3.4");
    expect(new Set(k.all.map((x) => x.key)).size).toBe(3);
    for (const { key } of k.all) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).not.toContain("1.2.3.4");
    }
    expect(k.all.map((x) => x.limit)).toEqual([LIMITS.ip, LIMITS.pair, LIMITS.email]);
  });

  it("treats another address or another email as a different pair but the same account or address", () => {
    const base = guardKeys("a@b.org", "1.1.1.1");
    const otherIp = guardKeys("a@b.org", "2.2.2.2");
    const otherEmail = guardKeys("c@d.org", "1.1.1.1");
    expect(otherIp.email.key).toBe(base.email.key);
    expect(otherIp.pair.key).not.toBe(base.pair.key);
    expect(otherEmail.ip.key).toBe(base.ip.key);
    expect(otherEmail.pair.key).not.toBe(base.pair.key);
  });
});

describe("who is asking", () => {
  it("prefers the platform's real-address header, then the first forwarded address", () => {
    expect(clientIp(headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("9.9.9.9");
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(headers({}))).toBe("unknown");
  });

  it("counts everyone in one IPv6 /64 as one network", () => {
    const a = clientIp(headers({ "x-real-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" }));
    const b = clientIp(headers({ "x-real-ip": "2001:DB8:1:2::1" }));
    expect(a).toBe("2001:0db8:0001:0002");
    expect(b).toBe(a);
    expect(clientIp(headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:0db8:0000:0000");
  });
});

describe("cheap rejections", () => {
  it("turns away absurdly long input before anything is hashed", () => {
    expect(tooLong("a@b.org", "x".repeat(257))).toBe(true);
    expect(tooLong("a".repeat(255), "x")).toBe(true);
    expect(tooLong("a@b.org", "a normal password")).toBe(false);
  });

  it("says how long to wait, in whole minutes", () => {
    expect(waitMessage(1)).toBe("Too many attempts. Try again in 1 minute.");
    expect(waitMessage(61)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(waitMessage(900)).toBe("Too many attempts. Try again in 15 minutes.");
  });
});

describe("remembering locks", () => {
  it("knows a lock until it runs out, then forgets it", () => {
    const m = new LockMemory();
    m.remember([{ key: "a", seconds: 60 }], 1000);
    expect(m.secondsLeft(["a", "b"], 1000)).toBe(60);
    expect(m.secondsLeft(["a"], 31_000)).toBe(30);
    expect(m.secondsLeft(["a"], 61_000)).toBe(0);
    expect(m.secondsLeft(["b"], 1000)).toBe(0);
  });

  it("answers with the longest lock among the keys", () => {
    const m = new LockMemory();
    m.remember([{ key: "a", seconds: 10 }, { key: "b", seconds: 90 }], 0);
    expect(m.secondsLeft(["a", "b"], 0)).toBe(90);
  });

  it("stays small", () => {
    const m = new LockMemory(3);
    m.remember([1, 2, 3, 4, 5].map((n) => ({ key: `k${n}`, seconds: 600 })), 0);
    m.remember([{ key: "new", seconds: 600 }], 0);
    expect(m.secondsLeft(["new"], 0)).toBe(600);
  });
});

describe("counting failures in memory", () => {
  const keys = guardKeys("a@b.org", "1.1.1.1");

  it("locks the pair at its limit, and not before", () => {
    const c = new FailureCounter();
    let locked: { key: string }[] = [];
    for (let i = 1; i <= LIMITS.pair - 1; i++) locked = c.record(keys.all, i);
    expect(locked).toEqual([]);
    locked = c.record(keys.all, 100);
    expect(locked.map((l) => l.key)).toEqual([keys.pair.key]);
  });

  it("starts counting again after the window", () => {
    const c = new FailureCounter();
    for (let i = 0; i < LIMITS.pair - 1; i++) c.record(keys.all, 0);
    expect(c.record(keys.all, 16 * 60 * 1000)).toEqual([]);
  });

  it("forgets a pair after a good login", () => {
    const c = new FailureCounter();
    for (let i = 0; i < LIMITS.pair - 1; i++) c.record(keys.all, 0);
    c.clear(keys.pair.key);
    expect(c.record(keys.all, 1)).toEqual([]);
  });

  it("locks an address that tries many different emails", () => {
    const c = new FailureCounter();
    let locked: { key: string }[] = [];
    for (let i = 0; i < LIMITS.ip; i++) locked = c.record(guardKeys(`user${i}@b.org`, "1.1.1.1").all, i);
    expect(locked.map((l) => l.key)).toContain(guardKeys("x@y.org", "1.1.1.1").ip.key);
  });
});
