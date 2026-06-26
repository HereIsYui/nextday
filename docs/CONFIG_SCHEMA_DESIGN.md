# 《择日飞升：九塔封魔》配置表结构设计 v0.3

## 一、定位

本文整理开发所需的配置表结构。所有数值、奖励、概率、规则开关和活动内容都应配置化，避免写死在代码中。

核心原则：

- 关键系统必须追溯 `config_version`、`ruleset_version` 和 `reward_config_version`。
- 配置发布必须可校验、可灰度、可回滚。
- 战斗、抽卡、交易、任务、排行、纪元结算必须能用历史配置复现。
- 配置表字段命名以 snake_case 表示，具体存储可使用 JSON、表格或数据库。

## 二、公共字段

所有配置表建议包含以下公共字段：

| 字段 | 说明 |
| --- | --- |
| id | 配置唯一 ID |
| name | 展示名称 |
| desc | 描述 |
| version | 配置版本 |
| ruleset_version | 规则版本，可为空 |
| reward_config_version | 奖励版本，可为空 |
| unlock_chapter | 解锁章节，可为空 |
| unlock_realm | 解锁境界，可为空 |
| valid_from | 生效时间 |
| valid_to | 失效时间，可为空 |
| status | draft / testing / online / offline |
| tags | 标签，用于检索和运营分组 |

## 三、核心配置总表

| 配置表 | 作用 | 关键字段 |
| --- | --- | --- |
| `realm_config` | 境界、小境界、路线名称 | realm_id、route、stage_name、level_count |
| `level_curve_config` | 修为成长曲线 | realm_id、target_days、daily_base_gain、level_weight |
| `breakthrough_config` | 劫关突破 | realm_id、base_rate、fail_bonus、hard_pity |
| `currency_config` | 货币定义 | currency_id、source_type、tradeable、era_inherit_rule |
| `item_config` | 道具基础信息 | item_id、rarity、bind_rule、tradeable、source |
| `material_drop_config` | 材料投放 | province_id、chapter_id、drop_group_id、weight |
| `simulation_config` | P1 数值模拟 | profile_group、active_player_count、era_days、resource_flow |
| `pill_config` | 丹药定义 | pill_id、pill_rank、quality_type、effect_type |
| `pill_recipe_config` | 丹方与炼丹 | recipe_id、main_material、sub_materials、furnace_level |
| `pill_quality_config` | 丹药品质概率 | pill_rank、quality、base_rate、max_rate |
| `forge_config` | 炼器基础 | forge_type、material_group、rarity_rate |
| `affix_config` | 词条池 | affix_id、affix_type、route_limit、weight |
| `treasure_config` | 法宝和本命法宝 | treasure_id、treasure_type、skill_id、growth_rule |
| `ancient_treasure_config` | 九大古宝 | treasure_id、active_type、daily_limit、pvp_modifier |
| `ancient_treasure_star_config` | 古宝升星 | star_level、fragment_cost、effect_scale |
| `skill_config` | 技能定义 | skill_id、route、cooldown、target_rule、effect_group |
| `combat_rule_config` | 战斗规则 | scene_type、max_round、timeout_rule、manual_bonus_cap |
| `enemy_config` | 怪物和 Boss | enemy_id、enemy_type、realm_base、skill_group |
| `province_config` | 九州地图 | province_id、tower_id、resource_group、unlock_chapter |
| `province_full_config` | P1 九州全域 | province_id、node_group、event_group、long_term_goal |
| `tower_config` | 九塔机制 | tower_id、state_fields、boss_id、contribution_rule |
| `action_config` | 异步行动 | action_id、cost_token、base_reward、contribution_base |
| `web_experience_config` | P1 Web 体验 | scene_type、timeline_template、delta_fields、recommendation_rule |
| `new_player_route_config` | P1-9 新手路线 | route_id、step_group、priority_rule、completion_rule |
| `explore_event_pool_config` | P1-9 探索事件池 | event_id、province_id、rarity、choice_group、reward_boundary |
| `production_recommendation_config` | P1-9 丹器推荐 | recipe_id、recommend_condition、material_gap_rule、result_hint |
| `battle_readability_config` | P1-9 战斗可读性 | scene_type、reason_rule、trigger_mapping、next_advice |
| `drop_tuning_config` | P1-10 掉落校准 | profile_group、day_range、material_flow、warning_threshold |
| `reward_group_config` | 奖励组 | reward_group_id、item_id、count_range、weight |
| `quest_config` | 任务 | quest_id、quest_type、condition_group、reward_group |
| `event_config` | 活动 | event_id、event_type、schedule_rule、settlement_rule |
| `activity_template_config` | P1 活动模板 | template_id、activity_type、async_rule、reward_boundary |
| `rank_config` | 排行榜 | rank_id、rank_type、period、segment_rule |
| `era_rank_config` | P1 纪元排行 | rank_id、era_scope、inherit_rule、snapshot_rule |
| `achievement_config` | 成就 | achievement_id、condition_group、reward_group |
| `title_config` | 称号 | title_id、rarity、effect_rule、inherit_rule |
| `appearance_config` | 展示外观 | appearance_id、appearance_type、display_slot、source_type、inherit_rule |
| `gacha_pool_config` | 卡池 | pool_id、cost_type、pity_rule、result_group |
| `monthly_card_config` | 月卡 | card_id、fishpi_point_cost、daily_jade、daily_grant |
| `vip_config` | 鱼排 VIP 联动 | vip_level、benefit_group、validity_rule |
| `sect_config` | 宗门 | sect_level、member_limit、tech_group、warehouse_rule |
| `astronomy_config` | 天象择日 | astronomy_id、quality、effect_group、refresh_rule |
| `cave_facility_config` | 洞府设施 | facility_id、level_cost、output_rule、queue_limit |
| `inner_world_config` | 内天地 | world_level、assignment_rule、output_group |
| `faction_route_config` | P1 仙魔路线 | route_id、reputation_rule、transfer_cost、cooldown_rule |
| `merge_dry_run_config` | P1 合服演练 | merge_condition、conflict_rule、compensation_rule、rollback_rule |
| `story_presentation_config` | P2 剧情演出 | scroll_id、fragment_group、battle_ref_rule、fallback_text |
| `era_collection_config` | P2 多纪元收藏 | collection_id、collection_type、inherit_rule、duplicate_convert_rule |
| `appearance_plus_config` | P2 深度外观 | appearance_id、appearance_type、display_slot、inherit_rule |
| `mentor_rule_config` | P2 导师规则 | mentor_condition、task_group、reward_boundary、anti_abuse_rule |
| `sect_diplomacy_config` | P2 宗门外交 | diplomacy_type、approval_rule、cooldown_rule、assist_scope |
| `sect_hire_config` | P2 跨宗门雇佣 | hire_type、allowed_action_scope、reward_escrow_rule、risk_decay_rule |
| `transfer_rule_config` | P2 受限转服 | stage_limit、asset_mapping_rule、rank_cooldown_rule、review_rule |
| `explore_loot_pool_config` | P3 探索掉落池 | province_id、enemy_tag、material_group、value_budget |
| `enemy_trait_config` | P3 怪物特性 | trait_id、effect_hint、counter_hint、report_template |
| `explore_event_link_rule_config` | P3 奇遇联动 | province_id、enemy_trait、material_gap、event_weight |
| `material_chain_config` | P3 材料链 | item_id、source_rule、usage_rule、gap_hint |
| `skill_learning_config` | P3 技能学习 | skill_id、unlock_condition、learn_cost、route_limit |
| `battle_report_filter_config` | P3 战报筛选 | filter_id、scene_scope、summary_rule、fallback_text |
| `daily_route_config` | P3 今日路线 | route_id、priority_rule、dedupe_rule、mobile_limit |
| `payment_product_config` | 付费商品 | product_id、fishpi_point_cost、deliver_rule |
| `mail_template_config` | 邮件模板 | template_id、title、body、reward_group |
| `announcement_config` | 公告 | announcement_id、type、content、visible_rule |

