import { describe, expect, it } from "vitest";
import { REMOTE_LIFETIME_MS, canExtend, endOf, extendedEnd, isOn, leftMs, leftWords, remoteEnd } from "./remote-window";

const NOW = Date.parse("2026-10-25T09:00:00Z");
const min = (n: number) => n * 60_000;

describe("when the remote switches off", () => {
  it("is four hours after it started", () => {
    expect(REMOTE_LIFETIME_MS).toBe(min(240));
    expect(remoteEnd(NOW)).toBe("2026-10-25T13:00:00.000Z");
  });

  it("uses the end time that was kept, or works it out from the start of an older remote", () => {
    expect(endOf({ remote_pin: "123456", remote_expires_at: "2026-10-25T10:00:00Z", remote_started_at: "2026-10-25T09:00:00Z" })).toBe("2026-10-25T10:00:00Z");
    expect(endOf({ remote_pin: "123456", remote_started_at: "2026-10-25T09:00:00Z" })).toBe("2026-10-25T13:00:00.000Z");
  });

  it("has none when there is no PIN, or nothing to work it out from", () => {
    expect(endOf({ remote_pin: null, remote_expires_at: "2026-10-25T10:00:00Z" })).toBeNull();
    expect(endOf({ remote_pin: "123456" })).toBeNull();
    expect(endOf({ remote_pin: "123456", remote_started_at: "nonsense" })).toBeNull();
  });
});

describe("whether it is on", () => {
  const row = { remote_pin: "123456", remote_expires_at: "2026-10-25T10:00:00Z" };
  it("is on until the end time, then off on its own", () => {
    expect(isOn(row, NOW)).toBe(true);
    expect(isOn(row, NOW + min(59))).toBe(true);
    expect(isOn(row, NOW + min(60))).toBe(false);
    expect(isOn(row, NOW + min(500))).toBe(false);
  });

  it("is off without a PIN or an end", () => {
    expect(isOn({ remote_pin: null, remote_expires_at: row.remote_expires_at }, NOW)).toBe(false);
    expect(isOn({ remote_pin: "123456" }, NOW)).toBe(false);
  });

  it("counts what is left", () => {
    expect(leftMs("2026-10-25T10:00:00Z", NOW)).toBe(min(60));
    expect(leftMs("2026-10-25T08:00:00Z", NOW)).toBe(0);
    expect(leftMs(null, NOW)).toBe(0);
    expect(leftMs("x", NOW)).toBe(0);
  });
});

describe("adding an hour", () => {
  it("is offered with 30 minutes or less left, and not before or after", () => {
    expect(canExtend(min(31))).toBe(false);
    expect(canExtend(min(30))).toBe(true);
    expect(canExtend(min(1))).toBe(true);
    expect(canExtend(0)).toBe(false);
  });

  it("moves the end on by one hour", () => {
    expect(extendedEnd("2026-10-25T10:00:00.000Z")).toBe("2026-10-25T11:00:00.000Z");
  });
});

describe("saying how long is left", () => {
  it("is short and plain", () => {
    expect(leftWords(min(200))).toBe("3 h 20 min");
    expect(leftWords(min(180))).toBe("3 h");
    expect(leftWords(min(25))).toBe("25 min");
    expect(leftWords(min(24) + 1000)).toBe("25 min");
    expect(leftWords(30_000)).toBe("under a minute");
    expect(leftWords(0)).toBe("0 min");
  });
});
