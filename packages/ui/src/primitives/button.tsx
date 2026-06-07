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
        border: "1px solid #2f6f73",
        borderRadius: 6,
        background: "#14383b",
        color: "#f4fbf9",
        cursor: "pointer",
        display: "inline-flex",
        fontSize: 14,
        justifyContent: "center",
        lineHeight: 1.2,
        minHeight: 36,
        padding: "0 12px",
        whiteSpace: "nowrap",
        ...style,
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
