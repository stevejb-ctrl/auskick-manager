import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { AdminTabBar } from "@/components/admin/AdminTabBar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate runs on every /admin/* request; non-admins get a 404.
  await requireSuperAdmin();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Super admin</h1>
        <p className="text-sm text-ink-mute">Cross-tenant view of the app.</p>
      </div>
      <AdminTabBar />
      {children}
    </div>
  );
}
