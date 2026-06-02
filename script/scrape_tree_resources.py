"""
Scrapes https://www.okcbeautiful.com/tree-resources and all linked tree content.
Saves each source as a JSON file in ../knowledge/raw/.
Run from repo root: python script/scrape_tree_resources.py
"""

import json
import os
import re
import time
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    from pdfminer.high_level import extract_text_to_fp
    from pdfminer.layout import LAParams
    PDF_SUPPORT = True
except (ImportError, Exception):
    PDF_SUPPORT = False
    print("NOTE: PDF text extraction unavailable (pdfminer needs Python 3.8+). "
          "Skipping PDF sources — curated knowledge covers this content.")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}
OUT_DIR = Path(__file__).parent.parent / "knowledge" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# All pages and PDFs to scrape
SOURCES = [
    {
        "id": "tree_resources_main",
        "url": "https://www.okcbeautiful.com/tree-resources",
        "kind": "html",
        "title": "OKC Beautiful – Tree Care Resources"
    },
    {
        "id": "tree_okc_program",
        "url": "https://www.okcbeautiful.com/tree-okc",
        "kind": "html",
        "title": "OKC Beautiful – Tree OKC Program"
    },
    {
        "id": "programs_overview",
        "url": "https://www.okcbeautiful.com/programs",
        "kind": "html",
        "title": "OKC Beautiful – Programs Overview"
    },
    {
        "id": "community_foresters",
        "url": "https://www.okcbeautiful.com/community-foresters",
        "kind": "html",
        "title": "OKC Beautiful – Community Foresters Program"
    },
    # PDFs from the resources page
    {
        "id": "planting_guide_en",
        "url": "https://www.okcbeautiful.com/_files/ugd/f08d09_2718c2bf3e62478f8f3205f63ef34ddc.pdf",
        "kind": "pdf",
        "title": "OKC Beautiful – Tree Planting Guide (English)"
    },
    {
        "id": "tree_care_guide_en",
        "url": "https://www.okcbeautiful.com/_files/ugd/f08d09_e48614c29619465dac929d166802a00f.pdf",
        "kind": "pdf",
        "title": "OKC Beautiful – Tree Care & Maintenance Guide (English)"
    },
    {
        "id": "native_alternatives",
        "url": "https://www.okcbeautiful.com/_files/ugd/f08d09_de8080beecdb4bb099940d9e69f7a0fd.pdf",
        "kind": "pdf",
        "title": "OKC Beautiful – Native Tree Alternatives"
    },
]


def clean_text(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def scrape_html(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    # Remove nav, footer, script, style elements
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    # Try main content areas first
    content = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"content|main|body", re.I))
        or soup.find(class_=re.compile(r"content|main|body|page", re.I))
        or soup.body
    )
    return clean_text(content.get_text(separator="\n")) if content else ""


def scrape_pdf(url: str) -> str:
    if not PDF_SUPPORT:
        return ""
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    buf = BytesIO(resp.content)
    out = BytesIO()
    try:
        extract_text_to_fp(buf, out, laparams=LAParams(), output_type="text", codec="utf-8")
        text = out.getvalue().decode("utf-8", errors="replace")
        return clean_text(text)
    except Exception as exc:
        print(f"  PDF extraction error: {exc}")
        return ""


def scrape_source(source: dict) -> dict:
    print(f"  Fetching [{source['kind']}] {source['url']}")
    try:
        if source["kind"] == "html":
            text = scrape_html(source["url"])
        elif source["kind"] == "pdf":
            text = scrape_pdf(source["url"])
        else:
            text = ""
        status = "ok" if text else "empty"
    except Exception as exc:
        print(f"  ERROR: {exc}")
        text = ""
        status = f"error: {exc}"

    return {
        "id": source["id"],
        "title": source["title"],
        "url": source["url"],
        "kind": source["kind"],
        "text": text,
        "char_count": len(text),
        "status": status
    }


def main():
    print(f"Scraping {len(SOURCES)} sources → {OUT_DIR}")
    results = []
    for src in SOURCES:
        doc = scrape_source(src)
        out_path = OUT_DIR / f"{src['id']}.json"
        out_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  Saved {doc['char_count']} chars → {out_path.name}  [{doc['status']}]")
        results.append({"id": doc["id"], "chars": doc["char_count"], "status": doc["status"]})
        time.sleep(1)  # polite crawl delay

    # Write a manifest
    manifest_path = OUT_DIR.parent / "manifest.json"
    manifest_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nManifest saved → {manifest_path}")
    print("Done.")


if __name__ == "__main__":
    main()
