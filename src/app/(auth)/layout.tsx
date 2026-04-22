import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-warm px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-700">Siren Footy</h1>
          <p className="mt-1 text-sm text-ink-dim">Junior AFL team management</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface px-6 py-8 shadow-card">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-ink-mute">
          <Link href="/help" className="hover:text-ink-dim">
            Help
          </Link>
        </p>
      </div>
    </div>
  );
}
