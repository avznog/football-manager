-- One formation, five positions (decisions 157 and 158).
--
-- The owner's brief: a single shape, « 1 (GK), 2 (DC × 2), 3 (MC, et les deux ailiers sans faire de
-- différence), 1 (BU) », and exactly five positions — GB, DC, MC, AIL, AT. This migration does the
-- three things that cannot be left to `seedReference()`:
--
-- 1. the new position `AIL` « Ailier » exists, because `formation_slots.position_code` and
--    `player_positions.position_code` both reference `positions.code` and the next two statements
--    write it. Same `ON CONFLICT DO NOTHING` as `0006_seed_positions.sql`: the seeder owns every later
--    refinement of the row. `MIL`, because its two slots stand on the midfield line, which is what
--    keeps the formation's label `1-2-3-1`.
--
-- 2. the built-in `1-2-3-1`'s two side slots, `MG` and `MD`, become `AIL` **in place** — same rows,
--    same ids, same coordinates. The seeder would refuse to touch them (it leaves a built-in's slots
--    alone as soon as a composition uses them, and on production eight do), and in-place is also the
--    point: `lineup_slots` and the `LINEUP_APPLIED` / `SUBSTITUTION` payloads reference slot *ids*, so
--    every match already played on those two slots now reads « Ailier », as the owner asked. Team-drawn
--    formations and the six other built-ins are left exactly as they are: nothing offers them any more,
--    but an old `lineups.formation_id` may still point at one.
--
-- 3. `player_positions` is mapped onto the five codes (owner's Q10): DG/DD → DC; AG/AD/MG/MD → AIL;
--    MOC → MC (not in the owner's list, which predates it being retired — the attacking midfielder is
--    a central midfielder in a shape with one); GB, DC, MC, AT unchanged. Two old codes can land on
--    the same new one for one player (DG and DD both become DC), and `player_positions_unique` allows
--    one row per (member, code), so the mapped rows are **collapsed first** — `GROUP BY`, keeping
--    `primary` if any of them was — and then merged into whatever row the player already had at that
--    code with `ON CONFLICT`, again keeping `primary` over `secondary`. At most one primary per member
--    still holds afterwards, because it held before and a merge never creates a second one. The old
--    rows are deleted last. The retired codes' `positions` rows stay: retired formations' slots still
--    reference them.
--
-- Idempotent: a second run inserts no position, finds no `MG`/`MD` slot on the built-in and no
-- player row on a retired code.

INSERT INTO "positions" ("code", "label_fr", "line", "default_x", "default_y", "sort") VALUES
	('AIL', 'Ailier', 'MIL', 180, 520, 4)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
UPDATE "formation_slots"
SET "position_code" = 'AIL'
WHERE "position_code" IN ('MG', 'MD')
	AND "formation_id" IN (
		SELECT "id" FROM "formations" WHERE "team_id" IS NULL AND "label" = '1-2-3-1'
	);
--> statement-breakpoint
INSERT INTO "player_positions" ("team_member_id", "position_code", "preference")
SELECT
	"team_member_id",
	CASE "position_code"
		WHEN 'DG' THEN 'DC'
		WHEN 'DD' THEN 'DC'
		WHEN 'AG' THEN 'AIL'
		WHEN 'AD' THEN 'AIL'
		WHEN 'MG' THEN 'AIL'
		WHEN 'MD' THEN 'AIL'
		WHEN 'MOC' THEN 'MC'
	END AS "mapped_code",
	CASE WHEN bool_or("preference" = 'primary') THEN 'primary' ELSE 'secondary' END::"position_preference"
FROM "player_positions"
WHERE "position_code" IN ('DG', 'DD', 'AG', 'AD', 'MG', 'MD', 'MOC')
GROUP BY "team_member_id", "mapped_code"
ON CONFLICT ("team_member_id", "position_code") DO UPDATE
SET "preference" = CASE
	WHEN "player_positions"."preference" = 'primary' OR excluded."preference" = 'primary'
		THEN 'primary'::"position_preference"
	ELSE 'secondary'::"position_preference"
END;
--> statement-breakpoint
DELETE FROM "player_positions"
WHERE "position_code" IN ('DG', 'DD', 'AG', 'AD', 'MG', 'MD', 'MOC');
