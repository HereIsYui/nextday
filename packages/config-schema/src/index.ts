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

export interface P1SimulationReport {
  config_version: string;
  ruleset_version: string;
  era_days: number;
  generated_at: string;
  profiles: P1ProfileSimulationReport[];
  servers: P1ServerSimulationReport[];
  warnings: P1SimulationWarning[];
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
  const warnings = collectP1SimulationWarnings(profiles, servers, config);

  return {
    config_version: config.config_version,
    ruleset_version: config.ruleset_version,
    era_days: config.era_days,
    generated_at: new Date().toISOString(),
    profiles,
    servers,
    warnings,
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
    "## 风险预警",
    "",
  ];

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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
