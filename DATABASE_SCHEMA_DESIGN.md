# 《择日飞升：九塔封魔》数据库表结构设计 v0.1

## 一、定位

本文在 `DATA_MODEL_DESIGN.md` 基础上进一步细化表结构、主键、唯一键、索引和关键约束，供研发建表和服务拆分参考。本文不绑定具体数据库，默认适用于关系型数据库加日志/归档表。

核心原则：

- 钱、物、抽卡、订单、战斗、排行、GM 操作必须可审计。
- 所有高风险状态变更必须有幂等键或唯一约束。
- 热数据和长日志分层存储，避免战报、日志拖慢主流程。
- 纪元维度数据必须带 `era_id`，便于结算和归档。

## 二、命名约定

- 表名使用单数或业务名，例如 `player`、`player_wallet_log`。
- 主键使用 `{table}_id` 或业务 ID。
- 时间字段统一为 `created_at`、`updated_at`、`deleted_at`。
- 金额、货币、数量使用整数，不使用浮点。
- JSON 摘要字段用于回放和展示，核心查询字段必须拆列。

## 三、核心玩家表

`player`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| player_id | varchar | PK | 玩家 ID |
| account_id | varchar | index | 账号 ID |
| fishpi_user_id | varchar | unique nullable | 鱼排用户 ID |
| name | varchar | unique | 角色名 |
| route | varchar | not null | qi / body |
| alignment | varchar | not null | 未定 / 成仙 / 成魔 / 散修 |
| current_realm | int | index | 大境界 |
| current_stage | int |  | 小境界 |
| current_level | int |  | 小等级 |
| sect_id | varchar | index nullable | 宗门 |
| status | varchar | index | 正常 / 冻结 / 封禁 |
| created_at | datetime | index | 创建时间 |
| updated_at | datetime |  | 更新时间 |

索引：

- `idx_player_account(account_id)`。
- `idx_player_sect(sect_id)`。
- `idx_player_realm(current_realm, current_stage, current_level)`。

`player_progress`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| player_id | varchar | PK | 玩家 ID |
| era_id | varchar | index | 纪元 ID |
| cultivation_value | bigint |  | 修为 / 气血精元 |
| breakthrough_fail_count | int |  | 突破失败次数 |
| calamity_value | int |  | 劫气 |
| chapter_id | int | index | 当前章节 |
| catchup_bonus_rate | int |  | 追赶加成，万分比 |
| newbie_protection_until | datetime |  | 新手保护 |
| daily_active_score | int |  | 今日活跃 |
| weekly_active_score | int |  | 周活跃 |

## 四、货币与背包

`player_wallet`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| player_id | varchar | PK | 玩家 ID |
| spirit_stone | bigint | default 0 | 灵石 |
| immortal_stone | bigint | default 0 | 仙石 |
| jade_paid | bigint | default 0 | 付费仙玉 |
| jade_bound | bigint | default 0 | 绑定仙玉 |
| era_point | bigint | default 0 | 纪元积分 |
| updated_at | datetime |  | 更新时间 |

`wallet_log`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| log_id | varchar | PK | 日志 ID |
| player_id | varchar | index | 玩家 |
| currency_type | varchar | index | 货币类型 |
| change_amount | bigint |  | 变化量 |
| before_amount | bigint |  | 变化前 |
| after_amount | bigint |  | 变化后 |
| source_type | varchar | index | 来源 |
| source_id | varchar | index | 来源记录 |
| idempotency_key | varchar | unique nullable | 幂等键 |
| created_at | datetime | index | 时间 |

`player_item`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| item_instance_id | varchar | PK | 实例 ID |
| player_id | varchar | index | 玩家 |
| item_id | varchar | index | 配置 ID |
| count | bigint |  | 数量 |
| bind_type | varchar | index | 绑定类型 |
| locked | boolean |  | 是否锁定 |
| source_type | varchar | index | 来源 |
| expire_at | datetime | index nullable | 过期 |
| created_at | datetime |  | 创建 |
| updated_at | datetime |  | 更新 |

## 五、行动与战斗

