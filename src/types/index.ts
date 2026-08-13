/** Hash identifying bytes without retaining their contents. */
export interface ContentHash { algorithm:"SHA-256"; hex:string }
export type WorkflowStatus="queued"|"scanning"|"cancelling"|"review"|"not-found"|"error"|"cancelled";
export type TerminalWorkflowStatus="review"|"not-found"|"error"|"cancelled";
export interface BoundingBox { x:number;y:number;width:number;height:number;imageWidth:number;imageHeight:number }
export interface ScanError { code:string;message:string }
export interface ScanResult { itemId:string;sourceHash:ContentHash;status:"review"|"not-found"|"error";confidence?:number;boundingBox?:BoundingBox;detectorVersion:string;configVersion:string;scannedAt:string;processingTimeMs:number;error?:ScanError }
export interface MaskPreview { maskId:string;itemId:string;sourceHash:ContentHash;maskHash:ContentHash;version:string;encoding:"svg-path"|"binary-rle"|"grayscale-png";width:number;height:number;bounds:BoundingBox;overlayUrl?:string }
export type ReviewDecision="accepted"|"rejected"|"deferred";
export interface ProcessingDecision { itemId:string;sourceHash:ContentHash;maskId:string;maskHash:ContentHash;decision:ReviewDecision;reviewedAt:string;authorizationConfirmed:false;authorizationConfirmedAt?:string }
/** Reserved for a later authorized-processing step; Step 1 never creates this. */
export interface EditedArtifact { itemId:string;sourceHash:ContentHash;maskHash:ContentHash;artifactHash:ContentHash;fileName:string;mimeType:string;byteLength:number;processorVersion:string;createdAt:string;label:"edited-derivative" }
export interface AuditRecord { itemId:string;sourceFileName:string;sourceHash:ContentHash;sourceSize:number;sourceMimeType:string;status:TerminalWorkflowStatus;scan?:ScanResult;mask?:Omit<MaskPreview,"overlayUrl">;decision?:ProcessingDecision;authorization:{confirmed:false;confirmedAt?:string};originalArchivePath?:string;error?:ScanError }
export interface AuditReport { schemaVersion:2;generatedAt:string;privacy:"local-browser-processing";imageContentsLogged:false;records:AuditRecord[] }
export interface QueuedImage { id:string;file:File;url:string;width:number;height:number;sourceHash:ContentHash;status:WorkflowStatus;scan?:ScanResult;mask?:MaskPreview;decision?:ProcessingDecision;error?:string;cleanedUrl?:string;cleanedFile?:File }
export const TERMINAL_WORKFLOW_STATUSES=new Set<WorkflowStatus>(["review","not-found","error","cancelled"]);
export const isTerminalWorkflowStatus=(status:WorkflowStatus):status is TerminalWorkflowStatus=>TERMINAL_WORKFLOW_STATUSES.has(status);

// Legacy OpenCV contracts remain isolated from the active Step 1 route.
export type DetectionStatus="detected"|"not-detected"|"needs-review"|"error";
export type ProcessingStatus="queued"|"processing"|"cancelling"|"cancelled"|DetectionStatus;
export type TerminalStatus="cancelled"|DetectionStatus;
export interface Thresholds { detected:number;review:number }
export interface DetectorConfig { roiWidthRatio:number;roiHeightRatio:number;scales:number[];thresholds:Thresholds }
export interface DetectionResult { id:string;fileName:string;status:DetectionStatus;confidence:number;boundingBox?:BoundingBox;processingTimeMs:number;detectorVersion:string;error?:string }
export const isTerminalStatus=(status:ProcessingStatus):status is TerminalStatus=>new Set<ProcessingStatus>(["detected","not-detected","needs-review","error","cancelled"]).has(status);
