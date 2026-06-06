import { describe, expect, it } from "vitest";
import { GameClient } from "./index";

describe("game-client HTTP 客户端", () => {
  it("发送 GET 请求并解析统一响应", async () => {
    const client = new GameClient({
      baseUrl: "https://example.test/",
      fetchImpl: async (input, init) =>
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            server_time: 1,
            data: { input: String(input), method: init?.method },
            trace_id: "req_test",
          }),
        ),
    });

    const response = await client.get<{ input: string; method: string }>("/health");
    expect(response.data.input).toBe("https://example.test/health");
    expect(response.data.method).toBe("GET");
  });

  it("为 POST 请求携带幂等键", async () => {
    let idempotencyKey = "";
    const client = new GameClient({
      baseUrl: "https://example.test",
      fetchImpl: async (_input, init) => {
        idempotencyKey = new Headers(init?.headers).get("Idempotency-Key") ?? "";
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            server_time: 1,
            data: {},
            trace_id: "req_test",
          }),
        );
      },
    });

    await client.post("/action", {}, { idempotencyKey: "idem_test" });
    expect(idempotencyKey).toBe("idem_test");
  });
});
