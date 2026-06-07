# 《择日飞升：九塔封魔》核心数据模型草案 v0.9

## 一、定位

本文是 P0 数据模型草案，用于支撑后续拆表、建接口和划分服务边界。本文不绑定具体数据库，只定义核心对象、关键字段和关系。

字段命名以 snake_case 表示，具体实现可按技术栈调整。

## 二、核心对象

| 对象 | 说明 |
| --- | --- |
| player | 玩家账号内角色 |
| player_progress | 玩家修行和章节进度 |
| player_inventory | 玩家道具和货币 |
| equipment_instance | 法宝和装备实例 |
| equipment_affix | 法宝词条 |
| equipment_operation_record | 炼器、淬炼、铭刻、升星、洗髓、分解记录 |
| alchemy_record | 炼丹记录 |
| pill_use_record | 丹药服用和递减记录 |
| ancient_treasure_state | 九大古宝持有、星级、碎片和图鉴状态 |
| ancient_treasure_use_record | 九大古宝日课主动触发记录 |
| sect | 宗门 |
| sect_member | 宗门成员 |
| sect_war_record | 宗门战记录 |
| province_state | 九州状态 |
| tower_state | 九塔状态 |
| astronomy_state | 天象状态 |
| player_astronomy_choice | 玩家择日选择 |
| cave_facility | 洞府设施 |
| inner_world_state | 内天地状态 |
| inner_world_assignment | 内天地派驻 |
| inner_world_creature | P1 内天地生灵 |
| inner_world_law_record | P1 法则经验记录 |
| inner_world_support_record | P1 九州支援记录 |
| player_faction_state | P1 玩家阵营路线状态 |
| faction_transfer_record | P1 转道记录 |
| action_record | 异步行动记录 |
| battle_log | 战斗日志 |
| quest_record | 任务记录 |
| event_instance | P1 活动实例 |
| event_record | 活动参与记录 |
| event_reward_record | P1 活动奖励记录 |
| rank_snapshot | 排行榜快照 |
| rank_entry | 排行榜明细 |
| title_inheritance_record | P1 称号继承记录 |
| achievement_record | 成就记录 |
| title_record | 称号发放记录 |
| player_title | 玩家称号持有状态 |
| order_record | 鱼排积分订单 |
| gacha_record | 抽卡记录 |
| gacha_pity_state | 卡池保底状态 |
| monthly_card_draw_grant | 月卡赠抽记录 |
| trade_listing | 交易行上架单 |
| trade_record | 交易行记录 |
| era_record | 纪元记录 |
| gm_operation_log | GM 操作日志 |
| behavior_risk_record | 行为风控记录 |
| delayed_settlement_record | 收益延迟结算记录 |
| config_version | 配置版本快照 |
| config_publish_record | 配置发布记录 |
| mail_record | 邮件记录 |
| announcement_record | 公告记录 |
| merge_dry_run_report | P1 合服演练报告 |
| merge_conflict_item | P1 合服冲突项 |

所有可回放、可补偿、可结算的记录必须保存配置版本。版本字段用于处理长线运营中的数值调整、战报复现、补单、补偿和回滚。

公共版本字段：

| 字段 | 说明 |
| --- | --- |
| config_version | 综合配置版本 |
| ruleset_version | 规则集版本 |
| reward_config_version | 奖励配置版本 |
| risk_ruleset_version | 风控规则版本 |

## 三、玩家模型

`player`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家唯一 ID |
| account_id | 账号 ID |
| fishpi_user_id | 鱼排用户 ID，未绑定为空 |
| name | 角色名 |
| route | 练气 / 炼体 |
| alignment | 未定 / 成仙 / 成魔 / 散修 |
| current_realm | 当前大境界 |
| current_stage | 当前小境界 |
| current_level | 当前小等级 |
| sect_id | 宗门 ID |
| created_at | 创建时间 |
| last_login_at | 最近登录时间 |
| status | 正常 / 冻结 / 封禁 |

`player_progress`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家 ID |
| cultivation_value | 修为或气血精元 |
| breakthrough_fail_count | 当前大境界突破失败次数 |
| calamity_value | 劫气保底 |
| chapter_id | 当前章节 |
| newbie_protection_until | 新手保护结束时间 |
| catchup_bonus_rate | 当前追赶加成 |
| daily_active_score | 今日活跃 |
| weekly_active_score | 本周活跃 |

## 四、货币与背包

`player_wallet`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家 ID |
| spirit_stone | 灵石 |
| immortal_stone | 仙石 |
| jade_paid | 付费仙玉 |
| jade_bound | 绑定仙玉 |
| era_point | 纪元积分 |

`player_item`

| 字段 | 说明 |
| --- | --- |
| item_instance_id | 道具实例 ID |
| player_id | 玩家 ID |
| item_id | 配置道具 ID |
| count | 数量 |
| bind_type | 非绑定 / 绑定 / 账号绑定 |
| source | 来源 |
| expire_at | 过期时间，可为空 |

### 丹药、炼器与九大古宝模型

`alchemy_record`

