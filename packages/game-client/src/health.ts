import type { HealthStatus } from "@nextday/shared";
import { GameClient } from "./index";

export async function fetchApiHealth(): Promise<HealthStatus> {
  const apiBaseUrl =
    process.env.API_INTERNAL_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:3001";
  const client = new GameClient({ baseUrl: apiBaseUrl, clientVersion: "next-health-proxy" });
  const response = await client.get<HealthStatus>("/health");

  if (response.code !== 0 || response.data.status !== "ok") {
    throw new Error(response.message || "API 健康检查失败");
  }

  return response.data;
}
