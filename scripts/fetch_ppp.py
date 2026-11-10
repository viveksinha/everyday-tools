#!/usr/bin/env python3
"""Build site/salary-converter/data.json from World Bank PPP and exchange-rate data.

Standard library only. Run from anywhere:
    python3 scripts/fetch_ppp.py

Indicators (World Bank, World Development Indicators):
  PA.NUS.PRVT.PP  PPP conversion factor, private consumption (LCU per international $)
  PA.NUS.PPP      PPP conversion factor, GDP (fallback when the first is missing)
  PA.NUS.FCRF     Official exchange rate (LCU per US$, period average)

Currency codes come from scripts/data/currencies.json (ISO 4217 by ISO 3166 alpha-3).
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "salary-converter" / "data.json"
CURRENCIES = ROOT / "scripts" / "data" / "currencies.json"

API = "https://api.worldbank.org/v2"
FIRST_YEAR = date.today().year - 8
MIN_PPP_YEAR = date.today().year - 5  # drop countries whose latest PPP is older than this

# Bulgaria joined the euro on 1 Jan 2026 at a fixed 1.95583 BGN per EUR. The World Bank
# already publishes its PPP series in euro but the exchange rate is still in BGN, so only
# the exchange rate is converted.
FX_REDENOMINATE = {"BGR": 1.95583}
# Zimbabwe's currency changed twice in 2024; the PPP and exchange-rate units don't line up.
EXCLUDE = {"ZWE"}


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "everyday-tools-data-refresh"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def indicator(code: str) -> dict[str, dict[int, float]]:
    url = f"{API}/country/all/indicator/{code}?format=json&per_page=20000&date={FIRST_YEAR}:{date.today().year}"
    meta, rows = get(url)
    out: dict[str, dict[int, float]] = {}
    for r in rows or []:
        if r["value"] is None:
            continue
        out.setdefault(r["countryiso3code"], {})[int(r["date"])] = float(r["value"])
    print(f"{code}: {len(out)} economies, last updated {meta.get('lastupdated')}", file=sys.stderr)
    return out, meta.get("lastupdated")


def main() -> None:
    _, countries = get(f"{API}/country?format=json&per_page=400")
    currencies = json.loads(CURRENCIES.read_text(encoding="utf-8"))
    prvt, updated = indicator("PA.NUS.PRVT.PP")
    gdp, _ = indicator("PA.NUS.PPP")
    fx, _ = indicator("PA.NUS.FCRF")

    rows = []
    skipped = []
    for c in countries:
        iso = c["id"]
        if c["region"]["id"] == "NA" or iso in EXCLUDE:  # "NA" = aggregates such as "World"
            continue
        basis, series = ("private", prvt.get(iso)) if prvt.get(iso) else ("gdp", gdp.get(iso))
        cur = currencies.get(iso)
        if not series or not cur:
            skipped.append(iso)
            continue
        year = max(series)
        if year < MIN_PPP_YEAR:
            skipped.append(iso)
            continue
        ppp = series[year]
        fx_series = fx.get(iso, {})
        rate = fx_series.get(year)
        div = FX_REDENOMINATE.get(iso)
        if div and rate:
            rate /= div
            cur = {"code": "EUR", "name": "Euro"}
        rows.append(
            {
                "iso3": iso,
                "iso2": c["iso2Code"],
                "name": c["name"],
                "region": c["region"]["value"].strip(),
                "income": c["incomeLevel"]["value"].strip(),
                "currency": cur["code"],
                "currency_name": cur["name"],
                "ppp": round(ppp, 6),
                "basis": basis,
                "year": year,
                # same-year average exchange rate, so price level = ppp / fx is like-for-like
                "fx": round(rate, 6) if rate else None,
            }
        )

    rows.sort(key=lambda r: r["name"])
    odd = [f'{r["iso3"]}={r["ppp"] / r["fx"]:.2f}' for r in rows if r["fx"] and not 0.15 < r["ppp"] / r["fx"] < 1.6]
    if odd:
        print("Check these price levels (PPP / exchange rate) for unit mismatches:", *odd, file=sys.stderr)
    payload = {
        "source": "World Bank, World Development Indicators",
        "source_url": "https://data.worldbank.org/indicator/PA.NUS.PRVT.PP",
        "wb_last_updated": updated,
        "indicators": {
            "private": "PA.NUS.PRVT.PP — PPP conversion factor, private consumption (LCU per international $)",
            "gdp": "PA.NUS.PPP — PPP conversion factor, GDP (LCU per international $)",
            "fx": "PA.NUS.FCRF — Official exchange rate (LCU per US$, period average)",
        },
        "countries": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} countries to {OUT.relative_to(ROOT)}; skipped {len(skipped)}: {' '.join(skipped)}", file=sys.stderr)


if __name__ == "__main__":
    main()
