import { describe, expect, it } from "vitest";

import type { AvailabilityStatus, MatchStatus } from "@/db/schema";
import {
  addMinutes,
  answersLineFr,
  availabilityIsWorthShowing,
  buildReminderMessage,
  byStartAscending,
  countsOf,
  isFinishedEvent,
  isLiveEvent,
  isOngoing,
  isPast,
  matchWindowMinutes,
  pastSectionTitleFr,
  pendingCount,
  reminderCardFr,
  splitTimeline,
  tallyAvailability,
  type PastSectionItem,
  type Responder,
  type TimelineItem,
} from "./timeline";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

type Item = TimelineItem & { id: string };

function match(startsAt: string, status: MatchStatus = "scheduled"): Item {
  return {
    id: `match-${startsAt}`,
    kind: "match",
    status,
    startsAt,
    endsAt: addMinutes(new Date(startsAt), matchWindowMinutes(2, 30)),
  };
}

/* -------------------------------------------------------------------------- */
/* Durations                                                                  */
/* -------------------------------------------------------------------------- */

describe("matchWindowMinutes", () => {
  it("is play + breaks + grace", () => {
    // 2×30 = 60 played, one 15' break, 60' of grace.
    expect(matchWindowMinutes(2, 30)).toBe(135);
    // A tournament of four 15' periods: 60 played, three breaks, same grace.
    expect(matchWindowMinutes(4, 15)).toBe(165);
  });

  it("charges no break for a single period", () => {
    expect(matchWindowMinutes(1, 40)).toBe(100);
  });
});

describe("addMinutes", () => {
  it("returns an ISO instant", () => {
    expect(addMinutes(new Date("2026-09-27T08:30:00Z"), 135)).toBe("2026-09-27T10:45:00.000Z");
  });
});

/* -------------------------------------------------------------------------- */
/* Chronology                                                                 */
/* -------------------------------------------------------------------------- */

describe("byStartAscending", () => {
  it("sorts oldest first", () => {
    const items = [match("2026-09-27T08:00:00Z"), match("2026-09-20T08:00:00Z")];
    expect([...items].sort(byStartAscending).map((item) => item.id)).toEqual([
      "match-2026-09-20T08:00:00Z",
      "match-2026-09-27T08:00:00Z",
    ]);
  });
});

describe("isLiveEvent", () => {
  it("is true only for a match being played", () => {
    expect(isLiveEvent(match("2026-09-27T08:00:00Z", "live"))).toBe(true);
    expect(isLiveEvent(match("2026-09-27T08:00:00Z"))).toBe(false);
  });
});

describe("isFinishedEvent", () => {
  it("is true only for a match that is over", () => {
    expect(isFinishedEvent(match("2026-09-27T08:00:00Z", "finished"))).toBe(true);
    expect(isFinishedEvent(match("2026-09-27T08:00:00Z", "live"))).toBe(false);
    expect(isFinishedEvent(match("2026-09-27T08:00:00Z"))).toBe(false);
  });
});

describe("isOngoing and isPast", () => {
  const kickoff = "2026-09-27T08:00:00Z";
  const scheduled = match(kickoff); // window ends 10:15Z

  it("is neither ongoing nor past before kick-off", () => {
    const now = new Date("2026-09-27T07:59:00Z");
    expect(isOngoing(scheduled, now)).toBe(false);
    expect(isPast(scheduled, now)).toBe(false);
  });

  it("is ongoing from kick-off to the end of the grace window", () => {
    expect(isOngoing(scheduled, new Date(kickoff))).toBe(true);
    expect(isOngoing(scheduled, new Date("2026-09-27T10:14:59Z"))).toBe(true);
  });

  it("is past the moment the window closes", () => {
    expect(isPast(scheduled, new Date("2026-09-27T10:15:00Z"))).toBe(true);
    expect(isOngoing(scheduled, new Date("2026-09-27T10:15:00Z"))).toBe(false);
  });

  it("never treats a live match as past, however long it overran", () => {
    const live = match(kickoff, "live");
    const wayLater = new Date("2026-09-28T00:00:00Z");
    expect(isPast(live, wayLater)).toBe(false);
    expect(isOngoing(live, wayLater)).toBe(true);
  });

  // Decision 121: the coach declares a match over, so the column outranks the clock.
  it("treats a match declared over as past, even before its own kick-off", () => {
    const declared = match("2026-10-11T08:00:00Z", "finished");
    const beforeKickoff = new Date("2026-09-27T12:00:00Z");
    expect(isPast(declared, beforeKickoff)).toBe(true);
    expect(isOngoing(declared, beforeKickoff)).toBe(false);
  });

  it("treats a match that ended early as past, without waiting for its window", () => {
    const early = match(kickoff, "finished");
    const duringTheWindow = new Date("2026-09-27T09:00:00Z");
    expect(isPast(early, duringTheWindow)).toBe(true);
    expect(isOngoing(early, duringTheWindow)).toBe(false);
  });
});

