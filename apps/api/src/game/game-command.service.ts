import { HttpException, Inject, Injectable } from "@nestjs/common";
import type {
  BagItemState,
  BagSummaryResponse,
  ExploreEventState,
  FormulaCraftResponse,
  ProductionFormulaKind,
  ProductionFormulaResponse,
  StoryScrollListResponse,
  TaskSummaryResponse,
  TextCommandHelpGroup,
  TextCommandHelpResponse,
  TextCommandId,
  TextCommandLogEntry,
  TextCommandLogTone,
  TextCommandRefreshTarget,
  TextCommandRequest,
  TextCommandResponse,
  TextCommandResult,
  TextCommandSuggestion,
  TowerActionType,
  TowerListResponse,
} from "@nextday/shared";
import { MultiplayerService } from "../multiplayer/multiplayer.service";
import { ProductionService } from "../production/production.service";
import { StoryService } from "../story/story.service";
import { GameService } from "./game.service";

type ParsedCommand =
  | { commandId: "help" }
  | { commandId: "status" }
  | { commandId: "bag"; selector?: string }
  | { commandId: "cultivation_claim" }
  | { commandId: "breakthrough" }
  | { commandId: "explore"; province: string; count: number }
  | { commandId: "explore_claim"; recordId?: string }
  | { commandId: "explore_events" }
  | { commandId: "explore_event_resolve"; eventId?: string; choiceId: string }
  | { commandId: "cave_status" }
  | { commandId: "cave_collect" }
  | { commandId: "task_list" }
  | { commandId: "task_claim"; taskId: string }
  | { commandId: "craft_materials"; kind: ProductionFormulaKind }
  | { commandId: "alchemy_craft"; materialSpecs: string[] }
  | { commandId: "forge_craft"; materialSpecs: string[] }
  | { commandId: "pill_use"; pillSelector: string }
  | {
      commandId: "formula_list";
      kind?: ProductionFormulaKind;
      keyword?: string;
      scope: "mine" | "public";
    }
  | {
      commandId: "formula_save";
      kind: ProductionFormulaKind;
      sourceRecordId: string;
      name: string;
    }
  | { commandId: "formula_publish"; formulaId: string }
  | { commandId: "formula_unpublish"; formulaId: string }
  | { commandId: "formula_craft"; formulaId: string }
  | { commandId: "tower_list" }
  | { commandId: "tower_action"; towerSelector: string; actionType: TowerActionType; count: number }
  | { commandId: "scroll_list" }
  | { commandId: "scroll_detail"; scrollSelector: string }
  | { commandId: "battle_list" }
  | { commandId: "battle_detail"; battleId: string };

interface InvalidCommand {
  commandId: "invalid";
  message: string;
}

const commandHelpGroups: TextCommandHelpGroup[] = [
  {
    group_id: "overview",
    title: "总览",
    items: [
      {
        command_id: "help",
        syntax: "帮助",
        aliases: ["help", "?"],
        description: "查看全部可用文字指令。",
      },
      {
        command_id: "status",
        syntax: "状态",
        aliases: ["人物", "面板", "status"],
        description: "查看角色、修为、行动令、洞府与任务概况。",
      },
      {
        command_id: "bag",
        syntax: "背包 [物品名或ID]",
        aliases: ["纳物囊", "包裹", "bag"],
        description: "查看背包及物品用途；指定物品可查看单项说明。",
      },
    ],
  },
  {
    group_id: "cultivation",
    title: "修行与探索",
    items: [
      {
        command_id: "cultivation_claim",
        syntax: "修炼",
        aliases: ["吐纳", "收功"],
        description: "收束离线修为。",
      },
      {
        command_id: "breakthrough",
        syntax: "突破",
        aliases: [],
        description: "在境界圆满后尝试突破。",
      },
      {
        command_id: "explore",
        syntax: "探索 <州域> [次数]",
        aliases: ["游历 <州域> [次数]"],
        description: "州域可使用州名、简称或英文标识；次数为 1-5。",
      },
      {
        command_id: "explore_claim",
        syntax: "领取探索",
        aliases: ["探索领取", "探索结算"],
        description: "自动结算最近一条可领取探索。",
      },
      {
        command_id: "explore_events",
        syntax: "奇遇",
        aliases: [],
        description: "查看待处理的探索奇遇。",
      },
      {
        command_id: "explore_event_resolve",
        syntax: "奇遇 [事件ID] <选项ID>",
        aliases: ["处理奇遇 [事件ID] <选项ID>"],
        description: "只有一条待选奇遇时可省略事件ID，直接输入选项标识。",
      },
    ],
  },
  {
    group_id: "personal",
    title: "洞府与任务",
    items: [
      {
        command_id: "cave_status",
        syntax: "洞府",
        aliases: [],
        description: "查看洞府可收取的积累。",
      },
      {
        command_id: "cave_collect",
        syntax: "领取洞府",
        aliases: ["洞府领取", "收取洞府", "领取 洞府"],
        description: "收取洞府积累。",
      },
      {
        command_id: "task_list",
        syntax: "任务",
        aliases: [],
        description: "查看当前任务及其标识。",
      },
      {
        command_id: "task_claim",
        syntax: "领取任务 <任务ID>",
        aliases: ["任务 领取 <任务ID>", "领取 任务 <任务ID>"],
        description: "领取已完成任务的奖励。",
      },
    ],
  },
  {
    group_id: "production",
    title: "丹器与单方",
    items: [
      {
        command_id: "craft_materials",
        syntax: "材料 <炼丹|炼器>",
        aliases: ["材料 丹", "材料 器"],
        description: "查看可投炉专用材料及其来源。",
      },
      {
        command_id: "alchemy_craft",
        syntax: "炼丹 <材料名或ID>x<数量> ...",
        aliases: [],
        description: "自行组合丹材投炉；成功后可保存为单方。",
      },
      {
        command_id: "forge_craft",
        syntax: "炼器 <材料名或ID>x<数量> ...",
        aliases: [],
        description: "自行组合器材投炉；成功后可保存为单方。",
      },
      {
        command_id: "pill_use",
        syntax: "服丹 <丹药名或ID>",
        aliases: [],
        description: "按丹药名称或实例ID服用背包中的一枚丹药。",
      },
      {
        command_id: "formula_list",
        syntax: "单方列表 [公开] [炼丹|炼器] [关键词]",
        aliases: ["单方"],
        description: "查看自己的单方，或按类别、名称检索公开单方。",
      },
      {
        command_id: "formula_save",
        syntax: "保存单方 <炼丹|炼器> <记录ID> <名称>",
        aliases: [],
        description: "仅可保存一次成功炼制所得的记录。",
      },
      {
        command_id: "formula_publish",
        syntax: "公开单方 <单方ID>",
        aliases: [],
        description: "将自己的单方发布为公开单方。",
      },
      {
        command_id: "formula_unpublish",
        syntax: "取消公开单方 <单方ID>",
        aliases: [],
        description: "将自己的公开单方恢复为私有。",
      },
      {
        command_id: "formula_craft",
        syntax: "使用单方 <单方ID>",
        aliases: ["炼制单方 <单方ID>"],
        description: "按已发现的材料组合再次炼制。",
      },
    ],
  },
  {
    group_id: "narrative",
    title: "九塔与叙事",
    items: [
      {
        command_id: "tower_list",
        syntax: "九塔",
        aliases: [],
        description: "查看九座封印塔的当前状态。",
      },
      {
        command_id: "tower_action",
        syntax: "九塔 <塔名> <镇封|破阵|补给|守卫> [次数]",
        aliases: ["九塔 <塔名> <seal|break|supply|guard> [次数]"],
        description: "向指定封印塔提交行动，次数为 1-5。",
      },
      {
        command_id: "scroll_list",
        syntax: "卷轴",
        aliases: [],
        description: "查看已知章节卷轴。",
      },
      {
        command_id: "scroll_detail",
        syntax: "卷轴 <卷轴ID或标题>",
        aliases: [],
        description: "查看指定卷轴的片段与关联战报。",
      },
      {
        command_id: "battle_list",
        syntax: "战报",
        aliases: [],
        description: "查看最近战报。",
      },
      {
        command_id: "battle_detail",
        syntax: "战报 <战报ID>",
        aliases: [],
        description: "查看指定战报的叙事摘要。",
      },
    ],
  },
];

