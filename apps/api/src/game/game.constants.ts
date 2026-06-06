import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const defaultEraId = "era_mvp_001";
export const maxOfflineCultivationHours = 8;
export const maxCaveCollectMinutes = 8 * 60;
export const maxExploreBatch = 5;

export interface ProvinceConfig {
  provinceId: string;
  name: string;
  towerName: string;
  chapterRequired: number;
  recommendedAction: string;
  enemyId: string;
  enemyName: string;
  enemyPower: number;
}

export const provinceConfigs: ProvinceConfig[] = [
  {
    provinceId: "ji",
    name: "冀州",
    towerName: "玄铁塔",
    chapterRequired: 1,
    recommendedAction: "普通探索",
    enemyId: "gudiao",
    enemyName: "蛊雕",
    enemyPower: 90,
  },
  {
    provinceId: "yan",
    name: "兖州",
    towerName: "礼法塔",
    chapterRequired: 2,
    recommendedAction: "宗门预告",
    enemyId: "zheng",
    enemyName: "狰",
    enemyPower: 180,
  },
  {
    provinceId: "qing",
    name: "青州",
    towerName: "潮生塔",
    chapterRequired: 3,
    recommendedAction: "海岱采药",
    enemyId: "xuangui",
    enemyName: "旋龟",
    enemyPower: 240,
  },
  {
    provinceId: "xu",
    name: "徐州",
    towerName: "戈阳塔",
    chapterRequired: 3,
    recommendedAction: "兵争巡守",
    enemyId: "kui",
    enemyName: "夔",
    enemyPower: 300,
  },
];

export interface TaskDefinition {
  taskId: string;
  taskType: "novice" | "daily" | "weekly" | "chapter";
  title: string;
  targetValue: number;
  initialProgress?: number;
  rewardSnapshot: Prisma.InputJsonValue;
  resetKey: string;
}

export function getTaskDefinitions(date = new Date()): TaskDefinition[] {
  const dailyResetKey = getDailyResetKey(date);
  const weeklyResetKey = getWeeklyResetKey(date);

  return [
    {
      taskId: "novice_create_role",
      taskType: "novice",
      title: "初入冀州",
      targetValue: 1,
      initialProgress: 1,
      rewardSnapshot: { spirit_stone: "100" },
      resetKey: "permanent",
    },
    {
      taskId: "novice_claim_cultivation",
      taskType: "novice",
      title: "静坐行功",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "80" },
      resetKey: "permanent",
    },
    {
      taskId: "novice_explore_ji",
      taskType: "novice",
      title: "巡游冀州",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "120", items: [{ item_id: "low_herb", count: 2 }] },
      resetKey: "permanent",
    },
    {
      taskId: "daily_explore",
      taskType: "daily",
      title: "今日历练",
      targetValue: 3,
      rewardSnapshot: { spirit_stone: "150", action_points: 5 },
      resetKey: dailyResetKey,
    },
    {
      taskId: "daily_cave_collect",
      taskType: "daily",
      title: "洞府收取",
      targetValue: 1,
      rewardSnapshot: { spirit_stone: "60" },
      resetKey: dailyResetKey,
    },
    {
      taskId: "weekly_explore_10",
      taskType: "weekly",
      title: "周行十里",
      targetValue: 10,
      rewardSnapshot: { spirit_stone: "500", action_points: 10 },
      resetKey: weeklyResetKey,
    },
    {
      taskId: "chapter_unlock_ji",
      taskType: "chapter",
      title: "塔裂冀州",
      targetValue: 1,
      initialProgress: 1,
      rewardSnapshot: { spirit_stone: "100" },
      resetKey: "permanent",
    },
  ];
}

export function createInitialTaskRows(playerId: string): Prisma.PlayerTaskStateCreateManyInput[] {
  return getTaskDefinitions().map((definition) => {
    const progressValue = definition.initialProgress ?? 0;

    return {
      taskStateId: `task_state_${randomUUID()}`,
      playerId,
      taskId: definition.taskId,
      taskType: definition.taskType,
      title: definition.title,
      targetValue: definition.targetValue,
      progressValue,
      status: progressValue >= definition.targetValue ? "completed" : "in_progress",
      resetKey: definition.resetKey,
      rewardSnapshot: definition.rewardSnapshot,
    };
  });
}

export function getDailyResetKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getWeeklyResetKey(date = new Date()): string {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.floor((dayOffset + firstDay.getUTCDay()) / 7) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
