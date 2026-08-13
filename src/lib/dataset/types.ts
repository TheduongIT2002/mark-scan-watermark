export type DatasetLabel="positive"|"negative"|"difficult-negative";export type DatasetSplit="train"|"validation"|"test";
export interface DatasetHash {algorithm:"SHA-256";hex:string}
export interface DatasetBox {x:number;y:number;width:number;height:number}
export interface DatasetItem {id:string;groupId:string;imagePath:string;sha256:DatasetHash;width:number;height:number;label:DatasetLabel;split:DatasetSplit;boundingBox?:DatasetBox;mask?:{path:string;sha256:DatasetHash};tags?:string[];category?:string;provenanceNote?:string}
export interface DatasetManifest {schemaVersion:1;datasetVersion:string;datasetId:string;canonicalLogo:{path:string;sha256:DatasetHash;width:number;height:number};rights:{authorized:true;attestation:string;attestedAt:string};benchmark:{requirePositiveMasks:boolean;requiredSplits:DatasetSplit[]};items:DatasetItem[]}
export interface ValidationIssue {code:string;itemId?:string;path?:string;message:string}
export interface ValidatedDatasetContext {root:string;manifestHash:DatasetHash}
export interface DatasetValidationResult {schemaVersion:1;status:"VALID"|"INVALID";datasetId?:string;datasetHash?:DatasetHash;counts?:Record<string,number>;issues:ValidationIssue[];manifest?:DatasetManifest;context?:ValidatedDatasetContext}
