import { ROUTES, COORDS, Route } from '../data/transport';

export interface JourneyLeg {
  type: 'minibus' | 'walking';
  from: string;
  to: string;
  route?: Route;
  distance: number;
  duration: number; // in minutes
}

export interface Journey {
  totalTransfers: number;
  totalDistance: number;
  totalDuration: number;
  legs: JourneyLeg[];
}

const EARTH_RADIUS = 6371000; // meters

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return EARTH_RADIUS * c;
}

// Build adjacency list: Location -> List of { destination, route, type }
const adjacencyList: Record<string, { to: string, route?: Route, type: 'minibus' | 'walking' }[]> = {};

ROUTES.forEach(route => {
  if (!adjacencyList[route.from]) adjacencyList[route.from] = [];
  if (!adjacencyList[route.to]) adjacencyList[route.to] = [];
  
  // Assume bidirectional
  adjacencyList[route.from].push({ to: route.to, route, type: 'minibus' });
  adjacencyList[route.to].push({ to: route.from, route, type: 'minibus' });
});

// Add walking links between stations within 1000m
const locationNames = Object.keys(COORDS);
for (let i = 0; i < locationNames.length; i++) {
  for (let j = i + 1; j < locationNames.length; j++) {
    const locA = locationNames[i];
    const locB = locationNames[j];
    const coordA = COORDS[locA];
    const coordB = COORDS[locB];
    const dist = getDistance(coordA[0], coordA[1], coordB[0], coordB[1]);
    
    if (dist > 0 && dist < 1000) {
      if (!adjacencyList[locA]) adjacencyList[locA] = [];
      if (!adjacencyList[locB]) adjacencyList[locB] = [];
      adjacencyList[locA].push({ to: locB, type: 'walking' });
      adjacencyList[locB].push({ to: locA, type: 'walking' });
    }
  }
}

export function findRoute(origin: string, destination: string): Journey | null {
  if (origin === destination) return null;
  const originCoord = COORDS[origin];
  const destCoord = COORDS[destination];
  if (!originCoord || !destCoord) return null;

  // BFS with path tracking
  const queue: { current: string, path: { to: string, route?: Route, type: 'minibus' | 'walking' }[] }[] = [{ current: origin, path: [] }];
  const visited = new Set<string>([origin]);

  while (queue.length > 0) {
    const { current, path } = queue.shift()!;

    if (current === destination) {
      const legs = path.map((p, i): JourneyLeg | null => {
        const start = i === 0 ? origin : path[i-1].to;
        const startC = COORDS[start];
        const endC = COORDS[p.to];
        if (!startC || !endC) return null;

        const dist = getDistance(startC[0], startC[1], endC[0], endC[1]);
        return {
          type: p.type,
          from: start,
          to: p.to,
          route: p.route,
          distance: dist,
          duration: p.type === 'walking' 
            ? Math.round(dist / 80) // 4.8 km/h walking
            : Math.round(dist / 250) + 2 // 15km/h avg + 2min dwell
        };
      }).filter((l): l is JourneyLeg => l !== null);

      return {
        totalTransfers: legs.filter(l => l.type === 'minibus').length - 1,
        totalDistance: legs.reduce((acc, l) => acc + l.distance, 0),
        totalDuration: legs.reduce((acc, l) => acc + l.duration, 0),
        legs
      };
    }

    const neighbors = adjacencyList[current] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.to)) {
        visited.add(neighbor.to);
        queue.push({
          current: neighbor.to,
          path: [...path, neighbor]
        });
      }
    }
  }

  return null;
}