## 四、任务与活动配置

`quest_config`

| 字段 | 说明 |
| --- | --- |
| quest_id | 任务 ID |
| quest_type | 日常 / 周常 / 章节 / 回归 / 活动 |
| condition_group | 完成条件组 |
| progress_type | 计数 / 状态 / 提交行动 / 全服贡献 |
| reset_rule | 每日 / 每周 / 章节 / 不重置 |
| async_enabled | 是否支持异步完成 |
| reward_group_id | 奖励组 |
| active_score | 活跃度 |
| anti_abuse_rule | 防刷规则 |

`event_config`

| 字段 | 说明 |
| --- | --- |
| event_id | 活动 ID |
| event_type | 九州事件 / 节日 / 回归 / 补偿 / 公共 Boss |
| province_id | 关联州，可为空 |
| tower_id | 关联塔，可为空 |
| schedule_rule | 开放周期和展示时间 |
| action_group | 可提交行动 |
| settlement_rule | 日结 / 周结 / 阶段结算 |
| rank_id | 关联排行，可为空 |
| compensation_rule | 异常补偿规则 |

## 五、排行、成就与称号配置

`rank_config`

| 字段 | 说明 |
| --- | --- |
| rank_id | 榜单 ID |
| rank_type | 个人 / 宗门 / 阵营 / 九塔 / PVP / 生产 / 纪元 |
| period | 日 / 周 / 章节 / 纪元 |
| segment_rule | 境界、章节、宗门等级分段 |
| score_formula | 分数公式 |
| snapshot_rule | 快照规则 |
| reward_group_id | 奖励组 |
| risk_rule | 风控规则 |

