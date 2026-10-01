-- The eleven canonical seven-a-side positions, as rows, because the schema's own foreign keys
-- depend on them.
--
-- `db/reference.ts` remains the single source of truth for this vocabulary: `POSITIONS` there is
-- what the pickers read, what the tests assert on, and what `seedReference()` writes. This file is
-- a copy of it at one moment in time, and it exists only because `player_positions.position_code`
-- and `formation_slots.position_code` both reference `positions.code` — so a database that has had
-- `db:migrate` run but not `db:bootstrap` has an empty `positions` table, and every save of a
-- preferred position raises `23503 foreign_key_violation` with nothing in the UI to explain it.
-- Migrating is what creates the constraint, so migrating is what has to satisfy it.
--
-- `seedReference()` still owns every later change to these rows: it upserts labels, lines and
-- coordinates on each `db:seed` / `db:bootstrap`, so a corrected label or a moved marker in
-- `db/reference.ts` reaches an existing database through it, not through a new migration. Hence
-- `ON CONFLICT DO NOTHING` rather than `DO UPDATE` here — this migration's job is that the rows
-- exist at all, and it must never overwrite what the seeder has since refined.
INSERT INTO "positions" ("code", "label_fr", "line", "default_x", "default_y", "sort") VALUES
	('GB', 'Gardien de but', 'GB', 500, 60, 1),
	('DG', 'Défenseur gauche', 'DEF', 190, 250, 2),
	('DC', 'Défenseur central', 'DEF', 500, 250, 3),
	('DD', 'Défenseur droit', 'DEF', 810, 250, 4),
	('MG', 'Milieu gauche', 'MIL', 190, 500, 5),
	('MC', 'Milieu central', 'MIL', 500, 500, 6),
	('MD', 'Milieu droit', 'MIL', 810, 500, 7),
	('MOC', 'Milieu offensif central', 'MIL', 500, 660, 8),
	('AG', 'Ailier gauche', 'ATT', 200, 850, 9),
	('AT', 'Attaquant', 'ATT', 500, 880, 10),
	('AD', 'Ailier droit', 'ATT', 800, 850, 11)
ON CONFLICT ("code") DO NOTHING;
