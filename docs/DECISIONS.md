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
the timeline. And because `isAmendableEventType` reads `RETRO_FACT_TYPES` and not the retro sheet's
wider `RETRO_ACTION_TYPES`, **what a coach may type up and what he may correct are two lists on
purpose** — decision 134 says why they must not be merged, and that is how this rule is enforced in code. Every amendment is previewed through `reduceMatch` before it is written, which is how
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

## 095 — A screen that names people names the reader as « toi », in every sentence

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

**Amended the same day, with the screen that writes the notes.** `/match/[id]/notation` has one card of
the eleven that is the reader's own, for the same reason — decision 007 has him rate himself — and that
card asked for « Sa note pour ce match **(la tienne)** ». The parenthesis is the tell: somebody saw the
pronoun was wrong and appended a correction to it rather than choosing the right one, under a header
already badged « toi ». `ratingLegendFr` chooses. A parenthesis that repairs the sentence before it is
always two sentences wearing one.

The general rule: **on a screen that names people, the reader is named « toi » wherever he appears —
not only where the code happens to compare authors.** Where a sentence can be about the reader or
about somebody else, it is two sentences, and the function that picks between them is testable.

What this deliberately does *not* do is degender « il s'est mis 8 » and « lui-même » for everybody
else. That is a real limitation — the app has no gender column and a mixed team would read wrongly —
but it is a product question about a team that does not exist yet, not a false sentence about the team
that does, and inventing « iel » or a genderless rewrite of six screens on the way past a ratings
card would be a decision taken sideways. Written down here so the next session finds it stated rather
than missed.

## 096 — « Hors feuille » counts players, and the app knows which members are players

**2026-09-23.** Decision 094 found `/moi` deciding what a member *is* from `role` alone and ignoring
`is_player`. This is the same column being ignored one screen over, except that here it does not
produce a wrong label — it produces a wrong number, printed in three places, two of which disagree
with the third about the same eleven names.

The match sheet against Étoile du Parc holds eleven of the demo team's thirteen players: seven
titulaires, three remplaçants, one supporter. The team has a fourteenth member, `Coach`, who is
`is_player = false` and has never played a minute — row two of decision 094's table, the row every
new deployment starts in, because `createTeam` inserts exactly it.

- `/match/[id]`, the composition card: « 7 titulaires · 3 remplaçants · 1 supporter · **3 hors
  feuille** ».
- `/match/[id]/composition`, the header: the same line, from the same unfiltered list.
- `/match/[id]/feuille`, one tap away: « … · **2 hors feuille** », which is right.

Two of those are false, they sit one tap either side of the true one, and the first of them adds up to
fourteen on a card whose neighbour on the same screen says « 11 réponses sur **13 joueurs** ». A coach
counting on his fingers finds a player he cannot name. `squadSummaryFr`'s own doc comment predicted
the right answer — « a thirteen-player squad … leaves **two** players unaccounted for » — so the
sentence describing the code was correct while the code was not, for four milestones.

The cause is not the filter being wrong anywhere. It is that the filter existed in exactly one place,
inline in a `.tsx` page:

```
.filter((member) => member.isPlayer || member.squadRole !== null)
```

`getCompositionMembers` returns every member and carries `isPlayer` on the row, so both defective call
sites had the column in their hands and no reason to think they needed it. **A rule that lives at one
call site is not a rule, it is a habit** — and it is untestable where it sat, because Vitest collects
`lib/**` and nothing under `app/` (the same mechanism behind decisions 094 and 095).

`isSheetCandidate` in `lib/composition/plan.ts` is that line, named, and `countSquadRoles` now applies
it to its own input rather than trusting the caller to have done it. Trusting the caller is the thing
that broke. The disjunction is kept and is the interesting half: a non-player who *is* on the sheet
stays in the pool, because hiding him would leave the one screen that can take him back off as the one
screen that no longer shows him.

The rule, which is decision 094's applied to arithmetic rather than to a label: **a total the reader
can count has to be counted over the same set the reader is counting.** « Hors feuille » is not the
complement of the sheet within the membership, it is the complement within the players — and when a
sentence and a subtraction disagree about who is in the set, it is the subtraction that is lying.

## 097 — A test on a pure function proves nothing about a screen that never calls it

**2026-09-23.** Decision 085 stopped the compositions screen offering to plan the 30ᵉ minute of a match
played a fortnight ago. It derived `compositionsScreenFr` from the match's status and entry mode, wrote
the four honest sentences a played match needs, and `plan.test.ts` has asserted this ever since:

```
it("never tells a coach to place seven players in a match that is over", () => {
  expect(screen.noPlansFr.description).not.toContain("Place tes sept joueurs");
  expect(screen.noPlansFr.description).not.toContain("planifier");
```

That test has been green for as long as it has existed, and for all of it the « Composition » card on
`/match/[id]` printed, on a match played ten days earlier:

> **Aucune composition** — Place tes sept joueurs sur la pelouse : tu pourras ensuite planifier les
> changements. · **[ Composition de départ ]**

Word for word the sentence the test forbids, under a **primary** button pointing at an editor decision
085 taught to refuse a finished match — so the one call to action on the card was a door that answers
« non », on a screen whose real next action (« Saisir le match ») is the card directly below it.

085 derived the screen and never came back to the card that links to it. The card had its own pair of
empty states, hard-coded, written when the only match anybody pictured was one still to be played. So
the function was right, the test was right, the fix was right, and the screen was wrong — and nothing
in the repository could say so, because **Vitest collects `lib/**` and `db/**` and nothing under
`app/` or `components/`** (`vitest.config.ts`). That configuration is why French copy migrates into
pure `…Fr()` functions in this project; it is also why a component that declines to call one is
invisible. Decisions 093, 094, 095 and the « hors feuille » count each found the same shape. This is
the entry that names it, because the pattern is now the more useful finding than any of its instances:

**Deriving a sentence and testing it does not make it the sentence on screen. Only the call does.**

Two things follow, and the second is the new one.

The card now calls `compositionsScreenFr(match)` for both empty states, and drops the call to action
when `withCta` is false. One consequence is deliberate and worth stating rather than hiding: on a
scheduled match with an empty sheet the card's wording *changes*, from « Le groupe n'est pas encore
fait » to the screen's « Personne n'est encore retenu ». One function means one wording. The card's
version mentioned supporters and the screen's explains why only two of the three roles matter to a
pitch, which is the more useful half of the sentence on a card titled « Composition ».

And `lib/composition/copy.test.ts`, which is not a unit test: it reads the source of `app/`,
`components/` and `lib/` and asserts that the five status-dependent sentences appear in
`lib/composition/plan.ts` and nowhere else. It fails if a screen hard-codes one again, and it was
mutation-tested by putting the sentence back. It is narrow on purpose — it pins the sentences that are
*already* derived from a match's status, where a hard-coded copy is by construction a claim about a
match nobody checked, and it is emphatically not a ban on French in `.tsx`. Scanning source is a poor
substitute for testing a component. It is also the only cheap thing that can see across the boundary
`vitest.config.ts` draws, and this defect survived a whole milestone behind it.

## 098 — A destructive button's description is the confirmation dialog, so it names everything

The two « Supprimer » cards — `/match/[id]/modifier` and `/entrainements/[id]/modifier` — are plain
`<form action={…}>` with no dialog in front of them. That is deliberate and it stays: a confirmation
dialog is one more thing to get wrong, and a plain form works without JavaScript. But it has a
consequence that had not been drawn. **With no dialog, the description on the card is the confirmation
step.** It is the only thing between the coach and the loss, and it is read once, in a hurry, with a
thumb already over a red button.

Both of them named the cheapest thing they destroy. « Le match disparaît du calendrier, avec les
disponibilités déclarées. » On the demo season's next match that covered eleven availability answers
and said nothing about the eleven-row `match_squad` — the sheet somebody filled on a Thursday evening
— nor about the two rows in `lineups`, one of which holds « À partir de la 30ᵉ minute · Julien → Momo,
Léo → Yanis ». All three cascade. The sentence named one of three, and it named the one that costs
thirty seconds to redo rather than the two that cost an evening.

The training twin, « La séance disparaît du calendrier, avec les réponses déjà données. », omitted
`training_attendance` — and that omission is reachable, not theoretical: `AttendanceList` renders for
a coach whether or not the session is over, so attendance can be marked on a future séance, which is
exactly the window in which the delete button is offered.

`lib/calendar/deletion.ts` now writes both sentences from what the row actually holds. The change that
matters is not the extra nouns, it is that they are **counted**: « avec les disponibilités déclarées »
is a category, « et avec lui 11 réponses de disponibilité, la feuille de match et 2 compositions » is
a quantity, and a quantity is the thing that makes a hand stop. A match holding nothing says so —
« Rien d’autre n’y est encore rattaché. » — instead of warning about answers nobody gave.

The rule, which generalises past these two cards: **a destructive control states what it destroys, in
numbers, from the data it is about to destroy.** Not the category, not the first table that came to
mind while writing the copy, and never a static string — a static warning is a claim about rows the
person who wrote it could not see.

The corollary for anyone adding a table: a new `on delete cascade` onto `matches` or `trainings` is
not finished until it appears in `MatchDeletionHolds` or `TrainingDeletionHolds`. Which is also the
honest limitation of this fix. Nothing *enforces* that. A cascade added next month is invisible to a
warning that lists three counts by hand, and the test suite will stay green while the sentence goes
quietly back to being incomplete.

Deliberately not listed: `match_events`, `match_player_stats` and `ratings`. They cascade too, but a
match holding any of them has a non-empty log, and both the page and `deleteMatch` refuse that outright
(decision 003). Naming them would be describing a button nobody can reach.

## 099 — A présence may not be recorded about an evening nobody has lived

Decision 090 drew the line: `training_availability` holds what a player says he intends to do,
`training_attendance` holds what the coach saw, and « pas dispo » is a declaration about a Saturday
that has not happened while « absent » is an observation about one that has. It then fixed the
*words* on the three screens that had blurred them.

It did not close the door the words came through. `app/(app)/entrainements/[id]/page.tsx` rendered
`AttendanceList` for a coach with no reference to `over` at all. On the 26 September training, read
four days early, « Présences » sat over thirteen Présent/Absent rows, a « Tout le monde est là »
button and « Enregistrer les présences », every one of them in the present indicative about an
evening nobody had lived. The player's half of the very same ternary had reasoned about this from the
start — « before the session there is genuinely nothing to report; the coach has not failed to do
anything yet » — and the coach's half never did. The asymmetry is the whole finding: somebody thought
carefully about what a player should be told before a séance, in the same expression, and the
question never turned around.

It is not only a screen in the wrong tense. `getAttendanceMarks` in `lib/stats/queries.ts` filters by
team and not by date, so a pre-marked session enters the season statistics the moment it is written.
Proved against the demo season by inserting the thirteen rows one tap would have created: `/stats`
then reads « **3 séances pointées** » in a season of two, Brice's rate goes from 0/2 to 1/3 and
Fabien's with him — a player credited with attending a session that will not happen for four days.
That is the defect this repository exists to hunt, a screen stating something untrue, except that the
untruth outlives the screen and settles in the statistics.

So: **`attendanceIsOpen(startsAt, now)`**, in `lib/calendar/timeline.ts` beside the other durations.
It opens the pointage `ATTENDANCE_OPENS_MINUTES_BEFORE` = 30 minutes before kick-off, because a coach
arrives before his players and marks the first arrivals while they change, and it **never closes
again**, because a coach who forgot last Thursday must still be able to — which is the entire premise
of decision 076's « Présences pas encore pointées ». Both Server Actions check it. The page is a
courtesy; the action is the guard, and the guard was verified by forcing the list to render and using
it, with the table still empty afterwards.

The card stays rather than disappearing — a coach hunting for a control he has used before is a worse
screen than one that explains itself — and it says what to use meanwhile: « D'ici là, ce sont les
disponibilités au-dessus qui disent qui vient : ce que les joueurs annoncent est une intention, une
présence est un fait. » A refusal that does not name the right tool is half a sentence.

**`getAttendanceMarks` deliberately keeps no date filter.** With the write shut, the table holds
facts, and a second definition of « which sessions count » living in the stats query is exactly how
two screens come to disagree. The cost of that choice is that a row written before this change would
still be counted; there is none anywhere, because no production team exists yet (`docs/DEPLOY.md`),
and if one ever did the cleanup is a migration deleting marks on sessions that had not started, not a
`where` clause hiding them.

The general rule, which is 090's rule pointed at a write instead of a sentence: **a table that holds
observations may not be written before the thing it observes.** Getting the vocabulary right on the
screens that read it is half the job; the other half is the one place that writes it.

## 100 — A control that only replaces numbers may not move the page

**2026-09-23.** From the owner, on a phone: scroll down `/stats` to « Joueurs », tap « Buts » instead
of « Minutes », and the page jumps back to the title. The list sorted correctly — and the reader was no
longer looking at it.

The cause is a deliberate design meeting a framework default. Every control on `/stats` is a `<Link>`
writing a search param, and that is on purpose: `?competition=cup` and `?tri=goals` are shareable,
survive a reload, and work with no JavaScript, which `SegmentedControl` and an `onChange` handler would
all have cost. But the App Router scrolls to the top of the document on every navigation unless told
not to, and a sort tab *is* a navigation here.

Both link groups in `app/(app)/stats/_components/filters.tsx` now carry `scroll={false}` — the
competition chips as well as the sort tabs, because the chips had the same defect and only looked
innocent for sitting near the top of the page.

The rule, and it is the one worth keeping: **when a control's whole effect is to replace content that is
already under the reader's thumb, the viewport must not move.** In this codebase that means
`scroll={false}` on the `<Link>`, not demoting the control to client state — trading a shareable URL for
a scroll position would be the wrong way round.

One accepted limit: with JavaScript off, the tap is a full document load and the browser lands at the
top regardless. `scroll={false}` is an instruction to the client router. Fixing the no-JS case would
mean appending a `#joueurs` fragment to every sort href, which would then follow every shared URL
around; the no-JS fallback is a fallback, and landing at the top of a page whose numbers are correct is
not a defect worth that.

## 101 — A date is `27/09/2026`, everywhere, and a time is 24-hour

**2026-09-23** · accepted

« les dates doivent absolument être en francais DD/MM/YYYY, l'heure aussi sur un format de 24h ». The
repository already said dates are handled in `Europe/Paris` for display (`CLAUDE.md`) and already had
`formatTime` doing it correctly. It said nothing about the *shape* of a date, so three screens each
invented one.

The expensive one was `invite-manager.tsx`: a module-level `Intl.DateTimeFormat("fr-FR", { day:
"numeric", month: "long" })` with **no `timeZone`**, inside a client component. A formatter with no
zone uses the host's, which is the server's on the first render and the reader's after hydration — so
the expiry of an invitation was computed twice, in two zones, and could name two different days. It
also named no year, for a row whose whole job is to say when a code stops working. `lib/player/injury.ts`
hand-rolled « 22 septembre 2026 » from a month array for the injury history, and the calendar row
said « dim. 27 sept. » with no year at all, in a list that spans a season crossing 1 January: a row
that cannot say which 27 September it means.

So `formatDate` joins `formatTime` in `lib/calendar/time.ts`, with the same zone spelled out and the
same locale spelled out, and the screens call it. Two details in it are the point rather than
decoration. `2-digit` on both day and month, not `numeric`: in a column, `3/10` under `27/09` does
not line up, and `tabular-nums` can align digits it has but cannot supply one it hasn't. And
`hour12: false` is now explicit on the time formatter even though `fr-FR` already implies it — the
locale string was the only thing standing between a kick-off and « 7:00 PM », and a locale is the
kind of argument someone eventually parameterises.

~~Digits do not win everywhere, and the split is by what the reader is doing rather than by taste.
Where a date is **a fact to read off** — a list column, an expiry, a record of a day — it is digits,
because the eye compares them without reading. Where it is **a sentence** — « Blessé depuis le 13
septembre », « Dimanche 14 septembre à 10:30 » — the month stays a word, so `formatDayMonthFr` and
`formatDay` are untouched.~~ **Superseded by decision 109: the sentence gets digits too.** The
calendar row keeps the weekday above the numeric date: « dim. » is the fact a coach actually scans
for, and the year underneath it is what makes the row unambiguous in February.

`toLocalInput` and `fromLocalInput` are deliberately left in ISO. They are the wire format of
`<input type="datetime-local">`, not something anybody reads, and the browser renders that control
in the reader's own locale — which on a French phone is French already, and which no formatter of
ours can change.

## 102 — Noter est deux gestes : choisir, puis avancer

**2026-09-23** · accepted

In the rating flow, tapping a score selects it and does nothing else. « Suivant » is the only thing
that advances. On a card with no score selected that button says « Passer sans noter »; on the last
card there is no forward button at all, only the submit beneath it.

**Why.** The owner: « quand on note les joueurs, il faut que l'on remarque la note qui est
sélectionnée. pour l'instant, il n'y a aucun effet visuel car on passe directement au joueur
suivant. » The pad already *had* a selected state — accent fill, accent-ink digit — and it was
correct. It was simply never on screen: `setScore` called `goNext()` in the same handler, so the card
the reader had just answered was replaced in the same frame. There was no moment in which his answer
was visible, which means no way to check it and no way to notice a mis-tap on a thumb-sized target.
The second tap costs eleven taps across a sheet and buys the only thing the pad was for.

It also removes an invisible rule: the old flow advanced *unless* a comment had been started, so one
gesture did two different things depending on a textarea the reader may have typed one character
into.

**Consequences.** The selection cannot lean on colour alone — a filled token, a `ring` halo, a
larger and bolder digit, and « Note choisie : 8 / 10 » in words in an `aria-live` region, because a
fill is hard to read on a phone in the sun and silent to a screen reader. « Passer sans noter »
rather than a disabled « Suivant »: a partial set is legal (decision 023), so skipping must stay
possible, and a button that looks pressable and does nothing is a defect this repository has already
paid for twice. The last card renders no forward button rather than a greyed one, for the same
reason.

The write contract does not change — one POST for the whole sheet — but the second tap makes the gap
between *chosen* and *sent* visible, so the screen now states it: « 3 notes choisies, pas encore
envoyées. » A reader who selects a note and closes the tab still loses it, as before; he is no longer
left to find that out for himself.

Labels, enablement and the derived sentences live in `lib/rating/flow.ts` (decision 097). The
Playwright happy path now taps twice per teammate and asserts the card did *not* move between the two
taps, which is the regression itself.

## 103 — Home and away are said in words, in a preposition, everywhere a match is named

**2026-09-23** · accepted

`matches.is_home` has existed since the first migration, the match form has always asked for it, and
two screens badged it. The owner still wrote « il n'y a pas de différence entre les matches "à
domicile" ou "à l'extérieur" » — and about the screens he was right. Everywhere a fixture was
*named*, the app printed the bare opponent, so a season of calendar rows read identically whether the
team travelled or received. `/stats`' form guide stated it **only inside a `title` attribute**, which
on a phone is nowhere (decision 072), and said « contre » about away matches anyway. Game mode's
final-whistle sheet said « Score final 3 – 1 contre X » about a match played at X's ground, `jeu/page.tsx`
carried an inline `{isHome ? "contre" : "chez"}` — a third vocabulary, in a `.tsx` file no test reads
— and the availability control asked for « Ta disponibilité contre X ». The WhatsApp reminder named
the opponent, the competition and the kick-off, and not the ground: the one thing the app knows that
the group chat does not.

**A team names its own fixtures with a preposition: « contre X » at home, « à X » away**
(`matchNameFr`). It is what a coach says out loud, and it is what fits — on a 390 px row that
truncates, the difference costs five characters where a badge costs forty, and it lands on the line
nothing truncates instead of in a 12 px subtitle. Capitalised in a heading, because then the first
letter *is* the difference, which is the letter the eye lands on down a column.

Two rules come with it. The side is never reordered into the score: `scoreLineFr` stays ours-first at
home and away (decision 061). And `venuePhraseFr` binds the free-text `venue` to the side that gives
it meaning — the side always leads, the pitch is only ever appended, and a match with no venue still
reads « à domicile », which is true and is the fact the reader came for. « Stade du Parc » alone is
our ground or theirs depending on a boolean the row never showed.

The match form's « Terrain » hint follows the control above it (`venueFieldHintFr`): « Le terrain où
tu reçois. » / « Le terrain de l'adversaire. » A free-text pitch name cannot be verified, but the
field can say which pitch it is asking for, which is the only contradiction this pair can produce.

Left bare on purpose: the back links `← Étoile du Parc`, which are navigation labels pointing at a
page whose `h1` is that name, and the match and recap `h1`s, which have the badge immediately above
them. A preposition on a link that is really a breadcrumb is noise.

All of it is derived in `lib/calendar/labels.ts` and `lib/stats/format.ts` and pinned by unit tests,
because Vitest collects nothing under `app/` (decision 097). The inline ternary in game mode is the
argument: it was both a third wording and a sentence no test could see.

## 104 — One garment, two permissions: the coach hands out the number, the player owns the name

**2026-09-23** · accepted

« fiche d'un joueur, possibilité de mettre son nom sur le maillot en plus du numéro. » The obvious
implementation is a second field in `JerseyForm`, which posts to `updateMember`, which is gated on
`member:update` — and `member:update` is a coach. That would have shipped a screen on which Momo
cannot change the word printed on Momo's own back, on the page whose subject is Momo (decision 093).

The two values look like one thing and are not, and the difference is not about seniority:

- A **number** has to agree with the twelve other numbers in the squad. `updateMember` has refused
  one already worn since M0 (« Ce numéro est déjà porté par un coéquipier. »), and the profile has
  told a player « les numéros sont attribués par le coach : demande-lui si tu veux changer. » A
  number is inventory, and inventory is administered.
- A **flocage** agrees with nothing and nobody. Two players may both be floqués « JUNIOR » and
  neither is wrong. It is rarely even a name — « MOMO », « BENJI », « EL PROFESSOR » — which is why
  it cannot be derived from `users.display_name` and has to be its own column.

So `profile:editShirtName` joins `SELF_ACTIONS`, and `updateShirtName` uses the `assertCanActFor`
shape the preferred positions already use: the self action first, the coach's `member:update` as the
fallback. A player edits his own, a coach may type a nickname for a teammate, and `can()` takes both
decisions — no ad-hoc check (invariant 4). Deliberately **not** a wrapper around `updateMember` the
way `updateJerseyNumber` is: wrapping it would have re-imposed `member:update` and produced exactly
the screen this entry exists to avoid. One consequence, stated rather than discovered later: `can()`
refuses every `SELF_ACTIONS` entry to `is_player = false`, so a member of the encadrement cannot
invent a flocage for a maillot he has not got — only a coach can. That is the asymmetry the jersey
number already has, and `shirtNameHintFr` says so in the same words `jerseyHintFr` does.

The rule: **when two fields of one record answer to two different owners, they are two forms and two
actions, not one form gated on the stricter of them.** A single form has to be shown to whoever may
change the most restricted field in it, so every other field in it silently becomes that restricted.

Three smaller choices, each of which had a wrong answer available:

**12 characters, checked in the database.** `char_length between 1 and 12`, beside
`team_members_jersey_range`'s `between 1 and 99`. The limit is the shirt and not the column: the
flocage prints across the width of a 7-a-side back above the number, and past a dozen characters the
printer shrinks it to something unreadable or refuses. The `1` matters as much as the `12` — it
rejects `''`, so « no flocage » has exactly one representation and no screen has to tell `''` from
`null`. Enforced three times (the constant, the Zod schema, the check), and `shirt.test.ts` reads
`db/schema.ts` to assert the number has not drifted, because a form that accepts what the column
refuses is a 500 on save rather than a validation error.

**Uppercased at display time, stored as typed.** A real shirt is printed in capitals, so
`shirtNameDisplay` uppercases — with `toLocaleUpperCase("fr-FR")`, so « é » becomes « É » like the
flocking machine does. It does not uppercase on the way into the column: the player typed « El
Professor », that is his, and a column holding a display artefact is a column that cannot be
displayed a second way later.

**Null is the normal case, and it is the case that was designed.** Most members will never have a
flocage. So nothing renders a dash: the fiche reads « Nom sur le maillot : aucun », matching the
« non attribué » the number line above it already uses, and `shirtNameRowFr` returns `null` rather
than `""` for a squad row so the caller *cannot* emit the stray « · » an empty string would have
produced between the username and the position codes. The demo fixture sets a flocage on three
players of fourteen for the same reason: a seed where everybody has one cannot show whether the empty
case reads correctly, which is the failure mode of the last ten defects in this repository.

Shown on two screens and no more: the fiche, where it is set, and the `/equipe` squad row, which is
the list a coach reads when he orders a set of shirts — as « floqué MOMO », because « MOMO » alone
between two « · » separators reads as another position code. Not on the pitch discs, and that is a
choice rather than an omission: a disc is a 44 px target that already carries a number and a short
name, and the flocage would be the same person printed on it twice.

## 105 — The bench is docked, and the pitch is capped to fit above it

**2026-09-23** · accepted

On the composition editor the turf is capped at 280 px wide — 410 px tall at its fixed 1080:1580
ratio — and the bench, the blocking errors and the confirm button are a single sticky dock pinned
just above the tab bar. The bench is one horizontally scrollable strip of 64 px discs, titulaires
first, then a hairline, then remplaçants.

**Why.** « il faut que ce soit plus compact, pcq actuellement les joueurs sur le banc sortent de
l'écran, donc c'est pas trop possible de les drag and drop. » At 390 px the card interior is 326 px
and the pitch was `w-full`, so the turf was 477 px tall; above it sat a page header, a settings card
of stacked fields and a mode control, and below it two headed sections of wrapping rows worth about
300 px. The bench therefore started some 800 px down a 740 px viewport. **A drag whose source and its
target cannot be on screen at the same time is not a cramped layout, it is a broken feature**, and it
shipped that way.

The cap has a floor as well as a ceiling, and the floor is why the discs did not shrink. The playing
area is `1000/1080` of the box, so a 48 px disc spans `48 × 1000 / (0.926 × 280)` = 185 pitch units,
under the 195-unit `MIN_MARKER_DISTANCE` that guarantees two slots are apart: at 280 px the discs
still cannot touch, and below 266 px they would. So the discs stay 48 px, above the 44 px minimum —
**compactness is never bought out of the drop target.** From `sm` the dock returns to the flow and
the turf grows to 384 px wide, rather than staying phone-sized on a laptop.

Docking also repairs something already shipped: the save bar was `sticky bottom-3`, which is
*underneath* the fixed tab bar. One sticky element at the tab bar's own offset — the one game mode
already uses — removes that arithmetic instead of adjusting it. At 390 × 740 the dock is at most
~196 px, so 740 − 56 − 72 − 196 = 416 px remain for 410 px of pitch: turf, bench and « Créer la
composition » with no scrolling at all.

**Consequences.** The strip is the one scroll container that could eat the gesture, so its discs are
`touch-pan-x` rather than `touch-none`: the browser may take a sideways swipe to scroll the strip (we
get `pointercancel` and write nothing), while a vertical lift onto the turf and a tap both stay with
our pointer capture. Decision 073's argument for a wrapping bench — a player off the right edge is a
player forgotten — is answered in words instead of in pixels: `benchHintFr` always says how many are
waiting and how many posts are open, « 9 au banc, 3 postes libres ». And the tap path is now the one
the screen leads with (« Appuie sur un joueur puis sur un poste »), the drag being the shortcut rather
than the instruction — which is also the path the e2e suite drives.

Two things gave up their line to pay for this. The gesture commentary is now `sr-only`: everything it
says is visible on the turf a centimetre above, so on screen it was a duplicate costing the one
currency this layout has none of, while for a screen reader it is the only account of what the
gesture did and so it stays announced. And « À partir de la minute » is labelled « Minute », because
in a 157 px column it wrapped to three lines while the card's own title already reads « À partir de
la 30ᵉ minute ».

