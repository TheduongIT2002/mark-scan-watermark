# Authorized fixed-logo dataset

Dataset content stays outside `public/` and `src/`. Only this contract, tooling, and tiny synthetic fixtures belong in Git.

## Layout

```text
<authorized-root>/
  manifest.json
  canonical/logo.png
  images/<relative files>
  masks/<relative positive masks>
```

All manifest paths are slash-separated relative paths. Absolute paths, `..` traversal, symlinks escaping the root, credentials, personal data, and data URLs are prohibited.

## Annotation and authorization

- `positive`: exact owned logo present; requires an in-bounds box and a mask when `benchmark.requirePositiveMasks` is true.
- `negative`: logo absent.
- `difficult-negative`: absent but visually confusable, especially in the target ROI.
- `groupId` groups source families, adjacent frames, derivatives, or near duplicates and may occur in only one split.
- SHA-256 content may not cross splits; duplicates within a split are rejected.
- Rights metadata is an attestation only: no account names, tokens, credentials, or personal data.
- Notes/tags must describe provenance/categories without absolute host paths.

## Split strategy

Train is used only for future implementation. Validation chooses architecture/configuration. Test stays frozen for final evaluation. Validation/test must include both positives and negatives; representative data should include difficult negatives, sizes, aspect ratios, backgrounds, compression, opacity, offsets, and authorized variants.

## Commands

```powershell
npm run dataset:validate -- --root D:\authorized-dataset
npm run dataset:validate -- --root D:\authorized-dataset --json
npm run dataset:benchmark -- --root D:\authorized-dataset --json
```

The normal benchmark is `NOT_EVALUABLE` until a validated dataset, scanner, and explicit quality gates are supplied. Reports contain hashes/metadata only, never pixels or absolute external paths.

## Step 2B checklist

- Canonical owned/licensed logo asset and authoritative SHA-256.
- Representative authorized positive, negative, and difficult-negative images.
- Group-separated train/validation/test splits.
- Positive boxes and masks where mask IoU is required.
- Explicit precision, recall, false-positive-rate, IoU, and latency gates.

## Step 2B.0 private intake layout

```text
authorized-datasets/step2b-v1/
  intake.json
  canonical/logo.png
  raw/positive/
  raw/negative/
  raw/difficult-negative/
  masks/
```

The user must explicitly attest ownership/license and provide every label, positive bounding box, and configured mask. The tool never guesses authorization or annotations and never copies or mutates source assets.

```powershell
# Read-only readiness check (default)
npm run dataset:intake -- --root authorized-datasets/step2b-v1 --json

# Explicit atomic manifest creation; never overwrites
npm run dataset:intake -- --root authorized-datasets/step2b-v1 --json --write-manifest

# Validate generated authoritative manifest
npm run dataset:validate -- --root authorized-datasets/step2b-v1 --json
```

`intake.json` uses schema version 1, dataset identity/version, rights attestation, canonical relative path, benchmark configuration, and item annotations. Hashes and dimensions are calculated from fully decoded local bytes. Dry-run writes nothing. Existing `manifest.json` returns `MANIFEST_EXISTS`; there is no force mode.
