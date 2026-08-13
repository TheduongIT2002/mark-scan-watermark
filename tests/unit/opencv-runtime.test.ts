import {describe,expect,it,vi} from "vitest";
import {resolveOpenCvRuntime} from "@/workers/opencv-runtime";
import type {OpenCvRuntime} from "@/workers/opencv-runtime";

const runtime=()=>({Mat:function Mat(){},matFromImageData:vi.fn()}) as unknown as OpenCvRuntime;

describe("resolveOpenCvRuntime",()=>{
 it("awaits an async OpenCV 5 module factory and supplies local asset resolution",async()=>{
  const value=runtime(),factory=vi.fn(async(options?:{locateFile?:(path:string)=>string})=>{
   expect(options?.locateFile?.("nested/opencv.wasm")).toBe("/detector-assets/opencv.wasm");return value;
  });
  await expect(resolveOpenCvRuntime(factory)).resolves.toBe(value);expect(factory).toHaveBeenCalledTimes(1);
 });
 it("awaits a promise runtime",async()=>{const value=runtime();await expect(resolveOpenCvRuntime(Promise.resolve(value))).resolves.toBe(value);});
 it("accepts an already-ready runtime",async()=>{const value=runtime();await expect(resolveOpenCvRuntime(value)).resolves.toBe(value);});
 it("surfaces thrown factory errors",async()=>{await expect(resolveOpenCvRuntime(()=>{throw new Error("WASM failed");})).rejects.toThrow(/WASM failed/);});
 it("remains pending for an unresolved module so the pool timeout retains ownership",async()=>{
  const state=await Promise.race([resolveOpenCvRuntime(new Promise<OpenCvRuntime>(()=>{})).then(()=>"resolved"),new Promise(resolve=>setTimeout(()=>resolve("pending"),5))]);expect(state).toBe("pending");
 });
});
