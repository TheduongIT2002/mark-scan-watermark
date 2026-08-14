import { expect, test } from "@playwright/test";
import JSZip from "jszip";

async function png(page: import("@playwright/test").Page) {
  return Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#17262e";
    context.fillRect(0, 0, 100, 100);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("PNG encoding failed")),
      "image/png",
    ));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));
}

async function downloadedZip(download: import("@playwright/test").Download) {
  return JSZip.loadAsync(await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }));
}

function expectCleanedOnly(zip: JSZip) {
  const paths = Object.keys(zip.files);
  expect(paths.length).toBeGreaterThanOrEqual(1);
  expect(paths.every((path) => path === "cleaned/" || path.startsWith("cleaned/"))).toBe(true);
  expect(zip.file("report.json")).toBeNull();
  expect(zip.file("report.csv")).toBeNull();
  expect(paths.some((path) => path.startsWith("originals/"))).toBe(false);
}

test("production download contains only the cleaned folder", async ({ page }) => {
  await page.goto("/");
  const source = await png(page);
  await page.locator("#batch-input").setInputFiles({ name: "owned.png", mimeType: "image/png", buffer: source });
  await expect(page.getByText("1 image ready")).toBeVisible();
  await expect(page.locator("#template-input")).toHaveCount(0);
  await page.locator("#scan-button").click();
  const card = page.locator("article[data-status='not-found']");
  await expect(card).toBeVisible();
  await expect(page.getByText("Accept mask")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.locator("#download-results").click();
  const item = await download;
  expect(await item.path()).not.toBeNull();
  const zip = await downloadedZip(item);
  expectCleanedOnly(zip);
  expect(Buffer.from(await zip.file("cleaned/owned.png")!.async("uint8array"))).toEqual(source);
});

test("validation and reselect lifecycle remain available", async ({ page }) => {
  await page.goto("/");
  const source = await png(page);
  const input = { name: "same.png", mimeType: "image/png", buffer: source };
  await page.locator("#batch-input").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("broken"),
  });
  await expect(page.locator("#app-notice")).toContainText("signature");
  await page.locator("#batch-input").setInputFiles(input);
  await expect(page.getByText("1 image ready")).toBeVisible();
  await page.getByRole("button", { name: "Remove same.png" }).click();
  await page.locator("#batch-input").setInputFiles(input);
  await expect(page.getByText("1 image ready")).toBeVisible();
});

test("guarded injected scanner exports only its cleaned derivative", async ({ page }) => {
  await page.goto("/e2e-scanner-harness");
  const source = await png(page);
  await page.locator("#batch-input").setInputFiles({
    name: "authorized.png",
    mimeType: "image/png",
    buffer: source,
  });
  await page.locator("#scan-button").click();
  const card = page.locator("article[data-status='review']");
  await expect(card).toBeVisible();
  await expect(card.locator("[data-testid='mask-overlay']")).toBeVisible();
  await expect(card).toContainText("Confidence 95%");
  for (const [label, value] of [
    ["Accept mask", "accepted"],
    ["Reject mask", "rejected"],
    ["Defer review", "deferred"],
  ]) {
    await page.getByText(label, { exact: true }).click();
    await expect(card.locator(".decision")).toContainText(value);
  }
  const download = page.waitForEvent("download");
  await page.locator("#download-results").click();
  const zip = await downloadedZip(await download);
  expectCleanedOnly(zip);
  expect(Object.keys(zip.files).some((path) => path.startsWith("cleaned/") && path !== "cleaned/")).toBe(true);
});
