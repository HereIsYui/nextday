"use client";

import { riskStatusLabels } from "@nextday/game-rules";
import type { HealthStatus } from "@nextday/shared";
import { StatusBadge } from "@nextday/ui";
import { useEffect, useState } from "react";

export default function AdminHomePage() {
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

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

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">M0 Admin 骨架</p>
          <h1>GM 后台</h1>
          <p>当前仅提供健康检查、风控查询入口占位和后续模块导航。</p>
        </div>
        <StatusBadge
          tone={apiAvailable ? "success" : apiAvailable === null ? "neutral" : "warning"}
        >
          API {apiAvailable ? "正常" : apiAvailable === null ? "检测中" : "不可用"}
        </StatusBadge>
      </header>

      <section className="admin-grid">
        <article>
          <h2>玩家查询</h2>
          <p>后续接入玩家、订单、背包、战斗和货币流水。</p>
        </article>
        <article>
          <h2>风控查询</h2>
          <p>预留风险分、收益延迟池和人工审核入口。</p>
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
