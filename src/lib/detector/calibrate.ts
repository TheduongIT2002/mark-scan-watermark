import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DatasetBox, DatasetHash, DatasetItem, DatasetValidationResult } from "@/lib/dataset/types";
import { readValidatedImage } from "@/lib/dataset/validate";
import sharp from "sharp";
import { computeConfigHash } from "./config-loader";
import { detectSparkleCandidate, extractSubregion, localHighPass } from "./sparkle-core";
import type { ConfigQualityGates, SparkleDetectorConfig } from "./types";

export interface CalibrationOptions {
  gates?: ConfigQualityGates;
  thresholdStep?: number;
  assetReader?: (
    context: { root: string; manifestHash: DatasetHash },
    item: DatasetItem
  ) => Promise<Buffer>;
}

export interface CalibrationRow {
  id: string;
  split: "train" | "validation";
  label: "positive" | "negative" | "difficult-negative";
  score: number;
  predictedBox: DatasetBox;
  truthBox?: DatasetBox;
  latencyMs: number;
}

export interface CalibrationThresholdCandidate {
  threshold: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  difficultNegativeFpCount: number;
  meanBoxIoU: number | null;
  latencyP50Ms: number;
  latencyP95Ms: number;
  gatesMet: boolean;
}

export interface CalibrationResult {
  status: "CALIBRATED" | "GATES_NOT_MET";
  datasetId: string;
  datasetHash: DatasetHash;
  selectedThreshold: number;
  validationMetrics: CalibrationThresholdCandidate;
  configCandidate: SparkleDetectorConfig;
  scannedItemsCount: { train: number; validation: number };
  testItemsReadCount: 0;
  accessedItemIds: string[];
  issues: string[];
}

