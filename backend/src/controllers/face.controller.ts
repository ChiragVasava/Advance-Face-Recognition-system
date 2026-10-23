import { randomUUID } from "crypto";
import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { faceStorageProvider, readFaceImage, saveFaceImage } from "../services/faceStorage";
import {
  classifierStorageConfigured,
  downloadClassifier,
  uploadClassifier,
} from "../services/classifierStorage";

const CV_SERVICE_URL = process.env.CV_SERVICE_URL || "http://localhost:5000";
const MAX_SAMPLES_PER_USER = 100;

const uploadCurrentClassifier = async (): Promise<boolean> => {
  if (!classifierStorageConfigured) return false;
  try {
    const response = await axios.get<{ model: string }>(`${CV_SERVICE_URL}/api/cv/model`, { timeout: 10000 });
    await uploadClassifier(Buffer.from(response.data.model, "base64"));
    return true;
  } catch (error) {
    throw new AppError(`Model trained locally, but Supabase classifier upload failed: ${(error as Error).message}`, 502);
  }
};

const restoreClassifier = async (): Promise<boolean> => {
  if (!classifierStorageConfigured) return false;
  try {
    const classifier = await downloadClassifier();
    if (!classifier) return false;
    await axios.put(
      `${CV_SERVICE_URL}/api/cv/model`,
      { model: classifier.toString("base64") },
      { timeout: 15000, maxBodyLength: Infinity }
    );
    return true;
  } catch (error) {
    console.error("[Classifier restore] Failed to download/install Supabase model:", error);
    return false;
  }
};

const callCvService = async <T>(endpoint: string, data: unknown, timeout = 15000): Promise<T> => {
  try {
    const response = await axios.post<T>(`${CV_SERVICE_URL}${endpoint}`, data, {
      timeout,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || "Face recognition service is unavailable";
      throw new AppError(message, error.response?.status || 503);
    }
    throw error;
  }
};

const decodeIncomingImage = (image: string): Buffer => {
  const encoded = image.replace(/^data:image\/[\w.+-]+;base64,/, "");
  if (!encoded || encoded.length > 8 * 1024 * 1024) {
    throw new AppError("Image is empty or exceeds the 6 MB upload limit", 400);
  }
  return Buffer.from(encoded, "base64");
};

export const captureFaceSample = async (req: Request, res: Response): Promise<void> => {
  const { userId, image } = req.body as { userId: number; image: string };
  if (!Number.isInteger(userId) || userId < 1 || typeof image !== "string") {
    throw new AppError("A valid userId and camera image are required", 400);
  }
  decodeIncomingImage(image);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new AppError("Active user not found", 404);

  const sampleCount = await prisma.faceSample.count({ where: { userId } });
  if (sampleCount >= MAX_SAMPLES_PER_USER) {
    throw new AppError(`A maximum of ${MAX_SAMPLES_PER_USER} face samples is allowed per user`, 409);
  }

  const captured = await callCvService<{ image: string }>("/api/cv/capture", { image });
  const storagePath = `${userId}/${randomUUID()}.jpg`;
  await saveFaceImage(storagePath, Buffer.from(captured.image, "base64"));
  const sample = await prisma.faceSample.create({
    data: { userId, storagePath },
    select: { id: true, createdAt: true },
  });

  res.status(201).json({
    success: true,
    data: {
      id: sample.id,
      userId,
      count: sampleCount + 1,
      limit: MAX_SAMPLES_PER_USER,
      createdAt: sample.createdAt,
    },
  });
};

export const captureFaceSampleBatch = async (req: Request, res: Response): Promise<void> => {
  const { userId, images } = req.body as { userId: number; images: string[] };
  if (!Number.isInteger(userId) || userId < 1 || !Array.isArray(images) || images.length < 1 || images.length > 10) {
    throw new AppError("A valid userId and 1 to 10 camera frames are required", 400);
  }
  images.forEach(decodeIncomingImage);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new AppError("Active user not found", 404);

  const sampleCount = await prisma.faceSample.count({ where: { userId } });
  const remaining = MAX_SAMPLES_PER_USER - sampleCount;
  if (remaining <= 0) {
    throw new AppError(`This user already has the maximum of ${MAX_SAMPLES_PER_USER} face samples`, 409);
  }

  const frames = images.slice(0, remaining);
  const result = await callCvService<{ results: Array<{ image: string | null }> }>(
    "/api/cv/capture/batch",
    { images: frames },
    30000
  );
  const croppedFaces = result.results.filter(
    (item): item is { image: string } => typeof item.image === "string"
  );
  if (croppedFaces.length === 0) {
    throw new AppError("No face detected; center your face and try again", 422);
  }

  const storagePaths = croppedFaces.map(() => `${userId}/${randomUUID()}.jpg`);
  await Promise.all(croppedFaces.map((face, index) =>
    saveFaceImage(storagePaths[index], Buffer.from(face.image, "base64"))
  ));
  const saved = await prisma.faceSample.createMany({
    data: storagePaths.map((storagePath) => ({ userId, storagePath })),
  });

  res.status(201).json({
    success: true,
    data: {
      count: sampleCount + saved.count,
      captured: saved.count,
      rejected: frames.length - saved.count,
      limit: MAX_SAMPLES_PER_USER,
    },
  });
};

export const trainFaceModel = async (_req: Request, res: Response): Promise<void> => {
  const samples = await prisma.faceSample.findMany({
    where: { user: { isActive: true } },
    select: { userId: true, storagePath: true },
    orderBy: { id: "asc" },
  });
  if (samples.length === 0) {
    throw new AppError("Capture face samples for at least one active user before training", 400);
  }

  const trainingSamples = await Promise.all(
    samples.map(async (sample) => ({
      userId: sample.userId,
      image: (await readFaceImage(sample.storagePath)).toString("base64"),
    }))
  );
  const result = await callCvService<{ samples_trained: number; users_trained: number }>(
    "/api/cv/train",
    { samples: trainingSamples },
    120000
  );
  const classifierStorage = (await uploadCurrentClassifier()) ? "supabase" : "local";

  res.status(200).json({
    success: true,
    message: "Face model trained successfully",
    data: { ...result, imageStorage: faceStorageProvider, classifierStorage },
  });
};

export const recognizeFace = async (req: Request, res: Response): Promise<void> => {
  const { image, cameraId = "webcam-0" } = req.body as { image: string; cameraId?: string };
  if (typeof image !== "string") throw new AppError("A camera image is required", 400);
  decodeIncomingImage(image);

  try {
    const status = await axios.get<{ model_trained: boolean }>(`${CV_SERVICE_URL}/api/cv/health`, { timeout: 2500 });
    if (!status.data.model_trained && !(await restoreClassifier())) {
      throw new AppError("No classifier is available. Train a model first or configure Supabase classifier storage.", 409);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Face recognition service is unavailable", 503);
  }

  const result = await callCvService<{
    faces: Array<{
      predicted_id: number | null;
      confidence: number;
      bbox: { x: number; y: number; w: number; h: number };
    }>;
  }>("/api/cv/recognize", { image });

  const ids = [...new Set(result.faces.flatMap((face) => face.predicted_id == null ? [] : [face.predicted_id]))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, name: true, department: true },
      })
    : [];
  const userById = new Map(users.map((user) => [user.id, user]));

  const faces = await Promise.all(result.faces.map(async (face) => {
    const user = face.predicted_id == null ? null : userById.get(face.predicted_id) || null;
    const label = user ? `${user.name} (${face.confidence}%)` : "Unknown";
    await prisma.attendanceLog.create({
      data: {
        userId: user?.id ?? null,
        confidence: face.confidence,
        label,
        isLive: true,
        cameraId: String(cameraId).slice(0, 50),
      },
    });
    return { ...face, user, label, isLive: true };
  }));

  res.status(200).json({ success: true, faces });
};

