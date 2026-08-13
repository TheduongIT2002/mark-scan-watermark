import path from "node:path";
import { parseCliOptions } from "../src/lib/dataset/args";
import { buildIntake, writeIntakeManifest } from "../src/lib/dataset/intake";

const args = process.argv.slice(2);
const options = parseCliOptions(args);
const write = args.includes("--write-manifest");

if (!options.root) {
  console.error("Usage: npm run dataset:intake -- --root <authorized-root> [--json] [--write-manifest]");
  process.exit(2);
}

const result = await buildIntake(path.resolve(options.root));
let writeCode: string | undefined;

if (write) {
  writeCode = (await writeIntakeManifest(options.root, result)).code;
  if (writeCode !== "WRITTEN") {
    result.status = "NOT_READY";
    result.issues.push({
      code: writeCode,
      message: writeCode === "MANIFEST_EXISTS" ? "manifest.json already exists." : "Intake is not ready.",
    });
  }
}

const safe = {
  schemaVersion: result.schemaVersion,
  status: result.status,
  datasetId: result.datasetId,
  written: result.written,
  canonicalLogo: result.canonicalLogo,
  items: result.items,
  issues: result.issues,
  writeCode,
};

if (options.json) {
  console.log(JSON.stringify(safe, null, 2));
} else {
  console.log(
    `Intake ${result.datasetId ?? "unknown"}: ${result.status}${writeCode ? ` (${writeCode})` : ""}\nIssues: ${result.issues.length}`
  );
}

process.exitCode = result.status === "READY" ? 0 : 1;
