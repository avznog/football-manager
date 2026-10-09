/**
 * The by-hand offline check from `docs/PLAN.md` (« Verification »), automated:
 *
 *   open game mode, disable the network, log three events, re-enable — the three events land
 *   **once each**, at the **right minutes**, with no duplicates.
 *
 * ## Why this is not covered by `outbox.test.ts`
 *
 * Those 18 unit tests drive `createOutbox` with an injected transport and an injected clock, which
 * proves the *policy*: the backoff ladder, FIFO order, what a 4xx does that a 5xx does not. What
 * they cannot prove is that the policy is wired to a browser and to a real `POST /api/match-events`:
 *
 * - that `fetchTransport`'s rejection branch is reached by an actually-dead network, rather than by
 *   a fake that resolves `{ ok: false }`;
 * - that the queue survives in IndexedDB and that the screen keeps deriving a truthful score from
 *   actions the server has never seen;
 * - that **the server is idempotent on `client_event_id` over HTTP** (invariant 6). A retry is only
 *   safe because of that, and until now nothing had ever sent the same `client_event_id` twice
 *   through the route handler.
 *
 * The second half of this spec is about that last point, and it is the interesting one: the network
 * does not merely fail, it **lies**. The POST reaches the server and the event is written; the
 * response is replaced with a 503, so the client believes the batch was lost and sends it again.
 * A server that is idempotent in name only would show the goal twice, and the score would read one
 * more than the coach tapped — the exact failure the whole outbox design exists to make impossible.
 *
 * ## Why no composition, no squad, and « But encaissé » three times
 *
 * A conceded goal is the one action that needs nobody on the pitch, so the setup is a match and a
 * kick-off, and every line below is about the queue rather than about lineups. The score being
 * `0 – 3` is exactly as strong an assertion as `3 – 0` would be, and it takes forty fewer lines to
 * arrange. Minutes 11′, 24′ and 26′ are distinct so that a queue which flushed in the wrong order,
 * or stamped `occurred_at` on arrival instead of on the tap, could not pass.
 *
 * Like `happy-path.spec.ts` this owns its fixture team (decision 044) and never touches the demo
 * season, and it drives `localhost` rather than `127.0.0.1` (decision 043).
 *
 * ## What it caught, and what it cannot catch
 *
 * It was written against a real bug and killed it: `emit` refreshed the route after **every** tap,
 * and offline that refresh is a failed RSC request, which Next answers with a full browser
 * navigation — so the first action of a match with no signal blanked game mode and took the
 * optimistic score with it (decision 057). Restoring the unconditional `router.refresh()` fails this
 * spec on its first assertion.
 *
 * The duplicate half is deliberately an **outcome** assertion, not a unit one: removing the log's own
 * memory of `client_event_id` from `prepareEventBatch` does *not* fail it, because the unique index
 * and `onConflictDoNothing` still keep the row count at one. That is defence in depth working, and
 * it is the reason this spec asserts « 0 – 4 » rather than which layer said no.
 */

import { expect, test } from "@playwright/test";

import { provisionFixture } from "./fixtures/provision";
import { MS_PER_MINUTE, login, parisDate } from "./helpers/app";

const OPPONENT = "AS Sans Réseau";

