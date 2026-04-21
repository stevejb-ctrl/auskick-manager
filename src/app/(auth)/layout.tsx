export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-warm px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-700">Auskick Manager</h1>
          <p className="mt-1 text-sm text-ink-dim">AFL U10s team management</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface px-6 py-8 shadow-card">
          {children}
        </div>
      </div>
    </div>
  );
}
