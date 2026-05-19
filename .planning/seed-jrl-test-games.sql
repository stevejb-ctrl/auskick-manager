-- Seed 6 games per JRL Test team:
--   * 3 completed games (scheduled 1–3 weeks ago) with full event logs
--     so the proportionate-fairness suggester has season history to
--     bias on (lineups, swaps, vest rotations, tries, conversions).
--   * 3 upcoming games (scheduled 1–3 weeks ahead) for live-game UX
--     practice.
--
-- Per age group:
--   U6/U7  → 4 × 8 min quarters, 6 on field, no vests, no scoring
--   U8     → 4 × 8 min quarters, 8 on field, FR vest, scoring on
--   U9     → 4 × 8 min quarters, 8 on field, FR + DH, scoring on
--   U10/11 → 2 × 20 min halves,  11 on field, FR + DH, scoring on
--   U12    → 2 × 20 min halves,  13 on field, FR + DH, scoring on
--
-- Variation across the 3 completed games:
--   * Starting lineup rotates — game N starts player offset N so
--     different kids are on bench in different games (drives
--     msPlayed / msAvailable ratios apart).
--   * Vest wearers also rotate by game offset (FR / DH season totals
--     vary across players).
--   * One mid-period swap per quarter (off = longest-on-field).

do $$
declare
  v_team record;
  v_periods int;
  v_period_ms int;
  v_field_size int;
  v_needs_fr boolean;
  v_needs_dh boolean;
  v_track_scoring boolean;
  v_player_ids uuid[];
  v_squad_size int;

  v_game_id uuid;
  v_game_idx int;
  v_offset int;
  v_kickoff timestamptz;
  v_event_ts timestamptz;
  v_period int;

  v_field uuid[];
  v_bench uuid[];
  v_forwards uuid[];
  v_backs uuid[];
  v_fwd_count int;

  v_used_vests uuid[];
  v_vest_player uuid;

  v_off_player uuid;
  v_on_player uuid;
  v_scorer uuid;
  v_kicker uuid;
  v_used_kickers uuid[];

  v_round int;
