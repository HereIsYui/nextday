# 《择日飞升：九塔封魔》接口契约设计 v0.4

## 一、定位

本文定义 MVP 阶段前后端接口契约，用于支撑登录、角色、修行、九州、九塔、战斗、任务、宗门、PVP、抽卡、月卡、邮件和运营查询。本文不绑定具体技术栈，接口路径以 REST 风格描述，后续可映射为 RPC 或 GraphQL。

核心原则：

- 所有会改变状态的接口必须支持幂等或重复提交保护。
- 所有奖励、战斗、抽卡、订单和结算必须返回可追溯记录 ID。
- 客户端不计算最终奖励、贡献、抽卡结果和战斗胜负，只提交意图。
- 所有响应包含 `server_time`、`config_version` 或相关版本字段。

三端统一使用本文接口。独立 Web 与 H5/PWA 可访问完整玩家功能；鱼排聊天室插件默认只展示小状态卡片，点击后打开复杂功能窗口。小卡片只访问境界、修为、离线收益、行动令、今日提醒、月卡赠抽状态和少量快捷操作；复杂窗口再访问日课、洞府轻操作、九州 / 九塔摘要、简化战报、古宝 / 月卡提醒、宗门提醒和预设行动提交。插件不访问 GM、配置发布、复杂宗门管理、交易行深层操作和高风险付费操作。

## 二、公共约定

请求头：

| 字段 | 说明 |
| --- | --- |
| `Authorization` | 登录令牌 |
| `X-Request-Id` | 请求 ID，用于日志追踪 |
| `Idempotency-Key` | 幂等键，状态变更接口必填 |
| `X-Client-Version` | 客户端版本 |

公共响应：

```json
{
  "code": 0,
  "message": "ok",
  "server_time": 1760000000,
  "data": {},
  "trace_id": "req_xxx"
}
```

错误码分层：

| 范围 | 类型 |
| --- | --- |
| 10000-19999 | 登录与账号 |
| 20000-29999 | 角色与成长 |
| 30000-39999 | 行动、战斗、九州 |
| 40000-49999 | 背包、货币、交易 |
| 50000-59999 | 抽卡、月卡、鱼排订单 |
| 60000-69999 | 宗门、PVP、排行 |
| 70000-79999 | 配置、活动、运营 |
| 90000-99999 | 风控、维护、系统异常 |

## 三、客户端访问范围、插件聚合与登录

客户端访问范围：

| 客户端 | 访问范围 |
| --- | --- |
| Web | 完整玩家接口 |
| H5 / PWA | 完整玩家接口，移动端 UI 降级展示 |
| 鱼排插件 | 默认小状态卡片、点击展开复杂窗口、领取、预设行动、任务提醒、九州/九塔摘要、简化战报、古宝赠抽状态、宗门提醒、跳转 |
| Admin | 后台接口，仅限 GM 权限 |

