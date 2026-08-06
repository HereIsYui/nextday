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

  it("读取文字指令帮助并为命令提交携带幂等键", async () => {
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

    await client.commandHelp();
    await client.executeCommand({ command: "修炼" }, "idem_command");

    expect(calls).toEqual([
      {
        body: null,
        idempotencyKey: "",
        url: "https://example.test/api/game/command-help",
      },
      {
        body: { command: "修炼" },
        idempotencyKey: "idem_command",
        url: "https://example.test/api/game/commands",
      },
    ]);
  });

  it("读取境界总览", async () => {
    let url = "";
    const client = new GameClient({
      baseUrl: "https://example.test",
      fetchImpl: async (input) => {
        url = String(input);
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

    await client.realmProgression();

    expect(url).toBe("https://example.test/api/game/realm-progression");
  });

  it("调用材料、单方与复用接口时保留规范参数和幂等键", async () => {
    const calls: Array<{ idempotencyKey: string; url: string }> = [];
    const client = new GameClient({
      baseUrl: "https://example.test",
      fetchImpl: async (input, init) => {
        calls.push({
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

    await client.productionMaterials("alchemy");
    await client.productionFormulas({
      kind: "forge",
      keyword: "雷符",
      scope: "public",
    });
    await client.alchemyCraft(
      {
        materials: [
          { item_id: "alch_moon_dew_herb", count: 2 },
          { item_id: "alch_spirit_resin", count: 1 },
        ],
      },
      "idem_alchemy",
    );
    await client.forgeCraft(
      {
        materials: [
          { item_id: "forge_star_iron", count: 3 },
          { item_id: "forge_spiritwood_core", count: 1 },
        ],
      },
      "idem_forge",
    );
    await client.saveProductionFormula(
      {
        kind: "alchemy",
        name: "月露初试",
        source_record_id: "alchemy_1",
      },
      "idem_save",
    );
    await client.publishProductionFormula("formula/1", "idem_publish");
    await client.unpublishProductionFormula("formula/1", "idem_unpublish");
    await client.reuseProductionFormula("formula/1", "idem_reuse");

    expect(calls).toEqual([
      {
        idempotencyKey: "",
        url: "https://example.test/api/production/materials?kind=alchemy",
      },
      {
        idempotencyKey: "",
        url: "https://example.test/api/production/formulas?kind=forge&scope=public&keyword=%E9%9B%B7%E7%AC%A6",
      },
      {
        idempotencyKey: "idem_alchemy",
        url: "https://example.test/api/production/alchemy/craft",
      },
      {
        idempotencyKey: "idem_forge",
        url: "https://example.test/api/production/forge/craft",
      },
      {
        idempotencyKey: "idem_save",
        url: "https://example.test/api/production/formulas",
      },
      {
        idempotencyKey: "idem_publish",
        url: "https://example.test/api/production/formulas/formula%2F1/publish",
      },
      {
        idempotencyKey: "idem_unpublish",
        url: "https://example.test/api/production/formulas/formula%2F1/unpublish",
      },
      {
        idempotencyKey: "idem_reuse",
        url: "https://example.test/api/production/formulas/formula%2F1/craft",
      },
    ]);
  });

  it("不再暴露城池与世界战略客户端方法", () => {
    const methods = Object.getOwnPropertyNames(GameClient.prototype);
    expect(methods).not.toEqual(
      expect.arrayContaining([
        "worldMap",
        "worldAtlas",
        "cityOverview",
        "cityManagement",
        "worldMarches",
        "startWorldMarch",
        "resolveWorldSiege",
        "sectRallies",
        "provinceWar",
        "worldRankings",
        "resourcePoints",
        "pvpAttack",
      ]),
    );
  });
});
