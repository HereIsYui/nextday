import { GameClient } from "@nextday/game-client";
import type {
  ApiResponse,
  PluginExpandedPanelResponse,
  PluginStatusCardResponse,
} from "@nextday/shared";

const tokenStorageKey = "nextday_m1_token";
const apiBaseUrl = "http://localhost:3001";

export interface PluginCardOptions {
  nickname: string;
  openWeb: () => void;
}

export function mountPluginCard(container: HTMLElement, options: PluginCardOptions) {
  container.innerHTML = "";
  injectStyles(container.ownerDocument);

  const card = container.ownerDocument.createElement("div");
  card.className = "nextday-card";
  card.innerHTML = `
    <button class="nextday-card__summary" type="button" aria-expanded="false">
      <span>
        <strong>择日飞升</strong>
        <small data-role="summary-line">${escapeHtml(options.nickname)} · 未连接</small>
      </span>
      <em data-role="toggle-label">展开</em>
    </button>
    <div class="nextday-card__panel" hidden>
      <div class="nextday-card__state" data-role="state">正在读取随身状态</div>
      <div class="nextday-card__body" data-role="body"></div>
      <div class="nextday-card__actions">
        <button type="button" data-action="claim">一键领取</button>
        <button type="button" data-action="preset">预设提交</button>
        <button type="button" data-action="web">打开 Web</button>
      </div>
    </div>
  `;

  const summary = card.querySelector<HTMLButtonElement>(".nextday-card__summary");
  const summaryLine = card.querySelector<HTMLElement>('[data-role="summary-line"]');
  const toggleLabel = card.querySelector<HTMLElement>('[data-role="toggle-label"]');
  const panel = card.querySelector<HTMLElement>(".nextday-card__panel");
  const state = card.querySelector<HTMLElement>('[data-role="state"]');
  const body = card.querySelector<HTMLElement>('[data-role="body"]');
  const claimButton = card.querySelector<HTMLButtonElement>('[data-action="claim"]');
  const presetButton = card.querySelector<HTMLButtonElement>('[data-action="preset"]');
  const webButton = card.querySelector<HTMLButtonElement>('[data-action="web"]');
  const client = createClient();

  async function loadStatus() {
    const token = getToken();
    if (!token) {
      updateState("未登录开发账号，可打开 Web 后游客登录");
      if (summaryLine) {
        summaryLine.textContent = `${options.nickname} · 待登录`;
      }
      return;
    }

    try {
      const response = await createClient(token).pluginStatusCard();
      ensureOk(response);
      renderStatus(response.data, summaryLine, state);
    } catch (error) {
      updateState(error instanceof Error ? error.message : "状态读取失败");
    }
  }

  async function loadPanel() {
    const token = getToken();
    if (!token) {
      updateState("未登录开发账号，可打开 Web 后游客登录");
      return;
    }

    try {
      const response = await createClient(token).pluginExpandedPanel();
      ensureOk(response);
      renderPanel(response.data, body, state);
    } catch (error) {
      updateState(error instanceof Error ? error.message : "展开面板读取失败");
    }
  }

  function updateState(text: string) {
    if (state) {
      state.textContent = text;
    }
  }

  summary?.addEventListener("click", () => {
    if (!panel) {
      return;
    }

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    summary.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (toggleLabel) {
      toggleLabel.textContent = willOpen ? "收起" : "展开";
    }
    if (willOpen) {
      void loadPanel();
    }
  });

  claimButton?.addEventListener("click", async () => {
    const token = getToken();
    if (!token) {
      updateState("请先打开 Web 登录");
      return;
    }
    claimButton.disabled = true;
    try {
      const response = await createClient(token).pluginQuickClaim(
        { include_tasks: true },
        createIdempotencyKey("fishpi_quick"),
      );
      ensureOk(response);
      updateState(
        `已领取 ${response.data.items.filter((item) => item.status === "claimed").length} 项`,
      );
      renderStatus(response.data.status, summaryLine, null);
      await loadPanel();
    } catch (error) {
      updateState(error instanceof Error ? error.message : "一键领取失败");
    } finally {
      claimButton.disabled = false;
    }
  });

  presetButton?.addEventListener("click", async () => {
    const token = getToken();
    if (!token) {
      updateState("请先打开 Web 登录");
      return;
    }
    presetButton.disabled = true;
    try {
      const response = await createClient(token).pluginSubmitPreset(
        { preset_id: "explore_ji_once" },
        createIdempotencyKey("fishpi_preset"),
      );
      ensureOk(response);
      updateState(`${response.data.label}已提交`);
      renderStatus(response.data.status, summaryLine, null);
      await loadPanel();
    } catch (error) {
      updateState(error instanceof Error ? error.message : "预设提交失败");
    } finally {
      presetButton.disabled = false;
    }
  });

  webButton?.addEventListener("click", options.openWeb);
  container.appendChild(card);
  void client.pluginNavigationLinks().catch(() => undefined);
  void loadStatus();
}

function renderStatus(
  status: PluginStatusCardResponse,
  summaryLine: HTMLElement | null,
  state: HTMLElement | null,
) {
  if (summaryLine) {
    summaryLine.textContent = `${status.player.name} · ${status.realm_text} · 行动令 ${status.action_state.action_points}/${status.action_state.action_point_cap}`;
  }
  if (state) {
    state.textContent = status.reminders.length ? status.reminders.join("，") : "今日状态平稳";
  }
}

