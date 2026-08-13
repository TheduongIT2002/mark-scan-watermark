import type {BoundingBox,ContentHash,ScanResult} from "@/types";
import type {ScanInput,ScanOutput} from "./scanner";
export const INVALID_SCAN_OUTPUT="Scanner returned invalid or inconsistent data. Re-run the scan; if this continues, verify the authorized detector asset and configuration.";
const hash=(value:ContentHash|undefined)=>value?.algorithm==="SHA-256"&&/^[a-f0-9]{64}$/i.test(value.hex);
const sameHash=(a:ContentHash|undefined,b:ContentHash|undefined)=>hash(a)&&hash(b)&&a!.hex.toLowerCase()===b!.hex.toLowerCase();
const bounds=(value:BoundingBox|undefined,width:number,height:number)=>!!value&&[value.x,value.y,value.width,value.height,value.imageWidth,value.imageHeight].every(Number.isFinite)&&value.width>0&&value.height>0&&value.x>=0&&value.y>=0&&value.imageWidth===width&&value.imageHeight===height&&value.x+value.width<=width&&value.y+value.height<=height;
const sameBounds=(a:BoundingBox,b:BoundingBox)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height&&a.imageWidth===b.imageWidth&&a.imageHeight===b.imageHeight;
function invalid(input:ScanInput,output:ScanOutput):ScanOutput{const result:ScanResult={itemId:input.itemId,sourceHash:input.sourceHash,status:"error",detectorVersion:output.result.detectorVersion||"invalid-scanner",configVersion:output.result.configVersion||"invalid-scanner",scannedAt:new Date().toISOString(),processingTimeMs:0,error:{code:"INVALID_SCAN_OUTPUT",message:INVALID_SCAN_OUTPUT}};return {result};}
export function validateScanOutput(input:ScanInput,output:ScanOutput):ScanOutput{
 const {result,mask}=output;if(result.itemId!==input.itemId||!sameHash(result.sourceHash,input.sourceHash)||!hash(input.sourceHash))return invalid(input,output);
 if(!result.detectorVersion.trim()||!result.configVersion.trim()||!Number.isFinite(result.processingTimeMs)||result.processingTimeMs<0)return invalid(input,output);
 if(result.confidence!==undefined&&(!Number.isFinite(result.confidence)||result.confidence<0||result.confidence>1))return invalid(input,output);
 if(result.boundingBox&&!bounds(result.boundingBox,input.width,input.height))return invalid(input,output);
 if(result.status==="review"){
  if(!mask||!mask.maskId.trim()||!mask.version.trim()||mask.itemId!==input.itemId||!sameHash(mask.sourceHash,input.sourceHash)||!hash(mask.maskHash)||mask.width!==input.width||mask.height!==input.height||!bounds(mask.bounds,input.width,input.height)||!result.boundingBox||!sameBounds(result.boundingBox,mask.bounds))return invalid(input,output);
 }else if(mask)return invalid(input,output);
 return output;
}