`title_config`

| 字段 | 说明 |
| --- | --- |
| title_id | 称号 ID |
| rarity | 凡称 / 灵称 / 玄称 / 地称 / 天称 / 仙魔称 |
| source_type | 成就 / 排行 / 活动 / 纪元 |
| display_style | 普通 / 动态 / 纪元 |
| effect_rule | 当前纪元效果，可为空 |
| inherit_rule | 不继承 / 展示继承 / 图鉴继承 |
| expire_rule | 永久 / 当纪元 / 限时 |

`appearance_config`

| 字段 | 说明 |
| --- | --- |
| appearance_id | 展示外观 ID |
| appearance_type | 称号样式 / 头像框 / 名片框 / 聊天气泡 / 发言前缀 / 战报样式 / 洞府外观 / 宗门外观 / 纪元史册外观 / 图鉴外观 |
| display_slot | 展示位置，例如玩家名片、排行榜、宗门、战报、聊天、鱼排插件小卡片、纪元史册 |
| source_type | 付费仙玉 / 外观券 / 排行奖励 / 活动奖励 / 纪元结算 / VIP 展示权益 / 月卡展示权益 |
| inherit_rule | 不继承 / 跨纪元展示继承 / 纪元史册继承 / 图鉴继承 |
| expire_rule | 永久 / 当纪元 / 限时 |
| preview_text_id | 预览文案 ID |
| risk_rule | 展示占用、敏感词和风控规则 |
| stat_effect_allowed | 固定为 false，展示外观不得配置战力或贡献效果 |

## 六、抽卡和付费配置

`gacha_pool_config`

| 字段 | 说明 |
| --- | --- |
| pool_id | 卡池 ID |
| pool_type | 限定本命 / 九大古宝 / 常驻 |
| cost_type | 付费仙玉 / 绑定仙玉 / 机缘券 / 月卡赠抽 / 九大古宝残页 |
| reserved_cost_type | 预留消耗类型，例如 `reserved_paid_jade`，当前不可用 |
| result_group_id | 抽取结果组 |
| pity_rule_id | 保底规则 |
| inherit_pity | 保底是否跨纪元继承 |
| chapter_gate | 章节节流 |
| public_rate_text_id | 概率公示文本 |

九大古宝专属池配置必须满足：

- `result_group_id` 只包含九大古宝本体。
- 当前开放 `cost_type` 只能是 `monthly_grant` 和 `ancient_page`。
- `reserved_paid_jade` 仅表示后期预留仙玉入口，当前不可扣费、不可抽取、不可计入保底。
- 月卡赠抽当日有效，不跨日累计。
- 绑定仙玉不能作为消耗。
- 重复古宝转化为该古宝碎片和器魂。

## 七、P1 配置类型

`simulation_config`

| 字段 | 说明 |
| --- | --- |
| simulation_id | 模拟方案 ID |
| profile_group | 玩家画像组：免费 / 小月卡 / 大月卡 / VIP / 重肝 / 高消费 |
| active_player_count | 活跃人数，例如 30 / 100 / 300 |
| era_days | 模拟纪元天数 |
| resource_flow | 资源产销参数 |
| payment_profile | 付费档位和抽卡行为参数 |
| pvp_power_cap | PVP 付费强度上限 |
| warning_threshold | 通胀、断供、强度超限和节奏异常阈值 |

`web_experience_config`

| 字段 | 说明 |
| --- | --- |
| scene_type | 探索 / 战斗 / 九塔 / Boss / PVP / 洞府 / 炼丹 / 炼器 / 抽卡 |
| timeline_template | 时间线展示模板 |
| delta_fields | 可展示变化字段白名单 |
| recommendation_rule | 下一步推荐规则 |
| reason_tag_mapping | 胜负、衰减、未开放、风控原因标签映射 |
| reward_mutation_allowed | 固定为 false，体验配置不得改变奖励 |

`new_player_route_config`

| 字段 | 说明 |
| --- | --- |
| route_id | 新手路线 ID，例如 `first_30_minutes_ji` |
| step_group | 初入冀州、第一次探索、处理奇遇、炼第一炉丹、镇封玄铁塔、领取章节奖励 |
| priority_rule | 今日修行推荐顺序和已完成节点降权规则 |
| completion_rule | 每个节点的完成条件 |
| fallback_rule | 材料不足、行动令不足、事件未生成时的替代建议 |
| reward_boundary | 只能指向绑定材料、基础丹药、普通法宝、灵石、修为和任务进度 |

`explore_event_pool_config`

