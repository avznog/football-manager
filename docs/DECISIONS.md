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

## 016 — Local Docker Postgres for development, Neon for production
**2026-09-23** · accepted

Development runs against a Postgres container started by `npm run db:up`. Production will use a
Neon project; switching is a single `DATABASE_URL`.

**Why.** Provisioning Neon needs an interactive browser flow that the build session could not
perform. Nothing in the application depends on Neon-specific behaviour.

**Consequences.** `drizzle.config.ts` and the db client read `DATABASE_URL` only. Deployment to
Vercel is blocked until a Neon connection string exists — tracked in `docs/ROADMAP.md`.
