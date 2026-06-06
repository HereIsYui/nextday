# 《择日飞升：九塔封魔》数据库表结构设计 v0.2

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

## 五、炼丹、装备与九大古宝

`alchemy_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| alchemy_record_id | varchar | PK | 炼丹记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| recipe_id | varchar | index | 丹方 |
| pill_rank | int | index | 丹阶 |
| result_pill_id | varchar | index nullable | 结果丹药 |
| quality | varchar | index | 品质 / 失败 |
| success | boolean | index | 是否成功 |
| material_cost_summary | json |  | 消耗摘要 |
| refund_summary | json |  | 返还摘要 |
| idempotency_key | varchar | unique | 幂等键 |
| alchemy_config_version | varchar |  | 炼丹配置 |
| reward_config_version | varchar |  | 奖励配置 |
| created_at | datetime | index | 时间 |

`pill_use_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| pill_use_record_id | varchar | PK | 服丹记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| pill_id | varchar | index | 丹药 |
| pill_rank | int | index | 丹阶 |
| pill_type | varchar | index | 丹药类型 |
| quality | varchar |  | 品质 |
| same_rank_type_count_before | int |  | 同阶同类服用前计数 |
| effect_rate | int |  | 实际倍率，万分比 |
| effect_summary | json |  | 实际效果 |
| idempotency_key | varchar | unique | 幂等键 |
| pill_config_version | varchar |  | 丹药配置 |
| ruleset_version | varchar |  | 递减规则 |
| created_at | datetime | index | 时间 |

唯一键：

- `uk_pill_use_idem(idempotency_key)`。

`equipment_instance`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| equipment_id | varchar | PK | 法宝实例 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| item_id | varchar | index | 法宝配置 |
| equipment_type | varchar | index | 普通法宝 / 本命法宝 / 仙品法宝 |
| slot | varchar | index nullable | 装备位 |
| rarity | varchar | index | 稀有度 |
| star_level | int |  | 星级 |
| durability | int |  | 耐久 |
| bind_type | varchar | index | 绑定状态 |
| locked | boolean | index | 是否锁定 |
| source_type | varchar | index | 来源 |
| equipment_config_version | varchar |  | 法宝配置 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

索引：

- `idx_equipment_player_slot(player_id, slot)`。
- `idx_equipment_player_type(player_id, equipment_type, rarity)`。

`equipment_affix`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| affix_instance_id | varchar | PK | 词条实例 |
| equipment_id | varchar | index | 法宝实例 |
| player_id | varchar | index | 玩家 |
| affix_id | varchar | index | 词条配置 |
| affix_slot | varchar | index | main / sub / hidden |
| value | bigint |  | 词条值 |
| quality | varchar | index | 品质 |
| locked | boolean |  | 是否铭刻锁定 |
| affix_config_version | varchar |  | 词条配置 |
| created_at | datetime |  | 创建 |
| updated_at | datetime |  | 更新 |

`equipment_operation_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| operation_record_id | varchar | PK | 操作记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| operation_type | varchar | index | 炼制 / 淬炼 / 铭刻 / 升星 / 洗髓 / 分解 / 装备 / 锁定 |
| equipment_id | varchar | index nullable | 目标法宝 |
| before_snapshot | json |  | 操作前摘要 |
| after_snapshot | json |  | 操作后摘要 |
| cost_summary | json |  | 消耗 |
| refund_summary | json |  | 返还 |
| idempotency_key | varchar | unique | 幂等键 |
| forge_config_version | varchar |  | 炼器配置 |
| affix_config_version | varchar |  | 词条配置 |
| reward_config_version | varchar |  | 奖励配置 |
| created_at | datetime | index | 时间 |

`ancient_treasure_state`

主键：`(player_id, era_id, treasure_id)`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| player_id | varchar | PK | 玩家 |
| era_id | varchar | PK | 纪元 |
| treasure_id | varchar | PK | 九大古宝 |
| owned | boolean | index | 是否拥有当纪元状态 |
| star_level | int |  | 当纪元星级 |
| fragment_count | int |  | 当纪元碎片 |
| atlas_unlocked | boolean | index | 图鉴解锁 |
| inherited_atlas | boolean |  | 是否继承图鉴 |
| active_use_count_today | int |  | 今日主动次数 |
| treasure_config_version | varchar |  | 古宝配置 |
| updated_at | datetime |  | 更新时间 |

`ancient_treasure_use_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| use_record_id | varchar | PK | 古宝日课记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| treasure_id | varchar | index | 古宝 |
| active_type | varchar | index | 主动能力 |
| target_type | varchar |  | 目标类型 |
| target_id | varchar | index nullable | 目标 ID |
| daily_count_before | int |  | 使用前全局次数 |
| daily_count_after | int |  | 使用后全局次数 |
| result_summary | json |  | 结果 |
| idempotency_key | varchar | unique | 幂等键 |
| treasure_config_version | varchar |  | 古宝配置 |
| ruleset_version | varchar |  | 日课规则 |
| created_at | datetime | index | 时间 |

