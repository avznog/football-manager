import { readdirSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE } from "@/lib/auth/cookies";

import { config, proxy } from "./proxy";

/**
 * The matcher, compiled the way Next compiles it: anchored at both ends against the pathname.
 * A path that matches runs the guard; a path that does not is served untouched.
 */
const MATCHER = new RegExp(`^${config.matcher[0]}$`);

function request(pathname: string, { session = false } = {}) {
  const headers = session ? { cookie: `${SESSION_COOKIE}=token` } : undefined;
  return new NextRequest(new URL(pathname, "http://localhost:3000"), { headers });
}

describe("proxy matcher — static files", () => {
  // Read the directory rather than naming the files: the defect this test exists for was an
  // enumeration that went stale when `public/` gained the three PWA icons. Hardcoding the names
  // here would recreate exactly that, one layer down.
  const publicFiles = readdirSync(join(process.cwd(), "public"));

  it("has files to check, so an empty directory cannot make this suite vacuously pass", () => {
    expect(publicFiles.length).toBeGreaterThan(0);
  });

  it.each(publicFiles)("does not match /%s, served from public/", (file) => {
    expect(MATCHER.test(`/${file}`)).toBe(false);
  });

  it("does not match Next's own convention routes", () => {
    // `app/manifest.ts` and `app/icon.svg` are requested by the browser with no cookie, on the
    // install prompt and in a tab title. A redirect there answers HTML to something expecting
    // an image or JSON.
    expect(MATCHER.test("/manifest.webmanifest")).toBe(false);
    expect(MATCHER.test("/icon.svg")).toBe(false);
    expect(MATCHER.test("/favicon.ico")).toBe(false);
    expect(MATCHER.test("/_next/static/chunks/main.js")).toBe(false);
    expect(MATCHER.test("/_next/image")).toBe(false);
  });
});

describe("proxy matcher — routes", () => {
  it("still matches the app's routes, so excluding files has not swallowed the guard", () => {
    for (const path of ["/", "/calendrier", "/match/1/jeu", "/effectif", "/connexion", "/rejoindre"]) {
      expect(MATCHER.test(path)).toBe(true);
    }
  });
});

describe("proxy — redirects", () => {
  it("sends a visitor with no session to /connexion, remembering where they were going", () => {
    const response = proxy(request("/match/1/jeu"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/connexion");
    expect(location.searchParams.get("suivant")).toBe("/match/1/jeu");
  });

  it("adds no ?suivant= for the home page: there is nothing to remember", () => {
    const location = new URL(proxy(request("/")).headers.get("location")!);

    expect(location.pathname).toBe("/connexion");
    expect(location.search).toBe("");
  });

  it("lets /connexion and /rejoindre through without a session", () => {
    expect(proxy(request("/connexion")).headers.get("location")).toBeNull();
    expect(proxy(request("/rejoindre")).headers.get("location")).toBeNull();
    expect(proxy(request("/rejoindre/abc")).headers.get("location")).toBeNull();
  });

  it("sends a visitor who already has a session away from /connexion", () => {
    const response = proxy(request("/connexion", { session: true }));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("leaves /rejoindre open to a signed-in player, who may be joining a second team", () => {
    expect(proxy(request("/rejoindre", { session: true })).headers.get("location")).toBeNull();
  });

  it("lets a signed-in visitor through to a private path", () => {
    expect(proxy(request("/calendrier", { session: true })).headers.get("location")).toBeNull();
  });
});
