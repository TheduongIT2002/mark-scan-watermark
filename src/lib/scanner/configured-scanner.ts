import { loadAndValidateConfig } from "@/lib/detector/config-loader";
import { NodeSparkleScanner } from "@/lib/detector/node-sparkle-scanner";
import type { SparkleDetectorConfig } from "@/lib/detector/types";
import type { LogoScanner } from "./scanner";
import { UnconfiguredLogoScanner } from "./scanner";

export interface FixedLogoScannerConfig {
  version: string;
  canonicalAssetPath: string;
  canonicalAssetSha256: string;
  configSha256: string;
}

export async function loadConfiguredScanner(
  configFilePath?: string,
  datasetRoot?: string
): Promise<LogoScanner> {
  if (!configFilePath || !datasetRoot) {
    return new UnconfiguredLogoScanner();
  }

  const result = loadAndValidateConfig(configFilePath, datasetRoot);
  if (!result.valid || !result.config) {
    return new UnconfiguredLogoScanner();
  }

  try {
    return await NodeSparkleScanner.create(result.config, datasetRoot);
  } catch {
    return new UnconfiguredLogoScanner();
  }
}

export async function loadConfiguredScannerFromObject(
  config: SparkleDetectorConfig,
  datasetRoot: string
): Promise<LogoScanner> {
  try {
    return await NodeSparkleScanner.create(config, datasetRoot);
  } catch {
    return new UnconfiguredLogoScanner();
  }
}
