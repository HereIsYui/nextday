import type {
  AcceptSectHireRequest,
  ActivityDetailResponse,
  ActivityListResponse,
  AdminConfigVersionListResponse,
  AdminCreateTransferDryRunRequest,
  AdminCreateTransferDryRunResponse,
  AdminDelayedSettlementListResponse,
  AdminExecuteTransferRequest,
  AdminExecuteTransferResponse,
  AdminGmOperationListResponse,
  AdminLogType,
  AdminMailListResponse,
  AdminPlayerDigestResponse,
  AdminPlayerLogsResponse,
  AdminPlayerRiskResponse,
  AdminReviewTransferRequest,
  AdminReviewTransferResponse,
  AdminRiskRecordListResponse,
  AlchemyCraftRequest,
  AlchemyCraftResponse,
  AlchemyRecipeListResponse,
  AlchemyRecordListResponse,
  AncientTreasureListResponse,
  AnnouncementListResponse,
  ApiResponse,
  AppearanceListResponse,
  AppearanceMutationResponse,
  AppearancePlusCatalogResponse,
  ApplyMentorRequest,
  AuthMeResponse,
  BagSummaryResponse,
  BattleListResponse,
  BattleNarrativeResponse,
  BreakthroughResponse,
  CancelTransferRequestRequest,
  CancelTransferRequestResponse,
  CaveCollectResponse,
  ChooseFactionRouteRequest,
  ChooseFactionRouteResponse,
  CityManagementResponse,
  CityOverviewResponse,
  ClaimActivityRewardRequest,
  ClaimActivityRewardResponse,
  ClaimAppearanceRequest,
  ClaimMentorTaskRequest,
  ClaimMonthlyDailyRequest,
  ClaimMonthlyDailyResponse,
  ClaimRankTitleRequest,
  ClaimRankTitleResponse,
  CollectTerritoryResponse,
  CollectionSummaryResponse,
  ConfigEnvelope,
  ConfigType,
  ConvenienceBatchPreviewRequest,
  ConvenienceBatchPreviewResponse,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse,
  CreateAutomationQueueRequest,
  CreateAutomationQueueResponse,
  CreateMergeDryRunRequest,
  CreateMergeDryRunResponse,
  CreatePlayerRequest,
  CreatePlayerResponse,
  CreateSectHireRequest,
  CreateSectRequest,
  CreateTransferRequestRequest,
  CreateTransferRequestResponse,
  CultivationClaimResponse,
  DailyRouteResponse,
  EntitlementOverviewResponse,
  EquipAppearancePlusRequest,
  EquipAppearancePlusResponse,
  EquipAppearanceRequest,
  EquipCollectionDisplayRequest,
  EquipCollectionDisplayResponse,
  EquipmentInscribeRequest,
  EquipmentListResponse,
  EquipmentOperationRecordListResponse,
  EquipmentOperationResponse,
  EquipmentTargetRequest,
  EraChronicleResponse,
  EraMuseumResponse,
  EstablishSubCityRequest,
  EstablishSubCityResponse,
  ExecuteMergeReservedRequest,
  ExecuteMergeReservedResponse,
  ExpandCityResponse,
  ExploreClaimRequest,
  ExploreCurrentResponse,
  ExploreEventListResponse,
  ExploreRequest,
  ExploreResponse,
  FactionReputationResponse,
  FactionRoutesResponse,
  ForgeCraftRequest,
  ForgeRecipeListResponse,
  GachaDrawRequest,
  GachaDrawResponse,
  GachaHistoryResponse,
  GachaPoolListResponse,
  GameOverviewResponse,
  GraduateMentorRequest,
  GuestLoginRequest,
  HarvestHerbRequest,
  HarvestHerbResponse,
  HerbGardenState,
  InnerWorldAssignmentListResponse,
  InnerWorldClaimRequest,
  InnerWorldClaimResponse,
  InnerWorldDispatchRequest,
  InnerWorldDispatchResponse,
  InnerWorldSummaryResponse,
  InnerWorldSupportRequest,
  InnerWorldSupportResponse,
  InnerWorldUpgradeRequest,
  InnerWorldUpgradeResponse,
  JoinSectRequest,
  JournalListResponse,
  LearnSkillRequest,
  LearnSkillResponse,
  LoginResponse,
  MentorMutationResponse,
  MentorSummaryResponse,
  MergeDryRunReportResponse,
  MockFishpiLoginRequest,
  OccupyWorldRequest,
  OccupyWorldResponse,
  PillUseRequest,
  PillUseResponse,
  PlantHerbRequest,
  PlantHerbResponse,
  PlayerProfileResponse,
  PluginExpandedPanelResponse,
  PluginNavigationLinksResponse,
  PluginQuickClaimRequest,
  PluginQuickClaimResponse,
  PluginStatusCardResponse,
  PluginSubmitPresetRequest,
  PluginSubmitPresetResponse,
  ProposeSectDiplomacyRequest,
  ProvinceSummary,
  PublishAdminConfigRequest,
  PublishAdminConfigResponse,
  PurchaseMonthlyCardRequest,
  PurchaseMonthlyCardResponse,
  PurchaseWorldBlockRequest,
  PurchaseWorldBlockResponse,
  PvpAttackRequest,
  PvpBattleResponse,
  RankListResponse,
  RankType,
  ResolveExploreEventRequest,
  ResolveExploreEventResponse,
  ResolveRiskRecordRequest,
  ResolveRiskRecordResponse,
  ResourcePointListResponse,
  ReviewDelayedSettlementRequest,
  ReviewDelayedSettlementResponse,
  ReviewMentorRequest,
  ReviewSectDiplomacyRequest,
  RollbackAdminConfigRequest,
  RollbackAdminConfigResponse,
  SaveConvenienceStrategyRequest,
  SaveConvenienceStrategyResponse,
  SaveSkillLoadoutRequest,
  SectDetailResponse,
  SectDiplomacyMutationResponse,
  SectDiplomacySummaryResponse,
  SectHireListResponse,
  SectHireMutationResponse,
  SectListResponse,
  SectMutationResponse,
  SectTaskResponse,
  SectWarehouseDepositRequest,
  SectWarehouseResponse,
  SectWarehouseWithdrawRequest,
  SendAdminMailRequest,
  SendAdminMailResponse,
  SetEquipmentLockRequest,
  SetItemLockRequest,
  SetItemLockResponse,
  SettleMainCityRequest,
  SettleMainCityResponse,
  SettleSectHireRequest,
  SkillLoadoutResponse,
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  StoryScrollDetailResponse,
  StoryScrollListResponse,
  SubmitActivityProgressRequest,
  SubmitActivityProgressResponse,
  SyncVipRequest,
  SyncVipResponse,
  TaskClaimRequest,
  TaskClaimResponse,
  TaskSummaryResponse,
  TerritoryOverviewResponse,
  TitleCollectionResponse,
  TowerActionRequest,
  TowerActionResponse,
  TowerListResponse,
  TransferFactionRouteRequest,
  TransferFactionRouteResponse,
  TransferRuleResponse,
  TransferStatusResponse,
  UpgradeCityBuildingRequest,
  UpgradeCityBuildingResponse,
  WorldAtlasResponse,
  WorldBossChallengeRequest,
  WorldBossChallengeResponse,
  WorldBossResponse,
  WorldMapResponse,
  WorldMapView,
  WorldMapViewportRequest,
  WorldMarchListResponse,
  WorldProvinceListResponse,
} from "@nextday/shared";

