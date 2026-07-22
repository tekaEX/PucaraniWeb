import * as React from "react";
import { cn } from "@/lib/utils";

// Compacto (40px): la app es densa en datos y así editar es más cómodo.
export const inputClass =
  "flex h-10 w-full rounded-lg border border-separator bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgba(15,118,110,0.13)] disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";
