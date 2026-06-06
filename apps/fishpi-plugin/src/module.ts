import { mountPluginCard } from "./mount";

export interface FishPiHost {
  user?: {
    userName?: string;
    userNickname?: string;
  };
}

export function activate(hostWindow: Window, hostDocument: Document, fishpi?: unknown) {
  const containerId = "nextday-fishpi-plugin-root";
  const oldContainer = hostDocument.getElementById(containerId);
  oldContainer?.remove();

  const container = hostDocument.createElement("section");
  container.id = containerId;
  container.setAttribute("aria-label", "择日飞升插件");
  hostDocument.body.appendChild(container);

  const host = isFishPiHost(fishpi) ? fishpi : undefined;
  mountPluginCard(container, {
    nickname: host?.user?.userNickname ?? host?.user?.userName ?? "道友",
    openWeb: () => hostWindow.open("http://localhost:3000", "_blank", "noopener,noreferrer"),
  });
}

function isFishPiHost(value: unknown): value is FishPiHost {
  return typeof value === "object" && value !== null;
}
