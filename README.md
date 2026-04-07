# SynSoc AI

[![Frontend](https://img.shields.io/badge/Frontend-Netlify-00C7B7?logo=netlify&logoColor=white)](https://synsoc-ai.netlify.app)
[![Backend](https://img.shields.io/badge/Backend-Railway-0B0D0E?logo=railway&logoColor=white)](https://synsoc-api-production.up.railway.app/health)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

SynSoc AI is a full-stack social simulation platform that turns a policy topic into:
1. A knowledge graph of stakeholders and tensions
2. Multi-agent debate rounds with streaming turns
3. Decision-ready reports with conflict and consensus insights

Live app: https://synsoc-ai.netlify.app

API docs: https://synsoc-api-production.up.railway.app/docs

## Why SynSoc AI

Policy and strategy teams often miss second-order effects in stakeholder conflict. SynSoc AI helps teams test scenarios before real-world decisions by simulating diverse actors with different stances and incentives.

## Core Experience

1. Enter a social or policy topic.
2. Generate graph + agents.
3. Stream multi-agent interactions in real time.
4. Review analytics, transcripts, and recommendations.

## Architecture

```mermaid
flowchart LR
    U[User Browser]\nNetlify Frontend -->|POST /pipeline/stream| B[FastAPI Backend\nRailway]
    B --> C[Graph Extraction]
    B --> D[Agent Generation]
    B --> E[Simulation Engine]
    B --> F[Report Builder]
    C --> G[(Streaming Events)]
    D --> G
    E --> G
    F --> G
    G --> U
```

## Feature Highlights

1. Streaming simulation timeline with live status updates.
2. Stakeholder graph and agent network visualization.
3. Conflict scoring and stance distribution analytics.
4. Report tab with recommendation buckets and coalition map.
5. Consent-aware analytics initialization through cookie banner.
6. Production deployment on Netlify + Railway with CORS hardening.

## Quickstart

### Prerequisites

1. Python 3.11+
2. Node.js 22+
3. npm

### 1) Backend setup

```bash
cd /path/to/SynScoAI
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

Run backend:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2) Frontend setup

```bash
cd synsoc-ai-frontend
npm install
cp env.example .env
```

Set frontend API URL in `synsoc-ai-frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Run frontend:

```bash
npm run dev
```

Open http://localhost:5173

## Environment Variables

### Backend (`.env`)

| Variable | Required | Example |
|---|---|---|
| `OPENAI_API_KEY` | Yes | `sk-...` |
| `OPENAI_MODEL` | Yes | `gpt-5.4-nano` |
| `ALLOWED_ORIGINS` | Yes | `http://localhost:5173,https://synsoc-ai.netlify.app` |
| `RATE_LIMIT_PER_MINUTE_IP` | Yes | `60` |
| `SIM_LIMIT_PER_DAY_VISITOR` | Yes | `25` |
| `MAX_CONCURRENT_SIM_PER_VISITOR` | Yes | `1` |
| `REQUEST_TIMEOUT_SECONDS` | Yes | `120` |
| `MAX_INPUT_CHARS_TOPIC` | Yes | `240` |
| `MAX_INPUT_CHARS_CONTEXT` | Yes | `4000` |

### Frontend (`synsoc-ai-frontend/.env`)

| Variable | Required | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | `http://localhost:8000` |

## API Surface

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Health check |
| `/analyze` | POST | Topic to graph extraction |
| `/agents` | POST | Agent generation |
| `/simulate` | POST | Batch simulation |
| `/simulate/stream` | POST | Streaming simulation |
| `/report` | POST | Report generation |
| `/pipeline` | POST | End-to-end run |
| `/pipeline/stream` | POST | End-to-end streaming |

## Deployment Notes

### Frontend (Netlify)

`synsoc-ai-frontend/netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist/client"

[build.environment]
  NODE_VERSION = "22"
```

### Backend (Railway)

Build command:

```bash
python -m pip install --upgrade pip && pip install -r requirements.txt
```

Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## Performance Snapshot

Latest live Netlify UI timing run (full simulation flow):

1. Submit to LIVE: 825 ms
2. Stream TTFB: 1258 ms
3. Stream total: 42858 ms
4. Submit to COMPLETE: 43412 ms
5. Submit to results render: 44261 ms

## Demo Script

Presentation-ready script: [docs/demo-script-2min.md](docs/demo-script-2min.md)

## Project Layout

```text
SynScoAI/
├── app/                     # FastAPI app, routers, services
├── requirements.txt
├── .env.example
├── docs/
│   └── demo-script-2min.md
└── synsoc-ai-frontend/      # React + Vite frontend
```

## Troubleshooting

<details>
<summary>CORS error from frontend</summary>

Set backend `ALLOWED_ORIGINS` to include the frontend origin and redeploy backend.

Example:
`ALLOWED_ORIGINS=http://localhost:5173,https://synsoc-ai.netlify.app`
</details>

<details>
<summary>Railway build fails on Python 3.13</summary>

Set Railway variable:
`RAILPACK_PYTHON_VERSION=3.12`
</details>

<details>
<summary>Netlify shows 404 at root</summary>

Set publish directory to `dist/client` in `synsoc-ai-frontend/netlify.toml`.
</details>

## License

For academic/demo use. Add your preferred license if you plan public redistribution.
