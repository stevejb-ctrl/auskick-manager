import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-warm px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-700">Siren Footy</h1>
          <p className="mt-1 text-sm text-ink-dim">AFL U10s team management</p>
          <Link
            href="/demo"
            className="mt-3 inline-block rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
          >
            Try the demo →
          </Link>
        </div>
        <div className="rounded-lg border border-hairline bg-surface px-6 py-8 shadow-card">
          {children}
        </div>
      </div>
    </div>
  );
}
