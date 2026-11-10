// Screenshots referenced on this page:
//   /help-screenshots/teams-dashboard.png
//   /help-screenshots/teams-settings.png

import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, OL, P, Related, UL } from "@/components/help/prose";
import { sportsInASentence } from "@/lib/sports/words";

export const metadata = {
  title: "Teams · Help · Siren",
  description:
    "Creating a team, its sport and age group, coaches, managers and parents, invite links and the team code, the Team tab's settings, and leaving or deleting a team.",
  alternates: { canonical: "/help/teams" },
};

export default function TeamsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Teams</h1>
      <P lead>
        A team holds your squad, games and season stats. One account can run several teams, in different sports: an
        Under 10s footy team and an Under 11s netball team sit side by side on the dashboard.
      </P>
      <HelpFigure
        src="/help-screenshots/teams-dashboard.png"
        alt="The dashboard showing multiple team cards with team name and recent game details"
        caption="All your teams appear on the dashboard. Tap a card to open that team."
      />

      <HelpSection id="create" title="Creating a team">
        <OL>
          <li>
            From the dashboard, tap <B>New team</B>.
          </li>
          <li>
            Pick the <B>sport</B> ({sportsInASentence("or")}) and the <B>age group</B>. Together they set the field,
            the periods, the subs and the junior rules Siren keeps. Your sport&apos;s help page lists each age
            group&apos;s format.
          </li>
          <li>
            Name the team (e.g. <em>Brunswick U10s Blue</em>), and say whether you keep score.
          </li>
        </OL>
      </HelpSection>

      <HelpSection id="people" title="Coaches, managers and parents">
        <P>Everyone on a team has one of three roles:</P>
        <UL>
          <li>
            <B>Coach</B>: full control. The squad, games, settings, and inviting others.
          </li>
          <li>
            <B>Manager</B>: runs games on game day, marks availability and shares game-day links. A good fit for the
            parent who helps on the sideline. Managers can&apos;t change the team&apos;s settings or squad.
          </li>
          <li>
            <B>Parent</B>: sees the team, the fixture and scores, watches games live, and marks their child In or Out.
          </li>
        </UL>
        <P>
          The Team tab&apos;s <B>People</B> section lists the <B>Team members</B>. A coach can change anyone&apos;s role
          or <B>Remove</B> them; a team always keeps at least one coach.
        </P>
      </HelpSection>

      <HelpSection id="invite" title="Inviting people">
        <UL>
          <li>
            <B>Invite someone</B> (People › Invites): pick their role (Manager by default), and add their email to
            have Siren send the link, or leave it blank and copy the link yourself. Each link works once, for one
            person, and expires in 14 days. If they already have a Siren account, they&apos;re added straight away.
          </li>
          <li>
            <B>Team code</B>: an 8-character code (like ABCD-EFGH) to read out at the sideline or text. Anyone with a
            Siren account who enters it under <B>Join a team</B> joins as a Parent. <B>Regenerate</B> it if it gets
            around.
          </li>
          <li>
            Pending invites show who they&apos;re for and when they expire, with <B>Resend email</B>,{" "}
            <B>Copy link</B> and <B>Revoke</B>.
          </li>
        </UL>
        <HelpCallout type="tip">
          Parents don&apos;t need an account to say who&apos;s playing or to run a game: send the game&apos;s availability
          link or game-day link instead. See <HelpLink href="/help/games">Games</HelpLink>.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="settings" title="The Team tab">
        <P>The Team tab holds the team&apos;s settings, in this order:</P>
        <UL>
          <li>
            <B>Team name</B>, as the scorebug and lists show it.
          </li>
          <li>
            <B>How we play</B>: how your team rotates. See <HelpLink href="/help/rotations">Rotations</HelpLink>.
          </li>
          <li>
            <B>People</B>: members, the team code and invites.
          </li>
          <li>
            <B>Season</B>: age group, players on the field or court, the quarter or half length, and, for some sports,
            halves or quarters (basketball, hockey), halves or one period (touch, Oztag) and the mixed team rule.
          </li>
          <li>
            <B>Game-day extras</B>: keeping score, and your sport&apos;s extras (fouls in basketball, the girl&apos;s try
            in Oztag, the team song in AFL and netball).
          </li>
          <li>
            <B>Danger zone</B>: leave or delete the team.
          </li>
        </UL>
        <HelpFigure
          src="/help-screenshots/teams-settings.png"
          alt="The team settings page showing name, age group, and a delete team button at the bottom"
          caption="The Team tab: name, How we play, people, season and more."
        />
      </HelpSection>

      <HelpSection id="leave" title="Leaving or deleting a team">
        <P>
          <B>Leave team</B> (Danger zone, or Account › Your teams) removes you; you can come back with an invite or the
          team code. The team&apos;s only coach can&apos;t leave until someone else is a coach.
        </P>
        <P>
          <B>Delete team</B> (coaches only) removes the team, its squad, games and stats for everyone. Type the
          team&apos;s name to confirm.
        </P>
        <HelpCallout type="warning">Deleting a team can&apos;t be undone.</HelpCallout>
      </HelpSection>

      <Related
        links={[
          { href: "/help/squads", label: "Squads" },
          { href: "/help/games", label: "Games" },
          { href: "/help/account", label: "Your account" },
        ]}
      />
    </HelpPage>
  );
}