const defaultSuggestions: TextCommandSuggestion[] = [
  { label: "查看状态", command: "状态" },
  { label: "查看背包", command: "背包" },
  { label: "收束修为", command: "修炼" },
  { label: "探索冀州", command: "探索 冀州 1" },
  { label: "查看任务", command: "任务" },
];

const provinceAliases: Record<string, string[]> = {
  ji: ["ji", "冀", "冀州"],
  yan: ["yan", "兖", "兖州"],
  qing: ["qing", "青", "青州"],
  xu: ["xu", "徐", "徐州"],
  yang: ["yang", "扬", "扬州"],
  jing: ["jing", "荆", "荆州"],
  yu: ["yu", "豫", "豫州"],
  liang: ["liang", "凉", "凉州"],
  yong: ["yong", "雍", "雍州"],
};

@Injectable()
export class GameCommandService {
  constructor(
    @Inject(GameService) private readonly gameService: GameService,
    @Inject(MultiplayerService) private readonly multiplayerService: MultiplayerService,
    @Inject(ProductionService) private readonly productionService: ProductionService,
    @Inject(StoryService) private readonly storyService: StoryService,
  ) {}

  getHelp(): TextCommandHelpResponse {
    return { groups: commandHelpGroups };
  }

  async execute(input: {
    accountId: string;
    body: TextCommandRequest;
    idempotencyKey: string;
  }): Promise<TextCommandResponse> {
    const parsed = parseCommand(input.body);
    try {
      if (parsed.commandId === "invalid") {
        if (isBareExploreCommand(input.body?.command)) {
          return await this.exploreProvinceHint(input.accountId, parsed.message);
        }
        return this.failure("invalid", parsed.message);
      }

      switch (parsed.commandId) {
        case "help":
          return this.withSuggestions("help", buildHelpEntries());
        case "status":
          return this.status(input.accountId);
        case "bag":
          return this.bag(input.accountId, parsed.selector);
        case "cultivation_claim":
          return this.claimCultivation(input);
        case "breakthrough":
          return this.breakthrough(input);
        case "explore":
          return this.explore(input, parsed.province, parsed.count);
        case "explore_claim":
          return this.claimExplore(input, parsed.recordId);
        case "explore_events":
          return this.exploreEvents(input.accountId);
        case "explore_event_resolve":
          return this.resolveExploreEvent(input, parsed.eventId, parsed.choiceId);
        case "cave_status":
          return this.caveStatus(input.accountId);
        case "cave_collect":
          return this.collectCave(input);
        case "task_list":
          return this.taskList(input.accountId);
        case "task_claim":
          return this.claimTask(input, parsed.taskId);
        case "craft_materials":
          return this.craftableMaterials(input.accountId, parsed.kind);
        case "alchemy_craft":
          return this.craftAlchemy(input, parsed.materialSpecs);
        case "forge_craft":
          return this.craftForge(input, parsed.materialSpecs);
        case "pill_use":
          return this.usePill(input, parsed.pillSelector);
        case "formula_list":
          return this.formulaList(input.accountId, parsed.scope, parsed.kind, parsed.keyword);
        case "formula_save":
          return this.saveFormula(input, parsed.kind, parsed.sourceRecordId, parsed.name);
        case "formula_publish":
          return this.publishFormula(input, parsed.formulaId);
        case "formula_unpublish":
          return this.unpublishFormula(input, parsed.formulaId);
        case "formula_craft":
          return this.craftFormula(input, parsed.formulaId);
        case "tower_list":
          return this.towerList();
        case "tower_action":
          return this.towerAction(input, parsed.towerSelector, parsed.actionType, parsed.count);
        case "scroll_list":
          return this.scrollList(input.accountId);
        case "scroll_detail":
          return this.scrollDetail(input.accountId, parsed.scrollSelector);
        case "battle_list":
          return this.battleList(input.accountId);
        case "battle_detail":
          return this.battleDetail(input.accountId, parsed.battleId);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        const suggestions =
          parsed.commandId === "invalid" ? defaultSuggestions : suggestionsFor(parsed.commandId);
        return this.failure(parsed.commandId, getExceptionMessage(error), suggestions);
      }

      throw error;
    }
  }

  private async status(accountId: string): Promise<TextCommandResponse> {
    const overview = await this.gameService.getOverview(accountId);
    const player = overview.profile.player;
    const cultivation = overview.cultivation;
    const cave = overview.cave;
    const wallet = overview.profile.wallet;
    const entries: LogInput[] = [
      {
        tone: "info",
        text: player
          ? `${player.name}，${cultivation?.current_realm_name ?? "未定境界"}第 ${player.current_level} 层。`
          : "当前尚未创建角色。",
      },
    ];

    if (cultivation) {
      entries.push({
        tone: "info",
        text: `修为 ${cultivation.cultivation_value}，可收束 ${cultivation.claimable_cultivation}${cultivation.can_breakthrough ? "，当前可尝试突破。" : "。"}`,
      });
    }
    if (overview.action_state) {
      entries.push({
        tone: "info",
        text: `行动令 ${overview.action_state.action_points}/${overview.action_state.action_point_cap}。`,
      });
    }
    if (wallet) {
      entries.push({ tone: "info", text: `灵石 ${wallet.spirit_stone}。` });
    }
    if (cave) {
      entries.push({
        tone: "info",
        text: `洞府已积累 ${cave.claimable_minutes} 分钟，可输入“领取洞府”收取。`,
      });
    }

    return this.success(
      "status",
      entries,
      overview,
      ["overview", "tasks", "cave"],
      [
        ...(cultivation?.can_breakthrough
          ? [{ label: "尝试突破", command: "突破" }]
          : [{ label: "收束修为", command: "修炼" }]),
        { label: "查看背包", command: "背包" },
        { label: "探索冀州", command: "探索 冀州 1" },
        { label: "查看任务", command: "任务" },
      ],
    );
  }

