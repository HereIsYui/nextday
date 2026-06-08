import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { createInitialTaskRows } from "./game.constants";

type TaskDbClient = Pick<Prisma.TransactionClient, "playerTaskState">;

const p19FirstChapterRequiredTasks = [
  "novice_create_role",
  "novice_explore_ji",
  "novice_resolve_event",
  "novice_craft_alchemy",
  "novice_tower_xuantie",
];

export async function ensureInitialPlayerTasks(tx: TaskDbClient, playerId: string) {
  for (const task of createInitialTaskRows(playerId)) {
    await tx.playerTaskState.upsert({
      where: {
        playerId_taskId_resetKey: {
          playerId,
          taskId: task.taskId,
          resetKey: task.resetKey ?? "permanent",
        },
      },
      create: { ...task, taskStateId: task.taskStateId ?? `task_state_${randomUUID()}` },
      update: {},
    });
  }
}

export async function incrementPlayerTasks(
  tx: TaskDbClient,
  playerId: string,
  increments: Record<string, number>,
): Promise<string[]> {
  await ensureInitialPlayerTasks(tx, playerId);
  const completedTaskIds: string[] = [];

  for (const [taskId, increment] of Object.entries(increments)) {
    if (increment <= 0) {
      continue;
    }

    const tasks = await tx.playerTaskState.findMany({
      where: { playerId, taskId, status: "in_progress" },
    });

    for (const task of tasks) {
      const nextValue = Math.min(task.targetValue, task.progressValue + increment);
      const nextStatus = nextValue >= task.targetValue ? "completed" : "in_progress";
      await tx.playerTaskState.update({
        where: { taskStateId: task.taskStateId },
        data: {
          progressValue: nextValue,
          status: nextStatus,
        },
      });

      if (nextStatus === "completed") {
        completedTaskIds.push(task.taskId);
      }
    }
  }

  const chapterCompleted = await completeFirstChapterIfReady(tx, playerId);
  return [...completedTaskIds, ...chapterCompleted];
}

async function completeFirstChapterIfReady(tx: TaskDbClient, playerId: string): Promise<string[]> {
  const chapterTask = await tx.playerTaskState.findFirst({
    where: { playerId, taskId: "chapter_first_30_minutes", status: "in_progress" },
  });

  if (!chapterTask) {
    return [];
  }

  const requiredTasks = await tx.playerTaskState.findMany({
    where: { playerId, taskId: { in: p19FirstChapterRequiredTasks } },
  });
  const ready = p19FirstChapterRequiredTasks.every((taskId) => {
    const task = requiredTasks.find((item) => item.taskId === taskId);
    return task && task.status !== "in_progress";
  });

  if (!ready) {
    return [];
  }

  await tx.playerTaskState.update({
    where: { taskStateId: chapterTask.taskStateId },
    data: { progressValue: chapterTask.targetValue, status: "completed" },
  });

  return [chapterTask.taskId];
}