## 六、行动与战斗

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

## 七、九州、九塔、宗门、PVP

`province_state`

主键：`(era_id, province_id)`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| era_id | varchar | PK | 纪元 |
| province_id | varchar | PK | 州 ID |
| unlocked | boolean | index | 是否开放 |
| corruption | int | index | 魔染度 |
| public_support | int |  | 民望 |
| spirit_vein_level | int |  | 灵脉等级 |
| faction_control_fairy | int |  | 仙盟控制度 |
| faction_control_demon | int |  | 魔宗控制度 |
| faction_control_free | int |  | 散修控制度 |
| province_config_version | varchar |  | 九州配置 |
| updated_at | datetime | index | 更新时间 |

关键索引：

- `idx_province_era(era_id)`。
- `idx_province_status(era_id, unlocked, corruption)`。

`tower_state`

主键：`(era_id, tower_id)`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| era_id | varchar | PK | 纪元 |
| tower_id | varchar | PK | 塔 ID |
| province_id | varchar | index | 所属州 |
| integrity | int | index | 完整度 |
| rift_pressure | int | index | 裂隙压力 |
| seal_value | bigint |  | 镇封度 |
| break_value | bigint |  | 破封度 |
| boss_phase | varchar | index | 塔灵 / Boss 阶段 |
| daily_contribution_fairy | bigint |  | 今日仙盟贡献 |
| daily_contribution_demon | bigint |  | 今日魔宗贡献 |
| daily_contribution_free | bigint |  | 今日散修贡献 |
| weekly_locked_state | varchar | index | 周结锁定状态 |
| tower_config_version | varchar |  | 九塔配置 |
| updated_at | datetime | index | 更新时间 |

`sect`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| sect_id | varchar | PK | 宗门 |
| name | varchar | unique | 宗门名 |
| stance | varchar | index | 仙盟 / 魔宗 / 散修 |
| level | int | index | 宗门等级 |
| leader_player_id | varchar | index | 宗主 |
| member_limit | int |  | 成员上限 |
| province_id | varchar | index | 驻地州 |
| build_exp | bigint |  | 建设经验 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

索引：

- `idx_sect_stance(stance)`。
- `idx_sect_level(level)`。
- `idx_sect_province(province_id)`。

`sect_member`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| sect_id | varchar | PK | 宗门 |
| player_id | varchar | PK | 玩家 |
| role | varchar | index | 宗主 / 长老 / 执事 / 弟子 |
| joined_at | datetime | index | 加入时间 |
| contribution_weekly | bigint |  | 周贡献 |
| contribution_total | bigint |  | 总贡献 |
| warehouse_quota_used | bigint |  | 今日仓库额度 |
| updated_at | datetime |  | 更新时间 |

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

## 八、任务、活动、排行