  private async bag(accountId: string, selector: string | undefined): Promise<TextCommandResponse> {
    const result = await this.productionService.getBagItems(accountId);
    const matchedItems = selector
      ? result.items.filter((item) => matchesBagItem(item, selector))
      : result.items;

    if (matchedItems.length === 0) {
      return this.failure(
        "bag",
        selector
          ? `背包中未找到“${selector}”。可输入“背包”查看当前持有物品。`
          : "背包暂为空。完成探索、洞府收取或炼制后会获得物品。",
        [{ label: "前往探索", command: "探索 冀州 1" }],
      );
    }

    const items = summarizeBagItems(matchedItems);
    const firstPill = items.find(
      (item) => item.category === "pill" && !item.expired && !item.locked,
    );
    const entries: LogInput[] = [
      {
        tone: "info",
        text: selector
          ? `“${selector}”的用途如下：`
          : `背包中共有 ${items.length} 类物品。输入“背包 <物品名>”可查看单项说明。`,
      },
      ...items.map((item) => ({
        tone: item.expired ? ("warning" as const) : ("info" as const),
        text: `${item.name}${formatPillQuality(item.quality)} ×${item.count}${item.expired ? "（已过期）" : ""}：${item.usage_hint}`,
      })),
    ];

    return this.success(
      "bag",
      entries,
      result,
      ["bag"],
      firstPill
        ? [{ label: `服用${firstPill.name}`, command: `服丹 ${firstPill.name}` }]
        : [{ label: "查看状态", command: "状态" }],
    );
  }

  private async exploreProvinceHint(
    accountId: string,
    baseMessage: string,
  ): Promise<TextCommandResponse> {
    const { provinces } = await this.gameService.getProvinces(accountId);
    const unlockedProvinces = provinces.filter((province) => province.unlocked);
    const provinceNames = unlockedProvinces.map((province) => province.name);
    return this.failure(
      "invalid",
      provinceNames.length > 0
        ? `${baseMessage} 当前可选州域：${provinceNames.join("、")}。`
        : baseMessage,
      unlockedProvinces.map((province) => ({
        label: `探索${province.name}`,
        command: `探索 ${province.name} 1`,
      })),
    );
  }