export const getFaceModelStatus = async (req: Request, res: Response): Promise<void> => {
  let service = false;
  let modelTrained = false;
  try {
    const response = await axios.get<{ model_trained: boolean }>(`${CV_SERVICE_URL}/api/cv/health`, { timeout: 2500 });
    service = true;
    modelTrained = response.data.model_trained;
    if (!modelTrained && await restoreClassifier()) {
      const restored = await axios.get<{ model_trained: boolean }>(`${CV_SERVICE_URL}/api/cv/health`, { timeout: 2500 });
      modelTrained = restored.data.model_trained;
    }
  } catch {
    service = false;
  }
  let database = true;
  let sampleCount = 0;
  let samplesForUser: number | null = null;
  let usersWithSamples = 0;
  const requestedUserId = Number(req.query.userId);
  const userId = Number.isInteger(requestedUserId) && requestedUserId > 0 ? requestedUserId : null;
  try {
    const [samples, users, userSamples] = await Promise.all([
      prisma.faceSample.count({ where: { user: { isActive: true } } }),
      prisma.faceSample.findMany({
        where: { user: { isActive: true } },
        distinct: ["userId"],
        select: { userId: true },
      }),
      userId
        ? prisma.faceSample.count({ where: { userId, user: { isActive: true } } })
        : Promise.resolve(null),
    ]);
    sampleCount = samples;
    usersWithSamples = users.length;
    samplesForUser = userSamples;
  } catch {
    database = false;
  }
  res.status(200).json({
    success: true,
    data: {
      service,
      modelTrained,
      database,
      sampleCount,
      samplesForUser,
      usersWithSamples,
      imageStorage: faceStorageProvider,
      classifierStorage: classifierStorageConfigured ? "supabase" : "local",
    },
  });
};
