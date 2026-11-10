// Screenshots referenced on this page:
//   /help-screenshots/live-game-scoring.png
//   /help-screenshots/track-scoring-toggle.png
//   /help-screenshots/track-scoring-player-tile.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, OL, P, Related, UL } from "@/components/help/prose";
import { SPORT_HELP } from "@/lib/help/sports";
import { getSportConfig } from "@/lib/sports";

export const metadata = {
  title: "Keeping Score · Help · Siren",
  description:
    "Keeping score in Siren, in every sport: the team's scoring switch, recording and fixing scores, what each sport's scores are worth, and what scoring adds to Stats.",
  alternates: { canonical: "/help/track-scoring" },
};

/** Each sport's own scores and what they're worth, from its config. */
function sportScores(sport: Parameters<typeof getSportConfig>[0]): string {
  const seen = new Set<string>();
  return getSportConfig(sport)
    .scoreTypes.filter((t) => !t.opponent)
    .filter((t) => (seen.has(t.label) ? false : (seen.add(t.label), true)))
    .map((t) => `${t.label} ${t.points}`)
    .join(" · ");
}

export default function TrackScoringPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Keeping score</h1>
      <P lead>
        Siren can keep the score and who scored. It&apos;s optional: rotations and fair time work just the same
        without it. The youngest age groups in most sports keep no score, so Siren starts with it off for them and on
        for the rest.
      </P>

      <HelpSection id="each-sport" title="Each sport's scores">
        <P>The live screen shows your sport&apos;s own buttons. Tap a sport for its scoring in full:</P>
        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-card">
          <table className="w-full text-left text-sm" data-testid="help-sport-scores">
            <thead className="bg-surface-alt text-xs text-ink-mute">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Sport</th>
                <th scope="col" className="px-3 py-2 font-semibold">Scores (points)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-ink-dim">
              {SPORT_HELP.map((h) => (
                <tr key={h.href}>
                  <th scope="row" className="px-3 py-2 font-medium">
                    <Link href={`${h.href}#scoring`} className="text-brand-700 underline hover:text-brand-600">
                      {h.title}
                    </Link>
                  </th>
                  <td className="px-3 py-2">{sportScores(h.sport.sport)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>Some scores come in with age: conversions, penalty and field goals in rugby, threes in basketball.</P>
      </HelpSection>

      <HelpSection id="turn-on" title="Turning it on or off">
        <OL>
          <li>
            Open your team&apos;s <B>Team</B> tab.
          </li>
          <li>
            Under <B>Game-day extras</B>, flip the scoring switch. It reads <B>Track goals &amp; behinds</B> (AFL),{" "}
            <B>Track goals</B> (netball, football, futsal, hockey), <B>Track points</B> (rugby league, rugby union,
            basketball) or <B>Track tries</B> (touch, Oztag).
          </li>
          <li>It saves straight away and applies to every game from then on. Coaches can change it any time.</li>
        </OL>
        <P>
          During a game with scoring off, a coach can tap ⋯ › <B>Turn scoring on</B>.
        </P>
        <HelpFigure
          src="/help-screenshots/track-scoring-toggle.png"
          alt="The Track goals & behinds switch, on, under Game-day extras on an AFL team's Team tab"
          caption="The scoring switch on the Team tab, for the whole team."
        />
      </HelpSection>

      <HelpSection id="recording" title="Recording a score">
        <UL>
          <li>
            Tap the score button on the bar and pick who scored on <B>Who scored?</B>, or tap a kid first and score from
            their bar. Most sports also have <B>Not sure who</B>.
          </li>
          <li>The other team&apos;s small buttons, on the right, add their score straight away.</li>
          <li>Each kid&apos;s tally shows small after their name.</li>
          <li>
            <B>Undo</B>, on the line under the score, takes back the latest score and names it. Tap the score itself for{" "}
            <B>Scores and fixes</B>: take one off, change who scored, add one you missed.
          </li>
          <li>The full-time review has the same fixes, so the result is right before you tap Finish game.</li>
        </UL>
        <HelpFigure
          src="/help-screenshots/live-game-scoring.png"
          alt="An AFL live game with a kid tapped: their bar at the bottom shows + Goal, + Behind, Injured and More"
          caption="A tapped kid's bar, with their score buttons (AFL shown)."
        />
        <HelpFigure
          src="/help-screenshots/track-scoring-player-tile.png"
          alt="An AFL score of 1.1 (7) and the back line, where Mateo S shows 1.0 and Nora F 0.1 after their names"
          caption="Each kid's tally after their name."
        />
      </HelpSection>

      <HelpSection id="stats" title="What it adds to Stats">
        <P>
          Games with scoring on add scorers and scores to <HelpLink href="/help/stats">Stats</HelpLink>: each kid&apos;s
          goals, tries or points, the season&apos;s totals and, in some sports, head-to-head and quarter-by-quarter
          scoring. Season balance, attendance and minutes are kept either way.
        </P>
        <HelpCallout type="note">
          You can mix scored and unscored games in a season. Score stats count only the games where scoring was on.
        </HelpCallout>
      </HelpSection>

      <Related
        links={[
          { href: "/help/live-game", label: "The live screen" },
          { href: "/help/stats", label: "Stats" },
          { href: "/help", label: "Your sport" },
        ]}
      />
    </HelpPage>
  );
}