The sentences are derived in `lib/composition/hints.ts` (decision 097), including the branch the old
screen did not have: a bench with nobody on it used to print « Appuie sur un joueur puis sur un poste »
regardless.

## 106 — A new composition opens with the team already on the pitch

**2026-09-23** · accepted

Creating a composition « à partir de la 10ᵉ minute » opened an empty pitch, so a coach who wanted one
substitution placed seven players. The owner's note stopped mid-sentence — « quand on crée une
deuxième composition (par exemple pour la 10e minute), il faudrait qu… » — and he chose the obvious
ending: **the editor opens pre-filled with the composition in force at that minute, and the coach
moves only what changes.**

« In force at that minute » is the composition with the greatest `from_minute` **strictly below** the
new one, which is emphatically not « the last one created »: a coach who has planned the 20th and then
adds the 10th inherits the starting seven. That rule already existed as `planInForceBefore` — it is
what chooses the team « Changements déduits » compares against — and `lib/composition/prefill.ts`
reuses it rather than growing a second notion of the same thing. Had it reimplemented it, the pitch
would have opened with one team and been measured against another.

The formation is inherited with the players, otherwise seven players would land in slots that do not
exist; changing it afterwards remaps the placement slot by slot, as it already did (the keeper stays
the keeper). A player inherited from the 0th minute who has since left the match sheet, or the team,
is **not** placed: his post stays open, the save stays blocked on « Il reste un poste à pourvoir », and
the notice names him. An applied composition is a legitimate source — at the 25th minute of a live
match it is the team on the pitch — and copying it is a read.

**This applies nothing** (invariant 3). `prefillFromPlans` is a pure function over rows the page has
already read, and it returns the editor's initial state; `saveLineup` is unchanged and the only path
to a row is still the coach's submit. Opening the editor and leaving still leaves nothing behind.

Which is exactly what the screen now has to say, because seven pre-filled discs look precisely like a
plan that exists. The footer said « À jour. » about a composition that had never been written —
decision 097's defect once more, in the sentence a coach glances at to decide whether he can leave. So
`editorSaveStateFr` answers « Rien n'est encore enregistré. » for anything new, dirty or not, and
`prefillNoticeFr` states the provenance above the form: « Équipe reprise de la composition
« composition de départ » : déplace seulement ce qui change. Rien n'est enregistré avant que tu
valides. » It goes away the moment he moves somebody, because from then on « Changements déduits »
says what he has done — one line, « Léo → Yanis », where an empty pitch used to print seven departures
for a coach who had touched nobody.

## 107 — The competitions a team plays in are the coach's data, not ours

*2026-09-23*

`matches.competition` was a Postgres enum: `league`, `cup`, `friendly`, `tournament`, printed through
a `COMPETITION_LABELS` map in `lib/calendar/labels.ts`. So the vocabulary of every team on the
installation was decided in this repository, by us, once. A 7-a-side team playing a « Coupe du
district » alongside its league, or a winter futsal session that is neither a friendly nor a
tournament, had no way to say so — and the owner's remark is exactly the right question: *qui définit
les compétitions ?* The coach does. He owns the season; the words for it are his.

**Decision.** A `competitions` table, owned by the team: `team_id`, `label_fr`, `sort`, `archived_at`,
unique on `(team_id, label_fr)`. `matches.competition_id` points at a row, `on delete restrict`.
`/equipe` gets the CRUD, behind `competition:manage` in `COACH_ACTIONS` — the same page that already
holds the squad and the invites, because that is where the coach configures the team.

Four consequences worth stating:

**The four old values survive as a starting point, not as a schema.** `DEFAULT_COMPETITIONS` in
`lib/competition/defaults.ts` is what `createTeam` writes into the new team's own table, and the
migration backfills the same four for every team that predates it. A new team therefore behaves
exactly as before until the coach changes something — the feature costs nobody a setup step.

**The migration is a data migration, and its order is the safety.** Table, backfill of the defaults,
nullable column, `UPDATE … CASE` mapping every existing match by label, `SET NOT NULL`, then drop the
enum. The `SET NOT NULL` is a deliberate fail-loud: a match the `CASE` did not map aborts the whole
migration rather than quietly losing which competition it was played in.

**`restrict`, not `cascade`, and archiving rather than deleting.** Deleting a competition still filed
on a match would take the match with it, or silently blank the one field the stats filter on. So the
database refuses, the screen says which matches hold it, and a competition the team no longer plays is
*archived*: it keeps filing its old matches and stops being offered on the form. Stats filter on the
id, never on the label, so renaming « Championnat » to « D3 » renames it everywhere at once and breaks
no saved link.

**No label map left.** `COMPETITION_LABELS` and `COMPETITION_ORDER` are gone; the label travels on the
row, through the join, in `MatchRow.competitionLabel`. A screen can no longer print a competition name
the team never chose, because there is no map to print it from.

`docs/PLAN.md` described the enum as approved scope; its table and its data-model sketch now describe
the table instead, pointing here.

## 108 — Every tag gets a GitHub release, cut by the same job

*2026-09-23*

Decision 081 made CI tag `main` from the `version` field in `package.json`, and said in as many words
that it would not write release notes: *"the tag message is the commit subject, and the history is the
changelog."* The owner asked for releases as well as tags, every time the version moves. This entry
supersedes that one sentence of 081; everything else in it stands.

**Decision.** The `tag` job publishes a GitHub release for the tag it just created, with the squashed
commit subjects since the previous tag as its notes. It is one step in the same job, gated on that
job's own output, so a re-run of an already-tagged commit publishes nothing twice and a version whose
migration failed still gets neither tag nor release.

**Why the notes are the commit subjects.** This repository squash-merges one pull request per slice,
and the subject line of each squash is written to say *why* the slice exists. So « one line per
merged pull request » is already the changelog 081 pointed at — the release page just puts it
somewhere a human can read without a terminal. Nothing new has to be maintained, and there is no
second place for the story of a version to drift out of agreement with the first.

**Why in CI and not by hand.** Same argument as 081's: `gh release create` typed after a merge is a
convention that survives two sessions. And a release created by hand is a claim about a version
nothing verified — exactly what `CLAUDE.md` forbids about tags, for exactly the same reason.

The first release this cuts is `v0.2.0`, the wave of eight remarks the owner made on 2026-09-23.

## 109 — The sentence gets digits too

**2026-09-23** · accepted · supersedes the prose carve-out in decision 101

Decision 101 split dates in two: digits where a date is a fact to read off, the month spelled out
where it sits inside a sentence. That split survived exactly as long as it took to look at eleven
screens at 390 px in both themes, which is the review `CLAUDE.md` asks for and which decision 101 had
not had.

**What the screenshots showed.** The prose date is never alone. `/match/[id]` printed « Dimanche 27
septembre à 10:30 » in its header, three centimetres above the calendar list where the same fixture
is « dim. 27/09/2026 ». The player fiche puts « Blessé depuis le 13 septembre » under « Arrivé le
01/08/2026 ». So the reader is not reading a sentence, he is comparing two shapes of the same fact —
and removing that work is the entire reason the numeric shape exists. 101's own rationale defeats
101's exception, once you can see both halves at once.

**Decision.** One shape, everywhere: `DD/MM/YYYY`, zero-padded, year always. In prose the **weekday
stays**, because it is what a coach actually scans for, and the date behind it is digits:

- « dimanche 27/09/2026 à 10:30 » — `formatWhen`, the match and séance headers
- « dim. 27/09/2026 » — `formatShortDay`, the calendar row
- « demain, 28/09/2026 » — `formatDayLabel`, for the three neighbouring days only
- « Blessé depuis le 13/09/2026 » — `injurySummaryFr`, via the `formatDateFr` it already imported

`MONTHS_FR` and `formatDayMonthFr` in `lib/player/injury.ts` are deleted with their last caller, and
so are `DAY_FORMAT`, `DAY_WITH_YEAR_FORMAT` and `SHORT_DAY_FORMAT` in `lib/calendar/time.ts`. That is
the load-bearing part: a hand-rolled month array that no longer has a caller is a trap for the next
session, which will find it and assume the app wants a month somewhere.

**The year is unconditional now, and that is a change from 101 as well.** `formatDay` used to take a
`now` and drop the year inside the current one. A season crosses 1 January, so « 27 septembre » in a
February archive is a row that cannot say which 27 September it means — and the saving was four
characters. Dropping the parameter also makes the function pure in the only sense that matters here:
its output no longer depends on when it is called, so the tests say what they mean.

**What is still not ours.** `<input type="date">` and `<input type="datetime-local">` render in the
*browser's* locale, so a French kick-off can still be typed into a field showing `MM/DD/YYYY` on a
phone set to English. `toLocalInput` / `fromLocalInput` stay ISO because that is the control's wire
format (101 was right about that). Replacing the native control with our own is a real change with a
real cost — offered to the owner, not taken.

## 110 — A beta is a pre-release, and `1.0.0-beta.1` is the first one

**2026-09-23** · accepted · extends decisions 081 and 108

The owner asked for a beta release and a tag. Both already have a path — `package.json` holds the
version, CI cuts the tag (081) and publishes the release (108) — so the only thing missing was what a
beta *is* in that pipeline.

**Decision.** A beta is an ordinary version bump whose string carries a semver pre-release suffix:
`1.0.0-beta.1`. Nothing else changes. It goes through a pull request like any other bump, CI tags
`v1.0.0-beta.1` once the checks and the migration pass, and the release step publishes it with
`--prerelease` — decided by the presence of a hyphen in the version, because that is exactly what
semver says a pre-release looks like, and it means no second switch to keep in agreement with the
first.

**Why `--prerelease` matters.** GitHub moves its « Latest » badge to the newest non-pre-release. A beta
published as a normal release would take that badge and tell anyone opening the repository that the
beta is the current version of the app. The badge is the only part of a release page most people read.

**Why `1.0.0-beta.1` and not `0.3.0-beta.1`.** The season loop is complete: calendar, availability,
match sheet, compositions, live match, statistics, ratings, training attendance, deployment. What is
left before this can be called finished is not a feature but a verification — `docs/DEPLOY.md` §6, the
app in a coach's hand at the pitch, outside, in daylight. That is precisely what a beta is for, so the
number says so: the next version after the phone test passes is `1.0.0`.

**What a beta does *not* change.** It deploys exactly like everything else, because only `main` deploys
(080) and this is on `main`. There is no separate beta channel, no preview environment for it, and no
hand-cut tag — a tag nothing verified is still forbidden (081).

## 111 — The functions run where the database is

**2026-09-23** · accepted

The owner tested the beta on an iPhone and reported « le tactile est hyper lent » — around two
seconds between a tap on a tab and anything happening. Before touching a line of client code, the
deployment was inspected: every serverless function was running in **`iad1`** (Washington), Vercel's
default, while the Neon project is in **`eu-west-2`** (London).

**Why that produces exactly this symptom.** Every tab on this app is a real navigation to a Server
Component, and every one of those makes several *sequential* queries — `getActiveTeam`, then the
members, then the matches, then the counts. Each query is a separate round trip from the function to
the database, and from Washington to London that is ~80 ms each, before the phone's own leg from
France to Washington (~100 ms each way) is counted. Five sequential queries is half a second of pure
distance; eight is most of a second; add TLS, the pooler and the RSC payload and two seconds is not
surprising. Nothing in the code was slow — the bytes were being posted across an ocean twice.

**Decision.** `vercel.json` pins `"regions": ["lhr1"]`, the same city as the database. Compute goes to
the data, not the reverse: the phone makes *one* round trip per interaction, the function makes
*several* per render, so the leg worth shortening is the function's. London rather than Paris for the
same reason — `lhr1` is metres from `eu-west-2`, and the extra ~10 ms from France is paid once.

**What this is not.** It is not a fix for the app doing sequential queries where it could do parallel
ones, and it is not a substitute for telling the reader a tap was received. Both are real and both are
separately worth doing — the second is what actually makes an app feel instant, because a tap that
paints in 80 ms feels immediate while a tap that paints in 400 ms with no acknowledgement feels
broken. This entry only removes the ocean.

**How to check it, since a decision that cannot be verified is a claim.** `vercel inspect <url>` lists
every function with its region in brackets; before this it read `[iad1]` five times. The honest
measurement is the phone itself, which is where the report came from.

## 112 — Game mode gets the whole phone, and its own route group

**2026-09-30** · accepted

The owner asked, about the one screen used standing on a touchline: _« quand j'arrive et que je scrolle
en haut, le terrain doit être presque entièrement visible, là il est à peine visible »_. He was right,
and the reason was measurable rather than aesthetic. At 393 × 852 the chrome above the pitch was: app
header 59 px, `main` padding 16, back-link row 44, scoreboard ≈ 98, gap 16, and the « Sur le terrain »
card header 68 — **≈ 325 px**. The pitch is drawn to a fixed 1080/1580 aspect ratio, so inside a `p-4`
card inside `px-4` main it was 329 px wide and therefore 481 px tall, of which **318** fell in the
clear band. On a real iPhone, where Safari's URL bar takes 50–90 px until the page scrolls, closer to 230.

**Decision.** Game mode does not live in `AppShell`. `app/(app)/layout.tsx` wraps everything in it and
a nested layout cannot remove a parent layout's chrome, so the route moved to a sibling group:
`app/(jeu)/match/[id]/jeu/`. **Route groups do not affect the URL** — `/match/<id>/jeu` is unchanged,
every link to it still works, and the e2e happy path is the proof. `app/(jeu)/layout.tsx` keeps
`requireTeamContext()` verbatim, so invariant 5 is enforced exactly as before, and renders no header,
no tab bar, no theme toggle and no skip link: there is no navigation to skip past, and the only way out
is the back button in the screen's own top bar.

What that bought, and what was spent to get it: the header (59) and the tab bar (56) are gone for free;
the scoreboard card, the back-link row and the pitch card's header were **replaced** by one 56 px
`MatchBar`, which prints the time and the live score. The venue badge and the phase line were each true
and neither is read at 78′ — they are one tap away on the match page, which is where a reader who wants
them already is. 325 px of chrome became 64. The pitch went from 481 px tall with 318 visible to 540 px
tall against 715 available.

**Three things were cut with them that had to come back, and the difference matters.** « Not read at
78′ » is a fair reason to drop a badge. It is not a reason to drop something a reader cannot recover:

- the old `Scoreboard` printed a visible caption « Nous – Courges » under the figures, and its own doc
  comment said why — away from home « 0 – 2 » is a team two goals **up**, and the caption was the only
  thing saying which way round the figures were meant. Replacing it with an `aria-label` told the one
  reader who did not need telling. « Nous » is now a word on the score's own baseline, inside the row,
  because a caption under the figures would cost the row the 56 px that are the whole of this entry;
- « saisi après le match » came back for the same reason, and it is decisions 013 and 048 rather than a
  preference: this screen prints the largest minute in the app, and on a log typed up afterwards the
  badge is the one thing qualifying it. It sits in the hairline under the row, so it costs no height
  when there is nothing to say;
- the `aria-label`s meant to compensate were on a `<span>` and a `<p>`, and **ARIA 1.2 forbids a name on
  `role=generic` and `role=paragraph`** — a conforming screen reader ignored both and read « 1 – 0 » and
  nothing else. Both now carry `role="img"`, which is a role that takes a name.

None of the three was caught by a test, and none would have been: they are a screen saying less than the
truth, which is the class of defect this repository's definition of done singles out, and the reason a
review reads the diff rather than the suite.

**A fourth, from the move itself.** `notFound()` in game mode resolved to `app/(app)/not-found.tsx`,
whose « la page n'existe pas, **ou elle est réservée aux coachs** » is deliberately ambiguous because
`getLiveMatch` returns null both for a match that does not exist and for one belonging to another team.
Outside that group it fell through to `app/not-found.tsx`, whose own comment records that its wording is
false for exactly this case. Moving a route moves which `not-found.tsx` answers for it, so
`app/(jeu)/not-found.tsx` is a sibling and not a duplicate — with no `<main>` of its own, because the
group layout already renders one and two `main` landmarks is invalid HTML.

**A second thing this closes, which was arithmetic and not a rendering glitch.** The owner reported a
gap between the ACTION bar and the tab bar. The bar was pinned at
`bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]` — 72 px — while `BottomNav` is `min-h-14`, 56.
72 − 56 = **16 px of scrolling page showing through, at every inset**. With no tab bar to clear the bar
sits at `bottom-0` and the gap has nowhere to be. The composition editor still carries its own copy of
the same defect (`docs/ROADMAP.md`), and so do the three different numbers the app uses for the tab
bar's height — `4.5rem` in two sticky docks, `4rem` in the `tabbar-pb` utility, `min-h-14` in the bar
itself. Game mode stops depending on any of them; unifying them belongs to the screen that still does.

**The cost, stated plainly.** There are now two application layouts with the same guard, and a change
to what « signed-in member of a real team » means has to be made in both. That is a real duplication and
it is the price of a route that is not in the shell. The alternative — a flag threaded through `AppShell`
to hide itself — makes every other screen in the app pay attention to game mode, which is worse.

## 113 — The log decides whether a match is over; `matches.status` is a cache of it

**2026-09-30** · accepted

The owner asked _« how is it possible that a match can be resumed (in the match mode) and at the same
time, have the summary of the match »_. It needed no race to explain. The match page gated its
« Après le match » card — « Voir le résumé », « Noter mes coéquipiers » — on `status !== "scheduled"`,
and its « Mode match » card on anything but a finished match with no score. **For every ordinary
in-progress match both were true**, so « Voir le résumé » sat directly above « Reprendre le mode
match ». The recap only refused a `scheduled` match, so it then produced a man of the match, a minutes
table and a result for an afternoon that was 0–0 in its 12th minute. The header did the same thing in
one word: `resultLabel` printed « Victoire » beside a live 2–1.

**Decision.** *Finished* is one fact with one test, and it is `status === "finished"`. Both gates use
it, and the recap refuses anything else the way it already refused a scheduled match — an `EmptyState`
saying « Le match n'est pas terminé » and a link to the one screen that can actually end it. « Has
kicked off » is a different fact, and the only thing that should ever be gated on it is history: the
availability grid below still reads `!== "scheduled"`, correctly, because « 11 réponses sur 13 » was
true from the kick-off onwards.

**Where `status` comes from, and what it therefore is.** `matches.status` is a stored column;
`state.finished` is derived from a `FINAL_WHISTLE` in the log by `lib/match/reducer.ts` (invariant 2).
The log is the source of truth and the column is a **cache of it**, maintained by `finalizeMatchById`.
If that call fails after the event lands, the two disagree until someone opens game mode, which
self-heals. So a screen may read `status` — it is cheap and it is nearly always right — but it must
never read it *as a second opinion*: nothing in the app is allowed to decide « finished » one way in one
place and another way in another.

**What is not done here, deliberately.** The match page does not self-heal. It loads with `getMatch` +
`getMatchScore`; `finalizeMatchById` calls `getLiveMatch`, which is seven queries, and paying that on
every view of an unfinished match cuts straight across the latency work decision 111 started. The cheap
version is one existence query — `hasFinalWhistle(matchId)`, the `hasMatchEvents` shape with
`type = 'FINAL_WHISTLE'` and the same not-voided predicate — and it is on the roadmap. Until it exists,
a match whose log holds a final whistle but whose column still says `live` badges « En cours » on the
calendar and, now, hides « Voir le résumé » until somebody opens game mode once. That is a smaller lie
than the one this entry removes, and it is written down rather than left to be discovered.

## 114 — One comment, four tiles, and « Faute » no longer offered

**2026-09-30** · accepted

Every action game mode could record was a fact that moves a number: a goal moves the score, a
substitution moves a player, a `POSITION_CHANGE` moves a shirt. Nothing could record the sentence that
explains a scoreline three weeks later — « mur mal placé sur le coup franc », « l'arbitre a laissé
jouer » — so the *reason* a match went the way it did lived nowhere at all.

**`COMMENT`** is a free-text note of up to 280 characters and, optionally, the player it is about. It is
inert by construction: both of the reducer's switches already end in `default: break;`, so it changes
no score, no clock, no minutes and nothing on the pitch, and the reducer test proves that by comparing
the entire state of a log reduced with and without it. The only reducer change it required is
`note: string | null` on `TimelineEntry`, which had no field for free text and therefore no way to
display one.

It belongs in the recap, which is where a note written on a touchline is actually read three weeks
later, and `HIDDEN_EVENT_TYPES` — `PAUSE`, `RESUME`, `VOID` — correctly does not hide it. **This entry
first claimed it therefore appeared there automatically, and that was wrong.** The recap builds its
timeline with its own `describeActors`, not the presenter's, and neither knew about `note`: the line
rendered « 14’ · Commentaire » with an empty detail, so the 280 characters the coach typed were
recoverable only from the raw log. The review of the pull request caught it. The fix is one exported
`noteDetailFr` in `lib/match/presenter.ts` that both call, rather than a second `commented` branch in
the recap — the duplication was the defect, and a second copy would have hidden the next event type
just as quietly. The rest of the two builders stays deliberately separate: the recap says « Julien
Marchal, passe de Karim Benali » and game mode « Julien (passe de Karim) », both pinned by tests, and
unifying those would be a change of copy dressed up as a refactor.

The lesson is the one decision 097 already states in other words: a claim in a decision entry is not
evidence. « It appears automatically » was an inference from `HIDDEN_EVENT_TYPES`, and nothing had been
looked at.

It is also the only step in game mode with a keyboard, so it is the only one that is a form rather than
a chain of taps — and therefore the only one where the player is a native `<select>` instead of a
full-screen picker, because a second sheet would have to destroy the first and take the half-typed
sentence with it. Like every other action it is stamped with the minute the coach **tapped ACTION**,
not the minute the typing finished (decision 031).

**The menu is four tiles and an « Autre… ».** But · But encaissé · Changement · Commentaire, with CSC,
the two penalties, Blessure and Changement de poste one tap further. Nine tiles was a list wearing a
grid's clothes: the whole point of the grid is that « But » is found without reading, and that stops
being true when the four that matter are scrolled past to reach « Blessure ». `ActionChoice` became
generic over its key so the « Autre… » tile — which records nothing and has no `MatchEventType` — uses
the same component as everything that does, rather than a copy of it.

**« Faute » is no longer offered, and that is not the same as removing it.** `FOUL` stays in
`MATCH_EVENT_TYPES`, in `RETRO_FACT_TYPES` and in the `Flow` union, because `match_events` is
append-only (invariant 1): the fouls already in a log must still render, still count in the stats and
still be voidable. What changed is the one user-facing menu it appeared in — and *only* that: this
entry also named a `GAME_MODE_EVENT_TYPES` the type stayed in, which the review of decision 122 found
to be a copy of `MATCH_EVENT_TYPES` that nothing imported, so it has been deleted rather than left
looking like a gate. No allow-list narrower than the enum guards `POST /api/match-events`. Amateur
7-a-side has no card count and no disciplinary consequence to compute, so the tile was asking a coach
watching football to do data entry for nobody.

## 115 — The best seven shrinks every figure toward the squad, and says by how much

**2026-09-30** · accepted · builds on decisions 011 and 021

The owner asked for a pitch in the statistics section showing the **best possible seven** for a chosen
measure — best scorers, best ratings, best « invincibilité » — and the worst by the same measures, with
positions respected and the team figure recomputing live when a player is swapped. Three questions had
to be answered before a single disc could be drawn honestly, and the third is the substance.

**Rates, not totals.** « Meilleur buteur de la saison » is already the `/stats` leaderboard. A best
*seven* is a claim about who to put on a pitch, so every criterion is a rate — goals per 60 minutes,
the share of minutes played without conceding — and a player who played half the season is not beaten
by one who merely played all of it.

**No threshold, because the owner refused one and was right.** `/stats` handles thin samples with a
hard `MIN_RATINGS = 3`, whose own comment says « three is the smallest number that needs a second
opinion to agree ». Asked whether to exclude thin-sample players here, the owner rejected all the
options offered and answered: the ratings must be **weighted by how many matches a player has played**.
A threshold throws away real signal and makes the seven jump discontinuously as one player crosses the
line.

**So every figure is an empirical-Bayes posterior mean:** the player's own rate and the squad's,
weighted by his exposure against a prior strength expressed in the same unit —
`adjusted = (n × observed + m × squadMean) / (n + m)`. With a squad averaging 6,5 and `m = 4`, one
rating of 9,0 becomes 7,0 while twelve ratings averaging 7,4 barely move. The more a player has played,
the more he is judged on himself alone, which is exactly what was asked for. Three properties then fall
out of the arithmetic rather than needing a special case, and each is what makes the screen defensible:

- **a player with no data lands exactly on the squad mean**, so he cannot *head* either ranking. That is
  the rule `comparePlayers` already states in words — « unknown is not "worst" — but it cannot head a
  ranking either » — obtained by division instead of a `null` branch. **This entry first said he
  « heads neither the best seven nor the worst », and the review of the pull request was right that this
  overstates it**: he is routinely *in* a seven, and in a slot with two candidates he is picked as the
  worst whenever the squad mean falls below the other man's real figure. Which is defensible — being
  shown at the squad's average is neither flattery nor punishment for not having played — but it is a
  thing the screen has to say, and the card had ten disclosure paragraphs and not that one. It says it
  now, with a count of how many of the seven it applies to;
- **the worst seven is protected too.** Twenty minutes and three conceded is not automatically the
  squad's worst defender, which is precisely what a raw ratio would claim;
- **it is continuous.** Nobody appears in or vanishes from the seven as a threshold is crossed.

**`m` is measured, not chosen.** It is the ratio of the noise *within* one player's figures to the real
spread *between* players — within-player variance over between-player variance, by method of moments.
A uniform squad yields a large `m` and a sceptical screen; a squad with real gulfs yields a small one
and a single good match counts for more. It is clamped per criterion so a three-match season cannot
produce an absurd value, and it is **printed**: « les notes sont ramenées vers la moyenne de l'équipe,
à hauteur de 2 notes ». A number a screen will not explain is a number that screen should not use. When
the squad's figures are too close together for the spread to be measurable at all, the clamp ceiling is
used — maximum scepticism is the only defensible reading of « we cannot tell these players apart » —
and the sentence then **contains no digit**, because printing an unmeasured number as though it had
been measured is the same defect wearing a decimal point.

**And the clamp binds, which qualifies « measured, not chosen » more than the first draft of this entry
admitted.** On the demo season's goals criterion the method of moments returns 9,64 and the clamp forces
6; the screen then prints 6 as though it had been measured, because what was *applied* is 6 and that is
what the reader needs in order to check the figures. So the honest statement is narrower than « the
number is measured »: the number is measured **and then bounded**, the bound exists so that a
three-match season cannot produce an absurd prior, and on a short season the bound is what is doing the
work. A screen that printed 9,64 while using 6 would be worse.

One idea, three shapes, because the criteria do not have one: Normal–Normal for ratings (`m` in
ratings), Gamma–Poisson for goals and assists (`m` in 60-minute units), Beta–Binomial for the
clean-minute share (`m` in minutes). Ratings needed the spread of each player's own scores, which was
one additive field on `PlayerRating` — the scores were already in the accumulator, **inside** the
visibility gate, so the spread inherits decision 021 for free and cannot leak a score the viewer has
not earned.

**Decision 011 turns out to need two fitted models, not one scoring rule.** That entry recorded that
« minutes d'invincibilité » was ambiguous and that **both** readings were kept: `cleanMinutes` over all
pitch time, and `gkCleanMinutes` in goal. The goalkeeper slot therefore reads the keeper pair — but
shrinking a keeper's figure toward an *all-pitch* mean would mix two populations and flatter or punish
keepers for nothing, so the keeper pair gets its own prior and keepers are only ever compared with each
other. Every pick says which pair produced it, and the card says it in French.

