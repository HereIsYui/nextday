import type {
  BattleRoundLog,
  BattleSummary,
  CaveState,
  EquipmentOperationResponse,
  EquipmentState,
  ExperiencePayload,
  GachaCostType,
  GachaPoolType,
  GachaResultState,
  RewardBundle,
  RiskStatus,
  SectWarehouseItemState,
  SettlementStatus,
  TowerActionType,
  TowerStateSummary,
  WorldBossStateSummary,
} from "@nextday/shared";

export function buildExploreExperience(input: {
  provinceName: string;
  count: number;
  battles: BattleSummary[];
  rewards: RewardBundle;
  actionPointsAfter: number;
  completedTaskCount: number;
}): ExperiencePayload {
  const timeline: ExperiencePayload["timeline"] = input.battles
    .slice(0, 3)
    .map((battle, index) => ({
      step: index + 1,
      title: `${battle.enemy_name} · ${battle.result === "win" ? "胜" : "败"}`,
      description: battle.battle_hint
        ? battle.battle_hint
        : battle.reason_summary?.length
          ? `${battle.rounds} 回合，${battle.reason_summary.slice(0, 2).join(" ")}`
          : battle.log.length > 0
            ? `${battle.rounds} 回合，${formatBattleLog(battle.log)}`
            : `${battle.rounds} 回合，造成 ${battle.damage_done}，承受 ${battle.damage_taken}`,
      tone: battle.result === "win" ? ("success" as const) : ("warning" as const),
    }));

  if (input.battles.length > timeline.length) {
    timeline.push({
      step: timeline.length + 1,
      title: "余下战斗",
      description: `其余 ${input.battles.length - timeline.length} 场已自动结算，可在战报页查看。`,
      tone: "neutral",
    });
  }

  timeline.push({
    step: timeline.length + 1,
    title: "奖励入账",
    description: formatRewards(input.rewards),
    tone: "success",
  });

  return {
    title: `${input.provinceName}探索回放`,
    summary: `完成 ${input.count} 次探索，行动令剩余 ${input.actionPointsAfter}。`,
    timeline,
    delta_summary: [
      { label: "探索次数", delta: `+${input.count}`, tone: "success" },
      { label: "行动令", after: input.actionPointsAfter, tone: "neutral" },
      { label: "任务推进", delta: `+${input.completedTaskCount}`, tone: "success" },
      rewardDelta(input.rewards),
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "查看战报",
        reason: "可从最近战报确认技能释放、伤害和胜负原因。",
        action_hint: "battle",
        priority: "medium",
      },
      {
        label: "继续州域游历",
        reason: "州域探索次数会影响后续开放和推荐行动。",
        action_hint: "explore",
        priority: "low",
      },
    ],
    reason_tags: [
      {
        code: "auto_battle",
        label: "自动战斗",
        description: "本次仍由服务端按技能优先级结算，前端只展示过程。",
        tone: "neutral",
      },
      {
        code: "reward_unchanged",
        label: "奖励未加成",
        description: "P1 展示反馈不改变掉落、修为或贡献公式。",
        tone: "neutral",
      },
    ],
  };
}

export function buildCaveCollectExperience(input: {
  collectedMinutes: number;
  cave: CaveState;
  rewards: RewardBundle;
}): ExperiencePayload {
  return {
    title: "洞府收取回放",
    summary: `收取 ${input.collectedMinutes} 分钟洞府产出，灵田与炼器室状态已刷新。`,
    timeline: [
      {
        step: 1,
        title: "聚灵阵结算",
        description: `按 ${input.collectedMinutes} 分钟离线产出计算，本次不要求固定时间在线。`,
        tone: "neutral",
      },
      {
        step: 2,
        title: "材料入库",
        description: formatRewards(input.rewards),
        tone: "success",
      },
      {
        step: 3,
        title: "洞府状态更新",
        description: `灵田 ${input.cave.spirit_field_level} 级，丹炉 ${input.cave.alchemy_room_level} 级，炼器室 ${input.cave.refinery_room_level} 级。`,
        tone: "neutral",
      },
    ],
    delta_summary: [
      { label: "收取时长", delta: `${input.collectedMinutes} 分钟`, tone: "success" },
      rewardDelta(input.rewards),
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "炼丹或炼器",
        reason: "洞府产出的凝露草与玄铁砂可继续转化为丹药和法宝。",
        action_hint: "growth",
        priority: "medium",
      },
    ],
    reason_tags: [
      {
        code: "async_collect",
        label: "异步收取",
        description: "离线收益由服务端按上限结算，错过时间点不会丢失已累计收益。",
        tone: "neutral",
      },
    ],
  };
}

