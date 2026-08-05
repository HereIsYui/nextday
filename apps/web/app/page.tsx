"use client";

import { GameClient } from "@nextday/game-client";
import type {
  ApiResponse,
  GameOverviewResponse,
  HealthStatus,
  LoginResponse,
  PlayerProfileResponse,
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
  createExploreEventNotice,
  getExplorePollDelay,
} from "./explore-notifications";
import {
  type TerminalMessageBatch,
  type TerminalTone,
  mergeCommandEntries,
} from "./terminal-message-batch";

type HealthText = "检测中" | "正常" | "不可用";
type RouteValue = "qi" | "body";
type OverlayView = "help" | "scrolls" | "battles";

interface CommandHelpItem {
  aliases: string[];
  description: string;
  syntax: string;
}

interface CommandHelpGroup {
  description?: string;
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
  title?: string;
  tone: TerminalTone;
}

const tokenStorageKey = "nextday_m1_token";
const deviceStorageKey = "nextday_m1_device_id";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const quickCommands = ["状态", "修炼", "突破", "探索", "领取洞府", "任务", "九塔"];

const fallbackHelpGroups: CommandHelpGroup[] = [
  {
    title: "基础",
    items: [
      { syntax: "状态", description: "查看当前修为、背包和可进行事项。", aliases: ["面板"] },
      { syntax: "帮助 [关键词]", description: "查看全部指令或筛选相关指令。", aliases: ["help"] },
      { syntax: "卷轴", description: "查看已解锁的章节卷轴。", aliases: ["剧情"] },
      { syntax: "战报", description: "查看最近的战斗记录。", aliases: ["记录"] },
    ],
  },
  {
    title: "修行与探索",
    items: [
      { syntax: "修炼", description: "收取本次可得的修为。", aliases: ["吐纳"] },
      { syntax: "突破", description: "在条件满足时尝试突破境界。", aliases: [] },
      { syntax: "探索 [州域]", description: "前往州域寻访机缘。", aliases: ["游历"] },
      {
        syntax: "奇遇 <事件ID> <选项ID>",
        description: "按传音中的指令处理当前等待的奇遇。",
        aliases: [],
      },
      { syntax: "洞府收取", description: "收取洞府积累的产出。", aliases: ["洞府"] },
      { syntax: "任务领取", description: "领取已完成任务的报酬。", aliases: ["领任务"] },
      { syntax: "九塔 [塔名]", description: "查看或挑战九塔。", aliases: ["塔"] },
    ],
  },
  {
    title: "炼制与单方",
    items: [
      { syntax: "服丹 <丹药>", description: "服用背包中的丹药。", aliases: ["服用"] },
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
  const [helpGroups, setHelpGroups] = useState<CommandHelpGroup[]>(fallbackHelpGroups);
  const [helpError, setHelpError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [message, setMessage] = useState("尚未登录");
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [route, setRoute] = useState<RouteValue>("qi");
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pendingExploreEvents, setPendingExploreEvents] = useState<PendingExploreEvent[]>([]);
  const [resolvingExploreEventId, setResolvingExploreEventId] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayView | null>(null);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([
    {
      id: "welcome",
      title: "九州传音",
      lines: ["此处只接受明确的文字指令。输入“帮助”可查看可用语法。"],
      tone: "system",
    },
  ]);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const loadVersionRef = useRef(0);
  const notificationSessionKeyRef = useRef<string | null>(null);
  const notifiedExploreRecordIdsRef = useRef(new Set<string>());
  const notifiedExploreEventIdsRef = useRef(new Set<string>());
  const resolvingExploreEventIdsRef = useRef(new Set<string>());

  const activeProfile = overview?.profile ?? profile;
  const player = activeProfile?.player ?? login?.player ?? null;
  const progress = activeProfile?.progress ?? null;
  const cultivation = overview?.cultivation ?? null;
  const wallet = activeProfile?.wallet ?? null;
  const recentBattles = overview?.recent_battles ?? [];
  const storyScrolls = scrolls?.scrolls ?? [];
  const visibleHelpGroups = useMemo(() => {
    if (pendingExploreEvents.length === 0) {
      return helpGroups;
    }

    return helpGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.syntax.includes("<事件ID>")),
      }))
      .filter((group) => group.items.length > 0);
  }, [helpGroups, pendingExploreEvents.length]);

  const appendTerminalEntries = useCallback((entries: TerminalEntry[]) => {
    if (entries.length === 0) {
      return;
    }
    setTerminalEntries((current) => [...current, ...entries]);
  }, []);

  const refreshDashboard = useCallback(async (activeToken: string, quietly = false) => {
    const client = createClient(activeToken);
    const [overviewResult, scrollResult] = await Promise.allSettled([
      client.gameOverview(),
      client.storyScrolls(),
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
      resolvingExploreEventIdsRef.current.clear();
      setPendingExploreEvents([]);
      setResolvingExploreEventId(null);
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
            taskPollDelay = getExplorePollDelay(current);
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
            setPendingExploreEvents(pendingExploreEventsFromValues(events));
            for (const event of events) {
              const notice = createExploreEventNotice(event);
              if (!notice || notifiedExploreEventIdsRef.current.has(event.event_id)) {
                continue;
              }
              notifiedExploreEventIdsRef.current.add(event.event_id);
              notifications.push(notice);
              nextMessage = "探索奇遇待选择";
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

  const metrics = useMemo(
    () => [
      {
        label: "境界",
        value:
          cultivation?.current_realm_name ?? (player ? `第 ${player.current_realm} 境` : "未入道"),
        detail: cultivation ? `第 ${cultivation.current_level} 层` : "登记角色后开启修行",
      },
      {
        label: "修为",
        value: cultivation?.cultivation_value ?? progress?.cultivation_value ?? "—",
        detail: cultivation?.claimable_cultivation
          ? `可收取 ${cultivation.claimable_cultivation}`
          : "输入“修炼”收取修为",
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
        detail: storyScrolls.length ? `已见 ${storyScrolls.length} 卷` : "输入“卷轴”查看剧情",
      },
    ],
    [cultivation, overview?.action_state, player, progress, storyScrolls.length, wallet],
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
      const entries = normalizeCommandEntries(
        withoutExploreEventInstructions(data.entries, pendingEvents),
      );
      appendTerminalEntries(
        entries.length > 0 ? entries : [terminalEntry("success", "九州传音", ["指令已执行。"])],
      );
      applyCommandState(data.state, { setOverview, setProfile, setScrolls });
      if (data.command_id === "explore_claim" || data.command_id === "explore_events") {
        if (data.command_id === "explore_events") {
          setPendingExploreEvents(pendingEvents);
        } else if (pendingEvents.length > 0) {
          setPendingExploreEvents((current) => mergePendingExploreEvents(current, pendingEvents));
        }
        markDeliveredExploreEvents(data.state, notifiedExploreEventIdsRef.current);
      }
      if (data.command_id === "explore_event_resolve") {
        const eventId = exploreEventIdFromCommandState(data.state);
        if (eventId) {
          setPendingExploreEvents((current) =>
            current.filter((event) => event.eventId !== eventId),
          );
        }
      }

      await refreshDashboard(token, true).catch(() => undefined);
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
    setPendingExploreEvents([]);
    setResolvingExploreEventId(null);
    setActiveOverlay(null);
    notificationSessionKeyRef.current = null;
    notifiedExploreRecordIdsRef.current.clear();
    notifiedExploreEventIdsRef.current.clear();
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
          <section className="status-strip" aria-label="个人状态">
            {metrics.map((metric) => (
              <article className="status-metric" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
            <button className="logout-button" onClick={handleLogout} type="button">
              离开
            </button>
          </section>

          {sessionError ? <ErrorNotice message={sessionError} /> : null}

          <section className="console-layout" aria-label="文字修行指令台">
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
                      onClick={() => setActiveOverlay("scrolls")}
                      type="button"
                    >
                      卷轴
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
                    {entry.lines.map((line, index) => (
                      <p key={`${entry.id}_${index}`}>{line}</p>
                    ))}
                  </article>
                ))}
                <div ref={terminalEndRef} />
              </div>
              {pendingExploreEvents.length > 0 ? (
                <section
                  className="explore-event-actions"
                  aria-label="待选择探索奇遇"
                  aria-live="polite"
                >
                  <div className="explore-event-actions-heading">
                    <p className="console-eyebrow">探索奇遇</p>
                    <h3>机缘已至，请择其一</h3>
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
                                <strong>{choice.label}</strong>
                                {choice.description ? <span>{choice.description}</span> : null}
                                {choice.rewardPreview ? (
                                  <small>奖励预览：{choice.rewardPreview}</small>
                                ) : null}
                                <em>{isResolving ? "择取中…" : "选择此项"}</em>
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
                    autoComplete="off"
                    disabled={busy || hydrating}
                    onChange={(event) => {
                      setCommand(event.target.value);
                      setHistoryIndex(-1);
                    }}
                    onKeyDown={handleCommandKeyDown}
                    placeholder="输入指令，例如：探索 冀州"
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
              <div className="quick-command-list" aria-label="快捷指令">
                {quickCommands.map((item) => (
                  <button
                    disabled={busy || hydrating}
                    key={item}
                    onClick={() => void executeCommand(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          </section>

          {activeOverlay ? (
            <UtilityOverlay
              onClose={() => setActiveOverlay(null)}
              title={
                activeOverlay === "help"
                  ? "可用语法"
                  : activeOverlay === "scrolls"
                    ? "已见故事"
                    : "斗法余音"
              }
              eyebrow={
                activeOverlay === "help"
                  ? "指令帮助"
                  : activeOverlay === "scrolls"
                    ? "章节卷轴"
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
                      <details key={group.title} open={group.title === visibleHelpGroups[0]?.title}>
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

              {activeOverlay === "scrolls" ? (
                storyScrolls.length > 0 ? (
                  <ul className="scroll-list">
                    {storyScrolls.map((scroll) => (
                      <li key={scroll.scroll_id}>
                        <strong>{scroll.title}</strong>
                        <span>{scroll.latest_fragment || scroll.subtitle}</span>
                        <small>
                          第 {scroll.chapter_id} 章 · {scroll.progress_percent}%
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">卷轴会随着探索和九塔推进逐步显现。</p>
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
