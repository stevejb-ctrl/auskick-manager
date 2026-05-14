import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={[
            "block w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink shadow-card",
            "placeholder:text-ink-mute",
            // Border + box-shadow transition so the validation
            // state change (hairline → danger) eases over 200ms
            // instead of snapping. Matches LoginField's
            // pre-existing pattern. P1-5 in
            // MICRO-INTERACTIONS-PLAN.md.
            "transition-[border-color,box-shadow] duration-base ease-out-quart",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus:border-brand-600",
            "disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-mute",
            error
              ? "border-danger focus-visible:ring-danger focus:border-danger"
              : "border-hairline",
            className,
          ].join(" ")}
          aria-invalid={error ? "true" : undefined}
          {...props}
        />
        {error && (
          // Error text fades in over 350ms via the existing
          // `fade-in` keyframe. Reduced-motion users see it
          // appear instantly via the motion-safe modifier.
          <p
            className="mt-1 text-xs text-danger motion-safe:animate-fade-in"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
