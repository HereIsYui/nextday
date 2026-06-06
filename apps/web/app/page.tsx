"use client";

import { GameClient } from "@nextday/game-client";
import { cultivationRouteLabels } from "@nextday/game-rules";
import type {
  AlchemyRecipeListResponse,
  AncientTreasureListResponse,
  ApiResponse,
  AppearanceListResponse,
  BagSummaryResponse,
  EntitlementOverviewResponse,
  EquipmentListResponse,
  ForgeRecipeListResponse,
  GachaPoolListResponse,
  GameOverviewResponse,
  HealthStatus,
  LoginResponse,
  PlayerProfileResponse,
  RankListResponse,
  ResourcePointListResponse,
  SectDetailResponse,
  SkillLoadoutResponse,
  TaskState,
  TowerListResponse,
  WorldBossResponse,
} from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

type HealthText = "检测中" | "正常" | "不可用";
type RouteValue = "qi" | "body";
type ActiveTab = "overview" | "growth" | "multiplayer" | "market" | "battle";

const tokenStorageKey = "nextday_m1_token";
const deviceStorageKey = "nextday_m1_device_id";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const navItems: Array<{ key: ActiveTab; label: string }> = [
  { key: "overview", label: "总览" },
  { key: "growth", label: "成长" },
  { key: "multiplayer", label: "多人" },
  { key: "market", label: "市肆" },
  { key: "battle", label: "战报" },
];

