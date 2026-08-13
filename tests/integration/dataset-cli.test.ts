import {describe,expect,it} from "vitest";
import {execFileSync,spawnSync} from "node:child_process";
import path from "node:path";
const root="tests/fixtures/dataset/valid",run=(args:string[])=>{const command=`npm run ${args.map(value=>value.includes(" ")?`"${value.replaceAll('"','\\"')}"`:value).join(" ")}`;return process.platform==="win32"?{file:"cmd.exe",args:["/d","/c",command]}:{file:"npm",args:["run",...args]};};
const jsonFrom=(out:string)=>JSON.parse(out.slice(out.indexOf("{",out.indexOf("dataset:"))));
describe("dataset CLIs",()=>{
 it("runs the exact documented npm validator command",()=>{const command=run(["dataset:validate","--","--root",root,"--json"]),out=execFileSync(command.file,command.args,{encoding:"utf8"});expect(jsonFrom(out)).toMatchObject({status:"VALID",issues:[]});expect(out).not.toContain(path.resolve(root));},15000);
 it("runs the exact documented npm benchmark command",()=>{const command=run(["dataset:benchmark","--","--root",root,"--json"]),out=execFileSync(command.file,command.args,{encoding:"utf8"});expect(jsonFrom(out)).toMatchObject({status:"NOT_EVALUABLE",reason:"SCANNER_NOT_CONFIGURED"});},15000);
 it("fails closed for missing dataset",()=>{const command=run(["dataset:validate","--","--root","tests/fixtures/dataset/missing","--json"]),result=spawnSync(command.file,command.args,{encoding:"utf8"});expect(result.status).toBe(1);expect(result.stdout).toContain("INVALID_MANIFEST");},15000);
});
