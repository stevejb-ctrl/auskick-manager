// Seed realistic AFL / netball / league teams for the help screenshots.
// Local Supabase only (see lib.mjs). Idempotent: wipes and
// recreates the two help-shots accounts and their teams.

import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  admin, must, findUser, COACH, NEW_COACH, STATE_DIR, MIN, rng,
  simulateAfl, simulateNetball, simulateLeague, setGameEvents,
} from "./lib.mjs";

const DAY = 86_400_000;

function localAt(daysFromToday, hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hh, mm, 0, 0);
  return d;
}

async function resetUser(u) {
  const existing = await findUser(u.email);
  if (existing) {
    const teams = await must(admin.from("teams").select("id").eq("created_by", existing.id), "teams");
    for (const t of teams) await must(admin.from("teams").delete().eq("id", t.id), "delete team");
    const { error } = await admin.auth.admin.deleteUser(existing.id);
    if (error) throw new Error(`deleteUser: ${error.message}`);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.name },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  await must(admin.from("profiles").update({ full_name: u.name }).eq("id", data.user.id), "profile name");
  return data.user.id;
}

async function makeTeam(ownerId, fields) {
  await must(admin.from("teams").insert({ ...fields, created_by: ownerId }), "team insert");
  const t = await must(
    admin.from("teams").select("id").eq("name", fields.name).eq("created_by", ownerId).single(),
    "team fetch",
  );
  return t.id;
}

async function makePlayers(teamId, ownerId, list) {
  const rows = list.map(([full_name, jersey_number]) => ({
    team_id: teamId,
    full_name,
    jersey_number: jersey_number ?? null,
    is_active: true,
    created_by: ownerId,
  }));
  const data = await must(admin.from("players").insert(rows).select("id, full_name"), "players");
  // Keep squad order.
  return list.map(([n]) => data.find((d) => d.full_name === n).id);
}

// What a coach-created game gets (lib/games/newGameDefaults: the age
// group's quarter-length-derived interval). AFL U11 and netball 11 & Under
// play 15- and 10-minute quarters (5 min), league U9 8-minute quarters (4).
const SUB_INTERVAL = { afl: 300, netball: 300, league: 240 };

async function makeGame(teamId, ownerId, g) {
  const row = await must(
    admin
      .from("games")
      .insert({
        team_id: teamId,
        opponent: g.opponent,
        scheduled_at: g.at.toISOString(),
        round_number: g.round,
        location: g.location ?? null,
        on_field_size: g.onField,
        sub_interval_seconds: g.subInterval,
        status: "upcoming",
        created_by: ownerId,
      })
      .select("id")
      .single(),
    "game insert",
  );
  return row.id;
}

async function setAvailability(gameId, ownerId, playerIds, unavailable = [], unknown = []) {
  const rows = playerIds
    .filter((p) => !unknown.includes(p))
    .map((p) => ({
      game_id: gameId,
      player_id: p,
      status: unavailable.includes(p) ? "unavailable" : "available",
      updated_by: ownerId,
    }));
  await must(admin.from("game_availability").insert(rows), "availability");
}

