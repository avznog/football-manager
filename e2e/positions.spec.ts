/**
 * The positions picker on a player's sheet draws the seven slots of the `1-2-3-1`, and the two
 * wingers (like the two centre-backs) are one wish (decision 173): a tap on one changes both, and
 * the saved wish comes back on both after a reload.
 *
 * Cheap on purpose: the fixture's own team and players (decision 044), a fresh striker with no
 * positions yet, one tap, one save.
 */

import { expect, test } from "@playwright/test";

import { playerOf, provisionFixture } from "./fixtures/provision";
import { login } from "./helpers/app";

test("les deux ailiers sont un seul poste : un appui coche les deux", async ({ page }) => {
  const fixture = provisionFixture();
  const player = playerOf(fixture, "st");

  await login(page, fixture.coach.username, fixture.password);
  await page.goto(`/joueur/${player.membershipId}`);

  const group = page.getByRole("group", { name: "Postes du joueur sur le terrain" });
  await expect(group.getByRole("button")).toHaveCount(7);

  const left = group.getByRole("button", { name: /^Ailier gauche,/ });
  const right = group.getByRole("button", { name: /^Ailier droit,/ });
  await expect(left).toHaveAttribute("data-preference", "none");
  await expect(right).toHaveAttribute("data-preference", "none");

  await left.click();
  await expect(left).toHaveAttribute("data-preference", "secondary");
  await expect(right).toHaveAttribute("data-preference", "secondary");

  await page.getByRole("button", { name: "Enregistrer les postes" }).click();
  await expect(page.getByText("À jour.")).toBeVisible();

  await page.reload();
  await expect(group.getByRole("button", { name: /^Ailier gauche,/ })).toHaveAttribute(
    "data-preference",
    "secondary",
  );
  await expect(group.getByRole("button", { name: /^Ailier droit,/ })).toHaveAttribute(
    "data-preference",
    "secondary",
  );
  await expect(group.getByRole("button", { name: /^Défenseur central/ })).toHaveCount(2);
});
