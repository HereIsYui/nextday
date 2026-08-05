export type TerminalTone = "system" | "command" | "success" | "warning" | "error";

export interface TerminalMessageBatch {
  lines: string[];
  tone: TerminalTone;
}

const terminalTonePriority: Record<TerminalTone, number> = {
  system: 0,
  command: 1,
  success: 1,
  warning: 2,
  error: 3,
};

export function mergeCommandEntries(entries: unknown[]): TerminalMessageBatch | null {
  const normalizedEntries = entries.flatMap(normalizeCommandEntry);
  if (normalizedEntries.length === 0) {
    return null;
  }

  return {
    lines: normalizedEntries.flatMap((entry) => entry.lines),
    tone: normalizedEntries.reduce(
      (currentTone, entry) =>
        terminalTonePriority[entry.tone] > terminalTonePriority[currentTone]
          ? entry.tone
          : currentTone,
      "system" as TerminalTone,
    ),
  };
}

function normalizeCommandEntry(value: unknown): TerminalMessageBatch[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [{ lines: [text], tone: "success" }] : [];
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const listedLines = textList(record.lines ?? record.messages ?? record.details);
  const fallbackText = pickText(
    record.message,
    record.summary,
    record.content,
    record.text,
    record.description,
  );
  const lines =
    fallbackText && !listedLines.includes(fallbackText)
      ? [...listedLines, fallbackText]
      : listedLines;
  if (lines.length === 0) {
    return [];
  }

  return [
    {
      lines,
      tone: normalizeTone(pickText(record.tone, record.level, record.status, record.type)),
    },
  ];
}

function normalizeTone(value: string): TerminalTone {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("danger")
  ) {
    return "error";
  }
  if (normalized.includes("warn") || normalized.includes("pending")) {
    return "warning";
  }
  if (normalized.includes("command")) {
    return "command";
  }
  if (normalized.includes("system") || normalized.includes("info")) {
    return "system";
  }
  return "success";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

function textList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
}
