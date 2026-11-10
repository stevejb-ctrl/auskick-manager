"use client";

import Link from "next/link";
import { useHelpHref } from "@/lib/help/helpHref";

/** The app footer's Help link: the current team's sport hub, or /help. */
export function AppHelpLink({ className }: { className?: string }) {
  return (
    <Link href={useHelpHref()} className={className}>
      Help
    </Link>
  );
}