插件专用聚合接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/plugin/card` | GET | 默认小状态卡片：境界、修为、离线收益、行动令、今日提醒、月卡赠抽状态、少量快捷按钮 |
| `/api/plugin/panel` | GET | 点击展开复杂窗口的总入口：返回可用模块、红点、深链和摘要 |
| `/api/plugin/daily-panel` | GET | 展开窗口日课聚合：任务、可领取奖励、可提交预设、剩余行动令 |
| `/api/plugin/cave-summary` | GET | 洞府轻操作摘要：产出、派遣、设施状态、可一键收取项 |
| `/api/plugin/province-tower-summary` | GET | 九州与九塔摘要：州状态、塔状态、可参与行动、贡献摘要 |
| `/api/plugin/reports` | GET | 简化战报：最近 PVE、PVP 防守、复仇提醒和收益衰减提示 |
| `/api/plugin/sect-notices` | GET | 宗门提醒：宗门任务、集结、仓库申请、结算提醒 |
| `/api/plugin/quick-claim` | POST | 插件一键领取：离线收益、洞府基础收益、任务奖励，需幂等键 |
| `/api/plugin/submit-preset` | POST | 插件预设提交：普通探索、九塔行动、宗门任务等白名单行动 |
| `/api/plugin/navigation-links` | GET | 返回 Web/H5 深链入口 |

插件接口返回原则：

- 小卡片接口只返回默认态展示与少量快捷操作所需字段，不能默认占据聊天室右侧大面积界面。
- 展开窗口接口只返回面板展示与轻操作所需字段，不返回服务端敏感判定公式。
- `quick-claim` 和 `submit-preset` 必须携带幂等键，重复提交返回同一记录。
- 插件不能调用订单创建、鱼排积分扣减、GM、配置发布、交易行批量挂单、宗门管理审批等高风险接口。
- 插件可展示古宝赠抽与保底状态，但抽取动作默认跳转 Web/H5；若后续开放插件抽取，仍必须由服务端返回抽取结果。

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/guest-login` | POST | 开发期游客登录 |
| `/api/auth/fishpi/oauth-url` | GET | 获取鱼排 OAuth 跳转地址 |
| `/api/auth/fishpi/callback` | POST | 鱼排 OAuth 回调绑定 |
| `/api/player/profile` | GET | 获取玩家基础信息 |
| `/api/player/create` | POST | 创建角色 |
| `/api/player/rename` | POST | 改名 |

创建角色请求：

```json
{
  "name": "青岚客",
  "route": "qi"
}
```

创建角色响应：

```json
{
  "player_id": "p_10001",
  "name": "青岚客",
  "route": "qi",
  "current_realm": 1,
  "current_stage": 1,
  "current_level": 1
}
```

## 四、修行与洞府

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/progress/summary` | GET | 修行进度、追赶加成、章节 |
| `/api/progress/claim-offline` | POST | 领取离线收益 |
| `/api/progress/level-up` | POST | 小等级升级 |
| `/api/progress/breakthrough` | POST | 大境界突破 |
| `/api/cave/summary` | GET | 洞府总览 |
| `/api/cave/claim` | POST | 一键收取洞府产出 |
| `/api/cave/upgrade` | POST | 升级设施 |

突破响应必须返回：

- 成功 / 失败。
- 劫气变化。
- 消耗材料。
- 配置版本。
- 关联日志 ID。

## 五、炼丹、炼器、法宝与九大古宝日课

炼丹接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/alchemy/recipes` | GET | 丹方列表、可炼丹阶、材料缺口 |
| `/api/alchemy/craft` | POST | 炼制丹药，需幂等键 |
| `/api/alchemy/use-pill` | POST | 服用丹药，需幂等键 |
| `/api/alchemy/records` | GET | 炼丹记录 |
| `/api/alchemy/decay-state` | GET | 丹药服用递减计数 |

炼丹状态变更响应必须返回 `alchemy_record_id` 或 `pill_use_record_id`、消耗、结果、品质、失败返还、递减倍率、`config_version`、`reward_config_version` 和幂等结果。

炼器与法宝接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/equipment/list` | GET | 法宝实例列表 |
| `/api/equipment/forge` | POST | 炼制普通法宝或古器材料，需幂等键 |
| `/api/equipment/reforge-affix` | POST | 淬炼副词条，需幂等键 |
| `/api/equipment/inscribe` | POST | 铭刻锁定词条，需幂等键 |
| `/api/equipment/star-up` | POST | 升星，需幂等键 |
| `/api/equipment/marrow-wash` | POST | 洗髓主词条，需幂等键 |
| `/api/equipment/decompose` | POST | 分解法宝，需幂等键 |
| `/api/equipment/equip` | POST | 装备或卸下法宝 |
| `/api/equipment/lock` | POST | 锁定或解锁法宝 |

炼器不产出九大古宝。所有炼器操作必须返回 `equipment_operation_record_id`、目标装备、词条变化、消耗、返还、`config_version`、`ruleset_version` 和幂等结果。

九大古宝日课接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/ancient-treasure/state` | GET | 九大古宝持有、星级、碎片、图鉴和今日主动次数 |
| `/api/ancient-treasure/use` | POST | 触发古宝主动能力，需幂等键 |
| `/api/ancient-treasure/use-records` | GET | 古宝日课触发记录 |

