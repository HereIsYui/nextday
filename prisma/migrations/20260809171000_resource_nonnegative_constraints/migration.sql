ALTER TABLE "player_wallet"
ADD CONSTRAINT "player_wallet_nonnegative_check"
CHECK (
  "spirit_stone" >= 0 AND
  "immortal_stone" >= 0 AND
  "jade_paid" >= 0 AND
  "jade_bound" >= 0 AND
  "era_point" >= 0
);

ALTER TABLE "player_item"
ADD CONSTRAINT "player_item_count_nonnegative_check"
CHECK ("count" >= 0);

ALTER TABLE "player_action_state"
ADD CONSTRAINT "player_action_points_range_check"
CHECK ("action_points" >= 0 AND "action_points" <= "action_point_cap");
