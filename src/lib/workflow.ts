import type {ProcessingDecision,QueuedImage,ReviewDecision,WorkflowStatus} from "@/types";
const transitions:Record<WorkflowStatus,readonly WorkflowStatus[]>={queued:["scanning","cancelled"],scanning:["review","not-found","error","cancelling"],cancelling:["cancelled","error"],review:["scanning"],"not-found":["scanning"],error:["scanning"],cancelled:["scanning" ]};
export function canTransition(from:WorkflowStatus,to:WorkflowStatus){return transitions[from].includes(to);}
export function transition(item:QueuedImage,to:WorkflowStatus):QueuedImage{if(!canTransition(item.status,to))throw new Error(`Invalid workflow transition: ${item.status} → ${to}.`);return {...item,status:to};}
export function decide(item:QueuedImage,decision:ReviewDecision,at=new Date().toISOString()):ProcessingDecision{
 if(item.status!=="review"||!item.mask)throw new Error("A genuine mask preview is required before review.");
 return {itemId:item.id,sourceHash:item.sourceHash,maskId:item.mask.maskId,maskHash:item.mask.maskHash,decision,reviewedAt:at,authorizationConfirmed:false};
}
