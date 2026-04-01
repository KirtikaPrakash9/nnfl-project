# Frontend — Sign Language Detector

Next.js 16 + TypeScript + Tailwind CSS frontend that uses **MediaPipe Holistic** (running entirely in the browser) to extract 1662-dimensional landmark vectors from your webcam, then sends them to the FastAPI backend for LSTM inference.

## How it works

```
Webcam
  └─ MediaPipe Holistic (browser / WebAssembly)
       └─ 1662-dim landmark vector × 30 frames
            └─ POST /predict  →  FastAPI backend
                 └─ LSTM model prediction
                      └─ Display sign + confidence
```

MediaPipe landmark extraction in the browser is **identical** to the Python code — same feature vector shape (1662 values per frame), so the pre-trained model works without modification.

## Local development

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Create .env.local from the example and point to your backend
cp .env.local.example .env.local
# Edit NEXT_PUBLIC_API_URL=http://localhost:8000

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — allow camera access when prompted.

> Make sure the FastAPI backend is running (`uvicorn app:app --reload` from the `backend/` directory).

## Environment variables

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://your-app.up.railway.app` | URL of the deployed FastAPI backend |

## Deploying to Vercel

1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) → **Add New Project** → Import your repository.
3. Set the **Root Directory** to `frontend`.
4. Add the environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend.up.railway.app`
5. Click **Deploy**.

Vercel auto-detects Next.js projects and uses the correct build settings.

> **HTTPS requirement:** Modern browsers only allow camera access on HTTPS pages.  
> Vercel deployments are HTTPS by default. For local development, `localhost` is whitelisted by browsers.

## Tech stack

- [Next.js 16](https://nextjs.org) — React framework (App Router)
- [MediaPipe Holistic](https://google.github.io/mediapipe/solutions/holistic.html) — Pose + face + hand landmark detection
- [Tailwind CSS](https://tailwindcss.com) — Utility-first CSS
- [TypeScript](https://www.typescriptlang.org) — Type safety
