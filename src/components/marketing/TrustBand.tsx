interface TrustStat {
  stat: string;
  label: string;
}

interface TrustBandProps {
  stats: readonly TrustStat[];
}

// Quiet horizontal stats strip between the hero and the features
// section. Big tracking-tightest numerals each paired with a small
// uppercase mono label underneath. Two columns on phones, four on
// desktop. Light surface so it reads as a clean break between the
// mint-tinted hero and the mint backdrop of the features section.
export function TrustBand({ stats }: TrustBandProps) {
  return (
    <section
      aria-label="At a glance"
      className="border-b border-hairline bg-surface"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 sm:grid-cols-4 sm:gap-8 sm:px-6 sm:py-8">
        {stats.map((item) => (
          <div key={item.label} className="text-center sm:text-left">
            <div className="text-2xl font-bold tracking-tightest leading-none text-ink sm:text-3xl">
              {item.stat}
            </div>
            <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-banner text-ink-mute">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