export function buildAlchemyExperience(input: {
  recipeName: string;
  success: boolean;
  quality: string | null;
  rewards: RewardBundle;
  failureReturns: RewardBundle | null;
  configVersion: string;
}): ExperiencePayload {
  return {
    title: "炼丹回放",
    summary: input.success
      ? `${input.recipeName}炼制成功，品质为${pillQualityLabel(input.quality)}。`
      : `${input.recipeName}炼制失败，已按规则返还部分材料。`,
    timeline: [
      {
        step: 1,
        title: "投入丹方材料",
        description: `使用 ${input.configVersion} 配置结算丹方成功率和品质。`,
        tone: "neutral",
      },
      {
        step: 2,
        title: input.success ? "丹成入匣" : "炉火失衡",
        description: input.success
          ? `产出 ${pillQualityLabel(input.quality)}丹药：${formatRewards(input.rewards)}`
          : `失败返还：${formatRewards(input.failureReturns ?? {})}`,
        tone: input.success ? "success" : "warning",
      },
    ],
    delta_summary: [
      {
        label: "炼制结果",
        after: input.success ? "成功" : "失败返还",
        tone: input.success ? "success" : "warning",
      },
      { label: "丹药品质", after: pillQualityLabel(input.quality), tone: "neutral" },
      rewardDelta(input.rewards),
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "查看背包丹药",
        reason: "服丹会按同类同阶次数递减，需要确认当前最适合服用的丹药。",
        action_hint: "growth",
        priority: "medium",
      },
    ],
    reason_tags: [
      {
        code: "server_roll",
        label: "服务端掷骰",
        description: "成功率和品质由服务端幂等结算，重复提交不会重复产出。",
        tone: "neutral",
      },
    ],
  };
}

export function buildEquipmentExperience(input: {
  operationType: EquipmentOperationResponse["operation_type"];
  equipment: EquipmentState | null;
  materials?: RewardBundle;
  rewards?: RewardBundle;
}): ExperiencePayload {
  const operationLabel = equipmentOperationLabel(input.operationType);
  return {
    title: `${operationLabel}回放`,
    summary: input.equipment
      ? `${operationLabel}完成：${input.equipment.name}，${equipmentRarityLabel(input.equipment.rarity)}。`
      : `${operationLabel}完成，法宝已转化为材料。`,
    timeline: [
      {
        step: 1,
        title: `${operationLabel}材料确认`,
        description: input.materials
          ? `消耗 ${formatRewards(input.materials)}`
          : "按当前法宝状态结算。",
        tone: "neutral",
      },
      {
        step: 2,
        title: input.equipment ? "法宝状态更新" : "分解材料入库",
        description: input.equipment
          ? formatEquipment(input.equipment)
          : formatRewards(input.rewards ?? {}),
        tone: "success",
      },
    ],
    delta_summary: [
      { label: "操作", after: operationLabel, tone: "neutral" },
      {
        label: "法宝",
        after: input.equipment ? input.equipment.name : "已分解",
        tone: input.equipment ? "success" : "warning",
      },
      input.rewards ? rewardDelta(input.rewards) : null,
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "查看词条",
        reason: "主词条、副词条和隐藏词条会影响自动战斗表现。",
        action_hint: "growth",
        priority: "medium",
      },
    ],
    reason_tags: [
      {
        code: "no_ancient_treasure",
        label: "不产出九大古宝",
        description: "炼器只产出普通法宝、仙品法宝或古器材料，九大古宝仅走专属池。",
        tone: "neutral",
      },
    ],
  };
}

