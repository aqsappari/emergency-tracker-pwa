import { CENTER, MAP_CONFIG } from "./constants.js";

export let map;
export let userLocationMarker = null;
export let destMarker = null;
export let routePolylineBase = null;
export let routePolylineGlow = null;
export let currentUserLatLng = { lat: CENTER[0], lng: CENTER[1] };

const userIcon = L.divIcon({
  className: "custom-user-marker",
  html: `<div class="relative flex items-center justify-center w-8 h-8">
           <div class="absolute w-8 h-8 bg-blue-500/30 rounded-full animate-ping"></div>
           <div class="w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px]">
               <i class="fa-solid fa-user text-[9px]"></i>
           </div>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const destIcon = L.divIcon({
  className: "custom-dest-marker",
  html: `<div class="relative flex items-center justify-center w-8 h-8">
           <div class="w-7 h-7 bg-[#FFC72C] text-[#002855] rounded-full border-2 border-white shadow-xl flex items-center justify-center font-bold">
               <i class="fa-solid fa-house-chimney-medical text-xs"></i>
           </div>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

export function initializeMap(onPinSelectedCallback) {
  const strictTileBounds = [
    [6.9468, 121.9555],
    [6.9608, 121.9693],
  ];

  map = L.map("map", {
    zoomControl: false,
    minZoom: MAP_CONFIG.minZoom,
    maxZoom: MAP_CONFIG.maxZoom,
    maxBounds: strictTileBounds,
    maxBoundsViscosity: 1.0,
  }).setView(CENTER, MAP_CONFIG.defaultZoom);

  L.control.zoom({ position: "topright" }).addTo(map);

  // Live online tiles with automatic offline caching via Service Worker (with API Key)
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_4k4e_1_a33807e1a728fc1536a6ebe6",
    {
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      subdomains: "abcd",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      errorTileUrl: "",
    },
  ).addTo(map);

  updateUserLocationMarker(CENTER[0], CENTER[1], "Your Location");
  loadEvacuationCentersFromJSON(onPinSelectedCallback);

  map.on("movestart", () => {
    if (typeof window.hidePanelCallback === "function") {
      window.hidePanelCallback();
    }
  });
}

async function loadEvacuationCentersFromJSON(onPinSelectedCallback) {
  try {
    const response = await fetch("./evacuation_centers.json");
    const centers = await response.json();

    centers.forEach((center) => {
      const marker = L.marker([center.latitude, center.longitude], {
        icon: destIcon,
      }).addTo(map);

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        destMarker = marker;
        if (typeof onPinSelectedCallback === "function") {
          onPinSelectedCallback(center);
        }
      });
    });
  } catch (err) {
    console.warn("Failed to load evacuation_centers.json:", err);
  }
}

export function updateUserLocationMarker(lat, lng) {
  currentUserLatLng = { lat, lng };
  if (userLocationMarker) {
    userLocationMarker.setLatLng([lat, lng]);
  } else {
    userLocationMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
  }
}

export function setDestinationMarker(lat, lng) {
  const destLatLng = [lat, lng];
  if (destMarker) {
    destMarker.setLatLng(destLatLng);
  } else {
    destMarker = L.marker(destLatLng, { icon: destIcon }).addTo(map);
  }
  return destMarker;
}

export function updatePolylines(coordinates, baseColor, glowColor) {
  if (routePolylineBase) {
    routePolylineBase.setLatLngs(coordinates);
    routePolylineBase.setStyle({ color: baseColor });
  } else {
    routePolylineBase = L.polyline(coordinates, {
      color: baseColor,
      weight: 7,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
  }

  if (routePolylineGlow) {
    routePolylineGlow.setLatLngs(coordinates);
    routePolylineGlow.setStyle({ color: glowColor });
  } else {
    routePolylineGlow = L.polyline(coordinates, {
      className: "route-highlight-glow",
      color: glowColor,
      weight: 3,
      opacity: 0.8,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
  }
}

export function clearMapOverlays() {
  if (destMarker) {
    map.removeLayer(destMarker);
    destMarker = null;
  }
  if (routePolylineBase) {
    map.removeLayer(routePolylineBase);
    routePolylineBase = null;
  }
  if (routePolylineGlow) {
    map.removeLayer(routePolylineGlow);
    routePolylineGlow = null;
  }
}
