import type {
  AdminLogType,
  AdminPlayerLogsResponse,
  AlchemyCraftRequest,
  AlchemyCraftResponse,
  AlchemyRecipeListResponse,
  AlchemyRecordListResponse,
  ApiResponse,
  AuthMeResponse,
  BagSummaryResponse,
  BreakthroughResponse,
  CaveCollectResponse,
  ConfigEnvelope,
  ConfigType,
  CreatePlayerRequest,
  CreatePlayerResponse,
  CreateSectRequest,
  CultivationClaimResponse,
  EquipmentInscribeRequest,
  EquipmentListResponse,
  EquipmentOperationRecordListResponse,
  EquipmentOperationResponse,
  EquipmentTargetRequest,
  ExploreRequest,
  ExploreResponse,
  ForgeCraftRequest,
  ForgeRecipeListResponse,
  GameOverviewResponse,
  GuestLoginRequest,
  JoinSectRequest,
  LoginResponse,
  MockFishpiLoginRequest,
  PillUseRequest,
  PillUseResponse,
  PlayerProfileResponse,
  ProvinceSummary,
  PvpAttackRequest,
  PvpBattleResponse,
  RankListResponse,
  RankType,
  ResourcePointListResponse,
  SaveSkillLoadoutRequest,
  SectDetailResponse,
  SectListResponse,
  SectMutationResponse,
  SectTaskResponse,
  SectWarehouseDepositRequest,
  SectWarehouseResponse,
  SectWarehouseWithdrawRequest,
  SetEquipmentLockRequest,
  SetItemLockRequest,
  SetItemLockResponse,
  SkillLoadoutResponse,
  TaskClaimRequest,
  TaskClaimResponse,
  TaskSummaryResponse,
  TowerActionRequest,
  TowerActionResponse,
  TowerListResponse,
  WorldBossChallengeRequest,
  WorldBossChallengeResponse,
  WorldBossResponse,
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

  gameOverview(): Promise<ApiResponse<GameOverviewResponse>> {
    return this.get<GameOverviewResponse>("/api/game/overview");
  }

  provinces(): Promise<ApiResponse<{ provinces: ProvinceSummary[] }>> {
    return this.get<{ provinces: ProvinceSummary[] }>("/api/game/provinces");
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
