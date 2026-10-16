# Release checklist: `feat/ux-plan-2026-10` → `main` (migrations 0050–0067)

**Read this first: merging to `main` applies the migrations to production.**
`.github/workflows/db-push.yml` runs `supabase db push --include-all` against
the prod project on every push to `main`, and Vercel deploys the new code from
the same push. So everything in "Before merging" must be done **before** the
PR is merged. The merge is the migration.

The branch is 324 commits ahead of `main`. It brings 18 migrations
(0050–0067) and Next 14.2.29 → 14.2.35. There are no new environment
variables.

---

## 1. Before merging

### 1a. Choose the window
- [ ] A quiet weeknight. Not Friday night, Saturday or Sunday morning: junior
      games are live then. Steps 3–4 take about 30 minutes.
- [ ] Someone who can run SQL on prod and roll back on Vercel stays for the
      whole window.

### 1b. Back up prod
- [ ] Take a fresh backup just before merging: Supabase Dashboard → Database
      → Backups (or PITR), or a `pg_dump` of the prod DB. 0065 drops a column
      and 0050 / 0056 / 0059 / 0064 rewrite rows, and none of that can be
      undone except from a backup.

### 1c. Confirm what will run
- [ ] `supabase migration list --linked` (read-only). The remote should be
      missing exactly 0050–0067 and nothing else. If anything older shows as
      unapplied (a migration once run by hand and never recorded),
      `--include-all` will run it too. Resolve that first.

### 1d. Read-only data checks on prod
Run these in the SQL editor. They only read. Each says what a bad result
means.

```sql
-- (1) 0057 and 0058 re-add game_events_type_check, which validates EVERY
--     existing row. This must return no rows, or the migration fails part-way.
select type, count(*)
  from public.game_events
 where type not in (
   'lineup_set','quarter_start','quarter_end','game_finalised','player_arrived','injury',
   'swap','field_zone_swap','player_loan','player_lock','period_break_swap','roster_shrink',
   'try','opponent_try','conversion_attempt','opponent_conversion','kickoff_taken','vest_assigned',
   'league_position_change','penalty_goal','field_goal','opponent_penalty_goal','opponent_field_goal',
   'goal','behind','opponent_goal','opponent_behind','score_undo')
 group by type;

-- (2) 0061's trigger only checks NEW events, but any pair here is something
--     a team has written that the new rules would refuse. Expect none. If
--     there are some, find the code path before merging.
with allowed(sport, type) as (values
  ('afl','lineup_set'),('afl','quarter_start'),('afl','quarter_end'),('afl','game_finalised'),
  ('afl','player_arrived'),('afl','injury'),('afl','player_loan'),('afl','score_undo'),
  ('afl','swap'),('afl','field_zone_swap'),('afl','player_lock'),('afl','roster_shrink'),
  ('afl','goal'),('afl','behind'),('afl','opponent_goal'),('afl','opponent_behind'),
  ('netball','lineup_set'),('netball','quarter_start'),('netball','quarter_end'),('netball','game_finalised'),
  ('netball','player_arrived'),('netball','injury'),('netball','player_loan'),('netball','score_undo'),
  ('netball','period_break_swap'),('netball','player_lock'),('netball','goal'),('netball','opponent_goal'),
  ('rugby_league','lineup_set'),('rugby_league','quarter_start'),('rugby_league','quarter_end'),
  ('rugby_league','game_finalised'),('rugby_league','player_arrived'),('rugby_league','injury'),
  ('rugby_league','player_loan'),('rugby_league','score_undo'),('rugby_league','swap'),
  ('rugby_league','league_position_change'),('rugby_league','roster_shrink'),('rugby_league','try'),
  ('rugby_league','opponent_try'),('rugby_league','conversion_attempt'),('rugby_league','opponent_conversion'),
  ('rugby_league','penalty_goal'),('rugby_league','field_goal'),('rugby_league','opponent_penalty_goal'),
  ('rugby_league','opponent_field_goal'),('rugby_league','kickoff_taken'),('rugby_league','vest_assigned'))
select t.sport, e.type, count(*)
  from public.game_events e
  join public.games g on g.id = e.game_id
  join public.teams t on t.id = g.team_id
 where not exists (select 1 from allowed a where a.sport = t.sport and a.type = e.type)
 group by 1, 2;

-- (3) 0066 re-adds teams_sport_check. Every row must already be one of the four.
select sport, count(*) from public.teams group by sport;

-- (4) 0051 narrows nothing (5–18 becomes 4–18), but confirm there are no surprises.
select count(*) from public.games where on_field_size not between 4 and 18;

-- (5) 0056 and 0059 turn chips into home lines and rules. These are the rows
--     they'll read. Keep the numbers to compare in step 3.
select coalesce(t.sport,'afl') as sport, p.chip, count(*)
  from public.players p join public.teams t on t.id = p.team_id
 where p.chip is not null and p.is_active
 group by 1, 2 order by 1, 2;

-- (6) 0056 reads chip columns. They must exist (from 0043). This errors if not.
select chip_a_mode, chip_b_mode, chip_c_mode, chip_a_label from public.teams limit 1;
```

- [ ] (1) returns no rows.
- [ ] (2) returns no rows, or each row is understood and harmless.
- [ ] (3) shows only `afl`, `netball`, `rugby_league`.
- [ ] (4) is 0.
- [ ] (5) noted. (6) runs.

### 1e. Dry run on a copy (strongly recommended)
- [ ] Restore the 1b backup into a scratch Postgres. Never the shared local
      dev DB, and never prod. Apply 0050–0067 in order (`psql -f`, or
      `supabase db push --db-url <scratch>`), and confirm each one succeeds.
      This is the only real test of 0056 and 0059 against real chip data.