| 字段 | 说明 |
| --- | --- |
| event_id | 探索事件 ID |
| province_id | 生效州域 |
| rarity | common / uncommon / rare，P1-9 不开放付费稀有度 |
| prerequisite_rule | 前置条件，例如章节、州域、探索次数、任务状态 |
| choice_group | 2-3 个轻选择及其文案 |
| reward_group | 普通修为、灵石、普通材料和任务进度奖励组 |
| forbidden_reward_rule | 禁止付费仙玉、九大古宝、限定法宝、唯一战力道具和倍率奖励 |

`production_recommendation_config`

| 字段 | 说明 |
| --- | --- |
| recipe_id | 丹方或炼器配方 ID |
| recommend_condition | 推荐条件，例如路线、当前任务、背包材料和境界 |
| material_gap_rule | 材料缺口展示规则 |
| success_hint | 成功率、失败返还和结果意义说明 |
| next_action_hint | 炼制后推荐服丹、装备、探索或章节任务 |
| reward_mutation_allowed | 固定为 false，推荐配置不得改变产物和概率 |

`battle_readability_config`

| 字段 | 说明 |
| --- | --- |
| scene_type | 探索 / PVP / Boss / 九塔 |
| reason_rule | 胜负原因摘要规则 |
| trigger_mapping | 技能、法宝、治疗、承伤和控制触发文案映射 |
| representative_round_limit | 批量战报最多展示的代表回合数 |
| next_advice | 失败或低效时的下一步建议 |
| source_trace_required | 固定为 true，摘要必须能追溯到战斗记录 |

`drop_tuning_config`

| 字段 | 说明 |
| --- | --- |
| tuning_id | 掉落校准方案 ID |
| profile_group | 新手 / 免费 / 小月卡 / 大月卡 / VIP / 重肝 |
| day_range | 模拟天数，P1-10 默认覆盖前 7 天 |
| material_flow | 低阶材料、丹方材料、炼器材料和行动令消耗流向 |
| warning_threshold | 断供、通胀、付费差距和过快毕业预警阈值 |
| adjustment_suggestion | 输出给策划的调参建议 |

`province_full_config`

| 字段 | 说明 |
| --- | --- |
| province_id | 州 ID：`ji`、`yan`、`qing`、`xu`、`yang`、`jing`、`yu`、`liang`、`yong` |
| node_group | 地图节点组 |
| resource_group | 特色资源组 |
| monster_group | 怪物和 Boss 组，名称可参考《山海经》 |
| event_group | 州事件组 |
| unlock_condition | 开放条件 |
| low_level_entry | 低等级参与方式 |
| long_term_goal | 高等级长期目标 |

`inner_world_config`

| 字段 | 说明 |
| --- | --- |
| world_level | 内天地等级 |
| assignment_rule | 派驻队列、时长和消耗 |
| creature_rule | 生灵培养规则 |
| law_exp_rule | 法则经验产出和上限 |
| support_rule | 九州支援规则 |
| output_group | 绑定产出奖励组 |
| forbidden_output_rule | 禁止产出规则 |

`faction_route_config`

| 字段 | 说明 |
| --- | --- |
| route_id | 成仙 / 成魔 / 散修 |
| unlock_realm | 解锁境界 |
| reputation_rule | 声望获取和衰减 |
| task_chain | 路线任务链 |
| transfer_cost | 转道消耗 |
| cooldown_rule | 转道冷却 |
| sect_conflict_rule | 宗门立场冲突处理 |
| reward_group | 荣誉、外观、纪念和非核心材料奖励 |

`era_rank_config`

| 字段 | 说明 |
| --- | --- |
| rank_id | 榜单 ID |
| era_scope | 纪元范围 |
| rank_type | 生产 / 纪元 / 内天地 / 阵营 |
| snapshot_rule | 快照生成和锁定规则 |
| reward_boundary | 奖励边界 |
| title_inherit_rule | 称号继承和 Buff 限幅 |
| anti_abuse_rule | 防刷规则 |

`activity_template_config`

| 字段 | 说明 |
| --- | --- |
| template_id | 活动模板 ID |
| activity_type | 九州游历 / 丹器加试 / 宗门同贺 / 回归 / 补偿 |
| async_rule | 异步参与规则 |
| progress_rule | 进度规则 |
| settlement_rule | 结算规则 |
| reward_boundary | 奖励边界 |
| announcement_template_id | 公告模板 |
| mail_template_id | 邮件模板 |

`merge_dry_run_config`

| 字段 | 说明 |
| --- | --- |
| merge_rule_id | 合服演练规则 ID |
| merge_condition | 合服触发条件 |
| freeze_rank_rule | 排行冻结规则 |
| sect_conflict_rule | 宗门冲突处理 |
| asset_inherit_rule | 资产继承规则 |
| pity_inherit_rule | 保底继承规则 |
| compensation_rule | 补偿建议规则 |
| rollback_rule | 回滚建议规则 |
| execute_allowed | P1 固定为 false，不开放真实执行 |

## 八、P2 配置类型

`story_presentation_config`

