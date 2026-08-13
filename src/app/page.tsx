"use client";

import { useEffect, useState } from "react";
import DetectorApp from "@/components/detector-app";
import { BrowserSparkleScanner } from "@/lib/detector/browser-sparkle-scanner";
import type { SparkleDetectorConfig } from "@/lib/detector/types";
import type { LogoScanner } from "@/lib/scanner/scanner";
import sparkleConfig from "@/../authorized-datasets/step2b-v1/sparkle-detector.config.json";

export default function Home() {
  const [scanner, setScanner] = useState<LogoScanner | undefined>(undefined);

  useEffect(() => {
    try {
      const activeScanner = new BrowserSparkleScanner(sparkleConfig as SparkleDetectorConfig);
      setScanner(activeScanner);
    } catch (err) {
      console.error("Failed to initialize calibrated logo scanner:", err);
    }
  }, []);

  return <DetectorApp scanner={scanner} />;
}
