"""
FastAPI backend for OKC Tree Chat Agent.

Serves:
  - Static files (index.html, app.js, style.css, chat.js, etc.)
  - POST /api/chat  — RAG + LLM inference

Run:
  cd ok-civic
  .venv/Scripts/activate          # Windows
  uvicorn backend.app:app --reload --port 3000
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from rag import format_context, retrieve

# ── Config ────────────────────────────────────────────────────────────────────
LLM_BASE_URL = os.getenv("LLM_URL", "http://localhost:8080")
LLM_MODEL = os.getenv("LLM_MODEL", "local-model")  # llama.cpp ignores this; any string works
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "512"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.7"))
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "120"))

# ── System prompt template ────────────────────────────────────────────────────
SYSTEM_TEMPLATE = """\
You are a helpful tree planting assistant for Oklahoma City (OKC).
You help users of the OKC Tree Planter app understand tree suitability results,
choose the right tree species, and follow proper planting and care practices.

The OKC Tree Planter app analyzes three constraints:
1. Zoning compliance — the planting point must be inside an allowed OKC zoning polygon.
2. Building footprint conflict — the tree's canopy buffer must not overlap buildings.
3. Tree canopy overlap — the buffer should not overlap existing canopy raster (optional).

App tree types:
- Redbud: 20 ft diameter canopy — small ornamental, Oklahoma state tree
- Oak: 60 ft diameter canopy — large shade tree, requires ample space
- Pine: 40 ft diameter canopy — medium evergreen

Be concise, helpful, and practical. Answer in plain language.
If the user asks about the current analysis result, use the context below.
If you don't know something specific to OKC, say so and suggest contacting OKC Beautiful.

{map_context_section}

{rag_context_section}
"""


def build_system_prompt(map_context: Optional[Dict[str, Any]], rag_chunks: List[Dict[str, Any]]) -> str:
    # Map context block
    if map_context and (map_context.get("selectedTree") or map_context.get("lastResult")):
        lines = ["== CURRENT MAP STATE =="]
        tree = map_context.get("selectedTree")
        if tree:
            lines.append(f"Selected tree: {tree.get('name', 'Unknown')} ({tree.get('diameter', '?')} ft diameter)")

        result = map_context.get("lastResult")
        if result:
            status = "SUITABLE" if result.get("suitable") else "NOT SUITABLE"
            lines.append(f"Suitability result: {status}")
            issues = result.get("issues", [])
            if issues:
                lines.append("Issues found:")
                for issue in issues:
                    lines.append(f"  - {issue}")
            zoning = result.get("zoning")
            if zoning:
                lines.append(f"Zoning at clicked point: {zoning}")
            building = result.get("nearestBuilding")
            if building:
                lines.append(f"Nearest building: {building}")
            loc = result.get("clickLocation")
            if loc:
                lines.append(f"Clicked location: lat={loc.get('lat', '?'):.4f}, lon={loc.get('lon', '?'):.4f}")

        map_context_section = "\n".join(lines)
    else:
        map_context_section = "== CURRENT MAP STATE ==\nNo analysis run yet."

    # RAG context block
    rag_text = format_context(rag_chunks)
    if rag_text:
        rag_context_section = f"== RELEVANT KNOWLEDGE BASE EXCERPTS ==\n{rag_text}"
    else:
        rag_context_section = ""

    return SYSTEM_TEMPLATE.format(
        map_context_section=map_context_section,
        rag_context_section=rag_context_section
    )


# ── Pydantic models ───────────────────────────────────────────────────────────
class Message(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    context: Optional[Dict[str, Any]] = None  # window.treeAgentContext from frontend


# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="OKC Tree Chat API")


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is empty")

    # Retrieve relevant knowledge for the last user message
    last_user_msg = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), ""
    )
    rag_chunks = retrieve(last_user_msg) if last_user_msg else []

    system_prompt = build_system_prompt(req.context, rag_chunks)

    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "system", "content": system_prompt}]
        + [{"role": m.role, "content": m.content} for m in req.messages],
        "max_tokens": LLM_MAX_TOKENS,
        "temperature": LLM_TEMPERATURE,
        "stream": False
    }

    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            resp = await client.post(
                f"{LLM_BASE_URL}/v1/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to the LLM server. Make sure Docker is running: docker compose up llm"
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc.response.text[:400]}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        reply = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM response shape: {exc}")

    sources: List[str] = [c["title"] for c in rag_chunks if c.get("title")]
    return {"reply": reply, "rag_sources": sources}


# ── Static file serving (must come AFTER API routes) ─────────────────────────
app.mount("/", StaticFiles(directory=str(ROOT_DIR), html=True), name="static")