| 字段 | 说明 |
| --- | --- |
| scroll_id | 章节卷轴 ID |
| chapter_id | 关联章节 |
| fragment_group | 文本片段组，支持普通片段、选择片段、战报引用片段和结局片段 |
| unlock_condition | 解锁条件，例如章节任务、探索事件、九塔行动、阵营结局 |
| battle_ref_rule | 战报引用规则和展示权限 |
| era_chronicle_rule | 写入纪元史册规则 |
| fallback_text | 文本缺失或引用失效时的降级文案 |
| sensitive_filter_rule | 订单、IP / UA、风控、GM 审计等敏感信息过滤规则 |

`era_collection_config`

| 字段 | 说明 |
| --- | --- |
| collection_id | 收藏 ID |
| collection_type | 称号 / 纪念物 / 图鉴 / 史册 / 活动纪念 / 古宝图鉴外观 |
| source_type | 排行 / 活动 / 纪元结算 / 剧情 / 外观兑换 |
| inherit_rule | 不继承 / 展示继承 / 图鉴继承 / 纪元博物志继承 |
| duplicate_convert_rule | 重复收藏转化规则 |
| blessing_rule | 纪元祝福规则，可为空 |
| blessing_cap_rule | 祝福限幅和最高档保留规则 |
| display_slot_rule | 收藏馆、纪元博物志、玩家名片或史册展示位置 |
| forbidden_effect_rule | 禁止攻击、防御、PVP 伤害、贡献倍率、掉落倍率和排行加成 |

`appearance_plus_config`

| 字段 | 说明 |
| --- | --- |
| appearance_id | 深度外观 ID |
| appearance_type | 动态称号 / 名片布局 / 战报边框 / 洞府摆件 / 宗门驻地装饰 |
| display_slot | 展示位置 |
| source_type | 付费仙玉 / 外观券 / 排行奖励 / 活动奖励 / 纪元结算 / 收藏兑换 |
| inherit_rule | 不继承 / 跨纪元展示继承 / 图鉴继承 |
| expire_rule | 永久 / 当纪元 / 限时 |
| preview_template_id | 预览模板 |
| ownership_rule | 持有、装备、过期和回收规则 |
| stat_effect_allowed | 固定为 false |

`mentor_rule_config`

| 字段 | 说明 |
| --- | --- |
| mentor_rule_id | 导师规则 ID |
| mentor_condition | 导师资格，例如境界、章节、信誉、风控状态 |
| apprentice_condition | 徒弟资格和新手保护条件 |
| apply_limit_rule | 申请数量、同时师徒关系数量和冷却 |
| task_group | 师徒任务组 |
| graduation_rule | 出师条件 |
| reward_boundary | 奖励边界，只允许绑定材料、荣誉、称号、展示外观和少量普通资源 |
| anti_abuse_rule | 同设备、多账号、固定间隔、异常收益衰减规则 |

`sect_diplomacy_config`

| 字段 | 说明 |
| --- | --- |
| diplomacy_rule_id | 外交规则 ID |
| diplomacy_type | 盟约 / 敌对 / 援助 / 协防 |
| approval_rule | 宗门职位、票决和自动过期规则 |
| cooldown_rule | 外交变更冷却 |
| assist_scope | 可协助玩法范围 |
| announcement_template_id | 外交公告模板 |
| pvp_boundary_rule | 不绕过 PVP 匹配、保护和收益衰减 |
| tower_boundary_rule | 不绕过九塔贡献和延迟结算 |

`sect_hire_config`

| 字段 | 说明 |
| --- | --- |
| hire_rule_id | 雇佣规则 ID |
| hire_type | 探索协助 / 宗门建设 / 九塔补给 / 活动协助 |
| allowed_action_scope | 可协助行动范围和次数上限 |
| reward_escrow_rule | 奖励托管、发放和回滚规则 |
| risk_decay_rule | 同设备、重复目标、异常贡献和刷分衰减规则 |
| blacklist_rule | 禁止雇佣对象和近期风险限制 |
| forbidden_asset_rule | 禁止转移付费资产、绑定道具、限定产物、九大古宝本体和唯一战力道具 |

`transfer_rule_config`

| 字段 | 说明 |
| --- | --- |
| transfer_rule_id | 转服规则 ID |
| stage_limit | 服务器阶段限制，最终战前 30 天禁止转服 |
| target_server_rule | 目标服务器开放、人数、纪元进度和风险限制 |
| asset_mapping_rule | 钱包、背包、月卡、保底、外观、收藏和日志映射 |
| rank_cooldown_rule | 转服后排行冷却，默认至少 7 天 |
| sect_cleanup_rule | 宗门退出、外交清理和补偿建议 |
| payment_asset_check_rule | 付费资产、月卡、订单和抽卡保底检查 |
| review_rule | 人工审核、二次确认、回滚建议和 GM 审计规则 |
| execute_enabled | 默认 false，未专项上线前只允许 dry-run 和执行预留 |

