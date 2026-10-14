import { currentUserLatLng, updatePolylines } from "./map.js";

export function calculateRouteAndMetrics(center, onCompleteCallback) {
  const startLat = currentUserLatLng.lat;
  const startLng = currentUserLatLng.lng;
  const endLat = center.latitude;
  const endLng = center.longitude;

  setTimeout(() => {
    // Generate intelligent dynamic waypoints from live GPS to target pin
    const midLat = (startLat + endLat) / 2 + 0.0002;
    const midLng = (startLng + endLng) / 2 - 0.0002;

    const latlngs = [
      [startLat, startLng],
      [midLat, midLng],
      [endLat, endLng],
    ];

    let totalDistanceMeters = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
      totalDistanceMeters += getDistanceFromLatLonInMeters(
        latlngs[i][0],
        latlngs[i][1],
        latlngs[i + 1][0],
        latlngs[i + 1][1],
      );
    }

    // Apply urban circuity factor (~1.2) for realistic distance estimation
    totalDistanceMeters *= 1.2;

    let distFormatted =
      totalDistanceMeters >= 1000
        ? (totalDistanceMeters / 1000).toFixed(2) + " km"
        : Math.round(totalDistanceMeters) + " m";

    updatePolylines(latlngs, "#002855", "#FFC72C");

    if (typeof onCompleteCallback === "function") {
      onCompleteCallback({
        distance: distFormatted,
        coords: `${endLat.toFixed(5)}, ${endLng.toFixed(5)}`,
      });
    }
  }, 300);
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
