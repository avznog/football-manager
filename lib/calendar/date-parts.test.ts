import { describe, expect, it } from "vitest";

import {
  EMPTY_PARTS,
  assembleDateValue,
  dateProblemFr,
  daysInMonth,
  isLeapYear,
  normalisePart,
  parsePastedDate,
  splitDateValue,
  type DateParts,
} from "./date-parts";

const parts = (over: Partial<DateParts>): DateParts => ({ ...EMPTY_PARTS, ...over });

describe("splitDateValue", () => {
  it("reads both shapes the native inputs posted", () => {
    expect(splitDateValue("2026-11-22")).toEqual(parts({ day: "22", month: "11", year: "2026" }));
    expect(splitDateValue("2026-11-22T10:30")).toEqual({
      day: "22",
      month: "11",
      year: "2026",
      hour: "10",
      minute: "30",
    });
    // Seconds, which a server-rendered default can carry, are dropped rather than refused.
    expect(splitDateValue("2026-11-22T10:30:00").minute).toBe("30");
  });

  it("gives empty boxes for nothing or for nonsense", () => {
    expect(splitDateValue("")).toEqual(EMPTY_PARTS);
    expect(splitDateValue(undefined)).toEqual(EMPTY_PARTS);
    expect(splitDateValue("22/11/2026")).toEqual(EMPTY_PARTS);
  });
});

describe("assembleDateValue", () => {
  it("posts exactly what the native inputs did", () => {
    expect(assembleDateValue(splitDateValue("2026-11-22"), "date").value).toBe("2026-11-22");
    expect(assembleDateValue(splitDateValue("2026-11-22T10:30"), "datetime-local").value).toBe(
      "2026-11-22T10:30",
    );
  });

  it("round-trips any value through the boxes", () => {
    for (const value of ["2024-02-29", "2026-01-01", "2026-12-31"]) {
      expect(assembleDateValue(splitDateValue(value), "date").value).toBe(value);
    }
    for (const value of ["2026-03-29T02:30", "2026-09-27T00:00", "2026-09-27T23:59"]) {
      expect(assembleDateValue(splitDateValue(value), "datetime-local").value).toBe(value);
    }
  });

  it("pads single digits the coach typed", () => {
    expect(assembleDateValue(parts({ day: "4", month: "2", year: "2026" }), "date").value).toBe(
      "2026-02-04",
    );
  });

  it("treats all-empty as no value and no problem, and part-filled as incomplete", () => {
    expect(assembleDateValue(EMPTY_PARTS, "date")).toEqual({ value: "", problem: null });
    expect(assembleDateValue(parts({ day: "22" }), "date")).toEqual({
      value: "",
      problem: "incomplete",
    });
    // A two-digit year is incomplete, not 0026.
    expect(assembleDateValue(parts({ day: "22", month: "11", year: "26" }), "date").problem).toBe(
      "incomplete",
    );
    // A date without its time is incomplete for a kick-off.
    expect(
      assembleDateValue(parts({ day: "22", month: "11", year: "2026" }), "datetime-local").problem,
    ).toBe("incomplete");
  });

  it("posts empty for an impossible date rather than a nearby real one", () => {
    expect(assembleDateValue(parts({ day: "31", month: "02", year: "2026" }), "date")).toEqual({
      value: "",
      problem: "impossible-date",
    });
    expect(assembleDateValue(parts({ day: "31", month: "04", year: "2026" }), "date").problem).toBe(
      "impossible-date",
    );
    expect(assembleDateValue(parts({ day: "12", month: "13", year: "2026" }), "date").problem).toBe(
      "impossible-date",
    );
    expect(assembleDateValue(parts({ day: "00", month: "01", year: "2026" }), "date").problem).toBe(
      "impossible-date",
    );
  });

  it("knows the leap years", () => {
    expect(assembleDateValue(parts({ day: "29", month: "02", year: "2024" }), "date").value).toBe(
      "2024-02-29",
    );
    expect(assembleDateValue(parts({ day: "29", month: "02", year: "2026" }), "date").problem).toBe(
      "impossible-date",
    );
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2028)).toBe(true);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
  });

  it("refuses a 25th hour or a 60th minute, and accepts midnight", () => {
    const day = { day: "22", month: "11", year: "2026" };
    expect(assembleDateValue(parts({ ...day, hour: "24", minute: "00" }), "datetime-local").problem).toBe(
      "impossible-time",
    );
    expect(assembleDateValue(parts({ ...day, hour: "10", minute: "60" }), "datetime-local").problem).toBe(
      "impossible-time",
    );
    expect(assembleDateValue(parts({ ...day, hour: "00", minute: "00" }), "datetime-local").value).toBe(
      "2026-11-22T00:00",
    );
  });

  it("respects min and max like the native input did", () => {
    const bounds = { min: "2026-11-10", max: "2026-11-18" };
    expect(assembleDateValue(splitDateValue("2026-11-09"), "date", bounds).problem).toBe(
      "before-min",
    );
    expect(assembleDateValue(splitDateValue("2026-11-19"), "date", bounds).problem).toBe("after-max");
    expect(assembleDateValue(splitDateValue("2026-11-10"), "date", bounds).value).toBe("2026-11-10");
    expect(assembleDateValue(splitDateValue("2026-11-18"), "date", bounds).value).toBe("2026-11-18");
  });
});

