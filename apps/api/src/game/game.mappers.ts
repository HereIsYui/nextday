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
import {
  type ExploreLootConfig,
  buildExploreBattleHint,
  getExploreEnemyTraits,
  getExploreLootConfig,
  getExploreLootHint,
  maxCaveCollectMinutes,
  provinceConfigs,
} from "./game.constants";

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
    theme: config?.theme ?? "九州州域",
    tower_name: input.state.towerName,
    chapter_required: input.state.chapterRequired,
    unlocked,
    recommended_action: config?.recommendedAction ?? "探索",
    resources: config?.resources ?? [],
    low_level_entry: config?.lowLevelEntry ?? "州域异步行动",
    long_term_goal: config?.longTermGoal ?? "推进九州长期状态",
    tower_effect: config?.towerEffect ?? "影响本州资源和全服局势",
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
  const rewards = normalizeRewardBundle(battle.rewardSnapshot);
  const enemyTraits = getExploreEnemyTraits(battle.enemyId);
  const lootHighlights = buildLootHighlights(battle.provinceId ?? "", rewards);
  const battleHint =
    battle.battleType === "explore"
      ? buildExploreBattleHint({
          enemyName: battle.enemyName,
          enemyTraits,
          loot: firstLootFromRewards(battle.provinceId ?? "", rewards),
          result: battle.result as BattleSummary["result"],
        })
      : undefined;

  return {
    battle_id: battle.battleId,
    battle_type: battle.battleType,
    province_id: battle.provinceId ?? "",
    enemy_id: battle.enemyId,
    enemy_name: battle.enemyName,
    enemy_traits: enemyTraits,
    result: battle.result as BattleSummary["result"],
    rounds: battle.rounds,
    damage_done: battle.damageDone,
    damage_taken: battle.damageTaken,
    rewards,
    log: battleLog,
    reason_summary: buildBattleReasonSummary({
      damageDone: battle.damageDone,
      damageTaken: battle.damageTaken,
      enemyTraits,
      lootHighlights,
      result: battle.result,
      rounds: battle.rounds,
      log: battleLog,
    }),
    counter_suggestions: buildBattleCounterSuggestions(enemyTraits),
    loot_highlights: lootHighlights,
    battle_hint: battleHint,
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

function buildBattleReasonSummary(input: {
  result: string;
  rounds: number;
  damageDone: number;
  damageTaken: number;
  log: BattleSummary["log"];
  enemyTraits?: string[];
  lootHighlights?: string[];
}): string[] {
  const playerRounds = input.log.filter((item) => item.actor && item.damage > 0);
  const skillNames = uniqueStrings(
    playerRounds
      .map((item) => item.skill)
      .filter((skill) => skill && skill !== "山海妖息")
      .slice(0, 3),
  );
  const reasons: string[] = [];

  reasons.push(
    input.result === "win"
      ? `胜在总伤害 ${input.damageDone} 压过敌方承受线。`
      : `失利主因是总伤害 ${input.damageDone} 未能压过敌方强度。`,
  );
  reasons.push(
    input.damageTaken <= 80
      ? `承伤 ${input.damageTaken}，当前防护足以支撑自动战斗。`
      : `承伤 ${input.damageTaken} 偏高，建议提升境界、法宝或防御技能。`,
  );

  if (skillNames.length) {
    reasons.push(`本场触发 ${skillNames.join("、")}，可在技能预设中调整优先级。`);
  }

  if (input.enemyTraits?.length) {
    reasons.push(`敌方特性为${input.enemyTraits.join("、")}，可据此调整技能或服丹。`);
  }

  if (input.lootHighlights?.length) {
    reasons.push(`材料线索：${input.lootHighlights[0]}`);
  }

  if (input.rounds >= 3) {
    reasons.push("战斗进入三回合以上，下一步可通过服丹或炼器缩短回合。");
  }

  return reasons.slice(0, 4);
}

function buildBattleCounterSuggestions(enemyTraits: string[] = []): string[] {
  const suggestions: string[] = [];
  if (enemyTraits.includes("高防") || enemyTraits.includes("护盾")) {
    suggestions.push("敌方防护偏厚，优先学习或前置破阵类技能，并考虑炼器补输出词条。");
  }
  if (enemyTraits.includes("灵敏") || enemyTraits.includes("快攻")) {
    suggestions.push("敌方出手较快，可把防护技能提前，或炼器补速度 / 防御词条。");
  }
  if (enemyTraits.includes("毒蚀")) {
    suggestions.push("敌方持续压血明显，服丹提升修为后再探索更稳。");
  }
  if (enemyTraits.includes("阵痕") || enemyTraits.includes("术法")) {
    suggestions.push("敌方带阵法或术法特性，可尝试本命法光前置并学习对应克制技能。");
  }

  return suggestions.length ? suggestions.slice(0, 3) : ["保持当前自动预设，继续观察后续战报。"];
}

function buildLootHighlights(provinceId: string, rewards: RewardBundle): string[] {
  return (rewards.items ?? [])
    .map((item) => getExploreLootHint(provinceId, item.item_id) ?? `${item.name} x${item.count}`)
    .slice(0, 3);
}

function firstLootFromRewards(
  provinceId: string,
  rewards: RewardBundle,
): ExploreLootConfig | undefined {
  const item = rewards.items?.[0];
  if (!item) {
    return undefined;
  }

  return (
    getExploreLootConfig(provinceId, item.item_id) ?? {
      itemId: item.item_id,
      name: item.name,
      sourceHint: "本次探索",
      usageHint: "后续生产和成长",
    }
  );
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}
