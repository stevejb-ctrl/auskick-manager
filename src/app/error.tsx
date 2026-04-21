"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">Something went wrong</h1>
      <p className="text-sm text-ink-dim">{error.message}</p>
      <div className="flex justify-center gap-3">
        <Button type="button" onClick={reset} size="md">
          Try again
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
