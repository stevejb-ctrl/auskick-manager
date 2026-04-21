"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealOnScrollProps {
  children: ReactNode;
  /** Delay in ms before the reveal kicks in after intersection. */
  delay?: number;
  /** Pixels of translate-up on the hidden state. */
  offset?: number;
  className?: string;
}

// Lightweight scroll-triggered reveal. Uses IntersectionObserver, fires once,
// and respects prefers-reduced-motion by skipping the transition entirely.
export function RevealOnScroll({
  children,
  delay = 0,
  offset = 24,
  className = "",
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${offset}px)`,
        transition: `opacity 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms, transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
