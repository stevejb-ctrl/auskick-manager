import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Super-admin check: one cheap own-profile read (RLS allows it).
  // Used only to render a conditional "Admin" link in the header.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isSuperAdmin = Boolean(profile?.is_super_admin);

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-brand-700">
            Auskick Manager
          </span>
          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim hover:bg-surface-alt hover:text-ink"
              >
                Admin
              </Link>
            )}
            <span className="hidden text-sm text-ink-mute sm:block">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
    </div>
  );
}
