import type { DetectionResult, DetectorConfig } from "@/types";
export type WorkerRequest =
 | { type:"initialize"; template:ArrayBuffer; templateMime:string }
 | { type:"process"; jobId:string; fileName:string; image:ArrayBuffer; mimeType:string; config:DetectorConfig }
 | { type:"cancel"; jobId?:string };
export type WorkerResponse =
 | { type:"ready" }
 | { type:"progress"; jobId:string; progress:number }
 | { type:"result"; jobId:string; result:DetectionResult }
 | { type:"cancelled"; jobId:string }
 | { type:"error"; jobId?:string; message:string };
