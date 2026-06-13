// Inline reimplementation of zoneCapsFor + a stripped-down suggester
// just to verify the math for U10 (zones3) at sizes 6..12.

function zoneCapsFor(onFieldSize, model = "zones3") {
  const zones = model === "positions5"
    ? ["back", "hback", "mid", "hfwd", "fwd"]
    : ["back", "mid", "fwd"];
  const hardMax = model === "positions5" ? 18 : 15;
  const size = Math.max(0, Math.min(hardMax, Math.floor(onFieldSize)));
  const base = Math.floor(size / zones.length);
  const rem = size % zones.length;
  const caps = { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
  for (const z of zones) caps[z] = base;
  const priority = model === "positions5"
    ? ["mid", "hback", "hfwd", "back", "fwd"]
    : ["mid", "back", "fwd"];
  for (let i = 0; i < rem; i++) caps[priority[i]]++;
  return caps;
}

// Tiny stand-in for suggestStartingLineup: fill zones up to caps, rest to bench.
function fillLineup(playerIds, caps) {
  const lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  const zones = ["back", "hback", "mid", "hfwd", "fwd"];
  let i = 0;
  for (const z of zones) {
    while (lineup[z].length < caps[z] && i < playerIds.length) {
      lineup[z].push(playerIds[i]);
      i++;
    }
  }
  while (i < playerIds.length) {
    lineup.bench.push(playerIds[i]);
    i++;
  }
  return lineup;
}

const players = Array.from({ length: 14 }, (_, i) => `p${i}`);

console.log("U10 (zones3, 14 available players):");
for (let size = 6; size <= 12; size++) {
  const caps = zoneCapsFor(size, "zones3");
  const lineup = fillLineup(players, caps);
  const onField = lineup.back.length + lineup.mid.length + lineup.fwd.length;
  const ok = onField === size ? "OK" : "FAIL";
  console.log(
    `  size=${size}  caps={back:${caps.back}, mid:${caps.mid}, fwd:${caps.fwd}}  result on_field=${onField} (${lineup.back.length}/${lineup.mid.length}/${lineup.fwd.length}) bench=${lineup.bench.length}  ${ok}`
  );
}
