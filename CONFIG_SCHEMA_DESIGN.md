# 《择日飞升：九塔封魔》配置表结构设计 v0.1

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
| `tower_config` | 九塔机制 | tower_id、state_fields、boss_id、contribution_rule |
| `action_config` | 异步行动 | action_id、cost_token、base_reward、contribution_base |
| `reward_group_config` | 奖励组 | reward_group_id、item_id、count_range、weight |
| `quest_config` | 任务 | quest_id、quest_type、condition_group、reward_group |
| `event_config` | 活动 | event_id、event_type、schedule_rule、settlement_rule |
| `rank_config` | 排行榜 | rank_id、rank_type、period、segment_rule |
| `achievement_config` | 成就 | achievement_id、condition_group、reward_group |
| `title_config` | 称号 | title_id、rarity、effect_rule、inherit_rule |
| `gacha_pool_config` | 卡池 | pool_id、cost_type、pity_rule、result_group |
| `monthly_card_config` | 月卡 | card_id、fishpi_point_cost、daily_jade、daily_grant |
| `vip_config` | 鱼排 VIP 联动 | vip_level、benefit_group、validity_rule |
| `sect_config` | 宗门 | sect_level、member_limit、tech_group、warehouse_rule |
| `astronomy_config` | 天象择日 | astronomy_id、quality、effect_group、refresh_rule |
| `cave_facility_config` | 洞府设施 | facility_id、level_cost、output_rule、queue_limit |
| `inner_world_config` | 内天地 | world_level、assignment_rule、output_group |
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

## 六、抽卡和付费配置

`gacha_pool_config`

| 字段 | 说明 |
| --- | --- |
| pool_id | 卡池 ID |
| pool_type | 限定本命 / 九大古宝 / 常驻 |
| cost_type | 仙玉 / 绑定仙玉 / 机缘券 / 月卡赠抽 |
| result_group_id | 抽取结果组 |
| pity_rule_id | 保底规则 |
| inherit_pity | 保底是否跨纪元继承 |
| chapter_gate | 章节节流 |
| public_rate_text_id | 概率公示文本 |

九大古宝专属池配置必须满足：

- `result_group_id` 只包含九大古宝本体。
- 月卡赠抽当日有效，不跨日累计。
- 绑定仙玉不能作为消耗。
- 重复古宝转化为该古宝碎片和器魂。

## 七、配置发布流程

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
- 月卡、VIP 便利是否突破大月卡上限。
- 任务和活动是否支持异步完成。
- 排行奖励是否包含唯一战力道具。

## 八、版本追溯要求

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

## 九、命名和 ID 规范

- 配置 ID 使用小写英文、数字和下划线，例如 `pill_juling_rank_1`。
- 中文名用于展示，英文 ID 用于程序引用。
- 九州 ID 固定为 `ji`、`yan`、`qing`、`xu`、`yang`、`jing`、`yu`、`liang`、`yong`。
- 怪物和 Boss 名称可参考《山海经》，配置 ID 不使用生僻字拼音缩写。
- 运营活动 ID 应包含年份和活动类型，例如 `event_2026_spring_festival`。

## 十、验收场景

- 开发能根据本文拆出核心配置文件和后台配置入口。
- 所有核心玩法均能通过配置调整数值、奖励和开放章节。
- 配置发布能校验禁止奖励和概率错误。
- 行动、战斗、抽卡、任务、活动、排行和纪元结算可追溯历史配置。
- 九大古宝专属池配置无法混入普通材料、器魂或低阶古宝碎片。
- VIP3、小月卡、VIP4、大月卡便利边界可配置且可校验。