古宝主动触发必须校验每日全局 3 次上限，返回 `ancient_treasure_use_record_id`、目标、结果、次数变化、配置版本和幂等结果。

## 六、九州与行动

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/province/map` | GET | 九州地图状态 |
| `/api/province/{province_id}` | GET | 州详情 |
| `/api/action/tokens` | GET | 行动令余额 |
| `/api/action/submit` | POST | 提交单次异步行动 |
| `/api/action/batch-submit` | POST | 批量提交行动 |
| `/api/action/records` | GET | 行动记录 |
| `/api/action/claim-reward` | POST | 领取行动奖励 |

行动提交请求：

```json
{
  "action_type": "tower",
  "target_type": "tower",
  "target_id": "tower_xuantie",
  "action_key": "seal",
  "count": 1,
  "preset_id": "preset_default"
}
```

行动提交响应：

```json
{
  "action_ids": ["act_10001"],
  "cost": [{"token": "tower_token", "count": 1}],
  "status": "submitted",
  "config_version": "numeric_2026_001",
  "reward_config_version": "reward_2026_001"
}
```

## 七、战斗与战报

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/combat/skills` | GET | 技能列表 |
| `/api/combat/skill-preset` | POST | 保存技能优先级 |
| `/api/combat/start` | POST | 开始在线挑战 |
| `/api/combat/manual-cast` | POST | 手动释放关键技 |
| `/api/combat/result/{battle_id}` | GET | 获取战斗结果 |
| `/api/combat/log/{battle_id}` | GET | 获取战斗日志 |

战斗结果必须返回：

- `battle_id`。
- 胜负。
- 胜负原因。
- 奖励摘要。
- 伤害、承伤、治疗、机制贡献。
- 战斗配置版本、技能配置版本、随机种子摘要。

## 八、任务、活动与排行

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/quest/today` | GET | 今日任务 |
| `/api/quest/weekly` | GET | 周常任务 |
| `/api/quest/chapter` | GET | 章节任务 |
| `/api/quest/claim` | POST | 领取任务奖励 |
| `/api/event/list` | GET | 活动列表 |
| `/api/event/detail/{event_id}` | GET | 活动详情 |
| `/api/rank/list` | GET | 榜单列表 |
| `/api/rank/{rank_id}` | GET | 排行明细 |

任务奖励领取必须使用幂等键，重复领取返回同一奖励记录，不重复发放。

## 九、宗门与 PVP

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/sect/create` | POST | 创建宗门 |
| `/api/sect/join` | POST | 加入宗门 |
| `/api/sect/summary` | GET | 宗门总览 |
| `/api/sect/task` | GET | 宗门任务 |
| `/api/sect/warehouse/deposit` | POST | 仓库存入 |
| `/api/sect/warehouse/withdraw` | POST | 仓库提取申请 |
| `/api/pvp/match` | POST | 匹配 PVP 目标 |
| `/api/pvp/attack` | POST | 发起攻击 |
| `/api/pvp/defense-preset` | POST | 保存防守镜像配置 |
| `/api/pvp/revenge` | POST | 战报复仇 |
| `/api/pvp/reports` | GET | PVP 战报 |

PVP 匹配响应必须返回收益衰减、保护状态和跨境界提示，客户端不得隐藏风险提示。

