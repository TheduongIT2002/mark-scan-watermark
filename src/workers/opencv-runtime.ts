import type openCvType from "@techstark/opencv-js";

export type OpenCvRuntime=typeof openCvType;
type OpenCvModuleOptions={locateFile?:(path:string)=>string};
export type OpenCvSource=OpenCvRuntime|PromiseLike<OpenCvRuntime>|((options?:OpenCvModuleOptions)=>OpenCvRuntime|PromiseLike<OpenCvRuntime>);

function isRuntime(value:unknown):value is OpenCvRuntime{
 return typeof value==="object"&&value!==null&&typeof (value as Partial<OpenCvRuntime>).Mat==="function"&&typeof (value as Partial<OpenCvRuntime>).matFromImageData==="function";
}

export async function resolveOpenCvRuntime(source:OpenCvSource,assetRoot="/detector-assets/"):Promise<OpenCvRuntime>{
 try{
  const candidate=typeof source==="function"
   ?await source({locateFile:path=>`${assetRoot}${path.split("/").pop()??path}`})
   :await source;
  if(!isRuntime(candidate))throw new Error("OpenCV module resolved without a usable Mat runtime.");
  return candidate;
 }catch(error){
  throw new Error(`OpenCV module failed to initialize: ${error instanceof Error?error.message:"unknown error"}`);
 }
}