  private async claimCultivation(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<TextCommandResponse> {
    const result = await this.gameService.claimCultivation(input);
    const levelText =
      result.after_level > result.before_level
        ? `，层级由第 ${result.before_level} 层提升至第 ${result.after_level} 层`
        : "";
    return this.success(
      "cultivation_claim",
      [{ tone: "success", text: `收束修为 ${result.gained_cultivation}${levelText}。` }],
      result,
      ["overview", "tasks"],
      result.status.can_breakthrough
        ? [{ label: "尝试突破", command: "突破" }]
        : [{ label: "继续探索", command: "探索 冀州 1" }],
    );
  }

  private async breakthrough(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<TextCommandResponse> {
    const result = await this.gameService.breakthrough(input);
    return this.success(
      "breakthrough",
      [{ tone: result.success ? "success" : "warning", text: result.message }],
      result,
      ["overview", "tasks"],
      result.success
        ? [{ label: "前往探索", command: "探索 冀州 1" }]
        : [{ label: "继续修炼", command: "修炼" }],
    );
  }

  private async explore(
    input: { accountId: string; idempotencyKey: string },
    province: string,
    count: number,
  ): Promise<TextCommandResponse> {
    const result = await this.gameService.explore({
      ...input,
      body: { province_id: province, count },
    });
    return this.success(
      "explore",
      [
        {
          tone: "success",
          text: `已踏入${result.province_name}，${result.count} 次探索正在进行，预计 ${result.total_seconds} 秒后可领取。`,
        },
      ],
      result,
      ["overview", "explore"],
      [],
    );
  }

  private async claimExplore(
    input: { accountId: string; idempotencyKey: string },
    recordId: string | undefined,
  ): Promise<TextCommandResponse> {
    const result = await this.gameService.claimExplore({
      ...input,
      body: recordId ? { record_id: recordId } : {},
    });
    const wins = result.battles.filter((battle) => battle.result === "win").length;
    const entries: LogInput[] = [
      {
        tone: "success",
        text: `探索结算完成：${result.province_name}共 ${result.count} 战，胜 ${wins} 场。${formatRewards(result.rewards)}`,
      },
    ];
    return this.success(
      "explore_claim",
      entries,
      result,
      ["overview", "explore", "events", "tasks", "battles"],
      [{ label: "查看战报", command: "战报" }],
    );
  }

  private async exploreEvents(accountId: string): Promise<TextCommandResponse> {
    const result = await this.gameService.getExploreEvents(accountId, {
      status: "pending",
      limit: "10",
    });
    const entries: LogInput[] = result.events.length
      ? result.events.flatMap((event) => toExploreEventEntries(event, result.events.length === 1))
      : [{ tone: "info", text: "暂无待处理奇遇。" }];
    return this.success(
      "explore_events",
      entries,
      result,
      ["events"],
      result.events[0]?.choices[0]
        ? [
            {
              label: "处理首个奇遇",
              command:
                result.events.length === 1
                  ? `奇遇 ${result.events[0].choices[0].choice_id}`
                  : `奇遇 ${result.events[0].event_id} ${result.events[0].choices[0].choice_id}`,
            },
          ]
        : [{ label: "继续探索", command: "探索 冀州 1" }],
    );
  }

  private async resolveExploreEvent(
    input: { accountId: string; idempotencyKey: string },
    eventId: string | undefined,
    choiceId: string,
  ): Promise<TextCommandResponse> {
    let targetEventId = eventId;
    if (!targetEventId) {
      const pendingEvents = await this.gameService.getExploreEvents(input.accountId, {
        limit: "2",
        status: "pending",
      });
      if (pendingEvents.events.length === 0) {
        return this.failure("explore_event_resolve", "暂无待处理奇遇。", [
          { label: "继续探索", command: "探索 冀州 1" },
        ]);
      }
      if (pendingEvents.events.length > 1) {
        return this.failure(
          "explore_event_resolve",
          "当前有多条待处理奇遇，请先输入“奇遇”查看事件ID，再指定要处理的那一条。",
          [{ label: "查看奇遇", command: "奇遇" }],
        );
      }
      targetEventId = pendingEvents.events[0]?.event_id;
    }

    if (!targetEventId) {
      return this.failure("explore_event_resolve", "未找到可处理的探索奇遇。", [
        { label: "查看奇遇", command: "奇遇" },
      ]);
    }

    const result = await this.gameService.resolveExploreEvent({
      ...input,
      body: { event_id: targetEventId, choice_id: choiceId },
    });
    return this.success(
      "explore_event_resolve",
      [
        {
          tone: "success",
          text: `奇遇“${result.event.title}”已处理。${formatRewards(result.rewards)}`,
        },
      ],
      result,
      ["overview", "events", "tasks"],
      [{ label: "继续探索", command: "探索 冀州 1" }],
    );
  }

  private async caveStatus(accountId: string): Promise<TextCommandResponse> {
    const overview = await this.gameService.getOverview(accountId);
    const cave = overview.cave;
    if (!cave) {
      return this.failure("cave_status", "洞府状态尚未准备完成。", [
        { label: "查看状态", command: "状态" },
      ]);
    }
    return this.success(
      "cave_status",
      [
        {
          tone: "info",
          text: `洞府已积累 ${cave.claimable_minutes} 分钟，预计收获：${formatRewards(cave.preview_rewards)}`,
        },
      ],
      overview,
      ["cave", "overview"],
      [{ label: "领取洞府", command: "领取洞府" }],
    );
  }

  private async collectCave(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<TextCommandResponse> {
    const result = await this.gameService.collectCave(input);
    return this.success(
      "cave_collect",
      [{ tone: "success", text: `洞府收取完成。${formatRewards(result.rewards)}` }],
      result,
      ["overview", "cave", "tasks"],
      [{ label: "查看任务", command: "任务" }],
    );
  }

  private async taskList(accountId: string): Promise<TextCommandResponse> {
    const result = await this.gameService.getTasks(accountId);
    const entries: LogInput[] = result.tasks.length
      ? result.tasks.map((task) => ({
          tone: task.status === "completed" ? "success" : "info",
          text: `${task.title}：${task.progress_value}/${task.target_value}（${taskStatusLabel(task.status)}）${task.status === "completed" ? `，领取：领取任务 ${task.task_id}` : ""}`,
        }))
      : [{ tone: "info", text: "当前没有可显示的任务。" }];
    const claimable = result.tasks.find((task) => task.status === "completed");
    return this.success(
      "task_list",
      entries,
      result,
      ["tasks"],
      claimable
        ? [{ label: "领取已完成任务", command: `领取任务 ${claimable.task_id}` }]
        : [{ label: "前往探索", command: "探索 冀州 1" }],
    );
  }

  private async claimTask(
    input: { accountId: string; idempotencyKey: string },
    taskId: string,
  ): Promise<TextCommandResponse> {
    const result = await this.gameService.claimTask({ ...input, taskId });
    return this.success(
      "task_claim",
      [
        {
          tone: "success",
          text: `已领取任务“${result.task.title}”。${formatRewards(result.rewards)}`,
        },
      ],
      result,
      ["overview", "tasks"],
      [{ label: "查看状态", command: "状态" }],
    );
  }

  private async craftableMaterials(
    accountId: string,
    kind: ProductionFormulaKind,
  ): Promise<TextCommandResponse> {
    const result = await this.productionService.getCraftableMaterials(accountId, kind);
    const craftLabel = kind === "alchemy" ? "丹材" : "器材";
    return this.success(
      "craft_materials",
      [
        {
          tone: "info",
          text: `可投炉${craftLabel}只会消耗以下专用材料，普通背包材料不会被投入。`,
        },
        ...result.materials.map((material) => ({
          tone: "info" as const,
          text: `${material.name}（${material.item_id}）：${material.source_hint}。`,
        })),
        {
          tone: "info",
          text:
            kind === "alchemy"
              ? "用法：炼丹 <材料名或ID>x<数量> ...，例如：炼丹 月露草x2 灵髓露x1。"
              : "用法：炼器 <材料名或ID>x<数量> ...，例如：炼器 星纹铁x3 灵木芯x1。",
        },
      ],
      result,
      ["bag"],
      [
        {
          label: kind === "alchemy" ? "尝试炼丹" : "尝试炼器",
          command: kind === "alchemy" ? "炼丹 月露草x2 灵髓露x1" : "炼器 星纹铁x3 灵木芯x1",
        },
      ],
    );
  }

  private async craftAlchemy(
    input: { accountId: string; idempotencyKey: string },
    materialSpecs: string[],
  ): Promise<TextCommandResponse> {
    const materials = await this.resolveCraftMaterials(input.accountId, "alchemy", materialSpecs);
    if (typeof materials === "string") {
      return this.failure("alchemy_craft", materials, [
        { label: "查看丹材", command: "材料 炼丹" },
      ]);
    }
    const result = await this.productionService.craftAlchemy({
      accountId: input.accountId,
      body: { materials },
      idempotencyKey: input.idempotencyKey,
    });
    const success = result.record.success;
    const productName = result.discovery.result_template?.name ?? "未知丹药";
    return this.success(
      "alchemy_craft",
      [
        {
          tone: success ? "success" : "warning",
          text: success
            ? `丹炉成丹：${productName}。${formatRewards(result.rewards)}`
            : `丹炉未能成丹，本次组合的反应已记录。${formatRewards(result.rewards)}`,
        },
      ],
      result,
      ["overview", "bag", "tasks", "formulas"],
      success
        ? [
            {
              label: "保存本次单方",
              command: `保存单方 炼丹 ${result.record_id} 未命名单方`,
            },
          ]
        : [{ label: "查看丹材", command: "材料 炼丹" }],
    );
  }

  private async craftForge(
    input: { accountId: string; idempotencyKey: string },
    materialSpecs: string[],
  ): Promise<TextCommandResponse> {
    const materials = await this.resolveCraftMaterials(input.accountId, "forge", materialSpecs);
    if (typeof materials === "string") {
      return this.failure("forge_craft", materials, [{ label: "查看器材", command: "材料 炼器" }]);
    }
    const result = await this.productionService.craftForge({
      accountId: input.accountId,
      body: { materials },
      idempotencyKey: input.idempotencyKey,
    });
    const success = result.discovery.success;
    const productName =
      result.equipment?.name ?? result.discovery.result_template?.name ?? "未知法宝";
    return this.success(
      "forge_craft",
      [
        {
          tone: success ? "success" : "warning",
          text: success
            ? `器炉成器：${productName}。`
            : `器炉未能成器，本次组合的反应已记录。${formatRewards(result.rewards ?? {})}`,
        },
      ],
      result,
      ["overview", "bag", "equipment", "tasks", "formulas"],
      success
        ? [
            {
              label: "保存本次单方",
              command: `保存单方 炼器 ${result.record_id} 未命名单方`,
            },
          ]
        : [{ label: "查看器材", command: "材料 炼器" }],
    );
  }

  private async usePill(
    input: { accountId: string; idempotencyKey: string },
    pillSelector: string,
  ): Promise<TextCommandResponse> {
    const bag = await this.productionService.getBagItems(input.accountId);
    const pill = bag.items.find(
      (item) =>
        item.category === "pill" &&
        !item.expired &&
        !item.locked &&
        matchesBagItem(item, pillSelector),
    );
    if (!pill) {
      return this.failure(
        "pill_use",
        `背包中未找到可服用的丹药“${pillSelector}”。可输入“背包”查看丹药名称。`,
        [{ label: "查看背包", command: "背包" }],
      );
    }

    const result = await this.productionService.usePill({
      accountId: input.accountId,
      body: { item_instance_id: pill.item_instance_id },
      idempotencyKey: input.idempotencyKey,
    });
    return this.success(
      "pill_use",
      [
        {
          tone: "success",
          text: `服丹完成：${result.effect_note ?? `修为变化为 ${result.before_cultivation} → ${result.after_cultivation}。`}`,
        },
      ],
      result,
      ["overview", "bag"],
      [{ label: "查看背包", command: "背包" }],
    );
  }

  private async formulaList(
    accountId: string,
    scope: "mine" | "public",
    kind: ProductionFormulaKind | undefined,
    keyword: string | undefined,
  ): Promise<TextCommandResponse> {
    const result = await this.productionService.listProductionFormulas(accountId, {
      kind,
      scope,
      keyword,
    });
    const entries: LogInput[] = result.formulas.length
      ? result.formulas.map((formula) => ({
          tone: formula.visibility === "public" ? "success" : "info",
          text: `${formula.name}（${formula.kind === "alchemy" ? "丹方" : "器方"}，${formula.visibility === "public" ? "公开" : "私有"}）：${formula.formula_id}`,
        }))
      : [
          {
            tone: "info",
            text: scope === "public" ? "暂无公开单方。" : "尚未保存单方；成功炼制后可保存。",
          },
        ];
    return this.success(
      "formula_list",
      entries,
      result,
      ["formulas"],
      result.formulas[0]
        ? [{ label: "使用首个单方", command: `使用单方 ${result.formulas[0].formula_id}` }]
        : [{ label: "查看丹材", command: "材料 炼丹" }],
    );
  }

  private async saveFormula(
    input: { accountId: string; idempotencyKey: string },
    kind: ProductionFormulaKind,
    sourceRecordId: string,
    name: string,
  ): Promise<TextCommandResponse> {
    const result = await this.productionService.saveProductionFormula({
      accountId: input.accountId,
      body: { kind, source_record_id: sourceRecordId, name },
      idempotencyKey: input.idempotencyKey,
    });
    return this.formulaMutationResponse(
      "formula_save",
      result,
      `单方“${result.formula.name}”已保存为私有单方。`,
      ["formulas"],
      [{ label: "公开此单方", command: `公开单方 ${result.formula.formula_id}` }],
    );
  }

  private async publishFormula(
    input: { accountId: string; idempotencyKey: string },
    formulaId: string,
  ): Promise<TextCommandResponse> {
    const result = await this.productionService.publishProductionFormula({
      accountId: input.accountId,
      formulaId,
      idempotencyKey: input.idempotencyKey,
    });
    return this.formulaMutationResponse(
      "formula_publish",
      result,
      `单方“${result.formula.name}”现已公开。`,
      ["formulas"],
      [{ label: "使用此单方", command: `使用单方 ${result.formula.formula_id}` }],
    );
  }

  private async unpublishFormula(
    input: { accountId: string; idempotencyKey: string },
    formulaId: string,
  ): Promise<TextCommandResponse> {
    const result = await this.productionService.unpublishProductionFormula({
      accountId: input.accountId,
      formulaId,
      idempotencyKey: input.idempotencyKey,
    });
    return this.formulaMutationResponse(
      "formula_unpublish",
      result,
      `单方“${result.formula.name}”已恢复为私有。`,
      ["formulas"],
      [{ label: "查看我的单方", command: "单方列表" }],
    );
  }

  private async craftFormula(
    input: { accountId: string; idempotencyKey: string },
    formulaId: string,
  ): Promise<TextCommandResponse> {
    const result = await this.productionService.craftProductionFormula({
      accountId: input.accountId,
      formulaId,
      idempotencyKey: input.idempotencyKey,
    });
    const success = formulaCraftSucceeded(result);
    return this.success(
      "formula_craft",
      [
        {
          tone: success ? "success" : "warning",
          text: success
            ? `已按单方“${result.formula.name}”完成炼制。`
            : `单方“${result.formula.name}”本次未能成功炼制。`,
        },
      ],
      result,
      ["overview", "bag", "equipment", "formulas", "tasks"],
      [{ label: "查看单方", command: "单方列表" }],
    );
  }

  private formulaMutationResponse(
    commandId: "formula_save" | "formula_publish" | "formula_unpublish",
    result: ProductionFormulaResponse,
    text: string,
    refresh: TextCommandRefreshTarget[],
    suggestions: TextCommandSuggestion[],
  ): TextCommandResponse {
    return this.success(commandId, [{ tone: "success", text }], result, refresh, suggestions);
  }

  private async resolveCraftMaterials(
    accountId: string,
    kind: ProductionFormulaKind,
    materialSpecs: string[],
  ): Promise<Array<{ item_id: string; count: number }> | string> {
    const result = await this.productionService.getCraftableMaterials(accountId, kind);
    return resolveCraftMaterialSpecs(result.materials, materialSpecs, kind);
  }

  private async towerList(): Promise<TextCommandResponse> {
    const result = await this.multiplayerService.getTowers();
    return this.success(
      "tower_list",
      result.towers.map((tower) => ({
        tone: "info",
        text: `${tower.tower_name}：封印 ${tower.seal_progress}，裂隙压力 ${tower.rift_pressure}。`,
      })),
      result,
      ["towers"],
      result.towers[0]
        ? [{ label: "镇封玄铁塔", command: `九塔 ${result.towers[0].tower_name} 镇封 1` }]
        : defaultSuggestions,
    );
  }

  private async towerAction(
    input: { accountId: string; idempotencyKey: string },
    towerSelector: string,
    actionType: TowerActionType,
    count: number,
  ): Promise<TextCommandResponse> {
    const towerList = await this.multiplayerService.getTowers();
    const tower = findTower(towerList, towerSelector);
    if (!tower) {
      return this.failure(
        "tower_action",
        `未找到封印塔“${towerSelector}”。请先输入“九塔”查看可用塔名。`,
        [{ label: "查看九塔", command: "九塔" }],
      );
    }
    const result = await this.multiplayerService.submitTowerAction({
      accountId: input.accountId,
      body: { tower_id: tower.tower_id, action_type: actionType, count },
      idempotencyKey: input.idempotencyKey,
    });
    return this.success(
      "tower_action",
      [
        {
          tone: result.settlement_status === "delayed" ? "warning" : "success",
          text: `已向${result.tower.tower_name}${towerActionLabel(actionType)} ${count} 次，贡献 +${result.contribution}。${formatRewards(result.rewards)}`,
        },
      ],
      result,
      ["overview", "towers", "tasks", "scrolls"],
      [{ label: "查看卷轴", command: "卷轴" }],
    );
  }

  private async scrollList(accountId: string): Promise<TextCommandResponse> {
    const result = await this.storyService.getScrolls(accountId);
    return this.success(
      "scroll_list",
      result.scrolls.map((scroll) => ({
        tone: scroll.unlock_state === "unlocked" ? "info" : "warning",
        text: `${scroll.title}：${scroll.subtitle}（${scroll.unlock_state === "unlocked" ? "已解锁" : "未解锁"}）`,
      })),
      result,
      ["scrolls"],
      result.scrolls[0]
        ? [{ label: "阅读首卷", command: `卷轴 ${result.scrolls[0].scroll_id}` }]
        : defaultSuggestions,
    );
  }

  private async scrollDetail(
    accountId: string,
    scrollSelector: string,
  ): Promise<TextCommandResponse> {
    const scrolls = await this.storyService.getScrolls(accountId);
    const scroll = findScroll(scrolls, scrollSelector);
    if (!scroll) {
      return this.failure(
        "scroll_detail",
        `未找到卷轴“${scrollSelector}”。请先输入“卷轴”查看可用卷轴。`,
        [{ label: "查看卷轴", command: "卷轴" }],
      );
    }
    const result = await this.storyService.getScrollDetail(accountId, scroll.scroll_id);
    return this.success(
      "scroll_detail",
      [
        { tone: "info", text: `${result.scroll.title}：${result.scroll.subtitle}` },
        ...result.scroll.fragments.map(
          (fragment): LogInput => ({
            tone: fragment.unlocked ? "info" : "warning",
            text: `${fragment.title}：${fragment.body}`,
          }),
        ),
      ],
      result,
      ["scrolls"],
      [{ label: "查看战报", command: "战报" }],
    );
  }

  private async battleList(accountId: string): Promise<TextCommandResponse> {
    const result = await this.gameService.getBattles(accountId, { limit: "8" });
    return this.success(
      "battle_list",
      result.battles.length
        ? result.battles.map(
            (battle): LogInput => ({
              tone: battle.result === "win" ? "success" : "warning",
              text: `${battle.enemy_name}：${battle.result === "win" ? "胜" : "败"}，${battle.rounds} 回合。查看：战报 ${battle.battle_id}`,
            }),
          )
        : [{ tone: "info", text: "尚无战报。完成一次探索后会留下战斗记录。" }],
      result,
      ["battles"],
      result.battles[0]
        ? [{ label: "阅读最近战报", command: `战报 ${result.battles[0].battle_id}` }]
        : [{ label: "探索冀州", command: "探索 冀州 1" }],
    );
  }

  private async battleDetail(accountId: string, battleId: string): Promise<TextCommandResponse> {
    const result = await this.storyService.getBattleNarrative(accountId, battleId);
    return this.success(
      "battle_detail",
      [
        { tone: "info", text: `${result.title}：${result.summary}` },
        ...result.narrative_lines.map((line): LogInput => ({ tone: "info", text: line })),
        ...result.result_reason.map((line): LogInput => ({ tone: "info", text: `战况：${line}` })),
      ],
      result,
      ["battles", "scrolls"],
      [{ label: "查看卷轴", command: "卷轴" }],
    );
  }

  private success(
    commandId: Exclude<TextCommandId, "invalid">,
    entries: LogInput[],
    result: TextCommandResult,
    refresh: TextCommandRefreshTarget[],
    suggestions: TextCommandSuggestion[],
  ): TextCommandResponse {
    return {
      command_id: commandId,
      entries: toEntries(entries),
      state: { refresh, result, suggestions },
    };
  }

  private withSuggestions(
    commandId: Exclude<TextCommandId, "invalid">,
    entries: LogInput[],
  ): TextCommandResponse {
    return {
      command_id: commandId,
      entries: toEntries(entries),
      state: { refresh: [], suggestions: defaultSuggestions },
    };
  }

  private failure(
    commandId: TextCommandId,
    message: string,
    suggestions: TextCommandSuggestion[] = defaultSuggestions,
  ): TextCommandResponse {
    return {
      command_id: commandId,
      entries: toEntries([{ tone: "error", text: message }]),
      state: { refresh: [], suggestions },
    };
  }
}

interface LogInput {
  tone: TextCommandLogTone;
  text: string;
}

function toExploreEventEntries(event: ExploreEventState, canOmitEventId: boolean): LogInput[] {
  return [
    {
      tone: "warning",
      text: `探索奇遇“${event.title}”：${event.description}`,
    },
    {
      tone: "info",
      text: "请从以下选项中选择，并输入对应指令：",
    },
    ...event.choices.map((choice) => ({
      tone: "info" as const,
      text: `选项 ${choice.choice_id}：${choice.label}（${choice.reward_preview}）。输入：奇遇 ${canOmitEventId ? choice.choice_id : `${event.event_id} ${choice.choice_id}`}`,
    })),
  ];
}

function parseCommand(input: TextCommandRequest): ParsedCommand | InvalidCommand {
  const raw = typeof input?.command === "string" ? input.command.trim() : "";
  if (!raw) {
    return invalid("请输入指令。示例：状态、修炼、探索 冀州 1。");
  }
  if (raw.length > 120) {
    return invalid("指令过长，请使用简短的确定性指令。可输入“帮助”查看用法。");
  }

  const tokens = raw.replace(/[，,]/g, " ").split(/\s+/).filter(Boolean);
  const command = normalizeToken(tokens[0] === "?" ? "help" : tokens[0].replace(/^\//, ""));
  const args = tokens.slice(1);

  if (["帮助", "help", "指令"].includes(command)) {
    return noArguments("help", args, "帮助");
  }
  if (["状态", "人物", "面板", "status"].includes(command)) {
    return noArguments("status", args, "状态");
  }
  if (["背包", "纳物囊", "包裹", "bag"].includes(command)) {
    if (args.length > 1) {
      return invalid("背包指令最多接受一个物品名或ID。用法：背包 [物品名或ID]。");
    }
    return { commandId: "bag", ...(args[0] ? { selector: args[0] } : {}) };
  }
  if (["修炼", "吐纳", "收功"].includes(command)) {
    return noArguments("cultivation_claim", args, "修炼");
  }
  if (["突破", "breakthrough"].includes(command)) {
    return noArguments("breakthrough", args, "突破");
  }
  if (["探索领取", "领取探索", "探索结算", "领取游历"].includes(command)) {
    if (args.length > 1) {
      return invalid("探索领取最多接受一个探索记录ID。用法：领取探索 [探索记录ID]。");
    }
    return { commandId: "explore_claim", ...(args[0] ? { recordId: args[0] } : {}) };
  }
  if (["探索", "游历", "explore"].includes(command)) {
    if (args.length < 1 || args.length > 2) {
      return invalid("请指定州域与可选次数。用法：探索 <州域> [次数]，例如：探索 冀州 1。");
    }
    const province = resolveProvince(args[0]);
    if (!province) {
      return invalid(`未知州域“${args[0]}”。用法：探索 <州域> [次数]，例如：探索 冀州 1。`);
    }
    const count = args[1] ? parseCount(args[1]) : 1;
    if (!count) {
      return invalid("探索次数须为 1-5 的整数。用法：探索 冀州 1。");
    }
    return { commandId: "explore", province, count };
  }
  if (["奇遇", "处理奇遇"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "explore_events" };
    }
    if (args.length === 1) {
      return { commandId: "explore_event_resolve", choiceId: args[0] };
    }
    if (args.length !== 2) {
      return invalid(
        "奇遇用法：单条待选奇遇可输入“奇遇 <选项ID>”；多条时输入“奇遇 <事件ID> <选项ID>”。",
      );
    }
    return { commandId: "explore_event_resolve", eventId: args[0], choiceId: args[1] };
  }
  if (["洞府", "洞府状态"].includes(command)) {
    return noArguments("cave_status", args, "洞府");
  }
  if (["领取洞府", "洞府领取", "收取洞府"].includes(command)) {
    return noArguments("cave_collect", args, "领取洞府");
  }
  if (["任务", "task"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "task_list" };
    }
    if (args.length === 2 && normalizeToken(args[0]) === "领取") {
      return { commandId: "task_claim", taskId: args[1] };
    }
    return invalid("任务指令用法：任务，或 任务 领取 <任务ID>。");
  }
  if (["领取任务", "任务领取"].includes(command)) {
    if (args.length !== 1) {
      return invalid("请提供任务ID。用法：领取任务 <任务ID>。");
    }
    return { commandId: "task_claim", taskId: args[0] };
  }
  if (["材料", "材料列表", "丹器材料"].includes(command)) {
    if (args.length !== 1) {
      return invalid("请指定材料类别。用法：材料 <炼丹|炼器>。");
    }
    const kind = resolveFormulaKind(args[0]);
    if (!kind) {
      return invalid("材料类别只能是炼丹或炼器。用法：材料 <炼丹|炼器>。");
    }
    return { commandId: "craft_materials", kind };
  }
  if (["炼丹", "炼制丹药", "alchemy"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "craft_materials", kind: "alchemy" };
    }
    return { commandId: "alchemy_craft", materialSpecs: args };
  }
  if (["炼器", "炼制法宝", "forge"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "craft_materials", kind: "forge" };
    }
    return { commandId: "forge_craft", materialSpecs: args };
  }
  if (["服丹", "服药", "usepill"].includes(command)) {
    if (args.length !== 1) {
      return invalid("请提供丹药名或实例ID。用法：服丹 <丹药名或ID>，例如：服丹 蕴灵丹。");
    }
    return { commandId: "pill_use", pillSelector: args[0] };
  }
  if (["单方", "单方列表", "formula", "formulas"].includes(command)) {
    return parseFormulaList(args);
  }
  if (["保存单方", "保存配方"].includes(command)) {
    if (args.length < 3) {
      return invalid("请提供种类、成功记录ID和名称。用法：保存单方 <炼丹|炼器> <记录ID> <名称>。");
    }
    const kind = resolveFormulaKind(args[0]);
    if (!kind) {
      return invalid("单方种类只能是炼丹或炼器。用法：保存单方 <炼丹|炼器> <记录ID> <名称>。");
    }
    return {
      commandId: "formula_save",
      kind,
      sourceRecordId: args[1],
      name: args.slice(2).join(" "),
    };
  }
  if (["公开单方", "公开配方"].includes(command)) {
    if (args.length !== 1) {
      return invalid("请提供单方ID。用法：公开单方 <单方ID>。");
    }
    return { commandId: "formula_publish", formulaId: args[0] };
  }
  if (["取消公开单方", "私有单方", "取消公开配方"].includes(command)) {
    if (args.length !== 1) {
      return invalid("请提供单方ID。用法：取消公开单方 <单方ID>。");
    }
    return { commandId: "formula_unpublish", formulaId: args[0] };
  }
  if (["使用单方", "炼制单方", "使用配方"].includes(command)) {
    if (args.length !== 1) {
      return invalid("请提供单方ID。用法：使用单方 <单方ID>。");
    }
    return { commandId: "formula_craft", formulaId: args[0] };
  }
  if (["九塔", "封印塔", "tower"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "tower_list" };
    }
    if (args.length < 2 || args.length > 3) {
      return invalid("九塔指令用法：九塔 <塔名> <镇封|破阵|补给|守卫> [次数]。");
    }
    const actionType = resolveTowerAction(args[1]);
    if (!actionType) {
      return invalid("未知九塔行动。可使用：镇封、破阵、补给、守卫。");
    }
    const count = args[2] ? parseCount(args[2]) : 1;
    if (!count) {
      return invalid("九塔次数须为 1-5 的整数。用法：九塔 玄铁塔 镇封 1。");
    }
    return { commandId: "tower_action", towerSelector: args[0], actionType, count };
  }
  if (["卷轴", "剧情", "scroll"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "scroll_list" };
    }
    if (args.length !== 1) {
      return invalid("卷轴指令只接受一个卷轴ID或标题。用法：卷轴 <卷轴ID或标题>。");
    }
    return { commandId: "scroll_detail", scrollSelector: args[0] };
  }
  if (["战报", "战斗", "battle"].includes(command)) {
    if (args.length === 0) {
      return { commandId: "battle_list" };
    }
    if (args.length !== 1) {
      return invalid("战报指令只接受一个战报ID。用法：战报 <战报ID>。");
    }
    return { commandId: "battle_detail", battleId: args[0] };
  }
  if (command === "领取") {
    if (args.length === 1 && ["洞府", "cave"].includes(normalizeToken(args[0]))) {
      return { commandId: "cave_collect" };
    }
    if (args.length === 2 && ["任务", "task"].includes(normalizeToken(args[0]))) {
      return { commandId: "task_claim", taskId: args[1] };
    }
    if (
      args.length >= 1 &&
      args.length <= 2 &&
      ["探索", "游历", "explore"].includes(normalizeToken(args[0]))
    ) {
      return { commandId: "explore_claim", ...(args[1] ? { recordId: args[1] } : {}) };
    }
    return invalid("领取指令用法：领取 洞府、领取 任务 <任务ID>，或 领取 探索 [探索记录ID]。");
  }

  return invalid(`未识别指令“${tokens[0]}”。可输入“帮助”查看可用指令。`);
}

