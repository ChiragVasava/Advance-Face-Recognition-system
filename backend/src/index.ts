import "dotenv/config";
import express, { Application } from "express";

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import helmet from "helmet";
import cors from "cors";
import { prisma } from "./config/database";
import { globalErrorHandler, notFoundHandler } from "./middlewares/errorHandler";
import userRoutes from "./routes/user.routes";
import recognitionRoutes from "./routes/recognition.routes";
import faceRoutes from "./routes/face.routes";

// ── Bootstrap ──────────────────────────────────────────────────────

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || "4000", 10);

// ── Security ───────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── Body Parsing ───────────────────────────────────────────────────

// Increased limit to 10 MB to allow base64-encoded video frames.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Health Check ───────────────────────────────────────────────────

app.get("/api/health", async (_req, res) => {
  let dbStatus = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "unreachable";
  }
  res.status(200).json({
    success: true,
    message: "Face Recognition Backend is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    database: dbStatus,
  });
});

// ── API Routes ─────────────────────────────────────────────────────

app.use("/api/users", userRoutes);
app.use("/api/recognition", recognitionRoutes);
app.use("/api/faces", faceRoutes);

// ── Serve Static Frontend ──────────────────────────────────────────

import path from "path";
const FRONTEND_DIR = path.join(__dirname, "../../frontend");
app.use(express.static(FRONTEND_DIR));

// Fall-through: serve index.html for any non-API route
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ── 404 & Error Handling ───────────────────────────────────────────

app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── WebSocket Server (Real-Time Recognition Feed) ──────────────────

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// Track connected clients
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on("error", (err) => console.error("[WS] Error:", err));

  // Send welcome handshake
  ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
});

/**
 * Broadcast a recognition event to all connected WebSocket clients.
 * Called by the recognition controller after persisting a log entry.
 */
export const broadcast = (event: object): void => {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
};

// ── Server Start ───────────────────────────────────────────────────

const startServer = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("⚠️ Database unavailable; serving the dashboard in degraded mode:", error);
  }

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Health check:  http://localhost:${PORT}/api/health`);
    console.log(`👤 Users API:     http://localhost:${PORT}/api/users`);
    console.log(`🎯 Recognition:   http://localhost:${PORT}/api/recognition`);
    console.log(`🌐 Dashboard:     http://localhost:${PORT}`);
    console.log(`🔌 WebSocket:     ws://localhost:${PORT}/ws`);
    console.log(`🌍 Environment:   ${process.env.NODE_ENV || "development"}`);
  });
};

// ── Graceful Shutdown ──────────────────────────────────────────────

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received. Shutting down gracefully…`);
  wss.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (error: Error) => {
  console.error("[uncaughtException]", error);
  process.exit(1);
});

startServer();

export default app;
