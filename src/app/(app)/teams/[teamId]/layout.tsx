import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamTabBar } from "@/components/team/TeamTabBar";

interface TeamLayoutProps {
  children: React.ReactNode;
  params: { teamId: string };
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
  const supabase = createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("id", params.teamId)
    .single();

  if (!team) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-brand-600"
        >
          ← My teams
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
        <TeamTabBar teamId={params.teamId} />
      </div>

      {children}
    </div>
  );
}
