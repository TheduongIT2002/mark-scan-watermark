# MarkScan

MarkScan detects the fixed Gemini sparkle watermark and reconstructs the
covered region locally. Detection runs in the browser; high-quality
reconstruction uses a Big LaMa companion service bound to `127.0.0.1`.

Only process images that you own or are authorized to edit.

## How reconstruction works

1. The calibrated high-pass detector locates the 52×52 Gemini sparkle.
2. MarkScan creates a pixel-level four-point mask instead of deleting the
   detector's entire rectangular bounding box.
3. Anti-aliased, semi-transparent edge pixels are inverse-composited.
4. Big LaMa reconstructs the masked core using full-image context.
5. The browser composites the AI result only inside the soft mask. Every pixel
   outside the mask comes directly from the original canvas.
6. Cleaned derivatives are encoded as PNG to avoid a second lossy JPEG pass.

If the local LaMa service is unavailable, MarkScan automatically uses a
shape-aware patch/Poisson fallback. The results screen shows which engine was
used for each image.

## Setup

Requires Node.js 20.19+ and Python 3.10+.

```powershell
npm install
npm run ai:start
```

In another terminal:

```powershell
npm run dev
```

Open `http://localhost:3000`. The first AI request downloads the verified Big
LaMa model to `%USERPROFILE%\.cache\markscan\big-lama.pt`; later runs reuse the
cached model. See [ai-service/README.md](ai-service/README.md) for device and
origin configuration.

The web app remains compatible with Next.js static export. The browser calls
the loopback AI process directly, so no Next.js API route or external image
upload is required.

## Architecture

- Next.js 16 App Router, React 19 and strict TypeScript.
- Browser detector calibrated from an authorized positive/negative dataset.
- Pixel-accurate sparkle mask with full-coverage AI compositing.
- Local FastAPI + TorchScript Big LaMa service with CPU/CUDA auto-selection.
- Browser-only fallback for machines where the AI process is not running.
- Original files remain immutable and are never added to the result archive.
- Result ZIP files contain every uploaded image under `cleaned/`: reconstructed PNGs when available, otherwise the unchanged source image.

## Commands

```powershell
npm run ai:start
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run build
```

## Production Deployment & Reload

When updating the Nginx configuration and systemd service on the production server:

1. **Reload Nginx configuration**:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **Restart AI service**:
   ```bash
   sudo systemctl restart markscan-ai.service
   sudo systemctl status markscan-ai.service
   ```

3. **5-Request Smoke Test**:
   Verify that rapid health requests and inpaint requests succeed without rate-limit starvation (200 OK):
   ```bash
   for i in {1..5}; do curl -s -o /dev/null -w "%{http_code}\n" https://duongpt.io.vn/api/ai/health; done
   ```
   All 5 requests should return `200`.

The companion service exposes `http://127.0.0.1:8384/health`. It accepts only
configured frontend origins and rejects empty, oversized or mismatched
image/mask inputs. Single-threaded model inference on CPU is queued safely
without blocking event loop health probes.
