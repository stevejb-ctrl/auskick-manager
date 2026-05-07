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

2. Make sure `npm run dev` is running on `http://localhost:3000`.

3. Run a mission:

   ```sh
   node e2e/explore/run.mjs --mission=coach-onboarding
   ```

   Reports land in `e2e/explore/reports/<timestamp>-<mission>.md`.

## Available missions

| Mission             | What the agent tries                                  |
|---------------------|-------------------------------------------------------|
| `coach-onboarding`  | Create a team + squad + game from cold                |
| `game-day-flow`     | Use a runner link to start a game and score goals     |
| `fix-scores-flow`   | Reach a Q-break and use the Fix-scores panel          |

Add new missions by dropping a `*.md` file into `missions/`. The
file content IS the prompt — write it like you're briefing a real
tester.

## CLI flags

| Flag              | Default                          | Purpose                                                                  |
|-------------------|----------------------------------|--------------------------------------------------------------------------|
| `--mission=NAME`  | `coach-onboarding`               | Which mission file to load.                                              |
| `--url=URL`       | `http://localhost:3000/login`    | Where the agent starts. Useful for runner-token URLs (`/run/<token>`).   |
| `--max-steps=N`   | `25`                             | Hard cap on agent actions. Bump for complex missions.                    |
| `--model=NAME`    | `claude-sonnet-4-5`              | Override the LLM. `gpt-4.1` and `gemini-2.5-pro` also work.              |
| `--headed=BOOL`   | `true`                           | Set `--headed=false` to run in CI / for batch runs.                      |

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
