"use client";

import { GameClient } from "@nextday/game-client";
import { cultivationRouteLabels } from "@nextday/game-rules";
import type {
  ApiResponse,
  GameOverviewResponse,
  HealthStatus,
  LoginResponse,
  PlayerProfileResponse,
  TaskState,
} from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type HealthText = "检测中" | "正常" | "不可用";
type RouteValue = "qi" | "body";

const tokenStorageKey = "nextday_m1_token";
const deviceStorageKey = "nextday_m1_device_id";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export default function HomePage() {
  const [healthText, setHealthText] = useState<HealthText>("检测中");
  const [token, setToken] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginResponse | null>(null);
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [overview, setOverview] = useState<GameOverviewResponse | null>(null);
  const [playerName, setPlayerName] = useState("云游修士");
  const [route, setRoute] = useState<RouteValue>("qi");
  const [message, setMessage] = useState("尚未登录");
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => createClient(token ?? undefined), [token]);
  const activeProfile = overview?.profile ?? profile;
  const completedTasks = overview?.tasks.filter((task) => task.status === "completed") ?? [];

  useEffect(() => {
    let ignore = false;

    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("API 健康检查失败");
        }
        return response.json() as Promise<HealthStatus>;
      })
      .then((response) => {
        if (!ignore) {
          setHealthText(response.status === "ok" ? "正常" : "不可用");
        }
      })
      .catch(() => {
        if (!ignore) {
          setHealthText("不可用");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(tokenStorageKey);
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;
    loadGame(createClient(token), token)
      .then((state) => {
        if (ignore) {
          return;
        }
        setLogin(state.login);
        setProfile(state.profile);
        setOverview(state.overview);
        setMessage(state.overview ? "核心循环已读取" : "账号已登录，尚未创建角色");
      })
      .catch((error) => {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "读取账号失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  async function handleGuestLogin() {
    await runAction("游客登录", async () => {
      const response = await client.guestLogin({
        device_id: getOrCreateDeviceId(),
        nickname: "鱼排道友",
      });
      ensureOk(response);

      localStorage.setItem(tokenStorageKey, response.data.token);
      setToken(response.data.token);
      setLogin(response.data);
      setProfile(response.data.player ? null : { player: null, progress: null, wallet: null });
      setOverview(null);
      setMessage("游客登录成功");
    });
  }

  async function handleCreatePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage("请先游客登录");
      return;
    }

    await runAction("创建角色", async () => {
      const response = await client.createPlayer(
        { name: playerName, route },
        createIdempotencyKey("web_create"),
      );
      ensureOk(response);

      setProfile(response.data.profile);
      await refreshOverview("角色创建成功");
    });
  }

  async function refreshOverview(successMessage = "已刷新") {
    if (!token) {
      return;
    }

    const response = await createClient(token).gameOverview();
    ensureOk(response);
    setOverview(response.data);
    setProfile(response.data.profile);
    setMessage(successMessage);
  }

  async function handleClaimCultivation() {
    await runAction("领取修为", async () => {
      const response = await client.claimCultivation(createIdempotencyKey("web_cultivation"));
      ensureOk(response);
      await refreshOverview(`领取 ${response.data.gained_cultivation} 修为`);
    });
  }

  async function handleBreakthrough() {
    await runAction("突破", async () => {
      const response = await client.breakthrough(createIdempotencyKey("web_breakthrough"));
      ensureOk(response);
      await refreshOverview(response.data.message);
    });
  }

  async function handleExplore(count: number) {
    await runAction("探索", async () => {
      const response = await client.explore(
        { province_id: "ji", count },
        createIdempotencyKey(`web_explore_${count}`),
      );
      ensureOk(response);
      await refreshOverview(`完成 ${response.data.battles.length} 次冀州探索`);
    });
  }

  async function handleCollectCave() {
    await runAction("洞府收取", async () => {
      const response = await client.collectCave(createIdempotencyKey("web_cave"));
      ensureOk(response);
      await refreshOverview(`洞府收取灵石 ${response.data.rewards.spirit_stone ?? "0"}`);
    });
  }

  async function handleClaimTask(task: TaskState) {
    await runAction("领取任务", async () => {
      const response = await client.claimTask(
        { task_id: task.task_id },
        createIdempotencyKey(`web_task_${task.task_id}`),
      );
      ensureOk(response);
      await refreshOverview(`领取任务：${response.data.task.title}`);
    });
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(true);
    setMessage(`${label}中`);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">M2 核心循环</p>
          <h1>择日飞升</h1>
        </div>
        <div className="status-row">
          <StatusBadge
            tone={
              healthText === "正常" ? "success" : healthText === "检测中" ? "neutral" : "warning"
            }
          >
            API {healthText}
          </StatusBadge>
          <span className="message">{message}</span>
        </div>
      </section>

      <section className="toolbar" aria-label="快捷操作">
        <Button disabled={busy} onClick={handleGuestLogin}>
          游客登录
        </Button>
        <Button disabled={busy || !activeProfile?.player} onClick={() => refreshOverview()}>
          刷新状态
        </Button>
        <Button disabled={busy || !overview} onClick={handleClaimCultivation}>
          领取修为
        </Button>
        <Button
          disabled={busy || !overview?.cultivation?.can_breakthrough}
          onClick={handleBreakthrough}
        >
          突破
        </Button>
        <Button disabled={busy || !overview} onClick={() => handleExplore(1)}>
          探索 1 次
        </Button>
        <Button disabled={busy || !overview} onClick={() => handleExplore(3)}>
          探索 3 次
        </Button>
        <Button disabled={busy || !overview} onClick={() => handleExplore(5)}>
          批量 5 次
        </Button>
        <Button disabled={busy || !overview} onClick={handleCollectCave}>
          洞府收取
        </Button>
      </section>

      {!activeProfile?.player ? (
        <section className="panel" aria-label="创建角色">
          <div className="section-title">
            <h2>创建角色</h2>
            <span>选择第一条修行路线后即可进入冀州</span>
          </div>
          <form className="create-form" onSubmit={handleCreatePlayer}>
            <input
              aria-label="角色名"
              maxLength={16}
              minLength={2}
              onChange={(event) => setPlayerName(event.target.value)}
              value={playerName}
            />
            <select
              aria-label="修行路线"
              onChange={(event) => setRoute(event.target.value as RouteValue)}
              value={route}
            >
              <option value="qi">练气</option>
              <option value="body">炼体</option>
            </select>
            <Button disabled={busy || !token} type="submit">
              创建角色
            </Button>
          </form>
        </section>
      ) : (
        <>
          <section className="overview-grid" aria-label="修行总览">
            <MetricCard
              label="角色"
              value={activeProfile.player.name}
              detail={cultivationRouteLabels[activeProfile.player.route]}
            />
            <MetricCard
              label="境界"
              value={`${activeProfile.player.current_realm} 境 ${activeProfile.player.current_level} 层`}
              detail={`章节 ${activeProfile.progress?.chapter_id ?? 1}`}
            />
            <MetricCard
              label="修为"
              value={
                overview?.cultivation?.cultivation_value ??
                activeProfile.progress?.cultivation_value ??
                "0"
              }
              detail={`可领 ${overview?.cultivation?.claimable_cultivation ?? "0"}`}
            />
            <MetricCard
              label="行动令"
              value={`${overview?.action_state?.action_points ?? 0}/${overview?.action_state?.action_point_cap ?? 0}`}
              detail={`每小时 +${overview?.action_state?.action_point_restore_per_hour ?? 0}`}
            />
            <MetricCard
              label="灵石"
              value={activeProfile.wallet?.spirit_stone ?? "0"}
              detail="绑定资产"
            />
            <MetricCard
              label="洞府"
              value={`${overview?.cave?.claimable_minutes ?? 0} 分钟`}
              detail={`预估灵石 ${overview?.cave?.preview_rewards.spirit_stone ?? "0"}`}
            />
          </section>

          <section className="main-grid">
            <section className="panel" aria-label="九州地图">
              <div className="section-title">
                <h2>九州地图</h2>
                <span>首版开放四州</span>
              </div>
              <div className="province-grid">
                {overview?.provinces.map((province) => (
                  <article
                    className={province.unlocked ? "province" : "province locked"}
                    key={province.province_id}
                  >
                    <div className="province-head">
                      <strong>{province.name}</strong>
                      <StatusBadge tone={province.unlocked ? "success" : "neutral"}>
                        {province.unlocked ? "已开放" : `章节 ${province.chapter_required}`}
                      </StatusBadge>
                    </div>
                    <span>{province.tower_name}</span>
                    <span>{province.recommended_action}</span>
                    <div className="mini-stats">
                      <span>探索 {province.exploration_count}</span>
                      <span>魔染 {province.corruption}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel" aria-label="今日任务">
              <div className="section-title">
                <h2>任务</h2>
                <span>{completedTasks.length} 个可领取</span>
              </div>
              <div className="task-list">
                {overview?.tasks.slice(0, 7).map((task) => (
                  <article className="task-row" key={task.task_state_id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>
                        {task.progress_value}/{task.target_value} · {taskTypeLabel(task.task_type)}
                      </span>
                    </div>
                    {task.status === "completed" ? (
                      <Button disabled={busy} onClick={() => handleClaimTask(task)}>
                        领取
                      </Button>
                    ) : (
                      <StatusBadge tone={task.status === "claimed" ? "success" : "neutral"}>
                        {task.status === "claimed" ? "已领" : "进行中"}
                      </StatusBadge>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section className="panel" aria-label="最近战报">
            <div className="section-title">
              <h2>最近战报</h2>
              <span>普通探索自动结算</span>
            </div>
            <div className="battle-list">
              {overview?.recent_battles.length ? (
                overview.recent_battles.map((battle) => (
                  <article className="battle-row" key={battle.battle_id}>
                    <strong>
                      {battle.enemy_name} · {battle.result === "win" ? "胜" : "败"}
                    </strong>
                    <span>
                      {battle.rounds} 回合 · 造成 {battle.damage_done} · 承受 {battle.damage_taken}
                    </span>
                    <span>奖励灵石 {battle.rewards.spirit_stone ?? "0"}</span>
                  </article>
                ))
              ) : (
                <p className="empty">尚无战报，先探索冀州试试。</p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function createClient(authToken?: string): GameClient {
  return new GameClient({
    baseUrl: apiBaseUrl,
    token: authToken,
    clientVersion: "nextday-web-m2",
  });
}

async function loadGame(client: GameClient, token: string) {
  const meResponse = await client.me();
  ensureOk(meResponse);

  const login: LoginResponse = {
    token,
    expires_in: "已保存",
    account: meResponse.data.account,
    player: meResponse.data.player,
  };

  if (!meResponse.data.player) {
    const profileResponse = await client.playerProfile();
    ensureOk(profileResponse);
    return { login, profile: profileResponse.data, overview: null };
  }

  const overviewResponse = await client.gameOverview();
  ensureOk(overviewResponse);
  return { login, profile: overviewResponse.data.profile, overview: overviewResponse.data };
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function taskTypeLabel(taskType: TaskState["task_type"]): string {
  const labels: Record<TaskState["task_type"], string> = {
    novice: "新手",
    daily: "日常",
    weekly: "周常",
    chapter: "章节",
  };
  return labels[taskType];
}

function ensureOk<TData>(response: ApiResponse<TData>) {
  if (response.code !== 0) {
    throw new Error(response.message);
  }
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomId()}`;
}

function getOrCreateDeviceId(): string {
  const savedDeviceId = localStorage.getItem(deviceStorageKey);
  if (savedDeviceId) {
    return savedDeviceId;
  }

  const deviceId = `web_${randomId()}`;
  localStorage.setItem(deviceStorageKey, deviceId);
  return deviceId;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
}
