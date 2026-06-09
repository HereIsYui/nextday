export const transferCurrentServerId = "server_mvp_001";
export const transferConfigVersion = "transfer_rule_p2_5_v1";
export const transferRulesetVersion = "ruleset_p2_transfer_v1";
export const transferRiskRulesetVersion = "risk_p2_transfer_v1";
export const transferSettlementConfigVersion = "settlement_p2_transfer_v1";
export const transferRankCooldownDays = 7;
export const finalBattleForbiddenDays = 30;

export const transferRule = {
  mode: "dry_run_manual_review_reserved_execute",
  free_transfer_enabled: false,
  execute_enabled: false,
  current_server_id: transferCurrentServerId,
  allowed_target_server_ids: ["mvp_beta", "mvp_gamma", "mvp_merged"],
  forbidden_target_stage: "final_war_30d",
  final_battle_forbidden_days: finalBattleForbiddenDays,
  rank_cooldown_days: transferRankCooldownDays,
  review_rule: {
    manual_review_required: true,
    second_confirm_required: true,
    execute_reserved_only: true,
  },
  asset_mapping_rule: {
    preserve_paid_wallet: true,
    preserve_monthly_cards: true,
    preserve_gacha_pity: true,
    preserve_appearance_and_collection: true,
    copy_grindable_resources: false,
    duplicate_assets_allowed: false,
  },
  sect_cleanup_rule: {
    before_transfer: "退出宗门并清理宗门外交、雇佣和仓库权限；P2 当前只生成建议，不执行清理。",
    compensation: "仅建议绑定普通材料或基础灵石，不发付费仙玉、九大古宝或唯一战力道具。",
  },
  boundary: {
    dry_run_mutates_business_data: false,
    transfer_after_approval_executes_by_default: false,
    paid_asset_loss_allowed: false,
    rank_cooldown_bypass_allowed: false,
  },
};
