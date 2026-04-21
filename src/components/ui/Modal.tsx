import { type ReactNode } from "react";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  children: ReactNode;
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
};

export function Modal({ children, size = "sm" }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" />
      <div
        className={`relative w-full ${sizeClasses[size]} rounded-lg border border-hairline bg-surface p-5 shadow-modal`}
      >
        {children}
      </div>
    </div>
  );
}