describe("splitTimeline", () => {
  const items = [
    match("2026-09-06T08:00:00Z", "finished"),
    match("2026-09-20T08:00:00Z", "finished"),
    match("2026-09-27T08:00:00Z"),
    match("2026-10-04T08:00:00Z"),
    match("2026-10-11T08:00:00Z"),
  ];

  it("pins the soonest event still to come", () => {
    const timeline = splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.next?.id).toBe("match-2026-09-27T08:00:00Z");
  });

  it("lists the rest of the future chronologically, without the pinned one", () => {
    const timeline = splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.upcoming.map((item) => item.id)).toEqual([
      "match-2026-10-04T08:00:00Z",
      "match-2026-10-11T08:00:00Z",
    ]);
  });

  it("lists the past most recent first", () => {
    const timeline = splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.past.map((item) => item.id)).toEqual([
      "match-2026-09-20T08:00:00Z",
      "match-2026-09-06T08:00:00Z",
    ]);
  });

  it("pins the event that is happening rather than the next one", () => {
    // Half-time of the 27th. The pinned card must be that match, not the October one.
    const timeline = splitTimeline(items, new Date("2026-09-27T08:35:00Z"));
    expect(timeline.next?.id).toBe("match-2026-09-27T08:00:00Z");
    expect(timeline.past).toHaveLength(2);
  });

  it("pins a live match even long after its scheduled end", () => {
    const live = [match("2026-09-27T08:00:00Z", "live"), match("2026-10-11T08:00:00Z")];
    const timeline = splitTimeline(live, new Date("2026-09-30T08:00:00Z"));
    expect(timeline.next?.id).toBe("match-2026-09-27T08:00:00Z");
  });

  it("never pins a match the coach has declared over, and files it under the past", () => {
    // Typed up in advance: the 11th of October, entered on the 25th of September (decision 121).
    const declared = [
      match("2026-10-11T08:00:00Z", "finished"),
      match("2026-10-04T08:00:00Z"),
    ];
    const timeline = splitTimeline(declared, new Date("2026-09-25T12:00:00Z"));
    expect(timeline.next?.id).toBe("match-2026-10-04T08:00:00Z");
    expect(timeline.upcoming).toEqual([]);
    expect(timeline.past.map((item) => item.id)).toEqual(["match-2026-10-11T08:00:00Z"]);
  });

  it("has no next event when the season is over", () => {
    const timeline = splitTimeline(items, new Date("2027-01-01T00:00:00Z"));
    expect(timeline.next).toBeNull();
    expect(timeline.upcoming).toEqual([]);
    expect(timeline.past).toHaveLength(items.length);
  });

  it("copes with an empty calendar", () => {
    expect(splitTimeline([], new Date("2026-09-25T12:00:00Z"))).toEqual({
      next: null,
      upcoming: [],
      past: [],
    });
  });

  it("does not mutate the list it was given", () => {
    const original = [...items];
    splitTimeline(items, new Date("2026-09-25T12:00:00Z"));
    expect(items).toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

describe("pendingCount", () => {
  it("is the squad minus everyone who answered", () => {
    expect(pendingCount(13, { yes: 9, no: 2, maybe: 0 })).toBe(2);
    expect(pendingCount(13, { yes: 13, no: 0, maybe: 0 })).toBe(0);
  });

  it("never goes negative when a player has left since answering", () => {
    expect(pendingCount(10, { yes: 9, no: 2, maybe: 1 })).toBe(0);
  });
});

describe("tallyAvailability", () => {
  const players: Responder[] = [
    { membershipId: "m-karim", displayName: "Karim" },
    { membershipId: "m-hugo", displayName: "Hugo" },
    { membershipId: "m-mehdi", displayName: "Mehdi" },
    { membershipId: "m-julien", displayName: "Julien" },
    { membershipId: "m-fabien", displayName: "Fabien" },
  ];

  const answers: { teamMemberId: string; status: AvailabilityStatus }[] = [
    { teamMemberId: "m-karim", status: "yes" },
    { teamMemberId: "m-hugo", status: "yes" },
    { teamMemberId: "m-julien", status: "no" },
  ];

  it("buckets every player, and nobody twice", () => {
    const tally = tallyAvailability(players, answers);
    expect(tally.yes.map((p) => p.displayName)).toEqual(["Karim", "Hugo"]);
    expect(tally.no.map((p) => p.displayName)).toEqual(["Julien"]);
    expect(tally.maybe).toEqual([]);
    expect(tally.pending.map((p) => p.displayName)).toEqual(["Mehdi", "Fabien"]);
    expect(tally.answered).toBe(3);
    expect(tally.total).toBe(5);
    expect(tally.yes.length + tally.no.length + tally.maybe.length + tally.pending.length).toBe(5);
  });

  it("keeps the order the squad came in", () => {
    const shuffled = [...answers].reverse();
    expect(tallyAvailability(players, shuffled).yes.map((p) => p.displayName)).toEqual([
      "Karim",
      "Hugo",
    ]);
  });

  it("ignores an answer from someone who is no longer in the squad", () => {
    const tally = tallyAvailability(players, [
      ...answers,
      { teamMemberId: "m-gone", status: "yes" },
    ]);
    expect(tally.yes).toHaveLength(2);
    expect(tally.answered).toBe(3);
  });

  it("puts everyone in pending when nobody has answered", () => {
    const tally = tallyAvailability(players, []);
    expect(tally.pending).toHaveLength(5);
    expect(tally.answered).toBe(0);
  });

  it("counts « peut-être » as answered", () => {
    const tally = tallyAvailability(players, [{ teamMemberId: "m-mehdi", status: "maybe" }]);
    expect(tally.maybe.map((p) => p.displayName)).toEqual(["Mehdi"]);
    expect(tally.answered).toBe(1);
    expect(tally.pending).toHaveLength(4);
  });

  it("agrees with countsOf", () => {
    expect(countsOf(tallyAvailability(players, answers))).toEqual({ yes: 2, no: 1, maybe: 0 });
  });
});

describe("buildReminderMessage", () => {
  /** French typography: a non-breaking space before the colon (`CLAUDE.md`). */
  const NBSP = " ";

  it("names everyone who has not answered", () => {
    const message = buildReminderMessage({
      title: "Étoile du Parc (championnat)",
      when: "dimanche 27/09/2026 à 10:30",
      pending: [
        { membershipId: "m-mehdi", displayName: "Mehdi" },
        { membershipId: "m-fabien", displayName: "Fabien" },
      ],
    });
    expect(message).toContain("Étoile du Parc (championnat) — dimanche 27/09/2026 à 10:30");
    expect(message).toContain(`Il manque les réponses de${NBSP}: Mehdi, Fabien.`);
  });

  it("uses the singular for a single straggler", () => {
    const message = buildReminderMessage({
      title: "CS Morvan (coupe)",
      when: "dimanche 04/10/2026 à 10:30",
      pending: [{ membershipId: "m-mehdi", displayName: "Mehdi" }],
    });
    expect(message).toContain(`Il manque la réponse de${NBSP}: Mehdi.`);
  });

  it("says thank you when the whole squad has answered", () => {
    const message = buildReminderMessage({
      title: "CS Morvan (coupe)",
      when: "dimanche 04/10/2026 à 10:30",
      pending: [],
    });
    expect(message).toContain("Tout le monde a répondu.");
    expect(message).not.toContain("Il manque");
  });
});

describe("availabilityIsWorthShowing", () => {
  /** The coach's reason for opening the screen at all: the thirteen names he has to chase. */
  it("shows the list before the event even when nobody has answered", () => {
    expect(availabilityIsWorthShowing({ answered: 0 }, false)).toBe(true);
  });

  /**
   * Nobody answered, and the card would still be the largest thing on the page a month later —
   * thirteen names under « Sans réponse » about a match that has happened. A record of nothing is not
   * a record.
   */
  it("drops it afterwards when there was nothing to record", () => {
    expect(availabilityIsWorthShowing({ answered: 0 }, true)).toBe(false);
  });

  it("keeps it afterwards as soon as one person answered", () => {
    expect(availabilityIsWorthShowing({ answered: 1 }, true)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* The heading of the history                                                 */
/* -------------------------------------------------------------------------- */

describe("pastSectionTitleFr", () => {
  const played: PastSectionItem = { score: { goalsFor: 2, goalsAgainst: 1 } };
  const unrecorded: PastSectionItem = { score: null };

  it("says « Déjà joué » when every row is a match that was played", () => {
    expect(pastSectionTitleFr([played, played])).toBe("Déjà joué");
  });

  /**
   * FC des Deux-Ponts: finished, nine men on the sheet, not one event. The heading claimed it had
   * been played, which is the invention decision 013 refused, one level up.
   */
  it("widens it for a match whose window closed with nothing recorded", () => {
    expect(pastSectionTitleFr([played, unrecorded])).toBe("Déjà passé");
  });

  it("is only ever rendered over a non-empty list", () => {
    expect(pastSectionTitleFr([])).toBe("Déjà joué");
  });
});

describe("answersLineFr", () => {
  it("reads as one scannable line, in the order the coach asks the questions", () => {
    expect(answersLineFr({ yes: 7, no: 1, maybe: 1 }, 13)).toBe(
      "7 dispo · 1 pas dispo · 1 peut-être · 4 sans réponse",
    );
  });

  /**
   * Read three days early: one player had tapped « pas dispo » and the line called him « 1 absent »,
   * a fact about an evening nobody had attended yet.
   */
  it("never calls a player who said no an absent one", () => {
    const line = answersLineFr({ yes: 7, no: 1, maybe: 1 }, 13);
    expect(line).not.toContain("absent");
    expect(line).toContain("1 pas dispo");
  });

  /** « 2 pas dispo » is the same words as « 1 pas dispo »: nothing here is pluralised. */
  it("does not pluralise, so every row reads the same way", () => {
    expect(answersLineFr({ yes: 0, no: 2, maybe: 0 }, 2)).toBe("2 pas dispo");
  });

  it("drops whatever is zero rather than printing « 0 »", () => {
    expect(answersLineFr({ yes: 13, no: 0, maybe: 0 }, 13)).toBe("13 dispo");
  });

  /** Thirteen people owing an answer is the coach's call to action, not an empty state. */
  it("counts the silence when a squad has not answered at all", () => {
    expect(answersLineFr({ yes: 0, no: 0, maybe: 0 }, 13)).toBe("13 sans réponse");
  });

  /** Only a squad with nobody in it has nothing to count. */
  it("falls back to a sentence when there is nothing to count", () => {
    expect(answersLineFr({ yes: 0, no: 0, maybe: 0 }, 0)).toBe("Personne n’a encore répondu.");
  });
});

describe("reminderCardFr", () => {
  /**
   * The card was headed « Relancer les absents » over its own description, « 4 joueurs n’ont pas
   * répondu ». Not answering is not refusing — and decision 087: a heading is a claim about every row
   * under it.
   */
  it("does not call the players it is about absent", () => {
    const heading = reminderCardFr(4);
    expect(heading.titleFr).toBe("Relancer ceux qui n’ont pas répondu");
    expect(heading.titleFr).not.toContain("absent");
    expect(heading.descriptionFr).toBe("4 joueurs n’ont pas répondu.");
  });

  it("agrees with itself in the singular", () => {
    expect(reminderCardFr(1).descriptionFr).toBe("1 joueur n’a pas répondu.");
  });

  it("does not invite a relance when there is nobody to relancer", () => {
    expect(reminderCardFr(0)).toEqual({
      titleFr: "Personne à relancer",
      descriptionFr: "Tout le monde a répondu. Rien à faire.",
    });
  });
});
