import { describe, expect, it } from "vitest";
import {
  contentAwareInpaint,
  contentAwareInpaintMask,
  compositeGeneratedPixels,
  inpaintImage,
  teleaInpaint,
} from "@/lib/inpainter/inpaint";
import type { BoundingBox } from "@/types";

describe("inpaintImage module", () => {
  it("inpaints target bounding box ROI using Telea boundary propagation", () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill background with blue (0, 0, 255, 255)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 0;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }

    // Put a red logo in the center 4x4 box at (3, 3)
    const box: BoundingBox = { x: 3, y: 3, width: 4, height: 4, imageWidth: 10, imageHeight: 10 };
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 255; // Red
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      }
    }

    // Perform Telea inpainting
    teleaInpaint(data, width, height, 0, 0, box);

    // Verify center pixel (4, 4) is inpainted (blue component dominant, red removed)
    const centerIdx = (4 * width + 4) * 4;
    expect(data[centerIdx + 2]).toBeGreaterThan(200); // Blue restored
    expect(data[centerIdx]).toBeLessThan(50); // Red removed
  });

  it("handles inpaintImage with File input and returns cleaned Blob and File", async () => {
    const fakeBytes = new Uint8Array([255, 216, 255, 224, 0, 10]);
    const file = new File([fakeBytes], "sample.jpg", { type: "image/jpeg" });
    const box: BoundingBox = { x: 10, y: 10, width: 20, height: 20, imageWidth: 100, imageHeight: 100 };

    const result = await inpaintImage(file, box);

    expect(result).toBeDefined();
    expect(result.cleanedBlob).toBeInstanceOf(Blob);
    expect(result.cleanedFile).toBeInstanceOf(File);
    expect(result.cleanedFile.name).toBe("sample-cleaned.jpg");
  });

  it("preserves a crossing texture line with coherent patch synthesis", () => {
    const width = 60;
    const height = 30;
    const data = new Uint8ClampedArray(width * height * 4);
    const box: BoundingBox = { x: 23, y: 8, width: 14, height: 14, imageWidth: width, imageHeight: height };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const value = y === 15 ? 25 : 180;
        data.set([value, value, value, 255], index);
      }
    }
    contentAwareInpaint(data, width, height, 0, 0, box);

    expect(data[(15 * width + 30) * 4]).toBe(25);
  });

  it("never changes pixels outside a supplied sparkle mask", () => {
    const width = 24;
    const height = 24;
    const data = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8Array(width * height);
    for (let index = 0; index < width * height; index++) data.set([40, 80, 120, 255], index * 4);
    for (let y = 9; y < 15; y++) {
      for (let x = 9; x < 15; x++) {
        data.set([240, 240, 240, 255], (y * width + x) * 4);
        if (x === 12 || y === 12) mask[y * width + x] = 255;
      }
    }
    const untouchedCorner = (9 * width + 9) * 4;
    contentAwareInpaintMask(data, width, height, mask);
    expect(Array.from(data.slice(untouchedCorner, untouchedCorner + 4))).toEqual([240, 240, 240, 255]);
    expect(data[(12 * width + 12) * 4]).toBeLessThan(200);
  });

  it("fully replaces all four watermark-tip pixels without changing their neighbors", () => {
    const original = new Uint8ClampedArray(9 * 4);
    const generated = new Uint8ClampedArray(9 * 4);
    const mask = new Uint8Array(9);
    for (let index = 0; index < 9; index++) {
      original.set([235, 235, 235, 190], index * 4);
      generated.set([35, 45, 55, 255], index * 4);
    }
    // Four axial tips around the center, matching the residual in the sample.
    for (const index of [1, 3, 4, 5, 7]) mask[index] = 255;

    compositeGeneratedPixels(original, generated, mask);

    for (const index of [1, 3, 4, 5, 7]) {
      expect(Array.from(generated.slice(index * 4, index * 4 + 4))).toEqual([35, 45, 55, 190]);
    }
    for (const index of [0, 2, 6, 8]) {
      expect(Array.from(generated.slice(index * 4, index * 4 + 4))).toEqual([235, 235, 235, 190]);
    }
  });
});
