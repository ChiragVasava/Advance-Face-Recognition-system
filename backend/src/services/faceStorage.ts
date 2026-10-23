import fs from "fs/promises";
import path from "path";

const localStorageDir = process.env.FACE_STORAGE_DIR || path.resolve(process.cwd(), "storage", "faces");

const localPath = (objectPath: string): string => {
  const root = path.resolve(localStorageDir);
  const destination = path.resolve(root, objectPath);
  if (!destination.startsWith(root + path.sep)) {
    throw new Error("Invalid face image storage path");
  }
  return destination;
};

export const saveFaceImage = async (objectPath: string, image: Buffer): Promise<void> => {
  const destination = localPath(objectPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, image);
};

export const readFaceImage = async (objectPath: string): Promise<Buffer> =>
  fs.readFile(localPath(objectPath));

export const faceStorageProvider = "local";
