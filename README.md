# ฐานเสียงอยู่ที่ไหน

Mini Project 2 for **2603646 Information Visualization**. One view: a map of Thai constituencies for 2562, 2566 and 2569. The right-hand panel is a national score table, and a clicked district opens three tabs.

**Live site (GitHub Pages):** https://sroisala.github.io/thai-election-2026-viz/

The site is the repository root. `.nojekyll` is included so Pages serves the files as they are. Paths are relative, so the same `index.html` works locally and on the project site.

## What the page shows

The map draws one dot per constituency, packed inside its province. Changing the year changes how many dots each province has, because the three elections were districted differently (350 seats in 2562, 400 in 2566 and 2569).

| Filter | Map color | National score table |
|---|---|---|
| ปี 2562 / 2566 / 2569 | That year's districts | That year's seats and vote shares |
| คะแนน: เขต | Constituency winner | Sorted by constituency seats |
| คะแนน: บัญชีรายชื่อ | Party ahead on the party-list ballot in that district | Sorted by party-list seats |
| คะแนน: รวม | Party ahead on constituency votes plus party-list votes | Sorted by total seats, with the 251-seat majority line |

2562 used one ballot, so the three color modes are the same map. Party-list seats that year were allocated from the national total, and the table still changes.

With no district selected, the right side is the national score table. Click a dot to open that district. Hover only shows a tooltip. The district panel has three tabs:

1. **ตารางคะแนน** — that district's scores, following the year and คะแนน filters, with a text filter
2. **นโยบาย** — policies of the winning party for the selected year, from `data/panel/policies.json`
3. **GPP และนักท่องเที่ยว** — provincial figures, from `data/panel/province-stats.json`

Tabs 2 and 3 are empty until those files are filled in.

## Data

The three election years are complete. Do not add another year. What is left is the right-hand panel: copy `data/panel/policies.example.json` into `data/panel/policies.json`, and `data/panel/province-stats.example.json` into `data/panel/province-stats.json`, then replace the sample text with real figures. Both live files are `{}` today. Step-by-step instructions in Thai are in `data/README.md`.

- **2569** — `data/years/2569.json`, from กกต. Form สส.6/1 via [killernay/election-69-OCR-result](https://github.com/killernay/election-69-OCR-result). The four gaps that form did not cover (Bangkok 15, Prachinburi 2, Nan 1, and the Udon Thani 6 party-list ballot) are filled from the [ectreport69 workbook](https://ectreport69.ect.go.th/data/excel/election_result.xlsx). The raw OCR input is `data/source/election-2569.json`.
- **2566** — `data/years/2566.json`, from the กกต. ectreport66 workbook at 100% counted. One constituency differs from the final certified seat total. Party-list seats are the certified allocation.
- **2562** — `data/years/2562.json`, from [electinth/past-election-map](https://github.com/electinth/past-election-map). Election-day count, so Chiang Mai district 8 still shows the later-voided result.
- Province shapes in `data/map.json`, from [apisit/thailand.json](https://github.com/apisit/thailand.json).

Parties that were dissolved and refounded between elections are not linked. ก้าวไกล in 2566 and ประชาชน in 2569 stay separate.

## Run locally

```bash
python3 -m http.server 8000   # http://localhost:8000
```
