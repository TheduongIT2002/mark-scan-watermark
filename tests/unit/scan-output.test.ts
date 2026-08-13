import {describe,expect,it} from "vitest";
import {INVALID_SCAN_OUTPUT,validateScanOutput} from "@/lib/scanner/validate-output";
import type {ScanInput,ScanOutput} from "@/lib/scanner/scanner";
const hash=(hex="ab".repeat(32))=>({algorithm:"SHA-256" as const,hex}),input:ScanInput={itemId:"1",file:new File(["x"],"x.png"),sourceHash:hash(),width:100,height:80},box={x:70,y:50,width:20,height:20,imageWidth:100,imageHeight:80};
const review=():ScanOutput=>({result:{itemId:"1",sourceHash:hash(),status:"review",confidence:.9,boundingBox:box,detectorVersion:"d1",configVersion:"c1",scannedAt:"2026-01-01T00:00:00Z",processingTimeMs:1},mask:{maskId:"m1",itemId:"1",sourceHash:hash(),maskHash:hash("cd".repeat(32)),version:"v1",encoding:"binary-rle",width:100,height:80,bounds:box}});
const invalid=(output:ScanOutput)=>{const value=validateScanOutput(input,output);expect(value.result).toMatchObject({status:"error",error:{code:"INVALID_SCAN_OUTPUT",message:INVALID_SCAN_OUTPUT}});expect(value.mask).toBeUndefined();};
describe("scan output invariants",()=>{
 it("accepts a valid review and genuine mask",()=>expect(validateScanOutput(input,review())).toEqual(review()));
 it("rejects review without mask",()=>{const value=review();delete value.mask;invalid(value)});
 it("rejects mismatched item and source identities",()=>{for(const mutate of [(v:ScanOutput)=>v.result.itemId="x",(v:ScanOutput)=>v.result.sourceHash=hash("ef".repeat(32)),(v:ScanOutput)=>v.mask!.itemId="x",(v:ScanOutput)=>v.mask!.sourceHash=hash("ef".repeat(32))]){const value=review();mutate(value);invalid(value)}});
 it("rejects invalid hashes and mask identity",()=>{for(const mutate of [(v:ScanOutput)=>v.result.sourceHash=hash("bad"),(v:ScanOutput)=>v.mask!.maskHash=hash("xyz"),(v:ScanOutput)=>v.mask!.maskId="",(v:ScanOutput)=>v.mask!.version=""]){const value=review();mutate(value);invalid(value)}});
 it("rejects wrong dimensions and invalid or inconsistent bounds",()=>{for(const mutate of [(v:ScanOutput)=>v.mask!.width=99,(v:ScanOutput)=>v.mask!.bounds.width=0,(v:ScanOutput)=>v.mask!.bounds.x=-1,(v:ScanOutput)=>v.mask!.bounds.x=90,(v:ScanOutput)=>v.mask!.bounds.x=Number.NaN,(v:ScanOutput)=>v.result.boundingBox={...box,x:69},(v:ScanOutput)=>delete v.result.boundingBox]){const value=review();mutate(value);invalid(value)}});
 it("rejects masks on not-found and error",()=>{for(const status of ["not-found","error"] as const){const value=review();value.result.status=status;invalid(value)}});
});
