import { describe, expect, it } from "vitest";

import {
  BENCH_MARK_LABELS,
  benchMarksFor,
  defaultBenchMark,
  isPlaceable,
  squadFromComposition,
  type BenchMark,
  type SquadCandidate,
} from "./squad";

const player = (id: string, squadRole: SquadCandidate["squadRole"] = null): SquadCandidate => ({
  membershipId: id,
  name: id[0].toUpperCase() + id.slice(1),
  isPlayer: true,
  squadRole,
});

const coach: SquadCandidate = {
  membershipId: "coach",
  name: "Coach",
  isPlayer: false,
  squadRole: null,
};

const SEVEN = ["hugo", "samir", "thomas", "nico", "leo", "karim", "julien"];
const squad = [...SEVEN.map((id) => player(id)), player("momo"), player("ali"), player("brice"), coach];

function marks(entries: Record<string, BenchMark>): Map<string, BenchMark> {
  return new Map(Object.entries(entries));
}

describe("squadFromComposition", () => {
  it("makes the seven on the pitch starters and reads the rest off the list", () => {
    const result = squadFromComposition({
      members: squad,
      starterIds: SEVEN,
      marks: marks({ momo: "substitute", ali: "supporter", brice: "none", coach: "supporter" }),
    });

    expect(result).toEqual({
      ok: true,
      rows: [
        ...SEVEN.map((id) => ({ teamMemberId: id, role: "starter" })),
        { teamMemberId: "momo", role: "substitute" },
        { teamMemberId: "ali", role: "supporter" },
        { teamMemberId: "coach", role: "supporter" },
      ],
      cleared: ["brice"],
    });
  });

  /** « Le reste des joueurs est considéré comme pas sélectionné. » */
  it("treats a member the list says nothing about as not selected", () => {
    const result = squadFromComposition({ members: squad, starterIds: SEVEN, marks: new Map() });
    expect(result.ok && result.cleared).toEqual(["momo", "ali", "brice", "coach"]);
  });

  /** The list has no control for a man on the pitch; a crafted form cannot make him both. */
  it("lets the pitch win over the list, so nobody is both titulaire and something else", () => {
    const result = squadFromComposition({
      members: squad,
      starterIds: SEVEN,
      marks: marks({ hugo: "supporter", leo: "none" }),
    });
    expect(result.ok && result.rows.filter((row) => row.teamMemberId === "hugo")).toEqual([
      { teamMemberId: "hugo", role: "starter" },
    ]);
    expect(result.ok && result.cleared).not.toContain("leo");
  });

  /** Decision 159: a coach rates only if the sheet names him, so he must be nameable as a supporter. */
  it("lets a member who does not play be a supporter, and nothing else", () => {
    expect(
      squadFromComposition({ members: squad, starterIds: SEVEN, marks: marks({ coach: "supporter" }) })
        .ok,
    ).toBe(true);

    const asSub = squadFromComposition({
      members: squad,
      starterIds: SEVEN,
      marks: marks({ coach: "substitute" }),
    });
    expect(asSub).toEqual({
      ok: false,
      errorFr: "Coach ne joue pas : il peut être supporter, pas remplaçant.",
    });

    const onPitch = squadFromComposition({
      members: squad,
      starterIds: [...SEVEN.slice(1), "coach"],
      marks: new Map(),
    });
    expect(onPitch).toEqual({
      ok: false,
      errorFr: "Coach ne joue pas : il peut être supporter, pas sur le terrain.",
    });
  });

  /** Decision 053: a confirmed composition is history, and so is having played in it. */
  it("refuses to take a player already fielded off the selection", () => {
    const locked = new Set(["momo"]);
    for (const mark of ["supporter", "none"] as const) {
      expect(
        squadFromComposition({
          members: squad,
          starterIds: SEVEN,
          marks: marks({ momo: mark }),
          lockedIds: locked,
        }),
      ).toEqual({
        ok: false,
        errorFr: "Momo est déjà entré en jeu : il reste titulaire ou remplaçant.",
      });
    }
    expect(
      squadFromComposition({
        members: squad,
        starterIds: SEVEN,
        marks: marks({ momo: "substitute" }),
        lockedIds: locked,
      }).ok,
    ).toBe(true);
  });

  it("ignores ids that are not active members of the team", () => {
    const result = squadFromComposition({
      members: squad,
      starterIds: [...SEVEN, "stranger"],
      marks: marks({ intruder: "substitute" }),
    });
    expect(result.ok).toBe(true);
    expect(
      result.ok && result.rows.some((row) => ["stranger", "intruder"].includes(row.teamMemberId)),
    ).toBe(false);
  });
});

describe("the list's choices", () => {
  it("offers a player all three and a non-player only supporter or nothing", () => {
    expect(benchMarksFor({ isPlayer: true })).toEqual(["substitute", "supporter", "none"]);
    expect(benchMarksFor({ isPlayer: false })).toEqual(["supporter", "none"]);
  });

  it("opens on what the selection already says", () => {
    expect(defaultBenchMark({ isPlayer: true, squadRole: "substitute" })).toBe("substitute");
    expect(defaultBenchMark({ isPlayer: true, squadRole: "supporter" })).toBe("supporter");
    expect(defaultBenchMark({ isPlayer: true, squadRole: null })).toBe("none");
    expect(defaultBenchMark({ isPlayer: false, squadRole: "supporter" })).toBe("supporter");
  });

  /** Taken off the turf, he goes to the bench rather than out of the selection. */
  it("shows a starter taken off the pitch as a substitute", () => {
    expect(defaultBenchMark({ isPlayer: true, squadRole: "starter" })).toBe("substitute");
  });

  it("says « — » for not selected, never « Hors feuille »", () => {
    expect(BENCH_MARK_LABELS.none.short).toBe("—");
    expect(BENCH_MARK_LABELS.none.full).toBe("Non sélectionné");
  });
});

describe("isPlaceable", () => {
  it("draws the starting composition from every player, selected or not", () => {
    expect(isPlaceable({ isPlayer: true, squadRole: null }, "initial")).toBe(true);
    expect(isPlaceable({ isPlayer: true, squadRole: "supporter" }, "initial")).toBe(true);
    expect(isPlaceable({ isPlayer: false, squadRole: "supporter" }, "initial")).toBe(false);
  });

  it("draws a planned change from the starters and substitutes only", () => {
    expect(isPlaceable({ isPlayer: true, squadRole: "starter" }, "plan")).toBe(true);
    expect(isPlaceable({ isPlayer: true, squadRole: "substitute" }, "plan")).toBe(true);
    expect(isPlaceable({ isPlayer: true, squadRole: "supporter" }, "plan")).toBe(false);
    expect(isPlaceable({ isPlayer: true, squadRole: null }, "plan")).toBe(false);
  });
});
