import type { DetectorConfig } from "@/types";
import { sha256 as sha256Fallback } from "@noble/hashes/sha256";

export const SUPPORTED_MIME = new Set(["image/jpeg","image/png","image/webp"]);
export interface ValidationLimits { maxFiles:number; maxFileBytes:number }
export const DEFAULT_LIMITS:ValidationLimits = { maxFiles:50, maxFileBytes:25*1024*1024 };
const signatures = { jpeg:[0xff,0xd8,0xff], png:[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], webp:[0x52,0x49,0x46,0x46] } as const;

export async function validateImage(file:File, limits=DEFAULT_LIMITS):Promise<string|null> {
  if (!SUPPORTED_MIME.has(file.type)) return "Unsupported format. Use JPG, PNG, or WebP.";
  if (file.size === 0) return "The file is empty or corrupted.";
  if (file.size > limits.maxFileBytes) return `File exceeds ${Math.round(limits.maxFileBytes/1048576)} MB.`;
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  const match=(signature:readonly number[], at=0)=>signature.every((value,index)=>bytes[index+at]===value);
  const valid = file.type==="image/jpeg" ? match(signatures.jpeg) : file.type==="image/png" ? match(signatures.png) : match(signatures.webp)&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  return valid ? null : "File signature does not match its declared image type.";
}

export async function decodeImage(file:File):Promise<{width:number;height:number}> {
  let bitmap:ImageBitmap|undefined;
  try {
    bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    return {width:bitmap.width,height:bitmap.height};
  } catch {
    throw new Error("Image cannot be decoded. The file may be corrupt or unsupported by this browser.");
  } finally { bitmap?.close(); }
}

export function templateCompatibility(template:{width:number;height:number}, image:{width:number;height:number}, config:DetectorConfig):string|null {
  const roiWidth=Math.max(1,Math.round(image.width*config.roiWidthRatio));
  const roiHeight=Math.max(1,Math.round(image.height*config.roiHeightRatio));
  const fits=config.scales.some(scale=>Math.max(1,Math.round(template.width*scale))<=roiWidth&&Math.max(1,Math.round(template.height*scale))<=roiHeight);
  if(fits)return null;
  const minimumScale=Math.min(...config.scales);
  return `Template ${template.width}×${template.height} does not fit this image's bottom-right ROI (${roiWidth}×${roiHeight}) at any configured scale. Crop the template to at most ${Math.floor(roiWidth/minimumScale)}×${Math.floor(roiHeight/minimumScale)} px or use a larger source image.`;
}

export async function fingerprint(file:File):Promise<string> {
  const bytes=new Uint8Array(await file.arrayBuffer());
  let hash=2166136261;
  for(const byte of bytes){hash^=byte;hash=Math.imul(hash,16777619);}
  return `${file.size}:${(hash>>>0).toString(16)}`;
}

export async function sha256(file:Blob):Promise<import("@/types").ContentHash>{
  const bytes=new Uint8Array(await file.arrayBuffer());
  const subtle=globalThis.crypto?.subtle;
  const digest=subtle
    ?new Uint8Array(await subtle.digest("SHA-256",bytes))
    :sha256Fallback(bytes);
  return {algorithm:"SHA-256",hex:Array.from(digest,byte=>byte.toString(16).padStart(2,"0")).join("")};
}

