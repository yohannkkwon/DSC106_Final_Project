// ============================================================
// Your City in 2080 — main.js (v2 — 4 scenarios + maps + global overview)
// ============================================================

const COLOR = {
  historical: "#4a4a4a",
  ssp126:     "#1f78b4",
  ssp245:     "#ff7f00",
  ssp585:     "#c1272d",
  ssp126_soft:"#b6dcef",
  ssp245_soft:"#ffd6a8",
  ssp585_soft:"#f1a48c",
  neutral:    "#888884",
  ink:        "#1d1c1a",
  ink_soft:   "#5a5752",
  line:       "#e2dbcd",
};

const LABEL = {
  historical: "Historical",
  ssp126:     "SSP1-2.6 (we act decisively)",
  ssp245:     "SSP2-4.5 (middle path)",
  ssp585:     "SSP5-8.5 (we keep burning)",
};
const SHORT = {
  historical: "Historical",
  ssp126:     "SSP1-2.6 (low)",
  ssp245:     "SSP2-4.5 (mid)",
  ssp585:     "SSP5-8.5 (high)",
};

const ALL_SCEN = ["historical", "ssp126", "ssp245", "ssp585"];
const FUTURE_SCEN = ["ssp126", "ssp245", "ssp585"];

const state = {
  city: "San Diego",
  showIndividualModels: false,
  tempMapScen: "ssp585",
  precipMapScen: "ssp585",
};

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

// Data holders
let citiesAnnual, citiesRaw, extremes, analog, citiesMeta, spatial, globalMean;
let worldLand = null;
let availableScenarios = ["historical", "ssp245", "ssp585"]; // updated after load

// ============================================================
// Load all data (gracefully handles missing files)
// ============================================================
async function loadAll() {
  const tryCsv = async (path) => {
    try { return await d3.csv(path, rowParse); } catch { return null; }
  };
  const tryJson = async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };
  const [annual, ext, ana, meta, sp, gm, raw, atlas] = await Promise.all([
    tryCsv("data/cities_annual.csv"),
    tryCsv("data/extremes_annual.csv"),
    tryCsv("data/analog.csv"),
    tryCsv("data/cities_meta.csv"),
    tryCsv("data/spatial.csv"),
    tryCsv("data/global_mean_annual.csv"),
    tryCsv("data/cities_annual_models.csv"),
    tryJson("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"),
  ]);
  if (atlas && typeof topojson !== "undefined") {
    try { worldLand = topojson.feature(atlas, atlas.objects.land); }
    catch (e) { console.warn("topojson decode failed", e); }
  }
  citiesAnnual = annual || [];
  extremes = ext || [];
  analog = ana || [];
  citiesMeta = meta || [];
  spatial = sp || [];
  globalMean = gm || [];
  citiesRaw = raw || [];

  // detect which scenarios are present
  const seen = new Set(citiesAnnual.map(d => d.scenario));
  availableScenarios = ALL_SCEN.filter(s => seen.has(s));
  if (!availableScenarios.length) availableScenarios = ["historical", "ssp245", "ssp585"];

  return citiesAnnual.length > 0;
}

function rowParse(d) {
  for (const k in d) {
    if (k === "city" || k === "scenario" || k === "variable" ||
        k === "model" ||
        k === "future_decade" || k === "analog_city") continue;
    const v = +d[k];
    if (!Number.isNaN(v) && d[k] !== "") d[k] = v;
  }
  return d;
}

// ============================================================
// Setup
// ============================================================
function buildCitySelect() {
  const cities = citiesMeta.map(d => d.city).sort();
  if (!cities.includes(state.city)) state.city = cities[0];
  const sel = d3.select("#city-select");
  sel.selectAll("option").data(cities).join("option")
    .attr("value", d => d).text(d => d);
  sel.property("value", state.city);
  sel.on("change", function () {
    state.city = this.value;
    renderCity();
  });
}

function setupControls() {
  d3.select("#random-btn").on("click", () => {
    const cities = citiesMeta.map(d => d.city);
    let c;
    do { c = cities[Math.floor(Math.random() * cities.length)]; }
    while (c === state.city);
    state.city = c;
    d3.select("#city-select").property("value", c);
    renderCity();
  });

  d3.select("#show-models").on("change", function () {
    state.showIndividualModels = this.checked;
    drawTrajectoryChart();
  });

  d3.selectAll(".scen-tabs").each(function () {
    const target = this.dataset.target;
    d3.select(this).selectAll(".map-tab").on("click", function () {
      const scen = this.dataset.scen;
      if (target === "temp-map") state.tempMapScen = scen;
      else state.precipMapScen = scen;
      d3.select(this.parentNode).selectAll(".map-tab").classed("active", false);
      d3.select(this).classed("active", true);
      if (target === "temp-map") drawTempMap();
      else drawPrecipMap();
    });
  });
}