## 九、P3 配置类型

`explore_loot_pool_config`

| 字段 | 说明 |
| --- | --- |
| loot_pool_id | 探索掉落池 ID |
| province_id | 关联州域 |
| enemy_tag | 可选怪物标签，例如山野、潮汐、古战场、圣迹 |
| chapter_condition | 章节或境界开放条件 |
| material_group | 普通材料组和权重 |
| value_budget | 单次探索材料总价值预算 |
| forbidden_reward_rule | 禁止付费仙玉、九大古宝本体、限定法宝、唯一战力道具和奖励倍率 |

`enemy_trait_config`

| 字段 | 说明 |
| --- | --- |
| trait_id | 怪物特性 ID |
| trait_name | 中文展示名 |
| effect_hint | 玩家可见表现，例如高防、快攻、毒伤、护盾 |
| counter_hint | 克制建议，例如提高破防、调整技能顺序、服用丹药 |
| report_template | 战报摘要模板 |
| combat_effect_scope | 只允许影响服务端战斗表现和展示解释 |

`explore_event_link_rule_config`

| 字段 | 说明 |
| --- | --- |
| link_rule_id | 奇遇联动规则 ID |
| province_id | 关联州域，可为空表示全局 |
| enemy_trait | 触发相关怪物特性 |
| material_gap_rule | 根据材料缺口提高对应事件权重 |
| chapter_condition | 章节、任务或新手阶段条件 |
| event_weight | 事件权重调整 |
| reward_boundary | 只允许普通修为、灵石、普通材料和任务进度 |

`material_chain_config`

| 字段 | 说明 |
| --- | --- |
| item_id | 材料或丹药 / 器物关联道具 ID |
| source_rule | 来源说明，例如州域、怪物、活动、洞府或生产返还 |
| usage_rule | 用途说明，例如丹方、器方、淬炼、任务 |
| gap_hint | 缺口提示模板 |
| expected_action_count | 预计补齐所需行动次数，用于展示，不作为保底承诺 |
| priority_rule | 今日路线和生产推荐优先级 |
| balance_profile | 1 / 7 / 30 天产销估算，只输出断供、囤积和过快毕业预警 |

当前落地的配置 envelope 为 `GET /api/config/material_chain`，payload 包含 `sources`、`balance_profiles`、`warnings` 和 `forbidden_outputs`。`warnings` 只用于调参提示，不改变玩家结算。

`skill_learning_config`

| 字段 | 说明 |
| --- | --- |
| skill_id | 技能 ID |
| route_limit | 练气 / 炼体 / 仙魔路线限制 |
| unlock_condition | 境界、章节、任务、材料和前置技能条件 |
| learn_cost | 学习消耗 |
| preset_hint | 自动释放顺序或本命技能建议 |
| forbidden_paid_rule | 不允许付费直购战力技能或跳过核心解锁 |

当前落地的配置 envelope 为 `GET /api/config/skill`，payload 包含 `skills`、`learning_config_version` 和 `learning_rules`。`learning_rules` 只允许配置境界、等级、路线、普通材料和灵石学习消耗，不允许配置付费直购战力技能或跳过服务端校验。

`battle_report_filter_config`

| 字段 | 说明 |
| --- | --- |
| filter_id | 战报筛选配置 ID |
| scene_scope | 探索 / 九塔 / Boss / PVP / 阵营 |
| filter_fields | 州域、胜负、敌人特性、奖励类型、时间 |
| summary_rule | 战报摘要和奖励合并规则 |
| fallback_text | 旧战报缺少新字段时的降级文案 |

`daily_route_config`

| 字段 | 说明 |
| --- | --- |
| route_id | 今日路线配置 ID |
| priority_rule | 可领取、可探索、奇遇、生产、九塔、任务领奖的优先级 |
| dedupe_rule | 同一行动在今日修行、目标和成长中去重 |
| mobile_limit | 移动端首屏展示数量 |
| feedback_rule | 原地反馈、跳转详情和日志写入规则 |
| boundary_rule | 不绕过行动令、幂等、月卡权益、风控和服务端结算 |

当前落地接口为 `GET /api/game/daily-route`，返回 `daily_route_p3_v1`。本阶段先以内置优先级生成路线，覆盖可领任务、可领探索、探索奇遇、洞府、探索、生产和九塔；后续 P3-5 或运营后台阶段再拆成正式可发布配置。

## 十、配置发布流程

1. 策划在草稿环境编辑配置。
2. 系统校验字段、引用、概率和奖励边界。
3. 测试环境使用指定 `config_version` 回放核心场景。
4. 运营确认公告、概率公示和补偿预案。
5. 灰度到测试服或小范围服务器。
6. 正式发布，记录发布人、发布时间、变更摘要和校验摘要。
7. 如出现异常，按配置版本回滚或发布修正版本。

