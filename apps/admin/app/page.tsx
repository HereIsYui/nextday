"use client";

import { GameClient } from "@nextday/game-client";
import { riskStatusLabels } from "@nextday/game-rules";
import type {
  AdminConfigVersionListResponse,
  AdminDelayedSettlementListResponse,
  AdminGmOperationListResponse,
  AdminLogType,
  AdminMailListResponse,
  AdminPlayerDigestResponse,
  AdminPlayerLogsResponse,
  AnnouncementListResponse,
  ConfigType,
  HealthStatus,
} from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";

const defaultAdminToken = "nextday-admin-dev";

export default function AdminHomePage() {
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [adminToken, setAdminToken] = useState(defaultAdminToken);
  const [logType, setLogType] = useState<AdminLogType>("behavior");
  const [configType, setConfigType] = useState<ConfigType>("gacha");
  const [configPayload, setConfigPayload] = useState(defaultConfigPayload);
  const [digest, setDigest] = useState<AdminPlayerDigestResponse | null>(null);
  const [logs, setLogs] = useState<AdminPlayerLogsResponse | null>(null);
  const [mails, setMails] = useState<AdminMailListResponse | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementListResponse | null>(null);
  const [configs, setConfigs] = useState<AdminConfigVersionListResponse | null>(null);
  const [operations, setOperations] = useState<AdminGmOperationListResponse | null>(null);
  const [delayed, setDelayed] = useState<AdminDelayedSettlementListResponse | null>(null);
  const [message, setMessage] = useState("等待操作");
  const [busy, setBusy] = useState(false);

  const client = useMemo(
    () =>
      new GameClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
        clientVersion: "nextday-admin-m8",
      }),
    [],
  );

  useEffect(() => {
    let ignore = false;

    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("API 健康检查失败");
        }
        return response.json() as Promise<HealthStatus>;
      })
      .then((response) => {
        if (!ignore) {
          setApiAvailable(response.status === "ok");
        }
      })
      .catch(() => {
        if (!ignore) {
          setApiAvailable(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPlayerId = playerId.trim();
    if (!normalizedPlayerId) {
      setMessage("请输入玩家 ID");
      return;
    }

    await runAdminAction("查询玩家", async () => {
      const [digestResponse, logsResponse, mailResponse, delayedResponse] = await Promise.all([
        client.getAdminPlayerDigest({ playerId: normalizedPlayerId, adminToken }),
        client.getPlayerLogs({ playerId: normalizedPlayerId, type: logType, adminToken }),
        client.listAdminMails({ playerId: normalizedPlayerId, adminToken }),
        client.listDelayedSettlements({ playerId: normalizedPlayerId, adminToken, limit: 20 }),
      ]);
      ensureOk(digestResponse);
      ensureOk(logsResponse);
      ensureOk(mailResponse);
      ensureOk(delayedResponse);

      setDigest(digestResponse.data);
      setLogs(logsResponse.data);
      setMails(mailResponse.data);
      setDelayed(delayedResponse.data);
      setMessage(`已读取 ${digestResponse.data.player.name} 的运营档案`);
    });
  }

  async function handleLoadOps() {
    await runAdminAction("读取运营列表", async () => {
      const [announcementResponse, configResponse, operationResponse, delayedResponse] =
        await Promise.all([
          client.listAnnouncements({ adminToken }),
          client.listAdminConfigVersions({ adminToken, configType }),
          client.listGmOperations({ adminToken }),
          client.listDelayedSettlements({ adminToken, status: "delayed", limit: 30 }),
        ]);
      ensureOk(announcementResponse);
      ensureOk(configResponse);
      ensureOk(operationResponse);
      ensureOk(delayedResponse);

      setAnnouncements(announcementResponse.data);
      setConfigs(configResponse.data);
      setOperations(operationResponse.data);
      setDelayed(delayedResponse.data);
      setMessage("运营列表已刷新");
    });
  }

  async function handleSendMail() {
    const normalizedPlayerId = playerId.trim();
    if (!normalizedPlayerId) {
      setMessage("请输入玩家 ID 后再发个人补偿邮件");
      return;
    }

    await runAdminAction("发送补偿邮件", async () => {
      const response = await client.sendAdminMail(
        {
          target_type: "player",
          player_id: normalizedPlayerId,
          title: "日课补偿",
          content: "因测试调整发放基础补偿，请查收。",
          rewards: {
            spirit_stone: "100",
            items: [{ item_id: "low_herb", name: "凝露草", count: 2, bind_type: "bound" }],
          },
          reason: "M8 后台验收",
          operator: "admin_dev",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_mail") },
      );
      ensureOk(response);
      setMessage(`补偿邮件已发送：${response.data.mail.title}`);
      await handleLoadOps();
    });
  }

  async function handleCreateAnnouncement() {
    await runAdminAction("发布公告", async () => {
      const response = await client.createAnnouncement(
        {
          announcement_type: "maintenance",
          title: "九州维护公告",
          content: "服务器将进行短时维护，已提交的异步行动不受影响。",
          visible_scope: "all",
          operator: "admin_dev",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_announcement") },
      );
      ensureOk(response);
      setMessage(`公告已发布：${response.data.announcement.title}`);
      await handleLoadOps();
    });
  }

  async function handlePublishConfig() {
    await runAdminAction("发布配置", async () => {
      const parsedPayload = JSON.parse(configPayload) as Record<string, unknown>;
      const response = await client.publishAdminConfig(
        {
          config_type: configType,
          config_version: `${configType}_admin_${Date.now()}`,
          payload: parsedPayload,
          reason: "M8 后台配置发布验收",
          operator: "admin_dev",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_config_publish") },
      );
      ensureOk(response);
      setMessage(
        response.data.validation.warnings.length
          ? `配置已发布，提示 ${response.data.validation.warnings.length} 条`
          : `配置已发布：${response.data.config.config_version}`,
      );
      await handleLoadOps();
    });
  }

  async function handleRollbackConfig() {
    const target = configs?.configs.find((config) => !config.active) ?? configs?.configs[0];
    if (!target) {
      setMessage("暂无可回滚配置");
      return;
    }

    await runAdminAction("回滚配置", async () => {
      const response = await client.rollbackAdminConfig(
        {
          config_type: target.config_type as ConfigType,
          target_config_version: target.config_version,
          reason: "M8 后台回滚验收",
          operator: "admin_dev",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_config_rollback") },
      );
      ensureOk(response);
      setMessage(`配置已回滚：${response.data.config.config_version}`);
      await handleLoadOps();
    });
  }

  async function handleResolveRisk() {
    const target = digest?.risk.recent_records.find(
      (record) => record.resolution_status === "open",
    );
    if (!target) {
      setMessage("暂无待解除风控记录");
      return;
    }

    await runAdminAction("解除风控标记", async () => {
      const response = await client.resolveRiskRecord(
        {
          risk_record_id: target.risk_record_id,
          reason: "人工复核通过",
          operator: "admin_dev",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_risk_resolve") },
      );
      ensureOk(response);
      setMessage(`风控记录已解除：${response.data.record.risk_record_id}`);
      if (digest) {
        const refreshed = await client.getAdminPlayerDigest({
          playerId: digest.player.player_id,
          adminToken,
        });
        if (refreshed.code === 0) {
          setDigest(refreshed.data);
        }
      }
    });
  }

  async function handleReviewDelayed(action: "release" | "reject") {
    const target = delayed?.records.find((record) => record.status === "delayed");
    if (!target) {
      setMessage("暂无待审核延迟结算");
      return;
    }

    await runAdminAction(action === "release" ? "放行延迟收益" : "驳回延迟收益", async () => {
      const response = await client.reviewDelayedSettlement(
        {
          settlement_record_id: target.settlement_record_id,
          action,
          reason: action === "release" ? "人工审核放行" : "异常收益驳回",
          reviewer: "admin_dev",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_delayed_review") },
      );
      ensureOk(response);
      setMessage(`延迟结算已处理：${response.data.record.status}`);
      await handleLoadOps();
    });
  }

  async function runAdminAction(label: string, action: () => Promise<void>) {
    setBusy(true);
    setMessage(`${label}中`);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">M8 运营后台</p>
          <h1>GM 工作台</h1>
          <p>玩家查询、邮件公告、配置发布和风控处理都通过开发后台令牌访问。</p>
        </div>
        <StatusBadge
          tone={apiAvailable ? "success" : apiAvailable === null ? "neutral" : "warning"}
        >
          API {apiAvailable ? "正常" : apiAvailable === null ? "检测中" : "不可用"}
        </StatusBadge>
      </header>

      <section className="ops-bar">
        <form className="ops-form" onSubmit={handleQuery}>
          <label>
            <span>玩家 ID</span>
            <input
              onChange={(event) => setPlayerId(event.target.value)}
              placeholder="player_xxx"
              value={playerId}
            />
          </label>
          <label>
            <span>日志类型</span>
            <select
              onChange={(event) => setLogType(event.target.value as AdminLogType)}
              value={logType}
            >
              <option value="behavior">行为日志</option>
              <option value="audit">审计日志</option>
              <option value="login">登录日志</option>
              <option value="wallet">钱包日志</option>
            </select>
          </label>
          <label>
            <span>后台令牌</span>
            <input onChange={(event) => setAdminToken(event.target.value)} value={adminToken} />
          </label>
          <Button disabled={busy} type="submit">
            查询
          </Button>
          <Button disabled={busy} onClick={handleLoadOps} type="button">
            刷新运营
          </Button>
        </form>
        <p>{message}</p>
      </section>

      <section className="metric-grid" aria-label="后台摘要">
        <MetricBox
          label="玩家"
          value={digest?.player.name ?? "未查询"}
          detail={digest?.player.player_id ?? "输入玩家 ID"}
        />
        <MetricBox
          label="货币"
          value={digest?.wallet?.spirit_stone ?? "0"}
          detail={`付费仙玉 ${digest?.wallet?.jade_paid ?? "0"}`}
        />
        <MetricBox
          label="风险"
          value={String(digest?.risk.risk_score ?? 0)}
          detail={digest ? riskStatusLabels[digest.risk.current_status] : "未查询"}
        />
        <MetricBox
          label="延迟池"
          value={String(delayed?.records.length ?? 0)}
          detail="可人工放行或驳回"
        />
      </section>

      <section className="admin-grid">
        <article className="ops-panel">
          <div className="panel-title">
            <h2>GM 查询</h2>
            <span>订单、抽卡、战斗、行动、货币和日志</span>
          </div>
          <SummaryList
            rows={[
              ["订单", `${digest?.orders.length ?? 0} 条`],
              ["抽卡", `${digest?.gacha_records.length ?? 0} 条`],
              ["战斗", `${digest?.battles.length ?? 0} 条`],
              ["行动", `${digest?.action_records.length ?? 0} 条`],
              ["日志", `${logs?.rows.length ?? 0} 条`],
            ]}
          />
          <pre className="compact-output">
            {digest
              ? JSON.stringify(
                  {
                    player: digest.player,
                    wallet: digest.wallet,
                    latest_order: digest.orders[0] ?? null,
                    latest_action: digest.action_records[0] ?? null,
                  },
                  null,
                  2,
                )
              : "暂无玩家档案"}
          </pre>
        </article>

        <article className="ops-panel">
          <div className="panel-title">
            <h2>邮件公告</h2>
            <span>补偿邮件和全服公告</span>
          </div>
          <div className="button-row">
            <Button disabled={busy} onClick={handleSendMail}>
              发补偿邮件
            </Button>
            <Button disabled={busy} onClick={handleCreateAnnouncement}>
              发布公告
            </Button>
          </div>
          <SummaryList
            rows={[
              ["邮件", `${mails?.mails.length ?? 0} 封`],
              ["公告", `${announcements?.announcements.length ?? 0} 条`],
              ["最新公告", announcements?.announcements[0]?.title ?? "暂无"],
            ]}
          />
        </article>

        <article className="ops-panel">
          <div className="panel-title">
            <h2>配置发布</h2>
            <span>校验、发布、回滚和留痕</span>
          </div>
          <label className="stack-label">
            <span>配置类型</span>
            <select
              onChange={(event) => setConfigType(event.target.value as ConfigType)}
              value={configType}
            >
              <option value="gacha">抽卡</option>
              <option value="convenience">便利</option>
              <option value="risk">风控</option>
              <option value="reward">奖励</option>
            </select>
          </label>
          <label className="stack-label">
            <span>Payload</span>
            <textarea
              onChange={(event) => setConfigPayload(event.target.value)}
              rows={7}
              value={configPayload}
            />
          </label>
          <div className="button-row">
            <Button disabled={busy} onClick={handlePublishConfig}>
              发布配置
            </Button>
            <Button disabled={busy} onClick={handleRollbackConfig}>
              回滚配置
            </Button>
          </div>
          <SummaryList
            rows={[
              ["版本", `${configs?.configs.length ?? 0} 个`],
              [
                "当前",
                configs?.configs.find((config) => config.active)?.config_version ?? "未加载",
              ],
            ]}
          />
        </article>

        <article className="ops-panel">
          <div className="panel-title">
            <h2>风控处理</h2>
            <span>风险标记、延迟池和人工审核</span>
          </div>
          <div className="button-row">
            <Button disabled={busy || !digest} onClick={handleResolveRisk}>
              解除标记
            </Button>
            <Button disabled={busy} onClick={() => handleReviewDelayed("release")}>
              放行收益
            </Button>
            <Button disabled={busy} onClick={() => handleReviewDelayed("reject")}>
              驳回收益
            </Button>
          </div>
          <SummaryList
            rows={[
              ["风险等级", digest?.risk.risk_level ?? "未查询"],
              ["规则", digest?.risk.recent_rule_codes.join("、") || "无"],
              [
                "待审核",
                `${delayed?.records.filter((record) => record.status === "delayed").length ?? 0} 条`,
              ],
              ["操作日志", `${operations?.operations.length ?? 0} 条`],
            ]}
          />
        </article>
      </section>
    </main>
  );
}

function MetricBox({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SummaryList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="summary-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ensureOk<TData>(response: { code: number; message: string; data: TData }) {
  if (response.code !== 0) {
    throw new Error(response.message);
  }
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`;
}

const defaultConfigPayload = JSON.stringify(
  {
    pools: {
      ancient_treasure: {
        allowedCostTypes: ["monthly_grant", "ancient_page"],
        paid_jade_entry: "reserved_unopened",
        results: [
          { treasure_id: "taiyi_danding", name: "太乙丹鼎" },
          { treasure_id: "qiankun_lianxing_lu", name: "乾坤炼星炉" },
          { treasure_id: "xuandu_juling_pan", name: "玄都聚灵盘" },
          { treasure_id: "qingdi_changsheng_juan", name: "青帝长生卷" },
          { treasure_id: "shanhe_sheji_tu", name: "山河社稷图" },
          { treasure_id: "haotian_zhenmo_zhong", name: "昊天镇魔钟" },
          { treasure_id: "jiuyuan_shihun_fan", name: "九渊噬魂幡" },
          { treasure_id: "zhenyue_xuanhuang_yin", name: "镇岳玄黄印" },
          { treasure_id: "tianji_xingpan", name: "天机星盘" },
        ],
      },
    },
  },
  null,
  2,
);