function renderPanel(
  panel: PluginExpandedPanelResponse,
  body: HTMLElement | null,
  state: HTMLElement | null,
) {
  if (!body) {
    return;
  }

  if (state) {
    state.textContent = panel.status.reminders.length
      ? panel.status.reminders.join("，")
      : "暂无紧急提醒";
  }

  body.innerHTML = `
    <dl>
      <div><dt>离线收益</dt><dd>${panel.status.offline_minutes} 分钟</dd></div>
      <div><dt>行动令</dt><dd>${panel.status.action_state.action_points} / ${
        panel.status.action_state.action_point_cap
      }</dd></div>
      <div><dt>古宝赠抽</dt><dd>${panel.ancient_treasure.available_draws}</dd></div>
      <div><dt>内天地</dt><dd>${
        panel.inner_world?.unlocked
          ? `${panel.inner_world.claimable_assignment_count} 个可收`
          : "未开启"
      }</dd></div>
    </dl>
    <section>
      <strong>日课</strong>
      ${panel.tasks
        .slice(0, 3)
        .map((task) => `<p>${escapeHtml(task.title)} · ${task.progress_text}</p>`)
        .join("")}
    </section>
    <section>
      <strong>九塔</strong>
      <p>${escapeHtml(panel.towers[0]?.tower_name ?? "未读取")} · 镇封 ${
        panel.towers[0]?.seal_progress ?? 0
      }</p>
    </section>
    <section>
      <strong>内天地</strong>
      <p>${
        panel.inner_world?.unlocked
          ? `等级 ${panel.inner_world.world_level} · 派驻 ${panel.inner_world.active_assignment_count}/${panel.inner_world.assignment_limit}`
          : escapeHtml(panel.inner_world?.unlock_hint ?? "化神 / 神躯或第四章后开启")
      }</p>
    </section>
    <section>
      <strong>战报</strong>
      <p>${escapeHtml(panel.recent_battles[0]?.enemy_name ?? "暂无战报")}</p>
    </section>
    <section>
      <strong>宗门</strong>
      <p>${escapeHtml(panel.sect?.name ?? "未入宗门")}</p>
    </section>
  `;
}

function createClient(token?: string): GameClient {
  return new GameClient({
    baseUrl: apiBaseUrl,
    token,
    clientVersion: "nextday-fishpi-plugin-m7",
  });
}

function getToken(): string | null {
  return window.localStorage.getItem(tokenStorageKey);
}

function ensureOk<TData>(response: ApiResponse<TData>) {
  if (response.code !== 0) {
    throw new Error(response.message);
  }
}

function createIdempotencyKey(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now()}_${id}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function injectStyles(documentRef: Document) {
  if (documentRef.getElementById("nextday-fishpi-plugin-style")) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = "nextday-fishpi-plugin-style";
  style.textContent = `
    #nextday-fishpi-plugin-root {
      bottom: 16px;
      font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      position: fixed;
      right: 16px;
      width: 280px;
      z-index: 9999;
    }

    .nextday-card {
      background: #ffffff;
      border: 1px solid #d9e5e1;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(14, 34, 35, 0.14);
      color: #172425;
      overflow: hidden;
    }

    .nextday-card__summary {
      align-items: center;
      background: #f6faf8;
      border: 0;
      color: inherit;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      min-height: 58px;
      padding: 12px;
      text-align: left;
      width: 100%;
    }

    .nextday-card__summary strong,
    .nextday-card__summary small {
      display: block;
    }

    .nextday-card__summary small {
      color: #5d6f70;
      line-height: 1.4;
      margin-top: 4px;
    }

    .nextday-card__summary em {
      color: #2f6f73;
      font-style: normal;
      font-size: 12px;
      margin-left: 10px;
      white-space: nowrap;
    }

    .nextday-card__panel {
      display: grid;
      gap: 10px;
      padding: 12px;
    }

    .nextday-card__state {
      background: #eef5f2;
      border-radius: 6px;
      color: #244a4d;
      font-size: 12px;
      line-height: 1.5;
      padding: 8px;
    }

    .nextday-card__body {
      display: grid;
      gap: 10px;
    }

    .nextday-card__body dl {
      display: grid;
      gap: 8px;
      margin: 0;
    }

    .nextday-card__body dl div {
      display: flex;
      justify-content: space-between;
    }

    .nextday-card__body dt {
      color: #5d6f70;
    }

    .nextday-card__body dd {
      margin: 0;
    }

    .nextday-card__body section {
      border-top: 1px solid #e2ebe7;
      display: grid;
      gap: 4px;
      padding-top: 8px;
    }

    .nextday-card__body p {
      color: #5d6f70;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
    }

    .nextday-card__actions {
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
    }

    .nextday-card__actions button {
      background: #14383b;
      border: 0;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      min-height: 36px;
    }

    .nextday-card__actions button:last-child {
      grid-column: 1 / -1;
    }

    @media (max-width: 720px) {
      #nextday-fishpi-plugin-root {
        bottom: 12px;
        left: 12px;
        right: 12px;
        width: auto;
      }
    }
  `;
  documentRef.head.appendChild(style);
}