**Positions are an exact assignment, not a greedy pass.** Seven slots and up to twenty-five candidates:
filling slots greediest-first is wrong the moment two of them want the same man. A bitmask DP over the
seven slots — candidates × 2⁷ states, about 22 000 comparisons — solves it exactly with no Hungarian
implementation, and the tests assert the greedy answer is *worse* rather than merely asserting a
number. The objective is **lexicographic and stated on screen**: fill the slot, then prefer somebody
who declared the post, then prefer a primary declaration, then the criterion total. That is the honest
reading of « il faut faire attention aux postes » — it will not put the squad's best scorer in goal to
win a goals total, and it will not refuse to fill a slot nobody declared either: it fills it and badges
the disc « pas son poste ». Ties are a named constant with a test, minutes then jersey number, never
array position.

**What the screen has to say out loud, and why each sentence exists.** This is the class of defect this
repository's definition of done singles out, and this screen had four chances to commit it:

- **the posts are declarations, not measurements.** There is exactly one positional figure anywhere in
  the database — `match_player_stats.gkMinutes` — and the reducer's `positionSpells` are in-memory
  match state the freeze path never writes down. « Meilleur milieu droit » would therefore imply a
  measurement this app does not have, so the card says the posts come from what players declared on
  their profiles. The roadmap carries what would change that: a `minutes_by_position` table written at
  the final whistle, and a backfill by replaying the log;
- **a ratings seven is viewer-relative, and not optionally so.** Decision 021 applies decision 007's
  reciprocity gate to season averages, so two teammates genuinely see two different sevens. The card
  says « d'après les matchs que tu as notés » and prints the hidden count, reusing the wording the
  roadmap already prescribed for the « Meilleures notes » card rather than inventing a third;
- **why a sentence cannot say « we cannot tell these players apart » when there is only one of them.**
  The « spread not measurable » wording originally gave one reason — « les écarts entre les joueurs sont
  trop petits » — for four different causes, and was therefore false in three of them: with a single
  keeper there are no écarts at all, on a filter where nobody was rated the truth is « personne n'a
  de note », and in the fourth — several rated players, none of them rated *twice* — the écarts may be as
  wide as the scale allows and it is the other moment that is missing, the noise within one player. The
  causes were already distinguished in the arithmetic and were being thrown away at the copy boundary.
  Four sentences now, one per cause, each tested — the same defect the previous slice's review found,
  which is worth recording twice because it keeps recurring: a sentence true in the common case and false
  in one branch. The fourth cause is the one this entry nearly folded into the third for being rare, and
  the reason not to is that the two say opposite things about the same squad;
- **the shrinkage and the two invincibilités**, as above. « sans encaisser » is the app's existing
  spelling and no third one was introduced;
- **the formation is named with its count** — « utilisée dans 7 matchs » — because a shape without its
  denominator is a claim with the count hidden, and matches played without a recorded composition get
  their own sentence rather than being silently absent from the total.

**Once anybody is swapped, the screen stops claiming to be the best seven.** The heading becomes « Ton
équipe », with the optimum's total beside it to compare against and a way back. Decision 087 is the
standing rule — a heading is a claim about every row under it — and a pitch still headed « la meilleure
équipe » after two swaps is that claim being false. The swap recomputes from a cell table the server
ships, so the client never reimplements any of the arithmetic above.

**No migration and no new table.** Every figure this needs already existed in `match_player_stats`,
`player_positions` and `formation_slots`; the only genuinely new query counts which formation the team
has used most. That was the point of inventorying before designing: three of the findings above — no
per-post minutes, the ratings seven being viewer-relative, « invincibilité » naming two figures — each
changed the feature, and none of them would have been discovered by writing the screen first.

**What measuring at 390 px found that no test would have.** The keeper's caption was clipped 14 px by
the pitch's own `overflow-hidden`, his point sitting at 93.7 % of the box; moving it above the disc
overlapped the centre-back's caption by 18 px, since those two share the 500‰ column. His figures sit
beside him now, because the bottom of a 7-a-side pitch is one disc wide with 120 px of empty grass
either side. On assists every raw caption truncated, needing 120 px in 96. And **one real touch tap
silently swapped two players**: the picker opened during `pointerup` and the synthesised `click` landed
on the sheet's first row. Five defects, none of them visible in a passing suite, which is the argument
for `CLAUDE.md`'s « actually looked at, at 390 px » stated once more in numbers.

**And what the review found after all that, which is the lesson worth keeping.** On a competition filter
where nobody had a visible rating, all seven discs printed **« 0,0 »** — on a nought-to-ten scale, the
worst possible mark, for the entire squad — while the team figure beside them correctly printed « — ».
The zero was not an oversight: the module's own type documentation *specified* it, and the test asserted
the aggregate was null while asserting nothing at all about the seven figures under it. Rule 1 of
`lib/stats/aggregate.ts` had been in this repository from the beginning — « a number nobody has yet is
`null`, never `0` » — and was broken seven times on one screen by code whose comments were otherwise
careful. A green suite, a measured layout, twelve screens walked in two themes, and the worst defect in
the slice was a documented constant. Figures are `number | null` now, from the arithmetic outward.

**Out of scope, deliberately.** Weighted multi-criterion sliders were offered and refused: the team
total would become a number with no unit that nothing on screen could verify. Saving a seven as a real
composition is the obvious next ask and a genuinely different feature — it writes `lineups` rows and
has to respect invariant 3. Per-player win/draw/loss records need a column that does not exist; the
chosen reading of « invincibilité » avoids needing one.

## 116 — A filter sits under the thing it filters, and a `<select>` is how it says so

**2026-09-30** · accepted · extends decision 100

`/stats/equipe-type` shipped with its four controls — criterion, direction, formation, competition — as
four rows of `min-h-11` `<Link>` chips in the page `<header>`. About **216 px of controls above the
answer**, on a 393 px phone: the reader met every way of asking the question before he had seen a single
seven, and the pitch he came for started below the fold. The owner reported it as the filters taking the
whole screen, which is a layout complaint with a design decision inside it.

**They are four labelled native `<select>`s in a two-column grid, below the pitch.** Two rows of ~74 px
instead of four of 48: 160 px of controls where there were 216, and a **48 px** tap target where a chip
was 44 — the iPhone 16 audit's tap-target finding says 44 pt is a floor, not a target. Below, because a
control whose whole purpose is to change the seven above it is read *after* the seven: the first screen a
reader meets is now an answer, and the way to ask a different question is where a thumb already is.

**« Smaller » came out of the layout and never out of the type size.** The selects keep
`components/ui/input.tsx`'s `text-base`, whose comment says why: under 16 px iOS Safari zooms the page
the moment a picker opens, and a screen that zooms when you filter it is not smaller, it is broken. The
height that was asked for came out of the count of rows, and none of it out of the type.

**Decision 100 is why the chips were links, and both of its properties survive.** That entry — and
`app/(app)/stats/_components/filters.tsx` before it — records that a filter on this app's statistics
screens is a *view of the URL*: `?critere=ratings` is shareable, survives a reload, and works with
JavaScript off. So there are now **two paths to the same query string**, and neither is a fallback that
was never run:

- with JavaScript, `onChange` pushes `equipeTypeHref(next)` — still the single function that knows the
  parameter names and that **omits** whatever is at its default, so a shared URL carries only what was
  actually chosen;
- without it, the surrounding `<form method="get">` submits the four selects itself, with a `<noscript>`
  button as the only thing that can trigger it.

**And that second path made a tolerance load-bearing that had until then been an accident.** A GET form
submits every control it holds, so it sends `?critere=` — an empty value — for anything left at its
default, which `equipeTypeHref` has never written and the parsers had therefore never been given. Two of
the four parsers did not even exist as functions: they were inline in `page.tsx`, unreachable by Vitest,
so `parseCompetitionId` and `resolveFormationOverride` moved into `lib/stats/best-seven-copy.ts` to be
testable at all. All four now have a test for the empty string.

**Said precisely, because the first draft of this entry overstated it: no parser's behaviour changed.**
`parseCriterion("")` and `parseDirection("")` already fell through to their defaults, and the inline
`competitions.find((c) => c.id === "")` already found nothing — so the four new empty-string tests pass
verbatim against the code as it was, and they are regression guards rather than proofs of a fix. What the
form actually changed is the *status* of that behaviour: an incidental property of four `find`s and two
`??`s became a requirement of a path a reader can reach with JavaScript off, and a requirement nothing
states is one the next refactor is free to delete. That is decision 097's rule in a new place — a path
nothing exercises is a claim — with the correction that the claim here was about who is allowed to change
it, not about whether it worked.

`scroll={false}` (decision 100) still matters, and now means the opposite thing. It was added so that
sorting from halfway down `/stats` did not throw the reader back to the title; here the controls are
*below* the pitch, so a navigation that jumped to the top of the document would put the reader above the
select he had just used, and above the answer it changed, on every filter.

**The reasoning above originally said that jump would hide « both the select and the seven it changed »,
and that part was measured and is false.** The select and the **pitch graphic** can never be on screen
together: the pitch SVG ends at **780** and the form starts at **1217**, because **437 px of the seven
repeated as a list** — the full-width rows where no figure is abbreviated — sit between them. Seeing both
at once would want **1123 px** of viewport, and a 393 × 852 phone has **736**. What is actually true is
better than the claim it replaces: **the seven is on screen in words, immediately above the selects.**
A reader who changes a criterion reads the new names and the new figures without scrolling at all, in the
list that never truncates; the pitch is the same seven, laid out, further up. So `scroll={false}` keeps
him at the answer either way — it is the list that is co-visible with the control, not the drawing.

**The selects are `defaultValue` with a `key`, not `value`.** A controlled `value` comes from the server
render, so between the tap and the new screen — the two seconds `COORDINATION.md`'s latency brief is
about — the picker would visibly snap back to the option the reader had just abandoned. `defaultValue`
leaves his choice on screen while the navigation runs, and the `key` keeps that honest in the other
direction: a URL that changes without this form (the « et la pire équipe ? » link, the back button)
remounts the select, so it can never display a choice the pitch above it has stopped obeying.

**One sentence had to go rather than move.** `NO_FORMATION_FR` ended « ou choisis une forme toi-même
ci-dessus », and the state that sentence appears in is exactly the state with no formation control on
screen at all. Moving the controls turned a misplaced word into a false one — « ci-dessus » pointing at
nothing — which is the class of defect this repository's definition of done is written around, and the
clause is deleted. A sentence that names where a control is is a sentence that breaks when the control
moves.

**And « a filter that navigates » had a second requirement nobody had written down: the component that
displays the answer must be keyed to the question.** Routing all four controls through a soft navigation
exposed a defect that predates them and that the « et la pire équipe ? » link had been reproducing all
along. Choosing « La pire » put `?sens=pire` in the URL, the server computed the worst seven, and the
pitch **kept the best one** — relabelled « Ton équipe », with « La pire équipe : 1,94/h » and a
« Revenir à la pire » button beside it. Measured: a fresh `GET ?sens=pire` gives « La pire équipe »,
1,94/h, Hugo in goal; the same URL reached by using the select gives « Ton équipe », 2,01/h and Mehdi in
goal, all seven rows unchanged. The screen was crediting the reader with a lineup he had never touched.
`seven-pitch.tsx` holds the seven in `useState(() => ({ ...optimumBySlot }))`, a soft navigation reuses
the component instance, the initialiser never re-runs — and because the state then disagrees with the new
optimum, the one flag that means « the reader has edited this » (decision 087's `touched`) went true on
its own.

**The fix is a `key`, `sevenQuestionKey(query, resolvedFormationId)`, and deliberately not a `useEffect`
that syncs state to props.** Hand-editing the seven is a *feature* here — the « Revenir à la meilleure »
button exists for it — so an effect pushing the server's optimum back into state would fight the reader's
own taps on every re-render. A `key` fights nothing: it discards the previous question's answer,
initialiser included, and keeps his edits for exactly as long as the question they were an edit *to*. Ask
a different question and you get the new optimum, never last question's edit carried onto it. The
resolved formation goes into the key rather than `?formation=`, because « la plus jouée » names a
different shape in a different competition. Guarded by a source scan in `best-seven-copy.test.ts`, in
decision 097's style and for its reason: a `key` is a fact about a component's identity, invisible to a
unit test of either file, and only the call site can be wrong about it.

**As a rule, since it is not about this screen:** *state initialised from props is a cached answer, and it
must carry the question in its `key`.* Anywhere a filter navigates and the component below it holds a
`useState` seeded from what the server just computed, the two can silently disagree. Checked while
writing this: the **only** two client components anywhere under `/stats` are this pitch and its controls,
so no other statistics screen has the shape — every other one is a Server Component with no state to go
stale. Nothing else was touched on the strength of the rule; where it might apply elsewhere in the app it
is a roadmap item, not a drive-by.

## 117 — The game-mode bar at 369 px: an underline for our own figure, and a third string for the clock

**2026-09-30** · accepted · restates decisions 061, 064 and 112

Two defects the owner found on his phone, in the one row decision 112 collapsed the top of game mode
into. They are one entry because they are one row, and because both come down to the same question asked
twice: when a word cannot stay where it was — for want of 34 px, or because the owner wants a different
one visible — what gives way, and what must not.

**The clock was overlapping the score, and the row had already overflowed before kickoff.** `MM:SS` in
30 px digits was spilling out of its box and under the score. The cause was a flex row in which **the
clock was the only child flex was permitted to squeeze**: `min-w-0`, no `shrink-0`, no
`truncate`, beside a score and an action that were both `shrink-0`. So the row gave way at the one place
it must not. **A clock is never squeezed and never abbreviated** — it is the one thing on this screen a
coach reads at arm's length from the touchline — so it is `shrink-0` now.

That alone does not make the row fit, and the arithmetic is measured in a headless browser against the
real compiled CSS rather than estimated. Inside the **369 px** the row has at 393 px (393 less its
`px-3`): back button 40, three `gap-2` 24, clock 90–140 depending on `MM:SS` and the stoppage span,
score 72–101, TERRAIN 83, « Composition » 110. A typical row — « 45:00 », « 2 – 1 », TERRAIN — wanted
**355** and now wants **321**, with 48 px spare at 393 and 30 px spare at 375.

**The 34 px of that came from dropping the word « Nous », and it is the finding that matters:** with the
caption, « 00:00 » and « 0 – 0 » beside a « Composition » button wanted **370 of 369** — so the bar
overflowed *before a match had begun*, on the owner's own phone, in the state every match starts in. The
defect was not a long scoreline or a long clock; it was the default.

**Two rows still cannot fit at any font metric**, and they are named rather than hoped away: « 10 – 10 »
with a stoppage span wants 370, and a match long enough to print « 120:00 » wants 388. So the **action
slot** is the child that yields — `min-w-0 shrink overflow-hidden` — because it is the only label a reader
can finish from context, and clipping the end of TERRAIN by 19 px keeps the whole bar on screen where
`shrink-0` everywhere pushed the button off the right edge instead. Choosing which child gives way is the
decision; `shrink-0` on everything is the absence of one.

**So which figure is ours is said by an underline.** Decision 061 made the scoreline ours-first on every
screen that prints one, with the venue said in words, and 064 made `scoreLineFr` the only function that
writes one. Nothing in the *figures* says which way
round they read: on an away match « 0 – 2 » is a team two goals **up**. The review of #104 was right to
put the « Nous » caption back after decision 112 first cut it, and that reasoning is not withdrawn here —
**the reader is still owed the fact; only the word is gone.** An `aria-label` alone was the wrong answer
for the same reason it was the wrong answer then: it tells the one reader who did not need telling.

**Our own figure is underlined.** A mark on the numeral costs nothing horizontally, which is what buys
the 34 px above. It is an **underline and not a colour** on purpose: `--color-accent` on one of two
numerals would read as a *state* — leading, live, chosen — and a score has no state. The separator is
`SCORE_SEPARATOR_FR`, now exported from `lib/calendar/labels.ts` rather than a second « – » typed into
the bar, so decision 064 still holds and the app still has exactly one scoreline.

What was lost with the caption and is not recoverable from the figures is the *opponent's* name, which is
in the back button's accessible name and one tap away on the match page — the same trade decision 112
made for the venue badge and the phase line, stated again rather than assumed.

**One claim above is weaker than it reads, and the review of this entry was right to say so.** « The
reader is still owed the fact; only the word is gone » is true of what the *screen* now contains: the
`aria-label` still says « Score 1 nous, 0 Courges », and a mark on the left-hand numeral is where the fact
went. But the mark is **unlabelled** — nothing on screen says that an underline means « nous » — so for a
sighted reader meeting it for the first time it is a convention to infer, not a fact stated, and the
entry should not claim otherwise. It is kept rather than reversed because the alternative was measured and
does not fit (370 of 369 px with the caption, before kick-off) and because the convention is learnable in
one match from a score the reader watched go up. What makes it acceptable is that it is never the *only*
statement of the fact: decision 061's ours-first ordering holds on every screen in the app, `scoreLineFr`
is still the one function that writes a scoreline, and the announced name is unabbreviated. A follow-up on
`docs/ROADMAP.md` asks the question this entry cannot settle from a desk — whether anybody actually reads
the underline — because the answer is a coach on a touchline, not an argument.

**« Envoi » → « Début », and why the accessible name is what gave way.** The owner asked for the clock
button's short label to say « Début ». He is right — « Envoi » is a word a coach has to translate, and
the button starts the match — and the rename immediately broke **WCAG 2.5.3
Label in Name**: game mode prints `shortLabel` and announced `label` as the `aria-label`, so the visible
text must appear in the accessible name as a *whole word*, or voice control saying « clique sur Début »
activates nothing. « Début » is not a word of « Coup d’envoi ».

The final whistle is the contrasting precedent, and it is why this needed a new answer. There, « Fin »
occurred in « Coup de sifflet final » only inside *final*, and the fix was to change the **short label**,
to « Sifflet ». That was available because no particular word had to be visible. Here the visible word is
the whole of the owner's request, and the `label` is the football term the button's full form should
print. So the **third string is the one that yields**: `clockActionFr` returns `name` beside `label` and
`shortLabel`, which is `label` everywhere except the two kick-off branches, where it is « Début : coup
d’envoi » (with the period ordinal for the second). The visible word is contained in it, so 2.5.3 is
satisfied by addition rather than by giving up the word.

**The rule, for the next time this happens:** when a mandated visible word is not a word of the term the
control's full label has to use, change the accessible name, not the visible label and not the term. And
it stays inside `clockActionFr` rather than being assembled at the call site, for the reason `shortLabel`
did: three strings describing one action cannot be allowed to drift apart. `presenter.test.ts` walks
every reachable phase of a 1, 2 and 3-period match and asserts the containment against `name`, so a
fourth string or a fifth phase cannot quietly break it again.

## 118 — One token for the tab bar's height, because three numbers had to agree about it and did not

**2026-09-30** · accepted · restates decision 112

The composition editor's sticky dock — the bench, the blocking errors and the confirm button (decision
105) — floated **16 px above the tab bar**, showing a band of scrolling turf between the two. It reads as
a rendering glitch, which is how the iPhone 16 audit recorded it and how it looks in the hand.

It was arithmetic. The dock said `bottom-[calc(4.5rem + safe-area)]` = **72 px**, `BottomNav` is
`min-h-14` = **56 px**, and `app/globals.css`'s `tabbar-pb` said **4 rem** = 64: three places that had to
agree about one height, each carrying its own literal, and no two of them agreeing. 72 − 56 is the gap.

**This is exactly why fixing it in game mode did not fix it here.** Decision 112 found the same
subtraction in the game-mode bar and could fix it for free, because that route escapes `AppShell` and has
no tab bar at all — the bar went to `bottom-0`. The number was never corrected; it was made irrelevant on
one screen, and the two other copies of it were left standing. A fix that removes the need for a number
does not repair the number.

So **`--tabbar-h` in `app/globals.css` is the one source, and all three read it**: `BottomNav`'s
`min-h-[var(--tabbar-h)]`, the `tabbar-pb` utility, and the dock's
`bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))]`. A token cannot disagree with itself.

**With one honest qualification: `tabbar-pb` has no callers.** Its only other mention in the repository is
the comment in `AppShell` explaining why that component deliberately does *not* use it, so of the « three
places » above, two are live consumers and the third is an unused utility whose value moved from 4 rem to
the token with no effect on any screen. It is kept rather than deleted because it is the right utility for
the next screen that needs to clear the bar exactly, and because a wrong number left in a utility is how
this defect propagated the first time — but nobody should read the count of three as three places that
were rendering.
Two things about its definition are deliberate and are written at its declaration rather than left to be
rediscovered: the **home indicator is not included**, because `BottomNav` pads itself with `safe-pb` so
the inset is *inside* the bar and anything positioned against the bar must add `env()` itself; and
`AppShell`'s content padding uses the token **plus 1 rem**, because it wants clearance and not adjacency,
which is a different quantity and says so.

Measured at 390 px in both themes, which is the only way this class of defect is ever confirmed: dock
bottom 788, tab bar top 787, the 1 px between them being the bar's own border. And there is a guard, in
the shape decision 097 argued for: `lib/composition/hints.test.ts` reads the editor's source and fails if
`bottom-[calc(4.5rem` comes back. A token only helps while everybody reads it, and nothing else in this
repository can see that a component has gone back to a literal.

**What this does not fix**, so it is not read as more than it is: the same editor's worst defect — the
dock covering the whole pitch at the opening scroll, so the screen that says « Appuie sur un joueur puis
sur un poste » has no post to press — is a layout problem and not an arithmetic one. It stays on the
roadmap.

## 119 — Merging moves the preview; a tag, cut by hand, is what ships

**2026-09-30** · accepted · supersedes 081, 078's rejection of a repository `VERCEL_TOKEN`, and 080's
reliance on Vercel's Git integration · amends 108 and 110

Merging a pull request deployed production. That is one act doing two jobs — « this change is good » and
« the team should be running this now » — and the second one was never anybody's decision, it was a
side effect of the first. The owner asked for them separated.

**Decision.** A push to `main` runs the checks, applies the committed migrations to the **preview**
database (`PREVIEW_DATABASE_URL`), then builds and deploys the preview with the Vercel CLI, and creates no
tag. An annotated tag `v*`, pushed **by hand**, is what ships: `release.yml` gates the tag, re-runs the
same checks on the tagged commit, migrates **production**, then builds and deploys production with the
Vercel CLI, then publishes the GitHub release. **Vercel's Git integration issues nothing at all** —
`vercel.json` sets `git.deploymentEnabled` to `false` for every pattern including `main` — so every
deployment this project has is one of the two jobs above, each ordered after its own migration. Nothing
else deploys anywhere. The checks themselves live once, in `checks.yml`, called by both workflows — with
two callers, a second copy of forty lines of `postgres:17` service configuration is how the two quietly
start testing different things.

**An earlier draft of this decision rested on a claim about infrastructure that was false, and that is
why the deployments moved into CI.** It said the preview at `dev.7orteils.bgonzva.fr` came from Vercel's
Git integration, on the strength of the project's production branch being parked rather than `main`. It
was checked against the Vercel and GitHub APIs and neither half held. The last three deployments the
integration ever made were `main` squash-merges and all three were `target=production` — so until the
afternoon the owner parked the branch, **merging deployed production**, which is exactly the thing this
decision exists to stop and which the decision described as already fixed. And the merge *after* the
branch was parked produced no deployment at all: no Vercel record, no Vercel commit status, no GitHub
deployment. A `main` push had gone straight from "deploys production" to "deploys nothing", and the
document asserted a third thing that was never true on either side of the change.

Nothing in the repository could have caught that, because nothing in the repository determined it: it
was a dashboard setting, readable only by an API call nobody makes while writing a paragraph. That is
the argument for issuing both deployments from a workflow. A job in `ci.yml` with `needs:
[migrate-preview]` is a claim a session can verify by reading a file it already has, and the sentence
in the runbook that describes it can be checked against the thing it describes. Parking the production
branch stays — it is verified (`vercel-production-placeholder`) and it is a second thing that would have
to be wrong before a push could reach production — but it is defence in depth now and no longer
load-bearing.

**One piece of dashboard state this still depends on, and it is checkable.** `dev.7orteils.bgonzva.fr`
is pinned to the git branch `main` (`gitBranch=main`, read from the Vercel API — which is how it was
found, and the difference from the production-branch setting is exactly that this one can be read). A
domain assigned to a git branch cannot be re-pointed with `vercel alias set`, so the CLI's preview
deployment takes that domain only if it carries `main` as its own git-branch metadata, which is why
`deploy-preview` sets `VERCEL_GIT_COMMIT_REF: main` rather than trusting the CLI to infer it. Expected to
work; **not observed**. The first `main` push after this merges is the test, and the fallback is written
down in `docs/DEPLOY.md` §4: the owner removes the pin, and CI aliases the domain itself.

**What 081 was protecting, and why a gate keeps it.** 081 had CI cut `v<version>` from `package.json`
once `main` was green, and it argued the point in a sentence that deserves quoting because it is the
whole ethic of this repository: *« "Remember to tag after merging" is exactly the kind of convention that
survives two sessions and then quietly stops happening »* — a convention that needs a human to remember
it is one the next session will not know about. That argument was about the **failure**, not about who
acts. The failure it named is a tag that names a version nothing verified, and the property it wanted is
that a tag is a true claim. So the generator becomes a gate, with three guards stated where they used to
be implicit in *where* the job ran: the tag must equal `v$(package.json version)` **at the commit it
points at**, the commit must be reachable from `origin/main`, and the same checks must pass on it before
a byte moves. The error message names the command that deletes a bad tag, because a gate that refuses
without saying what to do is a gate somebody works around.

**And the honest half: the convention now does need a human to remember it.** 081 is right that it will
sometimes be forgotten. What matters is what forgetting *costs*, and that is the asymmetry the two
designs do not share. Forget to tag and the version sits on `main`, tested, migrated on the preview and
deployed to it — and production keeps serving the last tag, which is a version that
went through this whole path. Nothing is broken, nothing is half-deployed, and the repair is to push a
tag whenever somebody notices. The failure 081 feared was not like that: a tag naming a version nothing
verified is a false claim already published, and the thing that reads it — a human deciding what is
live — has no way to tell. A silent omission that leaves production correct is a safe failure; a silent
lie is not. The bump itself, which is the judgement that cannot be automated, is still reviewed in a pull
request exactly as 081 left it.

**Why a `VERCEL_TOKEN` is now worth it.** 078 rejected precisely this — a long-lived deployment
credential in a repository secret — and it weighed it against « a window of seconds », which was the
right weighing at the time: `main` *was* production, Vercel started building the same push the migration
ran on, and the two raced by a few seconds. Deploying from CI does not buy a few seconds now, it buys a
guarantee. Production is deployed by a job that `needs` the migration job, in one workflow, so the schema
provably arrives before the code that needs it — not « within seconds of », *before*, or the deploy never
happens at all. 078 also named its own trigger to revisit: « a dropped column, a narrowed type », the
first migration that is not safe in both directions. PR 3 of the current plan drops a column and narrows
a type, so that trigger is about to fire regardless; this decision reaches it first. The token is scoped
to the project, it is never printed, and `vercel.json` is still the source of the region (111) and of the
git rule, so the deployment is configured from the repository and not from a dashboard.

And the guarantee is bought **twice**, which the first draft of this decision did not claim because it
believed Vercel was still issuing the preview: `deploy-preview` `needs: [migrate-preview]` in the same
way, so the window 078 described is gone on the preview as well, rather than being tolerated there on the
grounds that only a preview lives through it. The price is that an absent or revoked token now means no
deployment at all instead of a slower one — an outage of the *deploy*, which is loud, rather than a wrong
deployment, which is not.

**080's intent survives; its mechanism does not.** 080 said only `main` deploys, by an allow-list in
`vercel.json` with `main` set to `true`. That key is `false` now, along with every other one, so the Git
integration deploys nothing and « a branch that is neither `main` nor a tag deploys nowhere » is true by
construction rather than by dashboard state: nothing outside a workflow can deploy, `pull_request` reaches
no deploy job, and `release.yml` fires only on `refs/tags/v*`. Two of 080's sentences also go. It says « a
push to `main` is a production deploy » — which was true right up to the day this was written, and is now
false because a workflow decides what `main` produces. And it lists « no preview URL to hand somebody »
under what is given up, which is no longer given up: there is meant to be exactly one, and whether it
lands on `dev.7orteils.bgonzva.fr` is the observation still owed above.

