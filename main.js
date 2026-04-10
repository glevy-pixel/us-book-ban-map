// ============================
// STATE BOOK BAN DATA
// ============================
const stateBanData = {
  Florida: 8837,
  Iowa: 3798,
  Texas: 3745,
  Tennessee: 2016,
  Pennsylvania: 737,
  Wisconsin: 482,
  Missouri: 419,
  Utah: 351,
  Virginia: 312,
  Idaho: 213,
  "South Carolina": 197,
  Georgia: 153,
  "North Carolina": 137,
  Kentucky: 103,
  Maine: 97,
  "New York": 84,
  Michigan: 80,
  Maryland: 71,
  Wyoming: 65,
  Oregon: 61,
  Alaska: 57,
  Oklahoma: 45,
  Montana: 43,
  Kansas: 38,
  Colorado: 28,
  "North Dakota": 27,
  Indiana: 24,
  Mississippi: 22,
  Minnesota: 19,
  Illinois: 7,
  Ohio: 7,
  "South Dakota": 7,
  Nebraska: 6,
  "New Jersey": 6,
  Arkansas: 5,
  Washington: 5,
  California: 3,
  Arizona: 2,
  Massachusetts: 2,
  "New Hampshire": 2,
  "West Virginia": 2,
  Louisiana: 1,
  "Rhode Island": 1,
  Vermont: 1
};

// Pre-compute sorted rankings
const stateRankings = Object.entries(stateBanData)
  .sort((a, b) => b[1] - a[1])
  .map(([name], idx) => [name, idx + 1]);
const stateRankMap = Object.fromEntries(stateRankings);

// ============================
// STATE → FIPS MAP
// ============================
const stateFips = {
  Alabama: "01", Alaska: "02", Arizona: "04", Arkansas: "05",
  California: "06", Colorado: "08", Connecticut: "09", Delaware: "10",
  Florida: "12", Georgia: "13", Hawaii: "15", Idaho: "16",
  Illinois: "17", Indiana: "18", Iowa: "19", Kansas: "20",
  Kentucky: "21", Louisiana: "22", Maine: "23", Maryland: "24",
  Massachusetts: "25", Michigan: "26", Minnesota: "27", Mississippi: "28",
  Missouri: "29", Montana: "30", Nebraska: "31", Nevada: "32",
  "New Hampshire": "33", "New Jersey": "34", "New Mexico": "35",
  "New York": "36", "North Carolina": "37", "North Dakota": "38",
  Ohio: "39", Oklahoma: "40", Oregon: "41", Pennsylvania: "42",
  "Rhode Island": "44", "South Carolina": "45", "South Dakota": "46",
  Tennessee: "47", Texas: "48", Utah: "49", Vermont: "50",
  Virginia: "51", Washington: "53", "West Virginia": "54",
  Wisconsin: "55", Wyoming: "56"
};

// Reverse FIPS → state name lookup
const fipsToState = Object.fromEntries(
  Object.entries(stateFips).map(([name, code]) => [code, name])
);

// ============================
// GLOBAL STATE
// ============================
let selectedState = null;
let countiesGeo = null;

// ============================
// MAP SETUP
// ============================
const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-98, 38],
  zoom: 3.5,
  maxZoom: 12,
  minZoom: 2
});

map.addControl(new maplibregl.NavigationControl(), "bottom-right");

// ============================
// HELPERS
// ============================

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x1 * y2 - x2 * y1);
  }
  return Math.abs(sum) / 2;
}

function geometryArea(geom) {
  if (!geom) return 0;
  if (geom.type === "Polygon") {
    const rings = geom.coordinates;
    if (!rings || !rings.length) return 0;
    let a = ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) a -= ringArea(rings[i]);
    return Math.max(0, a);
  }
  if (geom.type === "MultiPolygon") {
    let total = 0;
    for (const poly of geom.coordinates) {
      if (!poly || !poly.length) continue;
      let a = ringArea(poly[0]);
      for (let i = 1; i < poly.length; i++) a -= ringArea(poly[i]);
      total += Math.max(0, a);
    }
    return total;
  }
  return 0;
}

function extendBoundsFromGeometry(bounds, geom) {
  if (!geom) return;
  const addCoord = (c) => bounds.extend(c);
  if (geom.type === "Polygon") {
    geom.coordinates.flat(1).forEach(addCoord);
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.flat(2).forEach(addCoord);
  }
}

function formatNumber(n) {
  return n.toLocaleString("en-US");
}

function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================
// UI HELPERS
// ============================

