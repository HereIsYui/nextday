"use client";

import { mvpProvinceLabels } from "@nextday/game-rules";
import type { HealthStatus } from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { useEffect, useState } from "react";

type HealthText = "检测中" | "正常" | "不可用";

export default function HomePage() {
  const [healthText, setHealthText] = useState<HealthText>("检测中");

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
          setHealthText(response.status === "ok" ? "正常" : "不可用");
        }
      })
      .catch(() => {
        if (!ignore) {
          setHealthText("不可用");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">M0 Web 骨架</p>
          <h1>择日飞升：九塔封魔</h1>
          <p className="summary">当前阶段只提供项目地基、健康检查和九州入口占位。</p>
        </div>
        <StatusBadge
          tone={healthText === "正常" ? "success" : healthText === "检测中" ? "neutral" : "warning"}
        >
          API {healthText}
        </StatusBadge>
      </section>

      <section className="toolbar" aria-label="快捷操作">
        <Button>一键领取占位</Button>
        <Button>今日任务占位</Button>
        <Button>打开战报占位</Button>
      </section>

      <section className="map" aria-label="九州地图占位">
        <div className="section-title">
          <h2>九州地图占位</h2>
          <span>首版开放四州</span>
        </div>
        <div className="province-grid">
          {Object.entries(mvpProvinceLabels).map(([provinceId, label]) => (
            <article className="province" key={provinceId}>
              <strong>{label}</strong>
              <span>待接入州状态与九塔摘要</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