`quest_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| quest_record_id | varchar | PK | 任务记录 |
| player_id | varchar | index | 玩家 |
| quest_id | varchar | index | 任务配置 |
| quest_type | varchar | index | 日常 / 周常 / 章节 / 活动 / 回归 |
| period_key | varchar | index | 周期 |
| progress | json |  | 进度 |
| status | varchar | index | 未完成 / 可领取 / 已领取 / 已过期 / 已回滚 |
| idempotency_key | varchar | unique nullable | 领奖幂等键 |
| quest_config_version | varchar |  | 任务配置 |
| reward_config_version | varchar |  | 奖励配置 |
| ruleset_version | varchar |  | 规则配置 |
| activated_at | datetime | index | 激活 |
| completed_at | datetime | nullable | 完成 |
| claimed_at | datetime | nullable | 领取 |

唯一键：

- `uk_player_quest_period(player_id, quest_id, period_key)`。

索引：

- `idx_quest_player_status(player_id, status)`。
- `idx_quest_type_period(quest_type, period_key)`。

`event_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| event_record_id | varchar | PK | 活动记录 |
| event_id | varchar | index | 活动 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| period_key | varchar | index | 周期 |
| province_id | varchar | index nullable | 州 |
| tower_id | varchar | index nullable | 塔 |
| contribution | bigint |  | 贡献 |
| rank_score | bigint |  | 排行分 |
| reward_state | varchar | index | 未结算 / 可领取 / 已领取 / 已补偿 / 已回滚 |
| event_config_version | varchar |  | 活动配置 |
| reward_config_version | varchar |  | 奖励配置 |
| ruleset_version | varchar |  | 规则配置 |
| created_at | datetime | index | 首次参与 |
| settled_at | datetime | index nullable | 结算 |

唯一键：

- `uk_event_player(event_id, player_id, period_key)`。

`rank_snapshot`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| snapshot_id | varchar | PK | 快照 |
| rank_id | varchar | index | 榜单 |
| era_id | varchar | index | 纪元 |
| period_type | varchar | index | 日 / 周 / 章节 / 纪元 |
| period_key | varchar | index | 周期 |
| segment_key | varchar | index | 分段 |
| status | varchar | index | 生成中 / 已锁定 / 已修正 / 已回滚 |
| rank_config_version | varchar |  | 排行配置 |
| reward_config_version | varchar |  | 奖励配置 |
| risk_ruleset_version | varchar |  | 风控规则 |
| generated_at | datetime | index | 生成 |
| locked_at | datetime | nullable | 锁定 |

唯一键：

- `uk_rank_snapshot(rank_id, period_type, period_key, segment_key)`。

`rank_entry`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| entry_id | varchar | PK | 明细 |
| snapshot_id | varchar | index | 快照 |
| target_type | varchar | index | 玩家 / 宗门 / 阵营 |
| target_id | varchar | index | 目标 |
| rank_no | int | index | 名次 |
| score | bigint |  | 分数 |
| score_detail | json |  | 分数来源 |
| reward_state | varchar | index | 未发放 / 已发放 / 冻结 / 回收 |
| risk_flag | varchar | index nullable | 风控标记 |
| created_at | datetime | index | 时间 |

唯一键：

- `uk_snapshot_target(snapshot_id, target_type, target_id)`。

索引：

- `idx_rank_no(snapshot_id, rank_no)`。
- `idx_rank_target(target_type, target_id)`。

## 九、抽卡、订单与月卡

`order_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| order_id | varchar | PK | 游戏订单 |
| fishpi_order_id | varchar | unique nullable | 鱼排订单 |
| player_id | varchar | index | 玩家 |
| product_type | varchar | index | 商品类型 |
| fishpi_point_cost | bigint |  | 鱼排积分 |
| paid_jade_amount | bigint | default 0 | 到账付费仙玉 |
| status | varchar | index | created / pending / paid / delivered / failed / refunded |
| idempotency_key | varchar | unique | 幂等键 |
| product_config_version | varchar |  | 商品配置 |
| payment_ruleset_version | varchar |  | 支付规则 |
| risk_ruleset_version | varchar | nullable | 风控规则 |
| callback_payload | json |  | 回调摘要 |
| created_at | datetime | index | 创建 |
| delivered_at | datetime | index nullable | 到账 |

`gacha_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| gacha_id | varchar | PK | 抽卡记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| pool_id | varchar | index | 卡池配置 |
| pool_type | varchar | index | 限定本命 / 九大古宝 / 常驻 |
| cost_type | varchar | index | 付费仙玉 / 绑定仙玉 / 机缘券 / 月卡赠抽 / 古宝残页合成 |
| cost_amount | bigint |  | 消耗 |
| grant_id | varchar | index nullable | 月卡赠抽 |
| count_to_pity | boolean |  | 是否计保底 |
| result_item_id | varchar | index | 结果 |
| rarity | varchar | index | 稀有度 |
| pity_before | int |  | 抽前保底 |
| pity_after | int |  | 抽后保底 |
| random_seed | varchar |  | 随机种子摘要 |
| idempotency_key | varchar | unique | 幂等键 |
| gacha_config_version | varchar |  | 卡池配置 |
| pity_ruleset_version | varchar |  | 保底规则 |
| reward_config_version | varchar |  | 奖励配置 |
| created_at | datetime | index | 时间 |