function shuffled(ids, seed) {
  const r = rng(seed);
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Squads ──────────────────────────────────────────────────
const AFL_SQUAD = [
  ["Hugo Nguyen", 1], ["Maya Kelly", 2], ["Theo Russo", 3], ["Ava Okafor", 4],
  ["Levi Brennan", 5], ["Zara Haddad", 6], ["Otis Walsh", 7], ["Indi Murray", 8],
  ["Sam Petrakis", 9], ["Frankie Doyle", 10], ["Ruby Chen", 11], ["Mateo Silva", 12],
  ["Nora Fitzgerald", 13], ["Eli Johnson", 14], ["Pip Anderson", 15],
];
const NETBALL_SQUAD = [
  ["Aria Thompson"], ["Bea Nguyen"], ["Charlie Morgan"], ["Daisy Patel"], ["Eliza O'Brien"],
  ["Frankie Lee"], ["Grace Wilson"], ["Harlow Smith"], ["Iris Kowalski"], ["Jade Mitchell"],
];
const LEAGUE_SQUAD = [
  ["Archie Tuilagi", 1], ["Billy Fraser", 2], ["Cooper Ngata", 3], ["Dylan Moore", 4],
  ["Eddie Kaufusi", 5], ["Finn Gallagher", 6], ["George Taufa", 7], ["Harry Lin", 8],
  ["Isaac Barnes", 9], ["Jack Fonua", 10], ["Kobe Wright", 11],
];

async function main() {
  const coachId = await resetUser(COACH);
  const newCoachId = await resetUser(NEW_COACH);
  const ids = { coachId, newCoachId };

  // ── AFL ────────────────────────────────────────────────────
  const aflTeam = await makeTeam(coachId, {
    name: "Brunswick Magpies", sport: "afl", age_group: "U11", track_scoring: true,
  });
  const afl = await makePlayers(aflTeam, coachId, AFL_SQUAD);
  const aflGames = [];
  const aflFixtures = [
    { round: 1, opponent: "Coburg Lions", days: -19, location: "Gilpin Park",
      for: [[1, 1], [2, 0], [1, 2], [2, 1]], against: [[1, 0], [0, 2], [1, 1], [1, 0]], out: [] },
    { round: 2, opponent: "Northcote Park", days: -12, location: "Bill Lawry Oval",
      for: [[0, 1], [1, 1], [1, 0], [1, 2]], against: [[2, 0], [1, 1], [1, 1], [1, 0]], out: [13] },
    { round: 3, opponent: "Fitzroy Stars", days: -5, location: "Gilpin Park",
      for: [[2, 0], [1, 2], [1, 1], [2, 0]], against: [[1, 1], [1, 0], [2, 1], [1, 2]], out: [5] },
  ];
  for (const f of aflFixtures) {
    const at = localAt(f.days, 9, 0);
    const gid = await makeGame(aflTeam, coachId, { ...f, at, onField: 12, subInterval: SUB_INTERVAL.afl });
    const out = f.out.map((i) => afl[i]);
    await setAvailability(gid, coachId, afl, out);
    const avail = shuffled(afl.filter((p) => !out.includes(p)), f.round * 11);
    const evs = simulateAfl({
      players: avail, startMs: at.getTime() + 5 * MIN, seed: f.round * 7, quarterMs: 15 * MIN, subEveryMs: 5 * MIN,
      goalsFor: f.for, goalsAgainst: f.against,
    });
    await setGameEvents(gid, coachId, evs, "completed");
    aflGames.push(gid);
  }
  const aflToday = await makeGame(aflTeam, coachId, {
    round: 4, opponent: "Westgarth Tigers", at: localAt(0, 9, 0), location: "Gilpin Park", onField: 12, subInterval: SUB_INTERVAL.afl,
  });
  await setAvailability(aflToday, coachId, afl, [afl[4]]);
  const aflNext = await makeGame(aflTeam, coachId, {
    round: 5, opponent: "Moreland Saints", at: localAt(9, 9, 0), location: "Raeburn Reserve", onField: 12, subInterval: SUB_INTERVAL.afl,
  });
  ids.afl = { teamId: aflTeam, players: afl, completed: aflGames, today: aflToday, next: aflNext };

  // ── Netball ────────────────────────────────────────────────
  const nbTeam = await makeTeam(coachId, {
    name: "Brunswick Swifts", sport: "netball", age_group: "11u", track_scoring: true,
  });
  const nb = await makePlayers(nbTeam, coachId, NETBALL_SQUAD);
  const nbGames = [];
  const nbFixtures = [
    { round: 1, opponent: "Thornbury Thunder", days: -19, for: [3, 2, 4, 3], against: [2, 3, 2, 1], out: [] },
    { round: 2, opponent: "Preston Flames", days: -12, for: [2, 1, 3, 2], against: [3, 3, 2, 3], out: [8] },
    { round: 3, opponent: "Carlton Comets", days: -5, for: [4, 3, 3, 4], against: [2, 2, 3, 2], out: [] },
  ];
  for (const f of nbFixtures) {
    const at = localAt(f.days, 10, 30);
    const gid = await makeGame(nbTeam, coachId, { ...f, at, onField: 7, subInterval: SUB_INTERVAL.netball, location: "Brunswick Netball Courts" });
    const out = f.out.map((i) => nb[i]);
    await setAvailability(gid, coachId, nb, out);
    const avail = shuffled(nb.filter((p) => !out.includes(p)), f.round * 13);
    const evs = simulateNetball({
      players: avail, startMs: at.getTime() + 5 * MIN, seed: f.round * 5,
      goalsFor: f.for, goalsAgainst: f.against,
    });
    await setGameEvents(gid, coachId, evs, "completed");
    nbGames.push(gid);
  }
  const nbToday = await makeGame(nbTeam, coachId, {
    round: 4, opponent: "Ivanhoe Jets", at: localAt(0, 10, 30), onField: 7, subInterval: SUB_INTERVAL.netball, location: "Brunswick Netball Courts",
  });
  await setAvailability(nbToday, coachId, nb, []);
  const nbNext = await makeGame(nbTeam, coachId, {
    round: 5, opponent: "Coburg Cyclones", at: localAt(9, 10, 30), onField: 7, subInterval: SUB_INTERVAL.netball, location: "Coburg Leisure Centre",
  });
  ids.netball = { teamId: nbTeam, players: nb, completed: nbGames, today: nbToday, next: nbNext };

  // ── Rugby league (U9: quarters, FR + DH vests) ─────────────
  const rlTeam = await makeTeam(coachId, {
    name: "Brunswick Bears", sport: "rugby_league", age_group: "U9", track_scoring: true,
  });
  const rl = await makePlayers(rlTeam, coachId, LEAGUE_SQUAD);
  const rlGames = [];
  const rlFixtures = [
    { round: 1, opponent: "Coburg Raiders", days: -19,
      tries: [[1, 1], [1, 0], [2, 1], [0, 0]], opp: [[0, 0], [1, 1], [0, 0], [1, 0]], out: [] },
    { round: 2, opponent: "Northern Thunder", days: -12,
      tries: [[0, 0], [1, 1], [0, 0], [1, 0]], opp: [[1, 1], [1, 0], [1, 1], [0, 0]], out: [] },
    { round: 3, opponent: "Preston Bulldogs", days: -5,
      tries: [[1, 0], [1, 1], [1, 1], [1, 0]], opp: [[1, 0], [0, 0], [1, 1], [0, 0]], out: [10] },
  ];
  for (const f of rlFixtures) {
    const at = localAt(f.days, 8, 30);
    const gid = await makeGame(rlTeam, coachId, { ...f, at, onField: 8, subInterval: SUB_INTERVAL.league, location: "Sumner Park" });
    const out = f.out.map((i) => rl[i]);
    await setAvailability(gid, coachId, rl, out);
    const avail = shuffled(rl.filter((p) => !out.includes(p)), f.round * 17);
    const evs = simulateLeague({
      players: avail, startMs: at.getTime() + 5 * MIN, seed: f.round * 3,
      tries: f.tries, oppTries: f.opp, midSwaps: f.round === 2 ? [1, 2, 3] : [1, 3],
    });
    await setGameEvents(gid, coachId, evs, "completed");
    rlGames.push(gid);
  }
  const rlToday = await makeGame(rlTeam, coachId, {
    round: 4, opponent: "Reservoir Rhinos", at: localAt(0, 8, 30), onField: 8, subInterval: SUB_INTERVAL.league, location: "Sumner Park",
  });
  await setAvailability(rlToday, coachId, rl, []);
  const rlNext = await makeGame(rlTeam, coachId, {
    round: 5, opponent: "Altona Roosters", at: localAt(9, 8, 30), onField: 8, subInterval: SUB_INTERVAL.league, location: "Sumner Park",
  });
  ids.league = { teamId: rlTeam, players: rl, completed: rlGames, today: rlToday, next: rlNext };

  // ── New coach (getting started): a fresh AFL team, 3 players ─
  const ncTeam = await makeTeam(newCoachId, {
    name: "Brunswick U10s", sport: "afl", age_group: "U10", track_scoring: false,
  });
  const nc = await makePlayers(ncTeam, newCoachId, [["Mia Hughes", 1], ["Noah Park", 2], ["Lily Evans", 3]]);
  ids.newCoach = { teamId: ncTeam, players: nc };

  writeFileSync(path.join(STATE_DIR, "help-ids.json"), JSON.stringify(ids, null, 2));
  console.log("seeded", JSON.stringify({ afl: aflTeam, netball: nbTeam, league: rlTeam, newCoach: ncTeam }));
}

await main();
