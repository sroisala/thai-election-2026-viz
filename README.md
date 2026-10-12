# Thai Election 2026 — Visual Analytics

Mini Project 2 for **2603646 Information Visualization**: a visual analytics system for the results of the 2026 (2569) Thai general election.

🔗 **Live site:** https://sroisala.github.io/thai-election-2026-viz/

## Users & goal
**Party strategists preparing for the next election.** They need to know where their votes are, which seats are at risk, which seats can be flipped, and whether to invest in candidates or in the party brand.

## Views & interactions
| # | View | Analytic task | Interaction |
|---|------|---------------|-------------|
| 1 | Parliament hemicycle + seat table | Overview: seats per party (constituency vs party-list) vs majority line | Hover for counts; click a party to focus every view on it |
| 2 | 400-district dot map (one dot per district, clustered by province) | Where is each party strong? Turnout / spoiled-ballot geography | Color mode toggle (winner, closeness, focus-party vote share, turnout, spoiled ballots); hover tooltip + detail panel; click to pin |
| 3 | Margin beeswarm | Which seats were close? Seats to defend vs seats to flip | Drag (brush) a margin range → linked highlight on map + table; with a party focused, splits into "won" / "came second" lanes |
| 4 | Candidate vs party scatter | Did the candidate or the party brand win the seat? | 2-D brush → linked highlight; nearest-point hover; ranked lists jump to the district |
| 5 | District table | Look up exact values | Sort, search, click a row to select |

Global filters (party focus, region) sit in one sticky bar and apply to every view. Esc clears the selection.

## Data sources
- ECT (กกต.) Form ส.ส.6/1 results — https://www.ect.go.th/ect_th/th/election-2026/
- OCR-digitized results by Chanon Ngernthongdee — https://github.com/killernay/election-69-OCR-result (`data/matched`)
- Party-list seats certified by the ECT on 4 Mar 2026 (Thai Post) — https://www.thaipost.net/hi-light/957457/
- Province boundaries — https://github.com/apisit/thailand.json

## Rebuild the data
```bash
git clone https://github.com/killernay/election-69-OCR-result
python3 scripts/process.py election-69-OCR-result/data/matched data/election.json
npm i d3-geo d3-force mapshaper
npx mapshaper thailand.json -simplify 6% keep-shapes -o format=geojson thai_simpl.json
node scripts/layout.mjs thai_simpl.json data/election.json data/map.json
```

## Run locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
