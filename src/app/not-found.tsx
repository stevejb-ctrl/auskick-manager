import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">Not found</h1>
      <p className="text-sm text-ink-dim">
        That page doesn&apos;t exist or you don&apos;t have access.
      </p>
      <Link
        href="/dashboard"
        className="inline-block text-sm font-medium text-brand-700 transition-colors duration-fast ease-out-quart hover:text-brand-800"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