export function buildTowerExperience(input: {
  towerBefore: TowerStateSummary;
  towerAfter: TowerStateSummary;
  actionType: TowerActionType;
  count: number;
  contribution: number;
  rewards: RewardBundle;
  riskStatus?: RiskStatus;
  settlementStatus: SettlementStatus;
}): ExperiencePayload {
  const riskTag = riskReasonTag(input.riskStatus, input.settlementStatus);
  return {
    title: `${input.towerAfter.tower_name}提交回放`,
    summary: `${towerActionLabel(input.actionType)} ${input.count} 次，个人贡献 +${input.contribution}。`,
    timeline: [
      {
        step: 1,
        title: "提交前塔势",
        description: `完整度 ${input.towerBefore.integrity}，镇封 ${input.towerBefore.seal_progress}，破封 ${input.towerBefore.break_progress}。`,
        tone: "neutral",
      },
      {
        step: 2,
        title: "行动结算",
        description: `${towerActionLabel(input.actionType)}贡献 +${input.contribution}，${settlementLabel(input.settlementStatus)}。`,
        tone: input.settlementStatus === "settled" ? "success" : "warning",
      },
      {
        step: 3,
        title: "提交后塔势",
        description: `完整度 ${input.towerAfter.integrity}，镇封 ${input.towerAfter.seal_progress}，魔染 ${input.towerAfter.corruption}。`,
        tone: "neutral",
      },
    ],
    delta_summary: [
      {
        label: "镇封",
        before: input.towerBefore.seal_progress,
        after: input.towerAfter.seal_progress,
        delta: input.towerAfter.seal_progress - input.towerBefore.seal_progress,
        tone: "success",
      },
      { label: "贡献", delta: `+${input.contribution}`, tone: "success" },
      rewardDelta(input.rewards),
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "查看九塔周榜",
        reason: "九塔贡献会进入周期结算，不要求结算时在线。",
        action_hint: "multiplayer",
        priority: "low",
      },
    ],
    reason_tags: [
      riskTag,
      {
        code: "async_tower",
        label: "异步提交",
        description: "九塔按行动令和贡献池推进，不需要固定时间蹲点。",
        tone: "neutral",
      },
    ],
  };
}

export function buildBossExperience(input: {
  bossBefore: WorldBossStateSummary;
  bossAfter: WorldBossStateSummary;
  damageDone: number;
  contribution: number;
  result: "active" | "phase_defeated";
  rewards: RewardBundle;
  log: BattleRoundLog[];
}): ExperiencePayload {
  return {
    title: `${input.bossAfter.name}挑战回放`,
    summary:
      input.result === "phase_defeated"
        ? `造成 ${input.damageDone} 伤害，阶段血量已击破。`
        : `造成 ${input.damageDone} 伤害，阶段血量继续汇总。`,
    timeline: [
      {
        step: 1,
        title: "镜像 Boss 开战",
        description: `挑战前阶段 ${input.bossBefore.phase}，血量 ${input.bossBefore.remaining_hp}/${input.bossBefore.total_hp}。`,
        tone: "neutral",
      },
      {
        step: 2,
        title: "战斗过程",
        description: formatBattleLog(input.log),
        tone: "success",
      },
      {
        step: 3,
        title: input.result === "phase_defeated" ? "阶段击破" : "血量汇总",
        description: `挑战后阶段 ${input.bossAfter.phase}，血量 ${input.bossAfter.remaining_hp}/${input.bossAfter.total_hp}。`,
        tone: input.result === "phase_defeated" ? "success" : "neutral",
      },
    ],
    delta_summary: [
      { label: "伤害", delta: `+${input.damageDone}`, tone: "success" },
      { label: "贡献", delta: `+${input.contribution}`, tone: "success" },
      rewardDelta(input.rewards),
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "继续九塔或 Boss",
        reason: "公共 Boss 和九塔都使用异步贡献池，适合用剩余行动令推进。",
        action_hint: "multiplayer",
        priority: "medium",
      },
    ],
    reason_tags: [
      {
        code: "mirror_boss",
        label: "镜像挑战",
        description: "玩家随时挑战镜像 Boss，伤害汇总到全服阶段血量池。",
        tone: "neutral",
      },
    ],
  };
}

