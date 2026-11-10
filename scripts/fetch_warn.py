#!/usr/bin/env python3
"""Build site/wa-layoffs/data.json from Washington State's WARN notice database.

    pip install -r scripts/requirements.txt
    python3 scripts/fetch_warn.py

Source page: https://esd.wa.gov/employer-requirements/layoffs-and-employee-notifications/worker-adjustment-and-retraining-notification-warn-layoff-and-closure-database
The table itself lives in an ASP.NET WebForms page (fortress.wa.gov), so paging is done by
replaying the form's __doPostBack with its hidden fields.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "wa-layoffs" / "data.json"

ENTRY = "https://fortress.wa.gov/esd/file/WARN/"
SOURCE_PAGE = (
    "https://esd.wa.gov/employer-requirements/layoffs-and-employee-notifications/"
    "worker-adjustment-and-retraining-notification-warn-layoff-and-closure-database"
)
YEARS = 5  # keep notices received or starting in the last N years

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (compatible; everyday-tools WARN refresh)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
)


def text(el) -> str:
    return " ".join(el.stripped_strings) if el is not None else ""


def us_date(s: str) -> str | None:
    """'7/1/2026' -> '2026-07-01'."""
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", (s or "").strip())
    if not m:
        return None
    mo, d, y = map(int, m.groups())
    try:
        return datetime(y, mo, d).strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_rows(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id="ucPSW_gvMain")
    if not table:
        return []
    out = []
    for tr in table.find_all("tr"):
        cells = tr.find_all("td", recursive=False)
        if len(cells) != 8:
            continue
        a = cells[7].find("a", href=True)
        workers = re.sub(r"[^\d]", "", text(cells[3]))
        out.append(
            {
                "company": text(cells[0]),
                "location": text(cells[1]),
                "start": us_date(text(cells[2])),
                "workers": int(workers) if workers else None,
                "kind": text(cells[4]),  # Closure | Layoff
                "duration": text(cells[5]),  # Permanent | Temporary
                "received": us_date(text(cells[6])),
                "pdf": urljoin("https://fortress.wa.gov/", a["href"].lstrip("/")) if a else "",
            }
        )
    return out


def max_page(html: str) -> int:
    found = [int(m) for m in re.findall(r"__doPostBack\([^)]+Page\$(\d+)", html)]
    return max(found) if found else 1


def hidden_fields(soup: BeautifulSoup) -> dict[str, str]:
    return {
        i.get("name"): i.get("value") or ""
        for i in soup.find_all("input", attrs={"type": "hidden"})
        if i.get("name")
    }


def fetch_all() -> list[dict]:
    r = SESSION.get(ENTRY, timeout=60)
    r.raise_for_status()
    post_url, html = r.url, r.text
    soup = BeautifulSoup(html, "html.parser")
    rows = parse_rows(html)
    last, page = max_page(html), 2
    while page <= last:
        fields = hidden_fields(soup)
        fields["__EVENTTARGET"] = "ucPSW$gvMain"
        fields["__EVENTARGUMENT"] = f"Page${page}"
        fields.pop("ucPSW$btnSearchCompany", None)
        r = SESSION.post(post_url, data=fields, timeout=60)
        r.raise_for_status()
        html = r.text
        soup = BeautifulSoup(html, "html.parser")
        got = parse_rows(html)
        if not got:
            break
        rows.extend(got)
        last = max(last, max_page(html))
        page += 1

    seen, unique = set(), []
    for row in rows:
        key = (row["company"], row["location"], row["start"], row["received"], row["pdf"])
        if key not in seen:
            seen.add(key)
            unique.append(row)

    now = datetime.now(timezone.utc)
    cutoff = f"{now.year - YEARS:04d}-{now.month:02d}-{now.day:02d}"
    recent = [r for r in unique if (r["received"] or "") >= cutoff or (r["start"] or "") >= cutoff]
    recent.sort(key=lambda r: (r["received"] or "", r["company"]), reverse=True)
    return recent


def main() -> None:
    rows = fetch_all()
    if not rows:
        sys.exit("No rows parsed; the source page layout may have changed. Not overwriting data.json.")
    payload = {
        "source": "Washington State Employment Security Department, WARN notices",
        "source_url": SOURCE_PAGE,
        "data_url": ENTRY,
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "years": YEARS,
        "notices": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} notices to {OUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
