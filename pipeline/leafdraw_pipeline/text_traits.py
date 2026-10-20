"""Flora description text -> traits + sizes (tier B). Covers species with no usable images.

Regex extraction over the same glossary vocabulary as the renderer; category chosen from nearby
context words ("apex", "base", "margin", "veins"). `llm_extract` is an optional hook for an LLM pass
(set ANTHROPIC_API_KEY and install `anthropic`); its output is validated against the vocabulary too.
"""
from __future__ import annotations

import json
import os
import re

from .fit import load_traits

CONTEXT = {
    "apex": "apex", "tip": "apex", "apices": "apex", "base": "base", "bases": "base", "margin": "margin", "margins": "margin",
    "venation": "secondary", "veins": "secondary", "lobes": "lobation", "lobed": "lobation", "leaflets": "structure",
}
SIZE = re.compile(r"(?:blades?|leaf|leaves|leaflets?)[^.;]{0,40}?(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(?:×|x)\s*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(mm|cm|dm)", re.I)
PETIOLE = re.compile(r"petioles?[^.;]{0,30}?(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(mm|cm)", re.I)
UNIT = {"mm": 1, "cm": 10, "dm": 100}


def vocabulary() -> dict:
    t = load_traits()["traits"]
    vocab = {}
    for cat, d in t.items():
        for tid, term in d["terms"].items():
            for w in [tid, tid.replace("-", " ")] + term.get("aliases", []):
                vocab.setdefault(w.lower(), []).append((cat, tid))
    return vocab


def extract(text: str) -> dict:
    vocab = vocabulary()
    words = sorted(vocab, key=len, reverse=True)
    txt = text.lower()
    found: dict[str, str] = {}
    for clause in re.split(r"[;.]", txt):
        ctx = next((CONTEXT[w] for w in re.findall(r"[a-z]+", clause) if w in CONTEXT), None)
        hits = []
        taken = [False] * len(clause)
        for w in words:  # longest first claims the span ("doubly serrate" before "serrate")
            for mm in re.finditer(rf"\b{re.escape(w)}\b", clause):
                if any(taken[mm.start():mm.end()]):
                    continue
                for k in range(mm.start(), mm.end()):
                    taken[k] = True
                hits.append((mm.start(), w))
        for _, w in sorted(hits):  # earliest mention wins within a category
            opts = vocab[w]
            pick = next((o for o in opts if o[0] == ctx), None) or next((o for o in opts if o[0] not in found), opts[0])
            cat, tid = pick
            if cat not in found:
                found[cat] = tid
    params = {}
    m = SIZE.search(text)
    if m:
        l0, l1, w0, w1, u = float(m[1]), float(m[2]), float(m[3]), float(m[4]), UNIT[m[5].lower()]
        Lm, Wm = (l0 + l1) / 2 * u, (w0 + w1) / 2 * u
        params["length"] = [round(Lm, 1), round((l1 - l0) * u / 4, 1)]
        params["aspect"] = [round(Lm / Wm, 2), round(0.15 * Lm / Wm, 2)]
    p = PETIOLE.search(text)
    if p and "length" in params:
        pm = (float(p[1]) + float(p[2])) / 2 * UNIT[p[3].lower()]
        params["petiole"] = round(pm / params["length"][0], 3)
    return {"traits": found, "params": params}


def llm_extract(text: str, model: str = "claude-sonnet-5-5") -> dict:
    """Optional: ask an LLM to map a description to glossary terms. Output is filtered to the vocabulary."""
    import anthropic  # noqa: optional dependency
    vocab = load_traits()["traits"]
    allowed = {c: list(d["terms"]) for c, d in vocab.items()}
    msg = anthropic.Anthropic().messages.create(
        model=model, max_tokens=800,
        messages=[{"role": "user", "content": "Map this leaf description to one term per category. Reply JSON {category: term} using only these terms:\n"
                   + json.dumps(allowed) + "\n\nDescription:\n" + text}],
    )
    data = json.loads(re.search(r"\{.*\}", msg.content[0].text, re.S).group(0))
    return {c: t for c, t in data.items() if c in allowed and t in allowed[c]}


def spec_from_text(name: str, text: str, family: str = "", use_llm: bool = False) -> dict:
    r = extract(text)
    if use_llm and os.environ.get("ANTHROPIC_API_KEY"):
        r["traits"].update(llm_extract(text))
    return {"id": name.lower().replace(" ", "-"), "name": name, "family": family, "tier": "B-text", "sources": ["flora description"], **r}