export function buildSectTaskExperience(input: {
  sectName: string;
  contribution: number;
  rewards: RewardBundle;
}): ExperiencePayload {
  return {
    title: "宗门任务回放",
    summary: `${input.sectName} 建设贡献 +${input.contribution}。`,
    timeline: [
      {
        step: 1,
        title: "宗门巡守",
        description: "按职位和任务配置完成一次宗门建设行动。",
        tone: "neutral",
      },
      {
        step: 2,
        title: "贡献入账",
        description: `宗门贡献 +${input.contribution}，个人奖励 ${formatRewards(input.rewards)}。`,
        tone: "success",
      },
    ],
    delta_summary: [
      { label: "宗门贡献", delta: `+${input.contribution}`, tone: "success" },
      rewardDelta(input.rewards),
    ].filter(Boolean) as ExperiencePayload["delta_summary"],
    next_recommendations: [
      {
        label: "查看宗门仓库",
        reason: "宗门仓库只允许白名单非绑定材料流通，适合检查建设材料。",
        action_hint: "multiplayer",
        priority: "low",
      },
    ],
    reason_tags: [
      {
        code: "sect_async",
        label: "异步宗门行动",
        description: "宗门建设按行动和贡献记录推进，不要求成员同时在线。",
        tone: "neutral",
      },
    ],
  };
}

export function buildSectWarehouseExperience(input: {
  operationType: "deposit" | "withdraw";
  sectName: string;
  itemName: string;
  count: number;
  beforeCount: string;
  afterCount: string;
  warehouse: SectWarehouseItemState[];
}): ExperiencePayload {
  const operationLabel = input.operationType === "deposit" ? "入库" : "取用";
  const flowText =
    input.operationType === "deposit"
      ? `${input.itemName} x${input.count} 从个人背包转入宗门仓库。`
      : `${input.itemName} x${input.count} 从宗门仓库转入个人背包。`;

  return {
    title: "宗门仓库流转回放",
    summary: `${input.sectName} 仓库${operationLabel}：${input.itemName} x${input.count}。`,
    timeline: [
      {
        step: 1,
        title: "白名单与绑定状态校验",
        description:
          input.operationType === "deposit"
            ? "仅允许未绑定、未锁定、非付费来源的白名单材料入库。"
            : "按宗门仓库库存与职位权限边界执行取用。",
        tone: "neutral",
      },
      {
        step: 2,
        title: `仓库${operationLabel}`,
        description: flowText,
        tone: "success",
      },
      {
        step: 3,
        title: "流转后库存",
        description: `${input.itemName} 库存 ${input.beforeCount} → ${input.afterCount}，当前仓库共 ${input.warehouse.length} 类物品。`,
        tone: "neutral",
      },
    ],
    delta_summary: [
      { label: "操作", after: operationLabel, tone: "neutral" },
      { label: "物品", after: `${input.itemName} x${input.count}`, tone: "success" },
      { label: "库存", before: input.beforeCount, after: input.afterCount, tone: "neutral" },
    ],
    next_recommendations: [
      {
        label: "查看宗门仓库",
        reason: "仓库流转有审计日志，适合确认材料是否进入白名单循环。",
        action_hint: "multiplayer",
        priority: "medium",
      },
    ],
    reason_tags: [
      {
        code: "warehouse_whitelist",
        label: "白名单流通",
        description: "仓库只流通非绑定普通材料，付费、限定和高阶终局材料不能进入仓库。",
        tone: "neutral",
      },
      {
        code: "warehouse_audit",
        label: "仓库日志",
        description: "入库、取用都会记录玩家、物品、数量、前后库存和幂等键。",
        tone: "success",
      },
    ],
  };
}

