import "dotenv/config";
import axios from "axios";
import {
  classifierStorageConfigured,
  uploadClassifier,
} from "../services/classifierStorage";

const CV_SERVICE_URL = process.env.CV_SERVICE_URL || "http://127.0.0.1:5000";

const uploadCurrentClassifier = async (): Promise<void> => {
  if (!classifierStorageConfigured) {
    throw new Error("Set SUPABASE_URL, SUPABASE_BUCKET, and SUPABASE_SERVICE_ROLE_KEY in backend/.env first");
  }

  const response = await axios.get<{ model: string }>(`${CV_SERVICE_URL}/api/cv/model`, {
    timeout: 10000,
  });
  await uploadClassifier(Buffer.from(response.data.model, "base64"));
  console.log("Uploaded classifier.xml to the configured Supabase Storage bucket.");
};

uploadCurrentClassifier().catch((error: unknown) => {
  console.error("Classifier upload failed:", error);
  process.exitCode = 1;
});
