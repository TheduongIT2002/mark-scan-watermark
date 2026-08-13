"use client";

import { useState } from "react";
import DetectorApp from "@/components/detector-app";
import { BrowserSparkleScanner } from "@/lib/detector/browser-sparkle-scanner";
import type { SparkleDetectorConfig } from "@/lib/detector/types";
import type { LogoScanner } from "@/lib/scanner/scanner";
import sparkleConfig from "@/../authorized-datasets/step2b-v1/sparkle-detector.config.json";

export default function Home() {
  const [scanner] = useState<LogoScanner | undefined>(() => {
    try {
      return new BrowserSparkleScanner(sparkleConfig as SparkleDetectorConfig);
    } catch (err) {
      console.error("Failed to initialize calibrated logo scanner:", err);
      return undefined;
    }
  });

  return <DetectorApp scanner={scanner} />;
}
