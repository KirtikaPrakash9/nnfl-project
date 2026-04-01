# Backend — Sign Language Detection API

FastAPI backend that loads the pre-trained LSTM model and serves predictions to the Next.js frontend.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — confirms model is loaded |
| GET | `/signs` | Returns the list of detectable signs |
| POST | `/predict` | Accepts a 30-frame landmark sequence, returns the predicted sign |

## Local development

```bash
# From the backend/ directory
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

> **Note:** `model.h5` and `model_weights.h5` must be accessible.  
> The app searches for them in these locations (in order):
> 1. Path in the `MODEL_PATH` env var
> 2. `./model.h5` (inside `backend/`)
> 3. `../model.h5` (repo root — works when running locally with `uvicorn` from `backend/`)

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_PATH` | auto-detected | Absolute path to `model.h5` |
| `WEIGHTS_PATH` | auto-detected | Absolute path to `model_weights.h5` |
| `SIGNS_PATH` | auto-detected | Absolute path to `signs.json` |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of allowed CORS origins (set to your Vercel URL in production) |
| `PORT` | `8000` | Port bound by uvicorn (Railway/Render inject this automatically) |

## Deploying to Railway (recommended)

1. Push this repository to GitHub.
2. Go to [Railway](https://railway.app) → **New Project** → **Deploy from GitHub**.
3. Select your repository.
4. In the Railway dashboard, set the **Root Directory** to `/` (repo root).
5. Set the following **environment variables** in Railway:
   - `ALLOWED_ORIGINS` = `https://your-app.vercel.app` (your Vercel frontend URL)
6. Add a custom **Start Command**:
   ```
   cd backend && uvicorn app:app --host 0.0.0.0 --port $PORT
   ```
7. Railway will install `backend/requirements.txt` automatically via Nixpacks.
8. The model files (`model.h5`, `model_weights.h5`) at the repo root are included in the deployment and auto-discovered.

> **Alternative:** Copy `model.h5` and `model_weights.h5` into the `backend/` directory and set the **Root Directory** to `/backend` in Railway.

## Deploying to Render

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub repository.
3. Set:
   - **Root Directory**: _(leave empty — repo root)_
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `cd backend && uvicorn app:app --host 0.0.0.0 --port $PORT`
4. Add the same environment variables as above.

## Deploying to Google Cloud Run

```bash
# Build image
gcloud builds submit --tag gcr.io/PROJECT_ID/sign-language-backend .

# Deploy
gcloud run deploy sign-language-backend \
  --image gcr.io/PROJECT_ID/sign-language-backend \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGINS=https://your-app.vercel.app
```
