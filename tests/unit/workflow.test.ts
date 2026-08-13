import {describe,expect,it} from "vitest";
import {canTransition,decide,transition} from "@/lib/workflow";
import type {MaskPreview,QueuedImage} from "@/types";
const hash={algorithm:"SHA-256" as const,hex:"ab".repeat(32)};
const item=(status:QueuedImage["status"],mask?:MaskPreview):QueuedImage=>({id:"1",file:new File(["x"],"x.jpg",{type:"image/jpeg"}),url:"blob:1",width:100,height:100,sourceHash:hash,status,mask});
describe("workflow",()=>{
 it("defines unambiguous legal terminal transitions",()=>{expect(canTransition("queued","scanning")).toBe(true);expect(canTransition("scanning","review")).toBe(true);expect(canTransition("review","error")).toBe(false);expect(()=>transition(item("queued"),"review")).toThrow(/Invalid/);});
 it("requires a genuine mask before recording review",()=>{expect(()=>decide(item("review"),"accepted")).toThrow(/genuine mask/);});
 it("binds review decision to source and mask hashes",()=>{const mask:MaskPreview={maskId:"m",itemId:"1",sourceHash:hash,maskHash:hash,version:"v1",encoding:"binary-rle",width:100,height:100,bounds:{x:80,y:80,width:20,height:20,imageWidth:100,imageHeight:100}};expect(decide(item("review",mask),"deferred","2026-01-01T00:00:00.000Z")).toMatchObject({maskId:"m",decision:"deferred",authorizationConfirmed:false});});
});
