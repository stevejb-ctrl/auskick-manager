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
          <p className="mt-1 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
