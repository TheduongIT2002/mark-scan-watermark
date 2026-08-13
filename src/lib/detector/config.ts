import type { DetectionStatus, Thresholds } from "@/types";
export const DETECTOR_VERSION = "opencv-template-v1";
export const DEFAULT_CONFIG = { roiWidthRatio: .15, roiHeightRatio: .15, scales: [.85,.925,1,1.075,1.15], thresholds: { detected:.85, review:.65 } } as const;
export function classifyConfidence(confidence:number, thresholds:Thresholds):DetectionStatus {
  if (!Number.isFinite(confidence)) return "error";
  if (confidence >= thresholds.detected) return "detected";
  if (confidence >= thresholds.review) return "needs-review";
  return "not-detected";
}