function renderAll() {
  drawOverviewChart();
  renderCity();
  drawWarmingRank();
  drawTempMap();
  drawPrecipMap();
}
function renderCity() {
  updateBigNumbers();
  drawTrajectoryChart();
  drawChoiceChart();
  updateAnalogCard();
  drawDumbbell();
}

// ============================================================
// Big numbers
// ============================================================
function updateBigNumbers() {
  const today = d3.mean(
    extremes.filter(d => d.city === state.city && d.scenario === "historical"
                    && d.year >= 1985 && d.year <= 2014),
    d => d.days_over_35C
  );
  const future = d3.mean(
    extremes.filter(d => d.city === state.city && d.scenario === "ssp585"
                    && d.year >= 2071 && d.year <= 2100),
    d => d.days_over_35C
  );
  const todayN = today != null ? Math.round(today) : null;
  const futN   = future != null ? Math.round(future) : null;

  animateNumber("#bn-today", todayN);
  animateNumber("#bn-2080", futN);
  d3.select("#bn-2080-scen").text("2071–2100, SSP5-8.5 (worst case)");

  let changeText = "—", changeXText = "";
  if (todayN != null && futN != null) {
    const delta = futN - todayN;
    changeText = (delta >= 0 ? "+" : "") + delta + " days";
    if (todayN >= 1) {
      const x = (futN / todayN).toFixed(1);
      changeXText = `${x}× more`;
    } else if (futN > 0) {
      changeXText = "From essentially never";
    } else {
      changeXText = "no change";
    }
  }
  d3.select("#bn-change").text(changeText);
  d3.select("#bn-change-x").text(changeXText);
}

function animateNumber(sel, target) {
  const el = d3.select(sel);
  const current = +el.attr("data-value") || 0;
  if (target == null) { el.text("—"); el.attr("data-value", 0); return; }
  el.attr("data-value", target);
  el.transition().duration(700)
    .tween("text", function () {
      const i = d3.interpolateNumber(current, target);
      return t => this.textContent = Math.round(i(t));
    });
}

// ============================================================
// Smoothing helper
// ============================================================
function rolling(series, key, w = 10) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const lo = Math.max(0, i - Math.floor(w / 2));
    const hi = Math.min(series.length, i + Math.ceil(w / 2));
    out.push({ year: series[i].year, value: d3.mean(series.slice(lo, hi), d => d[key]) });
  }
  return out;
}

