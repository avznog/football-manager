-- =====================================================
-- FC Manager - Schéma Supabase
-- À exécuter dans le SQL Editor de Supabase (une fois)
-- =====================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------
-- Types
-- ---------------------------------------------------

do $$ begin create type competition_type as enum ('championnat', 'coupe');
exception when duplicate_object then null; end $$;

do $$ begin create type formation_type as enum ('2-3-1', '3-2-1');
exception when duplicate_object then null; end $$;

do $$ begin create type match_status as enum ('upcoming', 'played');
exception when duplicate_object then null; end $$;

do $$ begin create type availability_status as enum ('yes', 'no');
exception when duplicate_object then null; end $$;

do $$ begin create type lineup_role as enum ('player', 'supporter');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------
-- Tables
-- ---------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  jersey_number int,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  opponent text not null,
  match_date timestamptz not null,
  competition competition_type not null,
  formation formation_type not null default '2-3-1',
  status match_status not null default 'upcoming',
  goals_for int,
  goals_against int,
  venue text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists availabilities (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  status availability_status not null,
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists lineups (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  role lineup_role not null,
  slot text,  -- 'GK','DEF_L','DEF_C','DEF_R','MID_L','MID_C','MID_R','ATT' — null pour supporters/banc
  minutes_played int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  unique (match_id, player_id)
);

create table if not exists goals_conceded (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  minute int,
  created_at timestamptz not null default now()
);

create table if not exists goals_conceded_lineup (
  goal_id uuid not null references goals_conceded(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  primary key (goal_id, player_id)
);

create table if not exists ratings (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  rater_id uuid not null references profiles(id) on delete cascade,
  rated_player_id uuid not null references profiles(id) on delete cascade,
  rating numeric(3,1) not null check (rating >= 0 and rating <= 10),
  created_at timestamptz not null default now(),
  unique (match_id, rater_id, rated_player_id)
);

-- ---------------------------------------------------
-- Helper
-- ---------------------------------------------------

create or replace function is_admin(uid uuid)
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select is_admin from profiles where id = uid), false);
$$;

-- ---------------------------------------------------
-- Auto-création du profil à l'inscription
-- ---------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    false
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------
-- RLS
-- ---------------------------------------------------

alter table profiles enable row level security;
alter table matches enable row level security;
alter table availabilities enable row level security;
alter table lineups enable row level security;
alter table goals_conceded enable row level security;
alter table goals_conceded_lineup enable row level security;
alter table ratings enable row level security;

-- Profiles : tout le monde lit, chacun modifie le sien (admin modifie tout)
drop policy if exists "profiles_read_all" on profiles;
create policy "profiles_read_all" on profiles for select to authenticated using (true);

drop policy if exists "profiles_update_self_or_admin" on profiles;
create policy "profiles_update_self_or_admin" on profiles for update to authenticated
  using (id = auth.uid() or is_admin(auth.uid()));

-- Matches : tout le monde lit, admin écrit
drop policy if exists "matches_read_all" on matches;
create policy "matches_read_all" on matches for select to authenticated using (true);

drop policy if exists "matches_admin_write" on matches;
create policy "matches_admin_write" on matches for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Availabilities : lecture publique, chaque joueur écrit la sienne
drop policy if exists "avail_read_all" on availabilities;
create policy "avail_read_all" on availabilities for select to authenticated using (true);

drop policy if exists "avail_write_self" on availabilities;
create policy "avail_write_self" on availabilities for all to authenticated
  using (player_id = auth.uid() or is_admin(auth.uid()))
  with check (player_id = auth.uid() or is_admin(auth.uid()));

-- Lineups : lecture publique, admin écrit
drop policy if exists "lineups_read_all" on lineups;
create policy "lineups_read_all" on lineups for select to authenticated using (true);

drop policy if exists "lineups_admin_write" on lineups;
create policy "lineups_admin_write" on lineups for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Goals conceded : lecture publique, admin écrit
drop policy if exists "gc_read_all" on goals_conceded;
create policy "gc_read_all" on goals_conceded for select to authenticated using (true);

drop policy if exists "gc_admin_write" on goals_conceded;
create policy "gc_admin_write" on goals_conceded for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists "gcl_read_all" on goals_conceded_lineup;
create policy "gcl_read_all" on goals_conceded_lineup for select to authenticated using (true);

drop policy if exists "gcl_admin_write" on goals_conceded_lineup;
create policy "gcl_admin_write" on goals_conceded_lineup for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Ratings : LE POINT CRITIQUE
-- INSERT : seulement si je suis dans le lineup du match
drop policy if exists "ratings_insert_if_in_lineup" on ratings;
create policy "ratings_insert_if_in_lineup" on ratings for insert to authenticated
  with check (
    rater_id = auth.uid()
    and exists (
      select 1 from lineups
      where match_id = ratings.match_id and player_id = auth.uid()
    )
  );

-- UPDATE/DELETE : uniquement ses propres notes
drop policy if exists "ratings_update_own" on ratings;
create policy "ratings_update_own" on ratings for update to authenticated
  using (rater_id = auth.uid());

drop policy if exists "ratings_delete_own" on ratings;
create policy "ratings_delete_own" on ratings for delete to authenticated
  using (rater_id = auth.uid());

-- SELECT : chaque joueur voit les notes qu'il a MISES ; l'admin voit tout
drop policy if exists "ratings_select_own_or_admin" on ratings;
create policy "ratings_select_own_or_admin" on ratings for select to authenticated
  using (rater_id = auth.uid() or is_admin(auth.uid()));

-- ---------------------------------------------------
-- Après le 1er signup :
--   update public.profiles set is_admin = true where full_name = '...';
-- pour te promouvoir admin depuis le SQL editor.
-- ---------------------------------------------------
