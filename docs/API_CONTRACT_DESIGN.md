# 《择日飞升：九塔封魔》接口契约设计 v0.6

## 一、定位

本文定义 MVP 阶段前后端接口契约，用于支撑登录、角色、修行、九州、九塔、战斗、任务、宗门、PVP、抽卡、月卡、邮件和运营查询。本文不绑定具体技术栈，接口路径以 REST 风格描述，后续可映射为 RPC 或 GraphQL。

核心原则：

- 当前 MVP 交互使用 HTTP REST 风格 API；状态查询使用 `GET`，操作提交使用 `POST`。
- 所有会改变状态的接口必须支持幂等或重复提交保护。
- 所有奖励、战斗、抽卡、订单和结算必须返回可追溯记录 ID。
- 客户端不计算最终奖励、贡献、抽卡结果和战斗胜负，只提交意图。
- 所有响应包含 `server_time`、`config_version` 或相关版本字段。
- WebSocket / SSE 只作为后续增强，用于提醒和状态推送，不参与核心结算。
- MVP 不禁止普通脚本点击；服务端通过权益校验、限频、风险评分、收益延迟结算和后台审核控制越权与刷收益。

三端统一使用本文接口。独立 Web 与 H5/PWA 可访问完整玩家功能；鱼排聊天室插件默认只展示小状态卡片，点击后打开复杂功能窗口。小卡片只访问境界、修为、离线收益、行动令、今日提醒、月卡赠抽状态和少量快捷操作；复杂窗口再访问日课、洞府轻操作、九州 / 九塔摘要、简化战报、古宝 / 月卡提醒、宗门提醒和预设行动提交。插件不访问 GM、配置发布、复杂宗门管理、交易行深层操作和高风险付费操作。

## 二、公共约定

通讯方式：

| 通讯方式 | 当前定位 | 用途 |
| --- | --- | --- |
| HTTP GET | MVP 默认 | 查询状态、配置、摘要、历史记录 |
| HTTP POST | MVP 默认 | 提交行动、领取奖励、抽卡、炼丹、炼器、订单等状态变更 |
| WebSocket / SSE | 后续增强 | 推送提醒、战报生成、行动结算完成、邮件公告和红点变化 |

HTTP 是当前唯一默认交互通道。WebSocket / SSE 即使后续接入，也只能通知“状态已变化”或推送轻量摘要；客户端仍需通过 HTTP 拉取权威状态，所有奖励、贡献、抽卡、战斗和订单结果仍由服务端结算。

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

高影响状态变更接口可在 `data` 中返回风控状态：