describe("dateProblemFr", () => {
  it("names the bound in French", () => {
    expect(dateProblemFr("before-min", { min: "2026-11-10" })).toBe("Au plus tôt le 10/11/2026.");
    expect(dateProblemFr("after-max", { max: "2026-11-18" })).toBe("Au plus tard le 18/11/2026.");
    expect(dateProblemFr("impossible-date")).toBe("Cette date n’existe pas.");
  });
});

describe("parsePastedDate", () => {
  it("fills every box from a French date and time", () => {
    expect(parsePastedDate("22/11/2026 10:30")).toEqual({
      day: "22",
      month: "11",
      year: "2026",
      hour: "10",
      minute: "30",
    });
    expect(parsePastedDate("22/11/2026 à 10h30")?.hour).toBe("10");
    expect(parsePastedDate("2-3-2026")).toEqual(parts({ day: "02", month: "03", year: "2026" }));
    expect(parsePastedDate(" 22.11.2026 ")).toEqual(parts({ day: "22", month: "11", year: "2026" }));
  });

  it("takes the ISO a native input or a database would hand over", () => {
    expect(parsePastedDate("2026-11-22T10:30")?.minute).toBe("30");
    expect(parsePastedDate("2026-11-22")?.day).toBe("22");
  });

  it("refuses what is not a date, so the paste lands in its box", () => {
    expect(parsePastedDate("22")).toBeNull();
    expect(parsePastedDate("demain")).toBeNull();
    expect(parsePastedDate("22/11/26")).toBeNull();
  });
});

describe("normalisePart", () => {
  it("keeps digits only, cut to the box", () => {
    expect(normalisePart("year", "20a26x9")).toEqual({ text: "2026", complete: true });
    expect(normalisePart("day", "1")).toEqual({ text: "1", complete: false });
    expect(normalisePart("day", "12")).toEqual({ text: "12", complete: true });
  });

  it("pads a first digit that already decides the box, and moves on", () => {
    expect(normalisePart("day", "4")).toEqual({ text: "04", complete: true });
    expect(normalisePart("month", "2")).toEqual({ text: "02", complete: true });
    expect(normalisePart("hour", "3")).toEqual({ text: "03", complete: true });
    expect(normalisePart("minute", "7")).toEqual({ text: "07", complete: true });
    // A first digit that could still begin a valid number waits for the second.
    expect(normalisePart("month", "1")).toEqual({ text: "1", complete: false });
    expect(normalisePart("hour", "2")).toEqual({ text: "2", complete: false });
  });
});
