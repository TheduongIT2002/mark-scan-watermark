import { readFileSync } from "node:fs";
import type { LogoScanner, ScanInput, ScanOutput } from "@/lib/scanner/scanner";
import type { BoundingBox, MaskPreview } from "@/types";
import sharp from "sharp";
import { detectSparkleCandidate } from "./sparkle-core";
import type { SparkleDetectorConfig } from "./types";

export class NodeSparkleScanner implements LogoScanner {
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

  static async create(
    config: SparkleDetectorConfig,
    datasetRoot: string
  ): Promise<NodeSparkleScanner> {
    const canonicalPath = `${datasetRoot}/${config.canonicalLogo.path}`;
    // Verify canonical logo exists and is readable
    if (!readFileSync(canonicalPath)) {
      throw new Error(`Canonical logo missing at ${canonicalPath}`);
    }
    return new NodeSparkleScanner(config);
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
      let arrayBuffer: ArrayBuffer;
      if ("arrayBuffer" in input.file) {
        arrayBuffer = await input.file.arrayBuffer();
      } else {
        const buffer = await (input.file as unknown as Blob).arrayBuffer();
        arrayBuffer = buffer;
      }

      if (signal.aborted) {
        throw new DOMException("Cancelled by user.", "AbortError");
      }

      const inputBuffer = Buffer.from(arrayBuffer);
      const meta = await sharp(inputBuffer).metadata();
      const rawBuffer = await sharp(inputBuffer).greyscale().raw().toBuffer();
      const imgPixels = new Float32Array(rawBuffer);

      if (signal.aborted) {
        throw new DOMException("Cancelled by user.", "AbortError");
      }

      if (onProgress) onProgress(0.5);

      const width = meta.width ?? input.width;
      const height = meta.height ?? input.height;

      // Compute normalized anchor in target image coordinates
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
            message: "Failed to process input image.",
          },
        },
      };
    }
  }
}
