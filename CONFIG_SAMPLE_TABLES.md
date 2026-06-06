# 《择日飞升：九塔封魔》配置样例表 v0.3

## 一、定位

本文提供 MVP 阶段可直接参考的配置样例，帮助研发和策划对齐字段、命名和配置粒度。样例数值用于结构说明，不代表最终上线数值。

所有配置必须经过配置发布流程，记录 `config_version`、`ruleset_version` 和 `reward_config_version`。

## 二、境界配置样例

`realm_config`

| realm_id | route | realm_name | stage_names | level_count_per_stage | unlock_chapter |
| --- | --- | --- | --- | ---: | ---: |
| qi_1 | qi | 练气 | 感应,通脉,周天 | 3 | 1 |
| body_1 | body | 锻体 | 醒血,开脉,周身 | 3 | 1 |
| qi_2 | qi | 筑基 | 凝液,稳固,圆满 | 4 | 2 |
| body_2 | body | 筑身 | 淬骨,固脉,金身 | 4 | 2 |

`breakthrough_config`

| from_realm | to_realm | base_rate | fail_bonus | hard_pity | material_group |
| --- | --- | ---: | ---: | ---: | --- |
| qi_1 | qi_2 | 9000 | 1000 | 2 | break_qi_1 |
| body_1 | body_2 | 9000 | 1000 | 2 | break_body_1 |
| qi_2 | qi_3 | 8500 | 1000 | 3 | break_qi_2 |

概率使用万分比。

## 三、道具配置样例

`item_config`

| item_id | name | rarity | category | bind_rule | tradeable | auto_consume |
| --- | --- | --- | --- | --- | --- | --- |
| herb_low_ji | 冀州灵草 | 凡品 | 炼丹材料 | 非绑定 | 是 | 是 |
| tower_xuantie_piece | 玄铁残片 | 灵品 | 九塔材料 | 非绑定 | 是 | 是 |
| pill_juling_1_mid | 一阶中品聚灵丹 | 灵品 | 丹药 | 绑定 | 否 | 否 |
| ancient_page | 九大古宝残页 | 玄品 | 抽取材料 | 绑定 | 否 | 否 |
| jade_paid | 仙玉 | 仙品 | 付费货币 | 账号绑定 | 否 | 否 |

## 四、丹药配置样例

`pill_config`

| pill_id | name | pill_rank | pill_type | route_limit | base_effect | can_refine_wuxia |
| --- | --- | ---: | --- | --- | ---: | --- |
| pill_juling_1 | 聚灵丹 | 1 | 修为 | qi | 100 | 是 |
| pill_feixue_1 | 沸血丹 | 1 | 气血精元 | body | 100 | 是 |
| pill_pojing_1 | 破境丹 | 1 | 突破 | all | 500 | 否 |
| pill_zhenmo_3 | 镇魔丹 | 3 | 仙道战略 | fairy | 300 | 限 1 |

`pill_quality_config`

| quality | effect_rate | base_rate |
| --- | ---: | ---: |
| 下品 | 8000 | 3500 |
| 中品 | 10000 | 3500 |
| 上品 | 12000 | 2000 |
| 极品 | 15000 | 800 |
| 无瑕 | 20000 | 200 |

`pill_decay_config`

| decay_id | pill_rank_scope | pill_type | use_count_min | use_count_max | effect_rate |
| --- | --- | --- | ---: | ---: | ---: |
| decay_default_1 | same_rank | same_type | 1 | 3 | 10000 |
| decay_default_2 | same_rank | same_type | 4 | 10 | 5000 |
| decay_default_3 | same_rank | same_type | 11 | 999 | 1000 |

丹药递减按“同阶同类型”计数，高一阶丹药重新计算该阶递减，不影响低阶记录。

## 五、炼器与词条配置样例

`forge_result_config`

| forge_result_id | material_group | rarity | base_weight | output_type |
| --- | --- | --- | ---: | --- |
| forge_normal_ling | normal_material | 凡品 / 灵品 | 7000 | 普通法宝 |
| forge_normal_xuan | normal_material | 玄品 / 地品 | 2500 | 普通法宝 |
| forge_normal_tian | normal_material | 天品 / 仙品 | 500 | 仙品法宝 |
| forge_endgame_ancient_blank | endgame_material | 古器胚 / 古器铭文 | 1200 | 古器材料 |

炼器不产出九大古宝。古器胚、古器铭文和隐藏词条材料仅用于高阶炼器、铭刻和洗髓。

`affix_config`