| 字段 | 说明 |
| --- | --- |
| alchemy_record_id | 炼丹记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| recipe_id | 丹方配置 ID |
| pill_rank | 丹阶 |
| result_pill_id | 结果丹药 ID，可为空 |
| quality | 下品 / 中品 / 上品 / 极品 / 无瑕 / 失败 |
| success | 是否成功 |
| material_cost_summary | 消耗材料摘要 |
| refund_summary | 失败返还或丹渣摘要 |
| idempotency_key | 幂等键 |
| alchemy_config_version | 炼丹配置版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 时间 |

`pill_use_record`

| 字段 | 说明 |
| --- | --- |
| pill_use_record_id | 服丹记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| pill_id | 丹药 ID |
| pill_rank | 丹阶 |
| pill_type | 丹药类型 |
| quality | 丹药品质 |
| same_rank_type_count_before | 同阶同类服用前计数 |
| effect_rate | 本次递减后倍率 |
| effect_summary | 实际效果摘要 |
| idempotency_key | 幂等键 |
| pill_config_version | 丹药配置版本 |
| ruleset_version | 递减规则版本 |
| created_at | 时间 |

`equipment_instance`

| 字段 | 说明 |
| --- | --- |
| equipment_id | 法宝实例 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| item_id | 法宝配置 ID |
| equipment_type | 普通法宝 / 本命法宝 / 仙品法宝 |
| slot | 装备位，可为空 |
| rarity | 稀有度 |
| star_level | 星级 |
| durability | 耐久 |
| bind_type | 非绑定 / 绑定 / 账号绑定 |
| locked | 是否锁定 |
| source_type | 炼器 / 掉落 / 任务 / 抽取 |
| equipment_config_version | 法宝配置版本 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

`equipment_affix`

| 字段 | 说明 |
| --- | --- |
| affix_instance_id | 词条实例 ID |
| equipment_id | 法宝实例 ID |
| player_id | 玩家 ID |
| affix_id | 词条配置 ID |
| affix_slot | main / sub / hidden |
| value | 词条数值 |
| quality | 词条品质 |
| locked | 淬炼时是否锁定 |
| affix_config_version | 词条配置版本 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

`equipment_operation_record`

| 字段 | 说明 |
| --- | --- |
| operation_record_id | 炼器操作记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| operation_type | 炼制 / 淬炼 / 铭刻 / 升星 / 洗髓 / 分解 / 装备 / 锁定 |
| equipment_id | 目标法宝，可为空 |
| before_snapshot | 操作前摘要 |
| after_snapshot | 操作后摘要 |
| cost_summary | 消耗摘要 |
| refund_summary | 返还摘要 |
| idempotency_key | 幂等键 |
| forge_config_version | 炼器配置版本 |
| affix_config_version | 词条配置版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 时间 |

`ancient_treasure_state`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家 ID |
| treasure_id | 九大古宝 ID |
| era_id | 纪元 ID |
| owned | 是否拥有当纪元战力状态 |
| star_level | 当纪元星级 |
| fragment_count | 当纪元碎片数 |
| atlas_unlocked | 图鉴是否解锁 |
| inherited_atlas | 是否来自纪元继承图鉴 |
| active_use_count_today | 今日主动触发次数 |
| treasure_config_version | 古宝配置版本 |
| updated_at | 更新时间 |

`ancient_treasure_use_record`

| 字段 | 说明 |
| --- | --- |
| use_record_id | 古宝日课记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| treasure_id | 九大古宝 ID |
| active_type | 提炼丹药 / 保留词条 / 保存天象等 |
| target_type | 丹药 / 法宝 / 天象 / 九州事件 |
| target_id | 目标 ID |
| daily_count_before | 使用前全局主动次数 |
| daily_count_after | 使用后全局主动次数 |
| result_summary | 结果摘要 |
| idempotency_key | 幂等键 |
| treasure_config_version | 古宝配置版本 |
| ruleset_version | 古宝日课规则版本 |
| created_at | 时间 |

## 五、宗门

`sect`

| 字段 | 说明 |
| --- | --- |
| sect_id | 宗门 ID |
| name | 宗门名 |
| stance | 仙盟 / 魔宗 / 散修 |
| level | 宗门等级 |
| leader_player_id | 宗主 ID |
| member_limit | 成员上限 |
| province_id | 驻地州 |
| build_exp | 建设经验 |
| created_at | 创建时间 |
| stance_changed_at | 最近立场切换时间 |

`sect_member`

| 字段 | 说明 |
| --- | --- |
| sect_id | 宗门 ID |
| player_id | 玩家 ID |
| role | 宗主 / 长老 / 执事 / 弟子 |
| joined_at | 加入时间 |
| contribution_weekly | 本周宗门贡献 |
| contribution_total | 总宗门贡献 |
| warehouse_quota_used | 今日仓库额度 |

`sect_warehouse_log`

| 字段 | 说明 |
| --- | --- |
| log_id | 日志 ID |
| sect_id | 宗门 ID |
| player_id | 操作者 |
| item_id | 道具 ID |
| count | 数量 |
| operation | 存入 / 取出 / 审批 / 拒绝 |
| approver_id | 审批人 |
| created_at | 时间 |

