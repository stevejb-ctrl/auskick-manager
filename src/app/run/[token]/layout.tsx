import Link from "next/link";
import { DeviceFrame } from "@/components/DeviceFrame";

export default function RunLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface">
        <div className="flex items-center px-3 py-2">
          <Link
            href="/"
            className="flex items-center gap-1 text-base font-semibold text-brand-700"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Siren Footy
          </Link>
        </div>
      </header>
      <DeviceFrame>
        <main>{children}</main>
      </DeviceFrame>
    </div>
  );
}
