import { BadRequestException } from "@nestjs/common";
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
    expect(response.entries.some((entry) => entry.text.includes("探索 <州域>"))).toBe(true);
    expect(response.entries.some((entry) => entry.text.includes("在线收益自动结算"))).toBe(true);
  });

  it("带次数的旧探索指令会明确拒绝", async () => {
    const gameService = {
      explore: vi.fn(),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "游历 冀州 2" },
      idempotencyKey: "idem_explore",
    });

    expect(response.command_id).toBe("invalid");
    expect(response.entries[0]?.text).toContain("长期行动");
    expect(gameService.explore).not.toHaveBeenCalled();
  });

  it("探索只接受州域并启动长期行动", async () => {
    const gameService = {
      startAction: vi.fn().mockResolvedValue({
        action: { province_name: "冀州" },
      }),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "探索 冀州" },
      idempotencyKey: "idem_explore",
    });

    expect(response.command_id).toBe("explore");
    expect(gameService.startAction).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { action_type: "explore", province_id: "ji" },
      idempotencyKey: "idem_explore",
    });
  });

  it("领取探索指令已退役", async () => {
    const service = createService();
    const response = await service.execute({
      accountId: "account_test",
      body: { command: "领取探索" },
      idempotencyKey: "idem_explore_claim_retired",
    });

    expect(response.command_id).toBe("invalid");
    expect(response.entries[0]?.text).toContain("未识别指令");
  });

  it("单条待选奇遇可省略过长的事件ID", async () => {
    const gameService = {
      getExploreEvents: vi.fn().mockResolvedValue({
        events: [{ event_id: "explore_event_very_long_identifier" }],
      }),
      resolveExploreEvent: vi.fn().mockResolvedValue({
        event: { title: "炉火余温" },
        rewards: { cultivation: "35", items: [], spirit_stone: "0" },
      }),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "奇遇 warm_fire" },
      idempotencyKey: "idem_short_event_choice",
    });

    expect(response.command_id).toBe("explore_event_resolve");
    expect(gameService.getExploreEvents).toHaveBeenCalledWith("account_test", {
      limit: "2",
      status: "pending",
    });
    expect(gameService.resolveExploreEvent).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { choice_id: "warm_fire", event_id: "explore_event_very_long_identifier" },
      idempotencyKey: "idem_short_event_choice",
    });
  });

  it("对含糊探索输入返回中文用法", async () => {
    const gameService = {
      getProvinces: vi.fn().mockResolvedValue({
        provinces: [{ name: "冀州", unlocked: true }],
      }),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "探索" },
      idempotencyKey: "idem_invalid",
    });

    expect(response.command_id).toBe("invalid");
    expect(response.entries[0]?.text).toContain("用法：探索 <州域>");
    expect(response.entries[0]?.text).toContain("当前可选州域：冀州");
  });

  it("裸探索的州域查询失败时仍返回文字指令响应", async () => {
    const gameService = {
      getProvinces: vi.fn().mockRejectedValue(new BadRequestException("请先创建角色。")),
    };
    const service = createService({ gameService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "探索" },
      idempotencyKey: "idem_invalid_explore",
    });

    expect(response.command_id).toBe("invalid");
    expect(response.entries[0]?.text).toContain("请先创建角色");
  });

  it("背包指令会返回物品用途，且可按名称筛选", async () => {
    const productionService = {
      getBagItems: vi.fn().mockResolvedValue({
        items: [
          {
            bind_type: "bound",
            category: "pill",
            count: "2",
            expired: false,
            expire_at: null,
            item_id: "pill_nourishing_essence",
            item_instance_id: "item_pill_test",
            locked: false,
            name: "蕴灵丹",
            quality: "middle",
            source_type: "alchemy",
            tradeable: false,
            usage_hint: "可直接服用，获得修为。",
          },
        ],
      }),
    };
    const service = createService({ productionService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "背包 蕴灵丹" },
      idempotencyKey: "idem_bag",
    });

    expect(response.command_id).toBe("bag");
    expect(response.entries.map((entry) => entry.text).join("\n")).toContain(
      "可直接服用，获得修为",
    );
    expect(productionService.getBagItems).toHaveBeenCalledWith("account_test");
  });

  it("服丹支持丹药名称，不要求输入实例ID", async () => {
    const productionService = {
      getBagItems: vi.fn().mockResolvedValue({
        items: [
          {
            bind_type: "bound",
            category: "pill",
            count: "1",
            expired: false,
            expire_at: null,
            item_id: "pill_nourishing_essence",
            item_instance_id: "item_pill_test",
            locked: false,
            name: "蕴灵丹",
            quality: "middle",
            source_type: "alchemy",
            tradeable: false,
            usage_hint: "可直接服用，获得修为。",
          },
        ],
      }),
      usePill: vi.fn().mockResolvedValue({
        after_cultivation: "120",
        before_cultivation: "0",
        effect_note: "药力化为 120 点修为。",
      }),
    };
    const service = createService({ productionService });

    const response = await service.execute({
      accountId: "account_test",
      body: { command: "服丹 蕴灵丹" },
      idempotencyKey: "idem_pill_name",
    });

    expect(response.command_id).toBe("pill_use");
    expect(productionService.usePill).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { item_instance_id: "item_pill_test" },
      idempotencyKey: "idem_pill_name",
    });
  });

  it("服丹可按实例ID精确选择同名不同品质的丹药", async () => {
    const productionService = {
      getBagItems: vi.fn().mockResolvedValue({
        items: [
          {
            bind_type: "bound",
            category: "pill",
            count: "1",
            expired: false,
            expire_at: null,
            item_id: "pill_nourishing_essence",
            item_instance_id: "item_pill_low",
            locked: false,
            name: "蕴灵丹",
            quality: "low",
            source_type: "alchemy",
            tradeable: false,
            usage_hint: "可直接服用，获得修为。",
          },
          {
            bind_type: "bound",
            category: "pill",
            count: "1",
            expired: false,
            expire_at: null,
            item_id: "pill_nourishing_essence",
            item_instance_id: "item_pill_flawless",
            locked: false,
            name: "蕴灵丹",
            quality: "flawless",
            source_type: "alchemy",
            tradeable: false,
            usage_hint: "可直接服用，获得修为。",
          },
        ],
      }),
      usePill: vi.fn().mockResolvedValue({
        after_cultivation: "300",
        before_cultivation: "0",
        effect_note: "药力化为 300 点修为。",
      }),
    };
    const service = createService({ productionService });

    await service.execute({
      accountId: "account_test",
      body: { command: "服丹 item_pill_flawless" },
      idempotencyKey: "idem_pill_instance",
    });

    expect(productionService.usePill).toHaveBeenCalledWith({
      accountId: "account_test",
      body: { item_instance_id: "item_pill_flawless" },
      idempotencyKey: "idem_pill_instance",
    });
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
