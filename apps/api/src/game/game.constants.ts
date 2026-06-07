import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const defaultEraId = "era_mvp_001";
export const maxOfflineCultivationHours = 8;
export const maxCaveCollectMinutes = 8 * 60;
export const maxExploreBatch = 5;

export const provinceExploreSeconds: Record<string, number> = {
  ji: 20,
  yan: 30,
  qing: 30,
  xu: 30,
  yang: 45,
  jing: 45,
  yu: 45,
  liang: 60,
  yong: 60,
};

export interface ProvinceConfig {
  provinceId: string;
  name: string;
  theme: string;
  towerName: string;
  chapterRequired: number;
  recommendedAction: string;
  resources: string[];
  lowLevelEntry: string;
  longTermGoal: string;
  towerEffect: string;
  enemyId: string;
  enemyName: string;
  enemyPower: number;
}

export const provinceConfigs: ProvinceConfig[] = [
  {
    provinceId: "ji",
    name: "冀州",
    theme: "新手州，北境旧地",
    towerName: "玄铁塔",
    chapterRequired: 1,
    recommendedAction: "普通探索",
    resources: ["基础灵石", "低阶灵草", "玄铁残片"],
    lowLevelEntry: "冀州巡游、玄铁塔补给、第一次魔潮教学",
    longTermGoal: "稳定新手州灵脉，降低后续魔潮压力",
    towerEffect: "影响新手州魔潮强度和基础灵脉收益",
    enemyId: "gudiao",
    enemyName: "蛊雕",
    enemyPower: 90,
  },
  {
    provinceId: "yan",
    name: "兖州",
    theme: "宗门州，礼法复兴",
    towerName: "礼法塔",
    chapterRequired: 2,
    recommendedAction: "宗门预告",
    resources: ["宗门令", "阵砂", "礼器残片"],
    lowLevelEntry: "宗门预备、礼阵巡护、阵砂捐献",
    longTermGoal: "提升宗门建设效率和宗门战准备",
    towerEffect: "影响宗门任务、仓库额度和宗门建设效率",
    enemyId: "zheng",
    enemyName: "狰",
    enemyPower: 180,
  },
  {
    provinceId: "qing",
    name: "青州",
    theme: "海岱州，潮汐灵脉",
    towerName: "潮生塔",
    chapterRequired: 3,
    recommendedAction: "海岱采药",
    resources: ["潮汐草", "海妖骨", "丹火材料"],
    lowLevelEntry: "潮汐草采集、护送丹师、海妖镜像挑战",
    longTermGoal: "控制丹火材料和潮汐 Boss 周期",
    towerEffect: "影响丹火材料、海妖事件和水脉收益",
    enemyId: "xuangui",
    enemyName: "旋龟",
    enemyPower: 240,
  },
  {
    provinceId: "xu",
    name: "徐州",
    theme: "兵争州，古战场",
    towerName: "戈阳塔",
    chapterRequired: 3,
    recommendedAction: "兵争巡守",
    resources: ["战魂铁", "血晶", "战备符"],
    lowLevelEntry: "战备运输、资源点巡守、战场残魂清理",
    longTermGoal: "提高资源点收益权和 PVP 阵线优势",
    towerEffect: "影响资源点争夺、战备材料和阵营战线",
    enemyId: "kui",
    enemyName: "夔",
    enemyPower: 300,
  },
  {
    provinceId: "yang",
    name: "扬州",
    theme: "富庶州，商路交汇",
    towerName: "琉光塔",
    chapterRequired: 4,
    recommendedAction: "商路护送",
    resources: ["灵木", "商票", "聚灵阵材"],
    lowLevelEntry: "商队护送、灵田修复、交易税议",
    longTermGoal: "维持商路繁荣，降低交易税和材料成本",
    towerEffect: "影响交易行税率、商票产出和灵田收益",
    enemyId: "feiyi",
    enemyName: "肥遗",
    enemyPower: 390,
  },
  {
    provinceId: "jing",
    name: "荆州",
    theme: "泽林州，万木秘境",
    towerName: "万木塔",
    chapterRequired: 4,
    recommendedAction: "泽林采药",
    resources: ["灵植", "妖藤", "内天地种子"],
    lowLevelEntry: "采药、净化低阶妖藤、秘境外围巡查",
    longTermGoal: "推进高阶秘境和内天地材料产出",
    towerEffect: "影响灵草、妖藤和内天地种子产出",
    enemyId: "bashe",
    enemyName: "巴蛇幼影",
    enemyPower: 430,
  },
  {
    provinceId: "yu",
    name: "豫州",
    theme: "中州，九州中枢",
    towerName: "天衡塔",
    chapterRequired: 5,
    recommendedAction: "阵眼修复",
    resources: ["天衡石", "阵眼核心", "阵营声望材料"],
    lowLevelEntry: "阵眼巡检、声望任务、阵营调停",
    longTermGoal: "控制阵营补偿和主线分支权重",
    towerEffect: "影响阵营平衡、九州中枢和主线分支",
    enemyId: "kui_niu",
    enemyName: "夔牛",
    enemyPower: 560,
  },
  {
    provinceId: "liang",
    name: "梁州",
    theme: "山川州，地脉重镇",
    towerName: "镇岳塔",
    chapterRequired: 6,
    recommendedAction: "地脉修复",
    resources: ["山铜", "地脉石", "炼体矿材"],
    lowLevelEntry: "采矿、修复地脉节点、炼体试炼",
    longTermGoal: "提升炼体材料、防御法宝和镇塔承伤收益",
    towerEffect: "影响矿材、炼体材料和防御法宝产出",
    enemyId: "qiongqi",
    enemyName: "穷奇影",
    enemyPower: 690,
  },
  {
    provinceId: "yong",
    name: "雍州",
    theme: "古都州，圣迹残境",
    towerName: "太初塔",
    chapterRequired: 6,
    recommendedAction: "圣遗守护",
    resources: ["圣遗残卷", "太初石", "终局封印材料"],
    lowLevelEntry: "圣遗残页收集、遗迹巡守、终局封印补给",
    longTermGoal: "决定终局封印材料和魔王前置形态",
    towerEffect: "影响最终魔王形态、终局材料和圣遗事件",
    enemyId: "jiuying",
    enemyName: "九婴残首",
    enemyPower: 820,
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
