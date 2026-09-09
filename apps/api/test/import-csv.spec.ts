import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCsv, parseSheetDate, parseMoney, mapSheetStatus, mapSheetSource,
} from "../src/import/csv";

describe("csv parser", () => {
  it("handles quoted fields with commas, newlines, escaped quotes", () => {
    const csv = 'a,b,c\n"x,1","line1\nline2","say ""hi"""\n2,3,4';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["x,1", "line1\nline2", 'say "hi"']);
    expect(rows[2]).toEqual(["2", "3", "4"]);
  });

  it("strips BOM and keeps multi-line record intact", () => {
    const rows = parseCsv("\uFEFFid,name\n1,\"Tahsin\nIshrak\"");
    expect(rows[1]![1]).toBe("Tahsin\nIshrak");
  });
});

describe("sheet date formats (from live sheet)", () => {
  it("17-Aug-2026", () => {
    expect(parseSheetDate("17-Aug-2026")!.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });
  it("8/18/2026 as M/D/Y", () => {
    expect(parseSheetDate("8/18/2026")!.toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });
  it("ISO fallback + junk → null", () => {
    expect(parseSheetDate("2026-09-05")!.getUTCDate()).toBe(5);
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("tbd")).toBeNull();
  });
});

describe("money + enums", () => {
  it("parses messy amounts", () => {
    expect(parseMoney(" ৳ 12,500 ")).toBe(12500);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("0")).toBe(0);
  });
  it("status junk tolerance (sheet has stray 0s)", () => {
    expect(mapSheetStatus("Confirmed")).toBe("CONFIRMED");
    expect(mapSheetStatus("")).toBe("CONFIRMED");
    expect(mapSheetStatus("0")).toBe("CONFIRMED");
    expect(mapSheetStatus("No Show")).toBe("NO_SHOW");
    expect(mapSheetStatus("Cancelled")).toBe("CANCELLED");
  });
  it("source mapping", () => {
    /**
     * This line used to read `expect(mapSheetSource("")).toBe("DIRECT")`.
     *
     * The test was not wrong about what the code did — it was wrong about what
     * the code should do, and having it written down is part of why the defect
     * lasted. An empty Source cell is not evidence that a guest came direct. In
     * the client's own workbook 76 of 96 rows are empty and 3 more carry junk
     * from a shifted row, so 82% of their bookings were being reported as
     * Direct on the strength of nothing at all.
     */
    expect(mapSheetSource("")).toBeNull();
    expect(mapSheetSource("   ")).toBeNull();
    expect(mapSheetSource("4")).toBeNull();
    expect(mapSheetSource("Agent")).toBe("AGENT");
    expect(mapSheetSource("WhatsApp")).toBe("WHATSAPP");
    expect(mapSheetSource("Phone Call")).toBe("PHONE");
    expect(mapSheetSource("Direct")).toBe("DIRECT");
    // and a channel the resort invented, matched off its own list
    expect(mapSheetSource("Instagram", ["DIRECT", "INSTAGRAM"])).toBe("INSTAGRAM");
    expect(mapSheetSource("Facebook", ["DIRECT"])).toBeNull();
  });
});

describe("real Sky Eco sheet fixture", () => {
  const csv = readFileSync(join(__dirname, "fixtures", "sky-eco-sheet.csv"), "utf8");
  const rows = parseCsv(csv);

  it("parses header + 93 data rows", () => {
    expect(rows[0]![0]).toBe("Booking ID");
    expect(rows.length).toBeGreaterThanOrEqual(90);
  });

  it("multi-line guest names survive (Tahsin Ishrak)", () => {
    const tahsin = rows.filter((r) => r.join(",").includes("Tahsin"));
    expect(tahsin.length).toBeGreaterThanOrEqual(3);
    expect(tahsin[0]![2]).toBe("Tahsin Ishrak\n");
  });

  it("out-of-service rows detected", () => {
    const oos = rows.filter((r) => /out of service/i.test(r[2] ?? ""));
    expect(oos.length).toBe(3); // Rose, Magnolia, Jasmine
  });
});
