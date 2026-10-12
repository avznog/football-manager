--
-- The first three matches, rebuilt from the owner's paper sheets — ready to apply to production.
--
-- WHAT THIS IS. On 2026-10-12 the season's first three matches were rebuilt on the **preview**
-- database from the owner's handwritten sheets (decision 179), and every player's preferred positions
-- were then filled in from the record that rebuild produced (decision 180). The owner asked for the
-- result to be kept so that production can receive it without the work being done twice. This file is
-- that result: the rows, not the recipe.
--
-- There is also a recipe, and it is committed: `scripts/rebuild-matches.mts` and
-- `scripts/assign-positions-from-play.mts`, driven by `backlogs/matches-1-3-blocks.json`, which is the
-- machine-readable form of `backlogs/matches-1-3.md`. Either route reaches the same state. Use this
-- file when you want exactly what was reviewed on preview; use the scripts when the paper has changed.
--
-- WHY IT CAN BE APPLIED AT ALL. Preview was restored from production on the same day, so the
-- identifiers are the same ones production uses — verified, not assumed: the md5 of every `matches.id`,
-- `team_members.id` and `users.id` is identical on both. That is what lets these rows be moved.
--
-- *** PRECONDITION: production must be at migration 0014 first. ***
-- It is at 0010 today. These rows reference the `AIL` position that migration 0012 inserts, the
-- `match_player_positions` table and `match_player_stats.goals_for_while_on` that 0014 adds. The next
-- tag applies 0011-0014 and then runs `db:refreeze` (decision 161). Apply this **after** that, or the
-- inserts fail on a missing table and an absent position code.
--
-- WHAT IT CONTAINS, and nothing else: the event logs of the three matches, the two derived caches,
-- the match sheets, and the preferred positions. **No users, no password hashes, no sessions, no
-- ratings** — nothing to redact, which is why it can live in a public repository unlike
-- `preview-20261012.sql`.
--
--   match_events             76 rows   the three logs, each change a snapshot of the whole pitch
--   match_player_stats       37 rows   the frozen per-player figures
--   match_player_positions   57 rows   minutes, goals for and against per post — new with 0014
--   match_squad              37 rows   starters and substitutes from the paper, supporters preserved
--   player_positions         29 rows   15 players, one primary each (decision 180)
--
-- HOW TO APPLY IT. One transaction; it either all lands or none of it does.
--
--   psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/snapshots/matches-1-3-rebuilt.sql
--
-- Use Neon's **direct** endpoint, not `-pooler`: a pooled connection can carry an empty `search_path`
-- and unqualified SQL then fails on tables that are plainly there (`COORDINATION.md`).
--
-- WHAT IT REPLACES. It deletes and rewrites the five tables above wholesale. That is correct here
-- because only these three matches have events, caches or sheets, and `player_positions` held one
-- member's wishes which decision 180's rule reproduces exactly. It also releases
-- `lineups.applied_event_id` before touching `match_events` (that column has a foreign key to it) and
-- restores it afterwards, and finishes Bayern Barbecue Club, which production still has as `live`.
--
-- It does **not** touch `ratings`, `ratings_published_at`, `users`, `sessions`, `teams`, `invites`,
-- `competitions`, `formations` or `injuries`.
--
-- AFTERWARDS, check these four things rather than trusting the transaction:
--   * `select status from matches where opponent_name like 'Bayern%'` is `finished`;
--   * the three derived scores are 3-9, 3-2 and 2-5;
--   * `gk_minutes` for the Galacticos match names four keepers and **not** Nicolas;
--   * `/stats` shows « pas son poste » nowhere in the three sevens.
--
-- Generated from preview on 2026-10-12.
--

begin;

-- `lineups.applied_event_id` references `match_events(id)`, so it has to let go first.
update lineups set applied_event_id = null;

delete from match_player_positions;
delete from match_player_stats;
delete from match_squad;
delete from match_events;
delete from player_positions;


\restrict NSNd0RSChCij74reCeTHLrU1GcYUYaI2PBYmLATloAwta9exur2xeeYweXWYtlH

