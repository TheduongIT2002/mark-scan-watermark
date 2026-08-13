import type { DatasetBox } from "@/lib/dataset/types";
import type { SparkleDetectionCandidate } from "./types";

export interface SparkleCoreParams {
  imgPixels: Float32Array | Uint8Array;
  imgWidth: number;
  imgHeight: number;
  tplPixels: Float32Array | Uint8Array;
  tplWidth: number;
  tplHeight: number;
  subregion: DatasetBox;
  anchor: DatasetBox;
  searchRadius: { dx: number; dy: number };
  signal?: AbortSignal;
}

export function localHighPass(
  pixels: Float32Array | Uint8Array,
  w: number,
  h: number,
  radius = 5
): Float32Array {
  const side = radius * 2 + 1;

  const temp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      const cx = Math.min(Math.max(x, 0), w - 1);
      sum += pixels[y * w + cx];
    }
    temp[y * w + 0] = sum / side;
    for (let x = 1; x < w; x++) {
      const addX = Math.min(x + radius, w - 1);
      const remX = Math.max(x - radius - 1, 0);
      sum += pixels[y * w + addX] - pixels[y * w + remX];
      temp[y * w + x] = sum / side;
    }
  }

  const hp = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      const cy = Math.min(Math.max(y, 0), h - 1);
      sum += temp[cy * w + x];
    }
    hp[0 * w + x] = pixels[0 * w + x] - (sum / side);
    for (let y = 1; y < h; y++) {
      const addY = Math.min(y + radius, h - 1);
      const remY = Math.max(y - radius - 1, 0);
      sum += temp[addY * w + x] - temp[remY * w + x];
      hp[y * w + x] = pixels[y * w + x] - (sum / side);
    }
  }

  return hp;
}

export function extractSubregion(
  pixels: Float32Array | Uint8Array,
  width: number,
  subX: number,
  subY: number,
  subW: number,
  subH: number
): Float32Array {
  const out = new Float32Array(subW * subH);
  for (let dy = 0; dy < subH; dy++) {
    for (let dx = 0; dx < subW; dx++) {
      out[dy * subW + dx] = pixels[(subY + dy) * width + (subX + dx)];
    }
  }
  return out;
}

export function computeZNCC(tpl: Float32Array, patch: Float32Array): number {
  const len = tpl.length;
  let tSum = 0;
  let pSum = 0;
  for (let i = 0; i < len; i++) {
    tSum += tpl[i];
    pSum += patch[i];
  }
  const tMean = tSum / len;
  const pMean = pSum / len;

  let num = 0;
  let tDen = 0;
  let pDen = 0;
  for (let i = 0; i < len; i++) {
    const tv = tpl[i] - tMean;
    const pv = patch[i] - pMean;
    num += tv * pv;
    tDen += tv * tv;
    pDen += pv * pv;
  }

  if (tDen <= 1e-6 || pDen <= 1e-6) return 0;
  return num / Math.sqrt(tDen * pDen);
}

export function detectSparkleCandidate(params: SparkleCoreParams): SparkleDetectionCandidate {
  const {
    imgPixels,
    imgWidth,
    imgHeight,
    tplPixels,
    tplWidth,
    tplHeight,
    subregion,
    anchor,
    searchRadius,
    signal,
  } = params;

  // High-pass filter template image (or use subregion if already high-pass)
  let tplSubHp: Float32Array;
  if (tplWidth === subregion.width && tplHeight === subregion.height) {
    tplSubHp = tplPixels instanceof Float32Array ? tplPixels : new Float32Array(tplPixels);
  } else {
    const tplHp = localHighPass(tplPixels, tplWidth, tplHeight, 5);
    tplSubHp = extractSubregion(
      tplHp,
      tplWidth,
      subregion.x,
      subregion.y,
      subregion.width,
      subregion.height
    );
  }

  // High-pass filter input image
  const imgHp = localHighPass(imgPixels, imgWidth, imgHeight, 5);

  let bestScore = -1;
  let bestDist = Infinity;
  let bestBox: DatasetBox = {
    x: anchor.x,
    y: anchor.y,
    width: anchor.width,
    height: anchor.height,
  };

  const step = 1;
  const subW = subregion.width;
  const subH = subregion.height;

  for (let dy = -searchRadius.dy; dy <= searchRadius.dy; dy += step) {
    if (signal?.aborted) {
      throw new DOMException("Cancelled by user.", "AbortError");
    }

    const candY = anchor.y + dy;
    if (candY < 0 || candY + subH > imgHeight) continue;

    for (let dx = -searchRadius.dx; dx <= searchRadius.dx; dx += step) {
      const candX = anchor.x + dx;
      if (candX < 0 || candX + subW > imgWidth) continue;

      const patchHp = extractSubregion(
        imgHp,
        imgWidth,
        candX,
        candY,
        subW,
        subH
      );

      const score = Math.abs(computeZNCC(tplSubHp, patchHp));
      const dist = dx * dx + dy * dy;

      // Deterministic tie-breaking: prefer higher score, then smaller distance from anchor
      if (score > bestScore + 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && dist < bestDist)) {
        bestScore = score;
        bestDist = dist;
        bestBox = {
          x: candX,
          y: candY,
          width: subW,
          height: subH,
        };
      }
    }
  }

  return {
    score: Math.max(0, Math.min(1, bestScore)),
    boundingBox: bestBox,
  };
}
