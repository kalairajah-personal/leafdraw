"""GBIF: resolve names on the GBIF backbone and fetch herbarium specimen images.

Only openly licensed media (CC0, CC-BY, CC-BY-NC) are kept; licence and source are recorded per image
so every derived species spec can cite its specimens.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

API = "https://api.gbif.org/v1"
OPEN_LICENSES = ("creativecommons.org/publicdomain/zero", "creativecommons.org/licenses/by/", "creativecommons.org/licenses/by-nc/")


def _get(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "leafdraw-pipeline/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def match_name(name: str) -> dict:
    """Backbone match -> {usageKey, scientificName, family, status, ...}."""
    return _get(f"{API}/species/match?{urllib.parse.urlencode({'name': name, 'kingdom': 'Plantae'})}")


def specimen_images(taxon_key: int, limit: int = 40, basis: str = "PRESERVED_SPECIMEN") -> list[dict]:
    """Occurrences with StillImage media for a taxon. Returns [{url, license, occurrence, institution}]."""
    out, offset = [], 0
    while len(out) < limit:
        q = urllib.parse.urlencode({"taxonKey": taxon_key, "mediaType": "StillImage", "basisOfRecord": basis, "limit": 50, "offset": offset})
        page = _get(f"{API}/occurrence/search?{q}")
        for occ in page.get("results", []):
            for m in occ.get("media", []):
                lic = (m.get("license") or occ.get("license") or "")
                if m.get("type") == "StillImage" and m.get("identifier") and any(k in lic for k in OPEN_LICENSES):
                    out.append({"url": m["identifier"], "license": lic, "occurrence": occ.get("key"),
                                "institution": occ.get("institutionCode"), "country": occ.get("countryCode")})
        if page.get("endOfRecords") or not page.get("results"):
            break
        offset += 50
    return out[:limit]


def download(items: list[dict], dest: str, pause: float = 0.3) -> list[dict]:
    os.makedirs(dest, exist_ok=True)
    done = []
    for i, it in enumerate(items):
        path = os.path.join(dest, f"{it['occurrence']}_{i}.jpg")
        if not os.path.exists(path):
            try:
                req = urllib.request.Request(it["url"], headers={"User-Agent": "leafdraw-pipeline/0.1"})
                with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                    f.write(r.read())
                time.sleep(pause)
            except Exception as e:  # network / 404 — skip, keep provenance of what we have
                print(f"skip {it['url']}: {e}")
                continue
        done.append({**it, "path": path})
    with open(os.path.join(dest, "sources.json"), "w") as f:
        json.dump(done, f, indent=1)
    return done
