# CityTwin AI — Smart Urban Intelligence Platform

A production-grade **digital twin** platform for cities — combining real-time analytics, machine learning forecasting, AI-driven planning recommendations, and what-if scenario simulation into a single unified dashboard.

---

## Architecture

```
citytwin-ai/
├── backend/              FastAPI + MongoDB (Motor)
│   ├── app/
│   │   ├── api/v1/       REST endpoints (analytics, forecasts, planning, sim, chat, reports)
│   │   ├── agents/       LangChain + Gemini 1.5 Pro planning agent
│   │   ├── core/         Config, DB, Security (JWT + bcrypt)
│   │   ├── ml/models/    Prophet + XGBoost forecasters, risk classifiers
│   │   ├── ml/pipelines/ Data quality pipeline (IQR outlier, cleaning)
│   │   ├── services/     Analytics, simulation (NetworkX), report (WeasyPrint/PPTX)
│   │   └── utils/        MongoDB BSON serialization helpers
│   └── requirements.txt
│
├── frontend/             Next.js 14 (App Router)
│   ├── app/              Pages: dashboard, analytics, forecasting, planning, simulation, chat, reports, admin
│   ├── components/       CityMap (Mapbox GL), KpiCard, ForecastChart (Plotly), badges
│   ├── hooks/            React Query hooks for all API endpoints
│   └── lib/              apiFetch, SSE streamChat, utils
│
├── infra/
│   └── mongo-init.js     MongoDB seed: 8 city zones + indexes
│
├── docker-compose.yml    Orchestrates MongoDB, FastAPI, Next.js
└── .env.example          All required environment variables
```

---

## Tech Stack

| Layer         | Technology                                         |
|---------------|----------------------------------------------------|
| Frontend      | Next.js 14, Tailwind CSS, Mapbox GL JS             |
| Charts        | Plotly.js via react-plotly.js                      |
| State         | TanStack React Query v5                            |
| Backend       | FastAPI 0.115, Uvicorn                             |
| Database      | MongoDB 7 via Motor (async)                        |
| ML            | Scikit-learn, XGBoost, Prophet                     |
| AI/LLM        | Gemini 1.5 Pro via LangChain + google-generativeai |
| Simulation    | NetworkX city graph model                          |
| Reports       | WeasyPrint (PDF), python-pptx (PPTX)               |
| Auth          | JWT (HttpOnly cookies + Bearer)                    |
| Containers    | Docker + Docker Compose                            |

---

## Quick Start 

