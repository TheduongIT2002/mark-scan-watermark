import type { DatasetBox, DatasetHash } from "@/lib/dataset/types";

export interface ConfigQualityGates {
  minPrecision: number;
  minRecall: number;
  maxFalsePositiveRate: number;
  maxLatencyP95Ms: number;
  minBoxIoU: number;
}

export interface SparkleDetectorConfig {
  schemaVersion: 1;
  detectorVersion: string;
  configVersion: string;
  datasetId: string;
  datasetHash: DatasetHash;
  canonicalLogo: {
    path: string;
    sha256: string;
    width: number;
    height: number;
  };
  templateSubregion: DatasetBox;
  templateHighPass: number[];
  referenceDimensions: {
    width: number;
    height: number;
  };
  searchAnchor: DatasetBox;
  searchAnchorNormalized: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  searchRadius: {
    dx: number;
    dy: number;
  };
  searchRadiusNormalized: {
    dx: number;
    dy: number;
  };
  algorithm: {
    name: "local-highpass-zncc";
    version: string;
  };
  threshold: number;
  gates: ConfigQualityGates;
  configHash: DatasetHash;
}

export interface SparkleDetectionCandidate {
  score: number;
  boundingBox: DatasetBox;
}