索引：

- `idx_gacha_player_pool(player_id, pool_type, created_at)`。
- `idx_gacha_pool_time(pool_type, created_at)`。
- `idx_gacha_grant(grant_id)`。

九大古宝池当前不允许 `cost_type=paid_jade` 写入成功记录。`reserved_paid_jade` 请求应在接口层返回未开放，不扣费、不改保底。

`gacha_pity_state`

主键：`(player_id, pool_id)`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| player_id | varchar | PK | 玩家 |
| pool_id | varchar | PK | 卡池 |
| pool_type | varchar | index | 卡池类型 |
| era_id | varchar | index | 当前纪元 |
| pity_count | int |  | 保底计数 |
| directional_choice | varchar | nullable | 定向选择 |
| inherit_to_next_era | boolean |  | 是否继承 |
| last_gacha_id | varchar | index nullable | 最近抽卡 |
| pity_ruleset_version | varchar |  | 保底规则 |
| updated_at | datetime |  | 更新时间 |

`monthly_card_draw_grant`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| grant_id | varchar | PK | 赠抽 |
| player_id | varchar | index | 玩家 |
| monthly_card_type | varchar | index | 小月卡 / 大月卡 |
| pool_type | varchar | index | 九大古宝专属池 |
| grant_count | int |  | 发放次数 |
| used_count | int |  | 已使用 |
| source_order_id | varchar | index | 月卡订单 |
| valid_date | date | index | 生效日期 |
| expire_at | datetime | index | 过期 |
| status | varchar | index | 未使用 / 部分使用 / 已使用 / 已过期 / 已回滚 |
| count_to_pity | boolean |  | 是否计保底 |
| gacha_config_version | varchar |  | 卡池配置 |
| created_at | datetime | index | 发放 |
| updated_at | datetime |  | 更新 |

唯一键：

- `uk_daily_grant(player_id, monthly_card_type, valid_date, pool_type)`。

## 十、交易行

`trade_listing`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| listing_id | varchar | PK | 上架单 |
| seller_id | varchar | index | 卖家 |
| item_instance_id | varchar | index | 实例 |
| item_id | varchar | index | 道具配置 |
| count | bigint |  | 数量 |
| unit_price | bigint | index | 单价 |
| total_price | bigint |  | 总价 |
| bind_type | varchar | index | 绑定快照 |
| status | varchar | index | 上架中 / 已成交 / 已撤销 / 已冻结 / 已过期 |
| idempotency_key | varchar | unique | 幂等键 |
| economy_config_version | varchar |  | 经济配置 |
| risk_ruleset_version | varchar |  | 风控规则 |
| created_at | datetime | index | 上架 |
| expire_at | datetime | index | 过期 |
| updated_at | datetime |  | 更新 |

索引：

- `idx_trade_listing_item_status(item_id, status, unit_price)`。
- `idx_trade_listing_seller(seller_id, status, created_at)`。

`trade_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| trade_id | varchar | PK | 交易记录 |
| listing_id | varchar | index | 上架单 |
| seller_id | varchar | index | 卖家 |
| buyer_id | varchar | index | 买家 |
| item_id | varchar | index | 道具 |
| count | bigint |  | 数量 |
| price | bigint |  | 成交价 |
| tax_rate | int |  | 税率，万分比 |
| status | varchar | index | 成交 / 撤销 / 冻结 / 回滚 |
| idempotency_key | varchar | unique nullable | 购买幂等键 |
| risk_flag | varchar | index nullable | 风控标记 |
| economy_config_version | varchar |  | 经济配置 |
| risk_ruleset_version | varchar |  | 风控规则 |
| created_at | datetime | index | 创建 |
| settled_at | datetime | index nullable | 结算 |

## 十一、配置、邮件、公告、GM

`config_publish_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| publish_id | varchar | PK | 发布记录 |
| config_version | varchar | index | 配置版本 |
| config_type | varchar | index | 配置类型 |
| checksum | varchar |  | 配置摘要 |
| publish_status | varchar | index | draft / testing / gray / online / rollback |
| operator_id | varchar | index | 发布人 |
| change_summary | text |  | 变更摘要 |
| validation_summary | json |  | 校验摘要 |
| active_from | datetime | index | 生效时间 |
| rollback_from | varchar | nullable | 回滚来源 |
| created_at | datetime | index | 创建 |

