import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  BattleSummary,
  MonthlyCardStateSummary,
  PluginExpandedPanelResponse,
  PluginNavigationLink,
  PluginNavigationLinksResponse,
  PluginPanelDigest,
  PluginPresetId,
  PluginQuickClaimItem,
  PluginQuickClaimRequest,
  PluginQuickClaimResponse,
  PluginStatusCardResponse,
  PluginSubmitPresetRequest,
  PluginSubmitPresetResponse,
  TaskState,
} from "@nextday/shared";
import { CommerceService } from "../commerce/commerce.service";
import { GameService } from "../game/game.service";
import { MultiplayerService } from "../multiplayer/multiplayer.service";

@Injectable()
export class PluginService {
  constructor(
    @Inject(GameService) private readonly gameService: GameService,
    @Inject(MultiplayerService) private readonly multiplayerService: MultiplayerService,
    @Inject(CommerceService) private readonly commerceService: CommerceService,
  ) {}

  async getStatusCard(accountId: string): Promise<PluginStatusCardResponse> {
    const [overview, commerce] = await Promise.all([
      this.gameService.getOverview(accountId),
      this.commerceService.getOverview(accountId),
    ]);

    const player = overview.profile.player;
    const wallet = overview.profile.wallet;
    if (!player || !wallet || !overview.action_state) {
      throw new BadRequestException("插件状态需要先创建角色");
    }

    const completedTaskCount = overview.tasks.filter((task) => task.status === "completed").length;
    const monthlyGrantCount = commerce.available_monthly_grants.reduce(
      (sum, grant) => sum + grant.draw_count - grant.used_count,
      0,
    );
    const reminders = [
      Number(overview.cultivation?.claimable_cultivation ?? "0") > 0 ? "修为可领" : null,
      (overview.cave?.claimable_minutes ?? 0) > 0 ? "洞府可收" : null,
      completedTaskCount > 0 ? `${completedTaskCount} 个任务可领` : null,
      monthlyGrantCount > 0 ? `${monthlyGrantCount} 次古宝赠抽` : null,
    ].filter((item): item is string => Boolean(item));

    return {
      player,
      realm_text: `${player.current_realm} 境 ${player.current_level} 层`,
      cultivation: {
        current_value: overview.cultivation?.cultivation_value ?? "0",
        claimable_value: overview.cultivation?.claimable_cultivation ?? "0",
        can_breakthrough: overview.cultivation?.can_breakthrough ?? false,
      },
      action_state: overview.action_state,
      offline_minutes: overview.cave?.claimable_minutes ?? 0,
      wallet,
      reminders,
      monthly_grant_count: monthlyGrantCount,
      navigation_links: this.buildNavigationLinks(),
    };
  }

  async getExpandedPanel(accountId: string): Promise<PluginExpandedPanelResponse> {
    const [status, overview, towers, boss, sect, commerce, treasures] = await Promise.all([
      this.getStatusCard(accountId),
      this.gameService.getOverview(accountId),
      this.multiplayerService.getTowers(),
      this.multiplayerService.getWorldBoss(),
      this.multiplayerService.getMySect(accountId),
      this.commerceService.getOverview(accountId),
      this.commerceService.listAncientTreasures(accountId),
    ]);

    return {
      status,
      tasks: overview.tasks.slice(0, 6).map(toPanelTask),
      digests: this.buildPanelDigests({
        recentBattles: overview.recent_battles,
        towers: towers.towers,
        ancientOwnedCount: treasures.treasures.filter((treasure) => treasure.owned).length,
        ancientTotalCount: treasures.treasures.length,
        ancientAvailableDraws: status.monthly_grant_count,
        monthlyCards: commerce.monthly_cards,
        sect: sect.sect,
        boss: boss.boss,
      }),
      cave: overview.cave,
      provinces: overview.provinces,
      towers: towers.towers.slice(0, 4),
      recent_battles: overview.recent_battles.slice(0, 3),
      ancient_treasure: {
        owned_count: treasures.treasures.filter((treasure) => treasure.owned).length,
        total_count: treasures.treasures.length,
        available_draws: status.monthly_grant_count,
      },
      monthly_cards: commerce.monthly_cards,
      sect: sect.sect,
      boss: boss.boss,
    };
  }

