import {describe,expect,it} from "vitest";
import {FIXED_LOGO_NOT_CONFIGURED,UnconfiguredLogoScanner} from "@/lib/scanner/scanner";
const hash={algorithm:"SHA-256" as const,hex:"ab".repeat(32)};
describe("LogoScanner",()=>{
 it("fails closed without fabricating detection data",async()=>{const output=await new UnconfiguredLogoScanner().scan({itemId:"1",file:new File(["x"],"x.jpg"),sourceHash:hash,width:1,height:1},new AbortController().signal);expect(output.result).toMatchObject({status:"error",error:{code:"DETECTOR_NOT_CONFIGURED",message:FIXED_LOGO_NOT_CONFIGURED}});expect(output.result.confidence).toBeUndefined();expect(output.result.boundingBox).toBeUndefined();expect(output.mask).toBeUndefined();});
 it("uses explicit cancellation semantics",async()=>{const controller=new AbortController();controller.abort();await expect(new UnconfiguredLogoScanner().scan({itemId:"1",file:new File(["x"],"x.jpg"),sourceHash:hash,width:1,height:1},controller.signal)).rejects.toMatchObject({name:"AbortError"});});
});
