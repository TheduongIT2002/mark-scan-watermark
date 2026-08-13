# MarkScan

A privacy-first browser application for batch detection and classification of visible watermark/logo marks. **It never removes, masks, crops, blurs, reconstructs, or modifies images.** Processing and ZIP creation happen locally; there are no upload APIs or analytics.

## Setup

Requires Node.js 20.19+ (or 22.13+ recommended by the current lint toolchain).

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, select a representative watermark/logo reference image, add JPG/JPEG, PNG, or WebP images, and choose **Process images**.

## Architecture

- Next.js 16 App Router and strict TypeScript.
- React UI owns queue metadata and revocable preview URLs.
- A bounded pool of Web Workers processes one full-resolution image per worker at a time.
- OpenCV.js performs grayscale `TM_CCOEFF_NORMED` template matching in the bottom-right 15% × 15% ROI over five nearby scales.
- Workers do not accept jobs until the Promise-based OpenCV WASM runtime and reference template have initialized. Construction, script, WASM, message, and timeout failures become terminal errors instead of indefinite loading.
- `ImageBitmap` applies EXIF orientation during decode. Bitmaps and OpenCV Mats are explicitly disposed.
- JSZip packages the original `File` objects without re-encoding them. Bounding boxes are UI-only overlays.
- Typed worker messages isolate per-file errors, progress, cancellation, and results. Cancellation remains active until all workers terminate; retry runs only the selected error, cancelled, or needs-review image.

## Detection calibration

Defaults: `detected >= 0.85`, `needs-review >= 0.65 and < 0.85`, otherwise `not-detected`. These values are starting points only and **must be calibrated with a representative labeled dataset**. Template matching is sensitive to compression, opacity, rotation, perspective, color inversion, and substantial scale changes. A closely cropped template with the same visual treatment works best.

The template must fit the bottom-right ROI at one configured search scale (85%, 92.5%, 100%, 107.5%, or 115%). MarkScan checks this for every target before processing and reports the target ROI and maximum actionable template dimensions when it cannot fit. For calibration, assemble labeled positive/negative images from the intended source distribution, plot confidence distributions, choose thresholds against acceptable false-positive/false-negative rates, and retain `needs-review` as the uncertainty band.

## Limits and privacy

The UI defaults to 50 files and 25 MB per image. Batch images and reference templates receive the same MIME, magic-byte, size, and browser-decode validation. Very large batches may exceed browser memory during ZIP generation; a warning appears above 500 MB. No image or template leaves the browser. The OpenCV package is bundled from local dependencies. Source files are held as immutable `File` objects and added directly to the archive; MarkScan never removes, hides, crops, blurs, inpaints, or changes source bytes.

## Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

## Reports

The ZIP is enabled only after every queued item is terminal. It contains `detected/`, `not-detected/`, and `needs-review/`, plus UTF-8 `report.json` and `report.csv`. The reports include every accepted terminal input, including `error` and `cancelled`; those two statuses have no classification-folder image. Unicode names are preserved and same-folder collisions receive deterministic ` (2)`, ` (3)` suffixes. Archived originals are byte-for-byte identical to their input `File` objects.

## Future milestone

After dataset calibration, add an optional ONNX Runtime Web classifier only for uncertain OpenCV results, with WebGPU and WASM fallback. No removal functionality is planned.
