import path from "node:path";
import { benchmarkDataset } from "@/lib/benchmark/benchmark";
import { benchmarkCsv, benchmarkJson } from "@/lib/benchmark/serialize";
import { parseCliOptions } from "@/lib/dataset/args";
import { validateDataset } from "@/lib/dataset/validate";
import { loadAndValidateConfig } from "@/lib/detector/config-loader";

const args = process.argv.slice(2);
const options = parseCliOptions(args);

if (!options.root) {
  console.error(
    "Usage: npm run dataset:benchmark -- --root <authorized-dataset-root> [--config <config-file>] [--split validation|test] [--json|--csv]"
  );
  process.exit(2);
}

const absoluteRoot = path.resolve(options.root);
const validation = await validateDataset(absoluteRoot);

let gates = undefined;
if (options.configPath) {
  const configVal = loadAndValidateConfig(path.resolve(options.configPath), absoluteRoot);
  if (configVal.valid && configVal.config) {
    gates = configVal.config.gates;
  }
}

const split = options.split ?? "validation";

const report = await benchmarkDataset(validation, {
  configPath: options.configPath ? path.resolve(options.configPath) : undefined,
  split,
  gates,
});

console.log(
  options.csv
    ? benchmarkCsv(report)
    : options.json
    ? benchmarkJson(report)
    : `Benchmark (${report.split ?? "unconfigured"}): ${report.status} (${report.reason ?? "evaluated"})`
);

process.exitCode = report.status === "FAIL" ? 1 : 0;
