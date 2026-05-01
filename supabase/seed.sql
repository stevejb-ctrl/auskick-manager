-- =============================================================
-- UAT seed — runs after every `supabase db reset`.
--
-- We keep most seed work tiny. Creating auth users directly via
-- INSERT into auth.users is fragile (the password-hash format is
-- tied to Supabase internals) so the test harness creates users
-- programmatically via the admin API in e2e/fixtures/supabase.ts.
--
-- HOWEVER: the Kotara Koalas netball validation team (TEST-05) is
-- a deterministic seed that several specs benefit from. We seed it
-- here using a synthetic NEVER-LOGIN service account — the seed-bot
-- only owns rows; it never authenticates, so we don't touch
-- encrypted_password / email_confirmed_at / token columns. The
-- minimal auth.users INSERT below is the documented fragile path;
-- if this ever breaks on a Supabase CLI bump, the fallback is
-- scripts/seed-kotara-koalas.mjs (Option B per Plan 05-01 CONTEXT).
-- =============================================================

-- ─── Kotara Koalas netball seed (TEST-05) ────────────────────
do $$
declare
  v_seed_bot_id uuid := '00000000-0000-0000-0000-00000000aaaa';
  v_team_id     uuid := '5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11';
  v_player_ids  uuid[];
  v_game_ids    uuid[];
  v_game_id     uuid;
  v_started_at  timestamptz;
  i             integer;
  q             integer;
