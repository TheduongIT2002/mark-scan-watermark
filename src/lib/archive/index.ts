import JSZip from "jszip";
import {isTerminalWorkflowStatus} from "@/types";
import type {AuditRecord,AuditReport,QueuedImage} from "@/types";
export function collisionSafeName(name:string,used:Set<string>):string{if(!used.has(name)){used.add(name);return name;}const dot=name.lastIndexOf("."),base=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):"";let index=2,candidate="";do{candidate=`${base} (${index++})${extension}`;}while(used.has(candidate));used.add(candidate);return candidate;}
export function toRecords(items:QueuedImage[]):AuditRecord[]{return items.map(item=>{if(!isTerminalWorkflowStatus(item.status))throw new Error("Reports are available only after every image reaches a terminal state.");return {itemId:item.id,sourceFileName:item.file.name,sourceHash:item.sourceHash,sourceSize:item.file.size,sourceMimeType:item.file.type,status:item.status,scan:item.scan,mask:item.mask?{...item.mask,overlayUrl:undefined}:undefined,decision:item.decision,authorization:{confirmed:false},error:item.scan?.error??(item.error?{code:item.status==="cancelled"?"USER_CANCELLED":"SCAN_ERROR",message:item.error}:undefined)};});}
export function jsonReport(records:AuditRecord[]):string{return JSON.stringify({schemaVersion:2,generatedAt:new Date().toISOString(),privacy:"local-browser-processing",imageContentsLogged:false,records} satisfies AuditReport,null,2);}
const csvCell=(value:string|number|boolean|undefined)=>`"${String(value??"").replaceAll('"','""')}"`;
export function csvReport(records:AuditRecord[]):string{const heads=["sourceFileName","status","sourceSha256","sourceSize","sourceMimeType","detectorVersion","configVersion","confidence","maskHash","maskVersion","reviewDecision","reviewedAt","authorizationConfirmed","originalArchivePath","error"];return "﻿"+[heads.join(","),...records.map(record=>[record.sourceFileName,record.status,record.sourceHash.hex,record.sourceSize,record.sourceMimeType,record.scan?.detectorVersion,record.scan?.configVersion,record.scan?.confidence,record.mask?.maskHash.hex,record.mask?.version,record.decision?.decision,record.decision?.reviewedAt,false,record.originalArchivePath,record.error?.message].map(csvCell).join(","))].join("\r\n");}
export async function createArchive(items:QueuedImage[]):Promise<Blob>{
 if(!items.length||items.some(item=>!isTerminalWorkflowStatus(item.status)))throw new Error("Download is available only after the complete batch reaches terminal states.");
 const zip=new JSZip(),cleaned=zip.folder("cleaned")!,used=new Set<string>();
 for(const item of items){const output=item.cleanedFile??item.file;const safe=collisionSafeName(output.name,used);cleaned.file(safe,output);}
 return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
}
