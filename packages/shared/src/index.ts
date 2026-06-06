export type ClientPlatform = "web" | "h5" | "admin" | "fishpi_plugin";

export type CultivationRoute = "qi" | "body";

export type EntitlementTier =
  | "free"
  | "vip1"
  | "vip2"
  | "vip3"
  | "vip4"
  | "small_monthly"
  | "large_monthly";

export type RiskStatus =
  | "normal"
  | "rate_limited"
  | "delayed_settlement"
  | "decayed"
  | "manual_review";

export type SettlementStatus = "settled" | "delayed" | "rejected";

export interface RiskResult {
  risk_status: RiskStatus;
  risk_record_id: string | null;
  settlement_status: SettlementStatus;
}

export interface ApiResponse<TData> {
  code: number;
  message: string;
  server_time: number;
  data: TData;
  trace_id: string;
}

export const ErrorCode = {
  ok: 0,
  authRequired: 10000,
  validationFailed: 70000,
  systemError: 90000,
  rateLimited: 90010,
  entitlementRequired: 90011,
  batchLimitExceeded: 90012,
  strategySlotExceeded: 90013,
  delayedSettlement: 90014,
  manualReviewRequired: 90015,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface HealthStatus {
  status: "ok";
  service: string;
  version: string;
}

export interface PublicAccount {
  account_id: string;
  account_type: string;
  username: string | null;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

export interface PlayerSummary {
  player_id: string;
  account_id: string;
  name: string;
  route: CultivationRoute;
  alignment: string;
  current_realm: number;
  current_stage: number;
  current_level: number;
  status: string;
}

export interface PlayerProgressState {
  player_id: string;
  era_id: string;
  cultivation_value: string;
  breakthrough_fail_count: number;
  calamity_value: number;
  chapter_id: number;
  catchup_bonus_rate: number;
  newbie_protection_until: string | null;
  daily_active_score: number;
  weekly_active_score: number;
  cultivation_rate_per_hour: number;
  last_cultivation_at: string;
}

export interface PlayerWalletState {
  player_id: string;
  spirit_stone: string;
  immortal_stone: string;
  jade_paid: string;
  jade_bound: string;
  era_point: string;
}

export interface GuestLoginRequest {
  device_id?: string;
  nickname?: string;
}

export interface MockFishpiLoginRequest {
  fishpi_user_id: string;
  username: string;
}

export interface LoginResponse {
  token: string;
  expires_in: string;
  account: PublicAccount;
  player: PlayerSummary | null;
}

export interface AuthMeResponse {
  account: PublicAccount;
  player: PlayerSummary | null;
}

export interface PlayerProfileResponse {
  player: PlayerSummary | null;
  progress: PlayerProgressState | null;
  wallet: PlayerWalletState | null;
}

export interface CreatePlayerRequest {
  name: string;
  route: CultivationRoute;
}

export interface CreatePlayerResponse {
  record_id: string;
  profile: PlayerProfileResponse;
}

export interface CultivationStatus {
  cultivation_value: string;
  current_realm: number;
  current_stage: number;
  current_level: number;
  current_level_required: string;
  claimable_cultivation: string;
  catchup_bonus_rate: number;
  last_cultivation_at: string;
  can_breakthrough: boolean;
}

export interface CultivationClaimResponse {
  record_id: string;
  gained_cultivation: string;
  before_level: number;
  after_level: number;
  status: CultivationStatus;
  completed_task_ids: string[];
}

export interface BreakthroughResponse {
  record_id: string;
  success: boolean;
  message: string;
  profile: PlayerProfileResponse;
}

export interface ActionState {
  action_points: number;
  action_point_cap: number;
  action_point_restore_per_hour: number;
  last_recovered_at: string;
}

export interface ProvinceSummary {
  province_id: string;
  name: string;
  tower_name: string;
  chapter_required: number;
  unlocked: boolean;
  recommended_action: string;
  tower_integrity: number;
  rift_pressure: number;
  corruption: number;
  spirit_vein_level: number;
  exploration_count: number;
  best_explore_stage: number;
}

export interface BattleRoundLog {
  round: number;
  actor: string;
  skill: string;
  damage: number;
  target_hp: number;
}

export interface BattleSummary {
  battle_id: string;
  battle_type: string;
  province_id: string;
  enemy_id: string;
  enemy_name: string;
  result: "win" | "lose";
  rounds: number;
  damage_done: number;
  damage_taken: number;
  rewards: RewardBundle;
  log: BattleRoundLog[];
  created_at: string;
}

export interface RewardBundle {
  cultivation?: string;
  spirit_stone?: string;
  action_points?: number;
  items?: Array<{
    item_id: string;
    name: string;
    count: number;
    bind_type: string;
  }>;
}

export interface ExploreRequest {
  province_id: string;
  count?: number;
}

export interface ExploreResponse {
  record_id: string;
  action_state: ActionState;
  battles: BattleSummary[];
  rewards: RewardBundle;
  completed_task_ids: string[];
}

export interface TaskState {
  task_state_id: string;
  task_id: string;
  task_type: "novice" | "daily" | "weekly" | "chapter";
  title: string;
  target_value: number;
  progress_value: number;
  status: "in_progress" | "completed" | "claimed";
  reset_key: string;
  rewards: RewardBundle;
}

export interface TaskSummaryResponse {
  tasks: TaskState[];
}

export interface TaskClaimRequest {
  task_id: string;
}

export interface TaskClaimResponse {
  record_id: string;
  task: TaskState;
  rewards: RewardBundle;
  wallet: PlayerWalletState;
  action_state: ActionState;
}

export interface CaveState {
  spirit_field_level: number;
  spirit_array_level: number;
  alchemy_room_level: number;
  refinery_room_level: number;
  last_collected_at: string;
  claimable_minutes: number;
  preview_rewards: RewardBundle;
}

export interface CaveCollectResponse {
  record_id: string;
  cave: CaveState;
  rewards: RewardBundle;
  wallet: PlayerWalletState;
  completed_task_ids: string[];
}

export interface GameOverviewResponse {
  profile: PlayerProfileResponse;
  cultivation: CultivationStatus | null;
  action_state: ActionState | null;
  provinces: ProvinceSummary[];
  tasks: TaskState[];
  cave: CaveState | null;
  recent_battles: BattleSummary[];
}

export type ConfigType =
  | "realm"
  | "item"
  | "reward"
  | "action"
  | "world"
  | "task"
  | "battle"
  | "cave";

export interface ConfigEnvelope<TPayload = Record<string, unknown>> {
  config_type: string;
  config_version: string;
  ruleset_version: string;
  reward_config_version: string;
  payload: TPayload;
}

export type AdminLogType = "behavior" | "audit" | "login" | "wallet";

export interface AdminPlayerLogsResponse {
  player_id: string;
  type: AdminLogType;
  rows: Array<Record<string, unknown>>;
}

export function createTraceId(prefix = "req"): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function createSuccessResponse<TData>(
  data: TData,
  traceId: string,
  message = "ok",
): ApiResponse<TData> {
  return {
    code: ErrorCode.ok,
    message,
    server_time: Math.floor(Date.now() / 1000),
    data,
    trace_id: traceId,
  };
}