COPY public.match_events (id, match_id, client_event_id, type, period, minute, clock_ms, occurred_at, recorded_at, payload, created_by, voids_event_id, seq) FROM stdin;
4ead7abf-2253-40ca-a172-a611a7df8577	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	6521d734-7570-4aca-8f9c-81509aee6002	GOAL_FOR	1	5	300000	2026-09-29 18:50:00+00	2026-10-06 15:55:14.513+00	{"assistId": "1787c0df-f303-454a-a3a0-27d1b2ab4319", "scorerId": "da022cee-9943-4052-8b3a-cf6991dd646e"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	2
b8df60d1-80df-478b-8f27-7c8d1e7ef313	b777ba19-29b0-493e-925a-38bd14ca96e6	583b1f3d-ba48-4df3-8db2-b14973cbb3ab	KICKOFF	1	0	0	2026-09-22 18:45:00+00	2026-09-22 18:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	0
e047a266-e3f5-4664-82c5-5e02b40e938c	b777ba19-29b0-493e-925a-38bd14ca96e6	1d0c8f32-823d-4d6c-8fa9-817e0855f284	LINEUP_APPLIED	1	0	0	2026-09-22 18:45:00+00	2026-09-22 18:45:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}], "lineupId": "b13d59f3-df2c-4b99-8221-9eb75dfb4001"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	1
e486766b-2b0e-47e5-a156-9ca8cdd2259f	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c002	GOAL_FOR	1	2	120000	2026-09-22 18:47:00+00	2026-10-06 15:55:13.395+00	{"scorerId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	2
e7bee588-110f-45bc-9850-cd86ebc7b6ba	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c003	GOAL_AGAINST	1	4	240000	2026-09-22 18:49:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	3
a83e07ad-8f83-4eb9-9eeb-154b6239b622	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c004	GOAL_FOR	1	9	540000	2026-09-22 18:54:00+00	2026-10-06 15:55:13.395+00	{"assistId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa", "scorerId": "da022cee-9943-4052-8b3a-cf6991dd646e"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	4
d69572e5-e1b8-485f-85cd-bea1ce092cc7	b777ba19-29b0-493e-925a-38bd14ca96e6	4e118f91-5a24-4367-80c0-1d1d1a6cb3bf	LINEUP_APPLIED	1	11	660000	2026-09-22 18:56:00+00	2026-09-22 18:56:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b7331f64-9329-44a8-8731-510f152a9090"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	5
8340c2a7-3719-43c5-ba54-46f3cee06e14	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c008	GOAL_AGAINST	1	14	840000	2026-09-22 18:59:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	6
3157c660-f62d-4a22-b727-ac37ff91ba08	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c009	GOAL_AGAINST	1	19	1140000	2026-09-22 19:04:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	7
206706c5-df7b-4ee3-8ce2-68a14daaf4db	b777ba19-29b0-493e-925a-38bd14ca96e6	1d035e31-d978-48fb-806f-57ad0b581443	LINEUP_APPLIED	1	20	1200000	2026-09-22 19:05:00+00	2026-09-22 19:05:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	8
8421b340-56a8-4705-a88a-cc832944323d	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c00e	GOAL_FOR	1	26	1560000	2026-09-22 19:11:00+00	2026-10-06 15:55:13.395+00	{"assistId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa", "scorerId": "a97effda-648c-4735-91f4-767e9641f3e9"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	9
6618f4c5-c9c2-412f-8484-6251e015bde7	b777ba19-29b0-493e-925a-38bd14ca96e6	39d1bec1-e646-4307-8b95-772de2be550f	PERIOD_END	1	30	1800000	2026-09-22 19:15:00+00	2026-09-22 19:15:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	10
6e78ef37-a985-4579-8c2f-3d2bd17c2ee1	b777ba19-29b0-493e-925a-38bd14ca96e6	05347a1b-69a6-49c1-82d5-568f8caf6719	KICKOFF	2	30	1800000	2026-09-22 19:15:00+00	2026-09-22 19:15:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	11
50e7a363-854d-403d-88c2-5997edbd8da5	b777ba19-29b0-493e-925a-38bd14ca96e6	359ff867-30d7-4e45-8b07-effb238c591d	LINEUP_APPLIED	2	30	1800000	2026-09-22 19:15:00+00	2026-09-22 19:15:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b7331f64-9329-44a8-8731-510f152a9090"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	12
e2ac69d7-b41d-48b3-86cd-5c3aa5bc540d	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c015	INJURY	2	36	2160000	2026-09-22 19:21:00+00	2026-10-06 15:55:13.395+00	{"memberId": "b7331f64-9329-44a8-8731-510f152a9090"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	13
83711324-d1f2-4f4e-8f02-09801847cba6	b777ba19-29b0-493e-925a-38bd14ca96e6	a95bd2d0-d84a-4146-80ad-b1ec5efd0dae	LINEUP_APPLIED	2	36	2160000	2026-09-22 19:21:00+00	2026-09-22 19:21:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	14
ae09d30a-8ce8-4160-8dac-c4a6c645c908	b777ba19-29b0-493e-925a-38bd14ca96e6	f1a3abd6-648a-4f28-8c18-fba298479840	LINEUP_APPLIED	2	40	2400000	2026-09-22 19:25:00+00	2026-09-22 19:25:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	15
674a8b4a-5fb8-4fa3-90b6-538b88bc3493	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c01a	GOAL_AGAINST	2	43	2580000	2026-09-22 19:28:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	16
3bb549d7-c738-4c1c-a30a-f3d8136a0157	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c01b	GOAL_AGAINST	2	45	2700000	2026-09-22 19:30:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	17
fe4fdbfd-7425-4938-ba88-aff30dd4aca6	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c01c	GOAL_AGAINST	2	47	2820000	2026-09-22 19:32:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	18
83e09d1d-27ba-4eab-88ed-e4c94a8e75a3	b777ba19-29b0-493e-925a-38bd14ca96e6	9747a699-63dd-4143-8425-b465c580410b	LINEUP_APPLIED	2	47	2820000	2026-09-22 19:32:00+00	2026-09-22 19:32:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	19
873ffded-3f46-436b-9d4d-65eff45a08ed	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c01e	GOAL_AGAINST	2	48	2880000	2026-09-22 19:33:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	20
dff06096-27e2-4e90-82a8-d4da0cc2ca28	b777ba19-29b0-493e-925a-38bd14ca96e6	df68250a-303a-40c8-8275-7f1e7cf2cdf0	LINEUP_APPLIED	2	48	2880000	2026-09-22 19:33:00+00	2026-09-22 19:33:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	21
5c856d0e-eb2a-45cf-a4a2-d67ce002db22	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c020	GOAL_AGAINST	2	50	3000000	2026-09-22 19:35:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	22
6852de1f-84b9-4a91-85e8-3fdb0799bf29	b777ba19-29b0-493e-925a-38bd14ca96e6	7f58490b-6e79-4949-8550-ad07e66ba971	LINEUP_APPLIED	2	51	3060000	2026-09-22 19:36:00+00	2026-09-22 19:36:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	23
3e7f4b27-d285-43e1-8c0e-847b395d08b9	b777ba19-29b0-493e-925a-38bd14ca96e6	69f5c48b-813c-4cd9-8b4f-1d6fb69a5dc1	LINEUP_APPLIED	2	56	3360000	2026-09-22 19:41:00+00	2026-09-22 19:41:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "b68f58bc-6856-4d38-bd71-3b6d39c08ff5"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	24
68c8ba22-c55a-43e1-a214-9fba4bf53073	b777ba19-29b0-493e-925a-38bd14ca96e6	06803f79-6917-439f-899a-d06510a2c023	GOAL_AGAINST	2	60	3600000	2026-09-22 19:45:00+00	2026-10-06 15:55:13.395+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	25
5e0ae1a3-c015-4fd1-8c43-757fca4ac719	b777ba19-29b0-493e-925a-38bd14ca96e6	e6f6702f-dfe9-4b39-8c4a-addbb30b3131	PERIOD_END	2	60	3600000	2026-09-22 19:45:00+00	2026-09-22 19:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	26
44755546-2545-4bd4-8420-089284feb51c	b777ba19-29b0-493e-925a-38bd14ca96e6	09242642-c618-497c-8e73-8f3e60d9f0f4	FINAL_WHISTLE	2	60	3600000	2026-09-22 19:45:00+00	2026-09-22 19:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	27
1819e2b9-8fdc-4f47-80d4-4f15f68b8c8f	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	fd96d0c5-6c99-416f-8c0d-01910d449ae7	KICKOFF	1	0	0	2026-09-29 18:45:00+00	2026-09-29 18:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	0
d419c0a8-0ade-46ca-8551-3d5cc547cc22	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	97c5eecc-76ce-4e82-831d-a870567ca96a	LINEUP_APPLIED	1	0	0	2026-09-29 18:45:00+00	2026-09-29 18:45:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}], "lineupId": "b0aab77b-8974-4a65-8ad7-cedfcf0283cd"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	1
c934d7bd-fa33-4e3f-8181-ce19f2de5617	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	128e1b89-0f70-4637-8de2-0a65645d291f	LINEUP_APPLIED	1	11	660000	2026-09-29 18:56:00+00	2026-09-29 18:56:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	3
57be5491-ccad-4c0c-8b10-a0cbb67be976	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	6521d734-7570-4aca-8f9c-81509aee6006	GOAL_AGAINST	1	16	960000	2026-09-29 19:01:00+00	2026-10-06 15:55:14.513+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	4
adc3f535-4186-4bcb-852b-7ba1b9d8b323	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	5f2adc11-c90f-4cc3-8b66-de3d6bd51a2b	LINEUP_APPLIED	1	18	1080000	2026-09-29 19:03:00+00	2026-09-29 19:03:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	5
2c870c63-3be0-4c95-8f4d-5e77ae0c6bad	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	f00345e7-e79a-474d-8a52-762be5c3e175	LINEUP_APPLIED	1	22	1320000	2026-09-29 19:07:00+00	2026-09-29 19:07:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	6
63a43594-4257-4d0c-85e7-f29517f1af10	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	6521d734-7570-4aca-8f9c-81509aee600a	GOAL_FOR	1	23	1380000	2026-09-29 19:08:00+00	2026-10-06 15:55:14.513+00	{"scorerId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	7
e6b998a2-42fe-4940-871d-05deaceef8a8	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	25a881ce-7a01-4f48-8c5b-4c1aec1e8ea0	LINEUP_APPLIED	1	26	1560000	2026-09-29 19:11:00+00	2026-09-29 19:11:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	8
3b0b3d55-d758-4537-8a76-f1199377e4af	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	7be03cc9-41ed-4c4f-84e3-84fde18f6e17	PERIOD_END	1	30	1800000	2026-09-29 19:15:00+00	2026-09-29 19:15:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	9
d8eafa9a-3fa4-4c18-8df1-005e4e642ee0	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	b7135dce-7f1e-49c0-8774-8e92189f1e38	KICKOFF	2	30	1800000	2026-09-29 19:15:00+00	2026-09-29 19:15:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	10
70600d76-2b95-47c4-8aec-06d216d013bc	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	f7a53ce2-38ff-4a5c-83c5-ffbe71ba2124	LINEUP_APPLIED	2	30	1800000	2026-09-29 19:15:00+00	2026-09-29 19:15:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	11
a4cdf361-cf08-440b-80a6-118de35d8cd3	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	152d521d-4118-44f3-84e8-50f9cd2d25eb	LINEUP_APPLIED	2	37	2220000	2026-09-29 19:22:00+00	2026-09-29 19:22:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	12
1adef2c8-1491-45e2-8e8b-6e54ee9e901a	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	6579c1c4-de2b-493a-8672-03b0cb8b32c2	LINEUP_APPLIED	2	40	2400000	2026-09-29 19:25:00+00	2026-09-29 19:25:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "1787c0df-f303-454a-a3a0-27d1b2ab4319"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	13
fc83182a-a3c6-4f00-a5c5-2d117cff6b9a	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	6521d734-7570-4aca-8f9c-81509aee6013	GOAL_AGAINST	2	42	2520000	2026-09-29 19:27:00+00	2026-10-06 15:55:14.513+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	14
a793f5a9-3fa6-4b83-8d18-7a45996d82eb	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	51716bf5-405c-4b0b-83a4-5841be2b5763	LINEUP_APPLIED	2	48	2880000	2026-09-29 19:33:00+00	2026-09-29 19:33:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	15
8443087b-cc78-4b45-8791-68c73bf4adad	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	9d6ace77-cd8e-43cd-8354-881308f0fe25	LINEUP_APPLIED	2	52	3120000	2026-09-29 19:37:00+00	2026-09-29 19:37:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	16
3fd3b113-a578-42f5-8fbd-625744a9cbfd	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	b06866c7-7025-4f1d-8694-facb62dcce55	LINEUP_APPLIED	2	54	3240000	2026-09-29 19:39:00+00	2026-09-29 19:39:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "328d9c7a-db3d-4f4f-8834-60614d1a1754"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	17
9306d184-380b-42e7-9d4c-0c0d2d76c2ec	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	6521d734-7570-4aca-8f9c-81509aee6019	GOAL_FOR	2	55	3300000	2026-09-29 19:40:00+00	2026-10-06 15:55:14.513+00	{"scorerId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	18
ca06d5a9-62ee-4c03-8c14-6a7d89cc581b	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	ea5cc76d-411e-463b-86fb-cff19250f8e3	PERIOD_END	2	60	3600000	2026-09-29 19:45:00+00	2026-09-29 19:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	19
8f6e41ad-8530-4f13-8055-a101893f329b	d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	7dd950b1-728b-48fb-8b80-33e5c33b0833	FINAL_WHISTLE	2	60	3600000	2026-09-29 19:45:00+00	2026-09-29 19:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	20
b8e37292-60ec-4fe4-889e-a3965e322edc	0c4182d6-c39b-4e87-adf4-d346bc152251	3c643686-95b8-49bc-8b2a-fbba103f4904	KICKOFF	1	0	0	2026-10-06 18:45:00+00	2026-10-06 18:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	0
29fceb32-12c5-4c40-8f98-ba3e96dbad38	0c4182d6-c39b-4e87-adf4-d346bc152251	de0f9e6e-5473-4c98-8eb7-0d1a86cfd560	LINEUP_APPLIED	1	0	0	2026-10-06 18:45:00+00	2026-10-06 18:45:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}], "lineupId": "fcce13f8-5fd6-4f6d-ae9a-56660f990dee"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	1
091af409-10b5-4e7d-8073-8c505b2c29a2	0c4182d6-c39b-4e87-adf4-d346bc152251	4e2c7815-89d9-48bf-8679-6eb86553bd60	REMARK	1	1	80164	2026-10-06 18:48:46.896+00	2026-10-06 18:48:59.489+00	{"kind": "GOOD_POSITIONING", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	2
e0b6e9b7-89ca-4b64-a261-15e5f624f121	0c4182d6-c39b-4e87-adf4-d346bc152251	5461a88f-ac5e-4968-b16a-1cd3485f6dca	COMMENT	1	3	181884	2026-10-06 18:50:28.616+00	2026-10-06 18:50:38.354+00	{"note": "Belle sortie", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	3
85124d68-7f1a-48ba-86bc-4a6c13b80ef2	0c4182d6-c39b-4e87-adf4-d346bc152251	dab11a1c-d1d2-4f92-80e1-9b508c5c1b1a	LINEUP_APPLIED	1	10	600000	2026-10-06 18:55:00+00	2026-10-06 18:55:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	4
729ab0eb-367f-4e3d-8951-baff253108f5	0c4182d6-c39b-4e87-adf4-d346bc152251	0f27cbef-da3a-4e15-8e0a-11b3766c191d	GOAL_AGAINST	1	14	840000	2026-10-06 18:59:00+00	2026-10-06 18:59:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	5
a096585c-2a80-4592-8c1b-e770b8ffb8ca	0c4182d6-c39b-4e87-adf4-d346bc152251	70196940-fef1-49ea-8435-f6e406731c72	LINEUP_APPLIED	1	19	1140000	2026-10-06 19:04:00+00	2026-10-06 19:04:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	6
f500fb29-0c76-4ef3-920b-c36484d029f5	0c4182d6-c39b-4e87-adf4-d346bc152251	1bdbf562-5970-4cc2-b596-0920c3b784d6	REMARK	1	21	1272348	2026-10-06 19:10:10.872+00	2026-10-06 19:10:15.964+00	{"kind": "GOOD_TRACK_BACK", "memberId": "13e1abb4-1317-4ec0-90ce-366b9b0fa0ed"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	7
c64ed546-24e1-4108-8d0f-36c25b5c5850	0c4182d6-c39b-4e87-adf4-d346bc152251	911e1e72-88e7-4070-8d54-af3e380278e8	GOAL_AGAINST	1	29	1740000	2026-10-06 19:14:00+00	2026-10-06 19:14:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	8
9d8fe328-df3f-49b6-8911-7fa45c27dc3e	0c4182d6-c39b-4e87-adf4-d346bc152251	256f1254-6c81-4fde-8b4b-a3001a1c4516	PERIOD_END	1	30	1800000	2026-10-06 19:15:00+00	2026-10-06 19:15:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	9
4eba4dcf-0303-4d31-8b45-351be600fcc9	0c4182d6-c39b-4e87-adf4-d346bc152251	342286cb-4fe8-47a9-83f9-3657f168add1	KICKOFF	2	30	1800000	2026-10-06 19:15:00+00	2026-10-06 19:15:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	10
a614c82a-a4ea-4444-82f0-0506d0f1e3fc	0c4182d6-c39b-4e87-adf4-d346bc152251	d2e23816-892f-459c-871c-5e5203138c24	LINEUP_APPLIED	2	30	1800000	2026-10-06 19:15:00+00	2026-10-06 19:15:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	11
170e2c24-231b-4d32-8ee6-fc18e04ac60a	0c4182d6-c39b-4e87-adf4-d346bc152251	0e4cda08-1dd0-4a6a-85bb-ae8c5b6cead2	GOAL_FOR	2	32	1920000	2026-10-06 19:17:00+00	2026-10-06 19:17:00+00	{"scorerId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	12
499bb62e-656b-45a0-80e2-358a196833e8	0c4182d6-c39b-4e87-adf4-d346bc152251	5472c07a-45aa-4788-855b-9b66001d9200	GOAL_AGAINST	2	36	2160000	2026-10-06 19:21:00+00	2026-10-06 19:21:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	13
a3facee3-bc7c-4cf9-8af5-7fcfa8551aa1	0c4182d6-c39b-4e87-adf4-d346bc152251	e6e9cdff-bc5e-46c1-8318-8d9b257b1fd9	LINEUP_APPLIED	2	37	2220000	2026-10-06 19:22:00+00	2026-10-06 19:22:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	14
b9872f6d-8550-49eb-8aee-aa49cae8ead3	0c4182d6-c39b-4e87-adf4-d346bc152251	613d0839-d4dc-43f3-87e8-6825fca12acb	LINEUP_APPLIED	2	39	2340000	2026-10-06 19:24:00+00	2026-10-06 19:24:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	15
68916db3-8aae-4fd1-8c28-9b7f3dadccc9	0c4182d6-c39b-4e87-adf4-d346bc152251	2973250f-b90c-4c69-8146-db1b28ca1e31	LINEUP_APPLIED	2	45	2700000	2026-10-06 19:30:00+00	2026-10-06 19:30:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	16
5f39610c-54a0-4c2a-8362-03987a1683f2	0c4182d6-c39b-4e87-adf4-d346bc152251	1cf9c0c8-1358-4c92-867b-9b2419702d0a	GOAL_AGAINST	2	46	2760000	2026-10-06 19:31:00+00	2026-10-06 19:31:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	17
6406acca-7557-4d60-86a9-58567f0d49e8	0c4182d6-c39b-4e87-adf4-d346bc152251	bfdda106-fc97-4308-8181-e5e2dbf694c0	LINEUP_APPLIED	2	47	2820000	2026-10-06 19:32:00+00	2026-10-06 19:32:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "726d57ef-d01c-4fca-8f66-9eb0095a34bd"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	18
3f6e2764-8467-4d2a-8841-48e8a312f342	0c4182d6-c39b-4e87-adf4-d346bc152251	fdc3cd78-2efd-4c62-873d-6dec445b0b0a	LINEUP_APPLIED	2	50	3000000	2026-10-06 19:35:00+00	2026-10-06 19:35:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	19
e3cafbbc-e9b8-4c86-84a6-d97815175e9e	0c4182d6-c39b-4e87-adf4-d346bc152251	b8a6aa28-1b6b-4cbe-8547-8424787dce66	LINEUP_APPLIED	2	55	3300000	2026-10-06 19:40:00+00	2026-10-06 19:40:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	20
4d737e78-0d29-4fa6-84a2-02e43e4a742e	0c4182d6-c39b-4e87-adf4-d346bc152251	4cc91894-7fa5-4ace-8c4f-da90a8491706	GOAL_AGAINST	2	56	3360000	2026-10-06 19:41:00+00	2026-10-06 19:41:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	21
ca23c97a-abcd-4674-8b51-7ef65d47ef6c	0c4182d6-c39b-4e87-adf4-d346bc152251	c8cbb566-eac6-4f0c-8f94-6f82f0c47ad4	LINEUP_APPLIED	2	57	3420000	2026-10-06 19:42:00+00	2026-10-06 19:42:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "a97effda-648c-4735-91f4-767e9641f3e9"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	22
63ada12c-0c47-4e82-87c0-44b8ed7e6e3a	0c4182d6-c39b-4e87-adf4-d346bc152251	94b824a8-9cc9-4cda-8d9b-041459dbe3e2	GOAL_FOR	2	58	3480000	2026-10-06 19:43:00+00	2026-10-06 19:43:00+00	{"assistId": "f67d27d7-0345-4436-a5ae-a43f4f7cf612", "scorerId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	23
f186f4bd-b3fa-44cb-8170-6841fea04633	0c4182d6-c39b-4e87-adf4-d346bc152251	de7f4631-35c2-4953-80dd-b0b549063b2b	LINEUP_APPLIED	2	59	3540000	2026-10-06 19:44:00+00	2026-10-06 19:44:00+00	{"slots": [{"slotId": "ea23dfe2-54f6-43e5-83a8-ca0c34e55638", "memberId": "b3cff9d4-9c2d-415e-a26f-a7793eb0abe7"}, {"slotId": "db0d71cf-20c5-4e1a-8a49-14b1b3381280", "memberId": "7c0a4679-7438-487b-b85b-c9f666d00909"}, {"slotId": "d91705ca-7cec-4a3f-bff0-f559f581c798", "memberId": "d89d84c0-2ec2-44d0-af35-3c35a3d7a97c"}, {"slotId": "e5b21765-1b94-4dd4-a863-8b5aa0119889", "memberId": "c872f128-4a5f-43f6-9ba5-371cdfa64eaa"}, {"slotId": "feb09ad4-8a75-4924-84fc-9610a87e8b3b", "memberId": "eaa9f768-0e33-4ea4-8332-13e95f59ed6b"}, {"slotId": "a19b04bb-3eee-44ce-9a14-098f074631a6", "memberId": "c286c651-08b4-464e-b05e-5e5cafce5d3c"}, {"slotId": "be6498e1-cd0e-4b1c-a4a5-3463c284dd27", "memberId": "da022cee-9943-4052-8b3a-cf6991dd646e"}]}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	24
6f69cd2d-d90f-44ef-8e10-437165544067	0c4182d6-c39b-4e87-adf4-d346bc152251	7ed7cba1-7ea7-4b07-8798-ef55dd9216cf	PERIOD_END	2	60	3600000	2026-10-06 19:45:00+00	2026-10-06 19:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	25
d2df5cee-82e6-4484-8a8b-507286af4a3c	0c4182d6-c39b-4e87-adf4-d346bc152251	b85fe962-fb66-469c-8e50-7516bc896724	FINAL_WHISTLE	2	60	3600000	2026-10-06 19:45:00+00	2026-10-06 19:45:00+00	{}	f47e960e-2d18-42dd-b32f-2a085d4c1399	\N	26
\.

COPY public.match_player_positions (match_id, team_member_id, position_code, minutes, goals_for, goals_against) FROM stdin;
b777ba19-29b0-493e-925a-38bd14ca96e6	1787c0df-f303-454a-a3a0-27d1b2ab4319	DC	41	2	7
b777ba19-29b0-493e-925a-38bd14ca96e6	1787c0df-f303-454a-a3a0-27d1b2ab4319	MC	9	0	2
b777ba19-29b0-493e-925a-38bd14ca96e6	7c0a4679-7438-487b-b85b-c9f666d00909	MC	22	2	6
b777ba19-29b0-493e-925a-38bd14ca96e6	7c0a4679-7438-487b-b85b-c9f666d00909	DC	18	0	3
b777ba19-29b0-493e-925a-38bd14ca96e6	7c0a4679-7438-487b-b85b-c9f666d00909	GB	10	0	0
b777ba19-29b0-493e-925a-38bd14ca96e6	b68f58bc-6856-4d38-bd71-3b6d39c08ff5	DC	30	1	7
b777ba19-29b0-493e-925a-38bd14ca96e6	b68f58bc-6856-4d38-bd71-3b6d39c08ff5	GB	20	2	2
b777ba19-29b0-493e-925a-38bd14ca96e6	da022cee-9943-4052-8b3a-cf6991dd646e	AT	27	2	6
b777ba19-29b0-493e-925a-38bd14ca96e6	da022cee-9943-4052-8b3a-cf6991dd646e	GB	19	1	2
b777ba19-29b0-493e-925a-38bd14ca96e6	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	AIL	33	3	3
b777ba19-29b0-493e-925a-38bd14ca96e6	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	MC	10	0	0
b777ba19-29b0-493e-925a-38bd14ca96e6	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	DC	31	3	1
b777ba19-29b0-493e-925a-38bd14ca96e6	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	GB	11	0	5
b777ba19-29b0-493e-925a-38bd14ca96e6	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AIL	14	1	2
b777ba19-29b0-493e-925a-38bd14ca96e6	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AT	10	0	0
b777ba19-29b0-493e-925a-38bd14ca96e6	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	MC	9	0	1
b777ba19-29b0-493e-925a-38bd14ca96e6	f67d27d7-0345-4436-a5ae-a43f4f7cf612	AIL	22	2	4
b777ba19-29b0-493e-925a-38bd14ca96e6	f67d27d7-0345-4436-a5ae-a43f4f7cf612	MC	10	1	0
b777ba19-29b0-493e-925a-38bd14ca96e6	a97effda-648c-4735-91f4-767e9641f3e9	AT	23	1	3
b777ba19-29b0-493e-925a-38bd14ca96e6	a97effda-648c-4735-91f4-767e9641f3e9	AIL	8	0	4
b777ba19-29b0-493e-925a-38bd14ca96e6	726d57ef-d01c-4fca-8f66-9eb0095a34bd	AIL	28	0	3
b777ba19-29b0-493e-925a-38bd14ca96e6	b7331f64-9329-44a8-8731-510f152a9090	AIL	15	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	GB	30	2	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	DC	12	1	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	MC	10	0	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	da022cee-9943-4052-8b3a-cf6991dd646e	GB	30	1	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	da022cee-9943-4052-8b3a-cf6991dd646e	AT	19	2	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	DC	44	1	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	MC	34	2	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	AIL	10	0	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AT	35	1	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AIL	8	1	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	AIL	35	2	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	AT	6	0	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	328d9c7a-db3d-4f4f-8834-60614d1a1754	AIL	31	1	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	328d9c7a-db3d-4f4f-8834-60614d1a1754	MC	8	1	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	1787c0df-f303-454a-a3a0-27d1b2ab4319	DC	29	2	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	1787c0df-f303-454a-a3a0-27d1b2ab4319	MC	8	0	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	726d57ef-d01c-4fca-8f66-9eb0095a34bd	AIL	36	2	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c286c651-08b4-464e-b05e-5e5cafce5d3c	DC	35	2	2
0c4182d6-c39b-4e87-adf4-d346bc152251	da022cee-9943-4052-8b3a-cf6991dd646e	GB	60	2	5
0c4182d6-c39b-4e87-adf4-d346bc152251	c286c651-08b4-464e-b05e-5e5cafce5d3c	DC	51	2	4
0c4182d6-c39b-4e87-adf4-d346bc152251	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	AIL	42	2	3
0c4182d6-c39b-4e87-adf4-d346bc152251	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	MC	2	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	MC	39	1	2
0c4182d6-c39b-4e87-adf4-d346bc152251	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	DC	4	1	1
0c4182d6-c39b-4e87-adf4-d346bc152251	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AT	41	1	4
0c4182d6-c39b-4e87-adf4-d346bc152251	7c0a4679-7438-487b-b85b-c9f666d00909	AIL	17	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	7c0a4679-7438-487b-b85b-c9f666d00909	DC	12	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	7c0a4679-7438-487b-b85b-c9f666d00909	MC	10	1	1
0c4182d6-c39b-4e87-adf4-d346bc152251	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	DC	23	1	2
0c4182d6-c39b-4e87-adf4-d346bc152251	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	MC	9	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	f67d27d7-0345-4436-a5ae-a43f4f7cf612	AT	19	1	1
0c4182d6-c39b-4e87-adf4-d346bc152251	f67d27d7-0345-4436-a5ae-a43f4f7cf612	AIL	12	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	DC	30	0	2
0c4182d6-c39b-4e87-adf4-d346bc152251	a97effda-648c-4735-91f4-767e9641f3e9	AIL	25	2	3
0c4182d6-c39b-4e87-adf4-d346bc152251	726d57ef-d01c-4fca-8f66-9eb0095a34bd	AIL	24	0	2
\.

COPY public.match_player_stats (match_id, team_member_id, minutes, goals, assists, own_goals, penalties_scored, penalties_missed, fouls, gk_minutes, clean_minutes, conceded_while_on, squad_role, computed_at, gk_clean_minutes, conceded_while_gk, goals_for_while_on) FROM stdin;
b777ba19-29b0-493e-925a-38bd14ca96e6	1787c0df-f303-454a-a3a0-27d1b2ab4319	50	0	0	0	0	0	0	0	17	9	starter	2026-10-12 13:22:34.04+00	0	0	2
b777ba19-29b0-493e-925a-38bd14ca96e6	7c0a4679-7438-487b-b85b-c9f666d00909	50	0	0	0	0	0	0	10	17	9	starter	2026-10-12 13:22:34.04+00	10	0	2
b777ba19-29b0-493e-925a-38bd14ca96e6	b68f58bc-6856-4d38-bd71-3b6d39c08ff5	50	0	0	0	0	0	0	20	7	9	starter	2026-10-12 13:22:34.04+00	13	2	3
b777ba19-29b0-493e-925a-38bd14ca96e6	da022cee-9943-4052-8b3a-cf6991dd646e	46	1	0	0	0	0	0	19	7	8	starter	2026-10-12 13:22:34.04+00	3	2	3
b777ba19-29b0-493e-925a-38bd14ca96e6	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	43	1	2	0	0	0	0	0	26	3	starter	2026-10-12 13:22:34.04+00	0	0	3
b777ba19-29b0-493e-925a-38bd14ca96e6	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	42	0	0	0	0	0	0	11	27	6	starter	2026-10-12 13:22:34.04+00	3	5	3
b777ba19-29b0-493e-925a-38bd14ca96e6	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	33	0	0	0	0	0	0	0	21	3	substitute	2026-10-12 13:22:34.04+00	0	0	1
b777ba19-29b0-493e-925a-38bd14ca96e6	f67d27d7-0345-4436-a5ae-a43f4f7cf612	32	0	0	0	0	0	0	0	21	4	starter	2026-10-12 13:22:34.04+00	0	0	3
b777ba19-29b0-493e-925a-38bd14ca96e6	a97effda-648c-4735-91f4-767e9641f3e9	31	1	0	0	0	0	0	0	10	7	substitute	2026-10-12 13:22:34.04+00	0	0	1
b777ba19-29b0-493e-925a-38bd14ca96e6	726d57ef-d01c-4fca-8f66-9eb0095a34bd	28	0	0	0	0	0	0	0	22	3	substitute	2026-10-12 13:22:34.04+00	0	0	0
b777ba19-29b0-493e-925a-38bd14ca96e6	b7331f64-9329-44a8-8731-510f152a9090	15	0	0	0	0	0	0	0	9	2	substitute	2026-10-12 13:22:34.04+00	0	0	0
b777ba19-29b0-493e-925a-38bd14ca96e6	2d9ff4bb-7bd1-4749-b580-79b04b1f95db	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-12 13:22:34.04+00	0	0	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	52	0	0	0	0	0	0	30	28	1	starter	2026-10-12 13:22:36.626+00	16	1	3
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	da022cee-9943-4052-8b3a-cf6991dd646e	49	1	0	0	0	0	0	30	31	1	starter	2026-10-12 13:22:36.626+00	12	1	3
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	44	0	0	0	0	0	0	0	28	2	starter	2026-10-12 13:22:36.626+00	0	0	1
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	44	0	0	0	0	0	0	0	38	1	starter	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	43	0	0	0	0	0	0	0	11	2	substitute	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	41	0	0	0	0	0	0	0	39	1	starter	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	328d9c7a-db3d-4f4f-8834-60614d1a1754	39	0	0	0	0	0	0	0	7	2	substitute	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	1787c0df-f303-454a-a3a0-27d1b2ab4319	37	1	1	0	0	0	0	0	31	1	starter	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	726d57ef-d01c-4fca-8f66-9eb0095a34bd	36	0	0	0	0	0	0	0	24	1	starter	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c286c651-08b4-464e-b05e-5e5cafce5d3c	35	1	0	0	0	0	0	0	15	2	substitute	2026-10-12 13:22:36.626+00	0	0	2
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	2d9ff4bb-7bd1-4749-b580-79b04b1f95db	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-12 13:22:36.626+00	0	0	0
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	f67d27d7-0345-4436-a5ae-a43f4f7cf612	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-12 13:22:36.626+00	0	0	0
0c4182d6-c39b-4e87-adf4-d346bc152251	da022cee-9943-4052-8b3a-cf6991dd646e	60	0	0	0	0	0	0	60	14	5	starter	2026-10-12 13:22:39.174+00	14	5	2
0c4182d6-c39b-4e87-adf4-d346bc152251	c286c651-08b4-464e-b05e-5e5cafce5d3c	51	0	0	0	0	0	0	0	20	4	starter	2026-10-12 13:22:39.174+00	0	0	2
0c4182d6-c39b-4e87-adf4-d346bc152251	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	44	2	0	0	0	0	0	0	21	4	starter	2026-10-12 13:22:39.174+00	0	0	2
0c4182d6-c39b-4e87-adf4-d346bc152251	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	43	0	0	0	0	0	0	0	29	3	starter	2026-10-12 13:22:39.174+00	0	0	2
0c4182d6-c39b-4e87-adf4-d346bc152251	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	41	0	0	0	0	0	0	0	22	4	starter	2026-10-12 13:22:39.174+00	0	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	7c0a4679-7438-487b-b85b-c9f666d00909	39	0	0	0	0	0	0	0	14	3	substitute	2026-10-12 13:22:39.174+00	0	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	32	0	0	0	0	0	0	0	16	3	substitute	2026-10-12 13:22:39.174+00	0	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	f67d27d7-0345-4436-a5ae-a43f4f7cf612	31	0	1	0	0	0	0	0	27	2	starter	2026-10-12 13:22:39.174+00	0	0	1
0c4182d6-c39b-4e87-adf4-d346bc152251	13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	30	0	0	0	0	0	0	0	14	2	starter	2026-10-12 13:22:39.174+00	0	0	0
0c4182d6-c39b-4e87-adf4-d346bc152251	a97effda-648c-4735-91f4-767e9641f3e9	25	0	0	0	0	0	0	0	16	3	substitute	2026-10-12 13:22:39.174+00	0	0	2
0c4182d6-c39b-4e87-adf4-d346bc152251	726d57ef-d01c-4fca-8f66-9eb0095a34bd	24	0	0	0	0	0	0	0	19	2	substitute	2026-10-12 13:22:39.174+00	0	0	0
0c4182d6-c39b-4e87-adf4-d346bc152251	1787c0df-f303-454a-a3a0-27d1b2ab4319	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-12 13:22:39.174+00	0	0	0
0c4182d6-c39b-4e87-adf4-d346bc152251	2d9ff4bb-7bd1-4749-b580-79b04b1f95db	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-12 13:22:39.174+00	0	0	0
\.

COPY public.match_squad (match_id, team_member_id, role, created_at) FROM stdin;
0c4182d6-c39b-4e87-adf4-d346bc152251	2d9ff4bb-7bd1-4749-b580-79b04b1f95db	supporter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	1787c0df-f303-454a-a3a0-27d1b2ab4319	supporter	2026-10-06 08:51:34.003606+00
b777ba19-29b0-493e-925a-38bd14ca96e6	2d9ff4bb-7bd1-4749-b580-79b04b1f95db	supporter	2026-10-06 15:55:13.197203+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	f67d27d7-0345-4436-a5ae-a43f4f7cf612	supporter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	2d9ff4bb-7bd1-4749-b580-79b04b1f95db	supporter	2026-10-06 15:55:14.331093+00
0c4182d6-c39b-4e87-adf4-d346bc152251	a97effda-648c-4735-91f4-767e9641f3e9	substitute	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	substitute	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	7c0a4679-7438-487b-b85b-c9f666d00909	substitute	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	726d57ef-d01c-4fca-8f66-9eb0095a34bd	substitute	2026-10-06 08:51:23.830756+00
b777ba19-29b0-493e-925a-38bd14ca96e6	da022cee-9943-4052-8b3a-cf6991dd646e	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	f67d27d7-0345-4436-a5ae-a43f4f7cf612	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	7c0a4679-7438-487b-b85b-c9f666d00909	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	1787c0df-f303-454a-a3a0-27d1b2ab4319	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	b68f58bc-6856-4d38-bd71-3b6d39c08ff5	starter	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	a97effda-648c-4735-91f4-767e9641f3e9	substitute	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	b7331f64-9329-44a8-8731-510f152a9090	substitute	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	726d57ef-d01c-4fca-8f66-9eb0095a34bd	substitute	2026-10-06 15:55:13.197203+00
b777ba19-29b0-493e-925a-38bd14ca96e6	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	substitute	2026-10-06 15:55:13.197203+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	da022cee-9943-4052-8b3a-cf6991dd646e	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	726d57ef-d01c-4fca-8f66-9eb0095a34bd	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	1787c0df-f303-454a-a3a0-27d1b2ab4319	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	eaa9f768-0e33-4ea4-8332-13e95f59ed6b	starter	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	substitute	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	328d9c7a-db3d-4f4f-8834-60614d1a1754	substitute	2026-10-06 15:55:14.331093+00
d4e8103e-6c71-46f9-8a7a-fdd7672d7e9a	c286c651-08b4-464e-b05e-5e5cafce5d3c	substitute	2026-10-06 15:55:14.331093+00
0c4182d6-c39b-4e87-adf4-d346bc152251	b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	starter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	f67d27d7-0345-4436-a5ae-a43f4f7cf612	starter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	starter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	c872f128-4a5f-43f6-9ba5-371cdfa64eaa	starter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	starter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	c286c651-08b4-464e-b05e-5e5cafce5d3c	starter	2026-10-06 08:51:23.830756+00
0c4182d6-c39b-4e87-adf4-d346bc152251	da022cee-9943-4052-8b3a-cf6991dd646e	starter	2026-10-06 08:51:23.830756+00
\.

COPY public.player_positions (team_member_id, position_code, preference) FROM stdin;
da022cee-9943-4052-8b3a-cf6991dd646e	GB	primary
da022cee-9943-4052-8b3a-cf6991dd646e	AT	secondary
c872f128-4a5f-43f6-9ba5-371cdfa64eaa	AIL	primary
eaa9f768-0e33-4ea4-8332-13e95f59ed6b	DC	primary
eaa9f768-0e33-4ea4-8332-13e95f59ed6b	GB	secondary
eaa9f768-0e33-4ea4-8332-13e95f59ed6b	MC	secondary
b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AT	primary
b3cff9d4-9c2d-415e-a26f-a7793eb0abe7	AIL	secondary
7c0a4679-7438-487b-b85b-c9f666d00909	MC	primary
7c0a4679-7438-487b-b85b-c9f666d00909	DC	secondary
7c0a4679-7438-487b-b85b-c9f666d00909	AIL	secondary
7c0a4679-7438-487b-b85b-c9f666d00909	GB	secondary
726d57ef-d01c-4fca-8f66-9eb0095a34bd	AIL	primary
d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	MC	primary
d89d84c0-2ec2-44d0-af35-3c35a3d7a97c	AIL	secondary
1787c0df-f303-454a-a3a0-27d1b2ab4319	DC	primary
1787c0df-f303-454a-a3a0-27d1b2ab4319	MC	secondary
c286c651-08b4-464e-b05e-5e5cafce5d3c	DC	primary
13e1abb4-1317-4ec0-90ce-366b9b0fa0ed	DC	primary
f67d27d7-0345-4436-a5ae-a43f4f7cf612	AIL	primary
f67d27d7-0345-4436-a5ae-a43f4f7cf612	AT	secondary
f67d27d7-0345-4436-a5ae-a43f4f7cf612	MC	secondary
a97effda-648c-4735-91f4-767e9641f3e9	AIL	primary
a97effda-648c-4735-91f4-767e9641f3e9	AT	secondary
b68f58bc-6856-4d38-bd71-3b6d39c08ff5	DC	primary
b68f58bc-6856-4d38-bd71-3b6d39c08ff5	GB	secondary
328d9c7a-db3d-4f4f-8834-60614d1a1754	AIL	primary
328d9c7a-db3d-4f4f-8834-60614d1a1754	MC	secondary
b7331f64-9329-44a8-8731-510f152a9090	AIL	primary
\.

\unrestrict NSNd0RSChCij74reCeTHLrU1GcYUYaI2PBYmLATloAwta9exur2xeeYweXWYtlH


-- Bayern Barbecue Club was left `live` in production, with no final whistle and no goals; the paper
-- is the only record of it, and the rebuilt log finishes it.
update matches set status = 'finished'
 where id in ('b777ba19-29b0-493e-925a-38bd14ca96e6',
              'd4e8103e-6c71-46f9-8a7a-fdd7672d7e9a',
              '0c4182d6-c39b-4e87-adf4-d346bc152251');

-- Re-point each applied composition at the `LINEUP_APPLIED` that applied it, as it was on preview.
update lineups set applied_event_id = '29fceb32-12c5-4c40-8f98-ba3e96dbad38' where id = 'fcce13f8-5fd6-4f6d-ae9a-56660f990dee';
update lineups set applied_event_id = 'e047a266-e3f5-4664-82c5-5e02b40e938c' where id = 'b13d59f3-df2c-4b99-8221-9eb75dfb4001';
update lineups set applied_event_id = 'd419c0a8-0ade-46ca-8551-3d5cc547cc22' where id = 'b0aab77b-8974-4a65-8ad7-cedfcf0283cd';

commit;