发布校验必须覆盖：

- 概率总和是否为 100%。
- 奖励组是否包含禁止物品。
- 付费货币是否误入免费活动奖励。
- 绑定仙玉是否误入限定本命法宝池或九大古宝专属池。
- 付费仙玉是否误入当前版本九大古宝专属池的实际消耗类型。
- `reserved_paid_jade` 是否被错误配置为可用状态或计入保底。
- 月卡、VIP 便利是否突破大月卡上限。
- 任务和活动是否支持异步完成。
- 排行奖励是否包含唯一战力道具。
- 展示外观是否误配置攻击、防御、生命、PVP 伤害、九塔贡献倍率、世界 Boss 贡献倍率、最终魔王贡献倍率或资源掉落倍率。
- `web_experience_config` 是否试图改变奖励倍率、贡献倍率、战斗结果、抽卡结果或风控结论。
- `inner_world_config` 是否误产出付费货币、九大古宝本体、限定本命法宝或可交易付费产物。
- `activity_template_config` 是否不支持异步参与，或奖励组包含唯一战力道具。
- `era_rank_config` 是否让多纪元称号 Buff 叠加滚雪球。
- `merge_dry_run_config` 是否开放真实执行，或允许 dry-run 修改真实玩家、宗门、订单、排行、保底和纪元数据。
- `story_presentation_config` 是否引用不存在的章节、战报或文本片段，是否泄露订单、风控、IP / UA 或 GM 审计细节。
- `era_collection_config` 是否让多纪元祝福叠加，或把重复收藏转化为付费仙玉、九大古宝、唯一战力道具和贡献倍率。
- `appearance_plus_config` 是否误配置战力、掉落倍率、贡献倍率、排行加成或未持有可装备规则。
- `mentor_rule_config` 是否允许同设备刷奖励、绕过冷却或发放付费资产。
- `sect_diplomacy_config` 是否绕过 PVP 匹配、新手保护、九塔贡献结算或宗门权限审批。
- `sect_hire_config` 是否允许转移付费资产、绑定道具、限定产物、九大古宝本体或刷排行贡献。
- `transfer_rule_config` 是否开放自由转服、允许最终战前 30 天转服、跳过人工审核、复制可刷资源或取消排行冷却。
- `explore_loot_pool_config` 是否让探索掉落总价值超过预算，或误产出付费仙玉、九大古宝本体、限定法宝和唯一战力道具。
- `enemy_trait_config` 是否让客户端决定战斗胜负，或绕过服务端战斗公式。
- `explore_event_link_rule_config` 是否通过奇遇联动发放付费产物、唯一战力道具或奖励倍率。
- `material_chain_config` 是否把预计行动次数写成保底承诺，或绕过材料消耗。
- `skill_learning_config` 是否允许付费直购战力技能、跳过境界 / 路线限制或伪造已掌握技能。
- `daily_route_config` 是否绕过行动令、幂等、风控、月卡权益或服务端结算。

## 十一、版本追溯要求

以下记录必须保存配置版本：

| 记录 | 必要版本 |
| --- | --- |
| 行动记录 | config_version、ruleset_version、reward_config_version |
| 战斗日志 | combat_config_version、skill_config_version、enemy_config_version |
| 抽卡记录 | gacha_config_version、pity_ruleset_version、reward_config_version |
| 任务记录 | quest_config_version、reward_config_version、ruleset_version |
| 活动记录 | event_config_version、reward_config_version、ruleset_version |
| 排行快照 | rank_config_version、reward_config_version、risk_ruleset_version |
| 交易记录 | economy_config_version、risk_ruleset_version |
| 订单记录 | product_config_version、payment_ruleset_version |
| 纪元结算 | settlement_config_version、reward_config_version、story_ruleset_version |
| Web 体验展示 | web_experience_config_version、config_version |
| 新手路线推荐 | new_player_route_config_version、web_experience_config_version |
| 探索奇遇 | explore_event_pool_config_version、reward_config_version |
| 丹器推荐 | production_recommendation_config_version、reward_config_version |
| 战斗摘要 | battle_readability_config_version、combat_config_version |
| 掉落校准报告 | drop_tuning_config_version、simulation_config_version |
| 内天地派驻 | inner_world_config_version、reward_config_version |
| 阵营转道 | faction_route_config_version、ruleset_version |
| 合服 dry-run | merge_config_version、risk_ruleset_version |
| 章节卷轴 | story_presentation_config_version、story_ruleset_version |
| 纪元史册 | story_presentation_config_version、era_collection_config_version |
| 多纪元收藏 | era_collection_config_version、settlement_config_version |
| 深度外观 | appearance_plus_config_version、ownership_ruleset_version |
| 导师关系 | mentor_rule_config_version、reward_config_version、risk_ruleset_version |
| 宗门外交 | sect_diplomacy_config_version、ruleset_version |
| 跨宗门雇佣 | sect_hire_config_version、reward_config_version、risk_ruleset_version |
| 转服申请 | transfer_rule_config_version、risk_ruleset_version、settlement_config_version |
| 探索掉落 | explore_loot_pool_config_version、reward_config_version、loot_ruleset_version |
| 怪物特性战报 | enemy_trait_config_version、combat_config_version、battle_report_filter_config_version |
| 奇遇联动 | explore_event_link_rule_config_version、explore_loot_pool_config_version、reward_config_version |
| 材料链推荐 | material_chain_config_version、production_recommendation_config_version |
| 技能学习 | skill_learning_config_version、combat_config_version、ruleset_version |
| 今日路线 | daily_route_config_version、web_experience_config_version、ruleset_version |