// ============================================================
// Global overview chart (top of page)
// ============================================================
function drawOverviewChart() {
  const container = d3.select("#overview-chart");
  container.selectAll("*").remove();

  if (!globalMean.length) {
    container.append("div").style("padding", "60px 20px")
      .style("text-align", "center").style("color", "#888")
      .text("Global mean overview chart will appear here once data finishes loading.");
    return;
  }

  // anomaly relative to 1850-1900 mean of historical
  const baseline = d3.mean(globalMean.filter(d => d.scenario === "historical"
                                                  && d.year >= 1850 && d.year <= 1900),
                            d => d.tas_C);
  // average across models per (scenario, year)
  const byScen = d3.group(globalMean, d => d.scenario);
  const series = {};
  for (const [scen, rows] of byScen) {
    const byYear = d3.group(rows, d => d.year);
    const arr = Array.from(byYear, ([yr, gs]) => ({
      year: +yr,
      mean: d3.mean(gs, d => d.tas_C) - baseline,
      p10: d3.quantile(gs.map(d => d.tas_C), 0.10) - baseline,
      p90: d3.quantile(gs.map(d => d.tas_C), 0.90) - baseline,
    })).sort((a, b) => a.year - b.year);
    series[scen] = arr;
  }

  const W = container.node().clientWidth || 900;
  const H = 380;
  const margin = { top: 30, right: 30, bottom: 44, left: 60 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%")
    .style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1850, 2100]).range([0, innerW]);
  const allValues = Object.values(series).flatMap(s => s.flatMap(d => [d.p10, d.p90]));
  const y = d3.scaleLinear()
    .domain([Math.min(0, d3.min(allValues) - 0.3), d3.max(allValues) + 0.3])
    .range([innerH, 0]).nice();

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d => d).ticks(8));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => (d > 0 ? "+" : "") + d + "°C"));

  // Paris target line at +1.5
  g.append("line").attr("class", "paris-line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", y(1.5)).attr("y2", y(1.5))
    .attr("stroke", COLOR.ink).attr("opacity", 0.55).attr("stroke-dasharray", "4 3");
  g.append("text").attr("x", 6).attr("y", y(1.5) - 5)
    .attr("font-size", 11).attr("fill", COLOR.ink_soft)
    .text("+1.5 °C — Paris Agreement target");
  // zero anomaly
  g.append("line").attr("x1", 0).attr("x2", innerW)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", COLOR.ink_soft).attr("opacity", 0.3).attr("stroke-width", 0.6);
  // 2015 divider
  g.append("line").attr("x1", x(2015)).attr("x2", x(2015))
    .attr("y1", 0).attr("y2", innerH)
    .attr("stroke", COLOR.ink_soft).attr("opacity", 0.3).attr("stroke-dasharray", "2 4");
  g.append("text").attr("x", x(2015) + 4).attr("y", 12)
    .attr("font-size", 10).attr("fill", COLOR.ink_soft).text("→ projection");

  // axis label
  g.append("text").attr("transform", `translate(-44,${innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Global mean temperature anomaly (°C)");

  for (const scen of ALL_SCEN) {
    const s = series[scen]; if (!s || !s.length) continue;
    const sm = rolling(s, "mean", 10);
    // band
    if (scen !== "historical") {
      const area = d3.area().x(d => x(d.year))
        .y0(d => y(d.p10)).y1(d => y(d.p90))
        .curve(d3.curveMonotoneX);
      g.append("path").datum(s).attr("class", "trajectory-band")
        .attr("fill", COLOR[scen]).attr("d", area);
    }
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value))
      .curve(d3.curveMonotoneX);
    g.append("path").datum(sm).attr("fill", "none")
      .attr("stroke", COLOR[scen]).attr("stroke-width", 2.2).attr("d", line);
  }

  // legend
  const legend = svg.append("g").attr("transform", `translate(${margin.left + 12},${margin.top + 8})`);
  ALL_SCEN.forEach((scen, i) => {
    const row = legend.append("g").attr("transform", `translate(0,${i * 18})`);
    row.append("rect").attr("width", 14).attr("height", 4).attr("y", 3)
      .attr("fill", COLOR[scen]);
    row.append("text").attr("x", 22).attr("y", 8)
      .attr("font-size", 11).attr("fill", COLOR.ink).text(SHORT[scen]);
  });
}

// ============================================================
// City trajectory chart
// ============================================================
function drawTrajectoryChart() {
  const container = d3.select("#trajectory-chart");
  container.selectAll("*").remove();

  const data = citiesAnnual.filter(d => d.city === state.city)
                           .sort((a, b) => a.year - b.year);
  if (!data.length) return;

  const W = container.node().clientWidth || 900;
  const H = 480;
  const margin = { top: 36, right: 150, bottom: 44, left: 56 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%")
    .style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1850, 2100]).range([0, innerW]);

  const yExtent = d3.extent(data.flatMap(d => [d.tas_p10_C, d.tas_p90_C]));
  const pad = (yExtent[1] - yExtent[0]) * 0.08;
  const y = d3.scaleLinear()
    .domain([yExtent[0] - pad, yExtent[1] + pad])
    .range([innerH, 0]).nice();

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d => d).ticks(8));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "°"));

  g.append("text").attr("x", innerW / 2).attr("y", innerH + 36)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Year");
  g.append("text").attr("transform", `translate(-40,${innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Annual mean temperature (°C)");

  const scenarios = availableScenarios;
  scenarios.forEach(scen => {
    const sub = data.filter(d => d.scenario === scen);
    if (!sub.length) return;
    // Band
    if (scen !== "historical") {
      const area = d3.area().x(d => x(d.year))
        .y0(d => y(d.tas_p10_C)).y1(d => y(d.tas_p90_C))
        .curve(d3.curveMonotoneX);
      g.append("path").datum(sub).attr("class", "trajectory-band")
        .attr("fill", COLOR[scen]).attr("d", area);
    }

    // optional individual model lines
    if (state.showIndividualModels && citiesRaw.length) {
      const raw = citiesRaw.filter(d => d.city === state.city && d.scenario === scen);
      const byModel = d3.group(raw, d => d.model);
      const lineGen = d3.line().x(d => x(d.year)).y(d => y(d.tas_C))
        .curve(d3.curveMonotoneX);
      for (const [model, rows] of byModel) {
        const rolled = rolling(rows.sort((a,b)=>a.year-b.year), "tas_C", 10)
          .map(d => ({ year: d.year, tas_C: d.value }));
        g.append("path").datum(rolled)
          .attr("class", "trajectory-line individual")
          .attr("fill", "none")
          .attr("stroke", COLOR[scen]).attr("d", lineGen);
      }
    }

    // smoothed ensemble mean
    const sm = rolling(sub, "tas_mean_C", 10);
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value))
      .curve(d3.curveMonotoneX);
    g.append("path").datum(sm)
      .attr("class", "trajectory-line")
      .attr("fill", "none")
      .attr("stroke", COLOR[scen])
      .attr("d", line);

    // End-of-line label
    const last = sub[sub.length - 1];
    g.append("text")
      .attr("x", x(last.year) + 6).attr("y", y(last.tas_mean_C))
      .attr("dy", "0.32em").attr("fill", COLOR[scen])
      .attr("font-size", 12).attr("font-weight", 600)
      .text(SHORT[scen]);
  });

  // Hover
  const focus = g.append("line").attr("class", "hover-line")
    .attr("y1", 0).attr("y2", innerH).style("opacity", 0);
  const bisect = d3.bisector(d => d.year).left;
  g.append("rect")
    .attr("width", innerW).attr("height", innerH).style("fill", "transparent")
    .on("mouseenter", () => { focus.style("opacity", 1); tooltip.style("opacity", 1); })
    .on("mouseleave", () => { focus.style("opacity", 0); tooltip.style("opacity", 0); })
    .on("mousemove", function (event) {
      const [mx] = d3.pointer(event);
      const year = Math.round(x.invert(mx));
      focus.attr("x1", x(year)).attr("x2", x(year));
      const rows = scenarios.map(scen => {
        const sub = data.filter(d => d.scenario === scen);
        if (!sub.length) return null;
        const idx = bisect(sub, year);
        const d = sub[Math.min(idx, sub.length - 1)];
        return d && d.year === year
          ? { scen, val: d.tas_mean_C, p10: d.tas_p10_C, p90: d.tas_p90_C }
          : null;
      }).filter(Boolean);
      if (!rows.length) return;
      tooltip.html(`
        <div class="tooltip-year">${year}</div>
        ${rows.map(r => `
          <div class="tooltip-row">
            <span><span class="tooltip-swatch" style="background:${COLOR[r.scen]}"></span>${SHORT[r.scen]}</span>
            <span><b>${r.val.toFixed(1)} °C</b></span>
          </div>`).join("")}
      `).style("left", (event.pageX + 18) + "px")
        .style("top",  (event.pageY - 12) + "px");
    });

  svg.append("text").attr("x", margin.left).attr("y", 20)
    .attr("font-size", 14).attr("font-weight", 600).attr("fill", COLOR.ink)
    .text(state.city);
}

