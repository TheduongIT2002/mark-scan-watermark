import type { BoundingBox } from "@/types";
import { requestLamaInpaint } from "./lama-client";
import {
  createSparklePixelMask,
  sparkleMaskToPng,
} from "./sparkle-mask";
import type { SparklePixelMask } from "./sparkle-mask";

export type InpaintEngine = "lama-hybrid" | "shape-aware-local" | "passthrough";

export interface InpaintResult {
  cleanedBlob: Blob;
  cleanedUrl: string;
  cleanedFile: File;
  engine: InpaintEngine;
  warning?: string;
}

export interface InpaintOptions {
  aiEndpoint?: string;
  padding?: number;
  preferAi?: boolean;
  signal?: AbortSignal;
}

/**
 * Content-aware client-side inpainting for the fixed Gemini watermark.
 * The detector box is replaced from one coherent nearby texture exemplar and
 * Poisson-blended into the real boundary instead of being averaged into a blur.
 */
export async function inpaintImage(
  file: File,
  box: BoundingBox,
  optionsOrPadding: InpaintOptions | number = {},
): Promise<InpaintResult> {
  const options: InpaintOptions = typeof optionsOrPadding === "number"
    ? { padding: optionsOrPadding }
    : optionsOrPadding;
  const padding = options.padding ?? 4;
  if (typeof window === "undefined" || typeof document === "undefined") {
    const cleanedBlob = new Blob([await file.arrayBuffer()], { type: file.type || "image/png" });
    const cleanedFile = new File([cleanedBlob], getCleanedFileName(file.name), { type: file.type || "image/png" });
    return {
      cleanedBlob,
      cleanedUrl: "",
      cleanedFile,
      engine: "passthrough",
    };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // Fallback for non-browser / JSDOM environment without native image decoder
    const cleanedBlob = new Blob([await file.arrayBuffer()], { type: file.type || "image/png" });
    const cleanedFile = new File([cleanedBlob], getCleanedFileName(file.name), { type: file.type || "image/png" });
    const cleanedUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(cleanedBlob) : "";
    return { cleanedBlob, cleanedUrl, cleanedFile, engine: "passthrough" };
  }

  const canvas = document.createElement("canvas");
  canvas.width = box.imageWidth || img.width || 1;
  canvas.height = box.imageHeight || img.height || 1;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const cleanedBlob = new Blob([await file.arrayBuffer()], { type: file.type || "image/png" });
    const cleanedFile = new File([cleanedBlob], getCleanedFileName(file.name), { type: file.type || "image/png" });
    const cleanedUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(cleanedBlob) : "";
    return { cleanedBlob, cleanedUrl, cleanedFile, engine: "passthrough" };
  }

  ctx.drawImage(img, 0, 0);

  // Clamp bounding box to image dimensions
  const imgW = canvas.width;
  const imgH = canvas.height;
  const sparkleMask = createSparklePixelMask(imgW, imgH, box);
  let engine: InpaintEngine = "shape-aware-local";
  let warning: string | undefined;

  if (options.preferAi !== false) {
    try {
      const maskBlob = await sparkleMaskToPng(sparkleMask, imgW, imgH);
      const aiBlob = await requestLamaInpaint(file, maskBlob, {
        endpoint: options.aiEndpoint,
        signal: options.signal,
      });
      const aiImage = await loadImage(aiBlob);
      if (aiImage.naturalWidth !== imgW || aiImage.naturalHeight !== imgH) {
        throw new Error("LaMa result dimensions do not match the source image.");
      }
      compositeAiResult(ctx, aiImage, sparkleMask, imgW, imgH);
      engine = "lama-hybrid";
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw error;
      warning = "LaMa local is unavailable; used the shape-aware browser fallback.";
    }
  }

  if (engine !== "lama-hybrid") {
    // Patch synthesis needs enough nearby, watermark-free texture to choose from.
    const contextPadding = Math.max(padding, Math.ceil(Math.max(box.width, box.height) * 1.5));
    const padX0 = Math.max(0, Math.floor(box.x - contextPadding));
    const padY0 = Math.max(0, Math.floor(box.y - contextPadding));
    const padX1 = Math.min(imgW, Math.ceil(box.x + box.width + contextPadding));
    const padY1 = Math.min(imgH, Math.ceil(box.y + box.height + contextPadding));

    const roiW = padX1 - padX0;
    const roiH = padY1 - padY0;

    if (roiW > 0 && roiH > 0) {
      const imageData = ctx.getImageData(padX0, padY0, roiW, roiH);
      const data = imageData.data;
      const coreMask = maskForRoi(sparkleMask, padX0, padY0, roiW, roiH, "core");

      restoreSemiTransparentEdges(data, roiW, roiH, sparkleMask, padX0, padY0);
      contentAwareInpaintMask(data, roiW, roiH, coreMask);

      ctx.putImageData(imageData, padX0, padY0);
    }
  }

  // Always encode reconstructed images losslessly. Re-encoding a JPEG would
  // introduce fresh block artifacts outside the repaired region.
  const mimeType = "image/png";
  const cleanedBlob = await canvasToBlob(canvas, mimeType);
  const cleanedFileName = getCleanedFileName(file.name, mimeType);
  const cleanedFile = new File([cleanedBlob], cleanedFileName, { type: mimeType });
  const cleanedUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(cleanedBlob) : "";

  return {
    cleanedBlob,
    cleanedUrl,
    cleanedFile,
    engine,
    warning,
  };
}