export default function HomePage() {
  const [healthText, setHealthText] = useState<HealthText>("检测中");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [token, setToken] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginResponse | null>(null);
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [overview, setOverview] = useState<GameOverviewResponse | null>(null);
  const [bag, setBag] = useState<BagSummaryResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentListResponse | null>(null);
  const [alchemyRecipes, setAlchemyRecipes] = useState<AlchemyRecipeListResponse | null>(null);
  const [forgeRecipes, setForgeRecipes] = useState<ForgeRecipeListResponse | null>(null);
  const [skills, setSkills] = useState<SkillLoadoutResponse | null>(null);
  const [towers, setTowers] = useState<TowerListResponse | null>(null);
  const [boss, setBoss] = useState<WorldBossResponse | null>(null);
  const [sect, setSect] = useState<SectDetailResponse | null>(null);
  const [resourcePoints, setResourcePoints] = useState<ResourcePointListResponse | null>(null);
  const [personalRank, setPersonalRank] = useState<RankListResponse | null>(null);
  const [commerce, setCommerce] = useState<EntitlementOverviewResponse | null>(null);
  const [gachaPools, setGachaPools] = useState<GachaPoolListResponse | null>(null);
  const [ancientTreasures, setAncientTreasures] = useState<AncientTreasureListResponse | null>(
    null,
  );
  const [appearances, setAppearances] = useState<AppearanceListResponse | null>(null);
  const [playerName, setPlayerName] = useState("云游修士");
  const [route, setRoute] = useState<RouteValue>("qi");
  const [message, setMessage] = useState("尚未登录");
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => createClient(token ?? undefined), [token]);
  const activeProfile = overview?.profile ?? profile;
  const activePlayerId = overview?.profile.player?.player_id ?? null;
  const completedTasks = overview?.tasks.filter((task) => task.status === "completed") ?? [];
  const firstPill = bag?.items.find((item) => item.category === "pill" && !item.locked);
  const firstEquipment = equipment?.equipments[0];
  const firstTower = towers?.towers[0];
  const firstResourcePoint = resourcePoints?.resource_points[0];
  const pvpTarget = personalRank?.entries.find((entry) => entry.target_id !== activePlayerId);
  const firstAncientGrant = commerce?.available_monthly_grants[0];
  const ownedTreasureCount =
    ancientTreasures?.treasures.filter((treasure) => treasure.owned).length ?? 0;
  const firstAppearance = appearances?.appearances[0];

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

    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isActiveTab(tab)) {
      setActiveTab(tab);
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

  useEffect(() => {
    if (!token || !activePlayerId) {
      return;
    }

    let ignore = false;
    loadProduction(createClient(token))
      .then((state) => {
        if (ignore) {
          return;
        }
        setBag(state.bag);
        setEquipment(state.equipment);
        setAlchemyRecipes(state.alchemyRecipes);
        setForgeRecipes(state.forgeRecipes);
        setSkills(state.skills);
      })
      .catch(() => {
        if (!ignore) {
          setMessage("生产成长状态读取失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, activePlayerId]);

  useEffect(() => {
    if (!token || !activePlayerId) {
      return;
    }

    let ignore = false;
    loadCommerce(createClient(token))
      .then((state) => {
        if (ignore) {
          return;
        }
        setCommerce(state.commerce);
        setGachaPools(state.gachaPools);
        setAncientTreasures(state.ancientTreasures);
        setAppearances(state.appearances);
      })
      .catch(() => {
        if (!ignore) {
          setMessage("商业化状态读取失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, activePlayerId]);

  useEffect(() => {
    if (!token || !activePlayerId) {
      return;
    }

    let ignore = false;
    loadMultiplayer(createClient(token))
      .then((state) => {
        if (ignore) {
          return;
        }
        setTowers(state.towers);
        setBoss(state.boss);
        setSect(state.sect);
        setResourcePoints(state.resourcePoints);
        setPersonalRank(state.personalRank);
      })
      .catch(() => {
        if (!ignore) {
          setMessage("多人玩法状态读取失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, activePlayerId]);

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
    await refreshProduction();
    await refreshMultiplayer();
    await refreshCommerce();
    setMessage(successMessage);
  }

  async function refreshProduction() {
    if (!token) {
      return;
    }

    const state = await loadProduction(createClient(token));
    setBag(state.bag);
    setEquipment(state.equipment);
    setAlchemyRecipes(state.alchemyRecipes);
    setForgeRecipes(state.forgeRecipes);
    setSkills(state.skills);
  }

  async function refreshMultiplayer() {
    if (!token) {
      return;
    }

    const state = await loadMultiplayer(createClient(token));
    setTowers(state.towers);
    setBoss(state.boss);
    setSect(state.sect);
    setResourcePoints(state.resourcePoints);
    setPersonalRank(state.personalRank);
  }

  async function refreshCommerce() {
    if (!token) {
      return;
    }

    const state = await loadCommerce(createClient(token));
    setCommerce(state.commerce);
    setGachaPools(state.gachaPools);
    setAncientTreasures(state.ancientTreasures);
    setAppearances(state.appearances);
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

  async function handleQuickClaim() {
    await runAction("一键领取", async () => {
      const response = await client.pluginQuickClaim(
        { include_tasks: true },
        createIdempotencyKey("web_quick_claim"),
      );
      ensureOk(response);
      const claimedCount = response.data.items.filter((item) => item.status === "claimed").length;
      await refreshOverview(`一键领取完成 ${claimedCount} 项`);
    });
  }

  async function handleCraftAlchemy() {
    const recipe = alchemyRecipes?.recipes[0];
    if (!recipe) {
      setMessage("暂无可用丹方");
      return;
    }

    await runAction("炼丹", async () => {
      const response = await client.alchemyCraft(
        { recipe_id: recipe.recipe_id },
        createIdempotencyKey("web_alchemy"),
      );
      ensureOk(response);
      await refreshOverview(`炼丹${response.data.record.success ? "成功" : "失败返还"}`);
    });
  }

  async function handleUsePill() {
    if (!firstPill) {
      setMessage("背包中暂无可服用丹药");
      return;
    }

    await runAction("服丹", async () => {
      const response = await client.pillUse(
        { item_instance_id: firstPill.item_instance_id },
        createIdempotencyKey("web_pill"),
      );
      ensureOk(response);
      await refreshOverview(`服丹获得 ${response.data.effect_value} 修为`);
    });
  }

  async function handleCraftForge() {
    const recipe = forgeRecipes?.recipes[0];
    if (!recipe) {
      setMessage("暂无可用炼器配方");
      return;
    }

    await runAction("炼器", async () => {
      const response = await client.forgeCraft(
        { recipe_id: recipe.recipe_id },
        createIdempotencyKey("web_forge"),
      );
      ensureOk(response);
      await refreshOverview(`炼成 ${response.data.equipment?.name ?? "法宝"}`);
    });
  }

  async function handleRefineEquipment() {
    if (!firstEquipment) {
      setMessage("暂无可淬炼法宝");
      return;
    }

    await runAction("淬炼", async () => {
      const response = await client.equipmentRefine(
        { equipment_instance_id: firstEquipment.equipment_instance_id },
        createIdempotencyKey("web_refine"),
      );
      ensureOk(response);
      await refreshOverview(`淬炼 ${response.data.equipment?.name ?? "法宝"}`);
    });
  }

  async function handleSaveSkillPreset() {
    if (!skills) {
      setMessage("技能配置尚未读取");
      return;
    }

    const activeSkills = skills.available_skills
      .filter((skill) => skill.skill_type === "active")
      .slice(0, 3)
      .map((skill) => skill.skill_id);
    const treasureSkill =
      skills.available_skills.find((skill) => skill.skill_type === "treasure")?.skill_id ??
      skills.treasure_skill_id;

    await runAction("保存技能", async () => {
      const response = await client.saveSkillLoadout(
        {
          active_skill_ids: activeSkills,
          treasure_skill_id: treasureSkill,
          auto_priority: [treasureSkill, ...activeSkills.slice().reverse()],
        },
        createIdempotencyKey("web_skill"),
      );
      ensureOk(response);
      setSkills(response.data);
      setMessage("技能预设已保存，下一次探索会写入战报");
    });
  }

  async function handleTowerAction() {
    if (!firstTower) {
      setMessage("九塔状态尚未读取");
      return;
    }

    await runAction("九塔提交", async () => {
      const response = await client.towerAction(
        { tower_id: firstTower.tower_id, action_type: "seal", count: 1 },
        createIdempotencyKey("web_tower"),
      );
      ensureOk(response);
      await refreshOverview(`九塔贡献 +${response.data.contribution}`);
    });
  }

  async function handleChallengeBoss() {
    if (!boss) {
      setMessage("公共 Boss 尚未读取");
      return;
    }

    await runAction("挑战 Boss", async () => {
      const response = await client.challengeBoss(
        { boss_id: boss.boss.boss_id },
        createIdempotencyKey("web_boss"),
      );
      ensureOk(response);
      await refreshOverview(`Boss 伤害 ${response.data.damage_done}`);
    });
  }

  async function handleCreateSect() {
    if (sect?.sect) {
      setMessage("已经加入宗门");
      return;
    }

    await runAction("创建宗门", async () => {
      const response = await client.createSect(
        { name: `青岚${randomId().slice(0, 4)}`, alignment: "neutral" },
        createIdempotencyKey("web_sect_create"),
      );
      ensureOk(response);
      await refreshOverview(`创建宗门：${response.data.sect.name}`);
    });
  }

  async function handleSectTask() {
    if (!sect?.sect) {
      setMessage("请先创建或加入宗门");
      return;
    }

    await runAction("宗门任务", async () => {
      const response = await client.completeSectTask(
        { task_id: "sect_patrol" },
        createIdempotencyKey("web_sect_task"),
      );
      ensureOk(response);
      await refreshOverview(`宗门贡献 +${response.data.contribution}`);
    });
  }

  async function handlePvpAttack() {
    if (!pvpTarget) {
      setMessage("暂无可用 PVP 目标，可先让其他玩家产生排行记录");
      return;
    }

    await runAction("资源点 PVP", async () => {
      const response = await client.pvpAttack(
        {
          defender_player_id: pvpTarget.target_id,
          resource_point_id: firstResourcePoint?.resource_point_id,
        },
        createIdempotencyKey("web_pvp"),
      );
      ensureOk(response);
      await refreshOverview(
        `PVP ${response.data.result === "win" ? "胜" : "负"} +${response.data.score_delta}`,
      );
    });
  }

  async function handlePurchaseMonthly(cardType: "small_monthly" | "large_monthly") {
    await runAction(cardType === "small_monthly" ? "购买小月卡" : "购买大月卡", async () => {
      const response = await client.purchaseMonthlyCard(
        { card_type: cardType },
        createIdempotencyKey(`web_monthly_${cardType}`),
      );
      ensureOk(response);
      await refreshOverview(`${response.data.monthly_card.card_type} 已生效`);
    });
  }

  async function handleClaimMonthly(cardType: "small_monthly" | "large_monthly") {
    await runAction("领取月卡日权益", async () => {
      const response = await client.claimMonthlyDaily(
        { card_type: cardType },
        createIdempotencyKey(`web_monthly_claim_${cardType}`),
      );
      ensureOk(response);
      await refreshOverview(
        response.data.claimed
          ? `领取仙玉 ${response.data.rewards.jade_paid ?? "0"} / 绑定仙玉 ${response.data.rewards.jade_bound ?? "0"}`
          : "今日月卡权益已领取",
      );
    });
  }

  async function handleDrawAncientTreasure() {
    if (!firstAncientGrant) {
      setMessage("暂无可用九大古宝赠抽，请先领取月卡日权益");
      return;
    }

    await runAction("九大古宝抽取", async () => {
      const response = await client.gachaDraw(
        {
          pool_type: "ancient_treasure",
          cost_type: "monthly_grant",
          grant_id: firstAncientGrant.grant_id,
        },
        createIdempotencyKey("web_ancient_gacha"),
      );
      ensureOk(response);
      await refreshOverview(`获得 ${response.data.result.result_name}`);
    });
  }

  async function handleDrawPermanent() {
    await runAction("常驻机缘抽取", async () => {
      const response = await client.gachaDraw(
        { pool_type: "permanent", cost_type: "bound_jade" },
        createIdempotencyKey("web_permanent_gacha"),
      );
      ensureOk(response);
      await refreshOverview(`抽得 ${response.data.result.result_name}`);
    });
  }

  async function handleSyncVip(vipLevel: 3 | 4) {
    await runAction(`同步 VIP${vipLevel}`, async () => {
      const response = await client.syncVip(
        { vip_level: vipLevel, active_days: 30 },
        createIdempotencyKey(`web_vip${vipLevel}`),
      );
      ensureOk(response);
      await refreshOverview(`VIP${vipLevel} 便利已同步`);
    });
  }

  async function handleBatchPreview() {
    await runAction("便利预览", async () => {
      const response = await client.convenienceBatchPreview(
        { requested_count: 20 },
        createIdempotencyKey("web_batch_preview"),
      );
      ensureOk(response);
      setMessage(
        `${response.data.effective_tier} 批量上限 ${response.data.limit}，本次可执行 ${response.data.accepted_count}`,
      );
    });
  }

  async function handleAutomationQueue() {
    await runAction("创建托管队列", async () => {
      const response = await client.createAutomationQueue(
        {
          queue_type: "core_daily",
          actions: [
            { action_type: "claim_cultivation" },
            { action_type: "cave_collect" },
            { action_type: "tower", count: 1 },
          ],
        },
        createIdempotencyKey("web_auto_queue"),
      );
      ensureOk(response);
      setMessage(`托管队列已创建：${response.data.queue.accepted_actions.length} 个行动`);
    });
  }

  async function handleClaimAppearance() {
    const target = firstAppearance?.appearance_id ?? "title_style_qingtian";
    await runAction("领取外观", async () => {
      const response = await client.claimAppearance(
        { appearance_id: target },
        createIdempotencyKey("web_appearance_claim"),
      );
      ensureOk(response);
      await refreshCommerce();
      setMessage(`领取外观：${response.data.appearance.name}`);
    });
  }

  async function handleEquipAppearance() {
    const target =
      appearances?.appearances.find((appearance) => appearance.owned)?.appearance_id ??
      firstAppearance?.appearance_id;
    if (!target) {
      setMessage("暂无可装备外观");
      return;
    }

    await runAction("装备外观", async () => {
      const response = await client.equipAppearance(
        { appearance_id: target },
        createIdempotencyKey("web_appearance_equip"),
      );
      ensureOk(response);
      await refreshCommerce();
      setMessage(`已装备外观：${response.data.appearance.name}`);
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
    <main className="shell app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">M7 前端体验闭环</p>
          <h1>择日飞升</h1>
          {activeProfile?.player ? (
            <p className="subline">
              {activeProfile.player.name} · {cultivationRouteLabels[activeProfile.player.route]} ·
              第 {activeProfile.progress?.chapter_id ?? 1} 章
            </p>
          ) : (
            <p className="subline">九州异步修仙文字游戏</p>
          )}
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

      {!activeProfile?.player ? (
        <section className="onboarding-panel" aria-label="进入游戏">
          <div className="section-title">
            <h2>进入冀州</h2>
            <span>{token ? "创建角色后开始今日修行" : "先使用开发期游客登录"}</span>
          </div>
          <div className="login-actions">
            <Button disabled={busy} onClick={handleGuestLogin}>
              游客登录
            </Button>
            <StatusBadge tone={token ? "success" : "neutral"}>
              {token ? "已登录" : "未登录"}
            </StatusBadge>
          </div>
          <form className="create-form" onSubmit={handleCreatePlayer}>
            <label>
              <span>角色名</span>
              <input
                maxLength={16}
                minLength={2}
                onChange={(event) => setPlayerName(event.target.value)}
                value={playerName}
              />
            </label>
            <label>
              <span>路线</span>
              <select
                onChange={(event) => setRoute(event.target.value as RouteValue)}
                value={route}
              >
                <option value="qi">练气</option>
                <option value="body">炼体</option>
              </select>
            </label>
            <Button disabled={busy || !token} type="submit">
              创建角色
            </Button>
          </form>
        </section>
      ) : (
        <>
          <section className="overview-grid" aria-label="修行总览">
            <MetricCard
              label="境界"
              value={`${activeProfile.player.current_realm} 境 ${activeProfile.player.current_level} 层`}
              detail={overview?.cultivation?.can_breakthrough ? "可突破" : "修行中"}
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
              label="洞府"
              value={`${overview?.cave?.claimable_minutes ?? 0} 分钟`}
              detail={`灵石 ${overview?.cave?.preview_rewards.spirit_stone ?? "0"}`}
            />
            <MetricCard
              label="资产"
              value={activeProfile.wallet?.spirit_stone ?? "0"}
              detail={`仙玉 ${activeProfile.wallet?.jade_paid ?? "0"} / ${activeProfile.wallet?.jade_bound ?? "0"}`}
            />
          </section>

          <section className="daily-strip" aria-label="今日核心操作">
            <div>
              <strong>今日核心</strong>
              <span>{completedTasks.length} 个任务可领 · 30 分钟内完成基础收益</span>
            </div>
            <div className="quick-actions">
              <Button disabled={busy || !overview} onClick={handleQuickClaim}>
                一键领取
              </Button>
              <Button disabled={busy || !overview} onClick={() => handleExplore(5)}>
                批量探索
              </Button>
              <Button
                disabled={busy || !overview?.cultivation?.can_breakthrough}
                onClick={handleBreakthrough}
              >
                突破
              </Button>
              <Button disabled={busy || !activeProfile?.player} onClick={() => refreshOverview()}>
                刷新
              </Button>
            </div>
          </section>

          <nav className="tab-nav" aria-label="功能分区">
            {navItems.map((item) => (
              <button
                aria-current={activeTab === item.key ? "page" : undefined}
                className={activeTab === item.key ? "active" : ""}
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="tab-surface" aria-live="polite">
            {activeTab === "overview" ? (
              <div className="main-grid">
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
                            {task.progress_value}/{task.target_value} ·{" "}
                            {taskTypeLabel(task.task_type)}
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
              </div>
            ) : null}

            {activeTab === "growth" ? (
              <section className="panel" aria-label="生产成长">
                <div className="section-title">
                  <h2>成长</h2>
                  <span>炼丹、炼器、背包与技能预设</span>
                </div>
                <div className="production-grid">
                  <ActionBox
                    actions={
                      <>
                        <Button disabled={busy || !overview} onClick={handleCraftAlchemy}>
                          炼丹
                        </Button>
                        <Button disabled={busy || !firstPill} onClick={handleUsePill}>
                          服丹
                        </Button>
                      </>
                    }
                    detail={`材料 ${bag?.items.filter((item) => item.category !== "pill").length ?? 0} 类 · 丹药 ${bag?.items.filter((item) => item.category === "pill").length ?? 0} 类`}
                    title="背包丹药"
                  />
                  <ActionBox
                    actions={
                      <>
                        <Button disabled={busy || !overview} onClick={handleCraftForge}>
                          炼器
                        </Button>
                        <Button disabled={busy || !firstEquipment} onClick={handleRefineEquipment}>
                          淬炼
                        </Button>
                      </>
                    }
                    detail={`已有 ${equipment?.equipments.length ?? 0} 件 · 炼器不产出九大古宝`}
                    title="法宝炼器"
                  />
                  <ActionBox
                    actions={
                      <Button disabled={busy || !skills} onClick={handleSaveSkillPreset}>
                        保存预设
                      </Button>
                    }
                    detail={`主动 ${skills?.active_skill_ids.length ?? 0}/3 · 本命 ${skillName(skills, skills?.treasure_skill_id)}`}
                    title="技能"
                  />
                </div>
              </section>
            ) : null}

            {activeTab === "multiplayer" ? (
              <section className="panel" aria-label="多人玩法">
                <div className="section-title">
                  <h2>多人</h2>
                  <span>九塔、Boss、宗门、资源点与排行</span>
                </div>
                <div className="production-grid">
                  <ActionBox
                    actions={
                      <Button disabled={busy || !firstTower} onClick={handleTowerAction}>
                        镇封提交
                      </Button>
                    }
                    detail={`${firstTower?.tower_name ?? "未读取"} · 完整度 ${firstTower?.integrity ?? 0} · 镇封 ${firstTower?.seal_progress ?? 0}`}
                    title="九塔"
                  />
                  <ActionBox
                    actions={
                      <Button disabled={busy || !boss} onClick={handleChallengeBoss}>
                        镜像挑战
                      </Button>
                    }
                    detail={`${boss?.boss.name ?? "未读取"} · 阶段 ${boss?.boss.phase ?? 0} · 血量 ${boss?.boss.remaining_hp ?? 0}/${boss?.boss.total_hp ?? 0}`}
                    title="公共 Boss"
                  />
                  <ActionBox
                    actions={
                      <>
                        <Button disabled={busy || !!sect?.sect} onClick={handleCreateSect}>
                          创建宗门
                        </Button>
                        <Button disabled={busy || !sect?.sect} onClick={handleSectTask}>
                          宗门任务
                        </Button>
                      </>
                    }
                    detail={
                      sect?.sect
                        ? `${sect.sect.name} · 周贡献 ${sect.sect.my_contribution_weekly}`
                        : "未入宗门"
                    }
                    title="宗门"
                  />
                  <ActionBox
                    actions={
                      <Button disabled={busy || !pvpTarget} onClick={handlePvpAttack}>
                        异步进攻
                      </Button>
                    }
                    detail={`资源点 ${firstResourcePoint?.name ?? "未读取"} · 个人榜 ${personalRank?.entries.length ?? 0} 人`}
                    title="PVP 与排行"
                  />
                </div>
              </section>
            ) : null}

            {activeTab === "market" ? (
              <section className="panel" aria-label="市肆权益">
                <div className="section-title">
                  <h2>市肆</h2>
                  <span>月卡、VIP、抽卡、便利与展示外观</span>
                </div>
                <div className="production-grid">
                  <ActionBox
                    actions={
                      <>
                        <Button
                          disabled={busy || !overview}
                          onClick={() => handlePurchaseMonthly("small_monthly")}
                        >
                          小月卡
                        </Button>
                        <Button
                          disabled={busy || !overview}
                          onClick={() => handlePurchaseMonthly("large_monthly")}
                        >
                          大月卡
                        </Button>
                        <Button
                          disabled={busy || !overview}
                          onClick={() => handleClaimMonthly("small_monthly")}
                        >
                          领小月卡
                        </Button>
                        <Button
                          disabled={busy || !overview}
                          onClick={() => handleClaimMonthly("large_monthly")}
                        >
                          领大月卡
                        </Button>
                      </>
                    }
                    detail={`档位 ${commerce?.effective_tier ?? "free"} · 古宝赠抽 ${
                      commerce?.available_monthly_grants.reduce(
                        (sum, grant) => sum + grant.draw_count - grant.used_count,
                        0,
                      ) ?? 0
                    }`}
                    title="月卡"
                  />
                  <ActionBox
                    actions={
                      <>
                        <Button
                          disabled={busy || !firstAncientGrant}
                          onClick={handleDrawAncientTreasure}
                        >
                          赠抽古宝
                        </Button>
                        <Button disabled={busy || !overview} onClick={handleDrawPermanent}>
                          常驻机缘
                        </Button>
                      </>
                    }
                    detail={`已收集 ${ownedTreasureCount}/9 · ${
                      gachaPools?.pools
                        .find((pool) => pool.pool_type === "ancient_treasure")
                        ?.allowed_cost_types.join(" / ") ?? "月卡赠抽 / 残页"
                    }`}
                    title="九大古宝"
                  />
                  <ActionBox
                    actions={
                      <>
                        <Button disabled={busy || !overview} onClick={() => handleSyncVip(3)}>
                          VIP3
                        </Button>
                        <Button disabled={busy || !overview} onClick={() => handleSyncVip(4)}>
                          VIP4
                        </Button>
                        <Button disabled={busy || !overview} onClick={handleBatchPreview}>
                          便利预览
                        </Button>
                        <Button disabled={busy || !overview} onClick={handleAutomationQueue}>
                          托管队列
                        </Button>
                      </>
                    }
                    detail={`VIP ${commerce?.vip.vip_level ?? 0} · 批量上限 ${commerce?.convenience.batch_sweep_limit ?? 5} · 奖励倍率 1`}
                    title="VIP 与便利"
                  />
                  <ActionBox
                    actions={
                      <>
                        <Button disabled={busy || !overview} onClick={handleClaimAppearance}>
                          领取外观
                        </Button>
                        <Button
                          disabled={
                            busy || !appearances?.appearances.some((appearance) => appearance.owned)
                          }
                          onClick={handleEquipAppearance}
                        >
                          装备外观
                        </Button>
                      </>
                    }
                    detail={`已拥有 ${
                      appearances?.appearances.filter((appearance) => appearance.owned).length ?? 0
                    } · 不提供战力`}
                    title="展示外观"
                  />
                </div>
              </section>
            ) : null}

            {activeTab === "battle" ? (
              <section className="panel" aria-label="最近战报">
                <div className="section-title">
                  <h2>战报</h2>
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
                          {battle.rounds} 回合 · 造成 {battle.damage_done} · 承受{" "}
                          {battle.damage_taken}
                        </span>
                        <span>奖励灵石 {battle.rewards.spirit_stone ?? "0"}</span>
                      </article>
                    ))
                  ) : (
                    <p className="empty">尚无战报，先探索冀州试试。</p>
                  )}
                </div>
              </section>
            ) : null}
          </section>

          <nav className="bottom-nav" aria-label="移动端功能分区">
            {navItems.map((item) => (
              <button
                aria-current={activeTab === item.key ? "page" : undefined}
                className={activeTab === item.key ? "active" : ""}
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </main>
  );
}

function createClient(authToken?: string): GameClient {
  return new GameClient({
    baseUrl: apiBaseUrl,
    token: authToken,
    clientVersion: "nextday-web-m7",
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

async function loadProduction(client: GameClient) {
  const [bagResponse, equipmentResponse, alchemyResponse, forgeResponse, skillResponse] =
    await Promise.all([
      client.bagItems(),
      client.equipmentList(),
      client.alchemyRecipes(),
      client.forgeRecipes(),
      client.skillLoadout(),
    ]);

  ensureOk(bagResponse);
  ensureOk(equipmentResponse);
  ensureOk(alchemyResponse);
  ensureOk(forgeResponse);
  ensureOk(skillResponse);

  return {
    bag: bagResponse.data,
    equipment: equipmentResponse.data,
    alchemyRecipes: alchemyResponse.data,
    forgeRecipes: forgeResponse.data,
    skills: skillResponse.data,
  };
}

async function loadMultiplayer(client: GameClient) {
  const [towerResponse, bossResponse, sectResponse, resourceResponse, rankResponse] =
    await Promise.all([
      client.towers(),
      client.worldBoss(),
      client.mySect(),
      client.resourcePoints(),
      client.ranks("personal"),
    ]);

  ensureOk(towerResponse);
  ensureOk(bossResponse);
  ensureOk(sectResponse);
  ensureOk(resourceResponse);
  ensureOk(rankResponse);

  return {
    towers: towerResponse.data,
    boss: bossResponse.data,
    sect: sectResponse.data,
    resourcePoints: resourceResponse.data,
    personalRank: rankResponse.data,
  };
}

async function loadCommerce(client: GameClient) {
  const [overviewResponse, poolResponse, treasureResponse, appearanceResponse] = await Promise.all([
    client.commerceOverview(),
    client.gachaPools(),
    client.ancientTreasures(),
    client.appearances(),
  ]);

  ensureOk(overviewResponse);
  ensureOk(poolResponse);
  ensureOk(treasureResponse);
  ensureOk(appearanceResponse);

  return {
    commerce: overviewResponse.data,
    gachaPools: poolResponse.data,
    ancientTreasures: treasureResponse.data,
    appearances: appearanceResponse.data,
  };
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

function ActionBox({
  actions,
  detail,
  title,
}: {
  actions: ReactNode;
  detail: string;
  title: string;
}) {
  return (
    <article className="production-box">
      <strong>{title}</strong>
      <span>{detail}</span>
      <div className="production-actions">{actions}</div>
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

function skillName(skills: SkillLoadoutResponse | null, skillId?: string): string {
  if (!skills || !skillId) {
    return "未配置";
  }

  return skills.available_skills.find((skill) => skill.skill_id === skillId)?.name ?? skillId;
}

function isActiveTab(value: string | null): value is ActiveTab {
  return (
    value === "overview" ||
    value === "growth" ||
    value === "multiplayer" ||
    value === "market" ||
    value === "battle"
  );
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