## 六、九州和九塔

`province_state`

| 字段 | 说明 |
| --- | --- |
| province_id | 冀 / 兖 / 青 / 徐 / 扬 / 荆 / 豫 / 梁 / 雍 |
| era_id | 纪元 ID |
| unlocked | 是否开放 |
| corruption | 魔染度 |
| public_support | 民望 |
| spirit_vein_level | 灵脉等级 |
| faction_control_fairy | 仙盟控制度 |
| faction_control_demon | 魔宗控制度 |
| faction_control_free | 散修控制度 |
| updated_at | 更新时间 |

`tower_state`

| 字段 | 说明 |
| --- | --- |
| tower_id | 塔 ID |
| province_id | 所属州 |
| era_id | 纪元 ID |
| integrity | 完整度 |
| rift_pressure | 裂隙压力 |
| seal_value | 镇封度 |
| break_value | 破封度 |
| boss_phase | 塔灵 / Boss 阶段 |
| daily_contribution_fairy | 今日仙盟贡献 |
| daily_contribution_demon | 今日魔宗贡献 |
| daily_contribution_free | 今日散修贡献 |
| weekly_locked_state | 周结锁定状态 |

## 七、异步行动

`action_record`

| 字段 | 说明 |
| --- | --- |
| action_id | 行动 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| action_type | 探索 / 九塔 / PVP / 秘境 / Boss |
| target_type | 州 / 塔 / 玩家 / 宗门 / Boss |
| target_id | 目标 ID |
| cost_token_type | 消耗行动令类型 |
| cost_token_count | 消耗数量 |
| contribution | 有效贡献 |
| reward_summary | 奖励摘要 |
| config_version | 行动配置版本 |
| ruleset_version | 行动规则版本 |
| reward_config_version | 奖励配置版本 |
| status | 已提交 / 已结算 / 已回滚 |
| created_at | 提交时间 |
| settled_at | 结算时间 |

## 八、战斗日志

`battle_log`

| 字段 | 说明 |
| --- | --- |
| battle_id | 战斗 ID |
| scene_type | 探索 / PVP / 九塔 / Boss / 宗门战 |
| attacker_id | 攻击方 |
| defender_id | 防守方，可为空 |
| attacker_snapshot | 攻击方快照 |
| defender_snapshot | 防守方快照 |
| random_seed | 随机种子 |
| combat_config_version | 战斗配置版本 |
| skill_config_version | 技能配置版本 |
| enemy_config_version | 怪物配置版本 |
| power_cap_config_version | 强度压缩配置版本 |
| reward_config_version | 奖励配置版本 |
| result | 胜 / 负 / 超时 |
| result_reason | 胜负原因 |
| rounds | 回合摘要 |
| reward_summary | 奖励摘要 |
| created_at | 时间 |

战斗回放必须使用快照和随机种子复现，不能依赖当前角色状态。

## 九、订单和抽卡

`order_record`

| 字段 | 说明 |
| --- | --- |
| order_id | 游戏订单 ID |
| fishpi_order_id | 鱼排订单 ID |
| player_id | 玩家 ID |
| product_type | 仙玉 / 月卡 / 其他 |
| fishpi_point_cost | 消耗鱼排积分 |
| paid_jade_amount | 付费仙玉数量 |
| status | created / pending / paid / delivered / failed / refunded |
| idempotency_key | 幂等键 |
| product_config_version | 商品配置版本 |
| payment_ruleset_version | 支付规则版本 |
| callback_payload | 回调摘要 |
| created_at | 创建时间 |
| delivered_at | 到账时间 |

`gacha_record`

| 字段 | 说明 |
| --- | --- |
| gacha_id | 抽卡记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| pool_id | 卡池配置 ID |
| pool_type | 限定本命 / 九大古宝 / 常驻 |
| cost_type | 付费仙玉 / 绑定仙玉 / 机缘券 / 月卡赠抽 / 古宝残页合成 / 预留付费仙玉 |
| cost_amount | 消耗数量 |
| draw_source | 限定本命付费仙玉 / 常驻券 / 月卡赠抽 / 残页合成 |
| grant_id | 月卡赠抽记录 ID，可为空 |
| count_to_pity | 是否计入保底 |
| result_item_id | 结果道具 |
| rarity | 稀有度 |
| pity_before | 抽前保底 |
| pity_after | 抽后保底 |
| random_seed | 随机种子 |
| idempotency_key | 幂等键 |
| gacha_config_version | 卡池配置版本 |
| pity_ruleset_version | 保底规则版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 时间 |

九大古宝专属池当前只允许 `月卡赠抽` 和 `古宝残页合成` 产生成功 `gacha_record`。`预留付费仙玉` 请求当前应返回未开放错误，不扣费、不写成功抽卡记录、不改变保底。

`gacha_pity_state`