function getCleanedFileName(name: string, mimeType?: string): string {
  const dotIdx = name.lastIndexOf(".");
  if (mimeType === "image/png") {
    return `${dotIdx > 0 ? name.slice(0, dotIdx) : name}-cleaned.png`;
  }
  if (dotIdx > 0) {
    return `${name.slice(0, dotIdx)}-cleaned${name.slice(dotIdx)}`;
  }
  return `${name}-cleaned`;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    try {
      const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
      const img = new Image();
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
          reject(new Error("Image load timeout"));
        }
      }, 200);

      img.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
          resolve(img);
        }
      };

      img.onerror = (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
          reject(err);
        }
      };

      if (url) {
        img.src = url;
      } else {
        clearTimeout(timer);
        reject(new Error("URL.createObjectURL unavailable"));
      }
    } catch (e) {
      reject(e);
    }
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function compositeAiResult(
  targetContext: CanvasRenderingContext2D,
  aiImage: HTMLImageElement,
  mask: SparklePixelMask,
  imageWidth: number,
  imageHeight: number,
): void {
  const aiCanvas = document.createElement("canvas");
  aiCanvas.width = imageWidth;
  aiCanvas.height = imageHeight;
  const aiContext = aiCanvas.getContext("2d");
  if (!aiContext) throw new Error("Canvas 2D context unavailable for LaMa result.");
  aiContext.drawImage(aiImage, 0, 0);

  const original = targetContext.getImageData(mask.x, mask.y, mask.width, mask.height);
  const generated = aiContext.getImageData(mask.x, mask.y, mask.width, mask.height);
  compositeGeneratedPixels(original.data, generated.data, mask.binary);
  targetContext.putImageData(generated, mask.x, mask.y);
}

/**
 * Commits every AI-generated pixel covered by the dilated removal mask.
 *
 * The previous soft-alpha blend mixed the original watermark back into the
 * reconstructed image at the four axial tips. The binary mask already has a
 * clean context margin, so a full replacement inside it produces a seamless
 * boundary while pixels outside it remain byte-for-byte unchanged.
 */
export function compositeGeneratedPixels(
  original: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  binaryMask: Uint8Array,
): void {
  if (original.length !== generated.length || original.length !== binaryMask.length * 4) {
    throw new Error("Composite image and mask dimensions do not match.");
  }

  for (let index = 0; index < binaryMask.length; index++) {
    const pixel = index * 4;
    if (binaryMask[index]) {
      // Preserve source transparency even when the AI endpoint returns an
      // opaque PNG; only reconstructed RGB content is authorized to change.
      generated[pixel + 3] = original[pixel + 3];
      continue;
    }
    generated[pixel] = original[pixel];
    generated[pixel + 1] = original[pixel + 1];
    generated[pixel + 2] = original[pixel + 2];
    generated[pixel + 3] = original[pixel + 3];
  }
}