  async quickClaim(input: {
    accountId: string;
    body: PluginQuickClaimRequest;
    idempotencyKey: string;
  }): Promise<PluginQuickClaimResponse> {
    const items: PluginQuickClaimItem[] = [];
    await this.tryClaim(items, "cultivation", "领取修为", async () => {
      const result = await this.gameService.claimCultivation({
        accountId: input.accountId,
        idempotencyKey: `${input.idempotencyKey}:cultivation`,
      });
      return { recordId: result.record_id, message: `修为 +${result.gained_cultivation}` };
    });
    await this.tryClaim(items, "cave", "洞府收取", async () => {
      const result = await this.gameService.collectCave({
        accountId: input.accountId,
        idempotencyKey: `${input.idempotencyKey}:cave`,
      });
      return {
        recordId: result.record_id,
        message: `灵石 +${result.rewards.spirit_stone ?? "0"}`,
      };
    });

    if (input.body.include_tasks ?? true) {
      const tasks = await this.gameService.getTasks(input.accountId);
      for (const task of tasks.tasks.filter((item) => item.status === "completed").slice(0, 3)) {
        await this.tryClaim(items, "task", task.title, async () => {
          const result = await this.gameService.claimTask({
            accountId: input.accountId,
            taskId: task.task_id,
            idempotencyKey: `${input.idempotencyKey}:task:${task.task_id}`,
          });
          return { recordId: result.record_id, message: "任务奖励已领取" };
        });
      }
    }

    return {
      record_id: `plugin_quick_${randomUUID()}`,
      items,
      status: await this.getStatusCard(input.accountId),
    };
  }

  async submitPreset(input: {
    accountId: string;
    body: PluginSubmitPresetRequest;
    idempotencyKey: string;
  }): Promise<PluginSubmitPresetResponse> {
    const presetId = normalizePresetId(input.body.preset_id);
    const preset = pluginPresetLabels[presetId];
    let result: unknown;

    if (presetId === "explore_ji_once") {
      result = await this.gameService.explore({
        accountId: input.accountId,
        body: { province_id: "ji", count: 1 },
        idempotencyKey: `${input.idempotencyKey}:explore`,
      });
    }

    if (presetId === "tower_seal_once") {
      const towers = await this.multiplayerService.getTowers();
      const tower = towers.towers[0];
      if (!tower) {
        throw new BadRequestException("暂无可提交封印塔");
      }
      result = await this.multiplayerService.submitTowerAction({
        accountId: input.accountId,
        body: { tower_id: tower.tower_id, action_type: "seal", count: 1 },
        idempotencyKey: `${input.idempotencyKey}:tower`,
      });
    }

    if (presetId === "sect_patrol") {
      result = await this.multiplayerService.completeSectTask({
        accountId: input.accountId,
        body: { task_id: "sect_patrol" },
        idempotencyKey: `${input.idempotencyKey}:sect`,
      });
    }

    return {
      record_id: `plugin_preset_${randomUUID()}`,
      preset_id: presetId,
      label: preset,
      result,
      status: await this.getStatusCard(input.accountId),
    };
  }

  getNavigationLinks(): PluginNavigationLinksResponse {
    return { links: this.buildNavigationLinks() };
  }

