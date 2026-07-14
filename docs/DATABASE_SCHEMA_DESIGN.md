# 《择日飞升：九塔封魔》数据库表结构设计 v0.3

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

`current_realm` 当前取值为 1-9，依次表示练气/锻体、筑基/筑身、金丹/血丹、元婴/武胎、化神/神躯、炼虚/破虚、合体/天躯、大乘/极境、真仙/真魔。境界解锁采用代码版本配置，不额外存储重复的解锁状态；建筑、分城、将领、阵型和行军操作在执行时读取玩家当前境界校验。
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

`behavior_risk_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| risk_record_id | varchar | PK | 风控记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| scene_type | varchar | index | 行动 / PVP / 九塔 / 交易 / 宗门仓库 / 抽卡订单 / 登录 |
| source_type | varchar | index | 触发来源 |
| source_id | varchar | index nullable | 关联记录 |
| request_path | varchar | index | 接口路径 |
| request_interval_ms | int | nullable | 与上次同类请求间隔 |
| request_count_window | int |  | 统计窗口请求数 |
| idempotency_key | varchar | index nullable | 幂等键 |
| device_hash | varchar | index nullable | 设备摘要 |
| ip_hash | varchar | index nullable | IP 摘要 |
| risk_score | int | index | 风险分 |
| risk_level | varchar | index | 低 / 中 / 高 / 严重 |
| matched_rules | json |  | 命中规则 |
| action_taken | varchar | index | 观察 / 限频 / 收益延迟 / 衰减 / 人工审核 / 拒绝 |
| risk_ruleset_version | varchar |  | 风控规则 |
| created_at | datetime | index | 时间 |

索引：

- `idx_risk_player_time(player_id, created_at)`。
- `idx_risk_level_time(risk_level, created_at)`。
- `idx_risk_source(source_type, source_id)`。
- `idx_risk_device_ip(device_hash, ip_hash, created_at)`。

`delayed_settlement_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| delayed_record_id | varchar | PK | 延迟结算记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| source_type | varchar | index | PVP / 九塔 / 交易 / 宗门仓库 / 其他 |
| source_id | varchar | index | 关联行动、战斗、交易或仓库记录 |
| reward_summary | json |  | 暂缓奖励 |
| contribution_summary | json | nullable | 暂缓贡献 |
| risk_record_id | varchar | index | 关联风控记录 |
| status | varchar | index | 待审核 / 已发放 / 已回滚 / 已过期 |
| reviewer_id | varchar | index nullable | 审核人 |
| review_reason | text | nullable | 审核原因 |
| reviewed_at | datetime | index nullable | 审核时间 |
| risk_ruleset_version | varchar |  | 风控规则 |
| created_at | datetime | index | 创建 |

索引：

- `idx_delayed_player_status(player_id, status)`。
- `idx_delayed_status_time(status, created_at)`。
- `idx_delayed_source(source_type, source_id)`。

`merge_dry_run_report`

P1 合服演练只生成影响报告，不修改真实业务数据。冲突明细在 P1-8 先以 JSON 摘要进入报告，真实多服合服执行开放前再拆独立冲突表。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| report_id | varchar | PK | 合服演练报告 |
| source_server_ids | jsonb | not null | 来源服务器列表 |
| target_server_id | varchar | index | 目标服务器 |
| status | varchar | index | generated / archived |
| summary | jsonb | not null | 影响摘要和数据不变更声明 |
| conflict_summary | jsonb | not null | 角色名、宗门名等通用冲突摘要 |
| asset_inheritance_summary | jsonb | not null | 付费资产、月卡、保底和订单检查 |
| rank_freeze_summary | jsonb | not null | 排行冻结和快照检查 |
| sect_conflict_summary | jsonb | not null | 宗门同名、成员上限和处理建议 |
| compensation_suggestion | jsonb | not null | 补偿建议和奖励边界 |
| risk_summary | jsonb | not null | 风险等级、待审核收益和风控记录 |
| rollback_suggestion | jsonb | not null | dry-run 和真实合服回滚建议 |
| config_version | varchar |  | 合服配置版本 |
| ruleset_version | varchar |  | 合服规则版本 |
| generated_by | varchar |  | 发起 GM |
| execute_status | varchar | index | reserved_only |
| idempotency_key | varchar | unique nullable | 生成报告幂等键 |
| created_at | datetime | index | 创建时间 |

