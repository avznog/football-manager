import { describe, expect, it } from "vitest";

import {
  capitalizeFirst,
  dayDifference,
  dayKey,
  daysFromNow,
  formatDate,
  formatDay,
  formatDayLabel,
  formatInputValueFr,
  formatIsoDay,
  formatRelativeDays,
  formatShortDay,
  formatTime,
  formatWhen,
  fromLocalInput,
  toLocalInput,
  zoneOffsetMs,
} from "./time";

const HOUR = 3_600_000;

/**
 * Every assertion here is written against **Paris**, never against the machine's zone, so the
 * suite passes identically on a laptop in Paris and in a CI container in UTC.
 */

describe("zoneOffsetMs", () => {
  it("is +1h in winter and +2h in summer", () => {
    expect(zoneOffsetMs(new Date("2026-01-15T12:00:00Z"))).toBe(HOUR);
    expect(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"))).toBe(2 * HOUR);
  });

  it("switches on the last Sunday of March, at 01:00 UTC", () => {
    expect(zoneOffsetMs(new Date("2026-03-29T00:59:00Z"))).toBe(HOUR);
    expect(zoneOffsetMs(new Date("2026-03-29T01:00:00Z"))).toBe(2 * HOUR);
  });
});

describe("fromLocalInput", () => {
  it("reads a wall clock as Paris time, in summer", () => {
    // 20:30 CEST is 18:30 UTC.
    expect(fromLocalInput("2026-09-27T20:30")?.toISOString()).toBe("2026-09-27T18:30:00.000Z");
  });

  it("reads a wall clock as Paris time, in winter", () => {
    expect(fromLocalInput("2026-12-13T10:00")?.toISOString()).toBe("2026-12-13T09:00:00.000Z");
  });

  it("gets the day right for a late kick-off", () => {
    // The bug this guards: 23:00 in Paris is 21:00 UTC the *same* day, and must stay so.
    const instant = fromLocalInput("2026-07-04T23:00");
    expect(instant?.toISOString()).toBe("2026-07-04T21:00:00.000Z");
    expect(dayKey(instant as Date)).toBe("2026-07-04");
  });

  it("resolves the hour correctly on both sides of the spring shift", () => {
    // 01:30 is still CET; 03:30 is already CEST. The iterative correction is what gets this right.
    expect(fromLocalInput("2026-03-29T01:30")?.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(fromLocalInput("2026-03-29T03:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("round-trips through toLocalInput", () => {
    for (const value of ["2026-09-27T10:30", "2026-01-04T14:00", "2026-06-21T20:45"]) {
      const instant = fromLocalInput(value);
      expect(instant).not.toBeNull();
      expect(toLocalInput(instant as Date)).toBe(value);
    }
  });

  it("rejects anything that is not a real wall clock", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("pas une date")).toBeNull();
    expect(fromLocalInput("2026-02-31T10:00")).toBeNull();
    expect(fromLocalInput("2026-13-01T10:00")).toBeNull();
    expect(fromLocalInput("2026-09-27T25:00")).toBeNull();
    expect(fromLocalInput("2026-09-27")).toBeNull();
    expect(fromLocalInput("2026-09-27T10:30:00")).toBeNull();
  });

  it("accepts 29 February in a leap year and refuses it otherwise", () => {
    expect(fromLocalInput("2028-02-29T10:00")).not.toBeNull();
    expect(fromLocalInput("2027-02-29T10:00")).toBeNull();
  });
});

describe("dayKey", () => {
  it("uses the Paris calendar day, not the UTC one", () => {
    // 23:30 on the 27th in Paris is already the 28th in UTC — the calendar must say the 27th.
    expect(dayKey(new Date("2026-09-27T21:30:00Z"))).toBe("2026-09-27");
    // And just after midnight in Paris is still the previous day in UTC.
    expect(dayKey(new Date("2026-09-27T22:30:00Z"))).toBe("2026-09-28");
  });
});

describe("dayDifference and daysFromNow", () => {
  it("counts whole calendar days", () => {
    expect(dayDifference("2026-09-27", "2026-09-27")).toBe(0);
    expect(dayDifference("2026-09-27", "2026-09-28")).toBe(1);
    expect(dayDifference("2026-09-28", "2026-09-27")).toBe(-1);
    expect(dayDifference("2026-09-27", "2026-10-04")).toBe(7);
  });

  it("is unaffected by the DST night being 23 hours long", () => {
    expect(dayDifference("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("counts days, not 24-hour blocks", () => {
    // 22:00 tonight to 08:00 tomorrow is ten hours, but it is one day.
    const now = new Date("2026-09-27T20:00:00Z"); // 22:00 Paris
    const tomorrowMorning = new Date("2026-09-28T06:00:00Z"); // 08:00 Paris
    expect(daysFromNow(tomorrowMorning, now)).toBe(1);
  });
});

describe("French formatting", () => {
  const kickoff = new Date("2026-09-27T08:30:00Z"); // 10:30 Paris, a Sunday

  it("writes the weekday in French and the date in digits", () => {
    expect(formatDay(kickoff)).toBe("dimanche 27/09/2026");
    expect(formatShortDay(kickoff)).toBe("dim. 27/09/2026");
  });

  it("always carries the year, whichever season the reader is in", () => {
    // No `now` to compare against any more: a heading that omits the year is a day the reader
    // cannot place in February, and a season spans two of them (decision 101).
    expect(formatDay(new Date("2027-01-09T12:00:00Z"))).toBe("samedi 09/01/2027");
    expect(formatShortDay(new Date("2027-01-09T12:00:00Z"))).toBe("sam. 09/01/2027");
  });

  it("writes the date as DD/MM/YYYY", () => {
    // The whole point: day first. An American locale would render this "9/27/2026", and a
    // `numeric` month would render 3 October as "3/10/2026" instead of "03/10/2026".
    expect(formatDate(kickoff)).toBe("27/09/2026");
    expect(formatDate(new Date("2026-10-03T08:30:00Z"))).toBe("03/10/2026");
    expect(formatDate(new Date("2027-01-09T12:00:00Z"))).toBe("09/01/2027");
  });

  it("dates by the Paris day, not the UTC one", () => {
    // 23:30 on the 27th in Paris is already the 28th in UTC. The reader is in Paris.
    expect(formatDate(new Date("2026-09-27T21:30:00Z"))).toBe("27/09/2026");
  });

  it("writes the time on a 24-hour clock, in Paris", () => {
    expect(formatTime(kickoff)).toBe("10:30");
    expect(formatTime(new Date("2026-09-27T18:30:00Z"))).toBe("20:30");
  });

  it("never falls back to a 12-hour clock", () => {
    // Every one of these would be a different string with hour12 — "7:00 PM", "12:00 AM".
    expect(formatTime(new Date("2026-09-27T17:00:00Z"))).toBe("19:00");
    expect(formatTime(new Date("2026-09-27T22:00:00Z"))).toBe("00:00");
    expect(formatTime(new Date("2026-09-27T10:00:00Z"))).toBe("12:00");
    for (let hour = 0; hour < 24; hour++) {
      const time = formatTime(new Date(Date.UTC(2026, 0, 15, hour)));
      expect(time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    }
  });

  it("labels the neighbouring days relatively and everything else by date", () => {
    // The relative word never stands alone: the pinned card must still say which day it means.
    const now = new Date("2026-09-27T06:00:00Z");
    expect(formatDayLabel(kickoff, now)).toBe("aujourd’hui, 27/09/2026");
    expect(formatDayLabel(new Date("2026-09-28T08:30:00Z"), now)).toBe("demain, 28/09/2026");
    expect(formatDayLabel(new Date("2026-09-26T08:30:00Z"), now)).toBe("hier, 26/09/2026");
    expect(formatDayLabel(new Date("2026-10-04T08:30:00Z"), now)).toBe("dimanche 04/10/2026");
  });

  it("counts in days up to a fortnight, then in weeks", () => {
    const now = new Date("2026-09-20T08:30:00Z");
    expect(formatRelativeDays(kickoff, now)).toBe("dans 7 jours");
    expect(formatRelativeDays(new Date("2026-09-13T08:30:00Z"), now)).toBe("il y a 7 jours");
    expect(formatRelativeDays(new Date("2026-11-01T08:30:00Z"), now)).toBe("dans 6 semaines");
  });

  it("joins day and time with « à »", () => {
    expect(formatWhen(kickoff, new Date("2026-09-20T08:30:00Z"))).toBe(
      "dimanche 27/09/2026 à 10:30",
    );
    expect(formatWhen(kickoff, new Date("2026-09-26T08:30:00Z"))).toBe(
      "demain, 27/09/2026 à 10:30",
    );
  });
});

/**
 * The echo under a native picker (`components/ui/date-input.tsx`). Every assertion here is about a
 * **string with no timezone**: the day the user picked must come back as the day the user picked, in
 * any zone the suite happens to run in, which is why nothing below goes through `new Date()`.
 */
describe("formatIsoDay and formatInputValueFr", () => {
  it("turns an ISO day into the French numeric date", () => {
    expect(formatIsoDay("2026-03-14")).toBe("14/03/2026");
    expect(formatInputValueFr("2026-03-14")).toBe("14/03/2026");
  });

  it("does not shift the day, whatever the host zone", () => {
    // UTC midnight read in a negative-offset zone is the previous day; the parts are read instead.
    expect(formatInputValueFr("2026-01-01")).toBe("01/01/2026");
    expect(formatInputValueFr("2026-12-31")).toBe("31/12/2026");
    expect(formatInputValueFr("2026-03-29T02:30")).toBe("29/03/2026 à 02:30");
  });

  it("joins a wall clock to the day with « à », in 24-hour digits", () => {
    expect(formatInputValueFr("2026-09-27T10:30")).toBe("27/09/2026 à 10:30");
    expect(formatInputValueFr("2026-09-27T20:05")).toBe("27/09/2026 à 20:05");
    expect(formatInputValueFr("2026-09-27T00:00")).toBe("27/09/2026 à 00:00");
  });

  it("says nothing at all for an empty or unreadable value", () => {
    for (const value of [
      "",
      "   ",
      "hier",
      "14/03/2026",
      "2026-03",
      "2026-03-14T25:00",
      "2026-03-14T10:70",
      "2026-03-14T10:30:00",
    ]) {
      expect(formatInputValueFr(value)).toBeNull();
    }
    expect(formatIsoDay("hier")).toBeNull();
  });

  it("agrees with formatDate on the same calendar day", () => {
    // What the picker echoes and what a list prints for that day must be the same string.
    expect(formatInputValueFr("2026-09-27")).toBe(formatDate(new Date("2026-09-27T12:00:00Z")));
  });
});

describe("capitalizeFirst", () => {
  it("capitalises the first letter and leaves the rest alone", () => {
    expect(capitalizeFirst("dimanche 27/09/2026")).toBe("Dimanche 27/09/2026");
    expect(capitalizeFirst("aujourd’hui")).toBe("Aujourd’hui");
    expect(capitalizeFirst("")).toBe("");
    expect(capitalizeFirst("étoile")).toBe("Étoile");
  });
});
