import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { computeConfigHash, loadAndValidateConfig } from "@/lib/detector/config-loader";
import type { SparkleDetectorConfig } from "@/lib/detector/types";
import { describe, expect, it } from "vitest";

describe("detector config loader", () => {
  const validConfig: Omit<SparkleDetectorConfig, "configHash"> = {
    schemaVersion: 1,
    detectorVersion: "fixed-sparkle-v1",
    configVersion: "1.0.0",
    datasetId: "test-dataset",
    datasetHash: { algorithm: "SHA-256", hex: "a".repeat(64) },
    canonicalLogo: { path: "canonical/logo.png", sha256: "b".repeat(64), width: 96, height: 96 },
    templateSubregion: { x: 14, y: 14, width: 52, height: 52 },
    templateHighPass: new Array(2704).fill(0),
    referenceDimensions: { width: 1376, height: 768 },
    searchAnchor: { x: 1254, y: 646, width: 52, height: 52 },
    searchAnchorNormalized: { x: 0.911337, y: 0.841146, width: 0.037791, height: 0.067708 },
    searchRadius: { dx: 10, dy: 10 },
    searchRadiusNormalized: { dx: 0.007267, dy: 0.013021 },
    algorithm: { name: "local-highpass-zncc", version: "1.0.0" },
    threshold: 0.16,
    gates: {
      minPrecision: 0.98,
      minRecall: 0.95,
      maxFalsePositiveRate: 0.02,
      maxLatencyP95Ms: 250,
      minBoxIoU: 0.85,
    },
  };

  it("computes deterministic config hash", () => {
    const hash1 = computeConfigHash(validConfig);
    const hash2 = computeConfigHash(validConfig);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("fails closed on missing config file", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "cfg-test-"));
    const result = loadAndValidateConfig(path.join(parent, "nonexistent.json"), parent);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("missing");
  });

  it("fails closed on config hash mismatch", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "cfg-test-"));
    const fullConfig: SparkleDetectorConfig = {
      ...validConfig,
      configHash: { algorithm: "SHA-256", hex: "c".repeat(64) },
    };
    const cfgPath = path.join(parent, "sparkle-detector.config.json");
    await writeFile(cfgPath, JSON.stringify(fullConfig));

    const result = loadAndValidateConfig(cfgPath, parent);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("Config SHA-256 mismatch"))).toBe(true);
  });
});
