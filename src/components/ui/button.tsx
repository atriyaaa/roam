import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
} from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-foreground text-white hover:bg-foreground/90",
  secondary:
    "border border-foreground/20 bg-white text-foreground hover:bg-sky",
  ghost:
    "text-foreground hover:bg-foreground/5",
};

function buttonStyles(variant: Variant, className = "") {
  return [
    "inline-flex items-center justify-center gap-2",
    "min-h-11 rounded-full px-5 py-3",
    "text-sm font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-4",
    "focus-visible:outline-terracotta",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    className,
  ].join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, className)}
      {...props}
    />
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
};

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={buttonStyles(variant, className)}
      {...props}
    />
  );
}