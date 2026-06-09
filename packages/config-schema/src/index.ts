export interface ConfigEnvelope<TConfig = unknown> {
  config_type: string;
  config_version: string;
  ruleset_version?: string;
  reward_config_version?: string;
  payload: TConfig;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export type P1SimulationProfileId =
  | "novice_free"
  | "casual_free"
  | "standard_free"
  | "hardcore_free"
  | "small_monthly"
  | "large_monthly"
  | "vip3"
  | "vip4"
  | "whale_light"
  | "whale_hardcore";

export type P1RiskSeverity = "info" | "warning" | "critical";

export interface P1RealmTarget {
  realm_name: string;
  cultivation_required: number;
}

export interface P1SimulationProfile {
  profile_id: P1SimulationProfileId;
  label: string;
  active_minutes_per_day: number;
  daily_completion_rate: number;
  daily_action_count: number;
  daily_cultivation_gain: number;
  daily_spirit_stone_income: number;
  daily_spirit_stone_sink: number;
  daily_material_income: number;
  daily_material_sink: number;
  daily_tower_contribution: number;
  daily_pvp_score: number;
  pve_efficiency_bonus: number;
  pvp_effective_strength_bonus: number;
  ancient_treasure_daily_draws: number;
  ancient_page_daily_gain: number;
  monthly_point_cost: number;
  era_point_budget: number;
}

export interface P1SimulationRiskThresholds {
  max_pvp_strength_bonus: number;
  spirit_inflation_net_ratio: number;
  material_shortage_ratio: number;
  material_surplus_ratio: number;
  min_era_finish_day: number;
  max_era_finish_day: number;
  max_npc_contribution_ratio: number;
}

export interface P1SimulationServerProgress {
  target_contribution: number;
  large_server_diminishing_exponent: number;
  npc_daily_contribution_floor: number;
  npc_small_server_bonus: number;
}

export type P1DropMaterialCategory = "alchemy" | "forge" | "common" | "tower";

export interface P1DropMaterialFlowConfig {
  material_id: string;
  name: string;
  category: P1DropMaterialCategory;
  daily_base_income: number;
  daily_base_sink: number;
  novice_required: number;
  min_day7_balance: number;
  max_day7_balance: number;
  adjustment_step: number;
}

export interface P1ActionTokenTuningConfig {
  daily_recovery: number;
  novice_30m_required: number;
  day7_core_required: number;
  max_core_minutes_per_day: number;
  minutes_per_action: number;
}

export interface P1BalanceTuningThresholds {
  max_monthly_day7_cultivation_gap: number;
  max_vip_day7_cultivation_gap: number;
  max_whale_day7_cultivation_gap: number;
  max_day7_realm_target_ratio: number;
  min_material_day7_balance: number;
  max_material_day7_balance: number;
  max_action_token_pressure: number;
}

export interface P1DropTuningConfig {
  tuning_id: string;
  config_version: string;
  day_range: number;
  required_profile_ids: P1SimulationProfileId[];
  material_flows: P1DropMaterialFlowConfig[];
  action_token: P1ActionTokenTuningConfig;
  thresholds: P1BalanceTuningThresholds;
}

export interface P1SimulationConfig {
  config_type: "simulation";
  config_version: string;
  ruleset_version: string;
  era_days: number;
  report_days: number[];
  active_player_counts: number[];
  realm_targets: P1RealmTarget[];
  profiles: P1SimulationProfile[];
  server_progress: P1SimulationServerProgress;
  risk_thresholds: P1SimulationRiskThresholds;
  drop_tuning?: P1DropTuningConfig;
}

export interface P1ProfileSimulationReport {
  profile_id: P1SimulationProfileId;
  label: string;
  active_minutes_per_day: number;
  final_cultivation: number;
  final_realm: string;
  spirit_stone_balance: number;
  material_balance: number;
  ancient_treasure_draws: number;
  ancient_treasure_pity_cycles: number;
  limited_gacha_draw_budget: number;
  pvp_effective_strength_bonus: number;
  day_reports: Array<{
    day: number;
    cultivation: number;
    realm: string;
    spirit_stone_balance: number;
    material_balance: number;
  }>;
}

export interface P1ServerSimulationReport {
  active_players: number;
  estimated_finish_day: number;
  player_contribution_ratio: number;
  npc_contribution_ratio: number;
  daily_player_contribution: number;
  daily_npc_contribution: number;
}

export interface P1SimulationWarning {
  code: string;
  severity: P1RiskSeverity;
  message: string;
  suggestion: string;
  subject: string;
  value: number;
  threshold: number;
}

export interface P1FirstSevenDayMaterialReport {
  material_id: string;
  name: string;
  category: P1DropMaterialCategory;
  day7_balance: number;
  min_day7_balance: number;
  max_day7_balance: number;
  status: "balanced" | "shortage" | "surplus";
  adjustment_suggestion: string;
}

export interface P1FirstSevenDayProfileReport {
  profile_id: P1SimulationProfileId;
  label: string;
  active_minutes_per_day: number;
  day7_cultivation: number;
  day7_realm: string;
  day7_spirit_stone_balance: number;
  day7_material_balance: number;
  action_token_pressure: number;
  core_minutes_required: number;
  cultivation_gap_vs_standard_free: number;
  daily_reports: Array<{
    day: number;
    cultivation: number;
    realm: string;
    spirit_stone_balance: number;
    material_balance: number;
  }>;
  materials: P1FirstSevenDayMaterialReport[];
}

export interface P1DropTuningMaterialReport {
  material_id: string;
  name: string;
  category: P1DropMaterialCategory;
  min_day7_balance: number;
  max_day7_balance: number;
  average_day7_balance: number;
  status: "balanced" | "shortage" | "surplus";
  adjustment_suggestion: string;
}

export interface P1BalanceTuningReport {
  tuning_id: string;
  config_version: string;
  day_range: number;
  generated_at: string;
  profiles: P1FirstSevenDayProfileReport[];
  materials: P1DropTuningMaterialReport[];
  warnings: P1SimulationWarning[];
}

export interface P1SimulationReport {
  config_version: string;
  ruleset_version: string;
  era_days: number;
  generated_at: string;
  profiles: P1ProfileSimulationReport[];
  servers: P1ServerSimulationReport[];
  warnings: P1SimulationWarning[];
  balance_tuning?: P1BalanceTuningReport;
}

export function validateConfigEnvelope(config: Partial<ConfigEnvelope>): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.config_type) {
    errors.push("缺少 config_type");
  }

  if (!config.config_version) {
    errors.push("缺少 config_version");
  }

  if (config.payload === undefined) {
    errors.push("缺少 payload");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateP1SimulationConfig(
  config: Partial<P1SimulationConfig>,
): ConfigValidationResult {
  const errors: string[] = [];

  if (config.config_type !== "simulation") {
    errors.push("P1 模拟配置 config_type 必须为 simulation");
  }

  if (!config.config_version) {
    errors.push("缺少 config_version");
  }

  if (!config.ruleset_version) {
    errors.push("缺少 ruleset_version");
  }

  if (!Number.isFinite(config.era_days) || Number(config.era_days) <= 0) {
    errors.push("era_days 必须为正数");
  }

  if (!Array.isArray(config.report_days) || config.report_days.length === 0) {
    errors.push("report_days 至少包含一个模拟节点");
  }

  if (!Array.isArray(config.active_player_counts) || config.active_player_counts.length === 0) {
    errors.push("active_player_counts 至少包含一个活跃人数");
  }

  if (!Array.isArray(config.realm_targets) || config.realm_targets.length === 0) {
    errors.push("realm_targets 至少包含一个境界目标");
  }

  if (!Array.isArray(config.profiles) || config.profiles.length === 0) {
    errors.push("profiles 至少包含一个玩家画像");
  }

  if (!config.server_progress) {
    errors.push("缺少 server_progress");
  }

  if (!config.risk_thresholds) {
    errors.push("缺少 risk_thresholds");
  }

  if (config.drop_tuning) {
    if (!config.drop_tuning.tuning_id) {
      errors.push("drop_tuning 缺少 tuning_id");
    }

    if (!config.drop_tuning.config_version) {
      errors.push("drop_tuning 缺少 config_version");
    }

    if (!Number.isFinite(config.drop_tuning.day_range) || config.drop_tuning.day_range !== 7) {
      errors.push("P1-10 drop_tuning day_range 必须覆盖前 7 天");
    }

    if (
      !Array.isArray(config.drop_tuning.required_profile_ids) ||
      config.drop_tuning.required_profile_ids.length === 0
    ) {
      errors.push("drop_tuning 至少需要一个玩家画像");
    }

    if (
      !Array.isArray(config.drop_tuning.material_flows) ||
      config.drop_tuning.material_flows.length === 0
    ) {
      errors.push("drop_tuning 至少需要一个材料流");
    }

    if (!config.drop_tuning.action_token) {
      errors.push("drop_tuning 缺少行动令配置");
    }

    if (!config.drop_tuning.thresholds) {
      errors.push("drop_tuning 缺少预警阈值");
    }
  }

  for (const profile of config.profiles ?? []) {
    if (!profile.profile_id) {
      errors.push("玩家画像缺少 profile_id");
    }

    if (!profile.label) {
      errors.push(`${profile.profile_id ?? "未知画像"} 缺少 label`);
    }

    if (profile.daily_completion_rate < 0 || profile.daily_completion_rate > 1.5) {
      errors.push(`${profile.profile_id} daily_completion_rate 超出合理范围`);
    }

    if (profile.pvp_effective_strength_bonus > 0.5) {
      errors.push(`${profile.profile_id} PVP 强度优势配置异常`);
    }
  }

  const profileIds = new Set((config.profiles ?? []).map((profile) => profile.profile_id));
  for (const profileId of config.drop_tuning?.required_profile_ids ?? []) {
    if (!profileIds.has(profileId)) {
      errors.push(`drop_tuning 引用了不存在的玩家画像 ${profileId}`);
    }
  }

  for (const material of config.drop_tuning?.material_flows ?? []) {
    if (!material.material_id) {
      errors.push("drop_tuning 材料流缺少 material_id");
    }

    if (!material.name) {
      errors.push(`${material.material_id ?? "未知材料"} 缺少 name`);
    }

    if (material.daily_base_income < 0 || material.daily_base_sink < 0) {
      errors.push(`${material.material_id} 每日产销不能为负数`);
    }

    if (material.min_day7_balance > material.max_day7_balance) {
      errors.push(`${material.material_id} day7 结余上下限配置错误`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function runP1Simulation(config: P1SimulationConfig): P1SimulationReport {
  const validation = validateP1SimulationConfig(config);

  if (!validation.valid) {
    throw new Error(`P1 模拟配置无效：${validation.errors.join("；")}`);
  }

  const profiles = config.profiles.map((profile) =>
    simulateProfile(profile, config.era_days, config.report_days, config.realm_targets),
  );
  const servers = config.active_player_counts.map((activePlayers) =>
    simulateServer(activePlayers, config),
  );
  const balanceTuning = config.drop_tuning ? runP1BalanceTuning(config) : undefined;
  const warnings = [
    ...collectP1SimulationWarnings(profiles, servers, config),
    ...(balanceTuning?.warnings ?? []),
  ];

  return {
    config_version: config.config_version,
    ruleset_version: config.ruleset_version,
    era_days: config.era_days,
    generated_at: new Date().toISOString(),
    profiles,
    servers,
    warnings,
    balance_tuning: balanceTuning,
  };
}

export function formatP1SimulationReport(report: P1SimulationReport): string {
  const lines = [
    "# P1 数值模拟报表",
    "",
    `配置版本：${report.config_version}`,
    `规则版本：${report.ruleset_version}`,
    `纪元天数：${report.era_days}`,
    `生成时间：${report.generated_at}`,
    "",
    "## 玩家画像",
    "",
    "| 画像 | 360 天境界 | 核心耗时 | 灵石结余 | 材料结余 | 古宝抽数 | 限定池预算抽 | PVP 优势 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.profiles.map(
      (profile) =>
        `| ${profile.label} | ${profile.final_realm} | ${profile.active_minutes_per_day} 分钟 | ${Math.round(
          profile.spirit_stone_balance,
        )} | ${Math.round(profile.material_balance)} | ${Math.round(
          profile.ancient_treasure_draws,
        )} | ${Math.round(profile.limited_gacha_draw_budget)} | ${formatPercent(
          profile.pvp_effective_strength_bonus,
        )} |`,
    ),
    "",
    "## 服务器规模",
    "",
    "| 活跃人数 | 预计纪元完成日 | 玩家贡献占比 | NPC 兜底占比 | 日玩家贡献 | 日 NPC 贡献 |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.servers.map(
      (server) =>
        `| ${server.active_players} | ${Math.round(
          server.estimated_finish_day,
        )} | ${formatPercent(server.player_contribution_ratio)} | ${formatPercent(
          server.npc_contribution_ratio,
        )} | ${Math.round(server.daily_player_contribution)} | ${Math.round(
          server.daily_npc_contribution,
        )} |`,
    ),
    "",
  ];

  if (report.balance_tuning) {
    lines.push(formatP1BalanceTuningReport(report.balance_tuning).trimEnd(), "");
  }

  lines.push("## 风险预警", "");

  if (report.warnings.length === 0) {
    lines.push("- 暂未发现阻断级风险。");
  } else {
    lines.push(
      ...report.warnings.map(
        (warning) =>
          `- [${warning.severity}] ${warning.subject}：${warning.message}；建议：${warning.suggestion}`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function runP1BalanceTuning(config: P1SimulationConfig): P1BalanceTuningReport {
  const validation = validateP1SimulationConfig(config);

  if (!validation.valid) {
    throw new Error(`P1-10 数值校准配置无效：${validation.errors.join("；")}`);
  }

  if (!config.drop_tuning) {
    throw new Error("P1-10 数值校准需要 drop_tuning 配置");
  }

  const standardProfile = config.profiles.find((profile) => profile.profile_id === "standard_free");
  const standardDay7Cultivation = standardProfile
    ? dailyCultivationGain(standardProfile) * config.drop_tuning.day_range
    : 1;
  const profiles = config.drop_tuning.required_profile_ids.map((profileId) => {
    const profile = config.profiles.find((item) => item.profile_id === profileId);

    if (!profile) {
      throw new Error(`缺少 P1-10 玩家画像 ${profileId}`);
    }

    return simulateFirstSevenDayProfile(profile, config, standardDay7Cultivation);
  });
  const materials = config.drop_tuning.material_flows.map((material) =>
    summarizeDropMaterial(material, profiles),
  );
  const warnings = collectP1BalanceWarnings(profiles, materials, config);

  return {
    tuning_id: config.drop_tuning.tuning_id,
    config_version: config.drop_tuning.config_version,
    day_range: config.drop_tuning.day_range,
    generated_at: new Date().toISOString(),
    profiles,
    materials,
    warnings,
  };
}

export function formatP1BalanceTuningReport(report: P1BalanceTuningReport): string {
  const lines = [
    "## P1-10 前 7 天画像",
    "",
    `校准方案：${report.tuning_id}`,
    `配置版本：${report.config_version}`,
    `覆盖天数：${report.day_range}`,
    "",
    "| 画像 | 第 7 天境界 | 修为 | 灵石结余 | 材料结余 | 与标准免费差距 | 行动令压力 | 核心分钟 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.profiles.map(
      (profile) =>
        `| ${profile.label} | ${profile.day7_realm} | ${Math.round(
          profile.day7_cultivation,
        )} | ${Math.round(profile.day7_spirit_stone_balance)} | ${Math.round(
          profile.day7_material_balance,
        )} | ${formatPercent(profile.cultivation_gap_vs_standard_free)} | ${formatPercent(
          profile.action_token_pressure,
        )} | ${Math.round(profile.core_minutes_required)} |`,
    ),
    "",
    "## P1-10 掉落校准",
    "",
    "| 材料 | 分类 | 平均第 7 天结余 | 最低结余 | 最高结余 | 状态 | 建议 |",
    "| --- | --- | ---: | ---: | ---: | --- | --- |",
    ...report.materials.map(
      (material) =>
        `| ${material.name} | ${dropMaterialCategoryLabel(material.category)} | ${Math.round(
          material.average_day7_balance,
        )} | ${Math.round(material.min_day7_balance)} | ${Math.round(
          material.max_day7_balance,
        )} | ${dropTuningStatusLabel(material.status)} | ${material.adjustment_suggestion} |`,
    ),
    "",
    "## P1-10 卡点与风险报告",
    "",
  ];

  if (report.warnings.length === 0) {
    lines.push("- 前 7 天暂未发现材料断供、明显通胀、行动令压力、付费差距或过快毕业风险。");
  } else {
    lines.push(
      ...report.warnings.map(
        (warning) =>
          `- [${warning.severity}] ${warning.subject}：${warning.message}；建议：${warning.suggestion}`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

function simulateProfile(
  profile: P1SimulationProfile,
  eraDays: number,
  reportDays: number[],
  realmTargets: P1RealmTarget[],
): P1ProfileSimulationReport {
  const cultivationPerDay = profile.daily_cultivation_gain * profile.daily_completion_rate;
  const spiritIncomePerDay =
    profile.daily_spirit_stone_income *
    profile.daily_completion_rate *
    (1 + profile.pve_efficiency_bonus * 0.3);
  const spiritSinkPerDay = profile.daily_spirit_stone_sink * profile.daily_completion_rate;
  const materialIncomePerDay =
    profile.daily_material_income *
    profile.daily_completion_rate *
    (1 + profile.pve_efficiency_bonus * 0.35);
  const materialSinkPerDay = profile.daily_material_sink * profile.daily_completion_rate;
  const ancientTreasureDraws =
    (profile.ancient_treasure_daily_draws + profile.ancient_page_daily_gain / 30) * eraDays;
  const limitedGachaDrawBudget =
    Math.max(0, profile.era_point_budget - profile.monthly_point_cost) / 100;

  return {
    profile_id: profile.profile_id,
    label: profile.label,
    active_minutes_per_day: profile.active_minutes_per_day,
    final_cultivation: cultivationPerDay * eraDays,
    final_realm: resolveRealm(cultivationPerDay * eraDays, realmTargets),
    spirit_stone_balance: (spiritIncomePerDay - spiritSinkPerDay) * eraDays,
    material_balance: (materialIncomePerDay - materialSinkPerDay) * eraDays,
    ancient_treasure_draws: ancientTreasureDraws,
    ancient_treasure_pity_cycles: ancientTreasureDraws / 60,
    limited_gacha_draw_budget: limitedGachaDrawBudget,
    pvp_effective_strength_bonus: profile.pvp_effective_strength_bonus,
    day_reports: reportDays.map((day) => {
      const cultivation = cultivationPerDay * day;

      return {
        day,
        cultivation,
        realm: resolveRealm(cultivation, realmTargets),
        spirit_stone_balance: (spiritIncomePerDay - spiritSinkPerDay) * day,
        material_balance: (materialIncomePerDay - materialSinkPerDay) * day,
      };
    }),
  };
}

function simulateFirstSevenDayProfile(
  profile: P1SimulationProfile,
  config: P1SimulationConfig,
  standardDay7Cultivation: number,
): P1FirstSevenDayProfileReport {
  const tuning = requireDropTuning(config);
  const dayRange = tuning.day_range;
  const cultivationPerDay = dailyCultivationGain(profile);
  const spiritIncomePerDay = profile.daily_spirit_stone_income * profile.daily_completion_rate;
  const spiritSinkPerDay = profile.daily_spirit_stone_sink * profile.daily_completion_rate;
  const materialReports = tuning.material_flows.map((material) =>
    simulateFirstSevenDayMaterial(profile, material, dayRange),
  );
  const day7Cultivation = cultivationPerDay * dayRange;
  const actionTokenPressure =
    tuning.action_token.day7_core_required / (tuning.action_token.daily_recovery * dayRange);
  const coreMinutesRequired =
    (tuning.action_token.day7_core_required / dayRange) * tuning.action_token.minutes_per_action;

  return {
    profile_id: profile.profile_id,
    label: profile.label,
    active_minutes_per_day: profile.active_minutes_per_day,
    day7_cultivation: day7Cultivation,
    day7_realm: resolveRealm(day7Cultivation, config.realm_targets),
    day7_spirit_stone_balance: (spiritIncomePerDay - spiritSinkPerDay) * dayRange,
    day7_material_balance: materialReports.reduce(
      (sum, material) => sum + material.day7_balance,
      0,
    ),
    action_token_pressure: actionTokenPressure,
    core_minutes_required: coreMinutesRequired,
    cultivation_gap_vs_standard_free:
      (day7Cultivation - standardDay7Cultivation) / Math.max(1, standardDay7Cultivation),
    daily_reports: Array.from({ length: dayRange }, (_, index) => {
      const day = index + 1;
      const cultivation = cultivationPerDay * day;

      return {
        day,
        cultivation,
        realm: resolveRealm(cultivation, config.realm_targets),
        spirit_stone_balance: (spiritIncomePerDay - spiritSinkPerDay) * day,
        material_balance: materialReports.reduce(
          (sum, material) => sum + (material.day7_balance / dayRange) * day,
          0,
        ),
      };
    }),
    materials: materialReports,
  };
}

function simulateFirstSevenDayMaterial(
  profile: P1SimulationProfile,
  material: P1DropMaterialFlowConfig,
  dayRange: number,
): P1FirstSevenDayMaterialReport {
  const actionMultiplier = firstSevenDayActionMultiplier(profile);
  const incomePerDay =
    material.daily_base_income * profile.daily_completion_rate * actionMultiplier;
  const sinkPerDay = material.daily_base_sink * profile.daily_completion_rate;
  const day7Balance = (incomePerDay - sinkPerDay) * dayRange - material.novice_required;
  const status = classifyDropBalance(
    day7Balance,
    material.min_day7_balance,
    material.max_day7_balance,
  );

  return {
    material_id: material.material_id,
    name: material.name,
    category: material.category,
    day7_balance: day7Balance,
    min_day7_balance: material.min_day7_balance,
    max_day7_balance: material.max_day7_balance,
    status,
    adjustment_suggestion: materialAdjustmentSuggestion(material, status, day7Balance),
  };
}

function summarizeDropMaterial(
  material: P1DropMaterialFlowConfig,
  profiles: P1FirstSevenDayProfileReport[],
): P1DropTuningMaterialReport {
  const balances = profiles.map(
    (profile) =>
      profile.materials.find((item) => item.material_id === material.material_id)?.day7_balance ??
      0,
  );
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const averageBalance =
    balances.reduce((sum, value) => sum + value, 0) / Math.max(1, balances.length);
  const status =
    minBalance < material.min_day7_balance
      ? "shortage"
      : maxBalance > material.max_day7_balance
        ? "surplus"
        : "balanced";

  return {
    material_id: material.material_id,
    name: material.name,
    category: material.category,
    min_day7_balance: minBalance,
    max_day7_balance: maxBalance,
    average_day7_balance: averageBalance,
    status,
    adjustment_suggestion: materialAdjustmentSuggestion(material, status, averageBalance),
  };
}

function simulateServer(
  activePlayers: number,
  config: P1SimulationConfig,
): P1ServerSimulationReport {
  const standardProfile = config.profiles.find((profile) => profile.profile_id === "standard_free");
  const baseTowerContribution = standardProfile?.daily_tower_contribution ?? 90;
  const scaledActivePlayers =
    100 * (activePlayers / 100) ** config.server_progress.large_server_diminishing_exponent;
  const dailyPlayerContribution = scaledActivePlayers * baseTowerContribution;
  const smallServerGap = Math.max(0, 100 - activePlayers) / 100;
  const dailyNpcContribution =
    config.server_progress.npc_daily_contribution_floor +
    config.server_progress.npc_small_server_bonus * smallServerGap;
  const estimatedFinishDay =
    config.server_progress.target_contribution /
    Math.max(1, dailyPlayerContribution + dailyNpcContribution);
  const totalPlayerContribution = dailyPlayerContribution * estimatedFinishDay;
  const totalNpcContribution = dailyNpcContribution * estimatedFinishDay;
  const totalContribution = totalPlayerContribution + totalNpcContribution;

  return {
    active_players: activePlayers,
    estimated_finish_day: estimatedFinishDay,
    player_contribution_ratio: totalPlayerContribution / totalContribution,
    npc_contribution_ratio: totalNpcContribution / totalContribution,
    daily_player_contribution: dailyPlayerContribution,
    daily_npc_contribution: dailyNpcContribution,
  };
}

function collectP1SimulationWarnings(
  profiles: P1ProfileSimulationReport[],
  servers: P1ServerSimulationReport[],
  config: P1SimulationConfig,
): P1SimulationWarning[] {
  const warnings: P1SimulationWarning[] = [];

  for (const profile of profiles) {
    if (profile.pvp_effective_strength_bonus > config.risk_thresholds.max_pvp_strength_bonus) {
      warnings.push({
        code: "pvp_strength_over_cap",
        severity: "critical",
        subject: profile.label,
        value: profile.pvp_effective_strength_bonus,
        threshold: config.risk_thresholds.max_pvp_strength_bonus,
        message: `PVP 有效强度优势达到 ${formatPercent(profile.pvp_effective_strength_bonus)}`,
        suggestion: "下调付费属性软阈值、机制触发频率或 PVP 回复护盾修正",
      });
    }

    const spiritNetRatio =
      profile.spirit_stone_balance /
      Math.max(1, Math.abs(profile.spirit_stone_balance) + config.era_days);

    if (spiritNetRatio > config.risk_thresholds.spirit_inflation_net_ratio) {
      warnings.push({
        code: "spirit_stone_inflation",
        severity: "warning",
        subject: profile.label,
        value: spiritNetRatio,
        threshold: config.risk_thresholds.spirit_inflation_net_ratio,
        message: "灵石结余偏高，可能形成通胀",
        suggestion: "提高炼器、铭刻、交易税或宗门建设消耗",
      });
    }

    const materialTotal = profile.day_reports.at(-1)?.material_balance ?? profile.material_balance;
    const materialRatio = materialTotal / Math.max(1, Math.abs(materialTotal) + config.era_days);

    if (materialRatio < -config.risk_thresholds.material_shortage_ratio) {
      warnings.push({
        code: "material_shortage",
        severity: "warning",
        subject: profile.label,
        value: materialRatio,
        threshold: -config.risk_thresholds.material_shortage_ratio,
        message: "材料结余偏低，可能出现断供",
        suggestion: "提高秘境、九州采集、九塔周结或交易行基础材料投放",
      });
    }

    if (materialRatio > config.risk_thresholds.material_surplus_ratio) {
      warnings.push({
        code: "material_surplus",
        severity: "info",
        subject: profile.label,
        value: materialRatio,
        threshold: config.risk_thresholds.material_surplus_ratio,
        message: "材料结余偏高，可能囤积",
        suggestion: "增加炼丹、炼器、宗门建设和内天地消耗口",
      });
    }
  }

  for (const server of servers) {
    if (server.estimated_finish_day < config.risk_thresholds.min_era_finish_day) {
      warnings.push({
        code: "era_fast_forward",
        severity: "warning",
        subject: `${server.active_players} 活跃服`,
        value: server.estimated_finish_day,
        threshold: config.risk_thresholds.min_era_finish_day,
        message: "纪元推进偏快",
        suggestion: "提高多塔阶段目标或降低大服贡献折算",
      });
    }

    if (server.estimated_finish_day > config.risk_thresholds.max_era_finish_day) {
      warnings.push({
        code: "era_stalled",
        severity: "warning",
        subject: `${server.active_players} 活跃服`,
        value: server.estimated_finish_day,
        threshold: config.risk_thresholds.max_era_finish_day,
        message: "纪元推进偏慢",
        suggestion: "提高低活跃 NPC 兜底、章节保底推进或低阶参与贡献",
      });
    }

    if (server.npc_contribution_ratio > config.risk_thresholds.max_npc_contribution_ratio) {
      warnings.push({
        code: "npc_dependency",
        severity: "warning",
        subject: `${server.active_players} 活跃服`,
        value: server.npc_contribution_ratio,
        threshold: config.risk_thresholds.max_npc_contribution_ratio,
        message: `NPC 兜底占比达到 ${formatPercent(server.npc_contribution_ratio)}`,
        suggestion: "检查低活跃服行动令投放、九塔贡献保底和宗门协作奖励",
      });
    }
  }

  return warnings;
}

function collectP1BalanceWarnings(
  profiles: P1FirstSevenDayProfileReport[],
  materials: P1DropTuningMaterialReport[],
  config: P1SimulationConfig,
): P1SimulationWarning[] {
  const tuning = requireDropTuning(config);
  const warnings: P1SimulationWarning[] = [];
  const firstAdvancedRealm = [...config.realm_targets].sort(
    (left, right) => left.cultivation_required - right.cultivation_required,
  )[1];
  const day7RealmThreshold =
    (firstAdvancedRealm?.cultivation_required ?? 1) * tuning.thresholds.max_day7_realm_target_ratio;

  for (const material of materials) {
    if (material.status === "shortage") {
      warnings.push({
        code: "p1_10_material_shortage",
        severity: "warning",
        subject: material.name,
        value: material.min_day7_balance,
        threshold: tuning.thresholds.min_material_day7_balance,
        message: "前 7 天低阶材料可能断供",
        suggestion: material.adjustment_suggestion,
      });
    }

    if (material.status === "surplus") {
      warnings.push({
        code: "p1_10_material_surplus",
        severity: "info",
        subject: material.name,
        value: material.max_day7_balance,
        threshold: tuning.thresholds.max_material_day7_balance,
        message: "前 7 天低阶材料可能过度囤积",
        suggestion: material.adjustment_suggestion,
      });
    }
  }

  for (const profile of profiles) {
    if (profile.action_token_pressure > tuning.thresholds.max_action_token_pressure) {
      warnings.push({
        code: "p1_10_action_token_pressure",
        severity: "warning",
        subject: profile.label,
        value: profile.action_token_pressure,
        threshold: tuning.thresholds.max_action_token_pressure,
        message: "前 7 天核心路线行动令压力偏高",
        suggestion: "降低新手路线行动令消耗、提高章节奖励行动令或减少重复探索要求",
      });
    }

    if (profile.core_minutes_required > tuning.action_token.max_core_minutes_per_day) {
      warnings.push({
        code: "p1_10_core_minutes_overload",
        severity: "warning",
        subject: profile.label,
        value: profile.core_minutes_required,
        threshold: tuning.action_token.max_core_minutes_per_day,
        message: "前 7 天核心收益所需时间偏长",
        suggestion: "压缩每日主线动作数量，保留深度玩法为可选目标",
      });
    }

    if (profile.day7_cultivation > day7RealmThreshold) {
      warnings.push({
        code: "p1_10_fast_graduation",
        severity: "warning",
        subject: profile.label,
        value: profile.day7_cultivation,
        threshold: day7RealmThreshold,
        message: "第 7 天成长过快，可能跳过新手曲线",
        suggestion: "降低前 7 天修为投放或把高收益移动到章节后半段",
      });
    }

    if (isMonthlyProfile(profile.profile_id)) {
      pushPaidGapWarningIfNeeded(
        warnings,
        profile,
        tuning.thresholds.max_monthly_day7_cultivation_gap,
        "p1_10_monthly_gap",
        "月卡",
      );
    }

    if (isVipProfile(profile.profile_id)) {
      pushPaidGapWarningIfNeeded(
        warnings,
        profile,
        tuning.thresholds.max_vip_day7_cultivation_gap,
        "p1_10_vip_gap",
        "VIP",
      );
    }

    if (isWhaleProfile(profile.profile_id)) {
      pushPaidGapWarningIfNeeded(
        warnings,
        profile,
        tuning.thresholds.max_whale_day7_cultivation_gap,
        "p1_10_whale_gap",
        "高消费",
      );
    }
  }

  return warnings;
}

function resolveRealm(cultivation: number, realmTargets: P1RealmTarget[]): string {
  const sortedTargets = [...realmTargets].sort(
    (left, right) => left.cultivation_required - right.cultivation_required,
  );
  let currentRealm = sortedTargets[0]?.realm_name ?? "未入道";

  for (const target of sortedTargets) {
    if (cultivation >= target.cultivation_required) {
      currentRealm = target.realm_name;
    }
  }

  return currentRealm;
}

function requireDropTuning(config: P1SimulationConfig): P1DropTuningConfig {
  if (!config.drop_tuning) {
    throw new Error("缺少 P1-10 drop_tuning 配置");
  }

  return config.drop_tuning;
}

function dailyCultivationGain(profile: P1SimulationProfile): number {
  return profile.daily_cultivation_gain * profile.daily_completion_rate;
}

function firstSevenDayActionMultiplier(profile: P1SimulationProfile): number {
  return Math.min(1.35, Math.max(0.6, profile.daily_action_count / 21));
}

function classifyDropBalance(
  balance: number,
  minBalance: number,
  maxBalance: number,
): "balanced" | "shortage" | "surplus" {
  if (balance < minBalance) {
    return "shortage";
  }

  if (balance > maxBalance) {
    return "surplus";
  }

  return "balanced";
}

function materialAdjustmentSuggestion(
  material: P1DropMaterialFlowConfig,
  status: "balanced" | "shortage" | "surplus",
  balance: number,
): string {
  if (status === "shortage") {
    const gap = Math.ceil(material.min_day7_balance - balance);
    return `每 7 天补投约 ${Math.max(material.adjustment_step, gap)} 个${material.name}，优先放入探索、奇遇或章节奖励。`;
  }

  if (status === "surplus") {
    const surplus = Math.ceil(balance - material.max_day7_balance);
    return `每 7 天回收约 ${Math.max(material.adjustment_step, surplus)} 个${material.name}，优先增加炼丹、炼器或宗门建设消耗。`;
  }

  return "保持当前投放，继续观察前 7 天消耗和背包结余。";
}

function dropMaterialCategoryLabel(category: P1DropMaterialCategory): string {
  const labels: Record<P1DropMaterialCategory, string> = {
    alchemy: "炼丹",
    common: "通用",
    forge: "炼器",
    tower: "九塔",
  };

  return labels[category];
}

function dropTuningStatusLabel(status: "balanced" | "shortage" | "surplus"): string {
  const labels: Record<typeof status, string> = {
    balanced: "平衡",
    shortage: "断供",
    surplus: "通胀",
  };

  return labels[status];
}

function isMonthlyProfile(profileId: P1SimulationProfileId): boolean {
  return profileId === "small_monthly" || profileId === "large_monthly";
}

function isVipProfile(profileId: P1SimulationProfileId): boolean {
  return profileId === "vip3" || profileId === "vip4";
}

function isWhaleProfile(profileId: P1SimulationProfileId): boolean {
  return profileId === "whale_light" || profileId === "whale_hardcore";
}

function pushPaidGapWarningIfNeeded(
  warnings: P1SimulationWarning[],
  profile: P1FirstSevenDayProfileReport,
  threshold: number,
  code: string,
  label: string,
) {
  if (profile.cultivation_gap_vs_standard_free <= threshold) {
    return;
  }

  warnings.push({
    code,
    severity: "warning",
    subject: profile.label,
    value: profile.cultivation_gap_vs_standard_free,
    threshold,
    message: `${label}第 7 天修为差距达到 ${formatPercent(
      profile.cultivation_gap_vs_standard_free,
    )}`,
    suggestion: "把优势收敛到托管、队列、选择空间和容错，不提高低阶掉落或核心奖励倍率",
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
