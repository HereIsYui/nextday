import type {
  AdminLogType,
  AdminPlayerLogsResponse,
  ApiResponse,
  AuthMeResponse,
  ConfigEnvelope,
  ConfigType,
  CreatePlayerRequest,
  CreatePlayerResponse,
  GuestLoginRequest,
  LoginResponse,
  MockFishpiLoginRequest,
  PlayerProfileResponse,
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
