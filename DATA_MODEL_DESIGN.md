# 《择日飞升：九塔封魔》核心数据模型草案 v0.4

## 一、定位

本文是 P0 数据模型草案，用于支撑后续拆表、建接口和划分服务边界。本文不绑定具体数据库，只定义核心对象、关键字段和关系。

字段命名以 snake_case 表示，具体实现可按技术栈调整。

## 二、核心对象

| 对象 | 说明 |
| --- | --- |
| player | 玩家账号内角色 |
| player_progress | 玩家修行和章节进度 |
| player_inventory | 玩家道具和货币 |
| sect | 宗门 |
| sect_member | 宗门成员 |
| province_state | 九州状态 |
| tower_state | 九塔状态 |
| action_record | 异步行动记录 |
| battle_log | 战斗日志 |
| order_record | 鱼排积分订单 |
| gacha_record | 抽卡记录 |
| monthly_card_draw_grant | 月卡赠抽记录 |
| trade_record | 交易行记录 |
| era_record | 纪元记录 |
| gm_operation_log | GM 操作日志 |
| config_version | 配置版本快照 |

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
| pool_type | 限定本命 / 九大古宝 / 常驻 |
| cost_type | 仙玉 / 绑定仙玉 / 机缘券 / 月卡赠抽 / 古宝残页合成 |
| cost_amount | 消耗数量 |
| draw_source | 付费仙玉 / 月卡赠抽 / 活动券 / 残页合成 |
| grant_id | 月卡赠抽记录 ID，可为空 |
| count_to_pity | 是否计入保底 |
| result_item_id | 结果道具 |
| rarity | 稀有度 |
| pity_before | 抽前保底 |
| pity_after | 抽后保底 |
| random_seed | 随机种子 |
| gacha_config_version | 卡池配置版本 |
| pity_ruleset_version | 保底规则版本 |
| reward_config_version | 奖励配置版本 |
| created_at | 时间 |

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

`trade_record`

| 字段 | 说明 |
| --- | --- |
| trade_id | 交易 ID |
| seller_id | 卖家 |
| buyer_id | 买家 |
| item_id | 道具 ID |
| count | 数量 |
| price | 成交价 |
| tax_rate | 税率 |
| status | 上架 / 成交 / 撤销 / 冻结 / 回滚 |
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

## 十三、服务边界建议

| 服务 | 负责 |
| --- | --- |
| 玩家服务 | player、progress、wallet、item |
| 战斗服务 | battle_log、技能结算、镜像防守 |
| 九州服务 | province_state、tower_state、action_record |
| 宗门服务 | sect、sect_member、warehouse_log |
| 经济服务 | trade_record、货币日志、经济监控 |
| 付费服务 | order_record、鱼排回调、月卡 |
| 抽卡服务 | gacha_record、保底、卡池 |
| 月卡赠抽服务 | monthly_card_draw_grant、赠抽发放、过期、补发 |
| 纪元服务 | era_record、结算、继承 |
| GM 服务 | gm_operation_log、封禁、补偿、回滚 |
| 配置服务 | config_version、配置发布、版本回放 |

## 十四、验收场景

- 开发能根据本文拆出玩家、宗门、九州、九塔、战斗、订单、抽卡、纪元核心表。
- 每次货币变化、抽卡、交易、仓库、PVP 和九塔贡献都有记录可查。
- 战斗日志能支持回放。
- 行动、战斗、抽卡、交易、纪元结算都能追溯对应配置版本。
- 月卡赠抽能记录来源、有效期、过期状态、使用记录和是否计入保底。
- 纪元结算能生成玩家继承奖励。
- 鱼排订单能通过幂等键避免重复到账。
