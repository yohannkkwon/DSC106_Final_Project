# Your City in 2080

**An interactive, scroll-driven explainer that turns CMIP6 climate projections into what climate change means for a single city.**

By **Yohan Kwon, Holden Flett, and Edison Ayran** — DSC 106 (Introduction to Data Visualization), UC San Diego

**Live site:** [yohannkkwon.github.io/DSC106_Final_Project](https://yohannkkwon.github.io/DSC106_Final_Project/)

---

## Overview

Climate change usually reaches the public as a single global number, such as "+2.8 °C by 2100." That number is accurate, but most people can't feel it. The more striking numbers are one level down: how many dangerously hot days a city gets, how long its heatwaves last, and which city today already has the climate it is heading toward.

*Your City in 2080* is built around those numbers. The reader picks one of **36 cities on six continents**, and the page explains that city's future using the **CMIP6** model ensemble, the same climate-model archive behind the IPCC's Sixth Assessment Report. Each chapter covers one idea, and five of the visualizations update live when the reader changes cities.

Some example findings from the data:

- **Lagos** goes from essentially **0** days a year above 35 °C (95 °F) today to about **110** by 2071–2100 under the high-emissions scenario. **Madrid** goes from **0 to 50**.
- **Dubai's** longest end-of-century heatwave above 35 °C lasts **212 days in a row**, and **Delhi's** lasts **175**.
- **San Diego in 2080 will feel like Cairo today**, and **Paris will feel like Rome**. For several cities, including Dubai, Lagos, Mumbai, and Singapore, *no* city on Earth today has a climate as hot as their projected one.
- The cities that warm the most are high-latitude and continental cities such as Montreal, Moscow, and Toronto, not tropical ones. This is **polar amplification**.

## The narrative

The page is one top-to-bottom story. Each chapter is labeled by its on-page kicker (the small uppercase heading above the title):

| # | Chapter | What it shows |
|---|---|---|
| 1 | **Your city in 2080** | The title screen. Climate change is usually a global average; this page is about what it does to *your weekend in 2080*. |
| 2 | **Why this matters** | Six lines fade in as you scroll. The "+2.8 °C by 2100" headline is a number nobody can feel; the underlying data is 60 more dangerously hot days a year, and a city in 2080 that feels like one you already know. |
| 3 | **First, a word on what we're showing** | Four cards explain the Shared Socioeconomic Pathways before any chart appears: the historical record, SSP1-2.6 (we act), SSP2-4.5 (middle of the road), and SSP5-8.5 (fossil-fueled). |
| 4 | **The global picture** | A pinned, scroll-driven chart of global mean temperature, 1850–2100. Each step adds one pathway and ends on the +1.5 °C Paris target line. This is the world-scale fork; the rest of the page zooms into one city. |
| 5 | **Make it personal** | The reader picks one of 36 cities, or hits "Surprise me." Everything below this point updates for that city. |
| 6 | **The main story** | The centerpiece. Six scroll-driven panels on days above 35 °C / 95 °F: today's count, the jump by 2080, a 365-day calendar of hot days, the longest consecutive heatwave, the 30 / 35 / 40 °C thresholds, and a ranking of the world's hardest-hit cities. |
| 7 | **The underlying warming** | Supporting evidence for the hot-day story: the selected city's annual mean temperature, 1850–2100, under all four pathways. Shaded bands are the p10–p90 spread across the 8-model ensemble. Scroll highlights "if we act," the middle path, then "if we don't." |
| 8 | **The same city, three futures** | Mean warming from a 1950–2014 baseline to 2071–2100, shown as three large cards — one per emissions pathway — with the 8-model range under each number. Same city; the gap is the choice. |
| 9 | **Climate analog** | "In 2080, *your city* will feel like ___ today." San Diego maps to Cairo; Paris maps to Rome. Cities whose 2080 climate is hotter than any city on Earth today are flagged as unprecedented. |
| 10 | **Polar amplification** | Ranked bars of end-of-century mean warming under SSP5-8.5. The cities that warm *most* are high-latitude and continental — Montreal, Moscow, Toronto — not the tropics. Click a row to switch cities. |
| 11 | **Extreme heat days, ranked** | A dumbbell chart of days per year above 35 °C today vs. end of century. Lagos goes from essentially never to more than 100 days. Click a row to switch cities. |
| 12 | **The whole world, mapped** | A 2.5° global grid of end-of-century change. Toggle temperature vs. precipitation; a slider morphs continuously between SSP1-2.6, SSP2-4.5, and SSP5-8.5. |

A closing **About this project** section covers the data pipeline, the eight models, and the design tension between honest uncertainty and a number that sticks.

## Data and methodology

All data comes from **CMIP6** (Coupled Model Intercomparison Project, Phase 6). We pulled it from the [Pangeo cloud mirror](https://pangeo-data.github.io/pangeo-cmip6-cloud/) (`gs://cmip6`) with an `intake-esm` + Zarr + xarray pipeline in Python. The raw Zarr stores were over **100 GB**. We reduced them to about 165 MB of intermediate CSVs, then to an **8 MB browser-ready dataset** that is shipped in `data/`.

| Variable | Models | Scenarios | Resolution |
|---|---|---|---|
| `tas`: near-surface air temperature | 8 | historical, SSP1-2.6, SSP2-4.5, SSP5-8.5 | monthly → annual, 1850–2100 |
| `pr`: precipitation | 8 | historical, SSP1-2.6, SSP2-4.5, SSP5-8.5 | monthly → annual, 1850–2100 |
| `tasmax`: daily maximum temperature | 2–3 | historical, SSP5-8.5 | daily → annual extreme-heat metrics (30 cities) |
| Gridded `tas` / `pr` change | ensemble | SSP1-2.6, SSP2-4.5, SSP5-8.5 | 2.5° global grid, 2071–2100 vs. 1950–2014 |

**Models:** CESM2, GFDL-ESM4, MPI-ESM1-2-LR, UKESM1-0-LL, CanESM5, IPSL-CM6A-LR, ACCESS-CM2, MIROC6.

The main derived metrics:

- **Extreme-heat metrics.** From daily `tasmax` for each year: the number of days above 30, 35, and 40 °C, the longest run of consecutive days above 35 °C, and the hottest day. "Today" means the 1985–2014 average, and "2080" means the 2071–2100 average under SSP5-8.5.
- **Climate analogs.** For each city and each future period, we compared its projected 12-month climatology with the present-day (historical) climatology of every *other* city and picked the one with the lowest RMSE. A city is flagged *unprecedented* when its future climate is hotter than any city's present climate. This framing follows Fitzpatrick & Dunn (2019).
- **Ensemble uncertainty.** City trajectories show the ensemble mean as a 10-year running average, with a shaded band for the 10th–90th percentile range across the 8 models. The models disagree by up to 6.6 °C for a single city at the end of the century, and the charts show that spread instead of hiding it.
- **Hot-day calendar.** For each month, the calendar estimates the fraction of days above 35 °C from the monthly mean and standard deviation, using a normal CDF with the spread scaled up to approximate day-to-day variation. Because this only needs monthly data, it works for all 36 cities, including the ones without daily output.

## Design decisions

The main tension was between **honest uncertainty** and **narrative punch**. "Your city will get between 1 and 8 degrees hotter" is accurate, but readers tune it out. We handled it in layers:

1. Lead with one confident headline number (the ensemble mean) and keep the spread across models visible as a shaded band.
2. Use pinned, scroll-driven sections so each emissions scenario gets explained in turn, instead of leaving readers to decode a dense chart by themselves.
3. Use **climate analogs**. Even when the exact 2080 temperature is uncertain, "it will feel like North Africa" holds up across the ensemble and stays with the reader.
4. Use the **dumbbell** encoding for extreme heat, so the *change* from today to 2080 is what the eye reads first, not the absolute values.
5. Use an Apple-style chapter layout with one idea per screen and alternating light and dark backgrounds, so twelve chapters don't blur together.

## Tech stack

- **D3.js v7** for every chart, the map, and the transitions
- **Vanilla HTML / CSS / JavaScript**, with no framework and no build step
- **Custom scroll-driven storytelling** using `IntersectionObserver` and `requestAnimationFrame`-throttled scroll listeners
- **topojson-client** + **world-atlas** for coastlines
- **Python** (xarray, zarr, gcsfs, intake-esm, pandas) for the offline data pipeline
- Deployed on **GitHub Pages**

## Running locally

The page loads its CSVs at runtime, so it has to be served over HTTP. Opening `index.html` straight from the file system fails because of CORS.

```bash
git clone https://github.com/yohannkkwon/DSC106_Final_Project.git
cd DSC106_Final_Project
python3 -m http.server 8000
# then open http://localhost:8000
```

## Repository structure

```
DSC106_Final_Project/
├── index.html                   # Page structure and narrative copy
├── style.css                    # Chapter layout, typography, and chart styles
├── main.js                      # Data loading, D3 charts, scroll-driven logic, city state
├── data/
│   ├── cities_meta.csv          # Lat/lon for the 36 cities
│   ├── cities_annual.csv        # Ensemble mean + p10/p90 annual tas and pr per city/scenario
│   ├── cities_annual_models.csv # Per-model annual tas and pr
│   ├── extremes_annual.csv      # Annual hot-day counts, longest heatwave, hottest day
│   ├── monthly_climatology.csv  # 12-month climatology (today and 2080 by scenario)
│   ├── analog.csv               # Climate-analog matches per city/scenario/period
│   ├── global_mean_annual.csv   # Global mean temperature per model/scenario/year
│   └── spatial.csv              # 2.5° gridded end-of-century change in tas and pr
└── proposal/
    ├── proposal.md              # Original project proposal
    └── figures/                 # Six static prototype visualizations
```

## Acknowledgments

- CMIP6 data via the [Pangeo](https://pangeo.io) cloud-native archive on Google Cloud Storage.
- Climate-analog framing inspired by Fitzpatrick, M. C. & Dunn, R. R. (2019). *Contemporary climatic analogs for 540 North American urban areas in the late 21st century.* Nature Communications, 10, 614.
