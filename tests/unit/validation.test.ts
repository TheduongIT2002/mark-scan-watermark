import {afterEach,describe,expect,it,vi} from "vitest";
import {decodeImage,fingerprint,sha256,templateCompatibility,validateImage} from "@/lib/validation/images";
import {DEFAULT_CONFIG} from "@/lib/detector/config";

const jpeg=(name="a.jpg",bytes=new Uint8Array([255,216,255,0]))=>new File([bytes],name,{type:"image/jpeg"});
describe("image validation",()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it("accepts JPEG signatures and rejects unsupported, corrupt, empty, and oversized files",async()=>{
  expect(await validateImage(jpeg())).toBeNull();
  expect(await validateImage(new File(["x"],"x.gif",{type:"image/gif"}))).toMatch(/Unsupported/);
  expect(await validateImage(new File(["broken"],"x.png",{type:"image/png"}))).toMatch(/signature/);
  expect(await validateImage(new File([],"x.png",{type:"image/png"}))).toMatch(/empty/);
  expect(await validateImage(jpeg("huge.jpg"),{maxFiles:1,maxFileBytes:2})).toMatch(/exceeds/);
 });
 it("fingerprints identical bytes as duplicates regardless of filename metadata",async()=>expect(await fingerprint(jpeg("one.jpg"))).toBe(await fingerprint(jpeg("two.jpg"))));
 it("hashes files when Web Crypto is unavailable on an HTTP origin",async()=>{
  vi.stubGlobal("crypto",undefined);
  expect(await sha256(new Blob(["abc"]))).toEqual({algorithm:"SHA-256",hex:"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"});
 });
 it("reports browser decode failures clearly",async()=>{vi.stubGlobal("createImageBitmap",vi.fn().mockRejectedValue(new Error("decode")));await expect(decodeImage(jpeg())).rejects.toThrow(/cannot be decoded/);});
 it("checks whether a template fits the configured ROI at any scale",()=>{
  const config={...DEFAULT_CONFIG,scales:[...DEFAULT_CONFIG.scales],thresholds:{...DEFAULT_CONFIG.thresholds}};
  expect(templateCompatibility({width:10,height:10},{width:100,height:100},config)).toBeNull();
  expect(templateCompatibility({width:30,height:30},{width:100,height:100},config)).toMatch(/does not fit/);
 });
});
