/**
 * js/routing.js
 * Multi-route dynamic offline routing with alternative paths and smart GPS-drift thresholding.
 */

import { map, currentUserLatLng } from "./map.js";

let roadGraph = null;
let geojsonFeatureCollection = null;
let routeLayersGroup = null; // Holds both primary and alternative route lines

let currentRoutes = []; // Stores calculated route objects [{ id, coordinates, distanceKm, layer }]
let activeRouteIndex = 0;
let lastCalculatedUserPos = null;
const RECALC_THRESHOLD_METERS = 20; // Recalculate if user drifts > 20 meters away from active route

/**
 * Load and parse export.geojson to build an adjacency graph for routing.
 */
export async function initRouting() {
  try {
    const response = await fetch("./export.geojson");
    if (!response.ok) throw new Error("Failed to load export.geojson");
    geojsonFeatureCollection = await response.json();
    roadGraph = buildGraphFromGeoJSON(geojsonFeatureCollection);
    console.log(
      "Road network graph built successfully:",
      roadGraph.nodeCount,
      "nodes,",
      roadGraph.edgeCount,
      "edges",
    );
  } catch (err) {
    console.error("Error initializing routing graph:", err);
  }
}

function buildGraphFromGeoJSON(data) {
  const nodes = new Map();

  function getNodeKey(lon, lat) {
    return `${Number(lon).toFixed(6)},${Number(lat).toFixed(6)}`;
  }

  function getOrCreateNode(lon, lat) {
    const key = getNodeKey(lon, lat);
    if (!nodes.has(key)) {
      nodes.set(key, {
        id: key,
        lon: Number(lon),
        lat: Number(lat),
        neighbors: [],
      });
    }
    return nodes.get(key);
  }

  let edgeCount = 0;

  data.features.forEach((feature) => {
    if (feature.geometry && feature.geometry.type === "LineString") {
      const coords = feature.geometry.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i + 1];

        const node1 = getOrCreateNode(lon1, lat1);
        const node2 = getOrCreateNode(lon2, lat2);

        const dist = haversineDistance(
          node1.lat,
          node1.lon,
          node2.lat,
          node2.lon,
        );

        node1.neighbors.push({ nodeId: node2.id, weight: dist });
        node2.neighbors.push({ nodeId: node1.id, weight: dist });
        edgeCount++;
      }
    }
  });

  return { nodes, nodeCount: nodes.size, edgeCount };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toRad(val) {
  return (val * Math.PI) / 180;
}

function findNearestNode(lat, lon) {
  if (!roadGraph || roadGraph.nodes.size === 0) return null;
  let nearestNode = null;
  let minDistance = Infinity;

  for (const [key, node] of roadGraph.nodes.entries()) {
    const dist = haversineDistance(lat, lon, node.lat, node.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestNode = node;
    }
  }
  return nearestNode;
}

/**
 * Dijkstra's algorithm with optional penalty weights to find alternative paths.
 * @param {String} startNodeId
 * @param {String} endNodeId
 * @param {Set} penalizedNodes - nodes to avoid or weight heavier to force alternative paths
 */
function findShortestPath(startNodeId, endNodeId, penalizedNodes = new Set()) {
  const distances = new Map();
  const previous = new Map();
  const pq = new Set();

  for (const nodeId of roadGraph.nodes.keys()) {
    distances.set(nodeId, Infinity);
    pq.add(nodeId);
  }

  distances.set(startNodeId, 0);

  while (pq.size > 0) {
    let currNodeId = null;
    let smallestDist = Infinity;
    for (const nodeId of pq) {
      const dist = distances.get(nodeId);
      if (dist < smallestDist) {
        smallestDist = dist;
        currNodeId = nodeId;
      }
    }

    if (currNodeId === null || smallestDist === Infinity) break;
    if (currNodeId === endNodeId) break;

    pq.delete(currNodeId);

    const currNode = roadGraph.nodes.get(currNodeId);
    for (const neighbor of currNode.neighbors) {
      if (!pq.has(neighbor.nodeId)) continue;

      // Apply heavy penalty multiplier if neighbor is part of a previous primary path
      let weightMultiplier = 1;
      if (penalizedNodes.has(neighbor.nodeId)) {
        weightMultiplier = 3.5;
      }

      const alt =
        distances.get(currNodeId) + neighbor.weight * weightMultiplier;
      if (alt < distances.get(neighbor.nodeId)) {
        distances.set(neighbor.nodeId, alt);
        previous.set(neighbor.nodeId, currNodeId);
      }
    }
  }

  const path = [];
  let curr = endNodeId;
  while (previous.has(curr)) {
    path.unshift(curr);
    curr = previous.get(curr);
  }
  if (curr === startNodeId || path.length > 0) {
    path.unshift(startNodeId);
  }

  return path;
}

/**
 * Computes top 2 distinct route options.
 */
