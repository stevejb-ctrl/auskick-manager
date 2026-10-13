# Stagehand exploration

AI-driven exploratory tests. A Stagehand agent picks up a natural-
language mission, drives the local app like a confused user, and
writes back a markdown report listing what it tried and what it
found surprising.

## When to reach for this

Reach for it when scripted Playwright tests aren't catching what
real users hit:

- "The button works but the label is confusing"
- "I tapped through three screens before realising X"
- "It said success but the data didn't appear"
- "On a phone the bottom nav covers the action button"

The agent isn't a replacement for scripted regressions — it's a
**discovery tool**. Run it nightly (or on demand after a big UI
change), read the report, file bugs from the findings, then write
a scripted test for any real regression.

## Setup

1. Add an Anthropic API key to your shell:

   ```sh
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

   (OpenAI works too — set `OPENAI_API_KEY` and pass `--model=gpt-4.1`
   or similar.)

2. Start the dev server on the **local** Supabase stack (not prod):
   `node scripts/dev-local.mjs`, on `http://localhost:3000`.

3. Run a mission:

   ```sh
   node e2e/explore/run.mjs --mission=setup-afl-u15-positions --as=coach --headed=false
   node e2e/explore/run.mjs --mission=gameday-afl-u12 --as=coach --seed=afl-u12-gameday --max-steps=45
   ```

   Reports land in `e2e/explore/reports/<timestamp>-<mission>.md`.

## Available missions

How we play missions (run with `--as=coach`, plus the seed shown):

| Mission                          | Seed                  | What the agent tries                                  |
|----------------------------------|-----------------------|-------------------------------------------------------|
| `setup-afl-u15-positions`        |                       | U15 set positions: name positions, roles, a rule, game-day lineup |
| `setup-netball-rotation`         |                       | Pick a rotation style, season balance, Carnival day, home GS |
| `setup-league-named-positions`   |                       | Mod League named positions, vests in a fixed order, roles |
| `gameday-afl-u12`                | `afl-u12-gameday`     | Lineup, keep on, score + undo, injury, the break and Why |
| `gameday-afl-u15-positions`      | `afl-u15-gameday`     | Positions under time pressure, keep in the back line, like-for-like |
| `gameday-netball-11u`            | `netball-11u-gameday` | Sit-outs, keep GS, scoring, the break, handing over the phone |

Older missions (some still mention player chips, which How we play replaced):

| Mission             | What the agent tries                                  |
|---------------------|-------------------------------------------------------|
| `coach-onboarding`  | Create a team + squad + game from cold                |
| `game-day-flow`     | Use a runner link to start a game and score goals     |
| `fix-scores-flow`   | Reach a Q-break and use the Fix-scores panel          |

Missions that start part-way through a game need a seed that puts the
game there (`--as=coach --seed=…`):

| Mission                       | Seed                  | Starts at                                   |
|-------------------------------|-----------------------|---------------------------------------------|
| `chaotic-substitution-coach`  | `afl-u10-runner-q1`   | Q1 ticking, two kids not marked available   |
| `rushed-coach`                | `afl-u10-runner-half` | Half-time, two goals down, a behind missing |

Add new missions by dropping a `*.md` file into `missions/`. The
file content IS the prompt — write it like you're briefing a real
tester.

## CLI flags

| Flag              | Default                          | Purpose                                                                  |
|-------------------|----------------------------------|--------------------------------------------------------------------------|
| `--mission=NAME`  | `coach-onboarding`               | Which mission file to load.                                              |
| `--url=URL`       | `http://localhost:3000/login`    | Where the agent starts. Useful for runner-token URLs (`/run/<token>`).   |
| `--max-steps=N`   | `25`                             | Hard cap on agent actions. Bump for complex missions.                    |
| `--model=NAME`    | `anthropic/claude-haiku-5-5`     | The agent's model. Sonnet 5.5 rejects the forced "done" call Stagehand 3.3 makes. |
| `--act-model=NAME`| same as `--model`                | The model behind each click/type (`act`/`observe`).                        |
| `--mode=MODE`     | `hybrid`                         | `hybrid` clicks from screenshots; `dom` is Stagehand's legacy mode. In `dom` mode current Claude models fail (Stagehand 3.3 sends a temperature they reject). |
| `--headed=BOOL`   | `true`                           | Set `--headed=false` to run in CI / for batch runs.                      |
| `--as=coach`      | (off)                            | Start signed in as a brand-new coach: a fresh confirmed account on the **local** Supabase from `.env.test` (refuses anything that isn't localhost). |
| `--seed=NAME`     | (off)                            | With `--as=coach`: the coach already has a team, squad and a game today (`afl-u12-gameday`, `afl-u15-gameday`, `netball-11u-gameday`). Starts on the team's Today tab. |
| `--anthropic-base-url=URL` | (unset)               | The runner ignores an inherited `ANTHROPIC_BASE_URL` (shells started by Claude Code set one), unless you pass this. |

> **Never point the runner's Supabase at `.env.local`.** It holds
> production values. The dev server for walkthroughs runs on the local
> stack via `scripts/dev-local.mjs` (`.env.test`), and `--as=coach`
> reads `.env.test` for the same reason. The older token scripts
> (`scripts/fresh-explore-token.mjs` and friends) read `.env.local`, so
> run them with the `.env.test` Supabase values exported first.

## Cost guidance

A typical 25-step mission costs **~$0.10–0.50** with Claude Sonnet
4.5. The cost climbs with `--max-steps`, browser viewport, and how
chatty the system prompt is. Each report lists token usage at the
bottom — track that if budget matters.

## What works well + what doesn't

**Works well:**
- Discovering "I couldn't figure out where to click"
- Catching wording / labelling issues
- Spotting visual hierarchy problems (button gets lost in clutter)
- Validating mobile layouts

**Less reliable:**
- Strict assertions on numeric data (the agent paraphrases)
- Anything time-sensitive (the agent is slower than a script)
- Multi-step game flows that depend on the clock running

For numerical assertions and timing-sensitive flows, prefer
scripted Playwright specs in `e2e/tests/`. Use this folder for the
fuzzy stuff scripts can't catch.

## Triage workflow

1. Run the mission. Read the report.
2. Each finding either is a real bug or isn't:
   - **Real bug**: file in your tracker. Add a Playwright spec in
     `e2e/tests/` that pins the regression.
   - **Hallucination / agent confusion**: tighten the mission prompt.
3. Commit notable findings (or the report itself, if you want history)
   — but don't commit `reports/` by default; it's noisy.
