import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "Terms of Service — Siren Footy",
  description:
    "The terms that govern your use of Siren Footy, the junior Australian rules football team and game manager.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "22 April 2026";

export default function TermsPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-ink-mute">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-ink-dim">
          <section>
            <p className="text-base leading-relaxed">
              These terms are a contract between you and Siren Footy
              (&ldquo;Siren&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By
              creating an account or otherwise using the app at{" "}
              <a
                href="https://sirenfooty.com.au"
                className="text-brand-700 underline-offset-2 hover:underline"
              >
                sirenfooty.com.au
              </a>
              , you agree to these terms. If you don&rsquo;t agree, please
              don&rsquo;t use the app.
            </p>
          </section>

          <Section title="1. What Siren is">
            <p>
              Siren is a web app that helps coaches and team managers run junior
              Australian rules football teams &mdash; rotating players fairly,
              tracking availability, managing game-day subs, and keeping a
              simple record of each season. It is a tool for adults managing
              junior teams; it is not for use by children directly.
            </p>
          </Section>

          <Section title="2. Your account">
            <p>
              You need an account to use most of the app. When you sign up, you
              agree to provide accurate information and keep your credentials
              secure. You are responsible for anything that happens under your
              account, including changes made by anyone you give access to (for
              example, co-admins you invite to a team).
            </p>
            <p>
              You must be at least 18 years old, or the legal age of majority in
              your jurisdiction, to create an account.
            </p>
          </Section>

          <Section title="3. Acceptable use">
            <p>When using Siren, you agree not to:</p>
            <ul>
              <li>Use the app for anything unlawful or harmful to others.</li>
              <li>
                Enter personal data about people (including children) without
                the authority to do so &mdash; for example, only add a player to
                a squad if you are the team coach, manager, or have equivalent
                consent from the club.
              </li>
              <li>
                Attempt to bypass authentication, scrape the app, probe it for
                vulnerabilities, or interfere with its operation.
              </li>
              <li>
                Upload content that is abusive, defamatory, or infringes
                anyone&rsquo;s rights (including team songs you don&rsquo;t have
                the right to upload).
              </li>
              <li>Impersonate another person or misrepresent your affiliation with a team or club.</li>
            </ul>
            <p>
              We may suspend or terminate accounts that breach these rules, with
              or without notice depending on the severity.
            </p>
          </Section>

          <Section title="4. Content you add">
            <p>
              You keep ownership of the content you add to Siren (team names,
              player names, game notes, team songs, etc.). By adding content,
              you grant us a limited licence to host, store, process, and
              display that content solely to run the app for you and your
              team.
            </p>
            <p>
              You are responsible for having the right to add the content you
              upload. In particular, if you upload a team song audio file, you
              confirm you have the right to use it for this purpose.
            </p>
          </Section>

          <Section title="5. Team roles and access">
            <p>
              Teams in Siren have admins, game managers, and parents. Admins can
              invite others, change roles, and remove members. If you invite
              someone to a team, they will see the team&rsquo;s squad, games,
              and related data according to the role you give them. Choose
              roles with care.
            </p>
            <p>
              If you are the only admin of a team and you want to leave, first
              promote another member to admin. Siren prevents a team from being
              left with zero admins.
            </p>
          </Section>

          <Section title="6. Service availability">
            <p>
              We aim to keep Siren online and responsive, but we don&rsquo;t
              guarantee uninterrupted service. The app may be unavailable for
              maintenance, upgrades, or reasons outside our control. We may
              change, add, or remove features over time; we&rsquo;ll try to give
              notice for material changes that affect how you use the app.
            </p>
          </Section>

          <Section title="7. Price">
            <p>
              Siren is free to use during the current early-access period. If we
              introduce paid plans in the future, we will give you clear notice
              before any charges apply and you will always be able to continue
              at your current tier, downgrade, or cancel.
            </p>
          </Section>

          <Section title="8. Privacy">
            <p>
              How we handle your data is described in our{" "}
              <Link
                href="/privacy"
                className="text-brand-700 underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              . By using Siren, you agree to the practices described there.
            </p>
          </Section>

          <Section title="9. Termination">
            <p>
              You can stop using Siren at any time and delete your account from
              settings. We can suspend or terminate your account if you breach
              these terms, if required by law, or if we discontinue the app. If
              we discontinue the app, we&rsquo;ll try to give reasonable notice
              and a way to export your team data.
            </p>
          </Section>

          <Section title="10. Disclaimers">
            <p>
              Siren is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo;. To the maximum extent permitted by law, we
              disclaim all warranties, express or implied, including fitness for
              a particular purpose and non-infringement. We do not warrant that
              the app will be error-free, secure, or always available.
            </p>
            <p>
              Nothing in these terms excludes or limits any consumer guarantees
              under the <em>Australian Consumer Law</em> that cannot be excluded
              or limited.
            </p>
          </Section>

          <Section title="11. Limitation of liability">
            <p>
              To the maximum extent permitted by law, Siren is not liable for
              any indirect, incidental, special, consequential, or punitive
              damages, or any loss of profits, revenue, data, or goodwill,
              arising out of your use of the app. Our total liability to you
              for any claim arising out of or relating to these terms or the
              app is limited to AUD $100.
            </p>
          </Section>

          <Section title="12. Changes to these terms">
            <p>
              We may update these terms from time to time. If we make material
              changes, we&rsquo;ll update the &ldquo;Last updated&rdquo; date
              and, where appropriate, notify you by email or through the app.
              Continuing to use Siren after changes take effect means you
              accept the updated terms.
            </p>
          </Section>

          <Section title="13. Governing law">
            <p>
              These terms are governed by the laws of Victoria, Australia. Any
              dispute that can&rsquo;t be resolved informally must be dealt with
              in the courts of Victoria, and you and Siren each submit to their
              jurisdiction.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              Questions about these terms? Email{" "}
              <a
                href="mailto:hello@sirenfooty.com.au"
                className="text-brand-700 underline-offset-2 hover:underline"
              >
                hello@sirenfooty.com.au
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed [&_a]:text-brand-700 [&_a:hover]:underline [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_strong]:text-ink [&_em]:italic">
        {children}
      </div>
    </section>
  );
}
