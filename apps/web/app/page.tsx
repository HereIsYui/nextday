"use client";

import { GameClient } from "@nextday/game-client";
import type {
  ApiResponse,
  BagItemState,
  BagSummaryResponse,
  CultivationStatus,
  ExploreResponse,
  FactionRoutesResponse,
  GameOverviewResponse,
  HealthStatus,
  LoginResponse,
  PlayerProfileResponse,
  ProvinceSummary,
  RealmProgressionResponse,
  StoryScrollDetailState,
  StoryScrollListResponse,
} from "@nextday/shared";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { exploreActionCard } from "./explore-action-card";
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
  createExploreCompletionNotice,
  createExploreEventAutoResolveNotice,
  createExploreEventNotice,
  getExplorePollDelay,
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
type OverlayView = "help" | "bag" | "scrolls" | "battles" | "faction" | "realms";

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
  { label: "背包", command: "背包" },
  { label: "修炼", command: "修炼" },
  { label: "突破", command: "突破" },
  { label: "探索", command: "探索" },
  { label: "领取洞府", command: "领取洞府" },
  { label: "任务", command: "任务" },
  { label: "九塔", command: "九塔" },
];

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
      { syntax: "修炼", description: "收取本次可得的修为。", aliases: ["吐纳"] },
      { syntax: "突破", description: "在条件满足时尝试突破境界。", aliases: [] },
      {
        syntax: "探索 <州域> [次数]",
        description: "输入“探索”即可查看当前可前往的州域；省略次数时默认探索 1 次。",
        aliases: ["游历 <州域> [次数]"],
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
  const [currentExplore, setCurrentExplore] = useState<ExploreResponse | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayView | null>(null);
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
  const exploreEventActionsRef = useRef<HTMLElement | null>(null);
  const loadVersionRef = useRef(0);
  const notificationSessionKeyRef = useRef<string | null>(null);
  const notifiedExploreRecordIdsRef = useRef(new Set<string>());
  const notifiedExploreEventIdsRef = useRef(new Set<string>());
  const manuallyResolvedExploreEventIdsRef = useRef(new Set<string>());
  const pendingExploreEventsRef = useRef<PendingExploreEvent[]>([]);
  const resolvingExploreEventIdsRef = useRef(new Set<string>());
  const [clockNow, setClockNow] = useState(() => Date.now());

  const activeProfile = overview?.profile ?? profile;
  const player = activeProfile?.player ?? login?.player ?? null;
  const progress = activeProfile?.progress ?? null;
  const cultivation = overview?.cultivation ?? null;
  const wallet = activeProfile?.wallet ?? null;
  const recentBattles = overview?.recent_battles ?? [];
  const storyScrolls = scrolls?.scrolls ?? [];
  const readableStoryScrolls = useMemo(
    () => storyScrolls.filter((scroll) => scroll.unlock_state !== "locked"),
    [storyScrolls],
  );
  const currentExploreActionCard = useMemo(
    () =>
      exploreActionCard({
        currentExplore,
        now: clockNow,
        pendingEvent: pendingExploreEvents[0]
          ? {
              choiceCount: pendingExploreEvents[0].choices.length,
              title: pendingExploreEvents[0].title,
            }
          : null,
      }),
    [clockNow, currentExplore, pendingExploreEvents],
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
  const canClaimExplore = currentExplore?.status === "completed" && currentExplore.can_claim;
  const bagDisplayItems = useMemo(() => summarizeBagItemsForDisplay(bag?.items ?? []), [bag]);
  const commandHint = useMemo(
    () => buildCommandHint(command, overview?.provinces ?? [], helpGroups),
    [command, helpGroups, overview?.provinces],
  );
  const quickCommands = useMemo(() => {
    const actions = [
      ...(canClaimExplore ? [{ label: "领取探索", command: "领取探索" }] : []),
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
  }, [canClaimExplore, commandSuggestions]);

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
      notifiedExploreRecordIdsRef.current.clear();
      notifiedExploreEventIdsRef.current.clear();
      manuallyResolvedExploreEventIdsRef.current.clear();
      pendingExploreEventsRef.current = [];
      resolvingExploreEventIdsRef.current.clear();
      setPendingExploreEvents([]);
      setResolvingExploreEventId(null);
      setCurrentExplore(null);
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
        const [currentResult, eventsResult] = await Promise.allSettled([
          client.currentExplore(),
          client.exploreEvents("pending"),
        ]);
        if (disposed) {
          return;
        }

        if (currentResult.status === "fulfilled") {
          try {
            const current = readResponse(currentResult.value).current;
            setCurrentExplore(current);
            taskPollDelay = getExplorePollDelay(
              current,
              pendingExploreEventsRef.current.length > 0,
            );
            const notice = current ? createExploreCompletionNotice(current) : null;
            if (current && notice && !notifiedExploreRecordIdsRef.current.has(current.record_id)) {
              notifiedExploreRecordIdsRef.current.add(current.record_id);
              notifications.push(notice);
              nextMessage = "探索已结束，待领取";
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
    if (currentExplore?.status !== "pending") {
      return;
    }

    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [currentExplore?.status]);

  useEffect(() => {
    if (terminalEntries.length > 0) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [terminalEntries]);

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
    let shouldRestoreCommandFocus = false;

    try {
      const client = createCommandClient(token);
      const response = await client.executeCommand(
        { command: nextCommand },
        createIdempotencyKey("web_command"),
      );
      const data = readResponse(response);
      const pendingEvents =
        data.command_id === "explore_claim" || data.command_id === "explore_events"
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
      if (data.command_id === "explore_claim" || data.command_id === "explore_events") {
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
      if (data.command_id === "explore_claim") {
        setCurrentExplore(null);
        shouldRestoreCommandFocus = true;
      }

      await Promise.all([
        refreshDashboard(token, true).catch(() => undefined),
        data.command_id === "bag" || data.command_id === "pill_use"
          ? refreshBag(token)
          : Promise.resolve(),
      ]);
      setMessage("指令已结算");
    } catch (error) {
      const detail = messageFromError(error);
      appendTerminalEntries([
        terminalEntry("error", "指令未执行", [detail, "可输入“帮助”查看规范语法。"]),
      ]);
      setMessage("指令执行失败");
    } finally {
      setBusy(false);
      if (shouldRestoreCommandFocus) {
        window.requestAnimationFrame(() => commandInputRef.current?.focus());
      }
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

  function focusExploreEventActions() {
    const eventActions = exploreEventActionsRef.current;
    if (!eventActions) {
      return;
    }
    eventActions.scrollIntoView({ behavior: "smooth", block: "nearest" });
    eventActions.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
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
    setCurrentExplore(null);
    setActiveOverlay(null);
    notificationSessionKeyRef.current = null;
    notifiedExploreRecordIdsRef.current.clear();
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
                  <h2>道途简报</h2>
                </div>
                <button
                  aria-haspopup="dialog"
                  className="realm-overview-button"
                  onClick={() => {
                    setActiveOverlay("realms");
                    void refreshRealmProgression();
                  }}
                  type="button"
                >
                  境界一览
                </button>
              </div>
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
              {currentExploreActionCard ? (
                <section className="cultivation-journey" aria-label="当前行旅">
                  <article
                    className={`explore-action-card explore-action-card-${currentExploreActionCard.action}`}
                  >
                    <div className="action-card-heading">
                      <p className="console-eyebrow">当前行旅</p>
                      <span>
                        {currentExploreActionCard.action === "waiting" ? "途中" : "待处理"}
                      </span>
                    </div>
                    <strong>{currentExploreActionCard.title}</strong>
                    <p>{currentExploreActionCard.detail}</p>
                    {currentExploreActionCard.action === "claim" ? (
                      <button
                        className="action-card-button"
                        disabled={busy || hydrating}
                        onClick={() => {
                          void executeCommand("领取探索", {
                            displayCommand: "领取探索",
                            saveToHistory: false,
                          });
                        }}
                        type="button"
                      >
                        领取探索
                      </button>
                    ) : null}
                    {currentExploreActionCard.action === "event" ? (
                      <button
                        className="action-card-button"
                        disabled={busy || hydrating}
                        onClick={focusExploreEventActions}
                        type="button"
                      >
                        前往选择
                      </button>
                    ) : null}
                  </article>
                </section>
              ) : null}
              <section className="core-play-actions" aria-label="玩法入口">
                <p className="console-eyebrow">九州玩法</p>
                <div className="core-play-action-grid">
                  {[
                    ["活动", "活动"],
                    ["内天地", "内天地"],
                    ["宗门", "宗门"],
                    ["Boss", "Boss"],
                    ["排行", "排行"],
                    ["古宝", "古宝"],
                    ["炼丹", "炼丹"],
                    ["炼器", "炼器"],
                    ["九塔", "九塔"],
                  ].map(([label, action]) => (
                    <button
                      className="core-play-action"
                      disabled={busy || hydrating}
                      key={action}
                      onClick={() => void executeCommand(action, { displayCommand: label, saveToHistory: false })}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
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
                    刷新状态
                  </button>
                  <div className="utility-button-list" aria-label="辅助面板">
                    <button
                      aria-haspopup="dialog"
                      className="utility-button"
                      onClick={() => setActiveOverlay("help")}
                      type="button"
                    >
                      帮助
                    </button>
                    <button
                      aria-haspopup="dialog"
                      className="utility-button"
                      disabled={bagLoading || busy || hydrating}
                      onClick={() => {
                        setActiveOverlay("bag");
                        if (token) {
                          void refreshBag(token);
                        }
                      }}
                      type="button"
                    >
                      背包
                    </button>
                    <button
                      aria-haspopup="dialog"
                      className="utility-button"
                      onClick={() => setActiveOverlay("scrolls")}
                      type="button"
                    >
                      卷轴
                    </button>
                    <button
                      aria-haspopup="dialog"
                      className="utility-button"
                      onClick={() => setActiveOverlay("faction")}
                      type="button"
                    >
                      仙魔
                    </button>
                    <button
                      aria-haspopup="dialog"
                      className="utility-button"
                      onClick={() => setActiveOverlay("battles")}
                      type="button"
                    >
                      战报
                    </button>
                  </div>
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
              <div className="quick-command-list" aria-label="快捷指令">
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
            </section>
          </section>

          {activeOverlay ? (
            <UtilityOverlay
              onClose={() => {
                setActiveOverlay(null);
                setSelectedScroll(null);
                setScrollDetailError(null);
              }}
              title={
                activeOverlay === "help"
                  ? "可用语法"
                  : activeOverlay === "bag"
                    ? "纳物囊"
                    : activeOverlay === "scrolls"
                      ? selectedScroll
                        ? "故事回放"
                        : "已见故事"
                      : activeOverlay === "realms"
                        ? "境界一览"
                        : activeOverlay === "faction"
                          ? "仙魔抉择"
                          : "斗法余音"
              }
              eyebrow={
                activeOverlay === "help"
                  ? "指令帮助"
                  : activeOverlay === "bag"
                    ? "随身背包"
                    : activeOverlay === "scrolls"
                      ? "章节卷轴"
                      : activeOverlay === "realms"
                        ? "修行境界"
                        : activeOverlay === "faction"
                          ? "道途分流"
                          : "最近战报"
              }
            >
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

              {activeOverlay === "bag" ? (
                <>
                  <div className="utility-dialog-actions">
                    <button
                      className="quiet-button"
                      disabled={bagLoading || busy || hydrating || !token}
                      onClick={() => {
                        if (token) {
                          void refreshBag(token);
                        }
                      }}
                      type="button"
                    >
                      {bagLoading ? "读取中…" : "刷新背包"}
                    </button>
                  </div>
                  {bagError ? <p className="panel-warning">背包暂时无法读取：{bagError}</p> : null}
                  {bagLoading && !bag ? <p className="empty-copy">正在整理纳物囊…</p> : null}
                  {!bagLoading && !bagError && bag && bagDisplayItems.length === 0 ? (
                    <p className="empty-copy">背包暂为空。探索、洞府收取和炼制都可能带来物品。</p>
                  ) : null}
                  {bagDisplayItems.length > 0 ? (
                    <ul className="bag-list">
                      {bagDisplayItems.map((item) => (
                        <li key={item.item_instance_id}>
                          <div>
                            <strong>
                              {item.name} ×{item.count}
                              {item.quality ? `（${pillQualityLabel(item.quality)}）` : ""}
                            </strong>
                            <span>{item.usage_hint}</span>
                            <small>
                              {item.expired
                                ? "已过期"
                                : item.locked
                                  ? "已锁定"
                                  : item.bind_type === "unbound"
                                    ? "未绑定"
                                    : "绑定"}
                            </small>
                          </div>
                          {item.category === "pill" && !item.expired && !item.locked ? (
                            <button
                              className="quiet-button"
                              disabled={busy || hydrating}
                              onClick={() => {
                                setActiveOverlay(null);
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
                </>
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
                                  setActiveOverlay(null);
                                  setSelectedScroll(null);
                                  void executeCommand(`战报 ${battle.battle_id}`, {
                                    displayCommand: `回看战报：${battle.title}`,
                                    saveToHistory: false,
                                  });
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
                      </div>
                    )}
                  </section>
                ) : (
                  <p className="empty-copy">正在读取仙魔路线…</p>
                )
              ) : null}

              {activeOverlay === "battles" ? (
                recentBattles.length > 0 ? (
                  <ul className="battle-list">
                    {recentBattles.map((battle) => (
                      <li key={battle.battle_id}>
                        <strong>
                          {battle.result === "win" ? "胜" : "败"} · {battle.enemy_name}
                        </strong>
                        <span>{battle.reason_summary?.[0] ?? `${battle.rounds} 回合交锋`}</span>
                        <small>{formatDateTime(battle.created_at)}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">尚无战报。一次探索或九塔挑战，可能会留下新的记录。</p>
                )
              ) : null}
            </UtilityOverlay>
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

function ErrorNotice({ message }: { message: string }) {
  return (
    <p className="error-notice" role="alert">
      {message}
    </p>
  );
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
      text: `可选州域：${unlockedProvinces.map((province) => province.name).join("、")}；省略次数默认 1 次，最多 5 次。`,
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
