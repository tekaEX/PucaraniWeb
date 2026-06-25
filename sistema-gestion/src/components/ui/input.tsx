import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "flex h-[46px] w-full rounded-xl border border-separator bg-white px-[15px] text-[14.5px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_4px_rgba(15,118,110,0.13)] disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";