索引：

- `uk_merge_dry_run_idempotency(idempotency_key)`。
- `idx_merge_dry_run_target(target_server_id)`。
- `idx_merge_dry_run_status(status)`。
- `idx_merge_dry_run_execute_status(execute_status)`。
- `idx_merge_dry_run_created_at(created_at)`。

## 十二、P2 长线增强表结构

P2 表结构为设计占位，正式 migration 可按功能阶段拆分落地。所有 P2 表都必须保留配置版本、来源记录和审计所需字段。

`story_scroll_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| scroll_record_id | varchar | PK | 章节卷轴记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| scroll_id | varchar | index | 章节卷轴配置 |
| chapter_id | varchar | index | 章节 |
| unlock_state | varchar | index | locked / unlocked / archived |
| fragment_state | jsonb | not null | 已解锁片段、选择和降级摘要 |
| battle_refs | jsonb |  | 关联战报和展示权限 |
| choice_summary | jsonb |  | 关键选择摘要 |
| source_type | varchar | index | 来源类型 |
| source_id | varchar | index nullable | 来源记录 |
| story_config_version | varchar |  | 剧情配置版本 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

索引：

- `idx_story_scroll_player(player_id, era_id, chapter_id)`。
- `idx_story_scroll_source(source_type, source_id)`。

`era_chronicle_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| chronicle_id | varchar | PK | 纪元史册记录 |
| era_id | varchar | index | 纪元 |
| server_id | varchar | index | 服务器 |
| chronicle_type | varchar | index | 排行 / 阵营结局 / 九塔状态 / 活动节点 / 合服演练摘要 |
| public_summary | jsonb | not null | 玩家可见摘要 |
| private_summary | jsonb | nullable | 后台内部摘要 |
| related_snapshot_id | varchar | index nullable | 关联快照 |
| related_source_ids | jsonb |  | 关联来源 ID |
| visibility_rule | varchar | index | public / server / sect / personal / admin |
| story_config_version | varchar |  | 史册配置版本 |
| created_at | datetime | index | 创建 |

索引：

- `idx_era_chronicle_server(era_id, server_id, chronicle_type)`。
- `idx_era_chronicle_visibility(visibility_rule, created_at)`。

`era_collection_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| collection_record_id | varchar | PK | 收藏记录 |
| player_id | varchar | index | 玩家 |
| source_era_id | varchar | index | 来源纪元 |
| target_era_id | varchar | index nullable | 当前展示纪元 |
| collection_id | varchar | index | 收藏配置 |
| collection_type | varchar | index | 称号 / 纪念物 / 图鉴 / 史册 / 活动纪念 / 古宝图鉴外观 |
| source_type | varchar | index | 来源类型 |
| source_id | varchar | index nullable | 来源记录 |
| display_state | varchar | index | hidden / displayed / archived |
| duplicate_convert_summary | jsonb | nullable | 重复收藏转化 |
| blessing_effective | boolean | default false | 当前有效祝福 |
| blessing_cap_summary | jsonb | nullable | 祝福限幅摘要 |
| collection_config_version | varchar |  | 收藏配置版本 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

唯一键：

- `uk_collection_player_source(player_id, source_era_id, collection_id)`。

索引：

- `idx_collection_player_display(player_id, display_state)`。
- `idx_collection_type(collection_type, created_at)`。

`appearance_ownership_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| ownership_record_id | varchar | PK | 外观持有记录 |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 获得纪元 |
| appearance_id | varchar | index | 外观配置 |
| appearance_type | varchar | index | 动态称号 / 名片 / 战报 / 洞府 / 宗门驻地装饰 |
| source_type | varchar | index | 来源类型 |
| source_id | varchar | index nullable | 来源记录 |
| display_slot | varchar | index nullable | 当前装备位置 |
| inherit_state | varchar | index | none / display / atlas |
| expire_at | datetime | index nullable | 过期 |
| status | varchar | index | owned / equipped / expired / revoked |
| appearance_config_version | varchar |  | 外观配置版本 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

唯一键：

- `uk_appearance_player(player_id, appearance_id)`。

索引：

