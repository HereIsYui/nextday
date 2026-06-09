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
  MergeDryRunReportResponse,
  TransferRequestState,
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
  const [configPayload, setConfigPayload] = useState(getDefaultConfigPayload("gacha"));
  const [mergeReportId, setMergeReportId] = useState("");
  const [transferRequestId, setTransferRequestId] = useState("");
  const [digest, setDigest] = useState<AdminPlayerDigestResponse | null>(null);
  const [logs, setLogs] = useState<AdminPlayerLogsResponse | null>(null);
  const [mails, setMails] = useState<AdminMailListResponse | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementListResponse | null>(null);
  const [configs, setConfigs] = useState<AdminConfigVersionListResponse | null>(null);
  const [operations, setOperations] = useState<AdminGmOperationListResponse | null>(null);
  const [delayed, setDelayed] = useState<AdminDelayedSettlementListResponse | null>(null);
  const [mergeReport, setMergeReport] = useState<MergeDryRunReportResponse | null>(null);
  const [transferRequest, setTransferRequest] = useState<TransferRequestState | null>(null);
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

  function handleConfigTypeChange(nextConfigType: ConfigType) {
    setConfigType(nextConfigType);
    setConfigPayload(getDefaultConfigPayload(nextConfigType));
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

  async function handleCreateMergeDryRun() {
    await runAdminAction("生成合服演练报告", async () => {
      const response = await client.createMergeDryRun(
        {
          source_server_ids: ["mvp_alpha", "mvp_beta"],
          target_server_id: "mvp_merged",
          include_inactive: false,
          operator: "admin_dev",
          reason: "P1 合服 dry-run 后台验收",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_merge_dry_run") },
      );
      ensureOk(response);
      setMergeReport(response.data);
      setMergeReportId(response.data.report.report_id);
      setMessage(`合服演练报告已生成：${response.data.report.report_id}`);
      await handleLoadOps();
    });
  }

  async function handleQueryMergeDryRun() {
    const reportId = mergeReportId.trim();
    if (!reportId) {
      setMessage("请输入合服演练报告 ID");
      return;
    }

    await runAdminAction("查询合服演练报告", async () => {
      const response = await client.getMergeDryRunReport({ reportId, adminToken });
      ensureOk(response);
      setMergeReport(response.data);
      setMessage(`已读取合服演练报告：${response.data.report.report_id}`);
    });
  }

  async function handleReserveMergeExecution() {
    const reportId = mergeReport?.report.report_id ?? mergeReportId.trim();
    if (!reportId) {
      setMessage("请先生成或输入合服演练报告 ID");
      return;
    }

    await runAdminAction("写入合服执行预留审计", async () => {
      const response = await client.reserveMergeExecution(
        {
          report_id: reportId,
          confirm_text: "DRY_RUN_ONLY",
          operator: "admin_dev",
          reason: "P1 只验证执行入口预留，不执行真实合服",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_merge_execute_reserved") },
      );
      ensureOk(response);
      setMergeReport({ report: response.data.report });
      setMergeReportId(response.data.report.report_id);
      setMessage(response.data.message);
      await handleLoadOps();
    });
  }

  async function handleCreateTransferDryRun() {
    const normalizedPlayerId = playerId.trim();
    if (!normalizedPlayerId) {
      setMessage("请输入玩家 ID 后再生成转服报告");
      return;
    }

    await runAdminAction("生成转服影响报告", async () => {
      const response = await client.createTransferDryRun(
        {
          player_id: normalizedPlayerId,
          target_server_id: "mvp_beta",
          source_server_id: "server_mvp_001",
          operator: "admin_dev",
          reason: "P2 转服 dry-run 后台验收",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_transfer_dry_run") },
      );
      ensureOk(response);
      setTransferRequest(response.data.request);
      setTransferRequestId(response.data.request.transfer_request_id);
      setMessage(`转服报告已生成：${response.data.request.transfer_request_id}`);
      await handleLoadOps();
    });
  }

  async function handleReviewTransfer(decision: "approve" | "reject") {
    const requestId = transferRequest?.transfer_request_id ?? transferRequestId.trim();
    if (!requestId) {
      setMessage("请先生成或输入转服申请 ID");
      return;
    }

    await runAdminAction(decision === "approve" ? "审核通过转服" : "驳回转服", async () => {
      const response = await client.reviewTransferRequest(
        {
          transfer_request_id: requestId,
          decision,
          operator: "admin_dev",
          reason: decision === "approve" ? "人工复核通过" : "阶段或风险不满足",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_transfer_review") },
      );
      ensureOk(response);
      setTransferRequest(response.data.request);
      setTransferRequestId(response.data.request.transfer_request_id);
      setMessage(`转服审核已处理：${transferStatusLabel(response.data.request.status)}`);
      await handleLoadOps();
    });
  }

  async function handleReserveTransferExecution() {
    const requestId = transferRequest?.transfer_request_id ?? transferRequestId.trim();
    if (!requestId) {
      setMessage("请先生成或输入转服申请 ID");
      return;
    }

    await runAdminAction("写入转服执行预留审计", async () => {
      const response = await client.executeTransferReserved(
        {
          transfer_request_id: requestId,
          confirm_text: "确认转服执行预留",
          operator: "admin_dev",
          reason: "P2 当前只验证执行入口预留，不迁移真实资产",
        },
        { adminToken, idempotencyKey: createIdempotencyKey("admin_transfer_execute_reserved") },
      );
      ensureOk(response);
      setTransferRequest(response.data.request);
      setTransferRequestId(response.data.request.transfer_request_id);
      setMessage(response.data.message);
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
              onChange={(event) => handleConfigTypeChange(event.target.value as ConfigType)}
              value={configType}
            >
              <option value="gacha">抽卡</option>
              <option value="convenience">便利</option>
              <option value="risk">风控</option>
              <option value="reward">奖励</option>
              <option value="activity_template">活动模板</option>
              <option value="merge_dry_run">合服演练</option>
              <option value="transfer_rule">转服规则</option>
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

        <article className="ops-panel">
          <div className="panel-title">
            <h2>合服演练</h2>
            <span>只生成 dry-run 报告，真实执行未开放</span>
          </div>
          <label className="stack-label">
            <span>报告 ID</span>
            <input
              onChange={(event) => setMergeReportId(event.target.value)}
              placeholder="merge_dry_xxx"
              value={mergeReportId}
            />
          </label>
          <div className="button-row">
            <Button disabled={busy} onClick={handleCreateMergeDryRun}>
              生成报告
            </Button>
            <Button disabled={busy} onClick={handleQueryMergeDryRun}>
              查询报告
            </Button>
            <Button disabled={busy || !mergeReportId.trim()} onClick={handleReserveMergeExecution}>
              执行预留
            </Button>
          </div>
          <SummaryList
            rows={[
              ["状态", mergeReport?.report.status ?? "未生成"],
              [
                "执行",
                transferExecuteStatusLabel(mergeReport?.report.execute_status ?? "reserved_only"),
              ],
              ["风险", String(mergeReport?.report.risk_summary.risk_level ?? "未评估")],
              ["玩家", String(mergeReport?.report.summary.player_count ?? 0)],
              [
                "宗门冲突",
                String(
                  Array.isArray(mergeReport?.report.sect_conflict_summary.duplicate_sect_names)
                    ? mergeReport.report.sect_conflict_summary.duplicate_sect_names.length
                    : 0,
                ),
              ],
            ]}
          />
          <pre className="compact-output">
            {mergeReport
              ? JSON.stringify(
                  {
                    report_id: mergeReport.report.report_id,
                    asset: mergeReport.report.asset_inheritance_summary,
                    rank: mergeReport.report.rank_freeze_summary,
                    rollback: mergeReport.report.rollback_suggestion,
                  },
                  null,
                  2,
                )
              : "暂无合服演练报告"}
          </pre>
        </article>

        <article className="ops-panel">
          <div className="panel-title">
            <h2>转服演练</h2>
            <span>个人影响报告、人工审核和执行预留</span>
          </div>
          <label className="stack-label">
            <span>转服申请 ID</span>
            <input
              onChange={(event) => setTransferRequestId(event.target.value)}
              placeholder="transfer_req_xxx"
              value={transferRequestId}
            />
          </label>
          <div className="button-row">
            <Button disabled={busy || !playerId.trim()} onClick={handleCreateTransferDryRun}>
              生成转服报告
            </Button>
            <Button
              disabled={busy || !transferRequestId.trim()}
              onClick={() => handleReviewTransfer("approve")}
            >
              审核通过
            </Button>
            <Button
              disabled={busy || !transferRequestId.trim()}
              onClick={() => handleReviewTransfer("reject")}
            >
              驳回
            </Button>
            <Button
              disabled={busy || !transferRequestId.trim()}
              onClick={handleReserveTransferExecution}
            >
              执行预留
            </Button>
          </div>
          <SummaryList
            rows={[
              ["状态", transferRequest ? transferStatusLabel(transferRequest.status) : "未生成"],
              [
                "执行",
                transferExecuteStatusLabel(transferRequest?.execute_status ?? "dry_run_only"),
              ],
              ["目标服", transferRequest?.target_server_id ?? "mvp_beta"],
              ["排行冷却", transferRequest?.rank_cooldown_until ? "已生成" : "未生成"],
              ["风险", String(transferRequest?.risk_summary?.risk_level ?? "未评估")],
            ]}
          />
          <pre className="compact-output">
            {transferRequest
              ? JSON.stringify(
                  {
                    request_id: transferRequest.transfer_request_id,
                    asset: transferRequest.asset_mapping_summary,
                    payment: transferRequest.payment_asset_check_summary,
                    sect: transferRequest.sect_cleanup_summary,
                  },
                  null,
                  2,
                )
              : "暂无转服影响报告"}
          </pre>
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

function transferStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    canceled: "已取消",
    draft: "报告草稿",
    executed: "已执行",
    pending_confirm: "待二次确认",
    rejected: "已驳回",
    reviewing: "审核中",
    rolled_back: "已回滚",
    submitted: "已提交",
  };
  return labels[status] ?? "转服记录";
}

function transferExecuteStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    dry_run_only: "仅生成影响报告",
    executed: "已执行",
    reserved_only: "执行入口预留",
  };
  return labels[status] ?? "执行状态待确认";
}

function getDefaultConfigPayload(configType: ConfigType): string {
  if (configType === "transfer_rule") {
    return JSON.stringify(
      {
        rule: {
          mode: "dry_run_manual_review_reserved_execute",
          free_transfer_enabled: false,
          execute_enabled: false,
          final_battle_forbidden_days: 30,
          rank_cooldown_days: 7,
          review_rule: {
            manual_review_required: true,
            second_confirm_required: true,
          },
        },
      },
      null,
      2,
    );
  }

  if (configType === "merge_dry_run") {
    return JSON.stringify(
      {
        mode: "dry_run_only",
        execution_enabled: false,
        merge_conditions: ["目标服同纪元", "排行先冻结", "订单和保底先校验"],
        execution_rule: "真实合服执行入口预留但默认不可用。",
      },
      null,
      2,
    );
  }

  if (configType === "activity_template") {
    return JSON.stringify(
      {
        templates: [
          {
            template_id: "event_admin_preview",
            activity_type: "festival",
            async_enabled: true,
            reward_preview: { spirit_stone: "100", items: [] },
          },
        ],
      },
      null,
      2,
    );
  }

  if (configType === "convenience") {
    return JSON.stringify(
      {
        tiers: {
          free: { batch_limit: 5, strategy_slots: 1 },
          vip3: { batch_limit: 10, strategy_slots: 3 },
          large_monthly: { batch_limit: 20, strategy_slots: 5 },
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(
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
}
