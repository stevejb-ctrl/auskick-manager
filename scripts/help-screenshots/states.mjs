// Live-game states for today's games. setState(name) rewrites the
// relevant game's event log so the live page opens in that state.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  admin, must, STATE_DIR, MIN, simulateAfl, simulateNetball, simulateLeague, setGameEvents, anchorToNow,
} from "./lib.mjs";

export const ids = JSON.parse(readFileSync(path.join(STATE_DIR, "help-ids.json"), "utf8"));
const owner = ids.coachId;

const AFL_FOR = [[1, 1], [1, 0], [0, 1], [1, 1]];
const AFL_AGAINST = [[0, 1], [1, 0], [1, 0], [0, 0]];
const NB_FOR = [3, 2, 3, 2];
const NB_AGAINST = [2, 2, 1, 3];
const RL_TRIES = [[1, 1], [1, 0], [0, 0], [1, 1]];
const RL_OPP = [[0, 0], [1, 0], [1, 1], [0, 0]];

function aflPlayers() {
  // Levi (4) out → 14 available, 2 on the bench.
  const p = ids.afl.players;
  return p.filter((_, i) => i !== 4);
}

async function afl(upTo, agoMs) {
  const evs = simulateAfl({
    players: aflPlayers(), startMs: Date.now() - 3 * 3600_000, seed: 404,
    quarterMs: 15 * MIN, subEveryMs: 5 * MIN, goalsFor: AFL_FOR, goalsAgainst: AFL_AGAINST, upTo,
  });
  const anchored = anchorToNow(evs, upTo.quarter, agoMs);
  await setGameEvents(ids.afl.today, owner, anchored, "in_progress");
}

async function netball(upTo, agoMs) {
  const evs = simulateNetball({
    players: ids.netball.players, startMs: Date.now() - 3 * 3600_000, seed: 505,
    goalsFor: NB_FOR, goalsAgainst: NB_AGAINST, upTo,
  });
  await setGameEvents(ids.netball.today, owner, anchorToNow(evs, upTo.quarter, agoMs), "in_progress");
}

async function league(upTo, agoMs) {
  const evs = simulateLeague({
    players: ids.league.players, startMs: Date.now() - 3 * 3600_000, seed: 606,
    tries: RL_TRIES, oppTries: RL_OPP, upTo, midSwaps: [1],
  });
  await setGameEvents(ids.league.today, owner, anchorToNow(evs, upTo.quarter, agoMs), "in_progress");
}

export const STATES = {
  // Pre-game: nothing recorded yet → lineup picker.
  "afl-pregame": () => setGameEvents(ids.afl.today, owner, [], "upcoming"),
  "netball-pregame": () => setGameEvents(ids.netball.today, owner, [], "upcoming"),
  "league-pregame": () => setGameEvents(ids.league.today, owner, [], "upcoming"),
  // Mid second quarter.
  "afl-q2": () => afl({ quarter: 2, elapsedMs: 7 * MIN + 20_000 }, 7 * MIN + 20_000),
  "netball-q2": () => netball({ quarter: 2, elapsedMs: 5 * MIN + 40_000 }, 5 * MIN + 40_000),
  "league-q2": () => league({ quarter: 2, elapsedMs: 1 * MIN + 50_000 }, 1 * MIN + 50_000),
  // Sub due: just past the second rotation of Q2.
  // Load a few seconds BEFORE the rotation falls due; the alert fires
  // when the timer crosses zero with the screen open.
  "afl-subdue": () => afl({ quarter: 2, elapsedMs: 9 * MIN + 50_000 }, 9 * MIN + 48_000),
  "league-subdue": () => league({ quarter: 2, elapsedMs: 3 * MIN + 45_000 }, 3 * MIN + 52_000),
  // Break after Q2.
  "afl-break": () => afl({ quarter: 2, elapsedMs: 15 * MIN, ended: true }, 16 * MIN),
  "netball-break": () => netball({ quarter: 2, elapsedMs: 10 * MIN, ended: true }, 11 * MIN),
  "league-break": () => league({ quarter: 2, elapsedMs: 8 * MIN, ended: true }, 9 * MIN),
  // League: Q3 just started, kickoff not yet taken (Q1/Q2 takers show Done).
  "league-kickoff": () => league({ quarter: 3, elapsedMs: -1 }, 20_000),
  // Late Q3 for multi-coloured time bars.
  "afl-q3": () => afl({ quarter: 3, elapsedMs: 9 * MIN }, 9 * MIN),
};

export async function setState(name) {
  if (!STATES[name]) throw new Error(`unknown state ${name}`);
  await STATES[name]();
}

if (process.argv[1]?.endsWith("states.mjs")) {
  for (const s of process.argv.slice(2)) {
    await setState(s);
    console.log("state", s);
  }
}
