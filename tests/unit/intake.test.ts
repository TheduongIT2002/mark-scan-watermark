import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {cpSync,existsSync} from "node:fs";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {buildIntake,writeIntakeManifest} from "@/lib/dataset/intake";
import type {DatasetIntake} from "@/lib/dataset/intake-types";
import {validateDataset} from "@/lib/dataset/validate";
import {describe,expect,it} from "vitest";

const fixture=path.resolve("tests/fixtures/intake/valid");
const assetPaths=["canonical/logo.png","raw/positive/train.png","raw/positive/validation.png","raw/negative/validation.png","raw/difficult-negative/test.png","masks/train.png","masks/validation.png"];
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
async function copyFixture(){const parent=await mkdtemp(path.join(os.tmpdir(),"intake-")),root=path.join(parent,"dataset");cpSync(fixture,root,{recursive:true});return root;}
async function readIntake(root:string){return JSON.parse(await readFile(path.join(root,"intake.json"),"utf8")) as DatasetIntake;}
async function mutate(root:string,change:(intake:DatasetIntake)=>void){const intake=await readIntake(root);change(intake);await writeFile(path.join(root,"intake.json"),JSON.stringify(intake));return buildIntake(root);}
async function assetHashes(root:string){return Object.fromEntries(await Promise.all(assetPaths.map(async relative=>[relative,digest(await readFile(path.join(root,relative)))])));}

function serializedResult(result:Awaited<ReturnType<typeof buildIntake>>){return JSON.stringify({schemaVersion:result.schemaVersion,status:result.status,datasetId:result.datasetId,canonicalLogo:result.canonicalLogo,items:result.items,issues:result.issues});}

describe("intake builder",()=>{
 it("computes exact hashes and decoded dimensions for every asset",async()=>{const root=await copyFixture(),result=await buildIntake(root);expect(result.status).toBe("READY");const summaries=[result.canonicalLogo,...(result.items??[]).flatMap(item=>[item.image,item.mask].filter(value=>value!==undefined))];expect(summaries).toHaveLength(assetPaths.length);for(const summary of summaries){expect(summary).toMatchObject({width:8,height:8});expect(summary?.sha256).toBe(digest(await readFile(path.join(root,summary!.path))));}expect(existsSync(path.join(root,"manifest.json"))).toBe(false);});
 it("keeps every canonical, image and mask byte-identical after dry-run and write",async()=>{const root=await copyFixture(),before=await assetHashes(root),result=await buildIntake(root);expect(await assetHashes(root)).toEqual(before);expect((await writeIntakeManifest(root,result)).code).toBe("WRITTEN");expect(await assetHashes(root)).toEqual(before);});
 it("never overwrites an existing manifest",async()=>{const root=await copyFixture(),result=await buildIntake(root);expect((await writeIntakeManifest(root,result)).code).toBe("WRITTEN");expect((await validateDataset(root)).status).toBe("VALID");const before=await readFile(path.join(root,"manifest.json"));expect((await writeIntakeManifest(root,result)).code).toBe("MANIFEST_EXISTS");expect(await readFile(path.join(root,"manifest.json"))).toEqual(before);});
 it("returns NOT_READY for malformed authorization without throwing",async()=>{const root=await copyFixture(),result=await mutate(root,intake=>{intake.rights.authorized=false as true;intake.rights.attestation="";});expect(result.status).toBe("NOT_READY");expect(result.issues.map(issue=>issue.code)).toContain("INVALID_INTAKE_SCHEMA");});
 it.each([
  ["positive missing boundingBox","INVALID_INTAKE_SCHEMA",(intake:DatasetIntake)=>{delete intake.items[0].boundingBox}],
  ["positive missing required mask","MISSING_GROUND_TRUTH",(intake:DatasetIntake)=>{delete intake.items[0].maskPath}],
  ["negative carrying box","INVALID_INTAKE_SCHEMA",(intake:DatasetIntake)=>{intake.items[2].boundingBox={x:0,y:0,width:1,height:1}}],
  ["difficult-negative carrying mask","INVALID_INTAKE_SCHEMA",(intake:DatasetIntake)=>{intake.items[3].maskPath="masks/train.png"}],
 ] as Array<[string,string,(intake:DatasetIntake)=>void]>)("fails closed for %s",async(_name,code,change)=>{const root=await copyFixture(),result=await mutate(root,change);expect(result.status).toBe("NOT_READY");expect(result.issues.map(issue=>issue.code)).toContain(code);});
 it("rejects traversal",async()=>{const root=await copyFixture(),result=await mutate(root,intake=>{intake.items[0].imagePath="../outside.png"});expect(result).toMatchObject({status:"NOT_READY",issues:[expect.objectContaining({code:"UNSAFE_PATH"})]});});
 it("rejects a Windows junction escaping the root",async()=>{const root=await copyFixture(),outside=await mkdtemp(path.join(os.tmpdir(),"intake-outside-"));cpSync(path.join(root,"canonical"),outside,{recursive:true});execFileSync("cmd.exe",["/d","/c","mklink","/J",path.join(root,"escape"),outside]);const result=await mutate(root,intake=>{intake.canonicalLogoPath="escape/logo.png"});expect(result.status).toBe("NOT_READY");expect(result.issues.map(issue=>issue.code)).toContain("UNSAFE_PATH");});
 it.each([
  ["DUPLICATE_ITEM_ID",(intake:DatasetIntake)=>{intake.items[1].id=intake.items[0].id}],
  ["EMPTY_REQUIRED_SPLIT",(intake:DatasetIntake)=>{intake.items=intake.items.filter(item=>item.split!=="test")}],
  ["NON_REPRESENTATIVE_SPLIT",(intake:DatasetIntake)=>{intake.items=intake.items.filter(item=>item.label!=="positive"||item.split==="train")}],
 ])("uses authoritative semantic rule %s",async(code,change)=>{const root=await copyFixture(),result=await mutate(root,change);expect(result.status).toBe("NOT_READY");expect(result.issues.map(issue=>issue.code)).toContain(code);});
 it("settles concurrent writers exactly once",async()=>{const root=await copyFixture(),result=await buildIntake(root),outcomes=await Promise.all([writeIntakeManifest(root,result),writeIntakeManifest(root,result)]);expect(outcomes.map(outcome=>outcome.code).sort()).toEqual(["MANIFEST_EXISTS","WRITTEN"]);expect((await validateDataset(root)).status).toBe("VALID");});
 it("serializes only the CLI-safe projection",async()=>{const root=await copyFixture(),intake=await readIntake(root);intake.rights.attestation="FULL SECRET ATTESTATION password=hunter2";intake.items[0].provenanceNote="credential-token-123";await writeFile(path.join(root,"intake.json"),JSON.stringify(intake));const output=serializedResult(await buildIntake(root));expect(output).not.toContain(root);expect(output).not.toContain(intake.rights.attestation);expect(output).not.toContain("hunter2");expect(output).not.toContain("credential-token-123");expect(output).not.toContain("data:");expect(output).not.toContain("bytes");});
});