// ============================================================
// "Future is a choice" 3-scenario bar chart
// ============================================================
function drawChoiceChart() {
  const container = d3.select("#choice-chart");
  container.selectAll("*").remove();

  // baseline 1950-2014 historical for this city, ensemble mean
  const baseline = d3.mean(
    citiesAnnual.filter(d => d.city === state.city && d.scenario === "historical"
                       && d.year >= 1950 && d.year <= 2014),
    d => d.tas_mean_C
  );
  const futures = FUTURE_SCEN.map(scen => {
    const rows = citiesAnnual.filter(d => d.city === state.city && d.scenario === scen
                        && d.year >= 2071 && d.year <= 2100);
    const mean = d3.mean(rows, d => d.tas_mean_C);
    const p10 = d3.mean(rows, d => d.tas_p10_C);
    const p90 = d3.mean(rows, d => d.tas_p90_C);
    return mean != null
      ? { scen, delta: mean - baseline, low: p10 - baseline, high: p90 - baseline }
      : null;
  }).filter(Boolean);

  if (!futures.length) {
    container.append("div").style("padding", "60px 20px")
      .style("text-align", "center").style("color", "#888")
      .text("Three-scenario data not yet available (SSP1-2.6 still extracting).");
    return;
  }

  const W = container.node().clientWidth || 800;
  const H = 360;
  const margin = { top: 40, right: 40, bottom: 60, left: 60 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%")
    .style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand().domain(futures.map(d => d.scen))
    .range([0, innerW]).padding(0.32);
  const yMax = Math.max(...futures.map(d => d.high), 1) * 1.1;
  const yMin = Math.min(...futures.map(d => d.low), 0);
  const yScale = d3.scaleLinear().domain([Math.min(0, yMin), yMax])
    .range([innerH, 0]).nice();

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).tickFormat(s => SHORT[s]));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => (d > 0 ? "+" : "") + d.toFixed(1) + "°C"));
  g.append("text").attr("transform", `translate(-44,${innerH/2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text(`Warming by 2080 (°C above 1950–2014)`);

  // zero baseline
  g.append("line").attr("x1", 0).attr("x2", innerW)
    .attr("y1", yScale(0)).attr("y2", yScale(0))
    .attr("stroke", COLOR.ink_soft).attr("opacity", 0.3);

  // bars + p10-p90 error lines
  futures.forEach(d => {
    const x0 = xScale(d.scen);
    g.append("rect").attr("class", "choice-bar")
      .attr("x", x0).attr("y", yScale(Math.max(d.delta, 0)))
      .attr("width", xScale.bandwidth())
      .attr("height", Math.abs(yScale(0) - yScale(d.delta)))
      .attr("fill", COLOR[d.scen]);
    // model spread bar
    g.append("line")
      .attr("x1", x0 + xScale.bandwidth()/2).attr("x2", x0 + xScale.bandwidth()/2)
      .attr("y1", yScale(d.low)).attr("y2", yScale(d.high))
      .attr("stroke", COLOR.ink).attr("opacity", 0.55).attr("stroke-width", 1.5);
    g.append("line")
      .attr("x1", x0 + xScale.bandwidth()/2 - 8).attr("x2", x0 + xScale.bandwidth()/2 + 8)
      .attr("y1", yScale(d.high)).attr("y2", yScale(d.high))
      .attr("stroke", COLOR.ink).attr("opacity", 0.55).attr("stroke-width", 1.5);
    g.append("line")
      .attr("x1", x0 + xScale.bandwidth()/2 - 8).attr("x2", x0 + xScale.bandwidth()/2 + 8)
      .attr("y1", yScale(d.low)).attr("y2", yScale(d.low))
      .attr("stroke", COLOR.ink).attr("opacity", 0.55).attr("stroke-width", 1.5);
    // value label
    g.append("text").attr("class", "choice-value")
      .attr("x", x0 + xScale.bandwidth()/2).attr("y", yScale(d.high) - 8)
      .attr("text-anchor", "middle").attr("fill", COLOR[d.scen])
      .text(`+${d.delta.toFixed(1)}°C`);
  });

  svg.append("text").attr("x", margin.left).attr("y", 20)
    .attr("font-size", 14).attr("font-weight", 600).attr("fill", COLOR.ink)
    .text(state.city);
}

// ============================================================
// Climate analog
// ============================================================
function updateAnalogCard() {
  const row = analog.find(d =>
    d.city === state.city &&
    d.scenario === "ssp585" &&
    d.future_decade === "2070-2099"
  );
  if (!row) {
    d3.select("#analog-name").text("(no match)");
    d3.select("#analog-future").text("—");
    d3.select("#analog-today").text("—");
    d3.select("#analog-explain").text("");
    return;
  }
  if (row.analog_city === state.city) {
    d3.select("#analog-name").text("nowhere on Earth today");
    d3.select("#analog-future").text(`${row.future_T_C.toFixed(1)} °C`);
    d3.select("#analog-today").text("—");
    d3.select("#analog-explain").text(
      `No major city today has a year-round climate as hot as ${state.city} will. ` +
      `It's entering an unprecedented temperature regime.`
    );
  } else {
    d3.select("#analog-name").text(row.analog_city);
    d3.select("#analog-future").text(`${state.city}, 2080: ${row.future_T_C.toFixed(1)} °C`);
    d3.select("#analog-today").text(`${row.analog_city}, today: ${row.analog_T_C.toFixed(1)} °C`);
    d3.select("#analog-explain").text(
      `By 2070–2099 under SSP5-8.5, the year-round climate of ${state.city} will ` +
      `most closely resemble ${row.analog_city} today. Match across all 12 months; ` +
      `mode of 8 climate models.`
    );
  }
}

