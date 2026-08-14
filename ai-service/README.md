# MarkScan Local LaMa service

This companion process runs Big LaMa on the same computer as the browser. It
binds only to `127.0.0.1`; source images are never sent to an external API.

## Start on Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\ai-service\start.ps1
```

The first inpaint request downloads the verified Big LaMa TorchScript model to
`%USERPROFILE%\.cache\markscan\big-lama.pt`. Later starts reuse that file.

Use `MARKSCAN_AI_DEVICE=cpu` or `MARKSCAN_AI_DEVICE=cuda` to override automatic
device selection. For a deployed MarkScan frontend, set a comma-separated list
of exact frontend origins in `MARKSCAN_ALLOWED_ORIGINS` before starting the
service. Local development origins on ports 3000 and 4173 are allowed by
default.

Health check: `http://127.0.0.1:8384/health`.
