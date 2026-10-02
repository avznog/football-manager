import { describe, expect, it } from "vitest";

import { ratingUrgencyFr, ratingWindow } from "./window";

describe("ratingWindow", () => {
  it("is open once the match is finished and the means are not out", () => {
    expect(ratingWindow({ finished: true, published: false })).toMatchObject({
      state: "open",
      isOpen: true,
    });
  });

  /**
   * The whole of decision 138, and the request behind it: a match played five weeks ago whose notes
   * nobody finished is still rateable. The calendar is not an input any more — there is no
   * `nextKickoffAtMs`, and no clock — so « however old » is true by construction rather than by a
   * case that has to be remembered.
   */
  it("is open for a match however long ago it was played, as long as nothing is published", () => {
    expect(ratingWindow({ finished: true, published: false }).isOpen).toBe(true);
  });

  /**
   * And the guarantee that stops it being open for ever: a reader who could rate a published match
   * would be writing his notes after reading the team's, which is the anchoring decision 021 existed
   * to prevent and the one property decision 137 kept.
   */
  it("closes the moment the means are out", () => {
    expect(ratingWindow({ finished: true, published: true })).toMatchObject({
      state: "closed",
      isOpen: false,
    });
  });

  it("is not open before the final whistle, published or not", () => {
    expect(ratingWindow({ finished: false, published: false })).toMatchObject({
      state: "not-yet",
      isOpen: false,
    });
    /*
     * A match nobody played and nobody finished: `ratingsPublication` publishes it vacuously, so
     * `published` arrives true. « Not yet » still wins — a match that has not been played is not a
     * match whose rating is over, and the screen's two sentences are different.
     */
    expect(ratingWindow({ finished: false, published: true }).state).toBe("not-yet");
  });
});

describe("ratingUrgencyFr", () => {
  /**
   * There is no date left to assert, which is the point: the old sentence named the next kick-off, and
   * for the last match of a season it named nothing at all and printed nothing. This one is true for
   * every played match, so it is unconditional on the three screens that show it.
   */
  it("names the two things that end the rating, and no date", () => {
    const sentence = ratingUrgencyFr();
    expect(sentence).toContain("tout le monde aura noté");
    expect(sentence).toContain("le coach");
    expect(sentence).not.toContain("coup d’envoi");
  });

  /**
   * It must not threaten the punishment decision 137 removed. The window closing *publishes* the
   * means, so « tu ne verras pas celles de l'équipe » would be a threat the app no longer carries
   * out — and three unit assertions once pinned that sentence while it was wrong, which is why it is
   * asserted negatively here rather than trusted to a reading.
   */
  it("does not threaten to hide the team's means from him", () => {
    expect(ratingUrgencyFr()).not.toContain("tu ne verras pas");
  });

  /** What he actually loses is his say, and the sentence has to carry it. */
  it("says his notes stop counting, which is the loss", () => {
    expect(ratingUrgencyFr()).toContain("tes notes ne compteront plus");
  });
});
