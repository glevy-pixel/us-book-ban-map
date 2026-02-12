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

  map.addSource("states", {
    type: "geojson",
    data: statesGeo
  });

  // ============================
  // STATE FILLS
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

  // ============================
  // STATE BORDERS
  // ============================
  map.addLayer({
    id: "state-borders",
    type: "line",
    source: "states",
    paint: {
      "line-color": "#000",
      "line-width": 1
    }
  });

  // ============================
  // SELECTED STATE OVERLAY
  // ============================
  map.addLayer({
    id: "state-selected",
    type: "fill",
    source: "states",
    paint: {
      "fill-color": "#000",
      "fill-opacity": 0.15
    },
    filter: ["==", "name", ""]
  });

  // ============================
  // LOAD COUNTIES + INJECT STATE DATA
  // ============================
  const countiesRes = await fetch(
    "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
  );
  const countiesGeo = await countiesRes.json();

  countiesGeo.features.forEach(f => {
    const stateCode = f.id.substring(0, 2);
  
    // Copy id into properties so MapLibre can filter it
    f.properties.fips = f.id;
  
    const stateName = Object.keys(stateFips)
      .find(k => stateFips[k] === stateCode);
  
    f.properties.state_bans = stateBanData[stateName] || 0;
  });
  

  map.addSource("counties", {
    type: "geojson",
    data: countiesGeo
  });

  // ============================
  // COUNTY FILLS (HIDDEN INITIALLY)
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
        ["log10", ["+", ["get", "state_bans"], 1]],
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

  // ============================
  // STATE HOVER TOOLTIP
  // ============================
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });

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
  // CLICK STATE → SHOW COUNTIES
  // ============================
  map.on("click", "state-fills", e => {

    const stateName = e.features[0].properties.name;
    const fips = stateFips[stateName];
  
    if (!fips) {
      console.log("No FIPS found for:", stateName);
      return;
    }
  
    console.log("Clicked:", stateName, "FIPS:", fips);
  
    // Highlight state
    map.setFilter("state-selected", ["==", "name", stateName]);
  
    // Show counties
    map.setLayoutProperty("county-fills", "visibility", "visible");
  
    // Filter counties
    map.setFilter("county-fills", [
      "all",
      ["==", ["slice", ["get", "fips"], 0, 2], fips]
    ]);
  
    // Zoom properly (THIS is safer)
    const bounds = new maplibregl.LngLatBounds();
    e.features[0].geometry.coordinates[0].forEach(coord => {
      bounds.extend(coord);
    });
  
    map.fitBounds(bounds, { padding: 40 });
  
  });

});
