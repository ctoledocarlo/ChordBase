import { strToU8, unzipSync, strFromU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { columnName, isoToSerial, readXlsx, serialToIso, writeXlsx } from "./xlsx";

/** A tiny well-formedness check: every tag closes in order. (Excel refuses a file with broken XML.) */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  const body = xml.replace(/<\?[\s\S]*?\?>/g, "");
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0 && !/<[^>]*[^>\w"'\s/?-]$/.test(body);
}

describe("columns and dates", () => {
  it("names columns like a spreadsheet", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
    expect(columnName(702)).toBe("AAA");
  });

  it("converts between ISO dates and Excel day numbers", () => {
    expect(isoToSerial("1900-03-01")).toBe(61);
    expect(isoToSerial("2026-10-25")).toBe(46320);
    expect(serialToIso(46320)).toBe("2026-10-25");
    expect(serialToIso(46320.75)).toBe("2026-10-25");
    expect(isoToSerial("25/10/2026")).toBeNull();
  });
});

describe("writing a workbook", () => {
  const bytes = writeXlsx([
    {
      name: "Schedule",
      widths: [18, 24],
      wrap: [1],
      rows: [
        ["Date", "Keys"],
        [{ date: "2026-10-25" }, "Maria Reyes, Tom Okafor"],
        [{ time: "09:30" }, 'Tom & "Jo" <b>'],
      ],
    },
    { name: "How to use", rows: [["Read me"]] },
  ]);

  it("makes a zip with the parts a workbook needs", () => {
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"].sort(),
    );
  });

  it("makes well-formed XML in every part", () => {
    for (const [name, data] of Object.entries(unzipSync(bytes))) expect([name, wellFormed(strFromU8(data))]).toEqual([name, true]);
  });

  it("freezes the header row, sets the widths, and escapes text", () => {
    const sheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<col min="1" max="1" width="18" customWidth="1"/>');
    expect(sheet).toContain("Tom &amp; &quot;Jo&quot; &lt;b&gt;");
  });

  it("reads back what it wrote", () => {
    const read = readXlsx(bytes);
    expect(read.name).toBe("Schedule");
    expect(read.rows).toEqual([
      ["Date", "Keys"],
      ["2026-10-25", "Maria Reyes, Tom Okafor"],
      ["09:30", 'Tom & "Jo" <b>'],
    ]);
  });

  it("reads the sheet it is asked for", () => {
    expect(readXlsx(bytes, "How to use").rows).toEqual([["Read me"]]);
  });

  it("keeps new lines and leading spaces, and drops characters XML can't hold", () => {
    const out = readXlsx(writeXlsx([{ name: "S", rows: [["A"], ["one\ntwo", "  padded", "bell\u0007"]] }])).rows;
    expect(out[1]).toEqual(["one\ntwo", "  padded", "bell"]);
  });

  it("leaves a sheet name Excel would refuse in a safe form", () => {
    const read = readXlsx(writeXlsx([{ name: "A/B:C?*[x]", rows: [["h"]] }]), "nothing");
    expect(read.name).not.toMatch(/[\\/?*[\]:]/);
  });
});

describe("reading what Excel writes", () => {
  /** A workbook the way Excel makes one: shared strings, number-formatted dates, empty cells skipped. */
  const excel = zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns="x" xmlns:r="r"><sheets><sheet name="Sunday plan" sheetId="1" r:id="rId3"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId3" Type="t" Target="/xl/worksheets/sheet7.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8(
      '<sst><si><t>Date</t></si><si><t>Keys</t></si><si><r><t>Maria </t></r><r><rPr><b/></rPr><t>Reyes</t></r></si><si><t xml:space="preserve">Fish &amp; Chips</t></si></sst>',
    ),
    "xl/styles.xml": strToU8(
      '<styleSheet><numFmts count="1"><numFmt numFmtId="170" formatCode="dddd, mmmm d"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="20"/><xf numFmtId="170"/></cellXfs></styleSheet>',
    ),
    "xl/worksheets/sheet7.xml": strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" s="1"><v>46320</v></c><c r="B3" s="2"><v>0.395833333333333</v></c><c r="C3" t="s"><v>2</v></c><c r="D3" t="s"><v>3</v></c><c r="E3" s="3"><v>46327</v></c><c r="F3"><v>12</v></c><c r="G3" t="b"><v>1</v></c></row></sheetData></worksheet>',
    ),
  });

  it("follows the workbook to the sheet, and reads shared and rich-text strings", () => {
    const read = readXlsx(excel);
    expect(read.name).toBe("Sunday plan");
    expect(read.rows[0]).toEqual(["Date", "", "Keys"]);
    expect(read.rows[1]).toEqual([]);
    expect(read.rows[2].slice(2, 4)).toEqual(["Maria Reyes", "Fish & Chips"]);
  });

  it("turns date and time numbers into text, by the format on the cell", () => {
    const row = readXlsx(excel).rows[2];
    expect(row[0]).toBe("2026-10-25");
    expect(row[1]).toBe("09:30");
    expect(row[4]).toBe("2026-11-01");
    expect(row[5]).toBe("12");
    expect(row[6]).toBe("TRUE");
  });
});

describe("files that aren't workbooks", () => {
  it("are turned away with a plain message", () => {
    expect(() => readXlsx(strToU8("just some text"))).toThrow(/Excel/);
    expect(() => readXlsx(zipSync({ "hello.txt": strToU8("hi") }))).toThrow(/Excel/);
  });

  it("are refused when they are too big", () => {
    expect(() => readXlsx(new Uint8Array(4 * 1024 * 1024))).toThrow(/too big/);
  });
});
