import { describe, expect, it } from "vitest";
import { TIMER_PRESETS, URGENT_SECONDS, clockText, endsAtClock, endsInMinutes, timerText, timerView } from "./service-timer";

const now = new Date(2026, 9, 18, 10, 0, 0).getTime();

describe("the countdown", () => {
  it("has nothing to show without an end time", () => {
    expect(timerView(null, now)).toEqual({ kind: "none" });
    expect(timerView("not a date", now)).toEqual({ kind: "none" });
    expect(timerText({ kind: "none" })).toBe("");
  });

  it("counts down to the end, turning urgent in the last five minutes", () => {
    const far = timerView(endsInMinutes(30, now), now);
    expect(far).toEqual({ kind: "running", seconds: 1800, urgent: false });
    expect(timerText(far)).toBe("30 min left");
    const near = timerView(endsInMinutes(4, now), now);
    expect(near).toMatchObject({ kind: "running", urgent: true });
    expect(URGENT_SECONDS).toBe(300);
    expect(timerView(endsInMinutes(5, now), now)).toMatchObject({ urgent: true });
  });

  it("shows seconds in the last minute, and rounds a partial minute up while counting down", () => {
    expect(timerText(timerView(new Date(now + 45_000).toISOString(), now))).toBe("45 s left");
    expect(timerText(timerView(new Date(now + 61_000).toISOString(), now))).toBe("2 min left");
  });

  it("says how far over when the time has passed", () => {
    const over = timerView(new Date(now - 150_000).toISOString(), now);
    expect(over).toEqual({ kind: "over", seconds: 150 });
    expect(timerText(over)).toBe("2 min over");
    expect(timerText(timerView(new Date(now - 20_000).toISOString(), now))).toBe("20 s over");
  });
});

describe("setting the end", () => {
  it("offers sensible lengths", () => {
    expect(TIMER_PRESETS).toEqual([15, 30, 45, 60, 75, 90]);
  });

  it("ends at a time of day, later today or tomorrow", () => {
    expect(new Date(endsAtClock("10:30", now)!).getHours()).toBe(10);
    expect(new Date(endsAtClock("10:30", now)!).getDate()).toBe(18);
    // An hour or more gone by means tomorrow.
    expect(new Date(endsAtClock("08:00", now)!).getDate()).toBe(19);
    // A few minutes ago is still today (the set is just running late).
    expect(new Date(endsAtClock("09:50", now)!).getDate()).toBe(18);
    expect(endsAtClock("25:00", now)).toBeNull();
    expect(endsAtClock("soon", now)).toBeNull();
    expect(endsAtClock("9:05", now)).not.toBeNull();
  });

  it("reads the clock as 24-hour time", () => {
    expect(clockText(new Date(2026, 9, 18, 9, 5).getTime())).toBe("09:05");
    expect(clockText(new Date(2026, 9, 18, 23, 59).getTime())).toBe("23:59");
  });
});
