import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTE_PATTERNS, redactAnalyticsUrl, redactPathname } from "./redact";

const UUID = "5f3c4ee3-2b7a-4c1e-9d8f-71a0e4c2b913";
const OTHER_UUID = "8c1d2f40-6e5b-4a19-b2c7-0d3f91ae8456";

describe("redactPathname", () => {
  it("replaces a match id with its placeholder, keeping the rest of the route", () => {
    expect(redactPathname(`/match/${UUID}/recap`)).toBe("/match/[id]/recap");
    expect(redactPathname(`/match/${UUID}`)).toBe("/match/[id]");
    expect(redactPathname(`/match/${UUID}/jeu`)).toBe("/match/[id]/jeu");
    expect(redactPathname(`/match/${UUID}/notation`)).toBe("/match/[id]/notation");
  });

  it("replaces a player id", () => {
    expect(redactPathname(`/joueur/${UUID}`)).toBe("/joueur/[id]");
  });

  it("replaces both ids of a saved lineup, which carries two", () => {
    expect(redactPathname(`/match/${UUID}/composition/${OTHER_UUID}`)).toBe(
      "/match/[id]/composition/[lineupId]",
    );
    expect(redactPathname(`/match/${UUID}/composition`)).toBe("/match/[id]/composition");
  });

  it("redacts a numeric id too: the shape of the value is never what decides", () => {
    expect(redactPathname("/match/1/jeu")).toBe("/match/[id]/jeu");
  });

  it("leaves the static routes that share a parent with a dynamic segment alone", () => {
    // The two pages that would be lost if redaction were purely positional.
    expect(redactPathname("/match/nouveau")).toBe("/match/nouveau");
    expect(redactPathname(`/match/${UUID}/composition/nouvelle`)).toBe(
      "/match/[id]/composition/nouvelle",
    );
  });

  it("leaves a route with no dynamic segment untouched", () => {
    for (const path of [
      "/",
      "/calendrier",
      "/equipe",
      "/stats",
      "/stats/equipe-type",
      "/moi",
      "/connexion",
      "/rejoindre",
      "/deconnexion",
    ]) {
      expect(redactPathname(path)).toBe(path);
    }
  });

  it("survives a trailing slash and an empty path", () => {
    expect(redactPathname(`/match/${UUID}/`)).toBe("/match/[id]/");
    expect(redactPathname("")).toBe("");
    expect(redactPathname("/")).toBe("/");
  });
});

describe("redactAnalyticsUrl", () => {
  it("redacts the path of an absolute href and keeps origin and query", () => {
    expect(redactAnalyticsUrl(`https://dev.7orteils.bgonzva.fr/joueur/${UUID}?onglet=stats`)).toBe(
      "https://dev.7orteils.bgonzva.fr/joueur/[id]?onglet=stats",
    );
  });

  it("redacts a bare pathname, in case the script ever sends one", () => {
    expect(redactAnalyticsUrl(`/match/${UUID}/saisie`)).toBe("/match/[id]/saisie");
  });

  it("returns an unreadable value untouched rather than dropping the event", () => {
    expect(redactAnalyticsUrl("not a url")).toBe("not a url");
  });
});

/**
 * The staleness guard, read off `app/` instead of restated here.
 *
 * Both tables in `redact.ts` are claims about the route tree, and a claim about a directory that is
 * maintained by hand goes stale exactly the way `proxy.ts`'s enumeration of `public/` did — silently.
 * So walk the tree: every `[param]` directory must have its parent in `DYNAMIC_CHILDREN` under the
 * same placeholder, and every static sibling of such a directory must be listed in `STATIC_SIBLINGS`.
 * Adding `app/(app)/joueur/[id]/historique/[saison]` fails this test until the tables know about it.
 */
describe("the route tables match app/ on disk", () => {
  type DynamicDir = { parent: string; param: string; siblings: string[] };

  /** Whether a directory, or anything under it, is reachable as a URL. */
  function isRoutable(dir: string): boolean {
    return readdirSync(dir, { withFileTypes: true }).some((e) =>
      e.isDirectory() ? isRoutable(join(dir, e.name)) : e.name === "page.tsx" || e.name === "route.ts",
    );
  }

  function walk(dir: string, found: DynamicDir[] = []): DynamicDir[] {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const dynamic = entries.filter((e) => /^\[.+\]$/.test(e.name));

    if (dynamic.length > 0) {
      // Route groups — `(app)`, `(jeu)` — are not path segments, so the parent of a dynamic
      // directory is the nearest ancestor whose name is neither a group nor a private folder.
      const parent = dir
        .split("/")
        .reverse()
        .find((name) => !name.startsWith("(") && !name.startsWith("_"));
      for (const d of dynamic) {
        found.push({
          parent: parent ?? "",
          param: d.name,
          siblings: entries
            .filter((e) => !/^\[.+\]$/.test(e.name))
            .map((e) => e.name)
            // A private folder (`_components`) is not a path segment, and a directory holding no
            // page is not a route: neither can ever appear in a URL, so neither needs listing.
            .filter((name) => !name.startsWith("_") && isRoutable(join(dir, name))),
        });
      }
    }

    for (const e of entries) walk(join(dir, e.name), found);
    return found;
  }

  const dynamicDirs = walk(join(process.cwd(), "app"));

  it("found the dynamic routes, so an unreadable tree cannot make this pass vacuously", () => {
    expect(dynamicDirs.length).toBeGreaterThanOrEqual(3);
  });

  it.each(dynamicDirs)("knows that $parent has a dynamic child $param", ({ parent, param }) => {
    expect(ROUTE_PATTERNS.DYNAMIC_CHILDREN[parent]).toBe(param);
  });

  it.each(dynamicDirs.filter((d) => d.siblings.length > 0))(
    "lists every static route sitting beside $parent/$param",
    ({ parent, siblings }) => {
      for (const sibling of siblings) {
        expect(ROUTE_PATTERNS.STATIC_SIBLINGS[parent] ?? []).toContain(sibling);
      }
    },
  );
});
