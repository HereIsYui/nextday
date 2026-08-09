"use client";

import { GameClient } from "@nextday/game-client";
import type {
  ActivityListResponse,
  AncientTreasureListResponse,
  ApiResponse,
  BagItemState,
  BagSummaryResponse,
  BattleNarrativeResponse,
  CultivationStatus,
  EntitlementOverviewResponse,
  EquipmentListResponse,
  FactionRoutesResponse,
  GameOverviewResponse,
  HealthStatus,
  InnerWorldSummaryResponse,
  InnerWorldSupportType,
  LoginResponse,
  OfflineActionReward,
  PlayerProfileResponse,
  ProductionCraftMaterialState,
  ProductionFormulaKind,
  ProductionFormulaState,
  ProvinceSummary,
  RankListResponse,
  RankType,
  RealmProgressionResponse,
  SectDetailResponse,
  SectAlignment,
  SectListResponse,
  SkillLoadoutResponse,
  StoryScrollDetailState,
  StoryScrollListResponse,
  TowerListResponse,
  WorldBossResponse,
  WorldChatMessageState,
} from "@nextday/shared";
import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type PendingExploreEvent,
  buildExploreEventCommand,
  exploreEventIdFromCommandState,
  mergePendingExploreEvents,
  pendingExploreEventsFromCommandState,
  pendingExploreEventsFromValues,
  withoutExploreEventInstructions,
} from "./explore-event-actions";
import {
  createExploreEventAutoResolveNotice,
  createExploreEventNotice,
} from "./explore-notifications";
import {
  type TerminalTaskItem,
  formatTaskItem,
  taskItemFromClaimResult,
  taskItemsFromResult,
} from "./task-terminal-items";
import {
  type TerminalMessageBatch,
  type TerminalTone,
  mergeCommandEntries,
} from "./terminal-message-batch";

type HealthText = "检测中" | "正常" | "不可用";
type RouteValue = "qi" | "body";
type OverlayView =
  | "help"
  | "scrolls"
  | "battles"
  | "faction"
  | "realms"
  | "tools"
  | "feature"
  | "production";
type LeftPanelView = "brief" | "bag";
type FeatureKind =
  | "activity"
  | "inner_world"
  | "sect"
  | "boss"
  | "rank"
  | "ancient"
  | "tower"
  | "equipment"
  | "skills"
  | "commerce";

type FeatureData =
  | { kind: "activity"; data: ActivityListResponse }
  | { kind: "inner_world"; data: InnerWorldSummaryResponse }
  | { kind: "sect"; data: { detail: SectDetailResponse; list: SectListResponse | null } }
  | { kind: "boss"; data: WorldBossResponse }
  | { kind: "rank"; data: RankListResponse }
  | { kind: "ancient"; data: AncientTreasureListResponse }
  | { kind: "tower"; data: TowerListResponse }
  | { kind: "equipment"; data: EquipmentListResponse }
  | { kind: "skills"; data: SkillLoadoutResponse }
  | { kind: "commerce"; data: EntitlementOverviewResponse };

interface ItemDetail {
  name: string;
  usageHint: string;
  quality?: string | null;
  tradeable: boolean;
  bindType: string;
  expired?: boolean;
  left: number;
  top: number;
  above: boolean;
}

interface BreakthroughSummary {
  actionable: boolean;
  detail: string;
  state: "available" | "locked" | "maximum" | "unavailable";
  title: string;
}

interface CommandAction {
  command: string;
  label: string;
}

interface CommandHint {
  options: CommandAction[];
  text: string;
}

interface CommandHelpItem {
  aliases: string[];
  description: string;
  syntax: string;
}

interface CommandHelpGroup {
  description?: string;
  id: string;
  items: CommandHelpItem[];
  title: string;
}

interface CommandExecutionOptions {
  displayCommand?: string;
  saveToHistory?: boolean;
}

interface TerminalEntry {
  id: string;
  lines: string[];
  tasks?: TerminalTaskItem[];
  title?: string;
  tone: TerminalTone;
}

const tokenStorageKey = "nextday_m1_token";
const deviceStorageKey = "nextday_m1_device_id";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const baseQuickCommands: CommandAction[] = [
  { label: "状态", command: "状态" },
  { label: "探索", command: "探索" },
  { label: "领取洞府", command: "领取洞府" },
  { label: "任务", command: "任务" },
];

const corePlayCommands: CommandAction[] = [
  { label: "活动", command: "活动" },
  { label: "内天地", command: "内天地" },
  { label: "宗门", command: "宗门" },
  { label: "Boss", command: "Boss" },
  { label: "排行", command: "排行" },
  { label: "古宝", command: "古宝" },
  { label: "装备", command: "装备" },
  { label: "技能", command: "技能" },
  { label: "炼丹", command: "炼丹" },
  { label: "炼器", command: "炼器" },
  { label: "九塔", command: "九塔" },
  { label: "权益", command: "权益" },
];

function featureKindFromCommand(command: string): FeatureKind | null {
  return (
    ({
      活动: "activity",
      内天地: "inner_world",
      宗门: "sect",
      Boss: "boss",
      排行: "rank",
      古宝: "ancient",
      九塔: "tower",
      装备: "equipment",
      技能: "skills",
      权益: "commerce",
    }[command] as FeatureKind | undefined) ?? null
  );
}

const fallbackHelpGroups: CommandHelpGroup[] = [
  {
    id: "basic",
    title: "基础",
    items: [
      { syntax: "状态", description: "查看当前修为和可进行事项。", aliases: ["面板"] },
      {
        syntax: "背包 [物品名或ID]",
        description: "查看背包及物品用途；可指定物品查看单项说明。",
        aliases: ["纳物囊"],
      },
      { syntax: "帮助 [关键词]", description: "查看全部指令或筛选相关指令。", aliases: ["help"] },
      { syntax: "卷轴", description: "查看已解锁的章节卷轴。", aliases: ["剧情"] },
      { syntax: "战报", description: "查看最近的战斗记录。", aliases: ["记录"] },
    ],
  },
  {
    id: "cultivation",
    title: "修行与探索",
    items: [
      {
        syntax: "开始修炼",
        description: "开始长期修炼；结束行动后领取离线修为。",
        aliases: ["开始行动"],
      },
      {
        syntax: "领取行动收益",
        description: "领取已结束的长期修炼收益；探索在线自动结算，离线收益在弹窗确认。",
        aliases: ["领取行动"],
      },
      { syntax: "突破", description: "在条件满足时尝试突破境界。", aliases: [] },
      {
        syntax: "探索 <州域>",
        description: "开始指定州域的长期探索；在线收益自动结算，离线收益回归后确认领取。",
        aliases: ["游历 <州域>"],
      },
      {
        syntax: "奇遇 <选项ID>",
        description: "单条待选奇遇可直接按选项标识处理；网页中请直接点击选项。",
        aliases: [],
      },
      { syntax: "洞府收取", description: "收取洞府积累的产出。", aliases: ["洞府"] },
      { syntax: "任务领取", description: "领取已完成任务的报酬。", aliases: ["领任务"] },
      { syntax: "九塔 [塔名]", description: "查看或挑战九塔。", aliases: ["塔"] },
    ],
  },
  {
    id: "production",
    title: "炼制与单方",
    items: [
      {
        syntax: "服丹 <丹药名或ID>",
        description: "按名称直接服用背包中的一枚丹药。",
        aliases: ["服用"],
      },
      { syntax: "炼丹 <材料...>", description: "以自选材料尝试炼丹。", aliases: [] },
      { syntax: "炼器 <材料...>", description: "以自选材料尝试炼器。", aliases: [] },
      { syntax: "单方 保存 <名称>", description: "保存最近一次成功炼制的材料组合。", aliases: [] },
      { syntax: "单方 公开 <名称>", description: "将自己的单方公开给其他修士。", aliases: [] },
      { syntax: "单方 使用 <名称>", description: "按已保存单方再次投炉。", aliases: [] },
    ],
  },
];

