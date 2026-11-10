// Local-only verification helper: put today's AFL game 4 s short of the
// Q2 hooter (15-minute quarters), so the hooter fires with the screen
// open. Same simulation as states.mjs's "afl-q2".
import { readFileSync } from "node:fs";
import path from "node:path";
import { STATE_DIR, MIN, simulateAfl, setGameEvents, anchorToNow } from "./lib.mjs";

const ids = JSON.parse(readFileSync(path.join(STATE_DIR, "help-ids.json"), "utf8"));
const players = ids.afl.players.filter((_, i) => i !== 4);
const upTo = { quarter: 2, elapsedMs: 15 * MIN - 4_000 };
const evs = simulateAfl({
  players, startMs: Date.now() - 3 * 3600_000, seed: 404,
  quarterMs: 15 * MIN, subEveryMs: 5 * MIN,
  goalsFor: [[1, 1], [1, 0], [0, 1], [1, 1]], goalsAgainst: [[0, 1], [1, 0], [1, 0], [0, 0]], upTo,
});
await setGameEvents(ids.afl.today, ids.coachId, anchorToNow(evs, 2, upTo.elapsedMs), "in_progress");
console.log("near-hooter set");
