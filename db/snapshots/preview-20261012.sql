--
-- Preview database, 2026-10-12, taken just before production's data was restored over it.
--
-- WHY IT IS HERE. The owner asked for the preview database to be dumped and kept in git before
-- preview was overwritten with a copy of production, so the demo season it held is not lost. The
-- repository is public, so this file is **redacted** (see below) rather than the dump as taken.
--
-- WHAT IT HOLDS. The demo season « AS Dimanche » as the preview carried it: 16 users, 246 match
-- events, 118 ratings, 22 tables, at migration 0014. Dumped from PostgreSQL 18.6 (Neon).
--
-- WHAT WAS REDACTED, and nothing else:
--   * every `users.password_hash` is the literal `REDACTED-NOT-A-HASH`, not an argon2id hash. The
--     super admin's hash was among them, which is the reason;
--   * `public.sessions` is empty. Its 272 rows were live bearer tokens — a session cookie in this
--     app *is* the `sessions.id` — and publishing them on a public repository would have handed
--     anyone a logged-in preview session until the restore voided them.
-- Both are stated so a reader does not mistake this for a dump that can be restored into a working
-- login. Restore it and nobody can sign in until a password is set.
--
-- HOW TO RESTORE IT (local only — never against production):
--   createdb football_preview_snapshot
--   psql "postgresql://…/football_preview_snapshot" -f db/snapshots/preview-20261012.sql
-- The unredacted dump stays on the owner's machine in `audit/db-swap-20261012/`, which is
-- gitignored.
--

--
-- PostgreSQL database dump
--

\restrict Td2XhaaAA5dlaaLoQWIWnoNTB2vxUNTWHePFyadpNKO3uexrL9zT8tg6r5EQ3rg

-- Dumped from database version 18.6 (c021049)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: neondb_owner
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO neondb_owner;

--
-- Name: neon_auth; Type: SCHEMA; Schema: -; Owner: neon_auth
--

CREATE SCHEMA neon_auth;


ALTER SCHEMA neon_auth OWNER TO neon_auth;

--
-- Name: entry_mode; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.entry_mode AS ENUM (
    'live',
    'retro'
);


ALTER TYPE public.entry_mode OWNER TO neondb_owner;

--
-- Name: match_event_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.match_event_type AS ENUM (
    'KICKOFF',
    'PERIOD_END',
    'PAUSE',
    'RESUME',
    'GOAL_FOR',
    'GOAL_AGAINST',
    'OWN_GOAL',
    'PENALTY_SCORED',
    'PENALTY_MISSED',
    'SUBSTITUTION',
    'POSITION_CHANGE',
    'LINEUP_APPLIED',
    'FOUL',
    'INJURY',
    'COMMENT',
    'REMARK',
    'FINAL_WHISTLE',
    'VOID'
);


ALTER TYPE public.match_event_type OWNER TO neondb_owner;

--
-- Name: match_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.match_status AS ENUM (
    'scheduled',
    'live',
    'finished'
);


ALTER TYPE public.match_status OWNER TO neondb_owner;

--
-- Name: position_line; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.position_line AS ENUM (
    'GB',
    'DEF',
    'MIL',
    'ATT'
);


ALTER TYPE public.position_line OWNER TO neondb_owner;

--
-- Name: position_preference; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.position_preference AS ENUM (
    'primary',
    'secondary'
);


ALTER TYPE public.position_preference OWNER TO neondb_owner;

--
-- Name: squad_role; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.squad_role AS ENUM (
    'starter',
    'substitute',
    'supporter'
);


ALTER TYPE public.squad_role OWNER TO neondb_owner;

--
-- Name: team_role; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.team_role AS ENUM (
    'coach',
    'player'
);


ALTER TYPE public.team_role OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: neondb_owner
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO neondb_owner;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: neondb_owner
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO neondb_owner;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: neondb_owner
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: account; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" uuid NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE neon_auth.account OWNER TO neon_auth;

--
-- Name: invitation; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.invitation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    email text NOT NULL,
    role text,
    status text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "inviterId" uuid NOT NULL
);


ALTER TABLE neon_auth.invitation OWNER TO neon_auth;

--
-- Name: jwks; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.jwks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "expiresAt" timestamp with time zone
);


ALTER TABLE neon_auth.jwks OWNER TO neon_auth;

--
-- Name: member; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);


ALTER TABLE neon_auth.member OWNER TO neon_auth;

--
-- Name: organization; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    "createdAt" timestamp with time zone NOT NULL,
    metadata text
);


ALTER TABLE neon_auth.organization OWNER TO neon_auth;

--
-- Name: project_config; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.project_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    endpoint_id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    trusted_origins jsonb NOT NULL,
    social_providers jsonb NOT NULL,
    email_provider jsonb,
    email_and_password jsonb,
    allow_localhost boolean NOT NULL,
    plugin_configs jsonb,
    webhook_config jsonb
);


ALTER TABLE neon_auth.project_config OWNER TO neon_auth;

--
-- Name: session; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" uuid NOT NULL,
    "impersonatedBy" text,
    "activeOrganizationId" text
);


ALTER TABLE neon_auth.session OWNER TO neon_auth;

--
-- Name: user; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth."user" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean,
    "banReason" text,
    "banExpires" timestamp with time zone
);


ALTER TABLE neon_auth."user" OWNER TO neon_auth;

--
-- Name: verification; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.verification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE neon_auth.verification OWNER TO neon_auth;

--
-- Name: competitions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.competitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    label_fr text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.competitions OWNER TO neondb_owner;

--
-- Name: formation_slots; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.formation_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formation_id uuid NOT NULL,
    position_code text NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    sort integer NOT NULL
);


ALTER TABLE public.formation_slots OWNER TO neondb_owner;

--
-- Name: formations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.formations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid,
    name text NOT NULL,
    label text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.formations OWNER TO neondb_owner;

--
-- Name: injuries; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.injuries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    started_on date NOT NULL,
    expected_return_on date,
    note text,
    declared_by uuid,
    resolved_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.injuries OWNER TO neondb_owner;

--
-- Name: invites; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    code text NOT NULL,
    role public.team_role DEFAULT 'player'::public.team_role NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    uses integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.invites OWNER TO neondb_owner;

--
-- Name: lineup_slots; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.lineup_slots (
    lineup_id uuid NOT NULL,
    formation_slot_id uuid NOT NULL,
    team_member_id uuid NOT NULL
);


ALTER TABLE public.lineup_slots OWNER TO neondb_owner;

--
-- Name: lineups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.lineups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    formation_id uuid NOT NULL,
    from_minute integer DEFAULT 0 NOT NULL,
    is_initial boolean DEFAULT false NOT NULL,
    applied_event_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lineups OWNER TO neondb_owner;

--
-- Name: match_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.match_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    client_event_id uuid NOT NULL,
    type public.match_event_type NOT NULL,
    period smallint NOT NULL,
    minute integer NOT NULL,
    clock_ms integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    voids_event_id uuid,
    seq integer NOT NULL
);


ALTER TABLE public.match_events OWNER TO neondb_owner;

--
-- Name: match_player_positions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.match_player_positions (
    match_id uuid NOT NULL,
    team_member_id uuid NOT NULL,
    position_code text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL,
    goals_for integer DEFAULT 0 NOT NULL,
    goals_against integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.match_player_positions OWNER TO neondb_owner;

--
-- Name: match_player_stats; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.match_player_stats (
    match_id uuid NOT NULL,
    team_member_id uuid NOT NULL,
    minutes integer DEFAULT 0 NOT NULL,
    goals integer DEFAULT 0 NOT NULL,
    assists integer DEFAULT 0 NOT NULL,
    own_goals integer DEFAULT 0 NOT NULL,
    penalties_scored integer DEFAULT 0 NOT NULL,
    penalties_missed integer DEFAULT 0 NOT NULL,
    fouls integer DEFAULT 0 NOT NULL,
    gk_minutes integer DEFAULT 0 NOT NULL,
    clean_minutes integer DEFAULT 0 NOT NULL,
    conceded_while_on integer DEFAULT 0 NOT NULL,
    squad_role public.squad_role,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    gk_clean_minutes integer DEFAULT 0 NOT NULL,
    conceded_while_gk integer DEFAULT 0 NOT NULL,
    goals_for_while_on integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.match_player_stats OWNER TO neondb_owner;

--
-- Name: match_squad; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.match_squad (
    match_id uuid NOT NULL,
    team_member_id uuid NOT NULL,
    role public.squad_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.match_squad OWNER TO neondb_owner;

--
-- Name: matches; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    kickoff_at timestamp with time zone NOT NULL,
    opponent_name text NOT NULL,
    is_home boolean DEFAULT true NOT NULL,
    venue text,
    periods_count smallint DEFAULT 2 NOT NULL,
    period_minutes smallint DEFAULT 30 NOT NULL,
    status public.match_status DEFAULT 'scheduled'::public.match_status NOT NULL,
    operator_user_id uuid,
    entry_mode public.entry_mode DEFAULT 'live'::public.entry_mode NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    competition_id uuid NOT NULL,
    ratings_published_at timestamp with time zone,
    CONSTRAINT matches_periods_positive CHECK (((periods_count > 0) AND (period_minutes > 0)))
);


ALTER TABLE public.matches OWNER TO neondb_owner;

--
-- Name: player_positions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.player_positions (
    team_member_id uuid NOT NULL,
    position_code text NOT NULL,
    preference public.position_preference DEFAULT 'secondary'::public.position_preference NOT NULL
);


ALTER TABLE public.player_positions OWNER TO neondb_owner;

--
-- Name: positions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.positions (
    code text NOT NULL,
    label_fr text NOT NULL,
    line public.position_line NOT NULL,
    default_x integer NOT NULL,
    default_y integer NOT NULL,
    sort integer NOT NULL
);


ALTER TABLE public.positions OWNER TO neondb_owner;

--
-- Name: ratings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    rater_member_id uuid NOT NULL,
    rated_member_id uuid NOT NULL,
    score numeric(3,1) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ratings_no_self CHECK ((rater_member_id <> rated_member_id)),
    CONSTRAINT ratings_score_one_decimal CHECK (((score * (10)::numeric) = floor((score * (10)::numeric)))),
    CONSTRAINT ratings_score_range CHECK (((score >= (0)::numeric) AND (score <= (10)::numeric)))
);


ALTER TABLE public.ratings OWNER TO neondb_owner;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sessions OWNER TO neondb_owner;

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.team_role DEFAULT 'player'::public.team_role NOT NULL,
    is_player boolean DEFAULT true NOT NULL,
    jersey_number smallint,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    shirt_name text,
    CONSTRAINT team_members_jersey_range CHECK (((jersey_number IS NULL) OR ((jersey_number >= 1) AND (jersey_number <= 99)))),
    CONSTRAINT team_members_shirt_name_length CHECK (((shirt_name IS NULL) OR (char_length(shirt_name) >= 1)))
);


ALTER TABLE public.team_members OWNER TO neondb_owner;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    crest_url text,
    primary_color text DEFAULT '#1f6feb'::text NOT NULL,
    secondary_color text DEFAULT '#ffffff'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.teams OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: neondb_owner
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: neondb_owner
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	2f0cb6a0ca2ad7008050ce9b772cf17507f0e2d7d377924562b9c3a37408ed5c	1790116589721
2	c55aaa98491bfea95f16bf8b85f1c8b0cc1868d26617307618138abc6285e205	1790120451936
3	8a244cf7a511e656492d9228a4e78b74b329a3a6c44a37feeb1fb6638ddfd784	1790167155861
4	f180da2fdea9b21fb1329a996267756cf1918233b658b763b0361d5ffc9bc8dc	1790168895555
5	70b88987f34273e483db4dd549276dfa18c9baf7e899a1fdc53e98ff616b852b	1790756446557
6	0b194cee3ce01cbdf5c68e34892d57b13b655e38551eb56acafa7fc6894a4d8e	1790841204336
7	f9c8eb52168a4ae55ae8c27e18459737942288599e72267271cbe4656dbdec48	1790848410589
8	dfee750ad4f6844e0c3f4f8e43c55e2b870aea61bcbcf3211b8840e0dc222354	1790939693711
9	5e86b249403b6c1e1a8b302fccd1aad1973fd99f409a64625a07e450f806458d	1791277649980
10	58a729681cbff493a12266640a41b108c51458f161730033375b5162210fda1d	1791277999001
11	7b8d0f1c06895ec26e813eca28b148221c159f3efd3f01c1b849eff8dc330065	1791298679955
12	ad56083af74854a292930a2e65da2589c04cb66c3b94c6b31517c4510a2f0778	1791557380123
13	e15d61d681ba71497f726dff8cdf6844f1ff4ccf7e146e7509334d45f416948d	1791559319900
14	98e092642b48b6dbfafbab9aaf2c16c31ddb1e0638ea81b8309de6208143ea50	1791559842172
15	0ccfc6e31339a048c7a90b69b7f65302cdfb39ff1db28e88d8be5776376802c1	1791560919948
\.


--
-- Data for Name: account; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, password, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: invitation; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.invitation (id, "organizationId", email, role, status, "expiresAt", "createdAt", "inviterId") FROM stdin;
\.


--
-- Data for Name: jwks; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.jwks (id, "publicKey", "privateKey", "createdAt", "expiresAt") FROM stdin;
\.


--
-- Data for Name: member; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.member (id, "organizationId", "userId", role, "createdAt") FROM stdin;
\.


--
-- Data for Name: organization; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.organization (id, name, slug, logo, "createdAt", metadata) FROM stdin;
\.


--
-- Data for Name: project_config; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.project_config (id, name, endpoint_id, created_at, updated_at, trusted_origins, social_providers, email_provider, email_and_password, allow_localhost, plugin_configs, webhook_config) FROM stdin;
9322347b-88e2-4c54-b3b3-8036994fac29	football-manager	ep-gentle-cherry-zar3v5jz	2026-09-30 16:04:42.348+00	2026-09-30 16:04:42.348+00	[]	[{"id": "google", "isShared": true}]	{"type": "shared"}	{"enabled": true, "disableSignUp": false, "emailVerificationMethod": "otp", "requireEmailVerification": false, "autoSignInAfterVerification": true, "sendVerificationEmailOnSignIn": false, "sendVerificationEmailOnSignUp": false}	t	{"magicLink": {"config": {"expiresIn": 5, "disableSignUp": false}, "enabled": false}, "phoneNumber": {"config": {"otp_expires_in": 300}, "enabled": false}, "organization": {"config": {"creatorRole": "owner", "membershipLimit": 100, "organizationLimit": 10, "sendInvitationEmail": false}, "enabled": true}}	{"enabled": false, "enabledEvents": [], "timeoutSeconds": 5}
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId", "impersonatedBy", "activeOrganizationId") FROM stdin;
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned, "banReason", "banExpires") FROM stdin;
\.


--
-- Data for Name: verification; Type: TABLE DATA; Schema: neon_auth; Owner: neon_auth
--

COPY neon_auth.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: competitions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.competitions (id, team_id, label_fr, sort, archived_at, created_at) FROM stdin;
195d0cd7-bbbb-430c-9377-2491c27dfbfb	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	Championnat	0	\N	2026-09-30 16:06:32.937085+00
7dc67626-fda5-4ec8-a0d9-492dde80c9be	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	Coupe	1	\N	2026-09-30 16:06:32.937085+00
2850cf98-dca2-4481-a921-4d00fe555edf	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	Amical	2	\N	2026-09-30 16:06:32.937085+00
036ae4dc-a766-48f3-87d9-f8d43b9c97ed	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	Tournoi	3	\N	2026-09-30 16:06:32.937085+00
\.


--
-- Data for Name: formation_slots; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.formation_slots (id, formation_id, position_code, x, y, sort) FROM stdin;
c680a937-7c3e-4b33-880b-91c52a500f87	23432a61-3d6e-492c-b928-345593890574	GB	500	60	1
875ac75d-6558-40f3-89f0-91507b084269	23432a61-3d6e-492c-b928-345593890574	DG	170	250	2
62909a8b-5815-4988-8737-860f9d8434ad	23432a61-3d6e-492c-b928-345593890574	DC	500	240	3
f79fe536-adc1-4818-8a1f-6089d3a25e82	23432a61-3d6e-492c-b928-345593890574	DD	830	250	4
a9266115-7117-4497-83fa-98a3ae970f52	23432a61-3d6e-492c-b928-345593890574	MC	330	520	5
ef38f604-d443-4766-8c89-d28ccc77843b	23432a61-3d6e-492c-b928-345593890574	MC	670	520	6
54153f62-1512-4e58-bbbf-b40ee821a359	23432a61-3d6e-492c-b928-345593890574	AT	500	830	7
1ce94d4c-fd2e-4ad1-9627-d97c124d5a80	b2135f07-f047-42f0-88ba-3eb56fae7922	GB	500	60	1
2811eff7-1102-41b1-9796-a52785d70fbf	b2135f07-f047-42f0-88ba-3eb56fae7922	DC	330	240	2
801e490f-7bfd-4f5e-bde1-232c6b1aae3d	b2135f07-f047-42f0-88ba-3eb56fae7922	DC	670	240	3
a0964308-978c-4c92-84fe-b41c79fb8c22	b2135f07-f047-42f0-88ba-3eb56fae7922	MC	500	500	5
da7145df-2a89-46b7-bc90-a47410fc1893	b2135f07-f047-42f0-88ba-3eb56fae7922	AT	500	830	7
346db48f-d4f8-4169-ae24-2c2d7a18dd9b	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	GB	500	60	1
c4f0ee04-5b35-4c60-a7c0-0e68e9eaa43f	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	DG	170	250	2
7960e5a2-0c2e-4fce-9e6d-b4ae10b9c25b	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	DC	500	240	3
af5f8c07-8a0c-4710-8ad8-e55f8a5ab44e	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	DD	830	250	4
9497f790-8283-4350-94cc-3c867e03c3a7	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	MC	500	510	5
a97dacac-f9c6-49fa-b5ed-3efb04a8a090	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	AT	330	840	6
05462f57-89e8-4f96-bea2-9ddab23881bf	bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	AT	670	840	7
99949b18-e909-4a8f-a079-5369a1828742	7dcb9a9d-ac4a-4ae8-b955-330027412a45	GB	500	60	1
bcf2524a-281f-4bfc-977b-d8ff09710b0d	7dcb9a9d-ac4a-4ae8-b955-330027412a45	DC	320	240	2
12300079-1c6d-4e4d-b6dc-f6002bb761b4	7dcb9a9d-ac4a-4ae8-b955-330027412a45	DC	680	240	3
d97e17f9-123b-48f6-8c35-e75b38f9ce95	7dcb9a9d-ac4a-4ae8-b955-330027412a45	MG	250	510	4
a8c29f1d-ce22-4749-8d20-4f54bbdc10ae	7dcb9a9d-ac4a-4ae8-b955-330027412a45	MD	750	510	5
60da78b1-0d6f-40e9-9dc7-28e626c84502	7dcb9a9d-ac4a-4ae8-b955-330027412a45	AT	330	840	6
ae3c2015-519f-459d-bf0b-0e5215a6d7d2	7dcb9a9d-ac4a-4ae8-b955-330027412a45	AT	670	840	7
7cd0f3b5-4a23-4683-a553-2ea3d06cb554	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	GB	500	60	1
141a3df8-2759-4df0-b4ed-32e7b7b68ea8	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	DC	500	220	2
4ee63348-2c5a-41cc-9c22-2ab002b90f8e	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	MG	170	480	3
0fa4bff0-8ce0-4e05-8d3e-ee4a164995d5	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	MC	500	470	4
fe6a05e3-fc5c-42f4-bc75-6cdaa446a4b8	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	MD	830	480	5
91fd3d3b-8c40-4442-a972-bf2924d8acf3	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	AT	330	830	6
e484ddcf-a706-4b38-9487-c968f6dd0e51	0529fb84-2099-4ea6-a1ba-2073fa7cfc44	AT	670	830	7
ca0df423-4e6e-4b95-a664-2776913e3f3e	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	GB	500	60	1
2ff96f84-2bed-4d15-b125-a2ab6e913cac	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	DG	170	250	2
4735707c-ac7a-44e5-bbf2-3681a11cdcca	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	DC	500	240	3
9c117d24-9c69-476b-a092-940906533ee7	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	DD	830	250	4
6fcdd667-d01d-4d0c-b0e4-0e6a2a81854f	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	MG	200	560	5
04f1e021-9d75-42bd-b51f-f1b6df35c4c7	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	MOC	500	640	6
c4730fdb-312c-42ae-b7d2-d2613326ed73	0fb94df5-53df-4ec7-84a7-de7d71ec15e4	MD	800	560	7
037250fc-6288-4c48-b736-9d41782a99b4	42a70e64-b600-4f8a-a048-3676e25691dd	GB	500	60	1
e421cbc3-ee75-454a-b8c2-81b0fed08469	42a70e64-b600-4f8a-a048-3676e25691dd	DC	320	240	2
9c52bc7e-17a0-4176-95c6-f533b334e855	42a70e64-b600-4f8a-a048-3676e25691dd	DC	680	240	3
1195fca8-2b6e-41bf-b019-c43dc1a80fab	42a70e64-b600-4f8a-a048-3676e25691dd	MC	500	500	4
51b1dd37-7441-4e5d-b57c-1ea5052cc5cc	42a70e64-b600-4f8a-a048-3676e25691dd	AG	180	800	5
60accfe1-34ee-476e-9030-4dc7ab21686d	42a70e64-b600-4f8a-a048-3676e25691dd	AT	500	860	6
d993823e-9b37-4d1f-a9ff-15edbcb2692f	42a70e64-b600-4f8a-a048-3676e25691dd	AD	820	800	7
781e9644-3370-4c86-93f7-7cf132c2612a	b2135f07-f047-42f0-88ba-3eb56fae7922	AIL	160	520	4
1b603cc6-e7b1-41b2-88d2-b4ae36a01213	b2135f07-f047-42f0-88ba-3eb56fae7922	AIL	840	520	6
\.


--
-- Data for Name: formations; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.formations (id, team_id, name, label, created_by, created_at) FROM stdin;
23432a61-3d6e-492c-b928-345593890574	\N	Classique 1-3-2-1	1-3-2-1	\N	2026-09-30 16:06:32.303874+00
b2135f07-f047-42f0-88ba-3eb56fae7922	\N	Milieu à trois 1-2-3-1	1-2-3-1	\N	2026-09-30 16:06:32.386223+00
bc0cfc21-bce2-42c8-a10e-eba05a0e19ba	\N	Deux attaquants 1-3-1-2	1-3-1-2	\N	2026-09-30 16:06:32.457541+00
7dcb9a9d-ac4a-4ae8-b955-330027412a45	\N	Carré 1-2-2-2	1-2-2-2	\N	2026-09-30 16:06:32.538307+00
0529fb84-2099-4ea6-a1ba-2073fa7cfc44	\N	Libéro 1-1-3-2	1-1-3-2	\N	2026-09-30 16:06:32.611034+00
0fb94df5-53df-4ec7-84a7-de7d71ec15e4	\N	Sans avant-centre 1-3-3-0	1-3-3-0	\N	2026-09-30 16:06:32.681761+00
42a70e64-b600-4f8a-a048-3676e25691dd	\N	Offensif 1-2-1-3	1-2-1-3	\N	2026-09-30 16:06:32.760172+00
\.


--
-- Data for Name: injuries; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.injuries (id, team_member_id, started_on, expected_return_on, note, declared_by, resolved_on, created_at) FROM stdin;
5fa3526e-910e-48c8-bda7-ca0391311d6e	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	2026-09-20	2026-10-11	Entorse de la cheville.	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2026-09-30 16:06:33.116893+00
\.


--
-- Data for Name: invites; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.invites (id, team_id, code, role, expires_at, max_uses, uses, created_by, created_at) FROM stdin;
c7e19c08-2fb7-4c6a-a03b-90a0c6bb66e7	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	3E4GUT7V	player	2026-10-08 09:00:32.819+00	1	1	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 09:00:32.821244+00
401d98ab-5a81-49ea-bf24-4f3dc941a5fc	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	ANAXHWMU	player	1970-01-01 00:00:00+00	0	0	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 09:00:38.273836+00
\.


