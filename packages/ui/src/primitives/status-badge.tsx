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
  const toneStyle = toneStyles[tone];

  return (
    <span
      className="nextday-status-badge"
      style={{
        alignItems: "center",
        background: `var(--nextday-badge-bg, ${toneStyle.background})`,
        border: "var(--nextday-badge-border, 0)",
        borderRadius: "var(--nextday-badge-radius, 999px)",
        color: `var(--nextday-badge-color, ${toneStyle.color})`,
        display: "inline-flex",
        fontSize: "var(--nextday-badge-font-size, 12px)",
        justifyContent: "center",
        lineHeight: "var(--nextday-badge-line-height, 20px)",
        minHeight: "var(--nextday-badge-min-height, 20px)",
        padding: "var(--nextday-badge-padding, 0 8px)",
        whiteSpace: "var(--nextday-badge-white-space, nowrap)",
      }}
    >
      {children}
    </span>
  );
}
