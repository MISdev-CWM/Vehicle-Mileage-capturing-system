from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import PIL.Image
# Pillow 10+ removed ANTIALIAS -- restore as alias for LANCZOS so EasyOCR works
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.LANCZOS
import easyocr
import numpy as np
from PIL import Image
import io
import re
import logging
import cv2
from collections import defaultdict

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Meter OCR Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# EasyOCR reader -- digit-only allowlist dramatically reduces false positives
# ---------------------------------------------------------------------------
reader = easyocr.Reader(['en'], gpu=False)

# Only accept digits -- rules out "km/h", brand names, units, etc.
DIGIT_ALLOWLIST = '0123456789'


# ---------------------------------------------------------------------------
# Lighting-robust preprocessing pipelines
# ---------------------------------------------------------------------------

def _ensure_min_size(gray, min_px=900):
    """Upscale so longest side >= min_px for better digit recognition."""
    h, w = gray.shape[:2]
    if max(h, w) < min_px:
        scale = min_px / max(h, w)
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                          interpolation=cv2.INTER_CUBIC)
    return gray


def _to_gray(image):
    """PIL image -> OpenCV grayscale ndarray."""
    rgb = np.array(image.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def _to_3ch(gray):
    """Single-channel -> 3-channel (EasyOCR requirement)."""
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)


def pipeline_clahe_otsu(gray):
    """Pipeline 1: CLAHE + Otsu. Good for even/low-contrast images."""
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255,
                               cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return _to_3ch(binary)


def pipeline_adaptive(gray):
    """Pipeline 2: Adaptive threshold. Good for shadows/uneven lighting."""
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    binary = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, blockSize=19, C=9
    )
    return _to_3ch(binary)


def pipeline_adaptive_inv(gray):
    """Pipeline 3: Inverted adaptive threshold. Good for dark LCD screens."""
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    binary = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=19, C=9
    )
    return _to_3ch(binary)


def pipeline_clahe_sharpen(gray):
    """Pipeline 4: CLAHE + unsharp mask. Good for blurry digits."""
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=2)
    sharpened = cv2.addWeighted(enhanced, 1.8, blurred, -0.8, 0)
    sharpened = np.clip(sharpened, 0, 255).astype(np.uint8)
    return _to_3ch(sharpened)


def pipeline_gamma_otsu(gray):
    """Pipeline 5: Gamma brighten + Otsu. Good for dark/underexposed images."""
    inv_gamma = 1.0 / 0.5
    lut = np.array([((i / 255.0) ** inv_gamma) * 255
                    for i in range(256)], dtype=np.uint8)
    brightened = cv2.LUT(gray, lut)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(brightened)
    _, binary = cv2.threshold(enhanced, 0, 255,
                               cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return _to_3ch(binary)


ALL_PIPELINES = [
    ("clahe_otsu",    pipeline_clahe_otsu),
    ("adaptive",      pipeline_adaptive),
    ("adaptive_inv",  pipeline_adaptive_inv),
    ("clahe_sharpen", pipeline_clahe_sharpen),
    ("gamma_otsu",    pipeline_gamma_otsu),
]


# ---------------------------------------------------------------------------
# ROI detection -- find the odometer digit window in the photo
# ---------------------------------------------------------------------------

def crop_odometer_roi(image):
    """
    Locate the rectangular numeric display of the odometer.
    Uses morphological close on an inverted-Otsu image to merge digit blobs,
    then scores candidates by area, horizontal centredness, and vertical position.
    Falls back to a lower-centre fixed crop if nothing suitable is found.
    """
    cv_img = np.array(image.convert("RGB"))
    h, w = cv_img.shape[:2]

    gray = cv2.cvtColor(cv_img, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255,
                               cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Wide horizontal kernel merges individual digit blobs into one region
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 8))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    best_roi, best_score = None, 0.0

    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        area = cw * ch
        image_area = w * h

        if area < image_area * 0.02 or area > image_area * 0.88:
            continue

        aspect = cw / ch if ch > 0 else 0
        if aspect < 1.5 or aspect > 16:
            continue

        cx, cy = x + cw / 2, y + ch / 2
        x_score = 1.0 - abs(cx / w - 0.5) * 2
        y_score = min(1.0, cy / h)
        score = area * x_score * y_score
        if score > best_score:
            best_score, best_roi = score, (x, y, cw, ch)

    if best_roi:
        x, y, cw, ch = best_roi
        px, py = int(cw * 0.06), int(ch * 0.12)
        x1, y1 = max(0, x - px), max(0, y - py)
        x2, y2 = min(w, x + cw + px), min(h, y + ch + py)
        logging.info(f"ROI detected: ({x1},{y1})->({x2},{y2})")
        return image.crop((x1, y1, x2, y2))

    logging.info("No ROI found -- using lower-centre fallback crop")
    return image.crop((int(w * 0.08), int(h * 0.42),
                       int(w * 0.92), int(h * 0.82)))


