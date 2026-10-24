import { describe, expect, it } from "vitest";
import { STARTER_AS_COLUMNS, activeColumns, columnByKey, sectionNames, sectionsOf, slugKey, suitsColumn, type ScheduleColumn } from "./schedule-columns";

const extra = (over: Partial<ScheduleColumn> & Pick<ScheduleColumn, "key" | "label">): ScheduleColumn => ({ id: over.key, kind: "people", section: "", options: [], ministries: [], optional: false, position: 500, archived: false, ...over });

describe("schedule columns", () => {
  it("start with vocals, band and sound booth", () => {
    expect(sectionsOf(STARTER_AS_COLUMNS).map((s) => s.title)).toEqual(["Vocals", "Band", "Sound booth"]);
    expect(STARTER_AS_COLUMNS.some((c) => c.key === "backup-singer")).toBe(false);
    expect(STARTER_AS_COLUMNS.some((c) => c.key === "other")).toBe(false);
  });

  it("keep their order, hide archived ones, and group under headings", () => {
    const cols = [...STARTER_AS_COLUMNS, extra({ key: "dancers", label: "Dancers", section: "Other" }), extra({ key: "old", label: "Old", archived: true }), extra({ key: "cam2", label: "Camera 2", section: "Sound booth", position: 120 })];
    expect(activeColumns(cols).some((c) => c.key === "old")).toBe(false);
    const booth = sectionsOf(cols).find((s) => s.title === "Sound booth")!;
    expect(booth.columns.map((c) => c.key)).toEqual(["audio", "projection", "camera", "cam2"]);
    expect(sectionNames(cols)).toEqual(["Vocals", "Band", "Sound booth", "Other"]);
    expect(columnByKey(cols).get("dancers")?.label).toBe("Dancers");
  });

  it("make keys from names", () => {
    expect(slugKey("Camera 1 & mixer")).toBe("camera-1-mixer");
    expect(slugKey("  Type of Sunday! ")).toBe("type-of-sunday");
    expect(slugKey("???")).toBe("column");
  });

  it("suggest people whose ministry fits", () => {
    const drums = STARTER_AS_COLUMNS.find((c) => c.key === "drums")!;
    expect(suitsColumn(drums, ["stage:drums", "media"])).toBe(true);
    expect(suitsColumn(drums, ["stage:keys"])).toBe(false);
  });
});
