import {
  initializeMap,
  updateUserLocationMarker,
  setDestinationMarker,
  clearMapOverlays,
  currentUserLatLng,
  destMarker,
  map,
} from "./map.js";
import { calculateRouteAndMetrics, initRouting } from "./routing.js";

let watchId = null;

async function initApp() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Initialize routing engine / services on startup
  await initRouting();

  initializeMap(handlePinSelect);
  startLiveGeolocation();

  // Expose global callback for map panning to auto-hide panel
  window.hidePanelCallback = hideMetadataPanel;

  document.getElementById("locate-btn").addEventListener("click", centerOnUser);
  document
    .getElementById("reset-btn")
    .addEventListener("click", resetDestination);
  document
    .getElementById("close-panel-btn")
    .addEventListener("click", hideMetadataPanel);
  document
    .getElementById("open-panel-handle")
    .addEventListener("click", showMetadataPanel);
}

function handlePinSelect(center) {
  const marker = setDestinationMarker(center.latitude, center.longitude);

  // Show panel in loading state immediately
  showMetadataPanel();
  document.getElementById("panel-title").innerText = center.name;
  document.getElementById("loading-section").classList.remove("hidden");
  document.getElementById("metrics-body").classList.add("hidden");

  calculateRouteAndMetrics(center, (result) => {
    document.getElementById("loading-section").classList.add("hidden");
    document.getElementById("metrics-body").classList.remove("hidden");
    document.getElementById("metric-distance").innerText = result.distance;
    document.getElementById("coord-info").innerText =
      `Lat/Lng: ${result.coords}`;
    showToast(`Route calculated to ${center.name}`);
  });
}

function showMetadataPanel() {
  const panel = document.getElementById("metadata-panel");
  panel.classList.remove(
    "translate-y-[120%]",
    "opacity-0",
    "pointer-events-none",
  );

  const handle = document.getElementById("open-panel-handle");
  handle.classList.add("translate-x-full", "opacity-0", "pointer-events-none");
}

function hideMetadataPanel() {
  const panel = document.getElementById("metadata-panel");
  panel.classList.add("translate-y-[120%]", "opacity-0", "pointer-events-none");

  // Only show handle if a destination pin/route is currently active
  if (destMarker) {
    const handle = document.getElementById("open-panel-handle");
    handle.classList.remove(
      "translate-x-full",
      "opacity-0",
      "pointer-events-none",
    );
  }
}

function startLiveGeolocation() {
  if ("geolocation" in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        updateUserLocationMarker(
          position.coords.latitude,
          position.coords.longitude,
        );
      },
      (error) => console.warn("GPS error:", error.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );
  }
}

function centerOnUser() {
  map.flyTo([currentUserLatLng.lat, currentUserLatLng.lng], 17, {
    animate: true,
    duration: 1.2,
  });
  showToast("Centered on your live GPS");
}

function resetDestination() {
  clearMapOverlays();
  hideMetadataPanel();
  const handle = document.getElementById("open-panel-handle");
  handle.classList.add("translate-x-full", "opacity-0", "pointer-events-none");
  showToast("Route cleared.");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").innerText = message;
  toast.classList.remove(
    "opacity-0",
    "pointer-events-none",
    "translate-y-[-10px]",
  );
  toast.classList.add("opacity-100", "translate-y-0");

  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add(
      "opacity-0",
      "pointer-events-none",
      "translate-y-[-10px]",
    );
  }, 2500);
}

window.onload = initApp;
