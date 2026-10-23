# Face Recognition Website

A browser dashboard for registering people, capturing face datasets, training the existing OpenCV LBPH recognizer, and displaying recognition results. Node.js serves the website and API, PostgreSQL stores user/event/sample metadata, and `GUI_Face_Recognition.py` runs the Haar + LBPH computer-vision logic.

## Requirements

- Node.js 20+
- Python 3.11+
- PostgreSQL 16+ (local or Supabase)
- A camera; browser camera access works on `localhost` or HTTPS

## Run Locally

1. From the repository root, create `backend/.env` from `backend/.env.example`. Set `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_SERVICE_ROLE_KEY` locally; never commit this file.
2. Start the Node backend, which also serves the website, and create/update the PostgreSQL tables:

   ```powershell
   cd backend
   npm install
   npm run db:setup
   npm run dev
   ```

3. In a second terminal opened at the repository root, install Python dependencies and start the recognition service. On Windows:

   ```powershell
   py -3.11 -m pip install -r requirements.txt
   py -3.11 GUI_Face_Recognition.py
   ```

   On macOS or Linux:

   ```sh
   python3 -m pip install -r requirements.txt
   python3 GUI_Face_Recognition.py
   ```

4. Open `http://localhost:4000` in a browser. No separate frontend server is needed.

Register a user, start the enrollment camera, and capture 100 samples. The browser sends compressed batches of ten frames. Select **Train Model** in the top bar. On the dashboard, start the recognition camera and select **Recognize** to see the predicted identity and LBPH confidence score.

## Shared Classifier Storage

The app keeps captured face photos under `backend/storage/faces` and does not upload them. It stores only the trained `classifier.xml` in the private Supabase Storage bucket so another clone can download the model and recognize people using the same Supabase PostgreSQL users.

Set these in `backend/.env`:

```dotenv
SUPABASE_URL=https://wilelrwklfnolskcktpk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
SUPABASE_BUCKET=face
```

Keep the service-role key on the backend only; never add it to frontend code or commit it. After configuring it, upload the current local model with `npm --prefix backend run model:upload`. Training uploads the model automatically. On another clone, model status/recognition downloads the classifier from Supabase to the local Python service. Attendance logs, users, and face-sample metadata are in Supabase PostgreSQL; the actual photos remain local.

## PostgreSQL

The Prisma schema is in `backend/prisma/schema.prisma`. `npx prisma db push` creates or updates the PostgreSQL schema, including users, attendance logs, and face-sample references.

## Recognition Details

The Python service follows the existing desktop algorithm: Haar cascade detection, equalized grayscale face crops, LBPH training, and a match threshold above 77%. The displayed confidence is the original LBPH distance-derived score, not a calibrated statistical accuracy guarantee.

The Node API proxies all browser operations to the Python service:

- `POST /api/faces/capture/batch` stores up to ten detected samples per request
- `POST /api/faces/train` trains a new model once from all active users, then incrementally adds the selected user's captured samples without rereading older users' images
- `POST /api/faces/recognize` returns identified faces and confidence scores
- `GET /api/faces/status` reports service, model, sample, and storage status; it restores a missing model from Supabase
- `GET /api/health` reports backend and database health

## Data and Secrets

Captured images, generated models, local environment files, Python caches, and Node build/dependency directories are excluded by `.gitignore`. Docker and the legacy Tkinter/MySQL/DeepFace paths are not used.
