import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Not found</h1>
      <p className="text-sm text-gray-500">
        That page doesn&apos;t exist or you don&apos;t have access.
      </p>
      <Link
        href="/dashboard"
        className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
