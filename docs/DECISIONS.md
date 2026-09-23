# Decision log

Append-only. Each decision keeps its rationale so a future session does not re-litigate it.
If a decision turns out to be wrong, **add a new entry that supersedes it** rather than editing
the old one.

Format: `## NNN — Title` · **Date** · **Status** (accepted / superseded by NNN) · Decision ·
Why · Consequences.

---

## 001 — Git holds the spec, Postgres holds the data
**2026-09-22** · accepted

The repository holds the plan, the decision log, the data model, the schema and its SQL
migrations. Live application data (matches, events, ratings, availability) lives in Postgres.

**Why.** The owner's requirement was "all the data must be in git so I can resume work across
Claude sessions". The real need is *resumability of the project*, not version control of user
data. Match events are written concurrently by people on their phones on a Saturday morning —
git cannot be that store (no auth per player, merge conflicts, no concurrency).

**Consequences.** `docs/` and `CLAUDE.md` are first-class deliverables, updated with every
change. A future session reads `docs/` and knows everything. A JSON export/backup command may be
added later if a git-tracked snapshot of real data is ever wanted.

---

## 002 — Multi-team data model, single-team user experience
**2026-09-22** · accepted

Users belong to one or more teams through `team_members`, with a role per team. The UI always
shows one team at a time.

**Why.** The notes describe a super admin who appoints coaches, and coaches who appoint other
coaches — that is a multi-team platform. Retro-fitting multi-tenancy later means touching every
query; carrying it from the start costs almost nothing.

**Consequences.** Every query filters by `team_id`. `can()` always takes a team context.

---

## 003 — Match actions are an append-only event log
**2026-09-22** · accepted

Everything that happens in a match is an immutable row in `match_events`. No updates, no
deletes. A mistake is corrected by appending a `VOID` event referencing the wrong event.

**Why.** The owner asked explicitly for the behaviour of a card-payment ledger: a full,
trustworthy history of what happened. It also makes the live match resilient — replaying the log
reconstructs the exact state, so a refresh or a second device loses nothing.

**Consequences.** All match state is derived by `lib/match/reducer.ts`. The timeline can display
corrections ("but de Karim 58' — annulé"). Nothing in the app may ever mutate a match event.

---

## 004 — One operator per live match, with a client-side outbox
**2026-09-22** · accepted

Only one device drives game mode: the coach's, or a delegate they designate on the match.
Every action is queued locally in IndexedDB with a client-generated `client_event_id`, then
POSTed; failures retry.

**Why.** The owner wanted every action logged in the database as it happens, not a local-only
session. But 4G at an amateur pitch is unreliable, and losing a goal because of one dead bar is
unacceptable. The outbox gives both: the event keeps the timestamp and match clock captured on
the device, and lands in Postgres as soon as the network returns.

**Consequences.** `client_event_id` is `UNIQUE`; ingestion is an idempotent upsert. The UI shows
a pending-actions badge. Multi-operator editing is explicitly out of scope.

---

## 005 — Formation templates with typed slots, plus custom formations
**2026-09-22** · accepted

Built-in 7-a-side formations (1-3-2-1, 1-2-3-1, 1-3-1-2, 1-2-2-2…) are rows in `formations`
with `formation_slots` positioned at fixed pitch coordinates and each mapped to a
`position_code`. A coach can create a team-specific formation by dragging the slots themselves.

**Why.** Free x/y positioning with no slots would make "minutes played as a defender" and
position preferences meaningless. A closed catalogue would block a coach who invents a shape.

**Consequences.** `positions` is a fixed reference table (GB, DG, DC, DD, MG, MC, MD, MOC, AG,
AT, AD). A player's preferences reference `position_code`, so they are meaningful across every
formation — the composition editor can highlight players who want the slot being filled.

---

## 006 — Planned compositions are proposed, never auto-applied
**2026-09-22** · accepted

A coach can define compositions effective from minute X. In game mode, reaching that minute
raises a prompt that opens the pitch **pre-filled with the plan**, flags players who are injured
or already off, and waits for confirmation.

**Why.** Reality diverges from the plan. A composition written on Friday may field a player who
got injured at 12'. Applying it silently would corrupt the event log with an impossible state.

**Consequences.** `lineups.applied_event_id` is null until the coach confirms. The substitutions
are *deduced* by diffing the previous on-pitch state against the new one (`lib/match/lineup.ts`).

---

## 007 — Ratings: 0–10, players only, self-rating allowed, names visible
**2026-09-22** · accepted

Only members on the match sheet can rate. They rate every other player and themselves, 0–10
whole numbers, with an optional comment. Author names are visible to everyone.

**Why.** This is the owner's explicit choice, made after being warned about the two risks:
~13 inputs per player per match will hurt participation, and visible authorship of low notes can
cause friction in a dressing room.

**Consequences.** Mitigation built into the design: a player cannot see anyone else's ratings
until they have submitted their own, which prevents anchoring and copying. The rating window
closes when the next match kicks off. Man of the match is derived from the averages.

---

## 008 — Username + password, joining by invite code
**2026-09-22** · accepted

Auth is username + password (argon2id) with an opaque session token in an httpOnly cookie.
A coach generates a team invite link/code; the player opens it and sets their own password.
Coaches and the super admin can reset any password. No email provider is involved.

**Why.** The owner asked for user/password. Amateur players do not all have an email they read
on their phone, and adding an email service for password resets is infrastructure for a problem
better solved by the coach clicking "reset".

**Consequences.** No self-service password recovery — by design. Invite codes have an expiry and
a max-uses count. Usernames must be unique app-wide.

---

## 009 — Continuous match clock, 2×30 by default
**2026-09-22** · accepted

Periods and duration are configurable per match. Default: 2 periods of 30 minutes. The clock is
displayed continuously — the second half runs 30'→60'. Manual pause/resume for stoppages.

**Why.** A continuous minute is unambiguous in a timeline and matches how football results are
read. A per-period reset would make "12'" ambiguous and require every consumer of an event to
also know its period.

**Consequences.** Events store `period`, the continuous `minute`, and `clock_ms`. Pauses are
events, so elapsed time is computed from the log, not from wall-clock arithmetic.

---

## 010 — Tracked events: no cards, no opponent detail
**2026-09-22** · accepted

Tracked: goal (scorer + optional assist), goal conceded, own goal, penalty scored, penalty
missed, substitution, position change, foul, injury, plus clock events.
**Not** tracked: yellow/red cards, opponent scorer names, shots, saves, corners.

**Why.** The owner's explicit selection. Cards were offered and declined.

**Consequences.** Game mode never reduces the team to 6 players. A conceded goal records only
the minute and which of our players was in goal. If cards are wanted later, adding the event
type is cheap — the reducer's on-pitch count would need to become dynamic.

---

## 011 — Clean sheets computed two ways
**2026-09-22** · accepted

Headline stat: goalkeeper clean sheets (matches, and minutes in goal without conceding).
Detail stat, on each player page: "clean minutes" — minutes on the pitch while the team
conceded nothing.

**Why.** The owner's "minutes d'invincibilité" was ambiguous and they wanted both. The event log
supports it with no extra data.

**Consequences.** The reducer must track, per player, minutes on pitch segmented by goals
conceded, and separately minutes spent in the GK slot.

---

## 012 — French UI, English code
**2026-09-22** · accepted

All user-facing text is French, hardcoded — no i18n framework. All identifiers, comments,
commit messages and documentation are English.

**Why.** The team is French; a translation layer for a single language is pure overhead.
English code keeps the codebase conventional and greppable.

**Consequences.** Adding a second language later means introducing i18n and extracting strings.
Accepted as a deliberate trade.

---

## 013 — Retro-entry of matches
**2026-09-22** · accepted

A "saisie rétroactive" screen records a match that was played without game mode: score, scorers,
assists, who played and for how long.

**Why.** The season had already started when the app was built, and the app must not be a single
point of failure — if the phone dies at half-time, the match still has to be recorded.

**Consequences.** `matches.entry_mode` distinguishes `live` from `retro`. Retro entry synthesises
the corresponding events so that a single reducer serves both paths and statistics stay uniform.

---

## 014 — Visual direction
**2026-09-22** · accepted

Realistic turf pitch (green with mowing stripes, white markings, numbered kit-coloured discs
with the name beneath). Light and dark themes following the system, with a manual override.
Neutral app palette; club colours and crest only where they carry meaning. Sober, functional
tone everywhere, with one celebratory moment: the post-match recap.

**Why.** The owner's choices. A neutral palette is required because the app is multi-team and
club colours cannot be trusted to have adequate contrast.

**Consequences.** The pitch is a custom component; the turf texture must never reduce the
legibility of names and numbers. Every screen is checked in both themes.

---

## 015 — In-app reminders only
**2026-09-22** · accepted

No push notifications, no emails. The app shows each player what is awaiting their answer, and
shows the coach who has not replied yet.

**Why.** Web push requires players to install the PWA (mandatory on iOS) and a whole
subscription and sending infrastructure; email requires a provider and valid addresses. The
coach already nags the team on WhatsApp.

**Consequences.** A PWA manifest is included for installability, but no service-worker push.
The coach's match page has a copyable list of non-responders.

---

## 016 — Local Postgres from Homebrew for development, Neon for production
**2026-09-23** · accepted

Development runs against the Homebrew `postgresql@17` service, started by `npm run db:start`.
Production will use a Neon project; switching is a single `DATABASE_URL`.

**Why.** Provisioning Neon needs an interactive browser flow that the build session could not
perform. Docker was the first choice but the Desktop daemon is not installed on the owner's
machine, and a Homebrew service needs no daemon and survives a reboot. Nothing in the
application depends on Neon-specific behaviour.

**Consequences.** `drizzle.config.ts` and the db client read `DATABASE_URL` only. Deployment to
Vercel is blocked until a Neon connection string exists — tracked in `docs/ROADMAP.md`.

---

## 017 — `GOAL_FOR.scorerId` is optional
**2026-09-23** · accepted

A goal for us can be recorded with no scorer.

**Why.** Two real cases have a goal but no player of ours to credit: an opponent puts it in their
own net, and a retro entry where the owner remembers the score but not who scored (decision 013
exists precisely so the season can be backfilled). Forcing a scorer would mean either losing the
goal or inventing an attribution, and the score is the more important of the two facts.

**Consequences.** The reducer counts the goal in the score and credits nobody. Statistics must
never assume the scorers of a match sum to its score. The game-mode ACTION sheet still asks for
the scorer first — this is a deliberate escape hatch, not the happy path.

---

## 018 — Goalkeeper clean sheets are stored separately from clean minutes
**2026-09-23** · accepted

`match_player_stats` carries both `clean_minutes` / `conceded_while_on` for every player and
`gk_clean_minutes` / `conceded_while_gk` restricted to time in goal.

**Why.** Decision 011 asks for clean sheets "both ways", and the two are not derivable from one
another. A keeper who is substituted at half time in a 0-1 match has a clean first half; a field
player's clean minutes say nothing about who was in goal for them. Deriving the keeper's figure
at read time would mean re-reducing the event log for every season aggregate, which is exactly
what the frozen cache exists to avoid.

**Consequences.** A goalkeeper clean sheet is `gk_minutes > 0 and conceded_while_gk = 0`, a
match-level count, while `gk_clean_minutes` is the finer-grained figure for a shared keeper.
The reducer already computed both; this only stores them.

---

## 019 — Jersey numbers are assigned by the coach, not chosen by the player
**2026-09-23** · accepted

A player edits their own preferred positions and declares their own injuries, but not their
number. `can()` keeps the number under `member:update`, a coach permission.

**Why.** A number must be unique among the active squad, so it is an allocation, not a
preference: two players tapping « 10 » on a Tuesday evening would race for it, and the loser
would get a refusal for a reason they cannot see. The coach is also the one holding the shirts.
This is the difference between the self-scoped permissions and this one — there is no
`profile:editNumber`.

**Consequences.** The profile page shows the number read-only to its owner, with « Les numéros
sont attribués par le coach » so the absence of a field is not read as a bug. `updateJerseyNumber`
wraps `updateMember` rather than writing the column itself, so the uniqueness check lives in one
place. If the owner later wants players to pick their own, this needs a new self action plus a
clash message, not a relaxed check.

---

## 020 — Training attendance has three states, and « non jugé » stores nothing
**2026-09-23** · accepted

The coach's attendance list offers `présent` / `absent` / `—`. The third writes no row, and
choosing it for somebody who already has one deletes it. Availability (declared in advance by
the player) and attendance (recorded on the day by the coach) stay separate columns.

**Why.** "Nobody marked this player" is not the same fact as "this player was absent", and the
attendance rate in M5 is `present / marked`, not `present / squad`. Storing an unmarked player as
absent would punish them for the coach's phone dying, and a nullable boolean would give the same
row two meanings.

**Consequences.** `training_attendance` has a row only for a judged player, so the whole squad
travels in one submit and an unset value is a delete. A rate is only meaningful over marked
sessions, which the stats screens must say out loud.

---

## 021 — The rating gate applies to season averages too
**2026-09-23** · accepted

Decision 007 hides a match's ratings from a player who has not yet submitted their own. That
gate is enforced season-wide: a viewer who *could* have rated a match and did not sees nothing
from it in any average, anywhere. A supporter, a non-playing coach or a later joiner — anybody
who never had a card to fill — sees everything. The screens state how many matches are withheld
and why.

**Why.** A per-match gate that a season average leaks through is not a gate. Averaging six
matches and showing the number would hand back most of the seventh, which is exactly the
anchoring decision 007 exists to prevent. Saying nothing at all would be worse in the other
direction: a masked average is indistinguishable from a missing one, and a player would read it
as a bug.

**Consequences.** `lib/stats/ratings.ts` owns the gate and `lib/rating/` must not re-derive it.
**M6 must submit a player's whole set of ratings atomically** — if rating one teammate commits a
row, that player has "submitted" and the averages unlock early. The masked count is displayed,
not hidden.

---

## 022 — An appearance is a minute played, and live matches are out of the season totals
**2026-09-23** · accepted

A match counts as played for somebody when their recorded minutes are greater than zero, not
when they were on a sheet. Selections (titulaire / remplaçant / supporter) come from
`match_squad` and are counted separately; *gardien* is not a sheet role at all but
`gk_minutes > 0`. A match with status `live` contributes to nothing.

**Why.** `match_player_stats` stores whole minutes, so `minutes > 0` is the only definition that
reads identically whether a figure came from the cache or from replaying the log — and the two
paths agreeing is the property the whole cache design rests on. In 7-a-side the gloves move
mid-match, so a keeper appearance has to be derived from time in goal. A live match's minutes are
still moving, so including it would change a season total between two refreshes of the same page.

**Consequences.** A thirty-second cameo is a selection, not an appearance, and the screens say
which of the two they are showing. A player nobody ever selected gets dashes rather than zeros —
never-selected is not the same fact as scored-none — while a named substitute who stayed on the
bench gets honest zeros. The stats screen states that live matches are excluded.

---

## 023 — A rating, once submitted, is final; a partial set is kept
**2026-09-23** · accepted

