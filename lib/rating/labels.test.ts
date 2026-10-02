import { describe, expect, it } from "vitest";

import { RATING_SCORE_DEFAULT } from "./aggregate";
import {
  RATING_IS_FINAL_FR,
  RATING_SLIDERS_START_AT_FR,
  noteAuthorFr,
  ratingCountNoteFr,
  ratingInvitationFr,
  ratingScoreFr,
  ratingScoreValueTextFr,
  ratingsSavedFr,
} from "./labels";

describe("noteAuthorFr", () => {
  it("names the reader and marks him, for a note he gave a teammate", () => {
    // The coach plays too, so his own notes are in the list he is reading.
    expect(noteAuthorFr({ raterName: "Karim", isViewer: true })).toBe("Karim (toi)");
  });

  it("just names anybody else", () => {
    expect(noteAuthorFr({ raterName: "Karim", isViewer: false })).toBe("Karim");
  });

  it("never names the reader in the third person", () => {
    // What this used to guard against was « lui-même » for a note the reader had typed. There are no
    // self-notes left to get wrong, and « (toi) » is the whole of what remains.
    expect(noteAuthorFr({ raterName: "Karim", isViewer: true })).toContain("toi");
  });
});

describe("ratingCountNoteFr", () => {
  it("counts the notes a figure rests on", () => {
    expect(ratingCountNoteFr(4)).toBe("4 notes");
  });

  it("counts one note in the singular", () => {
    expect(ratingCountNoteFr(1)).toBe("1 note");
  });

  it("says a player is unrated rather than counting zero notes", () => {
    expect(ratingCountNoteFr(0)).toBe("pas encore noté");
  });

  it("says nothing about who gave what", () => {
    // It is coach-facing, and even for him it is a count. The authors are a separate list; a count
    // that named anybody would put one on a player's screen the day the component is reused.
    expect(ratingCountNoteFr(4)).not.toMatch(/[A-Z]/);
  });
});

describe("ratingScoreFr", () => {
  it("always shows the decimal, so 5 and 7,5 look like the same kind of figure", () => {
    expect(ratingScoreFr(5)).toBe("5,0");
    expect(ratingScoreFr(7.5)).toBe("7,5");
    expect(ratingScoreFr(10)).toBe("10,0");
  });

  it("shows a dash rather than a fake zero", () => {
    expect(ratingScoreFr(null)).toBe("—");
  });
});

describe("ratingScoreValueTextFr", () => {
  it("spells the scale out, in French, for the screen reader", () => {
    // `aria-valuetext` replaces the number entirely, so it has to carry « sur 10 » itself —
    // otherwise a French voice reads « 7.5 » in English and the scale is left to be assumed.
    expect(ratingScoreValueTextFr(7.5)).toBe("7,5 sur 10");
    expect(ratingScoreValueTextFr(5)).toBe("5,0 sur 10");
  });
});

describe("RATING_SLIDERS_START_AT_FR", () => {
  it("names the figure an untouched slider gives, formatted as the screen shows it", () => {
    // The promise the whole slider design rests on: a range has no unset state, so the reader is told
    // what not touching it means. « 5,0 », not « 5 » — the same figure the row beside the name prints.
    expect(RATING_SLIDERS_START_AT_FR).toContain(ratingScoreFr(RATING_SCORE_DEFAULT));
  });

  it("says that not touching a slider is still giving a note", () => {
    expect(RATING_SLIDERS_START_AT_FR).toContain("Si tu n’y touches pas");
    expect(RATING_SLIDERS_START_AT_FR).toContain("la note que tu donnes");
  });

  it("tutoies (decision 074)", () => {
    expect(RATING_SLIDERS_START_AT_FR).not.toMatch(/\bvous\b|\bvotre\b/i);
  });
});

describe("RATING_IS_FINAL_FR", () => {
  it("states that a sent note cannot be changed", () => {
    // `onConflictDoNothing` in `actions.ts` is the rule; this is the reader finding out before he
    // tries rather than after.
    expect(RATING_IS_FINAL_FR).toMatch(/ne change plus/);
  });
});

describe("ratingsSavedFr", () => {
  it("counts what it wrote and says who decides when the means come out", () => {
    // It used to promise « quand tout le monde aura noté », which published a match behind the coach's
    // back and is no longer how it works (decision 139): nothing comes out until he taps the button.
    expect(ratingsSavedFr(6, 0)).toBe(
      "6 notes enregistrées. C’est le coach qui décide quand les moyennes sortent.",
    );
  });

  it("agrees the participle with one note", () => {
    expect(ratingsSavedFr(1, 0)).toContain("1 note enregistrée.");
  });

  it("reads a repeat submit as already saved rather than as a failure", () => {
    // The retry path: a phone on a patchy connection resubmits the same set, writes nothing, and must
    // not be told something went wrong.
    expect(ratingsSavedFr(0, 6)).toBe("Ces notes étaient déjà enregistrées.");
  });

  it("says plainly when there was nothing to write at all", () => {
    expect(ratingsSavedFr(0, 0)).toBe("Rien de nouveau à enregistrer.");
  });

  it("never promises the reader anybody else’s notes (decision 137)", () => {
    // It used to end « il en reste à mettre pour voir celles des autres » — decision 021's trade,
    // which no longer exists. Nobody buys access by submitting, and nobody ever reads a single note.
    for (const sentence of [ratingsSavedFr(6, 0), ratingsSavedFr(1, 0), ratingsSavedFr(0, 6)]) {
      expect(sentence).not.toMatch(/celles des autres|pour voir/);
    }
  });
});

describe("ratingInvitationFr", () => {
  it("promises no deadline while the means are hidden, because there is none", () => {
    // What replaced `ratingUrgencyFr`, deleted with `lib/rating/window.ts`. Nothing closes the notation
    // any more (decision 139), so the sentence names the only thing a member can be told: who decides.
    const line = ratingInvitationFr(false);
    expect(line).toContain("ce match reste ouvert");
    expect(line).toContain("C’est le coach qui décide quand les moyennes sortent.");
  });

  it("still invites him once the means are out, and says they are", () => {
    // The trade decision 139 accepted out loud: he may note after reading the team's figures, and his
    // notes will move one the squad has already seen. The sentence does not hide either half.
    const line = ratingInvitationFr(true);
    expect(line).toContain("sont sorties");
    expect(line).toContain("tes notes compteront dedans");
  });

  it("never claims a note will stop counting", () => {
    // The old sentence ended « et tes notes ne compteront plus », which was the window closing. There
    // is no window, so that promise would now be a lie in both states.
    for (const line of [ratingInvitationFr(false), ratingInvitationFr(true)]) {
      expect(line).not.toMatch(/ne compteront plus|fermée|dernier délai/);
    }
  });

  it("tutoies (decision 074)", () => {
    for (const line of [ratingInvitationFr(false), ratingInvitationFr(true)]) {
      expect(line).toMatch(/\btu\b|\btes\b/i);
      expect(line).not.toMatch(/\bvous\b|\bvotre\b/i);
    }
  });
});