```json
{
  "risk_status": "normal",
  "risk_record_id": null,
  "settlement_status": "settled"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `risk_status` | `normal` / `rate_limited` / `delayed_settlement` / `decayed` / `manual_review` |
| `risk_record_id` | 命中风控时返回的记录 ID，可为空 |
| `settlement_status` | `settled` / `delayed` / `rejected` |

行动提交、PVP、九塔、交易、宗门仓库、托管队列等接口必须按账号当前权益在服务端校验批量上限、自动策略槽位和托管权限。免费账号调用月卡托管队列、伪造批量上限或伪造策略槽位时，服务端必须拒绝或截断到当前权益上限。

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

风控相关错误码建议：

| 错误码 | 类型 |
| --- | --- |
| 90010 | 请求频率过高 |
| 90011 | 权益不足，无法使用该便利能力 |
| 90012 | 批量次数超过当前权益上限 |
| 90013 | 自动策略槽位超过当前权益上限 |
| 90014 | 收益进入延迟结算 |
| 90015 | 当前操作需人工审核 |

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
- 插件和 Web/H5 一样只提交意图，不能在客户端执行托管。月卡托管、批量上限、策略槽位均由服务端按权益判断。

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

当前游戏实现使用 `POST /api/game/cultivation/breakthrough` 完成境界突破。总览中的 `cultivation` 返回当前与下一境名称、最高境界、境界战力增益、突破修为需求、已解锁功能和下一境解锁功能。境界相关限制必须由服务端校验，客户端只负责展示。
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
| `/api/events/list` | GET | 活动列表、异步参与状态和可领取红点 |
| `/api/events/{event_id}` | GET | 活动详情、任务进度、公告模板和奖励边界 |
| `/api/events/progress` | POST | 提交活动进度，需幂等键 |
| `/api/events/claim` | POST | 领取活动奖励，需幂等键 |
| `/api/multiplayer/ranks/{rank_type}` | GET | 排行明细，支持个人、宗门、PVP 周榜、九塔周榜、生产榜、纪元榜、内天地榜、阵营榜 |
| `/api/multiplayer/titles` | GET | 当前玩家排行称号收藏、继承展示和纪元祝福限幅 |
| `/api/multiplayer/titles/claim-rank` | POST | 领取满足名次门槛的排行称号，需幂等键 |

任务奖励领取必须使用幂等键，重复领取返回同一奖励记录，不重复发放。

排行响应必须返回 `snapshot_id`、`generated_at`、`reward_boundary`、`anti_brush_summary`、`title_rewards` 和配置版本信息。生产榜、纪元榜、内天地榜、阵营榜必须排除延迟结算贡献，并在近期风控玩家条目上展示风险提示。排行称号只作为展示外观和纪元纪念物发放，不提供唯一战力道具、付费货币、贡献倍率或 PVP 伤害倍率。

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
  "cost_type": "monthly_grant",
  "count": 1,
  "grant_id": "grant_10001"
}
```

九大古宝抽卡响应：

```json
{
  "gacha_id": "g_10001",
  "pool_type": "ancient_treasure",
  "cost_type": "monthly_grant",
  "result_item_id": "ancient_taiyi_danding",
  "duplicate_converted": false,
  "pity_before": 12,
  "pity_after": 13,
  "count_to_pity": true
}
```

九大古宝专属池当前只允许 `monthly_grant` 和 `ancient_page` 两类消耗。`reserved_paid_jade` 仅为后期预留入口，当前请求必须返回未开放错误，不扣仙玉、不产生抽卡记录、不计入保底。常驻池和限定本命法宝池按各自配置处理，不得复用九大古宝限制口径。

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
| 风控处理 | 风险查询、收益延迟池、人工审核、解除标记、回滚异常收益、冻结、解冻、封禁 |