--
-- Data for Name: lineup_slots; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.lineup_slots (lineup_id, formation_slot_id, team_member_id) FROM stdin;
78ee7f94-6636-479b-b243-8f7149c15ad6	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
78ee7f94-6636-479b-b243-8f7149c15ad6	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
78ee7f94-6636-479b-b243-8f7149c15ad6	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
78ee7f94-6636-479b-b243-8f7149c15ad6	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
78ee7f94-6636-479b-b243-8f7149c15ad6	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
78ee7f94-6636-479b-b243-8f7149c15ad6	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
78ee7f94-6636-479b-b243-8f7149c15ad6	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	54153f62-1512-4e58-bbbf-b40ee821a359	5bfa639f-99ee-477f-8a1a-435f435a7ed8
2d75582b-3229-40e5-832b-473a7c3be3ec	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
2d75582b-3229-40e5-832b-473a7c3be3ec	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
2d75582b-3229-40e5-832b-473a7c3be3ec	62909a8b-5815-4988-8737-860f9d8434ad	f79bed48-b1dc-4d4a-86cd-b041e7f955bf
2d75582b-3229-40e5-832b-473a7c3be3ec	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
2d75582b-3229-40e5-832b-473a7c3be3ec	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
2d75582b-3229-40e5-832b-473a7c3be3ec	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
2d75582b-3229-40e5-832b-473a7c3be3ec	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	c680a937-7c3e-4b33-880b-91c52a500f87	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	54153f62-1512-4e58-bbbf-b40ee821a359	a3900120-edbc-4e69-a776-b77d0004e756
fa085574-2ec7-4767-88d8-8da77e145e78	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
fa085574-2ec7-4767-88d8-8da77e145e78	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
fa085574-2ec7-4767-88d8-8da77e145e78	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
fa085574-2ec7-4767-88d8-8da77e145e78	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
fa085574-2ec7-4767-88d8-8da77e145e78	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
fa085574-2ec7-4767-88d8-8da77e145e78	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
fa085574-2ec7-4767-88d8-8da77e145e78	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
467deb94-c3a5-479b-905f-0c482949313d	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
467deb94-c3a5-479b-905f-0c482949313d	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
467deb94-c3a5-479b-905f-0c482949313d	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
467deb94-c3a5-479b-905f-0c482949313d	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
467deb94-c3a5-479b-905f-0c482949313d	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
467deb94-c3a5-479b-905f-0c482949313d	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
467deb94-c3a5-479b-905f-0c482949313d	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
d184873b-698c-4e1e-8b9e-948c81d9535d	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
d184873b-698c-4e1e-8b9e-948c81d9535d	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
d184873b-698c-4e1e-8b9e-948c81d9535d	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
d184873b-698c-4e1e-8b9e-948c81d9535d	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
d184873b-698c-4e1e-8b9e-948c81d9535d	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
d184873b-698c-4e1e-8b9e-948c81d9535d	ef38f604-d443-4766-8c89-d28ccc77843b	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
d184873b-698c-4e1e-8b9e-948c81d9535d	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	a9266115-7117-4497-83fa-98a3ae970f52	2c95b473-360e-4bc3-b016-3ced1e967f73
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
b536586f-1688-44fa-b329-74603b12e5e6	c680a937-7c3e-4b33-880b-91c52a500f87	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
b536586f-1688-44fa-b329-74603b12e5e6	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
b536586f-1688-44fa-b329-74603b12e5e6	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
b536586f-1688-44fa-b329-74603b12e5e6	f79fe536-adc1-4818-8a1f-6089d3a25e82	f633adf9-a43a-4297-825b-20aa746bd880
b536586f-1688-44fa-b329-74603b12e5e6	a9266115-7117-4497-83fa-98a3ae970f52	5b2e63e1-fef3-4f78-808c-d1e443641ffd
b536586f-1688-44fa-b329-74603b12e5e6	ef38f604-d443-4766-8c89-d28ccc77843b	74dbf902-e056-4f04-a59b-dfcad74a08b8
b536586f-1688-44fa-b329-74603b12e5e6	54153f62-1512-4e58-bbbf-b40ee821a359	a3900120-edbc-4e69-a776-b77d0004e756
1cda78ba-9e9e-46fe-aacb-ae37067c1105	c680a937-7c3e-4b33-880b-91c52a500f87	5b1a91c4-cdd6-498f-b668-ca82ba6b677b
1cda78ba-9e9e-46fe-aacb-ae37067c1105	875ac75d-6558-40f3-89f0-91507b084269	2c95b473-360e-4bc3-b016-3ced1e967f73
1cda78ba-9e9e-46fe-aacb-ae37067c1105	62909a8b-5815-4988-8737-860f9d8434ad	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef
1cda78ba-9e9e-46fe-aacb-ae37067c1105	f79fe536-adc1-4818-8a1f-6089d3a25e82	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
1cda78ba-9e9e-46fe-aacb-ae37067c1105	a9266115-7117-4497-83fa-98a3ae970f52	f633adf9-a43a-4297-825b-20aa746bd880
1cda78ba-9e9e-46fe-aacb-ae37067c1105	ef38f604-d443-4766-8c89-d28ccc77843b	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
1cda78ba-9e9e-46fe-aacb-ae37067c1105	54153f62-1512-4e58-bbbf-b40ee821a359	5b2e63e1-fef3-4f78-808c-d1e443641ffd
9a7d7eee-b083-4d12-8278-58e4c332570b	c680a937-7c3e-4b33-880b-91c52a500f87	5b1a91c4-cdd6-498f-b668-ca82ba6b677b
9a7d7eee-b083-4d12-8278-58e4c332570b	875ac75d-6558-40f3-89f0-91507b084269	2c95b473-360e-4bc3-b016-3ced1e967f73
9a7d7eee-b083-4d12-8278-58e4c332570b	62909a8b-5815-4988-8737-860f9d8434ad	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef
9a7d7eee-b083-4d12-8278-58e4c332570b	f79fe536-adc1-4818-8a1f-6089d3a25e82	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
9a7d7eee-b083-4d12-8278-58e4c332570b	a9266115-7117-4497-83fa-98a3ae970f52	f633adf9-a43a-4297-825b-20aa746bd880
9a7d7eee-b083-4d12-8278-58e4c332570b	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
9a7d7eee-b083-4d12-8278-58e4c332570b	54153f62-1512-4e58-bbbf-b40ee821a359	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	c680a937-7c3e-4b33-880b-91c52a500f87	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	f79fe536-adc1-4818-8a1f-6089d3a25e82	2c95b473-360e-4bc3-b016-3ced1e967f73
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	a9266115-7117-4497-83fa-98a3ae970f52	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	ef38f604-d443-4766-8c89-d28ccc77843b	f633adf9-a43a-4297-825b-20aa746bd880
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	54153f62-1512-4e58-bbbf-b40ee821a359	74dbf902-e056-4f04-a59b-dfcad74a08b8
57d2d6a4-0f3f-48e5-901a-1c197393efd7	c680a937-7c3e-4b33-880b-91c52a500f87	f79bed48-b1dc-4d4a-86cd-b041e7f955bf
57d2d6a4-0f3f-48e5-901a-1c197393efd7	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
57d2d6a4-0f3f-48e5-901a-1c197393efd7	62909a8b-5815-4988-8737-860f9d8434ad	f633adf9-a43a-4297-825b-20aa746bd880
57d2d6a4-0f3f-48e5-901a-1c197393efd7	f79fe536-adc1-4818-8a1f-6089d3a25e82	5b2e63e1-fef3-4f78-808c-d1e443641ffd
57d2d6a4-0f3f-48e5-901a-1c197393efd7	a9266115-7117-4497-83fa-98a3ae970f52	153db7ce-1f65-48c3-9620-1915dea7f171
57d2d6a4-0f3f-48e5-901a-1c197393efd7	ef38f604-d443-4766-8c89-d28ccc77843b	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
57d2d6a4-0f3f-48e5-901a-1c197393efd7	54153f62-1512-4e58-bbbf-b40ee821a359	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	c680a937-7c3e-4b33-880b-91c52a500f87	153db7ce-1f65-48c3-9620-1915dea7f171
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	875ac75d-6558-40f3-89f0-91507b084269	5b2e63e1-fef3-4f78-808c-d1e443641ffd
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	62909a8b-5815-4988-8737-860f9d8434ad	f633adf9-a43a-4297-825b-20aa746bd880
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	f79fe536-adc1-4818-8a1f-6089d3a25e82	17322527-c8cd-4c71-8370-f5c9ec0226b7
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	a9266115-7117-4497-83fa-98a3ae970f52	f79bed48-b1dc-4d4a-86cd-b041e7f955bf
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	ef38f604-d443-4766-8c89-d28ccc77843b	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	54153f62-1512-4e58-bbbf-b40ee821a359	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
0fbbf835-2f5e-4dcd-948c-5f3110665227	c680a937-7c3e-4b33-880b-91c52a500f87	74dbf902-e056-4f04-a59b-dfcad74a08b8
0fbbf835-2f5e-4dcd-948c-5f3110665227	875ac75d-6558-40f3-89f0-91507b084269	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
0fbbf835-2f5e-4dcd-948c-5f3110665227	62909a8b-5815-4988-8737-860f9d8434ad	17322527-c8cd-4c71-8370-f5c9ec0226b7
0fbbf835-2f5e-4dcd-948c-5f3110665227	f79fe536-adc1-4818-8a1f-6089d3a25e82	a3900120-edbc-4e69-a776-b77d0004e756
0fbbf835-2f5e-4dcd-948c-5f3110665227	a9266115-7117-4497-83fa-98a3ae970f52	f633adf9-a43a-4297-825b-20aa746bd880
0fbbf835-2f5e-4dcd-948c-5f3110665227	ef38f604-d443-4766-8c89-d28ccc77843b	153db7ce-1f65-48c3-9620-1915dea7f171
0fbbf835-2f5e-4dcd-948c-5f3110665227	54153f62-1512-4e58-bbbf-b40ee821a359	5b2e63e1-fef3-4f78-808c-d1e443641ffd
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	c680a937-7c3e-4b33-880b-91c52a500f87	2c95b473-360e-4bc3-b016-3ced1e967f73
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	875ac75d-6558-40f3-89f0-91507b084269	f633adf9-a43a-4297-825b-20aa746bd880
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	62909a8b-5815-4988-8737-860f9d8434ad	f79bed48-b1dc-4d4a-86cd-b041e7f955bf
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	f79fe536-adc1-4818-8a1f-6089d3a25e82	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	a9266115-7117-4497-83fa-98a3ae970f52	5b2e63e1-fef3-4f78-808c-d1e443641ffd
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	ef38f604-d443-4766-8c89-d28ccc77843b	17322527-c8cd-4c71-8370-f5c9ec0226b7
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	54153f62-1512-4e58-bbbf-b40ee821a359	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
955254c3-b7e0-4cd1-bd0e-3046196c96fc	c680a937-7c3e-4b33-880b-91c52a500f87	153db7ce-1f65-48c3-9620-1915dea7f171
955254c3-b7e0-4cd1-bd0e-3046196c96fc	875ac75d-6558-40f3-89f0-91507b084269	f633adf9-a43a-4297-825b-20aa746bd880
955254c3-b7e0-4cd1-bd0e-3046196c96fc	62909a8b-5815-4988-8737-860f9d8434ad	2c95b473-360e-4bc3-b016-3ced1e967f73
955254c3-b7e0-4cd1-bd0e-3046196c96fc	f79fe536-adc1-4818-8a1f-6089d3a25e82	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
955254c3-b7e0-4cd1-bd0e-3046196c96fc	a9266115-7117-4497-83fa-98a3ae970f52	5b2e63e1-fef3-4f78-808c-d1e443641ffd
955254c3-b7e0-4cd1-bd0e-3046196c96fc	ef38f604-d443-4766-8c89-d28ccc77843b	17322527-c8cd-4c71-8370-f5c9ec0226b7
955254c3-b7e0-4cd1-bd0e-3046196c96fc	54153f62-1512-4e58-bbbf-b40ee821a359	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
bb93c942-0d54-4099-87b5-898ad5771812	c680a937-7c3e-4b33-880b-91c52a500f87	153db7ce-1f65-48c3-9620-1915dea7f171
bb93c942-0d54-4099-87b5-898ad5771812	875ac75d-6558-40f3-89f0-91507b084269	f633adf9-a43a-4297-825b-20aa746bd880
bb93c942-0d54-4099-87b5-898ad5771812	62909a8b-5815-4988-8737-860f9d8434ad	2c95b473-360e-4bc3-b016-3ced1e967f73
bb93c942-0d54-4099-87b5-898ad5771812	f79fe536-adc1-4818-8a1f-6089d3a25e82	5b2e63e1-fef3-4f78-808c-d1e443641ffd
bb93c942-0d54-4099-87b5-898ad5771812	a9266115-7117-4497-83fa-98a3ae970f52	74dbf902-e056-4f04-a59b-dfcad74a08b8
bb93c942-0d54-4099-87b5-898ad5771812	ef38f604-d443-4766-8c89-d28ccc77843b	17322527-c8cd-4c71-8370-f5c9ec0226b7
bb93c942-0d54-4099-87b5-898ad5771812	54153f62-1512-4e58-bbbf-b40ee821a359	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
695cc50f-7615-4841-b182-7a21f94976b3	c680a937-7c3e-4b33-880b-91c52a500f87	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
695cc50f-7615-4841-b182-7a21f94976b3	875ac75d-6558-40f3-89f0-91507b084269	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
695cc50f-7615-4841-b182-7a21f94976b3	62909a8b-5815-4988-8737-860f9d8434ad	2c95b473-360e-4bc3-b016-3ced1e967f73
695cc50f-7615-4841-b182-7a21f94976b3	f79fe536-adc1-4818-8a1f-6089d3a25e82	17322527-c8cd-4c71-8370-f5c9ec0226b7
695cc50f-7615-4841-b182-7a21f94976b3	a9266115-7117-4497-83fa-98a3ae970f52	f633adf9-a43a-4297-825b-20aa746bd880
695cc50f-7615-4841-b182-7a21f94976b3	ef38f604-d443-4766-8c89-d28ccc77843b	153db7ce-1f65-48c3-9620-1915dea7f171
695cc50f-7615-4841-b182-7a21f94976b3	54153f62-1512-4e58-bbbf-b40ee821a359	5b2e63e1-fef3-4f78-808c-d1e443641ffd
897995cc-d531-4f68-92e4-98097bd83504	c680a937-7c3e-4b33-880b-91c52a500f87	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
897995cc-d531-4f68-92e4-98097bd83504	875ac75d-6558-40f3-89f0-91507b084269	17322527-c8cd-4c71-8370-f5c9ec0226b7
897995cc-d531-4f68-92e4-98097bd83504	62909a8b-5815-4988-8737-860f9d8434ad	153db7ce-1f65-48c3-9620-1915dea7f171
897995cc-d531-4f68-92e4-98097bd83504	f79fe536-adc1-4818-8a1f-6089d3a25e82	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971
897995cc-d531-4f68-92e4-98097bd83504	a9266115-7117-4497-83fa-98a3ae970f52	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c
897995cc-d531-4f68-92e4-98097bd83504	ef38f604-d443-4766-8c89-d28ccc77843b	5b2e63e1-fef3-4f78-808c-d1e443641ffd
897995cc-d531-4f68-92e4-98097bd83504	54153f62-1512-4e58-bbbf-b40ee821a359	f633adf9-a43a-4297-825b-20aa746bd880
4e665fc0-044c-49ee-9c4c-e16918ddeefe	1ce94d4c-fd2e-4ad1-9627-d97c124d5a80	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f
4e665fc0-044c-49ee-9c4c-e16918ddeefe	2811eff7-1102-41b1-9796-a52785d70fbf	2c95b473-360e-4bc3-b016-3ced1e967f73
4e665fc0-044c-49ee-9c4c-e16918ddeefe	801e490f-7bfd-4f5e-bde1-232c6b1aae3d	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef
4e665fc0-044c-49ee-9c4c-e16918ddeefe	781e9644-3370-4c86-93f7-7cf132c2612a	17322527-c8cd-4c71-8370-f5c9ec0226b7
4e665fc0-044c-49ee-9c4c-e16918ddeefe	a0964308-978c-4c92-84fe-b41c79fb8c22	f633adf9-a43a-4297-825b-20aa746bd880
4e665fc0-044c-49ee-9c4c-e16918ddeefe	1b603cc6-e7b1-41b2-88d2-b4ae36a01213	5b2e63e1-fef3-4f78-808c-d1e443641ffd
4e665fc0-044c-49ee-9c4c-e16918ddeefe	da7145df-2a89-46b7-bc90-a47410fc1893	a3900120-edbc-4e69-a776-b77d0004e756
\.


--
-- Data for Name: lineups; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.lineups (id, match_id, formation_id, from_minute, is_initial, applied_event_id, created_by, created_at) FROM stdin;
78ee7f94-6636-479b-b243-8f7149c15ad6	1a7348fe-3173-41c1-8716-0ec7b031a153	23432a61-3d6e-492c-b928-345593890574	0	t	e501408a-5959-4b52-8d02-9b11e25cbfda	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:33.40618+00
2f54a26a-96b0-41e3-85c2-4dea9793a0ae	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	23432a61-3d6e-492c-b928-345593890574	0	t	fa60d8b5-041e-4111-864e-48666d041b01	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:33.944508+00
2d75582b-3229-40e5-832b-473a7c3be3ec	5e3c9abc-9002-4d17-aaf7-638422789ca9	23432a61-3d6e-492c-b928-345593890574	0	t	b7877bce-c2af-4cb2-a0de-3d200a4bbef5	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:34.322203+00
9df3cfe9-6c4a-4005-a4c4-4203fa85ece0	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	23432a61-3d6e-492c-b928-345593890574	0	t	9be3ba91-504d-445b-8267-d6008b27366e	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:34.745897+00
fa085574-2ec7-4767-88d8-8da77e145e78	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	23432a61-3d6e-492c-b928-345593890574	0	t	88db3be5-fd62-403a-b638-b98eef704045	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:35.163978+00
467deb94-c3a5-479b-905f-0c482949313d	c1856b4a-38c8-4936-8066-8fd508bc028f	23432a61-3d6e-492c-b928-345593890574	0	t	f5a68897-e9b1-48fa-9247-35e978b76e47	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:35.769414+00
d184873b-698c-4e1e-8b9e-948c81d9535d	5d187aaf-989e-449f-ac7d-219d6a41f14f	23432a61-3d6e-492c-b928-345593890574	0	t	e36edfd1-1a00-43ac-96f9-b3690a9ad289	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 08:56:47.208204+00
4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d	e47008a7-578a-4da9-a785-0fc6c1ff679a	23432a61-3d6e-492c-b928-345593890574	0	t	372c9ea8-9256-420d-8156-a6f54a6df583	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:36.19209+00
b536586f-1688-44fa-b329-74603b12e5e6	e47008a7-578a-4da9-a785-0fc6c1ff679a	23432a61-3d6e-492c-b928-345593890574	30	f	313c3a83-ca65-4dc9-8c5c-0eaa3eb347b9	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:36.238461+00
1cda78ba-9e9e-46fe-aacb-ae37067c1105	3146fd05-7672-417b-9149-215f88ce487a	23432a61-3d6e-492c-b928-345593890574	0	t	\N	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 15:23:05.383856+00
9a7d7eee-b083-4d12-8278-58e4c332570b	3146fd05-7672-417b-9149-215f88ce487a	23432a61-3d6e-492c-b928-345593890574	1	f	\N	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 15:23:24.301681+00
f15fb05c-4c20-43bd-b09a-11f6c6a0bafb	96fa070c-58f6-4318-bd53-c310e3f7e635	23432a61-3d6e-492c-b928-345593890574	0	t	\N	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-02 13:12:02.013125+00
57d2d6a4-0f3f-48e5-901a-1c197393efd7	24f4595a-9be1-43fd-ada5-f524edaff258	23432a61-3d6e-492c-b928-345593890574	0	t	9266335c-c71e-409f-a167-c6b18ad23816	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-02 13:13:27.066384+00
92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e	bee507a4-482d-46a6-8a42-74dfef1bd81c	23432a61-3d6e-492c-b928-345593890574	0	t	f6fa2ab4-fb51-43dc-b4c0-5020df5d3c2a	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-03 08:44:11.753295+00
0fbbf835-2f5e-4dcd-948c-5f3110665227	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	23432a61-3d6e-492c-b928-345593890574	0	t	d9c88989-0e1e-4302-8c81-f3bf65c056d4	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 08:21:49.407903+00
b87dc7a5-be62-4ca1-b666-29d6e2350ff3	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	23432a61-3d6e-492c-b928-345593890574	0	t	4d512d81-63a4-4ae8-a9e1-cd374379bc5c	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 08:25:41.451434+00
955254c3-b7e0-4cd1-bd0e-3046196c96fc	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	23432a61-3d6e-492c-b928-345593890574	0	t	aa8b33e0-8669-4b51-a8b8-59ecc3843be5	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 20:38:30.301239+00
bb93c942-0d54-4099-87b5-898ad5771812	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	23432a61-3d6e-492c-b928-345593890574	1	f	69f891dd-3db9-49ce-a7e8-84882636746f	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 20:38:45.762663+00
695cc50f-7615-4841-b182-7a21f94976b3	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	23432a61-3d6e-492c-b928-345593890574	0	t	f96d8d13-8872-4db2-be7e-69bc9b037b52	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-06 17:40:39.294102+00
897995cc-d531-4f68-92e4-98097bd83504	d653bc85-c303-4fbc-8124-89fecbdddffe	23432a61-3d6e-492c-b928-345593890574	0	t	\N	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-09 13:02:39.379408+00
4e665fc0-044c-49ee-9c4c-e16918ddeefe	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	b2135f07-f047-42f0-88ba-3eb56fae7922	0	t	2fae117d-5336-4fb8-8b3a-d664b0c5c8c6	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-09 20:40:25.107983+00
\.


