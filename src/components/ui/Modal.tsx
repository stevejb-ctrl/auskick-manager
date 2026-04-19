import { type ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
}

export function Modal({ children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        {children}
      </div>
    </div>
  );
}
