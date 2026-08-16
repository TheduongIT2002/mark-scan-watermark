import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import DetectorApp from "@/components/detector-app";
import type {LogoScanner} from "@/lib/scanner/scanner";
const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
const file=(name="image.png",bytes:BlobPart=png)=>new File([bytes],name,{type:"image/png"});
const slowScanner=():LogoScanner=>({detectorVersion:"slow",configVersion:"slow",scan:(_input,signal)=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Cancelled by user.","AbortError")),{once:true}))});
beforeEach(()=>{let id=0;Object.defineProperty(globalThis,"crypto",{value:{randomUUID:()=>`id-${++id}`,subtle:{digest:vi.fn(async()=>new Uint8Array(32).buffer)}},configurable:true});vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:100,height:100,close:vi.fn()})));vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:test"),revokeObjectURL:vi.fn()});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("DetectorApp workflow",()=>{
 it("accepts an image when secure-context crypto APIs are unavailable",async()=>{
  vi.stubGlobal("crypto",undefined);
  render(<DetectorApp/>);
  fireEvent.change(document.querySelector("#batch-input")!,{target:{files:[file("http-origin.png")]}});
  await screen.findByText("1 image ready");
  expect(screen.queryByText(/digest/)).toBeNull();
 });
 it("uploads, rejects duplicates and corrupt inputs, clears, and permits reselect",async()=>{render(<DetectorApp/>);const input=document.querySelector("#batch-input") as HTMLInputElement;fireEvent.change(input,{target:{files:[file()]}});await screen.findByText("1 image ready");fireEvent.change(input,{target:{files:[file()]}});await screen.findByText(/duplicate skipped/);fireEvent.change(input,{target:{files:[file("broken.png","broken")]}});await screen.findByText(/signature/);fireEvent.click(screen.getByText("Clear queue"));await waitFor(()=>expect(screen.queryByText("1 image ready")).toBeNull());fireEvent.change(input,{target:{files:[file()]}});await screen.findByText("1 image ready");});
 it("limits each batch to 15 images across initial and subsequent selections",async()=>{
  render(<DetectorApp/>);
  const input=document.querySelector("#batch-input") as HTMLInputElement;
  const images=Array.from({length:16},(_,index)=>file(`image-${index}.png`,new Uint8Array([...png,index])));
  fireEvent.change(input,{target:{files:images}});
  await screen.findByText("Mỗi lượt chỉ được chọn tối đa 15 ảnh.");
  expect(screen.queryByText("16 images ready")).toBeNull();
  fireEvent.change(input,{target:{files:images.slice(0,15)}});
  await screen.findByText("15 images ready");
  expect(screen.getByText(/^15\/15/)).toBeTruthy();
  fireEvent.change(input,{target:{files:[images[15]]}});
  await screen.findByText("Mỗi lượt chỉ được chọn tối đa 15 ảnh.");
  expect(screen.getByText("15 images ready")).toBeTruthy();
  expect(screen.queryByText("16 images ready")).toBeNull();
 });
 it("production scanner ends as actionable error without review controls",async()=>{render(<DetectorApp/>);fireEvent.change(document.querySelector("#batch-input")!,{target:{files:[file()]}});await screen.findByText("1 image ready");fireEvent.click(screen.getByText(/Scan images/));await screen.findByText(/Fixed-logo detector not configured/);expect(document.querySelector("article")?.dataset.status).toBe("error");expect(screen.queryByText("Accept mask")).toBeNull();});
 it("shows review controls only for an injected genuine mask and records each decision",async()=>{const scanner:LogoScanner={detectorVersion:"test",configVersion:"test",async scan(input){const bounds={x:80,y:80,width:20,height:20,imageWidth:100,imageHeight:100};return {result:{itemId:input.itemId,sourceHash:input.sourceHash,status:"review",confidence:.95,boundingBox:bounds,detectorVersion:"test",configVersion:"test",scannedAt:"2026-01-01T00:00:00.000Z",processingTimeMs:1},mask:{maskId:"mask",itemId:input.itemId,sourceHash:input.sourceHash,maskHash:input.sourceHash,version:"test",encoding:"binary-rle",width:100,height:100,bounds}}}};render(<DetectorApp scanner={scanner}/>);fireEvent.change(document.querySelector("#batch-input")!,{target:{files:[file()]}});await screen.findByText("1 image ready");fireEvent.click(screen.getByText(/Scan images/));await screen.findByText("Accept mask");expect(screen.getByTestId("mask-overlay")).toBeTruthy();for(const [label,value] of [["Accept mask","accepted"],["Reject mask","rejected"],["Defer review","deferred"]]){fireEvent.click(screen.getByText(label));await waitFor(()=>expect(document.querySelector(".decision")?.textContent).toContain(value));}});
 it("normalizes malicious review output to error without mask controls",async()=>{const scanner:LogoScanner={detectorVersion:"bad",configVersion:"bad",async scan(input){return {result:{itemId:input.itemId,sourceHash:input.sourceHash,status:"review",detectorVersion:"bad",configVersion:"bad",scannedAt:new Date().toISOString(),processingTimeMs:1}}}};render(<DetectorApp scanner={scanner}/>);fireEvent.change(document.querySelector("#batch-input")!,{target:{files:[file()]}});await screen.findByText("1 image ready");fireEvent.click(screen.getByText(/Scan images/));await screen.findByText(/invalid or inconsistent data/);expect(document.querySelector("article")?.dataset.status).toBe("error");expect(screen.queryByText("Accept mask")).toBeNull();expect(screen.queryByTestId("mask-overlay")).toBeNull();});
 it.each([["one item",[file()]],["multiple items",[file("a.png"),file("b.png",new Uint8Array([...png,4]))]]])("explicitly cancels %s exactly once without masks",async(_label,files)=>{render(<DetectorApp scanner={slowScanner()}/>);fireEvent.change(document.querySelector("#batch-input")!,{target:{files}});await screen.findByText(`${files.length} image${files.length===1?"":"s"} ready`);fireEvent.click(screen.getByText(/Scan images/));await screen.findByText("Cancel scan");fireEvent.click(screen.getByText("Cancel scan"));await waitFor(()=>expect(document.querySelectorAll("article[data-status='cancelled']")).toHaveLength(files.length));expect(document.querySelectorAll("article[data-status='error'],article[data-status='review']")).toHaveLength(0);expect(screen.queryByText("Accept mask")).toBeNull();expect(screen.queryByTestId("mask-overlay")).toBeNull();expect(screen.getAllByText("Cancelled by user.")).toHaveLength(files.length);expect(document.querySelector("#download-results")).not.toBeNull();});
});