| 字段 | 说明 |
| --- | --- |
| pity_state_id | 保底状态 ID |
| player_id | 玩家 ID |
| pool_type | 限定本命 / 九大古宝 / 常驻 |
| pool_id | 卡池配置 ID |
| era_id | 纪元 ID |
| pity_count | 当前保底计数 |
| directional_choice | 定向目标，可为空 |
| inherit_to_next_era | 是否继承到下一纪元 |
| last_gacha_id | 最近抽卡记录 |
| pity_ruleset_version | 保底规则版本 |
| updated_at | 更新时间 |

`monthly_card_draw_grant`

| 字段 | 说明 |
| --- | --- |
| grant_id | 赠抽记录 ID |
| player_id | 玩家 ID |
| monthly_card_type | 小月卡 / 大月卡 |
| pool_type | 九大古宝专属池 |
| grant_count | 发放次数 |
| used_count | 已使用次数 |
| source_order_id | 月卡订单 ID |
| valid_date | 生效日期 |
| expire_at | 过期时间 |
| status | 未使用 / 部分使用 / 已使用 / 已过期 / 已回滚 |
| count_to_pity | 是否计入保底 |
| gacha_config_version | 卡池配置版本 |
| created_at | 发放时间 |
| updated_at | 更新时间 |

## 十、交易行

`trade_listing`

| 字段 | 说明 |
| --- | --- |
| listing_id | 上架单 ID |
| seller_id | 卖家 |
| item_instance_id | 道具或法宝实例 ID |
| item_id | 配置道具 ID |
| count | 数量 |
| unit_price | 单价 |
| total_price | 总价 |
| bind_type | 绑定状态快照 |
| status | 上架中 / 已成交 / 已撤销 / 已冻结 / 已过期 |
| idempotency_key | 上架幂等键 |
| economy_config_version | 经济配置版本 |
| risk_ruleset_version | 风控规则版本 |
| created_at | 上架时间 |
| expire_at | 过期时间 |
| updated_at | 更新时间 |

`trade_record`

| 字段 | 说明 |
| --- | --- |
| trade_id | 交易 ID |
| listing_id | 上架单 ID |
| seller_id | 卖家 |
| buyer_id | 买家 |
| item_id | 道具 ID |
| count | 数量 |
| price | 成交价 |
| tax_rate | 税率 |
| status | 上架 / 成交 / 撤销 / 冻结 / 回滚 |
| idempotency_key | 幂等键，可为空 |
| risk_flag | 风控标记 |
| economy_config_version | 经济配置版本 |
| risk_ruleset_version | 风控规则版本 |
| created_at | 上架时间 |
| settled_at | 成交时间 |

## 十一、纪元

`era_record`

| 字段 | 说明 |
| --- | --- |
| era_id | 纪元 ID |
| server_id | 服务器 ID |
| start_at | 开始时间 |
| current_day | 当前纪元天数 |
| current_chapter | 当前章节 |
| status | 进行中 / 最终战 / 结算 / 已结束 |
| demon_king_form | 魔王形态 |
| final_result | 结局摘要 |
| era_config_version | 纪元配置版本 |
| numeric_config_version | 数值配置版本 |
| story_ruleset_version | 剧情规则版本 |
| ended_at | 结束时间 |

`era_player_result`

| 字段 | 说明 |
| --- | --- |
| era_id | 纪元 ID |
| player_id | 玩家 ID |
| final_realm | 结算境界 |
| personal_rank | 个人排行 |
| sect_rank | 宗门排行 |
| title_rewards | 称号奖励 |
| inherited_buff | 继承 Buff |
| era_point_reward | 纪元积分 |
| settlement_config_version | 结算配置版本 |
| reward_config_version | 奖励配置版本 |

## 十二、GM 操作

`gm_operation_log`

| 字段 | 说明 |
| --- | --- |
| log_id | 日志 ID |
| gm_id | 操作者 |
| operation_type | 操作类型 |
| target_type | 玩家 / 宗门 / 订单 / 交易 / 全服 |
| target_id | 目标 ID |
| reason | 操作原因 |
| before_value | 操作前摘要 |
| after_value | 操作后摘要 |
| created_at | 时间 |

`behavior_risk_record`

| 字段 | 说明 |
| --- | --- |
| risk_record_id | 风控记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| scene_type | 行动 / PVP / 九塔 / 交易 / 宗门仓库 / 抽卡订单 / 登录 |
| source_type | 触发来源接口或玩法 |
| source_id | 关联记录 ID，可为空 |
| request_path | 接口路径 |
| request_interval_ms | 与上次同类请求间隔 |
| request_count_window | 统计窗口内请求次数 |
| idempotency_key | 幂等键，可为空 |
| device_hash | 设备摘要 |
| ip_hash | IP 摘要 |
| risk_score | 风险分 |
| risk_level | 低 / 中 / 高 / 严重 |
| matched_rules | 命中规则列表 |
| action_taken | 观察 / 限频 / 收益延迟 / 衰减 / 人工审核 / 拒绝 |
| risk_ruleset_version | 风控规则版本 |
| created_at | 时间 |

`delayed_settlement_record`

