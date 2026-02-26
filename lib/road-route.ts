export type LatLngTuple = [number, number];

export type RoadRouteResult = {
  points: LatLngTuple[];
  distanceKm: number | null;
  durationMin: number | null;
};

const ROUTE_CACHE_TTL_MS = 20_000;
const routeCache = new Map<string, { expiresAt: number; data: RoadRouteResult }>();

const roundCoord = (value: number) => Math.round(value * 100000) / 100000;

const routeCacheKey = (from: LatLngTuple, to: LatLngTuple) =>
  `${roundCoord(from[0])},${roundCoord(from[1])}->${roundCoord(to[0])},${roundCoord(to[1])}`;

export async function fetchRoadRoute(from: LatLngTuple, to: LatLngTuple): Promise<RoadRouteResult> {
  const key = routeCacheKey(from, to);
  const now = Date.now();
  const cached = routeCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`OSRM request failed: ${res.status}`);
    }

    const data = await res.json();
    const route = Array.isArray(data?.routes) ? data.routes[0] : null;
    const coordinates = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates : [];

    const points: LatLngTuple[] = coordinates
      .filter((coord: unknown) => Array.isArray(coord) && coord.length >= 2)
      .map((coord: unknown) => {
        const c = coord as [number, number];
        return [Number(c[1]), Number(c[0])] as LatLngTuple;
      })
      .filter((coord: LatLngTuple) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));

    const result: RoadRouteResult = {
      points,
      distanceKm: Number.isFinite(route?.distance) ? Number(route.distance) / 1000 : null,
      durationMin: Number.isFinite(route?.duration) ? Number(route.duration) / 60 : null,
    };

    routeCache.set(key, { expiresAt: now + ROUTE_CACHE_TTL_MS, data: result });
    return result;
  } catch {
    return {
      points: [from, to],
      distanceKm: null,
      durationMin: null,
    };
  }
}
