-- Extend chip_X_mode to accept zone-preference modes.
--
-- Migration 0031 introduced `chip_a_mode`, `chip_b_mode`,
-- `chip_c_mode` on public.teams with a CHECK limiting values to
-- ('split', 'group') — the original cluster/spread modes. Steve
-- 2026-05-20 asked for a third behaviour: prefer chip-carriers
-- in a specific zone (forward / centre / back) so once the
-- mandatory-rotations age groups age out (U11+ in AFL, the older
-- netball brackets), coaches can encode "this kid is a natural
-- forward" without manually locking every quarter.
--
-- Five values now allowed:
--   - 'split'    — spread chip-mates across zones (existing)
--   - 'group'    — cluster chip-mates in one zone (existing)
--   - 'forward'  — prefer chip-mates in forward zones (new)
--   - 'centre'   — prefer chip-mates in midfield/centre (new)
--   - 'back'     — prefer chip-mates in defensive zones (new)
--
-- Strength: soft-strong — the suggester applies a substantial
-- bonus for zone matches but unplayed-third / fairness tiers can
-- still override. The hard equivalent is the existing per-game
-- long-press "Lock to zone" affordance.
--
-- The default of 'split' is preserved for both existing rows
-- (which already carry one of split/group) and any future
-- INSERT that omits the column.
--
-- Backwards compat: rows with existing 'split' or 'group' values
-- continue to validate. The CHECK is dropped and recreated
-- rather than ALTER-CHECK because pg's syntax for amending a
-- CHECK constraint is "drop then add" anyway.

alter table public.teams
  drop constraint if exists teams_chip_a_mode_check,
  drop constraint if exists teams_chip_b_mode_check,
  drop constraint if exists teams_chip_c_mode_check;

alter table public.teams
  add constraint teams_chip_a_mode_check
    check (chip_a_mode in ('split', 'group', 'forward', 'centre', 'back')),
  add constraint teams_chip_b_mode_check
    check (chip_b_mode in ('split', 'group', 'forward', 'centre', 'back')),
  add constraint teams_chip_c_mode_check
    check (chip_c_mode in ('split', 'group', 'forward', 'centre', 'back'));
