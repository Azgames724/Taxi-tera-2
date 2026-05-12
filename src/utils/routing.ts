/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ROUTES, Route, COORDS } from '../data/transitData';

export interface TripLeg {
  route: Route;
  from: string;
  to: string;
  geometry?: [number, number][];
}

export interface TripPath {
  legs: TripLeg[];
  transfers: number;
}

/**
 * Helper to consolidate different names for the same physical location.
 */
function getCanonicalName(name: string): string {
  const coord = COORDS[name];
  if (!coord) return name;
  // Use a string representation of coordinates as the canonical key
  return `${coord[0].toFixed(5)},${coord[1].toFixed(5)}`;
}

/**
 * Decodes OSRM geometry or fetches it.
 */
export async function enhancePathWithGeometry(path: TripPath, coords: Record<string, [number, number]>): Promise<TripPath> {
  const enhancedLegs = await Promise.all(path.legs.map(async (leg) => {
    const start = coords[leg.from];
    const end = coords[leg.to];
    
    if (!start || !end) return leg;

    try {
      // OSRM expects longitude,latitude
      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const geometry = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
        return { ...leg, geometry };
      }
    } catch (error) {
      console.warn('Failed to fetch road geometry:', error);
    }
    
    return leg;
  }));

  return { ...path, legs: enhancedLegs };
}

/**
 * Builds a transit graph where nodes are location names
 * and edges are arrays of routes connecting them.
 */
function buildGraph() {
  const graph: Record<string, Record<string, Route[]>> = {};

  ROUTES.forEach((route) => {
    const from = getCanonicalName(route.from);
    const to = getCanonicalName(route.to);

    // Add forward path
    if (!graph[from]) graph[from] = {};
    if (!graph[from][to]) graph[from][to] = [];
    graph[from][to].push(route);

    // Add backward path
    if (!graph[to]) graph[to] = {};
    if (!graph[to][from]) graph[to][from] = [];
    graph[to][from].push(route);
  });

  return graph;
}

/**
 * Finds the shortest paths (by number of transfers) using BFS.
 */
export function findTripPaths(start: string, end: string, maxTransfers = 3): TripPath[] {
  if (!start || !end || start === end) return [];

  const canonicalStart = getCanonicalName(start);
  const canonicalEnd = getCanonicalName(end);
  
  if (canonicalStart === canonicalEnd) return [];

  const graph = buildGraph();
  const queue: { current: string; legs: TripLeg[] }[] = [{ current: canonicalStart, legs: [] }];
  const results: TripPath[] = [];
  const minTransfersToNode: Record<string, number> = { [canonicalStart]: 0 };

  // BFS to find paths with minimum transfers
  while (queue.length > 0 && results.length < 10) {
    const { current, legs } = queue.shift()!;

    if (legs.length > maxTransfers + 1) continue;

    if (current === canonicalEnd) {
      results.push({ legs, transfers: legs.length - 1 });
      continue;
    }

    const neighbors = graph[current];
    if (!neighbors) continue;

    for (const [neighbor, routes] of Object.entries(neighbors)) {
      const newLegsLength = legs.length + 1;
      
      // Allow visiting if not visited OR reached with same number of transfers
      if (minTransfersToNode[neighbor] !== undefined && minTransfersToNode[neighbor] < newLegsLength) {
        continue;
      }
      minTransfersToNode[neighbor] = newLegsLength;

      routes.forEach((route, idx) => {
        if (idx > 0) return; // Keep search space sane
        queue.push({
          current: neighbor,
          legs: [...legs, { 
            route, 
            // We use original names for the legs to keep the UI consistent,
            // but the search uses canonical names.
            // Actually, we should probably stick to one name or coordinate.
            from: route.from, 
            to: route.to 
          }]
        });
      });
    }
  }

  // Deduplicate and filter to best results
  return results.slice(0, 4);
}
