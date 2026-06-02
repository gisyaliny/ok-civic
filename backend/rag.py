"""
TF-IDF retriever — loads knowledge_base.json and ranks chunks by cosine
similarity against the query using scikit-learn.

No external vector DB required. The index is built in memory on first call
and cached for subsequent requests.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

KB_FILE = Path(__file__).parent.parent / "knowledge" / "knowledge_base.json"
TOP_K   = 5

# ── Module-level cache ────────────────────────────────────────────────────────
_chunks: List[Dict[str, Any]] = []
_vectorizer = None
_matrix = None


def _load_index():
    """Load knowledge base and build TF-IDF matrix on first call."""
    global _chunks, _vectorizer, _matrix

    if _matrix is not None:
        return  # already loaded

    if not KB_FILE.exists():
        print(
            f"Knowledge base not found at {KB_FILE}. "
            "Run: python script/build_knowledge_base.py"
        )
        return

    _chunks = json.loads(KB_FILE.read_text(encoding="utf-8"))
    if not _chunks:
        return

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np
    except ImportError as exc:
        print(f"scikit-learn/numpy not installed: {exc}")
        return

    texts = [c["text"] for c in _chunks]
    _vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=20000, sublinear_tf=True)
    _matrix = _vectorizer.fit_transform(texts)
    print(f"RAG index ready: {len(_chunks)} chunks, matrix {_matrix.shape}")


def retrieve(query: str, k: int = TOP_K) -> List[Dict[str, Any]]:
    """Return top-k relevant chunks for the query. Returns [] on any failure."""
    _load_index()

    if _matrix is None or _vectorizer is None or not _chunks:
        return []

    try:
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        q_vec = _vectorizer.transform([query])
        scores = cosine_similarity(q_vec, _matrix)[0]
        top_indices = scores.argsort()[::-1][:k]
        return [_chunks[i] for i in top_indices if scores[i] > 0]
    except Exception as exc:
        print(f"RAG retrieve error: {exc}")
        return []


def format_context(chunks: List[Dict[str, Any]]) -> str:
    """Format retrieved chunks into a context block for the system prompt."""
    if not chunks:
        return ""
    parts = []
    for c in chunks:
        source = c.get("title") or c.get("source_id", "")
        parts.append(f"[Source: {source}]\n{c['text']}")
    return "\n\n---\n\n".join(parts)