`submitRatings` inserts with `on conflict do nothing`. There is no update path: a score and its
comment cannot be changed once they are in. You may, however, submit your set in pieces — four
teammates in the car, the rest at home — and only a **complete** set unlocks the results.

**Why.** Editable notes would reopen the hole that decision 007 exists to close: rate everybody 5,
read the averages, then go back and adjust. Finality also makes a retried POST free, which matters
on the coach journey home with one bar of signal. Refusing partial sets instead would cost more
than it buys — a player interrupted at teammate four would have to start again, and would not.

**Consequences.** The flow says plainly that a note cannot be changed, so finality is a stated rule
and not a surprise. Inserts are idempotent per `(match, rater, rated)`, which the unique constraint
already guaranteed. M5's season averages depend on the *whole* set arriving before anything
unlocks, which is why the write is atomic (decision 021).

---

## 024 — The rating gate has two edges: no set to fill means no gate, and never filling it means never seeing
**2026-09-23** · accepted

Somebody who could not rate at all — a player who was not on the match sheet, a coach who did not
play — sees the results immediately. Somebody who could rate and never did never sees that match's
ratings, and the window closing does not release them.

**Why.** The gate exists to stop copying and anchoring, and neither is possible for a person with
no card to fill; gating them would be a permanent lock-out for no benefit, since they have nothing
to submit. At the other edge, unlocking at the window's close would turn the whole thing into a
waiting game: say nothing for a week and read everyone's notes on Sunday, which is precisely the
free ride the gate is for.

**Consequences.** The refusal text states which of the two cases the reader is in, because
« tu ne peux pas voir » without a reason reads as a bug. The visibility rule lives in
`lib/rating/progress.ts`; nothing else may re-derive it.

---

## 025 — Man of the match needs two ratings, and a tie is shared
**2026-09-23** · accepted

The derived man of the match requires at least two ratings; ties name every winner. The ranked
ratings list applies **no** minimum and shows each player's rating count alongside their average.

**Why.** One teammate's 9 is an opinion, not a verdict, and a single-rating winner would discredit
the award the first time it happened. Breaking a tie would mean inventing a tiebreaker the players
never agreed to. The list is a different object from the award: hiding a 9,0 on one note would be
dishonest, and printing the count is enough for a reader to judge it — which is also why M5's
top-rated chart uses its own, higher threshold for a season-long claim.

**Consequences.** A match with fewer than two ratings shows « pas encore assez de notes » rather
than a winner. Averages are compared by exact integer cross-multiplication, so a tie is a real tie
and not a floating-point artefact.

## 026 — Compositions and the match sheet are coach-only screens
**2026-09-23** · accepted

`/match/[id]/feuille` and every `/match/[id]/composition*` route return 404 for a non-coach, and a
player's match page renders no composition card at all.

**Why.** `docs/PLAN.md` screen 3 makes selection and compositions the coach's job, and the squad
already sees what concerns it: the availability grid. A half-made Thursday lineup visible to twelve
players is an argument the coach has to answer before he has finished thinking, and a benched player
reading « remplaçant » from a draft he was never meant to see is worse than reading it from a coach.
A 404 rather than a 403 also means the routes do not advertise their own existence.

**Consequences.** There is no read-only composition view for players yet. The natural place for one
is the finished-match recap, where the lineup is a fact rather than a plan, and the ghost-disc
`LineupPitch` already renders it with no JavaScript.

## 027 — A dragged slot is retyped to the nearest canonical position
**2026-09-23** · accepted

When the coach drags a slot in « Postes » mode, the slot's `position_code` is reassigned to the
nearest canonical outfield position for its new coordinates. The goalkeeper slot cannot be moved.

**Why.** The reference `positions` set exists so that « Julien prefers AT » means something in every
formation (`docs/DATA_MODEL.md`). A slot dragged from midfield into attack while still carrying `MC`
would silently break that: the editor would highlight the wrong players, and the reducer would count
a striker's minutes as a midfielder's. Retyping keeps the code and the coordinates telling the same
story. The keeper is pinned because a goal that moves is not a 7-a-side formation, and because
`gk_minutes` is derived from which slot is the goal.

**Consequences.** A custom shape is named from its own geometry (`shapeLabel` → « Perso 1-3-2-1 »),
and a hand-drawn shape that matches one of the team's existing formations reuses it instead of
forking a duplicate. Two identical formations under different names would make the season's
formation statistics meaningless.

## 028 — Only an unfinished lineup blocks a save; everything else is a warning
**2026-09-23** · accepted

`saveLineup` refuses exactly two problems: fewer than seven players placed, and nobody in goal.
Off-sheet, supporter, injured and unknown-member are shown as warnings and saved anyway.

**Why.** A coach plans Thursday for Sunday, when half the answers are still missing. A tool that
refuses the plan because Momo has not yet tapped « dispo » is a tool he abandons for a screenshot of
a notes app — which is the situation this project exists to replace. The two hard rules are the ones
that make the lineup meaningless rather than merely provisional, and both are things the reducer
would otherwise have to guess at.

**Consequences.** Dropping a player from the sheet clears him from **planned** lineups only; a
player already fielded in a confirmed composition cannot be removed from the sheet, since that would
rewrite a fact. The sheet itself is frozen once the match is `finished`.

## 029 — Game mode posts to a route handler, never a Server Action
**2026-09-23** · accepted

Every game-mode action is POSTed to `app/api/match-events/route.ts` from the outbox. Server Actions
are used everywhere else in the app; here they are not used at all.

**Why.** A queue needs something it can retry, and an HTTP status is a contract a queue can act on:
**200** drop the entry, **4xx** never retry and show the coach, **5xx** keep it and back off. A
Server Action invoked from a phone with no signal gives back a framework-shaped failure that the
queue cannot classify — and reaching one from a background flush, outside a React render, is not
something the framework promises at all.

**Consequences.** The route handler stays thin: session, parse, delegate to `lib/match/append.ts`.
The screen never writes to the database directly, which is also why the optimistic state is the
local queue merged into the server log by `reduceLive` rather than a second source of truth.

## 030 — The outbox is strictly FIFO per match, and a refused action is isolated
**2026-09-23** · accepted

The queue flushes in device order and a younger action never overtakes an older one's backoff. On a
4xx the batch is split until the poisoned action is identified; it lands in « Actions refusées » with
« Réessayer » / « Ignorer » and the rest of the queue keeps flowing.

**Why.** `seq` is what breaks the reducer's ties (`docs/DATA_MODEL.md`), and it is assigned on
arrival. A 55ᵉ-minute position change that arrives after the substitution completing it would reduce
to a different match. FIFO is therefore not a nicety, it is what makes the log mean what the coach
did. But one rejected action must not take the afternoon with it: a match is 60 minutes long and the
coach cannot debug a queue on the touchline, so the poison is isolated and named rather than left to
block everything behind it.

**Consequences.** Throughput is capped at one in-flight batch per match, which is irrelevant at the
scale of one operator. The split-on-4xx is why `prepareEventBatch` is pure and tested on its own.

## 031 — An action is stamped at the tap that opened it
**2026-09-23** · accepted

`occurred_at` and `clock_ms` are captured on the device when the flow opens, not when the last
question is answered.

**Why.** « But » belongs to the minute the ball crossed the line, not the minute the coach finished
scrolling for a scorer's name. Stamping at the end would make the recorded minute a measure of how
fast the coach types, and the timeline is the one thing everybody rereads on Sunday evening.

**Consequences.** The device clock is authoritative for the match minute, which is what lets an
event queued offline land at the right minute hours later. `recorded_at` is the server's own view and
is kept for audit, never for display.

## 032 — No drag-and-drop in game mode
**2026-09-23** · accepted

Substitutions, position changes and the ad-hoc composition are explicit lists — native `<select>` per
slot in the composer. `PitchLayout` is read-only inside game mode, and the planned-composition prompt
is a card rather than a modal, whose « Plus tard » writes nothing.

**Why.** Dragging a disc on a phone held one-handed at 78 minutes is how you lose a player. The same
gesture that is right on Thursday's planning screen — deliberate, two hands, a table — is wrong at
the touchline, and M3's editor already owns the planning case (decision 026). A dialog that appears
over the pitch at 45' is a dialog dismissed by accident, and the thing dismissed would be the
composition the coach spent Thursday on.

**Consequences.** TERRAIN, the fast multi-player change, stays open as a roadmap line and should
compose M3's editor rather than reimplement it. The final whistle and every annulment use a
**non-dismissible** sheet — no Escape, no scrim tap, no close cross, two buttons — because those two
are irreversible in a way a substitution is not.

## 033 — Game mode is open to everybody, read-only for anyone but the operator
**2026-09-23** · accepted

Any member may open `/match/[id]/jeu`. A non-operator sees the same screen with « Vous suivez le
match en direct. Seul l'opérateur du match peut enregistrer les actions. », no ACTION bar, no
« Annuler », no « Composition ». ACTION is disabled before kick-off and after the final whistle, and
the starting XI is reachable through a separate « Composition » button so the big button never means
two things.

**Why.** Following the score from the touchline, or from home, is a legitimate use of the app and the
data is the team's own. `can()` decides what may be *written*; hiding the read would only push people
back to asking on WhatsApp. This is invariant 4 exactly: one permission helper, no ad-hoc check.

**Consequences.** The match page links to game mode for every member and for a finished match, where
it reads « Voir le déroulé ».

## 034 — A stale `matches.status` self-heals when game mode opens
**2026-09-23** · accepted

Opening game mode on a match whose log contains a final whistle but whose row still says `live` calls
`finalizeMatchById`, then renders the finished screen.

**Why.** It is what a device that died between the POST and its response leaves behind, and the coach
should not have to know that. The freeze is idempotent by construction (decision below), so healing
costs nothing.

**Consequences.** `match_player_stats` is frozen by a wholesale delete and insert, never an
increment: re-running the whistle, healing a stale row, or amending a match in M7 all produce the
identical table, and a player whose only appearance was voided disappears from the cache instead of
lingering at zero.

## 035 — The prompt's injury flags merge the roster, not just the log
**2026-09-23** · accepted

`lib/match/presenter.ts` merges `team_members` injuries into the planned-composition prompt's flags.
When the reducer and the roster disagree about *why* a player is flagged, the reducer's reason wins.

**Why.** `reduceMatch` is pure and sees only this match's log, so it can only know about an injury
that happened during the match. An injury declared on Tuesday is invisible to it — and that is the
common case for a plan made on Thursday. Rather than let the reducer read the roster, which would
cost it its purity and with it invariant 2, the presenter does the merge. The reducer's reason wins
because an injury that happened ten minutes ago is more informative than one declared last week.

**Consequences.** Invariant 2 is untouched: the reducer still takes only events. The merge is tested
in `presenter.test.ts` from fixtures.

## 036 — A goal may be recorded without a scorer
**2026-09-23** · accepted

The ACTION flow allows « Buteur inconnu » and « Aucune passe décisive ».

**Why.** The score is never held hostage to a name. In 7-a-side the ball goes in off three players in
a scramble and nobody agrees who touched it last; a tool that refuses the goal until somebody is
blamed for it records the wrong score, which is the one number that must be right. This extends
decisions 013 and 017 into the live flow.

**Consequences.** `GOAL_FOR.scorerId` is optional and the goal still counts in the score; it simply
adds to nobody's tally. The timeline reads « But 58' » with no name.

## 037 — The demo season contains one instance of every edge case, with its expected figures
**2026-09-23** · accepted

`db/seed.ts` deliberately seeds a defeat, a draw, a keeper swapped at half time, an unattributed
goal, a finished match with an empty log, a supporter on a sheet, a departed player who scored,
voided events, and rating sets that are complete, partial and insufficient. Above each fixture, a
comment states the figures it should produce.

**Why.** The previous seed was two identical logs, so every screen looked correct against it and a
regression in an edge case would only surface on a real Sunday, in front of the team. A fixture whose
expected numbers are written down turns « does this screen look plausible? » into « does this screen
match? », which is a question a human can answer in five seconds and an agent can answer at all.

**Consequences.** Every match is written the way the app writes one — squad, composition,
append-only log — and frozen through `finalizeMatchById`; not one `match_player_stats` row is
hand-written, and `seedPlayedMatch` throws if the freeze does not happen. The fixtures therefore
cannot drift from the reducer. The season is 4 V / 1 N / 1 D, 13–10, minutes 2520 = 6 × 420, and
those totals are as much a test as the unit suite is.

## 038 — A finished match with an empty log is seeded by writing the status directly
**2026-09-23** · accepted

`finalizeMatch` refuses to freeze, and refuses to touch `matches.status`, without a `FINAL_WHISTLE`.
The empty-log fixture therefore writes `status: 'finished'` itself. It is the only place in the
codebase where a match is closed outside the freeze path, and the seed asserts that no
`match_player_stats` row was created.

**Why.** « Finished with nothing recorded » is a real state — the phone died, or nobody ran game mode
— and it is *not* 0-0 (aggregate rule 7, decision 013). It has to be reachable in the fixtures, and
the freeze path is right to refuse it: freezing a log with no final whistle would invent a result.

**Consequences.** This is the fixture that exposed a defect in the recap's scoreboard, which renders
such a match as « 0 – 0 » with an « en cours » badge. Being able to *see* the state was the point.

## 039 — A supporter is on the sheet, rates nobody, and may read the results
**2026-09-23** · accepted

A supporter appears in `match_squad` with `role = 'supporter'`. They are never rated and never rate,
and because they had no set to submit, the rating gate classifies them `not-a-rater` and shows them
the notes.

**Why.** Being on the sheet is the record of having been there, which is what the attendance and
appearance counts are about (decision 022). But decision 007's gate exists to stop copying and
anchoring among the people whose notes are being compared, and someone who owes no note can neither
copy nor anchor — withholding the results from them would punish them for not having played.

**Consequences.** A supporter counts as an appearance with zero minutes, never as a *gardien*, and
never appears in a rating average. The notation screen currently tells them « Tu n'étais pas sur la
feuille de match », which is false — the reason is right, the sentence is not, and it is fixed
separately.

## 040 — A departed member keeps the sessions they were marked at
**2026-09-23** · accepted

Training attendance rows are never deleted when a member leaves: sessions before their `left_at` keep
mentioning them, sessions after it never do.

**Why.** Attendance is a record of a session, not a property of a current squad member, and the rate
is `présent / marqué` over the sessions a player was actually judged at (decision 020). Removing the
rows would silently rewrite the history of sessions that happened, and would make last season's
attendance rate change as people leave.

**Consequences.** Same reasoning as the season scorer table keeping a departed scorer: `lib/stats/`
deliberately reads every membership, including those with `left_at` set.

The same applies to a **match sheet**, and it took a fix: `getLiveMatch` built its roster from
`getSquad`, which hides departed members, and `reduceLive` takes the reducer's squad from that roster
— so re-freezing a match a since-departed player had started wrote his cached row with
`squad_role = null`. `lib/match/live.ts` now unions the departed members of *that sheet* into the
roster. A cache that disagrees with a recomputation of the same log is the one thing
`match_player_stats` may never be, and M7's amendments re-freeze finished matches by design.