`action_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| action_id | varchar | PK | 行动 ID |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| action_type | varchar | index | 探索 / 九塔 / PVP / 秘境 / Boss |
| target_type | varchar |  | 目标类型 |
| target_id | varchar | index | 目标 |
| cost_token_type | varchar |  | 行动令 |
| cost_token_count | int |  | 消耗 |
| contribution | bigint |  | 贡献 |
| reward_state | varchar | index | 未结算 / 可领取 / 已领取 / 回滚 |
| idempotency_key | varchar | unique | 幂等键 |
| config_version | varchar |  | 配置版本 |
| reward_config_version | varchar |  | 奖励版本 |
| created_at | datetime | index | 提交时间 |
| settled_at | datetime | index nullable | 结算时间 |

`battle_log`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| battle_id | varchar | PK | 战斗 ID |
| scene_type | varchar | index | 场景 |
| attacker_id | varchar | index | 攻击方 |
| defender_id | varchar | index nullable | 防守方 |
| result | varchar | index | 胜 / 负 / 超时 |
| result_reason | varchar |  | 胜负原因 |
| random_seed | varchar |  | 随机种子 |
| attacker_snapshot | json |  | 快照 |
| defender_snapshot | json |  | 快照 |
| round_summary | json |  | 回合摘要 |
| reward_summary | json |  | 奖励 |
| combat_config_version | varchar |  | 战斗配置 |
| skill_config_version | varchar |  | 技能配置 |
| created_at | datetime | index | 时间 |

战斗日志可按月或纪元归档，热表保留最近 90-180 天。

## 六、九州、九塔、宗门、PVP

`province_state`

主键：`(era_id, province_id)`。

关键索引：

- `idx_province_era(era_id)`。
- `idx_province_status(era_id, unlocked, corruption)`。

`tower_state`

主键：`(era_id, tower_id)`。

关键字段：

- `integrity`、`rift_pressure`、`seal_value`、`break_value`、`boss_phase`。
- `daily_contribution_fairy`、`daily_contribution_demon`、`daily_contribution_free`。

`sect`

索引：

- `idx_sect_stance(stance)`。
- `idx_sect_level(level)`。
- `idx_sect_province(province_id)`。

`sect_member`

唯一键：

- `uk_sect_player(sect_id, player_id)`。
- `uk_player_active_sect(player_id)`，保证玩家同一时间只在一个宗门。

`pvp_report`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| report_id | varchar | PK | 战报 ID |
| battle_id | varchar | unique | 战斗 ID |
| attacker_id | varchar | index | 攻击者 |
| defender_id | varchar | index | 防守者 |
| scene_type | varchar | index | 场景 |
| revenge_used | boolean |  | 是否已复仇 |
| protection_until | datetime | index nullable | 保护到期 |
| reward_decay_reason | varchar |  | 收益衰减 |
| created_at | datetime | index | 时间 |

## 七、任务、活动、排行

`quest_record`

唯一键：

- `uk_player_quest_period(player_id, quest_id, period_key)`。

索引：

- `idx_quest_player_status(player_id, status)`。
- `idx_quest_type_period(quest_type, period_key)`。

`event_record`

唯一键：

- `uk_event_player(event_id, player_id, period_key)`。

`rank_snapshot`

唯一键：

- `uk_rank_snapshot(rank_id, period_type, period_key, segment_key)`。

`rank_entry`

唯一键：

- `uk_snapshot_target(snapshot_id, target_type, target_id)`。

索引：

- `idx_rank_no(snapshot_id, rank_no)`。
- `idx_rank_target(target_type, target_id)`。

## 八、抽卡、订单与月卡

`order_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| order_id | varchar | PK | 游戏订单 |
| fishpi_order_id | varchar | unique nullable | 鱼排订单 |
| player_id | varchar | index | 玩家 |
| product_type | varchar | index | 商品类型 |
| fishpi_point_cost | bigint |  | 鱼排积分 |
| status | varchar | index | created / pending / paid / delivered / failed / refunded |
| idempotency_key | varchar | unique | 幂等键 |
| product_config_version | varchar |  | 商品配置 |
| callback_payload | json |  | 回调摘要 |
| created_at | datetime | index | 创建 |
| delivered_at | datetime | index nullable | 到账 |

`gacha_record`

索引：

- `idx_gacha_player_pool(player_id, pool_type, created_at)`。
- `idx_gacha_pool_time(pool_type, created_at)`。
- `idx_gacha_grant(grant_id)`。

`monthly_card_draw_grant`

唯一键：

- `uk_daily_grant(player_id, monthly_card_type, valid_date, pool_type)`。

## 九、配置、邮件、公告、GM

`config_publish_record`

唯一键：

- `uk_config_version(config_version, config_type)`。

`mail_record`

索引：

- `idx_mail_player_status(player_id, status)`。
- `idx_mail_expire(expire_at)`。
- `idx_mail_source(source_type, source_id)`。

`announcement_record`

索引：

- `idx_announcement_visible(publish_status, publish_at, expire_at)`。

`gm_operation_log`

索引：

- `idx_gm_target(target_type, target_id)`。
- `idx_gm_operator(operator_id, created_at)`。
- `idx_gm_type(operation_type, created_at)`。

## 十、幂等与事务边界

必须具备幂等键的操作：

- 领取离线收益。
- 行动提交。
- 任务奖励领取。
- 邮件附件领取。
- 抽卡。
- 订单创建和补单。
- 月卡购买。
- GM 补偿。

事务边界建议：

- 扣行动令、写行动记录、写货币/物品日志应在同一事务。
- 抽卡消耗、结果、保底变化、道具发放应在同一事务。
- 订单到账、货币增加、订单状态变更应在同一事务。
- 排行结算可先生成快照，再异步发放奖励。

## 十一、验收场景

- 研发能根据本文建立 MVP 关键表、索引和唯一键。
- 抽卡、订单、奖励领取重复请求不会重复发放。
- 战斗、行动、排行、邮件、GM 日志可按玩家和时间查询。
- 纪元结算和合服能按 `era_id` 归档和查询。
- 热数据和长日志有归档策略，不影响主流程性能。
