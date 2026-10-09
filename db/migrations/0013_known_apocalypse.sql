-- Decision 156 — match availability and the relance message are removed, table and enum.
--
-- The owner's brief (`cahier-des-charges.md`) lists « Disponibilité pour le match » and « Message de
-- relance pour ceux qui n'ont pas répondu » among the things to remove, and owner decision Q5
-- (2026-10-09) says drop the tables. Production holds five answers; a dump is taken before an
-- environment is migrated.
--
-- The table goes first, because it holds the last column typed `availability_status`: the training
-- tables that shared the enum were dropped by `0011` (decision 155). No foreign key points at
-- `match_availability`, so the generated `CASCADE` reaches nothing else.
DROP TABLE "match_availability" CASCADE;--> statement-breakpoint
DROP TYPE "public"."availability_status";