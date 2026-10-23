"""OpenCV Haar/LBPH service used by the browser through the Node.js API."""

from __future__ import annotations

import base64
import binascii
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field


MODEL_PATH = Path(os.getenv("FACE_MODEL_PATH", Path(__file__).resolve().parent / "classifier.xml"))
MATCH_THRESHOLD = int(os.getenv("MATCH_THRESHOLD", "77"))
FACE_CASCADE = cv2.CascadeClassifier(
    str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
)
recognizer: Any = None


class ImageRequest(BaseModel):
    image: str


class TrainingSample(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: int = Field(alias="userId")
    image: str


class TrainRequest(BaseModel):
    samples: list[TrainingSample]


class CaptureBatchRequest(BaseModel):
    images: list[str] = Field(min_length=1, max_length=10)


class ClassifierRequest(BaseModel):
    model: str


app = FastAPI(title="OpenCV Face Recognition", version="1.0.0")


def decode_image(encoded: str) -> np.ndarray:
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from exc
    if len(raw) > 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds the 6 MB limit")
    if not raw:
        raise HTTPException(status_code=400, detail="Image data is empty")
    try:
        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    except cv2.error as exc:
        raise HTTPException(status_code=400, detail="Could not decode image") from exc
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return image


def get_gray_face(image: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    x, y, width, height = box
    face = cv2.resize(image[y : y + height, x : x + width], (200, 200))
    return cv2.equalizeHist(face)


def capture_face_sample(encoded_image: str) -> str | None:
    image = decode_image(encoded_image)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    boxes = FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=8, minSize=(100, 100)
    )
    if len(boxes) == 0:
        return None

    x, y, width, height = max(boxes, key=lambda box: box[2] * box[3])
    face = cv2.resize(gray[y : y + height, x : x + width], (300, 300))
    face = cv2.equalizeHist(face)
    success, encoded = cv2.imencode(".jpg", face, [cv2.IMWRITE_JPEG_QUALITY, 82])
    if not success:
        raise HTTPException(status_code=500, detail="Could not encode the face sample")
    return base64.b64encode(encoded).decode("ascii")


@app.get("/api/cv/health")
def health() -> dict[str, object]:
    return {"status": "ok", "model_trained": recognizer is not None or MODEL_PATH.exists()}


@app.get("/api/cv/model")
def get_classifier() -> dict[str, str]:
    if not MODEL_PATH.is_file():
        raise HTTPException(status_code=404, detail="No trained classifier is available on this machine")
    return {"model": base64.b64encode(MODEL_PATH.read_bytes()).decode("ascii")}


@app.put("/api/cv/model")
def install_classifier(body: ClassifierRequest) -> dict[str, object]:
    try:
        model_bytes = base64.b64decode(body.model, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid classifier encoding") from exc
    if not model_bytes or len(model_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Classifier is empty or exceeds the 50 MB limit")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = MODEL_PATH.with_name(f"{MODEL_PATH.stem}.incoming.xml")
    temporary_path.write_bytes(model_bytes)
    installed = cv2.face.LBPHFaceRecognizer_create()
    try:
        installed.read(str(temporary_path))
    except cv2.error as exc:
        temporary_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Supplied classifier.xml is invalid") from exc
    temporary_path.replace(MODEL_PATH)

    global recognizer
    recognizer = installed
    return {"success": True, "model_trained": True}


@app.post("/api/cv/capture")
def capture(body: ImageRequest) -> dict[str, object]:
    encoded_face = capture_face_sample(body.image)
    if encoded_face is None:
        raise HTTPException(status_code=422, detail="No face detected; center your face and try again")
    return {"success": True, "image": encoded_face}


@app.post("/api/cv/capture/batch")
def capture_batch(body: CaptureBatchRequest) -> dict[str, object]:
    results = []
    for image in body.images:
        try:
            encoded_face = capture_face_sample(image)
            results.append({"image": encoded_face})
        except HTTPException as exc:
            if exc.status_code == 422:
                results.append({"image": None})
            else:
                raise
    return {"success": True, "results": results}


@app.post("/api/cv/detect")
def detect(body: ImageRequest) -> dict[str, object]:
    image = decode_image(body.image)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    boxes = FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=8, minSize=(100, 100)
    )
    return {
        "width": int(gray.shape[1]),
        "height": int(gray.shape[0]),
        "faces": [
            {"x": int(x), "y": int(y), "w": int(width), "h": int(height)}
            for x, y, width, height in boxes
        ],
    }


@app.post("/api/cv/train")
def train(body: TrainRequest) -> dict[str, object]:
    if not body.samples:
        raise HTTPException(status_code=400, detail="Capture face samples before training")

    faces: list[np.ndarray] = []
    labels: list[int] = []
    for sample in body.samples:
        image = decode_image(sample.image)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces.append(cv2.resize(gray, (200, 200)))
        labels.append(sample.user_id)

    global recognizer
    trained = recognizer
    is_incremental = False
    if trained is None and MODEL_PATH.exists():
        trained = cv2.face.LBPHFaceRecognizer_create()
        try:
            trained.read(str(MODEL_PATH))
        except cv2.error as exc:
            raise HTTPException(status_code=500, detail="Classifier file is corrupted; train the model again") from exc

    if trained is None:
        trained = cv2.face.LBPHFaceRecognizer_create()
        trained.train(faces, np.asarray(labels, dtype=np.int32))
    else:
        existing_labels = set(int(label) for label in trained.getLabels().flatten())
        new_samples = [
            (face, label)
            for face, label in zip(faces, labels)
            if label not in existing_labels
        ]
        if new_samples:
            new_faces, new_labels = zip(*new_samples)
            trained.update(list(new_faces), np.asarray(new_labels, dtype=np.int32))
            faces = list(new_faces)
            labels = list(new_labels)
        else:
            faces = []
            labels = []
        is_incremental = True

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = MODEL_PATH.with_suffix(".tmp.xml")
    trained.write(str(temporary_path))
    if not temporary_path.exists() or temporary_path.stat().st_size == 0:
        temporary_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Classifier save failed")
    temporary_path.replace(MODEL_PATH)

    recognizer = trained
    return {
        "success": True,
        "samples_trained": len(faces),
        "users_trained": len(set(labels)),
        "incremental": is_incremental,
    }


@app.post("/api/cv/recognize")
def recognize(body: ImageRequest) -> dict[str, object]:
    model = recognizer
    if model is None and MODEL_PATH.exists():
        model = cv2.face.LBPHFaceRecognizer_create()
        try:
            model.read(str(MODEL_PATH))
        except cv2.error as exc:
            raise HTTPException(status_code=500, detail="Classifier file is corrupted; train the model again") from exc
    if model is None:
        raise HTTPException(status_code=409, detail="Train the face model before recognition")

    image = decode_image(body.image)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    boxes = FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=6, minSize=(80, 80)
    )
    results = []
    for x, y, width, height in boxes:
        predicted_id, distance = model.predict(get_gray_face(gray, (x, y, width, height)))
        confidence = max(0, int(100 * (1 - float(distance) / 300)))
        results.append(
            {
                "predicted_id": int(predicted_id) if confidence > MATCH_THRESHOLD else None,
                "confidence": confidence,
                "bbox": {"x": int(x), "y": int(y), "w": int(width), "h": int(height)},
            }
        )
    return {"success": True, "faces": results}


if __name__ == "__main__":
    uvicorn.run(
        "GUI_Face_Recognition:app",
        host=os.getenv("FACE_HOST", "127.0.0.1"),
        port=int(os.getenv("FACE_PORT", "5000")),
        reload=False,
    )