**108 and 110 still hold, one workflow to the left.** Every tag still gets a GitHub release, still cut by
CI, still with the squashed commit subjects since the previous tag as its notes (108); a hyphenated
version is still published `--prerelease` on the strength of the hyphen alone (110). What changed is that
the release step publishes for a tag CI did **not** create, and it runs last for the same reason 108 put
it after `migrate` — a release page must never name a version that failed to migrate or failed to deploy.
It is idempotent, because it checks for an existing release — but **re-pushing the tag is not how a failed
deploy is retried**, as an earlier draft of this entry said twice. `git push` of a tag the remote already
has at the same commit prints `Everything up-to-date` and emits no push event, so nothing runs. The retry
is `gh run rerun --failed <run-id>`, which re-runs the failed job and everything downstream of it on the
same commit; the jobs are safe under it for the same reasons they were thought safe under a re-push.
110's closing line, « no hand-cut
tag — a tag nothing verified is still forbidden », now reads « a hand-cut tag is checked before it is
believed ».

**What this does not protect, said plainly so nobody assumes it.** The gate compares the tag to
`package.json`, **not to the tag history**: a tag can be pushed at a commit whose version was never
bumped past the previous release, so `v1.0.0-beta.3` can be deleted and re-pushed at a later commit that
still says `1.0.0-beta.3`, and it will gate, migrate and deploy. Nothing enforces that versions increase,
that a tag is only ever pushed once, or that the commit tagged is the newest on `main`.

**And rolling back by tagging an older commit does not work, which the first draft of this entry assumed
it did.** Two independent reasons, both found by reading rather than by trying it, and each enough on its
own. A `push` event resolves a `uses: ./.github/workflows/…` reference from the **pushed ref's own
commit**: every commit older than this branch has no `release.yml`, so such a tag runs nothing, silently.
And `npm run db:migrate` is forward-only — there are no down migrations here — so even if it ran,
production would serve older code against the newer schema, the one combination nothing has ever tested.
A rollback is therefore a *forward* fix: revert on `main` in a pull request, bump, merge, look at the
preview, tag. `vercel --prod` from a laptop is the break-glass route and moves code without schema.

The sharpest edge that remains is a **force-moved** tag: `git push --force origin v…` at a different
commit does fire a run, and that is a production deploy with no pull request in front of it. The guard on
it is the same one as on every other irreversible act in this repository — the owner's own hand, and this
paragraph.

## 120 — One rule for when a pointage opens, asked by all three places that need it

**2026-09-30** · accepted · completes 099

Decision 099 gave the présent/absent list a window: it opens half an hour before the séance, and
`markTrainingAttendance` and `markEveryonePresent` both refuse to write outside it. What that change
missed is that a third place also decides whether the list is offered at all — the inline card on
`/entrainements`, which was still asking « is the séance today? » (`daysFromNow(…) === 0`).

So from #88 until now, at 08:00 on the day of a 19:00 séance, that page rendered « Tout le monde est
là » and the thirteen présent/absent rows, and **every tap on any of them wrote nothing**. The action
returned early, correctly, and the screen said not a word about why. Decision 099 existed to replace
an untruth with a refusal; this call site turned the refusal into a dead button, which is the worse
of the two — an untruthful screen at least tells you something is off when the number is wrong,
whereas a button that does nothing looks exactly like a button that worked.

**Decision.** `attendanceIsOpen(startsAt, now)` in `lib/calendar/timeline.ts` is the only thing in
this repository that answers « can a pointage be recorded? ». Three callers ask it — the two Server
Actions and this page — and no fourth is allowed to reimplement the question. `daysFromNow` keeps its
other uses; it is simply not an answer to this one.

It is worth recording how this was found, because it was not by reading. A later branch touched the
imports of that page and `tsc` complained; the wrong predicate was two lines away. Three call sites
of a rule, with only two of them guarded, is invisible to every test in the suite: the reducer tests
do not reach `app/`, and Vitest collects `lib/**` and `db/**` only. The pure predicate is in `lib/`
and is well tested — it was never the predicate that was wrong, it was one of the call sites, and
that is exactly the class of defect the screen audit of waves 3 and 4 kept finding.

**Two notes from verifying it in the browser**, both of which cost time. The first run of the check
was **void, while reporting the expected result**: the local database was three migrations behind
`main`, `getCalendar`'s join onto `competitions` (#97) threw, and `/entrainements` rendered the error
boundary in all three cases. A check that counts the *absence* of a string then agrees with the
happy expectation for entirely the wrong reason, in two of the three cases, and the two that agreed
were the two meant to prove the fix. So: **a check that asserts something is absent must first
assert the page rendered at all** — that is now the first thing any throwaway script of this kind
does, and the six byte-identical screenshots were what gave it away. The second is smaller: after a
direct `UPDATE` on `trainings`, nothing calls `revalidatePath`, so the séance must be moved before
the page is opened rather than between two screenshots of it.

## 121 — A match is over when the coach says so; the déroulé says how it went

**2026-10-01** · accepted · refines 113

The owner wanted to type up matches already played this season, and the screen for that exists and
works — `/match/[id]/saisie`, milestone M7. It was unreachable. The card that leads to it is offered
only when `match.status === "finished"`; the only writer of that column was `finalizeMatch`, which
refuses unless the log already holds a `FINAL_WHISTLE`; and the only thing that appends one is game
mode. So backfilling an afternoon from three weeks ago meant starting a live clock for it, tapping
through a match that was long over, and blowing the final whistle — which is exactly what he said he
did not want to do. The one match in the repository that *was* in the target state is the seed's J6,
and it only exists because the seed writes the column by hand.

**Decision.** Two Server Actions in `lib/match/actions.ts`, `finishMatch` and `reopenMatch`, write
`matches.status` directly and append nothing. Decision 113 said *finished* is one fact, the column,
and that the column is a **cache**; that still holds, and this entry only widens what it caches. It
caches « somebody closed this match », and a `FINAL_WHISTLE` is one cause of that. The coach's word
is the other.

**The mechanism not to use, which is the obvious one.** Do not append a bare `FINAL_WHISTLE` to mark
a match over. `getMatchScores` (`lib/match/queries.ts:174`) counts `match_events` rows and
`getMatchScore` returns `scores.get(matchId) ?? null`, so `score === null` means *literally zero
rows* — it is the repository's test for « nobody recorded this ». One whistle turns that `null` into
`{0, 0}`, and the calendar starts printing « 0 – 0 » for a match nobody watched: the wave-3 defect
`CLAUDE.md` names by name, and the untruth decision 013 exists to prevent. It would also make
`submitRetroMatch` refuse with « Ce match a déjà un déroulé », pushing whole-match entry into the
action-by-action corrections list. So: **set the column, leave the log empty.** That is the J6 state,
and every screen already renders it — the scoreboard shows « ? – ? », `lib/stats/aggregate.ts` counts
it in `unrecordedMatches`, and the match page hides « Mode match » for it.

**Where the line falls: both actions refuse if the log is not empty.** A match with a déroulé is
`live` or `finished` already — `applyEffects` sets `live` on the first kick-off — and a `live` one has
a correct way to end, game mode's own final whistle, which derives the minute from the reducer
instead of inventing one out here. Reimplementing that derivation outside `lib/match/reducer.ts` to
save the coach a tap would trade invariant 2 for nothing. Symmetrically, « Rouvrir le match » is only
offered while the log is empty: going back to `scheduled` with events on file would mean voiding them
to stay coherent, which is a different and bigger feature. `hasMatchEvents` is the question both ask,
not `score === null` — that one ignores voided events, so a match whose every action was corrected
away reads as empty there, and declaring is the case that must not get it wrong.

**No chronology gate at all**, which is the owner's call and is the literal reading of « at any
time »: a match dated next Sunday can be declared over. Three things had to follow it rather than
fight it. `isPast` in `lib/calendar/timeline.ts` split on `endsAt` alone with `isLiveEvent` the only
status override, so such a match would sit under « À venir » while its own page said it was finished
and `/stats` counted it — one screen contradicting another, the failure mode of waves 3 and 4. It now
has the mirror, `isFinishedEvent`, and the ordinary case improves too: a match ended early leaves
« À venir » at the whistle rather than at `endsAt`. `submitRetroMatch` had to stop refusing a
kick-off in the future for a match declared over; the consequence is that the built log's
`occurredAt` values are in the future, which is inert — the reducer reads `clockMs` and `period`,
never `occurredAt` — and is the honest record of what the coach declared. And game mode now
redirects a finished match with an empty log back to the match page: the reducer reads an empty log
as « not started », so that screen drew a 0-0 scoreboard and a « Coup d'envoi » button for an
afternoon already over. That state used to be seed-only and unlinked; this decision makes it one tap
away.

**What is deliberately unchanged.** The retro form asks for the same things it always did: who
played, and the goals. The score, the minutes and the clean sheets stay derived (invariant 2), there
is still no score column, and `entry_mode` remains the label decision 013 made it. Nothing downstream
needed a branch — `amendMatchEvents` already re-freezes `match_player_stats` when the match is
finished, and the retro log carries its own `FINAL_WHISTLE` — because the entry path is the one J6
already exercised. The rating window needed no change either: `getNextKickoffAfter` keys on the
match's own kick-off, so a future match declared over opens its window immediately and closes at the
match after it, which is what decision 007 says.

One untruth this makes visible without causing, recorded in `docs/ROADMAP.md` rather than fixed here
because when a player may still answer is a product call: a match in the past that nobody has
declared over still shows « Ta réponse » with « Tu peux changer d'avis jusqu'au coup d'envoi », and
still chases the players who never answered.

## 122 — A remark is one event type with its kind in the payload

**2026-10-01** · accepted · follows 114

The owner wanted the touchline vocabulary he already says out loud, as one tap while the game goes
on: « bon retour », « bel effort », « mauvaise passe », « bon placement », « perte de balle », « beau
geste » — six judgements about one player, none of them a fact anybody could check. Decision 114 had
just put a free-text `COMMENT` in the log for the same reason, and the obvious next step is six more
event types beside it. That is the step not taken.

**Decision.** One enum value, `REMARK`, with the kind in the payload: `{ kind, memberId }`, `kind`
drawn from `REMARK_KINDS` in `lib/match/events.ts`. Six enum values would have been six
`ALTER TYPE … ADD VALUE` statements, six payload schemas, six rows of `EVENT_LABELS_FR`, six icons
and six branches in two formatters — and the seventh remark the owner thinks of next Sunday would be
a migration on a production database, for a word. A kind in the payload is a line in an array, and
`tsc` still refuses an incomplete set: `REMARK_LABELS_FR` and `REMARK_ICONS` are
`Record<RemarkKind, …>`, so adding a kind without its French or without drawing it fails the
typecheck rather than shipping a nameless or a blank tile.

**The trade being accepted, written here rather than discovered later: the database no longer
constrains which kinds exist.** `match_event_type` says a row is a remark and nothing more, so an
unknown `kind` — an older device's payload, a hand-written insert, a kind somebody deletes from the
array — is a runtime concern instead of a `22P02`. Two things answer it, and they are the two strictnesses
`lib/match/events.ts` was already built around. At ingestion `MATCH_EVENT_PAYLOAD_SCHEMAS`
validates `kind` against the `z.enum`, so nothing the API accepts carries one. And the reducer, which
reads the lenient schemas because it **must never refuse a log Postgres has already accepted**, is
lenient about the kind too: the row parses, the `memberId` beside the unfamiliar word survives, the
`remarked` actor is pushed, and `remarkKind` is left null because `isRemarkKind` — the reducer's own
check, not the schema's — does not recognise it. `remarkDetailFr` then returns null and the line
degrades to « Remarque » naming the player. **The first draft of this entry said the entry was marked
`invalidPayload` and named nobody, and that was the behaviour as written**: the lenient schema shared
the strict `z.enum`, so the parse failed and threw the player away with the word. The review of the
pull request caught it, and the fix is the one this paragraph always described — a kind the code cannot
name costs the word, not the name. Only a payload that is *actually* unreadable (no `memberId`, or not
an object) is `invalidPayload`. It says less rather than inventing something, which is the only
acceptable failure for a screen in this repository.

**`memberId` is required**, and that is the whole difference from 114's `COMMENT`, whose `memberId`
is optional on purpose. « Bel effort » about nobody in particular is not a remark, it is a note — so
the sheet opens with no player chosen, « Enregistrer » disabled, and a hint saying why, rather than
defaulting to the man the coach happened to look at last.

**The reducer computes nothing from a remark**, like the comment before it: an opinion moves no
number. That is asserted as whole-state equality against the same log without it, every field but the
timeline itself, so no figure can quietly start depending on one. What the reducer *does* record is
the kind and the player — `remarkKind` on the entry and a `remarked` actor — because the historian
names what happened and the presenter writes it down.

**One formatter serves both screens**, `remarkDetailFr` in `lib/match/presenter.ts`, called by game
mode's timeline and by the rating recap. This is the lesson of 114 applied before it cost anything:
two screens formatting the same event is how one of them ends up dropping it. Remarks reach the
shared match summary because `HIDDEN_EVENT_TYPES` in `lib/rating/recap.ts` hides only `PAUSE`,
`RESUME` and `VOID` — the owner asked for that, so it is pinned by a test rather than left as a
property of a set three screens away.

Two smaller things that are consequences rather than choices. The remark carries **the minute the
ACTION menu was opened**, not the minute the coach finished choosing a player: decision 031 already
decided that a tap is stamped when it is made, and picking a name from a `<select>` takes as long as
it takes. And the icons now on every action tile, including the six remarks, are **hand-rolled inline
SVG** on `components/theme/theme-toggle.tsx`'s pattern — `currentColor` so a tile's tone tints its
drawing and light and dark are free, `aria-hidden` so the accessible name stays the French label
alone, and no icon dependency in this repository, which is a position and not an omission. They were
rasterised at 16 px and four of them were redrawn, because a 24-unit grid stroked at 1.75 holds about
four strokes before it turns to mud.

## 123 — Two acknowledgements of a tap, split by what can run before hydration

**2026-10-01** · accepted · acts on #111's findings 3 and 5

The owner, from his iPhone: « there is always a delay when I tap the tabs, and sometimes nothing
happens and I have to tap several times ». Pull request #111 measured that and deliberately changed no
production code, and its fifth finding is what this entry acts on: under CPU ×4, a tap landing the
instant the previous screen's heading appeared produced a **native document navigation rather than a
router navigation in 5 of 5 samples on Calendrier**, and 1 of 5 on Stats. So « nothing happens » is not
a tap the page failed to receive. It is a tap that started the slowest navigation the app has, and then
said nothing at all while it ran. (This is pull request #111; **decision 111 in this file is the
unrelated `iad1` → `lhr1` region pin** and has nothing to do with it. The next free decision number
here is 123.)

**Decision. The tab bar acknowledges a tap twice, and the split is not cosmetic — it is which of the
two can run at all in the window where the owner's taps are being lost.** The pressed state is plain
CSS, `active:bg-surface-2` at `components/nav/bottom-nav.tsx:68`, so it paints with no JavaScript
having executed; that is the *only* feedback available before hydration, and the pre-hydration window
is precisely where finding 5 says the lost taps happen. The tab deliberately carries no
`transition-colors`, so the fill lands in the same frame as the touch rather than waiting on an
animation — and the fill itself is the one every `ghost` and `secondary` variant in
`components/ui/button.tsx` already uses, because the tab bar was the single tappable surface in the app
with no `active:` class of any kind. The second acknowledgement is `useLinkStatus`, in `TabPending`
(`components/nav/bottom-nav.tsx:100`): a 2 px hairline across the top of the tab that started the
navigation, which exists only after hydration and means something the pressed state cannot say — the
router took the tap and the navigation is in flight. It is `aria-hidden` and wordless on purpose, which
is **decision 122's** rule reused rather than rediscovered: the action tiles' inline SVGs are
`aria-hidden` so that a drawing added for a sighted reader stays out of the control's accessible name,
and a hairline is the same kind of thing. Decision 117 is the principle under both and it is cited here
only to say that it **runs the other way** — Label in Name means the visible text must appear in the
accessible name, so when the two disagree it is the *name* that gives way, as « Envoi » → « Début »
did. A wordless decoration never enters that trade, which is exactly why it is allowed to be wordless.
(An earlier draft of this entry cited 116 and 117 for the rule. 116 is the filter `<select>` and has
nothing to do with it. The citation was written from memory instead of from the file, which is the
failure `CLAUDE.md` warns about over decision 119, and it is recorded here rather than quietly fixed.)

**Two things this slice deliberately does not add, stated because their absence looks like an
oversight.** There is no `-webkit-tap-highlight-color` anywhere in `app/` or `components/` — and that is
not because nobody thought of it, but because **Tailwind v4's preflight already sets it to `transparent`
on `html`** (`node_modules/tailwindcss/preflight.css:50`), and the property inherits, so every tappable
surface in this app lost the platform's free tap flash the day Tailwind was installed. That is the
reason a pressed state had to be hand-written at all: the framework removed an acknowledgement and
nothing replaced it. Restoring the native highlight was considered and rejected — it is WebKit-only, it
cannot be themed, and it would make the one surface that acknowledges a tap acknowledge it differently
from every `Button` in the repository. And there is no `touch-manipulation` on the tabs. The only
`touch-action` in the tree is `touch-none` / `touch-pan-x` on the three drag surfaces — the composition
editor, the terrain sheet, and `/stats/equipe-type`'s pitch
(`app/(app)/stats/equipe-type/_components/seven-pitch.tsx:317`) — where it exists to stop a gesture
being stolen; `touch-manipulation` is
for suppressing the 300 ms double-tap-zoom delay, and the responsive viewport this app already declares
(`width: "device-width"`, `initialScale: 1`, `app/layout.tsx:23-24`) is what removes that delay on both
engines. So `touch-manipulation` here would be cargo — and worse than inert, since it also disables
double-tap zoom, which is a reader's own accessibility affordance and not ours to take.

