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
scoreboard has already said so. Once M7's retro-entry lands, this state is the one that offers it.

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
