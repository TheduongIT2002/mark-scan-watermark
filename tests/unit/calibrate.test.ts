import path from "node:path";
import { validateDataset } from "@/lib/dataset/validate";
import { calibrateDetector, writeCalibratedConfig } from "@/lib/detector/calibrate";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("detector calibration & split isolation", () => {
  it("proves zero test split items are accessed or read during calibration", async () => {
    const fixtureRoot = path.resolve("tests/fixtures/dataset/valid");
    const validation = await validateDataset(fixtureRoot);
    expect(validation.status).toBe("VALID");

    const accessedItems: string[] = [];

    const dummyPng = await sharp({
      create: { width: 52, height: 52, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const result = await calibrateDetector(validation, {
      assetReader: async (ctx, item) => {
        if (item.split === "test") {
          throw new Error(`TEST ITEM READ VIOLATION: ${item.id}`);
        }
        accessedItems.push(item.id);
        return dummyPng;
      },
    });

    expect(result.testItemsReadCount).toBe(0);
    expect(accessedItems.every((id) => !id.includes("test"))).toBe(true);
    expect(result.accessedItemIds.length).toBeGreaterThan(0);
  });

  it("refuses to write config when quality gates are not met", async () => {
    const fixtureRoot = path.resolve("tests/fixtures/dataset/valid");
    const validation = await validateDataset(fixtureRoot);

    const result = await calibrateDetector(validation, {
      gates: {
        minPrecision: 1.0,
        minRecall: 1.0,
        maxFalsePositiveRate: 0,
        maxLatencyP95Ms: 0.001, // Unachievable latency gate to force GATES_NOT_MET
        minBoxIoU: 1.0,
      },
    });

    expect(result.status).toBe("GATES_NOT_MET");
    const writeResult = writeCalibratedConfig(fixtureRoot, result);
    expect(writeResult.code).toBe("GATES_NOT_MET");
  });
});