| affix_id | name | affix_type | route_limit | rarity | pvp_cap_group |
| --- | --- | --- | --- | --- | --- |
| affix_attack_flat | 攻伐 | 通用 | all | 普通 | basic |
| affix_seal_eff | 镇封 | 仙道 | fairy | 稀有 | contribution_no_multiplier |
| affix_break_eff | 破封 | 魔道 | demon | 稀有 | contribution_no_multiplier |
| affix_forge_rate | 炉心 | 生产 | all | 稀有 | non_combat |

## 六、技能配置样例

`skill_config`

| skill_id | name | route | skill_type | cooldown | target_rule | effect_summary |
| --- | --- | --- | --- | ---: | --- | --- |
| skill_yuhuo | 御火诀 | qi | 输出 | 2 | 单体 | 160% 术法伤害，低概率灼烧 |
| skill_lingshield | 灵盾术 | qi | 防御 | 4 | 自身 | 最大生命 18% 护盾 |
| skill_jinshen | 金身诀 | body | 防御 | 5 | 自身 | 2 回合内受到伤害 -25% |
| skill_moran | 魔染咒 | demon | 污染 | 4 | 单体 | 伤害并附加魔染 |

## 七、怪物配置样例

`enemy_config`

| enemy_id | name | enemy_type | province_id | realm_base | skill_group | source |
| --- | --- | --- | --- | ---: | --- | --- |
| enemy_zheng_shadow | 狰影 | normal | ji | 1 | beast_low | 山海经意象 |
| enemy_luoyu_young | 蠃鱼幼妖 | normal | qing | 2 | water_low | 山海经意象 |
| boss_xuantie_spirit | 玄铁塔灵 | tower_boss | ji | 1 | tower_xuantie | 九塔 |
| boss_qiongqi_form | 穷奇魔相 | world_boss | xu | 3 | qiongqi | 山海经意象 |

## 八、行动与奖励配置样例

`action_config`

| action_id | name | cost_token | cost_count | contribution_base | reward_group |
| --- | --- | --- | ---: | ---: | --- |
| explore_ji_low | 冀州探索 | explore_token | 1 | 0 | reward_explore_ji_low |
| tower_xuantie_seal | 玄铁镇封 | tower_token | 1 | 100 | reward_tower_seal_low |
| tower_xuantie_supply | 玄铁补给 | tower_token | 1 | 65 | reward_tower_supply_low |
| pvp_resource_attack | 资源点进攻 | pvp_token | 1 | 0 | reward_pvp_point |

`reward_group_config`

| reward_group | item_id | count_min | count_max | weight | bind_type |
| --- | --- | ---: | ---: | ---: | --- |
| reward_explore_ji_low | spirit_stone | 20 | 40 | 10000 | 绑定 |
| reward_explore_ji_low | herb_low_ji | 1 | 3 | 8000 | 非绑定 |
| reward_tower_seal_low | tower_xuantie_piece | 1 | 2 | 10000 | 非绑定 |
| reward_tower_seal_low | merit_lotus_low | 1 | 1 | 1500 | 绑定 |

## 九、任务配置样例

`quest_config`

| quest_id | name | quest_type | condition | active_score | reward_group | async_enabled |
| --- | --- | --- | --- | ---: | --- | --- |
| daily_claim_offline | 领取修炼收益 | daily | claim_offline:1 | 10 | reward_daily_10 | 是 |
| daily_explore_5 | 九州探索五次 | daily | action:explore:5 | 20 | reward_daily_explore | 是 |
| weekly_tower_15 | 九塔同心 | weekly | action:tower:15 | 0 | reward_weekly_tower | 是 |
| chapter_ji_tower | 玄铁塔裂 | chapter | tower:xuantie:seal:1 | 0 | reward_chapter_1 | 是 |

## 十、卡池配置样例

`gacha_pool_config`

| pool_id | pool_type | cost_type | reserved_cost_type | pity_rule | inherit_pity | chapter_gate |
| --- | --- | --- | --- | --- | --- | ---: |
| pool_normal | 常驻机缘 | bound_jade,normal_ticket | - | pity_40 | 否 | 1 |
| pool_ancient | 九大古宝 | monthly_grant,ancient_page | reserved_paid_jade（未开放） | pity_60_120 | 是 | 2 |
| pool_limited_weapon | 限定本命 | paid_jade | - | pity_80_160 | 是 | 3 |

`gacha_result_group`

