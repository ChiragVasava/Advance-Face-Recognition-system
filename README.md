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

Keep both terminals running. Open **http://localhost:4000** in your browser.

## Use the Website

1. Open **Register Face**, enter the person's details, then select **Register User**.
2. Start the enrollment camera and capture 100 samples. Frames are sent in compressed batches of ten.
3. Select **Train Model**. The LBPH classifier is saved locally and uploaded to Supabase Storage if the service-role key is configured.
4. On the dashboard, start the recognition camera and select **Recognize**. The result and LBPH confidence score appear on the page and attendance is logged to PostgreSQL.

Check **System** for Node, database, Python service, and classifier status. The health endpoints are `http://localhost:4000/api/health` and `http://localhost:5000/api/cv/health`.

## Shared Classifier and Data

Set `SUPABASE_URL`, `SUPABASE_BUCKET`, and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. The configured bucket is `face` by default. Upload an existing local model once with:

```sh
npm --prefix backend run model:upload
```

After that, other clones using the same Supabase database and private bucket can download the classifier automatically when they check model status or recognize a face. Each clone needs its own untracked `backend/.env` with valid database connection strings and the server-only key.

Face photos are not uploaded. They remain under `backend/storage/faces` on the machine that captured them. A clone can recognize using the shared classifier and user records, but retraining there requires that machine to have the training photos. `classifier.xml` is also generated locally and is ignored by Git.

The score shown by LBPH is a distance-derived confidence estimate; it is not a statistically calibrated accuracy guarantee.

## GitHub and Secrets

`.gitignore` excludes `.env` files, captured photos, generated classifiers, dependencies, and build/cache output. Commit the example environment file, never your real `backend/.env` or Supabase service-role key.