- `idx_appearance_player_slot(player_id, display_slot, status)`。
- `idx_appearance_expire(expire_at, status)`。

`mentor_relation_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| mentor_relation_id | varchar | PK | 师徒关系 |
| mentor_player_id | varchar | index | 导师 |
| apprentice_player_id | varchar | index | 徒弟 |
| era_id | varchar | index | 纪元 |
| status | varchar | index | pending / active / graduated / dissolved / rejected |
| task_summary | jsonb |  | 师徒任务摘要 |
| reward_boundary_summary | jsonb |  | 奖励边界 |
| cooldown_until | datetime | index nullable | 冷却结束 |
| risk_summary | jsonb | nullable | 风控摘要 |
| idempotency_key | varchar | unique nullable | 状态变更幂等键 |
| mentor_config_version | varchar |  | 导师配置 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

索引：

- `idx_mentor_pair(mentor_player_id, apprentice_player_id, status)`。
- `idx_mentor_apprentice(apprentice_player_id, status)`。

`sect_diplomacy_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| diplomacy_record_id | varchar | PK | 外交记录 |
| source_sect_id | varchar | index | 发起宗门 |
| target_sect_id | varchar | index | 目标宗门 |
| era_id | varchar | index | 纪元 |
| diplomacy_type | varchar | index | alliance / hostility / aid / defense |
| status | varchar | index | proposed / active / rejected / expired / dissolved |
| proposal_summary | jsonb | not null | 提案摘要 |
| approval_summary | jsonb | nullable | 审批摘要 |
| cooldown_until | datetime | index nullable | 冷却结束 |
| announcement_id | varchar | index nullable | 关联公告 |
| idempotency_key | varchar | unique nullable | 状态变更幂等键 |
| diplomacy_config_version | varchar |  | 外交配置 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

索引：

- `idx_diplomacy_pair(source_sect_id, target_sect_id, status)`。
- `idx_diplomacy_era_type(era_id, diplomacy_type, status)`。

`sect_hire_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| hire_record_id | varchar | PK | 雇佣委托 |
| employer_sect_id | varchar | index | 发起宗门 |
| helper_sect_id | varchar | index nullable | 协助宗门 |
| helper_player_id | varchar | index nullable | 协助玩家 |
| era_id | varchar | index | 纪元 |
| hire_type | varchar | index | 探索协助 / 宗门建设 / 九塔补给 / 活动协助 |
| status | varchar | index | open / accepted / completed / canceled / settled / rolled_back |
| allowed_action_scope | jsonb | not null | 可协助行动范围 |
| reward_escrow_summary | jsonb | not null | 托管奖励 |
| risk_status | varchar | index | normal / delayed_settlement / decayed / manual_review |
| idempotency_key | varchar | unique nullable | 状态变更幂等键 |
| hire_config_version | varchar |  | 雇佣配置 |
| reward_config_version | varchar |  | 奖励配置 |
| created_at | datetime | index | 创建 |
| settled_at | datetime | index nullable | 结算 |

索引：

- `idx_hire_status(status, created_at)`。
- `idx_hire_helper(helper_sect_id, helper_player_id, status)`。

`transfer_request_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| transfer_request_id | varchar | PK | 转服申请 |
| player_id | varchar | index | 玩家 |
| account_id | varchar | index | 账号 |
| source_server_id | varchar | index | 来源服务器 |
| target_server_id | varchar | index | 目标服务器 |
| era_id | varchar | index | 纪元 |
| status | varchar | index | draft / submitted / reviewing / rejected / pending_confirm / executed / canceled / rolled_back |
| dry_run_report | jsonb | not null | 个人影响报告 |
| asset_mapping_summary | jsonb | nullable | 资产映射摘要 |
| rank_cooldown_until | datetime | index nullable | 排行冷却 |
| sect_cleanup_summary | jsonb | nullable | 宗门和外交清理 |
| payment_asset_check_summary | jsonb | nullable | 付费资产、月卡、订单和保底检查 |
| risk_summary | jsonb | nullable | 风险摘要 |
| review_operator_id | varchar | index nullable | 审核 GM |
| review_reason | text | nullable | 审核原因 |
| execute_status | varchar | index | dry_run_only / reserved_only / executed |
| idempotency_key | varchar | unique nullable | 申请或执行幂等键 |
| transfer_config_version | varchar |  | 转服配置 |
| created_at | datetime | index | 创建 |
| reviewed_at | datetime | index nullable | 审核 |
| executed_at | datetime | index nullable | 执行 |

