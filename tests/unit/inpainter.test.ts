import { describe, expect, it } from "vitest";
import { inpaintImage, teleaInpaint } from "@/lib/inpainter/inpaint";
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
});
