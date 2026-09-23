import { describe, expect, it } from "vitest";

import {
  currentInjury,
  daysBetween,
  formatDateFr,
  formatDayCountFr,
  formatDayMonthFr,
  injuryStatus,
  injurySummaryFr,
  isFutureDate,
  isIsoDate,
  isOngoing,
  parisDate,
  pastInjuries,
  sortInjuries,
  type InjuryRecord,
} from "./injury";

const injury = (overrides: Partial<InjuryRecord> & { id: string }): InjuryRecord => ({
  startedOn: "2026-09-01",
  expectedReturnOn: null,
  note: null,
  resolvedOn: null,
  declaredByName: null,
  ...overrides,
});

describe("isIsoDate", () => {
  it("accepts a calendar day", () => {
    expect(isIsoDate("2026-09-22")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("22/09/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("parisDate", () => {
  it("reads the Paris calendar day, not the UTC one", () => {
    // 22:30 UTC is already the next day in Paris, in summer and in winter.
    expect(parisDate(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
    expect(parisDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(parisDate(new Date("2026-09-22T09:00:00Z"))).toBe("2026-09-22");
  });
});

describe("daysBetween", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-09-01", "2026-09-04")).toBe(3);
    expect(daysBetween("2026-09-04", "2026-09-01")).toBe(-3);
    expect(daysBetween("2026-09-04", "2026-09-04")).toBe(0);
  });

  it("is unaffected by a daylight-saving change", () => {
    // Europe/Paris springs forward on 2026-03-29: a naive local-time subtraction gives 0.96 days.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("the current injury", () => {
  it("is the most recent unresolved one", () => {
    const old = injury({ id: "old", startedOn: "2026-01-10" });
    const recent = injury({ id: "recent", startedOn: "2026-09-10" });
    const healed = injury({ id: "healed", startedOn: "2026-09-20", resolvedOn: "2026-09-21" });

    expect(currentInjury([old, healed, recent])?.id).toBe("recent");
  });

  it("is undefined once everything is resolved", () => {
    expect(currentInjury([injury({ id: "a", resolvedOn: "2026-09-10" })])).toBeUndefined();
    expect(currentInjury([])).toBeUndefined();
  });

  it("drives isOngoing", () => {
    expect(isOngoing(injury({ id: "a" }))).toBe(true);
    expect(isOngoing(injury({ id: "a", resolvedOn: "2026-09-10" }))).toBe(false);
  });
});

describe("sortInjuries", () => {
  it("lists ongoing injuries before healed ones, most recent first", () => {
    const list = [
      injury({ id: "healed-recent", startedOn: "2026-09-15", resolvedOn: "2026-09-18" }),
      injury({ id: "ongoing", startedOn: "2026-02-01" }),
      injury({ id: "healed-old", startedOn: "2026-01-01", resolvedOn: "2026-01-20" }),
    ];
    expect(sortInjuries(list).map((row) => row.id)).toEqual([
      "ongoing",
      "healed-recent",
      "healed-old",
    ]);
    expect(pastInjuries(list).map((row) => row.id)).toEqual(["healed-recent", "healed-old"]);
  });

  it("does not mutate its input", () => {
    const list = [injury({ id: "a", resolvedOn: "2026-01-02" }), injury({ id: "b" })];
    sortInjuries(list);
    expect(list.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("injuryStatus", () => {
  it("reports fit when nothing is open", () => {
    expect(injuryStatus([injury({ id: "a", resolvedOn: "2026-09-01" })], "2026-09-22")).toEqual({
      injured: false,
    });
  });

  it("counts the days elapsed and the days left", () => {
    const status = injuryStatus(
      [injury({ id: "a", startedOn: "2026-09-13", expectedReturnOn: "2026-10-03" })],
      "2026-09-22",
    );
    expect(status).toMatchObject({
      injured: true,
      daysSinceStart: 9,
      daysUntilReturn: 11,
      overdue: false,
    });
  });

  it("flags an expected return that has passed", () => {
    const status = injuryStatus(
      [injury({ id: "a", startedOn: "2026-08-01", expectedReturnOn: "2026-09-01" })],
      "2026-09-22",
    );
    expect(status).toMatchObject({ injured: true, daysUntilReturn: -21, overdue: true });
  });

  it("is not overdue on the expected day itself", () => {
    const status = injuryStatus(
      [injury({ id: "a", startedOn: "2026-09-01", expectedReturnOn: "2026-09-22" })],
      "2026-09-22",
    );
    expect(status).toMatchObject({ daysUntilReturn: 0, overdue: false });
  });

  it("leaves the countdown unknown without an expected return", () => {
    const status = injuryStatus([injury({ id: "a", startedOn: "2026-09-20" })], "2026-09-22");
    expect(status).toMatchObject({ injured: true, daysUntilReturn: null, overdue: false });
  });
});

describe("isFutureDate", () => {
  it("compares calendar days", () => {
    expect(isFutureDate("2026-09-23", "2026-09-22")).toBe(true);
    expect(isFutureDate("2026-09-22", "2026-09-22")).toBe(false);
    expect(isFutureDate("2026-09-21", "2026-09-22")).toBe(false);
  });
});

describe("French formatting", () => {
  it("writes a full date as DD/MM/YYYY", () => {
    // Day first, zero-padded, four-digit year. "9/22/2026" and "22 September 2026" are both wrong.
    expect(formatDateFr("2026-09-22")).toBe("22/09/2026");
    expect(formatDateFr("2026-08-01")).toBe("01/08/2026");
    expect(formatDateFr("2027-01-09")).toBe("09/01/2027");
  });

  it("drops the year inside a season", () => {
    expect(formatDayMonthFr("2026-02-13")).toBe("13 février");
    expect(formatDayMonthFr("2026-12-01")).toBe("1er décembre");
  });

  it("returns the raw value rather than throwing on nonsense", () => {
    expect(formatDateFr("hier")).toBe("hier");
  });

  it("words a relative day count", () => {
    expect(formatDayCountFr(0)).toBe("aujourd’hui");
    expect(formatDayCountFr(1)).toBe("demain");
    expect(formatDayCountFr(-1)).toBe("hier");
    expect(formatDayCountFr(12)).toBe("dans 12 jours");
    expect(formatDayCountFr(-12)).toBe("il y a 12 jours");
  });
});

describe("injurySummaryFr", () => {
  it("summarises an ongoing injury with its expected return", () => {
    expect(
      injurySummaryFr(
        [injury({ id: "a", startedOn: "2026-09-13", expectedReturnOn: "2026-10-03" })],
        "2026-09-22",
      ),
    ).toBe("Blessé depuis le 13 septembre, retour prévu le 3 octobre (dans 11 jours).");
  });

  it("says the return date has passed", () => {
    expect(
      injurySummaryFr(
        [injury({ id: "a", startedOn: "2026-08-01", expectedReturnOn: "2026-09-01" })],
        "2026-09-22",
      ),
    ).toBe("Blessé depuis le 1er août, retour prévu le 1er septembre — la date est passée.");
  });

  it("admits when no return was estimated", () => {
    expect(injurySummaryFr([injury({ id: "a", startedOn: "2026-09-20" })], "2026-09-22")).toBe(
      "Blessé depuis le 20 septembre, retour non estimé.",
    );
  });

  it("says nothing is wrong when nothing is", () => {
    expect(injurySummaryFr([], "2026-09-22")).toBe("Aucune blessure en cours.");
  });
});
