import path from "node:path";
import { parseCliOptions } from "@/lib/dataset/args";
import { validateDataset } from "@/lib/dataset/validate";
import { calibrateDetector, writeCalibratedConfig } from "@/lib/detector/calibrate";

async function run() {
  const args = process.argv.slice(2);
  const options = parseCliOptions(args);

  if (!options.root) {
    console.error(
      "Usage: npm run dataset:calibrate -- --root <authorized-root> [--json] [--write-config]"
    );
    process.exit(2);
  }

  const absoluteRoot = path.resolve(options.root);
  const validation = await validateDataset(absoluteRoot);

  if (validation.status !== "VALID") {
    const errorOutput = {
      schemaVersion: 1,
      status: "INVALID_DATASET",
      issues: validation.issues,
    };
    if (options.json) console.log(JSON.stringify(errorOutput, null, 2));
    else console.error("Dataset validation failed:", validation.issues);
    process.exit(1);
  }

  const calibration = await calibrateDetector(validation);

  let writeCode: "WRITTEN" | "CONFIG_EXISTS" | "GATES_NOT_MET" | undefined;
  if (options.writeConfig) {
    const res = writeCalibratedConfig(absoluteRoot, calibration);
    writeCode = res.code;
  }

  const output = {
    schemaVersion: 1,
    status: calibration.status,
    datasetId: calibration.datasetId,
    datasetHash: calibration.datasetHash,
    selectedThreshold: calibration.selectedThreshold,
    validationMetrics: calibration.validationMetrics,
    configHash: calibration.configCandidate.configHash,
    scannedItemsCount: calibration.scannedItemsCount,
    testItemsReadCount: calibration.testItemsReadCount,
    writeCode,
    issues: calibration.issues,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Detector Calibration Result: ${output.status}`);
    console.log(`Dataset ID: ${output.datasetId}`);
    console.log(`Selected Threshold: ${output.selectedThreshold}`);
    console.log(`Validation Precision: ${output.validationMetrics.precision.toFixed(4)}`);
    console.log(`Validation Recall: ${output.validationMetrics.recall.toFixed(4)}`);
    console.log(`Validation FPR: ${output.validationMetrics.falsePositiveRate.toFixed(4)}`);
    if (writeCode) console.log(`Config Write Code: ${writeCode}`);
  }

  if (calibration.status !== "CALIBRATED") {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL ERROR during calibration:", err);
  process.exit(1);
});
