import { Eyebrow } from "@/components/sf";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";

/**
 * Right-hand dark column on the desktop login screen.
 *
 * Per `login_handoff/README.md`, this panel does the "what is this?"
 * work for first-time visitors so the form column can stay focused.
 * Hidden below the 720 px breakpoint (replaced by `<LoginMobileBand>`).
 *
 * Content (verbatim from the prototype):
 *   - Dark `SirenWordmark` top-left
 *   - Eyebrow "Built for Saturday morning"
 *   - Headline "Fair rotations. _Calmer_ sidelines. Happier kids."
 *     with one word in `font-serif italic` (Instrument Serif)
 *   - Three numbered bullets in alarm-orange
 *
 * The placeholder social-proof stat strip from the prototype is
 * intentionally NOT included — README explicitly warns against
 * inventing numbers and we don't have real ones to put there.
 */
export function LoginBrandPanel() {
  return (
    <div className="relative hidden flex-1 overflow-hidden border-l border-hairline bg-ink p-14 text-warm md:flex md:flex-col">
      {/* Decorative footy oval — same field motif as the home hero,
          but giant and faded. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-[-120px] top-1/2 -translate-y-1/2"
        width="700"
        height="800"
        viewBox="0 0 200 220"
        style={{ opacity: 0.08 }}
      >
        <ellipse cx="100" cy="110" rx="80" ry="100" fill="none" stroke="#fff" strokeWidth="0.8" />
        <ellipse cx="100" cy="110" rx="55" ry="75" fill="none" stroke="#fff" strokeWidth="0.6" />
        <ellipse cx="100" cy="110" rx="30" ry="45" fill="none" stroke="#fff" strokeWidth="0.5" />
        <line x1="100" y1="10" x2="100" y2="210" stroke="#fff" strokeWidth="0.5" opacity="0.6" />
        <line x1="20" y1="110" x2="180" y2="110" stroke="#fff" strokeWidth="0.5" opacity="0.6" />
      </svg>

      {/* Wordmark — dark variant flips the text to warm on the ink panel */}
      <div className="relative">
        <SirenWordmark size="md" dark />
      </div>

      {/* Pull-quote block — vertically centred between wordmark and bullets */}
      <div className="relative flex flex-1 max-w-[460px] flex-col justify-center">
        <Eyebrow className="!text-warm/55">Built for Saturday morning</Eyebrow>
        <h2
          className="mt-3 text-[44px] font-bold tracking-tightest text-warm"
          style={{ lineHeight: 1.04 }}
        >
          Fair rotations.{" "}
          <span className="font-serif italic font-normal">Calmer</span>{" "}
          sidelines. Happier kids.
        </h2>

        <ul className="mt-8 flex max-w-[380px] flex-col gap-3.5 text-sm text-warm/80">
          <BrandBullet n="01">
            Track minutes per player and balance time on the bench.
          </BrandBullet>
          <BrandBullet n="02">
            Build the lineup once, then drag players between quarters.
          </BrandBullet>
          <BrandBullet n="03">
            Share a read-only game link with parents — no account needed.
          </BrandBullet>
        </ul>
      </div>
    </div>
  );
}

function BrandBullet({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="shrink-0 pt-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-alarm">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
