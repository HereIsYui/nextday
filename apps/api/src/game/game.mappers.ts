import type {
  ActionState,
  BattleSummary,
  CaveState,
  ProvinceSummary,
  RewardBundle,
  TaskState,
} from "@nextday/shared";
import type {
  BattleLog,
  PlayerActionState,
  PlayerCaveState,
  PlayerProvinceProgress,
  PlayerTaskState,
  ProvinceState,
} from "@prisma/client";
import { maxCaveCollectMinutes, provinceConfigs } from "./game.constants";

export function toActionState(state: PlayerActionState): ActionState {
  return {
    action_points: state.actionPoints,
    action_point_cap: state.actionPointCap,
    action_point_restore_per_hour: state.actionPointRestorePerHour,
    last_recovered_at: state.lastRecoveredAt.toISOString(),
  };
}

export function toProvinceSummary(input: {
  state: ProvinceState;
  progress: PlayerProvinceProgress;
  playerChapter: number;
}): ProvinceSummary {
  const config = provinceConfigs.find((item) => item.provinceId === input.state.provinceId);
  const unlocked =
    input.progress.unlocked &&
    input.state.unlocked &&
    input.playerChapter >= input.state.chapterRequired;

  return {
    province_id: input.state.provinceId,
    name: input.state.name,
    tower_name: input.state.towerName,
    chapter_required: input.state.chapterRequired,
    unlocked,
    recommended_action: config?.recommendedAction ?? "探索",
    tower_integrity: input.state.towerIntegrity,
    rift_pressure: input.state.riftPressure,
    corruption: input.state.corruption,
    spirit_vein_level: input.state.spiritVeinLevel,
    exploration_count: input.progress.explorationCount,
    best_explore_stage: input.progress.bestExploreStage,
  };
}

export function toTaskState(task: PlayerTaskState): TaskState {
  return {
    task_state_id: task.taskStateId,
    task_id: task.taskId,
    task_type: task.taskType as TaskState["task_type"],
    title: task.title,
    target_value: task.targetValue,
    progress_value: task.progressValue,
    status: task.status as TaskState["status"],
    reset_key: task.resetKey,
    rewards: normalizeRewardBundle(task.rewardSnapshot),
  };
}

export function toCaveState(cave: PlayerCaveState, now = new Date()): CaveState {
  const claimableMinutes = Math.min(
    maxCaveCollectMinutes,
    Math.max(0, Math.floor((now.getTime() - cave.lastCollectedAt.getTime()) / 60000)),
  );

  return {
    spirit_field_level: cave.spiritFieldLevel,
    spirit_array_level: cave.spiritArrayLevel,
    alchemy_room_level: cave.alchemyRoomLevel,
    refinery_room_level: cave.refineryRoomLevel,
    last_collected_at: cave.lastCollectedAt.toISOString(),
    claimable_minutes: claimableMinutes,
    preview_rewards: getCaveReward(cave, claimableMinutes),
  };
}

export function toBattleSummary(battle: BattleLog): BattleSummary {
  const battleLog = normalizeBattleLog(battle.battleLog);

  return {
    battle_id: battle.battleId,
    battle_type: battle.battleType,
    province_id: battle.provinceId ?? "",
    enemy_id: battle.enemyId,
    enemy_name: battle.enemyName,
    result: battle.result as BattleSummary["result"],
    rounds: battle.rounds,
    damage_done: battle.damageDone,
    damage_taken: battle.damageTaken,
    rewards: normalizeRewardBundle(battle.rewardSnapshot),
    log: battleLog,
    created_at: battle.createdAt.toISOString(),
  };
}

export function getCaveReward(cave: PlayerCaveState, minutes: number): RewardBundle {
  const spiritStone = BigInt(minutes * (cave.spiritFieldLevel * 2 + cave.spiritArrayLevel));
  const herbCount = Math.floor(minutes / 20) * cave.alchemyRoomLevel;
  const oreCount = Math.floor(minutes / 30) * cave.refineryRoomLevel;
  const items: RewardBundle["items"] = [];

  if (herbCount > 0) {
    items.push({ item_id: "low_herb", name: "凝露草", count: herbCount, bind_type: "bound" });
  }

  if (oreCount > 0) {
    items.push({ item_id: "raw_iron", name: "玄铁砂", count: oreCount, bind_type: "bound" });
  }

  return {
    spirit_stone: spiritStone.toString(),
    items,
  };
}

export function normalizeRewardBundle(value: unknown): RewardBundle {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    cultivation:
      typeof record.cultivation === "bigint"
        ? record.cultivation.toString()
        : typeof record.cultivation === "number"
          ? String(record.cultivation)
          : typeof record.cultivation === "string"
            ? record.cultivation
            : undefined,
    spirit_stone:
      typeof record.spirit_stone === "bigint"
        ? record.spirit_stone.toString()
        : typeof record.spirit_stone === "number"
          ? String(record.spirit_stone)
          : typeof record.spirit_stone === "string"
            ? record.spirit_stone
            : undefined,
    action_points: typeof record.action_points === "number" ? record.action_points : undefined,
    items: Array.isArray(record.items)
      ? record.items.map((item) => normalizeRewardItem(item)).filter((item) => item.count > 0)
      : undefined,
  };
}

function normalizeRewardItem(value: unknown): NonNullable<RewardBundle["items"]>[number] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const itemId = typeof record.item_id === "string" ? record.item_id : "unknown_item";

  return {
    item_id: itemId,
    name: typeof record.name === "string" ? record.name : getItemName(itemId),
    count: typeof record.count === "number" ? record.count : Number(record.count ?? 0),
    bind_type: typeof record.bind_type === "string" ? record.bind_type : "bound",
  };
}

function normalizeBattleLog(value: unknown): BattleSummary["log"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};

    return {
      round: Number(record.round ?? 0),
      actor: String(record.actor ?? ""),
      skill: String(record.skill ?? ""),
      damage: Number(record.damage ?? 0),
      target_hp: Number(record.target_hp ?? 0),
    };
  });
}

function getItemName(itemId: string): string {
  if (itemId === "low_herb") {
    return "凝露草";
  }

  if (itemId === "raw_iron") {
    return "玄铁砂";
  }

  return itemId;
}
