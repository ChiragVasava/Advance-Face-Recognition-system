import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";

/**
 * POST /api/recognition/event
 *
 * Called by the browser whenever the face model
 * identifies a face.  Logs the event to the `attendance_logs` table and
 * broadcasts it to all connected WebSocket clients in real time.
 *
 * Body:
 *   { userId?: number, confidence: number, label: string,
 *     isLive?: boolean, cameraId?: string }
 */
export const logRecognitionEvent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {
    userId,
    confidence,
    label,
    isLive = true,
    cameraId = "webcam-0",
  } = req.body as {
    userId?: number;
    confidence: number;
    label: string;
    isLive?: boolean;
    cameraId?: string;
  };

  // Validate userId references a real user when supplied.
  if (userId != null) {
    const exists = await prisma.user.findUnique({ where: { id: userId } });
    if (!exists) {
      throw new AppError(`User with id ${userId} not found`, 404);
    }
  }

  const log = await prisma.attendanceLog.create({
    data: {
      userId: userId ?? null,
      confidence,
      label,
      isLive,
      cameraId,
    },
    include: { user: { select: { name: true, department: true } } },
  });

  res.status(201).json({
    success: true,
    message: "Recognition event logged",
    data: log,
  });
};

/**
 * GET /api/recognition/logs
 *
 * Returns paginated attendance logs, newest first.
 * Query params: page (default 1), limit (default 50)
 */
export const getRecognitionLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    200,
    Math.max(1, parseInt((req.query.limit as string) || "50", 10))
  );
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.attendanceLog.findMany({
      skip,
      take: limit,
      orderBy: { recognisedAt: "desc" },
      include: { user: { select: { name: true, department: true } } },
    }),
    prisma.attendanceLog.count(),
  ]);

  res.status(200).json({
    success: true,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    data: logs,
  });
};

/**
 * GET /api/recognition/stats
 *
 * Dashboard statistics: total users, total recognition events today,
 * total unique users seen today, unknown detections today.
 */
export const getStats = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    totalLogsToday,
    knownLogsToday,
    unknownLogsToday,
    recentLogs,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.attendanceLog.count({
      where: { recognisedAt: { gte: startOfDay } },
    }),
    prisma.attendanceLog.count({
      where: {
        recognisedAt: { gte: startOfDay },
        userId: { not: null },
      },
    }),
    prisma.attendanceLog.count({
      where: {
        recognisedAt: { gte: startOfDay },
        userId: null,
      },
    }),
    prisma.attendanceLog.findMany({
      take: 10,
      orderBy: { recognisedAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      totalLogsToday,
      knownLogsToday,
      unknownLogsToday,
      recentLogs,
    },
  });
};