test("le hors-ligne : les actions tapées sans réseau arrivent une fois chacune, à leur minute", async ({
  page,
  context,
}) => {
  const fixture = provisionFixture();
  const t0 = Date.now();
  const at = (minutes: number) => t0 + minutes * MS_PER_MINUTE;

  const scoreboard = page.getByRole("region", { name: "Chrono et score" });
  const clock = scoreboard.locator('span[aria-label^="Chrono"]');
  const score = scoreboard.locator('p[aria-label^="Score"]');
  // `Card` renders a bare `<section>`, so « Déroulé du match » is not a landmark to ask for by role.
  const timeline = page
    .locator("section")
    .filter({ hasText: "Déroulé du match" })
    .locator("ol > li");
  const queued = page.getByText("en attente d’envoi");

  await test.step("the coach creates a match and kicks off, with a network", async () => {
    await page.clock.setFixedTime(t0);
    await login(page, fixture.coach.username, fixture.password);

    await page.getByRole("link", { name: "Nouveau match" }).first().click();
    await page.getByLabel("Adversaire").fill(OPPONENT);
    await page.getByLabel("Coup d’envoi").fill(`${parisDate(new Date(t0))}T15:00`);
    await page.getByRole("button", { name: "Créer le match" }).click();
    await expect(page.getByRole("heading", { level: 1, name: OPPONENT })).toBeVisible();

    await page.getByRole("link", { name: "Ouvrir le mode match" }).click();
    await expect(clock).toHaveText("00:00");

    // The button shows « Début » and announces the football term as well, so that the visible word is
    // a word of its accessible name (WCAG 2.5.3) — `clockActionFr().name`.
    await page.getByRole("button", { name: "Début : coup d’envoi", exact: true }).click();
    // The bar prints the time, the score and the pending count, and no phase line (decision 112):
    // that the first period is running is what the clock button offering « Mi-temps » says.
    await expect(page.getByRole("button", { name: "Mi-temps" })).toBeVisible();
    // The baseline: with a network, an action leaves the queue immediately. Every « en attente »
    // below therefore means the network, and not a queue that never flushes at all.
    await expect(queued).toHaveCount(0);
  });

  await test.step("three goals conceded with no network at all", async () => {
    await context.setOffline(true);

    for (const [index, minute] of [11, 24, 26].entries()) {
      await page.clock.setFixedTime(at(minute));
      await expect(clock).toHaveText(`${minute}:00`);

      await page.getByRole("button", { name: "ACTION", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Action" })
        .getByRole("button", { name: "But encaissé" })
        .click();

      // The screen tells the truth from the queue alone: the score moves while the server knows
      // nothing about any of this (invariant 2 — everything is derived, including from what is
      // still on the device).
      await expect(score).toHaveText(`0 – ${index + 1}`);
      await expect(scoreboard).toContainText(
        index === 0 ? "1 action en attente" : `${index + 1} actions en attente`,
      );
    }

    await expect(queued).toHaveCount(3);
  });

  await test.step("the network comes back and the three land, once each, at their minute", async () => {
    await context.setOffline(false);

    // No waiting out a backoff: the `online` event clears `nextAttemptAt` and flushes at once, which
    // is deliberate — a coach who walks back into coverage at 80′ must not wait for a ladder.
    await expect(queued).toHaveCount(0);
    await expect(scoreboard).not.toContainText("en attente");

    // The reload is the assertion. Until now every number on this screen could have come from
    // IndexedDB; afterwards the only source is the server's log, replayed by the reducer.
    await page.reload();
    await expect(score).toHaveText("0 – 3");
    await expect(queued).toHaveCount(0);
    await expect(timeline).toHaveCount(4); // the kick-off and the three goals
    await expect(timeline.nth(0)).toContainText("26’");
    await expect(timeline.nth(1)).toContainText("24’");
    await expect(timeline.nth(2)).toContainText("11’");
    // The minute is the device's, stamped when the coach tapped — not when the POST finally landed,
    // which for all three was somewhere after the 26th.
    for (const index of [0, 1, 2]) {
      await expect(timeline.nth(index)).toContainText("But encaissé");
    }
  });

  await test.step("a POST that succeeds and then lies about it is not counted twice", async () => {
    let poisoned = false;
    await page.route("**/api/match-events", async (route) => {
      if (poisoned) return route.continue();
      poisoned = true;
      // The request really is sent: the event is written, `client_event_id` and all. Only the
      // *answer* is thrown away, which is what a phone losing signal mid-response experiences.
      await route.fetch();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service indisponible." }),
      });
    });

    await page.clock.setFixedTime(at(41));
    await expect(clock).toHaveText("41:00");

    // Awaited below rather than after the tap: the retry may only be provoked once the queue has
    // actually been told the batch failed, and this is the only signal for that.
    const lie = page.waitForResponse(
      (response) => response.url().includes("/api/match-events") && response.status() === 503,
    );

    await page.getByRole("button", { name: "ACTION", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Action" })
      .getByRole("button", { name: "But encaissé" })
      .click();

    await expect(score).toHaveText("0 – 4");
    await lie;
    await expect(scoreboard).toContainText("1 action en attente");

    // The record is now in the first rung of the backoff — one second *by the queue's clock*, which
    // this spec has fixed, so it would wait for ever. Nudging the clock forward would be a race with
    // the moment the failure is stamped, so provoke the retry the way a pitch that finds signal again
    // provokes it: `online` clears every backoff and flushes at once.
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(queued).toHaveCount(0);

    // The same `client_event_id` has now reached the route handler twice. Exactly one row exists,
    // or this reads « 0 – 5 » and the timeline has six lines.
    await page.reload();
    await expect(score).toHaveText("0 – 4");
    await expect(timeline).toHaveCount(5);
    // 41:00 of a 2×30 is « 30’+11 »: added time on the first half, which is the notation decision 009
    // asks for. What matters here is that it is the minute of the **tap**, kept through a 503 and a
    // retry the coach never saw.
    await expect(timeline.nth(0)).toContainText("30’+11");
  });
});
