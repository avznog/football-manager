-- Decision 155 — trainings are removed, tables and all.
--
-- The owner's brief (`cahier-des-charges.md`): « Entraînements. Plus besoin de gérer ça. » and, asked
-- about the data, drop the tables (owner decision Q5, 2026-10-09). Production holds no training at
-- all, so nothing of value is lost; a dump is taken before an environment is migrated regardless.
--
-- Children first, so the `CASCADE` has nothing left to reach: the only foreign keys onto `trainings`
-- are the two tables dropped before it. `availability_status` is **not** dropped here —
-- `match_availability` still uses it until the availability slice removes that table too.
DROP TABLE "training_attendance" CASCADE;--> statement-breakpoint
DROP TABLE "training_availability" CASCADE;--> statement-breakpoint
DROP TABLE "trainings" CASCADE;
