import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-warm px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-brand-700">Auskick Manager</h1>
        <p className="mt-2 text-sm text-ink-dim">AFL U10s team management</p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-alt"
          >
            Create account
          </Link>
        </div>

        <p className="mt-8 text-xs text-ink-mute">
          <Link href="/help" className="hover:text-ink-dim">
            Help &amp; documentation
          </Link>
        </p>
      </div>
    </div>
  );
}