// ============================================================
// Dumbbell of extreme heat days
// ============================================================
function drawDumbbell() {
  const container = d3.select("#dumbbell-chart");
  container.selectAll("*").remove();
  const cities = citiesMeta.map(d => d.city);
  const data = cities.map(city => {
    const today = d3.mean(extremes.filter(d => d.city === city && d.scenario === "historical"
                          && d.year >= 1985 && d.year <= 2014), d => d.days_over_35C) ?? null;
    const future = d3.mean(extremes.filter(d => d.city === city && d.scenario === "ssp585"
                          && d.year >= 2071 && d.year <= 2100), d => d.days_over_35C) ?? null;
    return { city, today, future, delta: (future ?? 0) - (today ?? 0) };
  }).filter(d => d.today != null && d.future != null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 18);

  const W = container.node().clientWidth || 900;
  const rowH = 30;
  const H = data.length * rowH + 60;
  const margin = { top: 30, right: 70, bottom: 30, left: 120 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%")
    .style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.future) * 1.1]).range([0, innerW]);
  const y = d3.scaleBand().domain(data.map(d => d.city)).range([0, innerH]).padding(0.3);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6));
  g.append("text").attr("x", innerW / 2).attr("y", innerH + 35)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Days per year above 35 °C (95 °F)");

  const rows = g.selectAll(".dumbbell-row")
    .data(data).join("g")
    .attr("class", d => "dumbbell-row" + (d.city === state.city ? " active" : ""))
    .attr("transform", d => `translate(0,${y(d.city) + y.bandwidth()/2})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      state.city = d.city;
      d3.select("#city-select").property("value", d.city);
      renderCity();
    });
  rows.append("text").attr("class", "city-label")
    .attr("x", -8).attr("dy", "0.35em").attr("text-anchor", "end").text(d => d.city);
  rows.append("line")
    .attr("class", d => "dumbbell-line" + (d.city === state.city ? " active" : ""))
    .attr("x1", d => x(d.today)).attr("x2", d => x(d.future));
  rows.append("circle").attr("class", "dumbbell-today")
    .attr("cx", d => x(d.today)).attr("r", 6);
  rows.append("circle").attr("class", "dumbbell-future")
    .attr("cx", d => x(d.future)).attr("r", 7);
  rows.append("text").attr("class", "dumbbell-value")
    .attr("x", d => x(d.future) + 10).attr("dy", "0.35em")
    .attr("fill", COLOR.ssp585).text(d => Math.round(d.future) + "d");

  const legend = svg.append("g").attr("transform", `translate(${margin.left},${margin.top - 14})`);
  legend.append("circle").attr("cx", 0).attr("r", 5).attr("fill", COLOR.neutral);
  legend.append("text").attr("x", 10).attr("dy", "0.35em").attr("font-size", 11)
    .attr("fill", COLOR.ink_soft).text("today (1985–2014)");
  legend.append("circle").attr("cx", 180).attr("r", 6).attr("fill", COLOR.ssp585);
  legend.append("text").attr("x", 192).attr("dy", "0.35em").attr("font-size", 11)
    .attr("fill", COLOR.ink_soft).text("2080 (SSP5-8.5)");
}

// ============================================================
// Top cities by warming amount (per-city mean tas delta)
// ============================================================
function drawWarmingRank() {
  const container = d3.select("#warming-chart");
  container.selectAll("*").remove();
  const cities = citiesMeta.map(d => d.city);

  const data = cities.map(city => {
    const base = d3.mean(
      citiesAnnual.filter(d => d.city === city && d.scenario === "historical"
                          && d.year >= 1950 && d.year <= 2014),
      d => d.tas_mean_C
    );
    const fut = d3.mean(
      citiesAnnual.filter(d => d.city === city && d.scenario === "ssp585"
                          && d.year >= 2071 && d.year <= 2100),
      d => d.tas_mean_C
    );
    return base != null && fut != null
      ? { city, base, fut, delta: fut - base }
      : null;
  }).filter(Boolean)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 20);

  if (!data.length) {
    container.append("div").style("padding", "60px 20px")
      .style("text-align", "center").style("color", "#888")
      .text("Warming-rank data not yet available.");
    return;
  }

  const W = container.node().clientWidth || 900;
  const rowH = 28;
  const H = data.length * rowH + 60;
  const margin = { top: 30, right: 70, bottom: 36, left: 130 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%").style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.delta) * 1.08]).range([0, innerW]);
  const y = d3.scaleBand().domain(data.map(d => d.city)).range([0, innerH]).padding(0.28);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => "+" + d + "°C"));
  g.append("text").attr("x", innerW / 2).attr("y", innerH + 32)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Mean annual temperature change, end of century (SSP5-8.5)");

  // color by intensity (higher delta = darker red)
  const colorScale = d3.scaleLinear().domain([d3.min(data, d => d.delta), d3.max(data, d => d.delta)])
    .range(["#ffb84d", "#c1272d"]);

  const rows = g.selectAll(".warm-row").data(data).join("g")
    .attr("class", d => "warm-row" + (d.city === state.city ? " active" : ""))
    .attr("transform", d => `translate(0,${y(d.city)})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      state.city = d.city;
      d3.select("#city-select").property("value", d.city);
      renderCity();
      drawWarmingRank();
    });
  rows.append("text").attr("class", "city-label")
    .attr("x", -8).attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("fill", d => d.city === state.city ? COLOR.ssp585 : COLOR.ink)
    .attr("font-weight", d => d.city === state.city ? 700 : 500)
    .text(d => d.city);
  rows.append("rect")
    .attr("x", 0).attr("y", 2).attr("height", y.bandwidth() - 4)
    .attr("width", d => x(d.delta))
    .attr("fill", d => colorScale(d.delta))
    .attr("stroke", "white").attr("stroke-width", 1);
  rows.append("text").attr("class", "warm-value")
    .attr("x", d => x(d.delta) + 6).attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("font-size", 11).attr("font-weight", 700)
    .attr("fill", d => colorScale(d.delta))
    .text(d => "+" + d.delta.toFixed(1) + "°C");
}


