import { Suspense } from "react";
import { LoginExperience } from "@/components/auth/LoginExperience";

export default function LoginPage() {
  return (
    <>
      <p className="font-mono text-[11px] font-bold uppercase tracking-banner text-ink-mute">
        Coaches &amp; team managers
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-display leading-[0.98] text-ink text-balance sm:text-4xl">
        Run your team&rsquo;s <span className="text-accent">season</span>
      </h1>
      <p className="mt-3 text-sm text-ink-dim sm:text-base">
        New or returning, enter your email and we&rsquo;ll get you in. Parents
        don&rsquo;t need an account; they just open a share link.
      </p>

      <div className="mt-6">
        {/* useSearchParams() inside LoginExperience needs a Suspense
            parent so the page shell can stay statically prerenderable. */}
        <Suspense fallback={null}>
          <LoginExperience />
        </Suspense>
      </div>
    </>
  );
}