function maskForRoi(
  mask: SparklePixelMask,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  field: "binary" | "alpha" | "core",
): Uint8Array {
  const output = new Uint8Array(width * height);
  const values = mask[field];
  for (let y = 0; y < mask.height; y++) {
    const targetY = mask.y + y - offsetY;
    if (targetY < 0 || targetY >= height) continue;
    for (let x = 0; x < mask.width; x++) {
      const targetX = mask.x + x - offsetX;
      if (targetX < 0 || targetX >= width) continue;
      output[targetY * width + targetX] = values[y * mask.width + x];
    }
  }
  return output;
}

/** Approximate inverse alpha-compositing for the anti-aliased white fringe. */
function restoreSemiTransparentEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: SparklePixelMask,
  offsetX: number,
  offsetY: number,
): void {
  for (let y = 0; y < mask.height; y++) {
    const targetY = mask.y + y - offsetY;
    if (targetY < 0 || targetY >= height) continue;
    for (let x = 0; x < mask.width; x++) {
      const maskIndex = y * mask.width + x;
      if (mask.core[maskIndex] || mask.alpha[maskIndex] < 8) continue;
      const targetX = mask.x + x - offsetX;
      if (targetX < 0 || targetX >= width) continue;
      const opacity = Math.min(0.18, mask.alpha[maskIndex] / 255 * 0.34);
      const pixel = (targetY * width + targetX) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const recovered = (data[pixel + channel] - opacity * 255) / (1 - opacity);
        data[pixel + channel] = Math.max(0, Math.min(255, Math.round(recovered)));
      }
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          try {
            const dataUrl = canvas.toDataURL(mimeType);
            const bin = atob(dataUrl.split(",")[1] || "");
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
              arr[i] = bin.charCodeAt(i);
            }
            resolve(new Blob([arr], { type: mimeType }));
          } catch {
            resolve(new Blob([], { type: mimeType }));
          }
        }
      },
      mimeType,
      0.98
    );
  });
}

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

interface DirectionalSample {
  score: number;
  rgba: [number, number, number, number];
}

function colorDistance(data: Uint8ClampedArray, first: number, second: number): number {
  const dr = data[first] - data[second];
  const dg = data[first + 1] - data[second + 1];
  const db = data[first + 2] - data[second + 2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function directionalSample(
  source: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  dx: number,
  dy: number
): DirectionalSample | undefined {
  const maxDistance = Math.max(width, height);
  let before: { x: number; y: number; distance: number } | undefined;
  let after: { x: number; y: number; distance: number } | undefined;

  for (let distance = 1; distance <= maxDistance && (!before || !after); distance++) {
    const bx = x - dx * distance;
    const by = y - dy * distance;
    if (!before && bx >= 0 && bx < width && by >= 0 && by < height && !mask[by * width + bx]) {
      before = { x: bx, y: by, distance };
    }
    const ax = x + dx * distance;
    const ay = y + dy * distance;
    if (!after && ax >= 0 && ax < width && ay >= 0 && ay < height && !mask[ay * width + ax]) {
      after = { x: ax, y: ay, distance };
    }
  }

  if (!before || !after) return undefined;
  const beforeIndex = (before.y * width + before.x) * 4;
  const afterIndex = (after.y * width + after.x) * 4;
  const totalDistance = before.distance + after.distance;
  const beforeWeight = after.distance / totalDistance;
  const afterWeight = before.distance / totalDistance;
  const rgba: [number, number, number, number] = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel++) {
    rgba[channel] = Math.round(
      source[beforeIndex + channel] * beforeWeight + source[afterIndex + channel] * afterWeight
    );
  }

  // Prefer the axis whose two boundary pixels already look alike. Dividing by
  // their separation prevents a long, coincidental match from winning.
  return {
    score: colorDistance(source, beforeIndex, afterIndex) / Math.sqrt(totalDistance),
    rgba,
  };
}

/**
 * Replace the detector region from a single coherent neighboring patch and
 * blend its gradients into the untouched boundary.
 */
export function contentAwareInpaint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  box: BoundingBox
): void {
  const mask = new Uint8Array(width * height);
  const maskX0 = Math.max(0, Math.floor(box.x - offsetX));
  const maskY0 = Math.max(0, Math.floor(box.y - offsetY));
  const maskX1 = Math.min(width, Math.ceil(box.x - offsetX + box.width));
  const maskY1 = Math.min(height, Math.ceil(box.y - offsetY + box.height));
  for (let y = maskY0; y < maskY1; y++) {
    for (let x = maskX0; x < maskX1; x++) mask[y * width + x] = 1;
  }
  contentAwareInpaintMask(data, width, height, mask);
}

