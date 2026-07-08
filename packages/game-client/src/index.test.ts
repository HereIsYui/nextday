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

  it("读取九州地图时按州域拼接查询参数", async () => {
    let requestedUrl = "";
    const client = new GameClient({
      baseUrl: "https://example.test",
      fetchImpl: async (input) => {
        requestedUrl = String(input);
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

    await client.worldMap("ji");
    expect(requestedUrl).toBe("https://example.test/api/world/map?province_id=ji");
  });

  it("九州城池写操作携带幂等键", async () => {
    const calls: Array<{ body: unknown; idempotencyKey: string; url: string }> = [];
    const client = new GameClient({
      baseUrl: "https://example.test",
      fetchImpl: async (input, init) => {
        calls.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
          idempotencyKey: new Headers(init?.headers).get("Idempotency-Key") ?? "",
          url: String(input),
        });
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

    await client.settleMainCity({ city_name: "北境仙城", province_id: "ji" }, "idem_settle");
    await client.startWorldMarch(
      { march_type: "clear_wild", target_tile_id: "ji_wild_road" },
      "idem_march",
    );
    await client.occupyWorld({ march_id: "march_1" }, "idem_occupy");

    expect(calls).toEqual([
      {
        body: { city_name: "北境仙城", province_id: "ji" },
        idempotencyKey: "idem_settle",
        url: "https://example.test/api/city/settle",
      },
      {
        body: { march_type: "clear_wild", target_tile_id: "ji_wild_road" },
        idempotencyKey: "idem_march",
        url: "https://example.test/api/world/march",
      },
      {
        body: { march_id: "march_1" },
        idempotencyKey: "idem_occupy",
        url: "https://example.test/api/world/occupy",
      },
    ]);
  });
});
