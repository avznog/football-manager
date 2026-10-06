-- The seven built-in formation templates, as rows, because an empty `formations` table is a dead
-- end the UI cannot route round.
--
-- This is `0006_seed_positions.sql`'s reasoning applied to the table that file left out.
-- `/match/<id>/composition` renders « Aucune formation disponible · Les formations types n'ont pas
-- été chargées dans la base. » when no row has `team_id IS NULL`, and `/match/<id>/saisie` the same,
-- so **no composition can be made at all**. That is what happened on production, where `db:migrate`
-- has run and `db:seed` / `db:bootstrap` never have: `seedReference()` in `db/seed-reference.ts` was
-- the only writer of these rows, and nothing in the deployment path calls it. Migrating is what
-- creates the schema, so migrating is what has to leave it usable — the generalisation of 0006,
-- which said the same thing about a constraint: migrating is what creates it, so migrating is what
-- has to satisfy it.
--
-- Ordering: this depends on `positions` being populated, because `formation_slots.position_code`
-- references `positions.code`. `0006_seed_positions.sql` guarantees that, and the journal runs it
-- first, so the dependency is satisfied by construction rather than by luck.
--
-- `db/reference.ts` remains the single source of truth for this geometry: `BUILTIN_FORMATIONS`
-- there is what the composition editor reads, what the tests assert on and what `seedReference()`
-- writes. This file is a copy of it at one moment in time, and `seedReference()` still owns every
-- later change — it replaces a built-in's slots wholesale on each `db:seed` / `db:bootstrap`, so a
-- renamed shape or a moved marker reaches an existing database through the seeder, not through a new
-- migration. Hence this file only ever inserts: its job is that the rows exist at all, and it must
-- never overwrite what the seeder has since refined, nor move a slot a saved composition points at.
--
-- Idempotent, and a no-op on the databases that already hold these rows — local and preview both
-- do. A built-in is identified by its `label` among the rows with `team_id IS NULL`, which is the
-- same key `seedReference()` uses, and slots are written only for a formation that has none. A
-- second run inserts nothing and can duplicate neither a formation nor a slot.
DO $$
DECLARE
	template record;
	built_in_id uuid;
BEGIN
	FOR template IN
		SELECT * FROM (VALUES
			('Classique 1-3-2-1'::text, '1-3-2-1'::text),
			('Milieu à trois 1-2-3-1', '1-2-3-1'),
			('Deux attaquants 1-3-1-2', '1-3-1-2'),
			('Carré 1-2-2-2', '1-2-2-2'),
			('Libéro 1-1-3-2', '1-1-3-2'),
			('Sans avant-centre 1-3-3-0', '1-3-3-0'),
			('Offensif 1-2-1-3', '1-2-1-3')
		) AS t ("name", "label")
	LOOP
		SELECT "id" INTO built_in_id
		FROM "formations"
		WHERE "team_id" IS NULL AND "label" = template."label"
		LIMIT 1;

		IF built_in_id IS NULL THEN
			INSERT INTO "formations" ("team_id", "name", "label")
			VALUES (NULL, template."name", template."label")
			RETURNING "id" INTO built_in_id;
		END IF;

		IF NOT EXISTS (SELECT 1 FROM "formation_slots" WHERE "formation_id" = built_in_id) THEN
			INSERT INTO "formation_slots" ("formation_id", "position_code", "x", "y", "sort")
			SELECT built_in_id, s."position_code", s."x", s."y", s."sort"
			FROM (VALUES
				('1-3-2-1'::text, 'GB'::text, 500, 60, 1),
				('1-3-2-1', 'DG', 170, 250, 2),
				('1-3-2-1', 'DC', 500, 240, 3),
				('1-3-2-1', 'DD', 830, 250, 4),
				('1-3-2-1', 'MC', 330, 520, 5),
				('1-3-2-1', 'MC', 670, 520, 6),
				('1-3-2-1', 'AT', 500, 830, 7),
				('1-2-3-1', 'GB', 500, 60, 1),
				('1-2-3-1', 'DC', 330, 240, 2),
				('1-2-3-1', 'DC', 670, 240, 3),
				('1-2-3-1', 'MG', 160, 520, 4),
				('1-2-3-1', 'MC', 500, 500, 5),
				('1-2-3-1', 'MD', 840, 520, 6),
				('1-2-3-1', 'AT', 500, 830, 7),
				('1-3-1-2', 'GB', 500, 60, 1),
				('1-3-1-2', 'DG', 170, 250, 2),
				('1-3-1-2', 'DC', 500, 240, 3),
				('1-3-1-2', 'DD', 830, 250, 4),
				('1-3-1-2', 'MC', 500, 510, 5),
				('1-3-1-2', 'AT', 330, 840, 6),
				('1-3-1-2', 'AT', 670, 840, 7),
				('1-2-2-2', 'GB', 500, 60, 1),
				('1-2-2-2', 'DC', 320, 240, 2),
				('1-2-2-2', 'DC', 680, 240, 3),
				('1-2-2-2', 'MG', 250, 510, 4),
				('1-2-2-2', 'MD', 750, 510, 5),
				('1-2-2-2', 'AT', 330, 840, 6),
				('1-2-2-2', 'AT', 670, 840, 7),
				('1-1-3-2', 'GB', 500, 60, 1),
				('1-1-3-2', 'DC', 500, 220, 2),
				('1-1-3-2', 'MG', 170, 480, 3),
				('1-1-3-2', 'MC', 500, 470, 4),
				('1-1-3-2', 'MD', 830, 480, 5),
				('1-1-3-2', 'AT', 330, 830, 6),
				('1-1-3-2', 'AT', 670, 830, 7),
				('1-3-3-0', 'GB', 500, 60, 1),
				('1-3-3-0', 'DG', 170, 250, 2),
				('1-3-3-0', 'DC', 500, 240, 3),
				('1-3-3-0', 'DD', 830, 250, 4),
				('1-3-3-0', 'MG', 200, 560, 5),
				('1-3-3-0', 'MOC', 500, 640, 6),
				('1-3-3-0', 'MD', 800, 560, 7),
				('1-2-1-3', 'GB', 500, 60, 1),
				('1-2-1-3', 'DC', 320, 240, 2),
				('1-2-1-3', 'DC', 680, 240, 3),
				('1-2-1-3', 'MC', 500, 500, 4),
				('1-2-1-3', 'AG', 180, 800, 5),
				('1-2-1-3', 'AT', 500, 860, 6),
				('1-2-1-3', 'AD', 820, 800, 7)
			) AS s ("label", "position_code", "x", "y", "sort")
			WHERE s."label" = template."label";
		END IF;
	END LOOP;
END $$;
