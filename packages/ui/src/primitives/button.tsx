import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function Button({ children, className, style, ...props }: ButtonProps) {
  const buttonClassName = ["nextday-button", className].filter(Boolean).join(" ");

  return (
    <button
      className={buttonClassName}
      style={{
        alignItems: "center",
        border: "var(--nextday-button-border, 1px solid #2f6f73)",
        borderRadius: "var(--nextday-button-radius, 6px)",
        background: "var(--nextday-button-bg, #14383b)",
        color: "var(--nextday-button-color, #f4fbf9)",
        cursor: "pointer",
        display: "inline-flex",
        fontFamily: "var(--nextday-button-font-family, inherit)",
        fontSize: "var(--nextday-button-font-size, 14px)",
        justifyContent: "center",
        lineHeight: "var(--nextday-button-line-height, 1.2)",
        minHeight: "var(--nextday-button-min-height, 36px)",
        padding: "var(--nextday-button-padding, 0 12px)",
        whiteSpace: "var(--nextday-button-white-space, nowrap)",
        ...style,
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
