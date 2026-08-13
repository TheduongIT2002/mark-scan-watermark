import type { DatasetValidationResult } from "@/lib/dataset/types";
import { readValidatedImage } from "@/lib/dataset/validate";
import { loadConfiguredScanner } from "@/lib/scanner/configured-scanner";
import type { LogoScanner } from "@/lib/scanner/scanner";
import { runValidatedScan, UnconfiguredLogoScanner } from "@/lib/scanner/scanner";
import type { MaskPreview } from "@/types";
import sharp from "sharp";
import { breakdown, metrics, thresholdSweep } from "./metrics";

export interface QualityGates {
  minPrecision: number;
  minRecall: number;
  maxFalsePositiveRate: number;
  maxLatencyP95Ms: number;
  minBoxIoU?: number;
  minMaskIoU?: number;
  minMaskCoverage?: number;
}

export interface BenchmarkOptions {
  scanner?: LogoScanner;
  configPath?: string;
  split?: "validation" | "test" | "eval";
  gates?: QualityGates;
  thresholds?: number[];
  predictedMaskResolver?: (mask: MaskPreview) => Promise<Uint8Array | undefined>;
}

export async function benchmarkDataset(
  validation: DatasetValidationResult,
  options: BenchmarkOptions = {}
) {
  let scanner: LogoScanner | undefined = options.scanner;

  if (!scanner && options.configPath && validation.status === "VALID" && validation.context) {
    scanner = await loadConfiguredScanner(options.configPath, validation.context.root);
  }

  if (scanner instanceof UnconfiguredLogoScanner || (!scanner && !options.configPath)) {
    return {
      schemaVersion: 2 as const,
      status: "NOT_EVALUABLE" as const,
      reason: "SCANNER_NOT_CONFIGURED" as const,
      datasetHash: validation.datasetHash,
    };
  }

  const gates = options.gates;
  if (validation.status !== "VALID" || !validation.context || !validation.manifest || !scanner || !gates) {
    return {
      schemaVersion: 2 as const,
      status: "NOT_EVALUABLE" as const,
      reason:
        validation.status !== "VALID"
          ? "DATASET_INVALID"
          : !scanner
          ? "SCANNER_NOT_CONFIGURED"
          : !validation.context || !validation.manifest
          ? "DATASET_CONTEXT_MISSING"
          : "QUALITY_GATES_NOT_CONFIGURED",
      datasetHash: validation.datasetHash,
    };
  }

  const requestedSplit = options.split ?? "eval";

  const itemsToEvaluate = validation.manifest.items.filter((i) => {
    if (requestedSplit === "validation") return i.split === "validation";
    if (requestedSplit === "test") return i.split === "test";
    return i.split !== "train";
  });

  const rows = [];
  for (const item of itemsToEvaluate) {
    const bytes = await readValidatedImage(
      validation.context,
      item.imagePath,
      item.sha256,
      item.width,
      item.height
    );
    const file = new File([Uint8Array.from(bytes)], item.id);
    const input = {
      itemId: item.id,
      file,
      sourceHash: item.sha256,
      width: item.width,
      height: item.height,
    };
    const output = await runValidatedScan(scanner, input, new AbortController().signal);
    const predicted = output.result.status === "review";

    const truthMask = item.mask
      ? new Uint8Array(
          await sharp(
            await readValidatedImage(
              validation.context,
              item.mask.path,
              item.mask.sha256,
              item.width,
              item.height
            )
          )
            .greyscale()
            .raw()
            .toBuffer()
        )
      : undefined;

    const predictedMask =
      output.mask && options.predictedMaskResolver
        ? await options.predictedMaskResolver(output.mask)
        : undefined;

    rows.push({
      truth: item.label === "positive",
      predicted,
      label: item.label,
      category: item.category ?? "uncategorized",
      confidence: output.result.confidence,
      latencyMs: output.result.processingTimeMs,
      truthBox: item.boundingBox
        ? { ...item.boundingBox, imageWidth: item.width, imageHeight: item.height }
        : undefined,
      predictedBox: output.result.boundingBox,
      truthMask,
      predictedMask,
    });
  }

  const values = metrics(rows);
  const diffNegFpCount = rows.filter(
    (r) => r.label === "difficult-negative" && r.predicted
  ).length;

  const maskRequired = gates.minMaskIoU !== undefined || gates.minMaskCoverage !== undefined;
  const maskCoverage = values.maskIoU.eligible
    ? values.maskIoU.compared / values.maskIoU.eligible
    : 0;

  const passed =
    values.precision >= gates.minPrecision &&
    values.recall >= gates.minRecall &&
    values.falsePositiveRate <= gates.maxFalsePositiveRate &&
    values.latencyMs.p95 <= gates.maxLatencyP95Ms &&
    diffNegFpCount === 0 &&
    (gates.minBoxIoU === undefined ||
      (values.boxIoU.mean !== null && values.boxIoU.mean >= gates.minBoxIoU)) &&
    (!maskRequired ||
      (values.maskIoU.mean !== null &&
        values.maskIoU.mean >= (gates.minMaskIoU ?? 0) &&
        maskCoverage >= (gates.minMaskCoverage ?? 1)));

  return {
    schemaVersion: 2 as const,
    status: passed ? ("PASS" as const) : ("FAIL" as const),
    split: requestedSplit,
    datasetId: validation.datasetId,
    datasetHash: validation.datasetHash,
    detectorVersion: scanner.detectorVersion,
    configVersion: scanner.configVersion,
    gates,
    metrics: {
      ...values,
      difficultNegativeFpCount: diffNegFpCount,
    },
    breakdowns: {
      byLabel: breakdown(rows, "label"),
      byCategory: breakdown(rows, "category"),
    },
    sweep: thresholdSweep(rows, options.thresholds ?? []),
  };
}