  private buildNavigationLinks(): PluginNavigationLink[] {
    const baseUrl = (process.env.WEB_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

    return [
      { key: "web", label: "打开 Web", url: baseUrl },
      { key: "h5", label: "打开 H5", url: `${baseUrl}?mode=h5` },
      { key: "tasks", label: "今日日课", url: `${baseUrl}?tab=overview` },
      { key: "towers", label: "九塔", url: `${baseUrl}?tab=multiplayer` },
      { key: "commerce", label: "月卡古宝", url: `${baseUrl}?tab=market` },
    ];
  }

  private buildPanelDigests(input: {
    recentBattles: BattleSummary[];
    towers: PluginExpandedPanelResponse["towers"];
    ancientOwnedCount: number;
    ancientTotalCount: number;
    ancientAvailableDraws: number;
    monthlyCards: MonthlyCardStateSummary[];
    sect: PluginExpandedPanelResponse["sect"];
    boss: PluginExpandedPanelResponse["boss"];
  }): PluginPanelDigest[] {
    const digests: PluginPanelDigest[] = [];
    const latestBattle = input.recentBattles[0];
    if (latestBattle) {
      digests.push({
        digest_id: "recent_battle",
        title: "最近战报",
        summary: `${latestBattle.enemy_name} · ${latestBattle.result === "win" ? "胜" : "败"} · ${latestBattle.rounds} 回合`,
        tone: latestBattle.result === "win" ? "success" : "warning",
        action_hint: "battle",
      });
    }

    const firstTower = input.towers[0];
    if (firstTower) {
      digests.push({
        digest_id: "tower_snapshot",
        title: "九塔摘要",
        summary: `${firstTower.tower_name} 完整度 ${firstTower.integrity}，镇封 ${firstTower.seal_progress}`,
        tone: firstTower.corruption > 60 ? "warning" : "neutral",
        action_hint: "towers",
      });
    }

    if (input.boss) {
      digests.push({
        digest_id: "boss_snapshot",
        title: "Boss 阶段",
        summary: `${input.boss.name} 阶段 ${input.boss.phase}，血量 ${input.boss.remaining_hp}/${input.boss.total_hp}`,
        tone: input.boss.remaining_hp < input.boss.total_hp * 0.25 ? "success" : "neutral",
        action_hint: "towers",
      });
    }

    digests.push({
      digest_id: "ancient_treasure",
      title: "古宝提醒",
      summary:
        input.ancientAvailableDraws > 0
          ? `可用 ${input.ancientAvailableDraws} 次月卡赠抽，已收集 ${input.ancientOwnedCount}/${input.ancientTotalCount}`
          : `已收集 ${input.ancientOwnedCount}/${input.ancientTotalCount}，暂无当日赠抽`,
      tone: input.ancientAvailableDraws > 0 ? "success" : "neutral",
      action_hint: "commerce",
    });

    if (input.sect) {
      digests.push({
        digest_id: "sect_snapshot",
        title: "宗门摘要",
        summary: `${input.sect.name} 周贡献 ${input.sect.my_contribution_weekly}，等级 ${input.sect.level}`,
        tone: "neutral",
        action_hint: "towers",
      });
    }

    const activeMonthlyCards = input.monthlyCards.filter((card) => card.active);
    if (activeMonthlyCards.length > 0) {
      digests.push({
        digest_id: "monthly_card",
        title: "月卡状态",
        summary: `${activeMonthlyCards.length} 张月卡生效，剩余天数 ${activeMonthlyCards
          .map((card) => card.remaining_days)
          .join("/")}`,
        tone: "success",
        action_hint: "commerce",
      });
    }

    return digests.slice(0, 5);
  }

  private async tryClaim(
    items: PluginQuickClaimItem[],
    action: PluginQuickClaimItem["action"],
    label: string,
    handler: () => Promise<{ recordId: string; message: string }>,
  ) {
    try {
      const result = await handler();
      items.push({
        action,
        label,
        record_id: result.recordId,
        status: "claimed",
        message: result.message,
      });
    } catch (error) {
      items.push({
        action,
        label,
        record_id: null,
        status: "skipped",
        message: error instanceof Error ? error.message : "暂不可领取",
      });
    }
  }
}

const pluginPresetLabels: Record<PluginPresetId, string> = {
  explore_ji_once: "冀州探索",
  tower_seal_once: "九塔镇封",
  sect_patrol: "宗门巡山",
};

function normalizePresetId(presetId: string): PluginPresetId {
  if (
    presetId === "explore_ji_once" ||
    presetId === "tower_seal_once" ||
    presetId === "sect_patrol"
  ) {
    return presetId;
  }

  throw new BadRequestException("未知插件预设行动");
}

function toPanelTask(task: TaskState) {
  return {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    progress_text: `${task.progress_value}/${task.target_value}`,
  };
}