function computeIoU(boxA: DatasetBox, boxB: DatasetBox): number {
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const interWidth = Math.max(0, x2 - x1);
  const interHeight = Math.max(0, y2 - y1);
  const interArea = interWidth * interHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

function computePercentile(numbers: number[], p: number): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export const DEFAULT_QUALITY_GATES: ConfigQualityGates = {
  minPrecision: 0.98,
  minRecall: 0.95,
  maxFalsePositiveRate: 0.02,
  maxLatencyP95Ms: 250,
  minBoxIoU: 0.85,
};

export async function calibrateDetector(
  validation: DatasetValidationResult,
  options: CalibrationOptions = {}
): Promise<CalibrationResult> {
  const gates = options.gates ?? DEFAULT_QUALITY_GATES;
  const issues: string[] = [];

  if (validation.status !== "VALID" || !validation.context || !validation.manifest || !validation.datasetHash) {
    throw new Error("Cannot calibrate on invalid dataset validation result.");
  }

  const manifest = validation.manifest;
  const context = validation.context;
  const reader = options.assetReader ?? ((ctx, item) =>
    readValidatedImage(ctx, item.imagePath, item.sha256, item.width, item.height)
  );

  const accessedItemIds: string[] = [];

  // Enforce zero test split access
  const safeReader = async (item: DatasetItem): Promise<Buffer> => {
    if (item.split === "test") {
      throw new Error(`SPLIT ISOLATION VIOLATION: Calibration attempted to access test item ${item.id}`);
    }
    accessedItemIds.push(item.id);
    return reader(context, item);
  };

  const trainItems = manifest.items.filter((item) => item.split === "train");
  const valItems = manifest.items.filter((item) => item.split === "validation");
  const testItems = manifest.items.filter((item) => item.split === "test");

  if (testItems.length > 0 && false) {
    // static check
  }

  // Derive train-set reference high-pass template vector from train positives ONLY
  const trainPositives = trainItems.filter((i) => i.label === "positive" && i.boundingBox);
  const sumTpl = new Float32Array(52 * 52);

  for (const item of trainPositives) {
    const bytes = await safeReader(item);
    const meta = await sharp(bytes).metadata();
    const raw = await sharp(bytes).greyscale().raw().toBuffer();
    const pixels = new Float32Array(raw);

    const w = meta.width ?? item.width;
    const h = meta.height ?? item.height;
    const box = item.boundingBox!;

    const hp = localHighPass(pixels, w, h, 5);
    const patch = extractSubregion(hp, w, box.x, box.y, box.width, box.height);

    let patchSq = 0;
    for (const v of patch) patchSq += v * v;
    const norm = Math.sqrt(patchSq) || 1;

    for (let i = 0; i < 52 * 52; i++) {
      sumTpl[i] += patch[i] / norm;
    }
  }

  let tplSq = 0;
  for (const v of sumTpl) tplSq += v * v;
  const tplNorm = Math.sqrt(tplSq) || 1;
  for (let i = 0; i < 52 * 52; i++) {
    sumTpl[i] /= tplNorm;
  }

  const subregion = { x: 14, y: 14, width: 52, height: 52 };
  const searchAnchor = { x: 1254, y: 646, width: 52, height: 52 };
  const searchRadius = { dx: 10, dy: 10 };

  const refWidth = 1376;
  const refHeight = 768;

  const searchAnchorNormalized = {
    x: Math.round((searchAnchor.x / refWidth) * 1e6) / 1e6,
    y: Math.round((searchAnchor.y / refHeight) * 1e6) / 1e6,
    width: Math.round((searchAnchor.width / refWidth) * 1e6) / 1e6,
    height: Math.round((searchAnchor.height / refHeight) * 1e6) / 1e6,
  };

  const searchRadiusNormalized = {
    dx: Math.round((searchRadius.dx / refWidth) * 1e6) / 1e6,
    dy: Math.round((searchRadius.dy / refHeight) * 1e6) / 1e6,
  };

  const rows: CalibrationRow[] = [];
  let trainCount = 0;
  let validationCount = 0;

  for (const item of valItems) {
    validationCount++;
    const startTime = performance.now();

    const bytes = await safeReader(item);
    const meta = await sharp(bytes).metadata();
    const raw = await sharp(bytes).greyscale().raw().toBuffer();
    const imgPixels = new Float32Array(raw);

    const candidate = detectSparkleCandidate({
      imgPixels,
      imgWidth: meta.width ?? item.width,
      imgHeight: meta.height ?? item.height,
      tplPixels: sumTpl,
      tplWidth: 52,
      tplHeight: 52,
      subregion: { x: 0, y: 0, width: 52, height: 52 },
      anchor: searchAnchor,
      searchRadius,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    rows.push({
      id: item.id,
      split: item.split as "train" | "validation",
      label: item.label,
      score: candidate.score,
      predictedBox: candidate.boundingBox,
      truthBox: item.boundingBox,
      latencyMs,
    });
  }

  trainCount = trainItems.length;

  const valRows = rows.filter((r) => r.split === "validation");
  const candidates: CalibrationThresholdCandidate[] = [];
  const allLatencies = valRows.map((r) => r.latencyMs);
  const latencyP50Ms = computePercentile(allLatencies, 50);
  const latencyP95Ms = computePercentile(allLatencies, 95);

  const step = options.thresholdStep ?? 0.005;
  for (let t = 0.05; t <= 0.95; t += step) {
    const threshold = Math.round(t * 1000) / 1000;
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    let diffNegFp = 0;
    const iouValues: number[] = [];

    for (const r of valRows) {
      const predicted = r.score >= threshold;
      if (r.label === "positive") {
        if (predicted) {
          tp++;
          if (r.truthBox) {
            iouValues.push(computeIoU(r.predictedBox, r.truthBox));
          }
        } else {
          fn++;
        }
      } else {
        if (predicted) {
          fp++;
          if (r.label === "difficult-negative") {
            diffNegFp++;
          }
        } else {
          tn++;
        }
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0.0;
    const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0.0;
    const meanBoxIoU = iouValues.length > 0 ? iouValues.reduce((a, b) => a + b, 0) / iouValues.length : null;

    const gatesMet =
      precision >= gates.minPrecision &&
      recall >= gates.minRecall &&
      falsePositiveRate <= gates.maxFalsePositiveRate &&
      diffNegFp === 0 &&
      (meanBoxIoU === null || meanBoxIoU >= gates.minBoxIoU) &&
      latencyP95Ms <= gates.maxLatencyP95Ms;

    candidates.push({
      threshold,
      precision,
      recall,
      falsePositiveRate,
      difficultNegativeFpCount: diffNegFp,
      meanBoxIoU,
      latencyP50Ms,
      latencyP95Ms,
      gatesMet,
    });
  }

  const validCandidates = candidates.filter((c) => c.gatesMet);

  let bestCandidate: CalibrationThresholdCandidate;
  if (validCandidates.length > 0) {
    validCandidates.sort((a, b) => {
      if (b.recall !== a.recall) return b.recall - a.recall;
      if (b.precision !== a.precision) return b.precision - a.precision;
      return b.threshold - a.threshold;
    });
    bestCandidate = validCandidates[0];
  } else {
    candidates.sort((a, b) => b.recall - a.recall || b.precision - a.precision || b.threshold - a.threshold);
    bestCandidate = candidates[0];
  }

  const status = bestCandidate.gatesMet ? "CALIBRATED" : "GATES_NOT_MET";
  if (!bestCandidate.gatesMet) {
    issues.push(
      `Calibration quality gates not met. Best threshold ${bestCandidate.threshold} yielded precision ${bestCandidate.precision.toFixed(4)}, recall ${bestCandidate.recall.toFixed(4)}, FPR ${bestCandidate.falsePositiveRate.toFixed(4)}.`
    );
  }

  // Convert sumTpl to rounded array for json config
  const templateHighPass = Array.from(sumTpl).map((v) => Math.round(v * 1e6) / 1e6);

  const partialConfig: Omit<SparkleDetectorConfig, "configHash"> = {
    schemaVersion: 1,
    detectorVersion: "fixed-sparkle-v1",
    configVersion: "1.0.0",
    datasetId: manifest.datasetId,
    datasetHash: validation.datasetHash,
    canonicalLogo: {
      path: manifest.canonicalLogo.path,
      sha256: manifest.canonicalLogo.sha256.hex,
      width: manifest.canonicalLogo.width,
      height: manifest.canonicalLogo.height,
    },
    templateSubregion: subregion,
    templateHighPass,
    referenceDimensions: { width: refWidth, height: refHeight },
    searchAnchor,
    searchAnchorNormalized,
    searchRadius,
    searchRadiusNormalized,
    algorithm: {
      name: "local-highpass-zncc",
      version: "1.0.0",
    },
    threshold: bestCandidate.threshold,
    gates,
  };

  const hex = computeConfigHash(partialConfig);
  const configCandidate: SparkleDetectorConfig = {
    ...partialConfig,
    configHash: {
      algorithm: "SHA-256",
      hex,
    },
  };

  return {
    status,
    datasetId: manifest.datasetId,
    datasetHash: validation.datasetHash,
    selectedThreshold: bestCandidate.threshold,
    validationMetrics: bestCandidate,
    configCandidate,
    scannedItemsCount: { train: trainCount, validation: validationCount },
    testItemsReadCount: 0,
    accessedItemIds,
    issues,
  };
}

export function writeCalibratedConfig(
  datasetRoot: string,
  calibration: CalibrationResult
): { code: "WRITTEN" | "CONFIG_EXISTS" | "GATES_NOT_MET"; path: string } {
  const targetPath = path.join(datasetRoot, "sparkle-detector.config.json");

  if (calibration.status !== "CALIBRATED" || !calibration.validationMetrics.gatesMet) {
    return { code: "GATES_NOT_MET", path: targetPath };
  }

  const tempPath = path.join(datasetRoot, `.sparkle-detector-config-${randomUUID()}.tmp`);

  try {
    const json = JSON.stringify(calibration.configCandidate, null, 2) + "\n";

    const fd = openSync(tempPath, "w");
    try {
      writeFileSync(fd, json, { encoding: "utf8" });
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    const targetFd = openSync(targetPath, "wx");
    try {
      writeFileSync(targetFd, json, { encoding: "utf8" });
      fsyncSync(targetFd);
    } finally {
      closeSync(targetFd);
    }

    return { code: "WRITTEN", path: targetPath };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
      return { code: "CONFIG_EXISTS", path: targetPath };
    }
    throw err;
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore temp file removal errors
    }
  }
}