export default function HomePage() {
  const [healthText, setHealthText] = useState<HealthText>("检测中");
  const [token, setToken] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginResponse | null>(null);
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [overview, setOverview] = useState<GameOverviewResponse | null>(null);
  const [scrolls, setScrolls] = useState<StoryScrollListResponse | null>(null);
  const [selectedScroll, setSelectedScroll] = useState<StoryScrollDetailState | null>(null);
  const [scrollDetailError, setScrollDetailError] = useState<string | null>(null);
  const [scrollDetailLoading, setScrollDetailLoading] = useState(false);
  const [faction, setFaction] = useState<FactionRoutesResponse | null>(null);
  const [realmProgression, setRealmProgression] = useState<RealmProgressionResponse | null>(null);
  const [realmProgressionError, setRealmProgressionError] = useState<string | null>(null);
  const [realmProgressionLoading, setRealmProgressionLoading] = useState(false);
  const [bag, setBag] = useState<BagSummaryResponse | null>(null);
  const [bagError, setBagError] = useState<string | null>(null);
  const [bagLoading, setBagLoading] = useState(false);
  const [helpGroups, setHelpGroups] = useState<CommandHelpGroup[]>(fallbackHelpGroups);
  const [openHelpGroupId, setOpenHelpGroupId] = useState<string | null>(
    fallbackHelpGroups[0]?.id ?? null,
  );
  const [helpError, setHelpError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [message, setMessage] = useState("尚未登录");
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [route, setRoute] = useState<RouteValue>("qi");
  const [command, setCommand] = useState("");
  const [commandSuggestions, setCommandSuggestions] = useState<CommandAction[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pendingExploreEvents, setPendingExploreEvents] = useState<PendingExploreEvent[]>([]);
  const [resolvingExploreEventId, setResolvingExploreEventId] = useState<string | null>(null);
  const [offlineActionReward, setOfflineActionReward] = useState<OfflineActionReward | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayView | null>(null);
  const [overlayReturnView, setOverlayReturnView] = useState<OverlayView | null>(null);
  const [featureCommand, setFeatureCommand] = useState<CommandAction | null>(null);
  const [featureKind, setFeatureKind] = useState<FeatureKind | null>(null);
  const [featureData, setFeatureData] = useState<FeatureData | null>(null);
  const [featureMessage, setFeatureMessage] = useState<string | null>(null);
  const [featureRankType, setFeatureRankType] = useState<RankType>("personal");
  const [skillActiveIds, setSkillActiveIds] = useState<string[]>([]);
  const [skillTreasureId, setSkillTreasureId] = useState("");
  const [innerDispatchCreature, setInnerDispatchCreature] = useState("");
  const [innerDispatchProvince, setInnerDispatchProvince] = useState("");
  const [innerSupportType, setInnerSupportType] = useState<InnerWorldSupportType>("spirit_vein");
  const [sectName, setSectName] = useState("");
  const [sectAlignment, setSectAlignment] = useState<SectAlignment>("neutral");
  const [sectTaskId, setSectTaskId] = useState("sect_patrol");
  const [sectWarehouseItemInstanceId, setSectWarehouseItemInstanceId] = useState("");
  const [sectWarehouseItemId, setSectWarehouseItemId] = useState("");
  const [factionTransferTaskId, setFactionTransferTaskId] = useState("");
  const [featureLoading, setFeatureLoading] = useState(false);
  const [productionKind, setProductionKind] = useState<ProductionFormulaKind | null>(null);
  const [productionMaterials, setProductionMaterials] = useState<ProductionCraftMaterialState[]>(
    [],
  );
  const [productionFormulas, setProductionFormulas] = useState<ProductionFormulaState[]>([]);
  const [selectedProductionFormulaId, setSelectedProductionFormulaId] = useState<string | null>(
    null,
  );
  const [selectedProductionMaterials, setSelectedProductionMaterials] = useState<
    Record<string, number>
  >({});
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionCrafting, setProductionCrafting] = useState(false);
  const [productionResult, setProductionResult] = useState<string[]>([]);
  const [productionFormulaName, setProductionFormulaName] = useState("");
  const [productionLastRecordId, setProductionLastRecordId] = useState<string | null>(null);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [battleDetail, setBattleDetail] = useState<BattleNarrativeResponse | null>(null);
  const [battleDetailLoading, setBattleDetailLoading] = useState(false);
  const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>("brief");
  const [offlineClaimOpen, setOfflineClaimOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<WorldChatMessageState[]>([]);
  const [chatMapId, setChatMapId] = useState("ji");
  const [chatAfter, setChatAfter] = useState<string | undefined>();
  const [chatContent, setChatContent] = useState("");
  const [chatItemInstanceId, setChatItemInstanceId] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([
    {
      id: "welcome",
      title: "九州传音",
      lines: ["此处只接受明确的文字指令。输入“帮助”可查看可用语法。"],
      tone: "system",
    },
  ]);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessageListRef = useRef<HTMLDivElement | null>(null);
  const exploreEventActionsRef = useRef<HTMLElement | null>(null);
  const loadVersionRef = useRef(0);
  const notificationSessionKeyRef = useRef<string | null>(null);
  const notifiedExploreEventIdsRef = useRef(new Set<string>());
  const manuallyResolvedExploreEventIdsRef = useRef(new Set<string>());
  const pendingExploreEventsRef = useRef<PendingExploreEvent[]>([]);
  const resolvingExploreEventIdsRef = useRef(new Set<string>());
  const offlineNoticeKeyRef = useRef<string | null>(null);
  const actionSettlementRef = useRef<{ actionId: string; battleCount: number } | null>(null);
  const chatAfterRef = useRef<string | undefined>(undefined);

  const activeProfile = overview?.profile ?? profile;
  const player = activeProfile?.player ?? login?.player ?? null;
  const progress = activeProfile?.progress ?? null;
  const cultivation = overview?.cultivation ?? null;
  const wallet = activeProfile?.wallet ?? null;
  const activeLongAction = overview?.action_state?.active_action ?? null;
  const recentBattles = overview?.recent_battles ?? [];
  const storyScrolls = scrolls?.scrolls ?? [];
  const readableStoryScrolls = useMemo(
    () => storyScrolls.filter((scroll) => scroll.unlock_state !== "locked"),
    [storyScrolls],
  );
  const breakthroughSummary = useMemo(() => summarizeBreakthrough(cultivation), [cultivation]);
  const visibleHelpGroups = useMemo(() => {
    if (pendingExploreEvents.length === 0) {
      return helpGroups;
    }

    return helpGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.syntax.includes("事件ID")),
      }))
      .filter((group) => group.items.length > 0);
  }, [helpGroups, pendingExploreEvents.length]);
  const bagDisplayItems = useMemo(() => summarizeBagItemsForDisplay(bag?.items ?? []), [bag]);
  const chatShareItem = useMemo(
    () => bagDisplayItems.find((item) => item.item_instance_id === chatItemInstanceId) ?? null,
    [bagDisplayItems, chatItemInstanceId],
  );
  const lastChatMessageId = chatMessages.at(-1)?.message_id;
  const showItemDetail = useCallback(
    (
      event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
      item: Pick<BagItemState, "name" | "usage_hint" | "quality" | "tradeable" | "bind_type"> & {
        expired?: boolean;
      },
    ) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const above = rect.top > Math.min(window.innerHeight * 0.58, 420);
      setItemDetail({
        name: item.name,
        usageHint: item.usage_hint,
        quality: item.quality,
        tradeable: item.tradeable,
        bindType: item.bind_type,
        expired: item.expired,
        left: Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - 248)),
        top: above ? rect.top - 8 : rect.bottom + 8,
        above,
      });
    },
    [],
  );
  const hideItemDetail = useCallback(() => setItemDetail(null), []);
  const commandHint = useMemo(
    () => buildCommandHint(command, overview?.provinces ?? [], helpGroups),
    [command, helpGroups, overview?.provinces],
  );
  const quickCommands = useMemo(() => {
    const actions = [
      ...commandSuggestions,
      ...baseQuickCommands,
    ];
    const commandSet = new Set<string>();
    return actions.filter((action) => {
      if (commandSet.has(action.command)) {
        return false;
      }
      commandSet.add(action.command);
      return true;
    });
  }, [commandSuggestions]);

  useEffect(() => {
    setOpenHelpGroupId((current) => {
      if (current && visibleHelpGroups.some((group) => group.id === current)) {
        return current;
      }
      return visibleHelpGroups[0]?.id ?? null;
    });
  }, [visibleHelpGroups]);

  const appendTerminalEntries = useCallback((entries: TerminalEntry[]) => {
    if (entries.length === 0) {
      return;
    }
    setTerminalEntries((current) => [...current, ...entries]);
  }, []);

  const refreshDashboard = useCallback(async (activeToken: string, quietly = false) => {
    const client = createClient(activeToken);
    const [overviewResult, scrollResult, factionResult] = await Promise.allSettled([
      client.gameOverview(),
      client.storyScrolls(),
      client.factionRoutes(),
    ]);

    let loaded = false;
    const errors: string[] = [];

    if (overviewResult.status === "fulfilled") {
      const nextOverview = readResponse(overviewResult.value);
      setOverview(nextOverview);
      setProfile(nextOverview.profile);
      loaded = true;
    } else {
      errors.push("个人状态");
    }

    if (scrollResult.status === "fulfilled") {
      setScrolls(readResponse(scrollResult.value));
      loaded = true;
    } else {
      errors.push("章节卷轴");
    }

    if (factionResult.status === "fulfilled") {
      setFaction(readResponse(factionResult.value));
    } else {
      errors.push("仙魔路线");
    }

    if (!loaded) {
      throw new Error("修行状态暂时无法读取");
    }

    if (!quietly && errors.length > 0) {
      setSessionError(`${errors.join("、")}暂时无法读取。`);
    }
  }, []);

  const refreshHelp = useCallback(async (activeToken: string) => {
    const client = createCommandClient(activeToken);
    const response = await client.commandHelp();
    const data = readResponse(response);
    const groups = normalizeHelpGroups(data.groups);
    if (groups.length === 0) {
      throw new Error("服务未返回可用指令");
    }
    setHelpGroups(groups);
    setHelpError(null);
  }, []);

  const refreshBag = useCallback(async (activeToken: string) => {
    setBagLoading(true);
    setBagError(null);
    try {
      const response = await createClient(activeToken).bagItems();
      setBag(readResponse(response));
    } catch (error) {
      setBagError(messageFromError(error));
    } finally {
      setBagLoading(false);
    }
  }, []);

  const refreshChat = useCallback(
    async (activeToken: string, reset = false) => {
      setChatLoading(true);
      try {
        const response = await createClient(activeToken).chatMessages(
          chatMapId,
          reset ? undefined : chatAfterRef.current,
          30,
        );
        const data = readResponse(response);
        setChatMessages((current) => {
          if (reset) return data.messages;
          const seen = new Set(current.map((item) => item.message_id));
          return [...current, ...data.messages.filter((item) => !seen.has(item.message_id))].slice(
            -80,
          );
        });
        chatAfterRef.current = data.next_cursor ?? chatAfterRef.current;
        setChatAfter(chatAfterRef.current);
      } catch {
        // 聊天属于可选信息，暂时不可用时不打断修行主流程。
      } finally {
        setChatLoading(false);
      }
    },
    [chatMapId],
  );

  const sendChatMessage = useCallback(async () => {
    if (!token || !chatContent.trim() || chatSending || busy || hydrating) return;
    setChatSending(true);
    try {
      const response = await createClient(token).sendChat(
        {
          map_id: chatMapId,
          content: chatContent.trim(),
          ...(chatShareItem ? { item_instance_id: chatShareItem.item_instance_id } : {}),
        },
        createIdempotencyKey("web_chat_send"),
      );
      const sent = readResponse(response);
      setChatMessages((current) =>
        [...current.filter((item) => item.message_id !== sent.message_id), sent].slice(-80),
      );
      chatAfterRef.current = sent.created_at;
      setChatAfter(sent.created_at);
      setChatContent("");
      setChatItemInstanceId("");
    } catch (error) {
      setSessionError(messageFromError(error));
    } finally {
      setChatSending(false);
    }
  }, [busy, chatContent, chatMapId, chatSending, chatShareItem, hydrating, token]);

  const handleShareBagItem = useCallback((item: BagItemState) => {
    setChatItemInstanceId(item.item_instance_id);
    setSessionError(null);
  }, []);

  useEffect(() => {
    if (!token || !player?.player_id || hydrating) return;
    chatAfterRef.current = undefined;
    setChatAfter(undefined);
    void refreshChat(token, true);
    const timer = window.setInterval(() => void refreshChat(token), 15_000);
    const handleFocus = () => void refreshChat(token);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [hydrating, player?.player_id, refreshChat, token]);

  useEffect(() => {
    const claimable = cultivation?.claimable_cultivation ?? "0";
    if (!token || (!cultivation && !offlineActionReward)) return;
    if (offlineActionReward?.claimable) {
      const key = `${offlineActionReward.action_id}:${offlineActionReward.from_at}:${offlineActionReward.to_at}`;
      if (offlineNoticeKeyRef.current !== key) {
        offlineNoticeKeyRef.current = key;
        setOfflineClaimOpen(true);
      }
      return;
    }
    if (!cultivation || BigInt(claimable) <= 0n || activeLongAction) return;
    const key = `${cultivation.last_cultivation_at}:${claimable}`;
    if (offlineNoticeKeyRef.current !== key) {
      offlineNoticeKeyRef.current = key;
      setOfflineClaimOpen(true);
    }
  }, [activeLongAction, cultivation, offlineActionReward, token]);

  const refreshRealmProgression = useCallback(async () => {
    if (!token || realmProgressionLoading) {
      return;
    }

    setRealmProgressionLoading(true);
    setRealmProgressionError(null);
    try {
      const response = await createClient(token).realmProgression();
      setRealmProgression(readResponse(response));
    } catch (error) {
      setRealmProgressionError(messageFromError(error));
    } finally {
      setRealmProgressionLoading(false);
    }
  }, [realmProgressionLoading, token]);

  const loadScrollDetail = useCallback(
    async (scrollId: string) => {
      if (!token || scrollDetailLoading) {
        return;
      }

      setScrollDetailLoading(true);
      setScrollDetailError(null);
      try {
        const response = await createClient(token).storyScroll(scrollId);
        setSelectedScroll(readResponse(response).scroll);
      } catch (error) {
        setScrollDetailError(messageFromError(error));
      } finally {
        setScrollDetailLoading(false);
      }
    },
    [scrollDetailLoading, token],
  );

  const loadBattleDetail = useCallback(
    async (battleId: string) => {
      if (!token || battleDetailLoading) {
        return;
      }
      setBattleDetailLoading(true);
      try {
        const response = await createClient(token).battleNarrative(battleId);
        setBattleDetail(readResponse(response));
      } catch (error) {
        setSessionError(messageFromError(error));
      } finally {
        setBattleDetailLoading(false);
      }
    },
    [battleDetailLoading, token],
  );

  const chooseFactionRoute = useCallback(
    async (routeId: string) => {
      if (!token || busy || hydrating) {
        return;
      }

      setBusy(true);
      try {
        const response = await createClient(token).chooseFactionRoute(
          { route_id: routeId },
          createIdempotencyKey("web_choose_faction"),
        );
        const result = readResponse(response);
        setFaction((current) => (current ? { ...current, state: result.state } : current));
        appendTerminalEntries([
          terminalEntry("success", "道途已定", [`你已选择${result.selected_route.name}。`]),
        ]);
        await refreshDashboard(token, true);
      } catch (error) {
        const detail = messageFromError(error);
        setSessionError(detail);
        appendTerminalEntries([terminalEntry("error", "仙魔抉择未完成", [detail])]);
      } finally {
        setBusy(false);
      }
    },
    [appendTerminalEntries, busy, hydrating, refreshDashboard, token],
  );

  const transferFactionRoute = useCallback(
    async (routeId: string, taskId: string) => {
      if (!token || busy || hydrating || !taskId) return;
      setBusy(true);
      try {
        const response = await createClient(token).transferFactionRoute(
          { route_id: routeId, task_id: taskId },
          createIdempotencyKey("web_transfer_faction"),
        );
        const result = readResponse(response);
        setFaction((current) => (current ? { ...current, state: result.state } : current));
        appendTerminalEntries([
          terminalEntry("success", "道途已转", [`已转入${result.state.route_name}。`]),
        ]);
        await refreshDashboard(token, true);
      } catch (error) {
        const detail = messageFromError(error);
        setSessionError(detail);
        appendTerminalEntries([terminalEntry("error", "道途转移未完成", [detail])]);
      } finally {
        setBusy(false);
      }
    },
    [appendTerminalEntries, busy, hydrating, refreshDashboard, token],
  );

  const loadSession = useCallback(
    async (activeToken: string) => {
      const loadVersion = ++loadVersionRef.current;
      setHydrating(true);
      setSessionError(null);

      try {
        const client = createClient(activeToken);
        const me = readResponse(await client.me());
        if (loadVersion !== loadVersionRef.current) {
          return;
        }

        setLogin({
          token: activeToken,
          expires_in: "已保存",
          account: me.account,
          player: me.player,
        });

        if (!me.player) {
          const nextProfile = readResponse(await client.playerProfile());
          if (loadVersion !== loadVersionRef.current) {
            return;
          }
          setProfile(nextProfile);
          setOverview(null);
          setScrolls(null);
          setSelectedScroll(null);
          setFaction(null);
          setRealmProgression(null);
          setRealmProgressionError(null);
          setMessage("已取得行旅凭证，请登记角色");
          return;
        }

        await Promise.allSettled([refreshDashboard(activeToken), refreshHelp(activeToken)]).then(
          (results) => {
            if (loadVersion !== loadVersionRef.current) {
              return;
            }

            if (results[0].status === "rejected") {
              setSessionError(messageFromError(results[0].reason));
            }
            if (results[1].status === "rejected") {
              setHelpError(messageFromError(results[1].reason));
            }
          },
        );

        if (loadVersion === loadVersionRef.current) {
          setMessage("神识已接入九州传音");
        }
      } catch (error) {
        if (loadVersion === loadVersionRef.current) {
          setSessionError(messageFromError(error));
          setMessage("登录状态读取失败");
        }
      } finally {
        if (loadVersion === loadVersionRef.current) {
          setHydrating(false);
        }
      }
    },
    [refreshDashboard, refreshHelp],
  );

  useEffect(() => {
    let disposed = false;

    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("健康检查失败");
        }
        return response.json() as Promise<HealthStatus>;
      })
      .then((response) => {
        if (!disposed) {
          setHealthText(response.status === "ok" ? "正常" : "不可用");
        }
      })
      .catch(() => {
        if (!disposed) {
          setHealthText("不可用");
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(tokenStorageKey);
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadSession(token);
  }, [loadSession, token]);

  useEffect(() => {
    const playerId = player?.player_id;
    if (!token || !playerId || busy || hydrating) {
      return;
    }

    const sessionKey = `${token}:${playerId}`;
    if (notificationSessionKeyRef.current !== sessionKey) {
      notificationSessionKeyRef.current = sessionKey;
      notifiedExploreEventIdsRef.current.clear();
      manuallyResolvedExploreEventIdsRef.current.clear();
      pendingExploreEventsRef.current = [];
      resolvingExploreEventIdsRef.current.clear();
      setPendingExploreEvents([]);
      setResolvingExploreEventId(null);
      actionSettlementRef.current = null;
    }

    const client = createClient(token);
    let disposed = false;
    let polling = false;
    let pollTimer: number | undefined;

    const clearScheduledPoll = () => {
      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    };

    const schedulePoll = (delay: number) => {
      clearScheduledPoll();
      pollTimer = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (disposed || polling) {
        return;
      }

      polling = true;
      clearScheduledPoll();
      let taskPollDelay: number | null = null;
      let shouldRetry = false;
      let nextMessage: string | null = null;
      const notifications: TerminalMessageBatch[] = [];

      try {
        const [currentResult, offlineResult, eventsResult] = await Promise.allSettled([
          client.currentAction(),
          client.offlineActionReward(),
          client.exploreEvents("pending"),
        ]);
        if (disposed) {
          return;
        }

        if (currentResult.status === "fulfilled") {
          try {
            const currentAction = readResponse(currentResult.value).action;
            taskPollDelay = 60_000;
            if (currentAction?.offline_reward?.claimable) {
              setOfflineActionReward(currentAction.offline_reward);
            }
            if (currentAction?.action_type === "explore") {
              const battleCount = currentAction.settled_battle_count ?? 0;
              const previousSettlement = actionSettlementRef.current;
              if (
                previousSettlement &&
                previousSettlement.actionId === currentAction.action_id &&
                battleCount > previousSettlement.battleCount
              ) {
                notifications.push({
                  lines: [
                    `${currentAction.province_name ?? "州域"}长期探索已自动结算 ${
                      battleCount - previousSettlement.battleCount
                    } 场，奖励已入账。`,
                  ],
                  tone: "success",
                });
                nextMessage = "长期探索收益已自动结算";
              }
              actionSettlementRef.current = {
                actionId: currentAction.action_id,
                battleCount,
              };
            } else {
              actionSettlementRef.current = null;
            }
          } catch {
            shouldRetry = true;
          }
        } else {
          shouldRetry = true;
        }

        if (offlineResult.status === "fulfilled") {
          try {
            const reward = readResponse(offlineResult.value).reward;
            setOfflineActionReward(reward);
            if (reward && reward.claimable) {
              const noticeKey = `${reward.action_id}:${reward.from_at}:${reward.to_at}`;
              if (offlineNoticeKeyRef.current !== noticeKey) {
                offlineNoticeKeyRef.current = noticeKey;
                nextMessage = "离线行动收益待领取";
                setOfflineClaimOpen(true);
              }
            }
          } catch {
            shouldRetry = true;
          }
        } else {
          shouldRetry = true;
        }

        if (eventsResult.status === "fulfilled") {
          try {
            const { events } = readResponse(eventsResult.value);
            const previousPendingEvents = pendingExploreEventsRef.current;
            const nextPendingEvents = pendingExploreEventsFromValues(events);
            pendingExploreEventsRef.current = nextPendingEvents;
            setPendingExploreEvents(nextPendingEvents);
            for (const event of events) {
              const notice = createExploreEventNotice(event);
              if (!notice || notifiedExploreEventIdsRef.current.has(event.event_id)) {
                continue;
              }
              notifiedExploreEventIdsRef.current.add(event.event_id);
              notifications.push(notice);
              nextMessage = "探索奇遇待选择";
            }

            const nextEventIds = new Set(nextPendingEvents.map((event) => event.eventId));
            const disappearedEvents = previousPendingEvents.filter(
              (event) => !nextEventIds.has(event.eventId),
            );
            if (disappearedEvents.length > 0) {
              const resolvedResult = await client.exploreEvents("resolved");
              const { events: resolvedEvents } = readResponse(resolvedResult);
              const disappearedEventIds = new Set(disappearedEvents.map((event) => event.eventId));
              for (const event of resolvedEvents) {
                if (
                  !disappearedEventIds.has(event.event_id) ||
                  manuallyResolvedExploreEventIdsRef.current.has(event.event_id)
                ) {
                  continue;
                }
                const notice = createExploreEventAutoResolveNotice(event);
                if (!notice) {
                  continue;
                }
                notifications.push(notice);
                nextMessage = "探索奇遇已自动处理";
              }
              for (const event of disappearedEvents) {
                manuallyResolvedExploreEventIdsRef.current.delete(event.eventId);
              }
            }
          } catch {
            shouldRetry = true;
          }
        } else {
          shouldRetry = true;
        }

        const notificationBatch = mergeCommandEntries(
          notifications.map((notification) => ({
            lines: notification.lines,
            tone: notification.tone,
          })),
        );
        if (notificationBatch) {
          appendTerminalEntries([
            terminalEntry(notificationBatch.tone, "九州传音", notificationBatch.lines),
          ]);
        }
        if (nextMessage) {
          setMessage(nextMessage);
        }
      } catch {
        shouldRetry = true;
      } finally {
        polling = false;
        if (!disposed) {
          schedulePoll(shouldRetry ? 10_000 : (taskPollDelay ?? 60_000));
        }
      }
    };

    const handleFocus = () => {
      void poll();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void poll();

    return () => {
      disposed = true;
      clearScheduledPoll();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appendTerminalEntries, busy, hydrating, player?.player_id, token]);

  useEffect(() => {
    if (terminalEntries.length > 0) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [terminalEntries]);

  useEffect(() => {
    const element = chatMessageListRef.current;
    if (!element || !lastChatMessageId) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [lastChatMessageId]);

  const metrics = useMemo(
    () => [
      {
        label: "境界",
        value:
          cultivation?.current_realm_name ?? (player ? `第 ${player.current_realm} 境` : "未入道"),
        detail: cultivation
          ? `${cultivation.current_stage_name} · 第 ${cultivation.current_level}/${cultivation.current_stage_level_count} 级`
          : "登记角色后开启修行",
      },
      {
        label: "修为",
        value: cultivation?.cultivation_value ?? progress?.cultivation_value ?? "—",
        detail: cultivation
          ? `距下一等级 ${cultivation.cultivation_to_next_level} · 可收取 ${cultivation.claimable_cultivation}`
          : "等待修行状态",
      },
      {
        label: "灵石",
        value: wallet?.spirit_stone ?? "—",
        detail: overview?.action_state
          ? `行动令 ${overview.action_state.action_points}/${overview.action_state.action_point_cap}`
          : "探索可获得材料",
      },
      {
        label: "章节",
        value: `第 ${progress?.chapter_id ?? 1} 章`,
        detail: readableStoryScrolls.length
          ? `已见 ${readableStoryScrolls.length} 卷`
          : "输入“卷轴”查看剧情",
      },
    ],
    [cultivation, overview?.action_state, player, progress, readableStoryScrolls.length, wallet],
  );

  async function loadFeature(
    kind: FeatureKind,
    notice?: string,
    rankType: RankType = featureRankType,
  ) {
    if (!token || busy || hydrating) {
      return;
    }

    setFeatureKind(kind);
    setOverlayReturnView("tools");
    setActiveOverlay("feature");
    setFeatureData(null);
    setFeatureMessage(notice ?? null);
    setFeatureLoading(true);
    try {
      const client = createClient(token);
      switch (kind) {
        case "activity":
          setFeatureData({ kind, data: readResponse(await client.activityList()) });
          break;
        case "inner_world": {
          const data = readResponse(await client.innerWorldSummary());
          setInnerDispatchCreature((current) => current || data.creatures[0]?.creature_id || "");
          setInnerDispatchProvince(
            (current) =>
              current ||
              overview?.provinces.find((province) => province.unlocked)?.province_id ||
              "",
          );
          setFeatureData({ kind, data });
          break;
        }
        case "sect": {
          const detail = readResponse(await client.mySect());
          const list = detail.sect ? null : readResponse(await client.sects());
          setFeatureData({ kind, data: { detail, list } });
          break;
        }
        case "boss":
          setFeatureData({ kind, data: readResponse(await client.worldBoss()) });
          break;
        case "rank":
          setFeatureRankType(rankType);
          setFeatureData({ kind, data: readResponse(await client.ranks(rankType)) });
          break;
        case "ancient":
          setFeatureData({ kind, data: readResponse(await client.ancientTreasures()) });
          break;
        case "tower":
          setFeatureData({ kind, data: readResponse(await client.towers()) });
          break;
        case "equipment":
          setFeatureData({ kind, data: readResponse(await client.equipmentList()) });
          break;
        case "skills": {
          const data = readResponse(await client.skillLoadout());
          setSkillActiveIds(data.active_skill_ids);
          setSkillTreasureId(data.treasure_skill_id);
          setFeatureData({ kind, data });
          break;
        }
        case "commerce":
          setFeatureData({ kind, data: readResponse(await client.commerceOverview()) });
          break;
      }
    } catch (error) {
      setFeatureMessage(`读取失败：${messageFromError(error)}`);
      setSessionError(messageFromError(error));
    } finally {
      setFeatureLoading(false);
    }
  }

  async function runFeatureMutation(
    operation: () => Promise<unknown>,
    notice: string,
    kind = featureKind,
  ) {
    if (!token || !kind || busy || hydrating || featureLoading) {
      return;
    }
    setFeatureMessage("正在处理，请稍候…");
    setFeatureLoading(true);
    try {
      await operation();
      await loadFeature(kind, notice, kind === "rank" ? featureRankType : undefined);
      await refreshDashboard(token, true);
    } catch (error) {
      setFeatureMessage(`操作未完成：${messageFromError(error)}`);
    } finally {
      setFeatureLoading(false);
    }
  }

  function openFeatureDialog(action: CommandAction) {
    const kind = featureKindFromCommand(action.command);
    if (!kind) {
      return;
    }
    setFeatureCommand(action);
    void loadFeature(kind);
  }

  function participateActivity(eventId: string) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).submitActivityProgress(
          {
            event_id: eventId,
            count: 1,
            province_id: activeLongAction?.province_id ?? undefined,
          },
          createIdempotencyKey("web_activity_progress"),
        ),
      "活动进度已更新",
      "activity",
    );
  }

  function claimActivity(eventId: string) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).claimActivityReward(
          { event_id: eventId },
          createIdempotencyKey("web_activity_claim"),
        ),
      "活动奖励已领取",
      "activity",
    );
  }

  function claimInnerWorld(assignmentId: string) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).innerWorldClaim(
          { assignment_id: assignmentId },
          createIdempotencyKey("web_inner_world_claim"),
        ),
      "内天地收益已领取",
      "inner_world",
    );
  }

  function dispatchInnerWorld() {
    if (!token || !innerDispatchProvince) {
      setFeatureMessage("请先选择派驻州域。");
      return;
    }
    if (featureData?.kind === "inner_world" && !featureData.data.state.unlocked) {
      setFeatureMessage(featureData.data.state.unlock_hint);
      return;
    }
    void runFeatureMutation(
      () =>
        createClient(token).innerWorldDispatch(
          {
            province_id: innerDispatchProvince,
            ...(innerDispatchCreature ? { creature_id: innerDispatchCreature } : {}),
          },
          createIdempotencyKey("web_inner_world_dispatch"),
        ),
      "已派驻内天地生灵",
      "inner_world",
    );
  }

  function upgradeInnerWorld(targetType: "world" | "creature", creatureId?: string) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).innerWorldUpgrade(
          { target_type: targetType, ...(creatureId ? { creature_id: creatureId } : {}) },
          createIdempotencyKey("web_inner_world_upgrade"),
        ),
      targetType === "world" ? "内天地等级已提升" : "内天地生灵等级已提升",
      "inner_world",
    );
  }

  function supportInnerWorld() {
    if (!token || !innerDispatchProvince) {
      setFeatureMessage("请先选择支援州域。");
      return;
    }
    void runFeatureMutation(
      () =>
        createClient(token).innerWorldSupport(
          { province_id: innerDispatchProvince, support_type: innerSupportType },
          createIdempotencyKey("web_inner_world_support"),
        ),
      "州域支援已结算",
      "inner_world",
    );
  }

  function joinSect(sectId: string) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).joinSect({ sect_id: sectId }, createIdempotencyKey("web_sect_join")),
      "已加入宗门",
      "sect",
    );
  }

  function createSect() {
    if (!token || !sectName.trim()) {
      setFeatureMessage("请输入宗门名称。");
      return;
    }
    void runFeatureMutation(
      () =>
        createClient(token).createSect(
          { name: sectName.trim(), alignment: sectAlignment },
          createIdempotencyKey("web_sect_create"),
        ),
      "宗门已创建",
      "sect",
    );
  }

  function completeSectTask() {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).completeSectTask(
          { task_id: sectTaskId },
          createIdempotencyKey("web_sect_task"),
        ),
      "宗门任务已完成",
      "sect",
    );
  }

  function depositSectWarehouse() {
    if (!token || !sectWarehouseItemInstanceId) {
      setFeatureMessage("请选择要存入的未绑定材料。");
      return;
    }
    void runFeatureMutation(
      () =>
        createClient(token).depositSectWarehouse(
          { item_instance_id: sectWarehouseItemInstanceId, count: 1 },
          createIdempotencyKey("web_sect_warehouse_deposit"),
        ),
      "材料已存入宗门仓库",
      "sect",
    );
  }

  function withdrawSectWarehouse(itemId = sectWarehouseItemId) {
    if (!token || !itemId) {
      setFeatureMessage("请选择要取出的材料。");
      return;
    }
    void runFeatureMutation(
      () =>
        createClient(token).withdrawSectWarehouse(
          { item_id: itemId, count: 1 },
          createIdempotencyKey("web_sect_warehouse_withdraw"),
        ),
      "材料已取出",
      "sect",
    );
  }

  function challengeWorldBoss(bossId: string) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).challengeBoss(
          { boss_id: bossId },
          createIdempotencyKey("web_boss_challenge"),
        ),
      "世界 Boss 挑战已结算",
      "boss",
    );
  }

  function claimRankTitle() {
    if (!token || featureKind !== "rank") return;
    void runFeatureMutation(
      () =>
        createClient(token).claimRankTitle(
          { rank_type: featureRankType },
          createIdempotencyKey("web_rank_title_claim"),
        ),
      "榜单称号已领取",
      "rank",
    );
  }

  function drawAncientTreasure() {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).gachaDraw(
          { pool_type: "ancient_treasure", cost_type: "bound_jade" },
          createIdempotencyKey("web_ancient_draw"),
        ),
      "古宝抽取已结算",
      "ancient",
    );
  }

  function claimMonthlyDaily(cardType: "small_monthly" | "large_monthly") {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).claimMonthlyDaily(
          { card_type: cardType },
          createIdempotencyKey("web_monthly_daily"),
        ),
      "月卡每日权益已领取",
      "commerce",
    );
  }

  function actOnTower(towerId: string, actionType: "seal" | "break" | "supply" | "guard") {
    if (!token) return;
    void runFeatureMutation(
      () =>
        createClient(token).towerAction(
          { tower_id: towerId, action_type: actionType, count: 1 },
          createIdempotencyKey("web_tower_action"),
        ),
      "九塔行动已结算",
      "tower",
    );
  }

  function equipOrUnequipEquipment(equipmentInstanceId: string, equippedSlot: string | null) {
    if (!token) return;
    void runFeatureMutation(
      () =>
        equippedSlot
          ? createClient(token).equipmentUnequip(
              { equipment_instance_id: equipmentInstanceId },
              createIdempotencyKey("web_equipment_unequip"),
            )
          : createClient(token).equipmentEquip(
              { equipment_instance_id: equipmentInstanceId, slot: "main" },
              createIdempotencyKey("web_equipment_equip"),
            ),
      equippedSlot ? "法宝已卸下" : "法宝已装备",
      "equipment",
    );
  }

  function learnFeatureSkill(skillId: string) {
    if (!token) return;
    void runFeatureMutation(
      () => createClient(token).learnSkill({ skill_id: skillId }, createIdempotencyKey("web_skill_learn")),
      "技能已掌握",
      "skills",
    );
  }

  function saveFeatureSkillLoadout() {
    if (!token || !skillTreasureId || skillActiveIds.length === 0) {
      setFeatureMessage("请至少选择一个主动技能和一个本命技能。");
      return;
    }
    void runFeatureMutation(
      () =>
        createClient(token).saveSkillLoadout(
          {
            active_skill_ids: skillActiveIds,
            treasure_skill_id: skillTreasureId,
            auto_priority: [skillTreasureId, ...skillActiveIds],
          },
          createIdempotencyKey("web_skill_loadout"),
        ),
      "技能编组已保存",
      "skills",
    );
  }

  async function openProductionDialog(kind: ProductionFormulaKind) {
    if (!token || busy || hydrating) {
      return;
    }
    setProductionKind(kind);
    setProductionMaterials([]);
    setProductionFormulas([]);
    setSelectedProductionFormulaId(null);
    setSelectedProductionMaterials({});
    setProductionResult([]);
    setProductionFormulaName("");
    setProductionLastRecordId(null);
    setOverlayReturnView("tools");
    setActiveOverlay("production");
    setProductionLoading(true);
    try {
      const client = createClient(token);
      const [materialsResponse, formulasResponse] = await Promise.all([
        client.productionMaterials(kind),
        client.productionFormulas({ kind, scope: "mine" }),
      ]);
      setProductionMaterials(readResponse(materialsResponse).materials);
      setProductionFormulas(readResponse(formulasResponse).formulas);
      await refreshBag(token);
    } catch (error) {
      setProductionResult([`材料清单读取失败：${messageFromError(error)}`]);
    } finally {
      setProductionLoading(false);
    }
  }

  async function craftProduction() {
    if (!token || !productionKind || productionCrafting || busy || hydrating) {
      return;
    }
    const materials = Object.entries(selectedProductionMaterials)
      .filter(([, count]) => count > 0)
      .map(([item_id, count]) => ({ item_id, count }));
    if (materials.length === 0 && !selectedProductionFormulaId) {
      setProductionResult(["请至少选择一种已有材料。"]);
      return;
    }
    setProductionCrafting(true);
    try {
      const response =
        productionKind === "alchemy"
          ? await createClient(token).alchemyCraft(
              {
                ...(selectedProductionFormulaId
                  ? { formula_id: selectedProductionFormulaId }
                  : { materials }),
              },
              createIdempotencyKey("web_alchemy"),
            )
          : await createClient(token).forgeCraft(
              {
                ...(selectedProductionFormulaId
                  ? { formula_id: selectedProductionFormulaId }
                  : { materials }),
              },
              createIdempotencyKey("web_forge"),
            );
      const result = readResponse(response as ApiResponse<unknown>) as {
        rewards?: { cultivation?: string; spirit_stone?: string; action_points?: number };
        record_id?: string;
        record?: { record_id?: string; success?: boolean; quality?: string | null };
        equipment?: { name?: string } | null;
      };
      const detail =
        productionKind === "alchemy"
          ? `炼丹${result.record?.success ? "成功" : "完成"}${result.record?.quality ? ` · ${pillQualityLabel(result.record.quality as NonNullable<BagSummaryResponse["items"][number]["quality"]>)}` : ""}`
          : result.equipment?.name
            ? `炼器完成：${result.equipment.name}`
            : "炼器完成";
      setProductionResult([detail, `资源结算：${formatRewards(result.rewards ?? {})}`]);
      setProductionLastRecordId(result.record?.record_id ?? result.record_id ?? null);
      setSelectedProductionMaterials({});
      setSelectedProductionFormulaId(null);
      await Promise.all([refreshBag(token), refreshDashboard(token, true)]);
    } catch (error) {
      setProductionResult([`投炉失败：${messageFromError(error)}`]);
    } finally {
      setProductionCrafting(false);
    }
  }

  async function saveProductionFormula() {
    if (!token || !productionKind || !productionLastRecordId || !productionFormulaName.trim()) {
      setProductionResult((current) => [...current, "请先成功炼制并填写单方名称。"]);
      return;
    }
    try {
      await createClient(token).saveProductionFormula(
        {
          kind: productionKind,
          source_record_id: productionLastRecordId,
          name: productionFormulaName.trim(),
        },
        createIdempotencyKey("web_production_formula_save"),
      );
      setProductionResult((current) => [...current, "单方已保存。"]);
      const formulas = readResponse(
        await createClient(token).productionFormulas({ kind: productionKind, scope: "mine" }),
      ).formulas;
      setProductionFormulas(formulas);
      setProductionFormulaName("");
    } catch (error) {
      setProductionResult((current) => [...current, `保存单方失败：${messageFromError(error)}`]);
    }
  }

  async function handleGuestLogin() {
    setBusy(true);
    setSessionError(null);
    try {
      const response = await createClient().guestLogin({
        device_id: getOrCreateDeviceId(),
        nickname: "鱼排道友",
      });
      const data = readResponse(response);
      window.localStorage.setItem(tokenStorageKey, data.token);
      setToken(data.token);
      setLogin(data);
      appendTerminalEntries([
        terminalEntry("success", "行旅凭证", ["游客登录成功，正在接入九州传音。"]),
      ]);
    } catch (error) {
      const detail = messageFromError(error);
      setSessionError(detail);
      appendTerminalEntries([terminalEntry("error", "凭证未取得", [detail])]);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setSessionError("请先取得行旅凭证。");
      return;
    }

    const name = playerName.trim();
    if (name.length < 2) {
      setSessionError("角色名至少需要两个字符。");
      return;
    }

    setBusy(true);
    setSessionError(null);
    try {
      const response = await createClient(token).createPlayer(
        { name, route },
        createIdempotencyKey("web_create_player"),
      );
      const data = readResponse(response);
      setProfile(data.profile);
      appendTerminalEntries([
        terminalEntry("success", "道号已录", [`${name}，自此踏入九州修行路。`]),
      ]);
      await loadSession(token);
    } catch (error) {
      const detail = messageFromError(error);
      setSessionError(detail);
      appendTerminalEntries([terminalEntry("error", "登记失败", [detail])]);
    } finally {
      setBusy(false);
    }
  }

  async function handleLongAction(
    kind: "start_cultivation" | "start_explore" | "end" | "claim",
    provinceId?: string,
  ) {
    if (!token || busy || hydrating) return;
    setBusy(true);
    try {
      const client = createClient(token);
      const response =
        kind === "start_cultivation"
          ? await client.startAction(
              { action_type: "cultivation" },
              createIdempotencyKey("web_action_start"),
            )
          : kind === "start_explore"
            ? await client.startAction(
                { action_type: "explore", province_id: provinceId ?? "ji" },
                createIdempotencyKey("web_action_start"),
              )
            : kind === "end"
              ? await client.endAction(createIdempotencyKey("web_action_end"))
              : await client.claimAction(createIdempotencyKey("web_action_claim"));
      const result = readResponse(response);
      appendTerminalEntries([
        terminalEntry("success", "九州传音", [
          kind === "start_cultivation"
            ? "已开始长期修炼。"
              : kind === "start_explore"
                ? `已开始${result.action?.province_name ?? "州域"}长期探索。`
                : kind === "end"
                ? `行动已结束，${formatRewards(result.rewards)}已自动结算。`
                : `行动收益已领取：${formatRewards(result.rewards)}。`,
        ]),
      ]);
      await refreshDashboard(token, true);
    } catch (error) {
      const detail = messageFromError(error);
      setSessionError(detail);
      appendTerminalEntries([terminalEntry("error", "行动未完成", [detail])]);
    } finally {
      setBusy(false);
    }
  }

  async function handleOfflineClaim() {
    if (!token || busy || hydrating) return;
    if (offlineActionReward?.claimable) {
      setBusy(true);
      try {
        const result = readResponse(
          await createClient(token).claimOfflineAction(createIdempotencyKey("web_offline_action_claim")),
        );
        appendTerminalEntries([
          terminalEntry("success", "离线行动", [`已领取：${formatRewards(result.rewards)}。`]),
        ]);
        setOfflineActionReward(null);
        setOfflineClaimOpen(false);
        await refreshDashboard(token, true);
      } catch (error) {
        setSessionError(messageFromError(error));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (activeLongAction?.status === "claimable") {
      setOfflineClaimOpen(false);
      await handleLongAction("claim");
      return;
    }
    setBusy(true);
    try {
      const result = readResponse(
        await createClient(token).claimCultivation(createIdempotencyKey("web_cultivation_claim")),
      );
      appendTerminalEntries([
        terminalEntry("success", "离线修为", [`已领取修为 +${result.gained_cultivation}。`]),
      ]);
      setOfflineClaimOpen(false);
      await refreshDashboard(token, true);
    } catch (error) {
      setSessionError(messageFromError(error));
    } finally {
      setBusy(false);
    }
  }

  async function executeCommand(rawCommand: string, options: CommandExecutionOptions = {}) {
    const nextCommand = rawCommand.trim();
    if (!nextCommand || !token || busy) {
      return;
    }

    setBusy(true);
    setCommand("");
    setHistoryIndex(-1);
    if (options.saveToHistory !== false) {
      setCommandHistory((current) =>
        [nextCommand, ...current.filter((item) => item !== nextCommand)].slice(0, 30),
      );
    }
    appendTerminalEntries([
      terminalEntry("command", "你", [`> ${options.displayCommand ?? nextCommand}`]),
    ]);

    try {
      const client = createCommandClient(token);
      const response = await client.executeCommand(
        { command: nextCommand },
        createIdempotencyKey("web_command"),
      );
      const data = readResponse(response);
      const pendingEvents =
        data.command_id === "explore_events"
          ? pendingExploreEventsFromCommandState(data.state)
          : [];
      const taskItems =
        data.command_id === "task_list" ? taskItemsFromResult(data.state?.result) : null;
      setCommandSuggestions(
        data.command_id === "task_list"
          ? []
          : commandSuggestionsFromState(
              data.state,
              pendingEvents.length > 0 ? pendingEvents : pendingExploreEventsRef.current,
            ),
      );
      const entries =
        data.command_id === "task_list"
          ? [taskTerminalEntry(taskItems)]
          : normalizeCommandEntries(withoutExploreEventInstructions(data.entries, pendingEvents));
      appendTerminalEntries(
        entries.length > 0 ? entries : [terminalEntry("success", "九州传音", ["指令已执行。"])],
      );
      applyCommandState(data.state, { setOverview, setProfile, setScrolls });
      if (data.command_id === "explore_events") {
        if (data.command_id === "explore_events") {
          pendingExploreEventsRef.current = pendingEvents;
          setPendingExploreEvents(pendingEvents);
        } else if (pendingEvents.length > 0) {
          setPendingExploreEvents((current) => {
            const next = mergePendingExploreEvents(current, pendingEvents);
            pendingExploreEventsRef.current = next;
            return next;
          });
        }
        markDeliveredExploreEvents(data.state, notifiedExploreEventIdsRef.current);
      }
      if (data.command_id === "explore_event_resolve") {
        const eventId = exploreEventIdFromCommandState(data.state);
        if (eventId) {
          manuallyResolvedExploreEventIdsRef.current.add(eventId);
          setPendingExploreEvents((current) => {
            const next = current.filter((event) => event.eventId !== eventId);
            pendingExploreEventsRef.current = next;
            return next;
          });
        }
      }
      if (data.command_id === "task_claim") {
        const claimedTask = taskItemFromClaimResult(data.state?.result);
        if (claimedTask) {
          setTerminalEntries((current) =>
            current.map((entry) =>
              entry.tasks
                ? {
                    ...entry,
                    tasks: entry.tasks.map((task) =>
                      task.taskId === claimedTask.taskId ? claimedTask : task,
                    ),
                  }
                : entry,
            ),
          );
        }
      }

      await Promise.all([
        refreshDashboard(token, true).catch(() => undefined),
        data.command_id === "bag" || data.command_id === "pill_use"
          ? refreshBag(token)
          : Promise.resolve(),
      ]);
      if (data.command_id === "bag") {
        setLeftPanelView("bag");
      }
      setMessage("指令已结算");
    } catch (error) {
      const detail = messageFromError(error);
      appendTerminalEntries([
        terminalEntry("error", "指令未执行", [detail, "可输入“帮助”查看规范语法。"]),
      ]);
      setMessage("指令执行失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleExploreEventChoice(
    event: PendingExploreEvent,
    choice: PendingExploreEvent["choices"][number],
  ) {
    if (busy || hydrating || resolvingExploreEventIdsRef.current.has(event.eventId)) {
      return;
    }

    resolvingExploreEventIdsRef.current.add(event.eventId);
    setResolvingExploreEventId(event.eventId);
    try {
      await executeCommand(buildExploreEventCommand(event.eventId, choice.choiceId), {
        displayCommand: `选择奇遇“${event.title}”：${choice.label}`,
        saveToHistory: false,
      });
    } finally {
      resolvingExploreEventIdsRef.current.delete(event.eventId);
      setResolvingExploreEventId((current) => (current === event.eventId ? null : current));
    }
  }

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void executeCommand(command);
  }

  function handleCommandKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (commandHistory.length === 0) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(commandHistory[nextIndex] ?? "");
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(nextIndex);
      setCommand(nextIndex < 0 ? "" : (commandHistory[nextIndex] ?? ""));
    }
  }

  function handleLogout() {
    loadVersionRef.current += 1;
    window.localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setHydrating(false);
    setBusy(false);
    setLogin(null);
    setProfile(null);
    setOverview(null);
    setScrolls(null);
    setSelectedScroll(null);
    setScrollDetailError(null);
    setFaction(null);
    setRealmProgression(null);
    setRealmProgressionError(null);
    setRealmProgressionLoading(false);
    setBag(null);
    setBagError(null);
    setBagLoading(false);
    setCommandSuggestions([]);
    pendingExploreEventsRef.current = [];
    setPendingExploreEvents([]);
    setResolvingExploreEventId(null);
    setActiveOverlay(null);
    setOverlayReturnView(null);
    setFeatureCommand(null);
    setFeatureKind(null);
    setFeatureData(null);
    setFeatureMessage(null);
    setProductionKind(null);
    setProductionMaterials([]);
    setProductionFormulas([]);
    setSelectedProductionFormulaId(null);
    setSelectedProductionMaterials({});
    setProductionResult([]);
    setItemDetail(null);
    setBattleDetail(null);
    setLeftPanelView("brief");
    setOfflineClaimOpen(false);
    setChatMessages([]);
    setChatContent("");
    setChatItemInstanceId("");
    chatAfterRef.current = undefined;
    notificationSessionKeyRef.current = null;
    notifiedExploreEventIdsRef.current.clear();
    manuallyResolvedExploreEventIdsRef.current.clear();
    resolvingExploreEventIdsRef.current.clear();
    setSessionError(null);
    setMessage("已离开本次行旅");
    appendTerminalEntries([terminalEntry("system", "九州传音", ["行旅凭证已从本机移除。"])]);
  }

  return (
    <main className={`text-console-shell${player ? " text-console-shell-active" : ""}`}>
      <header className="text-console-header">
        <div>
          <p className="console-eyebrow">九州纪元 · 文字修行</p>
          <h1>择日飞升</h1>
          <p className="console-subtitle">
            {player
              ? `${player.name} · ${routeLabel(player.route)} · ${cultivation?.current_realm_name ?? "修行中"}`
              : "以文字指令行走九州，亲自摸索每一道机缘。"}
          </p>
        </div>
        <div className="console-connection" aria-live="polite">
          <span className={`connection-dot connection-${healthText}`} />
          <span>传音 {healthText}</span>
          <small>{message}</small>
        </div>
      </header>

      {!player ? (
        <section className="entry-panel" aria-label="进入九州">
          <p className="console-eyebrow">初入九州</p>
          <h2>先取得行旅凭证，再登记你的道号。</h2>
          <p>
            这是一方只用文字记录的修行天地。没有疆域需要经营，只有你、材料、抉择与尚未被发现的单方。
          </p>
          <div className="entry-actions">
            <button
              className="console-button console-button-primary"
              disabled={busy || hydrating}
              onClick={handleGuestLogin}
              type="button"
            >
              {busy || hydrating ? "接入中…" : "游客登录"}
            </button>
            <span className="entry-note">{token ? "凭证已取得" : "未取得凭证"}</span>
          </div>
          <form className="character-form" onSubmit={handleCreatePlayer}>
            <label>
              <span>道号</span>
              <input
                disabled={!token || busy || hydrating}
                maxLength={16}
                minLength={2}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="例如：云游修士"
                value={playerName}
              />
            </label>
            <label>
              <span>修行路数</span>
              <select
                disabled={!token || busy || hydrating}
                onChange={(event) => setRoute(event.target.value as RouteValue)}
                value={route}
              >
                <option value="qi">练气</option>
                <option value="body">炼体</option>
              </select>
            </label>
            <button
              className="console-button"
              disabled={!token || busy || hydrating || playerName.trim().length < 2}
              type="submit"
            >
              登记角色
            </button>
          </form>
          {sessionError ? <ErrorNotice message={sessionError} /> : null}
        </section>
      ) : (
        <>
          {sessionError ? <ErrorNotice message={sessionError} /> : null}

          <section className="console-layout" aria-label="文字修行指令台">
            <aside className="cultivation-panel" aria-label="修行状态">
              <div className="cultivation-panel-heading">
                <div>
                  <p className="console-eyebrow">修行状态</p>
                  <h2>{leftPanelView === "brief" ? "道途简报" : "纳物囊"}</h2>
                </div>
                <div className="cultivation-panel-heading-actions">
                  <div className="left-panel-tabs" role="tablist" aria-label="左侧面板">
                    <button
                      aria-selected={leftPanelView === "brief"}
                      className={`left-panel-tab${leftPanelView === "brief" ? " left-panel-tab-active" : ""}`}
                      onClick={() => setLeftPanelView("brief")}
                      role="tab"
                      type="button"
                    >
                      简报
                    </button>
                    <button
                      aria-selected={leftPanelView === "bag"}
                      className={`left-panel-tab${leftPanelView === "bag" ? " left-panel-tab-active" : ""}`}
                      disabled={bagLoading && !bag}
                      onClick={() => {
                        setLeftPanelView("bag");
                        if (token && !bag) {
                          void refreshBag(token);
                        }
                      }}
                      role="tab"
                      type="button"
                    >
                      背包
                    </button>
                  </div>
                  {leftPanelView === "brief" ? (
                    <>
                      <button
                        className="quiet-button"
                        disabled={hydrating || busy}
                        onClick={() => {
                          if (token) {
                            void refreshDashboard(token).catch((error) =>
                              setSessionError(messageFromError(error)),
                            );
                          }
                        }}
                        type="button"
                      >
                        同步
                      </button>
                      <button
                        aria-haspopup="dialog"
                        className="realm-overview-button"
                        onClick={() => {
                          setOverlayReturnView(null);
                          setActiveOverlay("realms");
                          void refreshRealmProgression();
                        }}
                        type="button"
                      >
                        境界一览
                      </button>
                    </>
                  ) : (
                    <button
                      className="quiet-button"
                      disabled={bagLoading || busy || hydrating || !token}
                      onClick={() => token && void refreshBag(token)}
                      type="button"
                    >
                      {bagLoading ? "读取中…" : "刷新"}
                    </button>
                  )}
                </div>
              </div>
              {leftPanelView === "brief" ? (
                <>
                  <div className="status-strip">
                    {metrics.map((metric) => (
                      <article className="status-metric" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <small>{metric.detail}</small>
                      </article>
                    ))}
                  </div>
                  <section
                    className={`breakthrough-status breakthrough-status-${breakthroughSummary.state}`}
                    aria-label="突破状态"
                  >
                    <div>
                      <span>破境</span>
                      <strong>{breakthroughSummary.title}</strong>
                      <small>{breakthroughSummary.detail}</small>
                    </div>
                    {breakthroughSummary.actionable ? (
                      <button
                        className="breakthrough-action"
                        disabled={busy || hydrating}
                        onClick={() => {
                          void executeCommand("突破", {
                            displayCommand: "突破",
                            saveToHistory: false,
                          });
                        }}
                        type="button"
                      >
                        突破
                      </button>
                    ) : null}
                  </section>
                  {activeLongAction ? (
                    <section className="cultivation-journey" aria-label="当前长期行动">
                      <article
                        className={`explore-action-card explore-action-card-${activeLongAction.status === "claimable" ? "claim" : "waiting"}`}
                      >
                        <div className="action-card-heading">
                          <p className="console-eyebrow">当前行旅</p>
                          <span>
                            {activeLongAction.status === "claimable" ? "待领取" : "进行中"}
                          </span>
                        </div>
                        <strong>
                          {activeLongAction.action_type === "cultivation"
                            ? "长期修炼"
                            : `${activeLongAction.province_name ?? "州域"}长期探索`}
                        </strong>
                        <p>
                          {activeLongAction.action_type === "explore"
                            ? `已结算 ${activeLongAction.settled_battle_count ?? 0} 场；在线每小时自动入账，结束时补齐完整分钟。`
                            : activeLongAction.status === "claimable"
                            ? `已固定收益：${formatRewards(activeLongAction.rewards ?? {})}`
                            : "修炼与探索互斥；需要收益时手动结束行动。"}
                        </p>
                        {activeLongAction.action_type !== "explore" && activeLongAction.status === "claimable" ? (
                          <button
                            className="action-card-button"
                            disabled={busy || hydrating}
                            onClick={() => void handleLongAction("claim")}
                            type="button"
                          >
                            领取行动收益
                          </button>
                        ) : (
                          <button
                            className="action-card-button"
                            disabled={busy || hydrating}
                            onClick={() => void handleLongAction("end")}
                            type="button"
                          >
                            结束行动
                          </button>
                        )}
                      </article>
                    </section>
                  ) : (
                    <section className="cultivation-journey" aria-label="开始长期行动">
                      <article className="explore-action-card explore-action-card-waiting">
                        <div className="action-card-heading">
                          <p className="console-eyebrow">当前行旅</p>
                          <span>可出发</span>
                        </div>
                        <strong>选择下一段行旅</strong>
                        <p>开始修炼或选择已开放州域探索，两者同一时间只能进行一项。</p>
                        <div className="action-card-buttons">
                          <button
                            className="action-card-button"
                            disabled={busy || hydrating}
                            onClick={() => void handleLongAction("start_cultivation")}
                            type="button"
                          >
                            开始修炼
                          </button>
                          {overview?.provinces
                            .filter((province) => province.unlocked)
                            .slice(0, 2)
                            .map((province) => (
                              <button
                                className="action-card-button action-card-button-secondary"
                                disabled={busy || hydrating}
                                key={province.province_id}
                                onClick={() =>
                                  void handleLongAction("start_explore", province.province_id)
                                }
                                type="button"
                              >
                                探索{province.name}
                              </button>
                            ))}
                        </div>
                      </article>
                    </section>
                  )}
                </>
              ) : (
                <section className="left-bag-panel" aria-label="背包物品">
                  {bagError ? <p className="panel-warning">背包暂时无法读取：{bagError}</p> : null}
                  {bagLoading && !bag ? <p className="empty-copy">正在整理纳物囊…</p> : null}
                  {!bagLoading && !bagError && bag && bagDisplayItems.length === 0 ? (
                    <p className="empty-copy">背包暂为空。探索、洞府收取和炼制都可能带来物品。</p>
                  ) : null}
                  {bagDisplayItems.length > 0 ? (
                    <ul className="bag-list">
                      {bagDisplayItems.map((item) => (
                        <li className="bag-item" key={item.item_instance_id}>
                          <button
                            className="bag-item-info"
                            disabled={busy || hydrating}
                            onClick={() => handleShareBagItem(item)}
                            onFocus={(event) => showItemDetail(event, item)}
                            onMouseEnter={(event) => showItemDetail(event, item)}
                            onMouseLeave={hideItemDetail}
                            onBlur={hideItemDetail}
                            title="点击选择此物品并分享到聊天；悬浮查看详情"
                            type="button"
                          >
                            <span className="bag-item-title">
                              <strong>
                                {item.name} ×{item.count}
                                {item.quality ? `（${pillQualityLabel(item.quality)}）` : ""}
                              </strong>
                              <small>点击分享</small>
                            </span>
                          </button>
                          {item.category === "pill" && !item.expired && !item.locked ? (
                            <button
                              className="quiet-button"
                              disabled={busy || hydrating}
                              onClick={() => {
                                void executeCommand(`服丹 ${item.item_instance_id}`, {
                                  displayCommand: `服丹 ${item.name}`,
                                  saveToHistory: false,
                                });
                              }}
                              type="button"
                            >
                              服用
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              )}
              <button className="logout-button" onClick={handleLogout} type="button">
                离开
              </button>
            </aside>
            <section className="terminal-panel" aria-label="叙事日志">
              <div className="panel-heading">
                <div>
                  <p className="console-eyebrow">叙事日志</p>
                  <h2>九州传音</h2>
                </div>
                <div className="terminal-heading-actions">
                  <button
                    aria-haspopup="dialog"
                    className="utility-button"
                    onClick={() => {
                      setOverlayReturnView(null);
                      setActiveOverlay("tools");
                    }}
                    type="button"
                  >
                    功能
                  </button>
                </div>
              </div>
              <div className="terminal-log" role="log" aria-live="polite">
                {terminalEntries.map((entry) => (
                  <article className={`terminal-entry terminal-${entry.tone}`} key={entry.id}>
                    {entry.title ? <strong>{entry.title}</strong> : null}
                    {entry.tasks ? (
                      <div className="terminal-task-list">
                        {entry.tasks.map((task) => (
                          <div className="terminal-task-row" key={`${entry.id}_${task.taskId}`}>
                            <p>{formatTaskItem(task)}</p>
                            {task.status === "completed" ? (
                              <button
                                aria-label={`领取任务“${task.title}”`}
                                className="terminal-task-claim"
                                disabled={busy || hydrating}
                                onClick={() => {
                                  void executeCommand(`领取任务 ${task.taskId}`, {
                                    displayCommand: `领取任务“${task.title}”`,
                                    saveToHistory: false,
                                  });
                                }}
                                type="button"
                              >
                                领取
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      entry.lines.map((line, index) => <p key={`${entry.id}_${index}`}>{line}</p>)
                    )}
                  </article>
                ))}
                <div ref={terminalEndRef} />
              </div>
              {pendingExploreEvents.length > 0 ? (
                <section
                  className="explore-event-actions"
                  aria-label="待选择探索奇遇"
                  aria-live="polite"
                  ref={exploreEventActionsRef}
                >
                  <div className="explore-event-actions-heading">
                    <p className="console-eyebrow">探索奇遇</p>
                    <h3>机缘已至</h3>
                  </div>
                  <div className="explore-event-card-list">
                    {pendingExploreEvents.map((event) => (
                      <article className="explore-event-card" key={event.eventId}>
                        <div className="explore-event-copy">
                          <strong>{event.title}</strong>
                          {event.description ? <p>{event.description}</p> : null}
                        </div>
                        <div className="explore-event-choice-list">
                          {event.choices.map((choice) => {
                            const isResolving = resolvingExploreEventId === event.eventId;
                            return (
                              <button
                                aria-label={`选择奇遇“${event.title}”的“${choice.label}”`}
                                className="explore-event-choice"
                                disabled={busy || hydrating || isResolving}
                                key={choice.choiceId}
                                onClick={() => void handleExploreEventChoice(event, choice)}
                                type="button"
                              >
                                <span className="explore-event-choice-copy">
                                  <strong>{choice.label}</strong>
                                  {choice.description ? <small>{choice.description}</small> : null}
                                </span>
                                {choice.rewardPreview ? (
                                  <span className="explore-event-choice-reward">
                                    {choice.rewardPreview}
                                  </span>
                                ) : null}
                                {isResolving ? (
                                  <span className="explore-event-choice-state">择取中…</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              <form className="command-form" onSubmit={handleCommandSubmit}>
                <label className="command-input-wrap">
                  <span aria-hidden="true">&gt;</span>
                  <input
                    aria-describedby={commandHint ? "command-context" : undefined}
                    autoComplete="off"
                    disabled={busy || hydrating}
                    onChange={(event) => {
                      setCommand(event.target.value);
                      setHistoryIndex(-1);
                    }}
                    onKeyDown={handleCommandKeyDown}
                    placeholder="输入指令；输入“探索”可查看州域"
                    ref={commandInputRef}
                    value={command}
                  />
                </label>
                <button
                  className="console-button console-button-primary"
                  disabled={!command.trim() || busy || hydrating}
                  type="submit"
                >
                  {busy ? "结算中…" : "发送"}
                </button>
              </form>
              <p className="command-tip">
                ↑ ↓ 可翻阅本次输入记录；命令使用确定语法，不识别自然语言描述。
              </p>
              {commandHint ? (
                <output className="command-context" id="command-context">
                  <span>{commandHint.text}</span>
                  {commandHint.options.map((option) => (
                    <button
                      disabled={busy || hydrating}
                      key={option.command}
                      onClick={() => {
                        setCommand(option.command);
                        setHistoryIndex(-1);
                        commandInputRef.current?.focus();
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </output>
              ) : null}
              <div className="command-action-dock" aria-label="快捷操作">
                <div className="command-action-group">
                  <span className="command-action-label">常用</span>
                  <div className="quick-command-list" aria-label="常用操作">
                    {quickCommands.map((item) => (
                      <button
                        disabled={busy || hydrating}
                        key={item.command}
                        onClick={() => {
                          if (item.command === "探索") {
                            setCommand("探索");
                            setHistoryIndex(-1);
                            commandInputRef.current?.focus();
                            return;
                          }
                          void executeCommand(item.command);
                        }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <aside className="chat-panel" aria-label="九州聊天">
              <div className="panel-heading chat-panel-heading">
                <div>
                  <p className="console-eyebrow">同地图传音</p>
                  <h2>九州聊天</h2>
                </div>
                <button
                  className="quiet-button"
                  disabled={chatLoading || !token}
                  onClick={() => token && void refreshChat(token, true)}
                  type="button"
                >
                  {chatLoading ? "同步…" : "刷新"}
                </button>
              </div>
              <div className="chat-toolbar">
                <label>
                  <span>地图</span>
                  <select
                    aria-label="聊天地图"
                    className="chat-map-select"
                    value={chatMapId}
                    onChange={(event) => setChatMapId(event.target.value)}
                  >
                    <option value="all">全服</option>
                    {(overview?.provinces ?? [])
                      .filter((province) => province.unlocked)
                      .map((province) => (
                        <option key={province.province_id} value={province.province_id}>
                          {province.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="chat-message-list" aria-live="polite" ref={chatMessageListRef}>
                {chatMessages.length === 0 ? (
                  <p className="empty-copy">当前地图还没有传音。</p>
                ) : null}
                {chatMessages.map((item) => (
                  <article className="chat-message" key={item.message_id}>
                    <div className="chat-message-meta">
                      <strong
                        className={`chat-player-name chat-player-name-${item.membership_tier}`}
                      >
                        {item.player_name}
                        <span className="chat-player-level">{item.player_level_text}</span>
                      </strong>
                      <small>{formatDateTime(item.created_at)}</small>
                    </div>
                    <p>{item.content}</p>
                    {item.item_share ? (
                      <span
                        className="chat-item-share"
                        onBlur={hideItemDetail}
                        onMouseEnter={(event) => {
                          if (item.item_share) {
                            showItemDetail(event, item.item_share);
                          }
                        }}
                        onMouseLeave={hideItemDetail}
                      >
                        {item.item_share.name} ×{item.item_share.count}
                      </span>
                    ) : null}
                  </article>
                ))}
              </div>
              <form
                className="chat-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendChatMessage();
                }}
              >
                <textarea
                  maxLength={240}
                  onChange={(event) => setChatContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void sendChatMessage();
                    }
                  }}
                  placeholder="向当前地图传音…"
                  value={chatContent}
                />
                <div className="chat-compose-row">
                  {chatShareItem ? (
                    <span className="chat-share-selection">
                      分享：{chatShareItem.name} ×{chatShareItem.count}
                      <button
                        aria-label="取消分享物品"
                        onClick={() => setChatItemInstanceId("")}
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <span className="chat-share-hint">请从左侧背包点击物品后分享</span>
                  )}
                  <button
                    className="console-button console-button-primary chat-send-button"
                    disabled={!chatContent.trim() || chatSending || busy || hydrating}
                    type="submit"
                  >
                    {chatSending ? "发送中…" : "发送"}
                  </button>
                </div>
              </form>
            </aside>
          </section>

          {activeOverlay ? (
            <UtilityOverlay
              onClose={() => {
                const returnView = overlayReturnView;
                setOverlayReturnView(null);
                setActiveOverlay(returnView);
                setSelectedScroll(null);
                setScrollDetailError(null);
              }}
              title={
                activeOverlay === "help"
                  ? "可用语法"
                  : activeOverlay === "scrolls"
                    ? selectedScroll
                      ? "故事回放"
                      : "已见故事"
                    : activeOverlay === "realms"
                      ? "境界一览"
                      : activeOverlay === "tools"
                        ? "功能面板"
                        : activeOverlay === "feature"
                          ? (featureCommand?.label ?? "玩法")
                          : activeOverlay === "production"
                            ? productionKind === "alchemy"
                              ? "炼丹投炉"
                              : "炼器投炉"
                            : activeOverlay === "faction"
                              ? "仙魔抉择"
                              : "斗法余音"
              }
              eyebrow={
                activeOverlay === "help"
                  ? "指令帮助"
                  : activeOverlay === "scrolls"
                    ? "章节卷轴"
                    : activeOverlay === "realms"
                      ? "修行境界"
                      : activeOverlay === "tools"
                        ? "常用功能"
                        : activeOverlay === "feature"
                          ? featureKind === "activity"
                            ? "活动中心"
                            : featureKind === "inner_world"
                              ? "内天地"
                              : featureKind === "sect"
                                ? "宗门事务"
                                : featureKind === "boss"
                                  ? "世界 Boss"
                                  : featureKind === "rank"
                                    ? "九州榜单"
                                    : featureKind === "ancient"
                                      ? "古宝收藏"
                                      : featureKind === "equipment"
                                        ? "法宝管理"
                                        : featureKind === "skills"
                                          ? "技能配置"
                                          : featureKind === "commerce"
                                            ? "权益中心"
                                            : "九塔行动"
                          : activeOverlay === "production"
                            ? "材料选择"
                            : activeOverlay === "faction"
                              ? "道途分流"
                              : "最近战报"
              }
            >
              {activeOverlay === "tools" ? (
                <section className="utility-hub" aria-label="常用功能">
                  <p className="empty-copy">
                    点击玩法后会打开独立操作面板；文字指令仍保留在下方输入框中。
                  </p>
                  <div className="utility-hub-grid">
                    {[
                      ["帮助", "查看指令语法和玩法说明", "help"],
                      ["卷轴", "回看已经解锁的章节故事", "scrolls"],
                      ["仙魔", "查看或选择仙魔道途", "faction"],
                      ["战报", "回看最近探索与战斗记录", "battles"],
                    ].map(([label, detail, view]) => (
                      <button
                        className="utility-hub-item"
                        disabled={busy || hydrating}
                        key={view}
                        onClick={() => {
                          const nextView = view as Exclude<OverlayView, "tools">;
                          setOverlayReturnView("tools");
                          if (nextView === "battles") {
                            setBattleDetail(null);
                          }
                          setActiveOverlay(nextView);
                          if (nextView === "realms") {
                            void refreshRealmProgression();
                          }
                        }}
                        type="button"
                      >
                        <strong>{label}</strong>
                        <span>{detail}</span>
                      </button>
                    ))}
                  </div>
                  <div className="utility-core-section">
                    <p className="console-eyebrow">核心玩法</p>
                    <div className="utility-core-grid" aria-label="核心玩法入口">
                      {corePlayCommands.map((item) => (
                        <button
                          className="utility-core-button"
                          disabled={busy || hydrating}
                          key={item.command}
                          onClick={() => {
                            if (item.command === "炼丹") {
                              void openProductionDialog("alchemy");
                            } else if (item.command === "炼器") {
                              void openProductionDialog("forge");
                            } else {
                              openFeatureDialog(item);
                            }
                          }}
                          type="button"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {activeOverlay === "feature" ? (
                <section
                  className={`feature-dialog feature-dialog-${featureKind ?? "unknown"}`}
                  aria-label={`${featureCommand?.label ?? "玩法"}内容`}
                >
                  {featureLoading && !featureData ? (
                    <p className="empty-copy">正在读取玩法状态…</p>
                  ) : null}
                  {featureMessage ? (
                    <output className="feature-message">{featureMessage}</output>
                  ) : null}

                  {featureKind === "activity" && featureData?.kind === "activity" ? (
                    <div className="feature-card-grid">
                      {featureData.data.events.map((event) => (
                        <article className="feature-card" key={event.event_id}>
                          <div className="feature-card-heading">
                            <div>
                              <span className="feature-card-kicker">{event.status}</span>
                              <h3>{event.name}</h3>
                            </div>
                            <strong>{event.claimable ? "可领取" : "进行中"}</strong>
                          </div>
                          <p>{event.description}</p>
                          <div className="feature-progress">
                            <div>
                              <span>活动进度</span>
                              <strong>
                                {event.progress} / {event.target_progress}
                              </strong>
                            </div>
                            <div className="feature-progress-track">
                              <span
                                style={{
                                  width: `${Math.min(100, (event.progress / Math.max(1, event.target_progress)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="feature-card-actions">
                            <button
                              disabled={
                                featureLoading || busy || hydrating || event.status !== "active"
                              }
                              onClick={() => participateActivity(event.event_id)}
                              type="button"
                            >
                              {event.action_label || "参与一次"}
                            </button>
                            {event.claimable ? (
                              <button
                                disabled={featureLoading || busy || hydrating}
                                onClick={() => claimActivity(event.event_id)}
                                type="button"
                              >
                                领取奖励
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                      {featureData.data.events.length === 0 ? (
                        <p className="empty-copy">当前周期暂无活动。</p>
                      ) : null}
                    </div>
                  ) : null}

                  {featureKind === "inner_world" && featureData?.kind === "inner_world" ? (
                    <div className="feature-stack">
                      {!featureData.data.state.unlocked ? (
                        <output className="feature-lock-notice">
                          <strong>内天地尚未解锁</strong>
                          <span>{featureData.data.state.unlock_hint}</span>
                        </output>
                      ) : null}
                      <div className="feature-stat-grid">
                        <FeatureStat
                          label="天地等级"
                          value={`Lv.${featureData.data.state.world_level}`}
                        />
                        <FeatureStat
                          label="法则经验"
                          value={`${featureData.data.state.law_exp} / ${featureData.data.state.next_law_exp_required}`}
                        />
                        <FeatureStat
                          label="派驻中"
                          value={`${featureData.data.state.active_assignment_count} / ${featureData.data.state.assignment_limit}`}
                        />
                        <FeatureStat
                          label="今日支援"
                          value={`${featureData.data.state.support_count_today} / ${featureData.data.state.support_limit_daily}`}
                        />
                      </div>
                      <div className="feature-subsection">
                        <div className="feature-subsection-heading">
                          <h3>天地成长</h3>
                          <span>达到解锁境界后才可操作</span>
                        </div>
                        <div className="feature-card-actions">
                          <button
                            disabled={!featureData.data.state.unlocked || featureLoading || busy || hydrating}
                            onClick={() => upgradeInnerWorld("world")}
                            type="button"
                          >
                            升级内天地
                          </button>
                          {featureData.data.creatures
                            .filter((creature) => creature.status !== "assigned")
                            .map((creature) => (
                              <button
                                disabled={!featureData.data.state.unlocked || featureLoading || busy || hydrating}
                                key={`upgrade_${creature.creature_id}`}
                                onClick={() => upgradeInnerWorld("creature", creature.creature_id)}
                                type="button"
                              >
                                {creature.name}升级
                              </button>
                            ))}
                        </div>
                      </div>
                      <div className="feature-subsection">
                        <div className="feature-subsection-heading">
                          <h3>派驻生灵</h3>
                          <span>选择州域后即可出发</span>
                        </div>
                        <div className="feature-inline-form">
                          <select
                            aria-label="派驻生灵"
                            disabled={!featureData.data.state.unlocked || featureLoading}
                            value={innerDispatchCreature}
                            onChange={(event) => setInnerDispatchCreature(event.target.value)}
                          >
                            <option value="">自动选择</option>
                            {featureData.data.creatures
                              .filter((creature) => creature.status === "idle")
                              .map((creature) => (
                                <option key={creature.creature_id} value={creature.creature_id}>
                                  {creature.name} · Lv.{creature.level}
                                </option>
                              ))}
                          </select>
                          <select
                            aria-label="派驻州域"
                            disabled={!featureData.data.state.unlocked || featureLoading}
                            value={innerDispatchProvince}
                            onChange={(event) => setInnerDispatchProvince(event.target.value)}
                          >
                            <option value="">选择州域</option>
                            {(overview?.provinces ?? [])
                              .filter((province) => province.unlocked)
                              .map((province) => (
                                <option key={province.province_id} value={province.province_id}>
                                  {province.name}
                                </option>
                              ))}
                          </select>
                          <button
                            disabled={
                              !featureData.data.state.unlocked ||
                              featureLoading ||
                              busy ||
                              hydrating ||
                              !innerDispatchProvince
                            }
                            onClick={dispatchInnerWorld}
                            type="button"
                          >
                            派驻
                          </button>
                        </div>
                      </div>
                      <div className="feature-subsection">
                        <div className="feature-subsection-heading">
                          <h3>当前派驻</h3>
                          <span>{featureData.data.assignments.length} 条记录</span>
                        </div>
                        <div className="feature-card-grid">
                          {featureData.data.assignments.map((assignment) => (
                            <article
                              className="feature-card feature-card-compact"
                              key={assignment.assignment_id}
                            >
                              <div className="feature-card-heading">
                                <h3>{assignment.creature_name}</h3>
                                <strong>
                                  {assignment.status === "claimable" ? "可领取" : assignment.status}
                                </strong>
                              </div>
                              <p>
                                {assignment.province_name} ·{" "}
                                {formatDuration(assignment.remaining_seconds)}
                              </p>
                              {assignment.status === "claimable" ? (
                                <button
                                  disabled={
                                    !featureData.data.state.unlocked ||
                                    featureLoading ||
                                    busy ||
                                    hydrating
                                  }
                                  onClick={() => claimInnerWorld(assignment.assignment_id)}
                                  type="button"
                                >
                                  收取收益
                                </button>
                              ) : null}
                            </article>
                          ))}
                          {featureData.data.assignments.length === 0 ? (
                            <p className="empty-copy">尚无派驻记录。</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="feature-subsection">
                        <div className="feature-subsection-heading">
                          <h3>州域支援</h3>
                          <span>每日支援次数受内天地状态限制</span>
                        </div>
                        <div className="feature-inline-form">
                          <select
                            aria-label="支援类型"
                            disabled={!featureData.data.state.unlocked || featureLoading || busy || hydrating}
                            value={innerSupportType}
                            onChange={(event) => setInnerSupportType(event.target.value as InnerWorldSupportType)}
                          >
                            <option value="spirit_vein">灵脉支援</option>
                            <option value="tower_supply">九塔补给</option>
                            <option value="secret_realm">秘境支援</option>
                          </select>
                          <button
                            disabled={!featureData.data.state.unlocked || featureLoading || busy || hydrating || !innerDispatchProvince}
                            onClick={supportInnerWorld}
                            type="button"
                          >
                            支援州域
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {featureKind === "sect" && featureData?.kind === "sect" ? (
                    <div className="feature-stack">
                      {featureData.data.detail.sect ? (
                        <>
                          <div className="feature-hero-card">
                            <div>
                              <span className="feature-card-kicker">
                                {featureData.data.detail.sect.alignment}
                              </span>
                              <h3>{featureData.data.detail.sect.name}</h3>
                            </div>
                            <strong>Lv.{featureData.data.detail.sect.level}</strong>
                            <p>
                              成员 {featureData.data.detail.sect.member_count} /{" "}
                              {featureData.data.detail.sect.member_limit} · 贡献{" "}
                              {featureData.data.detail.sect.my_contribution_total}
                            </p>
                          </div>
                          <div className="feature-subsection">
                            <div className="feature-subsection-heading">
                              <h3>宗门成员</h3>
                              <span>{featureData.data.detail.members.length} 人</span>
                            </div>
                            <div className="feature-list">
                              {featureData.data.detail.members.map((member) => (
                                <div className="feature-list-row" key={member.player_id}>
                                  <strong>{member.name}</strong>
                                  <span>{member.role}</span>
                                  <small>贡献 {member.contribution_total}</small>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="feature-subsection">
                            <div className="feature-subsection-heading">
                              <h3>宗门任务</h3>
                              <span>完成任务获得贡献与宗门资金</span>
                            </div>
                            <div className="feature-inline-form">
                              <select
                                aria-label="宗门任务"
                                disabled={featureLoading || busy || hydrating}
                                value={sectTaskId}
                                onChange={(event) => setSectTaskId(event.target.value)}
                              >
                                <option value="sect_patrol">灵脉巡护</option>
                                <option value="sect_tower_supply">九塔补给</option>
                              </select>
                              <button
                                disabled={featureLoading || busy || hydrating}
                                onClick={completeSectTask}
                                type="button"
                              >
                                完成任务
                              </button>
                            </div>
                          </div>
                          <div className="feature-subsection">
                            <div className="feature-subsection-heading">
                              <h3>宗门仓库</h3>
                              <span>{featureData.data.detail.warehouse.length} 种材料</span>
                            </div>
                            <div className="feature-list">
                              {featureData.data.detail.warehouse.map((item) => (
                                <div className="feature-list-row" key={item.item_id}>
                                  <strong>{item.name}</strong>
                                  <span>×{item.count}</span>
                                  <button
                                    disabled={featureLoading || busy || hydrating}
                                    onClick={() => {
                                      setSectWarehouseItemId(item.item_id);
                                      withdrawSectWarehouse(item.item_id);
                                    }}
                                    type="button"
                                  >
                                    取出 1
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="feature-inline-form">
                              <select
                                aria-label="存入宗门仓库的材料"
                                disabled={featureLoading || busy || hydrating}
                                value={sectWarehouseItemInstanceId}
                                onChange={(event) => setSectWarehouseItemInstanceId(event.target.value)}
                              >
                                <option value="">选择未绑定材料</option>
                                {(bag?.items ?? [])
                                  .filter((item) => item.bind_type === "unbound" && item.tradeable && !item.expired)
                                  .map((item) => (
                                    <option key={item.item_instance_id} value={item.item_instance_id}>
                                      {item.name} ×{item.count}
                                    </option>
                                  ))}
                              </select>
                              <button
                                disabled={featureLoading || busy || hydrating || !sectWarehouseItemInstanceId}
                                onClick={depositSectWarehouse}
                                type="button"
                              >
                                存入 1
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="feature-stack">
                          <div className="feature-inline-form">
                            <input
                              aria-label="宗门名称"
                              maxLength={16}
                              onChange={(event) => setSectName(event.target.value)}
                              placeholder="输入宗门名称"
                              value={sectName}
                            />
                            <select
                              aria-label="宗门路线"
                              value={sectAlignment}
                              onChange={(event) => setSectAlignment(event.target.value as SectAlignment)}
                            >
                              <option value="neutral">中立</option>
                              <option value="immortal">仙门</option>
                              <option value="demon">魔门</option>
                            </select>
                            <button
                              disabled={featureLoading || busy || hydrating || !sectName.trim()}
                              onClick={createSect}
                              type="button"
                            >
                              创建宗门
                            </button>
                          </div>
                          <div className="feature-card-grid">
                          {(featureData.data.list?.sects ?? []).map((sect) => (
                            <article className="feature-card" key={sect.sect_id}>
                              <div className="feature-card-heading">
                                <h3>{sect.name}</h3>
                                <strong>Lv.{sect.level}</strong>
                              </div>
                              <p>
                                {sect.alignment} · 成员 {sect.member_count}/{sect.member_limit}
                              </p>
                              <button
                                disabled={featureLoading || busy || hydrating}
                                onClick={() => joinSect(sect.sect_id)}
                                type="button"
                              >
                                加入宗门
                              </button>
                            </article>
                          ))}
                          {(featureData.data.list?.sects ?? []).length === 0 ? (
                            <p className="empty-copy">当前没有可加入的宗门。</p>
                          ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {featureKind === "boss" && featureData?.kind === "boss" ? (
                    <div className="feature-stack">
                      <div className="feature-hero-card feature-boss-card">
                        <div>
                          <span className="feature-card-kicker">
                            第 {featureData.data.boss.phase} 阶段
                          </span>
                          <h3>{featureData.data.boss.name}</h3>
                        </div>
                        <strong>{featureData.data.boss.remaining_hp.toLocaleString()} HP</strong>
                        <div className="feature-progress-track">
                          <span
                            style={{
                              width: `${Math.max(0, Math.min(100, (featureData.data.boss.remaining_hp / Math.max(1, featureData.data.boss.total_hp)) * 100))}%`,
                            }}
                          />
                        </div>
                        <p>全服击破次数：{featureData.data.boss.defeated_count}</p>
                        <button
                          disabled={
                            featureLoading ||
                            busy ||
                            hydrating ||
                            featureData.data.boss.remaining_hp <= 0
                          }
                          onClick={() => challengeWorldBoss(featureData.data.boss.boss_id)}
                          type="button"
                        >
                          挑战 Boss
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {featureKind === "rank" && featureData?.kind === "rank" ? (
                    <div className="feature-stack">
                      <div className="feature-inline-form feature-rank-toolbar">
                        <select
                          aria-label="排行榜类型"
                          value={featureRankType}
                          onChange={(event) =>
                            void loadFeature("rank", undefined, event.target.value as RankType)
                          }
                        >
                          <option value="personal">个人排行</option>
                          <option value="sect">宗门排行</option>
                          <option value="tower_week">九塔周榜</option>
                          <option value="production">炼制排行</option>
                          <option value="inner_world">内天地榜</option>
                          <option value="era">纪元排行</option>
                          <option value="faction">阵营排行</option>
                        </select>
                        <span>周期：{featureData.data.period_key}</span>
                        {featureData.data.title_rewards?.length ? (
                          <button
                            disabled={featureLoading || busy || hydrating}
                            onClick={claimRankTitle}
                            type="button"
                          >
                            领取榜单称号
                          </button>
                        ) : null}
                      </div>
                      <div className="feature-list feature-rank-list">
                        {featureData.data.entries.map((entry) => (
                          <div
                            className="feature-list-row"
                            key={`${entry.target_id}_${entry.rank_no}`}
                          >
                            <strong>
                              #{entry.rank_no} {entry.display_name}
                            </strong>
                            <span>{entry.score}</span>
                            <small>{entry.risk_note ?? "正常记录"}</small>
                          </div>
                        ))}
                        {featureData.data.entries.length === 0 ? (
                          <p className="empty-copy">当前周期暂无排行数据。</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {featureKind === "ancient" && featureData?.kind === "ancient" ? (
                    <div className="feature-stack">
                      <div className="feature-inline-form">
                        <span className="empty-copy">使用绑定仙玉抽取古宝，重复获得会转化为残页与灵魄。</span>
                        <button
                          disabled={featureLoading || busy || hydrating}
                          onClick={drawAncientTreasure}
                          type="button"
                        >
                          抽取一次
                        </button>
                      </div>
                      <div className="feature-card-grid feature-treasure-grid">
                      {featureData.data.treasures.map((treasure) => (
                        <article
                          className={`feature-card feature-treasure-card${treasure.owned ? " feature-treasure-owned" : ""}`}
                          key={treasure.treasure_id}
                        >
                          <div className="feature-card-heading">
                            <h3>{treasure.name}</h3>
                            <strong>{treasure.owned ? "已拥有" : "未解锁"}</strong>
                          </div>
                          <p>
                            星级 {treasure.star_level} · 残页 {treasure.fragment_count} · 灵魄{" "}
                            {treasure.soul_count}
                          </p>
                        </article>
                      ))}
                      {featureData.data.treasures.length === 0 ? (
                        <p className="empty-copy">尚未发现古宝记录。</p>
                      ) : null}
                      </div>
                    </div>
                  ) : null}

                  {featureKind === "commerce" && featureData?.kind === "commerce" ? (
                    <div className="feature-stack">
                      <div className="feature-stat-grid">
                        <FeatureStat label="当前权益" value={featureData.data.effective_tier} />
                        <FeatureStat
                          label="VIP"
                          value={featureData.data.vip.active ? `VIP ${featureData.data.vip.vip_level}` : "未激活"}
                        />
                        <FeatureStat
                          label="便利批次"
                          value={`${featureData.data.convenience.batch_sweep_limit} 次`}
                        />
                        <FeatureStat
                          label="月卡赠抽"
                          value={`${featureData.data.available_monthly_grants.reduce((sum, grant) => sum + grant.draw_count - grant.used_count, 0)} 次`}
                        />
                      </div>
                      <div className="feature-subsection">
                        <div className="feature-subsection-heading">
                          <h3>月卡状态</h3>
                          <span>订单权益只由服务端验证后写入</span>
                        </div>
                        <div className="feature-card-grid">
                          {featureData.data.monthly_cards.map((card) => (
                            <article className="feature-card feature-card-compact" key={card.card_type}>
                              <div className="feature-card-heading">
                                <h3>{card.card_type === "small_monthly" ? "小月卡" : "大月卡"}</h3>
                                <strong>{card.active ? "生效中" : "已失效"}</strong>
                              </div>
                              <p>剩余 {card.remaining_days} 天 · 到期 {formatDateTime(card.active_until)}</p>
                              <button
                                disabled={!card.active || featureLoading || busy || hydrating}
                                onClick={() => claimMonthlyDaily(card.card_type)}
                                type="button"
                              >
                                领取每日权益
                              </button>
                            </article>
                          ))}
                          {featureData.data.monthly_cards.length === 0 ? (
                            <p className="empty-copy">当前没有生效月卡；购买和 VIP 权益请通过已验证订单开通。</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {featureKind === "equipment" && featureData?.kind === "equipment" ? (
                    <div className="feature-card-grid">
                      {featureData.data.equipments.map((equipment) => (
                        <article className="feature-card" key={equipment.equipment_instance_id}>
                          <div className="feature-card-heading">
                            <div>
                              <span className="feature-card-kicker">{equipment.rarity}</span>
                              <h3>{equipment.name}</h3>
                            </div>
                            <strong>{equipment.equipped_slot ? "已装备" : "未装备"}</strong>
                          </div>
                          <p>
                            {equipment.equipment_type} · {equipment.star_level} 星 · 耐久 {equipment.durability}/{equipment.max_durability}
                          </p>
                          <div className="feature-tag-list">
                            {equipment.affixes.map((affix) => (
                              <span key={affix.affix_id}>{affix.name} +{affix.value}</span>
                            ))}
                          </div>
                          <div className="feature-card-actions">
                            <button
                              disabled={featureLoading || busy || hydrating}
                              onClick={() =>
                                equipOrUnequipEquipment(
                                  equipment.equipment_instance_id,
                                  equipment.equipped_slot,
                                )
                              }
                              type="button"
                            >
                              {equipment.equipped_slot ? "卸下" : "装备"}
                            </button>
                          </div>
                        </article>
                      ))}
                      {featureData.data.equipments.length === 0 ? (
                        <p className="empty-copy">当前没有可管理的法宝。</p>
                      ) : null}
                    </div>
                  ) : null}

                  {featureKind === "skills" && featureData?.kind === "skills" ? (
                    <div className="feature-stack">
                      <div className="feature-subsection">
                        <div className="feature-subsection-heading">
                          <h3>主动技能</h3>
                          <span>最多选择 3 个</span>
                        </div>
                        <div className="feature-card-grid">
                          {featureData.data.available_skills
                            .filter((skill) => skill.skill_type === "active")
                            .map((skill) => {
                              const selected = skillActiveIds.includes(skill.skill_id);
                              return (
                                <button
                                  className={`feature-card skill-choice${selected ? " skill-choice-selected" : ""}`}
                                  disabled={!skill.learned || featureLoading || busy || hydrating}
                                  key={skill.skill_id}
                                  onClick={() =>
                                    setSkillActiveIds((current) =>
                                      selected
                                        ? current.filter((id) => id !== skill.skill_id)
                                        : current.length >= 3
                                          ? current
                                          : [...current, skill.skill_id],
                                    )
                                  }
                                  type="button"
                                >
                                  <strong>{skill.name}</strong>
                                  <span>{skill.learned ? skill.description : skill.unlock_reasons.join("、")}</span>
                                  <small>{selected ? "已编入" : skill.learned ? "点击编入" : "尚未掌握"}</small>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                      <div className="feature-inline-form">
                        <label htmlFor="feature-treasure-skill">本命技能</label>
                        <select
                          id="feature-treasure-skill"
                          disabled={featureLoading || busy || hydrating}
                          value={skillTreasureId}
                          onChange={(event) => setSkillTreasureId(event.target.value)}
                        >
                          {featureData.data.available_skills
                            .filter((skill) => skill.skill_type === "treasure" && skill.learned)
                            .map((skill) => (
                              <option key={skill.skill_id} value={skill.skill_id}>
                                {skill.name}
                              </option>
                            ))}
                        </select>
                        <button
                          disabled={featureLoading || busy || hydrating || skillActiveIds.length === 0}
                          onClick={saveFeatureSkillLoadout}
                          type="button"
                        >
                          保存编组
                        </button>
                      </div>
                      {featureData.data.preset_suggestions?.length ? (
                        <div className="feature-list">
                          {featureData.data.preset_suggestions.map((suggestion) => (
                            <div className="feature-list-row" key={suggestion.suggestion_id}>
                              <strong>{suggestion.title}</strong>
                              <span>{suggestion.reason}</span>
                              <button
                                disabled={featureLoading || busy || hydrating}
                                onClick={() => {
                                  setSkillActiveIds(suggestion.active_skill_ids);
                                  setSkillTreasureId(suggestion.treasure_skill_id);
                                }}
                                type="button"
                              >
                                使用建议
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {featureKind === "tower" && featureData?.kind === "tower" ? (
                    <div className="feature-card-grid feature-tower-grid">
                      {featureData.data.towers.map((tower) => (
                        <article className="feature-card" key={tower.tower_id}>
                          <div className="feature-card-heading">
                            <div>
                              <span className="feature-card-kicker">第 {tower.phase} 阶段</span>
                              <h3>{tower.tower_name}</h3>
                            </div>
                            <strong>完整度 {tower.integrity}%</strong>
                          </div>
                          <p>
                            {tower.mechanism} · Boss：{tower.boss_name}
                          </p>
                          <div className="feature-progress-track">
                            <span
                              style={{ width: `${Math.max(0, Math.min(100, tower.integrity))}%` }}
                            />
                          </div>
                          <div className="feature-card-actions feature-tower-actions">
                            <button
                              disabled={featureLoading || busy || hydrating}
                              onClick={() => actOnTower(tower.tower_id, "seal")}
                              type="button"
                            >
                              镇封
                            </button>
                            <button
                              disabled={featureLoading || busy || hydrating}
                              onClick={() => actOnTower(tower.tower_id, "break")}
                              type="button"
                            >
                              破阵
                            </button>
                            <button
                              disabled={featureLoading || busy || hydrating}
                              onClick={() => actOnTower(tower.tower_id, "supply")}
                              type="button"
                            >
                              补给
                            </button>
                            <button
                              disabled={featureLoading || busy || hydrating}
                              onClick={() => actOnTower(tower.tower_id, "guard")}
                              type="button"
                            >
                              守卫
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeOverlay === "production" && productionKind ? (
                <section className="production-dialog" aria-label="炼制材料选择">
                  <p className="empty-copy">
                    选择要投入的材料；材料数量只会在提交时校验，文字指令仍可继续使用。
                  </p>
                  {productionResult.length > 0 ? (
                    <output className="production-result">
                      {productionResult.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </output>
                  ) : null}
                  {productionLastRecordId ? (
                    <div className="feature-inline-form production-formula-save">
                      <input
                        aria-label="单方名称"
                        maxLength={24}
                        onChange={(event) => setProductionFormulaName(event.target.value)}
                        placeholder={productionKind === "alchemy" ? "为这次炼丹命名" : "为这次炼器命名"}
                        value={productionFormulaName}
                      />
                      <button
                        disabled={productionCrafting || busy || hydrating || !productionFormulaName.trim()}
                        onClick={() => void saveProductionFormula()}
                        type="button"
                      >
                        保存单方
                      </button>
                    </div>
                  ) : null}
                  {productionFormulas.length > 0 ? (
                    <section className="production-formula-section" aria-label="已保存单方">
                      <div className="production-section-heading">
                        <div>
                          <p className="console-eyebrow">已保存单方</p>
                          <h3>选择单方直接投炉</h3>
                        </div>
                        <span>{selectedProductionFormulaId ? "已选择" : "可选"}</span>
                      </div>
                      <div className="production-formula-list">
                        {productionFormulas.map((formula) => {
                          const selected = selectedProductionFormulaId === formula.formula_id;
                          return (
                            <button
                              className={`production-formula-card${selected ? " production-formula-card-selected" : ""}`}
                              disabled={productionCrafting}
                              key={formula.formula_id}
                              onClick={() => {
                                setSelectedProductionFormulaId(
                                  selected ? null : formula.formula_id,
                                );
                                setSelectedProductionMaterials({});
                              }}
                              type="button"
                            >
                              <span className="production-formula-heading">
                                <strong>{formula.name}</strong>
                                <small>
                                  {selected
                                    ? "已选择"
                                    : formula.visibility === "public"
                                      ? "公开"
                                      : "私有"}
                                </small>
                              </span>
                              <span className="production-formula-materials">
                                {formula.materials
                                  .map(
                                    (material) =>
                                      `${productionMaterials.find((item) => item.item_id === material.item_id)?.name ?? material.item_id} ×${material.count}`,
                                  )
                                  .join("、")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                  {productionFormulas.length === 0 && !productionLoading ? (
                    <p className="production-formula-empty">
                      尚未保存单方；成功炼制后可保存为丹方或器方。
                    </p>
                  ) : null}
                  {productionLoading ? <p className="empty-copy">正在整理可投炉材料…</p> : null}
                  {!productionLoading && productionMaterials.length === 0 ? (
                    <p className="empty-copy">
                      当前没有可投炉材料，请先通过探索或洞府收取获取材料。
                    </p>
                  ) : null}
                  <div className="production-material-list">
                    {productionMaterials.map((material) => {
                      const owned = Number(
                        bagDisplayItems.find((item) => item.item_id === material.item_id)?.count ??
                          0,
                      );
                      const selected = selectedProductionMaterials[material.item_id] ?? 0;
                      return (
                        <div className="production-material-row" key={material.item_id}>
                          <div>
                            <strong>{material.name}</strong>
                            <span>{material.source_hint}</span>
                            <small>拥有 {owned}</small>
                          </div>
                          <div className="production-material-counter">
                            <button
                              aria-label={`减少${material.name}`}
                              disabled={
                                selected <= 0 ||
                                productionCrafting ||
                                selectedProductionFormulaId !== null
                              }
                              onClick={() =>
                                setSelectedProductionMaterials((current) => ({
                                  ...current,
                                  [material.item_id]: Math.max(
                                    0,
                                    (current[material.item_id] ?? 0) - 1,
                                  ),
                                }))
                              }
                              type="button"
                            >
                              −
                            </button>
                            <input
                              aria-label={`${material.name}数量`}
                              disabled={
                                productionCrafting ||
                                selectedProductionFormulaId !== null ||
                                owned <= 0
                              }
                              max={owned}
                              min={0}
                              onChange={(event) => {
                                const next = Math.min(
                                  owned,
                                  Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                                );
                                setSelectedProductionMaterials((current) => ({
                                  ...current,
                                  [material.item_id]: next,
                                }));
                              }}
                              type="number"
                              value={selected}
                            />
                            <button
                              aria-label={`增加${material.name}`}
                              disabled={
                                selected >= owned ||
                                productionCrafting ||
                                selectedProductionFormulaId !== null
                              }
                              onClick={() =>
                                setSelectedProductionMaterials((current) => ({
                                  ...current,
                                  [material.item_id]: Math.min(
                                    owned,
                                    (current[material.item_id] ?? 0) + 1,
                                  ),
                                }))
                              }
                              type="button"
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="utility-dialog-actions">
                    <button
                      className="console-button console-button-primary"
                      disabled={productionCrafting || productionLoading || busy || hydrating}
                      onClick={() => void craftProduction()}
                      type="button"
                    >
                      {productionCrafting
                        ? "投炉中…"
                        : selectedProductionFormulaId
                          ? productionKind === "alchemy"
                            ? "按丹方炼制"
                            : "按器方炼制"
                          : productionKind === "alchemy"
                            ? "开始炼丹"
                            : "开始炼器"}
                    </button>
                  </div>
                </section>
              ) : null}

              {activeOverlay === "help" ? (
                <>
                  <div className="utility-dialog-actions">
                    <button
                      className="quiet-button"
                      disabled={busy || hydrating}
                      onClick={() => {
                        if (token) {
                          void refreshHelp(token).catch((error) =>
                            setHelpError(messageFromError(error)),
                          );
                        }
                      }}
                      type="button"
                    >
                      更新帮助
                    </button>
                  </div>
                  {helpError ? (
                    <p className="panel-warning">服务帮助暂不可用，以下为本地指引：{helpError}</p>
                  ) : null}
                  <div className="help-groups">
                    {visibleHelpGroups.map((group) => (
                      <details
                        key={group.id}
                        onToggle={(event) => {
                          const isOpen = event.currentTarget.open;
                          setOpenHelpGroupId((current) => {
                            if (isOpen) {
                              return group.id;
                            }
                            return current === group.id ? null : current;
                          });
                        }}
                        open={openHelpGroupId === group.id}
                      >
                        <summary>{group.title}</summary>
                        {group.description ? <p>{group.description}</p> : null}
                        <ul>
                          {group.items.map((item) => (
                            <li key={`${group.title}_${item.syntax}`}>
                              <code>{item.syntax}</code>
                              <span>{item.description}</span>
                              {item.aliases.length > 0 ? (
                                <small>别名：{item.aliases.join("、")}</small>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </>
              ) : null}

              {activeOverlay === "realms" ? (
                <section className="realm-progression" aria-label="全部境界与等级">
                  <div className="utility-dialog-actions">
                    <button
                      className="quiet-button"
                      disabled={realmProgressionLoading || !token}
                      onClick={() => void refreshRealmProgression()}
                      type="button"
                    >
                      {realmProgressionLoading ? "读取中…" : "刷新境界"}
                    </button>
                  </div>
                  {realmProgressionError ? (
                    <p className="panel-warning">境界总览暂时无法读取：{realmProgressionError}</p>
                  ) : null}
                  {realmProgressionLoading && !realmProgression ? (
                    <p className="empty-copy">正在整理九境脉络…</p>
                  ) : null}
                  {realmProgression ? (
                    <ol className="realm-progression-list">
                      {realmProgression.realms.map((realm) => {
                        const isCurrentRealm = cultivation?.current_realm === realm.realm_id;
                        const isPassedRealm = (cultivation?.current_realm ?? 0) > realm.realm_id;
                        const realmName =
                          realmProgression.route === "body" ? realm.body_name : realm.qi_name;
                        return (
                          <li
                            className={`realm-progression-item${
                              isCurrentRealm
                                ? " realm-progression-item-current"
                                : isPassedRealm
                                  ? " realm-progression-item-passed"
                                  : ""
                            }`}
                            key={realm.realm_id}
                          >
                            <div className="realm-progression-heading">
                              <div>
                                <span>第 {realm.realm_id} 境</span>
                                <strong>{realmName}</strong>
                              </div>
                              <small>战力 +{realm.power_bonus_percent}%</small>
                            </div>
                            <div className="realm-stage-list" aria-label={`${realmName}小境界`}>
                              {realm.stages.map((stage) => {
                                const stageName =
                                  realmProgression.route === "body"
                                    ? stage.body_name
                                    : stage.qi_name;
                                return (
                                  <section className="realm-stage" key={stage.stage_id}>
                                    <strong>{stageName}</strong>
                                    <div
                                      className="realm-level-list"
                                      aria-label={`${stageName}等级`}
                                    >
                                      {stage.levels.map((level) => (
                                        <span
                                          className={
                                            isCurrentRealm &&
                                            cultivation?.current_stage === stage.stage_id &&
                                            cultivation?.current_level === level.level
                                              ? "realm-level realm-level-current"
                                              : "realm-level"
                                          }
                                          key={level.level}
                                        >
                                          {level.level} 级
                                        </span>
                                      ))}
                                    </div>
                                  </section>
                                );
                              })}
                            </div>
                            <p className="realm-progression-requirement">
                              {realm.breakthrough_cultivation === "0"
                                ? "此境已是当前纪元极境"
                                : `圆满后需 ${realm.breakthrough_cultivation} 修为突破`}
                            </p>
                            {realm.unlocks.length > 0 ? (
                              <ul className="realm-unlock-list">
                                {realm.unlocks.map((unlock) => (
                                  <li key={unlock.feature_id}>
                                    <strong>{unlock.label}</strong>
                                    <span>{unlock.description}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}
                </section>
              ) : null}

              {activeOverlay === "scrolls" ? (
                selectedScroll ? (
                  <section className="story-replay" aria-label="卷轴回放">
                    <div className="utility-dialog-actions">
                      <button
                        className="quiet-button"
                        onClick={() => {
                          setSelectedScroll(null);
                          setScrollDetailError(null);
                        }}
                        type="button"
                      >
                        返回卷轴
                      </button>
                    </div>
                    <div className="story-replay-heading">
                      <strong>{selectedScroll.title}</strong>
                      <span>{selectedScroll.subtitle}</span>
                      <small>
                        {selectedScroll.unlock_state === "archived"
                          ? "已完成并归档"
                          : "书写中，可随时回看已解锁片段"}
                      </small>
                    </div>
                    <ul className="scroll-list">
                      {selectedScroll.fragments.map((fragment) => (
                        <li key={fragment.fragment_id}>
                          <strong>{fragment.title}</strong>
                          <span>{fragment.body}</span>
                        </li>
                      ))}
                    </ul>
                    {selectedScroll.choice_summary.length > 0 ? (
                      <section className="story-replay-section">
                        <h3>本卷抉择</h3>
                        <ul className="scroll-list">
                          {selectedScroll.choice_summary.map((summary) => (
                            <li key={summary}>
                              <span>{summary}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {selectedScroll.battle_refs.length > 0 ? (
                      <section className="story-replay-section">
                        <h3>关联战报</h3>
                        <ul className="scroll-list">
                          {selectedScroll.battle_refs.map((battle) => (
                            <li className="scroll-list-action" key={battle.battle_id}>
                              <div>
                                <strong>{battle.title}</strong>
                                <span>{battle.summary}</span>
                                <small>{formatDateTime(battle.created_at)}</small>
                              </div>
                              <button
                                className="quiet-button"
                                disabled={busy || hydrating}
                                onClick={() => {
                                  setOverlayReturnView("scrolls");
                                  setActiveOverlay("battles");
                                  setSelectedScroll(null);
                                  void loadBattleDetail(battle.battle_id);
                                }}
                                type="button"
                              >
                                查看战报
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </section>
                ) : readableStoryScrolls.length > 0 ? (
                  <>
                    {scrollDetailError ? (
                      <p className="panel-warning">卷轴暂时无法回看：{scrollDetailError}</p>
                    ) : null}
                    <ul className="scroll-list">
                      {readableStoryScrolls.map((scroll) => (
                        <li className="scroll-list-action" key={scroll.scroll_id}>
                          <div>
                            <strong>{scroll.title}</strong>
                            <span>{scroll.latest_fragment || scroll.subtitle}</span>
                            <small>
                              第 {scroll.chapter_id} 章 · {scroll.progress_percent}% ·{" "}
                              {scroll.unlock_state === "archived" ? "已归档" : "书写中"}
                            </small>
                          </div>
                          <button
                            className="quiet-button"
                            disabled={scrollDetailLoading || !token}
                            onClick={() => void loadScrollDetail(scroll.scroll_id)}
                            type="button"
                          >
                            {scrollDetailLoading ? "读取中…" : "回看"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="empty-copy">卷轴会随着探索、抉择和九塔进程逐步显现。</p>
                )
              ) : null}

              {activeOverlay === "faction" ? (
                faction ? (
                  <section className="faction-panel" aria-label="仙魔路线">
                    <p className="faction-route-status">
                      当前道途：{faction.state.route_name}。{faction.state.unlock_hint}
                    </p>
                    {faction.state.route === "undecided" ? (
                      faction.state.unlocked ? (
                        <ul className="scroll-list">
                          {faction.routes.map((routeOption) => (
                            <li className="scroll-list-action" key={routeOption.route_id}>
                              <div>
                                <strong>{routeOption.name}</strong>
                                <span>{routeOption.core_goal}</span>
                                <small>
                                  {routeOption.route_id === "immortal"
                                    ? "可镇封九塔"
                                    : routeOption.route_id === "demon"
                                      ? "可破阵九塔"
                                      : "可补给、守卫九塔"}
                                </small>
                              </div>
                              <button
                                className="quiet-button"
                                disabled={busy || hydrating}
                                onClick={() => void chooseFactionRoute(routeOption.route_id)}
                                type="button"
                              >
                                选择
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-copy">{faction.state.unlock_hint}</p>
                      )
                    ) : (
                      <div className="story-replay-heading">
                        <strong>{faction.state.route_name}</strong>
                        <span>
                          {faction.state.route === "immortal"
                            ? "你只能镇封九塔；补给与守卫仍可参与。"
                            : faction.state.route === "demon"
                              ? "你只能破阵九塔；补给与守卫仍可参与。"
                          : "散修不能镇封或破阵，但可继续补给与守卫。"}
                        </span>
                        {faction.state.transfer_available ? (
                          <div className="feature-inline-form">
                            <select
                              aria-label="转移道途"
                              value={factionTransferTaskId}
                              onChange={(event) => setFactionTransferTaskId(event.target.value)}
                            >
                              <option value="">选择新的道途</option>
                              {faction.routes
                                .filter((routeOption) => routeOption.route_id !== faction.state.route && routeOption.route_id !== "undecided")
                                .map((routeOption) => (
                                  <option key={routeOption.route_id} value={`${routeOption.route_id}:${routeOption.task_chain[0] ?? ""}`}>
                                    转入{routeOption.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              disabled={busy || hydrating || !factionTransferTaskId}
                              onClick={() => {
                                const [routeId, taskId] = factionTransferTaskId.split(":");
                                if (routeId && taskId) void transferFactionRoute(routeId, taskId);
                              }}
                              type="button"
                            >
                              确认转道
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </section>
                ) : (
                  <p className="empty-copy">正在读取仙魔路线…</p>
                )
              ) : null}

              {activeOverlay === "battles" ? (
                battleDetail ? (
                  <section className="battle-detail" aria-label="战报详情">
                    <div className="utility-dialog-actions">
                      <button
                        className="quiet-button"
                        onClick={() => setBattleDetail(null)}
                        type="button"
                      >
                        返回战报
                      </button>
                    </div>
                    <div className="battle-detail-heading">
                      <span>{battleDetail.battle_type}</span>
                      <h3>{battleDetail.title}</h3>
                      <small>{battleDetail.battle_id}</small>
                    </div>
                    <p className="battle-detail-summary">{battleDetail.summary}</p>
                    {battleDetail.result_reason.length > 0 ? (
                      <div className="battle-detail-section">
                        <h4>战果</h4>
                        <ul>
                          {battleDetail.result_reason.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {battleDetail.key_rounds.length > 0 ? (
                      <div className="battle-detail-section">
                        <h4>关键回合</h4>
                        <ol>
                          {battleDetail.key_rounds.map((line, index) => (
                            <li key={`${index}_${line}`}>{line}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <div className="battle-detail-section">
                      <h4>战斗叙事</h4>
                      <div className="battle-narrative-lines">
                        {battleDetail.narrative_lines.map((line, index) => (
                          <p key={`${index}_${line}`}>{line}</p>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : recentBattles.length > 0 ? (
                  <ul className="battle-list">
                    {recentBattles.map((battle) => (
                      <li key={battle.battle_id}>
                        <div>
                          <strong>
                            {battle.result === "win" ? "胜" : "败"} · {battle.enemy_name}
                          </strong>
                          <span>{battle.reason_summary?.[0] ?? `${battle.rounds} 回合交锋`}</span>
                          <small>{formatDateTime(battle.created_at)}</small>
                        </div>
                        <button
                          className="quiet-button"
                          disabled={battleDetailLoading || !token}
                          onClick={() => void loadBattleDetail(battle.battle_id)}
                          type="button"
                        >
                          {battleDetailLoading ? "读取中…" : "查看详情"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">尚无战报。一次探索或九塔挑战，可能会留下新的记录。</p>
                )
              ) : null}
            </UtilityOverlay>
          ) : null}
          {offlineClaimOpen ? (
            <UtilityOverlay
              eyebrow={offlineActionReward ? "长期探索" : "离线收益"}
              title={offlineActionReward ? "探索收益待领取" : "静坐收益待领取"}
              onClose={() => setOfflineClaimOpen(false)}
            >
              <section
                className="offline-reward-dialog"
                aria-label={offlineActionReward ? "离线探索收益" : "离线修为收益"}
              >
                <p>
                  {offlineActionReward
                    ? `离开九州 ${offlineActionReward.offline_minutes} 分钟期间，${offlineActionReward.province_name ?? "州域"}探索已产生待领取收益。`
                    : "离开九州期间，灵台按当前速率积累了可领取修为。"}
                </p>
                <div className="offline-reward-value">
                  {offlineActionReward
                    ? `探索 ${offlineActionReward.estimated_battle_count} 场待结算 · ${formatRewards(offlineActionReward.rewards)}`
                    : `修为 +${cultivation?.claimable_cultivation ?? "0"}`}
                </div>
                <small>
                  {offlineActionReward
                    ? "探索收益遵守每日 21 场基准，离线最多计算 8 小时。"
                    : `当前速率：每小时 ${progress?.cultivation_rate_per_hour ?? 0} 修为（最多计算 8 小时）`}
                </small>
                <div className="utility-dialog-actions">
                  <button
                    className="quiet-button"
                    onClick={() => setOfflineClaimOpen(false)}
                    type="button"
                  >
                    稍后领取
                  </button>
                  <button
                    className="console-button console-button-primary"
                    disabled={busy || hydrating}
                    onClick={() => void handleOfflineClaim()}
                    type="button"
                  >
                    {offlineActionReward ? "领取探索收益" : "领取修为"}
                  </button>
                </div>
              </section>
            </UtilityOverlay>
          ) : null}
          {itemDetail ? (
            <div
              aria-live="polite"
              className={`item-detail-tooltip${itemDetail.above ? " item-detail-tooltip-above" : ""}`}
              role="tooltip"
              style={{ left: itemDetail.left, top: itemDetail.top }}
            >
              <strong>{itemDetail.name}</strong>
              <span>用途：{itemDetail.usageHint}</span>
              {itemDetail.quality ? (
                <span>
                  品质：
                  {pillQualityLabel(
                    itemDetail.quality as NonNullable<
                      BagSummaryResponse["items"][number]["quality"]
                    >,
                  )}
                </span>
              ) : null}
              <small>
                {itemDetail.expired
                  ? "已过期"
                  : itemDetail.bindType === "unbound"
                    ? "未绑定"
                    : "绑定"}
                {itemDetail.tradeable ? " · 可交易" : " · 不可交易"}
              </small>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function UtilityOverlay({
  children,
  eyebrow,
  onClose,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  onClose: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    dialog.showModal();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      aria-labelledby="utility-dialog-title"
      className="utility-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="utility-dialog-heading">
        <div>
          <p className="console-eyebrow">{eyebrow}</p>
          <h2 id="utility-dialog-title">{title}</h2>
        </div>
        <button className="quiet-button" onClick={onClose} type="button">
          关闭
        </button>
      </div>
      <div className="utility-dialog-content">{children}</div>
    </dialog>
  );
}

function FeatureStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="feature-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p className="error-notice" role="alert">
      {message}
    </p>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "已完成";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `剩余 ${hours} 小时 ${minutes} 分` : `剩余 ${Math.max(1, minutes)} 分钟`;
}

function createClient(authToken?: string): GameClient {
  return new GameClient({
    baseUrl: apiBaseUrl,
    token: authToken,
    clientVersion: "nextday-web-text",
  });
}

function createCommandClient(authToken: string): GameClient {
  return createClient(authToken);
}

function readResponse<TData>(response: ApiResponse<TData>): TData {
  if (response.code !== 0) {
    throw new Error(response.message || "请求未完成");
  }
  return response.data;
}

function applyCommandState(
  state: unknown,
  setters: {
    setOverview: (value: GameOverviewResponse) => void;
    setProfile: (value: PlayerProfileResponse) => void;
    setScrolls: (value: StoryScrollListResponse) => void;
  },
) {
  const record = asRecord(state);
  if (!record) {
    return;
  }

  const overview = asRecord(record.overview);
  if (overview && "profile" in overview) {
    setters.setOverview(overview as unknown as GameOverviewResponse);
  }

  const result = asRecord(record.result);
  if (result && "profile" in result && "cultivation" in result) {
    setters.setOverview(result as unknown as GameOverviewResponse);
  }

  const profile = asRecord(record.profile);
  if (profile && "player" in profile) {
    setters.setProfile(profile as unknown as PlayerProfileResponse);
  }

  if (result) {
    const resultProfile = asRecord(result.profile);
    if (resultProfile && "player" in resultProfile) {
      setters.setProfile(resultProfile as unknown as PlayerProfileResponse);
    }
  }

  const scrolls = asRecord(record.scrolls ?? record.story_scrolls);
  if (scrolls && Array.isArray(scrolls.scrolls)) {
    setters.setScrolls(scrolls as unknown as StoryScrollListResponse);
  }

  if (result && Array.isArray(result.scrolls)) {
    setters.setScrolls(result as unknown as StoryScrollListResponse);
  }
}

function normalizeHelpGroups(value: unknown[]): CommandHelpGroup[] {
  const groups: CommandHelpGroup[] = [];
  value.forEach((group, groupIndex) => {
    const record = asRecord(group);
    if (!record) {
      return;
    }
    const items = asArray(record.items ?? record.commands ?? record.entries)
      .map((item) => normalizeHelpItem(item))
      .filter((item): item is CommandHelpItem => item !== null);
    if (items.length === 0) {
      return;
    }
    const description = pickText(record.description, record.summary);
    groups.push({
      id: pickText(record.group_id, record.id) || `group_${groupIndex + 1}`,
      title: pickText(record.title, record.label, record.name) || `指令组 ${groupIndex + 1}`,
      ...(description ? { description } : {}),
      items,
    });
  });
  return groups;
}

function normalizeHelpItem(value: unknown): CommandHelpItem | null {
  if (typeof value === "string") {
    return { syntax: value, description: "", aliases: [] };
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const syntax = pickText(record.syntax, record.command, record.usage, record.name);
  if (!syntax) {
    return null;
  }
  return {
    syntax,
    description: pickText(record.description, record.summary, record.help) || "",
    aliases: textList(record.aliases ?? record.alias),
  };
}

function buildCommandHint(
  value: string,
  provinces: ProvinceSummary[],
  helpGroups: CommandHelpGroup[],
): CommandHint | null {
  const token = commandHead(value);
  if (!token) {
    return null;
  }

  if (["探索", "游历", "explore"].includes(token)) {
    const unlockedProvinces = provinces.filter((province) => province.unlocked);
    if (unlockedProvinces.length === 0) {
      return { options: [], text: "当前尚无可前往州域，请先查看状态。" };
    }
    return {
      options: unlockedProvinces.map((province) => ({
        command: `探索 ${province.name}`,
        label: province.name,
      })),
      text: `可选州域：${unlockedProvinces.map((province) => province.name).join("、")}；直接点击州名即可开始长期探索。`,
    };
  }

  const matchingItems = helpGroups
    .flatMap((group) => group.items)
    .filter((item) =>
      [item.syntax, ...item.aliases].some((candidate) => {
        const candidateHead = commandHead(candidate);
        return candidateHead.startsWith(token) || token.startsWith(candidateHead);
      }),
    )
    .slice(0, 2);
  if (matchingItems.length === 0) {
    return null;
  }

  return {
    options: [],
    text: matchingItems
      .map((item) => `${item.syntax}${item.description ? `：${item.description}` : ""}`)
      .join("；"),
  };
}

function commandSuggestionsFromState(
  state: unknown,
  pendingExploreEvents: PendingExploreEvent[],
): CommandAction[] {
  const stateRecord = asRecord(state);
  const hasPendingExploreEvent = pendingExploreEvents.length > 0;
  const commands = asArray(stateRecord?.suggestions)
    .map((value) => {
      const record = asRecord(value);
      const command = pickText(record?.command);
      const label = pickText(record?.label) || command;
      return command ? { command, label } : null;
    })
    .filter((item): item is CommandAction => item !== null)
    .filter((item) => !hasPendingExploreEvent || !/^(奇遇|处理奇遇)\s+\S+/u.test(item.command));

  const unique = new Map<string, CommandAction>();
  for (const command of commands) {
    unique.set(command.command, command);
  }
  return [...unique.values()].slice(0, 2);
}

function commandHead(value: string): string {
  return value.trim().replace(/^\//, "").split(/\s+/u)[0]?.toLocaleLowerCase("en-US") ?? "";
}

function pillQualityLabel(quality: NonNullable<BagSummaryResponse["items"][number]["quality"]>) {
  return (
    {
      low: "下品",
      middle: "中品",
      high: "上品",
      best: "极品",
      flawless: "无瑕",
    }[quality] ?? quality
  );
}

function formatRewards(rewards: {
  cultivation?: string;
  spirit_stone?: string;
  action_points?: number;
}): string {
  const parts: string[] = [];
  if (rewards.cultivation && rewards.cultivation !== "0")
    parts.push(`修为 +${rewards.cultivation}`);
  if (rewards.spirit_stone && rewards.spirit_stone !== "0")
    parts.push(`灵石 +${rewards.spirit_stone}`);
  if (typeof rewards.action_points === "number" && rewards.action_points !== 0)
    parts.push(`行动令 +${rewards.action_points}`);
  return parts.join("，") || "暂无可见资源";
}

function summarizeBagItemsForDisplay(items: BagItemState[]): BagItemState[] {
  const grouped = new Map<string, BagItemState>();
  for (const item of items) {
    const key = [item.item_id, item.quality ?? "", item.bind_type, item.locked, item.expired].join(
      ":",
    );
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...item });
      continue;
    }
    current.count = (BigInt(current.count) + BigInt(item.count)).toString();
  }
  return [...grouped.values()];
}

function normalizeCommandEntries(entries: unknown[]): TerminalEntry[] {
  const batch = mergeCommandEntries(entries);
  return batch ? [terminalEntry(batch.tone, "九州传音", batch.lines)] : [];
}

function markDeliveredExploreEvents(state: unknown, deliveredEventIds: Set<string>) {
  const stateRecord = asRecord(state);
  const result = asRecord(stateRecord?.result);
  if (!result) {
    return;
  }

  for (const value of [result.event, ...asArray(result.events)]) {
    const event = asRecord(value);
    const eventId = pickText(event?.event_id);
    if (eventId) {
      deliveredEventIds.add(eventId);
    }
  }
}

function terminalEntry(tone: TerminalTone, title: string, lines: string[]): TerminalEntry {
  return {
    id: `${tone}_${Date.now()}_${randomId()}`,
    lines,
    title,
    tone,
  };
}

function taskTerminalEntry(tasks: TerminalTaskItem[] | null): TerminalEntry {
  if (tasks === null) {
    return terminalEntry("warning", "九州传音", ["任务状态暂时无法读取，请稍后重试。"]);
  }
  if (tasks.length === 0) {
    return terminalEntry("system", "九州传音", ["当前没有可显示的任务。"]);
  }
  return {
    ...terminalEntry(
      tasks.some((task) => task.status === "completed") ? "success" : "system",
      "九州传音",
      [],
    ),
    tasks,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

function textList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
}

function routeLabel(route: string): string {
  return route === "body" ? "炼体" : "练气";
}

function summarizeBreakthrough(cultivation: CultivationStatus | null): BreakthroughSummary {
  if (!cultivation) {
    return {
      actionable: false,
      detail: "修行状态尚未载入",
      state: "unavailable",
      title: "等待感应",
    };
  }

  if (cultivation.current_realm >= cultivation.maximum_realm) {
    return {
      actionable: false,
      detail: "已至当前纪元最高境界",
      state: "maximum",
      title: "已至极境",
    };
  }

  const supportDetail =
    BigInt(cultivation.breakthrough_support) > 0n
      ? ` · 破障助力 -${cultivation.breakthrough_support}`
      : "";
  if (cultivation.can_breakthrough) {
    return {
      actionable: true,
      detail: `可破入${cultivation.next_realm_name ?? "下一境界"}${supportDetail}`,
      state: "available",
      title: "可突破",
    };
  }

  if (
    cultivation.current_stage < 3 ||
    cultivation.current_level < cultivation.current_stage_level_count
  ) {
    return {
      actionable: false,
      detail: `当前${cultivation.current_stage_name} ${cultivation.current_level}/${cultivation.current_stage_level_count} 级，圆满后可尝试突破${supportDetail}`,
      state: "locked",
      title: "尚未圆满",
    };
  }

  return {
    actionable: false,
    detail: `尚需 ${positiveDifference(
      cultivation.cultivation_value,
      cultivation.effective_breakthrough_required,
    )} 修为${supportDetail}`,
    state: "locked",
    title: "尚不可突破",
  };
}

function positiveDifference(value: string, required: string): string {
  try {
    const difference = BigInt(required) - BigInt(value);
    return difference > 0n ? difference.toString() : "0";
  } catch {
    return required;
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageFromError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "传音暂时中断，请稍后再试。";
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomId()}`;
}

function getOrCreateDeviceId(): string {
  const savedDeviceId = window.localStorage.getItem(deviceStorageKey);
  if (savedDeviceId) {
    return savedDeviceId;
  }
  const deviceId = `web_${randomId()}`;
  window.localStorage.setItem(deviceStorageKey, deviceId);
  return deviceId;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
}
