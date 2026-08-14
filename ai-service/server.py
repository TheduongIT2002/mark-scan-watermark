from __future__ import annotations

import hashlib
import io
import os
import threading
import urllib.request
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as functional
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageOps


MODEL_URL = os.getenv(
    "MARKSCAN_LAMA_MODEL_URL",
    "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt",
)
MODEL_MD5 = os.getenv("MARKSCAN_LAMA_MODEL_MD5", "e3aa4aaa15225a33ec84f9f4bc47e500")
MODEL_PATH = Path(
    os.getenv(
        "MARKSCAN_LAMA_MODEL_PATH",
        str(Path.home() / ".cache" / "markscan" / "big-lama.pt"),
    )
)
MAX_FILE_BYTES = int(os.getenv("MARKSCAN_AI_MAX_FILE_BYTES", str(32 * 1024 * 1024)))
MAX_PIXELS = int(os.getenv("MARKSCAN_AI_MAX_PIXELS", str(36_000_000)))
MIN_CROP_SIZE = int(os.getenv("MARKSCAN_AI_MIN_CROP_SIZE", "384"))


def _allowed_origins() -> list[str]:
    configured = os.getenv("MARKSCAN_ALLOWED_ORIGINS", "")
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    return defaults + [item.strip() for item in configured.split(",") if item.strip()]


app = FastAPI(title="MarkScan Local LaMa", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def private_network_access(request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

_model: torch.jit.ScriptModule | None = None
_model_lock = threading.Lock()


def _device() -> torch.device:
    requested = os.getenv("MARKSCAN_AI_DEVICE", "auto").lower()
    if requested == "auto":
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("MARKSCAN_AI_DEVICE=cuda but CUDA is unavailable")
    return torch.device(requested)


def _md5(path: Path) -> str:
    digest = hashlib.md5()  # nosec B324 - required only for upstream model integrity compatibility
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_model() -> None:
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if MODEL_PATH.exists() and _md5(MODEL_PATH) == MODEL_MD5:
        return
    temporary = MODEL_PATH.with_suffix(".download")
    if temporary.exists():
        temporary.unlink()
    urllib.request.urlretrieve(MODEL_URL, temporary)
    if _md5(temporary) != MODEL_MD5:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("Downloaded LaMa model failed its integrity check")
    temporary.replace(MODEL_PATH)


def _get_model() -> tuple[torch.jit.ScriptModule, torch.device]:
    global _model
    device = _device()
    with _model_lock:
        if _model is None:
            _download_model()
            _model = torch.jit.load(str(MODEL_PATH), map_location=device).eval().to(device)
    return _model, device


def _decode_image(payload: bytes, mode: str) -> Image.Image:
    try:
        with Image.open(io.BytesIO(payload)) as source:
            return ImageOps.exif_transpose(source).convert(mode)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Unable to decode image") from error


def _pad_to_modulo(tensor: torch.Tensor, modulo: int, mode: str) -> tuple[torch.Tensor, int, int]:
    height, width = tensor.shape[-2:]
    pad_height = (modulo - height % modulo) % modulo
    pad_width = (modulo - width % modulo) % modulo
    if not pad_height and not pad_width:
        return tensor, height, width
    return functional.pad(tensor, (0, pad_width, 0, pad_height), mode=mode), height, width


def _crop_bounds(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask > 0)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    mark_size = max(x1 - x0, y1 - y0)
    target_size = max(MIN_CROP_SIZE, mark_size * 7)
    target_size = min(target_size, mask.shape[1], mask.shape[0])
    center_x = (x0 + x1) // 2
    center_y = (y0 + y1) // 2
    crop_x0 = max(0, min(mask.shape[1] - target_size, center_x - target_size // 2))
    crop_y0 = max(0, min(mask.shape[0] - target_size, center_y - target_size // 2))
    return crop_x0, crop_y0, crop_x0 + target_size, crop_y0 + target_size


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "engine": "big-lama",
        "model_loaded": _model is not None,
        "device": str(_device()),
    }


@app.post("/v1/inpaint")
async def inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
) -> Response:
    image_bytes = await image.read()
    mask_bytes = await mask.read()
    if not image_bytes or len(image_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or exceeds the local AI limit")
    if not mask_bytes or len(mask_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Mask is empty or exceeds the local AI limit")

    source_image = _decode_image(image_bytes, "RGB")
    source_mask = _decode_image(mask_bytes, "L")
    if source_image.size != source_mask.size:
        raise HTTPException(status_code=422, detail="Image and mask dimensions do not match")
    if source_image.width * source_image.height > MAX_PIXELS:
        raise HTTPException(status_code=413, detail="Image resolution exceeds the local AI limit")

    original_array = np.asarray(source_image, dtype=np.uint8)
    image_array = original_array.astype(np.float32) / 255.0
    mask_array = (np.asarray(source_mask, dtype=np.uint8) > 127).astype(np.float32)
    if not np.any(mask_array):
        raise HTTPException(status_code=422, detail="Mask does not contain any selected pixels")

    crop_x0, crop_y0, crop_x1, crop_y1 = _crop_bounds(mask_array)
    cropped_image = image_array[crop_y0:crop_y1, crop_x0:crop_x1]
    cropped_mask = mask_array[crop_y0:crop_y1, crop_x0:crop_x1]

    model, device = _get_model()
    image_tensor = torch.from_numpy(cropped_image).permute(2, 0, 1).unsqueeze(0).to(device)
    mask_tensor = torch.from_numpy(cropped_mask).unsqueeze(0).unsqueeze(0).to(device)
    image_tensor, height, width = _pad_to_modulo(image_tensor, 8, "reflect")
    mask_tensor, _, _ = _pad_to_modulo(mask_tensor, 8, "constant")

    with _model_lock, torch.inference_mode():
        prediction = model(image_tensor, mask_tensor)
    if isinstance(prediction, (tuple, list)):
        prediction = prediction[0]
    prediction = prediction[:, :, :height, :width].clamp(0, 1)
    original = image_tensor[:, :, :height, :width]
    selected = mask_tensor[:, :, :height, :width]
    prediction = prediction * selected + original * (1 - selected)

    crop_output = (
        prediction[0]
        .permute(1, 2, 0)
        .mul(255)
        .round()
        .byte()
        .cpu()
        .numpy()
    )
    output = np.array(original_array, copy=True)
    selected_pixels = cropped_mask.astype(bool)
    output_crop = output[crop_y0:crop_y1, crop_x0:crop_x1]
    output_crop[selected_pixels] = crop_output[selected_pixels]
    encoded = io.BytesIO()
    Image.fromarray(output, mode="RGB").save(encoded, format="PNG", optimize=True)
    return Response(content=encoded.getvalue(), media_type="image/png")
