import { Suspense } from "react";
import { PlayerList } from "@/components/squad/PlayerList";
import { Spinner } from "@/components/ui/Spinner";

interface SquadPageProps {
  params: { teamId: string };
}

export default function SquadPage({ params }: SquadPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      }
    >
      <PlayerList teamId={params.teamId} />
    </Suspense>
  );
}
