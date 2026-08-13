"use client";
import type { DetectionResult, DetectorConfig } from "@/types";
import type { WorkerResponse } from "@/workers/protocol";

export interface PoolJob { id:string; file:File }
export interface PoolCallbacks { onProgress:(id:string,value:number)=>void; onResult:(result:DetectionResult)=>void; onError:(id:string,message:string)=>void; onCancelled:(id:string)=>void }
export interface PoolOptions { initializationTimeoutMs?:number; workerFactory?:()=>Worker }

const messageFor=(event:ErrorEvent|MessageEvent)=>event instanceof ErrorEvent&&event.message?event.message:"Worker communication failed.";

export class DetectorPool {
 private workers=new Set<Worker>();
 private active=new Map<string,Worker>();
 private pending=new Set<string>();
 private terminal=new Set<string>();
 private stopped=false;
 private cancellationRequested=false;
 private running=false;
 private readonly timeoutMs:number;
 private readonly workerFactory:()=>Worker;

 constructor(private size:number,private callbacks:PoolCallbacks,options:PoolOptions={}){
  this.timeoutMs=options.initializationTimeoutMs??20_000;
  this.workerFactory=options.workerFactory??(()=>new Worker(new URL("../../workers/detector.worker.ts",import.meta.url)));
 }

 async run(jobs:PoolJob[],template:File,config:DetectorConfig):Promise<void>{
  if(this.running)throw new Error("Detector pool is already running.");
  this.running=true;this.stopped=false;this.cancellationRequested=false;this.terminal.clear();this.pending=new Set(jobs.map(job=>job.id));
  const queue=[...jobs];let failure:unknown;
  try{
   const templateBytes=await template.arrayBuffer();
   const runners=Array.from({length:Math.min(Math.max(1,this.size),jobs.length)},()=>this.runWorker(queue,templateBytes,template.type,config));
   const settled=await Promise.allSettled(runners);
   failure=settled.find((entry):entry is PromiseRejectedResult=>entry.status==="rejected")?.reason;
   if(failure&&!this.cancellationRequested)throw failure;
  }catch(error){failure=error;throw error;}
  finally{
   const message=failure instanceof Error?failure.message:"Detector failed before processing completed.";
   for(const job of jobs)if(!this.terminal.has(job.id)){
    if(this.cancellationRequested)this.finishCancelled(job.id);
    else this.finishError(job.id,message);
   }
   for(const worker of this.workers)worker.terminate();
   this.workers.clear();this.active.clear();this.pending.clear();this.running=false;
  }
 }

 private async runWorker(queue:PoolJob[],templateBytes:ArrayBuffer,templateMime:string,config:DetectorConfig){
  let worker:Worker;
  try{worker=this.workerFactory();}catch(error){throw new Error(`Unable to construct detector worker: ${error instanceof Error?error.message:"unknown error"}`);}
  this.workers.add(worker);
  try{
   await this.initialize(worker,templateBytes.slice(0),templateMime);
   while(!this.stopped){
    const job=queue.shift();if(!job)break;
    this.pending.delete(job.id);this.active.set(job.id,worker);
    await this.process(worker,job,config);
    this.active.delete(job.id);
   }
  }finally{worker.terminate();this.workers.delete(worker);}
 }

 private initialize(worker:Worker,template:ArrayBuffer,templateMime:string):Promise<void>{
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>fail(`OpenCV initialization timed out after ${this.timeoutMs} ms.`),this.timeoutMs);
   const cleanup=()=>{clearTimeout(timer);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;};
   const fail=(message:string)=>{cleanup();reject(new Error(message));};
   worker.onerror=event=>{event.preventDefault?.();fail(`Detector worker failed during initialization: ${messageFor(event)}`);};
   worker.onmessageerror=event=>fail(`Detector worker message error during initialization: ${messageFor(event)}`);
   worker.onmessage=({data}:MessageEvent<WorkerResponse>)=>{if(data.type==="ready"){cleanup();resolve();}else if(data.type==="error"&&!data.jobId)fail(`OpenCV initialization failed: ${data.message}`);};
   worker.postMessage({type:"initialize",template,templateMime},[template]);
  });
 }

 private async process(worker:Worker,job:PoolJob,config:DetectorConfig):Promise<void>{
  if(this.stopped){this.finishCancelled(job.id);return;}
  let bytes:ArrayBuffer;
  try{bytes=await job.file.arrayBuffer();}catch(error){this.finishError(job.id,error instanceof Error?error.message:"Unable to read image bytes.");return;}
  if(this.stopped){this.finishCancelled(job.id);return;}
  await new Promise<void>(resolve=>{
   const finish=(action:()=>void)=>{worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;action();resolve();};
   worker.onerror=event=>{event.preventDefault?.();finish(()=>this.finishError(job.id,`Detector worker failed: ${messageFor(event)}`));};
   worker.onmessageerror=event=>finish(()=>this.finishError(job.id,`Detector worker message error: ${messageFor(event)}`));
   worker.onmessage=({data}:MessageEvent<WorkerResponse>)=>{
    if("jobId" in data&&data.jobId!==job.id)return;
    if(data.type==="progress")this.callbacks.onProgress(job.id,data.progress);
    else if(data.type==="result")finish(()=>this.finishResult(data.result));
    else if(data.type==="cancelled")finish(()=>this.finishCancelled(job.id));
    else if(data.type==="error"&&data.jobId)finish(()=>this.finishError(job.id,data.message));
   };
   worker.postMessage({type:"process",jobId:job.id,fileName:job.file.name,image:bytes,mimeType:job.file.type,config},[bytes]);
  });
 }

 private finishResult(result:DetectionResult){if(this.markTerminal(result.id))this.callbacks.onResult(result);}
 private finishError(id:string,message:string){if(this.markTerminal(id))this.callbacks.onError(id,message);}
 private finishCancelled(id:string){if(this.markTerminal(id))this.callbacks.onCancelled(id);}
 private markTerminal(id:string){if(this.terminal.has(id))return false;this.terminal.add(id);this.pending.delete(id);this.active.delete(id);return true;}

 async cancel():Promise<void>{
  this.cancellationRequested=true;this.stopped=true;
  for(const id of this.pending)this.finishCancelled(id);
  for(const [jobId,worker] of this.active)worker.postMessage({type:"cancel",jobId});
 }
}

