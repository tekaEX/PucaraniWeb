import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand text-brand-foreground hover:bg-brand-dark",
  secondary: "bg-[#ececef] text-foreground hover:bg-[#e2e2e6]",
  outline: "border border-separator bg-white text-foreground hover:bg-background",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-danger text-white hover:bg-[#a32a21]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-[34px] px-[15px] text-[13px] gap-1.5",
  md: "h-[42px] px-[21px] text-[14.5px] gap-2",
  lg: "h-[50px] px-[27px] text-base gap-2",
  icon: "h-[42px] w-[42px]",
};

export function buttonClass(opts?: { variant?: Variant; size?: Size; className?: string }) {
  const { variant = "primary", size = "md", className } = opts ?? {};
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={buttonClass({ variant, size, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