export interface GameClientOptions {
  baseUrl: string;
  token?: string;
  clientVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export class GameClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly clientVersion?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GameClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.clientVersion = options.clientVersion;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get<TData>(path: string, options: RequestOptions = {}): Promise<ApiResponse<TData>> {
    return this.request<TData>("GET", path, undefined, options);
  }

  post<TData, TBody = unknown>(
    path: string,
    body?: TBody,
    options: RequestOptions = {},
  ): Promise<ApiResponse<TData>> {
    return this.request<TData>("POST", path, body, options);
  }

  guestLogin(body: GuestLoginRequest): Promise<ApiResponse<LoginResponse>> {
    return this.post<LoginResponse, GuestLoginRequest>("/api/auth/guest-login", body);
  }

  mockFishpiLogin(body: MockFishpiLoginRequest): Promise<ApiResponse<LoginResponse>> {
    return this.post<LoginResponse, MockFishpiLoginRequest>("/api/auth/mock-fishpi-login", body);
  }

  me(): Promise<ApiResponse<AuthMeResponse>> {
    return this.get<AuthMeResponse>("/api/auth/me");
  }

  playerProfile(): Promise<ApiResponse<PlayerProfileResponse>> {
    return this.get<PlayerProfileResponse>("/api/player/profile");
  }

