"use client";

import { GameClient } from "@nextday/game-client";
import { cultivationRouteLabels } from "@nextday/game-rules";
import type {
  AcceptSectHireRequest,
  ActivityListResponse,
  ActivitySummaryState,
  AlchemyRecipeListResponse,
  AncientTreasureListResponse,
  ApiResponse,
  AppearanceListResponse,
  AppearancePlusCatalogResponse,
  AppearancePlusState,
  BagSummaryResponse,
  BattleSummary,
  CollectionSummaryResponse,
  EntitlementOverviewResponse,
  EquipmentListResponse,
  EraChronicleResponse,
  EraCollectionItemState,
  EraMuseumResponse,
  ExperiencePayload,
  ExperienceTone,
  ExploreEventState,
  ExploreResponse,
  FactionRouteConfigState,
  FactionRoutesResponse,
  ForgeRecipeListResponse,
  GachaPoolListResponse,
  GameOverviewResponse,
  GraduateMentorRequest,
  HealthStatus,
  InnerWorldSummaryResponse,
  JournalEntryState,
  LoginResponse,
  MentorRelationState,
  MentorSummaryResponse,
  MonthlyCardType,
  NewPlayerRouteState,
  PlayerProfileResponse,
  ProposeSectDiplomacyRequest,
  ProvinceSummary,
  RankListResponse,
  RankType,
  ResourcePointListResponse,
  ReviewMentorRequest,
  ReviewSectDiplomacyRequest,
  SectDetailResponse,
  SectDiplomacySummaryResponse,
  SectHireListResponse,
  SectHireState,
  SectListResponse,
  SkillLoadoutResponse,
  StoryScrollDetailResponse,
  StoryScrollListResponse,
  TaskState,
  TitleCollectionResponse,
  TowerListResponse,
  TowerStateSummary,
  TransferStatusResponse,
  WorldBossResponse,
} from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type HealthText = "检测中" | "正常" | "不可用";
type RouteValue = "qi" | "body";
type ActiveTab =
  | "overview"
  | "story"
  | "collection"
  | "events"
  | "growth"
  | "multiplayer"
  | "market"
  | "battle";

const tokenStorageKey = "nextday_m1_token";
const deviceStorageKey = "nextday_m1_device_id";
const journalPageSize = 8;
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const showDevelopmentActions = process.env.NEXT_PUBLIC_SHOW_DEV_ACTIONS === "true";

const navItems: Array<{ key: ActiveTab; label: string }> = [
  { key: "overview", label: "九州" },
  { key: "story", label: "卷轴" },
  { key: "collection", label: "收藏" },
  { key: "events", label: "活动" },
  { key: "growth", label: "成长" },
  { key: "multiplayer", label: "多人" },
  { key: "market", label: "市肆" },
  { key: "battle", label: "战报" },
];

interface DailyGoal {
  id: string;
  title: string;
  detail: string;
  status: string;
  tone: ExperienceTone;
  actionLabel: string;
  actionUnavailableReason?: string;
  disabled?: boolean;
  onAction: () => void | Promise<void>;
}

interface RecommendedAction {
  id: string;
  title: string;
  detail: string;
  buttonLabel: string;
  actionUnavailableReason?: string;
  disabled?: boolean;
  onAction: () => void | Promise<void>;
}

interface JournalEntry {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  tone: ExperienceTone;
  tags: string[];
  deltas: string[];
  recommendations: string[];
  experience?: ExperiencePayload;
}

interface GrowthTarget {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  actionUnavailableReason?: string;
  disabled?: boolean;
  onAction: () => void | Promise<void>;
}

type MainlineStepStatus = "done" | "active" | "pending";

interface MainlineStep {
  id: string;
  title: string;
  detail: string;
  status: MainlineStepStatus;
}