| 字段 | 说明 |
| --- | --- |
| delayed_record_id | 延迟结算记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| source_type | PVP / 九塔 / 交易 / 宗门仓库 / 其他 |
| source_id | 关联行动、战斗、交易或仓库记录 |
| reward_summary | 暂缓奖励摘要 |
| contribution_summary | 暂缓贡献摘要 |
| risk_record_id | 关联风控记录 |
| status | 待审核 / 已发放 / 已回滚 / 已过期 |
| reviewer_id | 审核人，可为空 |
| review_reason | 审核原因，可为空 |
| reviewed_at | 审核时间，可为空 |
| risk_ruleset_version | 风控规则版本 |
| created_at | 时间 |

`config_version`

| 字段 | 说明 |
| --- | --- |
| config_version | 配置版本号 |
| config_type | numeric / combat / reward / gacha / economy / story / risk |
| checksum | 配置摘要，用于校验回放 |
| active_from | 生效时间 |
| active_to | 失效时间，可为空 |
| operator_id | 发布人 |
| change_reason | 变更原因 |

## 十三、扩展系统模型

`sect_war_record`

| 字段 | 说明 |
| --- | --- |
| war_id | 宗门战 ID |
| era_id | 纪元 ID |
| attacker_sect_id | 进攻宗门 |
| defender_sect_id | 防守宗门 |
| province_id | 争夺州 |
| phase | 宣战 / 战备 / 交锋 / 结算 |
| attacker_score | 进攻方积分 |
| defender_score | 防守方积分 |
| result | 进攻胜 / 防守胜 / 平局 |
| ruleset_version | 宗门战规则版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 创建时间 |
| settled_at | 结算时间 |

`astronomy_state`

| 字段 | 说明 |
| --- | --- |
| astronomy_id | 天象 ID |
| era_id | 纪元 ID |
| scope_type | 全服 / 州 / 个人 |
| scope_id | 作用范围 ID |
| astronomy_type | 天象类型 |
| quality | 平 / 吉 / 大吉 / 凶 / 异象 |
| effect_summary | 效果摘要 |
| config_version | 天象配置版本 |
| valid_date | 生效日期 |
| expire_at | 过期时间 |

`player_astronomy_choice`

| 字段 | 说明 |
| --- | --- |
| choice_id | 择日选择 ID |
| player_id | 玩家 ID |
| astronomy_id | 天象 ID |
| target_type | 修炼 / 突破 / 炼丹 / 炼器 / 镇塔 / 破塔 / 探索 |
| saved_by_treasure | 是否由天机星盘保存 |
| used | 是否已使用 |
| created_at | 创建时间 |
| used_at | 使用时间 |

`cave_facility`

| 字段 | 说明 |
| --- | --- |
| facility_id | 洞府设施实例 ID |
| player_id | 玩家 ID |
| facility_type | 灵田 / 聚灵阵 / 丹炉 / 炼器室 / 灵兽栏 / 阵眼 / 洞天门 |
| level | 设施等级 |
| queue_state | 生产队列摘要 |
| stored_output | 缓存产出摘要 |
| config_version | 设施配置版本 |
| updated_at | 更新时间 |

`inner_world_state`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家 ID |
| unlocked | 是否开启 |
| world_level | 内天地等级 |
| spirit_level | 生灵等级摘要 |
| law_exp | 法则经验 |
| resource_summary | 绑定资源摘要 |
| config_version | 内天地配置版本 |
| updated_at | 更新时间 |

`inner_world_assignment`

| 字段 | 说明 |
| --- | --- |
| assignment_id | 派驻 ID |
| player_id | 玩家 ID |
| province_id | 派驻州 |
| assignment_type | 探索 / 采集 / 九塔支援 / 秘境支援 |
| start_at | 开始时间 |
| finish_at | 完成时间 |
| result_summary | 结果摘要 |
| status | 进行中 / 已完成 / 已取消 |
| config_version | 派驻配置版本 |

## 十四、任务、活动、排行、称号与运营记录

`quest_record`

| 字段 | 说明 |
| --- | --- |
| quest_record_id | 任务记录 ID |
| player_id | 玩家 ID |
| quest_id | 任务配置 ID |
| quest_type | 日常 / 周常 / 章节 / 活动 / 回归 |
| progress | 当前进度摘要 |
| target_progress | 目标进度 |
| status | 未完成 / 可领取 / 已领取 / 已过期 / 已回滚 |
| related_action_ids | 关联行动 ID 摘要 |
| quest_config_version | 任务配置版本 |
| reward_config_version | 奖励配置版本 |
| ruleset_version | 规则版本 |
| activated_at | 激活时间 |
| completed_at | 完成时间 |
| claimed_at | 领取时间 |

`event_record`

| 字段 | 说明 |
| --- | --- |
| event_record_id | 活动参与记录 ID |
| event_id | 活动配置 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| province_id | 关联州，可为空 |
| tower_id | 关联塔，可为空 |
| contribution | 有效贡献 |
| reward_state | 未结算 / 可领取 / 已领取 / 已补偿 / 已回滚 |
| rank_score | 活动排行分 |
| event_config_version | 活动配置版本 |
| reward_config_version | 奖励配置版本 |
| ruleset_version | 规则版本 |
| created_at | 首次参与时间 |
| settled_at | 结算时间 |