**The 180 ms delay in `.fm-pending` (`app/globals.css:260`) is what keeps the second from firing on the
navigations the first has already answered.** A tab tap measured 126–217 ms unthrottled (#111's table),
and an indicator that appears and vanishes inside that is noise on a screen held at arm's length. So
the animation is `120ms linear 180ms both`, and `both` is load-bearing: without it the hairline would
sit at full opacity through the delay instead of being held invisible. The `prefers-reduced-motion`
block above it only shortens durations and iteration counts, so the delay survives there and the
hairline appears rather than fades — which is the right behaviour for somebody who asked for less
motion, and the reason this does not need `.fm-spinner`'s exemption.

**A third acknowledgement was built for `/stats` — two `<Suspense>` boundaries with a content-free
skeleton — and it is not in this slice, because a streaming boundary silently removes the
no-JavaScript path.** This is the part of the entry worth reading. Streaming SSR puts the *fallback* in
the HTML and swaps the real content in with an inline `$RC(...)` script; with JavaScript off the swap
never runs, so the reader sits on a skeleton permanently while the figures sit finished and hidden in
the same document. That is not a degraded screen, it is a screen that lies in the one mode it was
designed to work in: decisions 100 and 116 made the competition chips `<Link>`s rather than a client
filter **specifically** so `/stats` reads and filters with no JavaScript at all, and a boundary added
for perceived speed would have withdrawn that without one line of either decision being superseded.
Worse, it only engages when the query outruns the shell flush — so the fast case keeps the no-JS path
and the slow case, which is the whole case on a phone, loses it. The normal case would have been the
broken one.

Two further defects disappear with it rather than needing patches, and both are the wave-3/4 shape: the
skeleton promised three cards where the true answer on a new team is often **zero** — the only claim a
loading shape can make is « there will be cards here, about this many », and on this screen that claim
is frequently false — and `e2e/first-run.spec.ts`'s fresh-bootstrap reader would have met three pulsing
outlines on the way to « Pas encore de statistiques ». A skeleton standing in for an empty state is an
untruth with a built-in excuse.

**What the boundary left behind is the measurement that explains why it and the hairline could never
have coexisted.** With the boundaries in place the router committed the new shell before the 180 ms
delay elapsed, so the hairline never painted on that tab at all: **0 hairlines observed at 100 ms after
the tap on `/stats` with its query slowed by 2.5 s**, against **1 at 300 ms on `/calendrier` with the
response itself held**. Read at the time as « the two compose rather than stack », which was true and
was the wrong thing to be pleased about — a boundary that commits the shell early is a boundary that
takes the in-flight acknowledgement away and replaces it with a shape that states more than it knows.
Two acknowledgements, split by hydration, is the whole design: the pressed state covers the tap that
lands before any JavaScript has run, the hairline covers the tap the router has taken and is still
working on, and between them there is no window left for a third. `/stats` is now untouched by this
slice, and its 844 ms stays open in `docs/ROADMAP.md` as a query to make faster rather than a wait to
decorate.

**`/moi`'s two queries were combined and `/stats`'s were not, and the asymmetry is deliberate.**
`getUserTeams` and `getPlayerProfile` share no input — one is keyed on the user, the other on the
membership the page already holds — so they ran in sequence for no reason and are now one `Promise.all`
(`app/(app)/moi/page.tsx`), with the `null` for a non-playing coach passed straight through so the
condition stays a condition instead of becoming a query that returns nothing. `/stats` cannot do the
same: `getSeasonStats` consumes the competition id that `parseCompetitionId` has just validated against
`getTeamCompetitions`, and that validation is what drops an id naming a deleted or a foreign
competition. Parallelising those two would mean trusting the id from the query string. Either way it is
tens of milliseconds, and **per #111 none of this is the latency fix**: the server contributes 31–35 ms
to a whole screen, and the 1.54 s number in that entry is a cold function start, which is
infrastructure and the owner's lane.

**The one residual risk, and it cannot be cleared from a Linux session.** iOS Safari has historically
applied `:active` on a tap to `<a>` and `<button>` elements but not to a plain `<div>`, which is why the
pressed state is on the `<Link>`'s own `<a>` and not on a wrapper — and every `Button` variant in this
repository already relies on `active:` the same way, so if this did not work there, a good deal more
than the tab bar would be silently inert. That is an argument, not an observation. **Only the owner's
iPhone can confirm that the fill actually paints under his thumb**, and until he says so that is
expected behaviour rather than verified behaviour.

## 124 — A gutter is one utility, because `safe-px px-5` silently is not one

**2026-10-01** · **accepted** · Supersedes nothing; it fixes three screens that thought they had a
side gutter and did not.

**Decision.** A screen that is its own page — `app/error.tsx`, `app/not-found.tsx`,
`app/(auth)/layout.tsx` — gets `gutter-px`, a single utility in `app/globals.css` that is
`max(env(safe-area-inset-*, 0px), calc(var(--spacing) * 5))` on the physical longhands. The pattern
`safe-px px-5` is not to be written again. `safe-px` keeps its one correct user, `BottomNav`.

**Why.** `safe-px` sets the longhands `padding-left` / `padding-right`; `px-5` compiles to the
`padding-inline` shorthand; a longhand after a shorthand overrides it unconditionally, with no
specificity contest to win. Both land in `@layer utilities` with equal specificity, so emission order
is the whole of it — and Tailwind v4 sorts that layer **by property**, interleaving custom `@utility`
rules among the built-ins rather than appending them after. Verified in the compiled stylesheet:
`.px-5` at byte 34768, `.gutter-px` at 36008, `.safe-px` at 36192, while in the *source* `safe-px` is
declared above `gutter-px`. So **moving the block earlier in `globals.css` cannot fix it**, which is
the first thing anyone will try, and source order is not the lever either. On an upright phone both
insets are 0 and the pair therefore resolves to a gutter of zero.

Measured, before: `/connexion` and `/rejoindre` ran **0 → 375 of a 375 px viewport**, the form card
flush against both bezels, in both themes — the first two screens any new user sees. `not-found.tsx`
ran 0 → 390, worse, because its text has no `max-w`. At 390 px the card is capped by `max-w-sm` at 384
and leaves 3 px, **which is why this was never noticed: the bug is invisible at the width we test and
visible at the width the phone is.** After: 20px/20px, card 20 → 355 at 375 and 20 → 370 at 390.

**The fix that was rejected, and this is the part worth keeping.** Redefining `safe-px` itself as a
`max()` looks smaller — one declaration, every site fixed at once. But its one remaining user is
`components/nav/bottom-nav.tsx`, a `fixed inset-x-0` bar whose `border-t` is meant to run bezel to
bezel and whose tabs divide the full width. Measured with a four-tab replica, a 20 px base gutter
takes each tab from 97.5 to 87.5 px at 390 and 93.8 to 83.8 at 375. **Nothing clips, nothing drops
under 44 px, every check stays green** — it would have silently inset a deliberately edge-to-edge bar
and shrunk four tap targets, a design change smuggled in by a bug fix. That the single
`safe-px`-with-no-`px` site is the one place the utility is used *correctly* is what makes a new
utility right rather than merely safer.

**Consequences.** `max()` rather than a flat padding keeps what the pair was reaching for: in
landscape the notch inset exceeds 20 px and wins, which is why `safe-px` was on these elements at all
and which a plain `px-5` would have discarded. Longhands rather than `padding-inline` put `gutter-px`
in the same property group as `safe-px`, so the two are decided by order within that group instead of
by the shorthand rule — but **that does not make the bug unexpressible, and an earlier draft of this
entry claimed it did.** Measured: `gutter-px safe-px` on one element gives `padding-left: 0px;
padding-right: 0px`, the original defect in full, because `.gutter-px` is emitted at 36008 and
`.safe-px` at 36192. The pair is simply not to be written; the three screens carry `gutter-px` alone,
and a utility that cannot be combined wrongly was not on offer here. The padding stays on the three page shells
and **not** on `components/errors/error-screen.tsx`: `app/(app)/error.tsx` renders that same component
inside `app-shell`'s `px-4`, so a gutter on the component double-pads one parent while fixing the
other — padding that is correct for one parent and wrong for another is padding living in the wrong
place. And `tabbar-pb` was checked for the same shape and is clean: it is a lone `padding-bottom` with
no shorthand competitor, it now reads `var(--tabbar-h)`, and it is used nowhere at all because
`app-shell.tsx:142` writes the value inline for the `md:` variant.

## 125 — A role-dependent screen is reviewed in both roles at once, or it is not reviewed

The definition of done in `CLAUDE.md` already requires both themes **actually looked at, at 390 px**.
This adds the same kind of rule for the other axis the app branches on: **every screen with a
role-dependent branch gets looked at in both roles, side by side, in one pass.**

**Four defects, one blindness.** The UX audit of 2026-10-01 and the positions slice found these
separately and they are the same thing. A player asked to give up a position wish reads the bare
two-letter code while the coach's card spells out « Ailier gauche ». The coach reads a player's
secondary positions in prose — « Poste principal : Gardien de but · postes secondaires : Défenseur
central, Milieu droit » — while the editable card spends that same slot on the instruction « Appuie
sur un poste… », so the player decodes their own wishes from the colours of a pitch diagram. `D25`: a
player can never find out whether he was marked present. `S8`: a player sees the lineup on `/jeu` and
a 404 on `/composition`. **Every one of them survived a reader who had seen both code paths.** Both
branches were individually defensible; the defect existed only in the comparison.

**« In one pass » is the whole rule, and dropping it makes it unenforceable.** « Looked at in both
roles » is satisfied by two sessions a day apart, which is what already happened four times. The
evidence that the pass matters is in the audit on both sides: `/equipe` appeared 69 px taller in dark
than in light and was being written up as theme drift, and re-measured with both arms in the *same*
pass the delta was zero — seven browsers shared one preview database and a concurrent write looks
exactly like a layout bug. The same method produced a false finding sequentially and a true one in a
single pass. That is the mechanism demonstrated from both ends, and it is why the 390 px rule says
« actually looked at » rather than « checked ».

**What this is not.** It is not a request for a test. There is no assertion that catches « the coach
gets a sentence and the player gets an instruction » — both strings are correct, present, French and
tutoied, and a snapshot of either passes. It is a looking rule, like the theme rule, and it is cheap
for the same reason: the cost is one extra login, and it catches a class rather than an instance.

## 126 — The second instance of 124, and the sweep that says there is no third

**Date** 2026-10-01 · **Status** accepted · extends 124

**Decision.** The sticky ActionBar in game mode
(`app/(jeu)/match/[id]/jeu/_components/game-mode.tsx:1044`) drops `safe-pb py-2` for `safe-pb-2 pt-2`,
where `safe-pb-*` is a new functional utility in `app/globals.css` declaring
`padding-bottom: calc(--value(integer) * var(--spacing) + env(safe-area-inset-bottom, 0px))`. Every other
`safe-*` user in the repository was checked against the same shape and left alone.

**Why.** Decision 124 is about `safe-px px-5`; this is the same defect on the other axis, and it was
live on the screen the coach uses for ninety minutes. `safe-pb` sets `padding-bottom`, `py-2` compiles
to `padding-block`, both land in `@layer utilities` with equal specificity, and emission order decides:
`.py-2` is emitted before `.safe-pb`, so the pair resolves to the bare inset. Measured in a browser at
390 px: **`pb 0px`** before, `pb 8px` after. On a phone with a home indicator the inset happens to be
larger than the 8 px that was lost, which is why this was never visible on the device most likely to be
looked at — and 0 px on everything else, directly under « Coup d'envoi » and « TERRAIN ».

**The repair is not the obvious one, and that is the reusable part.** `safe-pb pb-2` fails identically:
`.pb-2` is emitted *before* `.safe-pb` too. What is wanted here is not a `max()` of the two — 124's
shape, where the inset and the gutter are alternatives — but their **sum**: the buttons should clear the
home indicator rather than sit on it. A sum of a token and an `env()` cannot be written as two
utilities at all, whatever the order, because two declarations of one property can only ever replace
each other. So it is one declaration, following the `tabbar-pb` precedent, which composes exactly this
shape for exactly this reason.

**Why a named utility rather than the inline form, and a correction to this entry.** An earlier draft
said an arbitrary value had been tried and was *inexpressible* — that `calc()` needs whitespace around
`+`, so it must be smuggled through Tailwind's `_` escape, and that an underscore anyone could delete
is the hazard. **Both halves are false and were measured so.** `components/ui/sheet.tsx:149` already
ships this exact shape, `pb-[calc( 0.75rem + env(safe-area-inset-bottom, 0px) )]` with no underscore
anywhere in it — the spaces inside those brackets are this document's, not the source's, because an
unspaced class-shaped string in prose is a candidate Tailwind extracts and emits as a real rule from the
markdown it scans — and with a comment saying it is a single `pb-*` utility « so it cannot be overwritten
by `py-*` », i.e. the reasoning this entry claimed to have invented. And compiled through
`@tailwindcss/cli`, a bracketed `var(--spacing) * 2 + env(…)` emits exactly that sum as
`padding-bottom: calc(…)` with the operators spaced: Tailwind inserts the whitespace itself, and there
is no underscore to delete. The inline form was available, in use in this repository, and not rejected for
being unwritable. The real argument is one the draft missed and is strictly better: an arbitrary
`pb-[ … ]` lands in the **built-in** `padding-bottom` block and is emitted *before* `.safe-pb`, so
`pb-[ … ] safe-pb` silently loses the sum, while the named custom utility is emitted *after* `.safe-pb`
and survives a stray. (This entry names the error rather than quietly fixing it, as 124's does.)

**The name says the amount and the axis, not the consumer.** `safe-pb-*` is functional:
`safe-pb-2` reads « the inset plus 2 spacing units », generalises to the next bar that wants 3, and
sits in the `safe-*` family where someone would look for it. An earlier `sticky-pb` named the
*position of its consumer* and said neither 8 px nor « controls », which invited exactly the two wrong
reaches: `match-bar.tsx:105` is also `sticky` but on the other axis, and `bottom-nav.tsx:53` is a fixed
bottom bar that decision 124 established must stay bezel-to-bezel and must **not** gain 8 px. The sum
is also written flat rather than as a nested `calc(calc(…))`, which is how `tabbar-pb` and
`app-shell.tsx:142` already write theirs.

**`safe-pb-2` is not immune to a stray `safe-pb`, it is merely lucky.** Measured, `safe-pb-2 safe-pb`
gives `pb 8px` — the new utility wins, because `.safe-pb-2` is emitted after `.safe-pb`. That is the
opposite of how `gutter-px` sits relative to `safe-px`, and it is the same mechanism: within a property
group the order is not the source order and not « custom after built-in ». It is a fact about these two
names today, not a property of the design, and nobody should rely on it.

**The sweep is the part worth keeping.** Every `safe-pb` / `safe-pt` / `safe-px` user, all five:
`game-mode.tsx:1044` was the defect; `components/ui/sheet.tsx:153` is `safe-pb shrink-0`;
`match-bar.tsx:105` is `safe-pt` beside `px-3`, a different axis; `app-shell.tsx:76` is `safe-pt` alone;
`bottom-nav.tsx:53` is `safe-pb safe-px` with no shorthand and is deliberately bezel-to-bezel (124).
So four are clean for one reason — a lone longhand with no shorthand competing for the same property —
and that sentence is the whole test. Decisions 124 and 126 found **two patterns across four call
sites** between them — `safe-px px-5` on three screens, `safe-pb py-2` on one bar — and the repository
has no fifth.

**Consequences.** `md:py-3` still overrides the bottom padding above `md`, exactly as it already
overrode `safe-pb`: the bar is `md:static` there, so there is no home indicator to clear and nothing
changes. The unit suite (1324) and the browser suite (5 specs) both pass, the second because this is a
screen the happy path walks.

## 127 — The error screen offers a reload unconditionally, and classifies nothing in order to be correct

**2026-10-01** · accepted · follows 058

The screen both error boundaries show said « Cet écran n'a pas pu s'afficher. Réessayez ; si cela se
reproduit, passez par un autre écran et revenez. » Three things were wrong with twenty-two words. Both
instructions are `vous` in an app that tutoies without exception (decision 074) — a third shipped
vouvoiement beside the two `docs/ROADMAP.md` already lists, and this one hid behind the same `-ez`
imperative the others did, which is why no `grep` for « vous » or « votre » ever saw it. And both
instructions are **inert** for a whole class of failure: `reset()` is `this.setState({ error: null })`
and nothing else (Next 16.3.6, `dist/client/components/error-boundary.js:16-19`), so it re-renders the
segment out of the same JavaScript bundle; and « passez par un autre écran et revenez » is a
client-side navigation, which is the same bundle wearing a longer path. For a failure that *is* the
bundle, the screen's only two suggestions were the two things that cannot work.

**Decision. « Recharger la page » is the primary button, offered for every error this screen shows,
and the screen does not have to know what broke in order to be right.** That is the whole argument and
it is the part that must survive: a reload is never *wrong* guidance for « this screen could not
display » — it discards the document, the router cache and the bundle, so whatever state produced the
crash is gone and the app comes back on the deployment that is live now — whereas retrying is wrong
*specifically*. So correctness of the advice does not depend on correctly identifying the error, and
`isDeploymentSkew` (`components/errors/error-screen.tsx:78`) may change **only the sentence, never
whether the button is offered**. « Réessayer » stays, second, because the other common cause here is a
query that failed once on a cold Neon connection and a re-render is the cheap fix for that one;
`window.location.reload()` and not `router.refresh()` at `:129`, because only a document reload throws
the stale bundle away.

**This decision is what let the slice survive its own motivating diagnosis being refuted**, and that
is recorded here because it is the reusable part. The failure that made the old copy's wrongness
concrete is deployment skew — a page loaded from one deployment posting a Server Action id the newer
one no longer has, which Next answers with 404 « Failed to find Server Action … older or newer
deployment » and the client surfaces as `UnrecognizedActionError`. It was reproduced end to end against
two production builds served on one port, and it is real. It is **not** the crash the owner reported
from his iPhone: that one survived a force-quit, a force-quit is a document navigation, and a document
navigation is always served by the latest deployment, so skew cannot survive one. His crash is still
unexplained and is another session's investigation. Had the branch keyed its design on the diagnosis,
the refutation would have taken the branch with it. Because the design keyed on « what is never wrong
to say », the refutation only shortened the claim: the screen's advice is now true, and
`UnrecognizedActionError` is a real exposure on every deploy that moves an action, which is a different
and smaller sentence than « this fixes the bug ».

**There is no host-level fix to buy, so this affordance is the whole of what engineering can do about
skew.** Vercel's Skew Protection is Pro and Enterprise only — the owner is on the free plan — and in any
case defaults to a one-day maximum age, so it would be a window and not a guarantee. Setting
`deploymentId` alone adds a `?dpl=` cache-buster to asset URLs without routing a request back to the
deployment that served the page, so it buys nothing here. The recovery affordance is not a stopgap
pending a transparent fix; it is the fix available.

**The blast radius, put on the record because of what it argues for next time.** This screen is the
recovery surface for all **42 `useActionState` call sites** — availability, compositions, ratings, team
settings, login, the retro forms — because React cancels the queued action and shows the nearest
boundary when a dispatch throws. **Game mode is the one part of the app structurally immune**, and for a
reason worth keeping: `lib/match/outbox.ts` posts to a Route Handler whose URL is a path, which exists
identically on every deployment, and ingestion is idempotent on `client_event_id` (invariant 6), so a
retry against a deployment the page has never met both routes and deduplicates. That was built for
offline and is skew-immune as a side effect. **So the next time somebody proposes replacing a Route
Handler with a Server Action because it is less code, this is the cost:** the endpoint stops being
addressable by path and starts being addressable by a build-time id, and the live match becomes a
screen that can be killed by a deploy. The live match is the one screen in this app that must not be.

**The `unstable_` predicate was refused.** `next/navigation` does export
`unstable_isUnrecognizedActionError` in 16.3.6, and it was not used. Two reasons, in order: the
`unstable_` prefix is outside semver, so a minor Next bump could break the *recovery* screen — the
worst file in the repository to have fail — and the predicate is an `instanceof` check against a class
identity that a stale bundle is not guaranteed to share with the one that threw, which is precisely the
situation it would be asked about. The load-bearing check is `error.name === "UnrecognizedActionError"`,
set in the constructor and carried across bundles as a string. And because the branch only chooses a
sentence, a future Next renaming the error degrades this screen to vaguer copy rather than to a dead
end — which is the same property the unconditional button buys, applied to the detector.

**`retry` is destructured and deliberately unused**, with an `eslint-disable` line saying so
(`components/errors/error-screen.tsx:88`, and both boundaries now declare it). It is the boundary's
third prop (`error-boundary.js:20-24`, passed at `:114`, typed in `error-boundary.d.ts`) and it does
`router.refresh()` then `reset()`. It looks like the answer and is not: the RSC refetch is issued by the
same stale bundle, so it asks the new deployment for a payload in the old format. Naming it in the
props is cheaper than the next reader rediscovering it in Next's types and assuming nobody looked.

**`digest` stays on screen, framed as something to send.** It renders as a **ten-digit decimal** in a
production build — `3004583682`, observed, not a hash — which means it can be read aloud over a phone,
and on this project the person reading the Vercel logs is the person the app broke in front of. So the
line is « Si tu nous le signales, donne ce code : … » rather than « Code de l'erreur ». It is **absent
for a client-side throw**, and the screen then prints no code line at all: that absence is itself a
diagnosis — no code means the throw happened in the browser, so there is no server log line to go and
find — and it is recorded in a comment at `:140-146` rather than on screen, because explaining that to
a coach is noise.

The tone was modelled on `app/(jeu)/match/[id]/jeu/error.tsx`, which decision 058 already got right,
already tutoies, and was left untouched.

## 128 — The tutoiement is a test, because a convention nothing checks is a convention that decays

**2026-10-01** · accepted · enforces 074

**Decision.** Decision 074's rule — the French tutoies, always — is now enforced by a test,
`tutoiement.test.ts`, at the repository root. It reads `app/`, `components/`, `lib/` and `db/` as text
with `node:fs` and fails, on any line that is not a comment, on two things: the pronouns « vous »,
« votre », « vos », and a curated list of second-person-plural imperatives — « Appuyez », « Touchez »,
« Réessayez ». A hard-coded baseline can excuse a known breach by its text; it held two when this was
written, it is **empty as this merges**, and two further tests keep it that way — one fails if an entry
stops matching anything, one caps its length, now at zero.

**Why a test and not a convention.** 074 was prose in `CLAUDE.md` for months, it was quoted in reviews,
and eight breaches accumulated under it anyway: three in `components/action-sheet/terrain-sheet.tsx`
(`:176`, `:206`, `:301`, which now read « relâche-le … utilise », « Appuie » and « Fais glisser …
appuie »), one in `components/action-sheet/lineup-composer.tsx:102` (« Place au moins un joueur. »), and
four in `lib/match/presenter.ts` (`:569` and `:570`, now « Touche un joueur pour le faire entrer. »,
`:868` « Renseigne-la » and `:882` « ouvre-la »). The terrain-sheet three are copy a coach reads
mid-match with the clock running, and `:206` is a live-region announcement, which is why no screenshot
in the `audit/` passes could ever have caught it. A rule nothing checks is a rule that decays, and the
rate of decay is invisible until something counts.

**And a test was holding one of those breaches in place, which is the sharpest point here.** Five tests
already asserted the *absence* of the word before this change — `lib/composition/hints.test.ts:59`,
`lib/match/presenter.test.ts:762`, `lib/player/shirt.test.ts:78`,
`lib/stats/best-seven-copy.test.ts:741` and `lib/team/membership.test.ts:76` — and every one of them
lives under `lib/`, asserting about the return value of a function it imports. Meanwhile
`lib/match/presenter.test.ts:428` asserted « Touchez un joueur pour le faire entrer. » **verbatim**,
with `toBe`. So the suite was not merely failing to catch that breach: it was *pinning* it, and a
session that had fixed the sentence would have been told it had broken something. That is the whole
argument against guarding a house rule with per-module assertions on hand-picked return values — the
author of such a test picks the string he was already thinking about, and a rule about every string
cannot be checked one string at a time.

**Why a `node:fs` walk and not a Vitest glob, and why the file sits at the root.**
`vitest.config.ts`'s `include` is `lib/**/*.test.ts`, `db/**/*.test.ts`, `*.test.ts`. That governs which
files are **collected as tests**, and it says nothing whatever about which files a test may **read**.
Confusing the two is what made the hole look unpluggable, and separating them is the reason this guard
can exist at all: the file is at the repository root so that it *is* collected, and it scans `app/` and
`components/`, out of which Vitest collects nothing, because reading a directory needs no glob's
permission. Decision 097 made the same move for `lib/composition/copy.test.ts`. Being text rather than a
module, the scan also reaches the one shape no import can: **JSX text**, `<p>Réessayez</p>`, which is
inside no string literal and is the return value of nothing.

**Why a small hard-coded baseline rather than a clean sweep — and why it is empty anyway.** Two of the
ten breaches the imperative rule found were in `components/errors/error-screen.tsx:50`–`:51` — « Cet
écran n’a pas pu s’afficher. Réessayez ; si cela se reproduit, passez par un autre écran et revenez. »,
wrapped across two lines and therefore two baseline entries. That file was another session's, already
rewritten on open pull request #118, so correcting it here would have been a conflict for nothing. The
alternative was to hold the whole guard until #118 merged — that is, to have no guard during exactly the
days when sentences are being rewritten, which is when it earns its keep.

**#118 merged first, as decision 127, so the baseline never shipped with anything in it.** The two
entries and the cap's `2` came out in their own commit, the last on the branch, and the array is now
`[]` with the cap at `0`. Not a loose end tidied after the fact: the staleness test **forced** it. The
moment that sentence became the infinitive « Réessayer » under the rebase, the two entries matched
nothing and the suite went red naming them, so whichever pull request merged second had no way to leave
them behind — `main` would have been red until they were deleted. **Be precise about the order, because
the obvious shorter sentence is false:** the deletion was not part of the rebase. The three rebased
commits in between carry the rebased tree *and* the two entries, so each of them is red on that one
test by construction — which is what a guard that cannot be papered over looks like from the inside, and
why the only state that ever reaches `main` is the squashed one. A baseline that cannot outlive what it
excuses is the only kind worth writing, and this is the proof, on the first and only entries it ever had.

The hazard is named rather than hoped away: **an allow-list is a place a future breach can be hidden**,
and a baseline fails in two directions, each with its own test. Downwards: « has no stale entry left in
the known-breach baseline » goes red, naming the entry to delete, the moment one of those two sentences
is rewritten, so the list shrinks under pressure or not at all — which is exactly what happened, one day
later. Upwards, which is the direction that actually silences a guard: « cannot grow its known-breach
baseline » asserts a length ceiling, because an allow-list with no ceiling is defeated by the same edit
that would appease it — append a line and the new breach is excused, and nobody reading a diff on that
array can tell an added line from a deleted one. Raising the ceiling is then a deliberate act, in
writing, that a reviewer sees. An entry pinned from both sides is a different object from an allow-list
that grows quietly, and the ceiling is `0`, so the next session that wants to excuse a sentence has to
say so in a number before it can.

**The baseline is keyed on the trimmed, comment-stripped line text, never on a line number.** A line
number goes stale on the first edit anywhere above it, and the entry then excuses a line nobody chose —
which is worse than a wrong failure, because it is a *silence*. The text cannot drift that way: rewrite
the sentence and the entry simply stops matching, which is the condition the staleness test reports.

**Consequences.** The imperative rule is a curated list and deliberately **not** a `-ez` pattern: the
pattern was written and thrown away because « assurez » in a quotation, a third-person sentence and half
the vocabulary of a form label all end in those letters without addressing anybody, and a check with a
false positive a week is a check somebody turns off. The list is meant to grow; an entry is only wrong
if it is *ambiguous*, and `allez` was dropped on exactly that ground, being this team's interjection
before it is an imperative. `e2e/` is out of scope on the argument written into the file: its French
mirrors the UI's, so a flag there is the same finding twice, and a spec is free to assert a word's
absence, which a scan cannot tell from its presence. `db/` is in, for `db/seed.ts`, because the demo
season is read on a screen; `db/migrations/` is out, because a finding there is one nobody is allowed to
fix. And `\b` is unusable for French text in this repository: it is ASCII, so `/\bfaites\b/` matches
inside « **Dé**faites », the label over the losses on `/stats`, which was the first thing the imperative
rule flagged. Every rule goes through `wholeWords`, which spells the boundary out as a lookaround on
`\p{L}`.

## 129 — A wish about where you play is the player's own, and the table it writes to had no rows

**2026-10-01** · accepted · **supersedes the one clause of decision 104 that cited the preferred
positions as its precedent.** 104's rule stands; `profile:editShirtName` keeps its fallback.

The owner, from his phone: saving his preferred positions crashed, and `player_positions` in
production was empty. Two separate defects sat under that, and they are in one entry because the
second is reachable by anybody and the first decided *which* anybody could reach it.

**Part one. `updatePlayerPositions` asserts `profile:editPositions` directly, and nothing else.**
`can()` was already right about this: `profile:editPositions` is in `SELF_ACTIONS`
(`lib/auth/can.ts:112`), and the self branch (`:142-147`) refuses any `targetMemberId` that is not
the actor's own membership and refuses every self action outright to `is_player = false`. The coach
never went through that branch. He went through `assertCanActFor` (`lib/player/actions.ts:53`), which
tries the self action and then falls back to the coach's `member:update` — so the gate was wide open
at the call site while `can()` sat behind it saying no, and invariant 4 was satisfied to the letter
the whole time. A permission helper that tries two actions and succeeds on either is not an ad-hoc
check, which is exactly why this was easy to miss. Line 116 is now a bare `assertCan`, and
`assertCanActFor` has exactly one caller left: `:227`, the flocage.

**What of decision 104 survives, and what does not.** 104's rule survives whole, and this entry is an
application of it rather than a retreat from it: *when two fields of one record answer to two
different owners, they are two forms and two actions, not one form gated on the stricter of them.*
What is superseded is a single descriptive clause in 104's fourth paragraph, which said
`updateShirtName` « uses the `assertCanActFor` shape the preferred positions already use » and
offered that shape as the precedent to copy. The precedent was itself the defect. The positions no
longer have that shape and should never have had it; 104 reached the right answer for the flocage by
pointing at the wrong neighbour.

**And the flocage keeps its fallback, because it is a different kind of thing.** A shirt name is
printed on a garment somebody orders, in a batch, by a deadline, from a supplier — 104's own reason
for putting it on the `/equipe` squad row is that that is the list a coach reads when he orders a set
of shirts. A coach typing « MOMO » for a teammate who has not got round to it is finishing an order.
A wish about where you like to play is an account of yourself: there is no order, no deadline and no
supplier, and a coach filling it in is a coach writing down his own opinion of a player under that
player's name, in the one field on the page that is supposed to be the player speaking. The
asymmetry is not about seniority, as 104 already said about the number; it is about whether anybody
else can truthfully answer the question.

The page follows that decision rather than taking a second one: `can(actor, "profile:editPositions",
context)` at `app/(app)/joueur/[id]/page.tsx:50` is passed straight down as `canEdit` (`:115`), and
the card renders read-only with the picker `disabled` and one line under it — « Chaque joueur choisit
ses postes lui-même. » (`app/(app)/joueur/_components/positions-editor.tsx:66`, the sentence at
`:76`). A dead pitch with no explanation is a defect of the wave-3 shape; the sentence is the whole
reason the targets do not respond, and it is prose under the thing it explains rather than a `title`
nobody on a phone can reach (decision 072).

**Part two. The eleven positions are seeded by a migration, because the schema's own foreign keys
depend on them.** `db/migrations/0006_seed_positions.sql`, the eleven rows, `ON CONFLICT ("code") DO
NOTHING`.

`player_positions.position_code` has referenced `positions.code` since the first migration
(`db/migrations/0000_wealthy_radioactive_man.sql:264`) and **no migration has ever inserted those
rows.** Only `seedReference()` did, and `seedReference()` is reachable by hand and by no workflow:
`ci.yml` and `release.yml` both run `db:migrate` and stop there. So a database that has been migrated
and never bootstrapped carries the constraint and none of the rows, and every save of a preferred
position raises `23503 foreign_key_violation`. **Measured on a fresh database after `db:migrate`
alone: `positions` held 0 rows before this migration.** The symptom is precisely the owner's, and the
reason it read as a mystery is that **reads work perfectly** — a player with no rows renders « Aucun
poste préféré indiqué », the screen is correct and complete, and nothing is wrong with it until he
taps. Migrating is what creates the constraint, so migrating is what has to satisfy it.

The framing worth keeping is not this session's; it came from the session that was scoping the
deployment split, and it is better than anything in the commits: **« a `positions` table with no rows
is not an empty table, it is a broken constraint — the foreign key is a promise the schema makes and
nothing was keeping. Seeding it from a migration is the schema finishing its own sentence. »**

`DO NOTHING` and deliberately not `DO UPDATE`. `db/reference.ts` stays the single source of truth for
this vocabulary and `seedReference()` still owns every *later* change to the rows: it upserts labels,
lines and coordinates on each `db:seed` / `db:bootstrap`, so a corrected label or a moved marker
reaches an existing database through the seeder rather than through a new migration. This migration's
only job is that the rows exist at all, and it must never overwrite what the seeder has since
refined. The file says so in its own header, because a copy of reference data frozen at one moment is
the kind of thing a later session will otherwise try to keep in sync.

**`formations` and `formation_slots` are 0 either way, and are deliberately left that way.**
`formation_slots.position_code` has its own foreign key to `positions.code`
(`0000_wealthy_radioactive_man.sql:239`) and both tables are written only by the same seeder, so the
same migrated-never-bootstrapped database can **plan no composition at all** — an editor offering an
empty Formation select, which is the third symptom the previous session predicted without needing a
query. Fixing it here was rejected: the built-in templates are editable content, a team may fork them
into its own `formations` rows (decision 005), and a migration inserting them would be a migration
quietly taking a product decision about what the seven shapes are and about what happens to a team
that has already edited one. That is the owner's call and it is in `docs/ROADMAP.md` as one, with the
measurement attached, rather than being settled by whoever happened to be fixing the positions.

**Part three. A failed write is a French sentence; a forbidden one is still a 500.** The `try` wraps
only the `db.transaction` (`lib/player/actions.ts:132`) — `requireActor`, the `safeParse` and the
`assertCan` all stay outside it on purpose. A malformed form is already a `FormState` the picker can
render, and a `ForbiddenError` **must** keep reaching the error boundary rather than being flattened
into a polite French sentence: somebody editing a teammate's wishes is a bug or an attack, not a
failed save, and it should stay loud. A write that fails returns « Tes postes n'ont pas été
enregistrés. Réessaie. » (`:157`), which is true of every cause and promises nothing about which. The
log reads the Postgres `code` and `constraint` off the error object rather than stringifying it,
because the code is the diagnosis and the message is not: `23503` means the `positions` table has no
such row — an unseeded database, nothing to do with this player — while `23505` would mean two rows
for the same position got past `toPositionRows`. Those are different bugs with different fixes, one
digit apart, and a stringified error buries the digit.

**The honest weakness, and it is the reason any of this shipped.** **Nothing in the suite exercises
the positions editor** — no unit test and no Playwright spec mentions `updatePlayerPositions`,
`PositionsEditor`, `PositionPicker` or any string the card prints. `lib/player/positions.test.ts`
covers the pure helpers thoroughly and never reaches the action. What holds this change up is
`lib/auth/can.ts`'s own assertions, and they are narrower than they look: `lib/auth/can.test.ts:79`
asserts a *player* may not touch somebody else's positions, `:126` that a *non-playing* coach has
none of his own — and the `playerCoach` fixture at `:27`, a coach who plays, which is exactly the
actor the old fallback let through, is used for three self-scoped assertions at `:135-137` and never
once with a foreign `targetMemberId`. So the case this entry turns on is true of `can()` by
construction and asserted nowhere. A 500 on the most ordinary save in the app shipped because the
most ordinary save in the app is untested; that is a line in `docs/ROADMAP.md`, not a claim that this
is now safe.

## 130 — The wish picker offers eight codes, and the vocabulary stays at eleven

**2026-10-01** · **superseded on 2026-10-06 by decision 141**, which narrows the picker again to the six
distinct codes of `1-3-2-1` alone · everything below about the vocabulary staying at eleven, about the
Zod enum, and about the chip row still holds; only « eight, the union of two shapes » does not

**Decision.** The preference picker draws `PREFERRED_POSITION_CODES` (`db/reference.ts:164`) — eight
codes: `GB DG DC DD MG MC MD AT`. `POSITION_CODES` stays at eleven, the composition editor keeps all
of them, and the Zod enum that validates a submission keeps all of them too.

**Eight is not a hand-picked list, it is a union.** It is exactly the union of the slots of the two
shapes this team really plays: `1-3-2-1` is `GB DG DC DD MC MC AT`, `1-2-3-1` is `GB DC DC MG MC MD
AT` — seven on the pitch in each, eight distinct codes across the two. `db/reference.test.ts:188`
**recomputes that union from `BUILTIN_FORMATIONS`** rather than comparing it with a second typed
list, so changing either formation fails the test and the stated rule cannot drift away from the
shipped constant; a hand-written copy would have been a comment pretending to be a check. `satisfies
readonly PositionCode[]` keeps the subset honest the same way, by the compiler rather than by prose.

**Why the wide list does not move with it.** Narrowing a wish list judges *what it is reasonable to
ask a player*; narrowing the vocabulary judges *what the team may field*. Those are different
questions with different owners, and collapsing them is how a copy change becomes a capability
change. So all seven built-in formations stay shippable, the composition editor still places any of
the eleven, and `MOC`, `AG` and `AD` still exist in this app — a coach can put them on the pitch this
Sunday. They are simply no longer *offered as a wish*, because being asked where you would like to
play is a question about the shapes the team actually turns out in. For the same reason the
marker-spacing rule in `POSITIONS` is kept for all eleven even though the picker now draws eight: the
composition editor places a slot anywhere on that list, and a narrower picker must not license a
crowded layout somewhere else.

**The consequence the owner should see, stated rather than buried.** `MOC` is a slot in the built-in
`1-3-3-0` and `AG`/`AD` are slots in `1-2-1-3`. Both formations are still shippable and still in the
Formation select. **So after this, a player cannot wish for three positions that two of the team's
own formations still field.** Nothing in the app matches a wish to a slot — the composition editor
reads `player_positions` for display only, and the squad row prints the codes — so nothing breaks
functionally and no composition becomes unplannable. But it is a real narrowing, and it is the
owner's to reverse: if the team starts turning out in `1-2-1-3`, the two ailiers belong back in the
picker, and the way to do that is to add the label to `USUAL_SHAPES` in the test and let the union
recompute itself.

That is also why the copy reads « Ces postes ne sont plus proposés. » and **must never read
« n'existent plus », which would be false.** The codes exist, the formations that use them exist, and
a sentence saying otherwise would be the wave-3/4 failure again — a screen stating something untrue
that no test catches.

**The chip row, and its one-way rule.** The turf draws only `PREFERRED_POSITIONS`, so a stored `MOC`
would be invisible on it *and* unremovable — the form posts the selection's own keys, so it would
also keep being posted for ever. Hence a chip row below, derived from `value`
(`components/pitch/PositionPicker.tsx:95`) exactly as the grid is, which is what keeps `cyclePosition`
and the whole write path out of it: **a chip only ever removes** (`:107`). The sentence above it gains
a second half only when the picker is live — « Tu peux les retirer, pas les remettre. » (`:168`) —
because that is an instruction, and there is nothing to instruct a coach looking at a disabled card
about.

Removing a retired code that happened to be the **primary leaves the player with no primary**, and
does not promote a secondary in its place. Promoting one would invent a wish nobody expressed, and
choosing *which* secondary to promote would be arbitrary. No new state had to be built for it either:
the summary line already says « Aucun poste principal choisi. » (`:204`) and the form already posts an
empty `primary` for that case, so the honest outcome was also the one the screen could already
describe.

**`positionCodeSchema` keeps all eleven, on purpose** (`lib/player/validation.ts:21`). The form posts
back the codes already stored for the player, so a record still holding a `MOC` posts it; narrowing
the enum would make the server reject that player's whole submission and leave him unable to save
anything, ever again — a validation rule locking a player out of his own record because of a copy
decision taken later. Dropping a stored code is the picker's job, not the schema's. That is the shape
of the whole slice: the narrowing lives in the one component that offers choices, and nothing
downstream of it was narrowed at all.

## 131 — An unknown position code is `undefined`, and it sorts at `Number.MAX_SAFE_INTEGER`

**2026-10-01** · accepted · a convention, because it now lives in two modules

This earns an entry rather than a comment for one reason: the sentinel is in two places now, and the
next session to read a lone `?? Number.MAX_SAFE_INTEGER` will see a tidier `Infinity` and be right
about everything except the consequence.

`POSITION_BY_CODE` was built by `Object.fromEntries(...)` and **cast** to `Record<PositionCode,
PositionDefinition>`. That cast is why an unguarded `POSITION_BY_CODE[code].labelFr` type-checked, and
why a lookup on a code this module does not know threw `TypeError: Cannot read properties of
undefined` — from one bad `player_positions` or `formation_slots` row, which are `text` columns
referencing `positions.code` and not this closed list, that is a 500 on a player's profile, `/moi`,
`/equipe` and the composition editor at once. It is now `Partial<Record<PositionCode,
PositionDefinition>>` (`db/reference.ts:128`). Deliberately **not** `Record<string,
PositionDefinition | undefined>`, which would make the values honest while letting
`POSITION_BY_CODE["LIBERO"]` type-check and losing key checking entirely — one unsoundness traded for
another.

**The churn is the argument, not the cost.** The honest type produced **16 errors across 5 files**,
and the fifth file was `db/reference.ts` itself: `positionLabelFr` at `:192`, inside the module that
defines the lookup. A hand-written list of call sites could not have found that one, because whoever
writes the list is thinking about *callers*. When a cast goes, let the compiler enumerate the readers.

**`Number.MAX_SAFE_INTEGER` and not `Infinity`, and that is now the rule.** `positionRankOf`
(`db/reference.ts:204-205`) is where it is documented; `orderShape` in `lib/formation/shape.ts:114`
had already settled on it, so this reuses a choice rather than inventing a second one. `Infinity -
Infinity` is `NaN`, a comparator returning `NaN` leaves `Array.prototype.sort`
implementation-defined, and two unknown codes among one player's rows would then make
`sortPreferredPositions` non-deterministic — which makes `positionsSignature` unstable, and that
string is the React `key` the profile editor is mounted on
(`app/(app)/joueur/[id]/page.tsx:111`). The visible failure of an unstable comparator is therefore
not a mis-sorted list; it is a profile that remounts at random and loses what the player had just
tapped.

**And the test fixture has three rows, not one** (`lib/player/positions.test.ts:50`).
`Array.prototype.sort` never calls the comparator for a one-element array, so a one-row repro of an
unknown code exercises a different path and passes under either sentinel. One row would have proved
nothing and looked like proof.

## 132 — Production keeps its data, its super admin and its database password: the owner closes three standing items

**2026-10-01** · accepted · closes three items that had been carried for weeks · supersedes nothing

**Decision.** The owner has decided, in these words, that we are **not** wiping the databases, **not**
changing the super admin's password and **not** rotating the Neon `neondb_owner` password. All three are
closed. They are not deferred, not blocked and not waiting on a plan: they are **not being done**, and a
session that rediscovers the underlying facts should read this entry rather than re-propose the work.

**What each of the three was, so that nobody has to reconstruct it.**

- **The database wipe.** Originally the owner's own instruction, from before production existed. The
  ground then moved under it — production has since been migrated, deployed and tagged — and it had grown
  into a sequence needing its own written order of operations: what is dropped, in which Neon branch,
  `db:bootstrap` with a real password, re-seeding preview with the demo season. That sequence is now
  never going to be run, so it is not worth writing.
- **The super admin's password.** The account exists on a live instance and can read and rewrite every
  team. Its password spent the first hour of the deployment in the Vercel environment, which
  `docs/DEPLOY.md` says it must never do. `db:bootstrap` is idempotent and re-hashes on every run, so the
  change would have been one command; the owner's answer is that it is not being made.
- **The Neon `neondb_owner` password.** It appeared in a session transcript, which is why rotation has
  been recommended repeatedly in `docs/`, in `COORDINATION.md` and in session reports.

**What follows from closing them, stated plainly rather than argued.** The transcript-exposed database
password stays valid, so anyone holding that transcript holds the database. The super-admin credential
stays as it is, with the reach described above. Production keeps whatever rows it holds, so no session may
assume an empty table on production — and one empty table is a live defect rather than an invariant:
`formations` and `formation_slots` hold nothing there, so **no composition can be planned on production
at all**, which is a separate open question for the owner and is unaffected by this entry. The standing
prohibitions are unchanged and are now the whole of the protection: **never `db:push` against a production
database, never `db:reset` against one, `ALLOW_REMOTE_RESET` set nowhere, `SUPER_ADMIN_USERNAME` and
`SUPER_ADMIN_PASSWORD` never in Vercel and never in a GitHub secret, and the production connection string
not to be extracted or printed.**

**Why this is an entry and not a line in `COORDINATION.md`.** The three items were raised in every session
report for weeks, because the facts behind them are rediscoverable from the repository and each new session
found them again, correctly, and said so. A `## NOW` line would have gone stale and a roadmap item would
have read as waiting. The owner's decision is the only thing that stops the loop, so it goes where
decisions go. Two items that travelled with the wipe but are **not** closed by it: the
`check (username = btrim(lower(username)))` constraint, which exists only in Zod and is why a trailing TAB
once reached the `username` column, and the owner's confirmation that Preview and Production
`DATABASE_URL` are two different strings. Neither needs a wipe; both are still open.

**The number.** 129, 130 and 131 are reserved by the other machine for PR #125's three placeholders, which
it said it is assigning on its own rebase, so this takes **132** rather than the next free integer. A gap
is cheaper than a collision: a collision costs a renumbering across four files, which has already happened
once today.

## 133 — The native picker keeps the thumb, and says underneath what it holds

**2026-10-01** · accepted · supersedes the « what is still not ours » carve-out at the end of
decision 109

*(Numbering: another session is assigning numbers on merge and 123 is already spoken for by a decision
written on `perf/acknowledge-tab-taps`. This is the decision about the five native date and time
pickers echoing their value in the app's own shape; the merging session gives it its number.)*

The owner, from his iPhone: every date must be `DD/MM/YYYY` and every clock 24-hour. The audit that
preceded any change found the remark narrower than it sounds. **Decision 109 had already done it**
everywhere the app formats a date itself: `lib/calendar/time.ts` and `lib/player/injury.ts` are the
only two formatters in the repository, every call site goes through one of them, the 24-hour clock is
pinned twice over by the `fr-FR` locale *and* an explicit `hour12: false`, and the tests hold the
literal French strings rather than re-deriving them. **None of that is touched here**, and a session
arriving at this entry with the same remark should re-run that audit before believing there is a
formatter to fix.

The one surface no formatter can reach is the five `<input type="date">` and
`<input type="datetime-local">` controls — the match form (`app/(app)/match/_components/match-form.tsx:96`),
the séance form (`app/(app)/entrainements/_components/training-form.tsx:51`), the two dates of an injury
declaration (`app/(app)/joueur/_components/injury-declare-form.tsx:60` and `:82`) and « Guéri le »
(`app/(app)/joueur/_components/injuries-card.tsx:99`). They render in the **browser's** locale, which no
stylesheet, no `lang` attribute and no `Intl` option of ours can override: on a phone set to English the
owner picks a kick-off in `MM/DD/YYYY` off an AM/PM clock, inside an app that writes `27/09/2026`
everywhere else. Decision 109 saw exactly this, offered the owner a control of our own, and he declined
— so 109 wrote it down as « not ours » and stopped. He has come back to it with a third answer, which is
better than either of the two that were on the table, and that is what this entry records.

**Decision: the native control stays, and gains an echo.** `components/ui/date-input.tsx` wraps all five
of them and renders one quiet line underneath — « 14/03/2026 », or « 14/03/2026 à 20:05 » with the same
« à » `formatWhen` already uses — saying, in the app's shape, what the picker currently holds.

**Why the control is kept.** It is still the best thing under a thumb: the system wheel on iOS, a
keyboard that knows it is typing a date, a calendar the owner already knows how to drive, and
`min` / `max` enforced by the platform. A masked text field or a hand-rolled calendar would make the
*format* correct by making the *control* worse, on the one device this app exists for — and it would be
ours to maintain, in a repository that has deliberately hand-rolled components but has never hand-rolled
an input method. Trading a good control for a good string is the wrong way round.

**Why an echo is honest rather than a workaround.** The defect is not that the picker is wrong — it is
showing the owner's own phone's format, correctly — it is that the reader has to hold two shapes of one
date in his head, which is precisely the work decisions 101 and 109 exist to remove. An echo removes it
without lying about anything: the app states the date in the app's shape, beside a control that states
it in the system's. It is a confirmation, not a label, which is why it is a quiet `text-sm text-ink-muted`
line and not a second field.

**Nothing is rendered at all for an empty or unreadable value.** No `--/--/----`, no « Aucune date ». A
screen showing `--/--/----` is *stating* something, and this one has nothing to state; placeholder digits
under an empty field are noise at best and, on a form the reader has not filled, an invitation to read
them as a value. `formatInputValueFr` returns `null` rather than a string for every input it cannot read
(`lib/calendar/time.ts:269`), and `DateInput` renders no element for `null` — the wave-3 and wave-4 rule
that a screen says less rather than something untrue, applied to the absence of a date.

**The echo never constructs a `Date`, and that is load-bearing.** `formatIsoDay`
(`lib/calendar/time.ts:253`) reads the parts of the `YYYY-MM-DD` string with a regular expression and
reorders them. `new Date("2026-03-14")` is **UTC midnight**, so any formatter given a timezone west of
Greenwich renders the 13th — and the owner's phone was reproduced at `America/New_York` for exactly that
reason. An echo off by one day would be worse than no echo: it would turn a cosmetic mismatch into the
app contradicting the control directly above it, and the reader would have no way to tell which of the
two had the date he picked. The same holds for the wall clock, which is read out of the string rather
than through `Intl`: there is no instant here, only the digits the input will submit.

**`lib/player/injury.ts` was a settled file and was touched for exactly one reason.** It already owned
this arithmetic — decision 109 had left `formatDateFr` there as the one place that turns a `date` column
into French digits — and the fix for a wrong date format must not introduce a **third** way to format a
date. So `formatDateFr` now delegates (`lib/player/injury.ts:148`) and the digits live beside the instant
formatters they have to agree with; a unit test asserts that the echo and `formatDate` produce the same
string for the same calendar day, so the two can no longer drift apart silently. `formatDateFr` keeps its
own documented behaviour of returning a non-ISO value untouched, because its callers want a column
holding prose to show the prose.

**The echo is `aria-hidden`, and deliberately not in `aria-describedby`.** The defect is that the *eye*
sees the browser's locale; a screen reader already speaks the control's value correctly, from the
control. Appending « 14/03/2026 » to what the control announces would make it say the same date twice in
two formats — and `components/ui/field.tsx:43` keeps a control's accessible description to its hint and
its error on purpose, so widening it is a change to every field in the app, not to this one. Decisions
116 and 117 are the two halves of the principle this follows: 117 refused to answer a *visual* loss with
an `aria-label`, because that « tells the one reader who did not need telling », and 116 put the thing a
reader needs on screen, visibly labelled, rather than in an attribute. Here the direction is reversed and
the rule is the same — a repair for a visual mismatch is addressed to the eye only.

**Consequences.** `DateInput` passes `name`, `value` / `defaultValue`, `required`, `min`, `max` and the
`Field` wiring straight through, so every Server Action receives the field it always did and the forms
still post **with JavaScript off**; without hydration the echo is simply the one the server rendered from
`defaultValue`, and it stops following the picker rather than disappearing. Any new date or time field
uses `DateInput` and not `Input` — a bare native picker is now the exception that has to justify itself.
The Playwright suite addresses these inputs by their label (`e2e/happy-path.spec.ts:162` and two more,
`e2e/offline.spec.ts:83`), which the wrapper does not change, because the `<label for>` / `id` pairing
still comes from `Field`.

## 134 — The retro sheet has one list of actions, and *enterable* is not *correctable*

**2026-10-01** · accepted · amends the retro half of decision 047 · narrows nothing in decision 049,
and exists partly to stop a later session widening it by accident

The owner, on typing up a match played without his phone: the add button must sit **under** the actions
and not over them; the score must not be editable directly; the same actions as in game mode must be
available; and « Changements » and « Actions du match » must become **one** block. Four sentences, one
redesign — and the one below the waterline is the fourth, because « one block » is a statement about the
data model before it is a statement about the screen.

**Why one list.** The two cards were never two things. `buildRetroLog` has emitted a substitution as an
ordinary `SUBSTITUTION` event since screen 8 was written — the same type, through the same ingestion, as
a goal or an injury (decision 047) — so « Changements » and « Actions du match » were a distinction the
data model did not make, maintained by two field prefixes, two decoders, two schemas, two domain types
and two sets of validation rules that converged only inside one function. One `<ul>` in the order the
coach typed it is not a simplification of the screen; it is the screen finally agreeing with the log it
writes.

**Why a discriminated union and not one widened record.** The obvious cheap move is a single row type
with nullable `outId` / `inId`, and it is the wrong one. A goal would then carry an empty pair of fields
it can never mean, `memberId` would mean « the scorer » on one row and nothing on the next, and every
validation rule — « sort quelqu'un qui n'était pas sur le terrain », « buteur inconnu est une réponse,
sortant inconnu est une ligne inachevée » — would open with a null check standing in for a type check.
`RetroAction` is instead a union discriminated on `type`, with `RetroChange` and `RetroFact` surviving as
`Extract<…>` of it rather than as parallel declarations, so `retroPitch` kept its signature and its
tests. The price is a `switch (action.type)` at the four places the two shapes diverge — the payload
builder, the stamp resolver, the idempotency seed and `findRetroIssues` — and the price **is** the
guarantee: adding an arm is a compile error at exactly those four lines and nowhere else. That is also
why `resolveFactClockMs` takes `RetroFact` and not `RetroAction`: decision 048 gives an undated
substitution the break and an undated fact the middle of its player's own spell, and now that both
travel in one array, « just resolve the stamp of an action » is an easy and wrong thing to write.
Passing a substitution there does not compile.

**Why two constants, which is the paragraph that matters.** `RETRO_ACTION_TYPES` and
`RETRO_FACT_TYPES` now differ by exactly one member — `SUBSTITUTION` — and they are **not** to be merged
on that basis. They answer two different questions. `RETRO_ACTION_TYPES` answers « what may a coach
**type up** on a sheet he is still filling in? » `RETRO_FACT_TYPES` answers « what may he **correct**
afterwards, on a match that is already frozen? » Only the second is a permission, and
`isAmendableEventType` (`lib/retro/amend.ts`) is literally `isRetroFactType(type) || type ===
"SUBSTITUTION"` — it reads the **fact** list. So putting a type into the action list does not make it
correctable, and that asymmetry is the whole point: decision 049 says only football facts may be
corrected, because annulling anything else does not fix a mistake, it changes what every minute in the
log means. Collapsing the two lists into one near-identical array would grant a « Corriger » button to
whatever is merely enterable, several files away from the list that caused it, with no screen and no
test naming the permission that moved. `SUBSTITUTION`'s amendability is granted **explicitly, by name,
in that predicate**, which is exactly how a permission should look. Both constants carry the question
they answer in their doc comment, and those comments are load-bearing rather than decorative: they are
the only thing standing between a later session's tidy-up and a silent permission change.

**Why the add button is a child and not a `Card` prop.** Typing up a match is a loop, so the control
that starts the next iteration has to be where the last one left the thumb. The two « + Ajouter »
buttons were passed as `Card`'s `action` prop, which `components/ui/card.tsx` renders inside the
`<header>` before `{children}` — so the button walked backwards up the screen as the list grew. The
single « + Ajouter une action » is therefore passed as a **child after the `<ul>`**, and `Card` itself
was deliberately left alone. One call site in the app needs a footer and no other does; a `footer` prop
would reshape a component used on every screen to serve one. A sticky button was rejected for a reason
worth writing down so it is not rediscovered: at the bottom of this screen it would cover
« Enregistrer ».

**Why the list is never sorted by minute.** It renders in the order the coach added rows, and nothing
re-orders it. Sorting would make a row jump out from under the thumb the moment its minute is typed —
the one gesture a coach performs most on this screen — and an undated row, which decision 048 makes the
**common** case rather than the exception, would have no defined place in such an order at all. The log
is sorted; the sheet is not. `buildRetroLog` is where order becomes chronology, and it keeps its own
two-bucket rule (facts before substitutions within one stamp) precisely so the coach's typing order
cannot change what the reducer reads.

**`POSITION_CHANGE`: the owner has decided not to build it.** Earlier drafts of this work treated the
missing union arm as the one thing left to do, and the type sat in `RETRO_ACTION_TYPES` on that
assumption with `readActionFields` holding an explicit `case "POSITION_CHANGE": return null`. It is
removed from both: a constant that says a type is enterable while nothing in the repository can produce
a row of it is a claim the code does not keep. The honest reasons it is not worth building, in order of
how quickly each would bite:

- the slot select it would need has **non-unique labels**. `labelFr` on a 1-3-2-1's slots gives two
  « Milieu », so the control would ask the coach to choose between two options reading the same word;
- `retroPitch`'s slot bookkeeping would **go stale**. It tracks which slot each player is standing in so
  a substitution's payload can name the slot the outgoing player vacated; a position change would have to
  rewrite that map mid-replay, and every rule built on it would have to be re-checked;
- an **unstamped** position change is a label floating in the middle of a spell. Decision 048's midpoint
  guess works because a goal at the middle of its scorer's stint cannot contradict the log; « he moved to
  the right wing, roughly half-way through his time on the pitch » contradicts nothing and states
  nothing either;
- it is the action **least likely to be reconstructed** from memory a week later. A coach remembers
  « Momo came on for Ali at half-time ». Nobody remembers which shirt drifted from centre to right
  without a substitution.

So, stated plainly for the reader who arrives at an apparent oversight: **game mode keeps one action the
retro sheet does not, deliberately.** And `FOUL` goes the other way — offered on the sheet, not offered
in game mode's menu (decision 114). « The same actions as live mode » is therefore symmetric in neither
direction and never will be, and the asymmetry is not a bug to fix by adding an array member at either
end. The select on the sheet is now built from `RETRO_ACTION_TYPES` itself rather than from a local
subset, so there is no longer a second list to keep in step by hand.

**What is still open, named rather than implied.** Two things.

- **A half-filled substitution is reported well in the browser and badly without JavaScript.**
  `findRetroIssues` names « Sort… » chosen with « Entre… » empty by its own code
  (`missing-substitute-out` / `missing-substitute-in`), and `readActionFields` deliberately keeps such a
  row rather than swallowing it, so the row does not vanish on submit (audit `D22`). But
  `retroChangeSchema` requires two uuids on the substitution arm, so a POST that reaches the server with
  a half-filled row — a no-JS submit, or a crafted one — is answered « Ce joueur n'est pas valide. » by
  the schema before the issue finder is ever asked. The two new messages are therefore reachable from
  the browser and not from the server. The fix is for the server to run `findRetroIssues` on a sheet
  parsed with a laxer substitution arm, which is a change to `submitRetroMatch`'s order of operations
  and not to this slice.
- **`D18` reproduces and is untouched here.** It is listed under slice 4 of the UX audit and this work
  neither fixed nor worsened it.

## 135 — The composition dock holds the players and the buttons, and says nothing

**2026-10-01** · accepted · the owner's instruction · narrows decision 097's remit, supersedes nothing

**Decision.** The sticky dock in `components/composition/composition-editor.tsx` draws the bench strip,
the blocking errors that cannot be read off the turf, and the two buttons. The three sentences it used to
print are gone from the screen:

- « 12 au banc, 7 postes libres. Appuie sur un joueur puis sur un poste. » — `benchHintFr`;
- « Rien n'est encore enregistré. » / « Modifications non enregistrées. » / « À jour. » — `editorSaveStateFr`;
- « Il reste 3 postes à pourvoir. » — the `incomplete` issue from `findPlanIssues`.

**Why.** The owner asked, in these words: *« The banner on the bottom is too big … Basically, I only want
the players, the buttons. »* And the reason it was too big is structural rather than a matter of taste:
this is the one screen in the app that is **pinned at both ends**. The turf is above, the fixed tab bar is
below, and everything the dock prints is bought from the height of the pitch the coach is aiming a thumb
at. On a 390 px screen three lines of `text-xs` plus their gaps is about 60 px, which is two rows of discs.

**Each of the three had a reason, and in each case the screen above it had already made the point.**

- the bench count was there because the strip scrolls sideways and about five discs fit, so « 9 au banc »
  was what stopped the four off the right edge being forgotten (`lib/composition/hints.ts`'s own
  docblock). True — but the strip is *visibly* cut off at the edge, which is the affordance; the sentence
  was the caption. The tap path it also spelled out is still on the list's `aria-label`;
- the save state was there because a pre-filled pitch must not claim to be saved (decision 106). Still
  true, and still said: the submit button reads « Créer la composition » for something new and
  « Enregistrer » for something that exists. A form whose button offers to create is not claiming to have
  saved;
- « Il reste 3 postes à pourvoir. » counts the empty postes **drawn empty, directly above it**. It still
  blocks the save, and it is still printed on the compositions list, where there is no turf to read it
  off.

**What stays visible, and why that is not inconsistent.** « Personne n'est dans les buts. » stays, because
it names *which* empty poste is the fatal one and the turf does not rank its own holes. The drop hint
stays, but only while a player from the pitch is actually held over the dock: `Pitch` is `overflow-hidden`,
so the lifted disc is clipped at the bottom of the turf and the gesture reads as having lost him, and that
is the one state of this screen that genuinely cannot explain itself (decision 112's neighbour).

**Nothing was deleted, only stopped being drawn.** All three strings are still produced by the same pure
functions, still unit-tested branch by branch, and all three are now `sr-only` with `aria-live` — the
bench count as the strip's `aria-describedby`, so a reader moving through the discs is not told the total
between two of them. This is where decision 097 is narrowed rather than contradicted: 097 says a French
sentence that is true of only some states of the screen belongs in a pure function a test can walk. It
says nothing about the sentence having to be *drawn*, and the version of this screen that printed all of
them was the one that proved a true sentence can still be the wrong 20 px.
## 136 — The owner's iPhone gets a trace sink, and it ships nothing

**2026-10-01** · accepted · **amends decision 127** · follows the precedent PR #111 set, recorded in
decision 123 · supersedes nothing

*(Numbering: 136 was taken rather than left as `## NNN`, which coordination rule 2 would otherwise
require, because the session holding `docs/DECISIONS.md` said so directly — nothing else was in flight
on this file and a session holding it should name its own number. Derived, not assumed:
`grep -c '^## ' docs/DECISIONS.md` on `1bcd754` gives 135, whose last entry is 135. The `## NOW` line
claiming 123 was stale by thirteen.)*

Three of the four device-only questions this repository is carrying cannot be answered from a Linux
session, and all three are the same shape: the evidence is on a phone that is not the machine running
the session, and iOS Safari has no console a session can read. The two tab-bar suspicions are told
apart by what `document.elementFromPoint` returns at the centre of each tab — that is the roadmap's own
prescription, not a new idea here. The positions crash was a `23503` reaching an error boundary with
nothing written down anywhere a session could read. And the audit walks 390 × 844 while the owner's
phone is 393 × 852 at DPR 3, which is a claim about the device nobody has ever measured on the device.
So: the owner taps a capture into the page, it POSTs a batch, and a session watches it come out of
`vercel logs`.

*(Amended the same day, before any of it had run on the device: the route was closed behind a shared
secret in `TRACE_SECRET`, and the paragraphs below describe that tightened design rather than the
unauthenticated one this entry was first written against. Recorded rather than smoothed over, because
for one afternoon the record and the code disagreed and a reader deserves to know why.)*

**Nothing is stored, and that is the load-bearing choice rather than a shortcut.** A `traces` table
would need a new `Action` member in `lib/auth/can.ts` to satisfy invariant 4, and its migration would
reach preview on merge and production on the next tag by decision 119 — so a *preview-only* table is
not expressible at all, and the thing a diagnostic most needs to be is deletable. Decisions 115 and 122
are the standing bias against a new table and this follows them. The route therefore `console.log`s one
`[iphone-trace] <single-line JSON>` per entry and the reader is `vercel logs … | grep '[iphone-trace]'`.
The cost, stated rather than buried: **there is no durability.** A trace lives as long as the log stream
and no longer, so a finding worth keeping has to be copied into `docs/` by hand, by the session that read
it. Deleting `app/api/dev/trace/`, the two files in `lib/dev/`, `scripts/iphone-trace/` and one line of
`proxy.ts` deletes the feature, and that is the property being bought.

**The capture is a bookmarklet, not production code, and that is what keeps decision 127 true.**
`scripts/iphone-trace/capture.js` is built by `build-bookmarklet.mjs` into a `javascript:` URL in the
gitignored `audit/`, and — since the amendment — its text is also committed as `lib/dev/capture-source.ts`
so that `GET /api/dev/trace` can serve it to the phone instead of the owner pasting 15 KB into a bookmark
field. That constant sits in **this one route's server bundle and in no client bundle**: no component
imports it, it changes no rendered screen, and nothing of it runs unless the owner fetches it with the
secret in hand and the browser injects it into a tab he opened himself. This is the amendment: decision 127 reasoned that the **absence** of a
Next error digest means the throw happened in the browser, and a shipped client-side error sink would
have made that sentence false the day it merged — every browser throw would have left a server-side
trace and the digest's absence would have stopped meaning anything. It still means what 127 says it
means, because nothing of the sink is ever in a *client* bundle. For the same reason decision 059's `audit:screens`
console gate still sees nothing new on any of the 23 walked screens: the capture wraps the five
`console` methods and always calls through to the original, but it is not there during an audit run.
**PR #111** set this precedent — instrumentation that deliberately changed no production code — and
decision 123 is where that is written down; this is the second use of it. Stated that way round on
purpose: 123 itself does ship production code, so « decision 123 set the precedent » was loose, and the
fact being leaned on is PR #111's.

**The gate reads `VERCEL_ENV`, which Vercel populates by itself.** `isTraceSinkEnabled`
(`lib/dev/trace.ts`) is `false` for `production`, `true` for `preview` and `development`, and falls
back to `NODE_ENV` off Vercel. `VERCEL_ENV` appeared nowhere in the repository before this, and it
needs no dashboard change of its own: Vercel populates it on every deployment. **The secret, however,
is a new environment variable, and setting it is the owner's act and not a session's.** `TRACE_SECRET`
is Preview-only — it is now set there, and deliberately not on Production — so coordination rule 3,
infrastructure is the owner's, is *observed* here rather than avoided: a session wrote the code that
reads the variable and named it in the handover, the owner went to the Vercel dashboard and set it, and
until he had, the endpoint was dead. `isTraceSinkEnabled` is a pure function taking the environment as
an argument and never reading `process.env`, and the route reads the environment **inside** the handler, so the production case is a
unit test rather than a claim and a build does not depend on the environment being populated (decision
075). Disabled answers **404 and not 403**: on production the endpoint must be indistinguishable from
one that was never deployed, and a 403 would confirm it is there.

**The route is listed in `proxy.ts`'s `PUBLIC_PATHS`, and public here means authenticated by a shared
secret rather than by a session.** It is in `PUBLIC_PATHS` because the middleware 307s any
extension-less path carrying no session cookie, which would otherwise swallow exactly the captures
worth having most — the ones from `/connexion` and `/rejoindre`, and the one taken after an error
killed the session. What stands in for the session cookie is `TRACE_SECRET`, compared with
`crypto.timingSafeEqual` behind a byte-length guard, **both sides trimmed before they are compared** so
that a value pasted into the dashboard with a trailing newline is not a symptom the owner has no way to
diagnose. Off, unconfigured and wrong-key all answer **one identical 404 with no distinguishing body**,
so the route is indistinguishable from one that was never deployed; and an unset, empty or
whitespace-only secret means **dead, not open** — it fails closed, because a forgotten variable turning
a diagnostic endpoint into an anonymous write channel is the failure nobody notices until it is being
used. It calls no `can()` because it performs no mutation: it writes no row, reads no row and never
touches a database client, so there is nothing for `can()` to authorise, and invariant 4 is about
mutations. **The residual risk, named rather than argued away: the install path puts the key in a query
string.** A bookmarklet cannot set a header on the `<script>` tag it injects, so the loader fetches the
probe as `GET /api/dev/trace?k=…`; query strings are the part of a URL that reaches access logs, so that
key should be treated as logged, rotated once the diagnosis is done, and reused for nothing else. One
consequence to expect rather than be alarmed by: the access log it lands in is **the same stream the
owner is tailing to read his traces**, so he will watch his own key scroll past in `vercel logs` output
— that is where it was always going to appear, not a leak. The POSTs that follow carry the secret in the
`x-trace-secret` header instead.

**The overlay sits above the tab bar, not across it, and excludes itself from its own results.** The
panel is French, tutoies, and carries « Test » and « Envoyer » because there is no console under a thumb
and no devtools to open. It is positioned clear of the bar and of the home indicator, it is transparent
to taps except on its two buttons, and the hit test skips it — a probe that covers what it measures
reports its own presence as the defect, which is the `/equipe` theme-drift mistake in another costume.
If `(overlay du traceur — à ignorer)` ever appears in a reading, that line is the tool's fault and not
the app's.

**Two things are not verified, and nothing downstream may assume them.** First, the install is a
loader — **423 characters, measured with a 32-character secret** — that sets `window.__fmTraceKey` and
appends a `<script>` pointing at `GET /api/dev/trace?k=…`, and the all-inline form is kept only as a
fallback, at **15 090 characters with that same 32-character secret**. Both figures move with the length
of the secret, so `build-bookmarklet.mjs` prints the exact ones on every build and neither should be
quoted from here. Whether iOS Safari accepts a bookmark address as long as the **fallback**'s **has not
been observed** — Safari refuses a `javascript:` URL typed into the address bar at all, so a bookmark is
the only install path, and a silently truncated paste is the one failure that looks like success.
Killing that risk is precisely what the loader was built for, which is why the README leads with it and
says to scroll to the end of the field and check. If the fallback turns out not to fit, the repair is
the loader — and failing that a shorter capture, not a cleverer minifier: the one in
`build-bookmarklet.mjs` strips comments and indentation and nothing else, on purpose, because a clever minifier is a bug in a tool whose whole job is to be
believed. Second, **the two tab-bar suspicions remain open.** This entry builds the instrument the
roadmap asked for and settles neither suspicion; the roadmap's own rule — nothing is written up as fixed
until it has been seen on the device — applies to the instrument too, which has itself never been run on
the device.

---

## 137 — A note is the mean of what the others gave you, and the notes themselves are the coach's

**2026-10-02** · accepted · **supersedes decision 021 and decision 024 entirely**, decision 007 on
three of its four clauses, decision 102 entirely, and the thresholds and count in decision 025 ·
amends decision 023's last paragraph and decision 079's second half · leaves decision 039 standing and
strengthens it

One sentence, and it is the owner's: **a player's note for a match is the mean of the notes the others
gave him, it appears once the notes are in, and the individual notes are the coach's alone.**

Everything below follows from that, and most of it is a deletion.

**What decision 007 keeps.** The 0–10 scale, now with half-points. That is all. Its other three
clauses go: a player no longer rates himself, only a player with `minutes > 0` may rate or be rated,
and the author of a note is visible to the coach and to nobody else. The reasoning that made them right
in September was that a rating is a conversation the squad has out loud; the owner has decided it is a
measurement the squad reads and the coach interprets, which is a different thing and wants a different
screen.

**Why decision 021 goes entirely, and why nothing of value is lost.** 021 enforced 007's reciprocity
gate season-wide: a viewer who could have rated a match and did not saw nothing from it in any average,
anywhere. It existed for one property — you must not read other people's notes before writing yours —
and the new rule has that property *more* strongly and for free: **nobody** reads any note until the
whole match is in, and no player ever reads an individual note at all. What 021 cost was a statistics
tree in which every figure depended on who was looking. `ratingVisibility`, `visibleMatchIds`,
`hiddenMatchIds`, `hiddenRatedCounts`, `getVisibleRatingScores`'s second round trip and the
« d'après les matchs que tu as notés » on three screens are all gone, and `/stats`, a player's profile
and « l'équipe type » now print one set of numbers that is the same for every reader. That is the
largest simplification in the repository since the stats cache, and it was bought by a product
decision rather than by a refactor.

**Why decision 024 goes with it.** 024 was the gate's two edges — « no set to fill means no gate »
and « never filling it means never seeing » — and a gate that no longer exists has no edges. The second
edge is the one worth naming as it leaves: `lib/rating/progress.ts` used to document, deliberately,
that *a player who never rates never sees that match's ratings, for ever*, and that the window closing
does not release them. That was defensible as an anti-free-riding rule and it was also a door shutting
on somebody for a week of silence. It is reversed: the means come out when the last expected rater
submits, **or** when the coach publishes, **or** when the window closes at the next kick-off. A man who
never rated reads the same figure as everybody else, and the thing he loses by not rating is his say.

**Why decision 102 goes.** 102 made choosing a note and advancing two gestures, because the pad
replaced the card in the same frame as the tap and no state existed in which the reader's answer was
visible. It was right about the pad. There is no pad: the screen is one list of native
`<input type="range">`, one per teammate, and one submit. There is nothing to advance to, so
« Suivant » and « Passer sans noter » are gone and `lib/rating/flow.ts` — which existed to decide what
that button said, and which decision 097 put in `lib/` so its sentences could be tested — is **deleted**
rather than kept for a screen with no forward button. What 102 was protecting is kept by a different
mechanism: the figure beside each name is the slider's own value, printed at 1.125 rem next to the man
it is about, and it cannot be out of date because it is the only piece of React state on the screen.

**What a slider costs, stated rather than discovered.** A range input has no unset state. Every slider
starts at 5,0 and every slider is submitted, so an untouched one records 5,0 as an opinion and not as a
silence. The owner was told this when the choice was made and accepted it; the mitigation is that the
screen says so, above the list, in `RATING_SLIDERS_START_AT_FR`: « Tous les curseurs partent de 5,0. Si
tu n'y touches pas, c'est la note que tu donnes. » There is deliberately **no** « passer sans noter »
button — it would claim to do something the control cannot do. And `components/ui/slider.tsx` keeps the
browser's native appearance, setting exactly one property (`accent-color`, via `accent-accent`): the
usual Tailwind recipe of `appearance-none` plus two vendor pseudo-elements takes the theme colour with
it and leaves a grey rail in dark mode, because `accent-color` only paints a control the browser is
still drawing. Keeping the native thumb is also what gives the arrow keys their half-point step for
free, which the happy path now asserts.

**The three clauses that publish a match, and the floor that still refuses.** `lib/rating/published.ts`
owns the question, and it has no viewer in it: *is this match's mean out?* The expected raters are the
players with `minutes > 0` — derived from the log, no column — and each owes a note to each of the
others. A new nullable `matches.ratings_published_at` is the coach's escape hatch, written by
`publishRatings` behind the new `rating:publish`; it exists because the automatic backstop has a hole
the size of a season's last match, which has no next kick-off to close its window, so the team that
most wants its notes would be the team whose notes wait for ever. Idempotent, so two taps on a slow
connection do not move the moment the notes came out. And `MIN_NOTES_FOR_MEAN = 3` guards the figure
itself: a match published with one note is not a verdict, so below three notes on a player he has no
mean. That number is **decision 025's two, raised to three**, and 025's « the list shows each player's
rating count alongside their average » is now coach-only — on a player's own row a count is an
invitation to work out who did not rate him, and in a squad of a dozen that arithmetic is easy and
poisonous. The man-of-the-match card therefore reads « 9,0 de moyenne » and no longer « sur 7 notes »,
even when the reader is the coach, because that card is read by everybody.

**Security by not selecting, not by not rendering.** `getRatingResults` returns `published: false`
*above* the select that would fetch any score, so an unpublished match's figures never leave Postgres
for anybody — the coach included. A reader who is not the coach receives `count: null` and
`received: []` for every player. So the `canSeeNotes` branches in `ratings-panel.tsx` are about layout,
and there is nothing in the RSC payload for a crafted request or an open DevTools to find. Two new
`can()` actions carry it, both coach-only: `rating:readNotes` (the notes, their authors, and the count a
mean rests on) and `rating:publish`. `rating:readNotes` is a *read* in `can()` rather than an `isCoachOf`
at the page because a second way of asking the same question is how two answers drift apart.

**The migration is `0007_chubby_silver_samurai.sql`, and three of its five statements are
irreversible.** `score` becomes `numeric(3,1)` with a `ratings_score_half_step` check — widening loses
nothing and `7` survives as `7.0`, while the way back would round a half-point silently. `comment` is
**dropped**: the free-text field is gone from the screen and a column nobody writes reads as a feature
that exists. Every **self-rating is deleted**, because `ratings_no_self` cannot be added over rows that
007 required, and because a mean « of the notes the others gave him » has no place for his own. Nothing
of anybody's is lost on production, which holds no ratings at all; a local or preview database loses the
seed's fixtures, and `db/seed.ts` stopped writing both in the same commit. `ratings_no_self` is only the
half of the rule the table can see — « only a man with minutes is rated » is a fact about `match_events`
and lives in `lib/rating/` and in the Server Action, which is where a crafted form post is caught.

**What is amended rather than superseded.** Decision 023's « a rating is final » stands and is said out
loud on the screen (`RATING_IS_FINAL_FR`); what goes is its last paragraph, where a complete set was
what unlocked the results. A partial set is still legal in the action and the screen still shows an
already-sent note as a locked figure, but 021's « M6 must submit a player's whole set atomically » is
now structural rather than a rule to remember: the screen is one form with one submit. Decision 079's
deadline sentence stands — the app still states when the window shuts — but its second half, the
paragraph about a door closing for ever on a player who ran out of time, describes a rule that no longer
exists. Decision 095 keeps `noteAuthorFr` and « toi » winning over « lui-même », minus the self-note it
was half written about. Decision 039 — a supporter is on the sheet, rates nobody, and may read the
results — is untouched and is now the ordinary case rather than the exception: *everybody* reads the
results.

**One unit is renamed because it changed meaning.** `PlayerRating.count` keeps its name and counts
**matches with a published mean** instead of notes; `lib/stats/aggregate.ts`'s `MIN_RATINGS` is now
`MIN_RATED_MATCHES` for the same reason, and the screens say « sur 6 matchs notés » where they said
« sur 6 notes ». The two constants are the same number — three — for two different denominators, and
neither imports the other. The shrinkage PR #105 landed is *better* on this unit: the within-player
variance is now match-to-match variation rather than rater-to-rater disagreement, which is what a
season average is supposed to be about.

**The browser suite was rewritten rather than repaired.** Every selector the happy path used for the
ratings — `score:<membershipId>-<note>`, « Suivant », the `form > ul > li:not([hidden])` pagination,
« N / N notés », « Terminer et voir le résumé » — addressed something that no longer exists. It now
walks all three states of a published match: four of the eight men who played rate (the smallest number
that leaves every rater on exactly the `MIN_NOTES_FOR_MEAN` floor), the means stay in while four still
owe, the coach is shown their four names and publishes without them, and the same screen is then read
by the coach and by a player in one pass — « 28 notes sur 8 joueurs à noter », a count and the author
chips for him, « 9,0 » and nothing else for the player. Half of that assertion is an absence, which is
the only shape in which a leak of the kind 021 allowed can fail a test.

**What was *not* done, and is not hiding.** Rating history and editing a note: `onConflictDoNothing`
stays. Showing a player who gave him what: explicitly the coach's alone. And the number this entry
does not settle — whether 5,0 as a default produces a squad of average players — is a question for the
owner after a real Sunday, not for a session.

---

## 138 — Rating stays open until the means come out, and the coach's button is the only deadline

**2026-10-02** · accepted · **supersedes decision 137's third publication clause and decision 079's
deadline sentence** · amends decision 007's reciprocity window, what little of it decision 137 left ·
leaves decision 021's anti-anchoring property standing, which is the whole reason this has a limit at all

The owner's request, in one line: **when a match has already been played, we must be able to fill in our
notes if we have not done it yet.** It was answered by a single choice — the window shuts when the means
are out, and not before.

**The rule.** A played match is rateable for as long as its means are pending, however old it is. It
stops being rateable the moment they are published, which happens two ways and only two: the last
expected rater finishes, or the coach taps « Sortir les moyennes maintenant ». So `ratingWindow` has two
inputs, `finished` and `published`, and no clock.

**What was there before, and why it was the wrong lock.** Decision 007 shut the window at the **next
kick-off**, and 137 kept that as its third publication clause. It punished the wrong thing. A man who
missed a week because he was away came back to a match he could no longer rate, not because anybody had
read a mean — none was out — but because a fixture he had nothing to do with had started. And it was no
backstop either, which is the part 137 had already written down: a season's last match has no next
kick-off, so the one match a team most wants its notes for was the one whose window never closed on its
own. A clause that fires when it should not and fails to fire when it should is not a deadline; it is a
calendar coincidence.

**Why the window has a limit at all.** Decision 021 existed for one property — nobody writes his notes
after reading the team's — and it is the only thing standing between « rate whenever you like » and a
figure that can be moved by a man who has already seen it. Publication is exactly the moment that
property starts to bite, so publication is exactly where the window ends. Before it, a late note changes
nothing anybody has read; after it, it would move a number the squad has already discussed. **The
guarantee kept: nobody ever reads a mean before writing his own notes.** That is the same guarantee as
before, now held by the one event that can actually break it.

**It breaks a circle, and that is why it is a deletion rather than a condition.** `ratingsPublication`
used to take the window state; the new rule needs the window to take publication. Both cannot be true,
so clause 3 is gone and publication has two clauses — « every set in » and « the coach published ». The
dependency runs one way, publication → window, and `lib/rating/queries.ts` answers « are the means out? »
in one place (`publicationOf`) so the recap and the notation screen cannot disagree about it.

**The calendar leaves the rating tree entirely.** `getNextKickoffAfter`, `getLatestStartedKickoffMs` and
`getSeasonStats`'s `nowMs` are all deleted, so *whether a season's means are out is now a question about
rows only* — two fewer round trips, and one fewer answer that changes between two renders of the same
page. `ratingDeadlineFr`, `closesAtMs` and `nextKickoffAtMs` go with them: there is no date left to
print. What replaces them is one unconditional sentence, `ratingUrgencyFr`, true for every played match:
« Tu peux encore noter : les moyennes ne sont pas sorties. Elles sortiront dès que tout le monde aura
noté, ou quand le coach décidera de les sortir — et tes notes ne compteront plus. » The old sentence
named the next kick-off, and for a season's last match it named nothing and printed nothing at all.

**The weight this puts on one button.** « Sortir les moyennes maintenant » used to be a shortcut past a
deadline the calendar would have reached anyway; it **is** the deadline now, and the only one. So the
form says both halves — « elles ne bougeront plus, **et plus personne ne pourra noter ce match** » —
because a coach who is not told that is being asked to end something without knowing it. That wording
was found by the 390 px pass, not by a test, and it is the third defect in this slice that only a
screenshot could have caught.

**What stays true.** A note is still final (`onConflictDoNothing`, decision 023): the window reopening
is not a thing, because a published mean is never unpublished, and `ratings_published_at` is now read as
« when the notes came out **and** when the rating ended ». Rating still opens at the final whistle, not
before — a match nobody played publishes vacuously, and the screen must still say « la notation ouvrira
au coup de sifflet final » rather than « c'est fermé ». And the demo season now carries the case the old
seed could not: J3 and J5 are published and closed, while **J2, J6 and J7 are rateable whatever their
age** — J2 is five weeks old and is the match to open `/notation` on to see this decision working.

## 139 — The coach decides when a match's means are out, everybody rates, and nothing ever closes

**2026-10-02** · accepted · **supersedes decision 138 entirely**, and decision 021 entirely ·
**supersedes decision 137** on who may rate and on what publishes a match · supersedes the halves of
decisions 007 / 020 / 022 that said a supporter may not rate · keeps 137's `minutes > 0` rule for who may
be **rated**, and its « the raw notes are the coach's alone »

The owner read the rules decisions 137 and 138 had built and said they were wrong, in one paragraph:
**everyone can note, even the supporters; the notes are available only when the coach says so, per match;
if he does not say so, nobody sees any mean except his own; if he does, everybody sees everybody's mean
for that match.** Four follow-up answers settled the rest: any member may rate (not only those on the
sheet), only those who played get a mean, the switch **goes both ways**, and a man who never rated may
still rate after the means are out.

**The rule, in four lines.**

1. **Who may rate: any member of the team.** A supporter on the touchline watched the same hour. A named
   substitute who never came on watched it too. A member who was not on the sheet at all may rate. So may
   the non-playing coach — which is why `rating:submit` is the one self-scoped action in `can()` that does
   not require `isPlayer`.
2. **Who may be rated: only those who played**, `minutes > 0` in the reduced log. That is decision 137's
   rule and it survives untouched. Nobody rates himself.
3. **Visibility is one column and one hand.** `matches.ratings_published_at` null means hidden, a
   timestamp means visible, and **the coach's tap is the only thing that writes either**. Nothing derives
   it, nothing schedules it, the calendar does not touch it.
4. **Nothing closes.** A played match is rateable for ever. The means being out does not stop a note, and
   a note arriving afterwards moves a figure the squad has read.

**What this gives up, said plainly, because it was said before it was chosen.** Decisions 021, 137 and
138 all existed for one property: *nobody writes his notes after reading the team's.* **That guarantee is
gone, in full.** A player can now read a published mean and then rate the man it belongs to. The owner was
told this in those words and chose it anyway, and the trade is legible: he wants the figures under his own
control, per match, more than he wants anchoring-proof arithmetic in a team of twelve who see each other
every Sunday. Two smaller costs come with it. **A mean the squad has read can vanish**, because hiding is
reversible and there is no record of what was visible when — a player who screenshotted his 4,2 keeps it.
And a mean is never final, so « 7,5 » on a recap is « 7,5 so far ».

**The rating window stops existing as a concept**, which is the largest deletion in this slice.
`lib/rating/window.ts` and its tests are gone, `ratingWindow` / `NotationBlockedReason` /
`getRatingWindow` / `publicationOf` / `ratingsPublication` / `owingRaterIds` with them, and
`lib/rating/published.ts` is one predicate over one nullable column: `meansAreVisible(publishedAtMs)`.
Publication had a derived clause under 137 — « every expected set is in » — and deleting it removes the
rater→rated graph from the publication question entirely: `lib/stats/queries.ts` drops
`getRatingAuthors`, `lib/stats/ratings.ts` drops its nested maps, `getNotationView` loses a round trip,
and the season's score query can start before the logs are replayed.

**The two refusals the server no longer makes.** `submitRatings` had four rules and has three: « la
notation est fermée : les moyennes sont sorties » went with the window, and « seuls les joueurs qui ont
joué peuvent noter » went with rule 1. What stayed is the one that matters against a crafted post — the
set of legal targets is re-derived from the log, so self-notes and notes on a 0-minute substitute are
still dropped rather than trusted, and `ratings_no_self` says the same thing in Postgres.

**`rating:publish` is one permission, both ways.** `publishRatings` writes the instant, `hideRatings`
writes null back, and they share their checks in one helper. Splitting them into two actions would let a
coach who may show end up unable to undo it, which on a per-match switch somebody will need within a
week. Publishing stays idempotent — two taps on a slow connection must not move the moment the notes came
out — while hiding and showing again *does* move it, which is right: that is a new decision, not a repeat
of the old one.

**The coach's « who has spoken » changes denominator, not shape.** `owing` / `raterTotal` counted the
players with minutes, because they were who publication waited for. Nothing waits for anybody, and any
member may rate, so `RaterTally` counts the **active members** — « 4 membres sur 9 », the coach included —
and `silent` replaces `owing`, because the form posts a whole set at once and « has not finished »
collapses to « has sent nothing ». Members who have left are on neither side of the fraction: a
denominator that can never be reached is a figure that lies.

**What the screens had to stop saying**, all of it true last week and false now: « seuls les joueurs qui
ont joué donnent des notes » (an EmptyState, deleted), « La notation est fermée » (deleted), « les
moyennes sortiront quand tout le monde aura noté » (three places), « elles ne bougeront plus, et plus
personne ne pourra noter ce match » (the publish form's whole justification under 138), and « ceux qui
étaient sur le terrain avec toi » (the reader may not have been on it). What replaces the deadline is
`ratingInvitationFr(meansVisible)`, which states who decides and, when the figures are already out, that
his notes will still move one the squad has read — decision 079's rule applied to a limit that has
stopped existing. A reader who did not play is also told **why he is asked anyway**, in his own case:
supporter, named-but-never-on, and not-on-the-sheet are three sentences, because the three EmptyStates
this replaces told them apart and losing that would read as a bug.

**One guard that looks cosmetic and is not.** The match page's rating card dropped `notation.played` and
gained `progress.requiredCount > 0`. An empty set is *vacuously* complete, so without it a match nobody
played would congratulate every reader on having noted everybody; `played` used to rule that out as a
side effect.

**No migration.** `ratings_published_at` was already a nullable `timestamptz`, so hiding is `set null`.

## 140 — The pointage holds its marks in client state, and a refused save says so

**2026-10-05** · accepted · the fix for `D1`, `D4`(a) and `A3` of `docs/UX_AUDIT_2026-10-01.md` ·
does **not** close `D4`(b) / `A4`, which stay open

`AttendanceList` was a Server Component with **two separate forms** and **uncontrolled radios**, and that
pair deleted rows a coach had just entered. The four taps, which are the ones he makes every Tuesday:

1. « Tout le monde est là » submits its own little form; the action writes thirteen rows and revalidates;
2. the card re-renders and says « 13 présents sur 13 pointés » — while the thirteen radios under it still
   read « — », because React re-renders onto the same keys and **does not reset an uncontrolled input**,
   and the only form it does reset on submit is *the one that was submitted*, which was the other one;
3. the coach flips the two who are missing and taps « Enregistrer les présences »;
4. that form posts `presence:<id>=unset` for the eleven he never touched, and `markTrainingAttendance`
   deletes their eleven rows — because « the coach cleared this » and « the DOM is stale » are the same
   bytes on the wire.

**The decision: the marks are client state, one form, and the card is counted from the same value the
radios show.** `app/(app)/entrainements/_components/attendance-list.tsx` is `"use client"`; the shortcut is
a second submit button inside the one form, not a form of its own; every radio is controlled. The
arithmetic moved to pure helpers in `lib/training/attendance.ts` — `markOf`, `withMark`, `allPresent`,
`marksSignature`, `attendanceTally`, `unsavedCount`, `unsavedMarksNoteFr` — because Vitest collects
`lib/**` and nothing under `app/` (decision 097), so the four steps are a unit test as well as an e2e one.
Two properties follow, and they are the whole point: **the card and the radios can no longer describe two
different evenings**, and **no submit can carry a mark the coach cannot see**.

**What was rejected.** Keeping it a Server Component and giving the radios `key`s that change with the
server's marks would reset them — and would also throw away a mark in flight every time something else
revalidated the page. Making the shortcut write nothing and only set the DOM would leave the common case
unsaved on a dropped connection. Making the delete conditional (« only delete what was explicitly set to
`unset` ») was the tempting one and is wrong: it fixes the symptom by making the wire protocol lossy, and
a coach who really does want to un-point a player would then have no way to say it.

**It still works with no JavaScript**, which this screen of all screens needs: it is filled in standing on
a touchline. Progressive enhancement serialises a **server reference** into the `action` attribute, so the
bound function must be a `"use server"` export — and React's DOM types require `action`/`formAction` to
return `void | Promise<void>`, which an action returning `FormState` cannot. Hence a second exported pair,
`markTrainingAttendanceNoScript` / `markEveryonePresentNoScript`, each one line over the real action. The
alternatives both lose the no-JS path: an arrow function defined in the client component is not a server
reference, and a cast hides exactly that. The types are right and the swallowed `FormState` in that path
costs nothing — there is nobody to hand it to, and the server re-renders the page anyway.

**A save that does not land keeps the screen** (`D4`(a)). The direct call is wrapped in `useTransition` +
`try/catch` rather than `useActionState`, because a thrown action error propagates to the error boundary —
which is what used to replace the whole page, thirteen marks included, and offer a « Réessayer » that
re-renders a segment rather than resubmitting anything. Now it is a `role="alert"` above the list with
every mark still under it: « Les présences n'ont pas été enregistrées. Tes réponses sont toujours là :
réessaie. » And the two actions return `FormState` instead of returning in silence, so the three refusals
nobody could see — unparseable form, unknown training, pointage not open for another half hour — are
French sentences now. Both buttons take `Button`'s `pending` (`A3`).

**« Not yet saved » is said out loud**, next to the button that would settle it: « 2 présences modifiées,
pas encore enregistrées. » The card's figures are deliberately ahead of the table between a flip and a
save — that is what makes the screen responsive — and this line is what keeps that honest. It is counted
over the union of the saved and current key sets, so un-pointing somebody counts too.

**What is still broken, and was not attempted here.** The pointage is **still discarded when the save
happens offline** (`D4`(b) / `A4`). `lib/match/outbox.ts` is event-specific — `PendingEvent`,
`client_event_id`, `POST /api/match-events`, backoff, permanent-vs-retryable — and reusing it would need a
second IndexedDB store and a new POST API. A localStorage draft surviving a reload was designed as the
cheap substitute and **was not shipped either**. So this decision stopped the losses that happen *online*,
which were the ones destroying rows; the ROADMAP item stays open.

## 141 — `db:migrate` owes a fresh database a usable one, and two of the owner's limits come off

**2026-10-06** · accepted; **the wish-picker third of it superseded the same day by decision 142**, which
replaces the six derived codes with seven the owner named · supersedes the open item of decision 129 that
left `formations` unseeded, and supersedes decision **130** on the size of the wish picker · the migration
half is the production fix and still stands entirely

Three changes the owner asked for in one sitting. They share a thread — each one is a number or a rule the
app had decided for him, and he has taken all three back — but the middle one is the only emergency, and it
is a statement about what migrating owes a database rather than a preference.

### The seven built-in formations are seeded by a migration

**The bug.** On production, `/match/<id>/composition` said « Aucune formation disponible · Les formations
types n'ont pas été chargées dans la base. » (`editor-screen.tsx:136-144`), and `/match/<id>/saisie` the
same at `:125`. **No composition could be made at all.** The `formations` table was empty.

**The cause, measured and not inferred.** `seedReference()` in `db/seed-reference.ts` was the only writer
of the built-in formations, and it runs from `npm run db:seed` and `npm run db:bootstrap` only — neither of
which has ever run against production. The local database has 11 positions, 7 built-ins and 49 slots
because a developer runs `db:reset`, which is exactly why this never showed up in development: the one
machine anybody would check on is the one machine where the bug cannot happen. Decision 129 had already
written that sentence about `positions`; it recorded `formations` as « 0 either way, and deliberately left
that way », pending the owner's call.

**The decision.** `db/migrations/0009_seed_formations.sql` inserts the seven `BUILTIN_FORMATIONS` with
`team_id is null` and their 49 slots. This is `0006_seed_positions.sql`'s principle — *migrating is what
creates the constraint, so migrating is what has to satisfy it* — generalised one step: **migrating is what
creates the schema, so migrating is what has to leave it usable.** A foreign key with nothing to point at
and a `<select>` with nothing in it are the same defect wearing two faces, and the first got a migration
while the second got a note.

**What keeps it safe.** It is **insert-only and idempotent**, guarded on `label` among the rows with
`team_id is null` — the same key `seedReference()` uses to identify a built-in — and it writes slots only
for a formation that has none. So `db/reference.ts` remains the single source of truth: the file is a copy
of `BUILTIN_FORMATIONS` at one moment in time, and `seedReference()` still owns every later change,
replacing a built-in's slots wholesale on each seed. A migration that *updated* would fight the seeder and
would move a slot somebody's saved composition points at; one that inserts cannot. It depends on
`positions` being populated, which 0006 guarantees and the journal orders.

**Verified from empty, which is the only test that demonstrates the fix.** A no-op on the local database
(11 / 7 / 49 before and after). Then a scratch database given `npm run db:migrate` **and nothing else** —
no `db:seed`, no `db:bootstrap` — ends with **11 positions, 7 formations with `team_id is null`, 49
slots**, every slot's `position_code`, `x`, `y` and `sort` identical to `BUILTIN_FORMATIONS` compared row
by row. Running the file twice more inserts nothing, and `db:seed` on top of it duplicates nothing.

**What was rejected.** Making `db:bootstrap` a required step that something checks. It is the alternative
decision 129 named, and it is worse for the reason the owner met: a required step that nothing runs is a
screen that lies about why it is empty. The reasons 129 gave for leaving the formations out all survive —
they were reasons not to *update* from a migration, and none of them was a reason to ship a dead end.

### The flocage has no character limit

`SHIRT_NAME_MAX_CHARS = 12` is gone, on the owner's instruction. The number was a guess at what a flocking
machine prints legibly across a 7-a-side back, and it was enforced in three places by design — the
constant and its hint, `shirtNameSchema`, and the `team_members_shirt_name_length` check. Three places
agreeing on a guess is still a guess, and the consequence was that « the printer will shrink it » had
become « the app refuses to remember it ». How short a name has to be to fit is a decision for whoever
orders the shirts.

**The check constraint is relaxed, not dropped** (`0008_true_johnny_storm.sql`): `char_length >= 1` rather
than `between 1 and 12`. Its lower bound is doing different work from its upper one — it is what stops a
one-space flocage from reaching the column as an empty string, so « no flocage » keeps exactly one
representation, `null`, and no screen has to tell `''` and `null` apart. `shirtNameSchema` keeps its
`trim()` and its transform to `null` for the same invariant from the other side; dropping the check would
have left it held in one place instead of two. The hint stops stating a ceiling and says the useful thing
instead — it is printed in capitals, so shorter reads better — and the `maxLength` attribute comes off the
input, because an attribute that silently swallows keystrokes explains nothing.

The one layout risk of an unbounded flocage was looked at rather than reasoned about: a 27-character
flocage saved from `/joueur/<id>` renders on the `/equipe` squad row as « floqué LE PROFESSEUR DE
SAINT-OU… », truncated with an ellipsis inside the card at 390 px. Nothing overflows.

### The wish picker offers six codes, not eight

**This supersedes decision 130.** That one drew the picker from « the union of the slots of the two shapes
this team really plays », `1-3-2-1` and `1-2-3-1` — eight distinct codes. The owner has narrowed it to
**the one shape the team actually lines up in**, `1-3-2-1` = `GB DG DC DD MC MC AT`: seven slots, **six
distinct codes**, `GB DG DC DD MC AT`, because the double pivot is two `MC`.

**State the consequence rather than letting it be discovered: `MG` and `MD` are no longer offered as a
wish, even though `1-2-3-1` still uses them and a coach can still field it.** That is the owner's decision,
not an oversight. Being asked where you would like to play is a question about the shape the team turns out
in on a Sunday, and that shape is one shape. The excluded five are now `MG MD MOC AG AD`, which is what the
chip row in `PositionPicker` exists for: a record written before the list narrowed keeps its code, the
profile posts the selection's own keys so nothing drops it, and a chip is the one way to remove it.

**The guard was rewritten rather than renumbered.** `db/reference.test.ts` recomputed the union from
`BUILTIN_FORMATIONS` and asserted `size === 8`; changing the 8 to a 6 would have left a test measuring a
union nobody claims any more. It now recomputes **the distinct codes of the `1-3-2-1` template** and
asserts `PREFERRED_POSITION_CODES` equals that set, so the property 130 built the test for survives: move
a slot in that formation and the test fails, and the stated rule cannot drift from the shipped constant.
The sort-order check and the subset-of-`POSITION_CODES` check are untouched, and the exclusion test names
all five.

**`positionCodeSchema` stays at eleven codes, and its docblock's reasoning stays load-bearing** — only its
count needed correcting, from « the eight the picker offers » to six. A player whose row already holds
`MG` or `MD` posts it back on every save; narrowing the Zod enum would make that player's whole submission
fail forever, and leave them unable to save anything ever again. Dropping a stored code is the picker's
job, not the schema's. `POSITION_CODES` stays at eleven for the same reason it did under 130: all seven
built-in formations stay shippable and the composition editor still places any of them.

## 142 — The wish picker is seven positions the owner named, and stops being derived from a formation

**2026-10-06** · accepted · supersedes the wish-picker third of decision **141**, and with it what
survived of **130** · no migration, no schema change

The picker now offers **`GB DG DD MC AG AT AD`** — in the owner's words: keeper, central defence left and
right, the middle, the two wings, and the striker.

### What this changes, and it is not the list

The list itself is a one-line edit. What changes is the **kind of rule** behind it, and that is the part
worth recording, because it is the third rule in two days and the first one that is not arithmetic:

| | the rule | codes |
|---|---|---|
| 130 | the union of the slots of the two shapes the team plays, `1-3-2-1` ∪ `1-2-3-1` | 8 |
| 141 | the distinct codes of the one shape the team lines up in, `1-3-2-1` | 6 |
| **142** | **the seven the owner named** | **7** |

`GB DG DD MC AG AT AD` is the code set of **no built-in formation**: `1-3-2-1` fields a `DC` and no winger
at all, and `1-2-1-3` fields the two wingers and neither `DG` nor `DD`. So the derivation is gone, and so
is the property that 130 and 141 both leaned on — that `db/reference.test.ts` could *recompute* the set
from `BUILTIN_FORMATIONS` and prove the shipped constant had not drifted from the stated rule. **A list
chosen by a person cannot be checked that way**, and pretending otherwise would be worse than admitting
it: the test now types the seven codes out as the specification and says in a comment that it is one.

### Two mismatches with the team's actual shape, both deliberate

Pinned in a test named `does not match the default shape, in both directions, on purpose`, because each
one reads like a bug to anybody who finds it later:

- **`DC` is not wishable, though `1-3-2-1` fields one.** The owner reads his two centre-backs as « left »
  and « right » and chose `DG`/`DD` for them. He was shown that the French labels say « Défenseur gauche »
  and « Défenseur droit » — full-backs, not centre-backs — and picked them anyway. A player who plays in
  the middle of the back three therefore has no chip that names his position exactly;
- **`AG` and `AD` are wishable, though `1-3-2-1` has no winger.** `DEFAULT_FORMATION_LABEL` is unchanged,
  so a player can now wish for a position the team's usual shape has no slot for. That is sound once the
  thing being asked is named correctly: **a wish is a preference, not a promise.** The wish is reachable —
  `1-2-1-3` is a built-in and a coach can field it — which is the one invariant kept from the derived era,
  now stated directly: *every code the picker offers is fielded by some built-in formation.*

Be honest about that invariant's strength. All eleven codes are fielded by some shape today, so the test
holds for **any** subset of the vocabulary and cannot fail on an edit to the picker alone. What it guards
is the formations: delete `1-2-1-3`, or move its wingers to `MG`/`MD`, and `AG`/`AD` become unanswerable
questions and it turns red. That is a real way for this to rot and not one anybody editing a formation
would think to check.

### What deliberately does not change

`POSITION_CODES` stays at eleven and `positionCodeSchema` stays `z.enum(POSITION_CODES)`, for the third
time and the same reason: the profile form posts back the codes already stored for a player, so a record
holding one of the four the picker no longer shows — `DC`, `MG`, `MD`, `MOC` — posts it too, and narrowing
the enum would make Zod reject that player's **whole** submission and leave him unable to save anything
ever again. Dropping a stored code is the picker's job, and the chip row is how it is done. All seven
built-in formations stay shippable and the composition editor still places any of the eleven.

**`DC` falling out of the picker is the new case of this**, and the first where a code the *default* shape
fields is no longer wishable: anyone who had already wished for « défenseur central » keeps that row, sees
it in the chip row, and can remove it — but cannot pick it again.

The picker's own layout needs no spacing check. Every pair of the eleven clears `MIN_MARKER_DISTANCE`
(`lib/pitch/geometry.ts`), and any subset of a set whose every pair clears it clears it too, so narrowing
or re-choosing the picker can never crowd the turf — which is why the eleven-wide spacing rule is kept
even though no screen draws all eleven at once.

## 143 — A session cookie that identifies nobody is cleared, not argued with

**2026-10-06** · accepted · fixes a production outage mode · no migration, no schema change

A `fm_session` cookie whose `sessions` row no longer exists made the **entire application
unloadable**, with no way out from inside the browser. Reproduced against production with one
command:

```
$ curl -sI -H 'Cookie: fm_session=x' https://7orteils.bgonzva.fr/connexion
HTTP/2 307
location: /
```

`/connexion` — the one screen that is supposed to be reachable without a session — answered « go
away, you are signed in » to a cookie that signed nobody in.

### The two guards, and why being individually right was not enough

Nothing here was a mistake in a query. It was two guards answering **different questions** about the
same cookie, each correctly:

| | asks | costs | verdict on a dead cookie |
|---|---|---|---|
| `proxy.ts` | « is there a cookie » | no database | signed in → bounce `/connexion` to `/` |
| `requireTeamContext()` in the `(app)` layout | « does it resolve to a member » | one query | signed out → redirect to `/connexion` |

The split is deliberate and stays (`docs/NEXTJS16.md` §6): the proxy runs on every navigation and
every prefetch, and a guard that queried Postgres there would be both slow and a lie, since a forged
cookie passes it. The proxy is optimistic by design; the layout is authoritative.

What was missing is that the authoritative guard had **only two answers to give**. `readSession()`
returned `{ userId } | null`, collapsing « no cookie » and « a cookie that resolves to nothing » into
the same `null`, so the layout could only send both to `/connexion` — and for the second one the
proxy sent it straight back. 307 `/` → 307 `/connexion` → 307 `/` → … The optimistic guard and the
authoritative one disagreed, permanently, and neither could win because **neither could delete the
cookie**: the proxy must not touch the database, and a Server Component is forbidden from writing
cookies at all. The cookie is `httpOnly`, so no script in the page could drop it either, and `/moi` —
which holds the only logout button — is behind the layout, hence behind the loop. The sole escape was
clearing site data in the browser's settings, which is not something to ask of a dozen people who
play football on a Sunday.

How a user gets into that state, in production, without anybody doing anything wrong:
`pruneExpiredSessions()` deleting the row while the cookie's own 30-day expiry still has weeks to
run; the database rebuilt or restored (`db:reset`, the production restore of decision 132) under a
browser that kept its cookie; a `users` row deleted beneath a live session. None of these is exotic
and the first is routine housekeeping.

### The fix: a third outcome, and a route that can act on it

`readSessionState()` replaces `readSession()` and returns `anonymous | stale | active`
(`lib/auth/session-state.ts` holds the type and the one pure function that maps it to a
destination). `stale` is the case the old `null` hid, and its destination is **not** `/connexion`:

- no cookie → `/connexion`, exactly as before;
- a cookie that resolves to nobody → `/deconnexion?raison=expiree`.

`app/deconnexion/route.ts` is a Route Handler, which is the only kind of thing in this codebase that
may both read the database *and* write a cookie. It calls `destroySession()` and answers **303** to
`/connexion?expiree=1`.

**Why the loop cannot re-form, rather than being papered over:** after that one hop there is no
cookie left for the two guards to disagree about. They are not reconciled — the proxy still sniffs
and the layout still queries — but the state in which their answers differ is now *destroyed on
sight* instead of being bounced between them. `/deconnexion` is in `PUBLIC_PATHS`, so the proxy lets
it through in all three cases, and that is checked in `proxy.test.ts`: with a cookie (the real path),
with none (a bookmark, a second tab — the handler is idempotent and just redirects), and the matcher
matching it at all. The chain, walked by hand against the local app with a cookie jar, is three
responses long: `307 /deconnexion?raison=expiree` → `303 /connexion?expiree=1` + `Set-Cookie:
fm_session=; Expires=Thu, 01 Jan 1970` → `200`.

The `logout` Server Action on `/moi` is untouched and remains how a user logs out on purpose. The two
`getCurrentUser()` guards inside `lib/auth/actions.ts` now route through the same helper, so a Server
Action met by a dead cookie clears it too rather than handing the loop back to the next navigation.

### `GET`, and the CSRF question answered out loud

The handler supports `GET`, and that is a real decision, not an oversight. It is reached by
`redirect()` from a Server Component, which can only produce a `GET`; a `POST`-only handler would be
unreachable from the only caller that needs it, and we would be back to the brick.

So it is forgeable: a third-party page can embed `<img src="…/deconnexion">` and log a visitor out.
Stated plainly — **logging somebody out is a nuisance, not a privilege escalation.** It grants the
attacker nothing, reveals nothing, and is undone by typing a password. Against the alternative, which
is an application the user cannot load at all and cannot repair from inside the browser, the nuisance
is the cheaper of the two by a wide margin. Two consequences accepted knowingly: a link-prefetcher or
a mail scanner that follows `GET`s could log the user out, and so could a stray prefetch — mitigated
only by the fact that **nothing in the app ever links here**, so there is no `<Link>` for Next to
prefetch. The route is entered by a server-side redirect or by typing the URL.

### The user is told, and tutoied

A silent logout reads as the app having forgotten you. `/connexion?expiree=1` prints one line —
« **Ta session a expiré, reconnecte-toi.** » — in a `warning`-toned panel above the form, and only
then: somebody who typed `/deconnexion` deliberately is logging out, not expiring, and gets plain
`/connexion`. That is what the `?raison=expiree` round trip is for. Tutoiement per decision 074, no
`title` anywhere per decision 072. Looked at at 390 px in both themes.

### Why the e2e test is the one that matters

`lib/auth/session-state.test.ts` asserts the decision — a stale cookie must route to the clearing
path and must *not* route to `/connexion` — and that is the logic. But a loop is a property of the
whole chain, and only a browser walks the whole chain: proxy, Route Handler, `Set-Cookie`, layout
guard. `e2e/stale-session.spec.ts` sets a garbage `fm_session`, visits `/`, and asserts it lands on
`/connexion` with the form visible, the French line shown, the cookie gone, and the itinerary **at
most four navigations long**. Reverting `signedOutDestination` to the old answer was run as a
sanity check: the spec fails. This spec is also the one place the suite forges a session cookie
instead of logging in through the form (`e2e/helpers/app.ts`), because here the forgery *is* the
subject — the honest alternative, logging in and deleting the row underneath, needs a second database
connection to produce exactly what garbage already produces.

---

## 144 — The slider still steps by half a point; the column only asks for one decimal

**2026-10-06** · accepted · **supersedes the `ratings_score_half_step` clause of decision 137**,
leaving the rest of 137 and the 0–10 range of decision 007 standing · migration
`0010_puzzling_karen_page.sql`

The owner is importing the seasons that happened before the app existed. Each of those matches has a
per-player figure that is **already a mean** — computed from the notes real teammates gave at the
time — and those means land where means land: 7.3, 4.2, 3.9. `ratings_score_half_step` refused every
one of them, and the only way through it was to round to the nearest half-point, which turns eleven
distinguishable players into five-way ties. The thing the import exists to produce is a *ranking*, so
rounding does not degrade the data, it deletes it.

So the check becomes `ratings_score_one_decimal` — `(score * 10) = floor(score * 10)` — and nothing
else about the table moves. `ratings_score_range` (0..10), `ratings_no_self` and the unique triple
`(match_id, rater_member_id, rated_member_id)` are untouched, and no row has to change: every value
the old check admitted satisfies the new one, which is why the migration is a `DROP CONSTRAINT` plus
an `ADD CONSTRAINT` and nothing more.

### What does **not** change: the match-day flow

The rating screen is exactly as decision 137 left it. `RATING_SCORE_STEP` is still `0.5`, the
`<input type="range">` still carries `step={0.5}`, and `ratingScoreSchema` still refuses « 7,2 » with
« Une note va par demi-points : 7 ou 7,5, pas 7,2. » A player sliding a control cannot produce a
tenth and will not be allowed to.

That makes **the form deliberately stricter than the column**, which is the opposite of how the two
layers have lined up everywhere else in this codebase, so it is worth saying why it is right rather
than sloppy: the half-point is a property of *one way of writing a row* — a human reading a slider —
and not a property of the quantity. A note is a judgement on a scale with a resolution; an imported
mean is an arithmetic result. The table holds both, so it states the weaker rule, and the stricter
rule lives where the stricter claim is true.

### The subtlety, and why the new check is kept anyway

**`numeric(3,1)` rounds on insert rather than erroring.** Postgres casts `7.26` to `7.3` before any
check runs, so `(score * 10) = floor(score * 10)` is satisfied by every value that can ever reach
it: the constraint **can never fire**. It is documentation, not enforcement, and it was written
knowing that.

It is kept, for three reasons:

- it is the same kind of statement `ratings_score_range` already is. That check *can* fire, but in
  practice `ratingScoreSchema` has rejected 11 long before Postgres sees it; it is there so the
  column says its own shape to whoever opens `psql` or reads `schema.ts`, rather than making them
  trust that every writer is well behaved. Deleting the step line entirely would leave the column
  silently one-decimal by virtue of its type declaration, which is a fact a reader has to *infer*
  from `numeric(3,1)` instead of read;
- it is the only remaining written trace of the rule that was relaxed. A schema with a half-step
  check that became a one-decimal check tells the next session that the resolution was considered;
  a schema with the check simply gone tells it nothing, and the old half-step line will be a
  plausible-looking re-addition to somebody importing the next batch;
- it becomes live enforcement the moment the scale changes. `numeric(3,2)` or an untyped `numeric`
  would stop rounding for us, and the check already in place would then refuse the quarter-point
  rather than the quarter-point being discovered in the data.

What is **not** claimed anywhere, because it is untrue: that the check protects the column. It does
not. `numeric(3,1)` does, by rounding — and the honest consequence is that a bad import writes a
*rounded* value rather than failing loudly, so an import script is responsible for its own precision
before it inserts.

### The read side had to move with the column, and that was the real bug

`isValidScore` in `lib/rating/aggregate.ts` is not validation of a submission — it filters rows
**already read from the database** before `aggregateRatings` trusts them, for exactly the case the
comment names: « a fixture or a future import path might not » have gone through the checks. It
demanded a half-point. So with only the constraint relaxed, every imported historical mean would have
been inserted successfully and then **silently dropped on the way out**, and the season table the
import exists to fill would have been empty of precisely the rows it was about. No test would have
failed; the screen would simply have said « — ».

It now follows the column: one decimal. The check is `Math.abs(score * 10 - Math.round(score * 10)) <
1e-9` rather than `Number.isInteger(score * 10)`, and the reason is **not** the one first written
here, which was wrong and is worth leaving corrected rather than deleted: a tenth is inexact in
binary floating point, but the multiplication rounds back, `7.3 * 10` is exactly `73`, and the naive
form holds for all 101 tenths in 0..10 — the test walks every one of them to pin that. The tolerance
earns its place differently. The half-point test could *rely* on `0.5` being exact; this one merely
happens to hold, so the next person to widen the scale to hundredths, or to route a `numeric` through
a different parser, gets a predicate that still asks « is this a tenth, give or take the float »
instead of one that was true by luck.

## 145 — The cahier des charges is the plan, and these are its answers

**2026-10-09** · accepted · scope of the rework; each slice records what it supersedes in its own entry

After two real matches the owner wrote `cahier-des-charges.md`, a review of the whole product, and it
replaces the plan the repository was following (whose last two pieces, the remarks and the ratings
rebuild, had shipped). The top section of `docs/PLAN.md` is now the plan; the original design below it
stays, as the record of why things are shaped the way they are.

The cahier left ten questions open, and the owner answered them before anything was built. They are
recorded here because each one forecloses a reading a later session could otherwise take:

- **positions are exactly GB, DC, MC, AIL, AT.** « AT × 2 (gauche et droite, mais ne pas faire de
  différence, ce sont les ailiers) » is one position in two slots, so it gets one code, `AIL` « Ailier »,
  rather than the two side codes the app has, which would have stated a difference the owner said not
  to make. Old wishes are **mapped**, not wiped: `DG`/`DD` → `DC`; `AG`/`AD`/`MG`/`MD` → `AIL`;
- **the trainings and availability tables are dropped**, not hidden. Production holds no training and
  five availability answers; a dead table is a trap for the next session, and a dump is taken first;
- **a position swap with nobody coming on goes through « Changement » with nobody in or out**, ending on
  the same drag & drop pitch as any change. « Supprimer les changements de postes » removes the separate
  action, not the possibility;
- **ratings stay in the statistics** — a fourth équipe type and the notes leaderboard — beside the three
  the cahier describes;
- **« pour chaque poste, qui est le meilleur en terme d'impact »** means the goal difference while he
  played that position — goals scored minus goals conceded with him there — per 60 minutes, smoothed
  toward the squad so ten minutes cannot top the list;
- **« ne pas mettre quelqu'un de trop nul au goal »** in the « 7 de légende » means: no keeper whose goals
  conceded per 60 minutes in goal is worse than the squad's average keeper;
- **« par défaut la compo principale est appliquée »** means as soon as game mode opens, written by a
  coach or operator and never by a viewer. That reverses non-negotiable invariant 3 of `CLAUDE.md`; the
  entry superseding it, and the change to `CLAUDE.md`, ride the slice that changes the behaviour, so the
  rule and the code move in the same pull request.

Who may **be rated** does not change — minutes > 0, never yourself. The cahier only changes who may
**rate**.

## 146 — No production tag during the rework; the Project is where work is tracked

**2026-10-09** · accepted · suspends the *use* of decision 119's tag, not its mechanism

Line 1 of the cahier: « No tagging in production allowed, we are only working in main, so "latest" on
the image ». Asked what that meant, the owner chose **stop shipping production for now**. So for the
duration of this rework nothing cuts a tag — no session ever did, and the owner will not either —
every slice lands on `main`, CI migrates the **preview** database and deploys `dev.7orteils.bgonzva.fr`,
and production stays on `v1.0.0-beta.10`. `release.yml` is untouched: the day the owner decides to ship,
a tag works exactly as decision 119 describes. A version bump is pointless until then and none is made.

The consequence a session must not miss: **migrations pile up on preview.** Several slices drop tables
or rewrite reference data, and production will take all of them in one tag. Each one has to be correct
against a production-shaped database, which is why every slice runs its migration first on a local
restore of production rather than on the demo season.

The same line asks for a GitHub Project « so we can see the project working » and for sessions on
several computers. The Project « Football-manager » (number 5 under `avznog`) now holds every merged pull
request as *Done* — the pull requests themselves, not issues written after the fact — and one issue per
slice of the rework, labelled `cahier-des-charges`. A slice's issue goes to *In progress* when its branch
is pushed, and its pull request says `Closes #<issue>`. **The board is the first thing to read on another
machine**, before `COORDINATION.md`'s Log: it says what is in flight without anyone keeping prose up to
date.

## 147 — A change is a snapshot of the pitch, and at the same instant facts come first

**2026-10-09** · accepted · how slices S8 and S10 record changes; no new event type and no migration

The cahier wants changes unpaired — « je dis que 4 personnes rentrent et 4 personnes sortent, sans dire
que X remplace Y » — then confirmed on a drag & drop pitch, effective at the minute the ACTION button was
pressed, several at once, and with every player's position known at every moment.

**A change is recorded as one `LINEUP_APPLIED`**: the whole pitch after it, stamped with the clock
reading of the ACTION tap, which is how game-mode flows already stamp (`openFlow`'s `tappedAtMs`). Who
goes in and who goes out is a step of the screen that pre-arranges the pitch; the event says where
everybody stands. The reducer already turns a snapshot into leave, then move, then enter, and goalkeeper
minutes follow the `GB` slot, so positions are known by construction. A new event carrying `outIds`,
`inIds` *and* slots was rejected: the slots and the previous pitch already imply who went in and out, so
it would store the same fact twice and need a rule for when the two disagree — and cost an
`ALTER TYPE`. The paired `SUBSTITUTION`s already in production are untouched and reduce exactly as before.

**A goal conceded just before a change counts against the players who were on.** The owner proposed
recording the change a minute later, and said a better way was welcome. Moving the change invents a
minute: the player going off is credited with one he did not play, and the player coming on loses it.
Instead the reducer orders events at an **identical** clock reading so that facts come before pitch
events, within each segment between clock events — so « fin de période → changements → coup d'envoi »
at a break keeps its order. Live stamps are millisecond-precise and the goal tapped first already comes
first; the rule is for the minute-granular entries — a change added after the match, a retro sheet —
where today the order of entry decides. Before it merges, the logs in production are checked for a pitch
event recorded before a fact at the same reading, which is the only way the rule could change a
stored figure.