interface MainlineGuide {
  chapterId: number;
  title: string;
  subtitle: string;
  progressPercent: number;
  progressText: string;
  primaryLabel: string;
  primaryHint: string;
  primaryDisabled?: boolean;
  onPrimary: () => void | Promise<void>;
  steps: MainlineStep[];
}

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
  const [innerWorld, setInnerWorld] = useState<InnerWorldSummaryResponse | null>(null);
  const [faction, setFaction] = useState<FactionRoutesResponse | null>(null);
  const [towers, setTowers] = useState<TowerListResponse | null>(null);
  const [boss, setBoss] = useState<WorldBossResponse | null>(null);
  const [sect, setSect] = useState<SectDetailResponse | null>(null);
  const [sectList, setSectList] = useState<SectListResponse | null>(null);
  const [mentor, setMentor] = useState<MentorSummaryResponse | null>(null);
  const [diplomacy, setDiplomacy] = useState<SectDiplomacySummaryResponse | null>(null);
  const [hireList, setHireList] = useState<SectHireListResponse | null>(null);
  const [resourcePoints, setResourcePoints] = useState<ResourcePointListResponse | null>(null);
  const [personalRank, setPersonalRank] = useState<RankListResponse | null>(null);
  const [productionRank, setProductionRank] = useState<RankListResponse | null>(null);
  const [eraRank, setEraRank] = useState<RankListResponse | null>(null);
  const [innerWorldRank, setInnerWorldRank] = useState<RankListResponse | null>(null);
  const [factionRank, setFactionRank] = useState<RankListResponse | null>(null);
  const [titles, setTitles] = useState<TitleCollectionResponse | null>(null);
  const [activities, setActivities] = useState<ActivityListResponse | null>(null);
  const [commerce, setCommerce] = useState<EntitlementOverviewResponse | null>(null);
  const [gachaPools, setGachaPools] = useState<GachaPoolListResponse | null>(null);
  const [ancientTreasures, setAncientTreasures] = useState<AncientTreasureListResponse | null>(
    null,
  );
  const [appearances, setAppearances] = useState<AppearanceListResponse | null>(null);
  const [appearancePlus, setAppearancePlus] = useState<AppearancePlusCatalogResponse | null>(null);
  const [transferStatus, setTransferStatus] = useState<TransferStatusResponse | null>(null);
  const [storyScrolls, setStoryScrolls] = useState<StoryScrollListResponse | null>(null);
  const [storyDetail, setStoryDetail] = useState<StoryScrollDetailResponse | null>(null);
  const [eraChronicle, setEraChronicle] = useState<EraChronicleResponse | null>(null);
  const [collection, setCollection] = useState<CollectionSummaryResponse | null>(null);
  const [eraMuseum, setEraMuseum] = useState<EraMuseumResponse | null>(null);
  const [playerName, setPlayerName] = useState("云游修士");
  const [route, setRoute] = useState<RouteValue>("qi");
  const [message, setMessage] = useState("尚未登录");
  const [lastExperience, setLastExperience] = useState<ExperiencePayload | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalNextCursor, setJournalNextCursor] = useState<string | null>(null);
  const [journalLoadingMore, setJournalLoadingMore] = useState(false);
  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [exploreCount, setExploreCount] = useState(5);
  const [selectedTowerId, setSelectedTowerId] = useState("");
  const [selectedAlchemyRecipeId, setSelectedAlchemyRecipeId] = useState("");
  const [selectedForgeRecipeId, setSelectedForgeRecipeId] = useState("");
  const [selectedPillItemInstanceId, setSelectedPillItemInstanceId] = useState("");
  const [selectedStoryScrollId, setSelectedStoryScrollId] = useState("");
  const [currentExplore, setCurrentExplore] = useState<ExploreResponse | null>(null);
  const [pendingExploreEvents, setPendingExploreEvents] = useState<ExploreEventState[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [tabFocusPulse, setTabFocusPulse] = useState(false);
  const tabSurfaceRef = useRef<HTMLElement | null>(null);

  const client = useMemo(() => createClient(token ?? undefined), [token]);
  const activeProfile = overview?.profile ?? profile;
  const activePlayerId = overview?.profile.player?.player_id ?? null;
  const completedTasks = overview?.tasks.filter((task) => task.status === "completed") ?? [];
  const unlockedProvinces = overview?.provinces.filter((province) => province.unlocked) ?? [];
  const selectedProvince =
    unlockedProvinces.find((province) => province.province_id === selectedProvinceId) ??
    unlockedProvinces[0];
  const availablePills = useMemo(
    () =>
      bag?.items.filter((item) => item.category === "pill" && !item.locked && !item.expired) ?? [],
    [bag],
  );
  const selectedAlchemyRecipe =
    alchemyRecipes?.recipes.find((recipe) => recipe.recipe_id === selectedAlchemyRecipeId) ??
    alchemyRecipes?.recipes[0];
  const selectedForgeRecipe =
    forgeRecipes?.recipes.find((recipe) => recipe.recipe_id === selectedForgeRecipeId) ??
    forgeRecipes?.recipes[0];
  const selectedPill =
    availablePills.find((item) => item.item_instance_id === selectedPillItemInstanceId) ??
    availablePills[0];
  const firstEquipment = equipment?.equipments[0];
  const firstTower = towers?.towers[0];
  const towerBySelectedProvince = selectedProvince
    ? towers?.towers.find((tower) => tower.province_id === selectedProvince.province_id)
    : undefined;
  const selectedTower =
    towers?.towers.find((tower) => tower.tower_id === selectedTowerId) ??
    towerBySelectedProvince ??
    firstTower;
  const activeExplore =
    currentExplore && currentExplore.status !== "claimed" ? currentExplore : null;
  const exploreRemainingSeconds = activeExplore
    ? Math.max(0, Math.ceil((new Date(activeExplore.completes_at).getTime() - nowMs) / 1000))
    : 0;
  const canClaimExplore =
    Boolean(activeExplore) && (activeExplore?.can_claim === true || exploreRemainingSeconds <= 0);
  const firstResourcePoint = resourcePoints?.resource_points[0];
  const pvpTarget = personalRank?.entries.find((entry) => entry.target_id !== activePlayerId);
  const mentorCandidate = personalRank?.entries.find((entry) => entry.target_id !== activePlayerId);
  const pendingMentorReview = mentor?.pending_as_mentor[0];
  const activeMentorRelation = mentor?.active_as_apprentice;
  const pendingMentorApply = mentor?.relations.find(
    (item) => item.apprentice_player_id === activePlayerId && item.status === "pending",
  );
  const diplomacyTargetSect = sectList?.sects.find((item) => item.sect_id !== sect?.sect?.sect_id);
  const diplomacyReview = diplomacy?.proposals_to_review[0];
  const openHire = hireList?.open_hires.find(
    (item) => item.employer_sect_id !== sect?.sect?.sect_id,
  );
  const acceptedHire = hireList?.accepted_hires.find((item) => item.status === "accepted");
  const canProposeDiplomacy = hasSectRoleAtLeast(sect?.sect?.my_role, "elder");
  const canCreateHire = hasSectRoleAtLeast(sect?.sect?.my_role, "deacon");
  const firstWarehouseDepositItem = bag?.items.find(
    (item) =>
      item.tradeable &&
      !item.locked &&
      !item.expired &&
      item.bind_type === "unbound" &&
      (item.item_id === "raw_iron" || item.item_id === "low_herb"),
  );
  const firstWarehouseItem = sect?.warehouse[0];
  const firstAncientGrant = commerce?.available_monthly_grants[0];
  const smallMonthlyState = monthlyCardClaimState(commerce, "small_monthly");
  const largeMonthlyState = monthlyCardClaimState(commerce, "large_monthly");
  const currentTransferRequest = transferStatus?.current_request ?? null;
  const firstActivity = activities?.events[0];
  const firstClaimableActivity = activities?.events.find((activity) => activity.claimable);
  const ownedTreasureCount =
    ancientTreasures?.treasures.filter((treasure) => treasure.owned).length ?? 0;
  const firstAppearance = appearances?.appearances[0];
  const selectedStoryScroll =
    storyScrolls?.scrolls.find((scroll) => scroll.scroll_id === selectedStoryScrollId) ??
    storyScrolls?.scrolls[0];
  const firstPendingExploreEvent = pendingExploreEvents[0];
  const firstInnerCreature = innerWorld?.creatures.find((creature) => creature.status === "idle");
  const firstUnlockedProvince =
    selectedProvince ?? overview?.provinces.find((province) => province.unlocked);
  const availableFactionRoutes =
    faction?.routes.filter((item) => item.route_id !== "undecided") ?? [];
  const mainlineTask = selectMainlineTask(overview?.tasks ?? []);
  const mainlineGuide = buildMainlineGuide({
    activeExplore,
    activeProfile,
    busy,
    canClaimExplore,
    chapterTask: mainlineTask,
    event: firstPendingExploreEvent,
    onClaimExplore: handleClaimExplore,
    onExplore: () => handleExplore(exploreCount),
    onFocusEvent: handleFocusExploreEvent,
    onTask: () => handleMainlineTask(mainlineTask),
    onTower: handleTowerAction,
    onGrowth: () => handleTabChange("growth"),
    overview,
    selectedProvince,
    selectedTower,
    serverRoute: overview?.new_player_route,
  });
  const dailyGoals = buildDailyGoals({
    activity: firstClaimableActivity ?? firstActivity,
    busy,
    canBreakthrough: overview?.cultivation?.can_breakthrough ?? false,
    claimableCultivation: overview?.cultivation?.claimable_cultivation ?? "0",
    claimableTasks: completedTasks,
    firstAncientGrant,
    firstTower: selectedTower,
    overview,
    onActivity: firstClaimableActivity
      ? () => handleClaimActivity(firstClaimableActivity)
      : firstActivity
        ? () => handleSubmitActivity(firstActivity)
        : () => handleTabChange("events"),
    onBreakthrough: handleBreakthrough,
    onCave: handleCollectCave,
    onClaimCultivation: handleClaimCultivation,
    onExplore: () => handleExplore(exploreCount),
    onMonthlyGrant: firstAncientGrant ? handleDrawAncientTreasure : () => handleTabChange("market"),
    onTasks: () => handleMainlineTask(mainlineTask),
    onTower: handleTowerAction,
  });
  const recommendedActions = buildRecommendedActions({
    activity: firstClaimableActivity ?? firstActivity,
    busy,
    canCraftAlchemy: Boolean(alchemyRecipes?.recipes.length),
    canCraftForge: Boolean(forgeRecipes?.recipes.length),
    canExplore: Boolean(overview && selectedProvince && !activeExplore),
    canTower: Boolean(selectedTower),
    caveMinutes: overview?.cave?.claimable_minutes ?? 0,
    exploreCount,
    province: selectedProvince,
    tower: selectedTower,
    onActivity: firstClaimableActivity
      ? () => handleClaimActivity(firstClaimableActivity)
      : firstActivity
        ? () => handleSubmitActivity(firstActivity)
        : () => handleTabChange("events"),
    onAlchemy: handleCraftAlchemy,
    onCave: handleCollectCave,
    onExplore: () => handleExplore(exploreCount),
    onForge: handleCraftForge,
    onQuickClaim: handleQuickClaim,
    onTower: handleTowerAction,
  });
  const visibleRecommendedActions = selectVisibleRecommendedActions(recommendedActions);
  const growthTargets = buildGrowthTargets({
    activity: firstClaimableActivity ?? firstActivity,
    busy,
    firstEquipment,
    firstPill: selectedPill,
    firstTower: selectedTower,
    innerWorld,
    overview,
    onActivity: firstClaimableActivity
      ? () => handleClaimActivity(firstClaimableActivity)
      : firstActivity
        ? () => handleSubmitActivity(firstActivity)
        : () => handleTabChange("events"),
    onBreakthrough: handleBreakthrough,
    onExplore: () => handleExplore(exploreCount),
    onForge: handleCraftForge,
    onInnerWorld: () => handleTabChange("growth"),
    onPill: selectedPill ? handleUsePill : handleCraftAlchemy,
    onTower: handleTowerAction,
  });

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
    if (unlockedProvinces.length === 0) {
      return;
    }
    if (!unlockedProvinces.some((province) => province.province_id === selectedProvinceId)) {
      setSelectedProvinceId(unlockedProvinces[0].province_id);
    }
  }, [selectedProvinceId, unlockedProvinces]);

  useEffect(() => {
    const towerList = towers?.towers ?? [];
    if (towerList.length === 0) {
      return;
    }
    const provinceTower = selectedProvince
      ? towerList.find((tower) => tower.province_id === selectedProvince.province_id)
      : undefined;
    const nextTower = provinceTower ?? towerList[0];
    if (nextTower && selectedTowerId !== nextTower.tower_id) {
      setSelectedTowerId(nextTower.tower_id);
    }
  }, [selectedProvince, selectedTowerId, towers]);

  useEffect(() => {
    const recipes = alchemyRecipes?.recipes ?? [];
    if (recipes.length === 0) {
      setSelectedAlchemyRecipeId("");
      return;
    }
    if (!recipes.some((recipe) => recipe.recipe_id === selectedAlchemyRecipeId)) {
      setSelectedAlchemyRecipeId(recipes[0].recipe_id);
    }
  }, [alchemyRecipes, selectedAlchemyRecipeId]);

  useEffect(() => {
    const recipes = forgeRecipes?.recipes ?? [];
    if (recipes.length === 0) {
      setSelectedForgeRecipeId("");
      return;
    }
    if (!recipes.some((recipe) => recipe.recipe_id === selectedForgeRecipeId)) {
      setSelectedForgeRecipeId(recipes[0].recipe_id);
    }
  }, [forgeRecipes, selectedForgeRecipeId]);

  useEffect(() => {
    if (availablePills.length === 0) {
      setSelectedPillItemInstanceId("");
      return;
    }
    if (!availablePills.some((item) => item.item_instance_id === selectedPillItemInstanceId)) {
      setSelectedPillItemInstanceId(availablePills[0].item_instance_id);
    }
  }, [availablePills, selectedPillItemInstanceId]);

  useEffect(() => {
    if (!token || !activePlayerId) {
      return;
    }

    let ignore = false;
    createClient(token)
      .currentExplore()
      .then((response) => {
        ensureOk(response);
        if (!ignore) {
          setCurrentExplore(response.data.current);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage("探索队列读取失败");
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
    createClient(token)
      .transferStatus()
      .then((response) => {
        if (ignore) {
          return;
        }
        ensureOk(response);
        setTransferStatus(response.data);
      })
      .catch(() => {
        if (!ignore) {
          setMessage("转服状态读取失败");
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
    const client = createClient(token);
    Promise.all([client.journal(journalPageSize), client.exploreEvents("pending", 10)])
      .then(([journalResponse, eventsResponse]) => {
        ensureOk(journalResponse);
        ensureOk(eventsResponse);
        if (ignore) {
          return;
        }
        applyServerJournal(journalResponse.data.entries, journalResponse.data.next_cursor);
        setPendingExploreEvents(eventsResponse.data.events);
      })
      .catch(() => {
        if (!ignore) {
          setMessage("修行日志读取失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, activePlayerId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
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
    loadActivities(createClient(token))
      .then((state) => {
        if (!ignore) {
          setActivities(state);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage("活动中心读取失败");
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
    loadInnerWorld(createClient(token))
      .then((state) => {
        if (!ignore) {
          setInnerWorld(state);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage("内天地状态读取失败");
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
        setAppearancePlus(state.appearancePlus);
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
    loadStory(createClient(token), selectedStoryScrollId)
      .then((state) => {
        if (ignore) {
          return;
        }
        setStoryScrolls(state.storyScrolls);
        setStoryDetail(state.storyDetail);
        setEraChronicle(state.eraChronicle);
        if (state.storyDetail && state.storyDetail.scroll.scroll_id !== selectedStoryScrollId) {
          setSelectedStoryScrollId(state.storyDetail.scroll.scroll_id);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage("章节卷轴读取失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, activePlayerId, selectedStoryScrollId]);

  useEffect(() => {
    if (!token || !activePlayerId) {
      return;
    }

    let ignore = false;
    loadCollection(createClient(token))
      .then((state) => {
        if (ignore) {
          return;
        }
        setCollection(state.collection);
        setEraMuseum(state.eraMuseum);
      })
      .catch(() => {
        if (!ignore) {
          setMessage("收藏馆读取失败");
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
        setSectList(state.sectList);
        setMentor(state.mentor);
        setDiplomacy(state.diplomacy);
        setHireList(state.hireList);
        setResourcePoints(state.resourcePoints);
        setPersonalRank(state.personalRank);
        setProductionRank(state.productionRank);
        setEraRank(state.eraRank);
        setInnerWorldRank(state.innerWorldRank);
        setFactionRank(state.factionRank);
        setTitles(state.titles);
        setFaction(state.faction);
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
    await refreshInnerWorld();
    await refreshMultiplayer();
    await refreshActivities();
    await refreshCommerce();
    await refreshTransfer();
    await refreshExplore();
    await refreshJournal();
    await refreshExploreEvents();
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

  async function refreshInnerWorld() {
    if (!token) {
      return;
    }

    const state = await loadInnerWorld(createClient(token));
    setInnerWorld(state);
  }

  async function refreshMultiplayer() {
    if (!token) {
      return;
    }

    const state = await loadMultiplayer(createClient(token));
    setTowers(state.towers);
    setBoss(state.boss);
    setSect(state.sect);
    setSectList(state.sectList);
    setMentor(state.mentor);
    setDiplomacy(state.diplomacy);
    setHireList(state.hireList);
    setResourcePoints(state.resourcePoints);
    setPersonalRank(state.personalRank);
    setProductionRank(state.productionRank);
    setEraRank(state.eraRank);
    setInnerWorldRank(state.innerWorldRank);
    setFactionRank(state.factionRank);
    setTitles(state.titles);
    setFaction(state.faction);
  }

  async function refreshActivities() {
    if (!token) {
      return;
    }

    const state = await loadActivities(createClient(token));
    setActivities(state);
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

  async function refreshTransfer() {
    if (!token) {
      return;
    }

    const response = await createClient(token).transferStatus();
    ensureOk(response);
    setTransferStatus(response.data);
  }

  async function refreshExplore() {
    if (!token) {
      return;
    }

    const response = await createClient(token).currentExplore();
    ensureOk(response);
    setCurrentExplore(response.data.current);
  }

  async function refreshJournal() {
    if (!token) {
      return;
    }

    const loadedCount = Math.min(20, Math.max(journalPageSize, journalEntries.length));
    const response = await createClient(token).journal(loadedCount);
    ensureOk(response);
    applyServerJournal(response.data.entries, response.data.next_cursor);
  }

  async function handleLoadMoreJournal() {
    if (!token || !journalNextCursor || journalLoadingMore) {
      return;
    }

    setJournalLoadingMore(true);
    try {
      const response = await createClient(token).journal(journalPageSize, journalNextCursor);
      ensureOk(response);
      const olderEntries = response.data.entries.map(serverJournalToEntry);
      setJournalEntries((current) => mergeJournalEntries(current, olderEntries));
      setJournalNextCursor(response.data.next_cursor);
      setMessage(olderEntries.length ? "已载入更早修行记录" : "没有更早修行记录");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更早日志读取失败");
    } finally {
      setJournalLoadingMore(false);
    }
  }

  async function refreshExploreEvents() {
    if (!token) {
      return;
    }

    const response = await createClient(token).exploreEvents("pending", 10);
    ensureOk(response);
    setPendingExploreEvents(response.data.events);
  }

  async function handleClaimCultivation() {
    await runAction("领取修为", async () => {
      const response = await client.claimCultivation(createIdempotencyKey("web_cultivation"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `修为增加 ${response.data.gained_cultivation}，当前层级 ${response.data.status.current_level} 层。`,
        tags: response.data.completed_task_ids.length ? ["任务推进"] : ["离线收益"],
        title: "领取修为",
        tone: "success",
      });
      await refreshOverview(`领取 ${response.data.gained_cultivation} 修为`);
    });
  }

  async function handleBreakthrough() {
    await runAction("突破", async () => {
      const response = await client.breakthrough(createIdempotencyKey("web_breakthrough"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary: response.data.message,
        tags: [response.data.success ? "突破成功" : "突破失败"],
        title: "尝试突破",
        tone: response.data.success ? "success" : "warning",
      });
      await refreshOverview(response.data.message);
    });
  }

  async function handleExplore(count: number) {
    const province = selectedProvince ?? firstUnlockedProvince;
    if (!province) {
      setMessage("暂无可探索州域");
      return;
    }
    if (activeExplore) {
      setMessage(
        canClaimExplore
          ? "已有探索完成待领取"
          : `已有探索进行中，剩余 ${formatRemainingSeconds(exploreRemainingSeconds)}`,
      );
      return;
    }

    await runAction("开始探索", async () => {
      const response = await client.explore(
        { province_id: province.province_id, count },
        createIdempotencyKey(`web_explore_${count}`),
      );
      ensureOk(response);
      setCurrentExplore(response.data);
      rememberExperience(undefined, {
        summary: `${province.name}探索已派出，预计 ${formatRemainingSeconds(
          response.data.total_seconds,
        )} 后可领取战报和奖励。`,
        tags: [
          "州域游历",
          `${response.data.count} 次`,
          `${response.data.seconds_per_explore} 秒/次`,
        ],
        title: "开始州域探索",
        tone: "neutral",
      });
      await refreshOverview(`开始 ${response.data.count} 次${province.name}探索`);
    });
  }

  async function handleClaimExplore() {
    if (!activeExplore) {
      setMessage("暂无可领取探索");
      return;
    }

    await runAction("领取探索", async () => {
      const response = await client.claimExplore(
        { record_id: activeExplore.record_id },
        createIdempotencyKey(`web_explore_claim_${activeExplore.record_id}`),
      );
      ensureOk(response);
      setCurrentExplore(response.data);
      rememberExperience(response.data.experience);
      await refreshOverview(
        `完成 ${response.data.battles.length} 次${response.data.province_name}探索`,
      );
    });
  }

  async function handleResolveExploreEvent(event: ExploreEventState, choiceId: string) {
    await runAction("处理奇遇", async () => {
      const response = await client.resolveExploreEvent(
        { choice_id: choiceId, event_id: event.event_id },
        createIdempotencyKey(`web_explore_event_${event.event_id}_${choiceId}`),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`${response.data.event.title}已处理`);
    });
  }

  async function handleCollectCave() {
    await runAction("洞府收取", async () => {
      const response = await client.collectCave(createIdempotencyKey("web_cave"));
      ensureOk(response);
      rememberExperience(response.data.experience);
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
      rememberExperience(undefined, {
        summary: `${response.data.task.title} 已领取，奖励已入账，可在记录中查看。`,
        tags: [taskTypeLabel(task.task_type), "奖励领取"],
        title: "领取任务奖励",
        tone: "success",
      });
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
      rememberExperience(undefined, {
        summary: response.data.items.map((item) => `${item.label}：${item.message}`).join("；"),
        tags: ["一键领取", `${claimedCount} 项成功`],
        title: "今日收益收束",
        tone: claimedCount > 0 ? "success" : "neutral",
      });
      await refreshOverview(`一键领取完成 ${claimedCount} 项`);
    });
  }

  async function handleCraftAlchemy() {
    const recipe = selectedAlchemyRecipe;
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
      rememberExperience(response.data.experience);
      await refreshOverview(`炼丹${response.data.record.success ? "成功" : "失败返还"}`);
    });
  }

  async function handleUsePill() {
    if (!selectedPill) {
      setMessage("背包中暂无可服用丹药");
      return;
    }

    await runAction("服丹", async () => {
      const response = await client.pillUse(
        { item_instance_id: selectedPill.item_instance_id },
        createIdempotencyKey("web_pill"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `服用 ${selectedPill.name}，本次效果 ${response.data.effect_value}，有效倍率 ${Math.round(
          response.data.effective_rate * 100,
        )}%。`,
        tags: ["丹药", "修为成长"],
        title: "服用丹药",
        tone: "success",
      });
      await refreshOverview(`服丹获得 ${response.data.effect_value} 修为`);
    });
  }

  async function handleCraftForge() {
    const recipe = selectedForgeRecipe;
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
      rememberExperience(response.data.experience);
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
      rememberExperience(response.data.experience);
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
      rememberExperience(undefined, {
        summary: "主动技能、本命法宝技能和自动释放优先级已保存，下一次探索会进入战报。",
        tags: ["技能预设", "自动战斗"],
        title: "调整战斗策略",
        tone: "success",
      });
      setMessage("技能预设已保存，下一次探索会写入战报");
    });
  }

  async function handleInnerWorldDispatch() {
    const province = firstUnlockedProvince;
    if (!province) {
      setMessage("暂无可派驻州域");
      return;
    }

    await runAction("内天地派驻", async () => {
      const response = await client.innerWorldDispatch(
        { province_id: province.province_id, creature_id: firstInnerCreature?.creature_id },
        createIdempotencyKey("web_inner_dispatch"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`派驻 ${response.data.assignment.creature_name} 至 ${province.name}`);
    });
  }

  async function handleInnerWorldClaim() {
    await runAction("内天地收取", async () => {
      const response = await client.innerWorldClaim({}, createIdempotencyKey("web_inner_claim"));
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`收取法则经验 ${response.data.law_exp_gained}`);
    });
  }

  async function handleInnerWorldUpgradeWorld() {
    await runAction("内天地升级", async () => {
      const response = await client.innerWorldUpgrade(
        { target_type: "world" },
        createIdempotencyKey("web_inner_upgrade_world"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`内天地升至 ${response.data.state.world_level} 级`);
    });
  }

  async function handleInnerWorldUpgradeCreature() {
    if (!firstInnerCreature) {
      setMessage("暂无空闲生灵可培养");
      return;
    }

    await runAction("生灵培养", async () => {
      const response = await client.innerWorldUpgrade(
        { target_type: "creature", creature_id: firstInnerCreature.creature_id },
        createIdempotencyKey("web_inner_upgrade_creature"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`${response.data.creature?.name ?? "生灵"} 培养完成`);
    });
  }

  async function handleInnerWorldSupport() {
    const province = firstUnlockedProvince;
    if (!province) {
      setMessage("暂无可支援州域");
      return;
    }

    await runAction("九州支援", async () => {
      const response = await client.innerWorldSupport(
        { province_id: province.province_id, support_type: "spirit_vein" },
        createIdempotencyKey("web_inner_support"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`支援 ${response.data.support.province_name}`);
    });
  }

  async function handleTowerAction() {
    const tower = selectedTower ?? firstTower;
    if (!tower) {
      setMessage("九塔状态尚未读取");
      return;
    }

    await runAction("九塔提交", async () => {
      const response = await client.towerAction(
        { tower_id: tower.tower_id, action_type: "seal", count: 1 },
        createIdempotencyKey("web_tower"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
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
      rememberExperience(response.data.experience);
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
      rememberExperience(undefined, {
        summary: `${response.data.sect.name} 已立宗，后续可做宗门任务、建设和仓库流转。`,
        tags: ["宗门", "异步建设"],
        title: "创建宗门",
        tone: "success",
      });
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
      rememberExperience(response.data.experience);
      await refreshOverview(`宗门贡献 +${response.data.contribution}`);
    });
  }

  async function handleSectWarehouseDeposit() {
    if (!sect?.sect) {
      setMessage("请先创建或加入宗门");
      return;
    }
    if (!firstWarehouseDepositItem) {
      setMessage("暂无可入库的未绑定白名单材料");
      return;
    }

    await runAction("宗门入库", async () => {
      const response = await client.depositSectWarehouse(
        { item_instance_id: firstWarehouseDepositItem.item_instance_id, count: 1 },
        createIdempotencyKey("web_sect_deposit"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`入库 ${firstWarehouseDepositItem.name} x1`);
    });
  }

  async function handleSectWarehouseWithdraw() {
    if (!sect?.sect) {
      setMessage("请先创建或加入宗门");
      return;
    }
    if (!firstWarehouseItem) {
      setMessage("宗门仓库暂无可取用材料");
      return;
    }

    await runAction("宗门取用", async () => {
      const response = await client.withdrawSectWarehouse(
        { item_id: firstWarehouseItem.item_id, count: 1 },
        createIdempotencyKey("web_sect_withdraw"),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`取用 ${firstWarehouseItem.name} x1`);
    });
  }

  async function handleApplyMentor() {
    if (!mentorCandidate) {
      setMessage("暂无可拜访的导师候选");
      return;
    }

    await runAction("拜访导师", async () => {
      const body: { mentor_player_id: string } = { mentor_player_id: mentorCandidate.target_id };
      const response = await client.applyMentor(body, createIdempotencyKey("web_mentor_apply"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已向 ${response.data.relation.mentor_name} 递交拜师帖，等待对方异步审批。`,
        tags: ["导师"],
        title: "拜访导师",
        tone: "success",
      });
      await refreshOverview("拜师申请已送达");
    });
  }

  async function handleReviewMentor(relation: MentorRelationState, decision: "accept" | "reject") {
    const actionLabel = decision === "accept" ? "同意拜师" : "婉拒拜师";
    await runAction(actionLabel, async () => {
      const body: ReviewMentorRequest = {
        decision,
        mentor_relation_id: relation.mentor_relation_id,
      };
      const response = await client.reviewMentor(body, createIdempotencyKey("web_mentor_review"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary:
          decision === "accept"
            ? `${response.data.relation.apprentice_name} 已成为门下弟子。`
            : `已婉拒 ${response.data.relation.apprentice_name} 的拜师帖。`,
        tags: ["导师"],
        title: actionLabel,
        tone: decision === "accept" ? "success" : "neutral",
      });
      await refreshOverview(actionLabel);
    });
  }

  async function handleClaimMentorTask() {
    if (!activeMentorRelation) {
      setMessage("暂无可领取的师徒任务");
      return;
    }

    await runAction("领取师徒任务", async () => {
      const response = await client.claimMentorTask(
        { mentor_relation_id: activeMentorRelation.mentor_relation_id },
        createIdempotencyKey("web_mentor_task"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已完成 ${response.data.relation.mentor_name} 的指点任务，获得少量修行补给。`,
        tags: ["导师任务"],
        title: "师徒指点",
        tone: "success",
      });
      await refreshOverview("师徒任务已领取");
    });
  }

  async function handleGraduateMentor() {
    if (!activeMentorRelation) {
      setMessage("暂无可出师的师徒关系");
      return;
    }

    await runAction("出师", async () => {
      const body: GraduateMentorRequest = {
        mentor_relation_id: activeMentorRelation.mentor_relation_id,
      };
      const response = await client.graduateMentor(
        body,
        createIdempotencyKey("web_mentor_graduate"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已从 ${response.data.relation.mentor_name} 门下出师，记录留入本纪元社交册。`,
        tags: ["出师"],
        title: "完成出师",
        tone: "success",
      });
      await refreshOverview("出师完成");
    });
  }

  async function handleProposeDiplomacy() {
    if (!diplomacyTargetSect) {
      setMessage("暂无可发起外交的目标宗门");
      return;
    }

    await runAction("发起盟约", async () => {
      const body: ProposeSectDiplomacyRequest = {
        diplomacy_type: "alliance",
        message: "愿以异步协作为约。",
        target_sect_id: diplomacyTargetSect.sect_id,
      };
      const response = await client.proposeSectDiplomacy(
        body,
        createIdempotencyKey("web_diplomacy_propose"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已向 ${response.data.diplomacy.target_sect_name} 发出盟约提案。`,
        tags: ["宗门外交"],
        title: "外交提案",
        tone: "success",
      });
      await refreshOverview("外交提案已发出");
    });
  }

  async function handleReviewDiplomacy(decision: "accept" | "reject") {
    if (!diplomacyReview) {
      setMessage("暂无待审批外交提案");
      return;
    }

    await runAction(decision === "accept" ? "同意盟约" : "拒绝提案", async () => {
      const body: ReviewSectDiplomacyRequest = {
        decision,
        diplomacy_record_id: diplomacyReview.diplomacy_record_id,
      };
      const response = await client.reviewSectDiplomacy(
        body,
        createIdempotencyKey("web_diplomacy_review"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary:
          decision === "accept"
            ? `已与 ${response.data.diplomacy.source_sect_name} 建立${sectDiplomacyTypeLabel(
                response.data.diplomacy.diplomacy_type,
              )}。`
            : `已回绝 ${response.data.diplomacy.source_sect_name} 的外交提案。`,
        tags: ["宗门外交"],
        title: "外交审批",
        tone: decision === "accept" ? "success" : "neutral",
      });
      await refreshOverview("外交状态已更新");
    });
  }

  async function handleCreateSectHire() {
    if (!sect?.sect) {
      setMessage("请先加入宗门");
      return;
    }

    await runAction("发布雇佣", async () => {
      const body: { hire_type: "explore_support"; message: string } = {
        hire_type: "explore_support",
        message: "请协助完成日常探索补给。",
      };
      const response = await client.createSectHire(body, createIdempotencyKey("web_hire_create"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已发布${sectHireTypeLabel(response.data.hire.hire_type)}委托，等待其他宗门接取。`,
        tags: ["宗门雇佣"],
        title: "发布雇佣",
        tone: "success",
      });
      await refreshOverview("雇佣委托已发布");
    });
  }

  async function handleAcceptSectHire(hire: SectHireState) {
    await runAction("接取雇佣", async () => {
      const body: AcceptSectHireRequest = { hire_record_id: hire.hire_record_id };
      const response = await client.acceptSectHire(body, createIdempotencyKey("web_hire_accept"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已接取 ${response.data.hire.employer_sect_name} 的${sectHireTypeLabel(
          response.data.hire.hire_type,
        )}委托。`,
        tags: ["宗门雇佣"],
        title: "接取雇佣",
        tone: "success",
      });
      await refreshOverview("雇佣委托已接取");
    });
  }

  async function handleSettleSectHire(hire: SectHireState) {
    await runAction("结算雇佣", async () => {
      const body: { hire_record_id: string } = { hire_record_id: hire.hire_record_id };
      const response = await client.settleSectHire(body, createIdempotencyKey("web_hire_settle"));
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `${sectHireTypeLabel(response.data.hire.hire_type)}委托已完成，获得普通灵石酬劳。`,
        tags: ["雇佣完成"],
        title: "雇佣结算",
        tone: "success",
      });
      await refreshOverview("雇佣已结算");
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
      rememberExperience(response.data.experience);
      await refreshOverview(
        `PVP ${response.data.result === "win" ? "胜" : "负"} +${response.data.score_delta}`,
      );
    });
  }

  async function handleChooseFactionRoute(routeConfig: FactionRouteConfigState) {
    await runAction(`选择${routeConfig.name}`, async () => {
      const response = await client.chooseFactionRoute(
        { route_id: routeConfig.route_id },
        createIdempotencyKey(`web_faction_choose_${routeConfig.route_id}`),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`已选择${response.data.state.route_name}`);
    });
  }

  async function handleTransferFactionRoute(routeConfig: FactionRouteConfigState) {
    await runAction(`转道${routeConfig.name}`, async () => {
      const response = await client.transferFactionRoute(
        {
          route_id: routeConfig.route_id,
          task_id: factionTransferTaskId(routeConfig.route_id),
        },
        createIdempotencyKey(`web_faction_transfer_${routeConfig.route_id}`),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`已转道${response.data.state.route_name}`);
    });
  }

  async function handleClaimRankTitle(rankType: RankType) {
    await runAction("领取排行称号", async () => {
      const response = await client.claimRankTitle(
        { rank_type: rankType },
        createIdempotencyKey(`web_rank_title_${rankType}`),
      );
      ensureOk(response);
      setTitles(response.data.collection);
      rememberExperience(undefined, {
        summary: `${response.data.appearance.name} 已加入展示收藏，排行奖励只提供荣誉和外观展示。`,
        tags: ["排行称号", "展示外观"],
        title: "领取排行称号",
        tone: "success",
      });
      await refreshOverview(`领取称号：${response.data.appearance.name}`);
    });
  }

  async function handleSubmitActivity(activity: ActivitySummaryState) {
    await runAction(activity.action_label, async () => {
      const response = await client.submitActivityProgress(
        {
          event_id: activity.event_id,
          count: 1,
          province_id: firstUnlockedProvince?.province_id ?? "ji",
        },
        createIdempotencyKey(`web_event_progress_${activity.event_id}`),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(
        `${activity.name} 进度 ${response.data.record.progress}/${response.data.record.target_progress}`,
      );
    });
  }

  async function handleClaimActivity(activity: ActivitySummaryState) {
    await runAction("领取活动奖励", async () => {
      const response = await client.claimActivityReward(
        { event_id: activity.event_id },
        createIdempotencyKey(`web_event_claim_${activity.event_id}`),
      );
      ensureOk(response);
      rememberExperience(response.data.experience);
      await refreshOverview(`领取活动奖励：${activity.name}`);
    });
  }

  async function handlePurchaseMonthly(cardType: "small_monthly" | "large_monthly") {
    await runAction(cardType === "small_monthly" ? "购买小月卡" : "购买大月卡", async () => {
      const response = await client.purchaseMonthlyCard(
        { card_type: cardType },
        createIdempotencyKey(`web_monthly_${cardType}`),
      );
      ensureOk(response);
      const cardLabel = monthlyCardLabel(response.data.monthly_card.card_type);
      rememberExperience(undefined, {
        summary: `${cardLabel} 已生效，月卡只提供便利、赠抽和付费资产记录，不提高战斗倍率。`,
        tags: ["月卡", "权益"],
        title: "月卡生效",
        tone: "success",
      });
      await refreshOverview(`${cardLabel} 已生效`);
    });
  }

  async function handleClaimMonthly(cardType: "small_monthly" | "large_monthly") {
    await runAction("领取月卡日权益", async () => {
      const response = await client.claimMonthlyDaily(
        { card_type: cardType },
        createIdempotencyKey(`web_monthly_claim_${cardType}`),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: response.data.claimed
          ? `领取仙玉 ${response.data.rewards.jade_paid ?? "0"}，绑定仙玉 ${
              response.data.rewards.jade_bound ?? "0"
            }。`
          : "今日月卡权益已经领取，九大古宝赠抽不会跨日累计。",
        tags: ["月卡日课", response.data.claimed ? "已领取" : "已完成"],
        title: "领取月卡日权益",
        tone: response.data.claimed ? "success" : "neutral",
      });
      await refreshOverview(
        response.data.claimed
          ? `领取仙玉 ${response.data.rewards.jade_paid ?? "0"} / 绑定仙玉 ${response.data.rewards.jade_bound ?? "0"}`
          : "今日月卡权益已领取",
      );
    });
  }

  async function handleCreateTransferRequest() {
    await runAction("提交转服申请", async () => {
      const response = await client.createTransferRequest(
        { target_server_id: "mvp_beta", reason: "玩家发起受限转服申请" },
        createIdempotencyKey("web_transfer_request"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已生成前往 ${response.data.request.target_server_id} 的转服影响报告，等待后台人工审核。`,
        tags: ["转服申请"],
        title: "提交转服申请",
        tone: "success",
      });
      await refreshOverview("转服申请已提交");
    });
  }

  async function handleCancelTransferRequest() {
    if (!currentTransferRequest) {
      setMessage("暂无可取消的转服申请");
      return;
    }

    await runAction("取消转服申请", async () => {
      const response = await client.cancelTransferRequest(
        {
          transfer_request_id: currentTransferRequest.transfer_request_id,
          reason: "玩家取消",
        },
        createIdempotencyKey("web_transfer_cancel"),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `已取消前往 ${response.data.request.target_server_id} 的转服申请。`,
        tags: ["转服取消"],
        title: "取消转服申请",
        tone: "neutral",
      });
      await refreshOverview("转服申请已取消");
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
      rememberExperience(response.data.experience);
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
      rememberExperience(response.data.experience);
      await refreshOverview(`抽得 ${response.data.result.result_name}`);
    });
  }

  function handleSelectProvince(provinceId: string) {
    setSelectedProvinceId(provinceId);
    const tower = towers?.towers.find((item) => item.province_id === provinceId);
    if (tower) {
      setSelectedTowerId(tower.tower_id);
    }
  }

  function handleSelectTower(towerId: string) {
    setSelectedTowerId(towerId);
    const tower = towers?.towers.find((item) => item.tower_id === towerId);
    const province = overview?.provinces.find((item) => item.province_id === tower?.province_id);
    if (province?.unlocked) {
      setSelectedProvinceId(province.province_id);
    }
  }

  function handleTabChange(tab: ActiveTab, options: { focus?: boolean } = {}) {
    const shouldFocus = options.focus ?? true;
    setActiveTab(tab);
    setFocusedTaskId(null);
    setMessage(`已切换到${activeTabLabel(tab)}`);

    if (!shouldFocus) {
      return;
    }

    window.setTimeout(() => {
      scrollElementToTop(tabSurfaceRef.current);
      tabSurfaceRef.current?.focus({ preventScroll: true });
      setTabFocusPulse(true);
      window.setTimeout(() => setTabFocusPulse(false), 720);
    }, 0);
  }

  function scrollToSection(selector: string) {
    window.setTimeout(() => {
      scrollElementToTop(document.querySelector(selector));
    }, 0);
  }

  function scrollElementToTop(element: Element | null) {
    if (!element) {
      return;
    }

    const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - 12);
    window.scrollTo({ behavior: "smooth", top });
  }

  async function handleMainlineTask(task: TaskState | undefined) {
    if (!task) {
      handleFocusTask();
      return;
    }

    if (task.status === "completed") {
      await handleClaimTask(task);
      return;
    }

    handleFocusTask(task);
  }

  function handleFocusTask(task?: TaskState) {
    setActiveTab("overview");
    setFocusedTaskId(task?.task_id ?? null);
    setMessage(task ? `已定位任务：${task.title}` : "已切换到任务列表");
    window.setTimeout(() => {
      const selector = task
        ? `[data-task-id="${CSS.escape(task.task_id)}"]`
        : '[aria-label="今日任务"]';
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function handleFocusExploreEvent() {
    setMessage("请选择一个探索奇遇处理方式");
    window.setTimeout(() => {
      document
        .querySelector(".explore-event-card")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  async function handleSelectStoryScroll(scrollId: string) {
    setSelectedStoryScrollId(scrollId);
    await runAction("卷轴已展开", async () => {
      const response = await client.storyScroll(scrollId);
      ensureOk(response);
      setStoryDetail(response.data);
      handleTabChange("story", { focus: true });
    });
  }

  async function handleEquipCollectionDisplay(
    collectionItem: EraCollectionItemState,
    slotId: string,
  ) {
    if (!token) {
      return;
    }

    await runAction("收藏已陈列", async () => {
      const collectionClient = createClient(token);
      const response = await collectionClient.equipCollectionDisplay(
        { collection_id: collectionItem.collection_id, display_slot: slotId },
        `idem_collection_display_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      );
      ensureOk(response);
      const state = await loadCollection(collectionClient);
      setCollection(state.collection);
      setEraMuseum(state.eraMuseum);
      setMessage(`${collectionItem.name} 已放入${collectionDisplaySlotName(slotId)}。`);
      handleTabChange("collection", { focus: true });
    });
  }

  async function handleEquipAppearancePlus(appearanceItem: AppearancePlusState) {
    if (!token) {
      return;
    }

    await runAction("外观已更新", async () => {
      const appearanceClient = createClient(token);
      const response = await appearanceClient.equipAppearancePlus(
        {
          appearance_id: appearanceItem.appearance_id,
          display_slot: appearanceItem.display_slot,
        },
        `idem_appearance_plus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      );
      ensureOk(response);
      const state = await loadCommerce(appearanceClient);
      setCommerce(state.commerce);
      setGachaPools(state.gachaPools);
      setAncientTreasures(state.ancientTreasures);
      setAppearances(state.appearances);
      setAppearancePlus(state.appearancePlus);
      setMessage(
        `${appearanceItem.name} 已装备到${appearancePlusSlotLabel(appearanceItem.display_slot)}。`,
      );
      handleTabChange("market", { focus: true });
    });
  }

  function rememberExperience(
    experience?: ExperiencePayload,
    fallback?: {
      summary: string;
      tags?: string[];
      title: string;
      tone?: ExperienceTone;
    },
  ) {
    if (experience) {
      setLastExperience(experience);
      appendJournal({
        deltas: experience.delta_summary.map(formatDeltaSummary).slice(0, 4),
        experience,
        recommendations: experience.next_recommendations.map((item) => item.label).slice(0, 3),
        summary: experience.summary,
        tags: filterJournalTags(experience.reason_tags).slice(0, 4),
        title: experience.title,
        tone: resolveExperienceTone(experience),
      });
      return;
    }

    if (fallback) {
      appendJournal({
        deltas: [],
        recommendations: [],
        summary: fallback.summary,
        tags: filterJournalTagLabels(fallback.tags ?? []),
        title: fallback.title,
        tone: fallback.tone ?? "neutral",
      });
    }
  }

  function applyServerJournal(entries: JournalEntryState[], nextCursor: string | null) {
    const mappedEntries = entries.map(serverJournalToEntry);
    setJournalEntries(mappedEntries);
    setJournalNextCursor(nextCursor);
    setLastExperience(mappedEntries[0]?.experience ?? null);
  }

  function appendJournal(entry: Omit<JournalEntry, "createdAt" | "id">) {
    setJournalEntries((current) =>
      [
        {
          ...entry,
          createdAt: new Date().toISOString(),
          id: `journal_${Date.now()}_${randomId()}`,
        },
        ...current,
      ].slice(0, 20),
    );
  }

  async function handleSyncVip(vipLevel: 3 | 4) {
    await runAction(`同步 VIP${vipLevel}`, async () => {
      const response = await client.syncVip(
        { vip_level: vipLevel, active_days: 30 },
        createIdempotencyKey(`web_vip${vipLevel}`),
      );
      ensureOk(response);
      rememberExperience(undefined, {
        summary: `VIP${vipLevel} 便利已同步，只影响批量、策略和提醒，不提高奖励倍率。`,
        tags: ["VIP", "便利"],
        title: "同步便利权益",
        tone: "success",
      });
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
      const tierLabel = commerceTierLabel(response.data.effective_tier);
      rememberExperience(undefined, {
        summary: `${tierLabel}批量上限 ${response.data.limit}，本次可执行 ${response.data.accepted_count} 次。`,
        tags: ["便利预览", "不增收益"],
        title: "检查批量上限",
        tone: response.data.accepted_count < response.data.requested_count ? "warning" : "success",
      });
      setMessage(
        `${tierLabel}批量上限 ${response.data.limit}，本次可执行 ${response.data.accepted_count}`,
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
      rememberExperience(undefined, {
        summary: `托管队列接收 ${response.data.queue.accepted_actions.length} 个行动，服务端按权益档位限制队列。`,
        tags: ["托管队列", queueStatusLabel(response.data.queue.status)],
        title: "创建今日托管",
        tone: "success",
      });
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
      rememberExperience(undefined, {
        summary: `${response.data.appearance.name} 已加入展示收藏，外观不提供战力或贡献倍率。`,
        tags: ["展示外观", "收藏"],
        title: "领取展示外观",
        tone: "success",
      });
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
      rememberExperience(undefined, {
        summary: `${response.data.appearance.name} 已装备到展示位，只影响名片、战报和社交展示。`,
        tags: ["展示外观", "已装备"],
        title: "装备展示外观",
        tone: "success",
      });
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
    <main className={activeProfile?.player ? "shell app-shell text-game-shell" : "shell app-shell"}>
      <section className="topbar">
        <div>
          <p className="eyebrow">九州纪元 · 文字修行</p>
          <h1>择日飞升</h1>
          {activeProfile?.player ? (
            <p className="subline">
              {activeProfile.player.name} · {cultivationRouteLabels[activeProfile.player.route]} ·
              第 {activeProfile.progress?.chapter_id ?? 1} 章
            </p>
          ) : (
            <p className="subline">九州文字修仙游戏</p>
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
            {token ? (
              <Button disabled={busy} type="submit">
                创建角色
              </Button>
            ) : (
              <span className="action-note">先使用游客登录</span>
            )}
          </form>
        </section>
      ) : (
        <>
          <section className="today-hero" aria-label="今日修行">
            <div className="today-hero-copy">
              <p className="eyebrow">今日修行</p>
              <h2>先收收益，再定路线</h2>
              <p>
                {completedTasks.length} 个任务可领 · 行动令{" "}
                {overview?.action_state?.action_points ?? 0} 枚 ·{" "}
                {firstClaimableActivity ? `${firstClaimableActivity.name} 可领奖` : "活动可推进"}
              </p>
            </div>
            <MainlineGuideCard guide={mainlineGuide} />
            <div className="today-controls" aria-label="今日行动选择">
              <label>
                <span>探索州域</span>
                <select
                  onChange={(event) => handleSelectProvince(event.target.value)}
                  value={selectedProvince?.province_id ?? ""}
                >
                  {unlockedProvinces.map((province) => (
                    <option key={province.province_id} value={province.province_id}>
                      {province.name} · {province.tower_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>探索次数</span>
                <select
                  onChange={(event) => setExploreCount(Number(event.target.value))}
                  value={exploreCount}
                >
                  <option value={1}>1 次</option>
                  <option value={3}>3 次</option>
                  <option value={5}>5 次</option>
                </select>
              </label>
              <label className="tower-choice">
                <span>九塔目标</span>
                <select
                  onChange={(event) => handleSelectTower(event.target.value)}
                  value={selectedTower?.tower_id ?? ""}
                >
                  {towers?.towers.map((tower) => (
                    <option
                      disabled={!isProvinceUnlocked(overview?.provinces, tower.province_id)}
                      key={tower.tower_id}
                      value={tower.tower_id}
                    >
                      {provinceNameById(overview?.provinces, tower.province_id)} ·{" "}
                      {tower.tower_name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="today-refresh-button"
                disabled={busy || !activeProfile?.player}
                onClick={() => refreshOverview()}
              >
                刷新状态
              </Button>
            </div>
            <ExploreQueueCard
              canClaim={canClaimExplore}
              explore={activeExplore ?? currentExplore}
              onClaim={handleClaimExplore}
              remainingSeconds={exploreRemainingSeconds}
              busy={busy}
            />
            <ExploreEventCard
              busy={busy}
              event={firstPendingExploreEvent}
              onResolve={handleResolveExploreEvent}
            />
            <div className="today-action-grid">
              {visibleRecommendedActions.map((action) => (
                <article className="recommended-action" key={action.id}>
                  <div>
                    <strong>{action.title}</strong>
                    <span>{action.detail}</span>
                  </div>
                  {action.actionUnavailableReason ? (
                    <span className="action-note">{action.actionUnavailableReason}</span>
                  ) : (
                    <Button disabled={action.disabled} onClick={action.onAction}>
                      {action.buttonLabel}
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="mobile-status-anchors" aria-label="移动端状态捷径">
            <button onClick={() => scrollToSection(".overview-grid")} type="button">
              <strong>资源账本</strong>
              <span>
                灵石 {activeProfile.wallet?.spirit_stone ?? "0"} · 行动令{" "}
                {overview?.action_state?.action_points ?? 0}
              </span>
            </button>
            <button onClick={() => scrollToSection(".journal-panel")} type="button">
              <strong>最近日志</strong>
              <span>{journalEntries[0]?.title ?? "暂无记录，完成一次行动后写入"}</span>
            </button>
          </section>

          <section className="today-layout" aria-label="今日目标与成长追踪">
            <div className="today-panel">
              <div className="section-title">
                <h2>今日目标</h2>
                <span>按收益优先级排列</span>
              </div>
              <div className="goal-list">
                {dailyGoals.map((goal) => (
                  <DailyGoalCard goal={goal} key={goal.id} />
                ))}
              </div>
            </div>
            <div className="today-panel">
              <div className="section-title">
                <h2>下一步成长</h2>
                <span>缺口和入口集中展示</span>
              </div>
              <div className="growth-target-list">
                {growthTargets.slice(0, 3).map((target) => (
                  <GrowthTargetCard key={target.id} target={target} />
                ))}
              </div>
            </div>
          </section>

          <CultivationJournal
            entries={journalEntries}
            experience={lastExperience}
            hasMore={Boolean(journalNextCursor)}
            loadingMore={journalLoadingMore}
            onLoadMore={handleLoadMoreJournal}
          />

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
            {lastExperience ? <LedgerExperienceDetails experience={lastExperience} /> : null}
          </section>

          <nav className="tab-nav" aria-label="功能分区">
            {navItems.map((item) => (
              <button
                aria-current={activeTab === item.key ? "page" : undefined}
                className={activeTab === item.key ? "active" : ""}
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section
            className={`tab-surface ${tabFocusPulse ? "tab-surface-pulse" : ""}`}
            ref={tabSurfaceRef}
            tabIndex={-1}
            aria-live="polite"
          >
            {activeTab === "overview" ? (
              <div className="main-grid">
                <section className="panel" aria-label="九州地图">
                  <div className="section-title">
                    <h2>九州地图</h2>
                    <span>九州全域 · 按章节解锁</span>
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
                        <span>{province.theme}</span>
                        <span>
                          {province.tower_name} · {province.recommended_action}
                        </span>
                        <p className="province-detail">{province.resources.join(" / ")}</p>
                        <p className="province-detail">{province.long_term_goal}</p>
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
                      <article
                        className={`task-row ${
                          focusedTaskId === task.task_id ? "task-row-focused" : ""
                        }`}
                        data-task-id={task.task_id}
                        key={task.task_state_id}
                      >
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

            {activeTab === "story" ? (
              <section className="panel" aria-label="章节卷轴">
                <div className="section-title">
                  <h2>章节卷轴</h2>
                  <span>战报、选择与纪元史册回放</span>
                </div>
                <div className="main-grid">
                  <div className="task-list">
                    {storyScrolls?.scrolls.map((scroll) => (
                      <article
                        className={`task-row ${
                          selectedStoryScroll?.scroll_id === scroll.scroll_id
                            ? "task-row-focused"
                            : ""
                        }`}
                        key={scroll.scroll_id}
                      >
                        <div>
                          <strong>{scroll.title}</strong>
                          <span>
                            第 {scroll.chapter_id} 章 · {scroll.latest_fragment} ·{" "}
                            {scroll.progress_percent}%
                          </span>
                        </div>
                        {scroll.unlock_state === "unlocked" ? (
                          <Button
                            disabled={busy}
                            onClick={() => handleSelectStoryScroll(scroll.scroll_id)}
                          >
                            阅读
                          </Button>
                        ) : (
                          <StatusBadge tone="neutral">未解锁</StatusBadge>
                        )}
                      </article>
                    )) ?? <p className="empty">章节卷轴尚未读取。</p>}
                  </div>

                  <article className="production-box">
                    <div className="province-head">
                      <strong>{storyDetail?.scroll.title ?? "未选择卷轴"}</strong>
                      <StatusBadge
                        tone={
                          storyDetail?.scroll.unlock_state === "unlocked" ? "success" : "neutral"
                        }
                      >
                        {storyDetail?.scroll.unlock_state === "unlocked" ? "可回看" : "待解锁"}
                      </StatusBadge>
                    </div>
                    <p>{storyDetail?.scroll.subtitle ?? "选择一卷，查看已归档的修行片段。"}</p>
                    <div className="journal-list">
                      {storyDetail?.scroll.fragments.map((fragment) => (
                        <article
                          className={fragment.unlocked ? "journal-entry" : "journal-entry muted"}
                          key={fragment.fragment_id}
                        >
                          <div className="journal-entry-head">
                            <strong>{fragment.title}</strong>
                            <StatusBadge tone={fragment.unlocked ? "success" : "neutral"}>
                              {fragment.unlocked ? "已归档" : "未解锁"}
                            </StatusBadge>
                          </div>
                          <p>{fragment.body}</p>
                        </article>
                      ))}
                    </div>
                    {storyDetail?.scroll.battle_refs.length ? (
                      <div className="mini-stats">
                        {storyDetail.scroll.battle_refs.slice(0, 3).map((battle) => (
                          <span key={battle.battle_id}>
                            {battle.title} · {battle.summary}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="action-note">暂无可引用战报，完成探索后会自动归档。</span>
                    )}
                  </article>
                </div>

                <div className="rank-summary-grid">
                  {eraChronicle?.entries.map((entry) => (
                    <article className="rank-mini-card" key={entry.chronicle_id}>
                      <div className="province-head">
                        <strong>{entry.title}</strong>
                        <StatusBadge tone="neutral">
                          {chronicleTypeLabel(entry.chronicle_type)}
                        </StatusBadge>
                      </div>
                      <p>{entry.summary}</p>
                      <div className="mini-stats">
                        {entry.highlights.slice(0, 3).map((highlight) => (
                          <span key={highlight}>{highlight}</span>
                        ))}
                      </div>
                    </article>
                  )) ?? <p className="empty">纪元史册尚未生成。</p>}
                </div>
              </section>
            ) : null}

            {activeTab === "collection" ? (
              <section className="panel" aria-label="多纪元收藏">
                <div className="section-title">
                  <h2>收藏馆</h2>
                  <span>跨纪元回看 · 陈列不加战力</span>
                </div>
                <div className="main-grid">
                  <div className="task-list">
                    {collection?.collections.map((item) => (
                      <article
                        className={item.owned ? "task-row" : "task-row muted"}
                        key={item.collection_id}
                      >
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {collectionTypeLabel(item.collection_type)} ·{" "}
                            {item.owned ? item.public_summary : item.unlock_hint}
                          </span>
                        </div>
                        <StatusBadge tone={item.owned ? "success" : "neutral"}>
                          {item.owned ? "已归档" : "待归档"}
                        </StatusBadge>
                        {item.owned ? (
                          <div className="production-actions">
                            {item.display_positions.map((slotId) =>
                              item.display_slot === slotId ? (
                                <StatusBadge key={slotId} tone="success">
                                  {collectionDisplaySlotName(slotId)}
                                </StatusBadge>
                              ) : (
                                <Button
                                  disabled={busy}
                                  key={slotId}
                                  onClick={() => handleEquipCollectionDisplay(item, slotId)}
                                >
                                  放入{collectionDisplaySlotName(slotId)}
                                </Button>
                              ),
                            )}
                          </div>
                        ) : null}
                      </article>
                    )) ?? <p className="empty">收藏馆尚未读取。</p>}
                  </div>

                  <article className="production-box">
                    <div className="province-head">
                      <strong>展示栏</strong>
                      <StatusBadge tone="neutral">
                        {collection?.blessing_summary.effective_percent ?? 0}% /{" "}
                        {collection?.blessing_summary.cap_percent ?? 1}%
                      </StatusBadge>
                    </div>
                    <p>{collection?.blessing_summary.stacking_rule ?? "收藏只影响展示。"}</p>
                    <div className="rank-summary-grid">
                      {collection?.display_slots.map((slot) => (
                        <article className="rank-mini-card" key={slot.slot_id}>
                          <div className="province-head">
                            <strong>{slot.name}</strong>
                            <StatusBadge tone={slot.equipped_collection_id ? "success" : "neutral"}>
                              {slot.equipped_collection_id ? "已陈列" : "空位"}
                            </StatusBadge>
                          </div>
                          <p>{slot.equipped_name ?? "选择已归档收藏后可放入此处。"}</p>
                          <div className="mini-stats">
                            <span>
                              可放入 {slot.allowed_types.map(collectionTypeLabel).join(" / ")}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                </div>

                <div className="rank-summary-grid">
                  {eraMuseum?.featured_collections.map((item) => (
                    <article className="rank-mini-card" key={item.collection_id}>
                      <div className="province-head">
                        <strong>{item.name}</strong>
                        <StatusBadge tone="success">
                          {collectionTypeLabel(item.collection_type)}
                        </StatusBadge>
                      </div>
                      <p>{item.public_summary}</p>
                      <div className="mini-stats">
                        <span>{item.inherit_rule}</span>
                        <span>{item.duplicate_convert}</span>
                      </div>
                    </article>
                  )) ?? <p className="empty">博物志尚未生成。</p>}
                </div>

                <details className="event-boundary">
                  <summary>收藏规则</summary>
                  <span>收藏只继承展示、回看和纪念，不继承攻击、防御、掉落或贡献倍率。</span>
                </details>
              </section>
            ) : null}

            {activeTab === "events" ? (
              <section className="panel" aria-label="活动中心">
                <div className="section-title">
                  <h2>活动</h2>
                  <span>{activities?.claimable_count ?? 0} 个可领取 · 今日可做</span>
                </div>
                <div className="event-hero">
                  <div>
                    <strong>
                      {firstClaimableActivity?.name ?? firstActivity?.name ?? "活动中心"}
                    </strong>
                    <span>
                      {firstClaimableActivity
                        ? "已有奖励可领取"
                        : "按自己的节奏推进，达成目标后再领取奖励"}
                    </span>
                  </div>
                  <StatusBadge tone={firstClaimableActivity ? "success" : "neutral"}>
                    {firstClaimableActivity ? "可领取" : "进行中"}
                  </StatusBadge>
                </div>
                <div className="event-grid">
                  {activities?.events.map((activity) => (
                    <article className="event-card" key={activity.event_instance_id}>
                      <div className="province-head">
                        <strong>{activity.name}</strong>
                        <StatusBadge tone={activity.claimable ? "success" : "neutral"}>
                          {activity.claimable ? "可领取" : activityStatusLabel(activity.status)}
                        </StatusBadge>
                      </div>
                      <p>{playerFacingActivityDescription(activity)}</p>
                      <div className="event-progress">
                        <span>
                          进度 {activity.progress}/{activity.target_progress}
                        </span>
                        <span>奖励 {rewardStateLabel(activity.reward_state)}</span>
                      </div>
                      <div className="mini-stats">
                        <span>{activity.async_enabled ? "今日可做" : "限时开启"}</span>
                        <span>{formatShortDate(activity.settlement_at)} 统一发放</span>
                      </div>
                      <div className="production-actions">
                        {!activity.claimable && activity.progress < activity.target_progress ? (
                          <Button disabled={busy} onClick={() => handleSubmitActivity(activity)}>
                            {activity.action_label}
                          </Button>
                        ) : null}
                        {activity.claimable ? (
                          <Button disabled={busy} onClick={() => handleClaimActivity(activity)}>
                            领取
                          </Button>
                        ) : null}
                      </div>
                      {!activity.claimable && activity.progress >= activity.target_progress ? (
                        <span className="action-note">
                          {rewardStateLabel(activity.reward_state)}
                        </span>
                      ) : null}
                    </article>
                  )) ?? <p>活动中心尚未读取</p>}
                </div>
                <details className="event-boundary">
                  <summary>玩法说明</summary>
                  <span>活动奖励以绑定材料、荣誉和展示外观为主。</span>
                </details>
              </section>
            ) : null}

            {activeTab === "growth" ? (
              <section className="panel" aria-label="生产成长">
                <div className="section-title">
                  <h2>成长</h2>
                  <span>炼丹、炼器、背包与技能预设</span>
                </div>
                <div className="production-grid">
                  <article className="production-box production-choice">
                    <strong>丹方炼制</strong>
                    <span>
                      {selectedAlchemyRecipe
                        ? `${selectedAlchemyRecipe.name} · 成功率 ${formatRate(
                            selectedAlchemyRecipe.success_rate,
                          )} · 灵石 ${selectedAlchemyRecipe.spirit_stone_cost}`
                        : "暂无可用丹方"}
                    </span>
                    {selectedAlchemyRecipe?.recommendation ? (
                      <ProductionRecommendationView
                        recommendation={selectedAlchemyRecipe.recommendation}
                      />
                    ) : null}
                    {alchemyRecipes?.recipes.length ? (
                      <label className="choice-field">
                        <span>选择丹方</span>
                        <select
                          disabled={busy}
                          onChange={(event) => setSelectedAlchemyRecipeId(event.target.value)}
                          value={selectedAlchemyRecipe?.recipe_id ?? ""}
                        >
                          {alchemyRecipes.recipes.map((recipe) => (
                            <option key={recipe.recipe_id} value={recipe.recipe_id}>
                              {recipe.name} ·{" "}
                              {recipe.route === "all"
                                ? "通用"
                                : cultivationRouteLabels[recipe.route]}{" "}
                              ·{" "}
                              {recipe.materials
                                .map((item) => `${item.name}x${item.count}`)
                                .join("、")}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="action-note">暂无可用丹方</span>
                    )}
                    <div className="production-actions">
                      {(selectedAlchemyRecipe?.recommendation?.can_craft ??
                      selectedAlchemyRecipe) ? (
                        <Button disabled={busy} onClick={handleCraftAlchemy}>
                          炼制所选丹方
                        </Button>
                      ) : null}
                    </div>
                    {selectedAlchemyRecipe?.recommendation &&
                    !selectedAlchemyRecipe.recommendation.can_craft ? (
                      <span className="action-note">
                        {formatMaterialGaps(selectedAlchemyRecipe.recommendation.material_gaps)}
                      </span>
                    ) : null}
                  </article>
                  <article className="production-box production-choice">
                    <strong>服用丹药</strong>
                    <span>
                      {selectedPill
                        ? `${selectedPill.name} x${selectedPill.count} · 服用后按同阶递减`
                        : "背包中暂无可服用丹药"}
                    </span>
                    {availablePills.length ? (
                      <label className="choice-field">
                        <span>选择丹药</span>
                        <select
                          disabled={busy}
                          onChange={(event) => setSelectedPillItemInstanceId(event.target.value)}
                          value={selectedPill?.item_instance_id ?? ""}
                        >
                          {availablePills.map((item) => (
                            <option key={item.item_instance_id} value={item.item_instance_id}>
                              {item.name} x{item.count}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="action-note">暂无可服丹药</span>
                    )}
                    <div className="production-actions">
                      {selectedPill ? (
                        <Button disabled={busy} onClick={handleUsePill}>
                          服用所选丹药
                        </Button>
                      ) : null}
                    </div>
                  </article>
                  <article className="production-box production-choice">
                    <strong>法宝炼器</strong>
                    <span>
                      {selectedForgeRecipe
                        ? `${selectedForgeRecipe.name} · ${equipmentRarityLabel(
                            selectedForgeRecipe.rarity,
                          )} · 灵石 ${selectedForgeRecipe.spirit_stone_cost}`
                        : `已有 ${equipment?.equipments.length ?? 0} 件 · 炼器不产出九大古宝`}
                    </span>
                    {selectedForgeRecipe?.recommendation ? (
                      <ProductionRecommendationView
                        recommendation={selectedForgeRecipe.recommendation}
                      />
                    ) : null}
                    {forgeRecipes?.recipes.length ? (
                      <label className="choice-field">
                        <span>选择配方</span>
                        <select
                          disabled={busy}
                          onChange={(event) => setSelectedForgeRecipeId(event.target.value)}
                          value={selectedForgeRecipe?.recipe_id ?? ""}
                        >
                          {forgeRecipes.recipes.map((recipe) => (
                            <option key={recipe.recipe_id} value={recipe.recipe_id}>
                              {recipe.name} ·{" "}
                              {recipe.route === "all"
                                ? "通用"
                                : cultivationRouteLabels[recipe.route]}{" "}
                              · {equipmentRarityLabel(recipe.rarity)} ·{" "}
                              {recipe.materials
                                .map((item) => `${item.name}x${item.count}`)
                                .join("、")}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="action-note">暂无可用炼器配方</span>
                    )}
                    <div className="production-actions">
                      {(selectedForgeRecipe?.recommendation?.can_craft ?? selectedForgeRecipe) ? (
                        <Button disabled={busy} onClick={handleCraftForge}>
                          炼制所选配方
                        </Button>
                      ) : null}
                      {firstEquipment ? (
                        <Button disabled={busy} onClick={handleRefineEquipment}>
                          淬炼
                        </Button>
                      ) : null}
                    </div>
                    {!selectedForgeRecipe && !firstEquipment ? (
                      <span className="action-note">暂无可炼器配方或可淬炼法宝</span>
                    ) : null}
                    {selectedForgeRecipe?.recommendation &&
                    !selectedForgeRecipe.recommendation.can_craft ? (
                      <span className="action-note">
                        {formatMaterialGaps(selectedForgeRecipe.recommendation.material_gaps)}
                      </span>
                    ) : null}
                  </article>
                  <ActionBox
                    actions={
                      skills ? (
                        <Button disabled={busy} onClick={handleSaveSkillPreset}>
                          保存预设
                        </Button>
                      ) : null
                    }
                    actionNote={skills ? undefined : "技能配置尚未读取"}
                    detail={`主动 ${skills?.active_skill_ids.length ?? 0}/3 · 本命 ${skillName(skills, skills?.treasure_skill_id)}`}
                    title="技能"
                  />
                </div>
                <section className="inner-world-panel" id="inner-world" aria-label="内天地">
                  <div className="section-title">
                    <h2>内天地</h2>
                    <span>
                      {innerWorld?.state.unlocked
                        ? `等级 ${innerWorld.state.world_level} · 法则 ${innerWorld.state.law_exp}/${innerWorld.state.next_law_exp_required}`
                        : (innerWorld?.state.unlock_hint ?? "化神 / 神躯或第四章后开启")}
                    </span>
                  </div>
                  <div className="inner-world-layout">
                    <article className="inner-world-summary">
                      <strong>{innerWorld?.state.unlocked ? "洞天已开" : "暂未开启"}</strong>
                      <span>
                        派驻 {innerWorld?.state.active_assignment_count ?? 0}/
                        {innerWorld?.state.assignment_limit ?? 0} · 可收{" "}
                        {innerWorld?.state.claimable_assignment_count ?? 0}
                      </span>
                      <span>
                        支援 {innerWorld?.state.support_count_today ?? 0}/
                        {innerWorld?.state.support_limit_daily ?? 0} · 容量{" "}
                        {innerWorld?.state.creature_capacity ?? 0}
                      </span>
                      <div className="production-actions">
                        {innerWorld?.state.unlocked && firstUnlockedProvince ? (
                          <Button disabled={busy} onClick={handleInnerWorldDispatch}>
                            派驻
                          </Button>
                        ) : null}
                        {innerWorld?.state.unlocked &&
                        (innerWorld?.state.claimable_assignment_count ?? 0) > 0 ? (
                          <Button disabled={busy} onClick={handleInnerWorldClaim}>
                            收取
                          </Button>
                        ) : null}
                        {innerWorld?.state.unlocked ? (
                          <Button disabled={busy} onClick={handleInnerWorldUpgradeWorld}>
                            升级洞天
                          </Button>
                        ) : null}
                        {innerWorld?.state.unlocked && firstInnerCreature ? (
                          <Button disabled={busy} onClick={handleInnerWorldUpgradeCreature}>
                            培养生灵
                          </Button>
                        ) : null}
                        {innerWorld?.state.unlocked && firstUnlockedProvince ? (
                          <Button disabled={busy} onClick={handleInnerWorldSupport}>
                            九州支援
                          </Button>
                        ) : null}
                      </div>
                      {!innerWorld?.state.unlocked ? (
                        <span className="action-note">
                          {innerWorld?.state.unlock_hint ?? "内天地尚未开启"}
                        </span>
                      ) : null}
                    </article>
                    <div className="inner-world-lists">
                      <div>
                        <strong>生灵</strong>
                        {innerWorld?.creatures.map((creature) => (
                          <p key={creature.creature_id}>
                            {creature.name} · {creatureStatusLabel(creature.status)} · 等级{" "}
                            {creature.level}
                          </p>
                        )) ?? <p>未读取生灵</p>}
                      </div>
                      <div>
                        <strong>派驻队列</strong>
                        {innerWorld?.assignments.length ? (
                          innerWorld.assignments.slice(0, 4).map((assignment) => (
                            <p key={assignment.assignment_id}>
                              {assignment.creature_name} 至 {assignment.province_name} ·{" "}
                              {assignment.status === "active"
                                ? formatRemainingSeconds(assignment.remaining_seconds)
                                : assignmentStatusLabel(assignment.status)}
                            </p>
                          ))
                        ) : (
                          <p>暂无派驻</p>
                        )}
                      </div>
                      <div>
                        <strong>最近法则</strong>
                        {innerWorld?.recent_law_records.length ? (
                          innerWorld.recent_law_records.slice(0, 3).map((record) => (
                            <p key={record.law_record_id}>
                              {sourceTypeLabel(record.source_type)} · 经验{" "}
                              {record.exp_delta >= 0 ? "+" : ""}
                              {record.exp_delta}
                            </p>
                          ))
                        ) : (
                          <p>暂无记录</p>
                        )}
                      </div>
                      <div>
                        <strong>洞天收获</strong>
                        <p>洞天主要带回绑定材料和法则经验，适合补足日常养成。</p>
                      </div>
                    </div>
                  </div>
                </section>
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
                      selectedTower ? (
                        <Button disabled={busy} onClick={handleTowerAction}>
                          镇封提交
                        </Button>
                      ) : null
                    }
                    actionNote={selectedTower ? undefined : "九塔状态尚未读取"}
                    detail={`${selectedTower ? `${provinceNameById(overview?.provinces, selectedTower.province_id)} · ${selectedTower.tower_name}` : "未读取"} · 完整度 ${selectedTower?.integrity ?? 0} · 镇封 ${selectedTower?.seal_progress ?? 0}`}
                    title="九塔"
                  />
                  <ActionBox
                    actions={
                      boss ? (
                        <Button disabled={busy} onClick={handleChallengeBoss}>
                          镜像挑战
                        </Button>
                      ) : null
                    }
                    actionNote={boss ? undefined : "公共 Boss 尚未读取"}
                    detail={`${boss?.boss.name ?? "未读取"} · 阶段 ${boss?.boss.phase ?? 0} · 血量 ${boss?.boss.remaining_hp ?? 0}/${boss?.boss.total_hp ?? 0}`}
                    title="公共 Boss"
                  />
                  <ActionBox
                    actions={
                      <>
                        {!sect?.sect ? (
                          <Button disabled={busy} onClick={handleCreateSect}>
                            创建宗门
                          </Button>
                        ) : null}
                        {sect?.sect ? (
                          <Button disabled={busy} onClick={handleSectTask}>
                            宗门任务
                          </Button>
                        ) : null}
                        {sect?.sect && firstWarehouseDepositItem ? (
                          <Button disabled={busy} onClick={handleSectWarehouseDeposit}>
                            入库材料
                          </Button>
                        ) : null}
                        {sect?.sect && firstWarehouseItem ? (
                          <Button disabled={busy} onClick={handleSectWarehouseWithdraw}>
                            取用材料
                          </Button>
                        ) : null}
                      </>
                    }
                    actionNote={
                      sect?.sect
                        ? !firstWarehouseDepositItem && !firstWarehouseItem
                          ? "暂无可流转的宗门仓库材料"
                          : undefined
                        : "未入宗门，可先创建宗门"
                    }
                    detail={
                      sect?.sect
                        ? `${sect.sect.name} · 周贡献 ${sect.sect.my_contribution_weekly} · 仓库 ${
                            sect.warehouse.length
                          } 类`
                        : "未入宗门"
                    }
                    title="宗门"
                  />
                  <ActionBox
                    actions={
                      pvpTarget ? (
                        <Button disabled={busy} onClick={handlePvpAttack}>
                          发起争夺
                        </Button>
                      ) : null
                    }
                    actionNote={pvpTarget ? undefined : "暂无可用 PVP 目标"}
                    detail={`资源点 ${firstResourcePoint?.name ?? "未读取"} · 个人榜 ${personalRank?.entries.length ?? 0} 人`}
                    title="PVP 与排行"
                  />
                </div>
                <section className="rank-panel" aria-label="高级社交">
                  <div className="section-title">
                    <h2>高级社交</h2>
                    <span>导师、宗门外交与跨宗门雇佣都可异步处理</span>
                  </div>
                  <div className="production-grid">
                    <ActionBox
                      actions={
                        <>
                          {pendingMentorReview ? (
                            <>
                              <Button
                                disabled={busy}
                                onClick={() => handleReviewMentor(pendingMentorReview, "accept")}
                              >
                                同意拜师
                              </Button>
                              <Button
                                disabled={busy}
                                onClick={() => handleReviewMentor(pendingMentorReview, "reject")}
                              >
                                婉拒
                              </Button>
                            </>
                          ) : null}
                          {activeMentorRelation && !mentorTaskClaimed(activeMentorRelation) ? (
                            <Button disabled={busy} onClick={handleClaimMentorTask}>
                              领指点
                            </Button>
                          ) : null}
                          {activeMentorRelation && mentorTaskClaimed(activeMentorRelation) ? (
                            <Button disabled={busy} onClick={handleGraduateMentor}>
                              出师
                            </Button>
                          ) : null}
                          {!pendingMentorReview &&
                          !activeMentorRelation &&
                          !pendingMentorApply &&
                          mentorCandidate ? (
                            <Button disabled={busy} onClick={handleApplyMentor}>
                              拜访导师
                            </Button>
                          ) : null}
                        </>
                      }
                      actionNote={
                        pendingMentorReview
                          ? `${pendingMentorReview.apprentice_name} 正等待回应`
                          : activeMentorRelation
                            ? `导师 ${activeMentorRelation.mentor_name} · ${mentorRelationStatusLabel(
                                activeMentorRelation.status,
                              )}`
                            : pendingMentorApply
                              ? `已向 ${pendingMentorApply.mentor_name} 递交拜师帖`
                              : mentorCandidate
                                ? undefined
                                : "暂无可拜访导师，可先完成排行或邀请道友加入"
                      }
                      detail={
                        activeMentorRelation
                          ? `${activeMentorRelation.mentor_name} 指点中 · ${
                              mentorTaskClaimed(activeMentorRelation) ? "可出师" : "可领指点"
                            }`
                          : pendingMentorApply
                            ? `等待 ${pendingMentorApply.mentor_name} 审批`
                            : pendingMentorReview
                              ? `${pendingMentorReview.apprentice_name} 请求拜师`
                              : `候选 ${mentorCandidate?.display_name ?? "暂无"}`
                      }
                      title="导师"
                    />
                    <ActionBox
                      actions={
                        <>
                          {diplomacyReview ? (
                            <>
                              <Button
                                disabled={busy}
                                onClick={() => handleReviewDiplomacy("accept")}
                              >
                                同意提案
                              </Button>
                              <Button
                                disabled={busy}
                                onClick={() => handleReviewDiplomacy("reject")}
                              >
                                回绝
                              </Button>
                            </>
                          ) : null}
                          {!diplomacyReview && canProposeDiplomacy && diplomacyTargetSect ? (
                            <Button disabled={busy} onClick={handleProposeDiplomacy}>
                              发起盟约
                            </Button>
                          ) : null}
                        </>
                      }
                      actionNote={
                        diplomacyReview
                          ? `${diplomacyReview.source_sect_name} 请求${sectDiplomacyTypeLabel(
                              diplomacyReview.diplomacy_type,
                            )}`
                          : !sect?.sect
                            ? "未入宗门，暂不可发起外交"
                            : !canProposeDiplomacy
                              ? "需要宗主或长老权限"
                              : diplomacyTargetSect
                                ? undefined
                                : "暂无其他宗门目标"
                      }
                      detail={
                        diplomacy?.records[0]
                          ? `${sectDiplomacyTypeLabel(
                              diplomacy.records[0].diplomacy_type,
                            )} · ${sectDiplomacyStatusLabel(diplomacy.records[0].status)}`
                          : `目标 ${diplomacyTargetSect?.name ?? "暂无"}`
                      }
                      title="宗门外交"
                    />
                    <ActionBox
                      actions={
                        <>
                          {acceptedHire ? (
                            <Button
                              disabled={busy}
                              onClick={() => handleSettleSectHire(acceptedHire)}
                            >
                              结算雇佣
                            </Button>
                          ) : null}
                          {!acceptedHire && openHire ? (
                            <Button disabled={busy} onClick={() => handleAcceptSectHire(openHire)}>
                              接取雇佣
                            </Button>
                          ) : null}
                          {!acceptedHire && !openHire && canCreateHire ? (
                            <Button disabled={busy} onClick={handleCreateSectHire}>
                              发布雇佣
                            </Button>
                          ) : null}
                        </>
                      }
                      actionNote={
                        acceptedHire
                          ? `来自 ${acceptedHire.employer_sect_name}，可结算普通酬劳`
                          : openHire
                            ? `${openHire.employer_sect_name} 发布了${sectHireTypeLabel(
                                openHire.hire_type,
                              )}`
                            : !sect?.sect
                              ? "未入宗门，暂不可参与雇佣"
                              : !canCreateHire
                                ? "发布雇佣需要执事以上权限"
                                : "暂无外部委托，可发布一条探索协助"
                      }
                      detail={
                        acceptedHire
                          ? `${sectHireTypeLabel(acceptedHire.hire_type)} · ${sectHireStatusLabel(
                              acceptedHire.status,
                            )}`
                          : openHire
                            ? `${sectHireTypeLabel(openHire.hire_type)} · ${sectHireStatusLabel(
                                openHire.status,
                              )}`
                            : `本宗委托 ${hireList?.my_hires.length ?? 0} · 可接 ${
                                hireList?.open_hires.length ?? 0
                              }`
                      }
                      title="跨宗门雇佣"
                    />
                  </div>
                  <p className="action-note">
                    社交协作只记录指导、盟约和普通酬劳，不转移付费资产、九大古宝或唯一战力道具。
                  </p>
                </section>
                <section className="faction-panel" aria-label="仙魔散修路线">
                  <div className="section-title">
                    <h2>仙魔散修</h2>
                    <span>{faction?.state.unlock_hint ?? "化神 / 神躯或第五章后开启"}</span>
                  </div>
                  <div className="faction-layout">
                    <article className="faction-state-card">
                      <div className="province-head">
                        <strong>{faction?.state.route_name ?? "未定"}</strong>
                        <StatusBadge
                          tone={
                            faction?.state.sect_conflict
                              ? "warning"
                              : faction?.state.unlocked
                                ? "success"
                                : "neutral"
                          }
                        >
                          {faction?.state.sect_conflict
                            ? "宗门冲突"
                            : faction?.state.unlocked
                              ? "已开启"
                              : "未开启"}
                        </StatusBadge>
                      </div>
                      <span>
                        仙盟 {faction?.state.reputation.immortal ?? 0} · 魔宗{" "}
                        {faction?.state.reputation.demon ?? 0} · 散修{" "}
                        {faction?.state.reputation.wanderer ?? 0}
                      </span>
                      <span>
                        称号 {faction?.state.title_name ?? "未定"} · 史册{" "}
                        {faction?.state.chronicle_title ?? "未定"}
                      </span>
                      <p>
                        {faction?.state.sect_conflict_hint ??
                          faction?.state.ending_summary ??
                          "路线奖励以荣誉、展示外观和纪元记录为主。"}
                      </p>
                      <div className="mini-stats">
                        <span>转道 {faction?.state.transfer_available ? "可用" : "冷却/未定"}</span>
                        <span>次数 {faction?.state.transfer_count ?? 0}</span>
                      </div>
                    </article>
                    <div className="faction-route-list">
                      {availableFactionRoutes.map((routeConfig) => {
                        const currentRoute = faction?.state.route;
                        const canChoose =
                          faction?.state.unlocked === true && currentRoute === "undecided";
                        const canTransfer =
                          faction?.state.unlocked === true &&
                          currentRoute !== "undecided" &&
                          currentRoute !== routeConfig.route_id &&
                          faction.state.transfer_available;

                        return (
                          <article className="faction-route-card" key={routeConfig.route_id}>
                            <div>
                              <strong>{routeConfig.name}</strong>
                              <span>{routeConfig.stance_label}</span>
                            </div>
                            <p>{routeConfig.core_goal}</p>
                            <span>{routeConfig.weekly_focus.join(" / ")}</span>
                            <div className="production-actions">
                              {canChoose ? (
                                <Button
                                  disabled={busy}
                                  onClick={() => handleChooseFactionRoute(routeConfig)}
                                >
                                  选择
                                </Button>
                              ) : null}
                              {canTransfer ? (
                                <Button
                                  disabled={busy}
                                  onClick={() => handleTransferFactionRoute(routeConfig)}
                                >
                                  转道
                                </Button>
                              ) : null}
                            </div>
                            {!canChoose && !canTransfer ? (
                              <span className="action-note">
                                {faction?.state.unlocked ? "当前路线不可操作" : "路线系统尚未开启"}
                              </span>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </section>
                <section className="rank-panel" aria-label="完整排行与称号">
                  <div className="section-title">
                    <h2>排行与称号</h2>
                    <span>
                      已继承 {titles?.era_blessing.owned_inherited_count ?? 0} 个 · 祝福{" "}
                      {titles?.era_blessing.effective_percent ?? 0}%/
                      {titles?.era_blessing.blessing_cap_percent ?? 1}%
                    </span>
                  </div>
                  <div className="rank-summary-grid">
                    <RankMiniPanel rank={eraRank} title="纪元榜" />
                    <RankMiniPanel rank={productionRank} title="生产榜" />
                    <RankMiniPanel rank={innerWorldRank} title="内天地榜" />
                    <RankMiniPanel rank={factionRank} title="阵营榜" />
                  </div>
                  <div className="title-claim-row">
                    <span>排行称号以荣誉、展示外观和纪元收藏为主。</span>
                    <div className="production-actions">
                      {eraRank?.entries.length ? (
                        <Button disabled={busy} onClick={() => handleClaimRankTitle("era")}>
                          领纪元称号
                        </Button>
                      ) : null}
                      {productionRank?.entries.length ? (
                        <Button disabled={busy} onClick={() => handleClaimRankTitle("production")}>
                          领生产称号
                        </Button>
                      ) : null}
                      {innerWorldRank?.entries.length ? (
                        <Button disabled={busy} onClick={() => handleClaimRankTitle("inner_world")}>
                          领洞天称号
                        </Button>
                      ) : null}
                      {factionRank?.entries.length ? (
                        <Button disabled={busy} onClick={() => handleClaimRankTitle("faction")}>
                          领阵营称号
                        </Button>
                      ) : null}
                    </div>
                    {!eraRank?.entries.length &&
                    !productionRank?.entries.length &&
                    !innerWorldRank?.entries.length &&
                    !factionRank?.entries.length ? (
                      <span className="action-note">暂无可领取排行称号</span>
                    ) : null}
                  </div>
                </section>
                <div className="tower-grid" aria-label="九塔全域状态">
                  {towers?.towers.map((tower) => (
                    <article className="tower-card" key={tower.tower_id}>
                      <div className="province-head">
                        <strong>
                          {provinceNameById(overview?.provinces, tower.province_id)} ·{" "}
                          {tower.tower_name}
                        </strong>
                        <StatusBadge tone={tower.corruption > 60 ? "warning" : "neutral"}>
                          阶段 {tower.phase}
                        </StatusBadge>
                      </div>
                      <span>
                        {tower.boss_name} · {tower.material_name}
                      </span>
                      <p>{tower.mechanism}</p>
                      <div className="mini-stats">
                        <span>完整 {tower.integrity}</span>
                        <span>镇封 {tower.seal_progress}</span>
                        <span>魔染 {tower.corruption}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeTab === "market" ? (
              <section className="panel" aria-label="市肆权益">
                <div className="section-title">
                  <h2>市肆</h2>
                  <span>月卡、机缘、便利权益与展示外观</span>
                </div>
                <div className="production-grid">
                  <ActionBox
                    actions={
                      overview ? (
                        <>
                          <Button
                            disabled={busy}
                            onClick={() => handlePurchaseMonthly("small_monthly")}
                          >
                            小月卡
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => handlePurchaseMonthly("large_monthly")}
                          >
                            大月卡
                          </Button>
                          {smallMonthlyState.canClaim ? (
                            <Button
                              disabled={busy}
                              onClick={() => handleClaimMonthly("small_monthly")}
                            >
                              领小月卡
                            </Button>
                          ) : null}
                          {largeMonthlyState.canClaim ? (
                            <Button
                              disabled={busy}
                              onClick={() => handleClaimMonthly("large_monthly")}
                            >
                              领大月卡
                            </Button>
                          ) : null}
                        </>
                      ) : null
                    }
                    actionNote={
                      overview
                        ? `${smallMonthlyState.label} · ${largeMonthlyState.label}`
                        : "角色状态尚未读取"
                    }
                    detail={`当前 ${commerceTierLabel(commerce?.effective_tier)} · 古宝赠抽 ${
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
                        {firstAncientGrant ? (
                          <Button disabled={busy} onClick={handleDrawAncientTreasure}>
                            赠抽古宝
                          </Button>
                        ) : null}
                        {overview ? (
                          <Button disabled={busy} onClick={handleDrawPermanent}>
                            常驻机缘
                          </Button>
                        ) : null}
                      </>
                    }
                    actionNote={firstAncientGrant ? undefined : "当前无可领取赠抽"}
                    detail={`已收集 ${ownedTreasureCount}/9 · ${
                      gachaPools?.pools
                        .find((pool) => pool.pool_type === "ancient_treasure")
                        ?.allowed_cost_types.map(gachaCostTypeLabel)
                        .join(" / ") ?? "月卡赠抽 / 残页合成"
                    }`}
                    title="九大古宝"
                  />
                  {showDevelopmentActions ? (
                    <ActionBox
                      actions={
                        overview ? (
                          <>
                            <Button disabled={busy} onClick={() => handleSyncVip(3)}>
                              切换 VIP3
                            </Button>
                            <Button disabled={busy} onClick={() => handleSyncVip(4)}>
                              切换 VIP4
                            </Button>
                            <Button disabled={busy} onClick={handleBatchPreview}>
                              便利预览
                            </Button>
                            <Button disabled={busy} onClick={handleAutomationQueue}>
                              托管队列
                            </Button>
                          </>
                        ) : null
                      }
                      actionNote={
                        overview ? "仅调试环境显示，用于验收权益队列" : "角色状态尚未读取"
                      }
                      detail={`VIP ${commerce?.vip.vip_level ?? 0} · 批量上限 ${
                        commerce?.convenience.batch_sweep_limit ?? 5
                      } · 当前权益 ${commerceTierLabel(commerce?.effective_tier)}`}
                      title="调试：便利权益"
                    />
                  ) : (
                    <article className="production-box">
                      <strong>便利权益</strong>
                      <span>
                        VIP {commerce?.vip.vip_level ?? 0} · 批量上限{" "}
                        {commerce?.convenience.batch_sweep_limit ?? 5} · 当前权益{" "}
                        {commerceTierLabel(commerce?.effective_tier)}
                      </span>
                      <span className="action-note">
                        月卡或 VIP 状态会自动带来批量扫荡、预设队列等便利。
                      </span>
                    </article>
                  )}
                  <ActionBox
                    actions={
                      currentTransferRequest ? (
                        currentTransferRequest.status === "submitted" ||
                        currentTransferRequest.status === "reviewing" ? (
                          <Button disabled={busy} onClick={handleCancelTransferRequest}>
                            取消申请
                          </Button>
                        ) : null
                      ) : overview && transferStatus?.current_request === null ? (
                        <Button disabled={busy} onClick={handleCreateTransferRequest}>
                          提交申请
                        </Button>
                      ) : null
                    }
                    actionNote={
                      currentTransferRequest
                        ? `${transferRequestStatusLabel(
                            currentTransferRequest.status,
                          )} · 目标 ${currentTransferRequest.target_server_id}`
                        : "转服会先生成影响报告，并等待后台人工审核"
                    }
                    detail={
                      currentTransferRequest
                        ? `执行 ${currentTransferRequest.execute_status} · 排行冷却 ${
                            currentTransferRequest.rank_cooldown_until ? "已计算" : "未生成"
                          }`
                        : "默认目标 mvp_beta · 不会立即迁移资产"
                    }
                    title="转服申请"
                  />
                  <ActionBox
                    actions={
                      <>
                        {overview ? (
                          <Button disabled={busy} onClick={handleClaimAppearance}>
                            领取外观
                          </Button>
                        ) : null}
                        {appearances?.appearances.some((appearance) => appearance.owned) ? (
                          <Button disabled={busy} onClick={handleEquipAppearance}>
                            装备外观
                          </Button>
                        ) : null}
                      </>
                    }
                    actionNote={
                      appearances?.appearances.some((appearance) => appearance.owned)
                        ? undefined
                        : "暂无可装备外观"
                    }
                    detail={`已拥有 ${
                      appearances?.appearances.filter((appearance) => appearance.owned).length ?? 0
                    } · 不提供战力`}
                    title="展示外观"
                  />
                </div>
                <section className="rank-panel" aria-label="深度外观编辑">
                  <div className="section-title">
                    <h2>深度外观</h2>
                    <span>名片、战报、洞府与宗门驻地预览</span>
                  </div>
                  <div className="rank-summary-grid">
                    {appearancePlus?.display_slots.map((slot) => (
                      <article className="rank-mini-card" key={slot.slot_id}>
                        <div className="province-head">
                          <strong>{slot.name}</strong>
                          <StatusBadge tone={slot.equipped_appearance_id ? "success" : "neutral"}>
                            {slot.equipped_appearance_id ? "已装备" : "空位"}
                          </StatusBadge>
                        </div>
                        <p>{slot.equipped_name ?? "选择已拥有外观后可装备到此处。"}</p>
                        <div className="mini-stats">
                          <span>
                            可放入 {slot.allowed_types.map(appearancePlusTypeLabel).join(" / ")}
                          </span>
                        </div>
                      </article>
                    )) ?? <p className="empty">外观展示栏尚未读取。</p>}
                  </div>
                  <div className="event-grid">
                    {appearancePlus?.appearances.map((appearance) => (
                      <article
                        className={appearance.owned ? "event-card" : "event-card muted"}
                        key={appearance.appearance_id}
                      >
                        <div className="province-head">
                          <strong>{appearance.name}</strong>
                          <StatusBadge tone={appearance.equipped ? "success" : "neutral"}>
                            {appearance.equipped
                              ? "已装备"
                              : appearance.owned
                                ? "已拥有"
                                : "待获得"}
                          </StatusBadge>
                        </div>
                        <p>{appearance.preview.subtitle}</p>
                        <div className="mini-stats">
                          <span>{appearance.preview.sample_text}</span>
                          <span>
                            {appearance.preview.display_positions.join(" / ")} ·{" "}
                            {appearancePlusTypeLabel(appearance.appearance_type)}
                          </span>
                        </div>
                        <div className="production-actions">
                          {appearance.owned &&
                          appearance.permission.can_equip &&
                          !appearance.equipped ? (
                            <Button
                              disabled={busy}
                              onClick={() => handleEquipAppearancePlus(appearance)}
                            >
                              装备到{appearancePlusSlotLabel(appearance.display_slot)}
                            </Button>
                          ) : null}
                        </div>
                        {!appearance.owned || !appearance.permission.can_equip ? (
                          <span className="action-note">
                            {appearance.permission.reason ?? appearance.source_hint}
                          </span>
                        ) : null}
                      </article>
                    )) ?? <p className="empty">深度外观目录尚未读取。</p>}
                  </div>
                  <details className="event-boundary">
                    <summary>外观规则</summary>
                    <span>外观只改变名片、战报、洞府、宗门驻地和史册展示，不提高战力或贡献。</span>
                  </details>
                </section>
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
                      <BattleReportCard battle={battle} key={battle.battle_id} />
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
                onClick={() => handleTabChange(item.key)}
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

function ExperiencePanel({ experience }: { experience: ExperiencePayload }) {
  const playerTags = filterPlayerFacingExperienceTags(experience.reason_tags);
  const systemTags = filterSystemExperienceTags(experience.reason_tags);

  return (
    <section className="experience-panel" aria-label="结算详情">
      <div className="section-title">
        <div>
          <h2>结算详情</h2>
          <span>{experience.title}</span>
        </div>
        <StatusBadge tone="neutral">过程</StatusBadge>
      </div>
      <p className="experience-summary">{experience.summary}</p>
      <div className="experience-layout">
        <ol className="experience-timeline">
          {experience.timeline.map((entry) => (
            <li className={`experience-step tone-${entry.tone ?? "neutral"}`} key={entry.step}>
              <span>{entry.step}</span>
              <div>
                <strong>{entry.title}</strong>
                <p>{entry.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <aside className="experience-side">
          <div className="delta-grid">
            {experience.delta_summary.map((item) => (
              <div className="delta-item" key={`${item.label}-${item.after ?? item.delta}`}>
                <span>{item.label}</span>
                <strong>{formatDeltaValue(item)}</strong>
              </div>
            ))}
          </div>
          {playerTags.length ? (
            <div className="reason-tags">
              {playerTags.map((tag) => (
                <span className={`reason-tag tone-${tag.tone ?? "neutral"}`} key={tag.code}>
                  {experienceReasonTagDisplayLabel(tag)}
                </span>
              ))}
            </div>
          ) : null}
          {systemTags.length ? (
            <details className="experience-rules">
              <summary>规则说明</summary>
              <div className="reason-tags">
                {systemTags.map((tag) => (
                  <span className="reason-tag tone-neutral" key={tag.code}>
                    {systemExperienceTagLabel(tag)}
                  </span>
                ))}
              </div>
            </details>
          ) : null}
          <div className="recommendation-list">
            {experience.next_recommendations.map((item) => (
              <article key={`${item.label}-${item.action_hint ?? "none"}`}>
                <strong>{item.label}</strong>
                <span>{item.reason}</span>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function LedgerExperienceDetails({ experience }: { experience: ExperiencePayload }) {
  const playerTags = filterPlayerFacingExperienceTags(experience.reason_tags);
  const systemTags = filterSystemExperienceTags(experience.reason_tags);
  const visibleSteps = experience.timeline.slice(0, 3);
  const hiddenStepCount = Math.max(0, experience.timeline.length - visibleSteps.length);

  return (
    <article className="ledger-experience" aria-label="结算详情">
      <div className="province-head">
        <strong>结算详情</strong>
        <StatusBadge tone="neutral">过程</StatusBadge>
      </div>
      <span>{experience.title}</span>
      <p>{experience.summary}</p>
      {visibleSteps.length ? (
        <ol className="ledger-timeline">
          {visibleSteps.map((entry) => (
            <li key={entry.step}>
              <strong>{entry.title}</strong>
              <span>{entry.description}</span>
            </li>
          ))}
          {hiddenStepCount ? <li>其余 {hiddenStepCount} 步已按当前策略结算。</li> : null}
        </ol>
      ) : null}
      {playerTags.length ? (
        <div className="reason-tags">
          {playerTags.map((tag) => (
            <span className={`reason-tag tone-${tag.tone ?? "neutral"}`} key={tag.code}>
              {experienceReasonTagDisplayLabel(tag)}
            </span>
          ))}
        </div>
      ) : null}
      {systemTags.length ? (
        <details className="experience-rules">
          <summary>规则说明</summary>
          <div className="reason-tags">
            {systemTags.map((tag) => (
              <span className="reason-tag tone-neutral" key={tag.code}>
                {systemExperienceTagLabel(tag)}
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function MainlineGuideCard({ guide }: { guide: MainlineGuide }) {
  const currentStep =
    guide.steps.find((step) => step.status === "active") ??
    guide.steps.find((step) => step.status === "pending") ??
    guide.steps.at(-1);

  return (
    <section className="mainline-guide" aria-label="主线目标">
      <div className="mainline-guide-head">
        <div>
          <span>第 {guide.chapterId} 章</span>
          <strong>{guide.title}</strong>
          <p>{guide.subtitle}</p>
        </div>
        <div className="mainline-progress-summary">
          <strong>{guide.progressText}</strong>
          <span>主线完成度</span>
        </div>
      </div>
      <div aria-hidden="true" className="mainline-progress-bar">
        <span style={{ width: `${guide.progressPercent}%` }} />
      </div>
      {currentStep ? (
        <article className={`mainline-current-step status-${currentStep.status}`}>
          <div>
            <strong>{currentStep.title}</strong>
            <span>{currentStep.detail}</span>
          </div>
          <StatusBadge tone={mainlineStepTone(currentStep.status)}>
            {mainlineStepStatusLabel(currentStep.status)}
          </StatusBadge>
        </article>
      ) : null}
      <div className="mainline-step-list mainline-step-list-desktop">
        {guide.steps.map((step) => (
          <MainlineStepCard key={step.id} step={step} />
        ))}
      </div>
      <details className="mainline-steps-drawer">
        <summary>查看完整主线</summary>
        <div className="mainline-step-list mainline-step-list-mobile">
          {guide.steps.map((step) => (
            <MainlineStepCard key={step.id} step={step} />
          ))}
        </div>
      </details>
      <div className="mainline-action-row">
        <span>{guide.primaryHint}</span>
        <Button disabled={guide.primaryDisabled} onClick={guide.onPrimary}>
          {guide.primaryLabel}
        </Button>
      </div>
    </section>
  );
}

function MainlineStepCard({ step }: { step: MainlineStep }) {
  return (
    <article className={`mainline-step status-${step.status}`}>
      <div>
        <strong>{step.title}</strong>
        <span>{step.detail}</span>
      </div>
      <StatusBadge tone={mainlineStepTone(step.status)}>
        {mainlineStepStatusLabel(step.status)}
      </StatusBadge>
    </article>
  );
}

function DailyGoalCard({ goal }: { goal: DailyGoal }) {
  return (
    <article className={`goal-card tone-${goal.tone}`}>
      <div>
        <div className="province-head">
          <strong>{goal.title}</strong>
          <StatusBadge tone={toBadgeTone(goal.tone)}>{goal.status}</StatusBadge>
        </div>
        <p>{goal.detail}</p>
      </div>
      {goal.actionUnavailableReason ? (
        <span className="action-note">{goal.actionUnavailableReason}</span>
      ) : (
        <Button disabled={goal.disabled} onClick={goal.onAction}>
          {goal.actionLabel}
        </Button>
      )}
    </article>
  );
}

function GrowthTargetCard({ target }: { target: GrowthTarget }) {
  return (
    <article className="growth-target-card">
      <div>
        <strong>{target.title}</strong>
        <span>{target.detail}</span>
      </div>
      {target.actionUnavailableReason ? (
        <span className="action-note">{target.actionUnavailableReason}</span>
      ) : (
        <Button disabled={target.disabled} onClick={target.onAction}>
          {target.actionLabel}
        </Button>
      )}
    </article>
  );
}

function ProductionRecommendationView({
  recommendation,
}: {
  recommendation: NonNullable<AlchemyRecipeListResponse["recipes"][number]["recommendation"]>;
}) {
  const gaps = recommendation.material_gaps.filter((item) => item.missing > 0);

  return (
    <div className="production-recommendation">
      <div className="province-head">
        <strong>{recommendation.recommended ? "今日推荐" : "配方说明"}</strong>
        <StatusBadge tone={recommendation.can_craft ? "success" : "warning"}>
          {recommendation.can_craft ? "材料足够" : "材料缺口"}
        </StatusBadge>
      </div>
      <p>{recommendation.reason}</p>
      <span>{recommendation.result_hint}</span>
      <span>{recommendation.next_action_hint}</span>
      {gaps.length ? (
        <div className="recommendation-gaps">
          {gaps.map((gap) => (
            <span key={gap.item_id}>
              {gap.name} 缺 {gap.missing}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExploreQueueCard({
  busy,
  canClaim,
  explore,
  onClaim,
  remainingSeconds,
}: {
  busy: boolean;
  canClaim: boolean;
  explore: ExploreResponse | null;
  onClaim: () => void | Promise<void>;
  remainingSeconds: number;
}) {
  if (!explore) {
    return (
      <article className="explore-queue-card idle">
        <div>
          <strong>当前探索</strong>
          <span>选择州域和次数后开始探索，战斗与奖励会在完成后领取。</span>
        </div>
        <StatusBadge tone="neutral">空闲</StatusBadge>
      </article>
    );
  }

  const isClaimed = explore.status === "claimed";
  const isReady = canClaim && !isClaimed;

  return (
    <article className={`explore-queue-card ${isReady ? "ready" : ""}`}>
      <div>
        <strong>
          {explore.province_name}探索 · {explore.count} 次
        </strong>
        <span>
          {isClaimed
            ? `最近完成于 ${formatShortDate(explore.claimed_at ?? explore.completes_at)}，已生成 ${
                explore.battles.length
              } 场战报。`
            : `单次 ${explore.seconds_per_explore} 秒，总计 ${formatRemainingSeconds(
                explore.total_seconds,
              )}，${isReady ? "现在可领取" : `剩余 ${formatRemainingSeconds(remainingSeconds)}`}。`}
        </span>
      </div>
      {isClaimed ? (
        <StatusBadge tone="success">已领取</StatusBadge>
      ) : isReady ? (
        <Button disabled={busy || !isReady} onClick={onClaim}>
          领取探索
        </Button>
      ) : (
        <StatusBadge tone="neutral">{exploreStatusLabel(explore.status)}</StatusBadge>
      )}
    </article>
  );
}

function ExploreEventCard({
  busy,
  event,
  onResolve,
}: {
  busy: boolean;
  event: ExploreEventState | undefined;
  onResolve: (event: ExploreEventState, choiceId: string) => void | Promise<void>;
}) {
  if (!event) {
    return (
      <article className="explore-event-card idle">
        <div>
          <strong>探索奇遇</strong>
          <span>完成探索后可能留下可处理的途中见闻。</span>
        </div>
        <StatusBadge tone="neutral">暂无</StatusBadge>
      </article>
    );
  }

  return (
    <article className="explore-event-card">
      <div className="province-head">
        <div>
          <strong>{event.title}</strong>
          <span>
            {event.province_name} · {eventRarityLabel(event.rarity)} ·{" "}
            {exploreEventStatusLabel(event.status)}
          </span>
        </div>
        <StatusBadge tone="success">可处理</StatusBadge>
      </div>
      <p>{event.description}</p>
      <p className="event-hint">{event.route_step_hint ?? event.prerequisite_hint}</p>
      <div className="event-choice-grid">
        {event.choices.map((choice) => (
          <button
            disabled={busy}
            key={choice.choice_id}
            onClick={() => onResolve(event, choice.choice_id)}
            type="button"
          >
            <strong>{choice.label}</strong>
            <span>{choice.reward_preview}</span>
            {choice.outcome_hint ? <small>{choice.outcome_hint}</small> : null}
          </button>
        ))}
      </div>
    </article>
  );
}

function CultivationJournal({
  entries,
  experience,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  entries: JournalEntry[];
  experience: ExperiencePayload | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void | Promise<void>;
}) {
  const latestEntry = entries[0];

  return (
    <section className="journal-panel" aria-label="修行日志">
      <div className="section-title">
        <div>
          <h2>修行日志</h2>
          <span>{latestEntry ? latestEntry.title : "行动完成后会记录在这里"}</span>
        </div>
        <StatusBadge tone={experience ? "success" : "neutral"}>
          {latestEntry ? "有新记录" : experience ? "有过程" : "等待行动"}
        </StatusBadge>
      </div>
      <div className="journal-layout">
        <div className="journal-list">
          {entries.length ? (
            entries.map((entry) => (
              <article className={`journal-entry tone-${entry.tone}`} key={entry.id}>
                <div className="journal-entry-head">
                  <strong>{entry.title}</strong>
                  <span>{formatJournalTime(entry.createdAt)}</span>
                </div>
                <p>{entry.summary}</p>
                {entry.deltas.length ? (
                  <div className="journal-deltas">
                    {entry.deltas.map((delta) => (
                      <span key={delta}>{delta}</span>
                    ))}
                  </div>
                ) : null}
                {entry.tags.length ? (
                  <div className="reason-tags">
                    {entry.tags.map((tag) => (
                      <span className={`reason-tag tone-${entry.tone}`} key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className="empty">先完成一次探索、洞府收取、炼丹或九塔提交。</p>
          )}
          {entries.length > 0 && hasMore ? (
            <div className="journal-more">
              <Button disabled={loadingMore} onClick={onLoadMore}>
                {loadingMore ? "读取中" : "查看更早记录"}
              </Button>
            </div>
          ) : entries.length > 0 ? (
            <p className="journal-end">已显示最近可读取的修行记录。</p>
          ) : null}
        </div>
        <div className="journal-detail">
          {experience ? (
            <ExperiencePanel experience={experience} />
          ) : (
            <div className="journal-empty-detail">
              <strong>当前行动详情</strong>
              <span>这里会展示行动过程、收益变化和下一步建议。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BattleReportCard({ battle }: { battle: BattleSummary }) {
  const latestLogs = battle.log.slice(-3);

  return (
    <article className="battle-card">
      <div className="battle-card-head">
        <div>
          <strong>{battle.enemy_name}</strong>
          <span>
            {battleTypeLabel(battle.battle_type)} · {battle.rounds} 回合
          </span>
        </div>
        <StatusBadge tone={battle.result === "win" ? "success" : "warning"}>
          {battle.result === "win" ? "胜利" : "失利"}
        </StatusBadge>
      </div>
      <div className="battle-stat-grid">
        <span>造成 {battle.damage_done}</span>
        <span>承伤 {battle.damage_taken}</span>
        <span>灵石 {battle.rewards.spirit_stone ?? "0"}</span>
      </div>
      {battle.reason_summary?.length ? (
        <ul className="battle-reason-list">
          {battle.reason_summary.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {latestLogs.length ? (
        <ol className="battle-log-list">
          {latestLogs.map((log) => (
            <li key={`${battle.battle_id}-${log.round}-${log.skill}`}>
              第 {log.round} 回合，{log.actor} 施展 {log.skill}，造成 {log.damage} 伤害。
            </li>
          ))}
        </ol>
      ) : (
        <p>本场战斗按自动策略完成，暂无详细回合日志。</p>
      )}
    </article>
  );
}

const visibleRiskJournalTagCodes = new Set([
  "delayed_settlement",
  "decayed",
  "manual_review",
  "rate_limited",
]);

const systemBoundaryJournalTagCodes = new Set([
  "async_collect",
  "async_tower",
  "async_event",
  "async_assignment",
  "async_claim",
  "server_settled",
  "reward_boundary",
  "risk_normal",
  "reward_unchanged",
  "bound_only",
  "no_paid_output",
  "no_ancient_treasure",
  "permanent_pool",
  "server_roll",
  "sect_async",
  "loss_not_destroy",
  "warehouse_whitelist",
  "warehouse_audit",
]);

const systemBoundaryJournalLabelFragments = [
  "异步",
  "风控正常",
  "不触发审核",
  "无风险",
  "奖励未加成",
  "不加成",
  "不增收益",
  "奖励" + "边界",
  "服务端",
  "幂等",
  "掷骰",
  "绑定产出",
  "无付费产出",
  "不产出九大古宝",
  "常驻机缘",
  "失败不毁号",
  "白名单流通",
  "仓库日志",
];

const experienceTagLabels: Record<string, string> = {
  async_assignment: "派驻行动",
  async_claim: "收取行动",
  async_collect: "离线收取",
  async_event: "活动推进",
  async_tower: "九塔提交",
  auto_battle: "自动战斗",
  bound_only: "绑定产出",
  decayed: "收益衰减",
  delayed_settlement: "延迟结算",
  honor_reward: "荣誉奖励",
  loss_not_destroy: "失败不毁号",
  manual_review: "人工审核",
  mirror_boss: "镜像挑战",
  no_ancient_treasure: "不产出九大古宝",
  no_paid_output: "无付费产出",
  permanent_pool: "常驻机缘",
  rate_limited: "请求限频",
  reputation_cleared: "声望清除",
  reward_boundary: "奖励说明",
  reward_unchanged: "奖励未加成",
  risk_normal: "不触发审核",
  route_locked: "路线锁定",
  sect_async: "宗门行动",
  sect_conflict_checked: "宗门校验",
  server_roll: "服务端结算",
  server_settled: "服务端结算",
  transfer_cooldown: "转道冷却",
  warehouse_audit: "仓库日志",
  warehouse_whitelist: "白名单流通",
};

function filterJournalTags(tags: ExperiencePayload["reason_tags"]): string[] {
  return uniqueStrings(
    filterPlayerFacingExperienceTags(tags).map(experienceReasonTagDisplayLabel).filter(Boolean),
  );
}

function filterJournalTagLabels(labels: string[]): string[] {
  return uniqueStrings(
    labels
      .filter((label) => !isSystemBoundaryJournalTag(label))
      .map(experienceTagLabel)
      .filter(Boolean),
  );
}

function filterPlayerFacingExperienceTags(
  tags: ExperiencePayload["reason_tags"],
): ExperiencePayload["reason_tags"] {
  return tags.filter((tag) => !isSystemBoundaryJournalTag(tag));
}

function filterSystemExperienceTags(
  tags: ExperiencePayload["reason_tags"],
): ExperiencePayload["reason_tags"] {
  return tags.filter(isSystemBoundaryJournalTag);
}

function experienceReasonTagDisplayLabel(tag: ExperiencePayload["reason_tags"][number]): string {
  const codeLabel = experienceTagLabel(tag.code);
  if (codeLabel !== tag.code) {
    return codeLabel;
  }
  return experienceTagLabel(tag.label || tag.code);
}

function experienceTagLabel(codeOrLabel: string): string {
  return experienceTagLabels[codeOrLabel] ?? codeOrLabel;
}

function systemExperienceTagLabel(tag: ExperiencePayload["reason_tags"][number]): string {
  const labels: Record<string, string> = {
    async_assignment: "派驻规则",
    async_claim: "收取规则",
    async_collect: "离线收益规则",
    async_event: "活动进度规则",
    async_tower: "九塔提交规则",
    bound_only: "绑定产出规则",
    loss_not_destroy: "失败保护规则",
    no_ancient_treasure: "古宝产出规则",
    no_paid_output: "产出范围规则",
    permanent_pool: "常驻池规则",
    reward_boundary: "奖励范围规则",
    reward_unchanged: "收益按原规则",
    risk_normal: "审核规则",
    sect_async: "宗门行动规则",
    server_roll: "随机结果规则",
    server_settled: "行动处理规则",
    warehouse_audit: "仓库记录规则",
    warehouse_whitelist: "仓库流通规则",
  };
  return labels[tag.code] ?? "规则说明";
}

function isSystemBoundaryJournalTag(
  tag: ExperiencePayload["reason_tags"][number] | string,
): boolean {
  const code = typeof tag === "string" ? "" : tag.code;
  const rawLabel = typeof tag === "string" ? tag : tag.label;
  const displayLabel =
    typeof tag === "string" ? experienceTagLabel(tag) : experienceReasonTagDisplayLabel(tag);

  if (visibleRiskJournalTagCodes.has(code) || visibleRiskJournalTagCodes.has(rawLabel)) {
    return false;
  }
  if (["延迟结算", "收益衰减", "人工审核", "请求限频"].includes(displayLabel)) {
    return false;
  }
  if (systemBoundaryJournalTagCodes.has(code) || systemBoundaryJournalTagCodes.has(rawLabel)) {
    return true;
  }

  return [rawLabel, displayLabel].some((value) =>
    systemBoundaryJournalLabelFragments.some((fragment) => value.includes(fragment)),
  );
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function RankMiniPanel({ rank, title }: { rank: RankListResponse | null; title: string }) {
  const topEntries = rank?.entries.slice(0, 3) ?? [];
  const hasAdjustedScores =
    (rank?.anti_brush_summary?.excluded_delayed_count ?? 0) > 0 ||
    (rank?.anti_brush_summary?.risk_record_count ?? 0) > 0;

  return (
    <article className="rank-mini-card">
      <div className="province-head">
        <strong>{title}</strong>
        <StatusBadge tone={hasAdjustedScores ? "warning" : "neutral"}>
          {rank?.snapshot_id ? (hasAdjustedScores ? "已整理" : "已结算") : "未生成"}
        </StatusBadge>
      </div>
      {topEntries.length ? (
        topEntries.map((entry) => (
          <p key={`${rank?.rank_type}-${entry.target_id}`}>
            {entry.rank_no}. {rankDisplayName(entry)} · {entry.score}
            {entry.title_reward ? ` · ${entry.title_reward.name}` : ""}
          </p>
        ))
      ) : (
        <p>暂无排行数据</p>
      )}
      <span>{hasAdjustedScores ? "异常积分已整理" : "榜单积分已确认"}</span>
    </article>
  );
}

function rankDisplayName(entry: RankListResponse["entries"][number]): string {
  return /^(风控|压测|称号|榜首|陪跑)/.test(entry.display_name)
    ? `第 ${entry.rank_no} 名道友`
    : entry.display_name;
}

function formatDeltaValue(item: ExperiencePayload["delta_summary"][number]): string {
  if (item.delta !== undefined && item.delta !== null) {
    return String(item.delta);
  }

  const values = [item.before, item.after]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value));

  return values.length > 0 ? values.join(" → ") : "-";
}

function formatDeltaSummary(item: ExperiencePayload["delta_summary"][number]): string {
  return `${item.label} ${formatDeltaValue(item)}`;
}

function serverJournalToEntry(entry: JournalEntryState): JournalEntry {
  return {
    createdAt: entry.created_at,
    deltas: entry.delta_summary,
    experience: entry.experience,
    id: entry.journal_entry_id,
    recommendations: entry.recommendations,
    summary: entry.summary,
    tags: entry.tags,
    title: entry.title,
    tone: entry.experience ? resolveExperienceTone(entry.experience) : "success",
  };
}

function mergeJournalEntries(current: JournalEntry[], incoming: JournalEntry[]): JournalEntry[] {
  const seen = new Set<string>();
  const merged: JournalEntry[] = [];
  for (const entry of [...current, ...incoming]) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    merged.push(entry);
  }

  return merged.slice(0, 20);
}

function resolveExperienceTone(experience: ExperiencePayload): ExperienceTone {
  if (experience.reason_tags.some((tag) => tag.tone === "danger")) {
    return "danger";
  }
  if (experience.reason_tags.some((tag) => tag.tone === "warning")) {
    return "warning";
  }
  if (
    experience.reason_tags.some((tag) => tag.tone === "success") ||
    experience.timeline.some((entry) => entry.tone === "success")
  ) {
    return "success";
  }

  return "neutral";
}

function toBadgeTone(tone: ExperienceTone): "neutral" | "success" | "warning" {
  return tone === "success" ? "success" : tone === "neutral" ? "neutral" : "warning";
}

function selectMainlineTask(tasks: TaskState[]): TaskState | undefined {
  const chapterTasks = tasks.filter((task) => task.task_type === "chapter");
  return (
    chapterTasks.find((task) => task.status === "completed") ??
    chapterTasks.find((task) => task.status === "in_progress") ??
    chapterTasks.find((task) => task.status !== "claimed")
  );
}

function buildMainlineGuide(input: {
  activeExplore: ExploreResponse | null;
  activeProfile: PlayerProfileResponse | null;
  busy: boolean;
  canClaimExplore: boolean;
  chapterTask: TaskState | undefined;
  event: ExploreEventState | undefined;
  overview: GameOverviewResponse | null;
  selectedProvince: ProvinceSummary | undefined;
  selectedTower: TowerStateSummary | undefined;
  serverRoute: NewPlayerRouteState | null | undefined;
  onClaimExplore: () => void | Promise<void>;
  onExplore: () => void | Promise<void>;
  onFocusEvent: () => void;
  onGrowth: () => void | Promise<void>;
  onTask: () => void | Promise<void>;
  onTower: () => void | Promise<void>;
}): MainlineGuide {
  if (input.serverRoute) {
    const steps = input.serverRoute.steps.map((step) => ({
      detail: step.detail,
      id: step.step_id,
      status: step.status,
      title: step.title,
    }));
    const activeStep =
      input.serverRoute.steps.find((step) => step.step_id === input.serverRoute?.primary_step_id) ??
      input.serverRoute.steps.find((step) => step.status === "active") ??
      input.serverRoute.steps.at(-1);
    const primary = mainlinePrimaryAction({
      actionHint: activeStep?.action_hint ?? input.serverRoute.primary_action_hint,
      activeStepId: activeStep?.step_id,
      busy: input.busy,
      canClaimExplore: input.canClaimExplore,
      hasActiveExplore: Boolean(input.activeExplore),
      onClaimExplore: input.onClaimExplore,
      onExplore: input.onExplore,
      onFocusEvent: input.onFocusEvent,
      onGrowth: input.onGrowth,
      onTask: input.onTask,
      onTower: input.onTower,
      preferredHint: activeStep?.detail,
      preferredLabel: activeStep?.action_label,
      task: input.chapterTask,
    });

    return {
      chapterId: input.activeProfile?.progress?.chapter_id ?? 1,
      onPrimary: primary.onAction,
      primaryDisabled: primary.disabled,
      primaryHint: primary.hint,
      primaryLabel: primary.label,
      progressPercent: input.serverRoute.progress_percent,
      progressText: input.serverRoute.progress_text,
      steps,
      subtitle: input.serverRoute.subtitle,
      title: input.serverRoute.title,
    };
  }

  const chapterId = input.activeProfile?.progress?.chapter_id ?? 1;
  const chapterTitle = chapterTitleById(chapterId);
  const mainProvince =
    input.overview?.provinces.find((province) => province.province_id === "ji") ??
    input.selectedProvince;
  const explorationTarget = chapterId <= 1 ? 3 : 5;
  const explorationCount = Math.min(mainProvince?.exploration_count ?? 0, explorationTarget);
  const hasPendingEvent = Boolean(input.event);
  const hasTowerTrace = (input.selectedTower?.seal_progress ?? 0) > 0;
  const taskStepStatus = mainlineTaskStatus(input.chapterTask);
  const exploreStepStatus: MainlineStepStatus =
    explorationCount >= explorationTarget
      ? "done"
      : taskStepStatus === "done"
        ? "active"
        : "pending";
  const eventStepStatus: MainlineStepStatus = hasPendingEvent
    ? "active"
    : explorationCount >= explorationTarget
      ? "done"
      : "pending";
  const towerStepStatus: MainlineStepStatus = hasTowerTrace
    ? "done"
    : eventStepStatus === "done"
      ? "active"
      : "pending";

  const steps: MainlineStep[] = [
    {
      detail: input.chapterTask
        ? `${input.chapterTask.progress_value}/${input.chapterTask.target_value} · ${taskStatusLabel(
            input.chapterTask.status,
          )}`
        : "当前章节任务已整理。",
      id: "chapter_task",
      status: taskStepStatus,
      title: input.chapterTask?.title ?? "章节任务",
    },
    {
      detail: `${mainProvince?.name ?? "冀州"}探索 ${explorationCount}/${explorationTarget}`,
      id: "province_explore",
      status: exploreStepStatus,
      title: "稳住州域",
    },
    {
      detail: hasPendingEvent ? `${input.event?.title} · 等待处理` : "途中见闻会记录到修行日志。",
      id: "explore_event",
      status: eventStepStatus,
      title: "处理见闻",
    },
    {
      detail: input.selectedTower
        ? `${input.selectedTower.tower_name}镇封 ${input.selectedTower.seal_progress}`
        : "九塔状态读取后开放镇封目标。",
      id: "tower",
      status: towerStepStatus,
      title: "镇封九塔",
    },
  ];
  const activeStep = steps.find((step) => step.status === "active") ?? steps.at(-1);
  const doneCount = steps.filter((step) => step.status === "done").length;
  const progressPercent = Math.round((doneCount / steps.length) * 100);
  const primary = mainlinePrimaryAction({
    activeStepId: activeStep?.id,
    busy: input.busy,
    canClaimExplore: input.canClaimExplore,
    hasActiveExplore: Boolean(input.activeExplore),
    onClaimExplore: input.onClaimExplore,
    onExplore: input.onExplore,
    onFocusEvent: input.onFocusEvent,
    onGrowth: input.onGrowth,
    onTask: input.onTask,
    onTower: input.onTower,
    task: input.chapterTask,
  });

  return {
    chapterId,
    primaryDisabled: primary.disabled,
    primaryHint: primary.hint,
    primaryLabel: primary.label,
    progressPercent,
    progressText: `${progressPercent}%`,
    steps,
    subtitle:
      chapterId <= 1
        ? "先把冀州、玄铁塔和基础任务串起来，后续州域会自然展开。"
        : "按当前章节目标推进州域、九塔和生产成长。",
    title: chapterTitle,
    onPrimary: primary.onAction,
  };
}

function mainlineTaskStatus(task: TaskState | undefined): MainlineStepStatus {
  if (!task || task.status === "claimed") {
    return "done";
  }
  return "active";
}

function mainlinePrimaryAction(input: {
  actionHint?: string;
  activeStepId: string | undefined;
  busy: boolean;
  canClaimExplore: boolean;
  hasActiveExplore: boolean;
  task: TaskState | undefined;
  onClaimExplore: () => void | Promise<void>;
  onExplore: () => void | Promise<void>;
  onFocusEvent: () => void;
  onGrowth: () => void | Promise<void>;
  onTask: () => void | Promise<void>;
  onTower: () => void | Promise<void>;
  preferredHint?: string;
  preferredLabel?: string;
}): {
  disabled?: boolean;
  hint: string;
  label: string;
  onAction: () => void | Promise<void>;
} {
  const actionKey = input.actionHint ?? input.activeStepId;
  if (actionKey === "task" || input.activeStepId === "chapter_task") {
    return {
      disabled: input.busy,
      hint:
        input.preferredHint ??
        (input.task?.status === "completed"
          ? "章节任务已经完成，先领取奖励。"
          : "先看清本章任务，再继续推进。"),
      label:
        input.preferredLabel ??
        (input.task?.status === "completed" ? "领取章节奖励" : "查看章节任务"),
      onAction: input.onTask,
    };
  }

  if (actionKey === "explore" || input.activeStepId === "province_explore") {
    if (input.canClaimExplore) {
      return {
        disabled: input.busy,
        hint: input.preferredHint ?? "探索已经完成，先领取战报和奖励。",
        label: input.preferredLabel ?? "领取探索",
        onAction: input.onClaimExplore,
      };
    }

    return {
      disabled: input.busy || input.hasActiveExplore,
      hint:
        input.preferredHint ??
        (input.hasActiveExplore ? "探索队列正在进行，稍后领取结果。" : "安排一次州域探索。"),
      label: input.preferredLabel ?? (input.hasActiveExplore ? "等待探索完成" : "开始探索"),
      onAction: input.onExplore,
    };
  }

  if (actionKey === "explore_event" || input.activeStepId === "explore_event") {
    return {
      disabled: input.busy,
      hint: input.preferredHint ?? "途中见闻会给少量普通奖励，也会写入日志。",
      label: input.preferredLabel ?? "处理探索奇遇",
      onAction: input.onFocusEvent,
    };
  }

  if (actionKey === "growth" || input.activeStepId === "craft_alchemy") {
    return {
      disabled: input.busy,
      hint: input.preferredHint ?? "进入成长页查看推荐丹方和材料缺口。",
      label: input.preferredLabel ?? "去炼丹",
      onAction: input.onGrowth,
    };
  }

  if (actionKey === "multiplayer" || input.activeStepId === "tower") {
    return {
      disabled: input.busy,
      hint: input.preferredHint ?? "镇封九塔会推动本州公共目标。",
      label: input.preferredLabel ?? "镇封九塔",
      onAction: input.onTower,
    };
  }

  return {
    disabled: input.busy,
    hint: "今日主线已整理完，继续完成日课和生产成长。",
    label: "查看今日目标",
    onAction: input.onTask,
  };
}

function chapterTitleById(chapterId: number): string {
  const titles: Record<number, string> = {
    1: "玄铁塔裂",
    2: "礼法重建",
    3: "海岱兵争",
    4: "商路与万木",
    5: "天衡转折",
    6: "镇岳太初",
  };
  return titles[chapterId] ?? "九州续章";
}

function mainlineStepTone(status: MainlineStepStatus): "neutral" | "success" | "warning" {
  return status === "done" ? "success" : status === "active" ? "warning" : "neutral";
}

function mainlineStepStatusLabel(status: MainlineStepStatus): string {
  const labels: Record<MainlineStepStatus, string> = {
    active: "当前",
    done: "完成",
    pending: "稍后",
  };
  return labels[status];
}

function taskStatusLabel(status: TaskState["status"]): string {
  const labels: Record<TaskState["status"], string> = {
    claimed: "已领取",
    completed: "可领取",
    in_progress: "进行中",
  };
  return labels[status];
}

function buildDailyGoals(input: {
  activity: ActivitySummaryState | undefined;
  busy: boolean;
  canBreakthrough: boolean;
  claimableCultivation: string;
  claimableTasks: TaskState[];
  firstAncientGrant: EntitlementOverviewResponse["available_monthly_grants"][number] | undefined;
  firstTower: TowerStateSummary | undefined;
  overview: GameOverviewResponse | null;
  onActivity: () => void | Promise<void>;
  onBreakthrough: () => void | Promise<void>;
  onCave: () => void | Promise<void>;
  onClaimCultivation: () => void | Promise<void>;
  onExplore: () => void | Promise<void>;
  onMonthlyGrant: () => void | Promise<void>;
  onTasks: () => void | Promise<void>;
  onTower: () => void | Promise<void>;
}): DailyGoal[] {
  const actionPoints = input.overview?.action_state?.action_points ?? 0;
  const caveMinutes = input.overview?.cave?.claimable_minutes ?? 0;
  const goals: DailyGoal[] = [
    {
      actionLabel: input.claimableTasks.length ? "查看任务" : "去探索",
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      detail: input.claimableTasks.length
        ? `${input.claimableTasks
            .map((task) => task.title)
            .slice(0, 2)
            .join("、")} 等待领取。`
        : "完成探索、洞府和九塔会继续推进今日任务。",
      disabled: input.busy,
      id: "tasks",
      onAction: input.claimableTasks.length ? input.onTasks : input.onExplore,
      status: input.claimableTasks.length ? `${input.claimableTasks.length} 个可领` : "推进中",
      title: "任务奖励",
      tone: input.claimableTasks.length ? "success" : "neutral",
    },
    {
      actionLabel: "领取修为",
      actionUnavailableReason: hasPositiveString(input.claimableCultivation)
        ? undefined
        : "修为还在积累",
      detail: `当前可领取修为 ${input.claimableCultivation}，离线收益不会因为错过时间点丢失。`,
      disabled: input.busy,
      id: "cultivation",
      onAction: input.onClaimCultivation,
      status: hasPositiveString(input.claimableCultivation) ? "可领取" : "积累中",
      title: "修为收束",
      tone: hasPositiveString(input.claimableCultivation) ? "success" : "neutral",
    },
    {
      actionLabel: "批量探索",
      actionUnavailableReason: !input.overview
        ? "角色状态尚未读取"
        : actionPoints <= 0
          ? "行动令不足"
          : undefined,
      detail:
        actionPoints > 0
          ? `行动令剩余 ${actionPoints}，探索会产生战报、掉落和任务进度。`
          : "行动令不足时可先领取收益、处理洞府或查看活动。",
      disabled: input.busy,
      id: "explore",
      onAction: input.onExplore,
      status: actionPoints > 0 ? "可行动" : "令不足",
      title: "州域探索",
      tone: actionPoints > 0 ? "success" : "warning",
    },
    {
      actionLabel: input.canBreakthrough ? "尝试突破" : "去探索",
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      detail: input.canBreakthrough
        ? "当前修为满足突破条件，可以推进境界。"
        : "继续探索、服丹和领取修为来补足下一层需求。",
      disabled: input.busy,
      id: "breakthrough",
      onAction: input.canBreakthrough ? input.onBreakthrough : input.onExplore,
      status: input.canBreakthrough ? "可突破" : "未满足",
      title: "境界突破",
      tone: input.canBreakthrough ? "success" : "neutral",
    },
    {
      actionLabel: "镇封提交",
      actionUnavailableReason: input.firstTower ? undefined : "九塔状态尚未读取",
      detail: input.firstTower
        ? `${input.firstTower.tower_name} 完整度 ${input.firstTower.integrity}，镇封 ${input.firstTower.seal_progress}。`
        : "九塔状态读取后可随时提交镇封行动。",
      disabled: input.busy,
      id: "tower",
      onAction: input.onTower,
      status: input.firstTower ? "可提交" : "未读取",
      title: "九塔贡献",
      tone: input.firstTower ? "success" : "neutral",
    },
    {
      actionLabel: input.activity?.claimable ? "领取活动" : "推进活动",
      actionUnavailableReason: input.activity ? undefined : "活动中心尚未读取",
      detail: input.activity
        ? `${input.activity.name} 进度 ${input.activity.progress}/${input.activity.target_progress}。`
        : "活动中心会显示可参与目标。",
      disabled: input.busy,
      id: "activity",
      onAction: input.onActivity,
      status: input.activity?.claimable ? "可领取" : input.activity ? "进行中" : "未读取",
      title: "活动奖励",
      tone: input.activity?.claimable ? "success" : input.activity ? "neutral" : "warning",
    },
  ];

  if (input.firstAncientGrant) {
    goals.splice(3, 0, {
      actionLabel: "赠抽古宝",
      detail: `月卡赠抽剩余 ${
        input.firstAncientGrant.draw_count - input.firstAncientGrant.used_count
      } 次，当日有效。`,
      disabled: input.busy,
      id: "ancient_grant",
      onAction: input.onMonthlyGrant,
      status: "可抽取",
      title: "九大古宝",
      tone: "success",
    });
  }

  if (caveMinutes > 0) {
    goals.splice(2, 0, {
      actionLabel: "一键领取",
      detail: `洞府已有 ${caveMinutes} 分钟产出，可和任务收益一起收束。`,
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      disabled: input.busy,
      id: "cave",
      onAction: input.onCave,
      status: "可收取",
      title: "洞府收益",
      tone: "success",
    });
  }

  return goals.slice(0, 4);
}

function buildRecommendedActions(input: {
  activity: ActivitySummaryState | undefined;
  busy: boolean;
  canCraftAlchemy: boolean;
  canCraftForge: boolean;
  canExplore: boolean;
  canTower: boolean;
  caveMinutes: number;
  exploreCount: number;
  province: ProvinceSummary | undefined;
  tower: TowerStateSummary | undefined;
  onActivity: () => void | Promise<void>;
  onAlchemy: () => void | Promise<void>;
  onCave: () => void | Promise<void>;
  onExplore: () => void | Promise<void>;
  onForge: () => void | Promise<void>;
  onQuickClaim: () => void | Promise<void>;
  onTower: () => void | Promise<void>;
}): RecommendedAction[] {
  return [
    {
      buttonLabel: "一键领取",
      detail:
        input.caveMinutes > 0
          ? `洞府 ${input.caveMinutes} 分钟产出待收。`
          : "检查修为、洞府和已完成任务。",
      disabled: input.busy,
      id: "quick_claim",
      onAction: input.onQuickClaim,
      title: "收束收益",
    },
    {
      buttonLabel: `探索 ${input.exploreCount} 次`,
      actionUnavailableReason: input.canExplore ? undefined : "暂无可开始的探索队列",
      detail: input.province
        ? `${input.province.name} · ${input.province.recommended_action}`
        : "选择已开放州域后开始探索。",
      disabled: input.busy,
      id: "explore",
      onAction: input.onExplore,
      title: "推进游历",
    },
    {
      buttonLabel: "洞府收取",
      detail: input.caveMinutes > 0 ? "收取洞府产出，补充灵石。" : "暂无高额产出，也可手动检查。",
      disabled: input.busy,
      id: "cave",
      onAction: input.onCave,
      title: "照看洞府",
    },
    {
      buttonLabel: "镇封一次",
      actionUnavailableReason: input.canTower ? undefined : "九塔状态尚未读取",
      detail: input.tower
        ? `${input.tower.tower_name} · 魔染 ${input.tower.corruption}`
        : "读取九塔后提交贡献。",
      disabled: input.busy,
      id: "tower",
      onAction: input.onTower,
      title: "九塔留痕",
    },
    {
      buttonLabel: input.activity?.claimable ? "领取" : "推进",
      actionUnavailableReason: input.activity ? undefined : "活动中心尚未读取",
      detail: input.activity ? input.activity.name : "活动读取后显示可执行目标。",
      disabled: input.busy,
      id: "activity",
      onAction: input.onActivity,
      title: "活动日课",
    },
    {
      buttonLabel: input.canCraftAlchemy ? "炼丹" : "炼器",
      actionUnavailableReason:
        input.canCraftAlchemy || input.canCraftForge ? undefined : "暂无可用丹器配方",
      detail: input.canCraftAlchemy ? "尝试炼制丹药，补充修为成长。" : "炼器生成或淬炼法宝词条。",
      disabled: input.busy,
      id: "craft",
      onAction: input.canCraftAlchemy ? input.onAlchemy : input.onForge,
      title: "生产成长",
    },
  ];
}

function selectVisibleRecommendedActions(actions: RecommendedAction[]): RecommendedAction[] {
  const availableActions = actions.filter((action) => !action.actionUnavailableReason);
  return (availableActions.length ? availableActions : actions).slice(0, 4);
}

function buildGrowthTargets(input: {
  activity: ActivitySummaryState | undefined;
  busy: boolean;
  firstEquipment: EquipmentListResponse["equipments"][number] | undefined;
  firstPill: BagSummaryResponse["items"][number] | undefined;
  firstTower: TowerStateSummary | undefined;
  innerWorld: InnerWorldSummaryResponse | null;
  overview: GameOverviewResponse | null;
  onActivity: () => void | Promise<void>;
  onBreakthrough: () => void | Promise<void>;
  onExplore: () => void | Promise<void>;
  onForge: () => void | Promise<void>;
  onInnerWorld: () => void | Promise<void>;
  onPill: () => void | Promise<void>;
  onTower: () => void | Promise<void>;
}): GrowthTarget[] {
  const canBreakthrough = input.overview?.cultivation?.can_breakthrough === true;

  return [
    {
      actionLabel: canBreakthrough ? "突破" : "去探索",
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      detail: input.overview?.cultivation
        ? `当前 ${input.overview.cultivation.cultivation_value}/${input.overview.cultivation.current_level_required}`
        : "创建角色后显示修为缺口。",
      disabled: input.busy,
      id: "breakthrough",
      onAction: canBreakthrough ? input.onBreakthrough : input.onExplore,
      title: "下一境界",
    },
    {
      actionLabel: input.firstPill ? "服丹" : "炼丹",
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      detail: input.firstPill
        ? `${input.firstPill.name} 可服用。`
        : "暂无可服丹药，先炼制基础丹药。",
      disabled: input.busy,
      id: "pill",
      onAction: input.onPill,
      title: "丹药成长",
    },
    {
      actionLabel: "炼器",
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      detail: input.firstEquipment
        ? `${input.firstEquipment.name} 可继续淬炼或铭刻。`
        : "先炼制第一件普通法宝。",
      disabled: input.busy,
      id: "equipment",
      onAction: input.onForge,
      title: "法宝目标",
    },
    {
      actionLabel: "镇封",
      actionUnavailableReason: input.firstTower ? undefined : "九塔状态尚未读取",
      detail: input.firstTower
        ? `${input.firstTower.tower_name} 当前完整度 ${input.firstTower.integrity}。`
        : "九塔读取后显示贡献入口。",
      disabled: input.busy,
      id: "tower",
      onAction: input.onTower,
      title: "九塔贡献",
    },
    {
      actionLabel: input.activity?.claimable ? "领奖" : "推进",
      actionUnavailableReason: input.activity ? undefined : "活动中心尚未读取",
      detail: input.activity
        ? `${input.activity.name} ${input.activity.progress}/${input.activity.target_progress}`
        : "活动中心读取后显示奖励进度。",
      disabled: input.busy,
      id: "activity",
      onAction: input.onActivity,
      title: "活动奖励",
    },
    {
      actionLabel: input.innerWorld?.state.unlocked ? "查看洞天" : "查看条件",
      actionUnavailableReason: input.overview ? undefined : "角色状态尚未读取",
      detail: input.innerWorld?.state.unlocked
        ? `内天地 ${input.innerWorld.state.world_level} 级，派驻 ${input.innerWorld.state.active_assignment_count}/${input.innerWorld.state.assignment_limit}。`
        : (input.innerWorld?.state.unlock_hint ?? "内天地后续章节开启。"),
      disabled: input.busy,
      id: "inner_world",
      onAction: input.onInnerWorld,
      title: "内天地",
    },
  ];
}

function hasPositiveString(value: string): boolean {
  return Number(value) > 0;
}

function formatJournalTime(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

async function loadInnerWorld(client: GameClient) {
  const response = await client.innerWorldSummary();
  ensureOk(response);
  return response.data;
}

async function loadMultiplayer(client: GameClient) {
  const [
    towerResponse,
    bossResponse,
    sectResponse,
    sectListResponse,
    mentorResponse,
    diplomacyResponse,
    hireResponse,
    resourceResponse,
    rankResponse,
    productionRankResponse,
    eraRankResponse,
    innerWorldRankResponse,
    factionRankResponse,
    titleResponse,
    factionResponse,
  ] = await Promise.all([
    client.towers(),
    client.worldBoss(),
    client.mySect(),
    client.sects(),
    client.mentorSummary(),
    client.sectDiplomacySummary(),
    client.sectHireList(),
    client.resourcePoints(),
    client.ranks("personal"),
    client.ranks("production"),
    client.ranks("era"),
    client.ranks("inner_world"),
    client.ranks("faction"),
    client.titleCollection(),
    client.factionRoutes(),
  ]);

  ensureOk(towerResponse);
  ensureOk(bossResponse);
  ensureOk(sectResponse);
  ensureOk(sectListResponse);
  ensureOk(mentorResponse);
  ensureOk(diplomacyResponse);
  ensureOk(hireResponse);
  ensureOk(resourceResponse);
  ensureOk(rankResponse);
  ensureOk(productionRankResponse);
  ensureOk(eraRankResponse);
  ensureOk(innerWorldRankResponse);
  ensureOk(factionRankResponse);
  ensureOk(titleResponse);
  ensureOk(factionResponse);

  return {
    towers: towerResponse.data,
    boss: bossResponse.data,
    sect: sectResponse.data,
    sectList: sectListResponse.data,
    mentor: mentorResponse.data,
    diplomacy: diplomacyResponse.data,
    hireList: hireResponse.data,
    resourcePoints: resourceResponse.data,
    personalRank: rankResponse.data,
    productionRank: productionRankResponse.data,
    eraRank: eraRankResponse.data,
    innerWorldRank: innerWorldRankResponse.data,
    factionRank: factionRankResponse.data,
    titles: titleResponse.data,
    faction: factionResponse.data,
  };
}

async function loadActivities(client: GameClient) {
  const response = await client.activityList();
  ensureOk(response);
  return response.data;
}

async function loadStory(client: GameClient, preferredScrollId?: string) {
  const [scrollsResponse, chronicleResponse] = await Promise.all([
    client.storyScrolls(),
    client.eraChronicle(),
  ]);

  ensureOk(scrollsResponse);
  ensureOk(chronicleResponse);

  const scrollId =
    scrollsResponse.data.scrolls.find((scroll) => scroll.scroll_id === preferredScrollId)
      ?.scroll_id ??
    scrollsResponse.data.scrolls.find((scroll) => scroll.unlock_state === "unlocked")?.scroll_id;
  const detailResponse = scrollId ? await client.storyScroll(scrollId) : null;
  if (detailResponse) {
    ensureOk(detailResponse);
  }

  return {
    storyScrolls: scrollsResponse.data,
    storyDetail: detailResponse?.data ?? null,
    eraChronicle: chronicleResponse.data,
  };
}

async function loadCollection(client: GameClient) {
  const [collectionResponse, museumResponse] = await Promise.all([
    client.collectionSummary(),
    client.eraMuseum(),
  ]);

  ensureOk(collectionResponse);
  ensureOk(museumResponse);

  return {
    collection: collectionResponse.data,
    eraMuseum: museumResponse.data,
  };
}

async function loadCommerce(client: GameClient) {
  const [
    overviewResponse,
    poolResponse,
    treasureResponse,
    appearanceResponse,
    appearancePlusResponse,
  ] = await Promise.all([
    client.commerceOverview(),
    client.gachaPools(),
    client.ancientTreasures(),
    client.appearances(),
    client.appearancePlusCatalog(),
  ]);

  ensureOk(overviewResponse);
  ensureOk(poolResponse);
  ensureOk(treasureResponse);
  ensureOk(appearanceResponse);
  ensureOk(appearancePlusResponse);

  return {
    commerce: overviewResponse.data,
    gachaPools: poolResponse.data,
    ancientTreasures: treasureResponse.data,
    appearances: appearanceResponse.data,
    appearancePlus: appearancePlusResponse.data,
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
  actionNote,
  detail,
  title,
}: {
  actions?: ReactNode;
  actionNote?: string;
  detail: string;
  title: string;
}) {
  return (
    <article className="production-box">
      <strong>{title}</strong>
      <span>{detail}</span>
      <div className="production-actions">{actions}</div>
      {actionNote ? <span className="action-note">{actionNote}</span> : null}
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

function activityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "进行中",
    ended: "已结束",
    preview: "预告中",
    rolled_back: "已回滚",
    settling: "结算中",
  };
  return labels[status] ?? "未知状态";
}

function playerFacingActivityDescription(activity: ActivitySummaryState): string {
  const replacements: Record<string, string> = {
    "当前 MVP 以异步扶持样板开放。": "完成归山目标后领取扶持奖励。",
    "当前 MVP 以随时扶持样板开放。": "完成归山目标后领取扶持奖励。",
    "用于维护、Bug 或结算异常后的基础补偿样板，可由运营公告配合发放。":
      "维护补偿会随公告与邮件发放。",
  };
  const exact = replacements[activity.description];
  if (exact) {
    return exact;
  }
  if (activity.description.includes("MVP") || activity.description.includes("样板")) {
    return activity.name.includes("归山")
      ? "完成归山目标后领取扶持奖励。"
      : activity.description
          .replaceAll("当前 MVP 以", "")
          .replaceAll("样板", "活动")
          .replaceAll("异步", "随时");
  }
  return activity.description.replaceAll("异步", "随时");
}

function rewardStateLabel(state: string): string {
  const labels: Record<string, string> = {
    claimable: "可领取",
    claimed: "已领取",
    compensated: "已补偿",
    rolled_back: "已回滚",
    unsettled: "未结算",
  };
  return labels[state] ?? "未知奖励状态";
}

function sourceTypeLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    activity: "活动",
    cave_collect: "洞府收取",
    era_rank: "纪元排行",
    explore: "州域探索",
    inner_world_assignment: "内天地派驻",
    inner_world_support: "九州支援",
    manual: "手动记录",
    pvp: "资源点争夺",
    sect: "宗门",
    tower: "九塔",
  };
  return labels[sourceType] ?? "未知来源";
}

function mentorRelationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "指点中",
    dissolved: "已解除",
    graduated: "已出师",
    pending: "待回应",
    rejected: "已婉拒",
  };
  return labels[status] ?? "师徒记录";
}

function sectDiplomacyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    aid: "援助",
    alliance: "盟约",
    defense: "协防",
    hostility: "敌对",
  };
  return labels[type] ?? "外交";
}

function sectDiplomacyStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "已生效",
    dissolved: "已解除",
    expired: "已过期",
    proposed: "待审批",
    rejected: "已回绝",
  };
  return labels[status] ?? "外交记录";
}

function sectHireTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    event_support: "活动协助",
    explore_support: "探索协助",
    sect_build: "宗门建设",
    tower_supply: "九塔补给",
  };
  return labels[type] ?? "雇佣";
}

function sectHireStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "已接取",
    canceled: "已取消",
    completed: "已完成",
    open: "待接取",
    rolled_back: "已回滚",
    settled: "已结算",
  };
  return labels[status] ?? "委托记录";
}

function transferRequestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    canceled: "已取消",
    draft: "报告草稿",
    executed: "已执行",
    pending_confirm: "待二次确认",
    rejected: "已驳回",
    reviewing: "审核中",
    rolled_back: "已回滚",
    submitted: "已提交",
  };
  return labels[status] ?? "转服记录";
}

function mentorTaskClaimed(relation: MentorRelationState): boolean {
  return relation.task_summary.claimed === true;
}

function hasSectRoleAtLeast(role: string | null | undefined, minimum: "deacon" | "elder"): boolean {
  const rank: Record<string, number> = { deacon: 2, disciple: 1, elder: 3, leader: 4 };
  return (rank[role ?? ""] ?? 0) >= rank[minimum];
}

function chronicleTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    era_museum: "博物志",
    event: "活动",
    history_catalog: "图鉴",
    rank: "排行",
    tower: "九塔",
  };
  return labels[type] ?? "史册";
}

function collectionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ancient_catalog: "古宝图鉴",
    era_chronicle: "史册",
    event_memorial: "活动纪念",
    faction_ending: "阵营结局",
    story_scroll: "卷轴",
    title: "称号",
    tower_achievement: "九塔战绩",
  };
  return labels[type] ?? "收藏";
}

function collectionDisplaySlotName(slotId: string): string {
  const labels: Record<string, string> = {
    chronicle_wall: "史册墙",
    museum_focus: "博物志焦点",
    profile_showcase: "名片陈列",
  };
  return labels[slotId] ?? "展示栏";
}

function appearancePlusTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    battle_frame: "战报边框",
    cave_decoration: "洞府摆件",
    chronicle_skin: "史册外观",
    dynamic_title: "动态称号",
    name_card: "名片布局",
    sect_decoration: "宗门驻地",
  };
  return labels[type] ?? "外观";
}

function appearancePlusSlotLabel(slotId: string): string {
  const labels: Record<string, string> = {
    battle_report: "战报边框",
    cave_scene: "洞府摆件",
    chronicle_skin: "史册外观",
    name_card: "名片布局",
    profile_title: "名片称号",
    sect_hall: "宗门驻地",
  };
  return labels[slotId] ?? "展示位";
}

function battleTypeLabel(battleType: string): string {
  const labels: Record<string, string> = {
    boss: "公共 Boss",
    explore: "普通探索",
    pvp: "资源点争夺",
    tower: "九塔战斗",
  };
  return labels[battleType] ?? "战斗";
}

function commerceTierLabel(tier?: string): string {
  const labels: Record<string, string> = {
    free: "免费",
    large_monthly: "大月卡",
    small_monthly: "小月卡",
    vip1: "VIP1",
    vip2: "VIP2",
    vip3: "VIP3",
    vip4: "VIP4",
  };
  return tier ? (labels[tier] ?? "未知档位") : "免费";
}

function monthlyCardClaimState(
  commerce: EntitlementOverviewResponse | null,
  cardType: MonthlyCardType,
): { canClaim: boolean; label: string } {
  const card = commerce?.monthly_cards.find((item) => item.card_type === cardType);
  const cardLabel = monthlyCardLabel(cardType);
  if (!card?.active) {
    return { canClaim: false, label: `${cardLabel}未持有` };
  }

  if (card.last_claim_date === todayDateKey()) {
    return { canClaim: false, label: `${cardLabel}今日已领` };
  }

  return { canClaim: true, label: `${cardLabel}今日可领` };
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthlyCardLabel(cardType: string): string {
  const labels: Record<string, string> = {
    large_monthly: "大月卡",
    small_monthly: "小月卡",
  };
  return labels[cardType] ?? "月卡";
}

function gachaCostTypeLabel(costType: string): string {
  const labels: Record<string, string> = {
    ancient_page: "残页合成",
    bound_jade: "绑定仙玉",
    monthly_grant: "月卡赠抽",
    paid_jade: "付费仙玉",
    reserved_paid_jade: "仙玉抽取预留",
  };
  return labels[costType] ?? "未知消耗";
}

function equipmentRarityLabel(rarity: string): string {
  const labels: Record<string, string> = {
    ancient_craft: "古器胚",
    earth: "地品",
    heaven: "天品",
    immortal: "仙品",
    ordinary: "凡品",
  };
  return labels[rarity] ?? rarity;
}

function queueStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "已接收",
    completed: "已完成",
    pending: "排队中",
    rejected: "已拒绝",
    running: "执行中",
  };
  return labels[status] ?? "未知队列状态";
}

function assignmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "派驻中",
    claimable: "可收取",
    claimed: "已收取",
  };
  return labels[status] ?? "未知派驻状态";
}

function skillName(skills: SkillLoadoutResponse | null, skillId?: string): string {
  if (!skills || !skillId) {
    return "未配置";
  }

  return skills.available_skills.find((skill) => skill.skill_id === skillId)?.name ?? "未命名技能";
}

function creatureStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: "空闲",
    assigned: "派驻中",
    training: "培养中",
  };
  return labels[status] ?? "未知状态";
}

function factionTransferTaskId(routeId: string): string {
  const taskIds: Record<string, string> = {
    immortal: "transfer_immortal_oath",
    demon: "transfer_demon_oath",
    wanderer: "transfer_wanderer_oath",
  };

  return taskIds[routeId] ?? "transfer_wanderer_oath";
}

function formatRemainingSeconds(seconds: number): string {
  if (seconds <= 0) {
    return "可收取";
  }
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

function formatRate(rate: number): string {
  return `${Math.round(rate / 100)}%`;
}

function formatMaterialGaps(
  gaps: NonNullable<
    AlchemyRecipeListResponse["recipes"][number]["recommendation"]
  >["material_gaps"],
): string {
  const missing = gaps.filter((gap) => gap.missing > 0);
  if (!missing.length) {
    return "材料已足够";
  }

  return `缺 ${missing.map((gap) => `${gap.name} ${gap.missing}`).join("、")}`;
}

function provinceNameById(
  provinces: ProvinceSummary[] | undefined,
  provinceId: string | null | undefined,
): string {
  return provinces?.find((province) => province.province_id === provinceId)?.name ?? "未知州";
}

function isProvinceUnlocked(
  provinces: ProvinceSummary[] | undefined,
  provinceId: string | null | undefined,
): boolean {
  return provinces?.find((province) => province.province_id === provinceId)?.unlocked === true;
}

function exploreStatusLabel(status: ExploreResponse["status"]): string {
  const labels: Record<ExploreResponse["status"], string> = {
    claimed: "已领取",
    completed: "可领取",
    expired: "已过期",
    pending: "探索中",
  };
  return labels[status];
}

function exploreEventStatusLabel(status: ExploreEventState["status"]): string {
  const labels: Record<ExploreEventState["status"], string> = {
    expired: "已过期",
    pending: "待处理",
    resolved: "已处理",
  };
  return labels[status];
}

function eventRarityLabel(rarity: ExploreEventState["rarity"]): string {
  const labels: Record<string, string> = {
    common: "寻常",
    rare: "少见",
    uncommon: "有缘",
  };
  return rarity ? (labels[rarity] ?? rarity) : "寻常";
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "待定";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function activeTabLabel(tab: ActiveTab): string {
  return navItems.find((item) => item.key === tab)?.label ?? "当前分区";
}

function isActiveTab(value: string | null): value is ActiveTab {
  return (
    value === "overview" ||
    value === "story" ||
    value === "collection" ||
    value === "events" ||
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
