import {describe,expect,it,vi} from "vitest";
import JSZip from "jszip";
import {collisionSafeName,createArchive,csvReport,jsonReport,toRecords} from "@/lib/archive";
import type {QueuedImage} from "@/types";
const hash={algorithm:"SHA-256" as const,hex:"ab".repeat(32)};
const item=(id:string,name:string,status:QueuedImage["status"],bytes=new Uint8Array([255,216,255,7,8])):QueuedImage=>({id,file:new File([bytes],name,{type:"image/jpeg"}),url:`blob:${id}`,width:100,height:100,sourceHash:hash,status,error:status==="error"?"not configured":status==="cancelled"?"Cancelled by user.":undefined});
describe("reports and archive",()=>{
 it("resolves filename collisions without damaging Unicode",()=>{const used=new Set<string>();expect(collisionSafeName("ảnh.jpg",used)).toBe("ảnh.jpg");expect(collisionSafeName("ảnh.jpg",used)).toBe("ảnh (2).jpg");});
 it("serializes schema v2 audit metadata without image contents",()=>{const records=toRecords([item("1","ảnh.jpg","error")]),report=JSON.parse(jsonReport(records));expect(report).toMatchObject({schemaVersion:2,imageContentsLogged:false});expect(report.records[0]).toMatchObject({sourceHash:hash,authorization:{confirmed:false}});expect(jsonReport(records)).not.toContain("data:image");expect(csvReport(records)).toContain(hash.hex);});
 it("refuses premature ZIP generation",async()=>await expect(createArchive([item("1","queued.jpg","queued")])).rejects.toThrow(/terminal states/));
 it("archives every terminal original byte-identically and includes cleaned/ files when present",async()=>{vi.setSystemTime(new Date("2026-01-01"));const bytes=new Uint8Array([255,216,255,7,8]),cleanedBytes=new Uint8Array([255,216,255,9,10]),queuedItem=item("1","ảnh.jpg","review",bytes);queuedItem.cleanedFile=new File([cleanedBytes],"ảnh-cleaned.jpg",{type:"image/jpeg"});const items=[queuedItem,item("2","ảnh.jpg","cancelled",bytes)];const zip=await JSZip.loadAsync(await createArchive(items));expect(new Uint8Array(await zip.file("originals/ảnh.jpg")!.async("arraybuffer"))).toEqual(bytes);expect(new Uint8Array(await zip.file("originals/ảnh (2).jpg")!.async("arraybuffer"))).toEqual(bytes);expect(new Uint8Array(await zip.file("cleaned/ảnh.jpg")!.async("arraybuffer"))).toEqual(cleanedBytes);expect(JSON.parse(await zip.file("report.json")!.async("string")).records).toHaveLength(2);});
});
