import { mvpProvinceLabels } from "@nextday/game-rules";

export interface PluginCardOptions {
  nickname: string;
  openWeb: () => void;
}

export function mountPluginCard(container: HTMLElement, options: PluginCardOptions) {
  container.innerHTML = "";
  injectStyles(container.ownerDocument);

  const card = document.createElement("div");
  card.className = "nextday-card";
  card.innerHTML = `
    <button class="nextday-card__summary" type="button">
      <span>
        <strong>择日飞升</strong>
        <small>${options.nickname} · 练气一层</small>
      </span>
      <em>展开</em>
    </button>
    <div class="nextday-card__panel" hidden>
      <dl>
        <div><dt>离线收益</dt><dd>待领取</dd></div>
        <div><dt>行动令</dt><dd>20 / 20</dd></div>
        <div><dt>今日提醒</dt><dd>月卡赠抽占位</dd></div>
      </dl>
      <p>四州占位：${Object.values(mvpProvinceLabels).join("、")}</p>
      <div class="nextday-card__actions">
        <button type="button" data-action="claim">一键领取</button>
        <button type="button" data-action="web">打开 Web</button>
      </div>
    </div>
  `;

  const summary = card.querySelector<HTMLButtonElement>(".nextday-card__summary");
  const panel = card.querySelector<HTMLElement>(".nextday-card__panel");
  const webButton = card.querySelector<HTMLButtonElement>('[data-action="web"]');

  summary?.addEventListener("click", () => {
    if (panel) {
      panel.hidden = !panel.hidden;
    }
  });

  webButton?.addEventListener("click", options.openWeb);
  container.appendChild(card);
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
      width: 260px;
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
      margin-top: 4px;
    }

    .nextday-card__summary em {
      color: #2f6f73;
      font-style: normal;
      font-size: 12px;
    }

    .nextday-card__panel {
      padding: 12px;
    }

    .nextday-card__panel dl {
      display: grid;
      gap: 8px;
      margin: 0 0 10px;
    }

    .nextday-card__panel dl div {
      display: flex;
      justify-content: space-between;
    }

    .nextday-card__panel dt {
      color: #5d6f70;
    }

    .nextday-card__panel dd {
      margin: 0;
    }

    .nextday-card__panel p {
      color: #5d6f70;
      font-size: 12px;
      line-height: 1.5;
      margin: 0 0 10px;
    }

    .nextday-card__actions {
      display: flex;
      gap: 8px;
    }

    .nextday-card__actions button {
      background: #14383b;
      border: 0;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      flex: 1;
      min-height: 32px;
    }
  `;
  documentRef.head.appendChild(style);
}
