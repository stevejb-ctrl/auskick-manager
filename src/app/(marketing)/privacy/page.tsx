import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Siren",
  description:
    "How Siren collects, uses, stores, and shares information about coaches, team managers, parents, and the players they manage.",
  alternates: { canonical: "/privacy" },
};

// Last updated shown at the top of the policy. Bump this whenever the
// substance of the policy changes (not for typo fixes).
const LAST_UPDATED = "19 October 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tightest text-ink sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-ink-mute">Last updated: {LAST_UPDATED}</p>

      <div className="prose-siren mt-8 space-y-8 text-ink-dim">
        <section>
          <p className="text-base leading-relaxed">
            Siren (&ldquo;Siren&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
            team and game management app for junior football and netball. This
            policy explains what information we collect when you use the app —
            at sirenfooty.com.au or sirennetball.com.au — how we use it, and the
            choices you have. We follow the Australian Privacy Principles set
            out in the <em>Privacy Act 1988</em> (Cth).
          </p>
        </section>

        <Section title="1. Who we are">
          <p>
            Siren is an independent product operated from Australia. If you have
            any questions about this policy or your data, contact us at{" "}
            <a
              href="mailto:privacy@sirenfooty.com.au"
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              privacy@sirenfooty.com.au
            </a>
            .
          </p>
        </Section>

        <Section title="2. What we collect">
          <p>We collect only what we need to run the app:</p>
          <ul>
            <li>
              <strong>Account information</strong>: your email address and
              display name. If you sign in with Google, we also receive the
              Google profile fields you approve (name, email, profile photo URL)
              but no access to Gmail, Drive, Contacts, or Calendar.
            </li>
            <li>
              <strong>Team and game data you create</strong>: team names, season
              settings, player names and jersey numbers you add to the squad,
              game fixtures, availability marks, rotations, scores, and game
              events.
            </li>
            <li>
              <strong>Device and usage data</strong>: basic request logs
              (timestamps, IP address, user-agent) retained by our hosting
              providers for security and debugging. On our public website pages
              (the home page, help and sign-in) we also use Google Analytics 4 to
              measure aggregate traffic (pageviews, referrers, approximate
              country). Google Analytics truncates IP addresses by default and
              we don&rsquo;t use advertising features or cross-site tracking.
            </li>
            <li>
              <strong>Usage analytics in the app</strong>: which screens are opened
              and which buttons are tapped, the type of device, and whether you use
              the website, the home-screen app or the iOS app. We measure this with
              PostHog to see which parts of Siren work and where coaches get stuck.
              On-screen text is masked on your device before anything is sent, so
              player names, scores and notes are never included, and links that
              carry access codes (runner and invite links) are stripped first. When
              you&rsquo;re signed in, these events are linked to your account by an
              internal ID, never your name or email. You can switch this off at any
              time: My account &rarr; Preferences &rarr; Share usage data.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> collect payment information, location
            data, contacts, photos, or anything else you don&rsquo;t type into
            the app yourself.
          </p>
        </Section>

        <Section title="3. Information about children">
          <p>
            Siren is used by coaches and team managers to manage junior teams,
            so a squad typically includes the names and jersey numbers of
            children. We treat this data with care:
          </p>
          <ul>
            <li>
              Only authorised team members (admins, game managers) can view
              their team&rsquo;s squad. Row-level security enforces this at the
              database layer.
            </li>
            <li>
              We never show player names publicly, sell player data, or use it
              for any purpose other than running the app for that team.
            </li>
            <li>
              Player names never leave the app in usage analytics: on-screen
              text is masked on your device before any usage data is sent.
            </li>
            <li>
              Siren accounts are for adults. Children do not sign up themselves;
              their coach or team manager enters their name and jersey number as
              part of the squad.
            </li>
          </ul>
          <p>
            If you are a parent and would like a player&rsquo;s details removed
            from a team you don&rsquo;t have access to, contact us at the email
            above and we will work with the team admin to remove them.
          </p>
        </Section>

        <Section title="4. How we use your information">
          <p>We use the data you provide to:</p>
          <ul>
            <li>
              Run the app: authenticate you, store your team data, show you
              games and rotations.
            </li>
            <li>
              Keep the service reliable: debug errors, investigate abuse,
              prevent fraud.
            </li>
            <li>
              Improve the app: see which features are used and where coaches
              get stuck, through usage analytics you can switch off.
            </li>
            <li>
              Contact you about your account when necessary, e.g. security
              alerts or material changes to this policy.
            </li>
          </ul>
          <p>We do not sell your data, rent it, or use it for advertising.</p>
        </Section>

        <Section title="5. Who we share data with">
          <p>
            We use a small number of third-party processors to run the app. Each
            of them only sees the data required to do their job:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong>: authentication, database, and file
              storage (region: Sydney). Supabase processes data on our behalf
              under its own privacy policy.
            </li>
            <li>
              <strong>Vercel</strong>: web hosting and content delivery. Vercel
              may log request metadata (IP, user-agent) for security and
              performance.
            </li>
            <li>
              <strong>Google (sign-in)</strong>: only when you choose to sign in
              with Google. Google authenticates you and returns your profile
              info to Siren. Siren does not read anything else from your Google
              account.
            </li>
            <li>
              <strong>Google Analytics 4</strong>: aggregate analytics for our
              public website pages only (pageviews, referrers, approximate
              country). IP addresses are truncated by Google before storage. We
              don&rsquo;t enable advertising features or Google Signals.
            </li>
            <li>
              <strong>PostHog</strong>: usage analytics for the app, stored in
              PostHog&rsquo;s US cloud. PostHog receives the masked usage events
              described in section 2, never player names, scores or notes, and
              processes them on our behalf under its own privacy policy.
            </li>
          </ul>
          <p>
            We do not share your data with advertisers, data brokers, or any
            other third party. If we are ever legally required to disclose data
            (e.g. a valid court order), we will only disclose what is strictly
            required and, where lawful, notify you first.
          </p>
        </Section>

        <Section title="6. Where your data is stored">
          <p>
            Your data is stored in Supabase&rsquo;s Sydney region (Australia).
            When you sign in with Google, your authentication request is handled
            by Google&rsquo;s global infrastructure, which may process data
            outside Australia. Usage analytics (section 2) are stored by PostHog
            in the United States.
          </p>
        </Section>

        <Section title="7. How long we keep data">
          <ul>
            <li>
              <strong>Account data</strong>: kept for as long as your account is
              active. If you delete your account, we delete your profile and any
              teams where you are the only admin.
            </li>
            <li>
              <strong>Team and game data</strong>: kept while the team exists.
              When a team is deleted, its squad, games, rotations, and events
              are deleted with it.
            </li>
            <li>
              <strong>Server logs</strong>: retained for up to 30 days by our
              hosting providers, then discarded.
            </li>
            <li>
              <strong>Usage analytics</strong>: kept by PostHog for the retention
              period of our plan (currently up to seven years), then deleted.
            </li>
          </ul>
        </Section>

        <Section title="8. Your rights">
          <p>Under Australian privacy law you have the right to:</p>
          <ul>
            <li>
              Ask for a copy of the personal information we hold about you.
            </li>
            <li>
              Ask us to correct information that is inaccurate or out of date.
            </li>
            <li>Ask us to delete your account and associated data.</li>
            <li>
              Switch off usage analytics on any device, at any time: My account
              &rarr; Preferences &rarr; Share usage data.
            </li>
            <li>
              Make a complaint to the{" "}
              <a
                href="https://www.oaic.gov.au"
                className="text-brand-700 underline-offset-2 hover:underline"
              >
                Office of the Australian Information Commissioner (OAIC)
              </a>{" "}
              if you believe we&rsquo;ve mishandled your information.
            </li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a
              href="mailto:privacy@sirenfooty.com.au"
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              privacy@sirenfooty.com.au
            </a>
            . We will respond within 30 days.
          </p>
        </Section>

        <Section title="9. Cookies and local storage">
          <p>
            Siren uses cookies and browser local storage for authentication and
            to remember your preferences (for example, which team you last
            viewed). PostHog stores an identifier in a first-party cookie and in
            local storage (named
            <code className="mx-1 rounded bg-surface-alt px-1 font-mono text-[13px]">
              ph_*_posthog
            </code>
            ) to tell visits from the same device apart; switching off Share
            usage data stops it collecting. On our public website pages, Google
            Analytics sets its own cookies (typically
            <code className="mx-1 rounded bg-surface-alt px-1 font-mono text-[13px]">
              _ga
            </code>
            and
            <code className="mx-1 rounded bg-surface-alt px-1 font-mono text-[13px]">
              _ga_*
            </code>
            ) to count visits and sessions in aggregate. We do not use
            advertising pixels or cross-site trackers, and we do not share data
            with advertising networks.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            We use industry-standard practices to protect your data: HTTPS for
            every request, row-level security in the database, hashed passwords
            via Supabase Auth, and the principle of least privilege on service
            credentials. No system is perfectly secure, but we take reasonable
            steps to keep your data safe and will notify you promptly if a
            breach is likely to cause serious harm, as required by the
            Notifiable Data Breaches scheme.
          </p>
        </Section>

        <Section title="11. Changes to this policy">
          <p>
            If we change this policy in a way that affects how we handle your
            data, we&rsquo;ll update the &ldquo;Last updated&rdquo; date at the
            top and, for significant changes, notify you by email or through the
            app.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Questions, requests, or complaints:{" "}
            <a
              href="mailto:privacy@sirenfooty.com.au"
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              privacy@sirenfooty.com.au
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed [&_a]:text-brand-700 [&_a:hover]:underline [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
