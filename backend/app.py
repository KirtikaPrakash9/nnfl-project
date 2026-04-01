"""FastAPI backend for Sign Language Detection.

Loads the pre-trained LSTM model and exposes REST endpoints so the
Next.js frontend can send landmark sequences and receive predictions.
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ── Model / signs discovery ─────────────────────────────────────────────────

def _find_file(*candidates: Path | str) -> Path | None:
    """Return the first path in *candidates* that exists on disk."""
    for c in candidates:
        p = Path(c)
        if p.exists():
            return p
    return None


def _resolve_model_path() -> Path:
    env_val = os.environ.get("MODEL_PATH", "")
    p = _find_file(
        env_val,
        "model.h5",
        "../model.h5",
        Path(__file__).parent / "model.h5",
        Path(__file__).parent.parent / "model.h5",
    )
    if p is None:
        raise FileNotFoundError(
            "model.h5 not found. "
            "Copy model.h5 into the backend/ directory or set the MODEL_PATH env var."
        )
    return p


def _resolve_weights_path() -> Path | None:
    env_val = os.environ.get("WEIGHTS_PATH", "")
    return _find_file(
        env_val,
        "model_weights.h5",
        "../model_weights.h5",
        Path(__file__).parent / "model_weights.h5",
        Path(__file__).parent.parent / "model_weights.h5",
    )


def _load_signs() -> list[str]:
    env_val = os.environ.get("SIGNS_PATH", "")
    p = _find_file(
        env_val,
        "signs.json",
        Path(__file__).parent / "signs.json",
    )
    if p:
        with open(p) as fh:
            return json.load(fh)
    return ["hello", "thanks", "iloveyou"]


# ── Application state ───────────────────────────────────────────────────────

_model = None
_signs: list[str] = []


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    global _model, _signs

    import tensorflow as tf  # imported lazily to keep startup fast in tests

    model_path = _resolve_model_path()
    print(f"[startup] Loading model from {model_path} …")
    _model = tf.keras.models.load_model(str(model_path))

    weights_path = _resolve_weights_path()
    if weights_path:
        print(f"[startup] Loading weights from {weights_path} …")
        _model.load_weights(str(weights_path))

    _signs = _load_signs()
    print(f"[startup] Ready — signs: {_signs}")
    yield

    _model = None


# ── FastAPI app ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Sign Language Detection API",
    description="LSTM-based sign language prediction backend.",
    version="1.0.0",
    lifespan=lifespan,
)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ─────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    # 30 frames × 1662 landmark features — same extraction as the Python app
    sequence: list[list[float]] = Field(
        description="List of frames; each frame is a 1662-element landmark vector."
    )
    # Optional: pass the sign labels; defaults to the server-configured list
    signs: list[str] | None = Field(
        default=None,
        description="Sign labels in the same order as the model output classes.",
    )


class PredictResponse(BaseModel):
    prediction: str
    confidence: float
    probabilities: dict[str, float]


# ── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health", summary="Health check")
def health():
    return {"status": "ok", "model_loaded": _model is not None, "signs": _signs}


@app.get("/signs", summary="List available signs")
def get_signs():
    return {"signs": _signs}


@app.post("/predict", response_model=PredictResponse, summary="Predict sign from landmark sequence")
def predict(req: PredictRequest):
    if _model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded yet.")

    signs = req.signs if req.signs else _signs

    seq = np.array(req.sequence, dtype=np.float32)

    if seq.ndim != 2 or seq.shape[1] != 1662:
        raise HTTPException(
            status_code=422,
            detail=f"Each frame must be a 1662-element vector. Got shape {seq.shape}.",
        )
    if seq.shape[0] < 30:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least 30 frames, received {seq.shape[0]}.",
        )

    # Use the most recent 30 frames
    seq = seq[-30:]

    probs: np.ndarray = _model.predict(np.expand_dims(seq, axis=0), verbose=0)[0]

    if len(probs) != len(signs):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Model has {len(probs)} output classes but {len(signs)} sign labels were provided. "
                f"Server default signs: {_signs}"
            ),
        )

    pred_idx = int(np.argmax(probs))
    return PredictResponse(
        prediction=signs[pred_idx],
        confidence=float(probs[pred_idx]),
        probabilities={sign: float(probs[i]) for i, sign in enumerate(signs)},
    )
