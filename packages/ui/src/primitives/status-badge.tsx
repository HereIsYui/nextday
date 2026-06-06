import type { ReactNode } from "react";

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning";
}

const toneStyles = {
  neutral: { background: "#eef2f2", color: "#203233" },
  success: { background: "#dff5e8", color: "#174a2a" },
  warning: { background: "#fff1cc", color: "#5a3d00" },
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      style={{
        ...toneStyles[tone],
        borderRadius: 999,
        display: "inline-flex",
        fontSize: 12,
        lineHeight: "20px",
        padding: "0 8px",
      }}
    >
      {children}
    </span>
  );
}