function isBareExploreCommand(value: string | undefined): boolean {
  const normalized = normalizeToken((value ?? "").replace(/^\//, ""));
  return ["探索", "游历", "explore"].includes(normalized);
}

function parseFormulaList(args: string[]): ParsedCommand | InvalidCommand {
  if (args.length > 3) {
    return invalid(
      "单方列表最多接受公开范围、单方类别和一个关键词。用法：单方列表 [公开] [炼丹|炼器] [关键词]。",
    );
  }

  let scope: "mine" | "public" = "mine";
  let scopeSpecified = false;
  let kind: ProductionFormulaKind | undefined;
  let keyword: string | undefined;
  for (const arg of args) {
    const normalized = normalizeToken(arg);
    if (["公开", "public"].includes(normalized)) {
      if (scopeSpecified) {
        return invalid("公开范围重复。用法：单方列表 [公开] [炼丹|炼器] [关键词]。");
      }
      scope = "public";
      scopeSpecified = true;
      continue;
    }
    if (["我的", "私有", "mine"].includes(normalized)) {
      if (scopeSpecified) {
        return invalid("单方范围重复。用法：单方列表 [公开] [炼丹|炼器] [关键词]。");
      }
      scope = "mine";
      scopeSpecified = true;
      continue;
    }
    const parsedKind = resolveFormulaKind(arg);
    if (parsedKind) {
      if (kind) {
        return invalid("单方列表只能筛选一种类别。用法：单方列表 [公开] [炼丹|炼器] [关键词]。");
      }
      kind = parsedKind;
      continue;
    }
    if (keyword) {
      return invalid("单方列表只能指定一个关键词。用法：单方列表 [公开] [炼丹|炼器] [关键词]。");
    }
    if (arg.length > 24) {
      return invalid("单方关键词不能超过 24 个字符。用法：单方列表 [公开] [炼丹|炼器] [关键词]。");
    }
    keyword = arg;
  }

  return { commandId: "formula_list", kind, keyword, scope };
}

function noArguments<TCommandId extends Exclude<TextCommandId, "invalid">>(
  commandId: TCommandId,
  args: string[],
  syntax: string,
): ParsedCommand | InvalidCommand {
  return args.length === 0
    ? ({ commandId } as ParsedCommand)
    : invalid(`“${syntax}”不接受参数。用法：${syntax}。`);
}

function invalid(message: string): InvalidCommand {
  return { commandId: "invalid", message };
}

function parseCount(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 1 && count <= 5 ? count : null;
}

function resolveProvince(value: string): string | null {
  const normalized = normalizeToken(value);
  const matched = Object.entries(provinceAliases).find(([, aliases]) =>
    aliases.some((alias) => normalizeToken(alias) === normalized),
  );
  return matched?.[0] ?? null;
}

function resolveTowerAction(value: string): TowerActionType | null {
  const normalized = normalizeToken(value);
  if (["镇封", "封印", "seal"].includes(normalized)) {
    return "seal";
  }
  if (["破阵", "破封", "破除", "break"].includes(normalized)) {
    return "break";
  }
  if (["补给", "供给", "supply"].includes(normalized)) {
    return "supply";
  }
  if (["守卫", "守护", "guard"].includes(normalized)) {
    return "guard";
  }
  return null;
}

function resolveFormulaKind(value: string): ProductionFormulaKind | null {
  const normalized = normalizeToken(value);
  if (["炼丹", "丹", "丹方", "alchemy"].includes(normalized)) {
    return "alchemy";
  }
  if (["炼器", "器", "器方", "forge"].includes(normalized)) {
    return "forge";
  }
  return null;
}

function resolveCraftMaterialSpecs(
  available: Array<{ item_id: string; name: string }>,
  specs: string[],
  kind: ProductionFormulaKind,
): Array<{ item_id: string; count: number }> | string {
  const materials: Array<{ item_id: string; count: number }> = [];
  for (const spec of specs) {
    const parsed = parseCraftMaterialSpec(spec);
    if (!parsed) {
      return `材料“${spec}”格式不正确。用法：材料名或IDx数量，例如：月露草x2。`;
    }
    const material = available.find(
      (item) =>
        normalizeToken(item.item_id) === normalizeToken(parsed.selector) ||
        normalizeToken(item.name) === normalizeToken(parsed.selector),
    );
    if (!material) {
      return `材料“${parsed.selector}”不可投入当前炉鼎。请先输入“材料 ${kind === "alchemy" ? "炼丹" : "炼器"}”查看可用材料。`;
    }
    materials.push({ item_id: material.item_id, count: parsed.count });
  }
  return materials;
}

function parseCraftMaterialSpec(value: string): { selector: string; count: number } | null {
  const matched = /^(.+?)[x×*](\d+)$/iu.exec(value);
  if (!matched) {
    return null;
  }
  const selector = matched[1].trim();
  const count = Number(matched[2]);
  if (!selector || !Number.isSafeInteger(count) || count < 1 || count > 99) {
    return null;
  }
  return { selector, count };
}

function formulaCraftSucceeded(result: FormulaCraftResponse): boolean {
  return "record" in result.result ? result.result.record.success : result.result.discovery.success;
}

function findTower(result: TowerListResponse, selector: string) {
  const normalized = normalizeToken(selector);
  return result.towers.find((tower) => {
    const aliases = [
      tower.tower_id,
      tower.tower_name,
      tower.tower_name.replace(/塔$/, ""),
      tower.province_id,
      ...(provinceAliases[tower.province_id] ?? []),
    ];
    return aliases.some((alias) => normalizeToken(alias) === normalized);
  });
}

function findScroll(result: StoryScrollListResponse, selector: string) {
  const normalized = normalizeToken(selector);
  return result.scrolls.find(
    (scroll) =>
      normalizeToken(scroll.scroll_id) === normalized ||
      normalizeToken(scroll.title) === normalized,
  );
}

function normalizeToken(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function matchesBagItem(item: BagItemState, selector: string): boolean {
  const normalizedSelector = normalizeToken(selector);
  return [item.item_instance_id, item.item_id, item.name].some(
    (candidate) => normalizeToken(candidate) === normalizedSelector,
  );
}

function summarizeBagItems(items: BagItemState[]): BagItemState[] {
  const grouped = new Map<string, BagItemState>();
  for (const item of items) {
    const key = [item.item_id, item.quality ?? "", item.bind_type, item.locked, item.expired].join(
      ":",
    );
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item });
      continue;
    }
    existing.count = (BigInt(existing.count) + BigInt(item.count)).toString();
  }
  return [...grouped.values()];
}