## 041 — A match with an empty log reads « ? – ? », never « 0 – 0 »
**2026-09-23** · accepted

The recap has three states, and the row's `status` is what tells them apart:

| State | Score | Badge | Rest of the screen |
|---|---|---|---|
| `live` | the running score | « en cours » | timeline as it grows |
| `finished`, log non-empty | the score | the result, in words | everything |
| `finished`, log empty | « ? – ? » | « rien saisi » | no minutes table |

`MatchRecap.recorded` (« the log holds at least one event ») carries the distinction out of
`lib/rating/recap.ts`, and `Scoreboard` takes the `status` as a prop because the reducer cannot know
a match is over when no final whistle was ever logged.

**Why.** « 0 – 0 » is a result; an empty log is an absence of information, and the two must not look
alike (this is rule 7 of `lib/stats/aggregate.ts`, which already counts such a match apart, applied to
the screen). The old recap printed « 0 – 0 » under a red « en cours » badge for a match played weeks
earlier — wrong twice over, and exactly the kind of thing a coach would have reported as "the app lost
my match".

**Consequences.** The minutes table is hidden rather than listing every man on the sheet as « non
entré » at 0’: on an unrecorded match that is not « he did not come on » but « nobody knows », and the
scoreboard has already said so. This state is also the one that offers M7's retro-entry: a coach who
lands on « rien saisi » from the calendar gets « Saisir le match » on the spot.

## 042 — The recap states a gap rather than leaving a blank
**2026-09-23** · accepted

Three places where the honest answer is "we do not know", each of which now says so in French rather
than rendering something that reads as a bug:

- a goal with no scorer (decision 036) shows « But 14’ · buteur non renseigné »;
- a supporter on the sheet is told « Tu étais supporter sur ce match », not « Tu n'étais pas sur la
  feuille de match » — the false sentence decision 039 flagged;
- a supporter in the minutes table is badged « supporter », not « non entré », and sorts below the
  unused substitutes: one was an option the coach did not use, the other was never an option.

**Why.** Every one of these was found by reading the demo season the fixtures of decision 037 now
build. A blank field makes the reader doubt the whole screen; a stated gap makes them doubt only the
gap, which is the truth.

## 043 — The end-to-end suite drives `localhost`, never `127.0.0.1`
**2026-09-23** · accepted

Playwright's `baseURL` is `http://localhost:3000`. `http://127.0.0.1:3000` is forbidden, in the suite
and by hand.

**Why.** Next 16's dev server treats `127.0.0.1` as a foreign origin and blocks its own dev resources
(`⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr`). The client bundle never finishes
wiring itself up, so **the page never hydrates** — and nothing looks broken, because the
server-rendered HTML and the plain-`<form>` Server Actions both still work. The symptom is not a blank
screen: it is a suite that quietly tests the no-JavaScript fallbacks forever. That was the first
failure of this slice, diagnosed by finding no `__reactFiber$…` key on any element and
`AvailabilityControl`'s « Valider ma réponse » fallback still on screen after twenty seconds.

**Consequences.** `playwright.config.ts` says so in a comment at the constant, and the spec asserts the
fallback button is *gone* before its first tap, so a regression fails loudly instead of passing
hollowly. `allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts` would be the other fix; it was not
taken, because one address that always works beats two that sometimes do. Note this only affects
`next dev` — the screenshot scripts that log in against `127.0.0.1` with a forged cookie read
server-rendered HTML and are unaffected.

## 044 — The end-to-end suite owns its fixture team; CI runs it apart from `npm test`
**2026-09-23** · accepted

`e2e/` never imports `db/seed.ts` and never assumes the demo season. Each run provisions its own team
`e2e-<runId>` with a non-playing coach and eight players, and creates everything else — the match, the
availability answers, the sheet, both compositions, every event, the ratings — **through the UI**.
Repeatability comes from pruning (`teams` whose slug starts with `e2e-`, then the matching `users`),
never from truncation; reference data is ensured, never re-created.

**Why.** The demo season is a *reading* fixture: it exists so a human can look at the app, and it
changes whenever a slice needs a new situation to look at (decision 037). A suite pinned to it would
break every time it improved, and a suite that mutated it would destroy the thing it is for. Driving
the UI rather than the database is also the point: an assertion that the score reads « 1 – 1 » is only
worth making if a coach's taps are what put it there.

**Consequences.** `npm test` stays Vitest-only, as `CLAUDE.md` says, and `.github/workflows/ci.yml`
keeps the two apart: `typecheck · lint · vitest` on one job, and the browser run — which needs
Postgres, the committed migrations and a production build — on another, so a browser flake can never
block the fast checks. `npm run test:e2e` locally reuses a dev server if one is up; CI overrides the
command with `next start` on a built app via `E2E_WEB_SERVER`.

## 045 — TERRAIN is the one place in game mode that drags, because the gesture writes nothing
**2026-09-23** · accepted · amends 032

Decision 032 stands for every action in game mode except one. TERRAIN opens a full-pitch editor where
the coach rearranges as many players as he likes by dragging them, and **nothing is written until he
taps « Valider »**. Every gesture has a tap-then-tap equivalent and a keyboard equivalent; a drop on
empty grass is a deliberate no-op; taking a player off is a labelled button, never a gesture. One tap
on « Composer par liste » reaches the list composer for a coach who cannot drag.

**Why.** 032 objects to a mis-drag at 78′ that silently appends an event, and it is right. TERRAIN does
not have that failure mode: the drag arranges a proposal, the confirmation writes it, and the two are
separated by a sheet that cannot be dismissed by Escape or by a tap on the scrim. And the thing TERRAIN
exists for cannot be expressed in lists without paying three times: swapping two players and moving a
third was three flows and three confirmations, which is three chances to be interrupted halfway and
leave the pitch in a state the coach never intended.

**Consequences.** The gesture code is duplicated between the composition editor and TERRAIN (~80 lines)
until a `usePitchDrag` hook is extracted into `components/pitch/`. *(Done — see 055.)* A single
substitution keeps its list
flow: TERRAIN is for the deliberate multi-change, not the routine one. The list composer stays the
guaranteed path and must keep working for anyone who cannot drag. The planned-composition prompt gains
a third answer, « Ajuster sur le terrain » — invariant 3 is untouched, since it pre-fills and waits
exactly as « Appliquer » does.

## 046 — One confirmation in TERRAIN is one `LINEUP_APPLIED`, not a sequence
**2026-09-23** · accepted

