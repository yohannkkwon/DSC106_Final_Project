# Your City in 2080

An interactive explorable explanation of how 36 major cities will change under
**CMIP6** climate projections by the end of the century.

**DSC 106 final project — UC San Diego**

## What it does

Pick a city. Eight visualizations layer the story:

1. **Global overview** — the four futures (historical + SSP1-2.6, SSP2-4.5, SSP5-8.5) with the +1.5 °C Paris target line.
2. **Big-numbers panel** — days/year above 35 °C today vs end of century. The "WOW" number.
3. **Temperature trajectory** — 8-model ensemble for your city, 1850–2100, with model-spread band; toggle to see each individual model.
4. **The future is a choice** — warming by 2080 under each scenario, with model-spread error bars.
5. **Climate analog reveal** — "your city in 2080 will feel like X today." Several cities have no analog at all.
6. **Extreme heat days dumbbell** — ranks all cities by absolute increase in dangerous-heat days. Click any row to switch cities.
7. **Where the warming is most extreme** — bar chart ranking by mean temperature change. Reveals the high-latitude / polar-amplification story.
8. **World maps** — global temperature change and precipitation change at end of century, with scenario tabs.

## Live page

Will be published at `https://<your-github-username>.github.io/your-city-in-2080/`
(GitHub Pages, deploy from `main` branch / root.)

## Run locally

The page fetches CSVs at runtime, so it must be served over HTTP — opening
`index.html` from the file system will fail with CORS errors.

```bash
python3 -m http.server 8765
open http://localhost:8765
```

Or any other static server (`npx serve`, VS Code Live Server, etc.).

## Data sources

All data derived from the **CMIP6 Pangeo cloud archive** (`gs://cmip6`), the
multi-institutional climate-model archive used by the IPCC.

| Variable | Models | Scenarios | Resolution | Time span |
|---|---|---|---|---|
| `tas` (near-surface air temp) | 8 models | historical, SSP1-2.6, SSP2-4.5, SSP5-8.5 | monthly | 1850–2100 |
| `pr` (precipitation) | 8 models | historical, SSP1-2.6, SSP2-4.5, SSP5-8.5 | monthly | 1850–2100 |
| `tasmax` (daily max temp) | 3 models | historical, SSP5-8.5 | daily | 1850–2100 |
| Spatial maps | 3 models | historical, SSP1-2.6, SSP2-4.5, SSP5-8.5 | 2.5° grid | end-of-century vs baseline |
| Global mean | 8 models | all 4 | annual | 1850–2100 |

Models: CESM2, GFDL-ESM4, MPI-ESM1-2-LR, UKESM1-0-LL, CanESM5, IPSL-CM6A-LR,
ACCESS-CM2, MIROC6.

36 cities span every inhabited continent: San Diego, Los Angeles, Phoenix,
New York, Chicago, Toronto, Montreal, Anchorage, Honolulu, Mexico City, Bogotá,
São Paulo, Buenos Aires, Reykjavík, London, Paris, Madrid, Rome, Berlin, Moscow,
Stockholm, Oslo, Helsinki, Cairo, Lagos, Nairobi, Cape Town, Dubai, Mumbai,
Delhi, Bangkok, Singapore, Beijing, Tokyo, Seoul, Sydney.

## Repository layout

```
your-city-in-2080/
├── index.html         ← entry point
├── style.css          ← page styles
├── main.js            ← D3 charts + interactivity
├── data/
│   ├── cities_annual.csv          ← 8-model ensemble, annual tas + pr
│   ├── cities_annual_models.csv   ← per-model annual (for the "show models" toggle)
│   ├── cities_meta.csv            ← lat/lon for 36 cities
│   ├── extremes_annual.csv        ← annual derived metrics (days > 35 °C, etc.)
│   ├── analog.csv                 ← climate analog mapping
│   ├── global_mean_annual.csv     ← global mean tas per model/scenario/year
│   └── spatial.csv                ← end-of-century temperature/precip change grids
├── proposal/
│   ├── proposal.md                ← submitted proposal
│   └── figures/                   ← 6 static visualizations (PNG)
└── README.md                      ← this file
```

The `data/` files were produced by `../scripts/prepare_web_data.py` from the
raw CMIP6 extractions in `../data_raw/`.

## Tech stack

- **D3.js v7** + **topojson-client@3** (both from CDN, no build step)
- Vanilla HTML / CSS / JS — no framework, no bundler
- World coastlines from `world-atlas@2` (CDN)
- Fonts: Inter + Fraunces (Google Fonts)
- **Python + xarray + zarr + gcsfs** for the data pipeline (see parent folder)

## Acknowledgments

Climate-analog framing inspired by Fitzpatrick & Dunn (2019), *Contemporary
climatic analogs for 540 North American urban areas in the late 21st century*,
Nature Communications.

Cloud-native CMIP6 archive maintained by the
[Pangeo](https://pangeo.io) community on Google Cloud Storage.
