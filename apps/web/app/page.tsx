"use client";

import { GameClient } from "@nextday/game-client";
import { mvpProvinceLabels } from "@nextday/game-rules";
import type { HealthStatus, LoginResponse, PlayerProfileResponse } from "@nextday/shared";
import { Button, StatusBadge } from "@nextday/ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type HealthText = "检测中" | "正常" | "不可用";
type RouteValue = "qi" | "body";

const tokenStorageKey = "nextday_m1_token";
const deviceStorageKey = "nextday_m1_device_id";

export default function HomePage() {
  const [healthText, setHealthText] = useState<HealthText>("检测中");
  const [token, setToken] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginResponse | null>(null);
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [playerName, setPlayerName] = useState("云游修士");
  const [route, setRoute] = useState<RouteValue>("qi");
  const [message, setMessage] = useState("尚未登录");

  const client = useMemo(
    () =>
      new GameClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
        token: token ?? undefined,
        clientVersion: "nextday-web-m1",
      }),
    [token],
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

  useEffect(() => {
    const savedToken = localStorage.getItem(tokenStorageKey);
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    let ignore = false;
    client
      .me()
      .then((response) => {
        if (response.code !== 0) {
          throw new Error(response.message);
        }
        if (!ignore) {
          setLogin({
            token,
            expires_in: "已保存",
            account: response.data.account,
            player: response.data.player,
          });
        }
        return client.playerProfile();
      })
      .then((response) => {
        if (response.code !== 0) {
          throw new Error(response.message);
        }
        if (!ignore) {
          setProfile(response.data);
          setMessage(response.data.player ? "角色档案已读取" : "账号已登录，尚未创建角色");
        }
      })
      .catch((error) => {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "读取账号失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [client, token]);

  async function handleGuestLogin() {
    const deviceId = getOrCreateDeviceId();
    const response = await client.guestLogin({
      device_id: deviceId,
      nickname: "鱼排道友",
    });

    if (response.code !== 0) {
      setMessage(response.message);
      return;
    }

    localStorage.setItem(tokenStorageKey, response.data.token);
    setToken(response.data.token);
    setLogin(response.data);
    setMessage("游客登录成功");
  }

  async function handleCreatePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage("请先游客登录");
      return;
    }

    const response = await client.createPlayer(
      { name: playerName, route },
      `idem_web_create_${Date.now()}`,
    );

    if (response.code !== 0) {
      setMessage(response.message);
      return;
    }

    setProfile(response.data.profile);
    setMessage(`角色创建成功，记录 ${response.data.record_id}`);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">M1 Web 验收</p>
          <h1>择日飞升：九塔封魔</h1>
          <p className="summary">当前阶段接入游客登录、角色创建、玩家档案和九州入口占位。</p>
        </div>
        <StatusBadge
          tone={healthText === "正常" ? "success" : healthText === "检测中" ? "neutral" : "warning"}
        >
          API {healthText}
        </StatusBadge>
      </section>

      <section className="toolbar" aria-label="快捷操作">
        <Button onClick={handleGuestLogin}>游客登录</Button>
        <Button>今日任务占位</Button>
        <Button>打开战报占位</Button>
      </section>

      <section className="panel" aria-label="账号和角色">
        <div className="section-title">
          <h2>账号档案</h2>
          <span>{message}</span>
        </div>
        <div className="profile-grid">
          <article>
            <strong>账号</strong>
            <span>{login?.account.account_id ?? "未登录"}</span>
          </article>
          <article>
            <strong>角色</strong>
            <span>{profile?.player?.name ?? "未创建"}</span>
          </article>
          <article>
            <strong>灵石</strong>
            <span>{profile?.wallet?.spirit_stone ?? "0"}</span>
          </article>
        </div>
        {!profile?.player ? (
          <form className="create-form" onSubmit={handleCreatePlayer}>
            <input
              aria-label="角色名"
              maxLength={16}
              minLength={2}
              onChange={(event) => setPlayerName(event.target.value)}
              value={playerName}
            />
            <select
              aria-label="修行路线"
              onChange={(event) => setRoute(event.target.value as RouteValue)}
              value={route}
            >
              <option value="qi">练气</option>
              <option value="body">炼体</option>
            </select>
            <Button type="submit">创建角色</Button>
          </form>
        ) : null}
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

function getOrCreateDeviceId(): string {
  const savedDeviceId = localStorage.getItem(deviceStorageKey);
  if (savedDeviceId) {
    return savedDeviceId;
  }

  const deviceId = `web_${globalThis.crypto.randomUUID()}`;
  localStorage.setItem(deviceStorageKey, deviceId);
  return deviceId;
}