索引：

- `idx_transfer_player(player_id, status, created_at)`。
- `idx_transfer_target(target_server_id, status)`。
- `idx_transfer_execute_status(execute_status)`。
- `idx_transfer_rank_cooldown(rank_cooldown_until)`。

## 十三、九州城池重构表结构占位

本节对应 [《九州城池纪元》重策划案](JIUZHOU_CITY_ERA_DESIGN.md)。R1 实现前可先按以下表结构细化 Prisma migration。

`player_city`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| city_id | varchar | PK | 城池 ID |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| city_type | varchar | index | main / sub |
| province_id | varchar | index | 州 |
| commandery_id | varchar | index | 郡 |
| tile_id | varchar | unique | 所在地块 |
| city_name | varchar |  | 城池名 |
| city_level | int | index | 城池等级 |
| status | varchar | index | normal / protected / damaged / besieged / vassal |
| protection_until | datetime | index nullable | 新手、迁城或战败保护到期 |
| owner_sect_id | varchar | index nullable | 宗门归属 |
| defense_snapshot | jsonb |  | 驻防与城防摘要 |
| resource_snapshot | jsonb |  | 资源摘要 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

`map_tile`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| tile_id | varchar | PK | 地块 ID |
| era_id | varchar | index | 纪元 |
| province_id | varchar | index | 州 |
| commandery_id | varchar | index | 郡 |
| x | int | index | 坐标 X |
| y | int | index | 坐标 Y |
| tile_type | varchar | index | main_city / wild / resource / pass / capital / tower |
| visibility | varchar | index | hidden / scouted / visible |
| owner_player_id | varchar | index nullable | 玩家归属 |
| owner_sect_id | varchar | index nullable | 宗门归属 |
| owner_province_id | varchar | index nullable | 州势力归属 |
| state_snapshot | jsonb |  | 地块状态、驻防、产出和事件摘要 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

唯一键：

- `uk_map_tile_coord(era_id, province_id, x, y)`。

`territory_node`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| node_id | varchar | PK | 节点 ID |
| tile_id | varchar | index | 所属地块 |
| era_id | varchar | index | 纪元 |
| node_type | varchar | index | farm / mine / forest / vein / pass / capital / tower |
| level | int | index | 节点等级 |
| owner_player_id | varchar | index nullable | 玩家归属 |
| owner_sect_id | varchar | index nullable | 宗门归属 |
| owner_province_id | varchar | index nullable | 州归属 |
| production_snapshot | jsonb |  | 产出、维护和收益权摘要 |
| defense_snapshot | jsonb |  | 守军和驻防摘要 |
| status | varchar | index | idle / occupied / contested / protected / locked |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

`march_queue`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| march_id | varchar | PK | 行军 ID |
| player_id | varchar | index | 玩家 |
| era_id | varchar | index | 纪元 |
| source_tile_id | varchar | index | 出发地 |
| target_tile_id | varchar | index | 目标地 |
| target_node_id | varchar | index nullable | 目标节点 |
| march_type | varchar | index | scout / clear_wild / reinforce / siege / return |
| army_snapshot | jsonb |  | 队伍、将领、道兵、技能和补给摘要 |
| status | varchar | index | marching / arrived / resolving / returning / completed / canceled |
| arrives_at | datetime | index | 到达时间 |
| idempotency_key | varchar | unique | 幂等键 |
| created_at | datetime | index | 创建 |
| updated_at | datetime |  | 更新 |

`world_block_ownership`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| ownership_id | varchar | PK | 产权记录 |
| player_id | varchar | index | 产权玩家 |
| era_id | varchar | index | 纪元 |
| tile_id | varchar | unique(era_id, tile_id) | 区块，同纪元唯一产权 |
| province_id | varchar | index | 州 |
| commandery_id | varchar | index | 郡 |
| terrain_type | varchar | index | 地形 |
| ownership_type | varchar | index | main_city / sub_city / purchase / system |
| source_type | varchar | index | settle / sub_city / purchase / system |
| source_id | varchar | nullable | 建城、购买或系统来源 ID |
| purchase_cost | bigint |  | 普通灵石购买成本 |
| idempotency_key | varchar | unique nullable | 购买幂等键 |
| owned_at | datetime | index | 获得产权时间 |
| updated_at | datetime |  | 更新 |