`rank_snapshot`

| 字段 | 说明 |
| --- | --- |
| snapshot_id | 快照 ID |
| rank_id | 榜单配置 ID |
| era_id | 纪元 ID |
| period_type | 日 / 周 / 章节 / 纪元 |
| period_key | 周期标识 |
| segment_key | 境界、阵营、宗门等级等分段 |
| status | 生成中 / 已锁定 / 已修正 / 已回滚 |
| rank_config_version | 排行配置版本 |
| reward_config_version | 奖励配置版本 |
| risk_ruleset_version | 风控规则版本 |
| generated_at | 生成时间 |
| locked_at | 锁定时间 |

`rank_entry`

| 字段 | 说明 |
| --- | --- |
| entry_id | 排行明细 ID |
| snapshot_id | 快照 ID |
| target_type | 玩家 / 宗门 / 阵营 |
| target_id | 目标 ID |
| rank_no | 名次 |
| score | 分数 |
| score_detail | 分数来源摘要 |
| reward_state | 未发放 / 已发放 / 冻结 / 回收 |
| risk_flag | 风控标记 |
| created_at | 时间 |

`achievement_record`

| 字段 | 说明 |
| --- | --- |
| achievement_record_id | 成就记录 ID |
| player_id | 玩家 ID |
| achievement_id | 成就配置 ID |
| progress | 当前进度 |
| status | 进行中 / 已完成 / 已领取 |
| achievement_config_version | 成就配置版本 |
| reward_config_version | 奖励配置版本 |
| completed_at | 完成时间 |
| claimed_at | 领取时间 |

`title_record`

| 字段 | 说明 |
| --- | --- |
| title_record_id | 称号发放记录 ID |
| player_id | 玩家 ID |
| title_id | 称号配置 ID |
| source_type | 成就 / 排行 / 活动 / 纪元 / GM |
| source_id | 来源记录 ID |
| era_id | 纪元 ID |
| inherited | 是否来自纪元继承 |
| title_config_version | 称号配置版本 |
| reward_config_version | 奖励配置版本 |
| granted_at | 发放时间 |

`player_title`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家 ID |
| title_id | 称号 ID |
| equipped | 是否佩戴 |
| display_unlocked | 是否解锁展示 |
| effect_active | 当前纪元效果是否生效 |
| expire_at | 过期时间，可为空 |
| inherited_from_era_id | 来源纪元，可为空 |
| updated_at | 更新时间 |

`config_publish_record`

| 字段 | 说明 |
| --- | --- |
| publish_id | 发布记录 ID |
| config_version | 配置版本号 |
| config_type | numeric / combat / reward / gacha / economy / story / risk / quest / event / rank / title |
| checksum | 配置摘要 |
| publish_status | draft / testing / gray / online / rollback |
| operator_id | 发布人 |
| change_summary | 变更摘要 |
| validation_summary | 校验摘要 |
| active_from | 生效时间 |
| rollback_from | 回滚来源版本，可为空 |
| created_at | 创建时间 |

`mail_record`

| 字段 | 说明 |
| --- | --- |
| mail_id | 邮件 ID |
| player_id | 收件玩家，群发可为空并使用 target_rule |
| mail_type | 系统 / 补偿 / 订单 / 排行 / 宗门 / 活动 |
| title | 邮件标题 |
| body | 邮件正文 |
| reward_summary | 附件摘要 |
| target_rule | 群发范围规则，可为空 |
| source_type | 来源类型 |
| source_id | 来源记录 ID |
| status | 未读 / 已读 / 已领取 / 已过期 / 已回收 |
| mail_template_version | 邮件模板版本 |
| reward_config_version | 奖励配置版本 |
| expire_at | 过期时间 |
| created_at | 创建时间 |
| claimed_at | 领取时间 |

`announcement_record`

| 字段 | 说明 |
| --- | --- |
| announcement_id | 公告 ID |
| announcement_type | 维护 / 活动 / 概率 / 规则调整 / 风控说明 |
| title | 标题 |
| body | 正文 |
| visible_rule | 可见范围 |
| related_config_version | 关联配置版本 |
| publish_status | 草稿 / 已发布 / 已撤回 |
| operator_id | 发布人 |
| publish_at | 发布时间 |
| expire_at | 过期时间，可为空 |
| created_at | 创建时间 |

## 十五、P1 数据模型增量

P1 v2 先补 Web 玩法体验厚度，再扩中后期内容。Web 体验字段优先从现有记录派生，不在 P1-00 强制新增状态表：

