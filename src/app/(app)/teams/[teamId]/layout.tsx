import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamNav } from "@/components/team/TeamNav";

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
      <TeamNav teamId={params.teamId} teamName={team.name} />
      {children}
    </div>
  );
}
