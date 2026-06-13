import { describe, expect, test } from "bun:test";
import { configSchema, initWorkflow, onCronTrigger } from "./workflow";

// Verifies the workflow loads under the real @chainlink/cre-sdk + Bun and wires the cron trigger.
// (The handler's on-chain dispatch is exercised end-to-end by `cre workflow simulate`; its pure
// inputs — resolve compute + report encoders — are unit-tested in ../../test/.)

const cfg = {
  schedule: "0 */1 * * * *",
  mode: "replay" as const,
  poolAssets: ["NVDA", "AAPL"],
  evms: [
    {
      chainSelectorName: "ethereum-testnet-sepolia-base-1",
      oracle: "0x0000000000000000000000000000000000000001",
      governance: "0x0000000000000000000000000000000000000002",
      executor: "0x0000000000000000000000000000000000000003",
      gasLimit: "3000000",
    },
  ],
};

describe("config", () => {
  test("accepts the staging shape and defaults mode to replay", () => {
    const parsed = configSchema.parse({ schedule: cfg.schedule, evms: cfg.evms });
    expect(parsed.mode).toBe("replay");
    expect(parsed.poolAssets).toEqual([]);
  });

  test("rejects an unknown mode", () => {
    expect(() => configSchema.parse({ schedule: cfg.schedule, mode: "bogus", evms: cfg.evms })).toThrow();
  });
});

describe("initWorkflow", () => {
  test("registers a single cron-triggered handler bound to onCronTrigger", () => {
    const handlers = initWorkflow(configSchema.parse(cfg));
    expect(handlers).toHaveLength(1);
    expect(handlers[0].fn).toBe(onCronTrigger);
    const trigger = handlers[0].trigger as { config?: { schedule?: string } };
    expect(trigger.config?.schedule).toBe(cfg.schedule);
  });
});
