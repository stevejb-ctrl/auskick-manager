import Link from "next/link";

// The help pages' type: short paragraphs, lists and bold UI labels,
// in the same sizes and tokens as the original help pages. Server
// components only.

export function P({ children, lead = false }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <p className={lead ? "mt-3 text-base leading-relaxed text-ink-dim" : "mt-3 text-sm leading-relaxed text-ink-dim"}>
      {children}
    </p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">{children}</ul>;
}

export function OL({ children }: { children: React.ReactNode }) {
  return <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">{children}</ol>;
}

/** A label the coach sees on screen: a button, a heading, a word on a tile. */
export function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-ink">{children}</strong>;
}

export function H3({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mt-5 scroll-mt-24 font-semibold text-ink">
      {children}
    </h3>
  );
}

/** A section of a help page, with an anchor the nav links to. */
export function HelpSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-xl font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand-700 underline hover:text-brand-600">
      {children}
    </Link>
  );
}

/** Question and answer, for the FAQ and the sport hubs' Questions. */
export function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="font-semibold text-ink">{q}</h3>
      <div className="mt-1 space-y-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </div>
  );
}

/** "Related topics: A · B · C" at the foot of a page. */
export function Related({ links }: { links: { href: string; label: string }[] }) {
  return (
    <div className="mt-10 rounded-lg border border-hairline bg-surface-alt px-4 py-3 text-sm text-ink-dim">
      <p>
        <strong className="text-ink">Related topics:</strong>{" "}
        {links.map((l, i) => (
          <span key={l.href}>
            {i > 0 && " · "}
            <Link href={l.href} className="font-medium text-brand-600 hover:underline">
              {l.label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}
