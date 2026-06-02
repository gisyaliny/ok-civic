"""
Builds a JSON knowledge base from:
  1. Scraped JSON files in knowledge/raw/
  2. Manually-authored curated files in knowledge/curated/

Output: knowledge/knowledge_base.json
This file is loaded at runtime by the FastAPI backend for TF-IDF retrieval.

Run from repo root: python script/build_knowledge_base.py
"""

import json
from pathlib import Path
from typing import List

RAW_DIR     = Path(__file__).parent.parent / "knowledge" / "raw"
CURATED_DIR = Path(__file__).parent.parent / "knowledge" / "curated"
OUT_FILE    = Path(__file__).parent.parent / "knowledge" / "knowledge_base.json"

CHUNK_SIZE    = 400   # characters
CHUNK_OVERLAP = 80


def split_into_chunks(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping character windows, breaking at word boundaries."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            while end > start and not text[end].isspace():
                end -= 1
            if end == start:
                end = start + size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap
    return chunks


def load_raw_docs() -> List[dict]:
    docs = []
    if not RAW_DIR.exists():
        print(f"  raw dir not found ({RAW_DIR}). Run scrape_tree_resources.py first.")
        return docs
    for jf in sorted(RAW_DIR.glob("*.json")):
        data = json.loads(jf.read_text(encoding="utf-8"))
        if not data.get("text") or data.get("char_count", 0) < 50:
            print(f"  Skipping {jf.name} (empty or errored)")
            continue
        docs.append(data)
        print(f"  raw: {jf.name}  ({data['char_count']} chars)")
    return docs


def load_curated_docs() -> List[dict]:
    docs = []
    if not CURATED_DIR.exists():
        return docs
    for tf in sorted(CURATED_DIR.glob("*.txt")):
        text = tf.read_text(encoding="utf-8").strip()
        if not text:
            continue
        docs.append({
            "id": tf.stem,
            "title": tf.stem.replace("_", " ").title(),
            "url": "curated",
            "text": text,
            "char_count": len(text),
        })
        print(f"  curated: {tf.name}  ({len(text)} chars)")
    return docs


def main():
    print("Loading documents…")
    all_docs = load_raw_docs() + load_curated_docs()

    if not all_docs:
        print("No documents found.")
        return

    print("\nChunking…")
    chunks = []
    for doc in all_docs:
        doc_chunks = split_into_chunks(doc["text"])
        for i, chunk_text in enumerate(doc_chunks):
            chunks.append({
                "id":        f"{doc['id']}__chunk_{i}",
                "text":      chunk_text,
                "title":     doc.get("title", ""),
                "url":       doc.get("url", ""),
                "source_id": doc["id"],
            })
        print(f"  {doc['id']}: {len(doc_chunks)} chunks")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. {len(chunks)} chunks → {OUT_FILE}")


if __name__ == "__main__":
    main()