A TERRAIN reshuffle that takes two players off, brings two on and moves a third appends **one** event:
a `LINEUP_APPLIED` carrying the resulting seven, with no `lineupId` (it was nobody's plan). The reducer
derives the ordered departures, arrivals and position changes from it with `diffLineups`, as it already
did for the ad-hoc composer.

**Why.** Invariant 6 is keyed on `client_event_id`: one id per confirmation makes a retry trivially
idempotent, where a sequence of five events flushed by an outbox over a bad 4G bar can land *partly* —
and half a reshuffle is a pitch with eight players or no goalkeeper, which is precisely the state
`checkPitch` exists to forbid. One event also means one `VOID` restores exactly the pre-TERRAIN pitch,
instead of five annulments that must be undone in the right order.

**Consequences.** `describeActorsFr` needed a `LINEUP_APPLIED` branch: the single-actor fallback printed
one arbitrary name, so the timeline hid two thirds of what the coach would open it to check. It now
reads « Sortent : Karim, Ali · Entrent : Momo, Yanis · Change de poste : Léo ».

## 047 — A retro-entered match is an ordinary event log; `entry_mode` is only a label
**2026-09-23** · accepted

« Saisie rétroactive » (`docs/PLAN.md`, screen 8) writes the same event types, through the same
ingestion, as game mode: `KICKOFF · LINEUP_APPLIED · facts and substitutions · PERIOD_END · … ·
FINAL_WHISTLE`. `matches.entry_mode = 'retro'` is set so a screen can say « saisi après le match », and
**nothing reads it to decide anything**.

**Why.** The alternative is a "retro" branch in the reducer, in the recap, in the statistics and in the
ratings — four places where a season table can start disagreeing with itself, and four places where a
bug only shows up on the matches nobody watched being recorded.

**Consequences.** The entry screen never computes a score of its own: it runs the app's own
`reduceMatch` over the log it is about to write and displays that. `submitRetroMatch` then refuses any
log its own reducer reports a blocking anomaly for, so a retro match can never be the reason `/stats`
looks odd. Amendments are not retro-only either — correcting a match recorded live goes through the
same path and leaves `entry_mode` at `live`.

## 048 — The minute of an action is optional; the app stamps what the coach cannot remember
**2026-09-23** · accepted

Three rules, in `lib/retro/log.ts`:

| What has no minute | Where it lands |
|---|---|
| a substitution | the break — the middle of a single-period match |
| a fact attached to a player | the middle of that player's own spell on the pitch, narrowed to the overlap with the assister |
| a fact attached to nobody | the middle of regulation |

**Why.** A coach typing up a match a fortnight later cannot reconstruct a timeline. Making minutes
mandatory means the match never gets entered at all; stamping everything at 0′ produces goals scored by
players who were not yet on the pitch, and the reducer is right to refuse them. The midpoint of a
player's own spell is the only guess that cannot contradict the log it is being written into.

**Consequences.** Order within one stamp is carried by `seq`, so the running score stays monotone. The
form tells the coach how many actions were placed « au mieux ». Minutes played and clean-sheet minutes
are only as good as the substitution minutes, and the screen says so — **the score is exact
regardless**, which is the number the season table is built on.

## 049 — A correction keeps the stamp of what it corrects, and only football facts may be corrected
**2026-09-23** · accepted

An amendment is a `VOID`, a replacement fact, or both — and it carries **its target's** minute, never
the wall clock of the correction. `KICKOFF`, `PERIOD_END`, `FINAL_WHISTLE` and `LINEUP_APPLIED` cannot
be annulled at all: `isAmendableEventType` is a pure exported predicate, asked both by the screen
(whether to offer « Corriger ») and by the action (a crafted POST).

**Why.** Stamping "now" would put a corrected goal after the `FINAL_WHISTLE` and rob everybody of the
clean minutes they played. And those four types are the **frame**: annulling one does not fix a mistake,
it changes what every minute in the log means — proved by crafting the POST and getting a log with a
voided second-half kick-off. Changing how long a match lasted is « Modifier le match », not a
correction.

**Consequences.** A substitution can only be annulled and re-entered, because its two players and its
minute are one fact. The `VOID` carrying its target's stamp is what makes the two lines sit together in
the timeline. Every amendment is previewed through `reduceMatch` before it is written, which is how
« Ce joueur n'était pas sur le terrain à cette minute. » can be refused — and how voiding a
substitution whose substitute had scored is refused too.

## 050 — Retro-entry and corrections are `match:amend`, coach-only
**2026-09-23** · accepted

Game mode's operator may be a delegate for the afternoon (decision 004). Typing a match up, or
rewriting it days later, is the coach's. No change to `lib/auth/can.ts` was needed — `match:amend`
already existed and already answered this way.

**Why.** The two are different acts. Recording what is happening in front of you is a job you hand to
whoever is holding the phone; rewriting a match that is already in the season table is not.

## 051 — Submission ids are derived from content, never drawn at random
**2026-09-23** · accepted

`retroSubmissionId(retroEntrySeed(matchId, sheet))` for an entry, and
`(matchId, intent, targetEventId, fact…)` for a correction; every `client_event_id` follows from it by
index.

**Why.** A random id minted in a client component is a hydration mismatch, and it does not survive a
bfcache restore or a browser replaying a POST — which are exactly the cases invariant 6 exists for. Row
keys are deliberately excluded from the seed, so deleting a row and re-adding it identically is the
same submission.

**Consequences.** The second tap on « Enregistrer » is answered as the success it is — a redirect — and
not as an error. The replay check must therefore run **before** « cette action est déjà annulée »: after
a correction succeeds, its target is precisely that.

## 052 — A new instance is bootstrapped from the command line, and creates its first team in the app
**2026-09-23** · accepted

`npm run db:bootstrap` (`db/bootstrap.ts`) writes the reference data and **one** super-admin account,
from `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`. Everything after that happens in the browser: the
super admin creates the first team from `/rejoindre`, then invites the squad the ordinary way.

**Why.** Signing up is invite-only (decision 008) and invites are issued by a coach, so a fresh database
was a closed loop: no coach, therefore no code, therefore no account, therefore no coach. The super
admin used to be created by `npm run db:seed`, which refuses to run with `NODE_ENV=production` and
should — its demo team would land in the real season's statistics. So the deployment described in
`docs/ROADMAP.md` would have produced a site nobody could log into, including its owner.

The one account is created by a script rather than by a « first user becomes admin » screen because that
screen is a race: the window between the first deploy and the owner's first visit is a window in which a
stranger becomes administrator of the instance.

**Consequences.** Reference seeding moved to `db/seed-reference.ts`, imported by both `db/seed.ts` and
`db/bootstrap.ts` — `db/seed.ts` runs `main()` as it loads, so importing it to reuse one function would
have seeded a demo season as a side effect of asking for the positions table.

`db:bootstrap` is idempotent, and re-running it resets the password: it is the recovery path for the one
account that has no coach to ask. It refuses a password under `PASSWORD_MIN_LENGTH`, and refuses the
`change-me` the demo seed defaults to.

Two holes behind the same door were closed with it. `createTeam` had existed since M0 with **no UI at
all**, and a user with no team is sent by invariant 5 to `/rejoindre` and nowhere else — so the form now
lives on that screen, shown to a super admin, and `createTeam` redirects into the app the way the join
actions do instead of leaving the coach on the page he had just submitted. `updateTeam` had no UI
either, which meant the club colours that the kit discs are drawn in (decision 011) could be set at
creation and never again; `/equipe` now carries « Réglages de l'équipe ».

## 053 — The match sheet records the coach's intention; the log records what happened. Neither corrects the other
**2026-09-23** · accepted

`match_squad.role` — titulaire / remplaçant / supporter — is what the coach wrote before the match, and it
is **never rewritten** afterwards, by game mode or by a retro entry. Whether a player actually started,
came on, or never left the bench is derived from `match_events` alone (`PlayerMatchState.startedMatch`,
`playedMatch`, `minutes`).

**Why.** They are different facts and both are worth keeping. "I was named a substitute and ended up
playing the whole match" is a true sentence about a season, and it is only expressible if the sheet still
says substitute. Overwriting the sheet to agree with the log would also make the selection unauditable:
the coach's own list of who he picked would silently rearrange itself after every match, which is exactly
the property invariant 1 protects the event log from.

**Consequences, and the rule for every screen.** A screen must take each fact from its own source, and
this is the trap: the sheet is easier to reach, so it gets used to answer questions it cannot answer.

- Selections — « 7 titulaires, 2 remplaçants », the season's `appearances.starter` — come from the sheet.
  `lib/stats/aggregate.ts` rule 4 already says so.
- Anything about what happened — minutes, who started, who came on — comes from the log, through the
  reducer.

`lib/rating/progress.ts` had the defect that named this decision: the notation card showed « entré en jeu »
to every player listed as a substitute, so the unused substitute — the commonest kind in an amateur squad
— was announced as having come on, to his whole team, at the moment they were rating him. It now shows
« 42’ » or « non entré » from his minutes, and nothing at all when the match has no log to read, since
« non entré » about events that do not exist is the same invention as « 0 – 0 » for their score
(decision 013).

The retro path is therefore correct as it stands: a listed substitute who actually started keeps
`squad_role = 'substitute'`, and every screen that cares whether he started asks the log.

## 054 — The club crest is re-encoded in the browser and stored in the row as a `data:` URL
**2026-09-23** · accepted

`teams.crest_url` has existed since M0 and nothing could write it, because uploading a file needs
somewhere to put it and this app has no object store. Rather than add one, the crest is shrunk to at most
**96 px on its long side** in the coach's own browser (`lib/team/crest.ts`, `app/(app)/equipe/crest-field.tsx`)
and posted as a `data:image/png` or `data:image/jpeg` URL that goes straight into the column.

**Why not a bucket.** Vercel Blob or S3 would mean a second service to provision, a second set of
credentials in `docs/DEPLOY.md`, a lifecycle to think about (what happens to the old crest when the coach
changes it), and a signed-upload round trip — all for **one image per team**, a value that changes perhaps
once a year. The whole project is one Postgres and one Next app on purpose; a 20 KB string is a smaller
price than a third moving part.

**Why 96 px, and why a ceiling at all.** `lib/auth/dal.ts` reads the team row on **every authenticated
request** to build the shell, so the crest is not a column that is read when someone visits a gallery: it
is on the hot path of every page in the app. 96 px is twice the 40 px the header draws it at, which covers
a 3× phone screen, and it lands under ~24 KB of base64 for anything that looks like a crest.
`CREST_MAX_CHARS = 32_000` is the hard stop the Server Action enforces, and the client tries PNG first,
then JPEG on white, then refuses with a message rather than silently storing something huge.

**Consequences.**

- The resizing is the client's job, so a 4 MB phone photograph never crosses the wire, and the preview
  the coach sees before saving is the **re-encoded** image — a crest that came out badly is visible
  before « Enregistrer », not afterwards in the header.
- The server trusts nothing but a string it can validate with a regular expression
  (`crestDataUrlSchema`). Only `image/png` and `image/jpeg` are accepted: the value is rendered as the
  `src` of an `<img>`, and `data:image/svg+xml` is the one shape of it that can carry markup, so it is
  refused at the boundary instead of reasoned about downstream.
- The field is three-state — `""` keep, `"none"` remove, a data URL replace — mapping to Drizzle's
  `undefined` / `null` / value. A two-state field would mean renaming the team cost it its crest.
- `next/image` has nothing to do with a `data:` URL: no host to allow, nothing to optimise. The two
  `<img>` elements keep their eslint exception, now for that reason rather than the stale « arbitrary
  URL per club » one.
- If a team ever needs a large crest, or if the app grows a photo of anything, that is when an object
  store is worth adding — and this decision is what it supersedes.

## 055 — The drag gesture is a pure state machine in `lib/`, and only the answer differs per screen
**2026-09-23** · accepted · discharges the debt named in 045

The pointer-event bookkeeping the composition editor and TERRAIN both need now lives in two places
instead of two copies:

- `lib/pitch/drag.ts` — a pure module, no React and no DOM beyond a measured box: `locate`, `pointOf`,
  `startDrag`, `advanceDrag`, `boxOf`, plus the two constants that encode the judgement calls
  (`TAP_SLOP = 8`, `PITCH_MARGIN_PX = 12`). Twelve unit tests.
- `components/pitch/usePitchDrag.ts` — the React wrapper: pointer capture, the mouse-left-button check,
  the `{ drag, begin, handlers }` handle, and a subject type parameter so each screen carries whatever
  it drags (`{ memberId, fromSlotId }` in TERRAIN, `{ kind, id }` in the editor).

**Why the rules move into `lib/` and the answers do not.** The three rules are the same on both screens
and each of them is a decision somebody could get wrong later: a pointer sequence under 8 px of
Manhattan travel is a **tap**, not a drag; the turf gets a 12 px outer margin so the goalkeeper's slot
is reachable with a thumb; and *off the turf is a distinct answer*, not a clamped point — `fromClientPoint`
clamps, so `inside` has to be carried separately or a drop on the bench silently becomes a drop on the
touchline. Vitest runs `environment: "node"`, so anything inside a hook is untestable here; the rules
had to leave React to be tested at all.

What must **not** be shared is what a drop *means*. A drop on empty grass benches a player in the
composition editor and is deliberately a no-op in TERRAIN (045) — the same gesture, two answers, on
purpose. So `onTap`, `onDrop` and the optional `onMove` are callbacks, and the difference stays visible
in each screen's code rather than hidden behind a flag in a shared hook.

**Consequences.**

- The caller owns the pitch ref and passes it in. A hook that *returned* a ref would make every other
  property of the returned object a ref value in the eyes of `react-hooks/refs`, and `gesture.drag` is
  read on every render to draw the lifted disc — 14 lint errors said so before the ref was inverted.
- `onMove` exists for the editor's `postes` mode alone: the dragged slot follows the finger and the
  formation label recomputes live (`1-3-2-1` → `1-3-1-2` while the finger is still down). TERRAIN does
  not pass it, because a match never changes shape by gesture.
- Both callers lost ~80 lines each and the next drag surface gets the rules for free.

## 056 — A list row reads; administration lives on the thing's own page
**2026-09-23** · accepted

Removing a member from the squad and appointing a coach are per-member actions, and they sit on that
member's page (`/joueur/[id]`), not on their row in `/equipe`. The row is one line for everybody, coach
or not, and the whole of it is a link to the page.

**Why.** They were on the row, and at 390 px « Nommer coach » + « Retirer » took 200 px of a 326 px
line. The only thing left that could shrink was the name, and it did: first names read « Tho… », « Ya… »,
« Fa… », and the injured player's row showed a shirt number, a « blessé » badge and no name at all.
Letting the row wrap fixed the truncation and cost a second line **per player**, so a coach with fourteen
players scrolled twice the list a player scrolls — to reach two buttons he presses about twice a season.
A phone row cannot hold a name, a number, three position codes, two badges and two buttons; something
had to go, and the two rare controls are worth less there than the name is.

**Consequences.**

- Any action on a single member goes on that member's page. If a future control genuinely belongs in the
  list — something applied to *many* members at once, like marking training attendance — that is a
  different shape (a toggle list), not a button per row.
- A Server Action invoked from the page of the thing it deletes must `redirect` somewhere that still
  exists: `removeMember` ends on `/equipe`, because the page that called it is a 404 afterwards.
- A coach needs telling where the controls went, since the row no longer shows them. The « Effectif »
  card carries a coach-only line saying a player's row is the way to their number, posts, role and
  injuries. A player is shown no such line: for them nothing moved.
- « A team keeps one coach » had to become shared, not duplicated: the page decides whether to render
  the controls and both actions still refuse the case, so all three ask `wouldLeaveNoCoach`
  (`lib/team/coaches.ts`, pure, tested). The last coach gets the sentence instead of the buttons, which
  is what the previous slice established and this one keeps.

## 057 — A refresh is a network read: never on a tap that did not reach the server
**2026-09-23** · accepted · found by the offline check `docs/PLAN.md` asked for

`emit` in game mode ends with `router.refresh()`, and it now does so **only if the action reached the
server** (`outbox.state().online`). The catch-up for actions that sync later is wired to the queue
draining instead: the first flush that succeeds after a network failure refreshes once.

**Why.** Offline, `router.refresh()` is not a no-op and it does not fail quietly. The RSC request
fails, and Next's recovery is to **fall back to a full browser navigation** — which offline lands on
the browser's error page. So the first action of a match played on a pitch with no signal blanked game
mode, threw away the client state that was holding the optimistic score, and left the coach unable to
reload his way back in until coverage returned. The queue had done its job perfectly; the screen threw
the match away anyway.

This is the whole reason `docs/PLAN.md` asked for the offline walk by hand. Eighteen unit tests cover
the outbox's policy against an injected transport, and every one of them passed throughout: the bug
was not in the queue but in what the screen did *after* the queue said « kept, not sent ».

**Consequences.**

- The rule generalises past this one call site: in game mode, a network read is only worth making when
  there is reason to believe the network is there. Anything added to `emit` later belongs behind the
  same test.
- Something must still reconcile a queue that drains on its own three-second timer, with nobody
  tapping anything — a coach walking back into coverage at half time. That is `owedARefresh` in the
  subscription: set when a flush fails, cleared with one `router.refresh()` when the queue is empty and
  online again. One refresh per outage, not one per action.
- `e2e/offline.spec.ts` is now the test for all of it, because none of it can be tested in Vitest:
  `environment: "node"`, and this is a hook in a client component talking to a real route handler.
- A fixed clock (`page.clock.setFixedTime`) can never reach the end of a backoff, so that spec provokes
  the retry with an `online` event rather than by moving time. Worth knowing before writing the next
  test that touches the queue.

## 058 — Every dead end is in French, and the one in game mode says the queue is safe
**2026-09-23** · accepted · found by a 390 px walk of screens nothing had looked at

The app now owns its failure screens: `app/not-found.tsx`, `app/(app)/not-found.tsx`, `app/error.tsx`,
`app/(app)/error.tsx`, and `app/(app)/match/[id]/jeu/error.tsx`. There is deliberately **no**
`global-error.tsx`.

**Why.** Fifteen pages call `notFound()` and nothing caught any of them, so every one landed the user
on Next's built-in page: « This page could not be found. » — English, in an app whose first rule is
that the UI is French and the code is English, never mixed. And there was no error boundary of any kind
anywhere in the tree, so one failing query took the whole screen. Neither failure mode was visible to a
test; both were visible immediately at 390 px.

**Consequences.**

- **Two not-found pages, for the copy and not for the chrome.** Next keeps the layouts that matched, so
  the root file renders inside the shell — verified by removing the other one. What differs is what is
  true: « cette adresse ne correspond à aucun écran » fits a typo, and not a coach-only screen a player
  asked for. Most of the fifteen calls are the second kind, which is why the in-app page says « la page
  n'existe pas, ou elle est réservée aux coachs » — it must cover both without resolving which, because
  answering `notFound()` instead of 403 is exactly how those screens avoid confirming a match exists.
- **Two error boundaries, because one cannot catch its own layout.** An error in `app/(app)/layout.tsx`
  — which is where `requireTeamContext()` talks to the database — is caught by the *parent* boundary.
  That is not hypothetical: it is what a Neon connection limit looks like, and it takes the header and
  the tab bar with it. So `app/error.tsx` stands alone and carries its own way back, while
  `app/(app)/error.tsx` only replaces the content and lets the tab bar be the exit.
- **No `global-error.tsx`.** It could only fire on a failure of the root layout, which holds no data and
  awaits nothing. An unreachable screen cannot be verified at 390 px in both themes, and this project
  does not ship screens it has not looked at.
- **The digest is on screen**, as « Code de l'erreur ». In production React replaces a server error's
  message with that hash, and it is the only thing tying what the user saw to a line in the Vercel
  logs — on this project the person reading those logs is the person the app broke in front of.
- **Game mode gets its own boundary, and it is the only one allowed to promise anything.** « Les actions
  déjà validées sont dans la file d'envoi, pas dans cet écran » is true for the same reason a reload at
  78′ is survivable: the outbox writes to IndexedDB *before* it POSTs, and `reset()` remounts, which
  calls `outbox.hydrate()`. The generic boundary says no such thing, because it also catches a render
  that failed just after a Server Action, and whether *that* landed is exactly what is not known.

## 059 — `npm run audit:screens`: the 390 px walk, done by a machine

**Decision.** A script, `scripts/audit-screens.ts`, logs in as a coach and as a non-coach player,
walks 23 screens of the demo season at 390 px in both themes, screenshots each one to `audit/`
(gitignored), and fails on the defects that are mechanical.

**Why.** `CLAUDE.md` says walking the season is the cheapest review tool in the repo, and every defect
found in waves 3 and 4 proves it: each was a screen stating something untrue, and **not one failed a
test**. But the walk itself was being done by hand, which means it was being done rarely. So: the
looking stays human — a screenshot is the only thing that catches « 0 – 0 » on a match nobody
recorded — and the questions a DOM can answer are asked by the script:

- anything the console says, minus a two-entry allow-list where each entry carries the reason it is
  benign (a 404 document logging its own status; React reporting the root layout's theme `<script>`,
  which has already run from the SSR'd HTML and must not run twice);
- a page that scrolls sideways, or a box outside the viewport that **no scroll container owns** — the
  first version reported `/stats`' deliberate `overflow-x-auto` filter strip and had to be taught;
- an English framework string, in an app whose first rule is that the UI is French (decision 058);
- a screen reachable by somebody it is not for, or answering 404 to somebody it is for;
- a page with no level-one heading.

**Not part of `npm run test:e2e`.** That suite owns a run-scoped fixture team and never touches the
demo season (decision 044); this needs a *full* season to have anything to look at.

**The ids are discovered, never written down.** The first version hardcoded the demo match ids.
`npm run db:reset` regenerates them, so the next run walked thirteen 404s and reported a clean sweep.
Everything is now read out of Postgres, and the script refuses to run rather than guess — a review
tool that can pass by looking at nothing is worse than no review tool.

## 060 — What the first run of the audit found, and why each was a real defect

Three findings on its first honest pass, all of the same family: a screen saying something that is
not so.

- **A member who may not operate the match was offered « Appliquer ».** The planned-composition card
  is deliberately shown to everyone — following the plan from the touchline is the point — but only
  `onAdjust` was gated on `canOperate`. Tapping the other button produced a `LINEUP_APPLIED` the route
  handler answered 403 to, so the invitation itself was the bug. `onApply` is now `null` for them and
  the card's one remaining button is « Masquer », not « Plus tard »: « plus tard » would promise them
  something they will not be doing, and the description says the wait is on *the operator's*
  confirmation, not theirs.
- **« Cette composition ne change rien sur le terrain » over a starting seven.** This is the old
  « 7 changements » lie (decision 031) fixed in one direction and reappearing in the other: the
  starting composition has an empty `changes` list on purpose, because seven arrivals are a team sheet
  and not seven substitutions — but an *empty diff* means the same thing, and the card could not tell
  them apart. `pendingLineupChangesFr` in `lib/match/presenter.ts` now does, and says « 7 joueurs
  entrent en jeu. » for the one and « ne change rien » only for the other. It is a function in `lib/`
  rather than a condition in the component because Vitest runs in `node` and cannot reach the
  component — the copy has to live where a test can read it.
- **Two screens had no `h1` at all**: game mode, and the composition editor in each of its four dead
  ends. The second was the worse one — a bare centred panel reading « Cette composition a été
  appliquée » about no match in particular. The editor now renders its header in every state, so the
  page always says which composition of which match, and the panel says only what is wrong with it.
  Game mode gets an `sr-only` heading: every pixel above the pitch is the clock and the score on
  purpose, and a title bar would push the ACTION button down the screen, but a page still needs a
  name. The audit checks for this now, so the class cannot come back.

## 061 — One scoreline, ours first, on every screen
**2026-09-23** · accepted

`scoreLineFr(goalsFor, goalsAgainst)` in `lib/calendar/labels.ts` is the only way the app writes a
score, and it takes **no orientation argument**: our goals come first whether the match was at home or
away. Who was at home is said in words, by `venueSideLabel` and the badges that use it.

**Why.** Two conventions had grown up side by side. The calendar pill and the match page wrote our
goals first — with a docstring saying « never « 1-3 » read the wrong way round » — while both
scoreboards, game mode's and the recap's, put the *home* side first the way a broadcast does. Nobody
had decided this; it was two authors on two days.

Walking the recap of an away win at 390 px is what made the cost visible: the scoreboard read
« CS Morvan — Nous · 0 – 2 » in 60 px numerals, under a green « Victoire » badge, over a timeline that
wrote the same two goals « 1 – 0 » and « 2 – 0 ». One screen, one match, two scorelines, and the big
one handed the win to the opponent. The timeline was not wrong — it had no orientation to be wrong
about, and no names next to it either.

**Why ours and not the home side's.** Broadcast convention is for a league table, where the reader has
no side. This app has exactly one: every number on every screen is about this team. And in game mode
the score is 36 px while the caption naming the sides is 12 px and truncates — so on an away match a
coach reading at arm's length in daylight had to work out which figure was his, at 58’, with the ball
in play. That is the wrong thing to make somebody compute.

**Consequences.** Game mode's scoreboard keeps `isHome` but spends it on a « Dom. » / « Ext. » badge
instead of on reordering the figures, so nothing is lost. The recap's dropped the prop — the match
header already carries « À l'extérieur ». The timeline needed no change at all, which is the sign the
convention was the problem and not the code. `lib/calendar/labels.test.ts` asserts the absence of the
flip, with the reason, so that adding an orientation argument means deleting a test that explains why
not to.

## 062 — An empty pitch is not an empty `lineups`
**2026-09-23** · accepted

Game mode's empty pitch says « Personne n'est encore sur le terrain » when a composition exists, and
keeps « Aucune composition enregistrée » for when one genuinely does not. `emptyPitchFr` in
`lib/match/presenter.ts` decides which, and says whose confirmation is being waited on.

**Why.** The copy was keyed on `state.onPitch.length === 0` alone and claimed something else entirely
— that nothing had been saved. But an empty pitch before kick-off is the normal state of a **properly
prepared** match: invariant 3 means a plan is proposed and never applied on its own, so the pitch stays
empty on purpose until the coach taps « Appliquer ». The screen that exposed it was showing the
composition twenty pixels above the sentence denying it existed.

**Consequences.** The e2e happy path had pinned the old string, at exactly the moment a composition was
saved and proposed — a test encoding the lie rather than catching it. It now asserts the true copy and
that the false one is absent. And like `pendingLineupChangesFr` (decision 060) the function lives in
`lib/` rather than as a condition in JSX, because Vitest runs in `node` and cannot render a client
component: copy this easy to get backwards has to live where a test can read it.

## 063 — A match nobody recorded is offered nothing to read
**2026-09-23** · accepted

For a finished match whose log is empty, the match page does not render the « Mode match » card at
all. And the « Composition » card's badge reads « 4 / 7 titulaires » rather than « 4 / 7 »: it counts
the *sheet*, not the composition it sits on.

**Why.** Both were found by reading `audit/light-coach-match-saisi-apres.png` — the demo season's
finished match with nine men on the sheet and not one event (decision 038's fixture). On that one
screen the app said three things about the same match. « Saisir le match » said, correctly, that it had
been played without the phone. Below it, « Mode match » said « Le match est terminé : le déroulé reste
consultable » under a full-width primary « Voir le déroulé » — offering a record that does not exist,
and prominently. Following the link shows « Rien pour l’instant », which is honest, but a primary
button is a poor way to say nothing happened, and it competes with the card that *is* the next action.
Third, above the « Aucune composition » panel, a green badge read « 7 / 7 ».

The badge was the subtler of the two. It has always counted the players marked `starter` on the match
sheet, which is the useful number when picking a squad — but on a card titled « Composition », above a
panel saying there is none, « 7 / 7 » reads as the composition being complete. `SquadSheet` had
written « titulaires » next to the same figure since M3; the bare one was the odd one out.

**Consequences.** The suppression reuses `score === null`, the same signal the « Saisir le match » card
two cards above already uses, so there is one definition of "not one event was ever recorded" on this
page. Nothing is lost for a live or scheduled match, nor for a finished match that *does* have a log:
`/match/[id]/jeu` stays reachable by URL in every case, and game mode remains readable by the whole
squad (decision 059). What changes is only that the app stops advertising a story it does not have.

## 064 — `scoreLineFr` is the only function that writes a score, and now that is true
**2026-09-23** · accepted · amends 061

Decision 061 said `scoreLineFr` was « the only way the app writes a score ». It was not: four other
places built one by hand. They have been removed, and every scoreline on every screen now comes from
that one function.

**What was actually there.** `reduceMatch` built `scoreLabel` as `` `${goalsFor} - ${goalsAgainst}` ``;
`buildRecap` built the timeline's `scoreAfter` the same way; `buildLiveTimeline` built game mode's the
same way again; and `lib/stats/format.ts` had its own `formatScore`. All four used a **hyphen** where
`scoreLineFr` uses an en dash, and the stats form guide printed a third form, « 2-0 », with no spaces
at all. So the recap's scoreboard read « 2 – 0 » and the timeline three cards below it « 2 - 0 », for
the same two goals, on the same screen.

**Why bother, since nobody would notice a hyphen.** Because the decision claiming a single writer was
already written down, and a decision that is false is worse than no decision: the next session reads
061, believes there is one place to change, and changes one of five. Typography is the trivial half of
this; the drift is the real defect, and it had already happened once — 061 exists because two
scoreline *orientations* grew up side by side for the same reason.

**Consequences.** `formatScore` is gone, with a comment in its place saying where the function went
and why there is not one here. The reducer imports `scoreLineFr`, which is a French display string
inside a pure function — it already imports `EVENT_LABELS_FR` and `formatMinuteLabelFr`, and
`lib/calendar/labels.ts` is pure, so invariant 2 is untouched.

The e2e suite needed two assertions scoped: with the timeline and the scoreboard finally agreeing on
the character, `getByText("1 – 1")` matches both and Playwright's strict mode refuses. That is the
fix working. The recap's scoreboard gained `aria-label="Score du match"`, making it a `region` the way
game mode's « Chrono et score » already is — the largest number in the product had no accessible name,
and now the spec has a stable handle on it for the same reason a screen reader user does.

## 065 — The audit browser speaks French, and « sur 14 » says what the 14 is
**2026-09-23** · accepted

Three small things the screenshots showed, once the scorelines agreed and there was nothing louder to
look at.

**`audit:screens` launches Chromium with `--lang=fr-FR`.** `context.locale` was already `fr-FR`, and it
is not enough: it reaches `Intl` and `Accept-Language`, while **native form controls follow Chromium's
own UI language**. Every date field in the audit was therefore screenshotted as `09/23/2026`, month
first — a thing no French phone shows. The tool exists to make looking at the app cheap, so a
screenshot that misrepresents it is a defect in the tool. One caveat is written next to the flag: the
empty placeholder still reads `dd/mm/yyyy` because the field order comes from ICU (now correct) while
those three words come from Chromium's localised resources, and Playwright's build ships English only.

**« 11 présents sur 14 pointés », never « 11 présents sur 14 ».** The denominator has always been the
number of players the coach *marked* — decision 020's rule, and the data was right — but the word was
missing on the calendar row, and the demo season shows exactly why it matters: fourteen were marked on
29 August and the squad has thirteen players today, because one had left by September. A coach reads
« sur 14 », counts thirteen names, and concludes the app is wrong about a figure that is right about
that night. `attendanceCountFr` in `lib/calendar/labels.ts` is now the one place this line is built,
used by both the calendar row and the coach's marking card, and `labels.test.ts` pins both plurals —
« 1 présent sur 1 pointé » was the other thing a bare template got wrong.

**The injury disclosure on `/moi` has a marker.** « Je me suis blessé » is a `<summary>` with
`list-none`, so the native triangle was suppressed and nothing replaced it: on a phone it was a grey
panel of text, and `cursor-pointer` says nothing to a thumb. It is now accent-coloured with a chevron
that turns on `group-open`. The panel stays closed by default for the reason it always was — declaring
an injury is the exception, not the routine.

## 066 — « 2 par défaut. » said nothing; the form now says what the two numbers come to
**2026-09-23** · accepted

The « nouveau match » form had two number fields side by side, « Périodes » hinted « 2 par défaut. »
and « Minutes » hinted « 30 par défaut. », over fields already holding 2 and 30. The hint was
therefore redundant when creating a match — and **wrong** when editing one: a match set up as 3×20
kept being told, under its own values, that the default was 2 and 30.

Worse, neither hint said the thing a coach can actually get wrong. « Minutes » is per period, not the
length of the match, and this app's clock is continuous (decision 009): the second half of a 2×30
runs 30′→60′, and there is nowhere else in the product where a coach learns that before game mode
shows it to them.

So both hints are gone. The field is labelled « Minutes par période », and one sentence under the
pair states the consequence, recomputed as you type:

> 2×30 minutes : 60 minutes de jeu, et la 2ᵉ période va de la 30ᵉ à la 60ᵉ minute.

It is built by `matchLengthHintFr` in `lib/calendar/labels.ts` — pure, tested, and it returns `null`
rather than a sentence when the pair cannot be read. `Number("")` is `0` and a half-typed field is
`NaN`; « 0×30 minutes : 0 minutes de jeu » is exactly the class of untrue statement this whole audit
exists to catch, and the form would have printed it on the way to every valid value. Both inputs
point at the sentence with `aria-describedby`, so whichever number is being edited, the consequence is
announced with it.

The fields stay uncontrolled (`defaultValue`): the mirrored state exists only to write the sentence,
and the form still posts what was typed with JavaScript off.

## 067 — A new match sheet is empty, not thirteen rejections
**2026-09-23** · accepted

Creating a match and opening its « Feuille de match » gave thirteen rows, each with the fourth segment
— labelled « — » and painted `danger` — selected. Thirteen red bars, under a summary line that
correctly said « Feuille de match vide ». The screen contradicted itself: nobody had been left out of
anything, and red is the colour this app uses for « Pas dispo » and « Blessé ».

Three changes, one idea — the sheet stops asserting a decision nobody took.

**« Hors feuille », not « Non retenu ».** `null` in `match_squad` means two things the app cannot tell
apart: a coach who decided to leave the player out, and a sheet nobody has touched. « Non retenu »
claims the first. « Hors feuille » is true of both, and is what `squadRoleLabelFr` returns now.

**A `neutral` segment tone.** `SegmentedControl` had four tones, all of them fills that mean something
— accent, success, warning, danger. There was no way to say *chosen, and unremarkable*. `neutral` is a
quiet pill in `surface` with an inset `border` ring, which is what makes it legible as the selected
segment in dark mode too, where `surface` is darker than the `surface-2` track rather than lighter.
The visible label is « Hors » rather than « — »: the other three segments abbreviate a word, and a
bare dash abbreviates nothing.

**The summary accounts for everybody.** `squadSummaryFr` printed « 7 titulaires · 3 remplaçants ·
1 supporter » for a thirteen-player squad, leaving two players unexplained — a coach counting on his
fingers cannot tell whether he forgot somebody or the app did. It ends « · 2 hors feuille » now, and
the line adds up. Not on an untouched sheet, though: « 13 hors feuille » would be the same lie in
another font, and « Feuille de match vide » is already both shorter and true.

## 068 — After the kick-off, the availability list is history and goes last
**2026-09-23** · accepted

On a played match, the first card under the score was « Disponibilités »: the whole squad, grouped by
what each player had answered *before* a match that finished three days earlier. Thirteen names, some
seven hundred pixels of them, above « Après le match » — which holds the only thing a player still has
to do, and the only one with a deadline, since the rating window shuts at the next kick-off
(decision 007). The page led with something nobody can change and buried the thing that expires.

So the card is rendered in one of two places depending on `match.status`. Before the kick-off it leads,
because « qui est dispo » *is* the question of the day. Afterwards it goes last, below « Après le
match », the retro-entry card and « Mode match », and it is passed `past` — which changes its
description to « Avant le match · 13 réponses sur 13 joueurs » so it stops reading as a question that
is still open.

It is not removed. Who had said what is part of the record of the afternoon: Mehdi's
« En déplacement ce week-end. » is why he is not in the log, and deleting that would make the squad
list of a played match harder to read, not easier.

`availabilityCountFr` in `lib/calendar/labels.ts` now builds the count, next to `attendanceCountFr` and
for the same reason: the denominator is named — « sur 13 joueurs », the squad the question went to —
and the plurals are pinned by a test instead of living in a template inside a component vitest cannot
reach.

## 069 — A session's présences are counted over the evening, not over today's squad
**2026-09-23** · accepted

The player's « Présences » card on a training page printed « 11 présents sur 13 joueurs » for the demo
season's 29 August session. The calendar row for the same session says « 11 présents sur 14 pointés ».
One evening, two denominators, and the smaller one wrong twice over: an unmarked player is not an absent
one (decision 020), and the numerator was read off every attendance row while the denominator was the
squad *as it stands today*, so a player marked présent who had left the club in September counted
towards a total he was no longer part of. With one more departure the card could have claimed more
présents than there were players.

**Attendance is a fact about that evening.** It does not change when somebody leaves the club, so both
cards — the coach's marking list and the player's summary — now count the marks themselves, which is
what the calendar row already counted. The consequence is that the denominator can exceed the number of
rows in the list underneath, because the list can only offer a présent/absent control to a player who
is still here. That gap is stated rather than left as arithmetic: `departedMarksNoteFr` adds « 1 joueur
pointé ce soir-là a quitté l’équipe depuis. », and only when the two actually differ.

**The ordering of decision 068 applies to trainings too.** Before the session, « Disponibilités » leads:
who is coming is the question of the day. Once it is over, who *came* is the answer and who *said they
would* is history, so the card moves below the présences and says « Avant la séance ». `past` on
`AvailabilityGrid` therefore carries which kind of event it is rather than a bare boolean that only
knew the word « match ».

**And a past event nobody answered gets no card at all.** For 29 August the card was thirteen names
under « Sans réponse » — the largest thing on the player's page, a month after the fact, about a
question the présences above it have already answered. `availabilityIsWorthShowing` drops it when the
event is past and `answered` is zero. Before the event it is always shown: « 0 réponse sur 13 joueurs »
with thirteen names to chase is exactly what the coach came for.

## 070 — « joueur 3 sur 11 », because an unlabelled ratio reads as a rating
**2026-09-23** · accepted

The rating card's subtitle was built from two bare figures joined by a dot: « n° 8 · 3 / 11 ». The first
is a fact about the man being rated, so the second read as one too — and on a screen where every other
number is a mark out of something, the likeliest reading of « 3 / 11 » is *three of his eleven
team-mates have already rated him*, which is precisely what decision 007 hides until the reader has
finished his own set. It was neither: it was which card of the stack is open.

Labelled « joueur 3 sur 11 », and moved into `lib/rating/progress.ts` beside `playedLabelFr`, because
Vitest only collects `lib/**` — a sentence built inline in a client component is a sentence no test
pins. It returns `null` for a single card, where « joueur 1 sur 1 » would say nothing the screen does
not already show.

## 071 — « Passes » spelled out, because the abbreviation is a slur
**2026-09-23** · accepted

The assists column of the recap's « Temps de jeu » table was headed « PD », for « passes décisives ».
In French those two letters are a homophobic slur, and this is the table every player scrolls to on the
one screen `docs/PLAN.md` calls « le moment de fête » — the abbreviation sat two columns from his own
name, at 390 px, read by the whole squad.

It was also the only one in the app: the scoreboard immediately above says « Passes », and the player
card and the stats filters say « Passes » or « Passes déc. ». So the fix is the word the surrounding
screens already use, and it costs nothing — the column holds single digits, so its header sets its
width either way, and the table still fits without horizontal scroll at 360 px.

**The general rule this settles:** no two- or three-letter abbreviation of a stat name unless it is one
a scoreboard actually uses (`GB`, `V`/`N`/`D`, `csc`). Screen width is never a good enough reason — the
numbers under these headers are single digits, so the header is what sets the column width, and a
shorter header buys no space at all.

## 072 — There is no hover on a phone, so nothing is explained in a `title`
**2026-09-23** · accepted

`Figure`, the label/value pair every card on `/stats` and the profile's « Statistiques personnelles »
are built from, took a `hint` and rendered it as a `title` attribute. A `title` is a desktop tooltip:
it needs a mouse to rest on an element, which is a gesture no touch screen has. This app is
mobile-first by its first decision, so seven written explanations were reaching nobody —
« 7 matchs sur la feuille », « moyenne sur 4 notes », « présences / séances pointées », « Minutes
passées dans les buts avec la cage inviolée », « Matchs terminés sans encaisser ».

The cost was not merely a missing footnote. A player card reads « MATCHS 6 » above « 7 fois
titulaire », which looks like one of the two being wrong; it is rules 3 and 4 of `aggregate.ts`
meeting — a match counts when he has minutes in it, a selection is a name on a sheet, and the demo
season's one unrecorded match (rule 7) gives nobody a minute. « 7 matchs sur la feuille » is what
reconciles them, and it was the hidden sentence.

**So a `hint` is printed, under its value.** And because the grid gives a column about 110 px at
390 px, every hint was re-judged rather than simply revealed:

- a hint that is really a sentence goes into the `Note` under its card, which has the full width —
  the keepers' card already explained clean minutes there, so its hint was pure duplication;
- what stays is two or three words: « sur 4 notes », « séances pointées », « sur 2 matchs »,
  « sans encaisser »;
- the sheet total has no short form, so it leads the full-width appearances line instead.

It is printed inside the `<dd>`, so a screen reader hears « Note, 8,0, sur 4 notes » as one value,
and it is suppressed when the value is a dash: a denominator under a number nobody has is noise.
`title` survives only on that dash, where it duplicates an `sr-only` sentence.

**The general rule:** nothing an app of ours says may depend on hovering. A `title` is at most a
duplicate of something already visible or announced.

## 073 — One wording for a player's appearances, shared by the two screens that print them
**2026-09-23** · accepted

`/stats` printed « 7 titulaire · 5 remplaçant », the profile card printed « 7 fois titulaire · 5 fois
remplaçant ». The first is not French — seven of them is « 7 titulaires » — and the two were separate
hand-built lists that had already drifted once.

`appearancesLineFr` in `lib/stats/format.ts` is now the only place either is written. It keeps the
« N fois titulaire » shape: it needs no agreement, so it cannot be got wrong, and it is how a coach
says it. `withSheetTotal` is what distinguishes the two callers — `/stats` prepends « 7 matchs sur la
feuille » because nothing else on that card carries it, the profile does not because its header
already does, and the same sentence twice on one card is worse than none.

In `lib/` rather than in the component for the reason decisions 060, 062 and 065–070 all give: Vitest
collects `lib/**` and `db/**`, so a string built inline under `app/` is a string no test pins.

## 074 — The French tutoies, everywhere
**2026-09-23** · accepted

The app addressed its reader both ways. Seventy-five strings say « tu » — « Ta réponse », « Tu peux
changer d’avis jusqu’au coup d’envoi », « Tu n’es pas l’opérateur de ce match » — and eight said
« vous »: the banner a player sees in game mode (« Vous suivez le match en direct »), the planned
composition's « rien ne change avant votre confirmation », the TERRAIN sheet's « tant que vous ne
validez pas », the install description « Gérez votre équipe ».

It was not a split by role, which is the only thing that could have justified it: the operator — a
coach — is told « Tu n’es pas l’opérateur de ce match » from `ingest.ts` and « rien ne change avant
votre confirmation » from `presenter.ts`, two sentences about the same person on the same screen.
Simple drift, and the kind a reader feels without being able to name.

**« Tu », then.** This is one amateur team's own tool, used by a dozen people who play football
together on a Sunday; the coach is « Benjamin », not « Monsieur ». And the tutoiement was already the
majority by nine to one, so it is the cheaper direction of travel as well as the right one.

Two of the eight were not about politeness at all and got a different fix. « Ce que vous travaillez »
on the training form is the *plural* « vous » — the team, not the reader — so the pronoun goes
altogether: « Le thème de la séance ». And the position picker's « appuyer pour en faire votre poste
principal » is read out by a screen reader to a coach editing *somebody else's* preferences, where
« votre » was simply wrong; it is « le poste principal » now, which is what its two sibling labels
already did.

Recorded in `CLAUDE.md` rather than only here, because it is a rule that applies to every string
anybody adds afterwards.

## 075 — A build must not need a database
**2026-09-23** · accepted

The first three deploys of this app to Vercel all failed, in 36 to 43 seconds, at the same line:

```
Error: Failed to collect configuration for /api/match-events
  [cause]: Error: DATABASE_URL is not set. Copy .env.example to .env.local.
    at module evaluation (db/client.ts:21:9)
```

`db/client.ts` read `DATABASE_URL` at module scope and threw if it was absent. That reads as a
sensible fail-fast, and locally it is one — `npm run dev` on a machine with no `.env.local` should
say so immediately. But `next build` imports every route module to collect its configuration, so a
module-scope throw is a *build-time* dependency on a production secret. TypeScript had already
passed, every page had compiled; the build died on page-data collection, before rendering anything.

Two things were wrong and both are fixed.

**The connection now opens on first use.** `db` and `sql` are proxies over a lazily created
connection: importing the module does nothing, and the check throws at the moment somebody actually
asks for data. The proxy is invisible — `db` is still typed as `drizzle()` returns it, `` sql`…` ``
still works as a tagged template (that is what the `apply` trap is for), and the twenty-eight
modules that import either were not touched. The e2e suite, which drives real queries, `sql.unsafe`
and `sql.end()` through a real Postgres, passes unchanged.

**The message names both environments.** « Copy .env.example to .env.local » is advice that cannot be
followed on a serverless host: there is no file to copy and no machine to copy it on. It now says
what to do locally *and* what to do on Vercel, and points at `docs/DEPLOY.md` §4.

The cost is that a deploy with no `DATABASE_URL` builds green and fails at runtime instead of
failing loudly at build. That is the right trade — a build is not a run, previews of a branch that
touches no data should not need a database, and the runtime error is explicit rather than silent —
but it is a real change in where the mistake surfaces, so `docs/DEPLOY.md` §4 now says a green build
is not evidence the variable is set, and what the symptom looks like when it is not.

## 076 — A session nobody pointed says so
**2026-09-23** · accepted

The demo season has four trainings, and one of them — 19 September — exists precisely because it was
**never pointed**: not one row in `training_attendance`. It is not the same fact as 12 September,
where the pitch was unplayable and thirteen rows say `present = false`, and decision 020 already
insisted the attendance rate treat the two differently. The screens did not.

**On a list row** both printed the same thing, which was nothing: `attendanceSummary` returned `null`
whenever `marked === 0`. So « 0 présent sur 13 pointés » sat above a silent row, and the silence read
as either a session where nobody came or a bug. It now says « Présences pas encore pointées » — on a
session that is *over*. Before the evening the silence is correct: the coach has not failed to do
anything yet, which is why `attendanceLineFr` takes `isPast` rather than guessing from the counts.

**On the session's own page** it was worse. A player opening 19 September got the date, the time, the
venue, and eleven hundred pixels of blank — `PresenceSummary` returns `null` with no marks, and the
availability grid is hidden when nobody answered (decision 069), so between them the page said
nothing at all about a session that had happened. It says it now, and says the part that matters:
« Aucune présence n'a été pointée pour cette séance. Elle ne compte donc dans aucun taux de
présence. » Without that second sentence the first invites the reading that everybody was marked
absent, and a player who trained that evening should not have to wonder whether the app has him down
as a no-show.

**The audit had never looked at it.** `scripts/audit-screens.ts` picked its training with
`order by starts_at desc limit 1` — always the session still to come. A past session's page, in
either of its two states, had not been screenshotted once, which is why `PresenceSummary`,
`departedMarksNoteFr` and the blank page were all unexamined. Two targets now: a past session that
was pointed and a past session that was not. 100 visits instead of 92.

Worth naming, because it is the fourth time: **the blank screen passed every mechanical check.** An
`h1`, no console error, nothing outside the viewport, no English. The script says in its own output
that what it cannot catch is a screen stating something untrue — and a screen saying nothing about
something that happened is a member of that family, not an exception to it.

## 077 — Docker Compose is an additional way to run the stack, not the development loop
**2026-09-23** · accepted

`compose.yaml`, `Dockerfile` and `.dockerignore` bring up Postgres 17 and a production build of the
app with one command. Decision 016 still stands: **development is `npm run dev` against the Homebrew
`postgresql@17` service**, and nothing in the repository now requires Docker.

**Why not supersede 016.** 016 chose Homebrew for a reason that has not changed — the owner's machine
had no Docker daemon, and a Homebrew service needs none, starts at boot and survives a reboot. The
development loop that decision produced is fast and it works. Replacing it would trade a working
setup for a container rebuild on every dependency change, and would make Docker a precondition for
contributing.

**Why add compose anyway.** Three gaps Homebrew does not cover. A production build behaves
differently from `next dev` — standalone output, `NODE_ENV=production`, no HMR — and the only way to
see that before Vercel does was `npm run build && npm run start`, which still needs the host set up.
A machine without Homebrew (Linux, CI-like, a second laptop) had no documented path to a database at
all — `npm run db:start` is `brew services`, so it is macOS-only, and on Linux `npm run docker:db` is
now the equivalent. And CI runs against a `postgres:17` service image, so a container is the closest local
reproduction of the environment the e2e job fails in.

**How it is arranged.**

- Four services. `db` is `postgres:17` with the same credentials as `.env.example` and CI, a named
  volume, a `pg_isready -U football -d football_manager` healthcheck and a published port so the
  host's `npm run dev` can use it on its own. `migrate` is a one-shot that applies the committed
  migrations — never `db:push`. `bootstrap` is behind a `setup` profile, for an empty database.
  `app` is the production image, and it depends on `db` being healthy *and* `migrate` having exited
  successfully, so no request can reach a schemaless database.
- `output: "standalone"` in `next.config.ts` is **opt-in**, gated on `NEXT_OUTPUT_STANDALONE`, which
  only the Docker build sets. Vercel does its own tracing and builds exactly as it did before; a
  config change that silently altered the deployed artefact would have been a poor trade for a
  convenience.
- The image is `node:22-bookworm-slim`, not Alpine. `@node-rs/argon2` ships prebuilt glibc binaries
  and musl would send it to a source build.
- The Dockerfile carries a `tools` stage — dependencies plus the source tree, no build — because the
  standalone runner has neither `npm` nor `tsx`, so `db:migrate` and `db:bootstrap` cannot run in it.
- No `DATABASE_URL` at build time, per decision 075: a build must not need a database.

**Consequences.** The compose credentials are development credentials and the file is not a
deployment target — Vercel plus Neon remains the deployment, and `docs/DEPLOY.md` keeps compose in a
section marked optional. Two ways to get a database now exist, which is a documentation cost; it is
paid by that section saying plainly which one is the default. CI is unchanged: it keeps using the
service-container form rather than building an image, because building one would add minutes to
every push to prove something the compose build already proves locally.

## 078 — Migrations are applied by CI on `main`, not by hand before a deploy
**2026-09-23** · accepted · supersedes the manual step in `docs/DEPLOY.md` §2

`DEPLOY.md` described `db:migrate` as a command the owner runs from a shell before each production
deploy. That was written before the Vercel project existed. Now that it does, and is connected to
GitHub, a push to `main` deploys on its own — so the manual step is one a human is invited to skip,
and the failure it produces is new code against an old schema, which is the dangerous direction.

The `migrate` job in `.github/workflows/ci.yml` runs on pushes to `main` only, `needs` both existing
jobs, and applies the committed SQL that the end-to-end job has just applied to a `postgres:17`
service two jobs earlier. It has its own `concurrency` group with `cancel-in-progress: false`: the
workflow's own group cancels superseded runs, which is right for a test run and wrong for a migration
that is halfway through applying SQL. It fails loudly when the `DATABASE_URL` secret is absent,
rather than skipping — a migration that silently did not happen is the thing being prevented.

**It is not in the Vercel build command** (`db:migrate && npm run build`), which is where this
usually goes, for two reasons. It would restore a build-time dependency on `DATABASE_URL`, which
decision 075 exists to remove — and on Vercel that variable is sensitive, so it is not available
during a build at all. And every preview build would migrate whatever database it points at, which
today is the production one.

**It is not ordered against Vercel**, which starts building the same push immediately: for a few
seconds the new code can be serving against the old schema. Making it deterministic means taking
production deploys away from the git integration and issuing them from the workflow with a
`VERCEL_TOKEN` after the migration. Rejected for now — that is a long-lived deployment credential in
a repository secret, against a window of seconds, for a team of fourteen people who are not watching.
The migrations in `db/migrations/` are all additive, which is what makes the window survivable. The
first migration that cannot be — a dropped column, a narrowed type — is the trigger to revisit this,
and `DEPLOY.md` says to take that one out of the flow and do it by hand.

## 079 — The rating deadline is on the screen, not only in the rule
**2026-09-23** · accepted

Decision 007 closes the rating window at the next kick-off, and `lib/rating/window.ts` has returned
`closesAtMs` — the exact instant — since M6. Nothing read it:
`grep -rn "closesAt" app lib | grep -v lib/rating/window` returned no output. The app enforced a
deadline it never stated.

What made that worse than a missing detail is the consequence on the other side of it.
`lib/rating/progress.ts` hides the team's notes from anybody who has not submitted his own, and the
window closing does **not** unlock them: a player who runs out of time never sees the notes of that
match, for ever. That is deliberate — it is what stops copying and anchoring — but it turns a silent
deadline into a door that shuts on somebody who was never told there was one. Three screens promised
the reward without the condition:

- the notation flow — « Tu verras les notes des autres quand tu auras noté tout le monde », next to
  a « Passer » button;
- the recap's « À toi de noter » card — « dès que tu auras fini »;
- the match page's « Après le match » card — whose own comment in the source calls it « the one thing
  a player still has to do, and the one that expires at the next kick-off (decision 007) ».

`ratingDeadlineFr(closesAtMs, nowMs)` is the sentence, and it lives in `window.ts` next to the rule
it describes so that changing one makes the other obvious. It states both halves of the cost, because
either alone is misleading: « les notes de ce match ne bougent plus » sounds like an archive being
sealed, and « tu ne verras pas celles de l'équipe » sounds like a punishment without a reason.

It returns `null` twice, and both silences are the point:

- **no next match on the calendar.** The window has no end yet. Naming a deadline would mean
  inventing one, and « pas de date limite » would stop being true the moment the coach adds a
  fixture.
- **the deadline has passed.** Printing a date in the past as a thing to beat is precisely the defect
  family this repo keeps finding. The closed states already say so in their own words.

The sentence only appears to a viewer whose notes are unfinished. Somebody who has rated everybody
can read the notes already, so for him the closing time is a fact about nothing.

## 080 — Only `main` deploys to Vercel
**2026-09-23** · accepted · closes the Preview hazard recorded in `docs/DEPLOY.md` §4

Vercel deployed every branch, because that is what a freshly connected project does. In twenty-three
minutes of one session it built **nine preview deployments** for pull-request branches, and each of
them was a full running copy of the app pointed at the production Neon database, because
`DATABASE_URL` is set for Preview with the same value as Production.

`vercel.json` now says, and holds nothing else:

```json
{ "git": { "deploymentEnabled": { "**": false, "*": false, "main": true } } }
```

**Why not fix the database instead.** The obvious repair is a Neon branch for Preview, and it is on
the roadmap for the day previews come back. It is the wrong *first* move: it is work, it needs a second
connection string kept in step with the first, and it buys a facility nobody was using. Nothing in the
definition of done asks for a preview URL — the checks are `typecheck`, `lint`, Vitest, Playwright and
a look at 390 px, and every one of them runs locally or in CI. A preview was a loaded gun aimed at the
season's statistics in exchange for a convenience that was not being spent.

**Two details that cost time to get right, both written up in `docs/DEPLOY.md` §4.** The patterns are
minimatch, where `*` does not cross a `/`, so a lone `*` would have matched `main` and missed every
`feat/<slice>` branch it was written to stop — the rule would have read as "block everything" and done
nothing. And this is `git.deploymentEnabled` rather than an `ignoreCommand`, because the latter starts
a build container in order to exit it: a cancelled deployment per push, and the start-up billed.

**What is given up.** No preview URL to hand somebody, and no Vercel status check on a pull request.
The status check was never load-bearing — GitHub Actions is the gate — and `vercel --prod` still
deploys any commit from a laptop when a real one is needed. Turning previews back on is one key in one
file, and the roadmap says what to do first when it happens.

## 081 — A version is a number in `package.json`, and CI turns it into a tag
**2026-09-23** · accepted

There were no tags. Eight milestones, a production deployment and fifty-four pull requests, and no way
to name what was live except a commit hash.

The version is the `version` field in `package.json` and nowhere else. The `tag` job in
`.github/workflows/ci.yml` creates the annotated `v<version>` tag on `main` after `checks`, `e2e` and
`migrate` have passed; a push whose version is already tagged does nothing and passes.

**Why CI and not a session.** This repository exists in the form it does because sessions share no
memory — the whole of `CLAUDE.md` is an answer to that. "Remember to tag after merging" is exactly the
kind of convention that survives two sessions and then quietly stops happening, and the failure is
invisible: nothing is red, there is simply no tag. Making it a job means the rule is executable rather
than remembered, and `package.json` is the only place a human has to be right.

**Why after `migrate`.** A tag is a claim that a version reached production whole. A version whose
migration failed did not reach production at all — the code is live against the old schema — so
tagging it would put a name on a state nobody wants to return to.

**What this does not do.** It does not decide *when* to bump, which is a judgement about what changed
and stays with whoever opens the pull request. It does not write release notes: the tag message is the
commit subject, and the history is the changelog. The first tag it cuts is `v0.1.0`, which is the
version the field has held since M0 — the number is honest about an app that has never been used by
the team it was written for, and bumping it to `1.0.0` is a one-line change on the day the squad
actually walks a match with it.

## 082 — A figure the competition filter cannot reach says so where it is printed
**2026-09-23** · accepted

`/stats` has a competition filter, and a training belongs to no competition (decision 020), so
`getAttendanceMarks` takes no filter: the attendance rate is the season's whatever chip is selected.
Decision 020 already knew this was a trap and put a sentence on the « Présence aux entraînements »
card — « Le filtre par compétition ne s'applique pas ». The per-player cards print the *same figure*
a few hundred pixels higher and said nothing.

On the « Coupe » tab of the demo season, Ali's card reads:

```
MATCHS —   BUTS —   PASSES DÉC. —   MINUTES —   NOTE —
PRÉSENCE 1/2 · 50 %
```

Five dashes meaning « nothing in this selection », and one number that means something else entirely.
Fabien's row is the same shape with a hard « 0/2 · 0 % » in it. Both are true statements about the
season and false statements about the cup, and the row gives the reader no way to tell which he is
looking at.

The rule this settles, because the app will meet it again: **a figure outside the current filter is
qualified where it is printed, not in a note at the bottom of the card.** The « Joueurs » card is four
thousand pixels tall; its note sits under the last player. Nobody misreading row nine reads it. So the
hint under the rate becomes « séances pointées, toute la saison » as soon as a filter is on — the
denominator it already carried, plus the scope — and the reason stays in the note, where a reason
belongs.

One wording for the reason, `ATTENDANCE_NOT_FILTERED_FR`, shared by the two cards so they cannot come
to disagree (the same move as decision 073). That meant dropping « cette carte » from decision 020's
sentence: on a player's card the filter applies to everything *except* the presence, so naming a card
would have been wrong in the new place and vague in the old one.

Both strings are pure functions in `lib/stats/format.ts` with tests, for the reason that keeps
recurring: Vitest does not look under `app/`, so copy that matters has to leave the component.

## 083 — An empty state describes the form, never a match
**2026-09-23** · accepted

The retro-entry sheet for a match with no planned composition opens with seven `— personne —`
selects. Its « Changements » card said, in that state:

> Aucun changement : les sept titulaires ont fini le match.

Seven titulaires who had finished a match nobody had named — printed four hundred pixels above the
same screen's own « 0 joueurs avec des minutes ». The sentence was true of the case the author had in
front of him (a full sheet, no substitutions) and false of the case the coach actually starts from.

This is decision 060 a second time. There, « ne change rien sur le terrain » was printed over an
empty pitch. The shape is identical and worth naming as a rule: **an empty state is a statement about
the form, not about the match.** « No rows in this card » does not license a claim about who played;
if the sentence names a number of players, that number has to come from what is filled in. So the
copy counts the filled slots, agrees in number, and with nothing filled it says where to start
instead of describing a team:

> Aucun changement. La composition de départ est vide : sans titulaire, il n'y a personne à remplacer.

The same card's neighbour had a smaller version of the problem: « Un 0-0 sans rien à signaler, ça
existe » wrote its scoreline by hand, with a hyphen, a few hundred pixels below the Score card's
derived « 0 – 0 » — in a file that already imported `scoreLineFr`. Two dashes for the same thing on
one screen is exactly what decisions 061 and 064 exist to have removed, so the sentence interpolates
`scoreLineFr(0, 0)` like everything else.

Both live in `lib/retro/labels.ts` with tests, for the reason that keeps recurring: Vitest collects
nothing under `app/`, so copy whose truth depends on state has to leave the component before it can
be pinned.

## 084 — A « what next » card reads the state it is standing on
**2026-09-23** · accepted

The match sheet ended with a card that said, on every match, in every state:

> Et maintenant ?
> Le groupe est fait : place les sept sur le terrain.
> [ Compositions ]

It was written while looking at a finished selection, and it is a statement about one. Three of the
states it is actually shown in contradict it:

- a match created a minute ago has thirteen rows marked « Hors » and no group at all. The card told
  the coach to place seven players and offered a link to an editor that would open with an empty
  bench;
- a match played a fortnight ago has a frozen sheet. `SquadSheet` says so, two centimetres above, and
  the card underneath was still giving instructions for a match that is over;
- nothing caps the starters — the badge turns amber past seven but the action accepts nine — so
  « les sept » routinely named a seven that did not exist.

Decision 083 said an empty state describes the form rather than the match. This is the same rule for
the other end of a screen: **a next-step card is derived from the state it is standing on, like any
other rendered fact.** It is the most quoted line on the page, the one a coach acts on, and it was the
only thing on the screen that could not be wrong in a way `audit:screens` would notice.

`sheetNextStepFr` returns the sentence *and* the call to action, because on an untouched sheet the
honest answer is that there is no next screen yet: the button disappears rather than leading somewhere
useless, and on a finished match it becomes the recap. It lives next to `countSquadRoles`, whose result
it reads, in `lib/composition/plan.ts` — under `lib/` so Vitest collects it.

`live` is deliberately not a case of its own: preparing a composition during a match is the normal way
to plan a change, and invariant 3 means the plan is a proposal whenever it is written.

## 085 — A finished match is a record on every screen, in the same words
**2026-09-23** · accepted

The compositions screen was written for a match still to be played, and said the same things about one
already played. On CS Morvan — won 2 – 0, thirteen days old — the bottom of the page read:

> Planifier un changement
> Une composition « à partir de la minute X ». Le match dure 60 minutes.
> [ Nouvelle composition ]

and the button worked. `setMatchSquad` has refused a finished match since M3 (« Le match est terminé :
la feuille de match ne change plus. »); `saveLineup` and `deleteLineup` never did. So a coach could add
a plan « à partir de la 30ᵉ minute » to a match whose 30th minute was a fortnight in the past, and
delete the composition game mode had confirmed — which is not a plan any more but the record of what
was played. The editor route was worse than the list: it would have opened a whole pitch, accepted
seven players, and refused them on submit.

The rule this settles is not about this screen: **a finished match is a record everywhere, and every
screen that could write to it says so in the same words.** The way to change one is `lib/retro/amend.ts`,
which appends (invariant 1) and re-freezes the statistics; it is never a plan for a minute already
played. `LINEUPS_FROZEN_FR` holds the sentence once, shared by the list's notice and the editor's sixth
dead end, so the two cannot drift — the decision 073 move.

Three smaller untruths on the same page came from the same root, and each is now derived:

- « Le terrain est vide · Place tes sept joueurs sur la pelouse » on a match played ten days earlier
  and typed up afterwards. A match entered through `saisie` never had a composition and never needed
  one, so the empty state says where its minutes came from instead of asking for players;
- « modifier la feuille » in the header, linking to a sheet `SquadSheet` renders `frozen`. It now says
  « voir la feuille », which is what the link does;
- the empty state repeated its own card's heading, « Aucune composition » twice in a column 390 px wide.

`live` stays editable on purpose, in all of it: planning the 40th minute during the 20th is the whole
point of the screen, and invariant 3 means what is written is still only a proposal.

## 086 — A diff needs two teams, and a draft is not one
**2026-09-23** · accepted

« Nouvelle composition » opens on an empty pitch — that is what it is for. At the bottom of it, under
a heading saying the words were deduced:

> **Changements déduits**
> Par rapport à : composition de départ
> · Hugo sort · Samir sort · Thomas sort · Nico sort · Léo sort · Karim sort · Julien sort

Seven departures, for a coach who had not yet touched a player, and the list shrank by one every time
he placed somebody — the screen reading a form as if it were a decision.

`deduceChanges` already refused the other direction, and for exactly this reason: with no earlier
composition the diff is seven arrivals, and « Hugo entre, Nico entre, … » under the starting sheet is
the « 7 changements » lie in another form. That guard was written, commented, and only half of the
problem. **A difference between two compositions is only meaningful when both are complete teams**,
and the editor's draft is the one place in the app where one is not.

It counts empty **slots**, not missing players, because the distinction matters to the other caller: a
team playing on with six after an injury is a real composition and the diff against it is real
(`describeLineupDiffFr` says so, and a session before this one fixed a defect that came from ignoring
it). Six players in seven slots is not that; it is a form with a question still open. A saved
composition can never be in that state — an incomplete one is blocking in `findPlanIssues` — so this
only ever changes what the editor shows.

The card says « Il reste 4 postes à pourvoir : les changements apparaîtront quand l'équipe sera
complète. » rather than « Aucun changement », which is the true answer for two complete teams that
happen to be identical and a different statement entirely. The « 7 changements » badge is emptied with
the list it counted, for the reason decision 061 gives: a count above a list nobody is shown is the
same defect one line higher.

## 087 — A heading is a claim about every row under it
**2026-09-23** · accepted

Game mode's last list was headed « Remplaçants ». On the demo season's Étoile du Parc, before the
kick-off, that heading stood over thirteen rows:

- the three named substitutes;
- the seven titulaires — nobody is on the pitch until the coach confirms the composition
  (invariant 3), so before the kick-off the whole group is off it;
- two players the match sheet does not mention at all;
- a supporter, who is injured.

Ten of the thirteen were not substitutes, and each of them said so in grey two millimetres under its
own name — which is how the heading got away with it for four milestones. The reader believes the
heading; the subtitle is what they check afterwards, if they check.

The list itself is right, and deliberately wide: `availableOptions` has said since M4 that a coach one
man short at 20′ needs whoever turned up, not a validation error, and that the order is the
recommendation. So the heading is what changes, and the rule is the general one: **a heading is a
claim about every row under it, and it has to be true of the widest row, not the first three.**

It now answers the question the list answers — « Qui peut entrer » — and the hint says the order out
loud when the list is wider than the substitutes. For somebody who is only watching, the list answers
a different question, because they cannot bring anyone on: they are told what it is,
« En dehors du terrain », and given no instruction they cannot follow. The empty state stopped being
« Personne sur le banc. » for the same reason the heading did — there is no bench in it.

## 088 — « Déjà joué » over three trainings and a match nobody recorded
**2026-09-23** · accepted

The history section of `/calendrier` was headed « Déjà joué », hard-coded, over a list that is not a
list of matches. The demo season's own history, read top to bottom:

- three entraînements, which were attended, not played;
- FC des Deux-Ponts — finished, nine men named on the sheet, **not one event** — rendering with no
  score, no badge, nothing at all on the right-hand end of the row;
- six matches with a real scoreline.

Two different untruths under one heading, and they are the same untruth as the previous entry's: the
word was chosen while looking at the rows that happen to sort first. `pastSectionTitleFr` now derives
it — « Déjà joué » only when every row really is a played match, « Déjà passé » otherwise, which is
true of a training, of a match still to be saisi, and of a scheduled match whose window simply
elapsed. The narrow word survives because it is the better word when it is available: a season with no
trainings recorded gets it, and this is not a rename.

The silent row is the other half. `ScorePill` returns nothing when `score` is null, which is right
where it is pinned at the top of the screen — a match kicking off in an hour owes nobody a score — and
in the history it left the one row asking to be acted on as the quietest in the list. It now says
**« rien saisi »**, capitalised as calendar badges are, and the words are not new: the recap's
scoreboard has printed them under « ? – ? » since decision 041. That is the rule of decision 085 read
the other way round — a state described on two screens is described in the same words — so
`NOT_RECORDED_FR` lives in `lib/calendar/labels.ts` and both screens import it. « Non saisi » was
written first and thrown away for exactly that reason.

Not « 0 – 0 », for the reason decision 013 gives and decision 061 repeats: a match that ended nil-nil
and a match nobody wrote down are two different facts, and only one of them is known.

## 089 — A saisie is not a confirmation
**2026-09-23** · accepted

`lib/retro/log.ts` writes a `LINEUP_APPLIED` at 0′ when a match is typed up after the fact, and it is
right to: that event is what puts seven players on the pitch, so the starters count as starters and the
goalkeeper is known. The consequence nobody had followed through is that `lineups.applied_event_id` is
then set on a match nobody watched — FC Rivière in the demo season — and four places said so in the
words of the other path:

- the list of compositions: « Cette composition a été **confirmée pendant le match** : elle ne change
  plus. »;
- the editor's dead end: « Elle a été **confirmée pendant le match** … »;
- `saveLineup`'s refusal: « … a été **appliquée pendant le match** … »;
- and the frozen notice added the same day, which credited « celles que **le mode match** a
  confirmées » on a match whose log the coach typed on his sofa.

The last one is the instructive one. Decision 085 was written to stop the compositions screen inventing
a future for a match that was over, and the sentence it introduced invented a witness instead. **A rule
about telling the truth is not self-applying: the sentence that states it is a claim too.**

The state is unchanged and correct in both cases — a record, not a plan. Only the account of how it
became one moves, which is decision 013's distinction: `entry_mode` is in the database precisely so the
UI can stop describing a saisie as something somebody saw. `appliedNoticeFr` returns the participle
(« confirmée pendant le match » / « enregistrée avec la saisie du match ») plus the three sentences that
end differently, and `LINEUPS_FROZEN_FR` became `lineupsFrozenFr(entryMode)`.

The « appliquée » badge on the card is deliberately left alone. It is the vaguer word, and vague is not
false: that composition *was* applied, by the event in the log. What it must not do is explain, and it
does not.

## 090 — Availability is an intention, présences are a fact, and they do not share words

The calendar's pinned card counted « 7 dispo · **1 absent** · 1 peut-être · 4 sans réponse » for the
26 September training, three days before anybody could be absent from it. One line below, on the
session's own page, the relance card was titled « **Relancer les absents** » directly above its own
description: « 4 joueurs n'ont pas répondu ».

Nobody in either sentence was absent. This app holds the two things in two tables on purpose —
`training_availability` records what a player says he intends to do, `training_attendance` records
what the coach saw — and decision 076 already drew the line between them in the other direction: an
unmarked player is not an absent one, because nobody looked. The same line has to hold here. « Pas
dispo » is a declaration about a Saturday that has not happened; « absent » is an observation about
one that has. Only the second may be contradicted by what happened, and only the first may be
changed by the player.

So the words are now the player's own: the tally says « 1 pas dispo », which is what he tapped, what
his badge says on the detail page, and what the relance message asks him for. The relance card is
« Relancer ceux qui n'ont pas répondu », which is decision 087's rule applied to a title rather than
a heading — and, unusually, the card was already carrying its own refutation one line below, which is
what makes this the cheapest class of defect to find and the easiest to leave in place for four
milestones.

Nothing is pluralised in the tally: « 2 pas dispo » is the same three words as « 1 pas dispo », and a
line the eye can scan across four rows is worth more than French agreement nobody reads. The card's
description does agree, because it is a sentence.

Both sentences moved to `answersLineFr` and `reminderCardFr` in `lib/calendar/timeline.ts`. They were
inline JSX, which is to say untestable: Vitest collects `lib/**` and `db/**` and nothing under
`app/`, so a claim written in a component is a claim no test can read.

## 091 — A route guard's exclusion list is derived from the file class, never enumerated
**2026-09-23** · accepted

`proxy.ts`'s matcher excluded static assets by naming them: `favicon.ico`, `icon.svg`,
`apple-icon.png`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`. Its comment said "the files
served from `public/`", and `public/` holds three files, none of which was in the list —
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, the three `app/manifest.ts` points at.

So every request for a PWA icon was guarded, and an unauthenticated browser asking for one got
`307 /connexion?suivant=%2Ficon-192.png`, followed it, received HTML, and reported
« Download error or resource isn't a valid image ». Verified against the compose stack with `curl`.
Not a local quirk: production answered the same way, which means the install prompt has had no icon
since the day the icons were added.

The lesson is about the shape, not the six names. **An exclusion list in a route guard is a claim
about every file that will ever be static, so it cannot be a list.** It has to be maintained by
whoever adds a file, nothing reminds them, and the failure is silent — a manifest icon that fails to
download breaks no page, no build and no assertion. The matcher now excludes the class: `_next/static`,
`_next/image`, and any path ending in `.<ext>`. Every route in this app is a French word with no dot in
it, so nothing routable is lost, and the fourth file dropped into `public/` is served without anyone
editing this file.

And it has a test, which is the part that makes the claim checkable rather than merely true today:
`proxy.test.ts` compiles `config.matcher[0]` into a `RegExp` and asserts every entry of `public/`,
**read from the directory at test time**, is not matched — hardcoding the three names would rebuild
the same stale list one layer down. The same suite asserts `/calendrier` and `/match/1/jeu` still
are matched, so an exclusion can never quietly swallow the guard, and drives `proxy()` itself with
real `NextRequest`s for the redirect behaviour that had no test at all.

## 092 — A card may not promise less than the controls inside it

`/equipe`'s invite card was titled « Inviter des joueurs » and described as « Génère un code et
envoie-le sur WhatsApp. Le joueur choisit lui-même son mot de passe. » The first control inside it is
a `<select>` whose second option is « Coach », and `createInvite` has taken a role since M0. So the
card's own form refuted its title, two centimetres below it — the same shape as « Relancer les
absents » over « 4 joueurs n'ont pas répondu », and the third time today that a screen carried its own
correction and nobody read it.

It is now « Inviter un joueur ou un coach », and the sentence says « la personne », which is true of
either. The title is deliberately **not** derived from the selected role: the select is a client
control, and a heading that changed under the reader's thumb would trade one defect for a worse one.
What matters is that nothing is false before anybody has touched it. The sentence a player reads in
the card's place lost the same narrowing: « Seul un coach peut envoyer une invitation. »

The second claim on the screen is subtler and is the reason this is a decision rather than a typo
fix. « Encadrement » is true of every row under it — decision 087's test — and is still not the whole
staff, because a coach who plays is listed in « Effectif » above with a « coach » badge. A heading can
mislead by being *complete about the wrong set*: the reader asking who runs this team counted one. So
the card explains its own boundary, the way the training page explains a denominator larger than the
list under it (decision 076): « 1 coach joue aussi, et apparaît dans l'effectif. » Nothing is said
when there is nothing to explain.

The general rule: **a heading is answerable not only for the rows under it, but for the rows a reader
would expect under it.** Splitting a list is a choice the app made; the reader did not make it and
cannot see it.

## 093 — A profile may only state facts about the member whose profile it is
**2026-09-23** · accepted

`/joueur/[id]` is one page rendered for twenty-four different members and read by any of them. Three
sentences on it were true of somebody — just not of the member whose name was at the top.

**The reader's fact, printed as the player's.** Under Ali's average, the card said « Les notes de
2 matchs sont exclus de cette moyenne : tu étais sur la feuille mais tu n'as pas noté tes
coéquipiers. » That two is `RatingVisibility.hiddenMatchIds.length`, which is a fact about **the
reader**: how many matches they have not finished rating. It is the right number on `/stats`, where
the note sits over a whole table, and it was the wrong number here in two independent ways. Karim's
second hidden match holds no rating about Ali at all — proved against the demo database, which has
notes in three matches only and four of them about Ali — so one of the two « exclus » matches had
nothing to exclude. And for Ali reading his own profile the average is « — »: nothing is excluded
*from* a number that does not exist, and the sentence explained an omission the reader could not see
while failing to explain the dash they could.

`ratingVisibility` now also returns `hiddenRatedCounts`, one count per rated member, built from the
author rows it already holds — so this costs no query and leaks no judgement, only the existence of
one. `hiddenRatingsNoteFr` says « Ses notes sur 1 match restent cachées tant que tu n'as pas noté tes
coéquipiers » beside an average, and « … : c'est pourquoi il n'y a pas de moyenne » when there is
none. The season-wide notes on `/stats` are left exactly as they were: they are true at table level,
which is the whole point of this entry.

**The squad's fact, printed as the member's.** The demo team's own `admin` is a member with
`is_player = false` and there is a second coach, so the profile renders every one of its cards about
them — and three spoke as though they were a player. « Le joueur ne pourra plus déclarer ses
disponibilités ni être convoqué » was untrue twice: `can()` refuses every entry in `SELF_ACTIONS` to
a member with `isPlayer = false` (« Only players act as players. A non-playing coach has nothing to
declare. ») and `/match/[id]` filters `isPlayer` before it draws the selection list. Removing them
takes away the team, not a place in it, so the card is now « Retirer de l'équipe » for them and
« Retirer de l'effectif » for a player. « Fiche joueur » headed a card whose only sentence says the
member is not one. And the jersey hint told a coach what to do « si le joueur n'a pas de numéro
fixe » about somebody who has no maillot at all.

« convoqué » went for a second reason, decision 085's: there are no convocation fields in this app by
design, and the eleven other places naming the same thing say « feuille de match ». A verb the data
model has no concept for reads as a feature the reader cannot find.

The general rule, which is decision 087's heading rule turned on the page instead of the list: **the
subject of a screen is the subject of every sentence on it.** A number that is true of the reader, or
of the typical member, has to be either recomputed for this member or moved to a screen whose subject
it is. All four sentences above were inlined in Server Components, where `vitest.config.ts` collects
nothing, which is why none of them failed a test for four milestones.

## 094 — What a member *is* comes from two columns, and never from one
**2026-09-23** · accepted

`team_members` says what somebody is twice, on purpose. `role` decides who administers the team;
`is_player` decides who turns out on a Sunday. They are independent — decision 005 is the one that
made them so, because the coach of an amateur side usually plays — and the four combinations are all
real:

| `role` | `is_player` | who that is |
|---|---|---|
| `coach` | true | Karim: the playing coach, the ordinary case in a 7-a-side team |
| `coach` | false | **the founder of every team**: `createTeam` inserts exactly this |
| `player` | true | everybody else |
| `player` | false | a member of the encadrement who is not a coach |

`/moi` derived its « Mon équipe » badge from `role` alone: `team.role === "coach" ? coach : joueur`.
That is wrong for two of the four rows and for a fifth reader the type allows:

- The founder demoted. `setMemberRole` writes `role` and deliberately leaves `is_player` alone, so
  one tap on « Retirer coach » turns row two into row four — and `/moi` then badged them « joueur »
  **directly above its own** « Tu fais partie de l'encadrement : pas de fiche joueur ». Two sentences
  contradicting each other inside 200 px, on the screen a coach opens about himself, two taps from the
  state every new deployment starts in. Reproduced against the demo team, whose `admin` is row two.
- `ActiveTeam.role` is `"coach" | "player" | null`, and null is a super admin pinned to a team he is
  not a member of (`getActiveTeam` has that branch and a comment on it). The ternary called him a
  « joueur » of a squad that holds no row for him at all.

`/joueur/[id]` has derived the same label from both columns since M1, inline, under this comment:
« Not simply « Coach » or « Joueur »: demoting a member of the encadrement would otherwise label them
« Joueur » next to their own « encadrement » badge. » The comment was right and stayed on one screen.
`memberBadgesFr` in `lib/team/membership.ts` is that comment made reusable — coach first and the only
accent, then « joueur » or « encadrement », and « non membre » alone when there is no membership — and
being in `lib/` it is finally testable, which is the whole reason the defect survived four milestones
on the other screen.

Two consequences on the same card stack, both the heading rule of decision 087 again. « Mon profil de
joueur » headed a card whose only line says you have no fiche joueur; it is now « Tu n'as pas de fiche
joueur », and the line below it no longer repeats those three words. And that line said « Tu fais
partie de l'encadrement » to both readers `profile` comes back null for, which is true of one of them:
the non-member reads « Tu n'es pas membre de cette équipe : tu la consultes en tant
qu'administrateur. »

The rule, and it is the reason to write this down rather than just fix it: **when the database needs
two columns to say what something is, so does the sentence.** A label derived from one of them is not
a simplification, it is a claim about the other one.

## NNN — A screen that names people names the reader as « toi », in every sentence

**2026-09-23.** Decision 007 makes the authors of ratings visible to everyone, which is what turns
the recap's « Les notes » card into a list the reader appears in twice: once as the author of the
four notes he gave, and once as the subject of the row about him. `RatingsPanel` had a rule for the
first appearance and none for the second.

On the demo season, read as `karim`, that produced three different shapes for one man inside one
card. Ali's row: « 8 **Karim (toi)** ». Karim's own row, three rows down: « 4 notes · **il** s'est mis
8 », with the chip « 8 **lui-même** ». And the comment he had written about Julien was signed
« — Karim », because the attribution branch never had the `(toi)` suffix the chip branch did. Nothing
here is a wrong number. Every one of them is the app talking about the person holding the phone as
though he were a fourth teammate, on the one screen the whole squad opens after a match — and it is
the same defect as the app's second-person rewrite (decision 074) left behind, in a place that
rewrite never reached because it was reading ratings, not addressing a reader.

`lib/rating/labels.ts` now answers both questions, once: `noteAuthorFr` for who signed a note, and
`ratingCountNoteFr` for the line under a name. **« toi » wins over « lui-même »** when both are true.
A self-note written by the reader is still the reader's, and the third person about a person who is
present is not a neutral choice of words — it reads as a different person.

`RatedPlayer` gained the `isViewer` this needed. It is the same one-line addition as `RatingReceived`
already carried, and it is worth noticing that the row-level flag was the *missing* one: the query
knew which notes were the viewer's and had no idea which row was his.

The general rule: **on a screen that names people, the reader is named « toi » wherever he appears —
not only where the code happens to compare authors.** Where a sentence can be about the reader or
about somebody else, it is two sentences, and the function that picks between them is testable.

What this deliberately does *not* do is degender « il s'est mis 8 » and « lui-même » for everybody
else. That is a real limitation — the app has no gender column and a mixed team would read wrongly —
but it is a product question about a team that does not exist yet, not a false sentence about the team
that does, and inventing « iel » or a genderless rewrite of six screens on the way past a ratings
card would be a decision taken sideways. Written down here so the next session finds it stated rather
than missed.