/**
 * Patch synthesis constrained by a pixel-accurate mask. Pixels outside the
 * mask are read-only, including the rectangular corners around the sparkle.
 */
export function contentAwareInpaintMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maskInput: Uint8Array,
): void {
  if (maskInput.length !== width * height) {
    throw new Error("Inpaint mask dimensions do not match the image region.");
  }
  const mask = Uint8Array.from(maskInput, (value) => value ? 1 : 0);
  const source = new Uint8ClampedArray(data);
  const maskedPixels: Array<[number, number]> = [];
  const boundaryPixels: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      maskedPixels.push([x, y]);
      if (DIRECTIONS.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && nx < width && ny >= 0 && ny < height && !mask[ny * width + nx];
      })) boundaryPixels.push([x, y]);
    }
  }
  if (!maskedPixels.length) return;

  const sourceIsClean = (shiftX: number, shiftY: number): boolean => maskedPixels.every(([x, y]) => {
    const sx = x + shiftX;
    const sy = y + shiftY;
    return sx >= 0 && sx < width && sy >= 0 && sy < height && !mask[sy * width + sx];
  });

  const shiftError = (shiftX: number, shiftY: number): number => {
    let error = 0;
    let compared = 0;
    // Compare a ring immediately outside the mask. It describes the target
    // surface while avoiding the watermark-covered center.
    for (const [x, y] of boundaryPixels) {
      for (const [dx, dy] of DIRECTIONS) {
        for (const sign of [-1, 1]) {
          const tx = x + dx * sign * 2;
          const ty = y + dy * sign * 2;
          const sx = tx + shiftX;
          const sy = ty + shiftY;
          if (
            tx < 0 || tx >= width || ty < 0 || ty >= height || mask[ty * width + tx] ||
            sx < 0 || sx >= width || sy < 0 || sy >= height || mask[sy * width + sx]
          ) continue;
          const targetIndex = (ty * width + tx) * 4;
          const sourceIndex = (sy * width + sx) * 4;
          const dr = source[targetIndex] - source[sourceIndex];
          const dg = source[targetIndex + 1] - source[sourceIndex + 1];
          const db = source[targetIndex + 2] - source[sourceIndex + 2];
          error += dr * dr + dg * dg + db * db;
          compared++;
        }
      }
    }
    // Favor the same scanline: fixed corner watermarks commonly sit across a
    // continuous floor, wall, sky, or tabletop whose structure runs sideways.
    return compared
      ? error / compared + Math.abs(shiftX) * 0.15 + Math.abs(shiftY) * 500
      : Number.POSITIVE_INFINITY;
  };

  let bestShiftX = 0;
  let bestShiftY = 0;
  let bestError = Number.POSITIVE_INFINITY;
  const searchRadius = Math.floor(Math.min(width, height) * 0.75);
  for (let shiftY = -searchRadius; shiftY <= searchRadius; shiftY += 2) {
    for (let shiftX = -searchRadius; shiftX <= searchRadius; shiftX += 2) {
      if ((!shiftX && !shiftY) || !sourceIsClean(shiftX, shiftY)) continue;
      const error = shiftError(shiftX, shiftY);
      if (error < bestError) {
        bestError = error;
        bestShiftX = shiftX;
        bestShiftY = shiftY;
      }
    }
  }

  if (!Number.isFinite(bestError)) {
    for (const [x, y] of maskedPixels) {
      const candidates = DIRECTIONS.flatMap(([dx, dy]) => {
        const sample = directionalSample(source, mask, width, height, x, y, dx, dy);
        return sample ? [sample] : [];
      }).sort((a, b) => a.score - b.score);
      if (!candidates.length) continue;
      const targetIndex = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) data[targetIndex + channel] = candidates[0].rgba[channel];
    }
    return;
  }

  // Seed the whole mask from one coherent neighboring patch.
  for (const [x, y] of maskedPixels) {
    const targetIndex = (y * width + x) * 4;
    const sourceIndex = ((y + bestShiftY) * width + x + bestShiftX) * 4;
    for (let channel = 0; channel < 4; channel++) data[targetIndex + channel] = source[sourceIndex + channel];
  }

  // Seamless Poisson blending retains gradients from the exemplar while
  // converging exactly toward the real target pixels at the mask boundary.
  let current = new Float32Array(data);
  let next = new Float32Array(current);
  const CARDINAL_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let iteration = 0; iteration < 48; iteration++) {
    for (const [x, y] of maskedPixels) {
      const targetIndex = (y * width + x) * 4;
      const exemplarIndex = ((y + bestShiftY) * width + x + bestShiftX) * 4;
      for (let channel = 0; channel < 3; channel++) {
        let neighbors = 0;
        let guidance = 0;
        for (const [dx, dy] of CARDINAL_DIRECTIONS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const neighborIndex = (ny * width + nx) * 4;
          neighbors += mask[ny * width + nx] ? current[neighborIndex + channel] : source[neighborIndex + channel];
          const exemplarNeighbor = ((ny + bestShiftY) * width + nx + bestShiftX) * 4;
          guidance += source[exemplarIndex + channel] - source[exemplarNeighbor + channel];
        }
        next[targetIndex + channel] = Math.max(0, Math.min(255, (neighbors + guidance) / 4));
      }
      next[targetIndex + 3] = 255;
    }
    [current, next] = [next, current];
  }
  for (const [x, y] of maskedPixels) {
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 4; channel++) data[index + channel] = Math.round(current[index + channel]);
  }
}

