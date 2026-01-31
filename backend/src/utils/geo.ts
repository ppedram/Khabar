import { config } from '../config/index.js';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// Earth's radius in kilometers
const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLng = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate bounding box for a given center point and radius
 * Used for initial filtering before precise distance calculation
 */
export function getBoundingBox(center: Coordinates, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32; // 1 degree latitude ≈ 111.32 km
  const lngDelta = radiusKm / (111.32 * Math.cos(toRadians(center.latitude)));

  return {
    minLat: center.latitude - latDelta,
    maxLat: center.latitude + latDelta,
    minLng: center.longitude - lngDelta,
    maxLng: center.longitude + lngDelta,
  };
}

/**
 * Validate coordinates are within valid ranges
 */
export function isValidCoordinates(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Sanitize and validate search radius
 */
export function sanitizeRadius(radius: number | undefined): number {
  if (!radius || radius <= 0) {
    return config.geo.defaultSearchRadiusKm;
  }
  return Math.min(radius, config.geo.maxSearchRadiusKm);
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Generate PostGIS point from coordinates
 * Uses SRID 4326 (WGS84)
 */
export function toPostGISPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * Raw SQL for distance calculation in PostGIS
 * Returns distance in meters
 */
export function distanceSQL(lat: number, lng: number, columnName = 'location'): string {
  return `ST_Distance(
    ${columnName}::geography,
    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
  )`;
}

/**
 * Raw SQL for finding points within radius (in meters)
 */
export function withinRadiusSQL(
  lat: number,
  lng: number,
  radiusMeters: number,
  columnName = 'location'
): string {
  return `ST_DWithin(
    ${columnName}::geography,
    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
    ${radiusMeters}
  )`;
}

/**
 * Convert kilometers to meters
 */
export function kmToMeters(km: number): number {
  return km * 1000;
}

/**
 * Convert meters to kilometers
 */
export function metersToKm(meters: number): number {
  return meters / 1000;
}