function showStatePanel(stateName) {
  const total = stateBanData[stateName] || 0;
  const rank = stateRankMap[stateName] || "—";

  document.getElementById("state-panel-name").textContent = stateName;
  document.getElementById("state-panel-total").textContent = formatNumber(total);
  document.getElementById("state-panel-rank").textContent =
    `${ordinal(rank)} highest in the U.S. out of ${Object.keys(stateBanData).length} states with bans`;

  document.getElementById("state-panel").classList.add("visible");
}

function hideStatePanel() {
  document.getElementById("state-panel").classList.remove("visible");
}

function showCountyPanel(countyName, stateName, bans) {
  const stateTotal = stateBanData[stateName] || 0;
  const pct = stateTotal > 0 ? ((bans / stateTotal) * 100).toFixed(1) : "0";

  document.getElementById("county-panel-name").textContent = countyName;
  document.getElementById("county-panel-state").textContent = stateName;
  document.getElementById("county-panel-bans").textContent = formatNumber(bans);
  document.getElementById("county-panel-state-total").textContent = formatNumber(stateTotal);
  document.getElementById("county-panel-pct").textContent = pct + "%";

  document.getElementById("county-panel").classList.add("visible");
}

function hideCountyPanel() {
  document.getElementById("county-panel").classList.remove("visible");
}

function showBackButton() {
  document.getElementById("back-btn").style.display = "flex";
}

function hideBackButton() {
  document.getElementById("back-btn").style.display = "none";
}

// ============================
// RESET VIEW (back to national)
// ============================
window.resetView = function () {
  selectedState = null;

  // Hide county layers
  map.setLayoutProperty("county-fills", "visibility", "none");
  map.setLayoutProperty("county-borders", "visibility", "none");

  // Remove state highlight
  map.setFilter("state-selected", ["==", "name", ""]);

  // Hide panels
  hideStatePanel();
  hideCountyPanel();
  hideBackButton();

  // Zoom back to national view
  map.flyTo({ center: [-98, 38], zoom: 3.5, duration: 1200 });
};