function formatPillQuality(quality: BagItemState["quality"]): string {
  if (!quality) {
    return "";
  }
  const labels = {
    low: "下品",
    middle: "中品",
    high: "上品",
    best: "极品",
    flawless: "无瑕",
  } satisfies Record<NonNullable<BagItemState["quality"]>, string>;
  return `（${labels[quality]}）`;
}

function taskStatusLabel(status: TaskSummaryResponse["tasks"][number]["status"]): string {
  if (status === "completed") {
    return "可领取";
  }
  if (status === "claimed") {
    return "已领取";
  }
  return "进行中";
}

function towerActionLabel(actionType: TowerActionType): string {
  return (
    {
      seal: "镇封",
      break: "破阵",
      supply: "补给",
      guard: "守卫",
    }[actionType] ?? actionType
  );
}

function formatRewards(rewards: {
  cultivation?: string;
  spirit_stone?: string;
  items?: Array<{ name: string; count: number }>;
}): string {
  const parts: string[] = [];
  if (rewards.cultivation && rewards.cultivation !== "0") {
    parts.push(`修为 +${rewards.cultivation}`);
  }
  if (rewards.spirit_stone && rewards.spirit_stone !== "0") {
    parts.push(`灵石 +${rewards.spirit_stone}`);
  }
  for (const item of rewards.items ?? []) {
    if (item.count > 0) {
      parts.push(`${item.name} ×${item.count}`);
    }
  }
  return parts.length ? `获得：${parts.join("、")}。` : "未获得额外奖励。";
}

