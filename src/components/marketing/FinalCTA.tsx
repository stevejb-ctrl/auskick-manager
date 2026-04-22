import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";

// Closing CTA. Dark field-green block so it reads as a decision point,
// not another feature section. Auth-aware — logged-in visitors see
// "Go to dashboard" instead of the sign-up prompt.
export async function FinalCTA() {
  const {
    data: { user },
  } = await getUser();

  return (
    <section className="bg-brand-800 text-warm">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 md:py-28">
        <RevealOnScroll>
          <h2 className="text-3xl font-bold tracking-tightest sm:text-4xl md:text-5xl">
            Ready for Saturday morning?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-brand-100">
            Set up your team in about five minutes. Free to use. Works on the
            phone you already have.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md bg-warm px-6 py-3 text-base font-semibold text-brand-800 shadow-card transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-md bg-warm px-6 py-3 text-base font-semibold text-brand-800 shadow-card transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
                >
                  Create your team
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-md border border-warm/30 px-6 py-3 text-base font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