## 十二、命名和 ID 规范

- 配置 ID 使用小写英文、数字和下划线，例如 `pill_juling_rank_1`。
- 中文名用于展示，英文 ID 用于程序引用。
- 九州 ID 固定为 `ji`、`yan`、`qing`、`xu`、`yang`、`jing`、`yu`、`liang`、`yong`。
- 怪物和 Boss 名称可参考《山海经》，配置 ID 不使用生僻字拼音缩写。
- 运营活动 ID 应包含年份和活动类型，例如 `event_2026_spring_festival`。
- P2 剧情卷轴 ID 使用 `story_scroll_{chapter}_{slug}`，例如 `story_scroll_ch01_xuantie_first_seal`。
- P2 收藏 ID 使用 `collection_{source}_{slug}`，例如 `collection_era_first_seal`。
- P2 深度外观 ID 使用 `appearance_plus_{slot}_{slug}`，例如 `appearance_plus_battle_border_moon`。
- P2 转服规则 ID 使用 `transfer_rule_{era_stage}_{slug}`，例如 `transfer_rule_mid_era_limited`。
- P3 探索掉落池 ID 使用 `explore_loot_{province}_{slug}`，例如 `explore_loot_ji_xuantie_herb`。
- P3 怪物特性 ID 使用 `enemy_trait_{slug}`，例如 `enemy_trait_shielded`。
- P3 技能学习规则 ID 使用 `skill_learn_{route}_{slug}`，例如 `skill_learn_qi_fire_sigil`。
- P3 今日路线 ID 使用 `daily_route_{stage}_{slug}`，例如 `daily_route_newbie_explore_craft`。

## 十三、验收场景

- 开发能根据本文拆出核心配置文件和后台配置入口。
- 所有核心玩法均能通过配置调整数值、奖励和开放章节。
- 配置发布能校验禁止奖励和概率错误。
- 行动、战斗、抽卡、任务、活动、排行和纪元结算可追溯历史配置。
- P1 数值模拟、Web 体验、九州全域、内天地、阵营路线、纪元排行、活动模板、合服 dry-run、新手路线、探索事件池、丹器推荐、战斗摘要和掉落校准都有配置入口。
- 九大古宝专属池配置无法混入普通材料、器魂或低阶古宝碎片。
- 九大古宝专属池当前只能配置月卡赠抽和残页合成，仙玉入口只能以预留未开放状态存在。
- VIP3、小月卡、VIP4、大月卡便利边界可配置且可校验。
- 展示外观配置只能影响玩家名片、排行榜、宗门、战报、聊天、鱼排插件小卡片、纪元史册和图鉴展示，不得配置战力、奖励倍率和贡献倍率。
- Web 体验配置只改变展示过程，不改变收益、贡献、抽卡、战斗和风控结果。
- 新手路线、探索事件、丹器推荐和战斗摘要配置不得配置付费产物、唯一战力道具、奖励倍率、贡献倍率或客户端结算逻辑。
- 掉落校准配置只能输出模拟和调参建议，不得直接绕过奖励组、行动令、付费边界和风控规则。
- 内天地配置无法配置付费货币、九大古宝本体、限定本命法宝和可交易付费产物。
- 活动配置全部支持异步参与，排行冲刺奖励不补发。
- 合服 dry-run 配置只能生成报告和建议，不允许真实执行。
- P2 剧情演出、收藏、深度外观、导师、宗门外交、跨宗门雇佣和转服都有配置入口。
- P2 配置发布能拦截战力外观、多纪元 Buff 叠加、社交资产转移、雇佣刷贡献和自由转服风险。
- P2 转服配置默认只允许 dry-run、报告、审核和执行预留，不默认开放真实自由转服。
- P3 探索掉落池、怪物特性、奇遇联动、材料链、技能学习、战报筛选和今日路线都有配置入口。
- P3 配置发布能拦截付费产物误入探索、技能付费直购战力、客户端决定胜负、今日路线绕过结算和材料链保底承诺。
