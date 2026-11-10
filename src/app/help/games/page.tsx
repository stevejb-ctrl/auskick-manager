// Screenshots referenced on this page:
//   /help-screenshots/games-list.png
//   /help-screenshots/games-create.png
//   /help-screenshots/games-detail.png

import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, OL, P, Related, UL } from "@/components/help/prose";

export const metadata = {
  title: "Games · Help · Siren",
  description:
    "Creating games or importing them from PlayHQ, asking parents who's in, the game-day link for a parent to run the game, game status, fixing scores, editing, restarting and deleting a game.",
  alternates: { canonical: "/help/games" },
};

export default function GamesPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Games</h1>
      <P lead>
        Each team&apos;s Games tab holds its fixture: upcoming games, the one being played, and past results. It works
        the same in every sport.
      </P>
      <HelpFigure
        src="/help-screenshots/games-list.png"
        alt="The games list showing upcoming and completed games with round numbers and opponent names"
        caption="The Games tab lists every scheduled and finished game."
      />

      <HelpSection id="create" title="Adding games">
        <OL>
          <li>
            Open your team&apos;s <B>Games</B> tab (coaches only).
          </li>
          <li>
            Tap <B>Create manually</B>, or <B>Import from PlayHQ</B> where your sport&apos;s fixtures are on PlayHQ (AFL,
            netball and basketball): paste your <B>PlayHQ team URL</B>, tap <B>Preview fixtures</B>, then import. Imported
            games keep in step with the league&apos;s fixture.
          </li>
          <li>
            Fill in the <B>Opponent</B>, <B>Date &amp; time</B>, <B>Round</B>, and if you like the <B>Location</B> and{" "}
            <B>Notes</B> for parents. Tap <B>Create game</B>.
          </li>
        </OL>
        <HelpFigure
          src="/help-screenshots/games-create.png"
          alt="The Create a game form with opponent, date and time, round and location filled in"
          caption="Fill in the game's details and tap Create game."
        />
      </HelpSection>

      <HelpSection id="status" title="Game status">
        <UL>
          <li>
            <B>Upcoming</B>: tap <B>Plan lineup</B> any time, or <B>Start game day</B> on the day.
          </li>
          <li>
            <B>Live</B>: being played. <B>Back to live game</B> returns to it; parents see <B>Watch live</B>.
          </li>
          <li>
            <B>Final</B> (or the score, if you keep one): tap <B>Summary</B> for the result and a message to share with
            parents.
          </li>
          <li>
            A past game that was never run goes under <B>Not played</B>: delete it, or <B>Mark played</B> with its
            final score.
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="whos-in" title="Asking parents who's in">
        <P>
          On an upcoming game, tap <B>Ask parents who&apos;s in</B> and post the message (or the link) in your group
          chat. Parents open it, find their child and tap <B>In</B> or <B>Out</B>, with no account, and you see the
          answer straight away. You can also mark everyone yourself under <B>Availability</B>. See{" "}
          <HelpLink href="/help/squads">Squads</HelpLink>.
        </P>
      </HelpSection>

      <HelpSection id="game-day-link" title="The game-day link">
        <P>
          Coaching and running the clock at once is a lot. The <B>Game-day link</B> (the game&apos;s <B>More</B>, or ⋯ in
          the live game) lets another parent run the whole game from their phone, with no account: the lineup, clock,
          subs and scores. Share it privately: anyone with it can run the game.
        </P>
        <UL>
          <li>
            Both phones can run the game at once; each sees the other&apos;s taps within a few seconds.
          </li>
          <li>The link can&apos;t restart the game, hand out the link, or change team settings.</li>
          <li>
            Sent it to the wrong person? A coach taps <B>Get a new link</B>: the old one stops working straight away.
          </li>
        </UL>
        <HelpCallout type="tip">
          A parent who helps every week can be a <B>Manager</B> instead: they run games from their own account. See{" "}
          <HelpLink href="/help/teams">Teams</HelpLink>.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="detail" title="The game page">
        <P>
          Tap a game to open it. There&apos;s one main button for its state (Plan lineup, Start game day, Back to live
          game or Summary), the score and scorers once it&apos;s played, and <B>More</B>:
        </P>
        <UL>
          <li>
            <B>Fix scores</B>: take a score off, change who scored, or add a missed one.
          </li>
          <li>
            <B>Game-day link</B>, above.
          </li>
          <li>
            <B>Edit details</B>: opponent, time, round, location and notes (coaches).
          </li>
          <li>
            <B>Restart game</B>: wipes every period, swap and score, after two confirms (coaches).
          </li>
          <li>
            <B>Delete game</B>: removes it and its availability for everyone (coaches).
          </li>
        </UL>
        <HelpFigure
          src="/help-screenshots/games-detail.png"
          alt="The game detail page showing score, round, opponent, date, and action buttons"
          caption="The game page: one main button for each game state."
        />
        <HelpCallout type="warning">
          Deleting or restarting a game can&apos;t be undone. Season stats and balance are worked out again without it.
        </HelpCallout>
      </HelpSection>

      <Related
        links={[
          { href: "/help/live-game", label: "The live screen" },
          { href: "/help/squads", label: "Squads" },
          { href: "/help/track-scoring", label: "Keeping score" },
        ]}
      />
    </HelpPage>
  );
}