// ============================
// MAP LOAD
// ============================
map.on("load", async () => {

  // ── LOAD STATES ──
  const statesRes = await fetch(
    "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"
  );
  const statesGeo = await statesRes.json();

  statesGeo.features.forEach(f => {
    f.properties.bans = stateBanData[f.properties.name] || 0;
  });

  map.addSource("states", { type: "geojson", data: statesGeo });

  // ── STATE FILLS ──
  map.addLayer({
    id: "state-fills",
    type: "fill",
    source: "states",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["log10", ["+", ["get", "bans"], 1]],
        0, "#fff5f0",
        0.5, "#fcbba1",
        1.0, "#fc9272",
        1.5, "#fb6a4a",
        2.0, "#de2d26",
        2.5, "#a50f15"
      ],
      "fill-opacity": 0.85
    }
  });

  // ── STATE BORDERS ──
  map.addLayer({
    id: "state-borders",
    type: "line",
    source: "states",
    paint: { "line-color": "#222", "line-width": 1 }
  });

  // ── STATE SELECTED HIGHLIGHT ──
  map.addLayer({
    id: "state-selected",
    type: "fill",
    source: "states",
    paint: { "fill-color": "#000", "fill-opacity": 0.18 },
    filter: ["==", "name", ""]
  });

  // ── LOAD COUNTIES ──
  const countiesRes = await fetch(
    "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
  );
  countiesGeo = await countiesRes.json();

  countiesGeo.features.forEach(f => {
    f.properties.fips = f.id;
    f.properties.county_name = f.properties.NAME || "Unknown";
    f.properties._area = geometryArea(f.geometry);
    f.properties.bans = 0;
    // Store the state FIPS prefix so we can look up state name on click
    f.properties._stateFips = f.id.slice(0, 2);
  });

  map.addSource("counties", { type: "geojson", data: countiesGeo });

  // ── COUNTY FILLS (hidden initially) ──
  map.addLayer({
    id: "county-fills",
    type: "fill",
    source: "counties",
    layout: { visibility: "none" },
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["log10", ["+", ["get", "bans"], 1]],
        0, "#fff5f0",
        0.5, "#fcbba1",
        1.0, "#fc9272",
        1.5, "#fb6a4a",
        2.0, "#de2d26",
        2.5, "#a50f15"
      ],
      "fill-opacity": 0.7
    }
  });

  // ── COUNTY BORDERS (hidden initially) ──
  map.addLayer({
    id: "county-borders",
    type: "line",
    source: "counties",
    layout: { visibility: "none" },
    paint: { "line-color": "#333", "line-width": 0.5 }
  });

  // ── COUNTY HOVER HIGHLIGHT ──
  map.addLayer({
    id: "county-hover",
    type: "fill",
    source: "counties",
    layout: { visibility: "none" },
    paint: { "fill-color": "#fff", "fill-opacity": 0.15 },
    filter: ["==", "fips", ""]
  });

  // ── POPUP ──
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12
  });

  // ── STATE HOVER ──
  map.on("mousemove", "state-fills", e => {
    const { name, bans } = e.features[0].properties;
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup-title">${name}</div>` +
        `<div class="popup-value">${formatNumber(bans)} book bans</div>`
      )
      .addTo(map);
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "state-fills", () => {
    popup.remove();
    map.getCanvas().style.cursor = "";
  });

  // ── COUNTY HOVER ──
  map.on("mousemove", "county-fills", e => {
    const p = e.features[0].properties;
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup-title">${p.county_name}</div>` +
        `<div class="popup-value">~${formatNumber(p.bans)} estimated bans</div>`
      )
      .addTo(map);
    map.getCanvas().style.cursor = "pointer";

    // Highlight hovered county
    map.setFilter("county-hover", ["==", "fips", p.fips]);
  });

  map.on("mouseleave", "county-fills", () => {
    popup.remove();
    map.getCanvas().style.cursor = "";
    map.setFilter("county-hover", ["==", "fips", ""]);
  });

  // ── CLICK STATE → DRILL DOWN ──
  map.on("click", "state-fills", e => {
    const stateName = e.features[0].properties.name;
    const fips = stateFips[stateName];
    if (!fips) return;

    selectedState = stateName;
    const stateTotal = stateBanData[stateName] || 0;

    // Highlight state
    map.setFilter("state-selected", ["==", "name", stateName]);

    // County filter
    const countyFilter = ["==", ["slice", ["get", "fips"], 0, 2], fips];

    // Compute estimated county bans (area-weighted)
    const stateCounties = countiesGeo.features.filter(cf => cf.id.startsWith(fips));
    const totalArea = stateCounties.reduce((s, cf) => s + (cf.properties._area || 0), 0);

    if (stateCounties.length > 0) {
      if (totalArea <= 0) {
        const each = stateTotal / stateCounties.length;
        stateCounties.forEach(cf => { cf.properties.bans = Math.round(each); });
      } else {
        const raw = stateCounties.map(cf => ({
          f: cf,
          val: (cf.properties._area / totalArea) * stateTotal
        }));
        const floored = raw.map(r => ({
          f: r.f,
          floor: Math.floor(r.val),
          frac: r.val - Math.floor(r.val)
        }));
        let used = floored.reduce((s, r) => s + r.floor, 0);
        let remaining = stateTotal - used;
        floored.sort((a, b) => b.frac - a.frac);
        floored.forEach(r => {
          const add = remaining > 0 ? 1 : 0;
          r.f.properties.bans = r.floor + add;
          if (remaining > 0) remaining--;
        });
      }
    }

    // Update source
    map.getSource("counties").setData(countiesGeo);

    // Show county layers
    map.setLayoutProperty("county-fills", "visibility", "visible");
    map.setLayoutProperty("county-borders", "visibility", "visible");
    map.setLayoutProperty("county-hover", "visibility", "visible");

    map.setFilter("county-fills", countyFilter);
    map.setFilter("county-borders", countyFilter);

    // Zoom to state
    const bounds = new maplibregl.LngLatBounds();
    extendBoundsFromGeometry(bounds, e.features[0].geometry);
    map.fitBounds(bounds, { padding: 60, duration: 1000 });

    // Show state panel + back button
    showStatePanel(stateName);
    showBackButton();
    hideCountyPanel();
  });

  // ── CLICK COUNTY → SHOW DETAIL PANEL ──
  map.on("click", "county-fills", e => {
    // Stop the event from also triggering state click
    e.originalEvent.stopPropagation();

    const p = e.features[0].properties;
    const stateFipsCode = typeof p._stateFips === "string" ? p._stateFips : p.fips.slice(0, 2);
    const stateName = fipsToState[stateFipsCode] || selectedState || "Unknown";

    showCountyPanel(p.county_name, stateName, p.bans);
  });

  // ── CLICK EMPTY AREA → DESELECT COUNTY ──
  map.on("click", e => {
    const countyFeatures = map.queryRenderedFeatures(e.point, { layers: ["county-fills"] });
    const stateFeatures = map.queryRenderedFeatures(e.point, { layers: ["state-fills"] });

    if (countyFeatures.length === 0 && stateFeatures.length === 0) {
      hideCountyPanel();
    }
  });

});
