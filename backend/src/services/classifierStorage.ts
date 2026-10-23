const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_BUCKET;
const classifierObject = "classifier.xml";

export const classifierStorageConfigured = Boolean(supabaseUrl && supabaseKey && bucket);

const classifierUrl = (): string =>
  `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket!)}/${classifierObject}`;

const headers = () => ({
  apikey: supabaseKey!,
  Authorization: `Bearer ${supabaseKey}`,
});

export const uploadClassifier = async (classifier: Buffer): Promise<void> => {
  if (!classifierStorageConfigured) {
    throw new Error("Set SUPABASE_URL, SUPABASE_BUCKET, and SUPABASE_SERVICE_ROLE_KEY to store the classifier");
  }

  const response = await fetch(classifierUrl(), {
    method: "POST",
    headers: {
      ...headers(),
      "Content-Type": "application/xml",
      "x-upsert": "true",
    },
    body: new Uint8Array(classifier),
  });
  if (!response.ok) {
    throw new Error(`Supabase classifier upload failed (${response.status}): ${await response.text()}`);
  }
};

export const downloadClassifier = async (): Promise<Buffer | null> => {
  if (!classifierStorageConfigured) return null;

  const response = await fetch(classifierUrl(), { headers: headers() });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Supabase classifier download failed (${response.status}): ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
};
