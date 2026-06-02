# OKC Tree Chat Agent — Setup Guide

## Prerequisites
- Python 3.11+
- Docker Desktop (for the LLM container)
- The Qwen GGUF model file

---

## Step 1 — Place the GGUF model

Copy your model file into the `models/` folder:

```
ok-civic/
└── models/
    └── Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf
```

---

## Step 2 — Create Python virtual environment

```powershell
cd ok-civic

# Create venv
python -m venv .venv

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

---

## Step 3 — Scrape tree knowledge and build the knowledge base

```powershell
# (venv must be active)
python script/scrape_tree_resources.py
python script/build_knowledge_base.py
```

This creates:
- `knowledge/raw/` — scraped JSON files from okcbeautiful.com
- `knowledge/knowledge_base.json` — chunked text index used by the FastAPI backend (TF-IDF, no external DB)

The curated knowledge in `knowledge/curated/` is always included automatically.

---

## Step 4 — Start the LLM Docker container

```powershell
docker compose up llm
```

This pulls `ghcr.io/ggerganov/llama.cpp:server` and starts the Qwen model on `localhost:8080`.

Test it is running:
```powershell
curl http://localhost:8080/health
```

For GPU acceleration (NVIDIA), uncomment the `deploy` section in `docker-compose.yml`.

---

## Step 5 — Start the FastAPI backend

```powershell
# New terminal, venv active
.venv\Scripts\Activate.ps1
uvicorn backend.app:app --port 3000 --reload
```

Open: http://localhost:3000

---

## Environment variables (optional)

| Variable | Default | Description |
|---|---|---|
| `LLM_URL` | `http://localhost:8080` | URL of the llama.cpp server |
| `LLM_MAX_TOKENS` | `512` | Max tokens per response |
| `LLM_TEMPERATURE` | `0.7` | Sampling temperature |
| `LLM_TIMEOUT` | `120` | HTTP timeout (seconds) |

Set them in a `.env` file or export before starting uvicorn.

---

## Architecture

```
Browser (index.html + chat.js)
    │  GET /          → static files (FastAPI StaticFiles)
    │  POST /api/chat → chat endpoint
    ▼
FastAPI (backend/app.py, port 3000)
    │  Query ChromaDB for relevant tree knowledge chunks (RAG)
    │  Build system prompt with map context + retrieved chunks
    ▼
llama.cpp server (Docker, port 8080)
    │  Qwen3.5-9B-Uncensored GGUF model
    │  OpenAI-compatible /v1/chat/completions API
    ▼
Response → browser chat panel
```

---

## Chat agent capabilities

- **Explain analysis results** — interprets the suitability result based on current map state
- **Tree species guidance** — Redbud, Oak, Pine details + OKC-native alternatives
- **Location suggestions** — recommends moving point based on conflict direction
- **OKC zoning Q&A** — explains zoning classes, setback rules, and layer behavior
- **Tree care** — planting steps, watering, mulching, pruning from OKC Beautiful guides
