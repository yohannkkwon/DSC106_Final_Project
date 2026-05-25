// ============================================================
// Your City in 2080 — main.js (Apple-style scrollytelling rebuild)
// ============================================================

const COLOR = {
  historical: "#6b6862",
  historical_dark: "#888884",
  ssp126:     "#2a6f97",
  ssp245:     "#f08a3e",
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
  ssp126:     "SSP1-2.6",
  ssp245:     "SSP2-4.5",
  ssp585:     "SSP5-8.5",
};
const ALL_SCEN = ["historical", "ssp126", "ssp245", "ssp585"];
const FUTURE_SCEN = ["ssp126", "ssp245", "ssp585"];

const state = {
  city: "San Diego",
  overviewStep: "historical",
  trajectoryStep: "all",
  // Map sliders: 0 = SSP1-2.6, 0.5 = SSP2-4.5, 1.0 = SSP5-8.5 (smooth interp)
  tempMapT: 1.0,
  precipMapT: 1.0,
};

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

// Data
let citiesAnnual, citiesRaw, extremes, analog, citiesMeta, spatial, globalMean;
let worldLand = null;
let availableScenarios = ALL_SCEN;

// ============================================================
// Boot
// ============================================================
(async function init() {
  const ok = await loadAll();
  if (!ok) {
    d3.select("body").append("div").style("color", "red").style("padding", "20px")
      .text("Couldn't load CMIP6 data. Serve over HTTP (e.g. `python -m http.server`).");
    return;
  }
  buildCitySelect();
  setupControls();
  setupProgressBar();
  setupScrollTriggers();
  setupFadeIns();
  renderAll();
})();

async function loadAll() {
  const tryCsv = async (p) => { try { return await d3.csv(p, rowParse); } catch { return null; } };
  const tryJson = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
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
  citiesAnnual = annual || [];
  extremes = ext || [];
  analog = ana || [];
  citiesMeta = meta || [];
  spatial = sp || [];
  globalMean = gm || [];
  citiesRaw = raw || [];
  if (atlas && typeof topojson !== "undefined") {
    try { worldLand = topojson.feature(atlas, atlas.objects.land); } catch {}
  }
  const seen = new Set(citiesAnnual.map(d => d.scenario));
  availableScenarios = ALL_SCEN.filter(s => seen.has(s));
  if (!availableScenarios.length) availableScenarios = ["historical", "ssp245", "ssp585"];
  return citiesAnnual.length > 0;
}

function rowParse(d) {
  for (const k in d) {
    if (k === "city" || k === "scenario" || k === "variable" ||
        k === "model" || k === "future_decade" || k === "analog_city") continue;
    const v = +d[k];
    if (!Number.isNaN(v) && d[k] !== "") d[k] = v;
  }
  return d;
}

// ============================================================
// City picker + controls
// ============================================================
function buildCitySelect() {
  const cities = citiesMeta.map(d => d.city).sort();
  if (!cities.includes(state.city)) state.city = cities[0];

  const button = document.getElementById("city-picker-button");
  const menu = document.getElementById("city-picker-menu");
  const currentLabel = document.getElementById("city-picker-current");

  // populate menu
  menu.innerHTML = "";
  cities.forEach(c => {
    const item = document.createElement("div");
    item.className = "city-picker-item" + (c === state.city ? " selected" : "");
    item.setAttribute("role", "option");
    item.dataset.city = c;
    item.textContent = c;
    item.addEventListener("click", () => selectCity(c));
    menu.appendChild(item);
  });

  function selectCity(c) {
    state.city = c;
    currentLabel.textContent = c;
    menu.querySelectorAll(".city-picker-item").forEach(el => {
      el.classList.toggle("selected", el.dataset.city === c);
    });
    closeMenu();
    renderCity();
  }
  function openMenu() {
    button.setAttribute("aria-expanded", "true");
    menu.setAttribute("aria-hidden", "false");
    // scroll selected item into view
    const sel = menu.querySelector(".selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }
  function closeMenu() {
    button.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-hidden", "true");
  }
  function toggleMenu() {
    if (button.getAttribute("aria-expanded") === "true") closeMenu();
    else openMenu();
  }
  button.addEventListener("click", toggleMenu);
  document.addEventListener("click", (e) => {
    if (!button.parentElement.contains(e.target)) closeMenu();
  });
  // keyboard
  button.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMenu(); }
  });

  // expose for use elsewhere (e.g., random btn, dumbbell click)
  window.__selectCity = selectCity;

  // initial label
  currentLabel.textContent = state.city;
}

