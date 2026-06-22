import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(inputClass, "appearance-none bg-white pr-8", className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
