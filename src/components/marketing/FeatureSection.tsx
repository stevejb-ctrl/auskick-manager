import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";

interface FeatureSectionProps {
  /** Small caps label above the title. */
  eyebrow: string;
  /** Short, punchy headline. Two lines max reads best. */
  title: string;
  /** One-sentence supporting paragraph. */
  body: string;
  /** Optional bullet list of sub-features. */
  bullets?: string[];
  /** Path to the feature screenshot (PNG/JPG/SVG under /public). */
  image: string;
  imageAlt: string;
  /** Flip the layout (image on the left). Default: image on the right. */
  reverse?: boolean;
  /** Subtle background tint — "warm" (default) or "surface" for striping. */
  tone?: "warm" | "surface";
  /** Section id for anchor links. */
  id?: string;
}

// One feature, centred on a big screenshot. Alternates left/right via
// `reverse`. Tone alternates background between warm and surface so the
// sections feel like distinct stops, not a wall of text.
export function FeatureSection({
  eyebrow,
  title,
  body,
  bullets,
  image,
  imageAlt,
  reverse = false,
  tone = "warm",
  id,
}: FeatureSectionProps) {
  const bg = tone === "surface" ? "bg-surface" : "bg-warm";

  return (
    <section
      id={id}
      className={`${bg} border-b border-hairline`}
      style={{ scrollMarginTop: "72px" }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2 lg:gap-20">
        {/* Copy */}
        <div className={reverse ? "lg:order-2" : undefined}>
          <RevealOnScroll>
            <p className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
              {eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tightest text-ink sm:text-4xl md:text-5xl">
              {title}
            </h2>
            <p className="mt-5 max-w-xl text-lg text-ink-dim">{body}</p>
            {bullets && bullets.length > 0 && (
              <ul className="mt-6 space-y-2 text-base text-ink-dim">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-brand-600"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </RevealOnScroll>
        </div>

        {/* Phone mockup */}
        <div className={reverse ? "lg:order-1" : undefined}>
          <RevealOnScroll delay={120}>
            <PhoneFrame>
              <img
                src={image}
                alt={imageAlt}
                className="h-full w-full object-cover"
              />
            </PhoneFrame>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