function toEntries(inputs: LogInput[]): TextCommandLogEntry[] {
  return inputs.map((input, index) => ({
    entry_id: `entry_${index + 1}`,
    tone: input.tone,
    text: input.text,
  }));
}

function buildHelpEntries(): LogInput[] {
  return commandHelpGroups.flatMap((group) => [
    { tone: "info" as const, text: `【${group.title}】` },
    ...group.items.map((item) => ({
      tone: "info" as const,
      text: `${item.syntax}：${item.description}`,
    })),
  ]);
}

function suggestionsFor(commandId: Exclude<TextCommandId, "invalid">): TextCommandSuggestion[] {
  const suggestions: Partial<Record<TextCommandId, TextCommandSuggestion[]>> = {
    explore: [{ label: "查看状态", command: "状态" }],
    explore_claim: [{ label: "查看当前探索", command: "状态" }],
    explore_event_resolve: [{ label: "查看奇遇", command: "奇遇" }],
    task_claim: [{ label: "查看任务", command: "任务" }],
    tower_action: [{ label: "查看九塔", command: "九塔" }],
    scroll_detail: [{ label: "查看卷轴", command: "卷轴" }],
    battle_detail: [{ label: "查看战报", command: "战报" }],
  };
  return suggestions[commandId] ?? defaultSuggestions;
}

function getExceptionMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === "string") {
    return response;
  }
  if (response && typeof response === "object" && "message" in response) {
    const message = response.message;
    if (typeof message === "string") {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join("；");
    }
  }
  return error.message || "指令执行失败，请稍后重试。";
}
