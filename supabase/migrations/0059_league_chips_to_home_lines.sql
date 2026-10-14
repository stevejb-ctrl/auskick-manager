-- ============================================================
-- League chips were lines, not groups (cross-sport audit, 14 Oct 2026).
--
-- 0043 seeded every league team's chips as A = "Forward", B = "Back",
-- both in 'group' mode, and the league suggester read the chip KEY as
-- the line (chip A → forwards, chip B → backs; see
-- src/lib/sports/rugby_league/positions.ts). 0056 converted chips by
-- mode, so league A / B became "keep together" rules — rules league's
-- engine never acts on — and no kid got a home line.
--
-- This puts it right for rugby_league teams only:
--   1. A "home" line pref per labelled, chipped, active player:
--      chip A → forwards, chip B → backs (chip C was never a line).
--      A kid who already has a home pref keeps it.
--   2. The chips-sourced A / B / C rules come off league teams'
--      How we play.
-- AFL and netball teams are untouched: their chip modes meant what
-- 0056 read them as.
-- ============================================================

-- 1. Home lines from league chips A / B.
insert into public.player_position_prefs (team_id, player_id, line, kind, rank)
select
  p.team_id,
  p.id,
  case p.chip when 'a' then 'forwards' else 'backs' end,
  'home',
  0
from public.players p
join public.teams t on t.id = p.team_id
where t.sport = 'rugby_league'
  and p.is_active
  and p.chip in ('a', 'b')
  and nullif(btrim(case p.chip when 'a' then t.chip_a_label else t.chip_b_label end), '') is not null
  and not exists (
    select 1 from public.player_position_prefs x where x.player_id = p.id and x.kind = 'home'
  );

-- 2. Drop 0056's chip group rules from league teams.
update public.team_playbooks tp
   set rules = coalesce(
         (select jsonb_agg(r)
            from jsonb_array_elements(tp.rules) r
           where not (r->>'source' = 'chips' and r->>'id' in ('chip-a', 'chip-b', 'chip-c'))),
         '[]'::jsonb)
  from public.teams t
 where t.id = tp.team_id
   and t.sport = 'rugby_league'
   and exists (
     select 1 from jsonb_array_elements(tp.rules) r
      where r->>'source' = 'chips' and r->>'id' in ('chip-a', 'chip-b', 'chip-c')
   );
