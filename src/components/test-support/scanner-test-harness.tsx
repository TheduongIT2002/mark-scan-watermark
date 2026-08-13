"use client";
import DetectorApp from "@/components/detector-app";
import type {LogoScanner} from "@/lib/scanner/scanner";
const scanner:LogoScanner={detectorVersion:"e2e-mask-v1",configVersion:"e2e-config-v1",async scan(input,signal){if(signal.aborted)throw new DOMException("Cancelled by user.","AbortError");const bounds={x:input.width-20,y:input.height-20,width:20,height:20,imageWidth:input.width,imageHeight:input.height},maskHash={algorithm:"SHA-256" as const,hex:"cd".repeat(32)};return {result:{itemId:input.itemId,sourceHash:input.sourceHash,status:"review",confidence:.95,boundingBox:bounds,detectorVersion:this.detectorVersion,configVersion:this.configVersion,scannedAt:"2026-01-01T00:00:00.000Z",processingTimeMs:1},mask:{maskId:"e2e-genuine-mask",itemId:input.itemId,sourceHash:input.sourceHash,maskHash,version:"e2e-mask-v1",encoding:"binary-rle",width:input.width,height:input.height,bounds}}}};
export default function ScannerTestHarness(){return <DetectorApp scanner={scanner}/>;}
