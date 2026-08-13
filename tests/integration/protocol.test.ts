import {describe,expect,it,vi} from "vitest";
import {DetectorPool} from "@/lib/detector/pool";
import {DEFAULT_CONFIG} from "@/lib/detector/config";
import type {WorkerRequest,WorkerResponse} from "@/workers/protocol";

class FakeWorker {
 onmessage:((event:MessageEvent<WorkerResponse>)=>void)|null=null;onerror:((event:ErrorEvent)=>void)|null=null;onmessageerror:((event:MessageEvent)=>void)|null=null;terminated=false;
 constructor(private behavior:"success"|"init-error"|"timeout"|"job-error"|"slow"="success"){}
 postMessage(message:WorkerRequest){
  if(message.type==="initialize"){if(this.behavior==="timeout")return;queueMicrotask(()=>this.emit(this.behavior==="init-error"?{type:"error",message:"WASM failed"}:{type:"ready"}));return;}
  if(message.type==="cancel"){queueMicrotask(()=>this.emit({type:"cancelled",jobId:message.jobId!}));return;}
  if(this.behavior==="slow")return;
  queueMicrotask(()=>this.emit(this.behavior==="job-error"?{type:"error",jobId:message.jobId,message:"decode failed"}:{type:"result",jobId:message.jobId,result:{id:message.jobId,fileName:message.fileName,status:"not-detected",confidence:.2,processingTimeMs:1,detectorVersion:"v1"}}));
 }
 terminate(){this.terminated=true;}
 private emit(data:WorkerResponse){this.onmessage?.({data} as MessageEvent<WorkerResponse>);}
}
const file=(name:string)=>new File([new Uint8Array([1,2,3])],name,{type:"image/jpeg"}),config={...DEFAULT_CONFIG,scales:[...DEFAULT_CONFIG.scales],thresholds:{...DEFAULT_CONFIG.thresholds}};
const callbacks=()=>({onProgress:vi.fn(),onResult:vi.fn(),onError:vi.fn(),onCancelled:vi.fn()});

describe("DetectorPool lifecycle",()=>{
 it("waits for ready, isolates a one-file failure, and terminates every worker",async()=>{const cb=callbacks(),workers=[new FakeWorker("job-error"),new FakeWorker("success")],pool=new DetectorPool(2,cb,{workerFactory:()=>workers.shift() as unknown as Worker});await pool.run([{id:"bad",file:file("bad.jpg")},{id:"good",file:file("good.jpg")}],file("template.jpg"),config);expect(cb.onError).toHaveBeenCalledTimes(1);expect(cb.onResult).toHaveBeenCalledTimes(1);expect(workers).toHaveLength(0);});
 it("surfaces OpenCV initialization failure and errors all jobs exactly once",async()=>{const cb=callbacks(),workers=[new FakeWorker("init-error"),new FakeWorker("init-error")],pool=new DetectorPool(2,cb,{workerFactory:()=>workers.shift() as unknown as Worker}),jobs=[{id:"x",file:file("x.jpg")},{id:"y",file:file("y.jpg")}];await expect(pool.run(jobs,file("template.jpg"),config)).rejects.toThrow(/WASM failed/);expect(cb.onError).toHaveBeenCalledTimes(2);expect(new Set(cb.onError.mock.calls.map(call=>call[0]))).toEqual(new Set(["x","y"]));expect(cb.onError.mock.calls.every(call=>String(call[1]).includes("WASM failed"))).toBe(true);expect(cb.onCancelled).not.toHaveBeenCalled();expect(workers).toHaveLength(0);});
 it("times out initialization, errors the job, and cleans up",async()=>{const cb=callbacks(),worker=new FakeWorker("timeout"),pool=new DetectorPool(1,cb,{initializationTimeoutMs:5,workerFactory:()=>worker as unknown as Worker});await expect(pool.run([{id:"x",file:file("x.jpg")}],file("template.jpg"),config)).rejects.toThrow(/timed out/);expect(cb.onError).toHaveBeenCalledOnce();expect(cb.onError).toHaveBeenCalledWith("x",expect.stringMatching(/timed out/));expect(cb.onCancelled).not.toHaveBeenCalled();expect(worker.terminated).toBe(true);});
 it("cancels active and queued jobs exactly once before resolving",async()=>{const cb=callbacks(),worker=new FakeWorker("slow"),pool=new DetectorPool(1,cb,{workerFactory:()=>worker as unknown as Worker}),running=pool.run([{id:"active",file:file("a.jpg")},{id:"queued",file:file("b.jpg")}],file("template.jpg"),config);await new Promise(resolve=>setTimeout(resolve,0));await pool.cancel();await running;expect(cb.onCancelled).toHaveBeenCalledTimes(2);expect(new Set(cb.onCancelled.mock.calls.flat())).toEqual(new Set(["active","queued"]));expect(worker.terminated).toBe(true);});
});
