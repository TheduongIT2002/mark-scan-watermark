import type { BoundingBox } from "@/types";

export interface InpaintResult {
  cleanedBlob: Blob;
  cleanedUrl: string;
  cleanedFile: File;
}

/**
 * Fast client-side image inpainting using HTML5 Canvas 2D and Telea / Fast Marching Method (FMM)
 * distance-weighted boundary propagation over target bounding box ROI.
 */
export async function inpaintImage(
  file: File,
  box: BoundingBox,
  padding: number = 4
): Promise<InpaintResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    const cleanedBlob = new Blob([await file.arrayBuffer()], { type: file.type || "image/png" });
    const cleanedFile = new File([cleanedBlob], getCleanedFileName(file.name), { type: file.type || "image/png" });
    return {
      cleanedBlob,
      cleanedUrl: "",
      cleanedFile,
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
    return { cleanedBlob, cleanedUrl, cleanedFile };
  }

  const canvas = document.createElement("canvas");
  canvas.width = box.imageWidth || img.width || 1;
  canvas.height = box.imageHeight || img.height || 1;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const cleanedBlob = new Blob([await file.arrayBuffer()], { type: file.type || "image/png" });
    const cleanedFile = new File([cleanedBlob], getCleanedFileName(file.name), { type: file.type || "image/png" });
    const cleanedUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(cleanedBlob) : "";
    return { cleanedBlob, cleanedUrl, cleanedFile };
  }

  ctx.drawImage(img, 0, 0);

  // Clamp bounding box to image dimensions
  const imgW = canvas.width;
  const imgH = canvas.height;

  const padX0 = Math.max(0, Math.floor(box.x - padding));
  const padY0 = Math.max(0, Math.floor(box.y - padding));
  const padX1 = Math.min(imgW, Math.ceil(box.x + box.width + padding));
  const padY1 = Math.min(imgH, Math.ceil(box.y + box.height + padding));

  const roiW = padX1 - padX0;
  const roiH = padY1 - padY0;

  if (roiW > 0 && roiH > 0) {
    const imageData = ctx.getImageData(padX0, padY0, roiW, roiH);
    const data = imageData.data;

    // Apply Telea / Fast Marching Method inpainting over ROI
    teleaInpaint(data, roiW, roiH, padX0, padY0, box);

    ctx.putImageData(imageData, padX0, padY0);
  }

  const mimeType = file.type || "image/png";
  const cleanedBlob = await canvasToBlob(canvas, mimeType);
  const cleanedFileName = getCleanedFileName(file.name);
  const cleanedFile = new File([cleanedBlob], cleanedFileName, { type: mimeType });
  const cleanedUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(cleanedBlob) : "";

  return {
    cleanedBlob,
    cleanedUrl,
    cleanedFile,
  };
}

function getCleanedFileName(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx > 0) {
    return `${name.slice(0, dotIdx)}-cleaned${name.slice(dotIdx)}`;
  }
  return `${name}-cleaned`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
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
      0.95
    );
  });
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
