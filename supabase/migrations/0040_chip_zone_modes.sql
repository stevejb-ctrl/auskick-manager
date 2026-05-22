-- ─── 0040 — chip zone modes (forward / back, plus centre stub) ──
-- Widens the chip_{a,b,c}_mode CHECK constraint added by migration
-- 0031 to allow zone-preference modes alongside the existing
-- "split" / "group" cluster modes.
--
-- Steve 2026-05-20: rugby league has Forwards + Backs, no Centre.
-- AFL has Forwards / Centre / Backs (when its zone modes ship).
-- The constraint accepts all three zone modes here so both sports
-- can use the same column without a second migration. RL teams
-- will only ever pick forward / back from the picker; centre is
-- inert for them.
--
-- The default ('split') and the not-null constraint stay
-- untouched; this is purely a CHECK widening — every existing row
-- continues to validate.

do $$
begin
  alter table public.teams
    drop constraint if exists teams_chip_a_mode_check,
    drop constraint if exists teams_chip_b_mode_check,
    drop constraint if exists teams_chip_c_mode_check;
end $$;

alter table public.teams
  add constraint teams_chip_a_mode_check
    check (chip_a_mode in ('split', 'group', 'forward', 'centre', 'back')),
  add constraint teams_chip_b_mode_check
    check (chip_b_mode in ('split', 'group', 'forward', 'centre', 'back')),
  add constraint teams_chip_c_mode_check
    check (chip_c_mode in ('split', 'group', 'forward', 'centre', 'back'));
