import { B, HelpLink, P, UL, OL } from "@/components/help/prose";

// Sections more than one sport hub shares, fed by each sport's words.
// Where the mechanics are the same (the live screen, rolling subs, the
// break, full time), the words differ: the sport's period, surface,
// line codes and its cue for a change. Keep the sport-specific facts in
// the props, read from the sport's code, not in here.

/** A sport's words, as the live screen says them. */
export interface SportTerms {
  /** "quarter" / "half" / "period" (for most of the sport's ages). */
  period: string;
  /** "Q" or "H": the clock's tag (Q1, H1). */
  tag: string;
  /** "field" / "court". */
  surface: string;
  /** What starts play: "the siren goes", "the whistle goes", "the umpire calls play", "the ball goes up". */
  startCue: string;
  /** What ends play: "the siren", "the whistle", "the buzzer". */
  endCue: string;
  /** A line code as it shows after "On next →": "FWD", "DEF". */
  lineCode: string;
}

/** The live screen's parts, top to bottom, in the sport's words. */
export function LiveScreenBasics({
  terms,
  field,
  bar,
  extra,
  start,
  startNow,
}: {
  terms: SportTerms;
  /** The start buttons, where they differ by age: <B>Start Q1</B> (<B>Start H1</B> from Under 10). */
  start?: React.ReactNode;
  startNow?: React.ReactNode;
  /** How the sport's field or court is drawn. */
  field: React.ReactNode;
  /** What's on the bar at the bottom besides scoring. */
  bar?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <P>
        Open the game and tap <B>Start game day</B>, check the lineup, then tap <B>Ready</B>. Tap{" "}
        {start ?? <B>Start {terms.tag}1</B>} on the bar, then {startNow ?? <B>Start {terms.tag}1 now</B>} when{" "}
        {terms.startCue}: the clock starts then. From the top of the screen down:
      </P>
      <UL>
        <li>
          <B>The score and clock.</B> Your team on the left, the clock in the middle, the other team on the
          right. Tap the clock to pause it or end the {terms.period} early; tap the score to fix it.
        </li>
        <li>
          <B>The info line</B> under the score: the next sub, a rule to keep, or what to do now.
        </li>
        <li>
          <B>The {terms.surface}.</B> {field}
        </li>
        <li>
          <B>The bench</B>, under the {terms.surface}, with <B>+ Late</B> at its foot for a kid who turns up
          late.
        </li>
        <li>
          <B>The bar</B> at the bottom: the score buttons{bar ? <>, {bar}</> : null}. Tap a kid and it becomes
          their bar.
        </li>
      </UL>
      {extra}
    </>
  );
}

/** Rolling subs on Siren's timer: the next sub, sub due, the pairs, a swap by hand. */
export function RollingSubs({
  terms,
  dueHint,
  interval = "1 to 10 minutes, in Game settings on the lineup screen or under ⋯ during the game",
  extra,
}: {
  terms: SportTerms;
  /** What the info line adds when a sub is due ("send them to the table now"). */
  dueHint?: React.ReactNode;
  interval?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <P>
        Siren plans the next sub all the time. The info line counts down to it and says how many swaps (
        <B>Next sub 2:10 · 3 swaps</B>), and the kids in it say <B>Off next</B> or{" "}
        <B>On next → {terms.lineCode}</B>, with the same number on both kids of a pair.
      </P>
      <P>
        When the countdown reaches zero the clock turns orange and reads <B>Sub due</B>, the kids say{" "}
        <B>Off now</B> and <B>On now</B>
        {dueHint ? <>, and the info line says {dueHint}</> : null}. The bar shows <B>Make all N swaps</B> (
        <B>Make this swap</B> for one) and <B>Pairs</B>. Nothing blocks the screen: you can still score.
      </P>
      <UL>
        <li>
          <B>Make all N swaps</B> does every pair at once, with Undo for a few seconds after. The sub clock
          starts again.
        </li>
        <li>
          <B>Pairs</B> (or a tap on the info line) shows each pair first. Tap a name to pick someone else, or{" "}
          <B>Make</B> just one: the rest of the plan waits, and the sub clock holds until you make them.
        </li>
        <li>
          A swap by hand, any time: tap a kid on the {terms.surface}, then one on the bench. A note says who
          went off and who came on, with <B>Undo</B>.
        </li>
      </UL>
      <P>
        The sub interval is {interval}. Game settings says it the same way in every sport: <B>Sub every 4 min</B> (or{" "}
        <B>Sub every 4 min 30 s</B>).
      </P>
      {extra}
    </>
  );
}

/** One row of a sport's score buttons. */
export interface ScoreRow {
  what: string;
  points: string;
  ours: string;
  theirs: string;
  when?: string;
}