## 十、背包、抽卡、交易行、月卡与 VIP

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/inventory/items` | GET | 背包 |
| `/api/wallet` | GET | 货币 |
| `/api/trade/listings` | GET | 交易行列表 |
| `/api/trade/price-summary` | GET | 价格摘要 |
| `/api/trade/list` | POST | 上架，需幂等键 |
| `/api/trade/buy` | POST | 购买，需幂等键 |
| `/api/trade/cancel` | POST | 撤销上架，需幂等键 |
| `/api/trade/records` | GET | 成交、撤销和冻结记录 |
| `/api/gacha/pools` | GET | 卡池列表 |
| `/api/gacha/draw` | POST | 抽卡 |
| `/api/gacha/history` | GET | 抽卡历史 |
| `/api/gacha/pity` | GET | 保底进度 |
| `/api/monthly-card/status` | GET | 月卡状态 |
| `/api/monthly-card/buy` | POST | 购买月卡 |
| `/api/vip/status` | GET | 鱼排 VIP 联动状态 |

交易行只能流通非绑定基础材料、普通丹药、普通器胚和普通法宝。充值产物、月卡产物、VIP 产物、限定本命法宝、九大古宝、绑定仙玉产物和锁定物品不得上架。

九大古宝抽卡请求：

```json
{
  "pool_id": "pool_ancient",
  "cost_type": "monthly_card_grant",
  "count": 1,
  "grant_id": "grant_10001"
}
```

九大古宝抽卡响应：

```json
{
  "gacha_id": "g_10001",
  "pool_type": "ancient_treasure",
  "cost_type": "monthly_card_grant",
  "result_item_id": "ancient_taiyi_danding",
  "duplicate_converted": false,
  "pity_before": 12,
  "pity_after": 13,
  "count_to_pity": true
}
```

九大古宝专属池当前只允许 `monthly_card_grant` 和 `ancient_page` 两类消耗。`reserved_paid_jade` 仅为后期预留入口，当前请求必须返回未开放错误，不扣仙玉、不产生抽卡记录、不计入保底。常驻池和限定本命法宝池按各自配置处理，不得复用九大古宝限制口径。

生产记录聚合接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/production/records` | GET | 查询炼丹、炼器、古宝触发等生产记录 |

生产记录返回必须包含 `record_id`、`record_type`、来源接口、幂等键、配置版本、奖励版本和结算摘要。

## 十一、邮件、公告与配置

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/mail/list` | GET | 邮件列表 |
| `/api/mail/read` | POST | 标记已读 |
| `/api/mail/claim` | POST | 领取附件 |
| `/api/announcement/list` | GET | 公告列表 |
| `/api/config/client-bundle` | GET | 客户端配置包 |
| `/api/config/version` | GET | 当前配置版本 |

客户端配置包只包含展示和入口需要的数据，不包含抽卡随机权重、风控阈值和服务端判定公式的敏感部分。

## 十二、运营后台接口分组

后台接口不对普通客户端开放，必须具备操作日志。

| 分组 | 能力 |
| --- | --- |
| 玩家查询 | 玩家、背包、货币、进度、封禁状态 |
| 订单查询 | 鱼排订单、游戏订单、补单、回调日志 |
| 日志查询 | 货币、抽卡、交易、PVP、九塔、宗门仓库 |
| 补偿邮件 | 单人、分组、全服补偿 |
| 公告发布 | 维护、活动、概率、规则调整 |
| 配置发布 | 草稿、校验、灰度、上线、回滚 |
| 风控处理 | 冻结、解冻、回滚、封禁 |

## 十三、验收场景

- 前端能根据本文完成 MVP 主流程接口对接。
- 状态变更接口具备幂等键，重复请求不重复发奖。
- 战斗、抽卡、任务、行动、订单都返回可追溯记录 ID。
- 客户端无法自行决定奖励、贡献、抽卡结果和战斗胜负。
- 后台接口与普通客户端接口隔离，所有后台操作写日志。
- 鱼排插件默认只加载小状态卡片，复杂功能必须点击后通过展开窗口接口获取。
- 炼丹、炼器、九大古宝日课和交易行状态变更接口都具备幂等键，并返回可追溯记录 ID。
- 九大古宝池用付费仙玉或 `reserved_paid_jade` 抽取时返回未开放，不扣费、不出结果、不计保底。
