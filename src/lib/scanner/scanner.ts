import type {ContentHash,MaskPreview,ScanResult} from "@/types";
import {validateScanOutput} from "./validate-output";
export interface ScanInput { itemId:string;file:File;sourceHash:ContentHash;width:number;height:number }
export interface ScanOutput { result:ScanResult;mask?:MaskPreview }
export interface LogoScanner { readonly detectorVersion:string;readonly configVersion:string;scan(input:ScanInput,signal:AbortSignal,onProgress?:(value:number)=>void):Promise<ScanOutput> }
export async function runValidatedScan(scanner:LogoScanner,input:ScanInput,signal:AbortSignal,onProgress?:(value:number)=>void){return validateScanOutput(input,await scanner.scan(input,signal,onProgress));}
export const FIXED_LOGO_NOT_CONFIGURED="Fixed-logo detector not configured. Step 2 requires a canonical owned-logo asset and a representative labeled positive/negative dataset.";
export class UnconfiguredLogoScanner implements LogoScanner {readonly detectorVersion="fixed-logo-unconfigured";readonly configVersion="step1-unconfigured";async scan(input:ScanInput,signal:AbortSignal):Promise<ScanOutput>{if(signal.aborted)throw new DOMException("Cancelled by user.","AbortError");return {result:{itemId:input.itemId,sourceHash:input.sourceHash,status:"error",detectorVersion:this.detectorVersion,configVersion:this.configVersion,scannedAt:new Date().toISOString(),processingTimeMs:0,error:{code:"DETECTOR_NOT_CONFIGURED",message:FIXED_LOGO_NOT_CONFIGURED}}};}}
