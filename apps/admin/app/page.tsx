"use client";

import { GameClient } from "@nextday/game-client";
import { riskStatusLabels } from "@nextday/game-rules";
import type {
  AdminLogType,
  AdminPlayerLogsResponse,
  AdminPlayerRiskResponse,
  HealthStatus,
} from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";

export default function AdminHomePage() {
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [adminToken, setAdminToken] = useState("nextday-admin-dev");
  const [logType, setLogType] = useState<AdminLogType>("behavior");
  const [logs, setLogs] = useState<AdminPlayerLogsResponse | null>(null);
  const [risk, setRisk] = useState<AdminPlayerRiskResponse | null>(null);
  const [message, setMessage] = useState("等待查询");

  const client = useMemo(
    () =>
      new GameClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
        clientVersion: "nextday-admin-m1",
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

  async function handleQueryLogs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPlayerId = playerId.trim();
    if (!normalizedPlayerId) {
      setMessage("请输入玩家 ID");
      return;
    }

    const response = await client.getPlayerLogs({
      playerId: normalizedPlayerId,
      type: logType,
      adminToken,
    });

    if (response.code !== 0) {
      setMessage(response.message);
      return;
    }

    setLogs(response.data);
    const riskResponse = await client.getPlayerRisk({
      playerId: normalizedPlayerId,
      adminToken,
    });
    if (riskResponse.code === 0) {
      setRisk(riskResponse.data);
    }
    setMessage(`已读取 ${response.data.rows.length} 条记录`);
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">M1 Admin 验收</p>
          <h1>GM 后台</h1>
          <p>当前接入开发日志查询，正式 GM 权限体系留到后续阶段。</p>
        </div>
        <StatusBadge
          tone={apiAvailable ? "success" : apiAvailable === null ? "neutral" : "warning"}
        >
          API {apiAvailable ? "正常" : apiAvailable === null ? "检测中" : "不可用"}
        </StatusBadge>
      </header>

      <section className="log-panel">
        <div>
          <h2>玩家日志查询</h2>
          <p>{message}</p>
        </div>
        <form className="log-form" onSubmit={handleQueryLogs}>
          <input
            aria-label="玩家 ID"
            onChange={(event) => setPlayerId(event.target.value)}
            placeholder="player_xxx"
            value={playerId}
          />
          <select
            aria-label="日志类型"
            onChange={(event) => setLogType(event.target.value as AdminLogType)}
            value={logType}
          >
            <option value="behavior">行为日志</option>
            <option value="audit">审计日志</option>
            <option value="login">登录日志</option>
            <option value="wallet">钱包日志</option>
          </select>
          <input
            aria-label="开发后台令牌"
            onChange={(event) => setAdminToken(event.target.value)}
            value={adminToken}
          />
          <Button type="submit">查询日志</Button>
        </form>
        <pre className="log-output">
          {logs ? JSON.stringify(logs.rows.slice(0, 8), null, 2) : "暂无记录"}
        </pre>
      </section>

      <section className="admin-grid">
        <article>
          <h2>玩家查询</h2>
          <p>后续接入玩家、订单、背包、战斗和货币流水。</p>
        </article>
        <article>
          <h2>风控查询</h2>
          {risk ? (
            <div className="risk-summary">
              <p>
                风险分 {risk.risk_score}，等级 {risk.risk_level}，当前状态{" "}
                {riskStatusLabels[risk.current_status]}
              </p>
              <p>延迟池 {risk.delayed_settlements.length} 条</p>
              <p>
                规则：
                {risk.recent_rule_codes.length > 0 ? risk.recent_rule_codes.join("、") : "无"}
              </p>
            </div>
          ) : (
            <p>输入玩家 ID 查询后展示风险分、收益延迟池和近期命中规则。</p>
          )}
        </article>
        <article>
          <h2>当前风控状态</h2>
          <ul>
            {Object.entries(riskStatusLabels).map(([key, label]) => (
              <li key={key}>{label}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
