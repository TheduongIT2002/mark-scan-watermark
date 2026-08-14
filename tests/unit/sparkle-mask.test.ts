import { describe, expect, it } from "vitest";
import { createSparklePixelMask, placeMaskInImage } from "@/lib/inpainter/sparkle-mask";
import type { BoundingBox } from "@/types";

describe("Gemini sparkle pixel mask", () => {
  const box: BoundingBox = {
    x: 124,
    y: 72,
    width: 52,
    height: 52,
    imageWidth: 200,
    imageHeight: 140,
  };

  it("selects the four-point mark without destroying rectangle corners", () => {
    const mask = createSparklePixelMask(200, 140, box);
    const center = Math.floor(mask.height / 2) * mask.width + Math.floor(mask.width / 2);
    expect(mask.alpha[center]).toBeGreaterThan(240);
    expect(mask.binary[0]).toBe(0);
    expect(mask.binary[mask.width - 1]).toBe(0);
    expect(mask.binary[mask.binary.length - 1]).toBe(0);

    const selected = Array.from(mask.binary).filter(Boolean).length;
    expect(selected).toBeGreaterThan(mask.binary.length * 0.12);
    expect(selected).toBeLessThan(mask.binary.length * 0.55);
  });

  it("places the ROI mask at the detected image coordinates", () => {
    const mask = createSparklePixelMask(200, 140, box);
    const full = placeMaskInImage(mask, 200, 140);
    expect(full).toHaveLength(200 * 140);
    expect(full[(mask.y + Math.floor(mask.height / 2)) * 200 + mask.x + Math.floor(mask.width / 2)]).toBe(255);
    expect(full[0]).toBe(0);
  });

  it("clamps a detector box that touches an image edge", () => {
    const edge = createSparklePixelMask(40, 40, { ...box, x: 25, y: 25 });
    expect(edge.x + edge.width).toBe(40);
    expect(edge.y + edge.height).toBe(40);
  });
});