begin
  -- 1. seed-bot auth.users row (idempotent). No password — never
  --    authenticates. handle_new_user trigger creates the profile
  --    automatically; the explicit upsert below is a belt-and-braces
  --    safety net for older trigger variants.
  insert into auth.users (
    id, email, instance_id, aud, role, created_at, updated_at
  )
  values (
    v_seed_bot_id,
    'seed-bot@siren.local',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    now(),
    now()
  )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name)
  values (v_seed_bot_id, 'seed-bot@siren.local', 'Kotara Seed Bot')
  on conflict (id) do nothing;

  -- 2. Team row. handle_new_team trigger auto-inserts the seed-bot's
  --    admin team_membership (idempotent on re-run via the unique
  --    (team_id, user_id) constraint — INSERT ... ON CONFLICT covers
  --    the team itself).
  insert into public.teams (
    id, name, age_group, sport, track_scoring, created_by
  )
  values (
    v_team_id, 'Kotara Koalas', 'go', 'netball', false, v_seed_bot_id
  )
  on conflict (id) do nothing;

  -- 3. 9 active players — jersey 1..9, single-word names matching
  --    e2e/fixtures/factories.ts pool convention. enforce_max_players
  --    trigger caps at 15; we're under. ON CONFLICT keeps re-runs
  --    idempotent without DELETE-then-INSERT churn.
  insert into public.players (
    team_id, full_name, jersey_number, is_active, created_by
  )
  values
    (v_team_id, 'Alicia',  1, true, v_seed_bot_id),
    (v_team_id, 'Brendan', 2, true, v_seed_bot_id),
    (v_team_id, 'Camille', 3, true, v_seed_bot_id),
    (v_team_id, 'Damian',  4, true, v_seed_bot_id),
    (v_team_id, 'Elena',   5, true, v_seed_bot_id),
    (v_team_id, 'Felix',   6, true, v_seed_bot_id),
    (v_team_id, 'Gemma',   7, true, v_seed_bot_id),
    (v_team_id, 'Harvey',  8, true, v_seed_bot_id),
    (v_team_id, 'Ingrid',  9, true, v_seed_bot_id)
  on conflict (team_id, jersey_number) do nothing;

  -- 4. 5 simulated finalised games, rounds 1..5 backdated 5..1 weeks
  --    so NETBALL-02's tier-5 season-utilisation tiebreak has real
  --    multi-game history. Deterministic UUIDs keep re-runs stable.
  v_game_ids := array[
    'aaaaaaaa-0001-4a4a-aaaa-000000000001'::uuid,
    'aaaaaaaa-0002-4a4a-aaaa-000000000002'::uuid,
    'aaaaaaaa-0003-4a4a-aaaa-000000000003'::uuid,
    'aaaaaaaa-0004-4a4a-aaaa-000000000004'::uuid,
    'aaaaaaaa-0005-4a4a-aaaa-000000000005'::uuid
  ];

  for i in 1..5 loop
    insert into public.games (
      id, team_id, opponent, scheduled_at, round_number,
      status, created_by
    )
    values (
      v_game_ids[i],
      v_team_id,
      'Seed Opp R' || i,
      now() - (interval '7 days' * (6 - i)),
      i,
      'completed',
      v_seed_bot_id
    )
    on conflict (id) do nothing;
  end loop;

  -- 5. Pull the 9 active player UUIDs in jersey order so the
  --    lineup_set events reference real player ids the replay
  --    engine can resolve.
  select array_agg(id order by jersey_number) into v_player_ids
    from public.players
    where team_id = v_team_id and is_active = true;

  -- 6. For each game, seed minimal NETBALL-02-feeding event history:
  --       lineup_set (positions GS..GK = jersey 1..7, bench = 8..9)
  --       quarter_start × 4 + quarter_end × 4
  --       game_finalised
  --    Diverse on-court time emerges naturally because every quarter
  --    ends after 10 minutes with the same 7-on-court / 2-bench
  --    split — fairness pure-function math (netballFairness.test.ts)
  --    covers the tier-ordering edge cases; this seed just feeds the
  --    season-utilisation tiebreak with realistic per-player totals.
  --    Skip if game_events already has rows for this game (re-run
  --    idempotency without a foreign-key DELETE cascade).
  for i in 1..5 loop
    v_game_id := v_game_ids[i];
    if exists (
      select 1 from public.game_events where game_id = v_game_id limit 1
    ) then
      continue;
    end if;

    v_started_at := now() - (interval '7 days' * (6 - i));

    -- lineup_set: nested-Record positions shape per
    -- src/lib/sports/netball/fairness.ts:267-272 normaliseGenericLineup.
    insert into public.game_events (
      game_id, type, metadata, created_by, created_at
    )
    values (
      v_game_id,
      'lineup_set',
      jsonb_build_object(
        'lineup', jsonb_build_object(
          'positions', jsonb_build_object(
            'gs', jsonb_build_array(v_player_ids[1]),
            'ga', jsonb_build_array(v_player_ids[2]),
            'wa', jsonb_build_array(v_player_ids[3]),
            'c',  jsonb_build_array(v_player_ids[4]),
            'wd', jsonb_build_array(v_player_ids[5]),
            'gd', jsonb_build_array(v_player_ids[6]),
            'gk', jsonb_build_array(v_player_ids[7])
          ),
          'bench', jsonb_build_array(v_player_ids[8], v_player_ids[9])
        ),
        'sport', 'netball'
      ),
      v_seed_bot_id,
      v_started_at
    );

    for q in 1..4 loop
      insert into public.game_events (
        game_id, type, metadata, created_by, created_at
      )
      values
        (v_game_id, 'quarter_start',
         jsonb_build_object('quarter', q, 'sport', 'netball'),
         v_seed_bot_id,
         v_started_at + (interval '12 minutes' * (q - 1))),
        (v_game_id, 'quarter_end',
         jsonb_build_object('quarter', q, 'elapsed_ms', 600000, 'sport', 'netball'),
         v_seed_bot_id,
         v_started_at + (interval '12 minutes' * (q - 1)) + interval '10 minutes');
    end loop;

    insert into public.game_events (
      game_id, type, metadata, created_by, created_at
    )
    values (
      v_game_id,
      'game_finalised',
      jsonb_build_object('quarter', 4, 'elapsed_ms', 600000, 'sport', 'netball'),
      v_seed_bot_id,
      v_started_at + interval '50 minutes'
    );
  end loop;

  raise notice 'Kotara Koalas seed: team=%, 9 players, 5 games', v_team_id;
end $$;