| 展示字段 | 推荐来源 | 说明 |
| --- | --- | --- |
| `timeline` | `action_record`、`battle_log.rounds`、`alchemy_record`、`equipment_operation_record`、`gacha_record` | 用于探索、战斗、生产、抽卡和九塔过程展示 |
| `delta_summary` | 行动、战斗、生产、抽卡、钱包、背包、九塔状态变更记录 | 用于展示行动前后资源、贡献、状态和保底变化 |
| `next_recommendations` | `quest_record`、`province_state`、`player_progress`、配置缺口计算 | 用于推荐下一步玩法和材料缺口 |
| `reason_tags` | `battle_log.result_reason`、风控记录、收益衰减记录、配置未开放状态 | 用于展示胜负、衰减、未开放和风控原因 |

如后续需要缓存复杂展示结果，可增加只读派生表 `experience_render_cache`，但该表不能成为奖励、贡献、战斗或风控的权威来源。

### P1 内天地增量

`inner_world_creature`

| 字段 | 说明 |
| --- | --- |
| creature_id | 生灵实例 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| creature_type | 生灵类型 |
| level | 生灵等级 |
| affinity_province_id | 擅长支援州，可为空 |
| assignment_bonus_summary | 派驻加成摘要 |
| status | 闲置 / 派驻中 / 培养中 |
| config_version | 生灵配置版本 |
| updated_at | 更新时间 |

`inner_world_law_record`

| 字段 | 说明 |
| --- | --- |
| law_record_id | 法则记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| law_type | 五行 / 阴阳 / 剑意 / 魔念等 |
| exp_delta | 本次法则经验变化 |
| source_type | 派驻 / 任务 / 九州支援 / 活动 |
| source_id | 来源记录 ID |
| before_level | 变化前等级 |
| after_level | 变化后等级 |
| config_version | 法则配置版本 |
| created_at | 时间 |

`inner_world_support_record`

| 字段 | 说明 |
| --- | --- |
| support_record_id | 九州支援记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| province_id | 支援州 |
| tower_id | 关联塔，可为空 |
| support_type | 灵脉支援 / 九塔补给 / 秘境支援 |
| cost_summary | 消耗摘要 |
| reward_summary | 绑定产出摘要 |
| contribution_summary | 个人支援贡献摘要 |
| idempotency_key | 幂等键 |
| config_version | 内天地配置版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 时间 |

内天地产出必须是绑定资源或个人成长材料，不得产出付费货币、九大古宝本体、限定本命法宝和可交易付费产物。

### P1 阵营路线增量

`player_faction_state`

| 字段 | 说明 |
| --- | --- |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| route | 未定 / 成仙 / 成魔 / 散修 |
| locked | 是否正式锁定路线 |
| reputation_fairy | 仙盟声望 |
| reputation_demon | 魔宗声望 |
| reputation_free | 散修声望 |
| sect_stance_conflict | 是否与宗门立场冲突 |
| transfer_cooldown_until | 转道冷却结束时间，可为空 |
| faction_config_version | 阵营配置版本 |
| updated_at | 更新时间 |

`faction_transfer_record`

| 字段 | 说明 |
| --- | --- |
| transfer_record_id | 转道记录 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| from_route | 原路线 |
| to_route | 目标路线 |
| task_state | 任务状态摘要 |
| cost_summary | 转道消耗 |
| reputation_clear_summary | 声望清除摘要 |
| sect_conflict_result | 宗门立场冲突处理结果 |
| cooldown_until | 新冷却结束时间 |
| idempotency_key | 幂等键 |
| faction_config_version | 阵营配置版本 |
| ruleset_version | 转道规则版本 |
| created_at | 时间 |

### P1 活动增量

`event_instance`

| 字段 | 说明 |
| --- | --- |
| event_instance_id | 活动实例 ID |
| event_id | 活动配置 ID |
| era_id | 纪元 ID |
| server_id | 服务器 ID |
| event_type | 九州游历 / 丹器加试 / 宗门同贺 / 回归 / 补偿 |
| status | 预告 / 进行中 / 结算中 / 已结束 / 已回滚 |
| async_enabled | 是否支持异步参与 |
| start_at | 开始时间 |
| end_at | 结束时间 |
| settlement_at | 结算时间 |
| event_config_version | 活动配置版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 创建时间 |

`event_reward_record`

| 字段 | 说明 |
| --- | --- |
| reward_record_id | 活动奖励记录 ID |
| event_instance_id | 活动实例 ID |
| player_id | 玩家 ID |
| era_id | 纪元 ID |
| reward_type | 基础参与 / 进度 / 排行 / 补偿 |
| reward_summary | 奖励摘要 |
| status | 待领取 / 已领取 / 已补偿 / 已冻结 / 已回滚 |
| claim_idempotency_key | 领取幂等键 |
| reward_config_version | 奖励配置版本 |
| risk_ruleset_version | 风控规则版本 |
| created_at | 创建时间 |
| claimed_at | 领取时间，可为空 |

基础参与奖励可补偿，排行冲刺奖励不补发。活动奖励不得包含唯一战力道具。

### P1 排行与称号继承增量

`title_inheritance_record`

| 字段 | 说明 |
| --- | --- |
| inheritance_record_id | 称号继承记录 ID |
| player_id | 玩家 ID |
| source_era_id | 来源纪元 |
| target_era_id | 目标纪元 |
| title_id | 称号 ID |
| display_inherited | 展示是否继承 |
| buff_inherited | Buff 是否继承 |
| buff_cap_summary | 继承 Buff 限幅摘要 |
| title_config_version | 称号配置版本 |
| settlement_config_version | 纪元结算配置版本 |
| created_at | 时间 |

