import { describe, expect, it } from "vitest";
import { ALL_MINISTRIES, MINISTRY_GROUPS, cleanMinistries, describeMinistries, fullName, isMinistry, toggleMinistry } from "./ministries";

describe("ministries", () => {
  it("has Stage with instruments and Media with no specific roles", () => {
    const stage = MINISTRY_GROUPS.find((g) => g.id === "stage")!;
    expect(stage.options.map((o) => o.label)).toEqual(expect.arrayContaining(["Drums", "Keys", "Vocals"]));
    expect(MINISTRY_GROUPS.find((g) => g.id === "media")!.options).toHaveLength(1);
  });

  it("only accepts the listed tokens", () => {
    expect(ALL_MINISTRIES).toContain("stage:drums");
    expect(isMinistry("stage:drums")).toBe(true);
    expect(isMinistry("media")).toBe(true);
    expect(isMinistry("stage:kazoo")).toBe(false);
    expect(isMinistry(5)).toBe(false);
  });

  it("keeps each choice once, in the order listed, and drops the unknown", () => {
    expect(cleanMinistries(["media", "stage:keys", "stage:keys", "stage:drums", "nope"])).toEqual(["stage:drums", "stage:keys", "media"]);
    expect(cleanMinistries("media")).toEqual([]);
    expect(cleanMinistries(undefined)).toEqual([]);
  });

  it("toggles a choice on and off", () => {
    expect(toggleMinistry([], "stage:keys")).toEqual(["stage:keys"]);
    expect(toggleMinistry(["stage:keys", "media"], "stage:keys")).toEqual(["media"]);
    expect(toggleMinistry(["media"], "stage:drums")).toEqual(["stage:drums", "media"]);
  });

  it("describes them for people", () => {
    expect(describeMinistries(["media", "stage:keys", "stage:drums"])).toBe("Stage: Drums, Keys · Media");
    expect(describeMinistries(["media"])).toBe("Media");
    expect(describeMinistries(["stage:vocals"])).toBe("Stage: Vocals");
    expect(describeMinistries([])).toBe("");
  });

  it("writes a name", () => {
    expect(fullName("Maria", " Reyes ")).toBe("Maria Reyes");
    expect(fullName("", "Reyes")).toBe("Reyes");
    expect(fullName(null, undefined)).toBe("");
  });
});
