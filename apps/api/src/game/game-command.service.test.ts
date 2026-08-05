import { describe, expect, it, vi } from "vitest";
import type { MultiplayerService } from "../multiplayer/multiplayer.service";
import type { ProductionService } from "../production/production.service";
import type { StoryService } from "../story/story.service";
import { GameCommandService } from "./game-command.service";
import type { GameService } from "./game.service";

describe("文字命令服务", () => {
  it("帮助指令返回分组用法", async () => {
    const service = createService();

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "帮助" },
      idempotencyKey: "idem_help",
    });

    expect(response.command_id).toBe("help");
    expect(response.entries.some((entry) => entry.text.includes("探索 <州域> [次数]"))).toBe(true);
    expect(
      response.entries.some((entry) =>
        entry.text.includes("领取探索：自动结算最近一条可领取探索。"),
      ),
    ).toBe(true);
  });

  it("解析州域别名并透传幂等键", async () => {
    const gameService = {
      explore: vi.fn().mockResolvedValue({
        province_name: "冀州",
        count: 2,
        total_seconds: 40,
      }),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "游历 冀州 2" },
      idempotencyKey: "idem_explore",
    });

    expect(response.command_id).toBe("explore");
    expect(gameService.explore).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { province_id: "ji", count: 2 },
      idempotencyKey: "idem_explore",
    });
  });

  it("领取探索后主动传出奇遇选项及对应指令", async () => {
    const gameService = {
      claimExplore: vi.fn().mockResolvedValue({
        battles: [{ result: "win" }],
        count: 1,
        event: {
          choices: [
            {
              choice_id: "collect",
              label: "顺势采药",
              reward_preview: "凝露草 ×1",
            },
            {
              choice_id: "leave",
              label: "谨慎离开",
              reward_preview: "无额外奖励",
            },
          ],
          description: "山道旁有一簇异草。",
          event_id: "event_test",
          title: "路遇灵草",
        },
        province_name: "冀州",
        rewards: { cultivation: "0", items: [], spirit_stone: "0" },
      }),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "领取探索 explore_test" },
      idempotencyKey: "idem_explore_claim",
    });

    expect(response.command_id).toBe("explore_claim");
    expect(gameService.claimExplore).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { record_id: "explore_test" },
      idempotencyKey: "idem_explore_claim",
    });
    expect(response.entries.map((entry) => entry.text)).toEqual(
      expect.arrayContaining([
        "探索奇遇“路遇灵草”：山道旁有一簇异草。",
        "请从以下选项中选择，并输入对应指令：",
        "选项 collect：顺势采药（凝露草 ×1）。输入：奇遇 event_test collect",
        "选项 leave：谨慎离开（无额外奖励）。输入：奇遇 event_test leave",
      ]),
    );
  });

  it("领取探索会自动结算最近一条可领取记录", async () => {
    const gameService = {
      claimExplore: vi.fn().mockResolvedValue({
        battles: [],
        count: 1,
        event: null,
        province_name: "冀州",
        rewards: { cultivation: "0", items: [], spirit_stone: "0" },
      }),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "领取探索" },
      idempotencyKey: "idem_explore_claim_latest",
    });

    expect(response.command_id).toBe("explore_claim");
    expect(gameService.claimExplore).toHaveBeenCalledWith({
      accountId: "account_test",
      body: {},
      idempotencyKey: "idem_explore_claim_latest",
    });
  });

  it("对含糊探索输入返回中文用法", async () => {
    const service = createService();

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "探索" },
      idempotencyKey: "idem_invalid",
    });

    expect(response.command_id).toBe("invalid");
    expect(response.entries[0]?.text).toContain("用法：探索 <州域> [次数]");
  });

  it("九塔中文行动别名会调用既有幂等结算", async () => {
    const multiplayerService = {
      getTowers: vi.fn().mockResolvedValue({
        towers: [
          {
            tower_id: "tower_xuantie",
            province_id: "ji",
            tower_name: "玄铁塔",
          },
        ],
      }),
      submitTowerAction: vi.fn().mockResolvedValue({
        settlement_status: "settled",
        tower: { tower_name: "玄铁塔" },
        contribution: 48,
        rewards: { spirit_stone: "30" },
      }),
    };
    const service = createService({ multiplayerService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "九塔 玄铁塔 镇封 2" },
      idempotencyKey: "idem_tower",
    });

    expect(response.command_id).toBe("tower_action");
    expect(multiplayerService.submitTowerAction).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { tower_id: "tower_xuantie", action_type: "seal", count: 2 },
      idempotencyKey: "idem_tower",
    });
  });

  it("炼丹会按材料名解析组合并透传幂等键", async () => {
    const productionService = {
      getCraftableMaterials: vi.fn().mockResolvedValue({
        materials: [
          { item_id: "alch_moon_dew_herb", name: "月露草", source_hint: "青州探索" },
          { item_id: "alch_spirit_resin", name: "灵髓露", source_hint: "洞府丹炉" },
        ],
      }),
      craftAlchemy: vi.fn().mockResolvedValue({
        record_id: "alchemy_test",
        record: { success: true },
        rewards: { spirit_stone: "0" },
        discovery: { result_template: { name: "蕴灵丹" } },
      }),
    };
    const service = createService({ productionService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "炼丹 月露草x2 灵髓露×1" },
      idempotencyKey: "idem_alchemy",
    });

    expect(response.command_id).toBe("alchemy_craft");
    expect(productionService.craftAlchemy).toHaveBeenCalledWith({
      accountId: "account_test",
      body: {
        materials: [
          { item_id: "alch_moon_dew_herb", count: 2 },
          { item_id: "alch_spirit_resin", count: 1 },
        ],
      },
      idempotencyKey: "idem_alchemy",
    });
  });

  it("单方列表允许显式指定我的范围", async () => {
    const productionService = {
      listProductionFormulas: vi.fn().mockResolvedValue({ formulas: [] }),
    };
    const service = createService({ productionService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "单方列表 我的 炼丹" },
      idempotencyKey: "idem_formula_list",
    });

    expect(response.command_id).toBe("formula_list");
    expect(productionService.listProductionFormulas).toHaveBeenCalledWith("account_test", {
      kind: "alchemy",
      keyword: undefined,
      scope: "mine",
    });
  });

  it("公开单方可按名称关键词检索", async () => {
    const productionService = {
      listProductionFormulas: vi.fn().mockResolvedValue({ formulas: [] }),
    };
    const service = createService({ productionService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "单方列表 公开 炼器 星纹" },
      idempotencyKey: "idem_formula_public",
    });

    expect(response.command_id).toBe("formula_list");
    expect(productionService.listProductionFormulas).toHaveBeenCalledWith("account_test", {
      kind: "forge",
      keyword: "星纹",
      scope: "public",
    });
  });
});

function createService(
  input: {
    gameService?: Record<string, unknown>;
    multiplayerService?: Record<string, unknown>;
    productionService?: Record<string, unknown>;
    storyService?: Record<string, unknown>;
  } = {},
): GameCommandService {
  return new GameCommandService(
    (input.gameService ?? {}) as unknown as GameService,
    (input.multiplayerService ?? {}) as unknown as MultiplayerService,
    (input.productionService ?? {}) as unknown as ProductionService,
    (input.storyService ?? {}) as unknown as StoryService,
  );
}
