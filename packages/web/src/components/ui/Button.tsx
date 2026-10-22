import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" };

/** A button that does not submit a form unless asked to with type="submit". */
export function Button({ variant = "default", ...props }: Props) {
  return <button type="button" className={variant === "primary" ? "primary" : undefined} {...props} />;
}
