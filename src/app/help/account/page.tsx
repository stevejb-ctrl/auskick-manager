// No screenshots on this page.

import { HelpPage, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, P, Related, UL } from "@/components/help/prose";

export const metadata = {
  title: "Your Account · Help · Siren",
  description:
    "Your Siren account: your name and email, your teams and leaving one, light or dark theme, animations, usage data, and deleting your account with 30 days to change your mind.",
  alternates: { canonical: "/help/account" },
};

export default function AccountHelpPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Your account</h1>
      <P lead>
        Open <B>My account</B> from the avatar menu at the top right. It&apos;s yours across every team and sport.
      </P>

      <HelpSection id="details" title="Name and email">
        <P>
          Your <B>Email</B> is how you sign in, and can&apos;t be changed here. Your <B>Name</B> is what other coaches
          and managers see on the Team tab: change it any time.
        </P>
      </HelpSection>

      <HelpSection id="teams" title="Your teams">
        <P>
          <B>Your teams</B> lists every team you&apos;re on, with your role (Coach, Manager or Parent), and a{" "}
          <B>Leave</B> button. Parents leave a team from here, since they have no Team tab. A team&apos;s only coach
          can&apos;t leave: make someone else a coach first, or delete the team. See{" "}
          <HelpLink href="/help/teams">Teams</HelpLink>.
        </P>
      </HelpSection>

      <HelpSection id="preferences" title="Theme, animations and usage data">
        <UL>
          <li>
            <B>Theme</B>: <B>System</B> follows your phone&apos;s light or dark setting; <B>Light</B> is for bright sun,{" "}
            <B>Dark</B> for night games. It&apos;s kept on this device.
          </li>
          <li>
            <B>Reduce animations</B>: Use system setting, Always reduce, or Always play.
          </li>
          <li>
            <B>Share usage data</B>: helps the Siren team see what gets used. Turn it off any time.
          </li>
        </UL>
        <P>
          There&apos;s no text-size setting: Siren follows your phone&apos;s, and the live screen keeps to what
          matters with large text on.
        </P>
      </HelpSection>

      <HelpSection id="delete" title="Deleting your account">
        <P>
          <B>Delete my account…</B> lists the teams that would go with it (the ones where you&apos;re the only coach)
          and the ones you&apos;d be removed from. Type <B>delete</B> to confirm, then <B>Schedule deletion</B>.
        </P>
        <P>
          You have 30 days to change your mind: keep using Siren, and tap <B>Restore account</B> to cancel. After that,
          your account and personal data are deleted for good.
        </P>
        <HelpCallout type="warning">
          Want to keep a team going? Make another member a coach before you delete your account.
        </HelpCallout>
      </HelpSection>

      <Related
        links={[
          { href: "/help/teams", label: "Teams" },
          { href: "/help/troubleshooting", label: "Troubleshooting" },
          { href: "/help/faq", label: "FAQ" },
        ]}
      />
    </HelpPage>
  );
}
