import { detectSparkleCandidate, localHighPass } from "@/lib/detector/sparkle-core";
import { describe, expect, it } from "vitest";

describe("sparkle-core high-pass ZNCC detector", () => {
  it("computes local high-pass filter signal cleanly", () => {
    const w = 20;
    const h = 20;
    const pixels = new Float32Array(w * h).fill(100);
    pixels[10 * w + 10] = 250;

    const hp = localHighPass(pixels, w, h, 2);
    expect(hp[10 * w + 10]).toBeGreaterThan(50);
    expect(hp[0]).toBeCloseTo(0, 1);
  });

  it("exhibits background invariance across dark and light backgrounds", () => {
    const w = 100;
    const h = 100;

    // Dark background image with sparkle at anchor (45, 45)
    const darkPixels = new Float32Array(w * h).fill(20);
    for (let i = 0; i < 20; i++) {
      darkPixels[(55) * w + (50 + i)] = 180;
      darkPixels[(45 + i) * w + (60)] = 180;
    }

    // Bright white background image with same sparkle shape at anchor (45, 45)
    const brightPixels = new Float32Array(w * h).fill(240);
    for (let i = 0; i < 20; i++) {
      brightPixels[(55) * w + (50 + i)] = 120;
      brightPixels[(45 + i) * w + (60)] = 120;
    }

    // High-pass template (30x30) with matching local coordinates
    const tplW = 30;
    const tplH = 30;
    const tplPixels = new Float32Array(tplW * tplH).fill(20);
    for (let i = 0; i < 20; i++) {
      tplPixels[(10) * tplW + (5 + i)] = 180;
      tplPixels[(i) * tplW + (15)] = 180;
    }

    const darkResult = detectSparkleCandidate({
      imgPixels: darkPixels,
      imgWidth: w,
      imgHeight: h,
      tplPixels,
      tplWidth: tplW,
      tplHeight: tplH,
      subregion: { x: 0, y: 0, width: 30, height: 30 },
      anchor: { x: 45, y: 45, width: 30, height: 30 },
      searchRadius: { dx: 5, dy: 5 },
    });

    const brightResult = detectSparkleCandidate({
      imgPixels: brightPixels,
      imgWidth: w,
      imgHeight: h,
      tplPixels,
      tplWidth: tplW,
      tplHeight: tplH,
      subregion: { x: 0, y: 0, width: 30, height: 30 },
      anchor: { x: 45, y: 45, width: 30, height: 30 },
      searchRadius: { dx: 5, dy: 5 },
    });

    expect(darkResult.score).toBeGreaterThan(0.6);
    expect(brightResult.score).toBeGreaterThan(0.6);
  });

  it("handles cancellation signal gracefully during search loops", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      detectSparkleCandidate({
        imgPixels: new Float32Array(100 * 100),
        imgWidth: 100,
        imgHeight: 100,
        tplPixels: new Float32Array(30 * 30),
        tplWidth: 30,
        tplHeight: 30,
        subregion: { x: 0, y: 0, width: 30, height: 30 },
        anchor: { x: 30, y: 30, width: 30, height: 30 },
        searchRadius: { dx: 5, dy: 5 },
        signal: controller.signal,
      })
    ).toThrow("Cancelled by user.");
  });
});
