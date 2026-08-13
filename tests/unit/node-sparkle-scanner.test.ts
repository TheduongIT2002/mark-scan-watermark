import { NodeSparkleScanner } from "@/lib/detector/node-sparkle-scanner";
import type { SparkleDetectorConfig } from "@/lib/detector/types";
import { describe, expect, it } from "vitest";

describe("NodeSparkleScanner", () => {
  const dummyConfig: SparkleDetectorConfig = {
    schemaVersion: 1,
    detectorVersion: "fixed-sparkle-v1",
    configVersion: "1.0.0",
    datasetId: "dummy",
    datasetHash: { algorithm: "SHA-256", hex: "0".repeat(64) },
    canonicalLogo: { path: "canonical/logo.png", sha256: "0".repeat(64), width: 96, height: 96 },
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
    configHash: { algorithm: "SHA-256", hex: "0".repeat(64) },
  };

  it("handles abort signal cancellation cleanly", async () => {
    const scanner = new NodeSparkleScanner(dummyConfig);

    const controller = new AbortController();
    controller.abort();

    const input = {
      itemId: "item1",
      file: new File([new Uint8Array(10)], "item1.png"),
      sourceHash: { algorithm: "SHA-256" as const, hex: "0".repeat(64) },
      width: 100,
      height: 100,
    };

    await expect(scanner.scan(input, controller.signal)).rejects.toThrow("Cancelled by user.");
  });
});
