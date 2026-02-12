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
  
  // ============================
  // MAP SETUP
  // ============================
  const map = new maplibregl.Map({
    container: "map",
    style: "https://demotiles.maplibre.org/style.json",
    center: [-98, 38],
    zoom: 3.5
  });
  
  // ============================
  // HELPERS
  // ============================
  
  // crude planar polygon area in "degree units" (good enough for relative weighting)
  function ringArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += (x1 * y2 - x2 * y1);
    }
    return Math.abs(sum) / 2;
  }
  
  // supports Polygon and MultiPolygon
  function geometryArea(geom) {
    if (!geom) return 0;
  
    if (geom.type === "Polygon") {
      // first ring is outer; holes subtract, but plotly county geojson usually has no holes
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
  
  // for fitting bounds for Polygon or MultiPolygon
  function extendBoundsFromGeometry(bounds, geom) {
    if (!geom) return;
  
    const addCoord = (c) => bounds.extend(c);
  
    if (geom.type === "Polygon") {
      geom.coordinates.flat(1).forEach(addCoord);
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.flat(2).forEach(addCoord);
    }
  }
  
  map.on("load", async () => {
  
    // ============================
    // LOAD STATES
    // ============================
    const statesRes = await fetch(
      "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"
    );
    const statesGeo = await statesRes.json();
  
    statesGeo.features.forEach(f => {
      f.properties.bans = stateBanData[f.properties.name] || 0;
    });
  
    map.addSource("states", { type: "geojson", data: statesGeo });
  
    // ============================
    // STATE FILLS + BORDERS + SELECT
    // ============================
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
  
    map.addLayer({
      id: "state-borders",
      type: "line",
      source: "states",
      paint: { "line-color": "#000", "line-width": 1 }
    });
  
    map.addLayer({
      id: "state-selected",
      type: "fill",
      source: "states",
      paint: { "fill-color": "#000", "fill-opacity": 0.15 },
      filter: ["==", "name", ""]
    });
  
    // ============================
    // LOAD COUNTIES
    // ============================
    const countiesRes = await fetch(
      "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
    );
    const countiesGeo = await countiesRes.json();
  
    // compute county area once + store fips + name + default bans
    countiesGeo.features.forEach(f => {
      f.properties.fips = f.id;
      f.properties.county_name = f.properties.NAME || "Unknown";
      f.properties._area = geometryArea(f.geometry);
      f.properties.bans = 0; // will be set when a state is clicked
    });
  
    map.addSource("counties", { type: "geojson", data: countiesGeo });
  
    // ============================
    // COUNTY FILLS + BORDERS (HIDDEN INITIALLY)
    // ============================
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
        "fill-opacity": 0.6
      }
    });
  
    map.addLayer({
      id: "county-borders",
      type: "line",
      source: "counties",
      layout: { visibility: "none" },
      paint: { "line-color": "#000", "line-width": 0.5 }
    });
  
    // ============================
    // POPUP
    // ============================
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });
  
    // ============================
    // STATE HOVER
    // ============================
    map.on("mousemove", "state-fills", e => {
      const { name, bans } = e.features[0].properties;
      popup
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${name}</strong><br>Book bans: ${bans}`)
        .addTo(map);
      map.getCanvas().style.cursor = "pointer";
    });
  
    map.on("mouseleave", "state-fills", () => {
      popup.remove();
      map.getCanvas().style.cursor = "";
    });
  
    // ============================
    // COUNTY HOVER
    // ============================
    map.on("mousemove", "county-fills", e => {
      const p = e.features[0].properties;
      popup
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${p.county_name}</strong><br>Estimated book bans: ${p.bans}`)
        .addTo(map);
      map.getCanvas().style.cursor = "pointer";
    });
  
    map.on("mouseleave", "county-fills", () => {
      popup.remove();
      map.getCanvas().style.cursor = "";
    });
  
    // ============================
    // CLICK STATE → SHOW COUNTIES
    // ============================
    map.on("click", "state-fills", e => {
      const stateName = e.features[0].properties.name;
      const fips = stateFips[stateName];
      if (!fips) return;
  
      const stateTotal = stateBanData[stateName] || 0;
  
      // Highlight state
      map.setFilter("state-selected", ["==", "name", stateName]);
  
      // Filter definition used for counties in this state
      const countyFilter = ["==", ["slice", ["get", "fips"], 0, 2], fips];
  
      // --- Compute estimated county bans for this state (area-weighted) ---
      const allCountyFeatures = countiesGeo.features;
      const stateCounties = allCountyFeatures.filter(cf => cf.id.startsWith(fips));
  
      const totalArea = stateCounties.reduce((s, cf) => s + (cf.properties._area || 0), 0);
  
      if (stateCounties.length === 0) {
        // still show nothing if no counties
      } else if (totalArea <= 0) {
        // fallback: equal split
        const each = stateTotal / stateCounties.length;
        stateCounties.forEach(cf => { cf.properties.bans = Math.round(each); });
      } else {
        // allocate with rounding that preserves the total
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
  
        floored.forEach((r, idx) => {
          const add = remaining > 0 ? 1 : 0;
          r.f.properties.bans = r.floor + add;
          if (remaining > 0) remaining--;
        });
      }
  
      // Update source data so the map re-renders
      map.getSource("counties").setData(countiesGeo);
  
      // Show counties + borders
      map.setLayoutProperty("county-fills", "visibility", "visible");
      map.setLayoutProperty("county-borders", "visibility", "visible");
  
      // Apply filters
      map.setFilter("county-fills", countyFilter);
      map.setFilter("county-borders", countyFilter);
  
      // Zoom to state bounds (handles MultiPolygon)
      const bounds = new maplibregl.LngLatBounds();
      extendBoundsFromGeometry(bounds, e.features[0].geometry);
      map.fitBounds(bounds, { padding: 40 });
    });
  });
  