`world_block_clearance`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| clearance_id | varchar | PK | 清野尝试记录 |
| player_id | varchar | index | 发起清野的玩家 |
| era_id | varchar | index | 纪元 |
| source_march_id | varchar | unique | 已抵达的清野行军 |
| tile_id | varchar | index | 目标区块 |
| province_id | varchar | index | 州 |
| commandery_id | varchar | index | 郡 |
| status | varchar | index | cleared / failed |
| team_power | int |  | 结算时队伍战力 |
| enemy_power | int |  | 守域野怪战力 |
| battle_id | varchar | index | 清野战报 |
| idempotency_key | varchar | unique | 清野结算幂等键 |
| config_version | varchar |  | 清野配置版本 |
| resolved_at | datetime | index | 结算时间 |

清野记录按玩家生效。甲玩家清野成功不会为乙玩家解锁购买资格，且任何清野记录都不得直接创建 `world_block_ownership`。

`strategic_control_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| control_id | varchar | PK | 战略控制记录 |
| era_id | varchar | index | 纪元 |
| tile_id | varchar | index | 关隘、州府或九塔区块 |
| controller_type | varchar | index | sect / province_alliance |
| controller_id | varchar | index | 控制宗门或州盟 |
| control_type | varchar | index | pass / capital / tower |
| status | varchar | index | active / contested / expired |
| starts_at | datetime | index | 控制开始时间 |
| expires_at | datetime | index | 周期控制结束时间 |
| battle_report_id | varchar | index nullable | 关联战报 |
| created_at | datetime | index | 创建 |

R3-02 中控制记录使用 `active / failed / expired` 状态。当前为个人先锋控制，`controller_type=player`；R4 宗门集结完成后可扩展为 `sect`，但无论控制者是谁，都不修改普通区块产权。

`siege_record`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| siege_id | varchar | PK | 攻城记录 |
| era_id | varchar | index | 纪元 |
| target_city_id | varchar | index | 目标城池 |
| attacker_player_id | varchar | index | 进攻玩家 |
| defender_player_id | varchar | index | 防守玩家 |
| status | varchar | index | started / resolved / protected / damaged / vassal |
| city_state_before | jsonb |  | 城池前状态 |
| city_state_after | jsonb |  | 城池后状态 |
| protection_until | datetime | index nullable | 战后保护 |
| battle_report_id | varchar | index nullable | 战报 |
| idempotency_key | varchar | unique | 幂等键 |
| created_at | datetime | index | 创建 |

R3-01 实现中，`siege_record.status` 使用 `won / lost / captured`。`captured` 只允许用于分城破防，并在同一事务中更新 `player_city.player_id` 与 `world_block_ownership.player_id`；主城记录不得进入 `captured`。

`province_war_state`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| province_war_id | varchar | PK | 州战状态 ID |
| era_id | varchar | index | 纪元 |
| season_id | varchar | index | 赛季 |
| province_id | varchar | index | 州 |
| city_control_score | bigint |  | 城池占有积分 |
| vein_control_score | bigint |  | 灵脉控制积分 |
| pass_control_score | bigint |  | 关隘控制积分 |
| tower_control_score | bigint |  | 九塔奇观积分 |
| war_score | bigint | index | 州势力总积分 |
| ranking_snapshot | jsonb |  | 排名快照 |
| settlement_status | varchar | index | open / daily_settled / weekly_settled / season_settled |
| updated_at | datetime | index | 更新 |

核心索引：

- `idx_city_player(player_id, city_type, status)`。
- `idx_tile_province_coord(era_id, province_id, x, y)`。
- `idx_tile_owner(owner_player_id, owner_sect_id, owner_province_id)`。
- `idx_node_owner(owner_player_id, owner_sect_id, node_type)`。
- `idx_march_player_status(player_id, status, arrives_at)`。
- `idx_march_target(target_tile_id, status, arrives_at)`。
- `idx_occupation_tile(tile_id, created_at)`。
- `idx_province_war(season_id, province_id, war_score)`。

## 十四、幂等与事务边界

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
- 合服 dry-run 报告生成和执行预留审计。
- P2 收藏展示装备、深度外观装备、导师申请 / 审批 / 出师、宗门外交提案 / 审批、跨宗门雇佣创建 / 接取 / 结算。
- P2 转服申请、取消、dry-run 报告生成、人工审核和执行预留。
- R1-R6 城池建造、产出领取、行军、侦查、区块购买、驻防、攻城、撤防和州战结算。

驻防事务必须同时更新 `territory_garrison` 与主城 `resource_snapshot.soldier`。提高目标驻军只扣除差额，降低目标驻军将差额返还主城，目标值为 `0` 时删除驻防记录；同一幂等键不得重复扣兵或返兵。

事务边界建议：

- 扣行动令、写行动记录、写货币/物品日志应在同一事务。
- 抽卡消耗、结果、保底变化、道具发放应在同一事务。
- 炼器消耗、装备实例、词条变化和操作记录应在同一事务。
- 炼丹消耗、结果、丹渣返还和炼丹记录应在同一事务。
- 交易购买、物品转移、扣款、税费和交易记录应在同一事务。
- 订单到账、货币增加、订单状态变更应在同一事务。
- 高风险收益进入延迟结算时，原始行动记录、风控记录和延迟结算记录应在同一事务或同一可靠队列链路内完成。
- 排行结算可先生成快照，再异步发放奖励。
- 合服 dry-run 只能读取业务表并写入 `merge_dry_run_report`、`gm_operation_log` 和幂等记录，不得修改玩家、宗门、排行、订单、保底、活动和纪元状态。
- P2 剧情卷轴和纪元史册只写展示记录，不应和奖励结算放在同一强事务中阻塞主流程。
- P2 收藏和外观装备只更新展示状态，不得修改战斗属性、掉落倍率、贡献倍率和排行分数。
- P2 导师、外交和雇佣结算必须把奖励托管、风控记录、收益衰减和审计日志纳入同一事务或可靠队列链路。
- P2 转服执行前必须先写 dry-run 报告、审核记录和 GM 操作日志；真实迁移开放时，资产映射、排行冷却、宗门清理和幂等记录必须在可回滚事务链路中完成。
- R1-R6 行军扣资源、写队列、写行为日志必须在同一事务；区块购买必须同时写钱包日志、唯一产权、幂等记录和审计日志；清野与攻城不得写入产权变化；主城和分城攻破只能写可恢复状态。

## 十五、验收场景

- 研发能根据本文建立 MVP 关键表、索引和唯一键。
- 抽卡、订单、奖励领取重复请求不会重复发放。
- 战斗、行动、排行、邮件、GM 日志可按玩家和时间查询。
- 纪元结算和合服能按 `era_id` 归档和查询。
- 热数据和长日志有归档策略，不影响主流程性能。
- 炼丹、炼器、九大古宝日课、交易行和抽卡保底都有字段级表结构、主键、唯一键和核心索引。
- 九大古宝池不能写入付费仙玉成功抽卡记录，预留入口不改变 `gacha_pity_state`。
- 行为风控和延迟结算有字段级表结构，可追溯脚本点击风险、权益越权、收益暂缓和人工审核结果。
- 合服 dry-run 有字段级报告表，执行预留只写审计日志，不执行真实合服。
- P2 章节卷轴、纪元史册、收藏、外观、导师、外交、雇佣和转服都有字段级表结构、主键、核心索引和幂等边界。
- P2 收藏和外观表不含战力、掉落倍率、贡献倍率和排行加成字段。
- P2 转服表能追溯 dry-run、审核、资产映射、排行冷却、宗门清理、执行状态和审计记录。
- R1-R6 城池表能覆盖主城、分城、地图地块、行军队列、区块产权、战略控制权、攻城保护和州战积分。
- R2 城池经营读取 `player_city.resource_snapshot`、`territory_collected_at` 与 `city_building`，资源领取受仓库容量限制，建筑升级同一主城仅允许一个活动队列。
- `city_army_preset` 按玩家与预设类型唯一保存行军 / 驻防配置；`march_queue.team_snapshot` 与 `territory_garrison.preset_snapshot` 固化结算时使用的将领、阵型和兵力。