唯一键：

- `uk_config_version(config_version, config_type)`。

`mail_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| mail_id | varchar | PK | 邮件 |
| player_id | varchar | index nullable | 收件玩家 |
| mail_type | varchar | index | 系统 / 补偿 / 订单 / 排行 / 宗门 / 活动 |
| title | varchar |  | 标题 |
| body | text |  | 正文 |
| reward_summary | json |  | 附件 |
| target_rule | json | nullable | 群发规则 |
| source_type | varchar | index | 来源类型 |
| source_id | varchar | index nullable | 来源记录 |
| status | varchar | index | 未读 / 已读 / 已领取 / 已过期 / 已回收 |
| idempotency_key | varchar | unique nullable | 领取幂等键 |
| mail_template_version | varchar |  | 模板版本 |
| reward_config_version | varchar |  | 奖励版本 |
| expire_at | datetime | index | 过期 |
| created_at | datetime | index | 创建 |
| claimed_at | datetime | nullable | 领取 |

索引：

- `idx_mail_player_status(player_id, status)`。
- `idx_mail_expire(expire_at)`。
- `idx_mail_source(source_type, source_id)`。

`announcement_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| announcement_id | varchar | PK | 公告 |
| announcement_type | varchar | index | 维护 / 活动 / 概率 / 规则调整 / 风控说明 |
| title | varchar |  | 标题 |
| body | text |  | 正文 |
| visible_rule | json |  | 可见范围 |
| related_config_version | varchar | nullable | 关联配置 |
| publish_status | varchar | index | 草稿 / 已发布 / 已撤回 |
| operator_id | varchar | index | 发布人 |
| publish_at | datetime | index | 发布时间 |
| expire_at | datetime | index nullable | 过期 |
| created_at | datetime | index | 创建 |

索引：

- `idx_announcement_visible(publish_status, publish_at, expire_at)`。

`gm_operation_log`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| log_id | varchar | PK | GM 日志 |
| operator_id | varchar | index | 操作者 |
| operation_type | varchar | index | 操作类型 |
| target_type | varchar | index | 玩家 / 宗门 / 订单 / 交易 / 全服 |
| target_id | varchar | index | 目标 ID |
| reason | text |  | 原因 |
| before_value | json | nullable | 操作前摘要 |
| after_value | json | nullable | 操作后摘要 |
| risk_ruleset_version | varchar | nullable | 风控规则 |
| created_at | datetime | index | 时间 |

索引：

- `idx_gm_target(target_type, target_id)`。
- `idx_gm_operator(operator_id, created_at)`。
- `idx_gm_type(operation_type, created_at)`。

## 十二、幂等与事务边界

必须具备幂等键的操作：

- 领取离线收益。
- 行动提交。
- 任务奖励领取。
- 邮件附件领取。
- 抽卡。
- 炼丹、服丹、炼器、古宝日课、交易上架、交易购买。
- 订单创建和补单。
- 月卡购买。
- GM 补偿。

事务边界建议：

- 扣行动令、写行动记录、写货币/物品日志应在同一事务。
- 抽卡消耗、结果、保底变化、道具发放应在同一事务。
- 炼器消耗、装备实例、词条变化和操作记录应在同一事务。
- 炼丹消耗、结果、丹渣返还和炼丹记录应在同一事务。
- 交易购买、物品转移、扣款、税费和交易记录应在同一事务。
- 订单到账、货币增加、订单状态变更应在同一事务。
- 排行结算可先生成快照，再异步发放奖励。

## 十三、验收场景

- 研发能根据本文建立 MVP 关键表、索引和唯一键。
- 抽卡、订单、奖励领取重复请求不会重复发放。
- 战斗、行动、排行、邮件、GM 日志可按玩家和时间查询。
- 纪元结算和合服能按 `era_id` 归档和查询。
- 热数据和长日志有归档策略，不影响主流程性能。
- 炼丹、炼器、九大古宝日课、交易行和抽卡保底都有字段级表结构、主键、唯一键和核心索引。
- 九大古宝池不能写入付费仙玉成功抽卡记录，预留入口不改变 `gacha_pity_state`。
