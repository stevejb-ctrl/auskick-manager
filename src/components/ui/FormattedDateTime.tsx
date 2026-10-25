"use client";

import { useEffect, useState } from "react";
import { formatGameDateTime } from "@/lib/games/gameDates";

interface Props {
  iso: string;
  mode: "short" | "long";
}

export function FormattedDateTime({ iso, mode }: Props) {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    // Short form adds the year when it isn't this year's (a 2027 opener
    // under "2026 Season" read as this season's).
    setFormatted(formatGameDateTime(new Date(iso), mode));
  }, [iso, mode]);

  return <span suppressHydrationWarning>{formatted || "\u00A0"}</span>;
}
