import { HelpPage } from "@/components/help/HelpPage";
import { HelpLink, P } from "@/components/help/prose";
import type { SportHelp } from "@/lib/help/sports";

/**
 * A sport's help hub: its title, a line on what's shared, the section
 * chips (the sidebar lists them too), then the sport's sections.
 */
export function SportHub({
  hub,
  intro,
  children,
}: {
  hub: SportHelp;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <HelpPage>
      <h1 className="flex items-center gap-3 text-2xl font-bold text-ink">
        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: hub.sport.accent }} />
        {hub.title} help
      </h1>
      <P lead>{intro}</P>
      <P>
        This page is just for {hub.name}: its {hub.sport.surface === "field" ? "field" : "court"}, scoring, subs and junior
        rules. Teams, squads, games and stats work the same in every sport, and they&apos;re in the{" "}
        <HelpLink href="/help">help topics</HelpLink>.
      </P>
      <nav aria-label={`${hub.title} help sections`} className="mt-5">
        <ul className="flex flex-wrap gap-2">
          {hub.sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-[36px] items-center rounded-full border border-hairline bg-surface px-3 text-xs font-medium text-ink-dim hover:bg-surface-alt hover:text-ink"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </HelpPage>
  );
}
