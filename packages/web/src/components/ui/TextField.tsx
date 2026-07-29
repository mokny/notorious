import { forwardRef, type InputHTMLAttributes } from "react";

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-accent/40 ${className}`}
      {...props}
    />
  ),
);
TextField.displayName = "TextField";
