import Image from "next/image";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { PulseMark } from "@/components/brand/PulseMark";

// Above-the-fold. Two-column on desktop, stacked on mobile. Copy on the
// left, phone mockup on the right with a subtle tilt for visual energy.
// CTA swaps to "Go to dashboard" for authed visitors.
export async function Hero() {
  const {
    data: { user },
  } = await getUser();

  return (
    <section className="relative overflow-hidden border-b border-hairline">
      {/* Soft field-green wash behind the content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/60 via-warm to-warm"
      />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div>
          <RevealOnScroll>
            <span className="inline-flex items-center gap-2 rounded-full border border-warn/30 bg-warn-soft px-3 py-1 text-[11px] font-bold uppercase tracking-micro text-warn">
              <PulseMark size={12} pulsing />
              <span>Built for junior AFL</span>
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tightest text-ink sm:text-5xl md:text-6xl">
              Run game day.
              <br />
              Keep your head up.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-dim sm:text-xl">
              Three-zone rotations. Fair game time across the quarters.
              Late arrivals, injuries, fill-ins. Siren knows the
              intricacies of junior AFL that generic sub-timers miss.
              So you can stop juggling a clipboard and watch your kid
              play.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-base font-medium text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                >
                  Go to dashboard
                </Link>
              ) : (
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-base font-medium text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                >
                  Start free
                </Link>
              )}
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-5 py-2.5 text-base font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                Try the demo
              </Link>
            </div>

            <p className="mt-4 text-sm text-ink-mute">
              Free for the entire 2026 season. Works on any phone.
              No app to install.
            </p>
          </RevealOnScroll>
        </div>

        <RevealOnScroll delay={120}>
          <div className="relative">
            {/* Accent blobs behind the phone */}
            <div
              aria-hidden="true"
              className="absolute -left-8 top-10 h-48 w-48 rounded-full bg-brand-200/50 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute -right-4 bottom-6 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl"
            />
            <PhoneFrame tilt={2} className="relative">
              <Image
                src="/marketing/screenshots/live-game.png"
                alt="Siren live game view with player rotations and score"
                fill
                sizes="(max-width: 1024px) 300px, 280px"
                priority
                className="object-cover"
              />
            </PhoneFrame>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
