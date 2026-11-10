# Everyday Tools

One-page tools for everyday decisions: comparison tables and small calculators, with every number linked to where it came from.

**Live site:** https://viveksinha.github.io/everyday-tools/

| Tool | What it does | Data as of |
|---|---|---|
| [Whey protein, compared](https://viveksinha.github.io/everyday-tools/whey-protein/) | Ranks 69 protein powders sold in India on ₹ per gram of protein, protein %, sugar, fat & sodium and lab testing. The weights are adjustable and saved in the link. | 23 Oct 2026 |
| [Magnesium glycinate, lab-tested](https://viveksinha.github.io/everyday-tools/magnesium/) | Lab-tested magnesium per capsule and heavy-metal traces for 12 supplements, plus a dose-and-cost calculator. | 23 Aug 2026 |
| Credit card rewards calculator | Not built yet. | – |

## Layout

```
everyday-tools/
├── README.md
├── .github/workflows/pages.yml   # publishes site/ to GitHub Pages on push to main
└── site/                         # everything that gets published
    ├── index.html                # hub page; the tool list is the JSON block at the bottom
    ├── assets/
    │   ├── theme.css             # shared look, light and dark
    │   ├── site.js               # shared helpers: theme toggle, tabs, share links, paging
    │   └── favicon.svg
    ├── whey-protein/
    │   ├── index.html
    │   ├── app.js                # page logic
    │   ├── scoring.js            # the spreadsheet's scoring formulas, ported to JS
    │   └── data.json             # products (raw label values) + price history
    └── magnesium/
        ├── index.html
        ├── app.js
        └── data.json
```

No build step and no dependencies. Plain HTML, CSS and ES modules.

## Run locally

```sh
python3 -m http.server 8000 -d site
# then open http://localhost:8000
```

Pages load their `data.json` with `fetch`, so opening the HTML file straight from disk won't work.

## Add a tool

1. Create `site/<tool-name>/index.html`. Copy the header and footer from an existing tool so the theme toggle and share links work.
2. Put the tool's data in `site/<tool-name>/data.json` if it has any.
3. Add an entry to the registry block at the bottom of `site/index.html`. Use `"status": "planned"` to list it as coming soon.
4. Push to `main`. The workflow publishes `site/` within a minute or two.

## Update data

- **Whey:** edit the raw values in `site/whey-protein/data.json` and change `checked` / `checked_label`. Scores and ranks are computed in the browser, so there's nothing else to regenerate. A row is ranked only if its `status` starts with `Live`.
- **Magnesium:** edit `site/magnesium/data.json`. A rating shows as expired automatically once `valid_till_iso` has passed.

## Caveats

- These are snapshots, not live feeds. Check the seller before buying.
- Not medical or financial advice.
- Magnesium lab results are summarised from [Unbox Health](https://unboxhealth.in). Product names belong to their brands.
