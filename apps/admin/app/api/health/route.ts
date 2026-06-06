import { fetchApiHealth } from "@nextday/game-client/health";

export async function GET() {
  try {
    const health = await fetchApiHealth();
    return Response.json(health);
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "API 健康检查失败",
        status: "error",
      },
      { status: 503 },
    );
  }
}
