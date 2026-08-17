import { describe, expect, it } from "vitest";
import { createHealthHandler } from "../src/runtime/health";
import { env, loadConfig } from "../src/runtime/config";

describe("createHealthHandler", () => {
  it("reports ok and the version with no checks", async () => {
    const res = await createHealthHandler({ version: "1.2.3" })();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "ok", version: "1.2.3" });
  });

  it("must not be cached", async () => {
    const res = await createHealthHandler({ version: "1.2.3" })();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 when a check fails", async () => {
    const res = await createHealthHandler({
      checks: [{ name: "db", check: () => false }],
    })();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks).toEqual([{ name: "db", ok: false }]);
  });

  it("treats a thrown check as a failure rather than crashing the endpoint", async () => {
    const res = await createHealthHandler({
      checks: [
        {
          name: "db",
          check: () => {
            throw new Error("connection refused");
          },
        },
      ],
    })();
    expect(res.status).toBe(503);
  });

  // An unbounded check turns a slow dependency into a liveness failure, and
  // kubelet then restarts a pod that was only waiting.
  it("times out a hanging check instead of hanging itself", async () => {
    const res = await createHealthHandler({
      timeoutMs: 20,
      checks: [{ name: "slow", check: () => new Promise<boolean>(() => {}) }],
    })();
    expect(res.status).toBe(503);
  });

  it("stays ok when every check passes", async () => {
    const res = await createHealthHandler({
      checks: [
        { name: "db", check: async () => true },
        { name: "cache", check: () => undefined },
      ],
    })();
    expect(res.status).toBe(200);
  });
});

describe("loadConfig", () => {
  it("parses each type", () => {
    const config = loadConfig(
      {
        NAME: env.string(),
        PORT: env.number(),
        DEBUG: env.boolean(),
        STAGE: env.enum(["dev", "prod"] as const),
      },
      { NAME: "app", PORT: "8080", DEBUG: "true", STAGE: "prod" },
    );
    expect(config).toEqual({ NAME: "app", PORT: 8080, DEBUG: true, STAGE: "prod" });
  });

  it("applies defaults for absent values", () => {
    const config = loadConfig({ PORT: env.withDefault(env.number(), 8080) }, {});
    expect(config.PORT).toBe(8080);
  });

  // One restart per missing variable is a miserable way to fix a deploy.
  it("reports every problem at once", () => {
    expect(() =>
      loadConfig({ A: env.string(), B: env.number(), C: env.string() }, { B: "abc" }),
    ).toThrow(/A is required[\s\S]*B must be a number[\s\S]*C is required/);
  });

  it("treats an empty string as absent", () => {
    expect(() => loadConfig({ A: env.string() }, { A: "" })).toThrow(/A is required/);
  });

  it("rejects a value outside an enum", () => {
    expect(() =>
      loadConfig({ STAGE: env.enum(["dev", "prod"] as const) }, { STAGE: "staging" }),
    ).toThrow(/must be one of dev, prod/);
  });
});
