import { loadConfiguredScanner } from "@/lib/scanner/configured-scanner";
import { UnconfiguredLogoScanner } from "@/lib/scanner/scanner";
import { describe, expect, it } from "vitest";

describe("configured scanner seam", () => {
  it("remains fail closed for missing and invalid configuration", async () => {
    expect(await loadConfiguredScanner(undefined, undefined)).toBeInstanceOf(UnconfiguredLogoScanner);
    expect(await loadConfiguredScanner("nonexistent.json", "invalid_root")).toBeInstanceOf(UnconfiguredLogoScanner);
  });
});
