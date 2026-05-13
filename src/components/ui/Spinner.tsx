import { PulseDot } from "@/components/ui/PulseDot";

// Spinner is the legacy name kept for the existing call sites
// (games list page, game detail page, squad page — every place
// uses `<Spinner size="lg" />`). The implementation now defers to
// PulseDot so the brand pulse is the universal loading indicator;
// the rotating-stroke SVG that lived here previously is gone.
//
// New code should prefer `<PulseDot />` directly. This export is
// just a redirect — keeps the existing pages compiling without
// per-call-site edits.
interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return <PulseDot size={size} className={className} />;
}
