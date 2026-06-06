import type { RankType, RewardBundle, SectAlignment, TowerActionType } from "@nextday/shared";

export const multiplayerConfigVersion = "m4_multiplayer_v1";
export const multiplayerRewardConfigVersion = "reward_m4_v1";

export interface TowerConfig {
  towerId: string;
  provinceId: string;
  towerName: string;
}

export const towerConfigs: TowerConfig[] = [
  { towerId: "tower_xuantie", provinceId: "ji", towerName: "玄铁塔" },
  { towerId: "tower_lifa", provinceId: "yan", towerName: "礼法塔" },
  { towerId: "tower_chaosheng", provinceId: "qing", towerName: "潮生塔" },
  { towerId: "tower_geyang", provinceId: "xu", towerName: "戈阳塔" },
];

export interface TowerActionConfig {
  actionType: TowerActionType;
  contribution: number;
  actionPointCost: number;
  reward: RewardBundle;
}

export const towerActionConfigs: Record<TowerActionType, TowerActionConfig> = {
  seal: {
    actionType: "seal",
    contribution: 24,
    actionPointCost: 2,
    reward: {
      spirit_stone: "30",
      items: [{ item_id: "tower_sigil", name: "镇塔符", count: 1, bind_type: "bound" }],
    },
  },
  break: {
    actionType: "break",
    contribution: 24,
    actionPointCost: 2,
    reward: {
      spirit_stone: "30",
      items: [{ item_id: "demon_crystal", name: "九渊残晶", count: 1, bind_type: "bound" }],
    },
  },
  supply: {
    actionType: "supply",
    contribution: 18,
    actionPointCost: 1,
    reward: {
      spirit_stone: "20",
      items: [{ item_id: "array_sand", name: "阵砂", count: 1, bind_type: "bound" }],
    },
  },
  guard: {
    actionType: "guard",
    contribution: 20,
    actionPointCost: 2,
    reward: {
      spirit_stone: "24",
      items: [{ item_id: "battle_mark", name: "战备符", count: 1, bind_type: "bound" }],
    },
  },
};

export const maxTowerActionBatch = 5;

export const bossConfig = {
  bossId: "boss_liezhen_zhuhai",
  name: "礼冢诸怀",
  totalHp: 5000,
  actionPointCost: 3,
  reward: {
    spirit_stone: "80",
    items: [{ item_id: "artifact_soul", name: "器魂", count: 1, bind_type: "bound" }],
  },
};

export const sectCreateCost = 300n;
export const sectTaskConfigs = [
  {
    taskId: "sect_patrol",
    name: "灵脉巡护",
    contribution: 40,
    fundGain: 80n,
    reward: { spirit_stone: "60" },
  },
  {
    taskId: "sect_tower_supply",
    name: "九塔补给",
    contribution: 50,
    fundGain: 100n,
    reward: {
      spirit_stone: "70",
      items: [{ item_id: "tower_sigil", name: "镇塔符", count: 1, bind_type: "bound" }],
    },
  },
];

export const validSectAlignments: SectAlignment[] = ["immortal", "demon", "neutral"];
export const sectWarehouseWhitelist = new Set([
  "low_herb",
  "raw_iron",
  "pill_dust",
  "artifact_soul",
  "array_sand",
]);

export const resourcePointConfigs = [
  { resourcePointId: "resource_ji_mine", provinceId: "ji", name: "冀州玄铁脉" },
  { resourcePointId: "resource_yan_array", provinceId: "yan", name: "兖州礼阵台" },
  { resourcePointId: "resource_qing_tide", provinceId: "qing", name: "青州潮汐渡" },
  { resourcePointId: "resource_xu_front", provinceId: "xu", name: "徐州戈阳关" },
];

export const pvpActionPointCost = 2;
export const rankRewardPreview: Record<RankType, RewardBundle> = {
  personal: {
    spirit_stone: "300",
    items: [{ item_id: "tower_sigil", name: "镇塔符", count: 2, bind_type: "bound" }],
  },
  sect: {
    spirit_stone: "500",
    items: [{ item_id: "array_sand", name: "阵砂", count: 3, bind_type: "bound" }],
  },
  pvp_week: {
    spirit_stone: "300",
    items: [{ item_id: "battle_mark", name: "战备符", count: 2, bind_type: "bound" }],
  },
  tower_week: {
    spirit_stone: "300",
    items: [{ item_id: "tower_sigil", name: "镇塔符", count: 2, bind_type: "bound" }],
  },
};

export function getCurrentWeekKey(date = new Date()): string {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.floor((dayOffset + firstDay.getUTCDay()) / 7) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
