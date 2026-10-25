"use client";

import { useSearchParams } from "next/navigation";
import { StatusNotice } from "@/components/team/StatusNotice";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/roles";
import type { TeamRole } from "@/lib/types";

const ROLES: TeamRole[] = ["admin", "game_manager", "parent"];

/**
 * "You've joined Coogee Stingrays as a Parent", after an invite or the
 * team code (`?joined=<role>`). Joining by code makes you a read-only
 * Parent, which nothing used to say, so a helper handed the code
 * couldn't tell why they couldn't run the game.
 */
export function JoinedNotice({ teamName }: { teamName: string }) {
  const joined = useSearchParams().get("joined");
  const role = ROLES.find((r) => r === joined);
  if (!role) return null;
  return (
    <StatusNotice>
      <strong>{`You've joined ${teamName} as a ${ROLE_LABEL[role]}.`}</strong>{" "}
      {role === "parent"
        ? "You can follow games and scores, and mark availability. Helping run games? Ask your coach to make you a Manager."
        : ROLE_SUMMARY[role]}
    </StatusNotice>
  );
}
