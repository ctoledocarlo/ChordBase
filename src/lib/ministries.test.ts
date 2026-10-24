import { describe, expect, it } from "vitest";
import { ALL_MINISTRIES, MINISTRY_GROUPS, cleanMinistries, describeMinistries, fullName, isMinistry, toggleMinistry } from "./ministries";

describe("ministries", () => {
  it("has Stage with instruments and Media with Audio, Sound booth and Camera", () => {
    const stage = MINISTRY_GROUPS.find((g) => g.id === "stage")!;
    expect(stage.options.map((o) => o.label)).toEqual(expect.arrayContaining(["Drums", "Keys", "Vocals"]));
    expect(MINISTRY_GROUPS.find((g) => g.id === "media")!.options.map((o) => o.label)).toEqual(["Audio", "Sound booth", "Camera"]);
  });

  it("only accepts the listed tokens", () => {
    expect(ALL_MINISTRIES).toContain("stage:drums");
    expect(isMinistry("stage:drums")).toBe(true);
    expect(isMinistry("media:camera")).toBe(true);
    expect(isMinistry("media")).toBe(true);
    expect(isMinistry("stage:kazoo")).toBe(false);
    expect(isMinistry(5)).toBe(false);
  });

  it("keeps each choice once, in the order listed, and drops the unknown", () => {
    expect(cleanMinistries(["media:camera", "stage:keys", "stage:keys", "stage:drums", "nope"])).toEqual(["stage:drums", "stage:keys", "media:camera"]);
    // The old "Media" means all three media roles.
    expect(cleanMinistries(["media"])).toEqual(["media:audio", "media:sound-booth", "media:camera"]);
    expect(cleanMinistries("media")).toEqual([]);
    expect(cleanMinistries(undefined)).toEqual([]);
  });

  it("toggles a choice on and off", () => {
    expect(toggleMinistry([], "stage:keys")).toEqual(["stage:keys"]);
    expect(toggleMinistry(["stage:keys", "media:audio"], "stage:keys")).toEqual(["media:audio"]);
    expect(toggleMinistry(["media:audio"], "stage:drums")).toEqual(["stage:drums", "media:audio"]);
  });

  it("describes them for people", () => {
    expect(describeMinistries(["media:camera", "stage:keys", "stage:drums"])).toBe("Stage: Drums, Keys · Media: Camera");
    expect(describeMinistries(["media:audio", "media:camera"])).toBe("Media: Audio, Camera");
    expect(describeMinistries(["stage:vocals"])).toBe("Stage: Vocals");
    expect(describeMinistries([])).toBe("");
  });

  it("writes a name", () => {
    expect(fullName("Maria", " Reyes ")).toBe("Maria Reyes");
    expect(fullName("", "Reyes")).toBe("Reyes");
    expect(fullName(null, undefined)).toBe("");
  });
});