# ---------------------------------------------------------------------------
# OCR pass with digit-only allowlist
# ---------------------------------------------------------------------------

def run_ocr(img_array):
    """Run EasyOCR restricted to digit characters only."""
    return reader.readtext(
        img_array,
        allowlist=DIGIT_ALLOWLIST,
        paragraph=False,
        detail=1,
        width_ths=0.9,
        batch_size=4,
    )


# ---------------------------------------------------------------------------
# Candidate extraction and vote-weighted merging
# ---------------------------------------------------------------------------

def extract_candidates(ocr_results, pipeline_name, weight=1.0):
    """
    Parse EasyOCR results into mileage candidates.
    Digit-only allowlist means no noise filtering needed -- just length/range checks.
    """
    candidates = []
    for bbox, text, conf in ocr_results:
        cleaned = re.sub(r'[^\d]', '', text)
        if not cleaned:
            continue
        for seq in re.findall(r'\d{4,7}', cleaned):
            value = int(seq)
            n = len(seq)
            score = float(conf) * weight
            if 1_000 <= value <= 999_999:
                score += 0.12
            if n in (5, 6):
                score += 0.06
            if cleaned == seq:
                score += 0.10
            candidates.append({
                "value":      value,
                "raw_text":   text,
                "confidence": round(float(conf), 4),
                "score":      round(min(score, 1.0), 4),
                "digit_count": n,
                "pipeline":   pipeline_name,
            })
    return candidates


def vote_and_rank(all_candidates):
    """
    Merge candidates across pipelines by value.
    Values seen in multiple pipelines receive a boost:
      final_score = avg_score * (1 + 0.15 * extra_votes)
    """
    buckets = defaultdict(lambda: {"total": 0.0, "votes": 0, "best": None})
    for c in all_candidates:
        v = c["value"]
        buckets[v]["total"] += c["score"]
        buckets[v]["votes"] += 1
        if buckets[v]["best"] is None or c["score"] > buckets[v]["best"]["score"]:
            buckets[v]["best"] = c

    merged = []
    for value, data in buckets.items():
        avg = data["total"] / data["votes"]
        final = avg * (1 + 0.15 * (data["votes"] - 1))
        entry = dict(data["best"])
        entry["final_score"] = round(min(final, 1.0), 4)
        entry["vote_count"]  = data["votes"]
        merged.append(entry)

    merged.sort(key=lambda c: c["final_score"], reverse=True)
    return merged


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

@app.post("/extract")
async def extract_meter(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        # Step 1: Crop to the odometer digit display region
        roi_image = crop_odometer_roi(image)

        # Step 2: Grayscale + upscale both ROI and full image
        roi_gray  = _ensure_min_size(_to_gray(roi_image))
        full_gray = _ensure_min_size(_to_gray(image))

        # Step 3: Run all pipelines on ROI (primary, weight 1.1)
        all_candidates = []
        primary_blocks = []

        for name, pipe_fn in ALL_PIPELINES:
            try:
                processed = pipe_fn(roi_gray)
                results   = run_ocr(processed)
                cands     = extract_candidates(results, f"roi_{name}", weight=1.1)
                all_candidates.extend(cands)
                if name == "clahe_otsu":
                    primary_blocks = [
                        {"text": t, "confidence": round(float(cf), 4)}
                        for _, t, cf in results
                    ]
                logging.info(f"[roi/{name}] {len(cands)} candidates")
            except Exception as e:
                logging.warning(f"Pipeline roi/{name} error: {e}")

        # Step 4: Run all pipelines on full image (fallback, weight 0.9)
        for name, pipe_fn in ALL_PIPELINES:
            try:
                processed = pipe_fn(full_gray)
                results   = run_ocr(processed)
                cands     = extract_candidates(results, f"full_{name}", weight=0.9)
                all_candidates.extend(cands)
                logging.info(f"[full/{name}] {len(cands)} candidates")
            except Exception as e:
                logging.warning(f"Pipeline full/{name} error: {e}")

        # Step 5: Vote-merge and rank all candidates
        ranked = vote_and_rank(all_candidates)
        best   = ranked[0] if ranked else None

        return {
            "success":         True,
            "mileage":         best["value"] if best else None,
            "best_guess":      best,
            "candidates":      ranked[:10],
            "detailed_blocks": primary_blocks,
            "block_count":     len(primary_blocks),
        }

    except Exception as e:
        logging.error(f"OCR failed: {e}")
        raise HTTPException(500, f"OCR processing failed: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