风控后台接口建议：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/admin/risk/player/{player_id}` | GET | 查询玩家风险分、命中规则、近期行为轨迹 |
| `/api/admin/risk/records` | GET | 查询风控记录列表 |
| `/api/admin/risk/delayed-settlements` | GET | 查询收益延迟结算池 |
| `/api/admin/risk/review` | POST | 人工审核：发放、回滚、解除标记或升级处理 |

风控后台接口必须记录操作者、处理原因、关联记录、前后状态和规则版本。普通脚本点击不作为直接封禁理由，只有越权、刷收益、交易输送、PVP / 九塔刷分等高影响异常才进入人工处理。

## 十三、P1 接口占位与体验字段

P1 v2 先补 Web 玩法体验厚度，再扩展中后期系统。P1-2 的接口调整只增加展示字段，不改变核心结算。探索、九塔、Boss、PVP、洞府、炼丹、炼器和抽卡仍由服务端结算，客户端只展示过程反馈。

现有接口可选展示字段：

| 字段 | 返回位置 | 说明 | 边界 |
| --- | --- | --- | --- |
| `timeline` | 探索、战斗、九塔、Boss、PVP、生产、抽卡结果 | 事件节点、战斗回合、技能释放、生产过程、抽卡演出节点 | 只展示服务端已结算结果，不允许客户端追加奖励 |
| `delta_summary` | 行动、战斗、九塔、Boss、PVP、洞府、生产、抽卡 | 行动前后资源、贡献、塔状态、Boss 血量、道具、保底变化摘要 | 必须由服务端生成，前端只渲染 |
| `next_recommendations` | 首页、探索、九州、洞府、任务、抽卡 | 下一步推荐行动、材料缺口、可参与玩法和跳转 | 不强制固定时间上线，不暗示付费必胜 |
| `reason_tags` | 战斗、PVP、九塔、风控、未开放、收益衰减 | 胜负原因、收益衰减、未开放、风控提示和损失边界 | 必须和服务端规则一致，不能隐藏失败或衰减原因 |

P1-9 / P1-10 设计级展示占位：

| 字段 | 返回位置 | 说明 | 边界 |
| --- | --- | --- | --- |
| `event_pool_preview` | 探索当前状态、探索领取结果、今日修行 | 可提示当前州域可能出现的普通奇遇类型、稀有度和前置条件 | 只作预览和解释，不提前决定实际事件和奖励 |
| `route_steps` | 首页、章节任务、今日修行 | 生成“先做 A、再做 B、最后做 C”的新手或今日修行路线 | 只组织现有行动入口，不新增奖励倍率或强制在线时间 |
| `production_recommendations` | 炼丹、炼器、背包、今日修行 | 推荐丹方 / 炼器配方、材料缺口、失败返还和结果意义 | 只展示推荐，不允许客户端替代服务端校验材料和产物 |
| `battle_reason_summary` | 探索战报、PVP、Boss、九塔战斗 | 解释胜负原因、技能触发、法宝触发、承伤和下一步建议 | 必须来自服务端战斗记录或可追溯派生数据 |
| `drop_tuning_report` | 数值模拟、后台配置校验、QA 报表 | 输出前 7 天掉落、材料缺口、通胀断供、付费差距和过快毕业预警 | 仅供调参和 QA 使用，不暴露为玩家结算依据 |

以上字段为后续 P1-9 / P1-10 的接口设计占位。本轮不要求新增接口或改变现有请求 / 响应结构；后续实现时也不得让客户端决定奖励、掉落、战斗、贡献、抽卡或风控结果。

P1 新增接口分组：

| 分组 | 接口 | 方法 | 说明 |
| --- | --- | --- | --- |
| 内天地 | `/api/inner-world/summary` | GET | 内天地等级、生灵、法则经验、派驻队列和可收取摘要 |
| 内天地 | `/api/inner-world/assignments` | GET | 派驻列表和九州支援记录 |
| 内天地 | `/api/inner-world/dispatch` | POST | 发起派驻，需幂等键 |
| 内天地 | `/api/inner-world/claim` | POST | 收取派驻和绑定产出，需幂等键 |
| 内天地 | `/api/inner-world/upgrade` | POST | 升级内天地或生灵，需幂等键 |
| 内天地 | `/api/inner-world/support` | POST | 消耗法则经验发起九州支援，需幂等键 |
| 阵营路线 | `/api/factions/routes` | GET | 成仙、成魔、散修路线配置和解锁状态 |
| 阵营路线 | `/api/factions/choose` | POST | 化神后选择路线，需幂等键 |
| 阵营路线 | `/api/factions/transfer` | POST | 转道任务提交、资源消耗和冷却校验，需幂等键 |
| 阵营路线 | `/api/factions/reputation` | GET | 阵营声望、宗门立场冲突和清除记录 |
| 完整排行 | `/api/multiplayer/ranks/{rank_type}` | GET | 查询个人、宗门、PVP、九塔、生产、纪元、内天地和阵营排行，并生成可追溯快照 |
| 完整排行 | `/api/multiplayer/titles` | GET | 查询排行称号收藏、继承展示数量和纪元祝福有效值 |
| 完整排行 | `/api/multiplayer/titles/claim-rank` | POST | 领取排行称号展示外观，需幂等键 |
| 活动 | `/api/events/list` | GET | 活动列表、异步参与状态和可领取红点 |
| 活动 | `/api/events/{event_id}` | GET | 活动详情、任务进度、排行和奖励边界 |
| 活动 | `/api/events/progress` | POST | 提交活动进度或活动行动，需幂等键 |
| 活动 | `/api/events/claim` | POST | 领取活动奖励，需幂等键 |
| 合服 dry-run | `/api/admin/merge/dry-run` | POST | 后台生成合服影响报告，不改真实数据 |
| 合服 dry-run | `/api/admin/merge/dry-run?report_id=...` | GET | 查询 dry-run 冲突、补偿、风险和回滚建议 |
| 合服执行预留 | `/api/admin/merge/execute` | POST | 写入执行预留审计，返回 `reserved_only`，不执行真实合服 |

P1 接口规则：

- 所有 P1 状态变更继续使用 `Idempotency-Key`。
- 内天地不得产出付费货币、九大古宝本体、限定本命法宝和可交易付费产物。
- 阵营转道必须返回转道成本、冷却、声望清除和宗门立场冲突提示。
- 活动必须支持异步参与，基础参与奖励可补偿，排行冲刺奖励不补发。
- 排行、称号、活动和合服相关接口必须返回配置版本、奖励版本和规则版本。
- 合服 dry-run 接口只能生成报告、冲突项和建议，不允许修改真实玩家、宗门、排行、订单、保底和纪元数据。
- 合服执行预留接口必须始终返回 `allowed=false` 和 `execution_status=reserved_only`，真实合服需要单独发布、人工确认和独立审计。
- P1-9 / P1-10 的事件池、推荐路线、丹器推荐、战斗摘要和掉落报告只能增强展示、调参和 QA，不得改变核心结算。
- WebSocket / SSE 后续即使接入，也只推送提醒和状态变化，P1 核心结算仍以 HTTP 结果为准。

## 十四、P2 接口占位与长线增强边界

P2 在 P1 已完成的新手体验、数值校准、九州全域、内天地、阵营、排行、活动和合服 dry-run 之上继续扩展。P2 接口仍以 HTTP REST 为主，WebSocket / SSE 即使后续接入，也只能推送提醒、红点和轻摘要，不能参与剧情解锁、收藏继承、外观装备、社交奖励、转服审核和资产迁移的权威结算。

P2 新增接口分组：

| 分组 | 接口 | 方法 | 说明 |
| --- | --- | --- | --- |
| 剧情卷轴 | `/api/story/scrolls` | GET | 章节卷轴列表、解锁进度、最近更新和可回放红点 |
| 剧情卷轴 | `/api/story/scrolls/{scroll_id}` | GET | 章节卷轴详情、文本片段、选择摘要、战报引用和配置版本 |
| 剧情卷轴 | `/api/story/battle-narratives/{battle_id}` | GET | 战报叙事摘要、关键回合、胜负原因和原始战报引用 |
| 纪元史册 | `/api/story/era-chronicle` | GET | 当前服务器纪元史册、排行摘要、阵营结局、九塔状态和活动节点 |
| 多纪元收藏 | `/api/collection/summary` | GET | 个人收藏馆摘要、历史图鉴、纪元纪念物和展示栏 |
| 多纪元收藏 | `/api/collection/entries/{collection_id}` | GET | 收藏条目详情、来源记录、继承规则和展示状态 |
| 多纪元收藏 | `/api/collection/display/equip` | POST | 装备收藏展示项，需幂等键 |
| 深度外观 | `/api/appearance-plus/catalog` | GET | 动态称号、名片、战报、洞府、宗门驻地外观目录 |
| 深度外观 | `/api/appearance-plus/owned` | GET | 当前玩家持有、限时、过期和可继承外观 |
| 深度外观 | `/api/appearance-plus/equip` | POST | 装备或卸下展示外观，需幂等键 |
| 导师 | `/api/mentor/summary` | GET | 师徒状态、申请、任务、出师进度和冷却 |
| 导师 | `/api/mentor/apply` | POST | 拜师申请，需幂等键 |
| 导师 | `/api/mentor/review` | POST | 同意或拒绝拜师申请，需幂等键 |
| 导师 | `/api/mentor/task/claim` | POST | 领取师徒任务奖励，需幂等键 |
| 导师 | `/api/mentor/graduate` | POST | 出师结算，需幂等键 |
| 宗门外交 | `/api/sect/diplomacy/summary` | GET | 宗门外交状态、提案、协防和公告 |
| 宗门外交 | `/api/sect/diplomacy/propose` | POST | 发起盟约、敌对、援助或协防提案，需幂等键 |
| 宗门外交 | `/api/sect/diplomacy/review` | POST | 审批外交提案，需幂等键 |
| 跨宗门雇佣 | `/api/sect/hire/list` | GET | 可接取雇佣委托和协助范围 |
| 跨宗门雇佣 | `/api/sect/hire/create` | POST | 发布雇佣委托，需幂等键 |
| 跨宗门雇佣 | `/api/sect/hire/accept` | POST | 接取雇佣委托，需幂等键 |
| 跨宗门雇佣 | `/api/sect/hire/settle` | POST | 结算雇佣奖励和风控衰减，需幂等键 |
| 转服 | `/api/transfer/rules` | GET | 玩家可见转服条件、阶段限制、冷却、排行冻结和费用说明 |
| 转服 | `/api/transfer/request` | POST | 提交转服申请，需幂等键 |
| 转服 | `/api/transfer/cancel` | POST | 取消未审核转服申请，需幂等键 |
| 转服 | `/api/transfer/status` | GET | 查询当前玩家转服申请、报告和审核状态 |
| 转服后台 | `/api/admin/transfer/dry-run` | POST | 生成个人转服影响报告，不修改真实数据 |
| 转服后台 | `/api/admin/transfer/review` | POST | 人工审核转服申请，需幂等键和 GM 权限 |
| 转服后台 | `/api/admin/transfer/execute` | POST | 转服执行预留，默认需要二次确认和审计 |

P2 接口规则：

- 所有 P2 状态变更继续使用 `Idempotency-Key`，重复请求必须返回同一记录或明确的已处理状态。
- 剧情卷轴和纪元史册只能读取公开史册或当前玩家有权查看的个人经历，不得返回订单明细、IP / UA 摘要、后台风控细节和 GM 审计细节。
- 收藏和深度外观接口只能改变展示状态，不得返回或写入攻击、防御、PVP 伤害、九塔贡献倍率、世界 Boss 贡献倍率、最终魔王贡献倍率和资源掉落倍率。
- 导师、宗门外交和跨宗门雇佣的奖励必须由服务端按奖励边界结算，不能转移付费仙玉、绑定道具、限定产物、九大古宝本体和唯一战力道具。
- 转服接口默认先生成 dry-run 影响报告；未通过人工审核、二次确认和阶段校验前，不得迁移玩家资产。
- 最终战前 30 天转服必须被拒绝；转服后至少 7 天内不能参与部分排行奖励。
- P2 接口必须返回 `config_version`、`ruleset_version`、`reward_config_version` 或对应的展示配置版本，便于回放和审计。

## 十五、P3 接口占位与玩法深度边界

P3 在 P2 完成后进入玩法深度与探索生态阶段，优先扩展现有探索、战报、生产、技能和今日路线接口的展示字段。P3 不把奖励、掉落、战斗胜负、技能学习、材料消耗和路线排序交给客户端决定，客户端仍只提交意图和展示服务端结果。

P3 推荐优先复用现有接口并增加可选字段：

| 对象 | 可选字段 | 说明 |
| --- | --- | --- |
| `BattleSummary` | `enemy_traits?: string[]` | 敌人特性，例如高防、快攻、毒伤、护盾、灵敏 |
| `BattleSummary` | `loot_highlights?: string[]` | 本场重点掉落、材料线索或奇遇线索 |
| `BattleSummary` | `battle_hint?: string` | 玩家可读的战斗提示和下一步建议 |
| `BattleSummary` | `counter_suggestions?: string[]` | 根据敌人特性生成的反制建议 |
| `TowerActionResponse` / `WorldBossChallengeResponse` / `PvpBattleResponse` | `reason_summary?: string[]` | 九塔、Boss、PVP 的胜负原因、贡献变化、阶段血量或战力差摘要 |
| `TowerActionResponse` / `WorldBossChallengeResponse` / `PvpBattleResponse` | `counter_suggestions?: string[]` | 九塔、Boss、PVP 的玩家下一步建议 |
| `TowerActionResponse` / `WorldBossChallengeResponse` / `PvpBattleResponse` | `battle_hint?: string` | 多人玩法战报的玩家可读提示 |
| `ExploreResponse` | `linked_event_hint?: string \| null` | 探索完成后生成奇遇时的自然提示 |
| `ProductionRecommendation` | `material_sources?: MaterialSourceHint[]` | 丹方、器方、淬炼材料的来源说明 |
| `SkillLoadoutResponse` | `available_skills[].learned / learnable / unlock_reasons / learn_cost / counter_traits` | 技能掌握状态、学习条件和克制标签 |
| `SkillLoadoutResponse` | `preset_suggestions?: SkillPresetSuggestion[]` | 按近期战报生成的主动技能、本命技能和自动释放顺序建议 |
| `DailyRouteStep` | `source_detail?: string` | 今日路线每一步的推荐来源和降级原因 |
| `DailyRouteStep` | `reason_tags?: string[]` | 可领取、战报衔接、材料来源等玩家可见理由 |

P3 可新增接口分组：

| 分组 | 接口 | 方法 | 说明 |
| --- | --- | --- | --- |
| 战报筛选 | `/api/game/battles` | GET | 按州域、胜负、敌人特性、玩法类型分页查询战报 |
| 材料来源 | `/api/production/material-sources` | GET | 查询材料来源、缺口、推荐州域和预计探索次数 |
| 技能目录与预设 | `/api/production/skills/loadout` | GET | 返回已掌握、可学习、未解锁技能、学习条件和预设建议 |
| 技能学习 | `/api/production/skills/learn` | POST | 学习技能，需幂等键，服务端校验境界、路线和材料 |
| 今日路线 | `/api/game/daily-route` | GET | 返回服务端生成的今日修行路线、推荐原因和降级说明 |

P3 接口规则：

- 所有 P3 状态变更继续使用 `Idempotency-Key`，重复请求不能重复扣资源、重复发奖或重复学习技能。
- 探索掉落池只允许普通修为、灵石、普通材料和任务进度，不得产出付费仙玉、九大古宝本体、限定法宝、唯一战力道具和奖励倍率。
- 怪物特性只能影响战斗表现、战报解释、技能推荐和下一步建议，不能绕过服务端战斗结算。
- 技能学习必须由服务端校验境界、路线、章节、材料和冷却，客户端不能伪造已掌握技能。
- 今日路线只能排序、解释和去重行动入口，不能绕过行动令、月卡权益、风控、幂等和结算规则。
- P3 接口必须返回 `config_version`、`ruleset_version`、`combat_config_version`、`loot_config_version` 或对应展示配置版本，便于回放和调参。

## 十六、九州城池重构接口占位

2026-07-06 后的新主线以 [《九州城池纪元》重策划案](JIUZHOU_CITY_ERA_DESIGN.md) 为准。本节只定义设计级接口占位，真实实现从 R1 九州地图 MVP 开始。

新增接口分组：

| 分组 | 接口 | 方法 | 说明 |
| --- | --- | --- | --- |
| 九州地图 | `/api/world/provinces` | GET | 返回九州、郡域、州势力、出生拥挤度和赛季状态 |
| 九州地图 | `/api/world/map` | GET | 返回可见地块、坐标、地块类型、归属、驻防和可操作状态 |
| 城池 | `/api/city/overview` | GET | 返回主城、分城、建筑、资源、队列、保护状态和驻防摘要 |
| 城池 | `/api/city/settle` | POST | 选择出生州和郡域建立主城，需 `Idempotency-Key` |
| 城池 | `/api/city/build` | POST | 建造或升级建筑，需 `Idempotency-Key` |
| 城池 | `/api/city/territory/collect` | POST | 按离线时长和仓库容量领取领地产出，需 `Idempotency-Key` |
| 军队 | `/api/city/army` | GET | 返回可用道兵、兵营容量、将领名册和行军 / 驻防预设 |
| 军队 | `/api/city/army/train` | POST | 消耗普通灵石与粮草训练道兵，需 `Idempotency-Key` |
| 军队 | `/api/city/army/preset` | POST | 保存行军或驻防预设，需 `Idempotency-Key` |
| 行军 | `/api/world/marches` | GET | 查询当前和最近行军队列、抵达状态和后续处理提示 |
| 行军 | `/api/world/march` | POST | 派遣队伍前往地块、资源点、分城、关隘或九塔，需 `Idempotency-Key` |
| 清野 | `/api/world/clear-wild/resolve` | POST | 结算已抵达清野行军，成功后只解锁该玩家的购买资格，需 `Idempotency-Key` |
| 购地 | `/api/world/blocks/purchase` | POST | 购买同州相邻无主区块，需 `Idempotency-Key` |
| 驻防 | `/api/world/defend` | POST | 设置自有区块的目标驻军数；增加只扣差额，降低自动返还主城，`0` 表示全部撤回，需 `Idempotency-Key` |
| 侦查 | `/api/world/scout` | POST | 侦查目标地块、城池或驻防摘要，需 `Idempotency-Key` |
| 战报 | `/api/world/reports` | GET | 查询行军、清野、购地、攻城、驻防和掠夺战报 |
| 州战 | `/api/world/province-war` | GET | 返回州势力积分、版图、日结、周结和赛季状态 |
| 战功 | `/api/world/war-merit?limit=20` | GET | 返回当前玩家总战功、日战功、周战功、州内战功、宗门战功和最近流水 |
| 战功结算 | `/api/world/war-settlement` | GET | 生成并返回个人日榜、个人周榜、宗门周榜和州域周榜快照，不发放奖励 |

新增共享类型占位：

| 类型 | 说明 |
| --- | --- |
| `PlayerCity` | 玩家主城、分城、坐标、状态、保护期和资源摘要 |
| `MapTile` | 地图地块、州、郡、坐标、类型、归属和可见状态 |
| `TerritoryNode` | 地块内生产设施或战略节点，如资源点、灵脉、关隘、州府、九塔 |
| `WorldBlockOwnership` | 出生分配或购买获得的区块产权，同纪元区块唯一 |
| `TerritoryOverviewResponse` | 自有区块坐标、地形产出、逐块驻军、领地总驻军以及相邻扩张候选 |
| `WorldAtlasProvinceState` | 州域城主、无主区、地形资源、我的城池、驻军、行军和可建城平原摘要 |
| `CityManagementResponse` | 城内建筑队列、资源容量、待收产出、可入库数量、溢出风险和升级建议 |
| `StrategicControlRecord` | 关隘、州府、九塔的周期控制权变化记录 |
| `MarchQueue` | 行军队列、出发地、目标地、队伍、到达时间和状态 |
| `SiegeRecord` | 攻城、围困、城防破损、附庸和恢复记录 |
| `ProvinceWarState` | 州势力积分、城池占有率、灵脉控制度、州战排名 |

接口边界：

- 客户端只提交行军、购买、建造、驻防等意图；产权、战斗、资源产出和州战积分必须由服务端结算。
- 玩家区块产权只能来自出生分配或普通灵石购买，行军、清野、攻城和州战不得强制转移产权。
- 驻防请求中的 `soldier_count` 表示目标驻军数而非本次增量；重复幂等请求不得重复扣兵或返兵。
- 行军和驻防可携带 `preset_id`；服务端校验预设归属、类型、将领解锁和道兵数量，并将将领、阵型与战力写入不可变快照。
- 主城与分城失败只能进入城防破损、围困、停产、附庸或免战恢复等可恢复状态。
- 关隘、州府和九塔使用独立周期控制权，不写入玩家区块产权。
- 所有状态变更必须幂等，重复请求不能重复扣资源、重复创建队列或重复购买。
- 付费、月卡、VIP 不得提高购地折扣、行军胜率、州战积分倍率和地图结算倍率。

## 十七、验收场景

- 前端能根据本文完成 MVP 主流程接口对接。
- 状态变更接口具备幂等键，重复请求不重复发奖。
- 战斗、抽卡、任务、行动、订单都返回可追溯记录 ID。
- 客户端无法自行决定奖励、贡献、抽卡结果和战斗胜负。
- 后台接口与普通客户端接口隔离，所有后台操作写日志。
- 鱼排插件默认只加载小状态卡片，复杂功能必须点击后通过展开窗口接口获取。
- 炼丹、炼器、九大古宝日课和交易行状态变更接口都具备幂等键，并返回可追溯记录 ID。
- 九大古宝池用付费仙玉或 `reserved_paid_jade` 抽取时返回未开放，不扣费、不出结果、不计保底。
- 免费账号伪造批量上限、策略槽位或大月卡托管队列时，服务端按当前权益拒绝或截断。
- 高频固定间隔请求可触发风险分增加、限频或收益延迟，但普通领取和探索不因脚本点击直接封禁。
- P1 Web 体验字段只增强展示，不能改变奖励、贡献、抽卡、战斗和风控结论。
- P1 内天地、阵营、活动和合服 dry-run 接口都有明确路径、幂等规则、配置版本和奖励边界。
- 合服 dry-run 能输出影响报告，但不写真实合服执行结果。
- P2 剧情、收藏、外观、社交和转服接口都有明确路径、幂等规则、权限边界、配置版本和审计要求。
- P2 收藏和深度外观只改变展示，不改变战斗、掉落、贡献、排行和付费奖励公式。
- P2 转服 dry-run 能输出个人影响报告，未审核前不迁移真实资产。
- P3 探索、战报、生产、技能和今日路线接口只能增强玩法深度和展示解释，不改变付费隔离、奖励预算、服务端结算和异步参与边界。
- R1 新号能选择出生州、创建主城并读取附近地图。
- R3 中主城围困只造成耐久、停产和普通资源损失，不转移产权；分城城墙被攻破后，分城与所在区块可转归进攻方。战略设施控制权仍独立按周期变化。
- `POST /api/world/siege/resolve` 使用已抵达的围城行军结算，返回攻守战力、城墙伤害、普通资源掠夺、收益衰减、保护期和分城易主结果，必须带 `Idempotency-Key`。
- `POST /api/world/scout/resolve` 结算已抵达的侦察行军，只返回城池等级、城防档位、驻军档位、资源档位和保护状态，不泄露精确守军与库存。
- `POST /api/world/strategic-control/resolve` 结算已抵达的战略争夺行军。目标只允许关隘、州府或九塔；成功后获得 24 小时控制权，响应与地图区块均返回控制者、剩余时间与控制类型。控制权不会创建或转移 `world_block_ownership`。
- `GET /api/world/province-war` 返回按有效战略控制权实时计算的九州排行榜。关隘、州府、九塔分别贡献 60、100、120 分；过期控制不会进入积分。
- `GET /api/world/rallies` 查询当前宗门开放集结；`POST /api/world/rallies` 由宗主或长老发起攻防集结；`POST /api/world/rallies/join` 由成员响应；`POST /api/world/rallies/resolve` 在至少两人响应后异步结算。攻击成功时战略控制者变为宗门，协防成功时提高宗门已控地标的防守值。
- R4 州战接口能返回州势力积分、版图归属和周期结算状态。