/** The score buttons, for us and for them, and what each is worth. */
export function ScoreButtons({ rows }: { rows: ScoreRow[] }) {
  const when = rows.some((r) => r.when);
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-alt text-xs text-ink-mute">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Score</th>
            <th scope="col" className="px-3 py-2 font-semibold">Points</th>
            <th scope="col" className="px-3 py-2 font-semibold">Your button</th>
            <th scope="col" className="px-3 py-2 font-semibold">Theirs</th>
            {when && <th scope="col" className="px-3 py-2 font-semibold">From</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline text-ink-dim">
          {rows.map((r) => (
            <tr key={r.what}>
              <th scope="row" className="px-3 py-2 font-medium text-ink">{r.what}</th>
              <td className="px-3 py-2">{r.points}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.ours}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.theirs}</td>
              {when && <td className="px-3 py-2">{r.when ?? "Every age"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Recording a score, the same in every sport: who scored, Undo, Scores and fixes. */
export function ScoringBasics({
  button,
  scorers,
  unknown = "Not sure who",
}: {
  button: React.ReactNode;
  scorers?: React.ReactNode;
  /** The scorer sheet's no-name choice, or null when it has none. */
  unknown?: string | null;
}) {
  return (
    <OL>
      <li>
        Tap {button} on the bar and pick who scored on <B>Who scored?</B>, or tap a kid first and score from
        their bar. {scorers}
      </li>
      {unknown && (
        <li>
          Didn&apos;t see who? Pick <B>{unknown}</B>: the score counts without a name.
        </li>
      )}
      <li>The other team&apos;s small buttons add their score straight away.</li>
      <li>
        A mistake? Tap <B>Undo</B> on the line under the score, or tap the score for <B>Scores and fixes</B>{" "}
        to take one off, change who scored or add one you missed.
      </li>
    </OL>
  );
}

/** A tapped kid's More: the shared player actions, plus the sport's own. */
export function KidActions({ items }: { items: { label: string; what: React.ReactNode }[] }) {
  return (
    <>
      <P>
        Tap a kid and their bar shows their minutes and share of the game, the score buttons, <B>Injured</B>{" "}
        and <B>More</B>. More opens <B>Player actions</B>:
      </P>
      <UL>
        {items.map((i) => (
          <li key={i.label}>
            <B>{i.label}</B>: {i.what}
          </li>
        ))}
      </UL>
    </>
  );
}

/** The break screen, as every sport has it, with the sport's Rotate. */
export function BreakBasics({
  terms,
  title,
  rotate,
  extra,
}: {
  terms: SportTerms;
  /** The break screen's title: "Q3 lineup", "2nd half lineup". */
  title: string;
  /** What Rotate does in this sport. */
  rotate: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <P>
        When the {terms.period} ends, the break screen (<B>{title}</B>) shows the score and the next{" "}
        {terms.period}&apos;s lineup on the {terms.surface}, with the bench under it. Pick how it&apos;s built:
      </P>
      <UL>
        <li>
          <B>Suggested</B> (the default): Siren&apos;s fairest lineup for the next {terms.period}.
        </li>
        <li>
          <B>Rotate</B>: {rotate}
        </li>
        <li>
          <B>Repeat</B>: the same lineup as last {terms.period}. <B>Manual</B>: start empty and place every kid.
        </li>
      </UL>
      <P>
        Tap two kids to swap them, across positions or to and from the bench. Each kid says where they were (
        <B>From bench</B>, <B>Stays</B>) and their time so far; time turns orange when a kid is well under the
        team average. The button beside the score (<B>All available</B> when nobody&apos;s out) marks an injury,
        lends a kid, adds a late arrival or marks one out. See{" "}
        <HelpLink href="/help/breaks">Breaks</HelpLink>.
      </P>
      {extra}
    </>
  );
}

/** Full time: the review, then Finish game. */
export function FullTimeBasics({ check }: { check: React.ReactNode }) {
  return (
    <P>
      When the last period ends, the full-time review opens: the score, who scored and everyone&apos;s minutes.{" "}
      {check} Then tap <B>Finish game</B>. The game locks, and the summary is ready to share with parents; the
      minutes go into the season&apos;s <HelpLink href="/help/stats">Stats</HelpLink>.
    </P>
  );
}

/** A sport's How we play strategies, as the Team tab names them. */
export function Strategies({ items }: { items: { label: string; what: React.ReactNode; fit?: string }[] }) {
  return (
    <>
      <P>
        Choose how kids rotate on the <B>Team</B> tab, under <B>How we play</B> (a ★ marks the one suggested for
        your age group):
      </P>
      <UL>
        {items.map((i) => (
          <li key={i.label}>
            <B>{i.label}</B>
            {i.fit ? <> ({i.fit})</> : null}: {i.what}
          </li>
        ))}
      </UL>
    </>
  );
}

/** The junior laws a sport's How we play shows as locked. */
export function LockedLaws({ laws }: { laws: { text: string; source: string }[] }) {
  return (
    <>
      <P>How we play lists the rules Siren keeps for your age group. They&apos;re set by the rules, not by you:</P>
      <UL>
        {laws.map((l) => (
          <li key={l.text}>
            {l.text} <span className="text-ink-mute">({l.source})</span>
          </li>
        ))}
      </UL>
    </>
  );
}
