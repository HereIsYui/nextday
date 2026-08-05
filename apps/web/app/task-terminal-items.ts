export type TerminalTaskStatus = "in_progress" | "completed" | "claimed";

export interface TerminalTaskItem {
  progressValue: number;
  status: TerminalTaskStatus;
  targetValue: number;
  taskId: string;
  title: string;
}

export function taskItemsFromResult(value: unknown): TerminalTaskItem[] | null {
  const result = asRecord(value);
  if (!result || !Array.isArray(result.tasks)) {
    return null;
  }

  return result.tasks
    .map(normalizeTaskItem)
    .filter((item): item is TerminalTaskItem => item !== null);
}

export function taskItemFromClaimResult(value: unknown): TerminalTaskItem | null {
  return normalizeTaskItem(asRecord(value)?.task);
}

export function formatTaskItem(item: TerminalTaskItem): string {
  return `${item.title}：${item.progressValue}/${item.targetValue}（${taskStatusLabel(item.status)}）`;
}

function normalizeTaskItem(value: unknown): TerminalTaskItem | null {
  const task = asRecord(value);
  const taskId = pickText(task?.task_id);
  const title = pickText(task?.title);
  const progressValue = toFiniteNumber(task?.progress_value);
  const targetValue = toFiniteNumber(task?.target_value);
  const status = task?.status;

  if (
    !taskId ||
    !title ||
    progressValue === null ||
    targetValue === null ||
    (status !== "in_progress" && status !== "completed" && status !== "claimed")
  ) {
    return null;
  }

  return { progressValue, status, targetValue, taskId, title };
}

function taskStatusLabel(status: TerminalTaskStatus): string {
  return (
    {
      in_progress: "进行中",
      completed: "可领取",
      claimed: "已领取",
    }[status] ?? status
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
