# Face Recognition Website

A browser dashboard for registering people, capturing training samples, training an OpenCV LBPH model, and recognizing faces with a confidence score.

- Node.js serves the website and REST API.
- Python (`GUI_Face_Recognition.py`) performs Haar face detection and LBPH training/recognition.
- PostgreSQL stores users, face-sample metadata, and attendance logs.
- Captured face photos stay on the machine that enrolled them. Only the trained `classifier.xml` is stored in Supabase Storage when configured.

## Requirements

- Node.js 20 or newer
- Python 3.11
- A Supabase project or another PostgreSQL database
- A webcam; browser camera access is allowed on `localhost` or HTTPS

You do not need Docker or a separate frontend server.

## First-Time Setup

Clone the GitHub repository and open a terminal in its root folder.

### 1. Configure the backend environment

Create `backend/.env` from the example file.

PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

macOS/Linux:

```sh
cp backend/.env.example backend/.env
```

Edit `backend/.env` locally. Set `DATABASE_URL` and `DIRECT_URL` to your PostgreSQL connection strings. The example uses Supabase's transaction pooler for `DATABASE_URL` and session pooler for `DIRECT_URL`.

Set `SUPABASE_SERVICE_ROLE_KEY` to your project's server-only secret key to share the trained classifier through Supabase Storage. Find it in the Supabase Dashboard under **Project Settings → API Keys**. Do not use the publishable/anon key, put this secret in frontend code, or commit `backend/.env`.

If the database password contains reserved URL characters, URL-encode those characters in both connection strings.

### 2. Install Node dependencies and initialize PostgreSQL

From the repository root:

```sh
cd backend
npm install
npm run db:setup
```

Run `db:setup` once for a new database or after Prisma schema changes. Stop the backend before running it again; Windows can lock Prisma's generated engine while the server is using it.

### 3. Start the backend and website

In the same `backend` terminal:

```sh
npm run dev
```

This starts the Node API and serves the frontend at **http://localhost:4000**. There is no separate frontend command.

### 4. Install and start the Python recognition service

Open a second terminal at the repository root.

Windows:

```powershell
py -3.11 -m pip install -r requirements.txt
py -3.11 GUI_Face_Recognition.py
```

macOS/Linux:

```sh
python3 -m pip install -r requirements.txt
python3 GUI_Face_Recognition.py
```

Keep both terminals running. Open `http://localhost:4000` in a browser.

Register a user, start the enrollment camera, and capture 100 samples. The browser sends compressed batches of ten frames. Select **Train Model** in the top bar. The first training builds the classifier from active users; later training adds the selected user's samples without rereading older users' images. On the dashboard, start the recognition camera and select **Recognize** to see the predicted identity and LBPH confidence score.

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
