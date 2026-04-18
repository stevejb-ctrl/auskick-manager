"use client";

import { useEffect, useState } from "react";

interface Props {
  iso: string;
  mode: "short" | "long";
}

export function FormattedDateTime({ iso, mode }: Props) {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    const d = new Date(iso);
    const dateOpts: Intl.DateTimeFormatOptions =
      mode === "long"
        ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        : { weekday: "short", day: "numeric", month: "short" };
    const timeOpts: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };
    setFormatted(
      `${d.toLocaleDateString(undefined, dateOpts)} · ${d.toLocaleTimeString(undefined, timeOpts)}`
    );
  }, [iso, mode]);

  return <span suppressHydrationWarning>{formatted || "\u00A0"}</span>;
}
