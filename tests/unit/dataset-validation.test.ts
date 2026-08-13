/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe,expect,it} from "vitest";import {createHash} from "node:crypto";import {mkdtemp,readFile,writeFile} from "node:fs/promises";import {cpSync} from "node:fs";import os from "node:os";import path from "node:path";import {validateDataset} from "@/lib/dataset/validate";import type {DatasetManifest} from "@/lib/dataset/types";
const fixture=path.resolve("tests/fixtures/dataset/valid");async function copy(){const root=await mkdtemp(path.join(os.tmpdir(),"markscan-dataset-"));cpSync(fixture,root,{recursive:true});return root}async function mutate(fn:(m:DatasetManifest)=>void){const root=await copy(),p=path.join(root,"manifest.json"),m=JSON.parse(await readFile(p,"utf8")) as DatasetManifest;fn(m);await writeFile(p,JSON.stringify(m));return validateDataset(root)}
describe("dataset validation",()=>{
 it("accepts the deterministic authorized fixture",async()=>expect(await validateDataset(fixture)).toMatchObject({status:"VALID",issues:[]}));
 it("rejects traversal",async()=>expect((await mutate(m=>m.items[0].imagePath="../secret.png")).issues.map(i=>i.code)).toContain("UNSAFE_PATH"));
 it("rejects hash mismatch",async()=>expect((await mutate(m=>m.items[0].sha256.hex="00".repeat(32))).issues.map(i=>i.code)).toContain("HASH_MISMATCH"));
 it("rejects duplicate and group leakage",async()=>{const result=await mutate(m=>{m.items[1].sha256=m.items[0].sha256;m.items[1].groupId=m.items[0].groupId});expect(result.issues.map(i=>i.code)).toEqual(expect.arrayContaining(["CONTENT_LEAKAGE","GROUP_LEAKAGE"]));});
 it("rejects missing ground truth and required split",async()=>{const result=await mutate(m=>{delete m.items[0].mask;m.items=m.items.filter(i=>i.split!=="test")});expect(result.issues.map(i=>i.code)).toEqual(expect.arrayContaining(["MISSING_GROUND_TRUTH","EMPTY_REQUIRED_SPLIT"]));});
 it("rejects empty and duplicate item/group identities",async()=>{const result=await mutate(m=>{m.items[0].id="";m.items[0].groupId="";m.items[1].id=""});expect(result.issues.every(i=>i.code==="INVALID_SCHEMA")).toBe(true);});
 it("rejects invalid rights and canonical metadata",async()=>{const result=await mutate(m=>{m.rights.attestation="";m.rights.attestedAt="not-a-date";m.canonicalLogo.width=0;m.canonicalLogo.sha256.hex="bad"});expect(result.issues.every(i=>i.code==="INVALID_SCHEMA")).toBe(true);});
 it("rejects hashed malformed image pixels",async()=>{const root=await copy(),image="images/train-positive.png",bytes=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0]),manifestPath=path.join(root,"manifest.json"),manifest=JSON.parse(await readFile(manifestPath,"utf8")) as DatasetManifest;await writeFile(path.join(root,image),bytes);manifest.items[0].sha256.hex=createHash("sha256").update(bytes).digest("hex");await writeFile(manifestPath,JSON.stringify(manifest));expect((await validateDataset(root)).issues.map(i=>i.code)).toContain("DECODE_FAILED");});
 it("returns structured invalid results for malformed manifest shapes",async()=>{const root=await mkdtemp(path.join(os.tmpdir(),"markscan-shape-"));await writeFile(path.join(root,"manifest.json"),JSON.stringify({schemaVersion:1,datasetId:"x",datasetVersion:"1",rights:[],canonicalLogo:[],benchmark:{requirePositiveMasks:"yes",requiredSplits:{}},items:{}}));const result=await validateDataset(root);expect(result.status).toBe("INVALID");expect(result.issues.every(i=>i.code==="INVALID_SCHEMA")).toBe(true);});
 it("rejects a required all-black mask",async()=>{const root=await copy(),maskPath=path.join(root,"masks/train-positive.png"),bytes=await (await import("sharp")).default({create:{width:8,height:8,channels:3,background:{r:0,g:0,b:0}}}).png().toBuffer(),manifestPath=path.join(root,"manifest.json"),manifest=JSON.parse(await readFile(manifestPath,"utf8")) as DatasetManifest;await writeFile(maskPath,bytes);manifest.items[0].mask!.sha256.hex=createHash("sha256").update(bytes).digest("hex");await writeFile(manifestPath,JSON.stringify(manifest));expect((await validateDataset(root)).issues.map(i=>i.code)).toContain("EMPTY_MASK");});
 it.each([
  ["numeric id",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,any>).id=7},"INVALID_ITEM_ID"],
  ["numeric groupId",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,unknown>).groupId=7},"INVALID_ITEM_ID"],
  ["numeric required split",(m:DatasetManifest)=>{(m.benchmark.requiredSplits as unknown[])[0]=7},"INVALID_BENCHMARK_CONFIG"],
  ["unknown required split",(m:DatasetManifest)=>{(m.benchmark.requiredSplits as unknown[])[0]="holdout"},"INVALID_BENCHMARK_CONFIG"],
  ["numeric image path",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,unknown>).imagePath=7},"INVALID_ITEM_PATH"],
  ["malformed hash",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,unknown>).sha256={algorithm:"SHA-256",hex:7}},"INVALID_ITEM_HASH"],
  ["malformed dimensions",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,unknown>).width="8"},"INVALID_ITEM_DIMENSIONS"],
  ["malformed box",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,unknown>).boundingBox={x:"0",y:0,width:4,height:4}},"INVALID_POSITIVE_BOX"],
  ["malformed mask",(m:DatasetManifest)=>{(m.items[0] as unknown as Record<string,unknown>).mask={path:7,sha256:{algorithm:"SHA-256",hex:"00".repeat(32)}}},"INVALID_MASK"]
 ])("returns INVALID without throwing for %s",async(_name,mutate)=>{const result=await (async()=>{try{return await (async()=>{const root=await copy(),manifestPath=path.join(root,"manifest.json"),manifest=JSON.parse(await readFile(manifestPath,"utf8")) as DatasetManifest;mutate(manifest);await writeFile(manifestPath,JSON.stringify(manifest));return validateDataset(root)})()}catch(error){throw new Error(`Validator rejected instead of resolving: ${String(error)}`)}})();expect(result.status).toBe("INVALID");expect(result.issues.every(i=>i.code==="INVALID_SCHEMA")).toBe(true);});
 it.each([
  ["dataset id pattern",(m)=>{m.datasetId="bad id"}],
  ["duplicate required splits",(m)=>{m.benchmark.requiredSplits=["train","validation","test","test"]}],
  ["unexpected root property",(m)=>{m.unexpected=true}],
  ["unexpected item property",(m)=>{m.items[0].unexpected=true}],
  ["unexpected box property",(m)=>{m.items[0].boundingBox.unexpected=true}],
  ["unexpected canonical property",(m)=>{m.canonicalLogo.unexpected=true}],
  ["unexpected rights property",(m)=>{m.rights.unexpected=true}],
  ["unexpected benchmark property",(m)=>{m.benchmark.unexpected=true}],
  ["unexpected hash property",(m)=>{m.items[0].sha256.unexpected=true}],
  ["unexpected mask property",(m)=>{m.items[0].mask.unexpected=true}],
  ["empty items",(m)=>{m.items=[]}]
 ] as Array<[string,(manifest:any)=>void]>)("matches schema for %s",async(_name,change)=>{const result=await (async()=>{const root=await copy(),manifestPath=path.join(root,"manifest.json"),manifest=JSON.parse(await readFile(manifestPath,"utf8"));change(manifest);await writeFile(manifestPath,JSON.stringify(manifest));return validateDataset(root)})();expect(result.status).toBe("INVALID");expect(result.issues.every(i=>i.code==="INVALID_SCHEMA")).toBe(true);});

 it("fails closed when a positive is missing its box",async()=>{const result=await mutate(m=>{delete m.items[0].boundingBox});expect(result.status).toBe("INVALID");expect(result.issues.some(i=>i.code==="INVALID_SCHEMA")).toBe(true);});
 it.each(["boundingBox","mask"] as const)("rejects negative items carrying %s",async(field)=>{const result=await mutate(m=>{const source=m.items[0];if(field==="boundingBox")m.items[2].boundingBox=source.boundingBox;else m.items[2].mask=source.mask});expect(result.status).toBe("INVALID");expect(result.issues.some(i=>i.code==="INVALID_SCHEMA")).toBe(true);});
 it("requires positive masks only when configured",async()=>{const required=await mutate(m=>{delete m.items[0].mask});expect(required.status).toBe("INVALID");expect(required.issues.some(i=>i.code==="MISSING_GROUND_TRUTH")).toBe(true);const optional=await mutate(m=>{m.benchmark.requirePositiveMasks=false;delete m.items[0].mask;delete m.items[1].mask});expect(optional.status).toBe("VALID");});

});