/**
 * Telea-inspired Fast Marching Method boundary propagation inpainting.
 * Operates on RGBA Uint8ClampedArray data for an ROI of size width x height.
 */
export function teleaInpaint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  box: BoundingBox
): void {
  const maskX0 = box.x - offsetX;
  const maskY0 = box.y - offsetY;
  const maskX1 = maskX0 + box.width;
  const maskY1 = maskY0 + box.height;

  // Create a status array: 0 = KNOWN, 1 = MASK (TO INPAINT)
  const status = new Uint8Array(width * height);
  let maskCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (x >= maskX0 && x < maskX1 && y >= maskY0 && y < maskY1) {
        status[idx] = 1; // MASK
        maskCount++;
      } else {
        status[idx] = 0; // KNOWN
      }
    }
  }

  if (maskCount === 0) return;

  // Multi-pass Telea boundary inwards propagation
  const radius = 4;
  let remaining = maskCount;
  let prevRemaining = -1;

  while (remaining > 0 && remaining !== prevRemaining) {
    prevRemaining = remaining;
    const currentPassInpainted: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (status[idx] !== 1) continue;

        let hasKnownNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (status[ny * width + nx] === 0) {
                hasKnownNeighbor = true;
                break;
              }
            }
          }
          if (hasKnownNeighbor) break;
        }

        if (!hasKnownNeighbor) continue;

        let rSum = 0,
          gSum = 0,
          bSum = 0,
          aSum = 0;
        let wSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (status[nIdx] === 0) {
                const dist2 = dx * dx + dy * dy;
                const dist = Math.sqrt(dist2);
                if (dist > radius) continue;

                const dirWeight = Math.abs(dx * 1.0 + dy * 1.0) / (dist * Math.SQRT2);
                const weight = (1.0 / (dist2 * dist + 0.001)) * (0.5 + 0.5 * dirWeight);

                const pixelOffset = nIdx * 4;
                rSum += data[pixelOffset] * weight;
                gSum += data[pixelOffset + 1] * weight;
                bSum += data[pixelOffset + 2] * weight;
                aSum += data[pixelOffset + 3] * weight;
                wSum += weight;
              }
            }
          }
        }

        if (wSum > 0) {
          const pixelOffset = idx * 4;
          data[pixelOffset] = Math.round(rSum / wSum);
          data[pixelOffset + 1] = Math.round(gSum / wSum);
          data[pixelOffset + 2] = Math.round(bSum / wSum);
          data[pixelOffset + 3] = Math.round(aSum / wSum);
          currentPassInpainted.push(idx);
        }
      }
    }

    for (const idx of currentPassInpainted) {
      status[idx] = 0;
      remaining--;
    }
  }
}
