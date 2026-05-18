-- ============================================================
-- Rugby League: forward/back position chips.
--
-- Repurposes the existing player-chip slots (A/B/C) for RL teams
-- as a position-class system:
--
--   chip_a = "Forward" (group mode)
--   chip_b = "Back"    (group mode)
--   chip_c = unused (coach can opt-in for a third bucket)
--
-- The chip semantics on AFL + netball teams are UNCHANGED — this
-- migration only touches rows where sport = 'rugby_league'. The
-- forward/back labels seed the CohortChipsSettings UI and the
-- group mode tells the lineup suggester to keep chip-mates pooled
-- together (the chip-aware RL suggester reads chip A → forwards,
-- chip B → backs).
--
-- Two changes:
--   1. game_events.type whitelist gains 'league_position_change'
--      — emitted when a coach long-presses a player tile and
--      picks "Move to backs" / "Move to forwards" mid-game. The
--      replayer moves the player between lineup.forwards and
--      lineup.backs without touching field membership.
--      Metadata: { to_zone: 'forward' | 'back' }.
--
--   2. UPDATE every existing RL team to seed chip_a/b labels +
--      modes, AND install a trigger on INSERT so new RL teams
--      inherit the same defaults. The trigger is permissive: it
--      only fills slots the caller left null (so a future
--      rugby_league team creation flow that pre-fills its own
--      labels keeps them).
-- ============================================================

-- ─── game_events.type — add league_position_change ───────────
-- Defensive drop + recreate so the constraint definition stays in
-- a single migration. Mirrors 0037's pattern.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'game_events'
      and constraint_name = 'game_events_type_check'
  ) then
    alter table public.game_events drop constraint game_events_type_check;
  end if;
end $$;

alter table public.game_events
  add constraint game_events_type_check check (type in (
    -- Shared core
    'lineup_set',
    'quarter_start',
    'quarter_end',
    'game_finalised',
    'player_arrived',
    'injury',
    -- AFL mid-play rotation
    'swap',
    'field_zone_swap',
    'player_loan',
    -- Netball period-break rotation
    'period_break_swap',
    -- Rugby league scoring
    'try',
    'opponent_try',
    'conversion_attempt',
    'opponent_conversion',
    -- Rugby league rotations
    'kickoff_taken',
    'vest_assigned',
    -- Rugby league position chip override (forward ↔ back mid-game)
    'league_position_change',
    -- AFL + netball scoring
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));

-- ─── Seed Forward/Back chip defaults on existing RL teams ────
-- Only overwrite slots the coach left null — once they rename a
-- chip we honour their label. Modes flip to 'group' for A + B
-- only when the slot was at its post-0031 default of 'split'; if
-- the coach already set 'group' for some other reason we leave it.
update public.teams
   set chip_a_label = coalesce(chip_a_label, 'Forward'),
       chip_b_label = coalesce(chip_b_label, 'Back'),
       chip_a_mode  = case
                        when chip_a_mode = 'split' and chip_a_label is null
                          then 'group'
                        else chip_a_mode
                      end,
       chip_b_mode  = case
                        when chip_b_mode = 'split' and chip_b_label is null
                          then 'group'
                        else chip_b_mode
                      end
 where sport = 'rugby_league';

-- ─── Trigger: seed defaults on new RL team INSERT ────────────
-- BEFORE INSERT so we mutate NEW.* in place. Fires only when the
-- caller didn't already pick a label for slot A or B; modes flip
-- to 'group' only when the slot was about to inherit the column
-- default of 'split' AND no label was provided (mirrors the
-- backfill rule above so coaches who already configure chips up
-- front during team creation keep their picks).
create or replace function public.seed_rugby_league_position_chips()
returns trigger
language plpgsql
as $$
begin
  if NEW.sport = 'rugby_league' then
    if NEW.chip_a_label is null then
      NEW.chip_a_label := 'Forward';
      NEW.chip_a_mode := 'group';
    end if;
    if NEW.chip_b_label is null then
      NEW.chip_b_label := 'Back';
      NEW.chip_b_mode := 'group';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_seed_rugby_league_position_chips on public.teams;
create trigger trg_seed_rugby_league_position_chips
  before insert on public.teams
  for each row
  execute function public.seed_rugby_league_position_chips();
