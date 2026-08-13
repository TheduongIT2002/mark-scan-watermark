import type {DatasetBox,DatasetLabel,DatasetManifest,DatasetSplit,ValidationIssue} from "./types";
export interface IntakeItem{id:string;groupId:string;imagePath:string;label:DatasetLabel;split:DatasetSplit;boundingBox?:DatasetBox;maskPath?:string;tags?:string[];category?:string;provenanceNote?:string}
export interface DatasetIntake{schemaVersion:1;datasetVersion:string;datasetId:string;canonicalLogoPath:string;rights:DatasetManifest["rights"];benchmark:DatasetManifest["benchmark"];items:IntakeItem[]}
export interface IntakeAssetSummary{path:string;sha256:string;width:number;height:number}
export interface IntakeResult{schemaVersion:1;status:"READY"|"NOT_READY";datasetId?:string;written?:boolean;canonicalLogo?:IntakeAssetSummary;items?:Array<{id:string;image:IntakeAssetSummary;mask?:IntakeAssetSummary}>;issues:ValidationIssue[];candidate?:DatasetManifest}