### Prerequisites
- Docker & Docker Compose, **or** Python 3.11+ and Node.js 20+
- Gemini API key ([get one free](https://aistudio.google.com/app/apikey))
- Mapbox token ([get one free](https://account.mapbox.com))

### 1. Clone & configure
```bash
git clone <your-repo>
cd citytwin-ai
cp .env.example .env
# Edit .env — fill in GEMINI_API_KEY, MAPBOX_TOKEN, JWT_SECRET
```

### 2. Docker (recommended)
```bash
docker compose up --build
```
- **Frontend:** http://localhost:3000
- **API docs:** http://localhost:8000/docs
- **MongoDB:** mongodb://localhost:27017

### 3. Local development
**Backend:**
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

---

## Dataset Format

Upload CSVs via **Admin → Upload Dataset**.

| Type        | Required columns                            |
|-------------|---------------------------------------------|
| `traffic`   | `zone_id`, `timestamp`, `vehicles_count`    |
| `pollution` | `zone_id`, `timestamp`, `aqi`               |
| `population`| `zone_id`, `year`, `population`             |
| `accident`  | `zone_id`, `timestamp`, `accident_count`    |
| `transport` | `zone_id`, `timestamp`, `bus_demand`        |

**Workflow:** Upload → Validate → Clean → Publish → Analytics/Forecasting enabled

---

## API Endpoints

| Module       | Key Endpoints                                              |
|--------------|------------------------------------------------------------|
| Auth         | `POST /auth/register`, `POST /auth/login`                  |
| Analytics    | `GET /analytics/kpis`, `/hotspots`, `/heatmap`, `/zone/:id`|
| Forecasting  | `POST /forecasts/trigger`, `GET /forecasts/results`        |
| Planning     | `POST /planning/recommend`, `GET /planning/recommendations`|
| Simulation   | `POST /simulations/run`, `GET /simulations`                |
| Chat         | `POST /chat/message` (SSE streaming)                       |
| Reports      | `POST /reports/generate`, `GET /reports/download/:id`      |
| Datasets     | `POST /datasets/upload`, `POST /datasets/:id/publish`      |

Interactive API docs: http://localhost:8000/docs

---

## Features

- **Dashboard** — Live KPI cards, toggle heatmap (traffic/pollution/accident), hotspot rankings, trend chart, health gauge
- **Analytics** — Zone-level bar charts, rankings table, profile deep-dive, above-average detector
- **Forecasting** — Background job trigger, Prophet+XGBoost predictions with confidence intervals, job status polling
- **Planning AI** — Gemini 1.5 Pro agent with example prompts, 3-year timeline, confidence meter, recommendation history
- **Simulation** — 5 scenario types (ADD_ROAD, ADD_BUSES, POPULATION_GROWTH, BUILD_HOSPITAL, RESTRICT_VEHICLES), before/after deltas
- **AI Chat** — Streaming SSE chat with real city context injection, session persistence
- **Reports** — Background PDF/PPTX generation with download, job status polling
- **Admin** — Drag-and-drop CSV upload, quality gauge (IQR-based), validate/clean/publish workflow

---

## Data Science Evaluation

This project includes portfolio-ready data science documentation and evaluation utilities:

| Artifact | Purpose |
|---|---|
| `DATA_SCIENCE_REPORT.md` | Problem statement, data pipeline, modeling approach, validation strategy, interview pitch |
| `MODEL_CARD.md` | Model inventory, intended use, limitations, responsible-use notes |
| `DEMO_SCRIPT.md` | Step-by-step interview demo flow |
| `backend/app/ml/evaluation.py` | MAE, RMSE, MAPE, bias, baseline comparison, and classification metrics |

Recommended validation approach:

```text
Use the first 70-80% of each zone time series for training,
hold out the last 20-30% for testing,
and compare against a naive last-value baseline.
```

Key metrics to discuss in interviews:

- Forecasting: MAE, RMSE, MAPE, bias, baseline improvement.
- Risk scoring: accuracy, macro precision, macro recall, confusion matrix.
- Data quality: missing percentage, duplicate count, IQR outlier count, quality score.

---

## Environment Variables

| Variable                     | Description                         |
|------------------------------|-------------------------------------|
| `MONGODB_URI`                | MongoDB connection string           |
| `JWT_SECRET`                 | Random 256-bit secret for tokens    |
| `GEMINI_API_KEY`             | Google AI Studio API key            |
| `MAPBOX_TOKEN`               | Mapbox public access token          |
| `ALLOWED_ORIGINS`            | Comma-separated CORS origins        |
| `NEXT_PUBLIC_API_BASE_URL`   | Backend URL seen by browser         |
| `NEXT_PUBLIC_MAPBOX_TOKEN`   | Mapbox token for frontend           |

---

## License

MIT © CityTwin AI
# Production Readiness Checklist

| Item | Status |
|---|---|
| API endpoints use correct HTTP status classes for create, validation, auth, forbidden, not found, and unexpected errors | PASS |
| Sensitive values are excluded from API error responses and generic production errors are returned | PASS |
| ML models handle cold-start and insufficient historical data gracefully | PASS |
| Frontend chat handles streaming/API unavailable states with retry and user-facing errors | PASS |
| File uploads are stored in GridFS behind authenticated API routes | PASS |
| Report downloads verify owner/admin access | PASS |
| Simulation history is scoped per user unless admin | PASS |
| MongoDB operations use structured filter dictionaries instead of string-built queries | PASS |
| Streaming chat checks client disconnects and closes cleanly | PASS |
| Docker images define non-root users | PASS |
| Package-lock reflects newly added Vitest dependencies | FIX REQUIRED: run `npm install` in `frontend/` to refresh lockfile |

## Production Notes

- Use `docker-compose.prod.yml` for production-like runs. It removes source volume mounts and enables MongoDB authentication.
- Store secrets only in `.env`, Render environment variables, Vercel environment variables, or MongoDB Atlas secrets.
- MongoDB Atlas should use SRV connection strings, IP allowlisting, and a least-privilege `readWrite` user on the `citytwin` database only.
- `ALLOWED_ORIGINS` must be explicit in production. Wildcards are rejected by backend configuration validation.
   




# Admin Login
Email: [EMAIL_ADDRESS]="admin@citytwin.com"
Password: [PASSWORD]="adminpassword123"

###  powershell -ExecutionPolicy Bypass -File .\start_all.ps1