  createPlayer(
    body: CreatePlayerRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<CreatePlayerResponse>> {
    return this.post<CreatePlayerResponse, CreatePlayerRequest>("/api/player/create", body, {
      idempotencyKey,
    });
  }

  getConfig(configType: ConfigType): Promise<ApiResponse<ConfigEnvelope>> {
    return this.get<ConfigEnvelope>(`/api/config/${configType}`);
  }

  storyScrolls(): Promise<ApiResponse<StoryScrollListResponse>> {
    return this.get<StoryScrollListResponse>("/api/story/scrolls");
  }

  storyScroll(scrollId: string): Promise<ApiResponse<StoryScrollDetailResponse>> {
    return this.get<StoryScrollDetailResponse>(`/api/story/scrolls/${scrollId}`);
  }

  battleNarrative(battleId: string): Promise<ApiResponse<BattleNarrativeResponse>> {
    return this.get<BattleNarrativeResponse>(`/api/story/battle-narratives/${battleId}`);
  }

  eraChronicle(): Promise<ApiResponse<EraChronicleResponse>> {
    return this.get<EraChronicleResponse>("/api/story/era-chronicle");
  }

  collectionSummary(): Promise<ApiResponse<CollectionSummaryResponse>> {
    return this.get<CollectionSummaryResponse>("/api/collection/summary");
  }

  equipCollectionDisplay(
    body: EquipCollectionDisplayRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipCollectionDisplayResponse>> {
    return this.post<EquipCollectionDisplayResponse, EquipCollectionDisplayRequest>(
      "/api/collection/display/equip",
      body,
      { idempotencyKey },
    );
  }

  eraMuseum(): Promise<ApiResponse<EraMuseumResponse>> {
    return this.get<EraMuseumResponse>("/api/collection/museum");
  }

  appearancePlusCatalog(): Promise<ApiResponse<AppearancePlusCatalogResponse>> {
    return this.get<AppearancePlusCatalogResponse>("/api/appearance-plus/catalog");
  }

  equipAppearancePlus(
    body: EquipAppearancePlusRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipAppearancePlusResponse>> {
    return this.post<EquipAppearancePlusResponse, EquipAppearancePlusRequest>(
      "/api/appearance-plus/equip",
      body,
      { idempotencyKey },
    );
  }

  mentorSummary(): Promise<ApiResponse<MentorSummaryResponse>> {
    return this.get<MentorSummaryResponse>("/api/mentor/summary");
  }

  applyMentor(
    body: ApplyMentorRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<MentorMutationResponse>> {
    return this.post<MentorMutationResponse, ApplyMentorRequest>("/api/mentor/apply", body, {
      idempotencyKey,
    });
  }

  reviewMentor(
    body: ReviewMentorRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<MentorMutationResponse>> {
    return this.post<MentorMutationResponse, ReviewMentorRequest>("/api/mentor/review", body, {
      idempotencyKey,
    });
  }

  claimMentorTask(
    body: ClaimMentorTaskRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<MentorMutationResponse>> {
    return this.post<MentorMutationResponse, ClaimMentorTaskRequest>(
      "/api/mentor/task/claim",
      body,
      { idempotencyKey },
    );
  }

  graduateMentor(
    body: GraduateMentorRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<MentorMutationResponse>> {
    return this.post<MentorMutationResponse, GraduateMentorRequest>("/api/mentor/graduate", body, {
      idempotencyKey,
    });
  }

  sectDiplomacySummary(): Promise<ApiResponse<SectDiplomacySummaryResponse>> {
    return this.get<SectDiplomacySummaryResponse>("/api/sect/diplomacy/summary");
  }

  proposeSectDiplomacy(
    body: ProposeSectDiplomacyRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectDiplomacyMutationResponse>> {
    return this.post<SectDiplomacyMutationResponse, ProposeSectDiplomacyRequest>(
      "/api/sect/diplomacy/propose",
      body,
      { idempotencyKey },
    );
  }

  reviewSectDiplomacy(
    body: ReviewSectDiplomacyRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectDiplomacyMutationResponse>> {
    return this.post<SectDiplomacyMutationResponse, ReviewSectDiplomacyRequest>(
      "/api/sect/diplomacy/review",
      body,
      { idempotencyKey },
    );
  }

  sectHireList(): Promise<ApiResponse<SectHireListResponse>> {
    return this.get<SectHireListResponse>("/api/sect/hire/list");
  }

  createSectHire(
    body: CreateSectHireRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectHireMutationResponse>> {
    return this.post<SectHireMutationResponse, CreateSectHireRequest>(
      "/api/sect/hire/create",
      body,
      { idempotencyKey },
    );
  }

  acceptSectHire(
    body: AcceptSectHireRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectHireMutationResponse>> {
    return this.post<SectHireMutationResponse, AcceptSectHireRequest>(
      "/api/sect/hire/accept",
      body,
      { idempotencyKey },
    );
  }

  settleSectHire(
    body: SettleSectHireRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectHireMutationResponse>> {
    return this.post<SectHireMutationResponse, SettleSectHireRequest>(
      "/api/sect/hire/settle",
      body,
      { idempotencyKey },
    );
  }

  gameOverview(): Promise<ApiResponse<GameOverviewResponse>> {
    return this.get<GameOverviewResponse>("/api/game/overview");
  }

  dailyRoute(): Promise<ApiResponse<DailyRouteResponse>> {
    return this.get<DailyRouteResponse>("/api/game/daily-route");
  }

  worldProvinces(): Promise<ApiResponse<WorldProvinceListResponse>> {
    return this.get<WorldProvinceListResponse>("/api/world/provinces");
  }

  worldAtlas(): Promise<ApiResponse<WorldAtlasResponse>> {
    return this.get<WorldAtlasResponse>("/api/world/atlas");
  }

  worldMap(
    provinceId?: string,
    view?: WorldMapView,
    viewport?: WorldMapViewportRequest,
  ): Promise<ApiResponse<WorldMapResponse>> {
    const params = new URLSearchParams();
    if (provinceId) {
      params.set("province_id", provinceId);
    }
    if (view) {
      params.set("view", view);
    }
    if (viewport?.x !== undefined) params.set("x", String(viewport.x));
    if (viewport?.y !== undefined) params.set("y", String(viewport.y));
    if (viewport?.width !== undefined) params.set("width", String(viewport.width));
    if (viewport?.height !== undefined) params.set("height", String(viewport.height));
    const query = params.toString();
    return this.get<WorldMapResponse>(`/api/world/map${query ? `?${query}` : ""}`);
  }

  cityOverview(): Promise<ApiResponse<CityOverviewResponse>> {
    return this.get<CityOverviewResponse>("/api/city/overview");
  }

  cityManagement(): Promise<ApiResponse<CityManagementResponse>> {
    return this.get<CityManagementResponse>("/api/city/management");
  }

  herbGarden(): Promise<ApiResponse<HerbGardenState>> {
    return this.get<HerbGardenState>("/api/city/garden");
  }

  plantHerb(
    body: PlantHerbRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<PlantHerbResponse>> {
    return this.post<PlantHerbResponse, PlantHerbRequest>("/api/city/garden/plant", body, {
      idempotencyKey,
    });
  }

  harvestHerb(
    body: HarvestHerbRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<HarvestHerbResponse>> {
    return this.post<HarvestHerbResponse, HarvestHerbRequest>("/api/city/garden/harvest", body, {
      idempotencyKey,
    });
  }

  expandCity(idempotencyKey: string): Promise<ApiResponse<ExpandCityResponse>> {
    return this.post<ExpandCityResponse>("/api/city/expand", {}, { idempotencyKey });
  }

  collectTerritory(idempotencyKey: string): Promise<ApiResponse<CollectTerritoryResponse>> {
    return this.post<CollectTerritoryResponse>(
      "/api/city/territory/collect",
      {},
      { idempotencyKey },
    );
  }

  upgradeCityBuilding(
    body: UpgradeCityBuildingRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<UpgradeCityBuildingResponse>> {
    return this.post<UpgradeCityBuildingResponse, UpgradeCityBuildingRequest>(
      "/api/city/buildings/upgrade",
      body,
      { idempotencyKey },
    );
  }

  settleMainCity(
    body: SettleMainCityRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SettleMainCityResponse>> {
    return this.post<SettleMainCityResponse, SettleMainCityRequest>("/api/city/settle", body, {
      idempotencyKey,
    });
  }

  establishSubCity(
    body: EstablishSubCityRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EstablishSubCityResponse>> {
    return this.post<EstablishSubCityResponse, EstablishSubCityRequest>("/api/city/subcity", body, {
      idempotencyKey,
    });
  }

  worldMarches(): Promise<ApiResponse<WorldMarchListResponse>> {
    return this.get<WorldMarchListResponse>("/api/world/marches");
  }

  worldTerritory(): Promise<ApiResponse<TerritoryOverviewResponse>> {
    return this.get<TerritoryOverviewResponse>("/api/world/territory");
  }

  startWorldMarch(
    body: StartWorldMarchRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<StartWorldMarchResponse>> {
    return this.post<StartWorldMarchResponse, StartWorldMarchRequest>("/api/world/march", body, {
      idempotencyKey,
    });
  }

  occupyWorld(
    body: OccupyWorldRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<OccupyWorldResponse>> {
    return this.post<OccupyWorldResponse, OccupyWorldRequest>("/api/world/occupy", body, {
      idempotencyKey,
    });
  }

  purchaseWorldBlock(
    body: PurchaseWorldBlockRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<PurchaseWorldBlockResponse>> {
    return this.post<PurchaseWorldBlockResponse, PurchaseWorldBlockRequest>(
      "/api/world/blocks/purchase",
      body,
      { idempotencyKey },
    );
  }

  battles(
    filters: {
      province_id?: string;
      result?: "win" | "lose";
      enemy_trait?: string;
      battle_type?: string;
      limit?: number;
      before?: string;
    } = {},
  ): Promise<ApiResponse<BattleListResponse>> {
    const params = new URLSearchParams();
    if (filters.province_id) {
      params.set("province_id", filters.province_id);
    }
    if (filters.result) {
      params.set("result", filters.result);
    }
    if (filters.enemy_trait) {
      params.set("enemy_trait", filters.enemy_trait);
    }
    if (filters.battle_type) {
      params.set("battle_type", filters.battle_type);
    }
    if (filters.limit) {
      params.set("limit", String(filters.limit));
    }
    if (filters.before) {
      params.set("before", filters.before);
    }
    return this.get<BattleListResponse>(`/api/game/battles?${params.toString()}`);
  }

  provinces(): Promise<ApiResponse<{ provinces: ProvinceSummary[] }>> {
    return this.get<{ provinces: ProvinceSummary[] }>("/api/game/provinces");
  }

  journal(limit = 8, before?: string): Promise<ApiResponse<JournalListResponse>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) {
      params.set("before", before);
    }
    return this.get<JournalListResponse>(`/api/game/journal?${params.toString()}`);
  }

  claimCultivation(idempotencyKey: string): Promise<ApiResponse<CultivationClaimResponse>> {
    return this.post<CultivationClaimResponse>(
      "/api/game/cultivation/claim",
      {},
      {
        idempotencyKey,
      },
    );
  }

  breakthrough(idempotencyKey: string): Promise<ApiResponse<BreakthroughResponse>> {
    return this.post<BreakthroughResponse>(
      "/api/game/cultivation/breakthrough",
      {},
      {
        idempotencyKey,
      },
    );
  }

  explore(body: ExploreRequest, idempotencyKey: string): Promise<ApiResponse<ExploreResponse>> {
    return this.post<ExploreResponse, ExploreRequest>("/api/game/explore", body, {
      idempotencyKey,
    });
  }

  currentExplore(): Promise<ApiResponse<ExploreCurrentResponse>> {
    return this.get<ExploreCurrentResponse>("/api/game/explore/current");
  }

  exploreEvents(
    status: "pending" | "resolved" | "expired" | undefined = undefined,
    limit = 10,
  ): Promise<ApiResponse<ExploreEventListResponse>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) {
      params.set("status", status);
    }
    return this.get<ExploreEventListResponse>(`/api/game/explore/events?${params.toString()}`);
  }

  claimExplore(
    body: ExploreClaimRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ExploreResponse>> {
    return this.post<ExploreResponse, ExploreClaimRequest>("/api/game/explore/claim", body, {
      idempotencyKey,
    });
  }

  resolveExploreEvent(
    body: ResolveExploreEventRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ResolveExploreEventResponse>> {
    return this.post<ResolveExploreEventResponse, ResolveExploreEventRequest>(
      "/api/game/explore/events/resolve",
      body,
      { idempotencyKey },
    );
  }

  tasks(): Promise<ApiResponse<TaskSummaryResponse>> {
    return this.get<TaskSummaryResponse>("/api/game/tasks");
  }

  claimTask(
    body: TaskClaimRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<TaskClaimResponse>> {
    return this.post<TaskClaimResponse, TaskClaimRequest>("/api/game/tasks/claim", body, {
      idempotencyKey,
    });
  }

  collectCave(idempotencyKey: string): Promise<ApiResponse<CaveCollectResponse>> {
    return this.post<CaveCollectResponse>("/api/game/cave/collect", {}, { idempotencyKey });
  }

  bagItems(): Promise<ApiResponse<BagSummaryResponse>> {
    return this.get<BagSummaryResponse>("/api/production/bag/items");
  }

  setItemLock(
    body: SetItemLockRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SetItemLockResponse>> {
    return this.post<SetItemLockResponse, SetItemLockRequest>(
      "/api/production/bag/items/lock",
      body,
      {
        idempotencyKey,
      },
    );
  }

  alchemyRecipes(): Promise<ApiResponse<AlchemyRecipeListResponse>> {
    return this.get<AlchemyRecipeListResponse>("/api/production/alchemy/recipes");
  }

  alchemyRecords(): Promise<ApiResponse<AlchemyRecordListResponse>> {
    return this.get<AlchemyRecordListResponse>("/api/production/alchemy/records");
  }

  alchemyCraft(
    body: AlchemyCraftRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<AlchemyCraftResponse>> {
    return this.post<AlchemyCraftResponse, AlchemyCraftRequest>(
      "/api/production/alchemy/craft",
      body,
      { idempotencyKey },
    );
  }

  pillUse(body: PillUseRequest, idempotencyKey: string): Promise<ApiResponse<PillUseResponse>> {
    return this.post<PillUseResponse, PillUseRequest>("/api/production/pills/use", body, {
      idempotencyKey,
    });
  }

  forgeRecipes(): Promise<ApiResponse<ForgeRecipeListResponse>> {
    return this.get<ForgeRecipeListResponse>("/api/production/forge/recipes");
  }

  equipmentList(): Promise<ApiResponse<EquipmentListResponse>> {
    return this.get<EquipmentListResponse>("/api/production/equipment");
  }

  equipmentRecords(): Promise<ApiResponse<EquipmentOperationRecordListResponse>> {
    return this.get<EquipmentOperationRecordListResponse>("/api/production/equipment/records");
  }

  forgeCraft(
    body: ForgeCraftRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipmentOperationResponse>> {
    return this.post<EquipmentOperationResponse, ForgeCraftRequest>(
      "/api/production/forge/craft",
      body,
      { idempotencyKey },
    );
  }

  equipmentRefine(
    body: EquipmentTargetRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipmentOperationResponse>> {
    return this.post<EquipmentOperationResponse, EquipmentTargetRequest>(
      "/api/production/equipment/refine",
      body,
      { idempotencyKey },
    );
  }

  equipmentInscribe(
    body: EquipmentInscribeRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipmentOperationResponse>> {
    return this.post<EquipmentOperationResponse, EquipmentInscribeRequest>(
      "/api/production/equipment/inscribe",
      body,
      { idempotencyKey },
    );
  }

  equipmentDecompose(
    body: EquipmentTargetRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipmentOperationResponse>> {
    return this.post<EquipmentOperationResponse, EquipmentTargetRequest>(
      "/api/production/equipment/decompose",
      body,
      { idempotencyKey },
    );
  }

  setEquipmentLock(
    body: SetEquipmentLockRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<EquipmentOperationResponse>> {
    return this.post<EquipmentOperationResponse, SetEquipmentLockRequest>(
      "/api/production/equipment/lock",
      body,
      { idempotencyKey },
    );
  }

  skillLoadout(): Promise<ApiResponse<SkillLoadoutResponse>> {
    return this.get<SkillLoadoutResponse>("/api/production/skills/loadout");
  }

  learnSkill(
    body: LearnSkillRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<LearnSkillResponse>> {
    return this.post<LearnSkillResponse, LearnSkillRequest>("/api/production/skills/learn", body, {
      idempotencyKey,
    });
  }

  saveSkillLoadout(
    body: SaveSkillLoadoutRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SkillLoadoutResponse>> {
    return this.post<SkillLoadoutResponse, SaveSkillLoadoutRequest>(
      "/api/production/skills/loadout",
      body,
      { idempotencyKey },
    );
  }

  towers(): Promise<ApiResponse<TowerListResponse>> {
    return this.get<TowerListResponse>("/api/multiplayer/towers");
  }

  towerAction(
    body: TowerActionRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<TowerActionResponse>> {
    return this.post<TowerActionResponse, TowerActionRequest>(
      "/api/multiplayer/towers/action",
      body,
      {
        idempotencyKey,
      },
    );
  }

  worldBoss(): Promise<ApiResponse<WorldBossResponse>> {
    return this.get<WorldBossResponse>("/api/multiplayer/boss");
  }

  challengeBoss(
    body: WorldBossChallengeRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<WorldBossChallengeResponse>> {
    return this.post<WorldBossChallengeResponse, WorldBossChallengeRequest>(
      "/api/multiplayer/boss/challenge",
      body,
      { idempotencyKey },
    );
  }

  sects(): Promise<ApiResponse<SectListResponse>> {
    return this.get<SectListResponse>("/api/multiplayer/sects");
  }

  mySect(): Promise<ApiResponse<SectDetailResponse>> {
    return this.get<SectDetailResponse>("/api/multiplayer/sects/me");
  }

  createSect(
    body: CreateSectRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectMutationResponse>> {
    return this.post<SectMutationResponse, CreateSectRequest>(
      "/api/multiplayer/sects/create",
      body,
      {
        idempotencyKey,
      },
    );
  }

  joinSect(
    body: JoinSectRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectMutationResponse>> {
    return this.post<SectMutationResponse, JoinSectRequest>("/api/multiplayer/sects/join", body, {
      idempotencyKey,
    });
  }

  completeSectTask(
    body: { task_id: string },
    idempotencyKey: string,
  ): Promise<ApiResponse<SectTaskResponse>> {
    return this.post<SectTaskResponse, { task_id: string }>(
      "/api/multiplayer/sects/tasks/complete",
      body,
      { idempotencyKey },
    );
  }

  depositSectWarehouse(
    body: SectWarehouseDepositRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectWarehouseResponse>> {
    return this.post<SectWarehouseResponse, SectWarehouseDepositRequest>(
      "/api/multiplayer/sects/warehouse/deposit",
      body,
      { idempotencyKey },
    );
  }

  withdrawSectWarehouse(
    body: SectWarehouseWithdrawRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SectWarehouseResponse>> {
    return this.post<SectWarehouseResponse, SectWarehouseWithdrawRequest>(
      "/api/multiplayer/sects/warehouse/withdraw",
      body,
      { idempotencyKey },
    );
  }

  resourcePoints(): Promise<ApiResponse<ResourcePointListResponse>> {
    return this.get<ResourcePointListResponse>("/api/multiplayer/resource-points");
  }

  pvpAttack(
    body: PvpAttackRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<PvpBattleResponse>> {
    return this.post<PvpBattleResponse, PvpAttackRequest>("/api/multiplayer/pvp/attack", body, {
      idempotencyKey,
    });
  }

  ranks(rankType: RankType): Promise<ApiResponse<RankListResponse>> {
    return this.get<RankListResponse>(`/api/multiplayer/ranks/${rankType}`);
  }

  titleCollection(): Promise<ApiResponse<TitleCollectionResponse>> {
    return this.get<TitleCollectionResponse>("/api/multiplayer/titles");
  }

  claimRankTitle(
    body: ClaimRankTitleRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ClaimRankTitleResponse>> {
    return this.post<ClaimRankTitleResponse, ClaimRankTitleRequest>(
      "/api/multiplayer/titles/claim-rank",
      body,
      { idempotencyKey },
    );
  }

  innerWorldSummary(): Promise<ApiResponse<InnerWorldSummaryResponse>> {
    return this.get<InnerWorldSummaryResponse>("/api/inner-world/summary");
  }

  innerWorldAssignments(): Promise<ApiResponse<InnerWorldAssignmentListResponse>> {
    return this.get<InnerWorldAssignmentListResponse>("/api/inner-world/assignments");
  }

  innerWorldDispatch(
    body: InnerWorldDispatchRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<InnerWorldDispatchResponse>> {
    return this.post<InnerWorldDispatchResponse, InnerWorldDispatchRequest>(
      "/api/inner-world/dispatch",
      body,
      { idempotencyKey },
    );
  }

  innerWorldClaim(
    body: InnerWorldClaimRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<InnerWorldClaimResponse>> {
    return this.post<InnerWorldClaimResponse, InnerWorldClaimRequest>(
      "/api/inner-world/claim",
      body,
      { idempotencyKey },
    );
  }

  innerWorldUpgrade(
    body: InnerWorldUpgradeRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<InnerWorldUpgradeResponse>> {
    return this.post<InnerWorldUpgradeResponse, InnerWorldUpgradeRequest>(
      "/api/inner-world/upgrade",
      body,
      { idempotencyKey },
    );
  }

  innerWorldSupport(
    body: InnerWorldSupportRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<InnerWorldSupportResponse>> {
    return this.post<InnerWorldSupportResponse, InnerWorldSupportRequest>(
      "/api/inner-world/support",
      body,
      { idempotencyKey },
    );
  }

  factionRoutes(): Promise<ApiResponse<FactionRoutesResponse>> {
    return this.get<FactionRoutesResponse>("/api/factions/routes");
  }

  factionReputation(): Promise<ApiResponse<FactionReputationResponse>> {
    return this.get<FactionReputationResponse>("/api/factions/reputation");
  }

  chooseFactionRoute(
    body: ChooseFactionRouteRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ChooseFactionRouteResponse>> {
    return this.post<ChooseFactionRouteResponse, ChooseFactionRouteRequest>(
      "/api/factions/choose",
      body,
      { idempotencyKey },
    );
  }

  transferFactionRoute(
    body: TransferFactionRouteRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<TransferFactionRouteResponse>> {
    return this.post<TransferFactionRouteResponse, TransferFactionRouteRequest>(
      "/api/factions/transfer",
      body,
      { idempotencyKey },
    );
  }

  transferRules(): Promise<ApiResponse<TransferRuleResponse>> {
    return this.get<TransferRuleResponse>("/api/transfer/rules");
  }

  transferStatus(): Promise<ApiResponse<TransferStatusResponse>> {
    return this.get<TransferStatusResponse>("/api/transfer/status");
  }

  createTransferRequest(
    body: CreateTransferRequestRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<CreateTransferRequestResponse>> {
    return this.post<CreateTransferRequestResponse, CreateTransferRequestRequest>(
      "/api/transfer/request",
      body,
      { idempotencyKey },
    );
  }

  cancelTransferRequest(
    body: CancelTransferRequestRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<CancelTransferRequestResponse>> {
    return this.post<CancelTransferRequestResponse, CancelTransferRequestRequest>(
      "/api/transfer/cancel",
      body,
      { idempotencyKey },
    );
  }

  activityList(): Promise<ApiResponse<ActivityListResponse>> {
    return this.get<ActivityListResponse>("/api/events/list");
  }

  activityDetail(eventId: string): Promise<ApiResponse<ActivityDetailResponse>> {
    return this.get<ActivityDetailResponse>(`/api/events/${eventId}`);
  }

  submitActivityProgress(
    body: SubmitActivityProgressRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SubmitActivityProgressResponse>> {
    return this.post<SubmitActivityProgressResponse, SubmitActivityProgressRequest>(
      "/api/events/progress",
      body,
      { idempotencyKey },
    );
  }

  claimActivityReward(
    body: ClaimActivityRewardRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ClaimActivityRewardResponse>> {
    return this.post<ClaimActivityRewardResponse, ClaimActivityRewardRequest>(
      "/api/events/claim",
      body,
      { idempotencyKey },
    );
  }

  commerceOverview(): Promise<ApiResponse<EntitlementOverviewResponse>> {
    return this.get<EntitlementOverviewResponse>("/api/commerce/overview");
  }

  purchaseMonthlyCard(
    body: PurchaseMonthlyCardRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<PurchaseMonthlyCardResponse>> {
    return this.post<PurchaseMonthlyCardResponse, PurchaseMonthlyCardRequest>(
      "/api/commerce/monthly-cards/purchase",
      body,
      { idempotencyKey },
    );
  }

  claimMonthlyDaily(
    body: ClaimMonthlyDailyRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ClaimMonthlyDailyResponse>> {
    return this.post<ClaimMonthlyDailyResponse, ClaimMonthlyDailyRequest>(
      "/api/commerce/monthly-cards/claim-daily",
      body,
      { idempotencyKey },
    );
  }

  syncVip(body: SyncVipRequest, idempotencyKey: string): Promise<ApiResponse<SyncVipResponse>> {
    return this.post<SyncVipResponse, SyncVipRequest>("/api/commerce/vip/sync", body, {
      idempotencyKey,
    });
  }

  gachaPools(): Promise<ApiResponse<GachaPoolListResponse>> {
    return this.get<GachaPoolListResponse>("/api/commerce/gacha/pools");
  }

  gachaDraw(
    body: GachaDrawRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<GachaDrawResponse>> {
    return this.post<GachaDrawResponse, GachaDrawRequest>("/api/commerce/gacha/draw", body, {
      idempotencyKey,
    });
  }

  gachaHistory(): Promise<ApiResponse<GachaHistoryResponse>> {
    return this.get<GachaHistoryResponse>("/api/commerce/gacha/history");
  }

  ancientTreasures(): Promise<ApiResponse<AncientTreasureListResponse>> {
    return this.get<AncientTreasureListResponse>("/api/commerce/ancient-treasures");
  }

  convenienceBatchPreview(
    body: ConvenienceBatchPreviewRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<ConvenienceBatchPreviewResponse>> {
    return this.post<ConvenienceBatchPreviewResponse, ConvenienceBatchPreviewRequest>(
      "/api/commerce/convenience/batch-preview",
      body,
      { idempotencyKey },
    );
  }

  saveConvenienceStrategy(
    body: SaveConvenienceStrategyRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<SaveConvenienceStrategyResponse>> {
    return this.post<SaveConvenienceStrategyResponse, SaveConvenienceStrategyRequest>(
      "/api/commerce/convenience/strategies",
      body,
      { idempotencyKey },
    );
  }

  createAutomationQueue(
    body: CreateAutomationQueueRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<CreateAutomationQueueResponse>> {
    return this.post<CreateAutomationQueueResponse, CreateAutomationQueueRequest>(
      "/api/commerce/convenience/automation-queues",
      body,
      { idempotencyKey },
    );
  }

  appearances(): Promise<ApiResponse<AppearanceListResponse>> {
    return this.get<AppearanceListResponse>("/api/commerce/appearances");
  }

  claimAppearance(
    body: ClaimAppearanceRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<AppearanceMutationResponse>> {
    return this.post<AppearanceMutationResponse, ClaimAppearanceRequest>(
      "/api/commerce/appearances/claim",
      body,
      { idempotencyKey },
    );
  }

  equipAppearance(
    body: EquipAppearanceRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<AppearanceMutationResponse>> {
    return this.post<AppearanceMutationResponse, EquipAppearanceRequest>(
      "/api/commerce/appearances/equip",
      body,
      { idempotencyKey },
    );
  }

  getPlayerLogs(input: {
    playerId: string;
    type: AdminLogType;
    adminToken: string;
  }): Promise<ApiResponse<AdminPlayerLogsResponse>> {
    return this.get<AdminPlayerLogsResponse>(
      `/api/admin/logs/player/${encodeURIComponent(input.playerId)}?type=${input.type}`,
      {
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  getPlayerRisk(input: {
    playerId: string;
    adminToken: string;
  }): Promise<ApiResponse<AdminPlayerRiskResponse>> {
    return this.get<AdminPlayerRiskResponse>(
      `/api/admin/risk/player/${encodeURIComponent(input.playerId)}`,
      {
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  listRiskRecords(input: {
    adminToken: string;
    playerId?: string;
    riskStatus?: string;
    limit?: number;
  }): Promise<ApiResponse<AdminRiskRecordListResponse>> {
    const params = new URLSearchParams();
    if (input.playerId) {
      params.set("player_id", input.playerId);
    }
    if (input.riskStatus) {
      params.set("risk_status", input.riskStatus);
    }
    if (input.limit) {
      params.set("limit", String(input.limit));
    }

    return this.get<AdminRiskRecordListResponse>(`/api/admin/risk/records?${params}`, {
      headers: {
        "X-Admin-Token": input.adminToken,
      },
    });
  }

  listDelayedSettlements(input: {
    adminToken: string;
    playerId?: string;
    status?: string;
    limit?: number;
  }): Promise<ApiResponse<AdminDelayedSettlementListResponse>> {
    const params = new URLSearchParams();
    if (input.playerId) {
      params.set("player_id", input.playerId);
    }
    if (input.status) {
      params.set("status", input.status);
    }
    if (input.limit) {
      params.set("limit", String(input.limit));
    }

    return this.get<AdminDelayedSettlementListResponse>(
      `/api/admin/risk/delayed-settlements?${params}`,
      {
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  reviewDelayedSettlement(
    body: ReviewDelayedSettlementRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<ReviewDelayedSettlementResponse>> {
    return this.post<ReviewDelayedSettlementResponse, ReviewDelayedSettlementRequest>(
      "/api/admin/risk/review",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  getAdminPlayerDigest(input: {
    playerId: string;
    adminToken: string;
  }): Promise<ApiResponse<AdminPlayerDigestResponse>> {
    return this.get<AdminPlayerDigestResponse>(
      `/api/admin/player-digest?player_id=${encodeURIComponent(input.playerId)}`,
      {
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  listAdminMails(input: {
    adminToken: string;
    playerId?: string;
  }): Promise<ApiResponse<AdminMailListResponse>> {
    const params = new URLSearchParams();
    if (input.playerId) {
      params.set("player_id", input.playerId);
    }

    return this.get<AdminMailListResponse>(`/api/admin/mails?${params}`, {
      headers: {
        "X-Admin-Token": input.adminToken,
      },
    });
  }

  sendAdminMail(
    body: SendAdminMailRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<SendAdminMailResponse>> {
    return this.post<SendAdminMailResponse, SendAdminMailRequest>("/api/admin/mails/send", body, {
      idempotencyKey: input.idempotencyKey,
      headers: {
        "X-Admin-Token": input.adminToken,
      },
    });
  }

  listAnnouncements(input: {
    adminToken: string;
  }): Promise<ApiResponse<AnnouncementListResponse>> {
    return this.get<AnnouncementListResponse>("/api/admin/announcements", {
      headers: {
        "X-Admin-Token": input.adminToken,
      },
    });
  }

  createAnnouncement(
    body: CreateAnnouncementRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<CreateAnnouncementResponse>> {
    return this.post<CreateAnnouncementResponse, CreateAnnouncementRequest>(
      "/api/admin/announcements",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  listAdminConfigVersions(input: {
    adminToken: string;
    configType?: string;
  }): Promise<ApiResponse<AdminConfigVersionListResponse>> {
    const params = new URLSearchParams();
    if (input.configType) {
      params.set("config_type", input.configType);
    }

    return this.get<AdminConfigVersionListResponse>(`/api/admin/configs?${params}`, {
      headers: {
        "X-Admin-Token": input.adminToken,
      },
    });
  }

  publishAdminConfig(
    body: PublishAdminConfigRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<PublishAdminConfigResponse>> {
    return this.post<PublishAdminConfigResponse, PublishAdminConfigRequest>(
      "/api/admin/configs/publish",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  rollbackAdminConfig(
    body: RollbackAdminConfigRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<RollbackAdminConfigResponse>> {
    return this.post<RollbackAdminConfigResponse, RollbackAdminConfigRequest>(
      "/api/admin/configs/rollback",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  resolveRiskRecord(
    body: ResolveRiskRecordRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<ResolveRiskRecordResponse>> {
    return this.post<ResolveRiskRecordResponse, ResolveRiskRecordRequest>(
      "/api/admin/risk/resolve",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  createMergeDryRun(
    body: CreateMergeDryRunRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<CreateMergeDryRunResponse>> {
    return this.post<CreateMergeDryRunResponse, CreateMergeDryRunRequest>(
      "/api/admin/merge/dry-run",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  getMergeDryRunReport(input: {
    reportId: string;
    adminToken: string;
  }): Promise<ApiResponse<MergeDryRunReportResponse>> {
    return this.get<MergeDryRunReportResponse>(
      `/api/admin/merge/dry-run?report_id=${encodeURIComponent(input.reportId)}`,
      {
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  reserveMergeExecution(
    body: ExecuteMergeReservedRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<ExecuteMergeReservedResponse>> {
    return this.post<ExecuteMergeReservedResponse, ExecuteMergeReservedRequest>(
      "/api/admin/merge/execute",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  createTransferDryRun(
    body: AdminCreateTransferDryRunRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<AdminCreateTransferDryRunResponse>> {
    return this.post<AdminCreateTransferDryRunResponse, AdminCreateTransferDryRunRequest>(
      "/api/admin/transfer/dry-run",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  reviewTransferRequest(
    body: AdminReviewTransferRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<AdminReviewTransferResponse>> {
    return this.post<AdminReviewTransferResponse, AdminReviewTransferRequest>(
      "/api/admin/transfer/review",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  executeTransferReserved(
    body: AdminExecuteTransferRequest,
    input: { adminToken: string; idempotencyKey: string },
  ): Promise<ApiResponse<AdminExecuteTransferResponse>> {
    return this.post<AdminExecuteTransferResponse, AdminExecuteTransferRequest>(
      "/api/admin/transfer/execute",
      body,
      {
        idempotencyKey: input.idempotencyKey,
        headers: {
          "X-Admin-Token": input.adminToken,
        },
      },
    );
  }

  listGmOperations(input: {
    adminToken: string;
  }): Promise<ApiResponse<AdminGmOperationListResponse>> {
    return this.get<AdminGmOperationListResponse>("/api/admin/operations", {
      headers: {
        "X-Admin-Token": input.adminToken,
      },
    });
  }

  pluginStatusCard(): Promise<ApiResponse<PluginStatusCardResponse>> {
    return this.get<PluginStatusCardResponse>("/api/plugin/status-card");
  }

  pluginExpandedPanel(): Promise<ApiResponse<PluginExpandedPanelResponse>> {
    return this.get<PluginExpandedPanelResponse>("/api/plugin/expanded-panel");
  }

  pluginQuickClaim(
    body: PluginQuickClaimRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<PluginQuickClaimResponse>> {
    return this.post<PluginQuickClaimResponse, PluginQuickClaimRequest>(
      "/api/plugin/quick-claim",
      body,
      { idempotencyKey },
    );
  }

  pluginSubmitPreset(
    body: PluginSubmitPresetRequest,
    idempotencyKey: string,
  ): Promise<ApiResponse<PluginSubmitPresetResponse>> {
    return this.post<PluginSubmitPresetResponse, PluginSubmitPresetRequest>(
      "/api/plugin/submit-preset",
      body,
      { idempotencyKey },
    );
  }

  pluginNavigationLinks(): Promise<ApiResponse<PluginNavigationLinksResponse>> {
    return this.get<PluginNavigationLinksResponse>("/api/plugin/navigation-links");
  }

  private async request<TData>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<TData>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Request-Id": createRequestId(),
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (this.clientVersion) {
      headers["X-Client-Version"] = this.clientVersion;
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return (await response.json()) as ApiResponse<TData>;
  }
}

export function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `req_${globalThis.crypto.randomUUID()}`;
  }

  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