function setupControls() {
  d3.select("#random-btn").on("click", () => {
    const cities = citiesMeta.map(d => d.city);
    let c;
    do { c = cities[Math.floor(Math.random() * cities.length)]; } while (c === state.city);
    if (window.__selectCity) window.__selectCity(c);
    else { state.city = c; renderCity(); }
  });

  d3.select("#city-pill").on("click", () => {
    document.querySelector(".pick-city").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Map sliders
  setupMapSlider("temp-map-slider", "temp-map", (t) => {
    state.tempMapT = t;
    updateMapCellsByT("#temp-map", "tas", t);
    updateMapReadout("temp-map-name", "temp-map-sub", t);
  });
  setupMapSlider("precip-map-slider", "precip-map", (t) => {
    state.precipMapT = t;
    updateMapCellsByT("#precip-map", "pr", t);
    updateMapReadout("precip-map-name", "precip-map-sub", t);
  });
  // tick clicks snap to those positions
  document.querySelectorAll(".map-slider-ticks").forEach(group => {
    group.querySelectorAll("span").forEach(span => {
      span.addEventListener("click", () => {
        const sliderEl = group.previousElementSibling;
        const pos = parseInt(span.dataset.pos, 10);
        sliderEl.value = pos;
        sliderEl.dispatchEvent(new Event("input"));
      });
    });
  });
}

function setupMapSlider(sliderId, mapId, onChange) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;
  const fire = () => {
    const t = +slider.value / 1000;
    onChange(t);
  };
  slider.addEventListener("input", fire);
  slider.addEventListener("change", fire);
  fire();  // initial
}

// Piecewise-linear interp between SSP1-2.6 (t=0), SSP2-4.5 (t=0.5), SSP5-8.5 (t=1)
function blendScenarios(v126, v245, v585, t) {
  if (t <= 0.5) return v126 + (v245 - v126) * (t * 2);
  return v245 + (v585 - v245) * ((t - 0.5) * 2);
}

function describeScen(t) {
  if (t <= 0.01) return { name: "SSP1-2.6", sub: "low emissions · we act decisively" };
  if (t < 0.5)   return { name: "between SSP1-2.6 and SSP2-4.5", sub: "interpolated" };
  if (t <= 0.51) return { name: "SSP2-4.5", sub: "middle of the road · current pace" };
  if (t < 1.0)   return { name: "between SSP2-4.5 and SSP5-8.5", sub: "interpolated" };
  return { name: "SSP5-8.5", sub: "high emissions · we keep burning" };
}
function updateMapReadout(nameId, subId, t) {
  const d = describeScen(t);
  const nm = document.getElementById(nameId);
  const sb = document.getElementById(subId);
  if (nm) nm.textContent = d.name;
  if (sb) sb.textContent = d.sub;
}

// ============================================================
// Progress bar
// ============================================================
function setupProgressBar() {
  const fill = document.querySelector(".progress-bar .fill");
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    fill.style.width = pct + "%";
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

// ============================================================
// City pill — visible after pick-city chapter
// ============================================================
function setupCityPillObserver() {
  const pick = document.querySelector(".pick-city");
  const about = document.querySelector(".about-chapter");
  const pill = document.getElementById("city-pill");
  if (!pick || !pill || !about) return;
  const obs = new IntersectionObserver((entries) => {
    // determine: have we passed the pick-city chapter?
    const pickRect = pick.getBoundingClientRect();
    const aboutRect = about.getBoundingClientRect();
    const passedPick = pickRect.bottom < window.innerHeight * 0.3;
    const inAbout = aboutRect.top < window.innerHeight * 0.4;
    if (passedPick && !inAbout) pill.classList.add("visible");
    else pill.classList.remove("visible");
    // theme pill based on whether we're in a dark chapter
    const sections = document.querySelectorAll(".chapter");
    let inDark = false;
    sections.forEach(s => {
      const r = s.getBoundingClientRect();
      if (r.top < window.innerHeight / 2 && r.bottom > window.innerHeight / 2) {
        inDark = s.classList.contains("dark");
      }
    });
    pill.classList.toggle("dark", inDark);
  }, { threshold: [0, 0.2, 0.5, 1] });
  // observe everything that could trigger a state change
  document.querySelectorAll(".chapter").forEach(c => obs.observe(c));
  window.addEventListener("scroll", () => obs.disconnect() && obs); // we'll just attach scroll directly
}

// Simpler scroll-based pill update (replaces IntersectionObserver)
function setupCityPill() {
  const pick = document.querySelector(".pick-city");
  const about = document.querySelector(".about-chapter");
  const pill = document.getElementById("city-pill");
  if (!pick || !pill) return;
  const update = () => {
    const pickRect = pick.getBoundingClientRect();
    const aboutRect = about ? about.getBoundingClientRect() : null;
    const passedPick = pickRect.bottom < window.innerHeight * 0.3;
    const inAbout = aboutRect && aboutRect.top < window.innerHeight * 0.4;
    pill.classList.toggle("visible", passedPick && !inAbout);
    // dark theme detection
    const vpMid = window.innerHeight / 2;
    let inDark = false;
    document.querySelectorAll(".chapter").forEach(s => {
      const r = s.getBoundingClientRect();
      if (r.top < vpMid && r.bottom > vpMid) inDark = s.classList.contains("dark");
    });
    pill.classList.toggle("dark", inDark);
    document.getElementById("pill-city-name").textContent = state.city;
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

// ============================================================
// Fade-in for chapter titles / decks
// ============================================================
function setupFadeIns() {
  const elements = document.querySelectorAll(".chapter-title, .chapter-deck, .kicker");
  elements.forEach(el => el.classList.add("fade-in"));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("in-view"); });
  }, { threshold: 0.2 });
  elements.forEach(el => obs.observe(el));
}