// ============================================================
// Spatial maps
// ============================================================
function drawTempMap() { drawMap("#temp-map", "tas", state.tempMapScen,
  { label: "Δ Temperature (°C)", cmap: tasColor, domain: [0, 13] }); }
function drawPrecipMap() { drawMap("#precip-map", "pr", state.precipMapScen,
  { label: "Δ Precipitation (%)", cmap: prColor, domain: [-50, 50] }); }

function tasColor(v) {
  // sequential warm palette: 0 = pale yellow, +13 = deep red
  const t = Math.max(0, Math.min(13, v)) / 13;
  return d3.interpolateYlOrRd(t);
}
function prColor(v) {
  // diverging: dry brown ← 0 → wet teal/green
  const t = (v + 50) / 100;
  return d3.interpolateBrBG(Math.max(0, Math.min(1, t)));
}

function drawMap(selector, variable, scenario, opts) {
  const container = d3.select(selector);
  container.selectAll("*").remove();
  const rows = spatial.filter(d => d.variable === variable && d.scenario === scenario);
  if (!rows.length) {
    container.append("div").style("padding", "60px 20px")
      .style("text-align", "center").style("color", "#888")
      .text("Spatial data not yet available.");
    return;
  }
  const W = container.node().clientWidth || 1000;
  const H = 470;
  const margin = { top: 8, right: 80, bottom: 30, left: 36 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%").style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // longitudes in our data are 0..360 — center on 180 for the projection, then map to -180..180
  const x = d3.scaleLinear().domain([-180, 180]).range([0, innerW]);
  const y = d3.scaleLinear().domain([-90, 90]).range([innerH, 0]);

  // Determine grid spacing (2.5 deg)
  const lats = Array.from(new Set(rows.map(d => d.lat))).sort((a,b) => a-b);
  const lons = Array.from(new Set(rows.map(d => d.lon))).sort((a,b) => a-b);
  const dlat = lats.length > 1 ? lats[1] - lats[0] : 2.5;
  const dlon = lons.length > 1 ? lons[1] - lons[0] : 2.5;
  const cellW = x(dlon) - x(0);
  const cellH = y(0) - y(dlat);

  g.selectAll(".map-cell").data(rows).join("rect")
    .attr("class", "map-cell")
    .attr("x", d => x(d.lon > 180 ? d.lon - 360 : d.lon) - cellW / 2)
    .attr("y", d => y(d.lat) - cellH / 2)
    .attr("width", cellW + 0.5).attr("height", cellH + 0.5)
    .attr("fill", d => opts.cmap(d.delta))
    .on("mouseenter", function (event, d) {
      tooltip.style("opacity", 1);
      d3.select(this).attr("stroke", "white").attr("stroke-width", 1.5).raise();
    })
    .on("mousemove", function (event, d) {
      const lat = d.lat, lon = d.lon > 180 ? d.lon - 360 : d.lon;
      const latLab = lat === 0 ? "0°" : (lat > 0 ? lat.toFixed(1) + "°N" : Math.abs(lat).toFixed(1) + "°S");
      const lonLab = lon === 0 ? "0°" : (lon > 0 ? lon.toFixed(1) + "°E" : Math.abs(lon).toFixed(1) + "°W");
      const unit = variable === "tas" ? " °C" : " %";
      const sign = d.delta > 0 ? "+" : "";
      tooltip.html(`
        <div class="tooltip-year">${latLab}, ${lonLab}</div>
        <div class="tooltip-row"><span>${opts.label.replace(/^Δ\s*/, "")}</span><span><b>${sign}${d.delta.toFixed(1)}${unit}</b></span></div>
      `).style("left", (event.pageX + 18) + "px")
        .style("top", (event.pageY - 12) + "px");
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
      d3.select(this).attr("stroke", "none");
    });

  // Coastline overlay
  if (worldLand) {
    const projection = d3.geoEquirectangular()
      .translate([innerW / 2, innerH / 2])
      .scale(innerW / (2 * Math.PI));
    const path = d3.geoPath(projection);
    g.append("path")
      .datum(worldLand)
      .attr("class", "map-coastline")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "rgba(29, 28, 26, 0.65)")
      .attr("stroke-width", 0.5);
  }

  // overlay city markers
  citiesMeta.forEach(c => {
    g.append("circle").attr("class", "map-city-marker")
      .attr("cx", x(c.lon)).attr("cy", y(c.lat))
      .attr("r", c.city === state.city ? 6 : 2.5);
    if (c.city === state.city) {
      g.append("text").attr("class", "map-city-label")
        .attr("x", x(c.lon) + 9).attr("y", y(c.lat) + 4)
        .style("paint-order", "stroke").style("stroke", "white").style("stroke-width", "3px")
        .text(c.city);
    }
  });

  // axes
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(7).tickFormat(d =>
      d === 0 ? "0°" : (d > 0 ? d + "°E" : Math.abs(d) + "°W")));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d =>
      d === 0 ? "0°" : (d > 0 ? d + "°N" : Math.abs(d) + "°S")));

  // colorbar
  const cbX = innerW + 14;
  const cbW = 16, cbH = innerH - 40;
  const cbScale = d3.scaleLinear().domain(opts.domain).range([cbH, 0]);
  const cbAxis = d3.axisRight(cbScale).ticks(6).tickFormat(d => (variable === "tas" ? d + "°" : d + "%"));
  const cbg = g.append("g").attr("transform", `translate(${cbX},20)`);
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const v = opts.domain[0] + (opts.domain[1] - opts.domain[0]) * (i / steps);
    cbg.append("rect").attr("x", 0).attr("y", cbH * (1 - (i + 1) / steps))
      .attr("width", cbW).attr("height", cbH / steps + 0.5)
      .attr("fill", opts.cmap(v));
  }
  cbg.append("g").attr("transform", `translate(${cbW},0)`).call(cbAxis)
    .selectAll("text").style("font-size", "10px");
  cbg.append("text").attr("x", cbW / 2).attr("y", -8)
    .attr("text-anchor", "middle").attr("font-size", 10).attr("fill", COLOR.ink_soft)
    .text(opts.label);
}

// ============================================================
// Boot
// ============================================================
(async function init() {
  const ok = await loadAll();
  if (!ok) {
    d3.select("body").append("div").style("color", "red").style("padding", "20px")
      .text("Couldn't load CMIP6 data. Are you serving the site over HTTP (e.g., `python -m http.server`)?");
    return;
  }
  buildCitySelect();
  setupControls();
  renderAll();
})();

window.addEventListener("resize", () => {
  if (citiesAnnual.length) {
    drawOverviewChart();
    drawTrajectoryChart();
    drawChoiceChart();
    drawDumbbell();
    drawWarmingRank();
    drawTempMap();
    drawPrecipMap();
  }
});