- [ ] Run the step 3 checks on the copy.

### 1f. The PR itself
- [ ] CI is green on the PR: lint, typecheck, unit and e2e.
- [ ] A local full e2e pass on the final commit, Chromium and WebKit (Claude
      runs this; the result goes in the PR).

---

## 2. Merge and watch (window starts)

- [ ] Merge the PR.
- [ ] Watch **Actions → "DB push (prod)"** until it's green (about 1–2 min).
- [ ] Watch **Vercel → Production** until the new deployment is Ready
      (about 3–5 min).

The DB push usually finishes first. For the few minutes until Vercel is
ready, the **old code runs against the new schema**:
- 0063 drops the AFL defaults on `teams.sport`, `teams.age_group`,
  `games.on_field_size` and `games.sub_interval_seconds`. The old code's
  "create game" or "create team" may fail if it relied on them.
- 0065 drops `games.subs_per_quarter`. Old code that names it would error.

That is why it needs a quiet window. Nothing is lost: a coach whose create
failed just tries again once the deploy is Ready.

**If "DB push (prod)" fails:** the new code will deploy against the old
schema, and How we play, union teams and saved holds will break. Either fix
and re-run the workflow (Run workflow), or roll Vercel back to the previous
production deployment straight away. Migrations before the failure have
applied; each one is idempotent or `if exists`-guarded, so a re-run is safe.

---

## 3. After the deploy is Ready

```sql
-- Seeds landed: 4 sports' event types (afl 16, netball 12, league 21, union 19)
select sport, count(*) from public.sport_event_types group by sport order by sport;
-- Lines: afl 3, netball 3, rugby_league 2, rugby_union 2
select sport, count(*) from public.sport_lines group by sport order by sport;
-- New triggers present
select tgname from pg_trigger
 where tgname in ('teams_sport_immutable','game_events_type_for_sport',
                  'team_positions_line_for_sport','player_position_prefs_line_for_sport',
                  'team_playbooks_vest_strategy_for_sport','guard_last_team_admin');
-- Chip conversion: home lines and chip rules (compare with 1d (5))
select kind, count(*) from public.player_position_prefs group by kind;
select count(*) from public.team_playbooks where rules::text like '%"source": "chips"%';
-- No AFL / netball playbook carries a vest strategy (0064)
select count(*) from public.team_playbooks tp join public.teams t on t.id = tp.team_id
 where t.sport <> 'rugby_league' and tp.vest_strategy is not null;   -- expect 0
```

Smoke test on prod with a real coach account (yours):
- [ ] Open an AFL, a netball and a league team's live screen for an
      existing game. They load, the clock runs and a score records.
- [ ] Team → How we play opens for each sport.
- [ ] Create a new game: it gets the age group's on-field size and sub
      interval (0063 removed the old AFL defaults).
- [ ] (Optional) Create a rugby union team, open game day, then delete the
      team (Team › Danger zone, 0052).

---

## 4. Rolling back

- **Code:** Vercel → Deployments → previous production → Instant Rollback.
  The old code then runs on the new schema (see step 2), so also apply this
  compatibility SQL, which puts back what the old code may rely on:

  ```sql
  alter table public.teams alter column sport set default 'afl';
  alter table public.teams alter column age_group set default 'U10';
  alter table public.games alter column on_field_size set default 12;
  alter table public.games alter column sub_interval_seconds set default 180;
  alter table public.games add column if not exists subs_per_quarter integer not null default 3
    check (subs_per_quarter between 1 and 10);
  ```
- **Schema:** the new tables, triggers and seed rows are additive and can stay
  under the old code. The rewritten rows (0050 game overrides → null, 0056 /
  0059 chips → prefs, 0064 vest strategy → null) only come back from the 1b
  backup.

---

## What each migration does

| # | Change | Risk |
|---|---|---|
| 0050 | `games.enforce_unbroken_periods` / `track_zone_time` become nullable; `false` → null (inherit the team) | Rewrites rows |
| 0051 | `games.on_field_size` may be 4 | None |
| 0052 | Leave a team, delete a team (RLS) + last-admin guard trigger | Coaches can now delete teams (cascades) |
| 0053 | How we play tables (`team_playbooks`, `team_positions`, `player_position_prefs`), `games.playbook_snapshot` | Additive |
| 0054 | `player_game_time` | Additive |
| 0055 | `team_playbooks.vest_strategy` | Additive |
| 0056 | Chips → home lines and rules | Data migration (1d (5)) |
| 0057 | Event type `player_lock` (re-adds the type check) | Validates all events (1d (1)) |
| 0058 | League penalty / field goals (re-adds the type check) | Validates all events (1d (1)) |
| 0059 | League chips → home lines (league teams only) | Data migration |
| 0060 | `teams.sport` can't change | Trigger |
| 0061 | `sport_event_types` + trigger; drops the all-sports check | Refuses new off-list events (1d (2)) |
| 0062 | `sport_lines` + triggers on positions and prefs | Refuses new off-list lines |
| 0063 | Drops AFL defaults on teams / games | Old code in the deploy window (step 2) |
| 0064 | Vest strategy is league-only (others → null) + trigger | Rewrites rows |
| 0065 | Drops `games.subs_per_quarter` (unused) | Irreversible, old code in the window |
| 0066 | Rugby union: sport, event types, lines | Re-validates `teams.sport` (1d (3)) |
| 0067 | `teams.on_field_size` (nullable) | Additive |
