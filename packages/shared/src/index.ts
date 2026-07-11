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

export type RiskLevel = "normal" | "low" | "medium" | "high";
export type RiskDecisionAction =
  | "observe"
  | "truncate"
  | "decay"
  | "delay_settlement"
  | "reject"
  | "rate_limit"
  | "manual_review";

export interface BehaviorRiskRecordState {
  risk_record_id: string;
  account_id: string | null;
  player_id: string | null;
  era_id: string;
  risk_domain: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  source_record_id: string | null;
  risk_status: RiskStatus;
  risk_level: RiskLevel;
  risk_score: number;
  rule_codes: string[];
  decision_action: RiskDecisionAction | string;
  settlement_status: SettlementStatus;
  request_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown> | null;
  risk_ruleset_version: string;
  resolution_status: "open" | "resolved";
  resolution_reason: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface DelayedSettlementRecordState {
  settlement_record_id: string;
  player_id: string;
  era_id: string;
  source_type: string;
  source_id: string | null;
  source_record_id: string | null;
  risk_record_id: string | null;
  status: SettlementStatus;
  amount_snapshot: Record<string, unknown>;
  review_action: string | null;
  review_reason: string | null;
  reviewer: string | null;
  config_version: string;
  reward_config_version: string;
  risk_ruleset_version: string;
  created_at: string;
  reviewed_at: string | null;
  settled_at: string | null;
}

export interface AdminPlayerRiskResponse {
  player_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  current_status: RiskStatus;
  recent_rule_codes: string[];
  behavior_summary: {
    total_requests_24h: number;
    high_frequency_paths: Array<{ path: string; count: number }>;
    distinct_ip_count: number;
    distinct_user_agent_count: number;
  };
  recent_records: BehaviorRiskRecordState[];
  delayed_settlements: DelayedSettlementRecordState[];
}

export interface AdminRiskRecordListResponse {
  records: BehaviorRiskRecordState[];
}

export interface AdminDelayedSettlementListResponse {
  records: DelayedSettlementRecordState[];
}

export interface ReviewDelayedSettlementRequest {
  settlement_record_id: string;
  action: "release" | "reject";
  reason?: string;
  reviewer?: string;
}

export interface ReviewDelayedSettlementResponse {
  record: DelayedSettlementRecordState;
}

export interface ResolveRiskRecordRequest {
  risk_record_id: string;
  reason?: string;
  operator?: string;
}

export interface ResolveRiskRecordResponse {
  record: BehaviorRiskRecordState;
  operation: AdminGmOperationState;
}

export interface ApiResponse<TData> {
  code: number;
  message: string;
  server_time: number;
  data: TData;
  trace_id: string;
}

export type ExperienceTone = "neutral" | "success" | "warning" | "danger";

export interface ExperienceTimelineEntry {
  step: number;
  title: string;
  description: string;
  tone?: ExperienceTone;
}

export interface ExperienceDeltaSummary {
  label: string;
  before?: string | number | null;
  after?: string | number | null;
  delta?: string | number | null;
  tone?: ExperienceTone;
}

export interface ExperienceRecommendation {
  label: string;
  reason: string;
  action_hint?: string;
  priority?: "low" | "medium" | "high";
}

export interface ExperienceReasonTag {
  code: string;
  label: string;
  description?: string;
  tone?: ExperienceTone;
}

export interface ExperiencePayload {
  title: string;
  summary: string;
  timeline: ExperienceTimelineEntry[];
  delta_summary: ExperienceDeltaSummary[];
  next_recommendations: ExperienceRecommendation[];
  reason_tags: ExperienceReasonTag[];
}

export interface JournalEntryState {
  journal_entry_id: string;
  source_type: string;
  source_id: string | null;
  title: string;
  summary: string;
  delta_summary: string[];
  tags: string[];
  recommendations: string[];
  experience?: ExperiencePayload;
  config_version: string;
  created_at: string;
}

export interface JournalListResponse {
  entries: JournalEntryState[];
  next_cursor: string | null;
}

export type StoryScrollUnlockState = "locked" | "unlocked" | "archived";

export interface StoryScrollFragmentState {
  fragment_id: string;
  title: string;
  body: string;
  fragment_type: "opening" | "choice" | "battle_ref" | "ending" | string;
  unlocked: boolean;
  source_type?: string;
  source_id?: string | null;
}

export interface StoryBattleReference {
  battle_id: string;
  battle_type: string;
  title: string;
  summary: string;
  result: "win" | "lose" | string;
  created_at: string;
}

export interface StoryScrollSummaryState {
  scroll_record_id: string | null;
  scroll_id: string;
  title: string;
  subtitle: string;
  chapter_id: number;
  unlock_state: StoryScrollUnlockState;
  progress_percent: number;
  latest_fragment: string;
  updated_at: string | null;
  story_config_version: string;
}

export interface StoryScrollDetailState extends StoryScrollSummaryState {
  fragments: StoryScrollFragmentState[];
  battle_refs: StoryBattleReference[];
  choice_summary: string[];
  sensitive_filtered: boolean;
}

export interface StoryScrollListResponse {
  scrolls: StoryScrollSummaryState[];
}

export interface StoryScrollDetailResponse {
  scroll: StoryScrollDetailState;
}

export interface BattleNarrativeResponse {
  battle_id: string;
  battle_type: string;
  title: string;
  summary: string;
  narrative_lines: string[];
  key_rounds: string[];
  result_reason: string[];
  source_battle_id: string;
  story_config_version: string;
}

export interface EraChronicleEntryState {
  chronicle_id: string;
  era_id: string;
  server_id: string;
  chronicle_type: string;
  title: string;
  summary: string;
  highlights: string[];
  visibility_rule: "public" | "server" | "sect" | "personal" | "admin" | string;
  related_source_ids: string[];
  created_at: string;
}

export interface EraChronicleResponse {
  entries: EraChronicleEntryState[];
  story_config_version: string;
  collection_config_version: string;
}

export type EraCollectionType =
  | "story_scroll"
  | "era_chronicle"
  | "title"
  | "tower_achievement"
  | "faction_ending"
  | "event_memorial"
  | "ancient_catalog"
  | string;

export interface EraCollectionItemState {
  collection_record_id: string | null;
  collection_id: string;
  name: string;
  collection_type: EraCollectionType;
  rarity: "common" | "rare" | "epic" | "legendary" | string;
  source_type: string;
  source_id: string | null;
  source_hint: string;
  era_id: string;
  owned: boolean;
  inherited: boolean;
  duplicate_count: number;
  display_level: number;
  display_slot: string | null;
  display_positions: string[];
  inherit_rule: string;
  duplicate_convert: string;
  blessing_percent: number;
  effective_blessing_percent: number;
  stat_bonus: null;
  unlock_hint: string;
  public_summary: string;
  updated_at: string | null;
}

export interface CollectionDisplaySlotState {
  slot_id: string;
  name: string;
  allowed_types: EraCollectionType[];
  equipped_collection_id: string | null;
  equipped_name: string | null;
}

export interface CollectionBlessingSummary {
  cap_percent: number;
  effective_percent: number;
  stacking_rule: string;
}

export interface CollectionSummaryResponse {
  collections: EraCollectionItemState[];
  display_slots: CollectionDisplaySlotState[];
  chronicle_entries: EraChronicleEntryState[];
  blessing_summary: CollectionBlessingSummary;
  config_version: string;
  ruleset_version: string;
}

export interface EquipCollectionDisplayRequest {
  collection_id: string;
  display_slot: string;
}

export interface EquipCollectionDisplayResponse {
  record_id: string;
  collection: EraCollectionItemState;
  display_slots: CollectionDisplaySlotState[];
  blessing_summary: CollectionBlessingSummary;
}

export interface EraMuseumResponse {
  entries: EraChronicleEntryState[];
  featured_collections: EraCollectionItemState[];
  sensitive_filtered: boolean;
  config_version: string;
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

export type WalletSnapshot = PlayerWalletState;

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
  experience?: ExperiencePayload;
}

export interface BreakthroughResponse {
  record_id: string;
  success: boolean;
  message: string;
  profile: PlayerProfileResponse;
  experience?: ExperiencePayload;
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
  theme: string;
  tower_name: string;
  chapter_required: number;
  unlocked: boolean;
  recommended_action: string;
  resources: string[];
  low_level_entry: string;
  long_term_goal: string;
  tower_effect: string;
  tower_integrity: number;
  rift_pressure: number;
  corruption: number;
  spirit_vein_level: number;
  exploration_count: number;
  best_explore_stage: number;
}

export type WorldTileType =
  | "main_city"
  | "sub_city"
  | "wild"
  | "resource"
  | "pass"
  | "capital"
  | "tower"
  | "rift";

export type WorldTerrainType = "plain" | "swamp" | "forest" | "mountain" | "desert";

export type WorldTileVisibility = "hidden" | "scouted" | "visible";

export type WorldMapView = "mini" | "detail";

export type TerritoryNodeType =
  | "main_city"
  | "sub_city"
  | "farm"
  | "mine"
  | "forest"
  | "vein"
  | "pass"
  | "capital"
  | "tower"
  | "rift";

export type TerritoryNodeStatus = "idle" | "occupied" | "contested" | "protected" | "locked";

export interface WorldOwnerState {
  owner_player_id: string | null;
  owner_player_name: string | null;
  owner_sect_id: string | null;
  owner_sect_name: string | null;
  owner_province_id: string | null;
  owner_province_name: string | null;
}

export interface ProvinceWarState {
  province_id: string;
  province_name: string;
  season_id: string;
  season_name: string;
  rank: number;
  score: number;
  city_occupancy_rate: number;
  spirit_vein_control_rate: number;
  pass_control_count: number;
  tower_state: "sealed" | "stable" | "contested" | "polluted";
  dominant_sect_name: string | null;
  daily_settlement_at: string;
  weekly_settlement_at: string;
}

export interface WorldCommanderyState {
  commandery_id: string;
  province_id: string;
  name: string;
  terrain: string;
  birth_available: boolean;
  recommended_birth: boolean;
  congestion: "low" | "medium" | "high";
  resource_theme: string[];
  safety_level: number;
  tile_count: number;
  birth_plain_count: number;
}

export interface WorldProvinceState {
  province_id: string;
  name: string;
  theme: string;
  tower_name: string;
  birth_available: boolean;
  recommended_birth: boolean;
  congestion: "low" | "medium" | "high";
  season_state: "preseason" | "active" | "settling";
  map_focus: string;
  block_count: number;
  tower_block_count: number;
  birth_plain_count: number;
  commanderies: WorldCommanderyState[];
  war_state: ProvinceWarState;
}

export interface TerritoryNodeState {
  node_id: string;
  tile_id: string;
  node_type: TerritoryNodeType;
  node_name: string;
  level: number;
  status: TerritoryNodeStatus;
  occupiable: boolean;
  contestable: boolean;
  protected: boolean;
  production_summary: string;
  defense_summary: string;
  owner: WorldOwnerState;
}

export interface WorldBlockOwnershipState {
  ownership_id: string | null;
  owner_player_id: string | null;
  owner_player_name: string | null;
  ownership_type: "main_city" | "purchase" | "occupation" | "system" | null;
  owned_at: string | null;
}

export interface WorldBlockPurchaseState {
  purchasable: boolean;
  reason: string;
  cost_spirit_stone: string;
  adjacent_owned: boolean;
}

export interface MapTileState {
  tile_id: string;
  province_id: string;
  province_name: string;
  commandery_id: string;
  commandery_name: string;
  tile_type: WorldTileType;
  terrain_type: WorldTerrainType;
  terrain_label: string;
  terrain_effects: string[];
  landmark_group_id: string | null;
  tile_name: string;
  x: number;
  y: number;
  visibility: WorldTileVisibility;
  status: "peace" | "wild" | "occupied" | "contested" | "protected" | "locked";
  controllable: boolean;
  occupiable: boolean;
  protected: boolean;
  danger_level: number;
  travel_seconds: number;
  labels: string[];
  state_summary: string;
  owner: WorldOwnerState;
  ownership: WorldBlockOwnershipState;
  purchase_state: WorldBlockPurchaseState;
  nodes: TerritoryNodeState[];
}

export interface WorldMiniMapSummary {
  province_id: string;
  total_blocks: number;
  owned_blocks: number;
  neutral_blocks: number;
  contested_blocks: number;
  tower_blocks: number;
  capital_blocks: number;
  pass_blocks: number;
  my_blocks: number;
  terrain_counts: Record<WorldTerrainType, number>;
}

export interface WorldProvinceListResponse {
  provinces: WorldProvinceState[];
  recommended_province_id: string;
  season_id: string;
  season_name: string;
  config_version: string;
}

export interface WorldMapResponse {
  view: WorldMapView;
  province: WorldProvinceState;
  commanderies: WorldCommanderyState[];
  tiles: MapTileState[];
  block_count: number;
  mini_map_summary: WorldMiniMapSummary;
  visible_tile_count: number;
  occupiable_tile_count: number;
  my_occupations: TerritoryOccupationState[];
  player_city_hint: string;
  config_version: string;
}

export type PlayerCityType = "main" | "sub";

export type PlayerCityStatus = "normal" | "protected" | "damaged" | "besieged" | "vassal";

export interface CityResourceSnapshot {
  spirit_stone: string;
  grain: string;
  ore: string;
  wood: string;
  herb: string;
  soldier: string;
}

export interface CityDefenseSnapshot {
  wall_durability: number;
  wall_durability_cap: number;
  garrison_power: number;
  protection_label: string;
}

export interface PlayerCityState {
  city_id: string;
  city_type: PlayerCityType;
  province_id: string;
  province_name: string;
  commandery_id: string;
  commandery_name: string;
  tile_id: string;
  city_name: string;
  city_level: number;
  status: PlayerCityStatus;
  protection_until: string | null;
  owner_sect_id: string | null;
  defense: CityDefenseSnapshot;
  resources: CityResourceSnapshot;
  created_at: string;
  updated_at: string;
}

export interface CityBirthOptionState {
  province_id: string;
  province_name: string;
  commandery_id: string;
  commandery_name: string;
  tile_id: string;
  tile_name: string;
  available: boolean;
  recommended: boolean;
  congestion: "low" | "medium" | "high";
  safety_level: number;
  unavailable_reason: string | null;
}

export interface CityOverviewResponse {
  main_city: PlayerCityState | null;
  sub_cities: PlayerCityState[];
  birth_options: CityBirthOptionState[];
  strategic_hint: string;
  config_version: string;
}

export interface SettleMainCityRequest {
  province_id: string;
  commandery_id?: string;
  city_name?: string;
}

export interface SettleMainCityResponse {
  record_id: string;
  city: PlayerCityState;
  overview: CityOverviewResponse;
}

export type MarchQueueStatus = "marching" | "arrived" | "resolved" | "cancelled";

export type MarchType = "scout" | "clear_wild" | "occupy" | "reinforce";

export interface MarchTeamSnapshot {
  leader_name: string;
  soldier_count: number;
  team_power: number;
  supply_cost: number;
}

export interface MarchQueueState {
  march_id: string;
  source_city_id: string;
  source_city_name: string;
  source_tile_id: string;
  target_tile_id: string;
  target_name: string;
  province_id: string;
  province_name: string;
  commandery_id: string;
  commandery_name: string;
  march_type: MarchType;
  status: MarchQueueStatus;
  team: MarchTeamSnapshot;
  travel_seconds: number;
  remaining_seconds: number;
  started_at: string;
  arrives_at: string;
  resolved_at: string | null;
  action_hint: string;
}

export interface WorldMarchListResponse {
  marches: MarchQueueState[];
  active_count: number;
  config_version: string;
}

export interface StartWorldMarchRequest {
  target_tile_id: string;
  source_city_id?: string;
  march_type?: MarchType;
}

export interface StartWorldMarchResponse {
  record_id: string;
  march: MarchQueueState;
  marches: WorldMarchListResponse;
}

export type TerritoryOccupationType = "wild" | "resource" | "vein" | "pass" | "capital" | "tower";

export type TerritoryOccupationStatus = "occupied" | "contested" | "protected" | "abandoned";

export interface TerritoryProductionSnapshot {
  spirit_stone_per_hour: number;
  grain_per_hour: number;
  ore_per_hour: number;
  wood_per_hour: number;
  herb_per_hour: number;
  province_score_per_day: number;
}

export interface TerritoryDefenseSnapshot {
  guard_power: number;
  stationed_soldiers: number;
  defense_hint: string;
}

export interface TerritoryOccupationState {
  occupation_id: string;
  tile_id: string;
  node_id: string | null;
  tile_name: string;
  province_id: string;
  province_name: string;
  commandery_id: string;
  commandery_name: string;
  occupation_type: TerritoryOccupationType;
  status: TerritoryOccupationStatus;
  owner_player_id: string;
  owner_player_name: string;
  production: TerritoryProductionSnapshot;
  defense: TerritoryDefenseSnapshot;
  occupied_at: string;
  updated_at: string;
}

export interface OccupyWorldRequest {
  march_id: string;
}

export interface OccupyWorldResponse {
  record_id: string;
  occupation: TerritoryOccupationState;
  march: MarchQueueState;
  map: WorldMapResponse;
}

export interface PurchaseWorldBlockRequest {
  tile_id: string;
}

export interface PurchaseWorldBlockResponse {
  record_id: string;
  tile: MapTileState;
  map: WorldMapResponse;
  wallet: WalletSnapshot;
}

export interface TerritoryHourlyOutputState {
  spirit_stone: number;
  grain: number;
  ore: number;
  wood: number;
  herb: number;
}

export interface TerritoryTerrainSummaryState {
  terrain_type: WorldTerrainType;
  terrain_label: string;
  block_count: number;
  hourly_output: TerritoryHourlyOutputState;
}

export interface TerritoryBlockState {
  tile_id: string;
  tile_name: string;
  province_id: string;
  province_name: string;
  commandery_id: string;
  commandery_name: string;
  terrain_type: WorldTerrainType;
  terrain_label: string;
  ownership_type: NonNullable<WorldBlockOwnershipState["ownership_type"]>;
  owned_at: string;
  hourly_output: TerritoryHourlyOutputState;
  city_expansion_eligible: boolean;
}

export interface CityExpansionCostState {
  spirit_stone: number;
  grain: number;
  ore: number;
  wood: number;
}

export interface CityExpansionState {
  city_level: number;
  next_city_level: number | null;
  maximum_city_level: number;
  building_slots: number;
  owned_plain_blocks: number;
  required_plain_blocks: number;
  eligible: boolean;
  reason: string;
  cost: CityExpansionCostState | null;
}

export interface TerritoryOverviewResponse {
  main_city: PlayerCityState | null;
  owned_block_count: number;
  block_limit: number;
  remaining_block_capacity: number;
  hourly_output: TerritoryHourlyOutputState;
  terrain_summary: TerritoryTerrainSummaryState[];
  blocks: TerritoryBlockState[];
  expansion: CityExpansionState | null;
  next_purchase_hint: string;
  config_version: string;
}

export interface ExpandCityResponse {
  record_id: string;
  city: PlayerCityState;
  expansion: CityExpansionState;
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
  enemy_traits?: string[];
  result: "win" | "lose";
  rounds: number;
  damage_done: number;
  damage_taken: number;
  rewards: RewardBundle;
  log: BattleRoundLog[];
  reason_summary?: string[];
  counter_suggestions?: string[];
  loot_highlights?: string[];
  battle_hint?: string;
  created_at: string;
}

export interface BattleListResponse {
  battles: BattleSummary[];
  next_cursor: string | null;
  filters: {
    province_id?: string;
    result?: "win" | "lose";
    enemy_trait?: string;
    battle_type?: string;
  };
}

export interface RewardBundle {
  cultivation?: string;
  spirit_stone?: string;
  jade_paid?: string;
  jade_bound?: string;
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

export type ExploreActionStatus = "pending" | "completed" | "claimed" | "expired";

export type ExploreEventStatus = "pending" | "resolved" | "expired";

export interface ExploreEventChoice {
  choice_id: string;
  label: string;
  description: string;
  reward_preview: string;
  outcome_hint?: string;
}

export interface ExploreEventState {
  event_id: string;
  explore_record_id: string;
  province_id: string;
  province_name: string;
  event_type: string;
  rarity?: "common" | "uncommon" | "rare" | string;
  title: string;
  description: string;
  prerequisite_hint?: string;
  route_step_hint?: string;
  status: ExploreEventStatus;
  choices: ExploreEventChoice[];
  selected_choice_id: string | null;
  rewards: RewardBundle;
  experience?: ExperiencePayload;
  created_at: string;
  resolved_at: string | null;
}

export interface ExploreResponse {
  record_id: string;
  province_id: string;
  province_name: string;
  count: number;
  status: ExploreActionStatus;
  seconds_per_explore: number;
  total_seconds: number;
  started_at: string;
  completes_at: string;
  claimed_at: string | null;
  can_claim: boolean;
  action_state: ActionState;
  battles: BattleSummary[];
  rewards: RewardBundle;
  completed_task_ids: string[];
  experience?: ExperiencePayload;
  event?: ExploreEventState | null;
  linked_event_hint?: string | null;
}

export interface ExploreCurrentResponse {
  current: ExploreResponse | null;
}

export interface ExploreClaimRequest {
  record_id?: string;
}

export interface ExploreEventListResponse {
  events: ExploreEventState[];
}

export interface ResolveExploreEventRequest {
  event_id: string;
  choice_id: string;
}

export interface ResolveExploreEventResponse {
  event: ExploreEventState;
  rewards: RewardBundle;
  experience: ExperiencePayload;
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
  experience?: ExperiencePayload;
}

export type NewPlayerRouteStepStatus = "done" | "active" | "pending";
export type RouteStepViewState = "ready" | "waiting" | "blocked" | "jump" | "done";

export interface NewPlayerRouteStepState {
  step_id: string;
  title: string;
  detail: string;
  status: NewPlayerRouteStepStatus;
  action_hint: string;
  action_label: string;
  unlock_hint?: string;
}

export interface NewPlayerRouteState {
  route_id: string;
  title: string;
  subtitle: string;
  progress_percent: number;
  progress_text: string;
  primary_step_id: string;
  primary_action_hint: string;
  steps: NewPlayerRouteStepState[];
  config_version: string;
}

export interface DailyRouteStepState extends NewPlayerRouteStepState {
  priority: number;
  source_detail?: string;
  reason_tags?: string[];
  target_tab?: string;
  view_state?: RouteStepViewState;
  state_label?: string;
  state_detail?: string;
}

export interface DailyRouteResponse {
  route_id: string;
  title: string;
  subtitle: string;
  progress_percent: number;
  progress_text: string;
  primary_step_id: string;
  primary_action_hint: string;
  generated_at: string;
  next_refresh_hint: string;
  steps: DailyRouteStepState[];
  config_version: string;
}

export type InnerWorldCreatureStatus = "idle" | "assigned" | "training";
export type InnerWorldAssignmentStatus = "active" | "claimable" | "claimed";
export type InnerWorldSupportType = "spirit_vein" | "tower_supply" | "secret_realm";

export interface InnerWorldStateSummary {
  unlocked: boolean;
  unlock_hint: string;
  world_level: number;
  law_level: number;
  law_exp: number;
  next_law_exp_required: number;
  creature_capacity: number;
  assignment_limit: number;
  active_assignment_count: number;
  claimable_assignment_count: number;
  support_count_today: number;
  support_limit_daily: number;
  config_version: string;
  reward_config_version: string;
}

export interface InnerWorldCreatureState {
  creature_id: string;
  creature_type: string;
  name: string;
  level: number;
  affinity_province_id: string | null;
  status: InnerWorldCreatureStatus | string;
  assignment_bonus_summary: Record<string, unknown>;
}

export interface InnerWorldAssignmentState {
  assignment_id: string;
  creature_id: string;
  creature_name: string;
  province_id: string;
  province_name: string;
  status: InnerWorldAssignmentStatus | string;
  started_at: string;
  ends_at: string;
  claimed_at: string | null;
  remaining_seconds: number;
  rewards: RewardBundle;
  law_exp_gain: number;
}

export interface InnerWorldLawRecordState {
  law_record_id: string;
  law_type: string;
  exp_delta: number;
  source_type: string;
  source_id: string;
  before_level: number;
  after_level: number;
  before_exp: number;
  after_exp: number;
  created_at: string;
}

export interface InnerWorldSupportRecordState {
  support_record_id: string;
  province_id: string;
  province_name: string;
  tower_id: string | null;
  support_type: InnerWorldSupportType | string;
  cost_summary: RewardBundle;
  reward_summary: RewardBundle;
  contribution_summary: Record<string, unknown>;
  created_at: string;
}

export interface InnerWorldSummaryResponse {
  state: InnerWorldStateSummary;
  creatures: InnerWorldCreatureState[];
  assignments: InnerWorldAssignmentState[];
  recent_law_records: InnerWorldLawRecordState[];
  recent_support_records: InnerWorldSupportRecordState[];
}

export interface InnerWorldAssignmentListResponse {
  assignments: InnerWorldAssignmentState[];
  support_records: InnerWorldSupportRecordState[];
}

export interface InnerWorldDispatchRequest {
  creature_id?: string;
  province_id: string;
}

export interface InnerWorldDispatchResponse {
  record_id: string;
  state: InnerWorldStateSummary;
  assignment: InnerWorldAssignmentState;
  creatures: InnerWorldCreatureState[];
  experience?: ExperiencePayload;
}

export interface InnerWorldClaimRequest {
  assignment_id?: string;
}

export interface InnerWorldClaimResponse {
  record_id: string;
  state: InnerWorldStateSummary;
  assignments: InnerWorldAssignmentState[];
  rewards: RewardBundle;
  law_exp_gained: number;
  bag: BagSummaryResponse;
  experience?: ExperiencePayload;
}

export interface InnerWorldUpgradeRequest {
  target_type: "world" | "creature";
  creature_id?: string;
}

export interface InnerWorldUpgradeResponse {
  record_id: string;
  state: InnerWorldStateSummary;
  creature?: InnerWorldCreatureState;
  cost: RewardBundle;
  experience?: ExperiencePayload;
}

export interface InnerWorldSupportRequest {
  province_id: string;
  support_type: InnerWorldSupportType | string;
}

export interface InnerWorldSupportResponse {
  record_id: string;
  state: InnerWorldStateSummary;
  support: InnerWorldSupportRecordState;
  bag: BagSummaryResponse;
  experience?: ExperiencePayload;
}

export type FactionRouteId = "undecided" | "immortal" | "demon" | "wanderer";

export interface FactionRouteConfigState {
  route_id: FactionRouteId | string;
  name: string;
  stance_label: string;
  theme: string;
  core_goal: string;
  task_chain: string[];
  weekly_focus: string[];
  reputation_rule: string;
  title_id: string;
  title_name: string;
  chronicle_title: string;
  ending_summary: string;
  display_appearance_id: string;
  reward_boundary: string;
}

export interface FactionStateSummary {
  route: FactionRouteId | string;
  route_name: string;
  unlocked: boolean;
  unlock_hint: string;
  reputation: {
    immortal: number;
    demon: number;
    wanderer: number;
  };
  route_chosen_at: string | null;
  transfer_cooldown_until: string | null;
  transfer_available: boolean;
  transfer_count: number;
  title_id: string | null;
  title_name: string | null;
  chronicle_title: string | null;
  ending_summary: string | null;
  display_appearance_id: string | null;
  sect_alignment: SectAlignment | string | null;
  sect_conflict: boolean;
  sect_conflict_hint: string | null;
  config_version: string;
  reward_config_version: string;
}

export interface FactionTransferRecordState {
  transfer_record_id: string;
  from_route: FactionRouteId | string;
  to_route: FactionRouteId | string;
  task_id: string;
  cost_summary: RewardBundle;
  reputation_clear_summary: Record<string, unknown>;
  sect_conflict: boolean;
  previous_sect_alignment: SectAlignment | string | null;
  title_id: string | null;
  display_appearance_id: string | null;
  created_at: string;
}

export interface FactionRoutesResponse {
  state: FactionStateSummary;
  routes: FactionRouteConfigState[];
  transfer_rule: {
    cooldown_days: number;
    base_cost: RewardBundle;
    reputation_clear_rate: number;
  };
  recent_records: FactionTransferRecordState[];
}

export interface ChooseFactionRouteRequest {
  route_id: FactionRouteId | string;
}

export interface ChooseFactionRouteResponse {
  record_id: string;
  state: FactionStateSummary;
  selected_route: FactionRouteConfigState;
  experience?: ExperiencePayload;
}

export interface TransferFactionRouteRequest {
  route_id: FactionRouteId | string;
  task_id: string;
}

export interface TransferFactionRouteResponse {
  record_id: string;
  state: FactionStateSummary;
  transfer_record: FactionTransferRecordState;
  wallet: PlayerWalletState;
  experience?: ExperiencePayload;
}

export interface FactionReputationResponse {
  state: FactionStateSummary;
  routes: FactionRouteConfigState[];
  recent_records: FactionTransferRecordState[];
}

export type ItemCategory =
  | "material"
  | "pill"
  | "currency"
  | "equipment_material"
  | "tower_material"
  | "sect_material"
  | "battle_material"
  | "inner_world_material"
  | "treasure_page"
  | "unknown";

export type ItemBindType = "bound" | "unbound" | "paid" | "limited";

export interface BagItemState {
  item_instance_id: string;
  item_id: string;
  name: string;
  category: ItemCategory;
  count: string;
  quality?: PillQuality | null;
  bind_type: ItemBindType | string;
  locked: boolean;
  tradeable: boolean;
  expired: boolean;
  expire_at: string | null;
  source_type: string;
}

export interface BagSummaryResponse {
  items: BagItemState[];
}

export interface SetItemLockRequest {
  item_instance_id: string;
  locked: boolean;
}

export interface SetItemLockResponse {
  record_id: string;
  item: BagItemState;
}

export type PillQuality = "low" | "middle" | "high" | "best" | "flawless";

export interface AlchemyRecipeSummary {
  recipe_id: string;
  name: string;
  route: CultivationRoute | "all";
  pill_item_id: string;
  pill_rank: number;
  pill_type: string;
  base_effect: number;
  success_rate: number;
  materials: Array<{ item_id: string; name: string; count: number }>;
  spirit_stone_cost: string;
  recommendation?: ProductionRecommendationState;
}

export interface AlchemyRecipeListResponse {
  recipes: AlchemyRecipeSummary[];
}

export interface AlchemyCraftRequest {
  recipe_id: string;
}

export interface AlchemyRecordState {
  record_id: string;
  recipe_id: string;
  pill_item_id: string | null;
  quality: PillQuality | null;
  success: boolean;
  count: number;
  materials: RewardBundle;
  failure_returns: RewardBundle | null;
  result: RewardBundle;
  config_version: string;
  reward_config_version: string;
  created_at: string;
}

export interface AlchemyCraftResponse {
  record_id: string;
  record: AlchemyRecordState;
  rewards: RewardBundle;
  wallet: PlayerWalletState;
  bag: BagSummaryResponse;
  completed_task_ids?: string[];
  experience?: ExperiencePayload;
}

export interface AlchemyRecordListResponse {
  records: AlchemyRecordState[];
}

export interface PillUseRequest {
  item_instance_id: string;
}

export interface PillUseResponse {
  record_id: string;
  pill_item_id: string;
  quality: PillQuality;
  same_tier_use_count: number;
  effective_rate: number;
  effect_value: number;
  before_cultivation: string;
  after_cultivation: string;
  profile: PlayerProfileResponse;
}

export type EquipmentRarity = "ordinary" | "earth" | "heaven" | "immortal" | "ancient_craft";
export type EquipmentAffixType = "main" | "sub" | "hidden";

export interface EquipmentAffixState {
  affix_id: string;
  affix_type: EquipmentAffixType;
  affix_key: string;
  name: string;
  value: number;
  locked: boolean;
}

export interface EquipmentState {
  equipment_instance_id: string;
  equipment_id: string;
  name: string;
  equipment_type: string;
  rarity: EquipmentRarity | string;
  star_level: number;
  bind_type: ItemBindType | string;
  locked: boolean;
  equipped_slot: string | null;
  durability: number;
  max_durability: number;
  source_type: string;
  status: string;
  affixes: EquipmentAffixState[];
  created_at: string;
}

export interface EquipmentListResponse {
  equipments: EquipmentState[];
}

export interface ForgeRecipeSummary {
  recipe_id: string;
  name: string;
  route: CultivationRoute | "all";
  equipment_id: string;
  equipment_type: string;
  rarity: EquipmentRarity;
  materials: Array<{ item_id: string; name: string; count: number }>;
  spirit_stone_cost: string;
  recommendation?: ProductionRecommendationState;
}

export interface MaterialSourceState {
  source_type: "explore" | "cave" | "event" | "decompose" | "task" | "commerce" | "system";
  source_id: string;
  name: string;
  action_label: string;
  province_id?: string;
  province_name?: string;
  estimated_runs?: number;
  note: string;
}

export interface MaterialRequirementState {
  item_id: string;
  name: string;
  required: number;
  owned: number;
  missing: number;
  source_hints?: MaterialSourceState[];
  shortage_hint?: string;
}

export interface ProductionBalanceWarningState {
  item_id: string;
  name: string;
  period_days: 1 | 7 | 30;
  risk_type: "shortage" | "stockpile" | "fast_graduation";
  severity: "info" | "warning" | "danger";
  message: string;
  suggestion: string;
}

export interface ProductionRecommendationState {
  recommended: boolean;
  reason: string;
  material_gaps: MaterialRequirementState[];
  result_hint: string;
  next_action_hint: string;
  can_craft: boolean;
  priority_score?: number;
  recommendation_tags?: string[];
  usage_hint?: string;
  balance_warnings?: ProductionBalanceWarningState[];
}

export interface ForgeRecipeListResponse {
  recipes: ForgeRecipeSummary[];
}

export interface ForgeCraftRequest {
  recipe_id: string;
}

export interface EquipmentOperationResponse {
  record_id: string;
  operation_type: "forge" | "refine" | "inscribe" | "decompose" | "lock";
  equipment: EquipmentState | null;
  rewards?: RewardBundle;
  wallet?: PlayerWalletState;
  bag?: BagSummaryResponse;
  completed_task_ids?: string[];
  experience?: ExperiencePayload;
}

export interface EquipmentOperationRecordState {
  record_id: string;
  equipment_instance_id: string | null;
  operation_type: string;
  materials: RewardBundle;
  result: Record<string, unknown>;
  config_version: string;
  created_at: string;
}

export interface EquipmentOperationRecordListResponse {
  records: EquipmentOperationRecordState[];
}

export interface EquipmentTargetRequest {
  equipment_instance_id: string;
}

export interface EquipmentInscribeRequest extends EquipmentTargetRequest {
  affix_id: string;
}

export interface SetEquipmentLockRequest extends EquipmentTargetRequest {
  locked: boolean;
}

export interface SkillSummary {
  skill_id: string;
  name: string;
  route: CultivationRoute | "all";
  skill_type: "active" | "treasure";
  cooldown_rounds: number;
  priority_hint: number;
  description: string;
}

export interface SkillLearningState extends SkillSummary {
  learned: boolean;
  learnable: boolean;
  unlock_reasons: string[];
  learn_cost?: RewardBundle;
  preset_hint?: string;
  counter_traits?: string[];
}

export interface SkillPresetSuggestionState {
  suggestion_id: string;
  title: string;
  reason: string;
  enemy_traits: string[];
  active_skill_ids: string[];
  treasure_skill_id: string;
  auto_priority: string[];
}

export interface SkillLoadoutResponse {
  active_skill_ids: string[];
  treasure_skill_id: string;
  auto_priority: string[];
  available_skills: SkillLearningState[];
  preset_suggestions?: SkillPresetSuggestionState[];
}

export interface SaveSkillLoadoutRequest {
  active_skill_ids: string[];
  treasure_skill_id: string;
  auto_priority?: string[];
}

export interface LearnSkillRequest {
  skill_id: string;
}

export interface LearnSkillResponse {
  record_id: string;
  skill: SkillLearningState;
  loadout: SkillLoadoutResponse;
  wallet: PlayerWalletState;
  bag: BagSummaryResponse;
  experience?: ExperiencePayload;
}

export type TowerActionType = "seal" | "break" | "supply" | "guard";

export interface TowerStateSummary {
  tower_id: string;
  province_id: string;
  tower_name: string;
  mechanism: string;
  boss_name: string;
  material_name: string;
  state_effect: string;
  integrity: number;
  seal_progress: number;
  break_progress: number;
  supply_progress: number;
  rift_pressure: number;
  corruption: number;
  phase: number;
}

export interface TowerListResponse {
  towers: TowerStateSummary[];
}

export interface TowerActionRequest {
  tower_id: string;
  action_type: TowerActionType;
  count?: number;
}

export interface TowerActionResponse {
  record_id: string;
  tower: TowerStateSummary;
  contribution: number;
  rewards: RewardBundle;
  action_state: ActionState;
  risk_status?: RiskStatus;
  risk_record_id?: string | null;
  settlement_status: SettlementStatus;
  completed_task_ids?: string[];
  reason_summary?: string[];
  counter_suggestions?: string[];
  battle_hint?: string;
  experience?: ExperiencePayload;
}

export interface WorldBossStateSummary {
  boss_id: string;
  name: string;
  phase: number;
  total_hp: number;
  remaining_hp: number;
  defeated_count: number;
}

export interface WorldBossResponse {
  boss: WorldBossStateSummary;
}

export interface WorldBossChallengeRequest {
  boss_id: string;
}

export interface WorldBossChallengeResponse {
  record_id: string;
  boss: WorldBossStateSummary;
  damage_done: number;
  contribution: number;
  result: "active" | "phase_defeated";
  rewards: RewardBundle;
  action_state: ActionState;
  log: BattleRoundLog[];
  reason_summary?: string[];
  counter_suggestions?: string[];
  battle_hint?: string;
  experience?: ExperiencePayload;
}

export type SectAlignment = "immortal" | "demon" | "neutral";
export type SectRole = "leader" | "elder" | "deacon" | "disciple";

export interface SectSummary {
  sect_id: string;
  name: string;
  alignment: SectAlignment | string;
  level: number;
  funds: string;
  build_exp: number;
  member_limit: number;
  member_count: number;
  my_role: SectRole | null;
  my_contribution_weekly: number;
  my_contribution_total: number;
}

export interface SectMemberSummary {
  player_id: string;
  name: string;
  role: SectRole | string;
  contribution_weekly: number;
  contribution_total: number;
}

export interface SectWarehouseItemState {
  item_id: string;
  name: string;
  count: string;
}

export interface SectDetailResponse {
  sect: SectSummary | null;
  members: SectMemberSummary[];
  warehouse: SectWarehouseItemState[];
}

export interface SectListResponse {
  sects: SectSummary[];
}

export interface CreateSectRequest {
  name: string;
  alignment: SectAlignment;
}

export interface JoinSectRequest {
  sect_id: string;
}

export interface SectMutationResponse {
  record_id: string;
  sect: SectSummary;
  wallet?: PlayerWalletState;
}

export interface CompleteSectTaskRequest {
  task_id: string;
}

export interface SectTaskResponse {
  record_id: string;
  sect: SectSummary;
  contribution: number;
  rewards: RewardBundle;
  experience?: ExperiencePayload;
}

export interface SectWarehouseDepositRequest {
  item_instance_id: string;
  count: number;
}

export interface SectWarehouseWithdrawRequest {
  item_id: string;
  count: number;
}

export interface SectWarehouseResponse {
  record_id: string;
  sect: SectSummary;
  warehouse: SectWarehouseItemState[];
  bag?: BagSummaryResponse;
  experience?: ExperiencePayload;
}

export interface ResourcePointSummary {
  resource_point_id: string;
  province_id: string;
  name: string;
  owner_sect_id: string | null;
  owner_player_id: string | null;
  control_score: number;
}

export interface ResourcePointListResponse {
  resource_points: ResourcePointSummary[];
}

export interface PvpAttackRequest {
  defender_player_id: string;
  resource_point_id?: string;
}

export interface PvpBattleResponse {
  record_id: string;
  result: "win" | "lose";
  score_delta: number;
  risk_status: RiskStatus;
  risk_record_id?: string | null;
  settlement_status: SettlementStatus;
  rewards: RewardBundle;
  action_state: ActionState;
  battle: {
    attacker_player_id: string;
    defender_player_id: string;
    attacker_power: number;
    defender_power: number;
    log: BattleRoundLog[];
  };
  resource_point: ResourcePointSummary | null;
  reason_summary?: string[];
  counter_suggestions?: string[];
  battle_hint?: string;
  experience?: ExperiencePayload;
}

export type RankType =
  | "personal"
  | "sect"
  | "pvp_week"
  | "tower_week"
  | "production"
  | "era"
  | "inner_world"
  | "faction";

export type RankTargetType = "player" | "sect" | "faction";

export interface RankTitleRewardState {
  title_id: string;
  name: string;
  appearance_id: string;
  rank_type: RankType | string;
  min_rank: number;
  inherited: boolean;
  blessing_percent: number;
  source_type: string;
}

export interface RankEntryState {
  rank_no: number;
  target_type: RankTargetType;
  target_id: string;
  display_name: string;
  score: string;
  reward_preview: RewardBundle;
  title_reward?: RankTitleRewardState | null;
  risk_note?: string | null;
}

export interface RankListResponse {
  rank_type: RankType;
  period_key: string;
  snapshot_id?: string;
  generated_at?: string;
  reward_boundary?: string;
  anti_brush_summary?: {
    excluded_delayed_count: number;
    risk_record_count: number;
    rule: string;
  };
  title_rewards?: RankTitleRewardState[];
  entries: RankEntryState[];
}

export interface TitleCollectionResponse {
  titles: AppearanceState[];
  rank_title_rewards: RankTitleRewardState[];
  era_blessing: {
    owned_inherited_count: number;
    blessing_cap_percent: number;
    effective_percent: number;
    rule: string;
  };
  reward_boundary: string;
}

export interface ClaimRankTitleRequest {
  rank_type: RankType | string;
}

export interface ClaimRankTitleResponse {
  record_id: string;
  appearance: AppearanceState;
  collection: TitleCollectionResponse;
  rank_entry: RankEntryState;
}

export type ActivityEventType =
  | "jiuzhou_travel"
  | "craft_trial"
  | "sect_celebration"
  | "return_support"
  | "compensation";

export type ActivityRewardState =
  | "unsettled"
  | "claimable"
  | "claimed"
  | "compensated"
  | "rolled_back";

export interface ActivityTemplateState {
  event_id: string;
  event_type: ActivityEventType | string;
  name: string;
  description: string;
  action_label: string;
  async_enabled: boolean;
  target_progress: number;
  action_point_cost: number;
  contribution_per_action: number;
  rank_score_per_action: number;
  reward_preview: RewardBundle;
  reward_boundary: string;
  announcement_template: {
    title: string;
    content: string;
  };
}

export interface ActivityRecordState {
  event_record_id: string;
  event_instance_id: string;
  event_id: string;
  player_id: string;
  period_key: string;
  province_id: string | null;
  sect_id: string | null;
  progress: number;
  target_progress: number;
  contribution: string;
  rank_score: string;
  reward_state: ActivityRewardState | string;
  event_config_version: string;
  reward_config_version: string;
  ruleset_version: string;
  created_at: string;
  settled_at: string | null;
}

export interface ActivitySummaryState {
  event_instance_id: string;
  event_id: string;
  event_type: ActivityEventType | string;
  name: string;
  description: string;
  status: "preview" | "active" | "settling" | "ended" | "rolled_back" | string;
  async_enabled: boolean;
  starts_at: string;
  ends_at: string;
  settlement_at: string;
  progress: number;
  target_progress: number;
  reward_state: ActivityRewardState | string;
  claimable: boolean;
  action_label: string;
  reward_preview: RewardBundle;
  reward_boundary: string;
}

export interface ActivityListResponse {
  events: ActivitySummaryState[];
  claimable_count: number;
  async_rule: string;
  reward_boundary: string;
}

export interface ActivityDetailResponse {
  event: ActivitySummaryState;
  template: ActivityTemplateState;
  record: ActivityRecordState | null;
  announcement_template: {
    title: string;
    content: string;
  };
  progress_actions: Array<{
    action_type: string;
    label: string;
    count_limit: number;
    action_point_cost: number;
  }>;
}

export interface SubmitActivityProgressRequest {
  event_id: string;
  count?: number;
  province_id?: string;
}

export interface SubmitActivityProgressResponse {
  record_id: string;
  event: ActivitySummaryState;
  record: ActivityRecordState;
  action_state: ActionState | null;
  contribution_gained: number;
  rank_score_gained: number;
  reward_state: ActivityRewardState | string;
  experience?: ExperiencePayload;
}

export interface ClaimActivityRewardRequest {
  event_id: string;
}

export interface ClaimActivityRewardResponse {
  reward_record_id: string;
  event: ActivitySummaryState;
  record: ActivityRecordState;
  rewards: RewardBundle;
  experience?: ExperiencePayload;
}

export type MonthlyCardType = "small_monthly" | "large_monthly";
export type GachaPoolType = "permanent" | "ancient_treasure";
export type GachaCostType =
  | "paid_jade"
  | "bound_jade"
  | "monthly_grant"
  | "ancient_page"
  | "reserved_paid_jade";

export interface MonthlyCardProductState {
  product_id: string;
  card_type: MonthlyCardType;
  name: string;
  fishpi_point_cost: string;
  duration_days: number;
  daily_paid_jade: string;
  daily_bound_jade: string;
  daily_ancient_draws: number;
}

export interface MonthlyCardStateSummary {
  card_type: MonthlyCardType;
  active: boolean;
  active_until: string;
  remaining_days: number;
  last_claim_date: string | null;
}

export interface MonthlyCardDrawGrantState {
  grant_id: string;
  card_type: MonthlyCardType;
  pool_type: GachaPoolType;
  grant_date: string;
  draw_count: number;
  used_count: number;
  expires_at: string;
}

export interface PurchaseMonthlyCardRequest {
  card_type: MonthlyCardType;
}

export interface PurchaseMonthlyCardResponse {
  order_id: string;
  monthly_card: MonthlyCardStateSummary;
  wallet: PlayerWalletState;
}

export interface ClaimMonthlyDailyRequest {
  card_type: MonthlyCardType;
}

export interface ClaimMonthlyDailyResponse {
  record_id: string;
  claimed: boolean;
  card_type: MonthlyCardType;
  rewards: RewardBundle;
  grants: MonthlyCardDrawGrantState[];
  wallet: PlayerWalletState;
}

export interface VipStateSummary {
  vip_level: 0 | 1 | 2 | 3 | 4;
  active: boolean;
  active_until: string | null;
  convenience_tier: EntitlementTier;
}

export interface SyncVipRequest {
  vip_level: 0 | 1 | 2 | 3 | 4;
  active_days?: number;
}

export interface SyncVipResponse {
  record_id: string;
  vip: VipStateSummary;
  rewards: RewardBundle;
  wallet: PlayerWalletState;
}

export interface ConvenienceRuleState {
  tier: EntitlementTier;
  batch_sweep_limit: number;
  strategy_slots: number;
  preset_slots: number;
  automation_queue: "none" | "single_play" | "simple_cross_play" | "core_daily";
  reward_multiplier: 1;
}

export interface EntitlementOverviewResponse {
  effective_tier: EntitlementTier;
  monthly_cards: MonthlyCardStateSummary[];
  vip: VipStateSummary;
  convenience: ConvenienceRuleState;
  available_monthly_grants: MonthlyCardDrawGrantState[];
}

export interface GachaPoolState {
  pool_type: GachaPoolType;
  name: string;
  allowed_cost_types: GachaCostType[];
  reserved_cost_types: GachaCostType[];
  single_cost: string;
  guarantee_at: number;
  pity_count: number;
  total_draws: number;
  result_ids: string[];
}

export interface GachaPoolListResponse {
  pools: GachaPoolState[];
}

export interface GachaDrawRequest {
  pool_type: GachaPoolType;
  cost_type: GachaCostType;
  grant_id?: string;
}

export interface GachaResultState {
  result_type: "item" | "ancient_treasure";
  result_id: string;
  result_name: string;
  duplicate: boolean;
  conversion: RewardBundle | null;
}

export interface GachaDrawResponse {
  gacha_id: string;
  pool_type: GachaPoolType;
  cost_type: GachaCostType;
  result: GachaResultState;
  pity_before: number;
  pity_after: number;
  wallet: PlayerWalletState;
  experience?: ExperiencePayload;
}

export interface GachaRecordState {
  gacha_id: string;
  pool_type: GachaPoolType;
  cost_type: GachaCostType;
  result: GachaResultState;
  pity_before: number;
  pity_after: number;
  created_at: string;
}

export interface GachaHistoryResponse {
  records: GachaRecordState[];
}

export interface AncientTreasureStateSummary {
  treasure_id: string;
  name: string;
  owned: boolean;
  star_level: number;
  fragment_count: number;
  soul_count: number;
}

export interface AncientTreasureListResponse {
  treasures: AncientTreasureStateSummary[];
}

export interface ConvenienceBatchPreviewRequest {
  requested_count: number;
}

export interface ConvenienceBatchPreviewResponse {
  requested_count: number;
  accepted_count: number;
  limit: number;
  effective_tier: EntitlementTier;
  reward_multiplier: 1;
}

export interface SaveConvenienceStrategyRequest {
  strategy_name: string;
  strategy_type: "daily" | "tower" | "boss" | "pvp";
  config: Record<string, unknown>;
}

export interface ConvenienceStrategyState {
  strategy_id: string;
  strategy_name: string;
  strategy_type: string;
  tier_at_create: EntitlementTier;
  config: Record<string, unknown>;
  status: string;
}

export interface SaveConvenienceStrategyResponse {
  strategy: ConvenienceStrategyState;
  used_slots: number;
  slot_limit: number;
}

export interface CreateAutomationQueueRequest {
  queue_type: "single_play" | "simple_cross_play" | "core_daily";
  actions: Array<{ action_type: string; count?: number; target_id?: string }>;
}

export interface AutomationQueueState {
  queue_id: string;
  queue_type: string;
  entitlement_tier: EntitlementTier;
  requested_actions: Array<Record<string, unknown>>;
  accepted_actions: Array<Record<string, unknown>>;
  status: string;
}

export interface CreateAutomationQueueResponse {
  queue: AutomationQueueState;
  convenience: ConvenienceRuleState;
}

export type AppearanceType =
  | "title_style"
  | "avatar_frame"
  | "battle_report"
  | "cave"
  | "sect"
  | "era_archive"
  | "catalog";

export interface AppearanceState {
  appearance_id: string;
  name: string;
  appearance_type: AppearanceType | string;
  source_type: string;
  owned: boolean;
  equipped: boolean;
  inherited: boolean;
  stat_bonus: null;
}

export interface AppearanceListResponse {
  appearances: AppearanceState[];
}

export interface ClaimAppearanceRequest {
  appearance_id: string;
}

export interface EquipAppearanceRequest {
  appearance_id: string;
}

export interface AppearanceMutationResponse {
  record_id: string;
  appearance: AppearanceState;
}

export type AppearancePlusOwnerType = "player" | "sect" | string;

export interface AppearancePlusPreview {
  title: string;
  subtitle: string;
  sample_text: string;
  display_positions: string[];
  color_token: string;
}

export interface AppearancePlusPermission {
  can_equip: boolean;
  reason: string | null;
  required_role?: string | null;
}

export interface AppearancePlusState {
  ownership_record_id: string | null;
  appearance_id: string;
  name: string;
  appearance_type: string;
  display_slot: string;
  source_type: string;
  source_hint: string;
  owner_type: AppearancePlusOwnerType;
  owner_id: string | null;
  owned: boolean;
  equipped: boolean;
  inherited: boolean;
  limited: boolean;
  expires_at: string | null;
  preview: AppearancePlusPreview;
  permission: AppearancePlusPermission;
  stat_bonus: null;
  config_version: string;
}

export interface AppearancePlusDisplaySlotState {
  slot_id: string;
  name: string;
  allowed_types: string[];
  equipped_appearance_id: string | null;
  equipped_name: string | null;
}

export interface AppearancePlusCatalogResponse {
  appearances: AppearancePlusState[];
  display_slots: AppearancePlusDisplaySlotState[];
  sect_decoration: {
    sect_id: string | null;
    sect_name: string | null;
    equipped_appearance_id: string | null;
    equipped_name: string | null;
  };
  boundary: {
    stat_bonus_allowed: false;
    reward_mutation_allowed: false;
    contribution_multiplier_allowed: false;
    drop_rate_allowed: false;
  };
  config_version: string;
  ruleset_version: string;
}

export interface EquipAppearancePlusRequest {
  appearance_id: string;
  display_slot?: string;
}

export interface EquipAppearancePlusResponse {
  record_id: string;
  appearance: AppearancePlusState;
  display_slots: AppearancePlusDisplaySlotState[];
}

export type MentorRelationStatus = "pending" | "active" | "graduated" | "dissolved" | "rejected";

export interface MentorRelationState {
  mentor_relation_id: string;
  mentor_player_id: string;
  mentor_name: string;
  apprentice_player_id: string;
  apprentice_name: string;
  era_id: string;
  status: MentorRelationStatus | string;
  task_summary: Record<string, unknown>;
  reward_boundary_summary: Record<string, unknown>;
  cooldown_until: string | null;
  risk_summary: Record<string, unknown> | null;
  mentor_config_version: string;
  created_at: string;
  updated_at: string;
}

export interface MentorSummaryResponse {
  relations: MentorRelationState[];
  pending_as_mentor: MentorRelationState[];
  active_as_apprentice: MentorRelationState | null;
  rule: Record<string, unknown>;
}

export interface ApplyMentorRequest {
  mentor_player_id: string;
}

export interface ReviewMentorRequest {
  mentor_relation_id: string;
  decision: "accept" | "reject";
}

export interface ClaimMentorTaskRequest {
  mentor_relation_id: string;
  task_id?: string;
}

export interface GraduateMentorRequest {
  mentor_relation_id: string;
}

export interface MentorMutationResponse {
  record_id: string;
  relation: MentorRelationState;
  rewards?: RewardBundle;
}

export type SectDiplomacyStatus = "proposed" | "active" | "rejected" | "expired" | "dissolved";

export interface SectDiplomacyState {
  diplomacy_record_id: string;
  source_sect_id: string;
  source_sect_name: string;
  target_sect_id: string;
  target_sect_name: string;
  era_id: string;
  diplomacy_type: "alliance" | "hostility" | "aid" | "defense" | string;
  status: SectDiplomacyStatus | string;
  proposal_summary: Record<string, unknown>;
  approval_summary: Record<string, unknown> | null;
  cooldown_until: string | null;
  announcement_id: string | null;
  diplomacy_config_version: string;
  created_at: string;
  updated_at: string;
}

export interface SectDiplomacySummaryResponse {
  sect_id: string | null;
  sect_name: string | null;
  my_role: string | null;
  records: SectDiplomacyState[];
  proposals_to_review: SectDiplomacyState[];
  rule: Record<string, unknown>;
}

export interface ProposeSectDiplomacyRequest {
  target_sect_id: string;
  diplomacy_type: "alliance" | "hostility" | "aid" | "defense";
  message?: string;
}

export interface ReviewSectDiplomacyRequest {
  diplomacy_record_id: string;
  decision: "accept" | "reject";
}

export interface SectDiplomacyMutationResponse {
  record_id: string;
  diplomacy: SectDiplomacyState;
}

export type SectHireStatus =
  | "open"
  | "accepted"
  | "completed"
  | "canceled"
  | "settled"
  | "rolled_back";

export interface SectHireState {
  hire_record_id: string;
  employer_sect_id: string;
  employer_sect_name: string;
  helper_sect_id: string | null;
  helper_sect_name: string | null;
  helper_player_id: string | null;
  helper_player_name: string | null;
  era_id: string;
  hire_type: "explore_support" | "sect_build" | "tower_supply" | "event_support" | string;
  status: SectHireStatus | string;
  allowed_action_scope: Record<string, unknown>;
  reward_escrow_summary: Record<string, unknown>;
  risk_status: RiskStatus | string;
  settlement_status: SettlementStatus | string;
  hire_config_version: string;
  reward_config_version: string;
  created_at: string;
  settled_at: string | null;
}

export interface SectHireListResponse {
  sect_id: string | null;
  sect_name: string | null;
  open_hires: SectHireState[];
  my_hires: SectHireState[];
  accepted_hires: SectHireState[];
  rule: Record<string, unknown>;
}

export interface CreateSectHireRequest {
  hire_type: "explore_support" | "sect_build" | "tower_supply" | "event_support";
  message?: string;
}

export interface AcceptSectHireRequest {
  hire_record_id: string;
}

export interface SettleSectHireRequest {
  hire_record_id: string;
}

export interface SectHireMutationResponse {
  record_id: string;
  hire: SectHireState;
  rewards?: RewardBundle;
}

export type TransferRequestStatus =
  | "draft"
  | "submitted"
  | "reviewing"
  | "rejected"
  | "pending_confirm"
  | "executed"
  | "canceled"
  | "rolled_back";

export type TransferExecuteStatus = "dry_run_only" | "reserved_only" | "executed";

export interface TransferRequestState {
  transfer_request_id: string;
  player_id: string;
  account_id: string;
  source_server_id: string;
  target_server_id: string;
  era_id: string;
  status: TransferRequestStatus | string;
  dry_run_report: Record<string, unknown>;
  asset_mapping_summary: Record<string, unknown> | null;
  rank_cooldown_until: string | null;
  sect_cleanup_summary: Record<string, unknown> | null;
  payment_asset_check_summary: Record<string, unknown> | null;
  risk_summary: Record<string, unknown> | null;
  review_operator_id: string | null;
  review_reason: string | null;
  execute_status: TransferExecuteStatus | string;
  transfer_config_version: string;
  risk_ruleset_version: string;
  settlement_config_version: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
}

export interface TransferRuleResponse {
  current_server_id: string;
  can_request: boolean;
  reason: string | null;
  rule: Record<string, unknown>;
}

export interface TransferStatusResponse {
  current_request: TransferRequestState | null;
  recent_requests: TransferRequestState[];
  rule: Record<string, unknown>;
}

export interface CreateTransferRequestRequest {
  target_server_id: string;
  reason?: string;
}

export interface CreateTransferRequestResponse {
  request: TransferRequestState;
}

export interface CancelTransferRequestRequest {
  transfer_request_id: string;
  reason?: string;
}

export interface CancelTransferRequestResponse {
  request: TransferRequestState;
}

export interface AdminCreateTransferDryRunRequest {
  player_id: string;
  target_server_id: string;
  source_server_id?: string;
  target_server_stage?: string;
  operator?: string;
  reason?: string;
}

export interface AdminCreateTransferDryRunResponse {
  request: TransferRequestState;
  operation: AdminGmOperationState;
}

export interface AdminReviewTransferRequest {
  transfer_request_id: string;
  decision: "approve" | "reject";
  operator?: string;
  reason?: string;
}

export interface AdminReviewTransferResponse {
  request: TransferRequestState;
  operation: AdminGmOperationState;
}

export interface AdminExecuteTransferRequest {
  transfer_request_id: string;
  confirm_text: string;
  operator?: string;
  reason?: string;
}

export interface AdminExecuteTransferResponse {
  allowed: boolean;
  execution_status: TransferExecuteStatus | string;
  message: string;
  request: TransferRequestState;
  operation: AdminGmOperationState;
}

export interface GameOverviewResponse {
  profile: PlayerProfileResponse;
  cultivation: CultivationStatus | null;
  action_state: ActionState | null;
  provinces: ProvinceSummary[];
  tasks: TaskState[];
  cave: CaveState | null;
  recent_battles: BattleSummary[];
  new_player_route: NewPlayerRouteState | null;
}

export interface PluginStatusCardResponse {
  player: PlayerSummary;
  realm_text: string;
  cultivation: {
    current_value: string;
    claimable_value: string;
    can_breakthrough: boolean;
  };
  action_state: ActionState;
  offline_minutes: number;
  wallet: PlayerWalletState;
  reminders: string[];
  monthly_grant_count: number;
  navigation_links: PluginNavigationLink[];
}

export interface PluginPanelTaskState {
  task_id: string;
  title: string;
  status: TaskState["status"];
  progress_text: string;
}

export interface PluginPanelDigest {
  digest_id: string;
  title: string;
  summary: string;
  tone: ExperienceTone;
  action_hint?: string;
}

export interface PluginExpandedPanelResponse {
  status: PluginStatusCardResponse;
  daily_route: DailyRouteResponse | null;
  tasks: PluginPanelTaskState[];
  digests: PluginPanelDigest[];
  cave: CaveState | null;
  inner_world: InnerWorldStateSummary | null;
  faction: FactionStateSummary | null;
  titles: TitleCollectionResponse | null;
  activities: ActivitySummaryState[];
  provinces: ProvinceSummary[];
  towers: TowerStateSummary[];
  recent_battles: BattleSummary[];
  ancient_treasure: {
    owned_count: number;
    total_count: number;
    available_draws: number;
  };
  monthly_cards: MonthlyCardStateSummary[];
  sect: SectSummary | null;
  boss: WorldBossStateSummary | null;
}

export interface PluginQuickClaimRequest {
  include_tasks?: boolean;
}

export interface PluginQuickClaimItem {
  action: "cultivation" | "cave" | "task" | "inner_world";
  label: string;
  record_id: string | null;
  status: "claimed" | "skipped";
  message: string;
}

export interface PluginQuickClaimResponse {
  record_id: string;
  items: PluginQuickClaimItem[];
  status: PluginStatusCardResponse;
}

export type PluginPresetId = "explore_ji_once" | "tower_seal_once" | "sect_patrol";

export interface PluginSubmitPresetRequest {
  preset_id: PluginPresetId | string;
}

export interface PluginSubmitPresetResponse {
  record_id: string;
  preset_id: PluginPresetId;
  label: string;
  result: unknown;
  status: PluginStatusCardResponse;
}

export interface PluginNavigationLink {
  key: "web" | "h5" | "tasks" | "towers" | "commerce" | "inner_world" | "events";
  label: string;
  url: string;
}

export interface PluginNavigationLinksResponse {
  links: PluginNavigationLink[];
}

export type ConfigType =
  | "realm"
  | "item"
  | "reward"
  | "action"
  | "world"
  | "task"
  | "battle"
  | "cave"
  | "pill"
  | "forge"
  | "skill"
  | "bag"
  | "tower"
  | "boss"
  | "sect"
  | "pvp"
  | "rank"
  | "gacha"
  | "monthly_card"
  | "vip"
  | "convenience"
  | "appearance"
  | "inner_world"
  | "faction_route"
  | "era_rank"
  | "event"
  | "activity_template"
  | "merge_dry_run"
  | "story_presentation"
  | "era_collection"
  | "appearance_plus"
  | "mentor_rule"
  | "sect_diplomacy"
  | "sect_hire"
  | "transfer_rule"
  | "risk";

export interface ConfigEnvelope<TPayload = Record<string, unknown>> {
  config_type: string;
  config_version: string;
  ruleset_version: string;
  reward_config_version: string;
  payload: TPayload;
}

export type AdminLogType = "behavior" | "audit" | "login" | "wallet";

export interface AdminPlayerDigestResponse {
  player: PlayerSummary;
  account: PublicAccount;
  progress: PlayerProgressState | null;
  wallet: PlayerWalletState | null;
  orders: AdminOrderState[];
  gacha_records: AdminGachaRecordState[];
  battles: BattleSummary[];
  action_records: AdminActionRecordState[];
  mails: AdminMailState[];
  risk: AdminPlayerRiskResponse;
}

export interface AdminOrderState {
  order_id: string;
  player_id: string;
  product_id: string;
  product_type: string;
  fishpi_point_cost: string;
  paid_jade_amount: string;
  bound_jade_amount: string;
  status: string;
  config_version: string;
  reward_config_version: string;
  created_at: string;
}

export interface AdminGachaRecordState {
  gacha_id: string;
  player_id: string;
  pool_type: string;
  cost_type: string;
  result_name: string;
  duplicate: boolean;
  pity_before: number;
  pity_after: number;
  created_at: string;
}

export interface AdminActionRecordState {
  record_id: string;
  action_type: string;
  source: "tower" | "boss" | "pvp" | "cave";
  summary: string;
  settlement_status: string;
  created_at: string;
}

export interface AdminMailState {
  mail_id: string;
  player_id: string | null;
  target_type: "player" | "all" | string;
  title: string;
  content: string;
  reward_snapshot: RewardBundle;
  status: string;
  sent_by: string;
  reason: string | null;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
  claimed_at: string | null;
}

export interface SendAdminMailRequest {
  target_type: "player" | "all";
  player_id?: string;
  title: string;
  content: string;
  rewards?: RewardBundle;
  reason?: string;
  operator?: string;
  expires_at?: string;
}

export interface SendAdminMailResponse {
  mail: AdminMailState;
  operation: AdminGmOperationState;
}

export interface AdminMailListResponse {
  mails: AdminMailState[];
}

export interface AnnouncementState {
  announcement_id: string;
  announcement_type: string;
  title: string;
  content: string;
  visible_scope: string;
  related_config_version: string | null;
  status: string;
  published_by: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementRequest {
  announcement_type: "maintenance" | "activity" | "probability" | "rules" | "risk" | "era";
  title: string;
  content: string;
  visible_scope?: string;
  related_config_version?: string;
  starts_at?: string;
  ends_at?: string;
  operator?: string;
}

export interface CreateAnnouncementResponse {
  announcement: AnnouncementState;
  operation: AdminGmOperationState;
}

export interface AnnouncementListResponse {
  announcements: AnnouncementState[];
}

export interface AdminConfigVersionState {
  config_id: string;
  config_type: string;
  config_version: string;
  ruleset_version: string | null;
  reward_config_version: string | null;
  active: boolean;
  created_at: string;
  published_at: string;
}

export interface AdminConfigVersionListResponse {
  configs: AdminConfigVersionState[];
}

export interface PublishAdminConfigRequest {
  config_type: ConfigType;
  config_version: string;
  ruleset_version?: string;
  reward_config_version?: string;
  payload: Record<string, unknown>;
  reason?: string;
  operator?: string;
}

export interface PublishAdminConfigResponse {
  config: AdminConfigVersionState;
  validation: AdminConfigValidationResult;
  operation: AdminGmOperationState;
}

export interface RollbackAdminConfigRequest {
  config_type: ConfigType;
  target_config_version: string;
  reason?: string;
  operator?: string;
}

export interface RollbackAdminConfigResponse {
  config: AdminConfigVersionState;
  operation: AdminGmOperationState;
}

export interface CreateMergeDryRunRequest {
  source_server_ids: string[];
  target_server_id: string;
  include_inactive?: boolean;
  operator?: string;
  reason?: string;
}

export interface MergeDryRunReportState {
  report_id: string;
  source_server_ids: string[];
  target_server_id: string;
  status: string;
  summary: Record<string, unknown>;
  conflict_summary: Record<string, unknown>;
  asset_inheritance_summary: Record<string, unknown>;
  rank_freeze_summary: Record<string, unknown>;
  sect_conflict_summary: Record<string, unknown>;
  compensation_suggestion: Record<string, unknown>;
  risk_summary: Record<string, unknown>;
  rollback_suggestion: Record<string, unknown>;
  config_version: string;
  ruleset_version: string;
  generated_by: string;
  execute_status: string;
  created_at: string;
}

export interface CreateMergeDryRunResponse {
  report: MergeDryRunReportState;
  operation: AdminGmOperationState;
}

export interface MergeDryRunReportResponse {
  report: MergeDryRunReportState;
}

export interface ExecuteMergeReservedRequest {
  report_id: string;
  confirm_text?: string;
  operator?: string;
  reason?: string;
}

export interface ExecuteMergeReservedResponse {
  allowed: false;
  execution_status: "reserved_only";
  message: string;
  report: MergeDryRunReportState;
  operation: AdminGmOperationState;
}

export interface AdminConfigValidationResult {
  passed: boolean;
  warnings: string[];
}

export interface AdminGmOperationState {
  operation_id: string;
  operator: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface AdminGmOperationListResponse {
  operations: AdminGmOperationState[];
}

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
