import { describe, expect, it } from "vitest";
import { MAX_TAGS, parseTagText, tidyTags } from "./tags";

describe("tags", () => {
  it("trims, drops a leading #, and removes repeats whatever the case", () => {
    expect(tidyTags([" Easter ", "#communion", "easter", "", "  "])).toEqual(["Easter", "communion"]);
  });

  it("ignores anything that isn't text", () => {
    expect(tidyTags([1, null, "ok"])).toEqual(["ok"]);
    expect(tidyTags("Easter")).toEqual([]);
    expect(tidyTags(undefined)).toEqual([]);
  });

  it("limits how long and how many", () => {
    expect(tidyTags(["x".repeat(60)])[0]).toHaveLength(40);
    expect(tidyTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
  });

  it("reads typed text", () => {
    expect(parseTagText("Easter, communion ,#slow,,")).toEqual(["Easter", "communion", "slow"]);
    expect(parseTagText("")).toEqual([]);
  });
});