export function buildGachaExperience(input: {
  poolType: GachaPoolType;
  costType: GachaCostType;
  result: GachaResultState;
  pityBefore: number;
  pityAfter: number;
}): ExperiencePayload {
  return {
    title: `${gachaPoolLabel(input.poolType)}抽取回放`,
    summary: `获得 ${input.result.result_name}${
      input.result.duplicate ? "，重复转化已入账" : ""
    }。`,
    timeline: [
      {
        step: 1,
        title: "消耗来源确认",
        description: gachaCostDescription(input.poolType, input.costType),
        tone: "neutral",
      },
      {
        step: 2,
        title: "结果揭示",
        description: input.result.duplicate
          ? `${input.result.result_name}重复，转化为 ${formatRewards(input.result.conversion ?? {})}`
          : `获得 ${input.result.result_name}`,
        tone: "success",
      },
      {
        step: 3,
        title: "保底进度",
        description: `抽前 ${input.pityBefore}，抽后 ${input.pityAfter}。`,
        tone: "neutral",
      },
    ],
    delta_summary: [
      { label: "保底", before: input.pityBefore, after: input.pityAfter, tone: "neutral" },
      {
        label: "结果",
        after: input.result.duplicate ? "重复转化" : "新增获得",
        tone: "success",
      },
    ],
    next_recommendations: [
      {
        label: input.poolType === "ancient_treasure" ? "查看古宝图鉴" : "查看背包",
        reason:
          input.poolType === "ancient_treasure"
            ? "九大古宝只走月卡赠抽或残页合成，星级和主动日课需要单独查看。"
            : "常驻机缘结果进入背包，可继续用于生产或养成。",
        action_hint: "market",
        priority: "medium",
      },
    ],
    reason_tags: [
      {
        code: input.poolType === "ancient_treasure" ? "ancient_cost_limited" : "permanent_pool",
        label: input.poolType === "ancient_treasure" ? "古宝入口受限" : "常驻机缘",
        description:
          input.poolType === "ancient_treasure"
            ? "当前不能用仙玉直抽九大古宝，只能使用月卡赠抽或残页合成。"
            : "常驻机缘池不产出九大古宝。",
        tone: "neutral",
      },
    ],
  };
}

function rewardDelta(rewards: RewardBundle): ExperiencePayload["delta_summary"][number] | null {
  const text = formatRewards(rewards);
  return text === "无额外奖励" ? null : { label: "奖励", delta: text, tone: "success" };
}

function formatRewards(rewards: RewardBundle): string {
  const parts: string[] = [];
  if (Number(rewards.cultivation ?? 0) > 0) {
    parts.push(`修为 ${rewards.cultivation}`);
  }
  if (Number(rewards.spirit_stone ?? 0) > 0) {
    parts.push(`灵石 ${rewards.spirit_stone}`);
  }
  if (Number(rewards.jade_paid ?? 0) > 0) {
    parts.push(`仙玉 ${rewards.jade_paid}`);
  }
  if (Number(rewards.jade_bound ?? 0) > 0) {
    parts.push(`绑定仙玉 ${rewards.jade_bound}`);
  }
  if (typeof rewards.action_points === "number" && rewards.action_points > 0) {
    parts.push(`行动令 ${rewards.action_points}`);
  }
  for (const item of mergeRewardItems(rewards.items ?? [])) {
    if (item.count > 0) {
      parts.push(`${item.name} x${item.count}`);
    }
  }

  return parts.length > 0 ? parts.join("，") : "无额外奖励";
}