称号展示可跨纪元继承，战力或效率 Buff 必须限幅，多纪元不得叠加滚雪球。

### P1 合服 dry-run 增量

`merge_dry_run_report`

| 字段 | 说明 |
| --- | --- |
| report_id | 合服演练报告 ID |
| source_server_ids | 来源服务器列表 |
| target_server_id | 目标服务器 ID |
| era_id | 演练关联纪元 |
| status | 生成中 / 已完成 / 已废弃 |
| summary | 影响摘要 |
| compensation_plan_summary | 补偿建议摘要 |
| rollback_plan_summary | 回滚建议摘要 |
| risk_summary | 风险摘要 |
| operator_id | 发起 GM |
| merge_config_version | 合服配置版本 |
| created_at | 创建时间 |
| generated_at | 生成时间 |

`merge_conflict_item`

| 字段 | 说明 |
| --- | --- |
| conflict_id | 冲突项 ID |
| report_id | 关联演练报告 |
| conflict_type | 角色名 / 宗门名 / 排行冻结 / 仓库 / 订单 / 保底 / 称号 / 九州状态 |
| source_id | 冲突来源 ID |
| severity | 低 / 中 / 高 / 阻断 |
| suggested_action | 建议处理方式 |
| auto_resolvable | 是否可自动处理 |
| detail_summary | 详情摘要 |
| created_at | 时间 |

合服 dry-run 只能读取和生成报告，不得修改真实玩家、宗门、排行、订单、保底、纪元和九州状态。

## 十六、服务边界建议

| 服务 | 负责 |
| --- | --- |
| 玩家服务 | player、progress、wallet、item |
| 战斗服务 | battle_log、技能结算、镜像防守 |
| 九州服务 | province_state、tower_state、action_record |
| 宗门服务 | sect、sect_member、warehouse_log、sect_war_record |
| 择日服务 | astronomy_state、player_astronomy_choice |
| 洞府服务 | cave_facility、inner_world_state、inner_world_assignment |
| 炼丹服务 | alchemy_record、pill_use_record、丹药递减 |
| 炼器服务 | equipment_instance、equipment_affix、equipment_operation_record |
| 经济服务 | trade_listing、trade_record、货币日志、经济监控 |
| 付费服务 | order_record、鱼排回调、月卡 |
| 抽卡服务 | gacha_record、gacha_pity_state、保底、卡池 |
| 月卡赠抽服务 | monthly_card_draw_grant、赠抽发放、过期、补发 |
| 九大古宝服务 | ancient_treasure_state、ancient_treasure_use_record、古宝日课 |
| 纪元服务 | era_record、结算、继承 |
| 阵营服务 | player_faction_state、faction_transfer_record、阵营路线和转道 |
| GM 服务 | gm_operation_log、behavior_risk_record、delayed_settlement_record、封禁、补偿、回滚 |
| 任务活动服务 | quest_record、event_record、任务进度、活动结算 |
| 排行称号服务 | rank_snapshot、rank_entry、achievement_record、title_record、player_title |
| 邮件公告服务 | mail_record、announcement_record、补偿和公告发布 |
| 配置服务 | config_version、config_publish_record、配置发布、版本回放 |
| 合服演练服务 | merge_dry_run_report、merge_conflict_item、合服影响报告 |

## 十七、验收场景

- 开发能根据本文拆出玩家、宗门、九州、九塔、战斗、订单、抽卡、纪元核心表。
- 开发能根据本文拆出宗门战、择日、洞府和内天地的最小核心表。
- 开发能根据本文拆出任务、活动、排行、成就、称号、邮件、公告和配置发布记录。
- 开发能根据本文拆出 P1 内天地生灵、法则、九州支援、阵营路线、转道、活动实例、称号继承和合服 dry-run 报告。
- 每次货币变化、抽卡、交易、仓库、PVP 和九塔贡献都有记录可查。
- 战斗日志能支持回放。
- 行动、战斗、抽卡、任务、活动、排行、交易、纪元结算都能追溯对应配置版本。
- 月卡赠抽能记录来源、有效期、过期状态、使用记录和是否计入保底。
- 纪元结算能生成玩家继承奖励。
- 鱼排订单能通过幂等键避免重复到账。
- 邮件和公告能追溯模板版本、奖励版本、发布人和生效范围。
- 行为风控能记录脚本点击风险、权益越权、收益延迟和人工审核结果。
- 炼丹、炼器、古宝日课、交易上架和抽卡保底都有独立记录，能按幂等键和配置版本追溯。
- 九大古宝付费仙玉预留入口不会写成功抽卡记录，也不会改变 `gacha_pity_state`。
- P1 Web 体验展示字段可由现有记录派生，不成为奖励、贡献和风控的权威来源。
- 合服 dry-run 只生成报告和冲突项，不修改真实数据。
