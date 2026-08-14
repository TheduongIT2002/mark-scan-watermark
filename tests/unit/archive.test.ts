import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { collisionSafeName, createArchive, csvReport, jsonReport, toRecords } from "@/lib/archive";
import type { QueuedImage } from "@/types";

const hash = { algorithm: "SHA-256" as const, hex: "ab".repeat(32) };
const item = (
  id: string,
  name: string,
  status: QueuedImage["status"],
  bytes = new Uint8Array([255, 216, 255, 7, 8]),
): QueuedImage => ({
  id,
  file: new File([bytes], name, { type: "image/jpeg" }),
  url: `blob:${id}`,
  width: 100,
  height: 100,
  sourceHash: hash,
  status,
  error: status === "error" ? "not configured" : status === "cancelled" ? "Cancelled by user." : undefined,
});

describe("reports and cleaned archive", () => {
  it("resolves filename collisions without damaging Unicode", () => {
    const used = new Set<string>();
    expect(collisionSafeName("ảnh.jpg", used)).toBe("ảnh.jpg");
    expect(collisionSafeName("ảnh.jpg", used)).toBe("ảnh (2).jpg");
  });

  it("serializes schema v2 audit metadata without image contents", () => {
    const records = toRecords([item("1", "ảnh.jpg", "error")]);
    const report = JSON.parse(jsonReport(records));
    expect(report).toMatchObject({ schemaVersion: 2, imageContentsLogged: false });
    expect(report.records[0]).toMatchObject({ sourceHash: hash, authorization: { confirmed: false } });
    expect(jsonReport(records)).not.toContain("data:image");
    expect(csvReport(records)).toContain(hash.hex);
  });

  it("refuses premature ZIP generation", async () => {
    await expect(createArchive([item("1", "queued.jpg", "queued")])).rejects.toThrow(/terminal states/);
  });

  it("archives every terminal image and prefers collision-safe cleaned derivatives", async () => {
    const firstBytes = new Uint8Array([255, 216, 255, 9, 10]);
    const secondBytes = new Uint8Array([255, 216, 255, 11, 12]);
    const untouchedBytes = new Uint8Array([255, 216, 255, 13, 14]);
    const first = item("1", "ảnh.jpg", "review");
    const second = item("2", "ảnh.jpg", "review");
    const untouched = item("3", "không-logo.jpg", "not-found", untouchedBytes);
    first.cleanedFile = new File([firstBytes], "ảnh-cleaned.jpg", { type: "image/jpeg" });
    second.cleanedFile = new File([secondBytes], "ảnh-cleaned.jpg", { type: "image/jpeg" });

    const zip = await JSZip.loadAsync(await createArchive([
      first,
      second,
      untouched,
    ]));

    expect(Object.keys(zip.files).sort()).toEqual([
      "cleaned/",
      "cleaned/không-logo.jpg",
      "cleaned/ảnh-cleaned (2).jpg",
      "cleaned/ảnh-cleaned.jpg",
    ].sort());
    expect(new Uint8Array(await zip.file("cleaned/ảnh-cleaned.jpg")!.async("arraybuffer"))).toEqual(firstBytes);
    expect(new Uint8Array(await zip.file("cleaned/ảnh-cleaned (2).jpg")!.async("arraybuffer"))).toEqual(secondBytes);
    expect(new Uint8Array(await zip.file("cleaned/không-logo.jpg")!.async("arraybuffer"))).toEqual(untouchedBytes);
    expect(zip.file("report.json")).toBeNull();
    expect(zip.file("report.csv")).toBeNull();
    expect(Object.keys(zip.files).some((path) => path.startsWith("originals/"))).toBe(false);
  });
});