begin
  for v_team in
    select id, age_group, track_scoring, name
    from public.teams
    where name like 'JRL Test %'
  loop
    -- Resolve per-age-group config.
    if v_team.age_group in ('U6', 'U7') then
      v_periods := 4; v_period_ms := 480000; v_field_size := 6;
      v_needs_fr := false; v_needs_dh := false;
    elsif v_team.age_group = 'U8' then
      v_periods := 4; v_period_ms := 480000; v_field_size := 8;
      v_needs_fr := true; v_needs_dh := false;
    elsif v_team.age_group = 'U9' then
      v_periods := 4; v_period_ms := 480000; v_field_size := 8;
      v_needs_fr := true; v_needs_dh := true;
    elsif v_team.age_group in ('U10', 'U11') then
      v_periods := 2; v_period_ms := 1200000; v_field_size := 11;
      v_needs_fr := true; v_needs_dh := true;
    elsif v_team.age_group = 'U12' then
      v_periods := 2; v_period_ms := 1200000; v_field_size := 13;
      v_needs_fr := true; v_needs_dh := true;
    end if;
    v_track_scoring := v_team.track_scoring;
    v_fwd_count := (v_field_size / 2)::int;

    -- Squad ordered by jersey for deterministic starter rotation.
    select array_agg(id order by jersey_number)
    into v_player_ids
    from public.players
    where team_id = v_team.id;
    v_squad_size := array_length(v_player_ids, 1);

    -- 3 completed games (Rounds 1–3) then 3 upcoming (Rounds 4–6).
    for v_game_idx in 1..6 loop
      v_game_id := gen_random_uuid();
      v_round := v_game_idx;

      if v_game_idx <= 3 then
        -- Completed game N kicked off (4 - N) weeks ago at 10am Sat.
        v_kickoff := date_trunc('day', now() - ((4 - v_game_idx) * 7 || ' days')::interval)
          + interval '10 hours';
        insert into public.games (
          id, team_id, opponent, scheduled_at, status,
          on_field_size, sub_interval_seconds, quarter_length_seconds,
          created_by, round_number
        ) values (
          v_game_id,
          v_team.id,
          'Rivals R' || v_round,
          v_kickoff,
          'completed',
          v_field_size,
          180,
          v_period_ms / 1000,
          '00000000-0000-0000-0000-00000000bbbb',
          v_round
        );

        -- Rotate starters by game_idx so different kids start each
        -- game (drives playtime ratio variation across the squad).
        v_offset := (v_game_idx - 1) % v_squad_size;
        v_field := array(
          select v_player_ids[((v_offset + i) % v_squad_size) + 1]
          from generate_series(0, v_field_size - 1) as i
        );
        v_bench := array(
          select v_player_ids[((v_offset + v_field_size + i) % v_squad_size) + 1]
          from generate_series(0, v_squad_size - v_field_size - 1) as i
        );
        v_forwards := v_field[1:v_fwd_count];
        v_backs := v_field[v_fwd_count + 1:array_length(v_field, 1)];

        -- lineup_set @ kickoff
        v_event_ts := v_kickoff;
        insert into public.game_events (
          game_id, type, metadata, created_at, created_by
        ) values (
          v_game_id,
          'lineup_set',
          jsonb_build_object(
            'lineup', jsonb_build_object(
              'forwards', to_jsonb(v_forwards),
              'backs', to_jsonb(v_backs),
              'bench', to_jsonb(v_bench)
            )
          ),
          v_event_ts,
          '00000000-0000-0000-0000-00000000bbbb'
        );

        v_used_vests := array[]::uuid[];
        v_used_kickers := array[]::uuid[];

        for v_period in 1..v_periods loop
          v_event_ts := v_event_ts + interval '1 second';
          -- quarter_start
          insert into public.game_events (
            game_id, type, metadata, created_at, created_by
          ) values (
            v_game_id, 'quarter_start',
            jsonb_build_object('quarter', v_period),
            v_event_ts,
            '00000000-0000-0000-0000-00000000bbbb'
          );

          -- FR vest: pick first on-field player who hasn't worn ANY
          -- vest this game.
          if v_needs_fr then
            v_event_ts := v_event_ts + interval '1 second';
            select p_id into v_vest_player
            from unnest(v_field) as p_id
            where not (p_id = any(v_used_vests))
            limit 1;
            if v_vest_player is not null then
              insert into public.game_events (
                game_id, type, player_id, metadata, created_at, created_by
              ) values (
                v_game_id, 'vest_assigned', v_vest_player,
                jsonb_build_object(
                  'vest', 'fr',
                  'period', v_period,
                  'replacement', false
                ),
                v_event_ts,
                '00000000-0000-0000-0000-00000000bbbb'
              );
              v_used_vests := array_append(v_used_vests, v_vest_player);
            end if;
          end if;

          if v_needs_dh then
            v_event_ts := v_event_ts + interval '1 second';
            select p_id into v_vest_player
            from unnest(v_field) as p_id
            where not (p_id = any(v_used_vests))
            limit 1;
            if v_vest_player is not null then
              insert into public.game_events (
                game_id, type, player_id, metadata, created_at, created_by
              ) values (
                v_game_id, 'vest_assigned', v_vest_player,
                jsonb_build_object(
                  'vest', 'dh',
                  'period', v_period,
                  'replacement', false
                ),
                v_event_ts,
                '00000000-0000-0000-0000-00000000bbbb'
              );
              v_used_vests := array_append(v_used_vests, v_vest_player);
            end if;
          end if;

          -- One mid-period swap: off = first field player (longest on),
          -- on = first bench player. Updates v_field / v_bench so the
          -- next period's vest pool reflects the swap.
          if array_length(v_bench, 1) > 0 then
            v_event_ts := v_event_ts + ((v_period_ms / 2 / 1000) || ' seconds')::interval;
            v_off_player := v_field[1];
            v_on_player := v_bench[1];
            insert into public.game_events (
              game_id, type, metadata, created_at, created_by
            ) values (
              v_game_id, 'swap',
              jsonb_build_object(
                'off_player_id', v_off_player,
                'on_player_id', v_on_player,
                'quarter', v_period,
                'elapsed_ms', v_period_ms / 2
              ),
              v_event_ts,
              '00000000-0000-0000-0000-00000000bbbb'
            );
            -- Rotate the arrays so the next swap picks fresh targets.
            v_field := array(
              select case when i = 1 then v_on_player else v_field[i] end
              from generate_series(1, array_length(v_field, 1)) as i
            );
            v_bench := array(
              select case when i = 1 then v_off_player else v_bench[i] end
              from generate_series(1, array_length(v_bench, 1)) as i
            );
            v_forwards := v_field[1:v_fwd_count];
            v_backs := v_field[v_fwd_count + 1:array_length(v_field, 1)];
          end if;

          -- Two tries per period for U8+: one team, one opponent (or
          -- two team — varies by game offset to give scorer
          -- distribution).
          if v_track_scoring then
            -- Team try @ 3/4 period
            v_event_ts := v_event_ts + ((v_period_ms / 4 / 1000) || ' seconds')::interval;
            -- Cycle scorer through the on-field set
            v_scorer := v_field[((v_period + v_game_idx) % array_length(v_field, 1)) + 1];
            insert into public.game_events (
              game_id, type, player_id, metadata, created_at, created_by
            ) values (
              v_game_id, 'try', v_scorer,
              jsonb_build_object('quarter', v_period, 'elapsed_ms', v_period_ms * 3 / 4),
              v_event_ts,
              '00000000-0000-0000-0000-00000000bbbb'
            );

            -- Conversion attempt by the kicker rotation. Pick a
            -- player who hasn't yet kicked this game; if all have,
            -- reset the rotation.
            select p_id into v_kicker
            from unnest(v_field) as p_id
            where not (p_id = any(v_used_kickers))
            order by 1
            limit 1;
            if v_kicker is null then
              v_used_kickers := array[]::uuid[];
              v_kicker := v_field[1];
            end if;
            v_used_kickers := array_append(v_used_kickers, v_kicker);
            v_event_ts := v_event_ts + interval '5 seconds';
            insert into public.game_events (
              game_id, type, player_id, metadata, created_at, created_by
            ) values (
              v_game_id, 'conversion_attempt', v_kicker,
              jsonb_build_object(
                'quarter', v_period,
                'elapsed_ms', v_period_ms * 3 / 4 + 5000,
                'made', (v_period + v_game_idx) % 2 = 0
              ),
              v_event_ts,
              '00000000-0000-0000-0000-00000000bbbb'
            );

            -- Opponent try on odd periods so the score isn't flat.
            if v_period % 2 = 1 then
              v_event_ts := v_event_ts + interval '20 seconds';
              insert into public.game_events (
                game_id, type, metadata, created_at, created_by
              ) values (
                v_game_id, 'opponent_try',
                jsonb_build_object('quarter', v_period, 'elapsed_ms', v_period_ms * 3 / 4 + 25000),
                v_event_ts,
                '00000000-0000-0000-0000-00000000bbbb'
              );
              if v_game_idx % 2 = 0 then
                v_event_ts := v_event_ts + interval '5 seconds';
                insert into public.game_events (
                  game_id, type, metadata, created_at, created_by
                ) values (
                  v_game_id, 'opponent_conversion',
                  jsonb_build_object('quarter', v_period, 'elapsed_ms', v_period_ms * 3 / 4 + 30000),
                  v_event_ts,
                  '00000000-0000-0000-0000-00000000bbbb'
                );
              end if;
            end if;
          end if;

          -- quarter_end at full period length
          v_event_ts := v_kickoff
            + ((v_period * (v_period_ms + 60000) / 1000) || ' seconds')::interval;
          insert into public.game_events (
            game_id, type, metadata, created_at, created_by
          ) values (
            v_game_id, 'quarter_end',
            jsonb_build_object('quarter', v_period, 'elapsed_ms', v_period_ms),
            v_event_ts,
            '00000000-0000-0000-0000-00000000bbbb'
          );
        end loop;

        -- game_finalised
        v_event_ts := v_event_ts + interval '1 minute';
        insert into public.game_events (
          game_id, type, metadata, created_at, created_by
        ) values (
          v_game_id, 'game_finalised', '{}'::jsonb,
          v_event_ts,
          '00000000-0000-0000-0000-00000000bbbb'
        );
      else
        -- Upcoming game: scheduled (game_idx - 3) weeks in the future.
        v_kickoff := date_trunc('day', now() + ((v_game_idx - 3) * 7 || ' days')::interval)
          + interval '10 hours';
        insert into public.games (
          id, team_id, opponent, scheduled_at, status,
          on_field_size, sub_interval_seconds, quarter_length_seconds,
          created_by, round_number
        ) values (
          v_game_id,
          v_team.id,
          'Rivals R' || v_round,
          v_kickoff,
          'upcoming',
          v_field_size,
          180,
          v_period_ms / 1000,
          '00000000-0000-0000-0000-00000000bbbb',
          v_round
        );
      end if;
    end loop;
  end loop;
end $$;
