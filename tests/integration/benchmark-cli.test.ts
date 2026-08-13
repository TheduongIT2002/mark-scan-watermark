import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("benchmark & calibration CLI", () => {
  it("fails closed on default benchmark without config", () => {
    const fixtureRoot = path.resolve("tests/fixtures/dataset/valid");
    const output = execFileSync(
      "cmd.exe",
      [
        "/d",
        "/c",
        `npm run dataset:benchmark -- --root "${fixtureRoot}" --json`,
      ],
      { encoding: "utf8" }
    );
    const parsed = JSON.parse(output.slice(output.indexOf("{", output.indexOf("dataset:benchmark"))));
    expect(parsed).toMatchObject({
      schemaVersion: 2,
      status: "NOT_EVALUABLE",
      reason: "SCANNER_NOT_CONFIGURED",
    });
  });

  it("runs calibration dry-run on authorized fixture without writing config", () => {
    const fixtureRoot = path.resolve("tests/fixtures/dataset/valid");
    let output = "";
    try {
      output = execFileSync(
        "cmd.exe",
        [
          "/d",
          "/c",
          `npm run dataset:calibrate -- --root "${fixtureRoot}" --json`,
        ],
        { encoding: "utf8" }
      );
    } catch (err: unknown) {
      if (err && typeof err === "object" && "stdout" in err && typeof err.stdout === "string") {
        output = err.stdout;
      } else {
        throw err;
      }
    }
    const parsed = JSON.parse(output.slice(output.indexOf("{", output.indexOf("dataset:calibrate"))));
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      testItemsReadCount: 0,
    });
    expect(existsSync(path.join(fixtureRoot, "sparkle-detector.config.json"))).toBe(false);
  });
});
