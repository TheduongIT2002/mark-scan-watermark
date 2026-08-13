import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import configSchema from "@/../schemas/fixed-sparkle-detector-config.schema.json";
import type { DatasetManifest } from "@/lib/dataset/types";
import type { SparkleDetectorConfig } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateConfigSchema = ajv.compile(configSchema);

export function computeConfigHash(config: Omit<SparkleDetectorConfig, "configHash">): string {
  const json = JSON.stringify({
    schemaVersion: config.schemaVersion,
    detectorVersion: config.detectorVersion,
    configVersion: config.configVersion,
    datasetId: config.datasetId,
    datasetHash: config.datasetHash,
    canonicalLogo: config.canonicalLogo,
    templateSubregion: config.templateSubregion,
    templateHighPass: config.templateHighPass,
    referenceDimensions: config.referenceDimensions,
    searchAnchor: config.searchAnchor,
    searchAnchorNormalized: config.searchAnchorNormalized,
    searchRadius: config.searchRadius,
    searchRadiusNormalized: config.searchRadiusNormalized,
    algorithm: config.algorithm,
    threshold: config.threshold,
    gates: config.gates,
  });
  return createHash("sha256").update(json).digest("hex");
}

export interface ConfigValidationResult {
  valid: boolean;
  config?: SparkleDetectorConfig;
  issues: string[];
}

export function loadAndValidateConfig(
  configFilePath: string,
  datasetRoot: string,
  manifest?: DatasetManifest
): ConfigValidationResult {
  const issues: string[] = [];

  if (!existsSync(configFilePath)) {
    return { valid: false, issues: [`Config file missing at ${configFilePath}`] };
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(configFilePath, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, issues: ["Config file is invalid JSON."] };
  }

  if (!validateConfigSchema(parsed)) {
    const schemaErrors = (validateConfigSchema.errors ?? []).map(
      (e) => `Schema error at ${e.instancePath || "/"}: ${e.message}`
    );
    return { valid: false, issues: schemaErrors };
  }

  const config = parsed as unknown as SparkleDetectorConfig;

  // Verify path safety of canonical logo
  const canonicalRel = config.canonicalLogo.path;
  if (path.isAbsolute(canonicalRel) || canonicalRel.includes("..")) {
    issues.push(`Unsafe canonical logo path: ${canonicalRel}`);
  }

  const resolvedCanonical = path.resolve(datasetRoot, canonicalRel);
  const relativeFromRoot = path.relative(datasetRoot, resolvedCanonical);
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    issues.push(`Canonical logo path escapes dataset root: ${canonicalRel}`);
  }

  if (!existsSync(resolvedCanonical)) {
    issues.push(`Canonical logo file missing at ${resolvedCanonical}`);
  } else {
    try {
      const bytes = readFileSync(resolvedCanonical);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256.toLowerCase() !== config.canonicalLogo.sha256.toLowerCase()) {
        issues.push(
          `Canonical logo SHA-256 mismatch. Expected ${config.canonicalLogo.sha256}, got ${sha256}`
        );
      }
    } catch {
      issues.push(`Failed to read canonical logo file at ${resolvedCanonical}`);
    }
  }

  // Verify dataset manifest and dataset hash if provided
  if (manifest) {
    if (manifest.datasetId !== config.datasetId) {
      issues.push(`Dataset ID mismatch. Expected ${manifest.datasetId}, got ${config.datasetId}`);
    }
  }

  // Verify configHash
  const expectedHash = computeConfigHash(config);
  if (expectedHash.toLowerCase() !== config.configHash.hex.toLowerCase()) {
    issues.push(
      `Config SHA-256 mismatch. Expected ${config.configHash.hex}, got ${expectedHash}`
    );
  }

  return {
    valid: issues.length === 0,
    config: issues.length === 0 ? config : undefined,
    issues,
  };
}
