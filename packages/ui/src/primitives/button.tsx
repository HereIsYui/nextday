import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function Button({ children, style, ...props }: ButtonProps) {
  return (
    <button
      style={{
        border: "1px solid #2f6f73",
        borderRadius: 6,
        background: "#14383b",
        color: "#f4fbf9",
        cursor: "pointer",
        fontSize: 14,
        minHeight: 36,
        padding: "0 12px",
        ...style,
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
