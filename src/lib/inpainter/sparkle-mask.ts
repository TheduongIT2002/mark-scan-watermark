import type { BoundingBox } from "@/types";

export interface SparklePixelMask {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Soft edge used when compositing the reconstructed pixels. */
  alpha: Uint8Array;
  /** Dilated binary mask sent to the AI model. */
  binary: Uint8Array;
  /** Conservative core used by the browser-only fallback. */
  core: Uint8Array;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function dilate(source: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(source);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!source[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            output[ny * width + nx] = 255;
          }
        }
      }
    }
  }
  return output;
}

function expandSoftMask(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const output = new Uint8Array(source);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = source[y * width + x];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.hypot(dx, dy);
          if (distance > radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const candidate = source[ny * width + nx] * (1 - distance / (radius + 1));
          best = Math.max(best, candidate);
        }
      }
      output[y * width + x] = Math.round(best);
    }
  }
  return output;
}

/**
 * Builds a four-point Gemini sparkle matte inside the calibrated detector box.
 * The detector's box is intentionally kept as a location hint; only pixels in
 * this shape are allowed to change.
 */
export function createSparklePixelMask(
  imageWidth: number,
  imageHeight: number,
  box: BoundingBox,
): SparklePixelMask {
  // A clean context margin prevents LaMa from seeing bright anti-aliased
  // remnants and reconstructing the watermark back into the image.
  const safetyMargin = Math.max(4, Math.round(Math.min(box.width, box.height) / 6.5));
  const x0 = clamp(Math.floor(box.x) - safetyMargin, 0, imageWidth);
  const y0 = clamp(Math.floor(box.y) - safetyMargin, 0, imageHeight);
  const x1 = clamp(Math.ceil(box.x + box.width) + safetyMargin, x0, imageWidth);
  const y1 = clamp(Math.ceil(box.y + box.height) + safetyMargin, y0, imageHeight);
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const rawAlpha = new Uint8Array(width * height);
  const core = new Uint8Array(width * height);
  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.5;
  const halfBoxWidth = Math.max(1, box.width * 0.5);
  const halfBoxHeight = Math.max(1, box.height * 0.5);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x0 + x + 0.5 - centerX) / halfBoxWidth;
      const ny = (y0 + y + 0.5 - centerY) / halfBoxHeight;
      const radius = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      // Four long axial tips and a compact center reproduce the Gemini mark
      // while deliberately excluding the rectangular corners.
      const boundary = 0.23 + 0.77 * Math.pow(Math.abs(Math.cos(2 * angle)), 5.5);
      const signedDistancePx = (boundary - radius) * Math.min(box.width, box.height) * 0.5;
      const coverage = smoothstep(-1.25, 1.25, signedDistancePx);
      const index = y * width + x;
      rawAlpha[index] = Math.round(coverage * 255);
      if (coverage >= 0.58) core[index] = 255;
    }
  }

  const binarySeed = Uint8Array.from(rawAlpha, (value) => value >= 18 ? 255 : 0);
  const dilationRadius = safetyMargin;

  return {
    x: x0,
    y: y0,
    width,
    height,
    alpha: expandSoftMask(rawAlpha, width, height, dilationRadius + 1),
    binary: dilate(binarySeed, width, height, dilationRadius),
    core: dilate(core, width, height, 1),
  };
}

export function placeMaskInImage(
  mask: SparklePixelMask,
  imageWidth: number,
  imageHeight: number,
  field: "binary" | "alpha" | "core" = "binary",
): Uint8Array {
  const output = new Uint8Array(imageWidth * imageHeight);
  const values = mask[field];
  for (let y = 0; y < mask.height; y++) {
    const targetY = mask.y + y;
    if (targetY < 0 || targetY >= imageHeight) continue;
    for (let x = 0; x < mask.width; x++) {
      const targetX = mask.x + x;
      if (targetX < 0 || targetX >= imageWidth) continue;
      output[targetY * imageWidth + targetX] = values[y * mask.width + x];
    }
  }
  return output;
}

export async function sparkleMaskToPng(
  mask: SparklePixelMask,
  imageWidth: number,
  imageHeight: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable for AI mask.");

  context.fillStyle = "#000";
  context.fillRect(0, 0, imageWidth, imageHeight);
  const imageData = context.createImageData(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const value = mask.binary[y * mask.width + x];
      const target = (y * mask.width + x) * 4;
      imageData.data[target] = value;
      imageData.data[target + 1] = value;
      imageData.data[target + 2] = value;
      imageData.data[target + 3] = 255;
    }
  }
  context.putImageData(imageData, mask.x, mask.y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode AI mask.")), "image/png");
  });
}
