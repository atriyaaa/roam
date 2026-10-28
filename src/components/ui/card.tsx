import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`overflow-hidden rounded-3xl border border-foreground/10 bg-white ${className}`}
      {...props}
    />
  );
}

export function CardContent({
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`p-6 ${className}`}
      {...props}
    />
  );
}