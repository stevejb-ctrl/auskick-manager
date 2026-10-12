import type { ReactNode } from "react";

/**
 * A titled group on the Team tab (UX plan §6: How we play · People ·
 * Season · Game-day extras · Danger zone). Settings that used to be one
 * long undifferentiated stack now sit under the heading a coach would
 * look for.
 */
export function SettingsSection({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="px-1">
        <h2
          id={id}
          className={`font-mono text-[11px] font-bold uppercase tracking-micro ${
            tone === "danger" ? "text-danger" : "text-ink-dim"
          }`}
        >
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-ink-mute">{description}</p>}
      </div>
      {children}
    </section>
  );
}