function formatBattleLog(log: BattleRoundLog[]): string {
  const entries = log
    .slice(0, 3)
    .map((item) => `${item.actor}施放${item.skill}，造成 ${item.damage}`);
  if (log.length > entries.length) {
    entries.push(`余下 ${log.length - entries.length} 条记录可在战报查看`);
  }

  return entries.length > 0 ? entries.join("；") : "本场无详细日志";
}

function mergeRewardItems(items: NonNullable<RewardBundle["items"]>) {
  const merged = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const key = item.item_id ?? item.name;
    const current = merged.get(key);
    if (current) {
      current.count += item.count;
      continue;
    }
    merged.set(key, { name: item.name, count: item.count });
  }

  return Array.from(merged.values());
}

function formatEquipment(equipment: EquipmentState): string {
  const affixText = equipment.affixes
    .slice(0, 3)
    .map((affix) => `${affix.name}+${affix.value}`)
    .join("，");
  return `${equipment.name}，${equipmentRarityLabel(equipment.rarity)}，词条：${
    affixText || "暂无"
  }。`;
}

function pillQualityLabel(quality: string | null): string {
  const labels: Record<string, string> = {
    low: "下品",
    middle: "中品",
    high: "上品",
    best: "极品",
    flawless: "无瑕",
  };
  return quality ? (labels[quality] ?? quality) : "无";
}

function equipmentRarityLabel(rarity: string): string {
  const labels: Record<string, string> = {
    ordinary: "凡品",
    earth: "地品",
    heaven: "天品",
    immortal: "仙品",
    ancient_craft: "古器胚",
  };
  return labels[rarity] ?? rarity;
}

function equipmentOperationLabel(operationType: EquipmentOperationResponse["operation_type"]) {
  const labels: Record<EquipmentOperationResponse["operation_type"], string> = {
    forge: "炼器",
    refine: "淬炼",
    inscribe: "铭刻",
    decompose: "分解",
    lock: "锁定",
  };
  return labels[operationType];
}

function towerActionLabel(actionType: TowerActionType): string {
  const labels: Record<TowerActionType, string> = {
    seal: "镇封",
    break: "破封",
    supply: "补给",
    guard: "驻守",
  };
  return labels[actionType];
}

function settlementLabel(status: SettlementStatus): string {
  const labels: Record<SettlementStatus, string> = {
    settled: "已即时结算",
    delayed: "进入延迟结算池",
    rejected: "已拒绝结算",
  };
  return labels[status];
}

function riskReasonTag(
  riskStatus: RiskStatus | undefined,
  settlementStatus: SettlementStatus,
): ExperiencePayload["reason_tags"][number] {
  if (settlementStatus === "delayed") {
    return {
      code: "delayed_settlement",
      label: "延迟结算",
      description: "高影响玩法命中风控后会先进入审核池，避免脚本放大全服影响。",
      tone: "warning",
    };
  }

  if (riskStatus === "decayed") {
    return {
      code: "decayed",
      label: "收益衰减",
      description: "重复目标、境界压制或低价值重复提交会降低收益。",
      tone: "warning",
    };
  }

  return {
    code: "risk_normal",
    label: "风控正常",
    description: "本次行为未触发延迟结算或人工审核。",
    tone: "success",
  };
}

function gachaPoolLabel(poolType: GachaPoolType): string {
  return poolType === "ancient_treasure" ? "九大古宝" : "常驻机缘";
}

function gachaCostDescription(poolType: GachaPoolType, costType: GachaCostType): string {
  if (poolType === "ancient_treasure") {
    return costType === "monthly_grant"
      ? "使用当日月卡赠抽，不跨日累计。"
      : "使用九大古宝残页合成抽取次数。";
  }

  return costType === "paid_jade" ? "使用仙玉抽取常驻机缘。" : "使用绑定仙玉抽取常驻机缘。";
}
