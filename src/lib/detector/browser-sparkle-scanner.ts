import type { LogoScanner, ScanInput, ScanOutput } from "@/lib/scanner/scanner";
import type { BoundingBox, MaskPreview } from "@/types";
import type { SparkleDetectorConfig } from "./types";
import { detectSparkleCandidate } from "./sparkle-core";

export class BrowserSparkleScanner implements LogoScanner {
  readonly detectorVersion: string;
  readonly configVersion: string;
  private readonly config: SparkleDetectorConfig;
  private readonly templatePixels: Float32Array;

  constructor(config: SparkleDetectorConfig) {
    this.config = config;
    this.detectorVersion = config.detectorVersion;
    this.configVersion = config.configVersion;
    this.templatePixels = new Float32Array(config.templateHighPass);
  }

  async scan(
    input: ScanInput,
    signal: AbortSignal,
    onProgress?: (value: number) => void
  ): Promise<ScanOutput> {
    if (signal.aborted) {
      throw new DOMException("Cancelled by user.", "AbortError");
    }

    const startTime = performance.now();
    if (onProgress) onProgress(0.1);

    try {
      // Decode image in browser using HTMLImageElement or ImageBitmap
      const imgUrl = URL.createObjectURL(input.file);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image into browser canvas."));
        img.src = imgUrl;
      });
      URL.revokeObjectURL(imgUrl);

      if (signal.aborted) {
        throw new DOMException("Cancelled by user.", "AbortError");
      }

      if (onProgress) onProgress(0.4);

      const width = img.naturalWidth || input.width;
      const height = img.naturalHeight || input.height;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable.");

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);

      // Convert RGBA to Grayscale Float32Array
      const imgPixels = new Float32Array(width * height);
      const data = imgData.data;
      for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        imgPixels[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      if (signal.aborted) {
        throw new DOMException("Cancelled by user.", "AbortError");
      }
      if (onProgress) onProgress(0.7);

      const anchorX = Math.round(this.config.searchAnchorNormalized.x * width);
      const anchorY = Math.round(this.config.searchAnchorNormalized.y * height);
      const anchorW = Math.round(this.config.searchAnchorNormalized.width * width);
      const anchorH = Math.round(this.config.searchAnchorNormalized.height * height);

      const candidate = detectSparkleCandidate({
        imgPixels,
        imgWidth: width,
        imgHeight: height,
        tplPixels: this.templatePixels,
        tplWidth: 52,
        tplHeight: 52,
        subregion: { x: 0, y: 0, width: 52, height: 52 },
        anchor: { x: anchorX, y: anchorY, width: anchorW, height: anchorH },
        searchRadius: this.config.searchRadius,
        signal,
      });

      if (onProgress) onProgress(1.0);
      const processingTimeMs = Math.round(performance.now() - startTime);
      const scannedAt = new Date().toISOString();

      const fullBox: BoundingBox = {
        ...candidate.boundingBox,
        imageWidth: input.width,
        imageHeight: input.height,
      };

      if (candidate.score >= this.config.threshold) {
        const mask: MaskPreview = {
          maskId: `mask_${input.itemId}_v1`,
          itemId: input.itemId,
          sourceHash: input.sourceHash,
          maskHash: { algorithm: "SHA-256", hex: "0".repeat(64) },
          version: "provisional-v1",
          encoding: "svg-path",
          width: input.width,
          height: input.height,
          bounds: fullBox,
        };

        return {
          result: {
            itemId: input.itemId,
            sourceHash: input.sourceHash,
            status: "review",
            confidence: candidate.score,
            detectorVersion: this.detectorVersion,
            configVersion: this.configVersion,
            scannedAt,
            processingTimeMs,
            boundingBox: fullBox,
          },
          mask,
        };
      }

      return {
        result: {
          itemId: input.itemId,
          sourceHash: input.sourceHash,
          status: "not-found",
          confidence: candidate.score,
          detectorVersion: this.detectorVersion,
          configVersion: this.configVersion,
          scannedAt,
          processingTimeMs,
        },
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      const processingTimeMs = Math.round(performance.now() - startTime);
      return {
        result: {
          itemId: input.itemId,
          sourceHash: input.sourceHash,
          status: "error",
          detectorVersion: this.detectorVersion,
          configVersion: this.configVersion,
          scannedAt: new Date().toISOString(),
          processingTimeMs,
          error: {
            code: "DECODE_FAILED",
            message: err instanceof Error ? err.message : "Failed to process image.",
          },
        },
      };
    }
  }
}