| pool_id | result_item_id | weight | duplicate_rule |
| --- | --- | ---: | --- |
| pool_ancient | ancient_taiyi_danding | 1111 | fragment_convert |
| pool_ancient | ancient_qiankun_lu | 1111 | fragment_convert |
| pool_ancient | ancient_xuandu_pan | 1111 | fragment_convert |
| pool_ancient | ancient_qingdi_juan | 1111 | fragment_convert |
| pool_ancient | ancient_shanhe_tu | 1111 | fragment_convert |
| pool_ancient | ancient_haotian_zhong | 1111 | fragment_convert |
| pool_ancient | ancient_jiuyuan_fan | 1111 | fragment_convert |
| pool_ancient | ancient_zhenyue_yin | 1111 | fragment_convert |
| pool_ancient | ancient_tianji_pan | 1111 | fragment_convert |

九大古宝池结果组只能包含九大古宝本体。`reserved_paid_jade` 只是后期预留字段，当前配置发布校验必须禁止它进入实际消耗类型。

`ancient_treasure_daily_config`

| treasure_id | active_limit_daily | consume_daily_quota | pvp_modifier |
| --- | ---: | --- | --- |
| ancient_taiyi_danding | 2 | 是 | 丹药属性进入 PVP 压缩 |
| ancient_qiankun_lu | 1 | 是 | 词条收益进入 PVP 压缩 |
| ancient_haotian_zhong | 1 | 是 | 护盾每场最多 1 次 |
| ancient_tianji_pan | 1 | 是 | 保存天象不作用于 PVP |

古宝日课全局每日最多主动触发 3 次，被动效果不占主动次数。

## 十一、月卡与 VIP 配置样例

`payment_product_config`

| product_id | name | fishpi_point_cost | paid_jade_amount | bonus_group | product_type |
| --- | --- | ---: | ---: | --- | --- |
| jade_pack_1024 | 小袋仙玉 | 1024 | 1024 | bonus_bound_small | jade |
| jade_pack_4096 | 中袋仙玉 | 4096 | 4096 | bonus_bound_mid | jade |
| jade_pack_10240 | 大袋仙玉 | 10240 | 10240 | bonus_skin_ticket_low | jade |
| jade_pack_32768 | 玄玉匣 | 32768 | 32768 | bonus_collection_mid | jade |
| jade_pack_65536 | 太初玉匣 | 65536 | 65536 | bonus_collection_high | jade |

仙玉包附加赠送只进入绑定仙玉、外观券、称号进度或收藏材料，不额外赠送付费仙玉。

`monthly_card_config`

| card_id | name | fishpi_point_cost | paid_jade_now | paid_jade_daily | ancient_draw_daily |
| --- | --- | ---: | ---: | ---: | ---: |
| monthly_small | 小月卡 | 1024 | 124 | 30 | 1 |
| monthly_big | 大月卡 | 2048 | 248 | 60 | 2 |

`vip_config`

| vip_level | bound_jade_daily | sweep_limit | strategy_slots | queue_type |
| --- | ---: | ---: | ---: | --- |
| VIP1 | 2 | 6 | 1 | 无 |
| VIP2 | 4 | 8 | 2 | 无 |
| VIP3 | 6 | 10 | 3 | 单玩法队列 |
| VIP4 | 8 | 15 | 4 | 跨玩法简化队列 |

## 十二、交易行配置样例

`trade_config`

| config_id | tradeable_categories | tax_rate_min | tax_rate_max | risk_rule |
| --- | --- | ---: | ---: | --- |
| trade_default | 基础材料,普通丹药,普通器胚,普通法宝 | 500 | 1500 | abnormal_price_and_device |

交易行禁止上架充值产物、月卡产物、VIP 产物、限定本命法宝、九大古宝、绑定仙玉产物和玩家锁定道具。

## 十三、验收场景

- 研发能用样例配置跑通新手、探索、九塔、任务、抽卡、月卡和 VIP。
- 九大古宝池样例不混入材料、器魂和低阶古宝碎片。
- 绑定仙玉不能进入限定本命法宝池和九大古宝池。
- 付费仙玉不能进入九大古宝池；`reserved_paid_jade` 只作为预留未开放字段。
- 炼器结果配置不能产出九大古宝。
- 丹药递减、炼器结果、古宝日课和交易行白名单都能映射到接口与数据库。
- 配置字段能映射到接口、数据库和测试用例。
- 仙玉包按 1 积分兑换 1 付费仙玉配置，额外赠送不破坏限定池成本和古宝池赠抽 / 残页节奏。
