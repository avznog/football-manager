/**
 * The first run of a freshly deployed instance (`docs/DEPLOY.md` §5, decision 052).
 *
 * After `npm run db:bootstrap` there is exactly one account, it is a super admin, and it is in no
 * team. Invariant 5 sends it to `/rejoindre` and nowhere else — so everything this instance will ever
 * be has to start on that one screen.
 *
 * ## What it is here to catch
 *
 * Every assertion below is a bug this repository actually shipped, found by walking this path by
 * hand rather than by any test:
 *
 * 1. `/rejoindre` offering **only** an invite code. `createTeam` existed from M0 with no UI at all,
 *    so the one screen a teamless super admin could reach asked him for a code from a coach who did
 *    not exist. A dead end, on the first screen of a new deployment.
 * 2. Creating the team leaving him **on the form he had just submitted** — `createTeam` set the
 *    active-team cookie and returned, where both join actions redirect. The team was created
 *    perfectly and the screen said nothing.
 * 3. `« Effectif »` rendering as an **empty bordered box**. The demo season always has a squad in it,
 *    so the state every new instance starts in had never been looked at.
 * 4. The club colours being settable at creation and **never again** — `updateTeam` had no UI
 *    either, and the kit discs on the pitch are drawn in them (decision 011).
 *
 * ## Why this needs no empty database
 *
 * It does not test `db/bootstrap.ts`; it tests the state that script leaves behind, which is just *a
 * super admin with no membership*. `e2e/fixtures/seed.ts` creates one, so this runs against the same
 * shared database as every other spec and prunes with it (decision 044).
 */

import { expect, test } from "@playwright/test";

import { provisionFixture } from "./fixtures/provision";

test("le premier lancement : un compte sans équipe en crée une et entre dans l’app", async ({
  page,
}) => {
  const fixture = provisionFixture();
  const admin = fixture.admin;

  /**
   * Named so the next run prunes it: the fixture deletes teams whose slug starts with `e2e-`, and
   * this is the one team in the suite created through the interface rather than inserted, so its slug
   * is whatever `slugify` makes of what we type here.
   */
  const teamName = `E2E ${fixture.runId} bootstrap`;
  const renamedTo = `E2E ${fixture.runId} renommée`;

  await test.step("a super admin with no team lands on « Rejoindre », not in the app", async () => {
    // Deliberately not the `login` helper: it asserts a landing on the calendar, and the whole point
    // of this account is that it cannot get there yet (invariant 5).
    await page.goto("/connexion");
    await page.getByLabel("Nom d’utilisateur").fill(admin.username);
    await page.getByLabel("Mot de passe").fill(fixture.password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page).toHaveURL(/\/rejoindre$/);
    await expect(page.getByRole("heading", { name: "Crée ton équipe" })).toBeVisible();

    // The screen must not send the first person on the instance to a coach who does not exist.
    await expect(page.getByText("envoyé par ton coach")).toHaveCount(0);

    // And the invite code is still there, below, for the ordinary case.
    await expect(page.getByRole("heading", { name: /rejoins une équipe existante/i })).toBeVisible();
  });

  await test.step("creating the team lands him inside the app, not back on the form", async () => {
    await page.getByLabel("Nom de l’équipe").fill(teamName);
    await page.getByRole("button", { name: "Créer l’équipe" }).click();

    // The regression that shipped: the team was created and the coach stayed on `/rejoindre`.
    await expect(page.getByRole("heading", { level: 1, name: "Calendrier" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/rejoindre/);
  });

  await test.step("the empty squad says what to do next instead of being a blank box", async () => {
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { level: 1, name: teamName })).toBeVisible();
    await expect(page.getByText("0 joueur", { exact: true })).toBeVisible();
    await expect(page.getByText(/Personne encore\./)).toBeVisible();
    // He is the team's coach, so the tool for fixing that is on the same screen. The heading names
    // both roles because the select inside the card mints a coach code too — `inviteCardFr`.
    await expect(page.getByRole("heading", { name: "Inviter un joueur ou un coach" })).toBeVisible();
  });

  await test.step("the club colours and the name can still be changed afterwards", async () => {
    await expect(page.getByRole("heading", { name: "Réglages de l’équipe" })).toBeVisible();
    await expect(page.getByLabel("Couleur principale")).toBeVisible();

    await page.getByLabel("Nom de l’équipe").fill(renamedTo);
    await page.getByRole("button", { name: "Enregistrer" }).click();

    // `updateTeam` revalidates `/equipe`, so the heading is the proof it was written.
    await expect(page.getByRole("heading", { level: 1, name: renamedTo })).toBeVisible();
  });

  await test.step("every tab of a brand-new instance renders, with nothing in it", async () => {
    for (const [path, heading] of [
      ["/calendrier", "Calendrier"],
      ["/stats", "Statistiques"],
      ["/entrainements", "Entraînements"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }

    // No match has been played, and the screen has to say so rather than invent a 0 – 0.
    await page.goto("/stats");
    await expect(page.getByText("0 match terminé")).toBeVisible();
    await expect(page.getByText("Pas encore de statistiques")).toBeVisible();
  });
});
