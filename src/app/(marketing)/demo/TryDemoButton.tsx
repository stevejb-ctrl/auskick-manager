"use client";

import { useFormStatus } from "react-dom";
import type { MarketingSportConfig } from "@/lib/sports/marketing-sports";

// A sport page's "Try the <sport> demo": starts that sport's demo game
// straight away, the way its card on /demo does (Stagehand round 11: the
// link went to the picker, where the visitor had to pick the sport again).
// Same server action and the same guard as DemoSportCard: disabled while
// the game is set up, so a second tap can't start a second game.
export function TryDemoButton({
  sport,
  label,
  action,
  className,
}: {
  sport: MarketingSportConfig;
  /** The button's words, e.g. "Try the rugby league demo". */
  label: string;
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="sport" value={sport.id} />
      <TryDemoSubmit label={label} className={className} />
    </form>
  );
}

function TryDemoSubmit({ label, className }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:cursor-progress`}>
      {pending ? "Setting up the game…" : label}
    </button>
  );
}