--
-- Data for Name: match_events; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.match_events (id, match_id, client_event_id, type, period, minute, clock_ms, occurred_at, recorded_at, payload, created_by, voids_event_id, seq) FROM stdin;
c0c893ae-fabd-40af-a862-48907c4551d3	1a7348fe-3173-41c1-8716-0ec7b031a153	2c3df19f-d123-466c-af69-29be237eb7d4	KICKOFF	1	0	0	2026-08-16 08:30:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	0
e501408a-5959-4b52-8d02-9b11e25cbfda	1a7348fe-3173-41c1-8716-0ec7b031a153	1cf6090e-a547-42dc-b0c4-f8703ffb7454	LINEUP_APPLIED	1	0	0	2026-08-16 08:30:00+00	2026-09-30 16:06:33.474056+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}], "lineupId": "78ee7f94-6636-479b-b243-8f7149c15ad6"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	1
34ae0c2c-009c-4104-b72e-e28a081f4361	1a7348fe-3173-41c1-8716-0ec7b031a153	f2c3fda9-63ad-4697-8b2c-c3c30a93d462	GOAL_FOR	1	11	660000	2026-08-16 08:41:00+00	2026-09-30 16:06:33.474056+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2
e8289afa-2af0-4bc5-9640-0ac69ae05582	1a7348fe-3173-41c1-8716-0ec7b031a153	87aac1eb-7687-417b-9e7c-38afc3baad72	FOUL	1	19	1140000	2026-08-16 08:49:00+00	2026-09-30 16:06:33.474056+00	{"memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	3
ec4b6890-5698-481a-8ae2-fd233188bd7e	1a7348fe-3173-41c1-8716-0ec7b031a153	0f3cbf59-b5d6-4d34-bf5b-93aa3dc9ceb3	GOAL_AGAINST	1	24	1440000	2026-08-16 08:54:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	4
3bdbc4d3-ec8f-4612-830f-fcfbabd06ce6	1a7348fe-3173-41c1-8716-0ec7b031a153	8c992fb9-d3d9-4571-bfe9-46b9a383793c	GOAL_FOR	1	27	1620000	2026-08-16 08:57:00+00	2026-09-30 16:06:33.474056+00	{"scorerId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	5
196df830-8387-469e-b535-8b0dad0eaca5	1a7348fe-3173-41c1-8716-0ec7b031a153	211524ea-e2e1-4972-b2fe-53ba54056dc4	VOID	1	27	1620000	2026-08-16 08:57:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	3bdbc4d3-ec8f-4612-830f-fcfbabd06ce6	6
e6ab84ce-3bd5-4b28-8c8b-f0ad415b2143	1a7348fe-3173-41c1-8716-0ec7b031a153	6eb07e77-7004-4422-921f-b19ab3410d12	GOAL_FOR	1	28	1680000	2026-08-16 08:58:00+00	2026-09-30 16:06:33.474056+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	7
f4871c47-4299-4747-8ddf-5838ff223901	1a7348fe-3173-41c1-8716-0ec7b031a153	ebab5c98-d578-418e-9409-7bd75b67a01d	PERIOD_END	1	30	1800000	2026-08-16 09:00:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	8
83445573-f195-4cd5-b47e-113bb43d1e3b	1a7348fe-3173-41c1-8716-0ec7b031a153	fe669e47-f202-405c-afda-adc9bd60d1ac	KICKOFF	2	30	1800000	2026-08-16 09:00:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	9
b72902ca-474e-444c-b3f6-54632d603aa3	1a7348fe-3173-41c1-8716-0ec7b031a153	27f2a0af-e46f-45dd-a65e-27bca2063180	SUBSTITUTION	2	38	2280000	2026-08-16 09:08:00+00	2026-09-30 16:06:33.474056+00	{"inId": "74dbf902-e056-4f04-a59b-dfcad74a08b8", "outId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "slotId": "a9266115-7117-4497-83fa-98a3ae970f52"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	10
f9cef2ca-52d1-4c7a-abad-d52f2d965f8a	1a7348fe-3173-41c1-8716-0ec7b031a153	45c58870-f9a5-44e1-912d-194e2c66bc94	PENALTY_SCORED	2	44	2640000	2026-08-16 09:14:00+00	2026-09-30 16:06:33.474056+00	{"scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	11
b342b9b9-61b8-42ac-ad3c-eb7db93f996a	1a7348fe-3173-41c1-8716-0ec7b031a153	6789fc2a-7b6b-4bba-81a9-2feb859726be	OWN_GOAL	2	51	3060000	2026-08-16 09:21:00+00	2026-09-30 16:06:33.474056+00	{"scorerId": "f633adf9-a43a-4297-825b-20aa746bd880"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	12
6f1a470b-152a-4326-b697-835a35f80e2e	1a7348fe-3173-41c1-8716-0ec7b031a153	28b9b99c-211d-45ca-831d-4e3ec10d14d6	POSITION_CHANGE	2	55	3300000	2026-08-16 09:25:00+00	2026-09-30 16:06:33.474056+00	{"memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "toSlotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "fromSlotId": "ef38f604-d443-4766-8c89-d28ccc77843b"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	13
049fb3e8-22ef-46d6-a74f-c4ebbc085b31	1a7348fe-3173-41c1-8716-0ec7b031a153	6c6aa0f5-f401-4b39-a388-c144bf9d384e	SUBSTITUTION	2	55	3300000	2026-08-16 09:25:00+00	2026-09-30 16:06:33.474056+00	{"inId": "a3900120-edbc-4e69-a776-b77d0004e756", "outId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f", "slotId": "ef38f604-d443-4766-8c89-d28ccc77843b"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	14
02200bf6-09c4-4eab-b675-220e48d14aa9	1a7348fe-3173-41c1-8716-0ec7b031a153	c1ac9909-c6ed-4ee5-8f3c-5ba484d59c4c	PENALTY_MISSED	2	58	3480000	2026-08-16 09:28:00+00	2026-09-30 16:06:33.474056+00	{"scorerId": "a3900120-edbc-4e69-a776-b77d0004e756"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	15
97b05eda-1ac5-4a30-84e2-2d5374e76781	1a7348fe-3173-41c1-8716-0ec7b031a153	60fc321e-22bc-49bd-a568-1c0fd0554f64	PERIOD_END	2	60	3600000	2026-08-16 09:30:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	16
b6101b2a-4f73-451d-a6fc-b627657a09f9	1a7348fe-3173-41c1-8716-0ec7b031a153	1fd45a89-4e5e-4f7b-aebf-cd03a9edfc18	FINAL_WHISTLE	2	60	3600000	2026-08-16 09:30:00+00	2026-09-30 16:06:33.474056+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	17
bcc0c83d-b936-4994-9452-ff02eab9f67b	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	188c06be-6953-4944-8f0e-2571b44ee5b5	KICKOFF	1	0	0	2026-08-23 08:30:00+00	2026-09-30 16:06:33.99751+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	0
fa60d8b5-041e-4111-864e-48666d041b01	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	b02f5196-a031-4255-aa6d-990c2ac2bc89	LINEUP_APPLIED	1	0	0	2026-08-23 08:30:00+00	2026-09-30 16:06:33.99751+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "5bfa639f-99ee-477f-8a1a-435f435a7ed8"}], "lineupId": "2f54a26a-96b0-41e3-85c2-4dea9793a0ae"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	1
1526378f-bb8c-4785-acb0-764674c20e88	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	453983e2-9c54-44fc-807f-0e91d6a4d9e4	GOAL_FOR	1	18	1080000	2026-08-23 08:48:00+00	2026-09-30 16:06:33.99751+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "5bfa639f-99ee-477f-8a1a-435f435a7ed8"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2
18759adf-fbec-4774-98a1-168055759dc2	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	9440e636-e543-4327-9125-ffe4b8d0af37	SUBSTITUTION	1	20	1200000	2026-08-23 08:50:00+00	2026-09-30 16:06:33.99751+00	{"inId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "outId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "slotId": "a9266115-7117-4497-83fa-98a3ae970f52"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	3
324151b7-e9c9-446b-8bbb-ebb5ea74f7dc	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	1eee7537-f5be-490c-8e36-32725d57c349	PERIOD_END	1	30	1800000	2026-08-23 09:00:00+00	2026-09-30 16:06:33.99751+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	4
ca1fcc35-dbab-482a-95a8-e1e9d8d7bd10	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	3c2da448-47d8-4231-9809-32c5ecc39f6f	KICKOFF	2	30	1800000	2026-08-23 09:00:00+00	2026-09-30 16:06:33.99751+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	5
15d3c610-15d9-4544-bbdc-8f4e50b3d3b9	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	231e4a71-31bd-4ac0-b817-79f0262328de	POSITION_CHANGE	2	38	2280000	2026-08-23 09:08:00+00	2026-09-30 16:06:33.99751+00	{"memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "toSlotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "fromSlotId": "ef38f604-d443-4766-8c89-d28ccc77843b"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	6
a4815419-a2ea-4e04-9a07-4a46a7249232	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	6e3aec06-0e07-4b48-b43f-ac3d1b876175	POSITION_CHANGE	2	38	2280000	2026-08-23 09:08:00+00	2026-09-30 16:06:33.99751+00	{"memberId": "5bfa639f-99ee-477f-8a1a-435f435a7ed8", "toSlotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "fromSlotId": "54153f62-1512-4e58-bbbf-b40ee821a359"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	7
968a4a5f-93df-4fc9-baab-b0f4b32e27ff	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	14a7312e-1b68-4437-9c23-0ae560703456	GOAL_AGAINST	2	44	2640000	2026-08-23 09:14:00+00	2026-09-30 16:06:33.99751+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	8
17bf2c06-0a94-40e2-ae76-bc735ed0ab7b	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	bbcff12e-30ce-4285-943f-92367c66aadf	SUBSTITUTION	2	50	3000000	2026-08-23 09:20:00+00	2026-09-30 16:06:33.99751+00	{"inId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "outId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "slotId": "a9266115-7117-4497-83fa-98a3ae970f52"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	9
451f634d-f557-4983-98fd-e7aa0fc54635	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	e22fedea-cc87-4e25-905f-c32a01e94294	GOAL_FOR	2	56	3360000	2026-08-23 09:26:00+00	2026-09-30 16:06:33.99751+00	{"assistId": "5bfa639f-99ee-477f-8a1a-435f435a7ed8", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	10
2430b7ef-463a-499d-b7a0-c40a15e41958	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	259d6ab6-a381-438a-8e5e-afa4c06afc8b	PERIOD_END	2	60	3600000	2026-08-23 09:30:00+00	2026-09-30 16:06:33.99751+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	11
f61f0594-8a2f-4e82-9e20-ed54474da4c7	ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	241fb858-06db-4ee5-a625-39c332e1b739	FINAL_WHISTLE	2	60	3600000	2026-08-23 09:30:00+00	2026-09-30 16:06:33.99751+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	12
f04eff5f-97d3-493e-bca6-c02a5b48e784	5e3c9abc-9002-4d17-aaf7-638422789ca9	dc64d31f-0ecc-4d57-b743-93a1b9108b61	KICKOFF	1	0	0	2026-08-30 08:30:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	0
b7877bce-c2af-4cb2-a0de-3d200a4bbef5	5e3c9abc-9002-4d17-aaf7-638422789ca9	6cbfbd8c-458d-4c87-b611-14c2bb22df50	LINEUP_APPLIED	1	0	0	2026-08-30 08:30:00+00	2026-09-30 16:06:34.375083+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}], "lineupId": "2d75582b-3229-40e5-832b-473a7c3be3ec"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	1
bb15c400-5011-44f5-a6aa-f78b763bf615	5e3c9abc-9002-4d17-aaf7-638422789ca9	9d1a099e-15ed-496b-a5eb-fbcb3d5c0f8a	GOAL_AGAINST	1	8	480000	2026-08-30 08:38:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2
3585eb5a-b6e6-45fe-94f4-2562710845a1	5e3c9abc-9002-4d17-aaf7-638422789ca9	9b15efb4-f8ec-4977-bf4e-54d5671d3bf7	GOAL_FOR	1	21	1260000	2026-08-30 08:51:00+00	2026-09-30 16:06:34.375083+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	3
77c4f6aa-4f93-4694-a560-a300a07f0a7a	5e3c9abc-9002-4d17-aaf7-638422789ca9	a544b5fa-a169-4c34-b56b-e42b62c15a6e	GOAL_AGAINST	1	26	1560000	2026-08-30 08:56:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	4
6660590c-c2db-4424-9eb8-6299a2fa4360	5e3c9abc-9002-4d17-aaf7-638422789ca9	f7f7fb2e-1240-4dc3-8c33-2b060846a29a	PERIOD_END	1	30	1800000	2026-08-30 09:00:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	5
aa84095b-481a-4a94-b8a1-023a64035dc7	5e3c9abc-9002-4d17-aaf7-638422789ca9	10e5193f-ba52-4f26-a69e-8d2a97b6ccaf	KICKOFF	2	30	1800000	2026-08-30 09:00:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	6
9ff4f514-44fd-4726-a822-70d3d1e7310f	5e3c9abc-9002-4d17-aaf7-638422789ca9	b00b5004-0f63-4fdc-8b9a-1eeea4ff0079	SUBSTITUTION	2	36	2160000	2026-08-30 09:06:00+00	2026-09-30 16:06:34.375083+00	{"inId": "153db7ce-1f65-48c3-9620-1915dea7f171", "outId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf", "slotId": "62909a8b-5815-4988-8737-860f9d8434ad"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	7
b98cfa2f-c669-4cd5-aa73-ed2437412af1	5e3c9abc-9002-4d17-aaf7-638422789ca9	bb6d254a-5666-4163-96c3-87e13a770911	FOUL	2	42	2520000	2026-08-30 09:12:00+00	2026-09-30 16:06:34.375083+00	{"memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	8
fe24aaa1-4c3e-4cd5-b9aa-b90663c0958e	5e3c9abc-9002-4d17-aaf7-638422789ca9	95c60233-081a-43bf-b97f-87d82d83e0ce	GOAL_AGAINST	2	49	2940000	2026-08-30 09:19:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	9
73da177c-9a37-4ed1-88ca-b03890620139	5e3c9abc-9002-4d17-aaf7-638422789ca9	5c1312b6-5ef1-42f6-9b5e-0ff46f9d6f17	SUBSTITUTION	2	53	3180000	2026-08-30 09:23:00+00	2026-09-30 16:06:34.375083+00	{"inId": "a3900120-edbc-4e69-a776-b77d0004e756", "outId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "slotId": "a9266115-7117-4497-83fa-98a3ae970f52"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	10
b75ec290-17f5-4549-82bc-9febdd54f899	5e3c9abc-9002-4d17-aaf7-638422789ca9	81e0751f-dab6-4060-ba1d-a677343d1927	PERIOD_END	2	60	3600000	2026-08-30 09:30:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	11
4320521b-28ca-4462-8398-85ec1721aa70	5e3c9abc-9002-4d17-aaf7-638422789ca9	f080d632-d12b-4b0c-9d89-85cb4e7c2d0a	FINAL_WHISTLE	2	60	3600000	2026-08-30 09:30:00+00	2026-09-30 16:06:34.375083+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	12
8e2c86fd-bdad-49a2-bad9-373f77e1a5a6	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	205380e2-3971-4c0a-8c4a-5e00313eea39	KICKOFF	1	0	0	2026-09-06 08:30:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	0
9be3ba91-504d-445b-8267-d6008b27366e	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	df4fc920-0b4f-4d66-9d4e-77ae648486a4	LINEUP_APPLIED	1	0	0	2026-09-06 08:30:00+00	2026-09-30 16:06:34.800228+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}], "lineupId": "9df3cfe9-6c4a-4005-a4c4-4203fa85ece0"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	1
bd2876c9-c9fa-4893-9127-535e819b827b	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	4d3669e1-8c08-45cb-86e1-e2b092b6c978	GOAL_FOR	1	14	840000	2026-09-06 08:44:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2
ee0d2f6f-403f-457a-861a-2be0e583e5e2	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	ad0d02e1-d455-4b89-b73d-f8bbf6fe7a57	GOAL_AGAINST	1	23	1380000	2026-09-06 08:53:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	3
ad785b87-9e6a-4bdc-b481-e5841abf5e54	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	e3ff28da-ab1f-4f4b-ac1e-169e380f2078	PERIOD_END	1	30	1800000	2026-09-06 09:00:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	4
5e8e8c55-0adf-4b51-9c81-02f369e99243	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	3802540d-05be-454e-a999-f789c71a9382	KICKOFF	2	30	1800000	2026-09-06 09:00:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	5
c946075d-2670-4c86-be51-4c4f6daf2802	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	cab8fc99-0658-4109-9da2-be39d50a9af8	GOAL_FOR	2	41	2460000	2026-09-06 09:11:00+00	2026-09-30 16:06:34.800228+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "a3900120-edbc-4e69-a776-b77d0004e756"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	6
4b1be5d8-a4de-4c7b-a51a-c613326f9e3e	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	f49ca034-fb50-4bfe-a942-ac77d1f5c361	SUBSTITUTION	2	50	3000000	2026-09-06 09:20:00+00	2026-09-30 16:06:34.800228+00	{"inId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f", "outId": "a3900120-edbc-4e69-a776-b77d0004e756", "slotId": "54153f62-1512-4e58-bbbf-b40ee821a359"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	7
3536246c-cc5c-4053-a570-36ac7694be6c	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	fda63975-4f99-4be4-af25-80f8f5acc5b0	GOAL_AGAINST	2	57	3420000	2026-09-06 09:27:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	8
e1e6bf0e-d5b3-4ce1-978a-2a6cd3a3e5e5	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	0b769c4f-7449-40f0-8f11-c8fcae1d60b3	PERIOD_END	2	60	3600000	2026-09-06 09:30:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	9
6752e49b-119a-42b4-977c-3dacfd39031c	c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	86c86768-e77c-4916-8850-9acd3b0e813d	FINAL_WHISTLE	2	60	3600000	2026-09-06 09:30:00+00	2026-09-30 16:06:34.800228+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	10
e9162e12-5a69-423b-a0cf-4c4a0ea3d6c1	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	0a54f22b-3d02-4cc3-8936-45a8fb5fdfc8	KICKOFF	1	0	0	2026-09-13 08:30:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	0
88db3be5-fd62-403a-b638-b98eef704045	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	d59e07b9-fcd6-44f6-b70f-1aeb11a43155	LINEUP_APPLIED	1	0	0	2026-09-13 08:30:00+00	2026-09-30 16:06:35.221829+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}], "lineupId": "fa085574-2ec7-4767-88d8-8da77e145e78"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	1
a1a623c8-21fd-4293-a1a6-39b5fb21b611	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	84f03285-f0bd-4147-ab2c-9b9bc83220bf	GOAL_FOR	1	12	720000	2026-09-13 08:42:00+00	2026-09-30 16:06:35.221829+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2
149ca73b-6e2d-4df2-bacf-2a3c9bf4594b	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	3c3076d6-b03d-4e47-9286-4e957bd26c55	GOAL_AGAINST	1	25	1500000	2026-09-13 08:55:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	3
ca6b6f54-bcfa-41e7-8eab-fa5be989ad57	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	d7e2c100-b6da-424c-a1b5-8782c46e5c14	VOID	1	25	1500000	2026-09-13 08:55:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	149ca73b-6e2d-4df2-bacf-2a3c9bf4594b	4
08e759ee-3fe4-4833-b65e-daef726470b2	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	ff494445-1191-4a24-a5c4-4c3f9ba003b4	PERIOD_END	1	30	1800000	2026-09-13 09:00:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	5
3d6da214-2bf7-4fc3-8d9d-0af6ee3c138e	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	da06b31c-f46d-4fda-b34b-52f033e2f8cc	KICKOFF	2	30	1800000	2026-09-13 09:00:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	6
913daaad-d6d1-4cb3-8626-48bce7dd07ef	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	f474b563-39c6-4c45-8744-323a8de67172	SUBSTITUTION	2	30	1800000	2026-09-13 09:00:00+00	2026-09-30 16:06:35.221829+00	{"inId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef", "outId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c", "slotId": "c680a937-7c3e-4b33-880b-91c52a500f87"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	7
3e4bc710-0067-4739-bd8a-b79799874ecb	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	d8f0a8fc-5497-4720-aa49-260eeaed424b	GOAL_AGAINST	2	35	2100000	2026-09-13 09:05:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	8
505a99cb-23c9-49d1-9e4f-552a74430616	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	2ac7dd53-a9f2-455c-8206-03d1c8006575	GOAL_FOR	2	40	2400000	2026-09-13 09:10:00+00	2026-09-30 16:06:35.221829+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	9
74fe55a2-da0a-490f-98ac-98cb6ba0be8b	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	fe03ec50-8c89-42c8-a097-08efbf6d67c0	SUBSTITUTION	2	50	3000000	2026-09-13 09:20:00+00	2026-09-30 16:06:35.221829+00	{"inId": "a3900120-edbc-4e69-a776-b77d0004e756", "outId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f", "slotId": "54153f62-1512-4e58-bbbf-b40ee821a359"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	10
1a4e577d-775b-405d-a0bc-3bcddbf6c771	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	106556c6-4a39-4748-b924-f5c820c1a945	GOAL_AGAINST	2	52	3120000	2026-09-13 09:22:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	11
95dbf70d-1ca9-4393-8a21-0da7392c5848	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	0c000c8d-980d-4dbc-9204-d8de8a1fdda2	GOAL_FOR	2	57	3420000	2026-09-13 09:27:00+00	2026-09-30 16:06:35.221829+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "a3900120-edbc-4e69-a776-b77d0004e756"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	12
29a077f5-4935-4319-bb84-73406649bdf6	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	8e9e609f-d2aa-4051-b982-cf38ff14c607	PERIOD_END	2	60	3600000	2026-09-13 09:30:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	13
e1cc9aee-2050-4bb6-9cf5-d41e079860a6	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	58ee857b-5aea-469b-ae63-f2bd4e36c049	FINAL_WHISTLE	2	60	3600000	2026-09-13 09:30:00+00	2026-09-30 16:06:35.221829+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	14
e38cc2bd-86fa-46c9-96d6-822e423c3bfc	c1856b4a-38c8-4936-8066-8fd508bc028f	7fb8a2c8-492c-4653-ba43-0f4b6dc80a28	KICKOFF	1	0	0	2026-09-27 08:30:00+00	2026-09-30 16:06:35.821954+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	0
f5a68897-e9b1-48fa-9247-35e978b76e47	c1856b4a-38c8-4936-8066-8fd508bc028f	3e2ebacd-48f7-4cab-9969-17626c5ea5b5	LINEUP_APPLIED	1	0	0	2026-09-27 08:30:00+00	2026-09-30 16:06:35.821954+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}], "lineupId": "467deb94-c3a5-479b-905f-0c482949313d"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	1
b785dd2c-63aa-45df-9910-17ffd0497c08	c1856b4a-38c8-4936-8066-8fd508bc028f	044964ec-0c0f-417c-a2bc-3f76945cd4ec	GOAL_FOR	1	9	540000	2026-09-27 08:39:00+00	2026-09-30 16:06:35.821954+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	2
5f260ba4-3612-43dc-939b-a477b2aa36ad	c1856b4a-38c8-4936-8066-8fd508bc028f	c73aaee5-6754-42ea-812c-3b148c7fc676	FOUL	1	27	1620000	2026-09-27 08:57:00+00	2026-09-30 16:06:35.821954+00	{"memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	3
f7f2874d-1bd2-4f2c-9ee5-765c8643cab6	c1856b4a-38c8-4936-8066-8fd508bc028f	e1b2adb8-d92e-4334-8aec-ec9268074a04	PERIOD_END	1	30	1800000	2026-09-27 09:00:00+00	2026-09-30 16:06:35.821954+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	4
12cbc326-cde6-4ac4-8db4-8aa1612bb2fa	c1856b4a-38c8-4936-8066-8fd508bc028f	c66ad347-0a5d-445c-954b-4e7377549a7c	KICKOFF	2	30	1800000	2026-09-27 09:00:00+00	2026-09-30 16:06:35.821954+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	5
18156719-478a-482d-9670-15ed7fc07250	c1856b4a-38c8-4936-8066-8fd508bc028f	93a001fd-1a97-40ac-bb1c-9286c3229135	SUBSTITUTION	2	40	2400000	2026-09-27 09:10:00+00	2026-09-30 16:06:35.821954+00	{"inId": "a3900120-edbc-4e69-a776-b77d0004e756", "outId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f", "slotId": "54153f62-1512-4e58-bbbf-b40ee821a359"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	6
238aa96b-d7fe-4095-a673-e12f52500f7b	c1856b4a-38c8-4936-8066-8fd508bc028f	accf6122-1a56-4327-8129-3c4c2c9d2716	INJURY	2	46	2760000	2026-09-27 09:16:00+00	2026-09-30 16:06:35.821954+00	{"memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	7
85a28273-d737-4f0a-83f7-857b81522bc5	c1856b4a-38c8-4936-8066-8fd508bc028f	4e5acb12-6083-40d9-91fe-8102db60587d	PAUSE	2	46	2760000	2026-09-27 09:16:00+00	2026-09-30 16:06:35.821954+00	{"reason": "Blessure de Momo"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	8
b1f837b0-c325-4eb2-8eac-271c96cc5c9c	c1856b4a-38c8-4936-8066-8fd508bc028f	a6730733-56a4-4e05-9172-dfd3358e6d87	RESUME	2	46	2760000	2026-09-27 09:16:00+00	2026-09-30 16:06:35.821954+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	9
22bd01fd-1314-45db-8917-8d56017273dd	c1856b4a-38c8-4936-8066-8fd508bc028f	bfa9ed5c-7344-4af6-b5bf-baad1770547b	SUBSTITUTION	2	48	2880000	2026-09-27 09:18:00+00	2026-09-30 16:06:35.821954+00	{"inId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "outId": "a3900120-edbc-4e69-a776-b77d0004e756", "slotId": "54153f62-1512-4e58-bbbf-b40ee821a359"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	10
cfbd5629-f7ad-4fd8-8f09-e8d54b804300	c1856b4a-38c8-4936-8066-8fd508bc028f	a8fa46b8-a3cc-423d-8375-a47c80b5d1f9	GOAL_FOR	2	52	3120000	2026-09-27 09:22:00+00	2026-09-30 16:06:35.821954+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	11
4c31b853-8008-4077-a2d4-6753b883d121	c1856b4a-38c8-4936-8066-8fd508bc028f	9ba44775-9a39-4acd-a705-5ca407036364	PERIOD_END	2	60	3600000	2026-09-27 09:30:00+00	2026-09-30 16:06:35.821954+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	12
fea334b4-49a5-44c3-a4e1-13fbcdcaf5a7	c1856b4a-38c8-4936-8066-8fd508bc028f	846b6ee2-b974-42d2-bdbd-35ce6070b3e7	FINAL_WHISTLE	2	60	3600000	2026-09-27 09:30:00+00	2026-09-30 16:06:35.821954+00	{}	c90099d4-4357-47fd-8c95-0c265af0d83b	\N	13
e36edfd1-1a00-43ac-96f9-b3690a9ad289	5d187aaf-989e-449f-ac7d-219d6a41f14f	572ef2e8-4f82-449f-afb8-ac686355516d	LINEUP_APPLIED	1	0	0	2026-10-01 08:59:05.003+00	2026-10-01 08:59:05.920126+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}], "lineupId": "d184873b-698c-4e1e-8b9e-948c81d9535d"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
6a001cc6-c96a-470e-aa2e-0e5fb980d525	5d187aaf-989e-449f-ac7d-219d6a41f14f	616b01d3-dc28-484b-ac1b-5043f3f450c5	KICKOFF	1	0	0	2026-10-01 08:59:08.163+00	2026-10-01 08:59:08.232835+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
309233ea-81d1-40cf-ab1f-1aa68dedef9f	5d187aaf-989e-449f-ac7d-219d6a41f14f	790619e9-3664-4b6a-b366-42ff0c373f7c	GOAL_FOR	1	0	4097	2026-10-01 08:59:12.26+00	2026-10-01 08:59:14.443449+00	{"scorerId": "153db7ce-1f65-48c3-9620-1915dea7f171"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
bf300e6a-8ed5-4505-8f36-210bb24fb1a9	5d187aaf-989e-449f-ac7d-219d6a41f14f	02274d2b-d86b-4b64-b346-73ebab997dd7	VOID	1	1	89133	2026-10-01 09:00:37.296+00	2026-10-01 09:00:38.295397+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	309233ea-81d1-40cf-ab1f-1aa68dedef9f	3
d25a03ea-c154-40b1-8b1f-ef8fdad39ecc	5d187aaf-989e-449f-ac7d-219d6a41f14f	73b6c57b-2df1-4d90-b681-f5949e094b3b	GOAL_FOR	1	1	92662	2026-10-01 09:00:40.825+00	2026-10-01 09:00:42.502454+00	{"assistId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
8d15378e-5402-493c-a9ef-d5436fb773e7	5d187aaf-989e-449f-ac7d-219d6a41f14f	aa89fb0a-aa00-4fa7-8cd4-2527debce46c	GOAL_AGAINST	1	1	94351	2026-10-01 09:00:42.514+00	2026-10-01 09:00:43.131405+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
d5808c4c-7e85-4bd5-9078-0338e3b502ca	5d187aaf-989e-449f-ac7d-219d6a41f14f	ad75979d-3a91-4867-8272-fa03b9e20c41	SUBSTITUTION	1	4	274997	2026-10-01 09:03:43.16+00	2026-10-01 09:03:45.361767+00	{"inId": "a3900120-edbc-4e69-a776-b77d0004e756", "outId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
d43245cc-12d4-4914-a0d2-9c59e9a9eed5	5d187aaf-989e-449f-ac7d-219d6a41f14f	7c320b9c-b35e-484c-8028-77e56298074d	POSITION_CHANGE	1	4	279676	2026-10-01 09:03:47.839+00	2026-10-01 09:03:50.754877+00	{"memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "toSlotId": "875ac75d-6558-40f3-89f0-91507b084269", "fromSlotId": "a9266115-7117-4497-83fa-98a3ae970f52"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
f5fed286-64b1-4946-81cd-4a86d19f17f2	5d187aaf-989e-449f-ac7d-219d6a41f14f	1296979e-40de-4003-ac57-6d25714f5736	INJURY	1	4	285051	2026-10-01 09:03:53.214+00	2026-10-01 09:03:55.23514+00	{"memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	8
79886a9b-44a4-49d7-9856-60a09372edb6	5d187aaf-989e-449f-ac7d-219d6a41f14f	76ec959b-6807-4f29-b524-80d6385ba5f8	COMMENT	1	4	292105	2026-10-01 09:04:00.268+00	2026-10-01 09:04:02.158871+00	{"note": "Audit UX : commentaire libre sur le match."}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	9
a6cff11c-3b49-447e-8487-e26316944571	5d187aaf-989e-449f-ac7d-219d6a41f14f	4cb3e9f4-9c54-4526-acc8-5d18f4bda1d0	PAUSE	1	6	376366	2026-10-01 09:05:24.529+00	2026-10-01 09:05:24.630287+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	10
286fc80a-0392-45c3-99c2-4e261ded9aec	5d187aaf-989e-449f-ac7d-219d6a41f14f	3d506ac7-f39f-4421-854c-fb0c60b6f1ac	RESUME	1	6	376366	2026-10-01 09:05:32.835+00	2026-10-01 09:05:32.905483+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	11
424ca13a-8bd2-46ed-a78c-c77d301cda4d	5d187aaf-989e-449f-ac7d-219d6a41f14f	c02826d9-0637-4f4b-ab9a-6fe0064ff836	PERIOD_END	1	6	379396	2026-10-01 09:05:35.865+00	2026-10-01 09:05:35.923155+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	12
0dff973d-344e-4c4f-a96e-842d95a40aca	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170000	KICKOFF	1	0	0	2026-09-28 16:00:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
500cdec9-d2dd-44eb-9e94-cf84d2ddce1d	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170001	LINEUP_APPLIED	1	0	0	2026-09-28 16:00:00+00	2026-10-01 09:45:50.38653+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}]}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
0add8513-8d08-47ca-8d04-7a754f5717f1	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170002	PERIOD_END	1	30	1800000	2026-09-28 16:30:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
3da475e6-a22a-4589-8ace-d0e89567cc55	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170003	KICKOFF	2	30	1800000	2026-09-28 16:30:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
1d5e59a0-3096-4a5e-8199-d5e178e18b74	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170004	GOAL_FOR	2	30	1800000	2026-09-28 16:30:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
aec4931d-779c-485a-ac0c-b071ccb6ad8f	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170005	GOAL_AGAINST	2	30	1800000	2026-09-28 16:30:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
ff11f2b5-8d8b-4103-86b7-09b660038cba	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170006	PERIOD_END	2	60	3600000	2026-09-28 17:00:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
6ca3cfcc-0388-45f4-8807-7ce4d667dbc7	94e1dbcb-033d-429e-b4ef-a94190c4770c	9cd6d705-55ae-4a33-88e1-6ee96b170007	FINAL_WHISTLE	2	60	3600000	2026-09-28 17:00:00+00	2026-10-01 09:45:50.38653+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
c7885e8c-5bdd-4127-bed4-6f836612ef40	5d187aaf-989e-449f-ac7d-219d6a41f14f	0681593d-61b7-42a3-a463-b764a2a543ab	KICKOFF	2	30	1800000	2026-10-01 09:05:45.181+00	2026-10-01 09:05:45.255356+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	13
affaae37-f5b0-424f-890f-79944457abf2	5d187aaf-989e-449f-ac7d-219d6a41f14f	395a1151-a94d-49dd-bf22-c7720cd35c84	GOAL_AGAINST	2	31	1869569	2026-10-01 09:06:54.75+00	2026-10-01 09:07:02.806892+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	14
c734c514-b8e4-49e7-b6c9-2aac39efb439	5d187aaf-989e-449f-ac7d-219d6a41f14f	d3e39feb-ed45-46fc-b34a-6ebcde5e9127	GOAL_FOR	2	31	1871481	2026-10-01 09:06:56.662+00	2026-10-01 09:07:02.806892+00	{"scorerId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	15
45ded754-752e-4478-9f84-3f98c57b5669	5d187aaf-989e-449f-ac7d-219d6a41f14f	84e045e4-ba2a-4d58-8174-d798a884fed0	COMMENT	2	31	1874397	2026-10-01 09:06:59.578+00	2026-10-01 09:07:02.806892+00	{"note": "Hors réseau : troisième action."}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	16
cb2864e4-b58a-49ca-8de2-b9d076e87830	5d187aaf-989e-449f-ac7d-219d6a41f14f	1782425c-0738-43c8-aaff-da04d7ee607e	GOAL_AGAINST	2	33	1994728	2026-10-01 09:08:59.909+00	2026-10-01 09:09:00.786031+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	17
4f53084e-e93e-4892-92d7-e3d9594d808e	5d187aaf-989e-449f-ac7d-219d6a41f14f	d6cd622f-5171-46cc-bbdf-347d502b182d	PERIOD_END	2	46	2766243	2026-10-01 09:21:51.424+00	2026-10-01 09:21:52.320729+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	18
bf5f08ba-6c0e-48e6-aad3-d3c674ef3ccf	5d187aaf-989e-449f-ac7d-219d6a41f14f	145b12c6-0833-4f2c-9454-c2c0db421950	FINAL_WHISTLE	2	46	2766243	2026-10-01 09:26:32.712+00	2026-10-01 09:26:33.904394+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	19
0f39aa36-b7db-4a1b-82d9-93a6f2dd186f	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666000	KICKOFF	1	0	0	2026-09-26 16:00:00+00	2026-10-01 09:50:45.601735+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
2ff3f058-9af2-4a12-b028-f138dfb8cedc	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666001	LINEUP_APPLIED	1	0	0	2026-09-26 16:00:00+00	2026-10-01 09:50:45.601735+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}]}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
d54f8143-06cb-4af4-bd77-115b3ea96a31	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666002	GOAL_FOR	1	12	720000	2026-09-26 16:12:00+00	2026-10-01 09:50:45.601735+00	{"assistId": "153db7ce-1f65-48c3-9620-1915dea7f171", "scorerId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
90314cb9-5071-4c74-8290-f9e8c7f0c6a9	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666003	PERIOD_END	1	30	1800000	2026-09-26 16:30:00+00	2026-10-01 09:50:45.601735+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
37a2e3d2-0195-4be9-9761-92b8e7fcd5dd	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666004	KICKOFF	2	30	1800000	2026-09-26 16:30:00+00	2026-10-01 09:50:45.601735+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
188a95e0-d51d-4400-82a4-8bd40616b8a6	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666005	PERIOD_END	2	60	3600000	2026-09-26 17:00:00+00	2026-10-01 09:50:45.601735+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
d401da78-53fa-4c5b-a7d2-224e52be3717	d371fb5c-f2bb-4021-af71-6dc20d7804e5	857f6951-b043-4e8b-8118-bb5da7666006	FINAL_WHISTLE	2	60	3600000	2026-09-26 17:00:00+00	2026-10-01 09:50:45.601735+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
4f579357-0b33-47ad-851e-ea484a29e1b4	d371fb5c-f2bb-4021-af71-6dc20d7804e5	e97d3c9c-45e1-43ce-847f-4bd8ef385000	VOID	1	12	720000	2026-09-26 16:12:00+00	2026-10-01 09:55:07.807514+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	d54f8143-06cb-4af4-bd77-115b3ea96a31	7
2231c606-010b-4133-b768-5160ba75f447	e47008a7-578a-4da9-a785-0fc6c1ff679a	1e0df93b-996e-4dee-a7d5-33003e1d2a8e	KICKOFF	1	0	0	2026-10-01 10:10:47.733+00	2026-10-01 10:10:48.790635+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
372c9ea8-9256-420d-8156-a6f54a6df583	e47008a7-578a-4da9-a785-0fc6c1ff679a	fdc4bb56-bd87-41ce-bd5a-3a0be6f4237c	LINEUP_APPLIED	1	0	7404	2026-10-01 10:10:55.137+00	2026-10-01 10:10:55.279583+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}], "lineupId": "4d0a8097-3ea5-4f6f-9d6b-0a10c946ad9d"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
b4c1c8b0-de9d-4870-83c0-f480d581b034	e47008a7-578a-4da9-a785-0fc6c1ff679a	b861ed68-e4b9-4dec-8a30-b9ba438fc824	PERIOD_END	1	0	9718	2026-10-01 10:10:57.451+00	2026-10-01 10:10:57.656754+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
504f389b-8098-414f-b40d-6bc91c10400c	e47008a7-578a-4da9-a785-0fc6c1ff679a	733aab7a-cf08-450a-ad30-451f10b098d4	KICKOFF	2	30	1800000	2026-10-01 10:10:59.048+00	2026-10-01 10:10:59.20676+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
aef923ea-2e0d-44e0-a58e-7c43ffa14f87	e47008a7-578a-4da9-a785-0fc6c1ff679a	45f16848-834a-4971-8f53-e061af702c26	PERIOD_END	2	30	1802293	2026-10-01 10:11:01.341+00	2026-10-01 10:11:01.478774+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
313c3a83-ca65-4dc9-8c5c-0eaa3eb347b9	e47008a7-578a-4da9-a785-0fc6c1ff679a	f7cde15b-7ec0-4207-a5e0-2de419611639	LINEUP_APPLIED	2	30	1802293	2026-10-01 15:08:39.364+00	2026-10-01 15:08:40.292716+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "74dbf902-e056-4f04-a59b-dfcad74a08b8"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}], "lineupId": "b536586f-1688-44fa-b329-74603b12e5e6"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
02daf5a5-dcf6-47e8-a174-ca10019a8863	e47008a7-578a-4da9-a785-0fc6c1ff679a	5f84edda-b3d3-449f-9d85-8a771dc1043a	FINAL_WHISTLE	2	30	1802293	2026-10-01 15:09:48.596+00	2026-10-01 15:09:49.328165+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
86000a15-e483-4583-9397-ff75545cdcbf	8e28d78b-897f-448f-b40e-3e10ae593d99	5c49e94b-5a44-47e2-9d47-5750e0c83910	KICKOFF	1	0	0	2026-10-01 15:11:09.573+00	2026-10-01 15:11:09.709517+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
65189465-bba8-4c61-88e1-764cf8da35d5	8e28d78b-897f-448f-b40e-3e10ae593d99	1039fc46-e1c9-453a-8b77-1fd24f5d36fb	PERIOD_END	1	0	1447	2026-10-01 15:11:11.02+00	2026-10-01 15:11:11.104959+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
c1f317a0-fda6-4fe9-8597-9c633fbd6dea	8e28d78b-897f-448f-b40e-3e10ae593d99	53536cc7-9552-4ebd-82c1-9db1baf3bd1b	KICKOFF	2	30	1800000	2026-10-01 15:11:14.498+00	2026-10-01 15:11:14.581942+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
2fd9fa89-1f2c-43ad-bd6a-bd354a686ebf	8e28d78b-897f-448f-b40e-3e10ae593d99	e024e9db-4423-4d4b-87e4-9dee46683592	PERIOD_END	2	30	1802132	2026-10-01 15:11:16.63+00	2026-10-01 15:11:16.719091+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
0c2521d6-fec8-446f-b94b-901b28274bd9	8e28d78b-897f-448f-b40e-3e10ae593d99	e53cab1a-db0d-44eb-a43f-19501409c5da	FINAL_WHISTLE	2	30	1802132	2026-10-01 15:11:17.544+00	2026-10-01 15:11:18.586066+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
820f4a9c-ce5b-49d9-bdc9-d816375e0d5d	3146fd05-7672-417b-9149-215f88ce487a	fc2a0519-adde-43d2-b1d1-194986da9d04	KICKOFF	1	0	0	2026-10-02 13:10:25.156+00	2026-10-02 13:10:26.141677+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
b105caef-6a23-47aa-8b17-52a34618f811	3146fd05-7672-417b-9149-215f88ce487a	efa88bb0-544a-4377-9745-fa0ee337cc6e	PERIOD_END	1	0	2263	2026-10-02 13:10:27.419+00	2026-10-02 13:10:27.601589+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
73b0faba-8a29-4c6f-a914-e9e1c03297bc	3146fd05-7672-417b-9149-215f88ce487a	a5b38073-258a-42aa-9b04-71912f6a472a	KICKOFF	2	30	1800000	2026-10-02 13:10:28.899+00	2026-10-02 13:10:29.026666+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
f0d61db5-f3a4-48fa-b0b2-821ec94af69c	3146fd05-7672-417b-9149-215f88ce487a	5b5660d1-0d97-47ad-9889-c82856a9b186	PERIOD_END	2	30	1800996	2026-10-02 13:10:29.895+00	2026-10-02 13:10:30.035744+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
863e3c96-0a28-49f0-9e48-1dab55860c1f	3146fd05-7672-417b-9149-215f88ce487a	693e5599-2ad8-4ef7-bf94-2884ef37fe2c	FINAL_WHISTLE	2	30	1800996	2026-10-02 13:10:30.514+00	2026-10-02 13:10:31.280753+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
ab85d4e4-b848-4445-b5bf-ce828a7979a8	96fa070c-58f6-4318-bd53-c310e3f7e635	d1869f3b-a607-4852-957e-7f5c2d137fd7	KICKOFF	1	0	0	2026-10-02 13:12:14.478+00	2026-10-02 13:12:14.701116+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
b6b0a4a1-ce63-4f7a-8c5b-cad8b094bb22	96fa070c-58f6-4318-bd53-c310e3f7e635	97a76bf5-f079-4ec4-84eb-dabcc2a30cc4	PERIOD_END	1	0	782	2026-10-02 13:12:15.26+00	2026-10-02 13:12:15.387974+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
757ab8d1-9b58-4d6e-a3be-30cc4520f113	96fa070c-58f6-4318-bd53-c310e3f7e635	f9d7cecc-7302-433e-8cf4-ac12190c4263	KICKOFF	2	30	1800000	2026-10-02 13:12:15.925+00	2026-10-02 13:12:16.056165+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
1494bdfc-6c79-43d7-959f-4b20f9982019	96fa070c-58f6-4318-bd53-c310e3f7e635	3569b949-d087-423e-945d-51ea9d895611	PERIOD_END	2	30	1800532	2026-10-02 13:12:16.457+00	2026-10-02 13:12:16.584517+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
952ad9d5-8d25-4b68-b7fb-a5a5cc5fa2f0	96fa070c-58f6-4318-bd53-c310e3f7e635	10db2999-733a-41f6-a9ad-b5fa4afccf39	FINAL_WHISTLE	2	30	1800532	2026-10-02 13:12:17.041+00	2026-10-02 13:12:18.565356+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
9266335c-c71e-409f-a167-c6b18ad23816	24f4595a-9be1-43fd-ada5-f524edaff258	035cea8c-46a2-48ac-aea3-4e4657d0f483	LINEUP_APPLIED	1	0	0	2026-10-02 13:13:39.162+00	2026-10-02 13:13:39.358136+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}], "lineupId": "57d2d6a4-0f3f-48e5-901a-1c197393efd7"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
a7688134-40d0-4408-aeb3-cd5b8f5fc882	24f4595a-9be1-43fd-ada5-f524edaff258	48aaa5e4-7cf7-4cb2-8672-4b483d39ad92	GOAL_FOR	1	0	1214	2026-10-02 13:13:42.54+00	2026-10-02 13:13:44.308451+00	{"assistId": "f633adf9-a43a-4297-825b-20aa746bd880", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
1b33989c-3470-46ac-9005-d0713c8a8176	24f4595a-9be1-43fd-ada5-f524edaff258	e35773c1-b199-4ac8-aabd-f8dce1d7146e	KICKOFF	2	30	1800000	2026-10-02 13:13:45.621+00	2026-10-02 13:13:45.767792+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
58e21bab-007d-49df-8a19-76f61fa84859	24f4595a-9be1-43fd-ada5-f524edaff258	57f9f297-ecc8-40db-923b-ceb53c9b7626	PERIOD_END	2	30	1800497	2026-10-02 13:13:46.118+00	2026-10-02 13:13:46.252576+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
d3dc2938-c5c3-4e3c-830a-ad224d42cf70	24f4595a-9be1-43fd-ada5-f524edaff258	88f49a17-1f65-486e-a690-a6a23806b92e	FINAL_WHISTLE	2	30	1800497	2026-10-02 13:13:46.85+00	2026-10-02 13:13:47.70647+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
f5a5395d-2b2f-4303-838a-3aac3eb72f80	24f4595a-9be1-43fd-ada5-f524edaff258	fe7bbebd-8b8a-40cb-8b0e-450941b7621f	KICKOFF	1	0	0	2026-10-02 13:13:41.326+00	2026-10-02 13:13:41.468117+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
af7ed993-97bc-43ed-a157-7dc28b416e6b	24f4595a-9be1-43fd-ada5-f524edaff258	45b0f688-4c59-499f-bd55-0c01528a79b3	PERIOD_END	1	0	3609	2026-10-02 13:13:44.935+00	2026-10-02 13:13:45.078238+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
f6fa2ab4-fb51-43dc-b4c0-5020df5d3c2a	bee507a4-482d-46a6-8a42-74dfef1bd81c	2f8e6dd0-ac51-4a9b-bd18-70d13cc7987a	LINEUP_APPLIED	1	0	0	2026-10-03 08:44:27.166+00	2026-10-03 08:44:28.410776+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": "92fee266-d729-4ae2-bb8e-ab3a1dfd3d0e"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
f983d839-54fc-4438-8bb9-69c803fcccee	bee507a4-482d-46a6-8a42-74dfef1bd81c	d2f19689-4d20-4f06-9bf1-48d77b253975	KICKOFF	1	0	0	2026-10-03 08:44:31.059+00	2026-10-03 08:44:31.39381+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
2d372bd6-72fb-4e55-942b-624074f7dbd4	bee507a4-482d-46a6-8a42-74dfef1bd81c	0e7851b0-d62c-44af-af7a-ddc61f81a596	GOAL_FOR	1	0	1315	2026-10-03 08:44:32.374+00	2026-10-03 08:44:37.176715+00	{"assistId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf", "scorerId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
fd520f0c-a665-447a-96f9-c01fba8aaec4	bee507a4-482d-46a6-8a42-74dfef1bd81c	dd182fc7-9497-4780-bc8d-a7adfafdcec2	PERIOD_END	1	0	7669	2026-10-03 08:44:38.728+00	2026-10-03 08:44:39.106607+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
224c0804-8600-40d5-bbbf-8826a3079bf0	bee507a4-482d-46a6-8a42-74dfef1bd81c	b5ca4790-f14c-4734-a50e-73f15d69da94	KICKOFF	2	30	1800000	2026-10-03 08:44:39.977+00	2026-10-03 08:44:40.311225+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
1a21e160-62c0-4cb1-ba49-7a1b07bf9858	bee507a4-482d-46a6-8a42-74dfef1bd81c	4e2209df-2b47-4b46-b680-d46ff0e4f355	PERIOD_END	2	30	1800783	2026-10-03 08:44:40.76+00	2026-10-03 08:44:41.092518+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
446756cd-f7d7-446a-8e7e-de6a6553752b	bee507a4-482d-46a6-8a42-74dfef1bd81c	96e9a91a-b4fd-43bc-a218-4a2954dae269	FINAL_WHISTLE	2	30	1800783	2026-10-03 08:44:41.477+00	2026-10-03 08:44:42.51285+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
0e5fd957-6303-4520-bfff-b675da808ceb	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	0614bed5-1aae-43c9-b18e-df036ea85827	KICKOFF	1	0	0	2026-10-05 08:22:02.278+00	2026-10-05 08:22:03.240366+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
d9c88989-0e1e-4302-8c81-f3bf65c056d4	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	ccafed58-e526-4eba-8116-77f90e997d76	LINEUP_APPLIED	1	0	1563	2026-10-05 08:22:03.841+00	2026-10-05 08:22:03.98676+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "74dbf902-e056-4f04-a59b-dfcad74a08b8"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}], "lineupId": "0fbbf835-2f5e-4dcd-948c-5f3110665227"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
c13d40a8-e69a-4e35-9ab8-51757d0c4c2e	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	0103c390-7cd6-43ba-aae4-6cac40241b26	GOAL_FOR	1	0	3495	2026-10-05 08:22:05.773+00	2026-10-05 08:22:07.669788+00	{"assistId": "17322527-c8cd-4c71-8370-f5c9ec0226b7", "scorerId": "f633adf9-a43a-4297-825b-20aa746bd880"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
f361a410-6c85-4187-9365-a03a7f009a5d	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	7df6e91e-86b4-4bf7-b058-0bafd211fffb	SUBSTITUTION	1	0	6956	2026-10-05 08:22:09.234+00	2026-10-05 08:22:11.349652+00	{"inId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b", "outId": "a3900120-edbc-4e69-a776-b77d0004e756"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
e55ee530-24d4-48e7-bf3f-19b45a9801de	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	6c45f517-b205-46f0-b848-067f5d650f82	GOAL_AGAINST	1	0	9769	2026-10-05 08:22:12.047+00	2026-10-05 08:22:13.326714+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
691c7fa8-b5a4-4389-886b-613988456daa	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	701c668d-9e76-4f9e-923c-9fcd07a26d0f	COMMENT	1	0	11632	2026-10-05 08:22:13.91+00	2026-10-05 08:22:17.732038+00	{"note": "Th", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
55bb51c9-a1b3-4373-bc87-2ffe5518b75e	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	e8998014-547b-4446-8be0-9a39ca4caf5c	PERIOD_END	1	0	16707	2026-10-05 08:22:18.985+00	2026-10-05 08:22:19.097781+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
ed71d4ef-0acc-43b4-9591-5a1aaafd5ec9	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	6ad57bbe-92ef-4ad8-92cb-3b72a29ae036	GOAL_FOR	1	0	16707	2026-10-05 08:22:19.916+00	2026-10-05 08:22:22.067568+00	{"assistId": "f633adf9-a43a-4297-825b-20aa746bd880", "scorerId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
3ee46fe7-319d-4575-ad0b-0fc6edeeec8a	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	9f95cedf-3b49-49ca-964a-cc9c17a76d63	GOAL_FOR	1	0	16707	2026-10-05 08:22:22.498+00	2026-10-05 08:22:23.870609+00	{"assistId": "153db7ce-1f65-48c3-9620-1915dea7f171", "scorerId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	8
57336d88-10bd-4df6-8cd7-fb633353bdfa	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	d2841934-4874-4f67-8845-ccad446bcc67	KICKOFF	2	30	1800000	2026-10-05 08:22:28.488+00	2026-10-05 08:22:28.608051+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	9
ec9d2d68-9ba3-432d-9262-4e6d6bda6b28	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	804a13fa-7e10-401f-9523-a5454b5a4309	PERIOD_END	2	30	1801763	2026-10-05 08:22:30.251+00	2026-10-05 08:22:30.359399+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	10
7a6aab67-0eca-4a85-af57-3de3796686fe	8bfcb86c-18c3-44b0-b1ad-e3889e292f82	987778ed-f930-4eba-8a9f-ce0a3563033d	FINAL_WHISTLE	2	30	1801763	2026-10-05 08:22:31.067+00	2026-10-05 08:22:32.397322+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	11
25306688-2376-4746-8db8-dfb9dc916fec	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	bc03428e-80b3-445d-b02c-887311d08653	KICKOFF	1	0	0	2026-10-05 08:25:51.394+00	2026-10-05 08:25:51.546478+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
4d512d81-63a4-4ae8-a9e1-cd374379bc5c	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	32dc5759-3f8e-4667-a17f-a60d13e53f4d	LINEUP_APPLIED	1	0	981	2026-10-05 08:25:52.375+00	2026-10-05 08:25:52.486012+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": "b87dc7a5-be62-4ca1-b666-29d6e2350ff3"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
5db7287d-b08f-4b5c-8edc-46b5a5be626e	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	475f265e-cfb3-48ae-b5dd-3c97709acf00	GOAL_FOR	1	0	5475	2026-10-05 08:25:56.869+00	2026-10-05 08:26:01.909448+00	{"assistId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "scorerId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
d5f1ed2c-ddcc-486f-8e13-dd061055b5e7	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	58d4550d-5c7d-42f4-bf4b-b363447ac22e	GOAL_FOR	1	0	11483	2026-10-05 08:26:02.877+00	2026-10-05 08:26:05.303675+00	{"assistId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
84d586ca-c56d-4df1-958a-0718f79c91f2	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	43eeabab-1bd9-45a7-971a-8639a63eb892	REMARK	1	0	14629	2026-10-05 08:26:06.023+00	2026-10-05 08:26:10.826744+00	{"kind": "GOOD_TRACK_BACK", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
4c641f04-ec64-43d8-93d3-1c8bf415e18a	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	0cbd46b7-0e94-43a0-bbc9-8118ab663af8	GOAL_AGAINST	1	0	20303	2026-10-05 08:26:11.697+00	2026-10-05 08:26:13.120893+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
dc71ae9d-9d9e-49e3-9d4f-95cc56350ab6	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	cc697e5c-de16-417a-b6d8-7630df13ca18	GOAL_FOR	1	0	22218	2026-10-05 08:26:13.612+00	2026-10-05 08:26:16.991794+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
833a0590-4cf9-405c-821b-dd42afea75d0	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	7dc8a9dd-6cd7-4473-bb50-a82098403f38	GOAL_FOR	1	0	26062	2026-10-05 08:26:17.456+00	2026-10-05 08:26:19.242394+00	{"assistId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "scorerId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
65ca25d3-843d-4259-be93-c9eb9120e7e7	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	123db02c-1fba-47ae-8abf-aaed69a437ae	PENALTY_MISSED	1	0	32636	2026-10-05 08:26:24.03+00	2026-10-05 08:26:26.858136+00	{"scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	8
bbc21368-707d-4c84-ac8c-e9d09205d518	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	a50d19eb-f414-4e9c-8c5f-ba97a49c2421	PENALTY_SCORED	1	0	39758	2026-10-05 08:26:31.152+00	2026-10-05 08:26:35.412319+00	{"scorerId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	9
32ce133c-b3ed-4f98-b4df-af183cc16a59	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	4ae44225-2db4-4270-86ce-54f4c25df939	GOAL_FOR	1	1	71840	2026-10-05 08:27:03.234+00	2026-10-05 08:27:07.513705+00	{"assistId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	10
99da507c-0f1a-4029-ba0a-80e2f5575b82	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f4aeda41-fe7d-43de-8c41-5bc1a5e6f980	PAUSE	1	1	77367	2026-10-05 08:27:08.761+00	2026-10-05 08:27:08.877382+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	11
7ead9cde-1da1-43b3-b5b2-1fe3f4182d73	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f44d443d-8132-4634-a121-0156a4e9c824	RESUME	1	1	77367	2026-10-05 08:27:11.39+00	2026-10-05 08:27:11.529695+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	12
3cc746a1-b637-4514-a99c-715bdf05ce6c	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	36e1ea7a-cdf9-4aec-aa8b-cfef4d3e6bbb	PERIOD_END	1	1	79930	2026-10-05 08:27:13.953+00	2026-10-05 08:27:14.065037+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	13
62bb450e-a607-4eec-bc70-74a6477a430b	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f8f11e06-3ac0-4805-b31d-bc03b917edc8	KICKOFF	2	30	1800000	2026-10-05 08:27:17.516+00	2026-10-05 08:27:17.628556+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	14
49e1dd1e-05d7-4e2f-af59-e12ec7844c75	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	ab91eb79-4f5e-45a2-a2dd-1fe5365be98b	FINAL_WHISTLE	2	31	1875810	2026-10-05 08:28:34.188+00	2026-10-05 08:28:36.117377+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	18
4387b56c-f3e9-4712-9b51-594926e92a18	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	b30baaff-83b1-4071-bc24-9dca861a1524	SUBSTITUTION	2	30	1807922	2026-10-05 08:27:25.438+00	2026-10-05 08:27:28.260572+00	{"inId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f", "outId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	15
2acdcd8b-528c-4fce-ac6f-cdbeb5c62836	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	43c0e4d1-22fe-4dba-bd4c-77663f840687	GOAL_FOR	2	30	1811451	2026-10-05 08:27:28.967+00	2026-10-05 08:27:32.846608+00	{"assistId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	16
ab4f0e54-ff2d-4d15-8741-cc6aa1fbb9c8	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	595a2614-2bc6-42b4-a3dc-0a9b05a47054	PERIOD_END	2	31	1875810	2026-10-05 08:28:33.326+00	2026-10-05 08:28:33.49697+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	17
56ebe596-8d5c-4021-9c27-ef8dd9995b93	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	31657cd3-d81d-4d9d-a883-cbc3d62bc6ad	KICKOFF	1	0	0	2026-10-05 20:39:00.525+00	2026-10-05 20:39:01.521132+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
aa8b33e0-8669-4b51-a8b8-59ecc3843be5	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	efa9cd42-e64a-49ac-965f-549d96069160	LINEUP_APPLIED	1	0	2128	2026-10-05 20:39:02.653+00	2026-10-05 20:39:02.759705+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": "955254c3-b7e0-4cd1-bd0e-3046196c96fc"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
f0d0425e-a0fb-406b-a6c2-2bbd93a7bcaf	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	65caaef3-7852-4531-a3f3-4b75e7f173d5	GOAL_FOR	1	0	8338	2026-10-05 20:39:08.863+00	2026-10-05 20:39:12.22048+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
9c2bb440-330e-4c96-880b-507b533c7f8a	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	824279a0-b9af-45de-9bb3-c16bbdb29758	REMARK	1	0	20503	2026-10-05 20:39:21.028+00	2026-10-05 20:39:26.622062+00	{"kind": "GOOD_TRACK_BACK", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
0a434c2b-2383-4c9f-80d0-82c7b55d62e8	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	11035c50-e038-4974-9268-60720bef4f21	REMARK	1	0	26759	2026-10-05 20:39:27.284+00	2026-10-05 20:39:34.120242+00	{"kind": "GOOD_EFFORT", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
4dd73a33-cecc-4d05-9cdd-eb6aa4da7096	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	6bc8a32a-6895-4bf8-9b07-79b6735e0fcb	GOAL_AGAINST	1	0	36113	2026-10-05 20:39:36.638+00	2026-10-05 20:39:38.007429+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
69f891dd-3db9-49ce-a7e8-84882636746f	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	130d5d1a-adca-4c72-8e73-e02ffce13c3d	LINEUP_APPLIED	1	1	71656	2026-10-05 20:40:12.181+00	2026-10-05 20:40:12.320871+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "74dbf902-e056-4f04-a59b-dfcad74a08b8"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": "bb93c942-0d54-4099-87b5-898ad5771812"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
410f3f86-da24-4b19-9cb1-aaed4e7bdb70	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	9e4e72ec-3490-4da5-840e-6a1e5c204e1d	SUBSTITUTION	1	1	79215	2026-10-05 20:40:19.74+00	2026-10-05 20:40:25.297568+00	{"inId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f", "outId": "153db7ce-1f65-48c3-9620-1915dea7f171"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
df530e07-9d02-49e2-8240-510f67c16753	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	43527300-bd86-4b41-a65b-8ec55c3592ec	PERIOD_END	1	1	89151	2026-10-05 20:40:29.676+00	2026-10-05 20:40:29.779839+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	8
0cf11d62-831f-4205-a668-cc00f4678f71	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	931b2edf-2b89-42f3-99cf-c544ac0fef02	KICKOFF	2	30	1800000	2026-10-05 20:40:33.768+00	2026-10-05 20:40:33.858665+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	9
219bbf99-cf2b-4f72-9990-901876349e36	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	9646fa0c-f156-4d82-ac5d-20ed7bf1c898	PERIOD_END	2	30	1804628	2026-10-05 20:40:38.396+00	2026-10-05 20:40:38.504588+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	10
4a125f3a-b489-4280-9534-f13f217d420c	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	461baba7-88d7-450d-a684-51fc2bce0222	FINAL_WHISTLE	2	30	1804628	2026-10-05 20:40:39.028+00	2026-10-05 20:40:41.33739+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	11
f96d8d13-8872-4db2-be7e-69bc9b037b52	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	63b660ef-86c3-4afc-a625-33060c5fb296	LINEUP_APPLIED	1	0	0	2026-10-06 17:40:50.333+00	2026-10-06 17:40:51.40541+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}], "lineupId": "695cc50f-7615-4841-b182-7a21f94976b3"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
0ccbbb65-9e5d-4810-8065-f435f15415e4	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	5405d807-a97e-4f95-9265-6ee6a7feb09b	KICKOFF	1	0	0	2026-10-06 17:41:07.991+00	2026-10-06 17:41:08.348728+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
1a7ddd07-fae2-42ca-9d3c-96b5d42fae70	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	98aaab5d-1f1a-4e9b-84a0-7fcf708fca13	GOAL_FOR	1	0	5293	2026-10-06 17:41:13.284+00	2026-10-06 17:41:17.286181+00	{"assistId": "2c95b473-360e-4bc3-b016-3ced1e967f73", "scorerId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
8c47aaa0-ab14-4896-9614-0d494de521f3	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	f189dc1b-b5ea-4f3f-963c-5427202c1e50	GOAL_FOR	1	0	10169	2026-10-06 17:41:18.16+00	2026-10-06 17:41:22.220742+00	{"scorerId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
9b83cf88-7281-42ce-a7ee-bdf4237023e2	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	cf91b0bd-5c51-4a4e-8043-4325a09cb466	GOAL_AGAINST	1	0	14779	2026-10-06 17:41:22.77+00	2026-10-06 17:41:23.702035+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
29d8816b-ecc3-45a2-8707-5764bb84a27b	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	096fb42a-bfa0-4412-b725-5e757a2c9c81	REMARK	1	0	16161	2026-10-06 17:41:24.152+00	2026-10-06 17:41:32.90773+00	{"kind": "GOOD_TRACK_BACK", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
3ac1245f-b563-4c43-90c5-668eaa37b676	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	83b986cd-0bd1-4510-9d7c-590e66c3e5bd	COMMENT	1	0	30840	2026-10-06 17:41:38.831+00	2026-10-06 17:41:46.933403+00	{"note": "Cc", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
9085e49e-2299-4d7f-a91b-280cd4d665e2	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	e7095f8d-0a9d-463e-a828-37b17f798b92	PERIOD_END	1	0	43789	2026-10-06 17:41:51.78+00	2026-10-06 17:41:51.923013+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
5425b6ea-8344-4ac9-abe1-6f6abc1c14d6	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	cd1e3b20-16e8-473a-a4ae-d959e5f6364e	KICKOFF	2	30	1800000	2026-10-06 17:41:52.943+00	2026-10-06 17:41:53.061398+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	8
0ff79093-7131-4115-bc5e-f597dde929bb	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	926a617f-74cd-4b27-8fe4-22778c52d791	PERIOD_END	2	30	1800749	2026-10-06 17:41:53.692+00	2026-10-06 17:41:53.830424+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	9
3d50b513-88e9-4810-97b0-2b211a682a46	ff21f985-3600-49b4-81f4-81d4f2e3f7b3	c3467221-8176-4653-ab8b-e88e01d6242b	FINAL_WHISTLE	2	30	1800749	2026-10-06 17:41:54.259+00	2026-10-06 17:41:54.953328+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	10
4124c312-804d-43ae-8ebd-5f0aac8d3364	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	efe4e11b-95a5-43e4-a1ff-49a05e44336d	KICKOFF	2	30	1800000	2026-10-09 20:44:21.762+00	2026-10-09 20:44:21.880333+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	11
8d45f81b-4faa-4cb2-bf21-c9d72d05d8fa	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	b363a3a9-9667-4f41-b4a1-b953f38a81b4	PERIOD_END	2	30	1802647	2026-10-09 20:44:24.409+00	2026-10-09 20:44:25.546593+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	12
697c2e8a-2738-4d7d-8441-466f998acba2	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	b23cd181-12c1-44cf-971e-12d74336037c	FINAL_WHISTLE	2	30	1802647	2026-10-09 20:44:24.409+00	2026-10-09 20:44:25.546593+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	13
88f11f5c-d380-49c6-8787-32c00afd421c	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	7bd4be9d-612b-483b-8f2f-5fc18b296000	VOID	1	2	179064	2026-10-09 20:40:59.064+00	2026-10-09 20:44:52.544251+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	cc55720f-d641-4ec3-9562-25be63f29fb5	14
d0a8a1b0-0e99-443e-a384-632757074697	d653bc85-c303-4fbc-8124-89fecbdddffe	1b4014d6-b840-4552-bc2f-4161edd5019f	LINEUP_APPLIED	1	0	0	2026-10-09 13:04:35.524+00	2026-10-09 13:05:00.973375+00	{"slots": [{"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "74dbf902-e056-4f04-a59b-dfcad74a08b8"}, {"slotId": "da7145df-2a89-46b7-bc90-a47410fc1893", "memberId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
8c66a57b-e94f-48dc-9e4d-a7cc82953217	d653bc85-c303-4fbc-8124-89fecbdddffe	11b8dc1d-76db-441b-8412-599c49179490	KICKOFF	1	0	0	2026-10-09 13:05:54.919+00	2026-10-09 13:05:55.107728+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
76628a25-e708-443a-bc89-65dfd0538a8d	d653bc85-c303-4fbc-8124-89fecbdddffe	84e8f854-c2b1-41ad-9ca7-ba77c94021da	PAUSE	1	0	11741	2026-10-09 13:06:06.66+00	2026-10-09 13:06:06.797304+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
19dcc257-0cad-426f-a918-f5b6b02713ee	d653bc85-c303-4fbc-8124-89fecbdddffe	98fff7fb-2c77-4470-94db-fd118048cb3d	RESUME	1	0	11741	2026-10-09 13:07:49.715+00	2026-10-09 13:07:49.819722+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
6dbf519c-57c3-4db6-b451-aefbe0f31858	d653bc85-c303-4fbc-8124-89fecbdddffe	63eb580f-e165-43b9-b811-56d09d707e0b	PERIOD_END	1	0	15031	2026-10-09 13:07:53.005+00	2026-10-09 13:07:53.074922+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
df946482-cc4f-491e-b4b6-9456525a71b7	d653bc85-c303-4fbc-8124-89fecbdddffe	53a4d4e9-6b1d-4c21-94aa-1f0892db7480	KICKOFF	2	30	1800000	2026-10-09 13:07:56.034+00	2026-10-09 13:07:56.096175+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
a43b58c1-1331-4080-bd59-cd74edca4962	d653bc85-c303-4fbc-8124-89fecbdddffe	2c41806b-7326-47f2-a5f3-574003d34e6f	PERIOD_END	2	30	1803329	2026-10-09 13:07:59.363+00	2026-10-09 13:07:59.417872+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
6539d8bf-edc8-4eb7-a7c9-02d1ae125c79	d653bc85-c303-4fbc-8124-89fecbdddffe	e786b28b-70a8-4921-aa9a-62fe4fac361a	FINAL_WHISTLE	2	30	1803329	2026-10-09 13:08:19.38+00	2026-10-09 13:08:20.609798+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
7b8b6f56-1c91-47e8-aad3-cabc802ce5fd	13fbf924-51e6-4301-9785-4b178f4cb0aa	fbb246f6-9776-44d3-8655-4e3c10319954	LINEUP_APPLIED	1	0	0	2026-10-09 13:23:47.389+00	2026-10-09 13:24:03.381832+00	{"slots": [{"slotId": "c680a937-7c3e-4b33-880b-91c52a500f87", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "875ac75d-6558-40f3-89f0-91507b084269", "memberId": "f79bed48-b1dc-4d4a-86cd-b041e7f955bf"}, {"slotId": "62909a8b-5815-4988-8737-860f9d8434ad", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "f79fe536-adc1-4818-8a1f-6089d3a25e82", "memberId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}, {"slotId": "a9266115-7117-4497-83fa-98a3ae970f52", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "ef38f604-d443-4766-8c89-d28ccc77843b", "memberId": "74dbf902-e056-4f04-a59b-dfcad74a08b8"}, {"slotId": "54153f62-1512-4e58-bbbf-b40ee821a359", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
a1c97eb2-b40f-40b6-9451-6d356818a60c	13fbf924-51e6-4301-9785-4b178f4cb0aa	afd95ce7-d3b2-46c2-9877-f74f11edee30	KICKOFF	1	0	0	2026-10-09 13:24:04.471+00	2026-10-09 13:24:04.611549+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
2cdbd68d-e012-49fa-bc71-a095d927c563	13fbf924-51e6-4301-9785-4b178f4cb0aa	22a4183a-f1a9-4301-b7e3-25adcba36d46	SUBSTITUTION	1	0	996	2026-10-09 13:24:05.467+00	2026-10-09 13:24:25.516233+00	{"inId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd", "outId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
8c52aba1-652f-446a-a1cd-ff5a8cc03cda	13fbf924-51e6-4301-9785-4b178f4cb0aa	b8079ee5-7253-4fa3-8bef-e0b4736a242c	PERIOD_END	1	4	244098	2026-10-09 13:28:08.569+00	2026-10-09 13:28:08.770309+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
8c7fdc91-dde0-4e76-808b-b7e3844a4c6d	13fbf924-51e6-4301-9785-4b178f4cb0aa	7336d27b-ea15-460b-bcd8-ff79833a8cab	KICKOFF	2	30	1800000	2026-10-09 13:28:09.199+00	2026-10-09 13:28:09.270758+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
5efcbad6-ec1c-4e7c-b349-8ffbac1379f1	13fbf924-51e6-4301-9785-4b178f4cb0aa	ed2c39ea-839b-4f0a-a61e-6974b36f7d86	PERIOD_END	2	30	1800586	2026-10-09 13:28:09.785+00	2026-10-09 13:28:09.858294+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
5c2132cd-5e33-4508-be3c-529864b8125c	13fbf924-51e6-4301-9785-4b178f4cb0aa	c73dbb9c-9022-42a2-a77c-a1fe332da77d	FINAL_WHISTLE	2	30	1800586	2026-10-09 13:28:10.367+00	2026-10-09 13:28:11.146843+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
2419d449-e9eb-4067-904c-c1bb32544603	9282d8f5-82b6-44a1-9b42-32124808c137	25b84882-975e-46c7-b06f-8d57517e2594	KICKOFF	1	0	0	2026-10-09 20:38:28.637+00	2026-10-09 20:38:29.619713+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
9cae843b-4096-4463-933a-2a6475283188	9282d8f5-82b6-44a1-9b42-32124808c137	24550056-c057-4ae4-aa84-da8c204054fb	PERIOD_END	1	0	8902	2026-10-09 20:38:37.539+00	2026-10-09 20:38:37.780651+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
a3b3b7ed-7014-4bec-9907-9ecde527392d	9282d8f5-82b6-44a1-9b42-32124808c137	2a0c0d7e-2cf2-4338-a51e-394716fb6095	KICKOFF	2	30	1800000	2026-10-09 20:38:38.005+00	2026-10-09 20:38:38.127564+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
cfdc016f-efb6-474d-9a04-156a4717eae5	9282d8f5-82b6-44a1-9b42-32124808c137	5203adc2-5db4-41fd-97aa-d2a6dbd9c4d1	PERIOD_END	2	30	1800533	2026-10-09 20:38:38.538+00	2026-10-09 20:38:39.163056+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
f6c7b278-9cad-4bd4-b735-e833536d411f	9282d8f5-82b6-44a1-9b42-32124808c137	17136edc-73fe-4c09-9953-86fe6a335f3f	FINAL_WHISTLE	2	30	1800533	2026-10-09 20:38:38.538+00	2026-10-09 20:38:39.163056+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
2fae117d-5336-4fb8-8b3a-d664b0c5c8c6	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	67b108d4-ee4f-45d2-8cfe-f1f81e285d7a	LINEUP_APPLIED	1	0	0	2026-10-09 20:40:33.073+00	2026-10-09 20:40:33.312073+00	{"auto": true, "slots": [{"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "da7145df-2a89-46b7-bc90-a47410fc1893", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}], "lineupId": "4e665fc0-044c-49ee-9c4c-e16918ddeefe"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	0
590fa400-ce6b-43c4-b3c8-b09ae6d9a158	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	2bcdb33e-9f91-419f-a0ea-83a7888e77b5	KICKOFF	1	0	0	2026-10-09 20:40:45.854+00	2026-10-09 20:40:45.98132+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	1
a5f2ecec-c804-4c2f-aa1f-9197914b4164	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	094c878d-8a3a-4a40-9e1d-0fa63dda83e9	GOAL_FOR	1	0	15645	2026-10-09 20:41:01.499+00	2026-10-09 20:41:04.230984+00	{"assistId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef", "scorerId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	2
99fc039a-8558-48bb-b3ac-6576d289b27f	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	37f059ed-daf0-49c8-a77d-88138e834a78	LINEUP_APPLIED	1	0	22133	2026-10-09 20:41:07.987+00	2026-10-09 20:42:35.792177+00	{"slots": [{"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "17322527-c8cd-4c71-8370-f5c9ec0226b7"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}, {"slotId": "da7145df-2a89-46b7-bc90-a47410fc1893", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	3
1de57ee9-a7f7-4021-94f2-5d653f6e806d	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	4944dd3b-7f35-461c-bf86-17bd049cb9e7	LINEUP_APPLIED	1	1	111727	2026-10-09 20:42:37.581+00	2026-10-09 20:43:01.699939+00	{"slots": [{"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}, {"slotId": "da7145df-2a89-46b7-bc90-a47410fc1893", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	4
4c768859-9900-44e0-a556-f43d74355c67	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	1ddccf04-18f8-40b5-ae85-847bbd1a5f15	LINEUP_APPLIED	1	2	143516	2026-10-09 20:43:09.37+00	2026-10-09 20:43:15.514256+00	{"slots": [{"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}, {"slotId": "da7145df-2a89-46b7-bc90-a47410fc1893", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	5
457a8e12-bff8-4122-8326-2937d14d22e1	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	8eaba7b3-0faf-4c56-b8d9-aa1c23f9700e	REMARK	1	2	164086	2026-10-09 20:43:29.94+00	2026-10-09 20:43:33.111223+00	{"kind": "BAD_PASS", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	6
28ee904c-e8ac-46bd-898e-e219b46890ed	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	83010042-4b0a-4cb5-9852-80742ddf52f3	GOAL_AGAINST	1	2	171259	2026-10-09 20:43:37.113+00	2026-10-09 20:43:38.073924+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	7
202b425e-4aeb-401a-b34f-46e0019621f9	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	97eaf8c6-1890-4f12-a246-9e59b08e8049	GOAL_FOR	1	2	175735	2026-10-09 20:43:41.589+00	2026-10-09 20:43:44.032022+00	{"assistId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b", "scorerId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	8
cc55720f-d641-4ec3-9562-25be63f29fb5	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	2dc20e8b-6b9b-435f-a45a-8b2e7b13e3a8	LINEUP_APPLIED	1	2	179064	2026-10-09 20:43:44.918+00	2026-10-09 20:43:54.952742+00	{"slots": [{"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "153db7ce-1f65-48c3-9620-1915dea7f171"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "5b1a91c4-cdd6-498f-b668-ca82ba6b677b"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	9
e9540c01-6d57-424d-ab37-5397f6b4019f	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	c4bd74d0-d8eb-4cb1-81f4-00561c7c8d0a	PERIOD_END	1	3	214759	2026-10-09 20:44:20.613+00	2026-10-09 20:44:20.778421+00	{}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	10
45c0c5ee-156c-4958-a856-9b653ea17319	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	6fdbbbb2-0e96-484c-8c11-5a066c632000	LINEUP_APPLIED	1	2	120000	2026-10-09 20:40:00+00	2026-10-09 20:45:13.959365+00	{"slots": [{"slotId": "1ce94d4c-fd2e-4ad1-9627-d97c124d5a80", "memberId": "5b2e63e1-fef3-4f78-808c-d1e443641ffd"}, {"slotId": "2811eff7-1102-41b1-9796-a52785d70fbf", "memberId": "a3900120-edbc-4e69-a776-b77d0004e756"}, {"slotId": "801e490f-7bfd-4f5e-bde1-232c6b1aae3d", "memberId": "86848bee-bf7f-4ff2-80b9-15c96ec4f0ef"}, {"slotId": "781e9644-3370-4c86-93f7-7cf132c2612a", "memberId": "2c95b473-360e-4bc3-b016-3ced1e967f73"}, {"slotId": "a0964308-978c-4c92-84fe-b41c79fb8c22", "memberId": "3f4cfe2d-d5b6-41ac-bd34-cf90698a2971"}, {"slotId": "1b603cc6-e7b1-41b2-88d2-b4ae36a01213", "memberId": "f633adf9-a43a-4297-825b-20aa746bd880"}, {"slotId": "da7145df-2a89-46b7-bc90-a47410fc1893", "memberId": "91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c"}], "lineupId": null}	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	\N	15
\.


--
-- Data for Name: match_player_positions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.match_player_positions (match_id, team_member_id, position_code, minutes, goals_for, goals_against) FROM stdin;
d371fb5c-f2bb-4021-af71-6dc20d7804e5	153db7ce-1f65-48c3-9620-1915dea7f171	MC	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	17322527-c8cd-4c71-8370-f5c9ec0226b7	DD	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	DG	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	f633adf9-a43a-4297-825b-20aa746bd880	DC	60	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	153db7ce-1f65-48c3-9620-1915dea7f171	DC	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	f633adf9-a43a-4297-825b-20aa746bd880	DD	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	17322527-c8cd-4c71-8370-f5c9ec0226b7	MC	2	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	2c95b473-360e-4bc3-b016-3ced1e967f73	DC	2	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	2	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	DD	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AT	2	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	f633adf9-a43a-4297-825b-20aa746bd880	DG	2	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	153db7ce-1f65-48c3-9620-1915dea7f171	GB	1	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	DD	1	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	74dbf902-e056-4f04-a59b-dfcad74a08b8	MC	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	GB	0	0	0
c1856b4a-38c8-4936-8066-8fd508bc028f	153db7ce-1f65-48c3-9620-1915dea7f171	DC	60	2	0
c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	60	2	0
c1856b4a-38c8-4936-8066-8fd508bc028f	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	60	2	0
c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	60	2	0
c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	60	2	0
c1856b4a-38c8-4936-8066-8fd508bc028f	f633adf9-a43a-4297-825b-20aa746bd880	DD	60	2	0
c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	40	1	0
c1856b4a-38c8-4936-8066-8fd508bc028f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	AT	12	1	0
c1856b4a-38c8-4936-8066-8fd508bc028f	a3900120-edbc-4e69-a776-b77d0004e756	AT	8	0	0
1a7348fe-3173-41c1-8716-0ec7b031a153	153db7ce-1f65-48c3-9620-1915dea7f171	DC	60	3	2
1a7348fe-3173-41c1-8716-0ec7b031a153	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	60	3	2
1a7348fe-3173-41c1-8716-0ec7b031a153	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	55	3	2
1a7348fe-3173-41c1-8716-0ec7b031a153	5b2e63e1-fef3-4f78-808c-d1e443641ffd	AT	5	0	0
1a7348fe-3173-41c1-8716-0ec7b031a153	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	60	3	2
1a7348fe-3173-41c1-8716-0ec7b031a153	f633adf9-a43a-4297-825b-20aa746bd880	DD	60	3	2
1a7348fe-3173-41c1-8716-0ec7b031a153	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	55	3	2
1a7348fe-3173-41c1-8716-0ec7b031a153	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	38	2	1
1a7348fe-3173-41c1-8716-0ec7b031a153	74dbf902-e056-4f04-a59b-dfcad74a08b8	MC	22	1	1
1a7348fe-3173-41c1-8716-0ec7b031a153	a3900120-edbc-4e69-a776-b77d0004e756	MC	5	0	0
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	153db7ce-1f65-48c3-9620-1915dea7f171	MC	0	3	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	17322527-c8cd-4c71-8370-f5c9ec0226b7	DC	0	3	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	5b2e63e1-fef3-4f78-808c-d1e443641ffd	AT	0	3	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	74dbf902-e056-4f04-a59b-dfcad74a08b8	GB	0	3	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	DG	0	3	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	f633adf9-a43a-4297-825b-20aa746bd880	MC	0	3	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	DD	0	2	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	a3900120-edbc-4e69-a776-b77d0004e756	DD	0	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	2c95b473-360e-4bc3-b016-3ced1e967f73	DC	2	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	2c95b473-360e-4bc3-b016-3ced1e967f73	AIL	2	1	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	a3900120-edbc-4e69-a776-b77d0004e756	AT	2	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	a3900120-edbc-4e69-a776-b77d0004e756	DC	2	1	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	f633adf9-a43a-4297-825b-20aa746bd880	MC	3	2	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	f633adf9-a43a-4297-825b-20aa746bd880	AIL	0	0	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AT	2	1	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AIL	1	0	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	DC	2	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	GB	2	1	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	AIL	0	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	17322527-c8cd-4c71-8370-f5c9ec0226b7	AIL	2	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	GB	2	1	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	153db7ce-1f65-48c3-9620-1915dea7f171	DC	1	1	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	AIL	1	1	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	MC	1	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	153db7ce-1f65-48c3-9620-1915dea7f171	MC	0	1	0
24f4595a-9be1-43fd-ada5-f524edaff258	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	0	1	0
24f4595a-9be1-43fd-ada5-f524edaff258	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	AT	0	1	0
24f4595a-9be1-43fd-ada5-f524edaff258	5b2e63e1-fef3-4f78-808c-d1e443641ffd	DD	0	1	0
24f4595a-9be1-43fd-ada5-f524edaff258	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	MC	0	1	0
24f4595a-9be1-43fd-ada5-f524edaff258	f633adf9-a43a-4297-825b-20aa746bd880	DC	0	1	0
24f4595a-9be1-43fd-ada5-f524edaff258	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	GB	0	1	0
94e1dbcb-033d-429e-b4ef-a94190c4770c	153db7ce-1f65-48c3-9620-1915dea7f171	MC	60	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	17322527-c8cd-4c71-8370-f5c9ec0226b7	DD	60	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	60	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	DG	60	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	60	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	60	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	f633adf9-a43a-4297-825b-20aa746bd880	DC	60	1	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	153db7ce-1f65-48c3-9620-1915dea7f171	GB	0	1	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	153db7ce-1f65-48c3-9620-1915dea7f171	DC	60	2	1
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	60	2	1
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	38	1	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	AT	22	1	1
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5bfa639f-99ee-477f-8a1a-435f435a7ed8	AT	38	1	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5bfa639f-99ee-477f-8a1a-435f435a7ed8	MC	22	1	1
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	60	2	1
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	f633adf9-a43a-4297-825b-20aa746bd880	DD	60	2	1
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	30	2	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	MC	30	0	1
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	153db7ce-1f65-48c3-9620-1915dea7f171	DC	60	3	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	60	3	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	60	3	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	60	3	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	f633adf9-a43a-4297-825b-20aa746bd880	DD	60	3	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	50	2	1
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	GB	30	2	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	30	1	0
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	a3900120-edbc-4e69-a776-b77d0004e756	AT	10	1	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	17322527-c8cd-4c71-8370-f5c9ec0226b7	DD	0	1	0
bee507a4-482d-46a6-8a42-74dfef1bd81c	5b2e63e1-fef3-4f78-808c-d1e443641ffd	DG	0	1	0
bee507a4-482d-46a6-8a42-74dfef1bd81c	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	MC	0	1	0
bee507a4-482d-46a6-8a42-74dfef1bd81c	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AT	0	1	0
bee507a4-482d-46a6-8a42-74dfef1bd81c	f633adf9-a43a-4297-825b-20aa746bd880	DC	0	1	0
bee507a4-482d-46a6-8a42-74dfef1bd81c	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	MC	0	1	0
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	17322527-c8cd-4c71-8370-f5c9ec0226b7	MC	3	7	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	2c95b473-360e-4bc3-b016-3ced1e967f73	GB	3	7	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	DD	3	7	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	3	7	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AT	3	7	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f633adf9-a43a-4297-825b-20aa746bd880	DG	3	7	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	DC	1	6	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	DC	1	1	0
d653bc85-c303-4fbc-8124-89fecbdddffe	153db7ce-1f65-48c3-9620-1915dea7f171	DC	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	GB	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	AT	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	74dbf902-e056-4f04-a59b-dfcad74a08b8	AIL	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	DC	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	f633adf9-a43a-4297-825b-20aa746bd880	AIL	0	0	0
5e3c9abc-9002-4d17-aaf7-638422789ca9	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	60	1	3
5e3c9abc-9002-4d17-aaf7-638422789ca9	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	60	1	3
5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	60	1	3
5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	60	1	3
5e3c9abc-9002-4d17-aaf7-638422789ca9	f633adf9-a43a-4297-825b-20aa746bd880	DD	60	1	3
5e3c9abc-9002-4d17-aaf7-638422789ca9	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	53	1	3
5e3c9abc-9002-4d17-aaf7-638422789ca9	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	DC	36	1	2
5e3c9abc-9002-4d17-aaf7-638422789ca9	153db7ce-1f65-48c3-9620-1915dea7f171	DC	24	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	a3900120-edbc-4e69-a776-b77d0004e756	MC	7	0	0
5d187aaf-989e-449f-ac7d-219d6a41f14f	153db7ce-1f65-48c3-9620-1915dea7f171	DC	22	2	3
5d187aaf-989e-449f-ac7d-219d6a41f14f	2c95b473-360e-4bc3-b016-3ced1e967f73	DG	17	1	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	5	1	1
5d187aaf-989e-449f-ac7d-219d6a41f14f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	MC	22	2	3
5d187aaf-989e-449f-ac7d-219d6a41f14f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	22	2	3
5d187aaf-989e-449f-ac7d-219d6a41f14f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	GB	22	2	3
5d187aaf-989e-449f-ac7d-219d6a41f14f	f633adf9-a43a-4297-825b-20aa746bd880	DD	22	2	3
5d187aaf-989e-449f-ac7d-219d6a41f14f	a3900120-edbc-4e69-a776-b77d0004e756	DG	18	1	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	5	1	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	153db7ce-1f65-48c3-9620-1915dea7f171	MC	1	2	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	17322527-c8cd-4c71-8370-f5c9ec0226b7	DD	1	2	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	2c95b473-360e-4bc3-b016-3ced1e967f73	DC	1	2	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	GB	1	2	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	AT	1	2	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	DG	1	2	1
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	f633adf9-a43a-4297-825b-20aa746bd880	MC	1	2	1
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	153db7ce-1f65-48c3-9620-1915dea7f171	DC	60	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	17322527-c8cd-4c71-8370-f5c9ec0226b7	DG	60	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	60	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	60	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	GB	60	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	f633adf9-a43a-4297-825b-20aa746bd880	DD	60	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	a3900120-edbc-4e69-a776-b77d0004e756	AT	50	2	1
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	10	0	1
13fbf924-51e6-4301-9785-4b178f4cb0aa	2c95b473-360e-4bc3-b016-3ced1e967f73	MC	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	GB	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	74dbf902-e056-4f04-a59b-dfcad74a08b8	MC	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	DC	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	a3900120-edbc-4e69-a776-b77d0004e756	AT	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	DG	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	5b2e63e1-fef3-4f78-808c-d1e443641ffd	DD	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	DD	0	0	0
\.


--
-- Data for Name: match_player_stats; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.match_player_stats (match_id, team_member_id, minutes, goals, assists, own_goals, penalties_scored, penalties_missed, fouls, gk_minutes, clean_minutes, conceded_while_on, squad_role, computed_at, gk_clean_minutes, conceded_while_gk, goals_for_while_on) FROM stdin;
d371fb5c-f2bb-4021-af71-6dc20d7804e5	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:05.09+00	0	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:05.09+00	0	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	2c95b473-360e-4bc3-b016-3ced1e967f73	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:05.09+00	0	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:05.09+00	0	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:05.09+00	0	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	60	0	0	0	0	0	0	60	60	0	starter	2026-10-09 21:51:05.09+00	60	0	0
d371fb5c-f2bb-4021-af71-6dc20d7804e5	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:05.09+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	2c95b473-360e-4bc3-b016-3ced1e967f73	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	f633adf9-a43a-4297-825b-20aa746bd880	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:16.383+00	0	0	0
e47008a7-578a-4da9-a785-0fc6c1ff679a	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-09 21:51:16.383+00	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	17322527-c8cd-4c71-8370-f5c9ec0226b7	2	0	0	0	0	0	0	0	1	1	starter	2026-10-09 21:51:27.526+00	0	0	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	2c95b473-360e-4bc3-b016-3ced1e967f73	2	0	1	0	0	0	0	0	1	1	starter	2026-10-09 21:51:27.526+00	0	0	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2	0	0	0	0	0	0	0	1	1	starter	2026-10-09 21:51:27.526+00	0	0	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	2	0	0	0	0	0	0	0	1	1	starter	2026-10-09 21:51:27.526+00	0	0	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	f633adf9-a43a-4297-825b-20aa746bd880	2	0	0	0	0	0	0	0	1	1	starter	2026-10-09 21:51:27.526+00	0	0	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	153db7ce-1f65-48c3-9620-1915dea7f171	1	0	0	0	0	0	0	1	1	1	starter	2026-10-09 21:51:27.526+00	1	1	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	1	1	0	0	0	0	0	0	1	1	starter	2026-10-09 21:51:27.526+00	0	0	1
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:27.526+00	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:27.526+00	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-09 21:51:27.526+00	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:27.526+00	0	0	0
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:27.526+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	f633adf9-a43a-4297-825b-20aa746bd880	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
1a7348fe-3173-41c1-8716-0ec7b031a153	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	1	0	24	2	starter	2026-10-09 21:50:49.828+00	0	0	3
c1856b4a-38c8-4936-8066-8fd508bc028f	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:07.941+00	0	0	2
c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	60	0	starter	2026-10-09 21:51:07.941+00	0	0	2
1a7348fe-3173-41c1-8716-0ec7b031a153	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	24	2	starter	2026-10-09 21:50:49.828+00	0	0	3
1a7348fe-3173-41c1-8716-0ec7b031a153	5b2e63e1-fef3-4f78-808c-d1e443641ffd	60	1	1	0	0	0	0	0	24	2	starter	2026-10-09 21:50:49.828+00	0	0	3
1a7348fe-3173-41c1-8716-0ec7b031a153	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	60	0	0	0	0	0	0	60	24	2	starter	2026-10-09 21:50:49.828+00	24	2	3
1a7348fe-3173-41c1-8716-0ec7b031a153	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	1	0	0	0	0	24	2	starter	2026-10-09 21:50:49.828+00	0	0	3
1a7348fe-3173-41c1-8716-0ec7b031a153	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	55	2	0	0	1	0	0	0	24	2	starter	2026-10-09 21:50:49.828+00	0	0	3
1a7348fe-3173-41c1-8716-0ec7b031a153	2c95b473-360e-4bc3-b016-3ced1e967f73	38	0	1	0	0	0	0	0	24	1	starter	2026-10-09 21:50:49.828+00	0	0	2
1a7348fe-3173-41c1-8716-0ec7b031a153	74dbf902-e056-4f04-a59b-dfcad74a08b8	22	0	0	0	0	0	0	0	13	1	substitute	2026-10-09 21:50:49.828+00	0	0	1
1a7348fe-3173-41c1-8716-0ec7b031a153	a3900120-edbc-4e69-a776-b77d0004e756	5	0	0	0	0	1	0	0	5	0	substitute	2026-10-09 21:50:49.828+00	0	0	0
1a7348fe-3173-41c1-8716-0ec7b031a153	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:49.828+00	0	0	0
1a7348fe-3173-41c1-8716-0ec7b031a153	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:49.828+00	0	0	0
c1856b4a-38c8-4936-8066-8fd508bc028f	2c95b473-360e-4bc3-b016-3ced1e967f73	60	0	1	0	0	0	0	0	60	0	starter	2026-10-09 21:51:07.941+00	0	0	2
c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	60	0	1	0	0	0	0	0	60	0	starter	2026-10-09 21:51:07.941+00	0	0	2
c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	60	0	0	0	0	0	0	60	60	0	starter	2026-10-09 21:51:07.941+00	60	0	2
c1856b4a-38c8-4936-8066-8fd508bc028f	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	1	0	60	0	starter	2026-10-09 21:51:07.941+00	0	0	2
c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	40	1	0	0	0	0	0	0	40	0	starter	2026-10-09 21:51:07.941+00	0	0	1
c1856b4a-38c8-4936-8066-8fd508bc028f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	12	1	0	0	0	0	0	0	12	0	substitute	2026-10-09 21:51:07.941+00	0	0	1
c1856b4a-38c8-4936-8066-8fd508bc028f	a3900120-edbc-4e69-a776-b77d0004e756	8	0	0	0	0	0	0	0	8	0	substitute	2026-10-09 21:51:07.941+00	0	0	0
c1856b4a-38c8-4936-8066-8fd508bc028f	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:07.941+00	0	0	0
c1856b4a-38c8-4936-8066-8fd508bc028f	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:07.941+00	0	0	0
c1856b4a-38c8-4936-8066-8fd508bc028f	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-09 21:51:07.941+00	0	0	0
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	1	0	0	0	0	0	0	1	starter	2026-10-09 21:51:21.954+00	0	0	3
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	1	0	0	0	0	0	0	1	starter	2026-10-09 21:51:21.954+00	0	0	3
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:21.954+00	0	0	3
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:21.954+00	0	1	3
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:21.954+00	0	0	3
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	f633adf9-a43a-4297-825b-20aa746bd880	0	1	1	0	0	0	0	0	0	1	starter	2026-10-09 21:51:21.954+00	0	0	3
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	2	0	0	0	0	0	0	0	1	\N	2026-10-09 21:51:21.954+00	0	0	2
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:21.954+00	0	0	1
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	2c95b473-360e-4bc3-b016-3ced1e967f73	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:21.954+00	0	0	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	0	0	44	1	starter	2026-10-09 21:50:52.765+00	0	0	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	44	1	starter	2026-10-09 21:50:52.765+00	0	0	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	60	1	1	0	0	0	0	0	44	1	starter	2026-10-09 21:50:52.765+00	0	0	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5bfa639f-99ee-477f-8a1a-435f435a7ed8	60	1	1	0	0	0	0	0	44	1	starter	2026-10-09 21:50:52.765+00	0	0	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	60	0	0	0	0	0	0	60	44	1	starter	2026-10-09 21:50:52.765+00	44	1	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	0	0	44	1	starter	2026-10-09 21:50:52.765+00	0	0	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	2c95b473-360e-4bc3-b016-3ced1e967f73	30	0	0	0	0	0	0	0	30	0	starter	2026-10-09 21:50:52.765+00	0	0	2
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	30	0	0	0	0	0	0	0	24	1	substitute	2026-10-09 21:50:52.765+00	0	0	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:52.765+00	0	0	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:52.765+00	0	0	0
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-09 21:50:52.765+00	0	0	0
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	0	0	35	2	starter	2026-10-09 21:51:01.162+00	0	0	3
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	35	2	starter	2026-10-09 21:51:01.162+00	0	0	3
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	2c95b473-360e-4bc3-b016-3ced1e967f73	60	0	1	0	0	0	0	0	35	2	starter	2026-10-09 21:51:01.162+00	0	0	3
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	5b2e63e1-fef3-4f78-808c-d1e443641ffd	60	1	2	0	0	0	0	0	35	2	starter	2026-10-09 21:51:01.162+00	0	0	3
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	0	0	35	2	starter	2026-10-09 21:51:01.162+00	0	0	3
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	50	1	0	0	0	0	0	0	35	1	starter	2026-10-09 21:51:01.162+00	0	0	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	30	0	0	0	0	0	0	30	5	2	substitute	2026-10-09 21:51:01.162+00	5	2	2
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	30	0	0	0	0	0	0	30	30	0	starter	2026-10-09 21:51:01.162+00	30	0	1
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	a3900120-edbc-4e69-a776-b77d0004e756	10	1	0	0	0	0	0	0	2	1	substitute	2026-10-09 21:51:01.162+00	0	0	1
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:01.162+00	0	0	0
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:01.162+00	0	0	0
94e1dbcb-033d-429e-b4ef-a94190c4770c	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	0	0	30	1	starter	2026-10-09 21:51:10.739+00	0	0	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	30	1	starter	2026-10-09 21:51:10.739+00	0	0	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	2c95b473-360e-4bc3-b016-3ced1e967f73	60	0	0	0	0	0	0	0	30	1	starter	2026-10-09 21:51:10.739+00	0	0	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	60	0	0	0	0	0	0	0	30	1	starter	2026-10-09 21:51:10.739+00	0	0	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	60	0	0	0	0	0	0	0	30	1	starter	2026-10-09 21:51:10.739+00	0	0	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	60	0	0	0	0	0	0	60	30	1	starter	2026-10-09 21:51:10.739+00	30	1	1
94e1dbcb-033d-429e-b4ef-a94190c4770c	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	0	0	30	1	starter	2026-10-09 21:51:10.739+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	1	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	f633adf9-a43a-4297-825b-20aa746bd880	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	1	0	0	0	0	0	0	0	starter	2026-10-09 21:51:19.17+00	0	0	1
bee507a4-482d-46a6-8a42-74dfef1bd81c	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-09 21:51:19.17+00	0	0	0
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	17322527-c8cd-4c71-8370-f5c9ec0226b7	3	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:24.737+00	0	0	7
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	2c95b473-360e-4bc3-b016-3ced1e967f73	3	0	1	0	0	0	0	3	0	1	starter	2026-10-09 21:51:24.737+00	0	1	7
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	3	3	4	0	1	0	0	0	0	1	substitute	2026-10-09 21:51:24.737+00	0	0	7
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	3	3	1	0	0	1	0	0	0	1	starter	2026-10-09 21:51:24.737+00	0	0	7
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	3	1	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:24.737+00	0	0	7
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f633adf9-a43a-4297-825b-20aa746bd880	3	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:24.737+00	0	0	7
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	1	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:24.737+00	0	0	6
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	1	0	0	0	0	0	0	0	1	0	substitute	2026-10-09 21:51:24.737+00	0	0	1
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:24.737+00	0	0	0
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:24.737+00	0	0	0
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:24.737+00	0	0	0
5e3c9abc-9002-4d17-aaf7-638422789ca9	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	8	3	starter	2026-10-09 21:50:55.587+00	0	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	5b2e63e1-fef3-4f78-808c-d1e443641ffd	60	0	0	0	0	0	1	0	8	3	starter	2026-10-09 21:50:55.587+00	0	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	60	1	0	0	0	0	0	0	8	3	starter	2026-10-09 21:50:55.587+00	0	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	60	0	0	0	0	0	0	60	8	3	starter	2026-10-09 21:50:55.587+00	8	3	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	0	0	8	3	starter	2026-10-09 21:50:55.587+00	0	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	2c95b473-360e-4bc3-b016-3ced1e967f73	53	0	1	0	0	0	0	0	8	3	starter	2026-10-09 21:50:55.587+00	0	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	36	0	0	0	0	0	0	0	8	2	starter	2026-10-09 21:50:55.587+00	0	0	1
5e3c9abc-9002-4d17-aaf7-638422789ca9	153db7ce-1f65-48c3-9620-1915dea7f171	24	0	0	0	0	0	0	0	13	1	substitute	2026-10-09 21:50:55.587+00	0	0	0
5e3c9abc-9002-4d17-aaf7-638422789ca9	a3900120-edbc-4e69-a776-b77d0004e756	7	0	0	0	0	0	0	0	7	0	substitute	2026-10-09 21:50:55.587+00	0	0	0
5e3c9abc-9002-4d17-aaf7-638422789ca9	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:55.587+00	0	0	0
5d187aaf-989e-449f-ac7d-219d6a41f14f	153db7ce-1f65-48c3-9620-1915dea7f171	22	0	0	0	0	0	0	0	2	3	starter	2026-10-09 21:51:13.591+00	0	0	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	2c95b473-360e-4bc3-b016-3ced1e967f73	22	0	0	0	0	0	0	0	2	3	starter	2026-10-09 21:51:13.591+00	0	0	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	22	0	1	0	0	0	0	0	2	3	starter	2026-10-09 21:51:13.591+00	0	0	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	22	2	0	0	0	0	0	0	2	3	starter	2026-10-09 21:51:13.591+00	0	0	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	22	0	0	0	0	0	0	22	2	3	starter	2026-10-09 21:51:13.591+00	2	3	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	f633adf9-a43a-4297-825b-20aa746bd880	22	0	0	0	0	0	0	0	2	3	starter	2026-10-09 21:51:13.591+00	0	0	2
5d187aaf-989e-449f-ac7d-219d6a41f14f	a3900120-edbc-4e69-a776-b77d0004e756	18	0	0	0	0	0	0	0	3	2	substitute	2026-10-09 21:51:13.591+00	0	0	1
5d187aaf-989e-449f-ac7d-219d6a41f14f	17322527-c8cd-4c71-8370-f5c9ec0226b7	5	0	0	0	0	0	0	0	2	1	starter	2026-10-09 21:51:13.591+00	0	0	1
5d187aaf-989e-449f-ac7d-219d6a41f14f	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	supporter	2026-10-09 21:51:13.591+00	0	0	0
5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:13.591+00	0	0	0
5d187aaf-989e-449f-ac7d-219d6a41f14f	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:13.591+00	0	0	0
5d187aaf-989e-449f-ac7d-219d6a41f14f	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:13.591+00	0	0	0
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	153db7ce-1f65-48c3-9620-1915dea7f171	1	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:30.31+00	0	0	2
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	17322527-c8cd-4c71-8370-f5c9ec0226b7	1	2	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:30.31+00	0	0	2
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	2c95b473-360e-4bc3-b016-3ced1e967f73	1	0	1	0	0	0	0	0	0	1	starter	2026-10-09 21:51:30.31+00	0	0	2
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	1	0	0	0	0	0	0	1	0	1	starter	2026-10-09 21:51:30.31+00	0	1	2
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	1	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:30.31+00	0	0	2
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	1	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:30.31+00	0	0	2
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	f633adf9-a43a-4297-825b-20aa746bd880	1	0	0	0	0	0	0	0	0	1	starter	2026-10-09 21:51:30.31+00	0	0	2
3146fd05-7672-417b-9149-215f88ce487a	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	2c95b473-360e-4bc3-b016-3ced1e967f73	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:48.616+00	0	0	0
3146fd05-7672-417b-9149-215f88ce487a	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:48.616+00	0	0	0
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	153db7ce-1f65-48c3-9620-1915dea7f171	60	0	0	0	0	0	0	0	23	2	starter	2026-10-09 21:50:58.375+00	0	0	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	17322527-c8cd-4c71-8370-f5c9ec0226b7	60	0	0	0	0	0	0	0	23	2	starter	2026-10-09 21:50:58.375+00	0	0	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	2c95b473-360e-4bc3-b016-3ced1e967f73	60	0	0	0	0	0	0	0	23	2	starter	2026-10-09 21:50:58.375+00	0	0	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	5b2e63e1-fef3-4f78-808c-d1e443641ffd	60	0	1	0	0	0	0	0	23	2	starter	2026-10-09 21:50:58.375+00	0	0	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	60	0	0	0	0	0	0	60	23	2	starter	2026-10-09 21:50:58.375+00	23	2	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	f633adf9-a43a-4297-825b-20aa746bd880	60	0	0	0	0	0	0	0	23	2	starter	2026-10-09 21:50:58.375+00	0	0	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	a3900120-edbc-4e69-a776-b77d0004e756	50	1	0	0	0	0	0	0	23	1	starter	2026-10-09 21:50:58.375+00	0	0	2
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	10	0	0	0	0	0	0	0	7	1	substitute	2026-10-09 21:50:58.375+00	0	0	0
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:58.375+00	0	0	0
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:50:58.375+00	0	0	0
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:21.954+00	0	0	0
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:21.954+00	0	0	0
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	2c95b473-360e-4bc3-b016-3ced1e967f73	4	1	0	0	0	0	0	0	3	1	starter	2026-10-09 21:51:37.64+00	0	0	2
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	a3900120-edbc-4e69-a776-b77d0004e756	4	0	0	0	0	0	0	0	3	1	starter	2026-10-09 21:51:37.64+00	0	0	2
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	f633adf9-a43a-4297-825b-20aa746bd880	3	0	0	0	0	0	0	0	3	1	starter	2026-10-09 21:51:37.64+00	0	0	2
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	3	0	0	0	0	0	0	0	2	1	\N	2026-10-09 21:51:37.64+00	0	0	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	2	0	1	0	0	0	0	0	2	0	starter	2026-10-09 21:51:37.64+00	0	0	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2	1	0	0	0	0	0	2	1	1	starter	2026-10-09 21:51:37.64+00	1	1	2
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	17322527-c8cd-4c71-8370-f5c9ec0226b7	2	0	0	0	0	0	0	0	2	0	starter	2026-10-09 21:51:37.64+00	0	0	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	2	0	0	0	0	0	0	2	2	0	starter	2026-10-09 21:51:37.64+00	2	0	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	153db7ce-1f65-48c3-9620-1915dea7f171	1	0	0	0	0	0	0	0	1	1	\N	2026-10-09 21:51:37.64+00	0	0	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	1	0	1	0	0	0	0	0	1	1	\N	2026-10-09 21:51:37.64+00	0	0	1
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	1	0	0	0	0	0	0	0	1	0	\N	2026-10-09 21:51:37.64+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	2c95b473-360e-4bc3-b016-3ced1e967f73	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	f633adf9-a43a-4297-825b-20aa746bd880	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
96fa070c-58f6-4318-bd53-c310e3f7e635	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:46.108+00	0	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	1	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	f633adf9-a43a-4297-825b-20aa746bd880	0	0	1	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	1
24f4595a-9be1-43fd-ada5-f524edaff258	2c95b473-360e-4bc3-b016-3ced1e967f73	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	0
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:24.737+00	0	0	0
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	substitute	2026-10-09 21:51:24.737+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	153db7ce-1f65-48c3-9620-1915dea7f171	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	\N	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	5b2e63e1-fef3-4f78-808c-d1e443641ffd	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	74dbf902-e056-4f04-a59b-dfcad74a08b8	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	f633adf9-a43a-4297-825b-20aa746bd880	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	17322527-c8cd-4c71-8370-f5c9ec0226b7	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	2c95b473-360e-4bc3-b016-3ced1e967f73	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
d653bc85-c303-4fbc-8124-89fecbdddffe	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:43.272+00	0	0	0
24f4595a-9be1-43fd-ada5-f524edaff258	a3900120-edbc-4e69-a776-b77d0004e756	0	0	0	0	0	0	0	0	0	0	starter	2026-10-09 21:51:52.267+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	2c95b473-360e-4bc3-b016-3ced1e967f73	4	0	0	0	0	0	0	0	4	0	\N	2026-10-09 21:51:40.424+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	4	0	0	0	0	0	0	4	4	0	\N	2026-10-09 21:51:40.424+00	4	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	74dbf902-e056-4f04-a59b-dfcad74a08b8	4	0	0	0	0	0	0	0	4	0	\N	2026-10-09 21:51:40.424+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	4	0	0	0	0	0	0	0	4	0	\N	2026-10-09 21:51:40.424+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	a3900120-edbc-4e69-a776-b77d0004e756	4	0	0	0	0	0	0	0	4	0	\N	2026-10-09 21:51:40.424+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	4	0	0	0	0	0	0	0	4	0	\N	2026-10-09 21:51:40.424+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	5b2e63e1-fef3-4f78-808c-d1e443641ffd	4	0	0	0	0	0	0	0	4	0	\N	2026-10-09 21:51:40.424+00	0	0	0
13fbf924-51e6-4301-9785-4b178f4cb0aa	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	0	0	0	0	0	0	0	0	0	0	\N	2026-10-09 21:51:40.424+00	0	0	0
\.


--
-- Data for Name: match_squad; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.match_squad (match_id, team_member_id, role, created_at) FROM stdin;
1a7348fe-3173-41c1-8716-0ec7b031a153	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-09-30 16:06:33.351837+00
1a7348fe-3173-41c1-8716-0ec7b031a153	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	substitute	2026-09-30 16:06:33.351837+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5bfa639f-99ee-477f-8a1a-435f435a7ed8	starter	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	substitute	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:33.892432+00
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	supporter	2026-09-30 16:06:33.892432+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:34.271784+00
5e3c9abc-9002-4d17-aaf7-638422789ca9	153db7ce-1f65-48c3-9620-1915dea7f171	substitute	2026-09-30 16:06:34.271784+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	a3900120-edbc-4e69-a776-b77d0004e756	starter	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	substitute	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:34.69126+00
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-09-30 16:06:34.69126+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	substitute	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:35.107858+00
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-09-30 16:06:35.107858+00
54d22030-3859-4d5b-a871-6ff08899284e	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-09-30 16:06:35.532661+00
54d22030-3859-4d5b-a871-6ff08899284e	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:35.532661+00
c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	substitute	2026-09-30 16:06:35.720086+00
c1856b4a-38c8-4936-8066-8fd508bc028f	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	supporter	2026-09-30 16:06:35.720086+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	substitute	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	substitute	2026-10-01 08:55:11.614008+00
5d187aaf-989e-449f-ac7d-219d6a41f14f	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	supporter	2026-10-01 08:55:11.614008+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	supporter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-09-30 16:06:36.162406+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-01 08:56:13.04641+00
e47008a7-578a-4da9-a785-0fc6c1ff679a	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-09-30 16:06:36.162406+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-01 09:45:50.365361+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-01 09:45:50.365361+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-01 09:45:50.365361+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-01 09:45:50.365361+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-01 09:45:50.365361+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-01 09:45:50.365361+00
94e1dbcb-033d-429e-b4ef-a94190c4770c	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-01 09:45:50.365361+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-01 09:50:45.584133+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-01 09:50:45.584133+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-01 09:50:45.584133+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-01 09:50:45.584133+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-01 09:50:45.584133+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-01 09:50:45.584133+00
d371fb5c-f2bb-4021-af71-6dc20d7804e5	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-01 09:50:45.584133+00
3146fd05-7672-417b-9149-215f88ce487a	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	substitute	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-10-01 15:21:17.373393+00
3146fd05-7672-417b-9149-215f88ce487a	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	starter	2026-10-01 15:21:17.373393+00
96fa070c-58f6-4318-bd53-c310e3f7e635	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	74dbf902-e056-4f04-a59b-dfcad74a08b8	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	a3900120-edbc-4e69-a776-b77d0004e756	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-10-02 13:11:47.383195+00
96fa070c-58f6-4318-bd53-c310e3f7e635	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	starter	2026-10-02 13:11:47.383195+00
24f4595a-9be1-43fd-ada5-f524edaff258	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	74dbf902-e056-4f04-a59b-dfcad74a08b8	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	a3900120-edbc-4e69-a776-b77d0004e756	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-10-02 13:13:11.579115+00
24f4595a-9be1-43fd-ada5-f524edaff258	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	starter	2026-10-02 13:13:11.579115+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	substitute	2026-10-03 08:43:54.016062+00
bee507a4-482d-46a6-8a42-74dfef1bd81c	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	supporter	2026-10-03 08:43:54.016062+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	74dbf902-e056-4f04-a59b-dfcad74a08b8	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	a3900120-edbc-4e69-a776-b77d0004e756	starter	2026-10-05 08:21:29.209704+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-10-05 08:21:29.209704+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	substitute	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	substitute	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	substitute	2026-10-05 08:25:22.769321+00
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	substitute	2026-10-05 08:25:22.769321+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	substitute	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	74dbf902-e056-4f04-a59b-dfcad74a08b8	substitute	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	a3900120-edbc-4e69-a776-b77d0004e756	substitute	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	substitute	2026-10-05 20:38:14.095204+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	supporter	2026-10-05 20:38:14.095204+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-06 17:40:12.079599+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-06 17:40:12.079599+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-06 17:40:12.079599+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-06 17:40:12.079599+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-06 17:40:12.079599+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-06 17:40:12.079599+00
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-06 17:40:12.079599+00
d653bc85-c303-4fbc-8124-89fecbdddffe	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	153db7ce-1f65-48c3-9620-1915dea7f171	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	74dbf902-e056-4f04-a59b-dfcad74a08b8	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	a3900120-edbc-4e69-a776-b77d0004e756	starter	2026-10-09 12:54:46.770437+00
d653bc85-c303-4fbc-8124-89fecbdddffe	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-10-09 12:54:46.770437+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	starter	2026-10-09 20:40:25.107983+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	f633adf9-a43a-4297-825b-20aa746bd880	starter	2026-10-09 20:40:25.107983+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	17322527-c8cd-4c71-8370-f5c9ec0226b7	starter	2026-10-09 20:40:25.107983+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	2c95b473-360e-4bc3-b016-3ced1e967f73	starter	2026-10-09 20:40:25.107983+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	starter	2026-10-09 20:40:25.107983+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	a3900120-edbc-4e69-a776-b77d0004e756	starter	2026-10-09 20:40:25.107983+00
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	starter	2026-10-09 20:40:25.107983+00
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.matches (id, team_id, kickoff_at, opponent_name, is_home, venue, periods_count, period_minutes, status, operator_user_id, entry_mode, created_by, created_at, competition_id, ratings_published_at) FROM stdin;
24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-06 08:25:00+00	Test notes	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 08:25:08.415036+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	2026-10-05 08:32:24.653+00
43cc25fa-94bd-43d4-89c2-bddf45fa38e4	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-06 20:37:00+00	Jhdjdj	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 20:37:47.933635+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
ff21f985-3600-49b4-81f4-81d4f2e3f7b3	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-07 17:39:00+00	Djjdjs	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-06 17:39:54.129514+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
8e28d78b-897f-448f-b40e-3e10ae593d99	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-08 15:10:00+00	Des	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 15:10:58.381934+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
9282d8f5-82b6-44a1-9b42-32124808c137	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-09 20:29:00+00	Jeeuiz	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-09 20:29:34.460554+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
54d22030-3859-4d5b-a871-6ff08899284e	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-20 08:30:00+00	FC des Deux-Ponts	f	Stade des Deux-Ponts	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	retro	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:35.506808+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-09 20:38:00+00	Match 2	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-09 20:38:51.798102+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
e5d43cb2-3026-4ed4-b330-7831fd5e380e	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-18 08:30:00+00	AS Coteaux	f	Terrain des Coteaux	2	30	finished	\N	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:36.288253+00	2850cf98-dca2-4481-a921-4d00fe555edf	\N
13fbf924-51e6-4301-9785-4b178f4cb0aa	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-10 12:09:00+00	Nkfdskfjsnkj	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-09 12:09:53.606452+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
d653bc85-c303-4fbc-8124-89fecbdddffe	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-10 12:54:00+00	to make team	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-09 12:54:29.763467+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
96fa070c-58f6-4318-bd53-c310e3f7e635	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-10 13:11:00+00	Hehehehehe	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-02 13:11:36.148847+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
3146fd05-7672-417b-9149-215f88ce487a	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-16 15:20:00+00	Jdjdhd	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 15:20:59.759069+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
24f4595a-9be1-43fd-ada5-f524edaff258	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-23 13:12:00+00	Jajzja	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-02 13:12:53.057333+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
cce5b933-272b-4240-8995-839db79c0e85	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-13 10:07:00+00	MATCH DE TEST	t	\N	2	30	scheduled	\N	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-12 10:07:08.148716+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
1a7348fe-3173-41c1-8716-0ec7b031a153	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-08-16 08:30:00+00	FC Rivière	t	Stade municipal	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	retro	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:33.3181+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
ba6695b3-eb3c-4dfa-bd92-a7d1c3cf90d3	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-08-23 08:30:00+00	Union des Lavandières	t	Stade municipal	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:33.864795+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
5e3c9abc-9002-4d17-aaf7-638422789ca9	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-08-30 08:30:00+00	Olympique Vallée	f	Complexe des Tilleuls	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:34.247372+00	7dc67626-fda5-4ec8-a0d9-492dde80c9be	\N
c16f24cb-a2fb-4fc4-a7f3-4230b795b4b2	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-06 08:30:00+00	US des Chênes	t	Stade municipal	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:34.66603+00	2850cf98-dca2-4481-a921-4d00fe555edf	\N
0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-13 08:30:00+00	Stade de la Colline	f	Tournoi de la Colline	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:35.079491+00	036ae4dc-a766-48f3-87d9-f8d43b9c97ed	\N
d371fb5c-f2bb-4021-af71-6dc20d7804e5	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-26 16:00:00+00	UX Audit H retro 2	t	Stade municipal	2	30	finished	\N	retro	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 09:47:09.094494+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
c1856b4a-38c8-4936-8066-8fd508bc028f	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-27 08:30:00+00	CS Morvan	f	Stade du Morvan	2	30	finished	c90099d4-4357-47fd-8c95-0c265af0d83b	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:35.6947+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
94e1dbcb-033d-429e-b4ef-a94190c4770c	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-28 16:00:00+00	UX Audit H retro	t	Stade municipal	2	30	finished	\N	retro	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 09:37:27.292808+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
5d187aaf-989e-449f-ac7d-219d6a41f14f	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-09-30 17:00:00+00	UX Audit H	t	Stade municipal	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-01 08:53:04.088622+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
e47008a7-578a-4da9-a785-0fc6c1ff679a	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-04 08:30:00+00	Étoile du Parc	t	Stade municipal	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	c90099d4-4357-47fd-8c95-0c265af0d83b	2026-09-30 16:06:36.113254+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
bee507a4-482d-46a6-8a42-74dfef1bd81c	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-04 08:43:00+00	Tesring	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-03 08:43:43.7012+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	2026-10-03 08:45:03.262+00
8bfcb86c-18c3-44b0-b1ad-e3889e292f82	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2026-10-06 08:21:00+00	Rrt	t	\N	2	30	finished	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	live	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	2026-10-05 08:21:10.854276+00	195d0cd7-bbbb-430c-9377-2491c27dfbfb	\N
\.


--
-- Data for Name: player_positions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.player_positions (team_member_id, position_code, preference) FROM stdin;
86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	GB	primary
86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	DC	secondary
71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	AT	primary
a3900120-edbc-4e69-a776-b77d0004e756	AT	secondary
153db7ce-1f65-48c3-9620-1915dea7f171	DC	primary
153db7ce-1f65-48c3-9620-1915dea7f171	MC	secondary
74dbf902-e056-4f04-a59b-dfcad74a08b8	AT	secondary
5bfa639f-99ee-477f-8a1a-435f435a7ed8	AT	primary
5b2e63e1-fef3-4f78-808c-d1e443641ffd	AT	secondary
17322527-c8cd-4c71-8370-f5c9ec0226b7	DC	primary
71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	MC	secondary
2c95b473-360e-4bc3-b016-3ced1e967f73	DC	secondary
17322527-c8cd-4c71-8370-f5c9ec0226b7	AIL	secondary
5b2e63e1-fef3-4f78-808c-d1e443641ffd	MC	secondary
f633adf9-a43a-4297-825b-20aa746bd880	DC	primary
2c95b473-360e-4bc3-b016-3ced1e967f73	AIL	primary
3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	AIL	primary
74dbf902-e056-4f04-a59b-dfcad74a08b8	MC	primary
5b1a91c4-cdd6-498f-b668-ca82ba6b677b	AIL	primary
f79bed48-b1dc-4d4a-86cd-b041e7f955bf	DC	primary
5b2e63e1-fef3-4f78-808c-d1e443641ffd	AIL	primary
5bfa639f-99ee-477f-8a1a-435f435a7ed8	AIL	secondary
a3900120-edbc-4e69-a776-b77d0004e756	AIL	primary
f633adf9-a43a-4297-825b-20aa746bd880	AIL	secondary
91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AT	primary
91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	DC	secondary
91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	MC	secondary
91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	AIL	secondary
\.


--
-- Data for Name: positions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.positions (code, label_fr, line, default_x, default_y, sort) FROM stdin;
GB	Gardien de but	GB	500	60	1
DG	Défenseur gauche	DEF	190	250	2
DC	Défenseur central	DEF	500	250	3
DD	Défenseur droit	DEF	810	250	4
MG	Milieu gauche	MIL	190	500	5
MC	Milieu central	MIL	500	500	6
MD	Milieu droit	MIL	810	500	7
MOC	Milieu offensif central	MIL	500	660	8
AG	Ailier gauche	ATT	200	850	9
AT	Attaquant	ATT	500	880	10
AD	Ailier droit	ATT	800	850	11
AIL	Ailier	MIL	180	520	4
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.ratings (id, match_id, rater_member_id, rated_member_id, score, created_at) FROM stdin;
84fe927f-8dfa-4c75-90b1-98042403c639	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	17322527-c8cd-4c71-8370-f5c9ec0226b7	6.0	2026-09-30 16:06:34.636167+00
d8fdb621-78f0-4e82-8c6e-84937cf32604	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	5.0	2026-09-30 16:06:34.636167+00
a0486cb3-abf0-4e34-94bb-3a7e2794c410	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	f633adf9-a43a-4297-825b-20aa746bd880	5.0	2026-09-30 16:06:34.636167+00
9fa1f142-f196-493a-8ea4-4b1d69c97277	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	2c95b473-360e-4bc3-b016-3ced1e967f73	7.0	2026-09-30 16:06:34.636167+00
b659d382-3f00-4d40-833d-96f64793403b	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	5b2e63e1-fef3-4f78-808c-d1e443641ffd	6.0	2026-09-30 16:06:34.636167+00
805e8baa-f757-4a39-b076-50774ae9a6ce	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	7.0	2026-09-30 16:06:34.636167+00
10439f54-0f7c-4f28-9442-986ed435d158	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	a3900120-edbc-4e69-a776-b77d0004e756	6.0	2026-09-30 16:06:34.636167+00
9e79bdbd-e7e7-4199-967e-f26465c2fa82	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	74dbf902-e056-4f04-a59b-dfcad74a08b8	6.0	2026-09-30 16:06:34.636167+00
d4c93bff-67dc-4a3e-959f-e9a6a9368de6	5e3c9abc-9002-4d17-aaf7-638422789ca9	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	153db7ce-1f65-48c3-9620-1915dea7f171	6.0	2026-09-30 16:06:34.636167+00
8ef12179-0262-4b72-b4f5-bb95c2c074b5	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	6.0	2026-09-30 16:06:34.636167+00
53dfa3ee-c9db-482a-9c1b-4ab52ca47a3d	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	17322527-c8cd-4c71-8370-f5c9ec0226b7	7.0	2026-09-30 16:06:34.636167+00
16e66ea1-3b43-4f21-9d85-99fcefd8fdc2	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	6.0	2026-09-30 16:06:34.636167+00
706a2382-9f93-4589-ad66-078f5cb7b7ae	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	f633adf9-a43a-4297-825b-20aa746bd880	6.0	2026-09-30 16:06:34.636167+00
456d2e93-91a4-4efe-8e12-d5fe376a7b4c	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	2c95b473-360e-4bc3-b016-3ced1e967f73	8.0	2026-09-30 16:06:34.636167+00
6d03cc8b-1578-4b05-ad42-8a02d48d41c4	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	7.0	2026-09-30 16:06:34.636167+00
d4ad9bc0-cbc0-4150-aa55-3e1e3071f69d	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	a3900120-edbc-4e69-a776-b77d0004e756	7.0	2026-09-30 16:06:34.636167+00
e530b302-37d6-4126-8dc0-5a2e6e65a707	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	74dbf902-e056-4f04-a59b-dfcad74a08b8	7.0	2026-09-30 16:06:34.636167+00
e68050d3-84a4-43bc-a0a9-889b383f7240	5e3c9abc-9002-4d17-aaf7-638422789ca9	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	153db7ce-1f65-48c3-9620-1915dea7f171	7.0	2026-09-30 16:06:34.636167+00
6edaaf0f-9ef7-4992-85cf-ef16ec5393f0	5e3c9abc-9002-4d17-aaf7-638422789ca9	5b2e63e1-fef3-4f78-808c-d1e443641ffd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	7.0	2026-09-30 16:06:34.636167+00
33cfc3b9-47f3-4fe2-acfc-5c9e93d11f21	5e3c9abc-9002-4d17-aaf7-638422789ca9	5b2e63e1-fef3-4f78-808c-d1e443641ffd	17322527-c8cd-4c71-8370-f5c9ec0226b7	8.0	2026-09-30 16:06:34.636167+00
ed8805f4-8eda-4471-9662-23f7fcbda5c0	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	8.0	2026-09-30 16:06:35.481398+00
bab3a25f-52f1-4dce-9074-335b8a30eaf3	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	17322527-c8cd-4c71-8370-f5c9ec0226b7	6.0	2026-09-30 16:06:35.481398+00
32155d51-1318-464c-a728-d871d64d1e8b	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	153db7ce-1f65-48c3-9620-1915dea7f171	6.0	2026-09-30 16:06:35.481398+00
c0991131-723c-489e-8304-567960d0f8fa	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	f633adf9-a43a-4297-825b-20aa746bd880	6.0	2026-09-30 16:06:35.481398+00
fb3be3a5-006d-43bb-bb9c-edbd938191ad	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	2c95b473-360e-4bc3-b016-3ced1e967f73	7.0	2026-09-30 16:06:35.481398+00
f547e4c0-79ea-4bef-96c8-72a9a44b0442	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	5b2e63e1-fef3-4f78-808c-d1e443641ffd	7.0	2026-09-30 16:06:35.481398+00
94de5611-5069-4969-a7b1-c1a78b64968d	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	7.0	2026-09-30 16:06:35.481398+00
c06817ed-f77c-4fbb-a6f5-5962bc48bca5	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	a3900120-edbc-4e69-a776-b77d0004e756	7.0	2026-09-30 16:06:35.481398+00
6156d72c-02c5-4e27-8180-ecb96ac64138	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	74dbf902-e056-4f04-a59b-dfcad74a08b8	5.0	2026-09-30 16:06:35.481398+00
b274ba5a-4777-4468-a45a-dc01ee879226	0d9ab462-f5a2-4afb-b2e2-5ba2ad12a8cd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	5.0	2026-09-30 16:06:35.481398+00
967ea977-ecbf-4298-a51b-0f6df71452c1	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	8.0	2026-09-30 16:06:36.085399+00
fbf689ca-a652-440b-886a-c962d6a1bf50	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	17322527-c8cd-4c71-8370-f5c9ec0226b7	7.0	2026-09-30 16:06:36.085399+00
83f7c48b-aae3-4883-9e3f-3ef84b209299	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	153db7ce-1f65-48c3-9620-1915dea7f171	7.0	2026-09-30 16:06:36.085399+00
6ee55506-b076-41d3-8fd3-2c646440221b	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	f633adf9-a43a-4297-825b-20aa746bd880	6.0	2026-09-30 16:06:36.085399+00
582ab7d9-74a4-4d27-8510-38ca5ddc4a97	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2c95b473-360e-4bc3-b016-3ced1e967f73	7.0	2026-09-30 16:06:36.085399+00
20c62738-d459-4b95-8b19-931e6fc8cb7b	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	9.0	2026-09-30 16:06:36.085399+00
bcbf0906-a257-43d3-8ca1-24b9ab5a4477	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	a3900120-edbc-4e69-a776-b77d0004e756	6.0	2026-09-30 16:06:36.085399+00
c02c29a5-9783-4e52-8f0e-b8f84d4f7f87	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	74dbf902-e056-4f04-a59b-dfcad74a08b8	5.0	2026-09-30 16:06:36.085399+00
90571c47-338b-460b-95ec-11bf71be2892	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	8.0	2026-09-30 16:06:36.085399+00
fb32d3b5-d0fd-432e-8828-81abe46b6cbe	c1856b4a-38c8-4936-8066-8fd508bc028f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	5.0	2026-09-30 16:06:36.085399+00
a87c3f03-6904-4d7e-9f23-8f4f61f6ea97	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	17322527-c8cd-4c71-8370-f5c9ec0226b7	8.0	2026-09-30 16:06:36.085399+00
44c8854a-0b65-499d-9de6-e7519c6ee6ea	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	153db7ce-1f65-48c3-9620-1915dea7f171	8.0	2026-09-30 16:06:36.085399+00
2f0b15d1-a473-4db3-b8f9-7b1022765eb2	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	f633adf9-a43a-4297-825b-20aa746bd880	7.0	2026-09-30 16:06:36.085399+00
a7ed3b59-2215-4fee-a2dc-6ddf8adbc138	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	2c95b473-360e-4bc3-b016-3ced1e967f73	8.0	2026-09-30 16:06:36.085399+00
b2117629-c2a0-4c45-a2ab-7e31241bef41	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	5b2e63e1-fef3-4f78-808c-d1e443641ffd	9.0	2026-09-30 16:06:36.085399+00
99f1297d-7ef6-4327-8fee-9d9161999973	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	10.0	2026-09-30 16:06:36.085399+00
102d46b1-cc23-410c-aea6-f78aa0a84d44	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	a3900120-edbc-4e69-a776-b77d0004e756	7.0	2026-09-30 16:06:36.085399+00
10021e0f-6392-4220-bd83-42e338b717a4	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	74dbf902-e056-4f04-a59b-dfcad74a08b8	6.0	2026-09-30 16:06:36.085399+00
eead7d80-a100-43a7-9fe4-86eb4d1edf19	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	9.0	2026-09-30 16:06:36.085399+00
07ea76d9-6982-4f83-ac53-c70442231d0a	c1856b4a-38c8-4936-8066-8fd508bc028f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	6.0	2026-09-30 16:06:36.085399+00
bbc7382f-4b23-4b81-bafe-31063a92f9e0	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	7.0	2026-09-30 16:06:36.085399+00
f90890b9-7f0f-405b-9275-75f49c6d138e	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	17322527-c8cd-4c71-8370-f5c9ec0226b7	6.0	2026-09-30 16:06:36.085399+00
5b7ce853-4e4f-4744-ad46-ab7cab0981eb	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	153db7ce-1f65-48c3-9620-1915dea7f171	6.0	2026-09-30 16:06:36.085399+00
46eee464-fc81-4ec1-8cdc-55d21216139f	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	f633adf9-a43a-4297-825b-20aa746bd880	5.0	2026-09-30 16:06:36.085399+00
18aa823b-e68b-49df-9b1d-1139229214ad	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	2c95b473-360e-4bc3-b016-3ced1e967f73	6.0	2026-09-30 16:06:36.085399+00
a57c17a5-867d-44e3-bc66-0590f47afc5e	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	7.0	2026-09-30 16:06:36.085399+00
482bf39a-54a3-4542-92c0-387a8da53fae	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	a3900120-edbc-4e69-a776-b77d0004e756	5.0	2026-09-30 16:06:36.085399+00
8edd49e4-1be2-4626-a95c-aa89a52a0472	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	74dbf902-e056-4f04-a59b-dfcad74a08b8	4.0	2026-09-30 16:06:36.085399+00
2ad35be0-8036-4b8d-957e-1edb37984cbc	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	7.0	2026-09-30 16:06:36.085399+00
8182497e-0229-4cc7-8ee0-54b1b3d01843	c1856b4a-38c8-4936-8066-8fd508bc028f	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	4.0	2026-09-30 16:06:36.085399+00
97a3a967-84de-430b-999d-9442eaba3eed	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	8.0	2026-09-30 16:06:36.085399+00
f7be3556-2fa7-49a4-80f9-21dbc8e3b5ca	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	153db7ce-1f65-48c3-9620-1915dea7f171	7.0	2026-09-30 16:06:36.085399+00
201c74b4-9d5b-4b7e-9df0-7e4905eee3ba	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	f633adf9-a43a-4297-825b-20aa746bd880	6.0	2026-09-30 16:06:36.085399+00
e0438f22-7076-4d6f-894a-405e9ea51293	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	2c95b473-360e-4bc3-b016-3ced1e967f73	7.0	2026-09-30 16:06:36.085399+00
ce03df55-2332-484c-82a4-ee07570b951f	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	5b2e63e1-fef3-4f78-808c-d1e443641ffd	8.0	2026-09-30 16:06:36.085399+00
32c4d17a-cb2c-4d31-9c35-bc7dc261a0d5	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	9.0	2026-09-30 16:06:36.085399+00
17e56ebd-8d0f-4f70-a7d3-d8fe0d683ef0	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	a3900120-edbc-4e69-a776-b77d0004e756	6.0	2026-09-30 16:06:36.085399+00
f6948f95-690a-42f7-82cf-55aa8c513333	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	74dbf902-e056-4f04-a59b-dfcad74a08b8	5.0	2026-09-30 16:06:36.085399+00
d5b2bdcd-b47c-4005-baa7-9119ee995aa5	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	8.0	2026-09-30 16:06:36.085399+00
b22151a5-5f10-49cc-9662-fbcc7bbf3b57	c1856b4a-38c8-4936-8066-8fd508bc028f	17322527-c8cd-4c71-8370-f5c9ec0226b7	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	5.0	2026-09-30 16:06:36.085399+00
f4fc2f32-4d90-4138-b64b-3bd69f876439	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	8.0	2026-10-01 09:35:22.936433+00
9fe4fc7a-a4bf-4973-9e07-37cc898f916f	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	f633adf9-a43a-4297-825b-20aa746bd880	7.0	2026-10-01 09:35:22.936433+00
7aa7a08c-1591-4fb1-8ad0-1a570e7d8dc3	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	17322527-c8cd-4c71-8370-f5c9ec0226b7	8.0	2026-10-01 09:35:22.936433+00
ca0ccf18-b9b1-45dd-81cd-93ce2572f318	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	153db7ce-1f65-48c3-9620-1915dea7f171	9.0	2026-10-01 09:35:22.936433+00
d3dfd9c9-4d29-4f9c-9c08-fdbd871c285b	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2c95b473-360e-4bc3-b016-3ced1e967f73	6.0	2026-10-01 09:35:22.936433+00
3ba3006a-f889-4e2d-a4a2-5d11dad7b4e6	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	7.0	2026-10-01 09:35:22.936433+00
4824d60a-8d1f-407d-a7a0-e2e4066019f0	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	8.0	2026-10-01 09:35:22.936433+00
811cc45b-fd70-4e27-8671-5b6ee915a48f	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	74dbf902-e056-4f04-a59b-dfcad74a08b8	6.0	2026-10-01 09:35:22.936433+00
efc4573c-d885-49c6-95e1-49680fc205d6	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	a3900120-edbc-4e69-a776-b77d0004e756	7.0	2026-10-01 09:35:22.936433+00
281c2358-b702-45cf-bf5a-2e0aab239fb4	5d187aaf-989e-449f-ac7d-219d6a41f14f	5b2e63e1-fef3-4f78-808c-d1e443641ffd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	8.0	2026-10-01 09:35:22.936433+00
0bd83b63-d459-4069-8066-187f6510d296	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	7.5	2026-10-05 08:30:30.625207+00
c4795e34-853b-4e50-a202-e1c945baa721	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	f633adf9-a43a-4297-825b-20aa746bd880	2.5	2026-10-05 08:30:30.625207+00
dfe6c5d3-d358-4e9f-a4f7-c804f7e54c2f	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	17322527-c8cd-4c71-8370-f5c9ec0226b7	7.5	2026-10-05 08:30:30.625207+00
722d829f-d35a-49cf-aec0-56794763e2db	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	5.0	2026-10-05 08:30:30.625207+00
077fbd18-19b7-4f5f-a003-205bd35ebf0a	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2c95b473-360e-4bc3-b016-3ced1e967f73	8.5	2026-10-05 08:30:30.625207+00
663a0c96-ce11-46ad-882e-5d1d7ed3b181	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	10.0	2026-10-05 08:30:30.625207+00
77b6eb8b-126f-430e-9092-2c2a2464630d	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	5b2e63e1-fef3-4f78-808c-d1e443641ffd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	6.5	2026-10-05 08:30:30.625207+00
483a5a5c-54fb-4372-829a-d4699f8233c7	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	f633adf9-a43a-4297-825b-20aa746bd880	7.0	2026-10-05 08:31:05.477289+00
ba0ec0c6-ed31-495d-902f-c940bbbd8533	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	17322527-c8cd-4c71-8370-f5c9ec0226b7	5.0	2026-10-05 08:31:05.477289+00
815c20b3-81ee-4036-a80e-a2acea46fc31	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	8.0	2026-10-05 08:31:05.477289+00
b118859e-8c80-4f7c-9e0b-ef66e4d589ab	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	2c95b473-360e-4bc3-b016-3ced1e967f73	7.5	2026-10-05 08:31:05.477289+00
f1f2b42d-7364-4de1-ae55-ef81724eee31	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	5b2e63e1-fef3-4f78-808c-d1e443641ffd	7.0	2026-10-05 08:31:05.477289+00
65cf9dc7-6965-4da0-8340-19811d300750	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	5.0	2026-10-05 08:31:05.477289+00
86992e00-6860-418e-8110-595e427adf29	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	7.0	2026-10-05 08:31:05.477289+00
234299af-f7c0-40f4-bc1d-96dcc7effa38	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	9.0	2026-10-05 08:32:09.841662+00
f1cc50ec-4069-4b98-b9b8-859f56b25de1	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	f633adf9-a43a-4297-825b-20aa746bd880	1.0	2026-10-05 08:32:09.841662+00
c6e755f3-1fdd-47b1-9f28-5241cf0c1480	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	17322527-c8cd-4c71-8370-f5c9ec0226b7	3.5	2026-10-05 08:32:09.841662+00
5ab481b5-3786-48cd-8f9b-2e160c9ded33	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	f79bed48-b1dc-4d4a-86cd-b041e7f955bf	3.5	2026-10-05 08:32:09.841662+00
72d09202-4195-4979-bf2c-cd652f8b6f39	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	2c95b473-360e-4bc3-b016-3ced1e967f73	2.5	2026-10-05 08:32:09.841662+00
7b1b5c72-81ef-4947-b7d3-2d8336a58caa	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	5b2e63e1-fef3-4f78-808c-d1e443641ffd	8.0	2026-10-05 08:32:09.841662+00
15b50777-10d3-4274-8d21-23e742225e64	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	3.0	2026-10-05 08:32:09.841662+00
d56f1f8e-9fb3-43ff-9fca-e569c7d7b937	24d5e7e1-d251-4d9a-abad-9e9be4a7cf00	153db7ce-1f65-48c3-9620-1915dea7f171	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	5.0	2026-10-05 08:32:09.841662+00
084e156c-f94a-440f-a34c-b7862a55f367	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	5.0	2026-10-05 20:41:02.917047+00
b4410c1b-c1ae-4fb2-9c3e-dbe8b7b0c0ef	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	f633adf9-a43a-4297-825b-20aa746bd880	5.0	2026-10-05 20:41:02.917047+00
1bd7a4bb-bf97-4ac8-bea8-bcf796e155ba	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	17322527-c8cd-4c71-8370-f5c9ec0226b7	5.0	2026-10-05 20:41:02.917047+00
2c3f3335-6ae1-4d91-89f9-99a141ac63ae	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	153db7ce-1f65-48c3-9620-1915dea7f171	5.0	2026-10-05 20:41:02.917047+00
8cca655c-b542-4fea-8a31-8842f0846648	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2c95b473-360e-4bc3-b016-3ced1e967f73	5.0	2026-10-05 20:41:02.917047+00
ed4ee183-d7b3-4d82-a6b0-d89beeb889db	43cc25fa-94bd-43d4-89c2-bddf45fa38e4	5b2e63e1-fef3-4f78-808c-d1e443641ffd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	5.0	2026-10-05 20:41:02.917047+00
d682c957-7794-4c89-bc22-20be57280d67	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	f633adf9-a43a-4297-825b-20aa746bd880	2.0	2026-10-09 20:47:17.812212+00
0d8c512d-4413-4b9f-8118-4dd7320fb596	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	17322527-c8cd-4c71-8370-f5c9ec0226b7	8.0	2026-10-09 20:47:17.812212+00
4b2cd6b8-ade2-487d-ab02-cc6a5829ee61	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	2c95b473-360e-4bc3-b016-3ced1e967f73	5.0	2026-10-09 20:47:17.812212+00
163cdad2-6686-48b0-b9ce-beca654d0c3a	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	7.0	2026-10-09 20:47:17.812212+00
3a7febec-ec04-4ba8-a8d2-0f2444c7c114	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	a3900120-edbc-4e69-a776-b77d0004e756	5.0	2026-10-09 20:47:17.812212+00
c98665f4-59ce-49e8-8c88-83cdf0cf42fa	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	7.0	2026-10-09 20:47:17.812212+00
14f6cfa3-a8d7-4469-bebb-7017af0b1bef	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	3.0	2026-10-09 20:47:17.812212+00
19479153-a284-49d6-8422-18512a5dce2d	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	153db7ce-1f65-48c3-9620-1915dea7f171	5.0	2026-10-09 20:47:17.812212+00
30624e74-6cb9-4261-8b20-5cc18fbc68ad	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	6.5	2026-10-09 20:47:17.812212+00
66bb1b87-024f-434e-a1d2-11183c800bd1	b5a22e3c-4eb9-4206-9a86-d2c9a80de33b	5b2e63e1-fef3-4f78-808c-d1e443641ffd	5b1a91c4-cdd6-498f-b668-ca82ba6b677b	3.5	2026-10-09 20:47:17.812212+00
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.sessions (id, user_id, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: team_members; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.team_members (id, team_id, user_id, role, is_player, jersey_number, joined_at, left_at, shirt_name) FROM stdin;
a4f07417-7590-426f-aa97-e100da264302	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	c90099d4-4357-47fd-8c95-0c265af0d83b	coach	f	\N	2026-08-02 16:00:00+00	\N	\N
5b2e63e1-fef3-4f78-808c-d1e443641ffd	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	coach	t	8	2026-08-02 16:00:00+00	\N	\N
91df4c9e-a4e6-4ae8-ac1e-3bc8a1a1dc8c	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	606cf9a1-75dd-4faa-856d-5486d262233b	player	t	1	2026-08-02 16:00:00+00	\N	\N
86848bee-bf7f-4ff2-80b9-15c96ec4f0ef	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	14d5e6a0-4a79-4c1c-a55c-af5a9b2d3bbd	player	t	12	2026-08-02 16:00:00+00	\N	\N
71a8f4f1-27f6-4665-b7cb-36aeac1eaf9f	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	8ce25f7c-20d8-4201-94a8-09707efa75bf	player	t	9	2026-08-02 16:00:00+00	\N	\N
a3900120-edbc-4e69-a776-b77d0004e756	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	fc6a2caa-f280-4c75-9ad1-1ba18d3a72a7	player	t	11	2026-08-02 16:00:00+00	\N	Momo
3f4cfe2d-d5b6-41ac-bd34-cf90698a2971	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	99e50171-ad1d-4311-aec3-be85e408c347	player	t	7	2026-08-02 16:00:00+00	\N	\N
153db7ce-1f65-48c3-9620-1915dea7f171	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	d575ec14-4a26-40a7-977e-e862d35bc9c3	player	t	4	2026-08-02 16:00:00+00	\N	\N
f633adf9-a43a-4297-825b-20aa746bd880	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	5a9fcbf5-d424-46ac-9aea-2223fb515b90	player	t	2	2026-08-02 16:00:00+00	\N	\N
17322527-c8cd-4c71-8370-f5c9ec0226b7	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	dd0b7d84-c8df-4cfb-ad0f-c3a2a1c68466	player	t	3	2026-08-02 16:00:00+00	\N	\N
2c95b473-360e-4bc3-b016-3ced1e967f73	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	c2160485-14a2-4c0e-a259-f8dff37276b8	player	t	6	2026-08-02 16:00:00+00	\N	Léo
74dbf902-e056-4f04-a59b-dfcad74a08b8	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	5b8f9d67-8ba1-4250-9e04-aa3634348cd7	player	t	10	2026-08-02 16:00:00+00	\N	El Professor
f79bed48-b1dc-4d4a-86cd-b041e7f955bf	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	699f444f-7176-4121-8fdf-8d48291e4fbc	player	t	5	2026-08-02 16:00:00+00	\N	\N
5b1a91c4-cdd6-498f-b668-ca82ba6b677b	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	2baee989-5185-41de-8687-dd19bd74855b	player	t	14	2026-08-02 16:00:00+00	\N	\N
5bfa639f-99ee-477f-8a1a-435f435a7ed8	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	4d19f72c-1e32-4026-8ae4-54e9867e6f36	player	t	13	2026-08-02 16:00:00+00	2026-09-10 10:00:00+00	\N
60e6995e-ce69-4ab8-9e5e-ab139f314b91	a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	ae5ddb62-83e8-446e-8360-04cc88d028da	player	t	99	2026-10-01 09:02:57.615643+00	2026-10-01 09:13:13.984+00	ABCDEFGHIJKL
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.teams (id, name, slug, crest_url, primary_color, secondary_color, created_at) FROM stdin;
a2d2bd77-7239-4a46-8e5d-5e36e7cb0108	AS Dimanche	as-dimanche	\N	#1d4ed8	#ffffff	2026-09-30 16:06:32.909949+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, password_hash, display_name, is_super_admin, created_at) FROM stdin;
c90099d4-4357-47fd-8c95-0c265af0d83b	admin	REDACTED-NOT-A-HASH	Coach	t	2026-09-30 16:06:32.96689+00
f71bab4b-fde6-4c09-ac1e-14fd5b80cf4a	karim	REDACTED-NOT-A-HASH	Karim	f	2026-09-30 16:06:33.027075+00
606cf9a1-75dd-4faa-856d-5486d262233b	hugo	REDACTED-NOT-A-HASH	Hugo	f	2026-09-30 16:06:33.027075+00
14d5e6a0-4a79-4c1c-a55c-af5a9b2d3bbd	mehdi	REDACTED-NOT-A-HASH	Mehdi	f	2026-09-30 16:06:33.027075+00
8ce25f7c-20d8-4201-94a8-09707efa75bf	julien	REDACTED-NOT-A-HASH	Julien	f	2026-09-30 16:06:33.027075+00
fc6a2caa-f280-4c75-9ad1-1ba18d3a72a7	momo	REDACTED-NOT-A-HASH	Momo	f	2026-09-30 16:06:33.027075+00
99e50171-ad1d-4311-aec3-be85e408c347	ali	REDACTED-NOT-A-HASH	Ali	f	2026-09-30 16:06:33.027075+00
d575ec14-4a26-40a7-977e-e862d35bc9c3	thomas	REDACTED-NOT-A-HASH	Thomas	f	2026-09-30 16:06:33.027075+00
5a9fcbf5-d424-46ac-9aea-2223fb515b90	nico	REDACTED-NOT-A-HASH	Nico	f	2026-09-30 16:06:33.027075+00
dd0b7d84-c8df-4cfb-ad0f-c3a2a1c68466	samir	REDACTED-NOT-A-HASH	Samir	f	2026-09-30 16:06:33.027075+00
c2160485-14a2-4c0e-a259-f8dff37276b8	leo	REDACTED-NOT-A-HASH	Léo	f	2026-09-30 16:06:33.027075+00
5b8f9d67-8ba1-4250-9e04-aa3634348cd7	yanis	REDACTED-NOT-A-HASH	Yanis	f	2026-09-30 16:06:33.027075+00
699f444f-7176-4121-8fdf-8d48291e4fbc	brice	REDACTED-NOT-A-HASH	Brice	f	2026-09-30 16:06:33.027075+00
2baee989-5185-41de-8687-dd19bd74855b	fabien	REDACTED-NOT-A-HASH	Fabien	f	2026-09-30 16:06:33.027075+00
4d19f72c-1e32-4026-8ae4-54e9867e6f36	rayan	REDACTED-NOT-A-HASH	Rayan	f	2026-09-30 16:06:33.027075+00
ae5ddb62-83e8-446e-8360-04cc88d028da	auditg	REDACTED-NOT-A-HASH	AuditG	f	2026-10-01 09:02:57.615643+00
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: neondb_owner
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 15, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: neondb_owner
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: organization organization_slug_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.organization
    ADD CONSTRAINT organization_slug_key UNIQUE (slug);


--
-- Name: project_config project_config_endpoint_id_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.project_config
    ADD CONSTRAINT project_config_endpoint_id_key UNIQUE (endpoint_id);


--
-- Name: project_config project_config_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.project_config
    ADD CONSTRAINT project_config_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_team_label_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_team_label_unique UNIQUE (team_id, label_fr);


--
-- Name: formation_slots formation_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.formation_slots
    ADD CONSTRAINT formation_slots_pkey PRIMARY KEY (id);


--
-- Name: formations formations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.formations
    ADD CONSTRAINT formations_pkey PRIMARY KEY (id);


--
-- Name: injuries injuries_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.injuries
    ADD CONSTRAINT injuries_pkey PRIMARY KEY (id);


--
-- Name: invites invites_code_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_code_unique UNIQUE (code);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);


--
-- Name: lineup_slots lineup_slots_member_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineup_slots
    ADD CONSTRAINT lineup_slots_member_unique UNIQUE (lineup_id, team_member_id);


--
-- Name: lineup_slots lineup_slots_slot_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineup_slots
    ADD CONSTRAINT lineup_slots_slot_unique UNIQUE (lineup_id, formation_slot_id);


--
-- Name: lineups lineups_match_from_minute_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineups
    ADD CONSTRAINT lineups_match_from_minute_unique UNIQUE (match_id, from_minute);


--
-- Name: lineups lineups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineups
    ADD CONSTRAINT lineups_pkey PRIMARY KEY (id);


--
-- Name: match_events match_events_client_event_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_client_event_unique UNIQUE (client_event_id);


--
-- Name: match_events match_events_match_seq_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_match_seq_unique UNIQUE (match_id, seq);


--
-- Name: match_events match_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_pkey PRIMARY KEY (id);


--
-- Name: match_player_positions match_player_positions_match_id_team_member_id_position_code_pk; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_player_positions
    ADD CONSTRAINT match_player_positions_match_id_team_member_id_position_code_pk PRIMARY KEY (match_id, team_member_id, position_code);


--
-- Name: match_player_stats match_player_stats_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_player_stats
    ADD CONSTRAINT match_player_stats_unique UNIQUE (match_id, team_member_id);


--
-- Name: match_squad match_squad_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_squad
    ADD CONSTRAINT match_squad_unique UNIQUE (match_id, team_member_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: player_positions player_positions_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.player_positions
    ADD CONSTRAINT player_positions_unique UNIQUE (team_member_id, position_code);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (code);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_unique UNIQUE (match_id, rater_member_id, rated_member_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_slug_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_slug_unique UNIQUE (slug);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: account_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "account_userId_idx" ON neon_auth.account USING btree ("userId");


--
-- Name: invitation_email_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX invitation_email_idx ON neon_auth.invitation USING btree (email);


--
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "invitation_organizationId_idx" ON neon_auth.invitation USING btree ("organizationId");


--
-- Name: member_organizationId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "member_organizationId_idx" ON neon_auth.member USING btree ("organizationId");


--
-- Name: member_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "member_userId_idx" ON neon_auth.member USING btree ("userId");


--
-- Name: organization_slug_uidx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE UNIQUE INDEX organization_slug_uidx ON neon_auth.organization USING btree (slug);


--
-- Name: session_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "session_userId_idx" ON neon_auth.session USING btree ("userId");


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX verification_identifier_idx ON neon_auth.verification USING btree (identifier);


--
-- Name: competitions_team_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX competitions_team_idx ON public.competitions USING btree (team_id);


--
-- Name: formation_slots_formation_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX formation_slots_formation_idx ON public.formation_slots USING btree (formation_id);


--
-- Name: formations_team_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX formations_team_idx ON public.formations USING btree (team_id);


--
-- Name: injuries_member_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX injuries_member_idx ON public.injuries USING btree (team_member_id);


--
-- Name: invites_team_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX invites_team_idx ON public.invites USING btree (team_id);


--
-- Name: lineups_match_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX lineups_match_idx ON public.lineups USING btree (match_id);


--
-- Name: match_events_match_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX match_events_match_idx ON public.match_events USING btree (match_id, seq);


--
-- Name: matches_competition_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX matches_competition_idx ON public.matches USING btree (competition_id);


--
-- Name: matches_team_kickoff_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX matches_team_kickoff_idx ON public.matches USING btree (team_id, kickoff_at);


--
-- Name: ratings_match_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ratings_match_idx ON public.ratings USING btree (match_id);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX sessions_user_idx ON public.sessions USING btree (user_id);


--
-- Name: team_members_team_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX team_members_team_idx ON public.team_members USING btree (team_id);


--
-- Name: team_members_user_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX team_members_user_idx ON public.team_members USING btree (user_id);


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_inviterId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_organizationId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE;


--
-- Name: member member_organizationId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE;


--
-- Name: member member_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: competitions competitions_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: formation_slots formation_slots_formation_id_formations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.formation_slots
    ADD CONSTRAINT formation_slots_formation_id_formations_id_fk FOREIGN KEY (formation_id) REFERENCES public.formations(id) ON DELETE CASCADE;


--
-- Name: formation_slots formation_slots_position_code_positions_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.formation_slots
    ADD CONSTRAINT formation_slots_position_code_positions_code_fk FOREIGN KEY (position_code) REFERENCES public.positions(code);


--
-- Name: formations formations_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.formations
    ADD CONSTRAINT formations_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: formations formations_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.formations
    ADD CONSTRAINT formations_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: injuries injuries_declared_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.injuries
    ADD CONSTRAINT injuries_declared_by_users_id_fk FOREIGN KEY (declared_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: injuries injuries_team_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.injuries
    ADD CONSTRAINT injuries_team_member_id_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: invites invites_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invites invites_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: lineup_slots lineup_slots_formation_slot_id_formation_slots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineup_slots
    ADD CONSTRAINT lineup_slots_formation_slot_id_formation_slots_id_fk FOREIGN KEY (formation_slot_id) REFERENCES public.formation_slots(id) ON DELETE CASCADE;


--
-- Name: lineup_slots lineup_slots_lineup_id_lineups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineup_slots
    ADD CONSTRAINT lineup_slots_lineup_id_lineups_id_fk FOREIGN KEY (lineup_id) REFERENCES public.lineups(id) ON DELETE CASCADE;


--
-- Name: lineup_slots lineup_slots_team_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineup_slots
    ADD CONSTRAINT lineup_slots_team_member_id_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: lineups lineups_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineups
    ADD CONSTRAINT lineups_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lineups lineups_formation_id_formations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineups
    ADD CONSTRAINT lineups_formation_id_formations_id_fk FOREIGN KEY (formation_id) REFERENCES public.formations(id);


--
-- Name: lineups lineups_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.lineups
    ADD CONSTRAINT lineups_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_events match_events_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: match_events match_events_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_player_positions match_player_positions_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_player_positions
    ADD CONSTRAINT match_player_positions_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_player_positions match_player_positions_team_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_player_positions
    ADD CONSTRAINT match_player_positions_team_member_id_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: match_player_stats match_player_stats_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_player_stats
    ADD CONSTRAINT match_player_stats_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_player_stats match_player_stats_team_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_player_stats
    ADD CONSTRAINT match_player_stats_team_member_id_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: match_squad match_squad_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_squad
    ADD CONSTRAINT match_squad_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_squad match_squad_team_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.match_squad
    ADD CONSTRAINT match_squad_team_member_id_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: matches matches_competition_id_competitions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_competition_id_competitions_id_fk FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE RESTRICT;


--
-- Name: matches matches_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: matches matches_operator_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_operator_user_id_users_id_fk FOREIGN KEY (operator_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: matches matches_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: player_positions player_positions_position_code_positions_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.player_positions
    ADD CONSTRAINT player_positions_position_code_positions_code_fk FOREIGN KEY (position_code) REFERENCES public.positions(code);


--
-- Name: player_positions player_positions_team_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.player_positions
    ADD CONSTRAINT player_positions_team_member_id_team_members_id_fk FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_rated_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_rated_member_id_team_members_id_fk FOREIGN KEY (rated_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_rater_member_id_team_members_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_rater_member_id_team_members_id_fk FOREIGN KEY (rater_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict Td2XhaaAA5dlaaLoQWIWnoNTB2vxUNTWHePFyadpNKO3uexrL9zT8tg6r5EQ3rg

