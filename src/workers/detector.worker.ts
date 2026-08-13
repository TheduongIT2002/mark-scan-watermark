/// <reference lib="webworker" />
import { classifyConfidence, DETECTOR_VERSION } from "@/lib/detector/config";
import type { WorkerRequest, WorkerResponse } from "./protocol";

declare const cv:import("./opencv-runtime").OpenCvSource;
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
let templateData:ImageData|null=null;
let runtime:import("./opencv-runtime").OpenCvRuntime|null=null;
let initializing:Promise<void>|null=null;
const cancelled=new Set<string>();
const send=(message:WorkerResponse)=>ctx.postMessage(message);

async function ensureRuntime():Promise<void>{
 if(runtime)return;
 if(initializing)return initializing;
 initializing=(async()=>{
  try{
   importScripts("/detector-assets/opencv.js");
   if(typeof cv==="undefined")throw new Error("OpenCV script loaded without exposing a module.");
   const {resolveOpenCvRuntime}=await import("./opencv-runtime");
   runtime=await resolveOpenCvRuntime(cv);
  }catch(error){initializing=null;throw error;}
 })();
 return initializing;
}
async function decode(buffer:ArrayBuffer,mime:string):Promise<ImageBitmap>{return createImageBitmap(new Blob([buffer],{type:mime}),{imageOrientation:"from-image"});}
function pixels(bitmap:ImageBitmap):ImageData{const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const context=canvas.getContext("2d");if(!context)throw new Error("Canvas 2D is unavailable.");context.drawImage(bitmap,0,0);return context.getImageData(0,0,bitmap.width,bitmap.height);}

async function initialize(message:Extract<WorkerRequest,{type:"initialize"}>){
 let bitmap:ImageBitmap|undefined;
 try{await ensureRuntime();bitmap=await decode(message.template,message.templateMime);templateData=pixels(bitmap);send({type:"ready"});}
 catch(error){send({type:"error",message:error instanceof Error?error.message:"Detector initialization failed."});}
 finally{bitmap?.close();}
}

async function processJob(message:Extract<WorkerRequest,{type:"process"}>){
 const started=performance.now();let bitmap:ImageBitmap|undefined;const mats:Array<{delete():void}>=[];
 try{
  const cvRuntime=runtime;
  if(!cvRuntime||!templateData)throw new Error("Detector is not initialized.");
  bitmap=await decode(message.image,message.mimeType);
  if(cancelled.has(message.jobId)){send({type:"cancelled",jobId:message.jobId});return;}
  const source=cvRuntime.matFromImageData(pixels(bitmap));const templBase=cvRuntime.matFromImageData(templateData);mats.push(source,templBase);
  const gray=new cvRuntime.Mat(),templGray=new cvRuntime.Mat();mats.push(gray,templGray);cvRuntime.cvtColor(source,gray,cvRuntime.COLOR_RGBA2GRAY);cvRuntime.cvtColor(templBase,templGray,cvRuntime.COLOR_RGBA2GRAY);
  const roiW=Math.max(1,Math.round(gray.cols*message.config.roiWidthRatio)),roiH=Math.max(1,Math.round(gray.rows*message.config.roiHeightRatio));
  const compatible=message.config.scales.some(scale=>Math.max(1,Math.round(templGray.cols*scale))<=roiW&&Math.max(1,Math.round(templGray.rows*scale))<=roiH);
  if(!compatible)throw new Error(`Template ${templGray.cols}×${templGray.rows} does not fit the bottom-right ROI ${roiW}×${roiH} at any configured scale.`);
  const roiX=gray.cols-roiW,roiY=gray.rows-roiH,roi=gray.roi(new cvRuntime.Rect(roiX,roiY,roiW,roiH));mats.push(roi);
  let best=-1,bestBox:{x:number;y:number;width:number;height:number}|undefined;
  for(let index=0;index<message.config.scales.length;index++){
   if(cancelled.has(message.jobId)){send({type:"cancelled",jobId:message.jobId});return;}
   const scale=message.config.scales[index],scaled=new cvRuntime.Mat();mats.push(scaled);cvRuntime.resize(templGray,scaled,new cvRuntime.Size(0,0),scale,scale,cvRuntime.INTER_AREA);
   if(scaled.cols<=roi.cols&&scaled.rows<=roi.rows){const output=new cvRuntime.Mat();mats.push(output);cvRuntime.matchTemplate(roi,scaled,output,cvRuntime.TM_CCOEFF_NORMED);const match=cvRuntime.minMaxLoc(output,null);if(match.maxVal>best){best=match.maxVal;bestBox={x:roiX+match.maxLoc.x,y:roiY+match.maxLoc.y,width:scaled.cols,height:scaled.rows};}}
   send({type:"progress",jobId:message.jobId,progress:(index+1)/message.config.scales.length});
  }
  const confidence=Math.max(0,Math.min(1,best));
  send({type:"result",jobId:message.jobId,result:{id:message.jobId,fileName:message.fileName,status:classifyConfidence(confidence,message.config.thresholds),confidence,boundingBox:bestBox?{...bestBox,imageWidth:bitmap.width,imageHeight:bitmap.height}:undefined,processingTimeMs:Math.round(performance.now()-started),detectorVersion:DETECTOR_VERSION}});
 }catch(error){send({type:"error",jobId:message.jobId,message:error instanceof Error?error.message:"Detection failed."});}
 finally{for(let index=mats.length-1;index>=0;index--)mats[index].delete();bitmap?.close();cancelled.delete(message.jobId);}
}

ctx.onmessage=({data}:MessageEvent<WorkerRequest>)=>{if(data.type==="cancel"){if(data.jobId)cancelled.add(data.jobId);return;}if(data.type==="initialize"){void initialize(data);return;}void processJob(data);};
export {};

