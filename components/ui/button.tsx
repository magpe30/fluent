import type { ComponentPropsWithRef, CSSProperties, ReactNode } from "react";
import styles from "./button.module.css";

export type ButtonProps = Omit<ComponentPropsWithRef<"button">, "color"> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  color?: CSSProperties["color"];
  background?: CSSProperties["background"];
  borderColor?: CSSProperties["borderColor"];
  fullWidth?: boolean;
  loading?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};

type ButtonStyle = CSSProperties & {
  "--button-color"?: CSSProperties["color"];
  "--button-background"?: CSSProperties["background"];
  "--button-border"?: CSSProperties["borderColor"];
};

/** Native button semantics, shared presentation. Use type="submit" explicitly in forms. */
export function Button({
  variant = "primary", size = "md", type = "button", color, background, borderColor,
  fullWidth = false, loading = false, startIcon, endIcon, disabled, className, style,
  children, ...props
}: ButtonProps) {
  const customStyle: ButtonStyle = {
    ...style,
    ...(color !== undefined && { "--button-color": color }),
    ...(background !== undefined && { "--button-background": background }),
    ...(borderColor !== undefined && { "--button-border": borderColor }),
  };

  return <button
    {...props}
    type={type}
    className={[styles.button, className].filter(Boolean).join(" ")}
    data-variant={variant}
    data-size={size}
    data-full-width={fullWidth || undefined}
    aria-busy={loading || props["aria-busy"] || undefined}
    disabled={disabled || loading}
    style={customStyle}
  >
    {loading ? <span className={styles.spinner} aria-hidden="true"/> : startIcon}
    {children}
    {endIcon}
  </button>;
}