// ============================================================
// Scroll triggers — IntersectionObserver + scroll fallback (belt + suspenders)
// ============================================================
function setupScrollTriggers() {
  const stakesLines = Array.from(document.querySelectorAll(".stakes-line"));
  const overviewSteps = Array.from(document.querySelectorAll('[data-scrolly="overview"] .scrolly-step'));
  const trajSteps = Array.from(document.querySelectorAll('[data-scrolly="trajectory"] .scrolly-step'));
  const bnSection = document.querySelector(".big-numbers-chapter");

  let activeOverview = null;
  let activeTraj = null;
  let bnFired = false;

  function lastCrossed(elements, triggerY) {
    let lastIdx = -1;
    for (let i = 0; i < elements.length; i++) {
      const r = elements[i].getBoundingClientRect();
      if (r.top <= triggerY) lastIdx = i;
      else break;
    }
    return lastIdx;
  }

  function update() {
    const vh = window.innerHeight;
    const triggerY = vh * 0.65;

    const stakesIdx = lastCrossed(stakesLines, triggerY);
    stakesLines.forEach((el, i) => el.classList.toggle("active", i <= stakesIdx));

    const overviewIdx = lastCrossed(overviewSteps, triggerY);
    if (overviewIdx >= 0) {
      const target = overviewSteps[overviewIdx];
      if (target !== activeOverview) {
        overviewSteps.forEach(s => s.classList.remove("active"));
        target.classList.add("active");
        activeOverview = target;
        state.overviewStep = target.dataset.step;
        drawOverviewChart();
      }
    }

    const trajIdx = lastCrossed(trajSteps, triggerY);
    if (trajIdx >= 0) {
      const target = trajSteps[trajIdx];
      if (target !== activeTraj) {
        trajSteps.forEach(s => s.classList.remove("active"));
        target.classList.add("active");
        activeTraj = target;
        state.trajectoryStep = target.dataset.step;
        drawTrajectoryChart();
      }
    }

    if (bnSection) {
      const r = bnSection.getBoundingClientRect();
      const inView = r.top < vh * 0.6 && r.bottom > vh * 0.4;
      if (inView && !bnFired) {
        bnFired = true;
        triggerBigNumbersAnimation();
      } else if (!inView) {
        bnFired = false;
      }
    }
  }

  // Scroll-based: rAF-throttled
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => { update(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  window.addEventListener("resize", update);

  // IO-based: any step entering OR leaving viewport triggers update().
  const allTriggers = [...stakesLines, ...overviewSteps, ...trajSteps];
  if (bnSection) allTriggers.push(bnSection);
  // also observe the chapter sections that CONTAIN the scrolly groups, so we
  // pick up changes when steps have already scrolled past
  document.querySelectorAll(".chapter").forEach(c => allTriggers.push(c));
  const io = new IntersectionObserver(() => update(), { threshold: [0, 0.25, 0.5, 0.75, 1] });
  allTriggers.forEach(el => io.observe(el));

  // Safety-net polling at 6 Hz — catches edge cases where scroll & IO miss
  // events (notably automated testing with `behavior:"instant"`). Cheap.
  setInterval(update, 160);

  update();
  setupCityPill();
}

// ============================================================
// Master render
// ============================================================
function renderAll() {
  drawOverviewChart();
  renderCity();
  drawWarmingRank();
  drawTempMap();
  drawPrecipMap();
}
function renderCity() {
  // text — guarded against missing elements (some get re-rendered by other functions)
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText("traj-city-name", state.city);
  setText("choice-city-name", state.city);
  setText("analog-source-city", state.city);
  setText("pill-city-name", state.city);

  drawTrajectoryChart();
  drawChoiceChart();
  updateAnalogCard();
  updateBigNumbers();   // also updates the bn-city-name span
  drawDumbbell();
}

// ============================================================
// Big numbers (animated)
// ============================================================
function bnValues() {
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
  return {
    today: today != null ? Math.round(today) : null,
    future: future != null ? Math.round(future) : null,
  };
}

function updateBigNumbers() {
  const { today, future } = bnValues();
  document.getElementById("bn-today").textContent = today ?? "—";
  document.getElementById("bn-2080").textContent = future ?? "—";
  updateBigCaption(today, future);
}

function triggerBigNumbersAnimation() {
  const { today, future } = bnValues();
  if (today == null || future == null) return;
  countUp("#bn-today", today, 900);
  countUp("#bn-2080", future, 1300);
  updateBigCaption(today, future);
}

function countUp(sel, target, duration) {
  const el = d3.select(sel);
  const start = 0;
  el.transition().duration(duration).ease(d3.easeCubicOut)
    .tween("text", function () {
      const i = d3.interpolateNumber(start, target);
      return t => this.textContent = Math.round(i(t));
    });
}

function updateBigCaption(today, future) {
  const captionEl = document.getElementById("bn-caption");
  if (!captionEl || today == null || future == null) return;
  let xText;
  if (today >= 1) {
    const x = (future / today).toFixed(1);
    xText = `${x}× increase`;
  } else if (future > 0) {
    xText = "from essentially zero";
  } else {
    xText = "no change";
  }
  // preserve the bn-city-name id so renderCity can keep working
  captionEl.innerHTML = `That's a <strong>${xText}</strong> in dangerously hot days for <span id="bn-city-name">${state.city}</span>.`;
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
// Global overview (stepped reveal)
// ============================================================
function drawOverviewChart() {
  const container = d3.select("#overview-chart");
  container.selectAll("*").remove();

  if (!globalMean.length) {
    container.append("div").style("padding", "60px 20px")
      .style("text-align", "center").style("color", "#888")
      .text("Global mean overview chart loading…");
    return;
  }

  const baseline = d3.mean(globalMean.filter(d => d.scenario === "historical"
                                                  && d.year >= 1850 && d.year <= 1900),
                            d => d.tas_C);
  const byScen = d3.group(globalMean, d => d.scenario);
  const series = {};
  for (const [scen, rows] of byScen) {
    const byYear = d3.group(rows, d => d.year);
    series[scen] = Array.from(byYear, ([yr, gs]) => ({
      year: +yr,
      mean: d3.mean(gs, d => d.tas_C) - baseline,
      p10: d3.quantile(gs.map(d => d.tas_C), 0.10) - baseline,
      p90: d3.quantile(gs.map(d => d.tas_C), 0.90) - baseline,
    })).sort((a, b) => a.year - b.year);
  }

  const W = container.node().clientWidth || 900;
  const H = Math.min(540, window.innerHeight - 200);
  const margin = { top: 30, right: 30, bottom: 44, left: 60 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%")
    .style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1850, 2100]).range([0, innerW]);
  const allVals = Object.values(series).flatMap(s => s.flatMap(d => [d.p10, d.p90]));
  const y = d3.scaleLinear()
    .domain([Math.min(0, d3.min(allVals) - 0.3), d3.max(allVals) + 0.3])
    .range([innerH, 0]).nice();

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d => d).ticks(8));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => (d > 0 ? "+" : "") + d + "°"));

  g.append("line").attr("x1", 0).attr("x2", innerW)
    .attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", COLOR.ink_soft).attr("opacity", 0.3).attr("stroke-width", 0.6);

  // 2015 divider
  g.append("line").attr("x1", x(2015)).attr("x2", x(2015))
    .attr("y1", 0).attr("y2", innerH)
    .attr("stroke", COLOR.ink_soft).attr("opacity", 0.3).attr("stroke-dasharray", "2 4");

  // axis label
  g.append("text").attr("transform", `translate(-44,${innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Global temperature anomaly (°C vs 1850–1900)");

  // determine which scenarios are visible based on state.overviewStep
  const step = state.overviewStep;
  const showHist = true;
  const showP = step === "paris" || step === "historical" || step === "ssp126" || step === "ssp245" || step === "ssp585";
  const visibleScen = {
    historical: showHist,
    ssp126: ["ssp126", "ssp245", "ssp585", "paris"].includes(step),
    ssp245: ["ssp245", "ssp585", "paris"].includes(step),
    ssp585: ["ssp585", "paris"].includes(step),
  };
  const highlightScen = step === "paris" ? null : step;

  for (const scen of ALL_SCEN) {
    if (!visibleScen[scen]) continue;
    const s = series[scen]; if (!s || !s.length) continue;
    const isHighlighted = highlightScen == null ? true : (scen === highlightScen || scen === "historical");
    const sm = rolling(s, "mean", 10);
    if (scen !== "historical") {
      const area = d3.area().x(d => x(d.year)).y0(d => y(d.p10)).y1(d => y(d.p90)).curve(d3.curveMonotoneX);
      g.append("path").datum(s)
        .attr("fill", COLOR[scen])
        .attr("opacity", isHighlighted ? 0.18 : 0.07)
        .attr("d", area);
    }
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    g.append("path").datum(sm).attr("fill", "none")
      .attr("stroke", COLOR[scen]).attr("stroke-width", isHighlighted ? 2.6 : 1.5)
      .attr("opacity", isHighlighted ? 1 : 0.35).attr("d", line);
  }

  // Paris line — appears in step "paris" or always faint
  const parisOpacity = step === "paris" ? 1 : 0.4;
  g.append("line").attr("class", "paris-line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", y(1.5)).attr("y2", y(1.5))
    .attr("opacity", parisOpacity);
  g.append("text").attr("x", 6).attr("y", y(1.5) - 5)
    .attr("font-size", 11).attr("fill", COLOR.ink_soft)
    .attr("opacity", parisOpacity)
    .text("+1.5 °C — Paris Agreement target");
}

// ============================================================
// Trajectory chart (stepped highlight)
// ============================================================
function drawTrajectoryChart() {
  const container = d3.select("#trajectory-chart");
  container.selectAll("*").remove();
  const data = citiesAnnual.filter(d => d.city === state.city)
                           .sort((a, b) => a.year - b.year);
  if (!data.length) return;

  const W = container.node().clientWidth || 900;
  const H = Math.min(540, window.innerHeight - 200);
  const margin = { top: 30, right: 130, bottom: 44, left: 56 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%")
    .style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1850, 2100]).range([0, innerW]);
  const yExtent = d3.extent(data.flatMap(d => [d.tas_p10_C, d.tas_p90_C]));
  const pad = (yExtent[1] - yExtent[0]) * 0.08;
  const y = d3.scaleLinear().domain([yExtent[0] - pad, yExtent[1] + pad]).range([innerH, 0]).nice();

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d => d).ticks(8));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "°"));
  g.append("text").attr("x", innerW / 2).attr("y", innerH + 36)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft).text("Year");
  g.append("text").attr("transform", `translate(-40,${innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Annual mean temp (°C)");

  const step = state.trajectoryStep;
  const highlight = step;
  const isStepFiltered = step !== "all" && step !== "spread";

  availableScenarios.forEach(scen => {
    const sub = data.filter(d => d.scenario === scen);
    if (!sub.length) return;
    let isFaded = false;
    if (isStepFiltered) {
      isFaded = (scen !== highlight) && (scen !== "historical");
    }
    // band
    if (scen !== "historical") {
      const area = d3.area().x(d => x(d.year)).y0(d => y(d.tas_p10_C)).y1(d => y(d.tas_p90_C)).curve(d3.curveMonotoneX);
      g.append("path").datum(sub).attr("class", "trajectory-band" + (isFaded ? " dimmed" : ""))
        .attr("fill", COLOR[scen]).attr("d", area)
        .attr("opacity", step === "spread" ? 0.35 : (isFaded ? 0.05 : 0.16));
    }
    const sm = rolling(sub, "tas_mean_C", 10);
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    g.append("path").datum(sm).attr("class", "trajectory-line" + (isFaded ? " dimmed" : ""))
      .attr("stroke", COLOR[scen]).attr("stroke-width", isFaded ? 1.5 : 2.4)
      .attr("opacity", isFaded ? 0.18 : 1).attr("d", line);

    const last = sub[sub.length - 1];
    g.append("text")
      .attr("x", x(last.year) + 6).attr("y", y(last.tas_mean_C))
      .attr("dy", "0.32em").attr("fill", COLOR[scen])
      .attr("opacity", isFaded ? 0.3 : 1)
      .attr("font-size", 12).attr("font-weight", 600).text(SHORT[scen]);
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
      const rows = availableScenarios.map(scen => {
        const sub = data.filter(d => d.scenario === scen);
        if (!sub.length) return null;
        const idx = bisect(sub, year);
        const d = sub[Math.min(idx, sub.length - 1)];
        return d && d.year === year ? { scen, val: d.tas_mean_C } : null;
      }).filter(Boolean);
      if (!rows.length) return;
      tooltip.html(`
        <div class="tooltip-year">${year}</div>
        ${rows.map(r => `
          <div class="tooltip-row">
            <span><span class="tooltip-swatch" style="background:${COLOR[r.scen]}"></span>${SHORT[r.scen]}</span>
            <span><b>${r.val.toFixed(1)} °C</b></span>
          </div>`).join("")}
      `).style("left", (event.pageX + 18) + "px").style("top", (event.pageY - 12) + "px");
    });
}

// ============================================================
// "Future is a choice" — three big cards
// ============================================================
function drawChoiceChart() {
  const container = document.getElementById("choice-bars");
  container.innerHTML = "";
  const baseline = d3.mean(
    citiesAnnual.filter(d => d.city === state.city && d.scenario === "historical"
                       && d.year >= 1950 && d.year <= 2014),
    d => d.tas_mean_C
  );
  const desc = {
    ssp126: "We act decisively.",
    ssp245: "Current pace.",
    ssp585: "We keep burning.",
  };
  const futures = FUTURE_SCEN.map(scen => {
    const rows = citiesAnnual.filter(d => d.city === state.city && d.scenario === scen
                        && d.year >= 2071 && d.year <= 2100);
    if (!rows.length) return null;
    const mean = d3.mean(rows, d => d.tas_mean_C);
    const p10 = d3.mean(rows, d => d.tas_p10_C);
    const p90 = d3.mean(rows, d => d.tas_p90_C);
    return { scen, delta: mean - baseline, low: p10 - baseline, high: p90 - baseline };
  }).filter(Boolean);

  futures.forEach(d => {
    const div = document.createElement("div");
    div.className = `bar-card ${d.scen}`;
    div.innerHTML = `
      <div class="scen-name" style="color:${COLOR[d.scen]}">${SHORT[d.scen]}</div>
      <div class="scen-desc">${desc[d.scen]}</div>
      <div class="scen-value">+${d.delta.toFixed(1)}<span class="scen-unit">°C</span></div>
      <div class="scen-spread">+${d.low.toFixed(1)} to +${d.high.toFixed(1)} °C · 8 models</div>
    `;
    container.appendChild(div);
  });
}

// ============================================================
// Climate analog
// ============================================================
function updateAnalogCard() {
  const row = analog.find(d => d.city === state.city && d.scenario === "ssp585"
                          && d.future_decade === "2070-2099");
  if (!row) {
    document.getElementById("analog-name").textContent = "(no match)";
    document.getElementById("analog-future").textContent = "—";
    document.getElementById("analog-today").textContent = "—";
    document.getElementById("analog-explain").textContent = "";
    return;
  }
  const nameEl = document.getElementById("analog-name");
  if (row.analog_city === state.city) {
    nameEl.textContent = "nowhere on Earth today";
    nameEl.classList.add("multi-word");
    document.getElementById("analog-future").textContent = `${row.future_T_C.toFixed(1)} °C`;
    document.getElementById("analog-today").textContent = "—";
    document.getElementById("analog-explain").textContent =
      `No major city today has a year-round climate as hot as ${state.city} will. ` +
      `It's entering an unprecedented temperature regime.`;
  } else {
    nameEl.textContent = row.analog_city + ".";
    // Apply tighter sizing to multi-word names so they don't overflow
    nameEl.classList.toggle("multi-word", row.analog_city.includes(" "));
    document.getElementById("analog-future").textContent =
      `${state.city}, 2080: ${row.future_T_C.toFixed(1)} °C`;
    document.getElementById("analog-today").textContent =
      `${row.analog_city}, today: ${row.analog_T_C.toFixed(1)} °C`;
    document.getElementById("analog-explain").textContent =
      `By 2070–2099 under SSP5-8.5, the year-round climate of ${state.city} will ` +
      `most closely resemble ${row.analog_city} today. Match across all 12 months; ` +
      `mode of 8 climate models.`;
  }
}

// ============================================================
// Warming rank
// ============================================================
function drawWarmingRank() {
  const container = d3.select("#warming-chart");
  container.selectAll("*").remove();
  const cities = citiesMeta.map(d => d.city);
  const data = cities.map(city => {
    const base = d3.mean(citiesAnnual.filter(d => d.city === city && d.scenario === "historical"
                          && d.year >= 1950 && d.year <= 2014), d => d.tas_mean_C);
    const fut = d3.mean(citiesAnnual.filter(d => d.city === city && d.scenario === "ssp585"
                          && d.year >= 2071 && d.year <= 2100), d => d.tas_mean_C);
    return base != null && fut != null ? { city, delta: fut - base } : null;
  }).filter(Boolean).sort((a, b) => b.delta - a.delta).slice(0, 20);

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

  const colorScale = d3.scaleLinear()
    .domain([d3.min(data, d => d.delta), d3.max(data, d => d.delta)])
    .range(["#ffb84d", "#c1272d"]);

  const rows = g.selectAll(".warm-row").data(data).join("g")
    .attr("class", d => "warm-row" + (d.city === state.city ? " active" : ""))
    .attr("transform", d => `translate(0,${y(d.city)})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      if (window.__selectCity) window.__selectCity(d.city);
      else { state.city = d.city; renderCity(); }
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
    .attr("fill", d => colorScale(d.delta)).text(d => "+" + d.delta.toFixed(1) + "°C");
}

// ============================================================
// Dumbbell
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
    .sort((a, b) => b.delta - a.delta).slice(0, 18);

  const W = container.node().clientWidth || 900;
  const rowH = 32;
  const H = data.length * rowH + 60;
  const margin = { top: 30, right: 70, bottom: 30, left: 120 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%").style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.future) * 1.1]).range([0, innerW]);
  const y = d3.scaleBand().domain(data.map(d => d.city)).range([0, innerH]).padding(0.3);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6));
  g.append("text").attr("x", innerW / 2).attr("y", innerH + 35)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", COLOR.ink_soft)
    .text("Days per year above 35 °C (95 °F)");

  const rows = g.selectAll(".dumbbell-row").data(data).join("g")
    .attr("class", d => "dumbbell-row" + (d.city === state.city ? " active" : ""))
    .attr("transform", d => `translate(0,${y(d.city) + y.bandwidth()/2})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      if (window.__selectCity) window.__selectCity(d.city);
      else { state.city = d.city; renderCity(); }
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
    .attr("fill", COLOR.ink_soft).text("2080 (SSP5-8.5, worst case)");
}

// ============================================================
// Maps
// ============================================================
function drawTempMap() { drawMap("#temp-map", "tas", state.tempMapT,
  { label: "Δ Temperature (°C)", cmap: tasColor, domain: [0, 13] }); }
function drawPrecipMap() { drawMap("#precip-map", "pr", state.precipMapT,
  { label: "Δ Precipitation (%)", cmap: prColor, domain: [-50, 50] }); }

// Per-cell lookup tables built on demand: key = "lat,lon" -> {ssp126, ssp245, ssp585}
const cellIndex = { tas: null, pr: null };
function buildCellIndex(variable) {
  if (cellIndex[variable]) return cellIndex[variable];
  const idx = new Map();
  spatial.forEach(r => {
    if (r.variable !== variable) return;
    const key = `${r.lat},${r.lon}`;
    if (!idx.has(key)) idx.set(key, { lat: r.lat, lon: r.lon });
    idx.get(key)[r.scenario] = r.delta;
  });
  cellIndex[variable] = idx;
  return idx;
}

// Recolor map cells given a slider t value (0..1). Much cheaper than redrawing.
function updateMapCellsByT(selector, variable, t) {
  const container = d3.select(selector);
  const cells = container.selectAll(".map-cell");
  if (cells.empty()) return;
  const cmap = variable === "tas" ? tasColor : prColor;
  cells.attr("fill", d => {
    d.delta = blendScenarios(d._ssp126, d._ssp245, d._ssp585, t);
    return cmap(d.delta);
  });
}

function tasColor(v) {
  const t = Math.max(0, Math.min(13, v)) / 13;
  return d3.interpolateYlOrRd(t);
}
function prColor(v) {
  const t = (v + 50) / 100;
  return d3.interpolateBrBG(Math.max(0, Math.min(1, t)));
}

function drawMap(selector, variable, t, opts) {
  const container = d3.select(selector);
  container.selectAll("*").remove();
  // Build per-cell {ssp126, ssp245, ssp585} index, then synthesize "rows" for rendering
  const idx = buildCellIndex(variable);
  const rows = Array.from(idx.values()).filter(r =>
    r.ssp126 != null && r.ssp245 != null && r.ssp585 != null
  );
  if (!rows.length) {
    container.append("div").style("padding", "60px 20px")
      .style("text-align", "center").style("color", "#888").text("Spatial data loading…");
    return;
  }
  // attach a blended .delta plus underscored anchor values for later updates
  rows.forEach(r => {
    r._ssp126 = r.ssp126;
    r._ssp245 = r.ssp245;
    r._ssp585 = r.ssp585;
    r.delta = blendScenarios(r._ssp126, r._ssp245, r._ssp585, t);
  });
  const W = container.node().clientWidth || 1000;
  const H = 480;
  const margin = { top: 8, right: 80, bottom: 30, left: 36 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const svg = container.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%").style("height", H + "px").style("display", "block");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([-180, 180]).range([0, innerW]);
  const y = d3.scaleLinear().domain([-90, 90]).range([innerH, 0]);
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
    .on("mouseenter", function () { tooltip.style("opacity", 1); d3.select(this).attr("stroke", "white").attr("stroke-width", 1.5).raise(); })
    .on("mousemove", function (event, d) {
      const lat = d.lat, lon = d.lon > 180 ? d.lon - 360 : d.lon;
      const latLab = lat === 0 ? "0°" : (lat > 0 ? lat.toFixed(1) + "°N" : Math.abs(lat).toFixed(1) + "°S");
      const lonLab = lon === 0 ? "0°" : (lon > 0 ? lon.toFixed(1) + "°E" : Math.abs(lon).toFixed(1) + "°W");
      const unit = variable === "tas" ? " °C" : " %";
      const sign = d.delta > 0 ? "+" : "";
      tooltip.html(`
        <div class="tooltip-year">${latLab}, ${lonLab}</div>
        <div class="tooltip-row"><span>${opts.label.replace(/^Δ\s*/, "")}</span><span><b>${sign}${d.delta.toFixed(1)}${unit}</b></span></div>
      `).style("left", (event.pageX + 18) + "px").style("top", (event.pageY - 12) + "px");
    })
    .on("mouseleave", function () { tooltip.style("opacity", 0); d3.select(this).attr("stroke", "none"); });

  // coastlines
  if (worldLand) {
    const projection = d3.geoEquirectangular().translate([innerW / 2, innerH / 2])
      .scale(innerW / (2 * Math.PI));
    const path = d3.geoPath(projection);
    g.append("path").datum(worldLand).attr("class", "map-coastline").attr("d", path)
      .attr("fill", "none").attr("stroke", "rgba(29, 28, 26, 0.65)").attr("stroke-width", 0.5);
  }

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

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(7).tickFormat(d =>
      d === 0 ? "0°" : (d > 0 ? d + "°E" : Math.abs(d) + "°W")));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d =>
      d === 0 ? "0°" : (d > 0 ? d + "°N" : Math.abs(d) + "°S")));

  // colorbar
  const cbX = innerW + 14, cbW = 16, cbH = innerH - 40;
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
// Resize redraw (debounced)
// ============================================================
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!citiesAnnual.length) return;
    drawOverviewChart();
    drawTrajectoryChart();
    drawChoiceChart();
    drawDumbbell();
    drawWarmingRank();
    drawTempMap();
    drawPrecipMap();
  }, 200);
});
