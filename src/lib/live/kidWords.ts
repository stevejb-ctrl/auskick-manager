// ─── The words under a kid's name ────────────────────────────
// The live screen says at most one thing under a kid, in plain words:
// what happens to them at the next sub, else time they're owed, else
// when a bench kid gets back on. The countdown itself is said once, in
// the info line ("Next sub 2:10"), so the kids just say "next". Pure.
//
//   field, in the next sub      "Off next"          due: "Off now" (hot)
//   bench, in the next sub      "On next → LFP"     due: "On now → LFP" (hot)
//   at risk of the minimum      "Needs 6′ more" (sun)
//   bench, not in the next sub  "Sub after next"
//   bench, subs at the breaks   "On at the break"
//   bench, no more subs this period  "On after the break"
//   hurt, lent, sitting, out    INJ / HOME / LENT / SIT 1:20 / FOULED OUT,
//                               as their tiles say today
//   anyone else                 nothing

import { formatMinSec } from "@/lib/sports/netball/fairness";

/** calm: plain chalk; hot: hi-vis, act now; sun: under the minimum. */
export type KidWordsTone = "calm" | "hot" | "sun";

export interface KidWords {
  text: string;
  tone: KidWordsTone;
  /** What a screen reader says for it, where `text` is a short badge (INJ → "Injured"). */
  spoken?: string;
}

/** Why a kid is off and out of the rotation. */
export type KidOut =
  | { kind: "injured"; wentHome?: boolean }
  | { kind: "lent" }
  | { kind: "sitOut"; msLeft: number }
  | { kind: "fouledOut" };

/** The kid's part in the next planned sub. `to` is where they go on: the off-going kid's zone short or position ("FWD", "LFP"). */
export type KidSubRole = { role: "off" } | { role: "on"; to?: string | null };

export interface KidWordsInput {
  place: "field" | "bench";
  /** Their part in the next planned sub, or null when they're not in it. */
  sub?: KidSubRole | null;
  /** The planned sub is due now. */
  subDue?: boolean;
  /** Whole minutes still needed when at risk of the minimum (minGameTime's neededMin), else null. */
  needsMin?: number | null;
  /** Subs roll on during a period (AFL, league, soccer…); false where they wait for the breaks (netball). */
  rollingSubs: boolean;
  /** The period's last sub has gone: the next one falls after the break. */
  subsDoneThisPeriod?: boolean;
  /** Out of the rotation: hurt, lent, sitting out, fouled out. */
  out?: KidOut | null;
  /** The period is being played. False before kickoff and at the breaks: only out kids get words. */
  inPlay?: boolean;
  /**
   * The game's last period: there's no break after it, so a bench kid
   * whose turn would come "after the break" says nothing (Stagehand,
   * 9 Nov 2026: "On after the break" late in the last half).
   */
  lastPeriod?: boolean;
}

/** An out kid's badge and what it says, as the live tiles say it today. */
export function outWords(out: KidOut): KidWords {
  switch (out.kind) {
    case "injured":
      return out.wentHome
        ? { text: "HOME", tone: "calm", spoken: "Went home" }
        : { text: "INJ", tone: "calm", spoken: "Injured" };
    case "lent":
      return { text: "LENT", tone: "calm", spoken: "Lent to opposition" };
    case "sitOut": {
      const left = formatMinSec(out.msLeft);
      return { text: `SIT ${left}`, tone: "calm", spoken: `Sitting out, ${left} left` };
    }
    case "fouledOut":
      return { text: "FOULED OUT", tone: "calm", spoken: "Fouled out" };
  }
}

export function kidWords(input: KidWordsInput): KidWords | null {
  if (input.out) return outWords(input.out);
  if (input.inPlay === false) return null;

  const due = !!input.subDue;
  // Pairs show where subs roll, until the period's last sub has gone. A
  // sub that's due still shows.
  const pairs = input.rollingSubs && (due || !input.subsDoneThisPeriod);
  const sub = pairs ? input.sub : null;
  if (sub?.role === "on") {
    const to = sub.to ? ` → ${sub.to}` : "";
    return due ? { text: `On now${to}`, tone: "hot" } : { text: `On next${to}`, tone: "calm" };
  }
  if (sub?.role === "off") return due ? { text: "Off now", tone: "hot" } : { text: "Off next", tone: "calm" };

  if (input.needsMin && input.needsMin > 0) return { text: `Needs ${input.needsMin}′ more`, tone: "sun" };

  if (input.place === "bench") {
    if (!input.rollingSubs) return input.lastPeriod ? null : { text: "On at the break", tone: "calm" };
    if (input.subsDoneThisPeriod && !due) return input.lastPeriod ? null : { text: "On after the break", tone: "calm" };
    return { text: "Sub after next", tone: "calm" };
  }
  return null;
}