function calculateTopRoutes(startLatLng, endLatLng) {
  const [startLat, startLon] = startLatLng;
  const [endLat, endLon] = endLatLng;

  const startNode = findNearestNode(startLat, startLon);
  const endNode = findNearestNode(endLat, endLon);

  if (!startNode || !endNode) return [];

  // Route 1: Absolute Shortest Path
  const path1Nodes = findShortestPath(startNode.id, endNode.id);
  if (!path1Nodes || path1Nodes.length === 0) return [];

  const routes = [];
  routes.push(
    buildRouteDetails(path1Nodes, startLat, startLon, endLat, endLon),
  );

  // Route 2: Penalty path (penalize middle nodes of Route 1 to force an alternate path)
  const penalized = new Set(
    path1Nodes.slice(
      Math.floor(path1Nodes.length * 0.2),
      Math.floor(path1Nodes.length * 0.8),
    ),
  );
  const path2Nodes = findShortestPath(startNode.id, endNode.id, penalized);

  if (path2Nodes && path2Nodes.length > 0) {
    const route2 = buildRouteDetails(
      path2Nodes,
      startLat,
      startLon,
      endLat,
      endLon,
    );
    // Ensure Route 2 is unique compared to Route 1
    if (route2.distanceKm !== routes[0].distanceKm) {
      routes.push(route2);
    }
  }

  return routes;
}

function buildRouteDetails(nodeIdsPath, startLat, startLon, endLat, endLon) {
  let totalDistanceKm = 0;
  const latLngs = [[startLat, startLon]];

  for (let i = 0; i < nodeIdsPath.length; i++) {
    const node = roadGraph.nodes.get(nodeIdsPath[i]);
    latLngs.push([node.lat, node.lon]);
    if (i > 0) {
      const prevNode = roadGraph.nodes.get(nodeIdsPath[i - 1]);
      totalDistanceKm += haversineDistance(
        prevNode.lat,
        prevNode.lon,
        node.lat,
        node.lon,
      );
    }
  }
  latLngs.push([endLat, endLon]);

  return {
    distanceKm: totalDistanceKm,
    coordinates: latLngs,
    nodeIds: nodeIdsPath,
  };
}

/**
 * Renders the top routes on the map.
 */
export function renderRoutes(mapInstance, routes) {
  if (routeLayersGroup) {
    mapInstance.removeLayer(routeLayersGroup);
  }

  routeLayersGroup = L.layerGroup();
  currentRoutes = routes;

  routes.forEach((route, index) => {
    const isActive = index === activeRouteIndex;

    const mainLine = L.polyline(route.coordinates, {
      color: isActive ? "#002855" : "#6c757d",
      weight: isActive ? 5 : 3,
      opacity: isActive ? 0.9 : 0.5,
    });

    // Click handler to switch active route
    mainLine.on("click", () => {
      activeRouteIndex = index;
      renderRoutes(mapInstance, currentRoutes);
      // Trigger UI callback update if needed
      if (window.onRouteSelected) {
        window.onRouteSelected(currentRoutes[activeRouteIndex]);
      }
    });

    routeLayersGroup.addLayer(mainLine);
  });

  routeLayersGroup.addTo(mapInstance);
}

/**
 * Smart GPS Check: Returns true if user moved outside the current active path threshold.
 */
function hasUserMovedOutsidePath(currentLatLng) {
  if (!currentRoutes[activeRouteIndex]) return true;
  const activeCoords = currentRoutes[activeRouteIndex].coordinates;

  let minDistanceMeters = Infinity;
  for (const coord of activeCoords) {
    const distKm = haversineDistance(
      currentLatLng[0],
      currentLatLng[1],
      coord[0],
      coord[1],
    );
    const distMeters = distKm * 1000;
    if (distMeters < minDistanceMeters) {
      minDistanceMeters = distMeters;
    }
  }

  return minDistanceMeters > RECALC_THRESHOLD_METERS;
}

/**
 * Main wrapper called by app.js or live location updates.
 */
let storedDestination = null;

export function calculateRouteAndMetrics(destination, callback) {
  storedDestination = destination;
  const startCoords = [currentUserLatLng.lat, currentUserLatLng.lng];
  const endCoords = [destination.latitude, destination.longitude];

  lastCalculatedUserPos = startCoords;
  const routes = calculateTopRoutes(startCoords, endCoords);

  if (routes.length > 0) {
    activeRouteIndex = 0; // Default to primary shortest route
    renderRoutes(map, routes);

    const activeRoute = routes[activeRouteIndex];
    const formattedDistance =
      activeRoute.distanceKm < 1
        ? `${Math.round(activeRoute.distanceKm * 1000)} m`
        : `${activeRoute.distanceKm.toFixed(2)} km`;

    callback({
      distance: formattedDistance,
      coords: `${destination.latitude.toFixed(4)}, ${destination.longitude.toFixed(4)}`,
    });
  } else {
    callback({ distance: "Unavailable", coords: "" });
  }
}

/**
 * Called on live GPS updates from app.js to check if re-calculation is necessary.
 */
export function checkLiveRouteDrift(newLat, newLon) {
  if (!storedDestination || currentRoutes.length === 0) return;

  const currentPos = [newLat, newLon];
  if (hasUserMovedOutsidePath(currentPos)) {
    console.log("User drifted outside path threshold. Recalculating route...");
    calculateRouteAndMetrics(storedDestination, (result) => {
      // Optional silent update or toast notification
    });
  }
}

export function clearRoute(mapInstance) {
  if (routeLayersGroup && mapInstance) {
    mapInstance.removeLayer(routeLayersGroup);
    routeLayersGroup = null;
    currentRoutes = [];
    storedDestination = null;
  }
}
